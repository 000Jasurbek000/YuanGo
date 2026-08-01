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
  admins: "Adminlar",
  reviews: "Sharhlar",
  cards: "Karta va hisoblar",
  qrs: "QR kodlar",
  settings: "Sozlamalar",
  messages: "Xabarlar",
  stats: "Statistika",
};

let currentStatus = "progress";
let allTxStatus = "";
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
  if (page === "admins") loadAdmins();
  if (page === "reviews") loadReviews();
  if (page === "transactions") loadAllTxTable();
  if (page === "cards") loadCards();
  if (page === "settings") loadSettings();
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
  const tbody = document.getElementById("usersTableBody");
  if (!data.users?.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#64748b">Foydalanuvchilar yo'q</td></tr>`;
    return;
  }
  tbody.innerHTML = data.users
    .map((u) => {
      const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—";
      const role = u.is_super_admin ? "👑" : u.is_admin ? "🛡" : "—";
      return `
        <tr>
          <td><b>#${u.unique_id || "—"}</b></td>
          <td>${name}</td>
          <td>${u.username ? "@" + u.username : "—"}</td>
          <td>${u.phone || "—"}</td>
          <td>${(u.lang || "uz").toUpperCase()}</td>
          <td>${u.registered ? "✓" : "—"}</td>
          <td>${u.updated_at || u.created_at || "—"}</td>
          <td>${role}</td>
        </tr>`;
    })
    .join("");
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

  setInterval(refresh, 30000);
}

init();
