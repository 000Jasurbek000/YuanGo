const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const API_HEADERS = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

const STATUS_LABELS = {
  progress: "Tekshirilmoqda",
  done: "Yakunlangan",
  cancelled: "Bekor qilingan",
};

const PAGE_TITLES = {
  dashboard: "Dashboard",
  transactions: "Tranzaksiyalar",
  users: "Foydalanuvchilar",
  allUsers: "Jami foydalanuvchilar",
  admins: "Adminlar",
  reviews: "Sharhlar",
  cards: "Karta va hisoblar",
  qrs: "QR kodlar",
  settings: "Sozlamalar",
  messages: "Xabarlar",
  stats: "Statistika",
};

const REG_STAGE_LABELS = {
  start: "Start",
  fio: "FIO",
  tel: "Tel",
  registered: "Ro'yxat",
};

let currentStatus = "progress";
let allTxStatus = "";
let allUsersStage = "";
let allUsersCache = [];
let usersCache = [];
let usersActivityFilter = "";
let allUsersActivityFilter = "";
let currentTx = null;
let cancelMode = false;
let approveMode = false;
let adminReceiptUrl = null;
let refreshing = false;
let txCache = [];

function adminId() {
  const fromUrl = new URLSearchParams(location.search).get("tg_id");
  return tg?.initDataUnsafe?.user?.id || (fromUrl ? Number(fromUrl) : null);
}

function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2400);
}

function showPreloader(text) {
  document.getElementById("preloaderText").textContent = text || "Yuklanmoqda…";
  document.getElementById("preloader").hidden = false;
}

function hidePreloader() {
  document.getElementById("preloader").hidden = true;
}

function initials(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

function badge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
}

function fmt(n) {
  return Number(n).toLocaleString("ru-RU").replace(/,/g, " ");
}

function userName(x) {
  return `${x.first_name || ""} ${x.last_name || ""}`.trim() || "Noma'lum";
}

async function api(path, options = {}) {
  const id = adminId();
  const sep = path.includes("?") ? "&" : "?";
  const headers = { ...API_HEADERS, ...(options.headers || {}) };
  if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
  const res = await fetch(`${path}${sep}tg_id=${id}`, {
    ...options,
    headers,
  });
  if (res.status === 401 || res.status === 403) throw new Error("forbidden");
  return res.json();
}

function setPage(page) {
  document.querySelectorAll(".nav-item[data-page]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.page === page);
  });
  document.querySelectorAll("[data-page-view]").forEach((view) => {
    view.classList.toggle("is-active", view.dataset.pageView === page);
  });
  document.getElementById("pageTitle").textContent = PAGE_TITLES[page] || page;
  closeSidebar();
  if (page === "users") loadUsers();
  if (page === "allUsers") loadAllUsers();
  if (page === "admins") loadAdmins();
  if (page === "reviews") loadReviews();
  if (page === "transactions") loadAllTxTable();
  if (page === "cards") loadCards();
  if (page === "settings") loadSettings();
  if (page === "messages") loadBroadcasts();
  if (page === "stats") loadStats();
}

function openSidebar() {
  document.querySelector(".sidebar")?.classList.add("is-open");
  document.getElementById("sidebarBackdrop").hidden = false;
}

function closeSidebar() {
  document.querySelector(".sidebar")?.classList.remove("is-open");
  document.getElementById("sidebarBackdrop").hidden = true;
}

async function loadSummary() {
  const data = await api("/api/admin/summary");
  if (!data.ok) return;
  document.getElementById("statToday").textContent = data.summary.today;
  document.getElementById("statProgress").textContent = data.summary.progress;
  document.getElementById("statDone").textContent = data.summary.done;
  document.getElementById("statCancelled").textContent = data.summary.cancelled;
}

function rowHtml(x) {
  const name = userName(x);
  return `
    <tr data-tx="${x.tx_id}" class="${currentTx?.tx_id === x.tx_id ? "is-selected" : ""}">
      <td><b>${x.tx_id}</b></td>
      <td>
        <div class="user-cell">
          <span class="user-avatar">${initials(name)}</span>
          <span>${name}</span>
        </div>
      </td>
      <td>${fmt(x.cny)} CNY</td>
      <td>${fmt(x.uzs)} UZS</td>
      <td>${x.card || "—"}</td>
      <td>${x.created_at || "—"}</td>
      <td>${badge(x.status)}</td>
      <td>
        <div class="row-actions">
          ${
            x.status === "progress"
              ? `<button class="act-btn ok" type="button" data-quick="approve" data-tx="${x.tx_id}" title="Tasdiqlash">✓</button>
                 <button class="act-btn no" type="button" data-quick="cancel" data-tx="${x.tx_id}" title="Bekor">✕</button>`
              : `<button class="act-btn msg" type="button" data-quick="open" data-tx="${x.tx_id}" title="Ochish">👁</button>`
          }
        </div>
      </td>
    </tr>`;
}

function renderTable(tbodyId, list) {
  const tbody = document.getElementById(tbodyId);
  const empty = document.getElementById("txEmpty");
  const seen = new Set();
  const unique = [];
  for (const x of list || []) {
    if (!x.tx_id || seen.has(x.tx_id)) continue;
    seen.add(x.tx_id);
    unique.push(x);
  }
  if (!unique.length) {
    tbody.innerHTML = "";
    if (empty && tbodyId === "txTableBody") empty.hidden = false;
    return;
  }
  if (empty && tbodyId === "txTableBody") empty.hidden = true;
  tbody.innerHTML = unique.map(rowHtml).join("");
}

async function loadList() {
  const query = currentStatus ? `/api/admin/tx?status=${currentStatus}` : "/api/admin/tx";
  const data = await api(query);
  if (!data.ok) return;
  txCache = data.transactions || [];
  renderTable("txTableBody", txCache);
}

async function loadAllTxTable() {
  const query = allTxStatus ? `/api/admin/tx?status=${allTxStatus}` : "/api/admin/tx";
  const data = await api(query);
  if (!data.ok) return;
  renderTable("allTxTableBody", data.transactions || []);
}

async function loadUsers() {
  const data = await api("/api/admin/users");
  if (!data.ok) return;
  usersCache = data.users || [];
  updateActivityCounts(
    usersCache,
    {
      all: "actCountAll",
      d3: "actCount3",
      d7: "actCount7",
      d30: "actCount30",
      idle: "actCountIdle",
    }
  );
  renderUsersTable();
}

function daysSinceSeen(u) {
  const raw = String(u.last_seen_at || u.updated_at || u.created_at || "").trim();
  if (!raw) return Infinity;
  const ts = Date.parse(raw.replace(" ", "T"));
  if (!Number.isFinite(ts)) return Infinity;
  return (Date.now() - ts) / (1000 * 60 * 60 * 24);
}

/** Faollik guruhi: d3 (<=3), d7 (3–7], d30 (7–30], idle (>30) */
function userActivityBucket(u) {
  const days = daysSinceSeen(u);
  if (days <= 3) return "d3";
  if (days <= 7) return "d7";
  if (days <= 30) return "d30";
  return "idle";
}

function matchesActivityFilter(u, filter) {
  if (!filter) return true;
  const days = daysSinceSeen(u);
  if (filter === "d3") return days <= 3;
  if (filter === "d7") return days <= 7;
  if (filter === "d30") return days <= 30;
  if (filter === "idle") return days > 30;
  return true;
}

function activityCounts(list) {
  let d3 = 0;
  let d7 = 0;
  let d30 = 0;
  let idle = 0;
  for (const u of list) {
    const days = daysSinceSeen(u);
    if (days <= 3) d3 += 1;
    if (days <= 7) d7 += 1;
    if (days <= 30) d30 += 1;
    if (days > 30) idle += 1;
  }
  return { all: list.length, d3, d7, d30, idle };
}

function updateActivityCounts(list, ids) {
  const c = activityCounts(list);
  const map = [
    [ids.all, c.all],
    [ids.d3, c.d3],
    [ids.d7, c.d7],
    [ids.d30, c.d30],
    [ids.idle, c.idle],
  ];
  for (const [id, val] of map) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
}

function formatSeenCell(u) {
  const bucket = userActivityBucket(u);
  const when = u.last_seen_at || u.updated_at || u.created_at || "—";
  const labels = { d3: "3+", d7: "7+", d30: "30+", idle: "Uyqu" };
  return `<span class="seen-badge ${bucket}" title="${when}">${labels[bucket]} · ${when}</span>`;
}

function renderUsersTable() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  const list = usersCache.filter((u) => matchesActivityFilter(u, usersActivityFilter));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#64748b">Foydalanuvchilar yo'q</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map((u) => {
      const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
      const role = u.is_super_admin ? "👑" : u.is_admin ? "🛡" : "—";
      const bucket = userActivityBucket(u);
      const regAt = u.registered_at || (u.registered ? u.created_at : "—") || "—";
      return `
        <tr class="row-act-${bucket}">
          <td><b>#${u.unique_id || "—"}</b></td>
          <td>${name}</td>
          <td>${u.username ? "@" + u.username : "—"}</td>
          <td>${u.phone || "—"}</td>
          <td>${(u.lang || "uz").toUpperCase()}</td>
          <td>${regAt}</td>
          <td>${formatSeenCell(u)}</td>
          <td>${role}</td>
        </tr>`;
    })
    .join("");
}

function hasUserName(u) {
  return !!(String(u.first_name || "").trim() || String(u.last_name || "").trim());
}

function hasUserPhone(u) {
  return !!String(u.phone || "").trim();
}

function userRegStage(u) {
  if (u.registered) return "registered";
  if (hasUserPhone(u)) return "tel";
  const step = String(u.reg_step || "").trim();
  if (
    hasUserName(u) ||
    step === "name" ||
    step === "edit_name" ||
    step === "phone" ||
    step === "edit_phone"
  ) {
    return "fio";
  }
  return "start";
}

function matchesUserStage(u, stage) {
  if (!stage) return true;
  if (stage === "tel") return hasUserPhone(u);
  if (stage === "registered") return !!u.registered;
  if (stage === "fio") {
    if (u.registered || hasUserPhone(u)) return false;
    return userRegStage(u) === "fio";
  }
  if (stage === "start") return userRegStage(u) === "start";
  return userRegStage(u) === stage;
}

function renderAllUsersTable() {
  const tbody = document.getElementById("allUsersTableBody");
  if (!tbody) return;
  const list = allUsersCache.filter(
    (u) => matchesUserStage(u, allUsersStage) && matchesActivityFilter(u, allUsersActivityFilter)
  );
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#64748b">Foydalanuvchilar yo'q</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map((u) => {
      const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
      const role = u.is_super_admin ? "👑" : u.is_admin ? "🛡" : "—";
      const stage = userRegStage(u);
      const bucket = userActivityBucket(u);
      const regAt = u.registered_at || (u.registered ? u.created_at : "—") || "—";
      const stageBadge =
        stage === "registered"
          ? `<span class="badge badge-done">${REG_STAGE_LABELS[stage]}</span>`
          : stage === "tel"
            ? `<span class="badge badge-progress">${REG_STAGE_LABELS[stage]}</span>`
            : stage === "fio"
              ? `<span class="badge badge-progress">${REG_STAGE_LABELS[stage]}</span>`
              : `<span class="badge badge-cancelled">${REG_STAGE_LABELS[stage]}</span>`;
      return `
        <tr class="row-act-${bucket}">
          <td><b>#${u.unique_id || "—"}</b></td>
          <td>${name}</td>
          <td>${u.username ? "@" + u.username : "—"}</td>
          <td>${u.phone || "—"}</td>
          <td>${(u.lang || "uz").toUpperCase()}</td>
          <td>${stageBadge}</td>
          <td>${regAt}</td>
          <td>${formatSeenCell(u)}</td>
          <td>${role}</td>
        </tr>`;
    })
    .join("");
}

async function loadAllUsers() {
  const data = await api("/api/admin/users");
  if (!data.ok) return;
  allUsersCache = data.users || [];
  let start = 0;
  let fio = 0;
  let tel = 0;
  let registered = 0;
  for (const u of allUsersCache) {
    if (u.registered) registered += 1;
    if (hasUserPhone(u)) tel += 1;
    const stage = userRegStage(u);
    if (stage === "start") start += 1;
    else if (stage === "fio") fio += 1;
  }
  document.getElementById("allStatRegistered").textContent = registered;
  document.getElementById("allStatStart").textContent = start;
  document.getElementById("allStatFio").textContent = fio;
  document.getElementById("allStatTel").textContent = tel;
  document.getElementById("allStatTotal").textContent = allUsersCache.length;
  updateActivityCounts(
    allUsersCache,
    {
      all: "allActCountAll",
      d3: "allActCount3",
      d7: "allActCount7",
      d30: "allActCount30",
      idle: "allActCountIdle",
    }
  );
  renderAllUsersTable();
}

function bindActivityLegend(containerId, onChange) {
  document.getElementById(containerId)?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-activity]");
    if (!chip) return;
    document
      .querySelectorAll(`#${containerId} .activity-chip`)
      .forEach((c) => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    onChange(chip.dataset.activity || "");
  });
}

async function loadAdmins() {
  const data = await api("/api/admin/operators");
  if (!data.ok) return;
  const tbody = document.getElementById("adminsTableBody");
  if (!data.operators?.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b">Hali oddiy admin yo'q</td></tr>`;
    return;
  }
  tbody.innerHTML = data.operators
    .map((u) => {
      const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
      return `
        <tr>
          <td><b>${u.telegram_id}</b></td>
          <td>${name}</td>
          <td>${u.username ? "@" + u.username : "—"}</td>
          <td>#${u.unique_id || "—"}</td>
          <td>
            <div class="row-actions">
              <button class="act-btn no" type="button" data-admin-revoke="${u.telegram_id}" title="Adminni olib tashlash">✕</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

function resetAdminForm() {
  document.getElementById("adminTgId").value = "";
  document.getElementById("adminFio").value = "";
  document.getElementById("adminForm").hidden = true;
}

async function loadReviews() {
  const data = await api("/api/admin/reviews");
  if (!data.ok) return;
  const tbody = document.getElementById("reviewsTableBody");
  if (!data.reviews?.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#64748b">Sharhlar yo'q</td></tr>`;
    return;
  }
  tbody.innerHTML = data.reviews
    .map((r) => {
      const text = String(r.text || "").replace(/</g, "&lt;");
      const short = text.length > 80 ? text.slice(0, 80) + "…" : text;
      const onChannel = !!r.channel_message_id;
      return `
        <tr>
          <td><b>#${r.id}</b></td>
          <td>${r.name || "—"}<br><small style="color:#64748b">${r.username ? "@" + r.username : r.telegram_id}</small></td>
          <td>${r.tx_id || "—"}</td>
          <td title="${text}">${short}</td>
          <td>${r.created_at || "—"}</td>
          <td>${
            onChannel
              ? '<span class="badge badge-done">Yuborilgan</span>'
              : '<span class="badge badge-cancelled">Yo\'q</span>'
          }</td>
          <td>${r.active ? '<span class="badge badge-done">Faol</span>' : '<span class="badge badge-cancelled">O\'chirilgan</span>'}</td>
          <td style="white-space:nowrap">
            ${
              r.active
                ? `<button class="act-btn yes" type="button" data-review-republish="${r.id}" title="Kanalga yuborish">↗</button>
                   <button class="act-btn no" type="button" data-review-del="${r.id}" title="O'chirish">✕</button>`
                : "—"
            }
          </td>
        </tr>`;
    })
    .join("");
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    await Promise.all([loadSummary(), loadList()]);
    const active = document.querySelector(".page.is-active")?.dataset.pageView;
    if (active === "transactions") await loadAllTxTable();
    if (active === "users") await loadUsers();
    if (active === "allUsers") await loadAllUsers();
  } finally {
    refreshing = false;
  }
}

function resetApproveForm() {
  const input = document.getElementById("adminReceiptInput");
  const preview = document.getElementById("adminReceiptPreview");
  const placeholder = document.getElementById("adminReceiptPlaceholder");
  if (input) input.value = "";
  if (preview) {
    preview.src = "";
    preview.hidden = true;
  }
  if (placeholder) placeholder.hidden = false;
  adminReceiptUrl = null;
}

async function openDetail(txId, mode = null) {
  const data = await api(`/api/admin/tx/${txId}`);
  if (!data.ok) return;
  currentTx = data.tx;
  cancelMode = mode === "cancel";
  approveMode = mode === "approve";
  if (!approveMode) resetApproveForm();
  renderDetail();
  showDetailDrawer();
  document.querySelectorAll("#txTableBody tr, #allTxTableBody tr").forEach((row) => {
    row.classList.toggle("is-selected", row.dataset.tx === txId);
  });
}

function showDetailDrawer() {
  const panel = document.getElementById("detailPanel");
  const backdrop = document.getElementById("detailBackdrop");
  if (panel) panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
}

function hideDetailDrawer() {
  const panel = document.getElementById("detailPanel");
  const backdrop = document.getElementById("detailBackdrop");
  if (panel) panel.hidden = true;
  if (backdrop) backdrop.hidden = true;
}

function renderDetail() {
  const x = currentTx;
  const empty = document.getElementById("detailEmpty");
  const content = document.getElementById("detailContent");
  if (!x) {
    empty.hidden = false;
    content.hidden = true;
    hideDetailDrawer();
    return;
  }
  empty.hidden = true;
  content.hidden = false;

  const user = x.user || {};
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Noma'lum";
  const username = user.username ? `@${user.username}` : "—";

  document.getElementById("detailMeta").innerHTML = `
    <div class="detail-row"><span>ID</span><b>${x.tx_id}</b></div>
    <div class="detail-row"><span>Summasi</span><b>${fmt(x.cny)} CNY</b></div>
    <div class="detail-row"><span>To'langan</span><b>${fmt(x.uzs)} UZS</b></div>
    <div class="detail-row"><span>Foydalanuvchi</span><b>${name}<br><small style="color:#64748b">${username}</small></b></div>
    <div class="detail-row"><span>Telefon</span><b>${user.phone || "—"}</b></div>
    <div class="detail-row"><span>Unikal ID</span><b>#${user.unique_id || "—"}</b></div>
    <div class="detail-row"><span>Karta</span><b>${x.card || "—"}</b></div>
    <div class="detail-row"><span>Yaratilgan</span><b>${x.created_at || "—"}</b></div>
    <div class="detail-row"><span>Holat</span><b>${badge(x.status)}</b></div>
    ${x.reason ? `<div class="detail-row"><span>Sabab</span><b>${x.reason}</b></div>` : ""}
  `;

  document.getElementById("detailProofs").innerHTML = `
    <button class="proof-card" type="button" data-image="${x.receipt || ""}" ${x.receipt ? "" : "disabled"}>
      ${
        x.receipt
          ? `<img src="${x.receipt}" alt="Chek" /><span>To'lov cheki</span>`
          : `<div class="proof-missing">📷</div><span>Chek yuklanmagan</span>`
      }
    </button>
    <button class="proof-card" type="button" data-image="${x.qr || ""}" ${x.qr ? "" : "disabled"}>
      ${
        x.qr
          ? `<img src="${x.qr}" alt="QR" /><span>Alipay QR</span>`
          : `<div class="proof-missing">▣</div><span>QR yuklanmagan</span>`
      }
    </button>
    ${
      x.admin_receipt
        ? `<button class="proof-card" type="button" data-image="${x.admin_receipt}" style="grid-column:1/-1">
            <img src="${x.admin_receipt}" alt="Yuan chek" /><span>Yuan o'tkazma cheki</span>
          </button>`
        : ""
    }
  `;

  document.getElementById("cancelForm").hidden = !cancelMode;
  document.getElementById("approveForm").hidden = !approveMode;

  const actions = document.getElementById("detailActions");
  if (x.status !== "progress") {
    actions.innerHTML = `<button class="btn btn-ghost" type="button" id="closeDetailBtn">Yopish</button>`;
    document.getElementById("closeDetailBtn").onclick = clearDetail;
    return;
  }

  if (cancelMode) {
    actions.innerHTML = `
      <button class="btn btn-ghost" type="button" id="backBtn">Orqaga</button>
      <button class="btn btn-cancel" type="button" id="confirmCancelBtn">Bekor qilish</button>`;
    document.getElementById("backBtn").onclick = () => {
      cancelMode = false;
      document.getElementById("cancelReason").value = "";
      renderDetail();
    };
    document.getElementById("confirmCancelBtn").onclick = doCancel;
  } else if (approveMode) {
    actions.innerHTML = `
      <button class="btn btn-ghost" type="button" id="backBtn">Orqaga</button>
      <button class="btn btn-approve" type="button" id="confirmApproveBtn">Tasdiqlash</button>`;
    document.getElementById("backBtn").onclick = () => {
      approveMode = false;
      resetApproveForm();
      renderDetail();
    };
    document.getElementById("confirmApproveBtn").onclick = doApprove;
  } else {
    actions.innerHTML = `
      <button class="btn btn-approve" type="button" id="approveBtn">Tasdiqlash</button>
      <button class="btn btn-cancel" type="button" id="cancelBtn">Bekor qilish</button>`;
    document.getElementById("approveBtn").onclick = () => {
      approveMode = true;
      cancelMode = false;
      renderDetail();
    };
    document.getElementById("cancelBtn").onclick = () => {
      cancelMode = true;
      approveMode = false;
      renderDetail();
      document.getElementById("cancelReason").focus();
    };
  }
}

function clearDetail() {
  currentTx = null;
  cancelMode = false;
  approveMode = false;
  resetApproveForm();
  const reason = document.getElementById("cancelReason");
  if (reason) reason.value = "";
  renderDetail();
  document.querySelectorAll("#txTableBody tr, #allTxTableBody tr").forEach((row) => {
    row.classList.remove("is-selected");
  });
}

async function uploadAdminReceipt(file) {
  const form = new FormData();
  form.append("tg_id", String(adminId()));
  form.append("file", file, file.name || "admin-receipt.jpg");
  const headers = { "ngrok-skip-browser-warning": "true" };
  if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
  const res = await fetch(`/api/upload?tg_id=${adminId()}`, {
    method: "POST",
    headers,
    body: form,
  });
  const data = await res.json();
  if (!data.ok || !data.url) throw new Error("upload failed");
  return data.url;
}

async function doApprove() {
  if (!adminReceiptUrl) {
    toast("Avval yuan o'tkazma chekini yuklang");
    return;
  }
  showPreloader("Tasdiqlanmoqda…");
  try {
    const data = await api(`/api/admin/tx/${currentTx.tx_id}/approve`, {
      method: "POST",
      body: JSON.stringify({ admin_receipt: adminReceiptUrl }),
    });
    if (data.ok) {
      toast("✅ Tasdiqlandi — chek foydalanuvchiga yuborildi");
      clearDetail();
      await refresh();
    } else toast(data.error || "Xatolik");
  } catch (_) {
    toast("Xatolik yuz berdi");
  } finally {
    hidePreloader();
  }
}

async function doCancel() {
  const reason = document.getElementById("cancelReason").value.trim();
  if (!reason) {
    toast("Bekor qilish sababini yozing");
    return;
  }
  showPreloader("Bekor qilinmoqda…");
  try {
    const data = await api(`/api/admin/tx/${currentTx.tx_id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (data.ok) {
      toast("❌ Bekor qilindi");
      clearDetail();
      await refresh();
    }
  } catch (_) {
    toast("Xatolik yuz berdi");
  } finally {
    hidePreloader();
  }
}

let broadcastImageUrl = null;

function resetBroadcastForm() {
  const text = document.getElementById("broadcastText");
  if (text) text.value = "";
  broadcastImageUrl = null;
  const preview = document.getElementById("broadcastImgPreview");
  const placeholder = document.getElementById("broadcastImgPlaceholder");
  const clearBtn = document.getElementById("broadcastClearImg");
  const input = document.getElementById("broadcastImgInput");
  if (preview) {
    preview.src = "";
    preview.hidden = true;
  }
  if (placeholder) placeholder.hidden = false;
  if (clearBtn) clearBtn.hidden = true;
  if (input) input.value = "";
}

function syncBroadcastModeUi() {
  const mode = document.getElementById("broadcastMode")?.value || "once";
  const hoursWrap = document.getElementById("broadcastHoursWrap");
  const hint = document.getElementById("broadcastModeHint");
  if (hoursWrap) hoursWrap.hidden = mode !== "interval";
  if (hint) {
    hint.textContent =
      mode === "interval"
        ? "Hozir yuboriladi, keyin belgilangan soat oralig‘ida avtomatik takrorlanadi."
        : "Bir marta barcha foydalanuvchilarga yuboriladi.";
  }
}

async function loadBroadcasts() {
  syncBroadcastModeUi();
  const data = await api("/api/admin/broadcasts");
  if (!data.ok) return;
  const tbody = document.getElementById("broadcastsTableBody");
  if (!tbody) return;
  const list = data.broadcasts || [];
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b">Hali xabar yo‘q</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map((b) => {
      const preview = (b.text || "").replace(/\s+/g, " ").trim();
      const short = preview.length > 60 ? preview.slice(0, 60) + "…" : preview || "—";
      const modeLabel =
        b.mode === "interval"
          ? `Avto · har ${b.interval_hours || "?"} soat`
          : "Bir martalik";
      let status;
      if (b.mode === "interval" && Number(b.active) === 1) {
        status = `<span class="badge badge-progress">Faol</span>`;
      } else if (b.mode === "interval") {
        status = `<span class="badge badge-cancelled">To‘xtatilgan</span>`;
      } else {
        status = `<span class="badge badge-done">Yuborilgan</span>`;
      }
      const last = b.last_sent_at
        ? `${b.last_sent_at}<br><small>✓${b.last_sent || 0} · ✕${b.last_failed || 0}</small>`
        : "—";
      const actions = [];
      if (b.mode === "interval" && Number(b.active) === 1) {
        actions.push(
          `<button class="act-btn no" type="button" data-broadcast-stop="${b.id}" title="To‘xtatish">⏹</button>`
        );
      }
      actions.push(
        `<button class="act-btn no" type="button" data-broadcast-del="${b.id}" title="O‘chirish">✕</button>`
      );
      return `
        <tr>
          <td><b>#${b.id}</b></td>
          <td title="${preview.replace(/"/g, "&quot;")}">${short}</td>
          <td>${b.image_url ? "🖼" : "—"}</td>
          <td>${modeLabel}</td>
          <td>${status}</td>
          <td>${last}</td>
          <td><div class="row-actions">${actions.join("")}</div></td>
        </tr>`;
    })
    .join("");
}

async function sendBroadcast() {
  const text = document.getElementById("broadcastText")?.value.trim() || "";
  const mode = document.getElementById("broadcastMode")?.value || "once";
  const hours = Number(document.getElementById("broadcastHours")?.value || 0);
  if (!text && !broadcastImageUrl) {
    toast("Matn yoki rasm kiriting");
    return;
  }
  if (mode === "interval" && (!Number.isFinite(hours) || hours < 1 || hours > 720)) {
    toast("Soat 1 dan 720 gacha bo‘lishi kerak");
    return;
  }
  showPreloader("Xabar yuborilmoqda…");
  try {
    const data = await api("/api/admin/broadcasts", {
      method: "POST",
      body: JSON.stringify({
        text,
        image_url: broadcastImageUrl || "",
        mode,
        interval_hours: mode === "interval" ? hours : 0,
      }),
    });
    if (data.ok) {
      toast(
        mode === "interval"
          ? "Avto xabar yoqildi — hozir yuborilmoqda"
          : "Xabar yuborilmoqda"
      );
      resetBroadcastForm();
      await loadBroadcasts();
    } else {
      toast(data.error || "Xatolik");
    }
  } catch (_) {
    toast("Xatolik yuz berdi");
  } finally {
    hidePreloader();
  }
}

function bindFilters(containerId, onChange) {
  document.getElementById(containerId)?.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    document.querySelectorAll(`#${containerId} .pill`).forEach((p) => p.classList.remove("is-active"));
    pill.classList.add("is-active");
    onChange(pill.dataset.status);
  });
}

function bindTable(tbodyId) {
  document.getElementById(tbodyId)?.addEventListener("click", (e) => {
    const quick = e.target.closest("[data-quick]");
    if (quick) {
      e.stopPropagation();
      const txId = quick.dataset.tx;
      if (quick.dataset.quick === "approve") openDetail(txId, "approve");
      else if (quick.dataset.quick === "cancel") openDetail(txId, "cancel");
      else openDetail(txId);
      return;
    }
    const row = e.target.closest("tr[data-tx]");
    if (row) openDetail(row.dataset.tx);
  });
}

function maskCard(number) {
  const d = String(number || "").replace(/\D/g, "");
  if (d.length < 8) return number || "—";
  return `${d.slice(0, 4)} **** **** ${d.slice(-4)}`;
}

async function loadCards() {
  const data = await api("/api/admin/cards");
  if (!data.ok) return;
  const tbody = document.getElementById("cardsTableBody");
  if (!data.cards?.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b">Kartalar yo'q</td></tr>`;
    return;
  }
  tbody.innerHTML = data.cards
    .map(
      (c) => `
      <tr>
        <td><b>${c.title}</b></td>
        <td>${(c.brand || "").toUpperCase()}</td>
        <td>${maskCard(c.number)}</td>
        <td>${c.owner_name || "—"}</td>
        <td>${c.active ? '<span class="badge badge-done">Faol</span>' : '<span class="badge badge-cancelled">O\'chiq</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="act-btn ok" type="button" data-card-toggle="${c.id}" data-active="${c.active ? 0 : 1}" title="Faol/O'chirish">${c.active ? "⏸" : "▶"}</button>
            <button class="act-btn no" type="button" data-card-del="${c.id}" title="O'chirish">✕</button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

async function loadSettings() {
  const data = await api("/api/admin/settings");
  if (!data.ok) return;
  const s = data.settings || {};
  document.getElementById("setRate").value = s.rate_uzs || "";
  document.getElementById("setMin").value = s.min_cny || "";
  document.getElementById("setMax").value = s.max_cny || "";
  document.getElementById("setCommission").value = s.commission || "";
  document.getElementById("setHours").value = s.work_hours || "";
  await loadBonusSettings();
  await loadContestSettings();
  await loadTestModeSettings();
}

async function loadBonusSettings() {
  const data = await api("/api/admin/bonus");
  if (!data.ok) return;
  const b = data.bonus || {};
  const status = document.getElementById("bonusStatusText");
  const enablePanel = document.getElementById("bonusEnablePanel");
  const disablePanel = document.getElementById("bonusDisablePanel");
  const input = document.getElementById("bonusCnyInput");
  if (input) input.value = b.cny || 5;
  const changeInput = document.getElementById("bonusCnyChangeInput");
  if (changeInput) changeInput.value = b.cny || 5;
  if (b.enabled) {
    if (status) {
      status.innerHTML = `Holat: <b style="color:#16a34a">Yoqilgan</b> · <b>${b.cny} CNY</b> bonus (min. ${b.min_cny || 50} CNY)`;
    }
    if (enablePanel) enablePanel.hidden = true;
    if (disablePanel) disablePanel.hidden = false;
  } else {
    if (status) {
      status.innerHTML = `Holat: <b style="color:#dc2626">O‘chirilgan</b> — ilova va botda bonus ko‘rinmaydi`;
    }
    if (enablePanel) enablePanel.hidden = false;
    if (disablePanel) disablePanel.hidden = true;
  }
}

async function loadContestSettings() {
  const data = await api("/api/admin/contest");
  if (!data.ok) return;
  const c = data.contest || {};
  const status = document.getElementById("contestStatusText");
  const enablePanel = document.getElementById("contestEnablePanel");
  const disablePanel = document.getElementById("contestDisablePanel");
  const daysInput = document.getElementById("contestDaysInput");
  const chInput = document.getElementById("contestChannelInput");
  const chChange = document.getElementById("contestChannelChangeInput");
  if (daysInput) daysInput.value = c.days || 7;
  if (chInput) chInput.value = c.channel || "@Yuan_Go";
  if (chChange) chChange.value = c.channel || "@Yuan_Go";
  const left =
    c.left_days == null ? "—" : `${Number(c.left_days).toFixed(1)} kun qoldi`;
  if (c.enabled) {
    if (status) {
      status.innerHTML = `Holat: <b style="color:#16a34a">Yoqilgan</b> · ${c.days || "?"} kun · tugash: <b>${c.ends_at || "—"}</b> · ${left}<br/>Kanal: <code>${c.channel || ""}</code>`;
    }
    if (enablePanel) enablePanel.hidden = true;
    if (disablePanel) disablePanel.hidden = false;
  } else {
    if (status) {
      status.innerHTML = `Holat: <b style="color:#dc2626">O‘chirilgan</b> — /start odatiy menyu`;
    }
    if (enablePanel) enablePanel.hidden = false;
    if (disablePanel) disablePanel.hidden = true;
  }
  const tbody = document.getElementById("contestTopBody");
  if (tbody) {
    const top = data.top || [];
    tbody.innerHTML = top.length
      ? top
          .map(
            (r, i) => `<tr>
          <td>${i + 1}</td>
          <td><code>${r.telegram_id}</code></td>
          <td>${[r.first_name, r.last_name].filter(Boolean).join(" ") || r.username || "—"}</td>
          <td><b>${r.points || 0}</b></td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="muted">Hali ball yo‘q</td></tr>`;
  }
}

function renderTestUsersTable(users) {
  const tbody = document.getElementById("testUsersTableBody");
  if (!tbody) return;
  const list = users || [];
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b">Test user yo‘q — Telegram ID qo‘shing</td></tr>`;
    return;
  }
  tbody.innerHTML = list
    .map((u) => {
      const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
      return `
        <tr>
          <td><b>${u.telegram_id}</b></td>
          <td>${name}</td>
          <td>${u.username ? "@" + u.username : "—"}</td>
          <td>${u.note || "—"}</td>
          <td>
            <button class="act-btn no" type="button" data-test-user-del="${u.telegram_id}" title="O‘chirish">✕</button>
          </td>
        </tr>`;
    })
    .join("");
}

async function loadTestModeSettings() {
  const data = await api("/api/admin/test-mode");
  if (!data.ok) return;
  const tm = data.test_mode || {};
  const status = document.getElementById("testModeStatusText");
  const panel = document.getElementById("testUsersPanel");
  const onBtn = document.getElementById("testModeOnBtn");
  const offBtn = document.getElementById("testModeOffBtn");
  if (tm.enabled) {
    if (status) {
      status.innerHTML = `Holat: <b style="color:#ea580c">TEST REJIM YOQILGAN</b> · ${tm.count || 0} ta test user`;
    }
    if (panel) panel.hidden = false;
    if (onBtn) onBtn.hidden = true;
    if (offBtn) offBtn.hidden = false;
  } else {
    if (status) {
      status.innerHTML = `Holat: <b style="color:#16a34a">Oddiy rejim</b> — bot hammaga ochiq`;
    }
    if (panel) panel.hidden = true;
    if (onBtn) onBtn.hidden = false;
    if (offBtn) offBtn.hidden = true;
  }
  renderTestUsersTable(tm.users || []);
}

async function loadStats() {
  const data = await api("/api/admin/stats");
  if (!data.ok) return;
  const st = data.stats;
  const s = st.summary || {};
  document.getElementById("statsCards").innerHTML = `
    <article class="stat-card"><div class="stat-ico blue">∑</div><div><b>${s.total || 0}</b><span>Jami tranzaksiyalar</span></div></article>
    <article class="stat-card"><div class="stat-ico green">¥</div><div><b>${fmt(s.volume_cny || 0)}</b><span>Jami hajm (CNY)</span></div></article>
    <article class="stat-card"><div class="stat-ico orange">👥</div><div><b>${st.users_registered || 0}</b><span>Ro'yxatdan o'tganlar</span></div></article>
    <article class="stat-card"><div class="stat-ico red">◷</div><div><b>${s.today || 0}</b><span>Bugungi operatsiyalar</span></div></article>
    <article class="stat-card"><div class="stat-ico green">✓</div><div><b>${s.done || 0}</b><span>Yakunlangan</span></div></article>
    <article class="stat-card"><div class="stat-ico orange">⏳</div><div><b>${s.progress || 0}</b><span>Kutilayotgan</span></div></article>
    <article class="stat-card"><div class="stat-ico red">✕</div><div><b>${s.cancelled || 0}</b><span>Bekor qilingan</span></div></article>
    <article class="stat-card"><div class="stat-ico blue">UZS</div><div><b>${fmt(s.volume_uzs || 0)}</b><span>Jami hajm (UZS)</span></div></article>
  `;

  const daily = st.daily || [];
  const maxCny = Math.max(1, ...daily.map((d) => Number(d.cny) || 0));
  const maxCnt = Math.max(1, ...daily.map((d) => Number(d.count) || 0));
  const w = 560;
  const h = 220;
  const pad = 20;
  const points = daily.map((d, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, daily.length - 1);
    const y = h - pad - ((Number(d.cny) || 0) / maxCny) * (h - pad * 2);
    return `${x},${y}`;
  });
  const countBars = daily
    .map((d, i) => {
      const bw = (w - pad * 2) / Math.max(1, daily.length);
      const x = pad + i * bw + bw * 0.18;
      const barH = ((Number(d.count) || 0) / maxCnt) * (h - pad * 2);
      const y = h - pad - barH;
      return `<rect x="${x}" y="${y}" width="${bw * 0.64}" height="${Math.max(2, barH)}" rx="3" fill="rgba(37,99,235,0.22)" />`;
    })
    .join("");
  const area = `${pad},${h - pad} ${points.join(" ")} ${w - pad},${h - pad}`;
  document.getElementById("volumeChart").innerHTML = `
    ${countBars}
    <polyline fill="none" stroke="#2563eb" stroke-width="3" points="${points.join(" ")}" />
    <polygon fill="rgba(37,99,235,0.12)" points="${area}" />
    ${points
      .map((p) => {
        const [x, y] = p.split(",");
        return `<circle cx="${x}" cy="${y}" r="4" fill="#2563eb" />`;
      })
      .join("")}
  `;
  document.getElementById("volumeLabels").innerHTML = daily
    .map((d) => `<span>${d.label}<br><b>${fmt(d.cny)}</b><br><small>${d.count || 0} ta</small></span>`)
    .join("");

  const totalStatus = Math.max(1, (s.done || 0) + (s.progress || 0) + (s.cancelled || 0));
  const bars = [
    ["Yakunlangan", s.done || 0, "#16a34a"],
    ["Kutilayotgan", s.progress || 0, "#ea580c"],
    ["Bekor qilingan", s.cancelled || 0, "#dc2626"],
  ];
  document.getElementById("statusBars").innerHTML = bars
    .map(
      ([label, val, color]) => `
      <div class="status-bar-row">
        <span>${label}</span>
        <div class="status-bar-track"><div class="status-bar-fill" style="width:${(val / totalStatus) * 100}%;background:${color}"></div></div>
        <b>${val}</b>
      </div>`
    )
    .join("");

  document.getElementById("recentUsersBody").innerHTML = (st.recent_users || [])
    .map((u) => {
      const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
      return `<tr>
        <td>#${u.unique_id || "—"}</td>
        <td>${name}</td>
        <td>${u.username ? "@" + u.username : "—"}</td>
        <td>${u.updated_at || u.created_at || "—"}</td>
      </tr>`;
    })
    .join("") || `<tr><td colspan="4" style="text-align:center;color:#64748b">Ma'lumot yo'q</td></tr>`;

  document.getElementById("recentTxBody").innerHTML = (st.recent_txs || [])
    .map((t) => {
      const name = `${t.first_name || ""} ${t.last_name || ""}`.trim() || "—";
      return `<tr>
        <td>${t.tx_id}</td>
        <td>${name}</td>
        <td>${fmt(t.cny)}</td>
        <td>${badge(t.status)}</td>
      </tr>`;
    })
    .join("") || `<tr><td colspan="4" style="text-align:center;color:#64748b">Ma'lumot yo'q</td></tr>`;
}

function resetCardForm() {
  document.getElementById("cardBrand").value = "uzcard";
  document.getElementById("cardTitle").value = "";
  document.getElementById("cardNumber").value = "";
  document.getElementById("cardOwner").value = "";
  document.getElementById("cardForm").hidden = true;
}

async function init() {
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("ru-RU");

  if (!adminId()) {
    document.getElementById("deniedView").hidden = false;
    return;
  }

  try {
    const me = await api("/api/admin/me");
    if (!me.ok || me.role !== "super") {
      document.getElementById("deniedView").hidden = false;
      document.querySelector("#deniedView h2").textContent = "Faqat Super Admin";
      document.querySelector("#deniedView p").innerHTML =
        "Professional panel faqat super admin uchun.<br>Botga <code>/start</code> yuboring.";
      return;
    }
    await refresh();
    document.getElementById("panelView").hidden = false;
    renderDetail();
  } catch (_) {
    document.getElementById("deniedView").hidden = false;
    return;
  }

  document.querySelectorAll(".nav-item[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    if (tg?.close) tg.close();
    else toast("Admin paneldan chiqildi");
  });

  document.getElementById("sidebarToggle")?.addEventListener("click", openSidebar);
  document.getElementById("sidebarBackdrop")?.addEventListener("click", closeSidebar);
  document.getElementById("detailCloseBtn")?.addEventListener("click", clearDetail);
  document.getElementById("detailBackdrop")?.addEventListener("click", clearDetail);

  document.getElementById("refreshBtn")?.addEventListener("click", async () => {
    showPreloader("Yangilanmoqda…");
    try {
      await refresh();
      toast("Yangilandi");
    } finally {
      hidePreloader();
    }
  });

  bindFilters("dashFilters", (status) => {
    currentStatus = status;
    loadList();
  });
  bindFilters("txFilters", (status) => {
    allTxStatus = status;
    loadAllTxTable();
  });
  bindFilters("allUsersFilters", (status) => {
    allUsersStage = status || "";
    renderAllUsersTable();
  });
  bindActivityLegend("usersActivityLegend", (activity) => {
    usersActivityFilter = activity || "";
    renderUsersTable();
  });
  bindActivityLegend("allUsersActivityLegend", (activity) => {
    allUsersActivityFilter = activity || "";
    renderAllUsersTable();
  });

  bindTable("txTableBody");
  bindTable("allTxTableBody");

  document.getElementById("pickAdminReceiptBtn")?.addEventListener("click", () => {
    document.getElementById("adminReceiptInput").click();
  });
  document.getElementById("adminReceiptInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showPreloader("Chek yuklanmoqda…");
    try {
      adminReceiptUrl = await uploadAdminReceipt(file);
      const preview = document.getElementById("adminReceiptPreview");
      preview.src = adminReceiptUrl;
      preview.hidden = false;
      document.getElementById("adminReceiptPlaceholder").hidden = true;
      toast("Chek yuklandi");
    } catch (_) {
      adminReceiptUrl = null;
      toast("Chek yuklanmadi");
    } finally {
      hidePreloader();
    }
  });

  document.body.addEventListener("click", (e) => {
    const proof = e.target.closest("[data-image]");
    if (proof?.dataset.image) {
      document.getElementById("imageViewerImg").src = proof.dataset.image;
      document.getElementById("imageViewer").hidden = false;
    }
  });
  document.getElementById("imageViewer")?.addEventListener("click", () => {
    document.getElementById("imageViewer").hidden = true;
  });

  document.getElementById("addCardBtn")?.addEventListener("click", () => {
    document.getElementById("cardForm").hidden = false;
  });
  document.getElementById("cancelCardBtn")?.addEventListener("click", resetCardForm);
  document.getElementById("saveCardBtn")?.addEventListener("click", async () => {
    const brand = document.getElementById("cardBrand").value;
    const title = document.getElementById("cardTitle").value.trim();
    const number = document.getElementById("cardNumber").value.trim();
    const owner_name = document.getElementById("cardOwner").value.trim();
    if (!title || !number || !owner_name) {
      toast("Barcha maydonlarni to'ldiring");
      return;
    }
    showPreloader("Saqlanmoqda…");
    try {
      const data = await api("/api/admin/cards", {
        method: "POST",
        body: JSON.stringify({ brand, title, number, owner_name }),
      });
      if (data.ok) {
        toast("Karta qo'shildi");
        resetCardForm();
        loadCards();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("refreshReviewsBtn")?.addEventListener("click", loadReviews);
  document.getElementById("reviewsTableBody")?.addEventListener("click", async (e) => {
    const republish = e.target.closest("[data-review-republish]");
    if (republish) {
      if (!confirm("Bu sharhni kanalga yuborasizmi?")) return;
      showPreloader("Kanalga yuborilmoqda…");
      try {
        const data = await api(
          `/api/admin/reviews/${republish.dataset.reviewRepublish}/republish`,
          { method: "POST" }
        );
        if (data.ok) {
          toast("Kanalga yuborildi");
          loadReviews();
        } else toast(data.error || "Yuborilmadi — REVIEWS_CHANNEL / bot adminligini tekshiring");
      } catch (_) {
        toast("Xatolik");
      } finally {
        hidePreloader();
      }
      return;
    }

    const del = e.target.closest("[data-review-del]");
    if (!del) return;
    if (!confirm("Bu sharhni o'chirasizmi? Kanal xabari ham o'chiriladi (agar mumkin bo'lsa).")) return;
    showPreloader("O'chirilmoqda…");
    try {
      const data = await api(`/api/admin/reviews/${del.dataset.reviewDel}/delete`, { method: "POST" });
      if (data.ok) {
        toast("Sharh o'chirildi");
        loadReviews();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("addAdminBtn")?.addEventListener("click", () => {
    document.getElementById("adminForm").hidden = false;
  });
  document.getElementById("cancelAdminBtn")?.addEventListener("click", resetAdminForm);
  document.getElementById("saveAdminBtn")?.addEventListener("click", async () => {
    const telegram_id = document.getElementById("adminTgId").value.trim();
    const fio = document.getElementById("adminFio").value.trim();
    if (!telegram_id || !fio) {
      toast("Telegram ID va FIO kiriting");
      return;
    }
    showPreloader("Saqlanmoqda…");
    try {
      const data = await api("/api/admin/operators", {
        method: "POST",
        body: JSON.stringify({ telegram_id, fio }),
      });
      if (data.ok) {
        toast("Admin qo'shildi");
        resetAdminForm();
        loadAdmins();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });
  document.getElementById("adminsTableBody")?.addEventListener("click", async (e) => {
    const revoke = e.target.closest("[data-admin-revoke]");
    if (!revoke) return;
    if (!confirm("Bu admindan huquqni olasizmi?")) return;
    showPreloader("Olib tashlanmoqda…");
    try {
      const data = await api(`/api/admin/operators/${revoke.dataset.adminRevoke}/revoke`, {
        method: "POST",
      });
      if (data.ok) {
        toast("Admin olib tashlandi");
        loadAdmins();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("cardsTableBody")?.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-card-del]");
    const toggle = e.target.closest("[data-card-toggle]");
    if (del) {
      if (!confirm("Kartani o'chirasizmi?")) return;
      await api(`/api/admin/cards/${del.dataset.cardDel}/delete`, { method: "POST" });
      toast("O'chirildi");
      loadCards();
    }
    if (toggle) {
      await api(`/api/admin/cards/${toggle.dataset.cardToggle}`, {
        method: "POST",
        body: JSON.stringify({ active: Number(toggle.dataset.active) === 1 }),
      });
      loadCards();
    }
  });

  document.getElementById("saveSettingsBtn")?.addEventListener("click", async () => {
    showPreloader("Saqlanmoqda…");
    try {
      const data = await api("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({
          rate_uzs: document.getElementById("setRate").value,
          min_cny: document.getElementById("setMin").value,
          max_cny: document.getElementById("setMax").value,
          commission: document.getElementById("setCommission").value,
          work_hours: document.getElementById("setHours").value,
        }),
      });
      if (data.ok) {
        toast(
          data.broadcast
            ? "Sozlamalar saqlandi — barcha foydalanuvchilarga yuborilmoqda"
            : "Sozlamalar saqlandi"
        );
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("bonusEnableBtn")?.addEventListener("click", async () => {
    const cny = Number(document.getElementById("bonusCnyInput")?.value || 0);
    if (!Number.isFinite(cny) || cny <= 0) {
      toast("Bonus miqdorini kiriting");
      return;
    }
    showPreloader("Bonus yoqilmoqda…");
    try {
      const data = await api("/api/admin/bonus", {
        method: "POST",
        body: JSON.stringify({ enabled: true, cny }),
      });
      if (data.ok) {
        toast(
          data.broadcast
            ? `Bonus yoqildi (${data.bonus?.cny} CNY) — hammaga xabar yuborilmoqda`
            : "Bonus yoqildi"
        );
        await loadBonusSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("bonusChangeBtn")?.addEventListener("click", async () => {
    const cny = Number(document.getElementById("bonusCnyChangeInput")?.value || 0);
    if (!Number.isFinite(cny) || cny <= 0) {
      toast("Bonus miqdorini kiriting");
      return;
    }
    showPreloader("Bonus yangilanmoqda…");
    try {
      const data = await api("/api/admin/bonus", {
        method: "POST",
        body: JSON.stringify({ enabled: true, cny }),
      });
      if (data.ok) {
        toast(
          data.broadcast
            ? `Bonus ${data.bonus?.cny} CNY — hammaga xabar yuborilmoqda`
            : "Bonus yangilandi"
        );
        await loadBonusSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("bonusDisableBtn")?.addEventListener("click", async () => {
    if (!confirm("Bonusni o‘chirasizmi? Ilova va botdan aksiya yashirinadi.")) return;
    showPreloader("Bonus o‘chirilmoqda…");
    try {
      const data = await api("/api/admin/bonus", {
        method: "POST",
        body: JSON.stringify({ enabled: false }),
      });
      if (data.ok) {
        toast("Bonus o‘chirildi");
        await loadBonusSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("contestEnableBtn")?.addEventListener("click", async () => {
    const days = Number(document.getElementById("contestDaysInput")?.value || 0);
    const channel = document.getElementById("contestChannelInput")?.value || "";
    if (!Number.isFinite(days) || days < 1) {
      toast("Muddatni kiriting (kun)");
      return;
    }
    if (
      !confirm(
        `Konkursni ${days} kunga yoqasizmi?\n/start da Konkurs + Yuan Go chiqadi.`
      )
    ) {
      return;
    }
    showPreloader("Konkurs yoqilmoqda…");
    try {
      const data = await api("/api/admin/contest", {
        method: "POST",
        body: JSON.stringify({ enabled: true, days, channel }),
      });
      if (data.ok) {
        toast("Konkurs yoqildi");
        await loadContestSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("contestDisableBtn")?.addEventListener("click", async () => {
    if (!confirm("Konkursni o‘chirasizmi? Ballar saqlanadi, /start odatiy bo‘ladi.")) return;
    showPreloader("Konkurs o‘chirilmoqda…");
    try {
      const data = await api("/api/admin/contest", {
        method: "POST",
        body: JSON.stringify({ enabled: false }),
      });
      if (data.ok) {
        toast("Konkurs o‘chirildi");
        await loadContestSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("contestChannelSaveBtn")?.addEventListener("click", async () => {
    const channel = document.getElementById("contestChannelChangeInput")?.value || "";
    if (!String(channel).trim()) {
      toast("Kanalni kiriting");
      return;
    }
    showPreloader("Kanal saqlanmoqda…");
    try {
      const data = await api("/api/admin/contest", {
        method: "POST",
        body: JSON.stringify({ channel }),
      });
      if (data.ok) {
        toast("Kanal saqlandi");
        await loadContestSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("testModeOnBtn")?.addEventListener("click", async () => {
    if (
      !confirm(
        "Test rejimni yoqasizmi?\nBot faqat test Telegram ID lar uchun ishlaydi, qolganlar uchun to‘xtaydi."
      )
    ) {
      return;
    }
    showPreloader("Test rejim yoqilmoqda…");
    try {
      const data = await api("/api/admin/test-mode", {
        method: "POST",
        body: JSON.stringify({ enabled: true }),
      });
      if (data.ok) {
        toast("Test rejim yoqildi");
        await loadTestModeSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("testModeOffBtn")?.addEventListener("click", async () => {
    if (!confirm("Test rejimni o‘chirib, botni hammaga ochasizmi?")) return;
    showPreloader("Test rejim o‘chirilmoqda…");
    try {
      const data = await api("/api/admin/test-mode", {
        method: "POST",
        body: JSON.stringify({ enabled: false }),
      });
      if (data.ok) {
        toast("Test rejim o‘chirildi — bot ochiq");
        await loadTestModeSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("testUserAddBtn")?.addEventListener("click", async () => {
    const raw = document.getElementById("testUserIdInput")?.value.trim() || "";
    const note = document.getElementById("testUserNoteInput")?.value.trim() || "";
    if (!/^\d{5,15}$/.test(raw)) {
      toast("To‘g‘ri Telegram ID kiriting");
      return;
    }
    showPreloader("Qo‘shilmoqda…");
    try {
      const data = await api("/api/admin/test-users", {
        method: "POST",
        body: JSON.stringify({ telegram_id: Number(raw), note }),
      });
      if (data.ok) {
        toast("Test user qo‘shildi");
        const idInput = document.getElementById("testUserIdInput");
        const noteInput = document.getElementById("testUserNoteInput");
        if (idInput) idInput.value = "";
        if (noteInput) noteInput.value = "";
        await loadTestModeSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("testUsersTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-test-user-del]");
    if (!btn) return;
    const tid = btn.dataset.testUserDel;
    if (!confirm(`Test user ${tid} ni olib tashlaysizmi?`)) return;
    showPreloader("O‘chirilmoqda…");
    try {
      const data = await api(`/api/admin/test-users/${tid}`, { method: "DELETE" });
      if (data.ok) {
        toast("O‘chirildi");
        await loadTestModeSettings();
      } else toast(data.error || "Xatolik");
    } catch (_) {
      toast("Xatolik");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("broadcastMode")?.addEventListener("change", syncBroadcastModeUi);
  document.getElementById("broadcastPickImg")?.addEventListener("click", () => {
    document.getElementById("broadcastImgInput")?.click();
  });
  document.getElementById("broadcastImgInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showPreloader("Rasm yuklanmoqda…");
    try {
      broadcastImageUrl = await uploadAdminReceipt(file);
      const preview = document.getElementById("broadcastImgPreview");
      if (preview) {
        preview.src = broadcastImageUrl;
        preview.hidden = false;
      }
      const placeholder = document.getElementById("broadcastImgPlaceholder");
      if (placeholder) placeholder.hidden = true;
      const clearBtn = document.getElementById("broadcastClearImg");
      if (clearBtn) clearBtn.hidden = false;
      toast("Rasm yuklandi");
    } catch (_) {
      broadcastImageUrl = null;
      toast("Rasm yuklanmadi");
    } finally {
      hidePreloader();
    }
  });
  document.getElementById("broadcastClearImg")?.addEventListener("click", () => {
    broadcastImageUrl = null;
    const preview = document.getElementById("broadcastImgPreview");
    const placeholder = document.getElementById("broadcastImgPlaceholder");
    const clearBtn = document.getElementById("broadcastClearImg");
    const input = document.getElementById("broadcastImgInput");
    if (preview) {
      preview.src = "";
      preview.hidden = true;
    }
    if (placeholder) placeholder.hidden = false;
    if (clearBtn) clearBtn.hidden = true;
    if (input) input.value = "";
  });
  document.getElementById("broadcastSendBtn")?.addEventListener("click", sendBroadcast);
  document.getElementById("refreshBroadcastsBtn")?.addEventListener("click", loadBroadcasts);
  document.getElementById("broadcastsTableBody")?.addEventListener("click", async (e) => {
    const stopBtn = e.target.closest("[data-broadcast-stop]");
    const delBtn = e.target.closest("[data-broadcast-del]");
    if (stopBtn) {
      showPreloader("To‘xtatilmoqda…");
      try {
        await api(`/api/admin/broadcasts/${stopBtn.dataset.broadcastStop}/stop`, {
          method: "POST",
          body: "{}",
        });
        toast("Avto yuborish to‘xtatildi");
        await loadBroadcasts();
      } catch (_) {
        toast("Xatolik");
      } finally {
        hidePreloader();
      }
    }
    if (delBtn) {
      if (!confirm("Bu xabarni o‘chirasizmi?")) return;
      showPreloader("O‘chirilmoqda…");
      try {
        await api(`/api/admin/broadcasts/${delBtn.dataset.broadcastDel}`, {
          method: "DELETE",
        });
        toast("O‘chirildi");
        await loadBroadcasts();
      } catch (_) {
        toast("Xatolik");
      } finally {
        hidePreloader();
      }
    }
  });

  setInterval(refresh, 30000);
}

init();
