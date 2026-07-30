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

let currentStatus = "progress";
let currentTx = null;
let cancelMode = false;
let approveMode = false;
let adminReceiptUrl = null;
let refreshing = false;

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
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
}

function badge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
}

function fmt(n) {
  return Number(n).toLocaleString("ru-RU").replace(/,/g, " ");
}

async function api(path, options = {}) {
  const id = adminId();
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${path}${sep}tg_id=${id}`, {
    ...options,
    headers: { ...API_HEADERS, ...(options.headers || {}) },
  });
  if (res.status === 403) throw new Error("forbidden");
  return res.json();
}

async function loadSummary() {
  const data = await api("/api/admin/summary");
  if (!data.ok) return;
  document.getElementById("statToday").textContent = data.summary.today;
  document.getElementById("statProgress").textContent = data.summary.progress;
  document.getElementById("statDone").textContent = data.summary.done;
  document.getElementById("statCancelled").textContent = data.summary.cancelled;
}

async function loadList() {
  const query = currentStatus ? `/api/admin/tx?status=${currentStatus}` : "/api/admin/tx";
  const data = await api(query);
  if (!data.ok) return;
  const list = document.getElementById("txList");
  const seen = new Set();
  const unique = [];
  for (const x of data.transactions || []) {
    if (!x.tx_id || seen.has(x.tx_id)) continue;
    seen.add(x.tx_id);
    unique.push(x);
  }
  if (!unique.length) {
    list.innerHTML = `<div class="tx-empty">Bu bo'limda tranzaksiyalar yo'q</div>`;
    return;
  }
  list.innerHTML = unique
    .map((x) => {
      const name = `${x.first_name || ""} ${x.last_name || ""}`.trim() || "Noma'lum";
      return `
        <button class="tx-card" type="button" data-tx="${x.tx_id}">
          <span class="tx-avatar">${initials(name)}</span>
          <span class="tx-info">
            <b>${name}</b>
            <span>${x.tx_id} · ${x.created_at}</span>
          </span>
          <span class="tx-sum">
            <b>${fmt(x.cny)} CNY</b>
            <span>${fmt(x.uzs)} UZS</span><br>
            ${badge(x.status)}
          </span>
        </button>`;
    })
    .join("");
}

async function refresh() {
  if (refreshing) return;
  if (!document.getElementById("detailSheet").hidden) {
    await loadSummary();
    return;
  }
  refreshing = true;
  try {
    await Promise.all([loadSummary(), loadList()]);
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

async function openDetail(txId) {
  const data = await api(`/api/admin/tx/${txId}`);
  if (!data.ok) return;
  currentTx = data.tx;
  cancelMode = false;
  approveMode = false;
  resetApproveForm();
  renderDetail();
  document.getElementById("detailSheet").hidden = false;
}

function renderDetail() {
  const x = currentTx;
  const name = `${x.user.first_name || ""} ${x.user.last_name || ""}`.trim() || "Noma'lum";
  const username = x.user.username ? `@${x.user.username}` : "—";
  document.getElementById("detailBody").innerHTML = `
    <div class="rows">
      <div class="row"><span>ID</span><b>${x.tx_id}</b></div>
      <div class="row"><span>Foydalanuvchi</span><b>${name}</b></div>
      <div class="row"><span>Telegram</span><b>${username}</b></div>
      <div class="row"><span>Telefon</span><b>${x.user.phone || "—"}</b></div>
      <div class="row"><span>Summasi</span><b>${fmt(x.cny)} CNY</b></div>
      <div class="row"><span>To'langan</span><b>${fmt(x.uzs)} UZS</b></div>
      <div class="row"><span>Karta</span><b>${x.card || "—"}</b></div>
      <div class="row"><span>Vaqt</span><b>${x.created_at}</b></div>
      <div class="row"><span>Holat</span><b>${badge(x.status)}</b></div>
      ${x.reason ? `<div class="row"><span>Sabab</span><b>${x.reason}</b></div>` : ""}
    </div>
    <div class="proofs">
      <button class="proof" type="button" data-image="${x.receipt || ""}" ${x.receipt ? "" : "disabled"}>
        ${x.receipt ? `<img src="${x.receipt}" alt="Chek" /><span>To'lov cheki</span>` : `<div class="proof-missing">📷</div><span>Chek yuklanmagan</span>`}
      </button>
      <button class="proof" type="button" data-image="${x.qr || ""}" ${x.qr ? "" : "disabled"}>
        ${x.qr ? `<img src="${x.qr}" alt="QR" /><span>Alipay QR</span>` : `<div class="proof-missing">▣</div><span>QR yuklanmagan</span>`}
      </button>
    </div>
    ${
      x.admin_receipt
        ? `<div class="proofs"><button class="proof" type="button" data-image="${x.admin_receipt}" style="grid-column:1/-1">
            <img src="${x.admin_receipt}" alt="Yuan" /><span>Yuan o'tkazma cheki</span>
          </button></div>`
        : ""
    }`;

  document.getElementById("cancelForm").hidden = !cancelMode;
  document.getElementById("approveForm").hidden = !approveMode;

  const actions = document.getElementById("detailActions");
  if (x.status !== "progress") {
    actions.innerHTML = `<button class="btn btn-ghost" type="button" id="closeBtn2">Yopish</button>`;
    document.getElementById("closeBtn2").onclick = closeDetail;
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
      <button class="btn btn-approve" type="button" id="confirmApproveBtn">✅ Tasdiqlash</button>`;
    document.getElementById("backBtn").onclick = () => {
      approveMode = false;
      resetApproveForm();
      renderDetail();
    };
    document.getElementById("confirmApproveBtn").onclick = doApprove;
  } else {
    actions.innerHTML = `
      <button class="btn btn-cancel" type="button" id="cancelBtn">❌ Bekor qilish</button>
      <button class="btn btn-approve" type="button" id="approveBtn">✅ Tasdiqlash</button>`;
    document.getElementById("cancelBtn").onclick = () => {
      cancelMode = true;
      approveMode = false;
      renderDetail();
      document.getElementById("cancelReason").focus();
    };
    document.getElementById("approveBtn").onclick = () => {
      approveMode = true;
      cancelMode = false;
      renderDetail();
    };
  }
}

function closeDetail() {
  document.getElementById("detailSheet").hidden = true;
  document.getElementById("cancelReason").value = "";
  resetApproveForm();
  cancelMode = false;
  approveMode = false;
  currentTx = null;
}

async function uploadAdminReceipt(file) {
  const form = new FormData();
  form.append("tg_id", String(adminId()));
  form.append("file", file, file.name || "admin-receipt.jpg");
  const res = await fetch(`/api/upload?tg_id=${adminId()}`, {
    method: "POST",
    headers: { "ngrok-skip-browser-warning": "true" },
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
      closeDetail();
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
      closeDetail();
      await refresh();
    }
  } catch (_) {
    toast("Xatolik yuz berdi");
  } finally {
    hidePreloader();
  }
}

async function init() {
  if (!adminId()) {
    document.getElementById("deniedView").hidden = false;
    return;
  }
  try {
    const me = await api("/api/admin/me");
    if (!me.ok || (me.role !== "admin" && me.role !== "super")) {
      document.getElementById("deniedView").hidden = false;
      return;
    }
    await refresh();
    document.getElementById("panelView").hidden = false;
  } catch (_) {
    document.getElementById("deniedView").hidden = false;
    return;
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      currentStatus = btn.dataset.status;
      loadList();
    });
  });

  document.getElementById("txList").addEventListener("click", (e) => {
    const card = e.target.closest("[data-tx]");
    if (card) openDetail(card.dataset.tx);
  });

  document.getElementById("refreshBtn").addEventListener("click", async () => {
    showPreloader("Yangilanmoqda…");
    try {
      refreshing = false;
      document.getElementById("detailSheet").hidden = true;
      await refresh();
      toast("Yangilandi");
    } finally {
      hidePreloader();
    }
  });

  document.getElementById("closeDetailBtn").addEventListener("click", closeDetail);
  document.getElementById("detailSheet").addEventListener("click", (e) => {
    if (e.target.id === "detailSheet") closeDetail();
  });

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
  document.getElementById("imageViewer").addEventListener("click", () => {
    document.getElementById("imageViewer").hidden = true;
  });

  setInterval(refresh, 30000);
}

init();
