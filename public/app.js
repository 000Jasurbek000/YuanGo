const tg = window.Telegram?.WebApp;
let RATE = 1840;
let rateStatsDays = 7;
let MIN_CNY = 30;
let MAX_CNY = 500;
let WORK_HOURS = "07:00–23:00";
let COMMISSION = "0%";
let paymentCards = [];
let publicReviews = [];
let reviewCarouselIndex = 0;
let reviewCarouselTimer = null;
const STORAGE_KEY = "yuan_exchange_v8";
const PROMO_WELCOME_KEY = "yuan_promo_welcome_seen";
const PROMO_MIN_CNY = 50;
const PROMO_BONUS_CNY = 5;
const DEMO_TX_IDS = [];
let promoDetailsReturnTo = "home";

const I18N = { uz: {}, ru: {}, en: {} };

async function loadI18n() {
  const langs = ["uz", "ru", "en"];
  await Promise.all(
    langs.map(async (lang) => {
      const res = await fetch(`/i18n/${lang}.json?v=3`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) throw new Error(`i18n ${lang}: ${res.status}`);
      I18N[lang] = await res.json();
    })
  );
}

const state = loadState();
let activeQrId = null;
let pendingQrImage = null;
let qrEditorMode = "add";
let publicPurchases = [];

function defaultState() {
  return {
    theme: "light",
    lang: "uz",
    notifications: true,
    avatarDataUrl: null,
    profileFirstName: "",
    profileLastName: "",
    phone: "",
    uniqueId: "",
    selectedCard: null,
    selectedQr: null,
    receiptDataUrl: null,
    note: "",
    amount: 100,
    txFilter: "all",
    currentTxId: null,
    pendingTransactionId: null,
    pendingCreatedAt: null,
    readNotificationIds: [],
    qrs: [],
    transactions: [],
  };
}

function loadState() {
  const base = defaultState();
  try {
    [
      "yuan_exchange_v1",
      "yuan_exchange_v2",
      "yuan_exchange_v3",
      "yuan_exchange_v4",
      "yuan_exchange_v5",
      "yuan_exchange_v6",
    ].forEach((key) => localStorage.removeItem(key));
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = { ...base, ...JSON.parse(raw) };
    parsed.transactions = (parsed.transactions || []).filter(
      (tx) => tx?.id && !DEMO_TX_IDS.includes(tx.id)
    );
    // Default/bo'sh QR larni olib tashlash — faqat haqiqiy rasmlilar qoladi
    parsed.qrs = (parsed.qrs || []).filter(
      (qr) =>
        qr?.id &&
        qr?.title &&
        qr?.dataUrl &&
        !String(qr.dataUrl).includes("demo-qr")
    );
    if (!parsed.qrs.some((qr) => qr.id === parsed.selectedQr)) {
      parsed.selectedQr = parsed.qrs[0]?.id || null;
    }
    if (!parsed.theme) parsed.theme = "light";
    return parsed;
  } catch (_) {
    return base;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Xotira to'lib qolsa ilova ishlashda davom etadi (ma'lumot serverda saqlanadi)
    console.warn("[YuanGo] localStorage saqlash xatosi:", err);
  }
}

function t(key) {
  return I18N[state.lang]?.[key] || I18N.uz[key] || key;
}

function locale() {
  return { uz: "uz-UZ", ru: "ru-RU", en: "en-US" }[state.lang] || "uz-UZ";
}

function formatNumber(n) {
  return Math.round(n).toLocaleString(locale());
}

function formatDate(iso) {
  const value = String(iso || "").includes("T")
    ? iso
    : String(iso || "").replace(" ", "T");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(iso || "");
  return date.toLocaleString(locale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1800);
}

function openReceiptImage(src) {
  let viewer = document.getElementById("receiptViewer");
  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "receiptViewer";
    viewer.className = "receipt-viewer";
    viewer.innerHTML = `
      <button class="receipt-viewer-close" type="button" aria-label="Close">✕</button>
      <img alt="Receipt">
    `;
    document.body.appendChild(viewer);
    viewer.addEventListener("click", (event) => {
      if (event.target === viewer || event.target.closest(".receipt-viewer-close")) {
        viewer.classList.remove("open");
      }
    });
  }
  viewer.querySelector("img").src = src;
  viewer.classList.add("open");
}

function haptic(type = "light") {
  try {
    if (type === "success") tg?.HapticFeedback?.notificationOccurred("success");
    else tg?.HapticFeedback?.impactOccurred(type);
  } catch (_) {}
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  document.querySelectorAll("[data-theme-pick]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themePick === state.theme);
  });
  const color = state.theme === "light" ? "#f4f7fb" : "#070b12";
  const homeThemeIcon = document.getElementById("homeThemeIcon");
  if (homeThemeIcon) homeThemeIcon.textContent = state.theme === "light" ? "☀" : "☾";
  try {
    tg?.setHeaderColor?.(color);
    tg?.setBackgroundColor?.(color);
  } catch (_) {}
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });
  const langValue = document.getElementById("langValue");
  if (langValue) langValue.textContent = t(`lang.${state.lang}`);
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === state.lang);
  });
  document.documentElement.lang = state.lang;
}

function go(screen) {
  const prev = document.querySelector(".screen.active")?.dataset.screen;
  if (prev === "promo-welcome" && screen !== "promo-welcome") {
    markPromoWelcomeSeen();
  }
  if (screen === "promo-details") {
    if (prev && prev !== "promo-details") promoDetailsReturnTo = prev;
  }

  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const target = document.querySelector(`[data-screen="${screen}"]`);
  if (target) target.classList.add("active");

  const tabScreens = ["home", "transactions", "buy", "qrs", "referrals", "profile"];
  document.querySelectorAll(".tab-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === screen);
  });
  document.getElementById("tabbar").style.display = tabScreens.includes(screen)
    ? "grid"
    : "none";

  if (screen === "home") renderHome();
  if (screen === "rate-stats") loadRateStats(rateStatsDays);
  if (screen === "transactions") renderTransactions();
  if (screen === "purchases") renderAllPurchases();
  if (screen === "qrs") renderQrs();
  if (screen === "qr-select") renderQrSelection();
  if (screen === "notifications") renderNotifications();
  if (screen === "tx-detail") renderTxDetail();
  if (screen === "confirm") renderConfirm();
  if (screen === "buy") {
    updateBuyCalc();
    renderPaymentCards();
    updatePromoUi();
  }
  if (screen === "profile") renderProfile();
  if (screen === "stats") renderStats();
  if (screen === "settings") renderSettings();
  window.scrollTo(0, 0);
}

function isFirstPurchaseEligible() {
  return !state.transactions.some((x) => x.status === "done");
}

function markPromoWelcomeSeen() {
  try {
    localStorage.setItem(PROMO_WELCOME_KEY, "1");
  } catch (_) {}
}

function shouldShowPromoWelcome() {
  try {
    return !localStorage.getItem(PROMO_WELCOME_KEY);
  } catch (_) {
    return true;
  }
}

function updatePromoUi() {
  const eligible = isFirstPurchaseEligible();
  const banner = document.getElementById("homePromoBanner");
  if (banner) banner.hidden = !eligible;

  const notice = document.getElementById("buyPromoNotice");
  if (notice) {
    const amount = Number(document.getElementById("cnyAmount")?.value) || 0;
    notice.hidden = !(eligible && amount >= PROMO_MIN_CNY);
  }
}

function cardLabel(key) {
  const card = paymentCards.find((c) => String(c.id) === String(key));
  if (!card) return "—";
  return card.title || String(card.brand || "").toUpperCase();
}

function ownerInitials(name) {
  const parts = String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "—";
  return parts.map((w) => w.charAt(0).toUpperCase()).join(".") + ".";
}

function renderPaymentCards() {
  const list = document.getElementById("cardList");
  if (!list) return;
  if (!paymentCards.length) {
    list.innerHTML = `<p class="hint-text">Hozircha faol karta yo‘q</p>`;
    return;
  }
  if (!state.selectedCard || !paymentCards.some((c) => String(c.id) === String(state.selectedCard))) {
    state.selectedCard = paymentCards[0].id;
  }
  list.innerHTML = paymentCards
    .map((card) => {
      const selected = String(card.id) === String(state.selectedCard);
      const brandClass =
        card.brand === "humo" ? "pay-card-humo" : card.brand === "visa" ? "pay-card-visa" : "pay-card-uzcard";
      const digits = String(card.number || "").replace(/\D/g, "");
      const canCopy = digits.length >= 12;
      const displayNumber =
        card.masked ||
        (digits.length >= 8 ? `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}` : card.number || "");
      return `
        <div class="pay-card ${brandClass} ${selected ? "selected" : ""}" data-card="${card.id}" role="button" tabindex="0" aria-pressed="${selected}">
          <div class="pay-card-top">
            <span class="pay-card-brand">${(card.brand || "").toUpperCase()}</span>
            <span class="pay-card-choice"><i></i><b>${selected ? "Tanlangan" : "Tanlash"}</b></span>
          </div>
          <div class="pay-card-chip-row">
            <span class="bank-chip" aria-hidden="true"></span>
            <span class="contactless" aria-hidden="true">)))</span>
          </div>
          <p class="pay-card-title-line">${escapeHtml(card.title || "")}</p>
          <p class="pay-card-number">${escapeHtml(displayNumber)}</p>
          <div class="pay-card-bottom">
            <div>
              <small>KARTA EGASI</small>
              <strong>${escapeHtml(ownerInitials(card.owner_name))}</strong>
            </div>
            <div>
              <small>AMAL QILISH</small>
              <strong>**/**</strong>
            </div>
            <button class="pay-card-copy" type="button" data-copy="${canCopy ? digits : ""}" ${canCopy ? "" : "disabled"}>
              <span class="pay-card-copy-ico" aria-hidden="true">⧉</span>
              <span class="pay-card-copy-label">${t("card.copy")}</span>
            </button>
          </div>
        </div>`;
    })
    .join("");
}

function updateBuyCalc() {
  const input = document.getElementById("cnyAmount");
  const amount = Number(input.value) || 0;
  state.amount = amount;
  document.getElementById("uzsTotal").textContent = `${formatNumber(amount * RATE)} UZS`;
  document.getElementById("buyRate").textContent = `${formatNumber(RATE)} UZS`;
  const feeEl = document.getElementById("buyCommission");
  if (feeEl) feeEl.textContent = COMMISSION;
  updatePromoUi();
}

function amountInvalidText() {
  if (state.lang === "ru") {
    return `Такая сумма недоступна. Минимум ${MIN_CNY} CNY, максимум ${MAX_CNY} CNY.`;
  }
  if (state.lang === "en") {
    return `This amount is not allowed. Minimum ${MIN_CNY} CNY, maximum ${MAX_CNY} CNY.`;
  }
  return `Bunday miqdor mumkin emas. Eng kam ${MIN_CNY} CNY, eng ko‘p ${MAX_CNY} CNY.`;
}

function validateAmount(showError = true) {
  const input = document.getElementById("cnyAmount");
  const error = document.getElementById("amountError");
  const amount = Number(input.value);
  const valid = Number.isFinite(amount) && amount >= MIN_CNY && amount <= MAX_CNY;
  error.textContent = amountInvalidText();
  error.hidden = valid || !showError;
  input.classList.toggle("invalid", !valid && showError);
  return valid;
}

function prepareTransactionMeta() {
  if (!state.pendingTransactionId) {
    // Tasodifiy ID — turli foydalanuvchilarda to'qnashmasligi uchun
    state.pendingTransactionId = `TX${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
  }
  if (!state.pendingCreatedAt) {
    state.pendingCreatedAt = new Date().toISOString();
  }
  saveState();
}

function renderConfirm() {
  prepareTransactionMeta();
  const selectedQr = state.qrs.find((qr) => qr.id === state.selectedQr);
  document.getElementById("confirmTxId").textContent = state.pendingTransactionId;
  document.getElementById("confirmDate").textContent = formatDate(state.pendingCreatedAt);
  document.getElementById("confirmCny").textContent = `${formatNumber(state.amount)} CNY`;
  document.getElementById("confirmUzs").textContent = `${formatNumber(state.amount * RATE)} UZS`;
  document.getElementById("confirmCard").textContent = cardLabel(state.selectedCard);
  document.getElementById("confirmReceiptImage").src =
    state.receiptDataUrl || "";
  document.getElementById("confirmQrImage").src =
    selectedQr?.dataUrl || "";
  document
    .querySelector('[data-confirm-image="receipt"] span')
    .replaceChildren(t("proof.payment"));
  document
    .querySelector('[data-confirm-image="qr"] span')
    .replaceChildren(t("proof.alipay"));
}

function statusBadge(status) {
  const map = {
    progress: ["progress", "status.progress"],
    done: ["done", "status.done"],
    cancelled: ["cancelled", "status.cancelled"],
  };
  const [cls, key] = map[status] || ["progress", "status.progress"];
  return `<span class="badge ${cls}">${t(key)}</span>`;
}

function shortName(firstName, lastName) {
  if (!lastName) return firstName;
  return `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
}

function formatPurchaseTime(date) {
  return date.toLocaleString(locale(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function publicPurchaseList() {
  return publicPurchases.map((p) => {
    const first = p.first_name || "Foydalanuvchi";
    const last = p.last_name || "";
    return {
      first,
      last,
      amount: p.cny,
      createdAt: p.created_at,
      avatar: `${first.charAt(0)}${(last.charAt(0) || "").toUpperCase()}`.toUpperCase() || "YG",
    };
  });
}

function purchaseListMarkup(purchases) {
  if (!purchases.length) {
    return `<p class="hint-text">${t("home.noTx")}</p>`;
  }
  return purchases
    .map(
      (purchase, index) => `
      <div class="purchase-item">
        <div class="purchase-avatar ${["a", "b", "c"][index % 3]}">${purchase.avatar}</div>
        <div class="purchase-main">
          <strong>${shortName(purchase.first, purchase.last)}</strong>
          <p><span class="purchase-currency-icon">¥</span> ${formatNumber(purchase.amount)} CNY</p>
        </div>
        <div class="purchase-side">
          <span class="success-label">✓ ${t("home.success")}</span>
          <time>${
            purchase.createdAt
              ? formatDate(purchase.createdAt)
              : formatPurchaseTime(new Date(Date.now() - (purchase.minutesAgo || 0) * 60000))
          }</time>
        </div>
      </div>`
    )
    .join("");
}

function renderHome() {
  const user = tg?.initDataUnsafe?.user;
  const firstName = state.profileFirstName || user?.first_name || t("user.default");
  const lastName = state.profileLastName || user?.last_name || "";
  const displayName = shortName(firstName, lastName);
  document.getElementById("homeUserName").textContent = displayName;

  const homeImg = document.getElementById("homeAvatarImg");
  const homeText = document.getElementById("homeAvatarText");
  if (state.avatarDataUrl) {
    homeImg.src = state.avatarDataUrl;
    homeImg.hidden = false;
    homeText.hidden = true;
  } else {
    homeImg.hidden = true;
    homeText.hidden = false;
    homeText.textContent = `${firstName.charAt(0)}${(lastName.charAt(0) || firstName.charAt(1) || "Y").toUpperCase()}`.toUpperCase();
  }

  document.getElementById("rateUpdatedAt").textContent = new Date().toLocaleTimeString(locale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
  const rateEl = document.getElementById("rateValue");
  if (rateEl) rateEl.textContent = formatNumber(RATE);
  const minEl = document.getElementById("homeMinCny");
  if (minEl) minEl.textContent = `${MIN_CNY} CNY`;
  const maxEl = document.getElementById("homeMaxCny");
  if (maxEl) maxEl.textContent = `${MAX_CNY} CNY`;
  const feeEl = document.getElementById("homeCommission");
  if (feeEl) feeEl.textContent = COMMISSION;
  const hoursEl = document.getElementById("homeWorkHours");
  if (hoursEl) hoursEl.textContent = WORK_HOURS;

  document.getElementById("homePurchaseList").innerHTML = purchaseListMarkup(
    publicPurchaseList().slice(0, 5)
  );
  renderNotificationBadge();
  updatePromoUi();
}

function renderAllPurchases() {
  document.getElementById("allPurchaseList").innerHTML = purchaseListMarkup(publicPurchaseList());
}

function renderTransactions() {
  const list = document.getElementById("txList");
  document.querySelectorAll("#txTabs .tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.filter === state.txFilter);
  });
  const items = state.transactions.filter(
    (txItem) => state.txFilter === "all" || txItem.status === state.txFilter
  );
  if (!items.length) {
    list.innerHTML = `<p class="hint-text">${t("home.noTx")}</p>`;
    return;
  }
  list.innerHTML = items
    .map(
      (txItem) => `
      <button class="tx-item" type="button" data-open-tx="${txItem.id}">
        <div class="tx-top">
          <strong>${txItem.id}</strong>
          ${statusBadge(txItem.status)}
        </div>
        <div class="tx-top">
          <span class="muted">${formatDate(txItem.createdAt)}</span>
          <strong>${formatNumber(txItem.uzs)} UZS</strong>
        </div>
      </button>`
    )
    .join("");
}

function notificationTransactions() {
  return state.transactions
    .filter((transaction) => ["done", "cancelled"].includes(transaction.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function notificationKey(transaction) {
  return `${transaction.status}:${transaction.id}`;
}

function isNotificationRead(transaction) {
  return (state.readNotificationIds || []).includes(notificationKey(transaction));
}

function renderNotificationBadge() {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;
  const count = notificationTransactions().filter((transaction) => !isNotificationRead(transaction)).length;
  badge.textContent = count > 9 ? "9+" : String(count);
  badge.hidden = !count || state.notifications === false;
}

function renderNotifications() {
  const list = document.getElementById("notificationList");
  const items = notificationTransactions();
  renderNotificationBadge();
  if (!items.length) {
    list.innerHTML = `<div class="notification-empty">♢<p>${t("notifications.empty")}</p></div>`;
    return;
  }
  const markup = (group) => group
    .map((transaction) => {
      const approved = transaction.status === "done";
      const read = isNotificationRead(transaction);
      return `
        <button class="notification-item ${approved ? "approved" : "cancelled"} ${read ? "is-read" : "is-unread"}" type="button" data-notification-tx="${transaction.id}">
          <span class="notification-status-icon">${approved ? "✓" : "✕"}</span>
          <span class="notification-copy">
            <strong>${t(approved ? "notifications.approved" : "notifications.cancelled")}</strong>
            <small>${t(
              approved ? "notifications.approvedText" : "notifications.cancelledText"
            )}</small>
            <time>${formatDate(transaction.createdAt)} · ${transaction.id}</time>
          </span>
          <b>›</b>
        </button>
      `;
    })
    .join("");
  const unread = items.filter((transaction) => !isNotificationRead(transaction));
  const read = items.filter(isNotificationRead);
  list.innerHTML = `
    ${unread.length ? `<section class="notification-group"><h2>${t("notifications.new")} <span>${unread.length}</span></h2>${markup(unread)}</section>` : ""}
    ${read.length ? `<section class="notification-group"><h2>${t("notifications.read")}</h2>${markup(read)}</section>` : ""}
  `;
}

function renderTxDetail() {
  const txItem =
    state.transactions.find((x) => x.id === state.currentTxId) ||
    state.transactions.find((x) => x.status === "progress") ||
    state.transactions[0];
  if (!txItem) return;
  state.currentTxId = txItem.id;
  const statusPanel = document.getElementById("txStatusPanel");
  const statusIcon = document.getElementById("txStatusIcon");
  const statusTitle = document.getElementById("txStatusTitle");
  const statusMessage = document.getElementById("txStatusMessage");
  const receipt = document.getElementById("txReceipt");

  statusPanel.hidden = txItem.status === "done";
  statusPanel.className = `transaction-status-card ${txItem.status}`;
  if (txItem.status === "cancelled") {
    statusIcon.textContent = "✕";
    statusTitle.textContent = t("transaction.cancelledTitle");
    statusMessage.textContent = t("transaction.cancelledMessage");
  } else if (txItem.status === "done") {
    statusIcon.textContent = "✓";
    statusTitle.textContent = t("transaction.doneTitle");
    statusMessage.textContent = t("transaction.doneMessage");
  } else {
    statusIcon.textContent = "◷";
    statusTitle.textContent = t("transaction.progressTitle");
    statusMessage.textContent = t("transaction.progressMessage");
  }

  const detailCard = document.getElementById("txDetailCard");
  detailCard.hidden = txItem.status === "done";
  detailCard.innerHTML = `
    <div class="row"><span>ID</span><strong>${txItem.id}</strong></div>
    <div class="row"><span>Status</span><strong>${statusBadge(txItem.status)}</strong></div>
    <div class="row"><span>Vaqt</span><strong>${formatDate(txItem.createdAt)}</strong></div>
    <div class="row"><span>CNY</span><strong>${formatNumber(txItem.cny)} CNY</strong></div>
    <div class="row"><span>UZS</span><strong>${formatNumber(txItem.uzs)} UZS</strong></div>
    <div class="row"><span>Karta</span><strong>${txItem.card}</strong></div>
    ${
      txItem.status === "cancelled"
        ? `<div class="row reason-row"><span>${t("transaction.cancelReason")}</span><strong>${txItem.cancelReason || t("transaction.cancelReasonValue")}</strong></div>`
        : ""
    }
  `;

  receipt.hidden = txItem.status !== "done";
  if (txItem.status === "done") {
    const paymentReceipt = txItem.paymentReceiptUrl || txItem.receiptUrl || "";
    const qrImage = txItem.qrImageUrl || "";
    const adminReceipt = txItem.adminReceiptUrl || "";
    receipt.innerHTML = `
      <div class="receipt-head">
        <div class="receipt-check">✓</div>
        <div>
          <span>${t("transaction.receipt")}</span>
          <strong>Yuan Go</strong>
        </div>
      </div>
      ${
        adminReceipt
          ? `<button class="receipt-image-button receipt-image-main" type="button" data-receipt-image="${adminReceipt}">
              <img src="${adminReceipt}" alt="${t("proof.yuan")}">
              <span>⌕ ${t("proof.yuan")}</span>
            </button>`
          : ""
      }
      <div class="transaction-proof-grid">
        ${
          paymentReceipt
            ? `<button class="receipt-image-button" type="button" data-receipt-image="${paymentReceipt}">
                <img src="${paymentReceipt}" alt="${t("proof.payment")}">
                <span>⌕ ${t("proof.payment")}</span>
              </button>`
            : `<div class="receipt-image-button is-empty"><span>${t("qr.noImage")}</span></div>`
        }
        ${
          qrImage
            ? `<button class="receipt-image-button" type="button" data-receipt-image="${qrImage}">
                <img src="${qrImage}" alt="${t("proof.alipay")}">
                <span>⌕ ${t("proof.alipay")}</span>
              </button>`
            : `<div class="receipt-image-button is-empty"><span>${t("qr.noImage")}</span></div>`
        }
      </div>
      <div class="receipt-line"><span>ID</span><strong>${txItem.id}</strong></div>
      <div class="receipt-line"><span>UZS</span><strong>${formatNumber(txItem.uzs)} UZS</strong></div>
      <div class="receipt-line"><span>CNY</span><strong>${formatNumber(txItem.cny)} CNY</strong></div>
      <div class="receipt-line"><span>Karta</span><strong>${txItem.card}</strong></div>
      <div class="receipt-line"><span>Muddat</span><strong>${formatDate(txItem.createdAt)}</strong></div>
    `;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function closeQrActions() {
  document.getElementById("qrActionSheet").hidden = true;
}

function closeQrEditor() {
  document.getElementById("qrEditorSheet").hidden = true;
  document.getElementById("qrImageInput").value = "";
  pendingQrImage = null;
}

function openQrEditor(mode, qr = null) {
  qrEditorMode = mode;
  activeQrId = qr?.id || null;
  pendingQrImage = qr?.dataUrl || null;
  document.getElementById("qrNameInput").value = qr?.title || "";
  const preview = document.getElementById("qrEditorPreview");
  if (pendingQrImage) {
    preview.src = pendingQrImage;
    preview.hidden = false;
  } else {
    preview.removeAttribute("src");
    preview.hidden = true;
  }
  document.getElementById("qrEditorSheet").hidden = false;
  setTimeout(() => document.getElementById("qrNameInput").focus(), 100);
}

function openQrActions(id) {
  const qr = state.qrs.find((item) => item.id === id);
  if (!qr) return;
  activeQrId = id;
  document.getElementById("qrActionTitle").textContent = qr.title;
  document.getElementById("qrActionSheet").hidden = false;
}

function renderQrs() {
  const list = document.getElementById("qrList");
  if (!state.qrs.length) {
    list.innerHTML = `<p class="hint-text">${t("qr.listEmpty")}</p>`;
  } else {
    list.innerHTML = state.qrs
      .map(
        (q) => `
      <div class="qr-item">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="qr-thumb">${
            q.dataUrl
              ? `<img src="${q.dataUrl}" alt="">`
              : `<span class="qr-missing">${t("qr.noImage")}</span>`
          }</div>
          <div>
            <strong>${escapeHtml(q.title)}</strong>
            <p class="muted">${escapeHtml(q.date)}</p>
          </div>
        </div>
        <button class="qr-menu-btn" type="button" data-qr-menu="${q.id}" aria-label="Menu">•••</button>
      </div>`
      )
      .join("");
  }
  const addButton = document.getElementById("addQrBtn");
  addButton.classList.toggle("disabled", state.qrs.length >= 5);
  addButton.setAttribute("aria-disabled", String(state.qrs.length >= 5));
}

function prepareQrSelection() {
  if (state.qrs.length === 1) {
    state.selectedQr = state.qrs[0].id;
  } else {
    state.selectedQr = null;
  }
  saveState();
  renderQrSelection();
}

function renderQrSelection() {
  const list = document.getElementById("qrSelectList");
  const hint = document.getElementById("qrSelectHint");
  if (!list || !hint) return;

  if (!state.qrs.length) {
    state.selectedQr = null;
    hint.textContent = t("qr.empty");
    list.innerHTML = `
      <div class="qr-select-empty">
        <span>▣</span>
        <p>${t("qr.empty")}</p>
      </div>
    `;
  } else {
    hint.textContent = state.qrs.length === 1 ? t("qr.autoSelected") : t("qr.selectOne");
    list.innerHTML = state.qrs
      .filter((qr) => qr.dataUrl)
      .map((qr) => {
        const selected = qr.id === state.selectedQr;
        return `
          <button class="qr-select-card ${selected ? "selected" : ""}" type="button" data-select-qr="${qr.id}">
            <img src="${qr.dataUrl}" alt="QR">
            <span>${escapeHtml(qr.title)}</span>
            <b>${selected ? "✓" : ""}</b>
          </button>
        `;
      })
      .join("");
  }

  const addButton = document.getElementById("newQrPickBtn");
  addButton.classList.toggle("disabled", state.qrs.length >= 5);
  addButton.setAttribute("aria-disabled", String(state.qrs.length >= 5));
}

function renderProfile() {
  const img = document.getElementById("avatarImg");
  const fallback = document.getElementById("avatar");
  const firstName = state.profileFirstName || t("user.default");
  const lastName = state.profileLastName || "";
  if (state.avatarDataUrl) {
    img.src = state.avatarDataUrl;
    img.hidden = false;
    fallback.hidden = true;
  } else {
    img.hidden = true;
    fallback.hidden = false;
  }
  fallback.textContent = `${firstName.charAt(0)}${(lastName.charAt(0) || "").toUpperCase()}`.toUpperCase() || "YG";
  document.getElementById("profileFullName").textContent = `${firstName} ${lastName}`.trim();
  document.getElementById("pPhone").textContent = state.phone || t("common.dash");
  document.getElementById("pId").textContent = state.uniqueId || t("common.dash");
  renderHome();
}

function renderSettings() {
  document.getElementById("settingsFirstName").value = state.profileFirstName || "";
  document.getElementById("settingsLastName").value = state.profileLastName || "";
  document.getElementById("settingsPhone").value = state.phone || "";
  document.getElementById("langValue").textContent = t(`lang.${state.lang}`);
  document.getElementById("notifToggle").checked = state.notifications !== false;
  applyTheme();
}

function renderStats() {
  const total = state.transactions.length;
  const done = state.transactions.filter((x) => x.status === "done").length;
  const progress = state.transactions.filter((x) => x.status === "progress").length;
  const cancelled = state.transactions.filter((x) => x.status === "cancelled").length;
  const doneTransactions = state.transactions.filter((x) => x.status === "done");
  const volume = state.transactions
    .filter((x) => x.status === "done")
    .reduce((sum, x) => sum + x.cny, 0);
  const uzsVolume = doneTransactions.reduce((sum, x) => sum + x.uzs, 0);
  const successRate = total ? Math.round((done / total) * 100) : 0;
  const average = done ? Math.round(volume / done) : 0;
  document.getElementById("statTotal").textContent = formatNumber(total);
  document.getElementById("statDone").textContent = formatNumber(done);
  document.getElementById("statProgress").textContent = formatNumber(progress);
  document.getElementById("statVolume").textContent = formatNumber(volume);
  document.getElementById("statChartTotal").textContent = `${formatNumber(volume)} CNY`;
  document.getElementById("statSuccessRate").textContent = `${successRate}%`;
  document.getElementById("statSuccessBar").style.width = `${successRate}%`;
  document.getElementById("statUzsVolume").textContent = `${formatNumber(uzsVolume)} UZS`;
  document.getElementById("statAverage").textContent = `${formatNumber(average)} CNY`;
  document.getElementById("statCancelled").textContent = formatNumber(cancelled);

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const amount = doneTransactions
      .filter((transaction) => {
        const created = new Date(transaction.createdAt);
        return (
          created.getFullYear() === date.getFullYear() &&
          created.getMonth() === date.getMonth()
        );
      })
      .reduce((sum, transaction) => sum + transaction.cny, 0);
    return {
      label: date.toLocaleDateString(locale(), { month: "short" }),
      amount,
    };
  });
  const maxAmount = Math.max(...months.map((month) => month.amount), 1);
  document.getElementById("statsChart").innerHTML = months
    .map(
      (month) => `
        <div class="chart-column" title="${formatNumber(month.amount)} CNY">
          <div class="chart-bar-wrap">
            <span class="chart-bar" style="height:${Math.max(
              4,
              Math.round((month.amount / maxAmount) * 100)
            )}%"></span>
          </div>
          <small>${escapeHtml(month.label)}</small>
        </div>
      `
    )
    .join("");

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const amount = doneTransactions
      .filter((tx) => String(tx.createdAt || "").slice(0, 10) === key)
      .reduce((sum, tx) => sum + tx.cny, 0);
    return {
      label: date.toLocaleDateString(locale(), { weekday: "short" }),
      amount,
    };
  });
  const weekTotal = days.reduce((sum, d) => sum + d.amount, 0);
  const maxDay = Math.max(...days.map((d) => d.amount), 1);
  const weekEl = document.getElementById("statWeekTotal");
  if (weekEl) weekEl.textContent = `${formatNumber(weekTotal)} CNY`;
  const weekChart = document.getElementById("statsWeekChart");
  if (weekChart) {
    weekChart.innerHTML = days
      .map(
        (day) => `
        <div class="chart-column" title="${formatNumber(day.amount)} CNY">
          <div class="chart-bar-wrap">
            <span class="chart-bar" style="height:${Math.max(
              4,
              Math.round((day.amount / maxDay) * 100)
            )}%"></span>
          </div>
          <small>${escapeHtml(day.label)}</small>
        </div>`
      )
      .join("");
  }
}

function openTransaction(id) {
  state.currentTxId = id;
  saveState();
  go("tx-detail");
}

async function createTransaction() {
  prepareTransactionMeta();
  const id = state.pendingTransactionId;
  const createdAt = state.pendingCreatedAt;
  const selectedQr = state.qrs.find((qr) => qr.id === state.selectedQr);

  // Rasmlarni alohida yuklash — muvaffaqiyatsiz bo'lsa ariza yuborilmaydi
  if (!selectedQr?.dataUrl) {
    throw new Error("qr required");
  }
  const receiptUrl = await uploadImage(state.receiptDataUrl, true);
  if (!receiptUrl || receiptUrl.startsWith("data:")) {
    throw new Error("receipt upload failed");
  }
  const qrUrl = await uploadImage(selectedQr.dataUrl, true);
  if (!qrUrl || qrUrl.startsWith("data:")) {
    throw new Error("qr upload failed");
  }

  const txItem = {
    id,
    status: "progress",
    cny: state.amount,
    uzs: state.amount * RATE,
    card: cardLabel(state.selectedCard),
    paymentReceiptUrl: receiptUrl,
    qrImageUrl: qrUrl,
    qrName: selectedQr?.title || "Alipay QR",
    createdAt,
  };
  state.transactions.unshift(txItem);
  state.currentTxId = id;
  state.pendingTransactionId = null;
  state.pendingCreatedAt = null;
  state.receiptDataUrl = receiptUrl;
  saveState();
  const ok = await pushTransactionToServer(txItem);
  if (!ok) throw new Error("tx create failed");
  sendTelegramNotification(txItem);
  return { txItem, ok };
}

const DEMO_TX_IDS_SET = new Set(DEMO_TX_IDS);

function mapServerTx(remote) {
  const created = remote.created_at || "";
  return {
    id: remote.tx_id,
    status: remote.status,
    cny: remote.cny,
    uzs: remote.uzs,
    card: remote.card || "",
    paymentReceiptUrl: remote.receipt || "",
    qrImageUrl: remote.qr || "",
    adminReceiptUrl: remote.admin_receipt || "",
    cancelReason: remote.reason || "",
    createdAt: created.includes("T") ? created : created.replace(" ", "T"),
  };
}

async function syncTransactionsFromServer() {
  const id = tgUserId();
  if (!id) return;
  try {
    const res = await fetch(`/api/tx?tg_id=${id}`, { headers: API_HEADERS });
    const data = await res.json();
    if (!data.ok) return;

    const remoteList = data.transactions || [];
    const remoteIds = new Set(remoteList.map((r) => r.tx_id));

    // Faqat haqiqiy lokal (serverda yo'q) tranzaksiyalarni yuklash
    for (const local of state.transactions) {
      if (!local?.id || DEMO_TX_IDS_SET.has(local.id) || remoteIds.has(local.id)) continue;
      if (local.paymentReceiptUrl?.startsWith("data:")) {
        local.paymentReceiptUrl = await uploadImage(local.paymentReceiptUrl);
      }
      if (local.qrImageUrl?.startsWith("data:")) {
        local.qrImageUrl = await uploadImage(local.qrImageUrl);
      }
      await pushTransactionToServer(local);
    }

    // Server — asosiy manba: faqat shu foydalanuvchiniki
    const refreshed = await fetch(`/api/tx?tg_id=${id}`, { headers: API_HEADERS });
    const fresh = await refreshed.json();
    if (!fresh.ok) return;

    state.transactions = (fresh.transactions || []).map(mapServerTx);
    saveState();
    renderTransactions();
    renderHome();
    renderAllPurchases();
    renderNotificationBadge();
    if (document.querySelector('.screen.active[data-screen="tx-detail"]')) {
      renderTxDetail();
    }
  } catch (_) {}
}

async function uploadImage(dataUrl, required = false) {
  if (!dataUrl) {
    return required ? null : "";
  }
  if (dataUrl.startsWith("/demo")) {
    return required ? null : "";
  }
  if (dataUrl.startsWith("/")) return dataUrl;

  const id = tgUserId();
  if (!id) return required ? null : dataUrl;

  try {
    let uploadBlob = await (await fetch(dataUrl)).blob();
    if (uploadBlob.size > 900_000 || dataUrl.startsWith("data:")) {
      try {
        const recompressed = await compressDataUrl(dataUrl, 900, 0.55);
        uploadBlob = await (await fetch(recompressed)).blob();
      } catch (_) {}
    }
    const form = new FormData();
    form.append("tg_id", String(id));
    form.append("file", uploadBlob, "image.jpg");
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: apiHeaders(false),
      body: form,
    });
    const data = await res.json();
    if (data.ok && data.url) return data.url;
  } catch (err) {
    console.warn("[YuanGo] Rasm yuklash xatosi:", err);
  }
  return required ? null : dataUrl;
}

async function pushTransactionToServer(txItem) {
  const id = tgUserId();
  if (!id) return false;
  try {
    const receipt = String(txItem.paymentReceiptUrl || "");
    const qr = String(txItem.qrImageUrl || "");
    const res = await fetch("/api/tx", {
      method: "POST",
      headers: apiHeaders(true),
      body: JSON.stringify({
        tg_id: id,
        tx_id: txItem.id,
        cny: txItem.cny,
        uzs: txItem.uzs,
        card: txItem.card,
        receipt: receipt.startsWith("data:") ? "" : receipt,
        qr: qr.startsWith("data:") ? "" : qr,
        status: txItem.status || "progress",
        created_at: txItem.createdAt || "",
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn("[YuanGo] TX yaratish xatosi:", data);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[YuanGo] TX yuborish xatosi:", err);
    return false;
  }
}

function tgUserId() {
  // Brauzerda sinash uchun ?tg_id=... parametri ham qo'llab-quvvatlanadi
  const fromUrl = new URLSearchParams(location.search).get("tg_id");
  return tg?.initDataUnsafe?.user?.id || (fromUrl ? Number(fromUrl) : null);
}

function apiHeaders(json = true) {
  const headers = { "ngrok-skip-browser-warning": "true" };
  if (json) headers["Content-Type"] = "application/json";
  if (tg?.initData) headers["X-Telegram-Init-Data"] = tg.initData;
  return headers;
}

const API_HEADERS = apiHeaders(true);

async function syncPublicPurchases() {
  try {
    const res = await fetch("/api/purchases?limit=20", { headers: API_HEADERS });
    const data = await res.json();
    if (!data.ok) return;
    publicPurchases = data.purchases || [];
    renderHome();
    renderAllPurchases();
  } catch (err) {
    console.warn("[YuanGo] Umumiy xaridlar yuklanmadi:", err);
  }
}

async function syncConfig() {
  try {
    const res = await fetch("/api/config", { headers: API_HEADERS });
    const data = await res.json();
    if (!data.ok || !data.config) return;
    const c = data.config;
    RATE = Number(c.rate_uzs) || RATE;
    MIN_CNY = Number(c.min_cny) || MIN_CNY;
    MAX_CNY = Number(c.max_cny) || MAX_CNY;
    WORK_HOURS = c.work_hours || WORK_HOURS;
    COMMISSION = c.commission || COMMISSION;
    renderHome();
    updateBuyCalc();
    const amountInput = document.getElementById("cnyAmount");
    if (amountInput?.value) validateAmount(true);
    if (document.querySelector('.screen.active[data-screen="rate-stats"]')) {
      loadRateStats(rateStatsDays);
    }
  } catch (err) {
    console.warn("[YuanGo] Config yuklanmadi:", err);
  }
}

function formatRatePct(pct) {
  const n = Number(pct) || 0;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function buildRateChartPaths(points) {
  const w = 360;
  const h = 180;
  const padY = 18;
  const rates = points.map((p) => Number(p.rate) || 0);
  if (!rates.length) {
    return { fill: `M0 ${h / 2} H${w} V${h} H0Z`, line: `M0 ${h / 2} H${w}`, cx: w, cy: h / 2 };
  }
  const minR = Math.min(...rates);
  const maxR = Math.max(...rates);
  const span = Math.max(maxR - minR, 1);
  const ys = rates.map((r) => {
    const t = (r - minR) / span;
    return h - padY - t * (h - padY * 2);
  });
  const xs = rates.map((_, i) =>
    rates.length === 1 ? w : (i / (rates.length - 1)) * w
  );
  let line = `M${xs[0]} ${ys[0]}`;
  for (let i = 1; i < xs.length; i++) {
    const cx = (xs[i - 1] + xs[i]) / 2;
    line += ` C${cx} ${ys[i - 1]} ${cx} ${ys[i]} ${xs[i]} ${ys[i]}`;
  }
  const fill = `${line} V${h} H0 Z`;
  return {
    fill,
    line,
    cx: xs[xs.length - 1],
    cy: ys[ys.length - 1],
  };
}

function rateLabelDate(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

function renderRateStats(data) {
  if (!data) return;
  const current = data.current ?? RATE;
  const change = Number(data.change_pct) || 0;
  const arrow = change > 0 ? "↗" : change < 0 ? "↘" : "→";
  const changeClass = change > 0 ? "positive" : change < 0 ? "negative" : "";

  const curEl = document.getElementById("rateStatsCurrent");
  if (curEl) curEl.textContent = `1 CNY = ${formatNumber(current)} UZS`;
  const chEl = document.getElementById("rateStatsChange");
  if (chEl) {
    chEl.innerHTML = `<b class="${changeClass}">${arrow} ${formatRatePct(change)}</b> ${t("rateStats.changeInPeriod")}`;
  }
  const chartCur = document.getElementById("rateChartCurrent");
  if (chartCur) chartCur.textContent = `${formatNumber(current)} UZS`;

  const periodLabel = document.getElementById("rateChartPeriodLabel");
  if (periodLabel) {
    periodLabel.textContent =
      data.days === 30
        ? t("rateStats.period30")
        : data.days === 90
          ? t("rateStats.period90")
          : t("rateStats.period7");
  }

  document.querySelectorAll("#ratePeriods [data-rate-days]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.rateDays) === Number(data.days));
    const key =
      Number(btn.dataset.rateDays) === 30
        ? "rateStats.btn30"
        : Number(btn.dataset.rateDays) === 90
          ? "rateStats.btn90"
          : "rateStats.btn7";
    btn.textContent = t(key);
  });

  const points = data.points?.length
    ? data.points
    : [{ rate: current, created_at: new Date().toISOString() }];
  const paths = buildRateChartPaths(points);
  const fill = document.getElementById("rateChartFill");
  const line = document.getElementById("rateChartLine");
  const dot = document.getElementById("rateChartDot");
  if (fill) fill.setAttribute("d", paths.fill);
  if (line) line.setAttribute("d", paths.line);
  if (dot) {
    dot.setAttribute("cx", String(paths.cx));
    dot.setAttribute("cy", String(paths.cy));
  }

  const labels = document.getElementById("rateChartLabels");
  if (labels) {
    const idxs =
      points.length <= 1
        ? [0]
        : [0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1];
    const unique = [...new Set(idxs)];
    labels.innerHTML = unique
      .map((i) => `<span>${rateLabelDate(points[i]?.created_at)}</span>`)
      .join("");
  }

  const setMetric = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${formatNumber(value)} UZS`;
  };
  setMetric("rateMetricMin", data.min ?? current);
  setMetric("rateMetricMax", data.max ?? current);
  setMetric("rateMetricAvg", data.avg ?? current);
  const mChange = document.getElementById("rateMetricChange");
  if (mChange) {
    mChange.textContent = formatRatePct(change);
    mChange.classList.toggle("positive", change > 0);
    mChange.classList.toggle("negative", change < 0);
  }

  const minLabel = document.getElementById("rateMetricMinLabel");
  const maxLabel = document.getElementById("rateMetricMaxLabel");
  if (minLabel) {
    minLabel.textContent =
      data.days === 7
        ? t("rateStats.minWeek")
        : data.days === 30
          ? t("rateStats.minMonth")
          : t("rateStats.min");
  }
  if (maxLabel) {
    maxLabel.textContent =
      data.days === 7
        ? t("rateStats.maxWeek")
        : data.days === 30
          ? t("rateStats.maxMonth")
          : t("rateStats.max");
  }
}

async function loadRateStats(days = rateStatsDays) {
  rateStatsDays = days;
  try {
    const res = await fetch(`/api/rate-history?days=${days}`, { headers: API_HEADERS });
    const data = await res.json();
    if (!data.ok) return;
    if (data.current) RATE = Number(data.current) || RATE;
    renderRateStats(data);
  } catch (err) {
    console.warn("[YuanGo] Kurs statistikasi yuklanmadi:", err);
    renderRateStats({
      days,
      current: RATE,
      min: RATE,
      max: RATE,
      avg: RATE,
      change_pct: 0,
      points: [{ rate: RATE, created_at: new Date().toISOString() }],
    });
  }
}

async function syncCards() {
  try {
    const res = await fetch("/api/cards", { headers: apiHeaders(true) });
    const data = await res.json();
    if (!data.ok) return;
    paymentCards = data.cards || [];
    if (state.selectedCard && !paymentCards.some((c) => String(c.id) === String(state.selectedCard))) {
      state.selectedCard = paymentCards[0]?.id ?? null;
      saveState();
    }
    renderPaymentCards();
  } catch (err) {
    console.warn("[YuanGo] Kartalar yuklanmadi:", err);
  }
}

async function copyText(text) {
  const value = String(text || "");
  if (!value) return false;

  // Telegram WebView da async fetch'dan keyin clipboard API ko'pincha ishlamaydi —
  // avval execCommand fallback, keyin Clipboard API.
  try {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.setAttribute("aria-hidden", "true");
    input.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    document.body.appendChild(input);
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(input);
    if (ok) return true;
  } catch (_) {}

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {}
  return false;
}

async function syncReviews() {
  try {
    const res = await fetch("/api/reviews", { headers: API_HEADERS });
    const data = await res.json();
    if (!data.ok) return;
    publicReviews = data.reviews || [];
    renderReviewCarousel();
  } catch (err) {
    console.warn("[YuanGo] Sharhlar yuklanmadi:", err);
  }
}

function reviewDisplayName(item) {
  const uname = String(item?.username || "").trim();
  if (uname) return `@${uname.replace(/^@/, "")}`;
  const name = String(item?.name || "").trim();
  if (name.startsWith("@")) return name;
  return "Mijoz";
}

function showReviewSlide(index) {
  if (!publicReviews.length) return;
  reviewCarouselIndex = ((index % publicReviews.length) + publicReviews.length) % publicReviews.length;
  const item = publicReviews[reviewCarouselIndex];
  const slide = document.getElementById("reviewSlide");
  const quote = document.getElementById("reviewQuote");
  const author = document.getElementById("reviewAuthor");
  const meta = document.getElementById("reviewMeta");
  const avatar = document.getElementById("reviewAvatar");
  if (!quote || !author || !meta) return;
  if (slide) {
    slide.classList.remove("is-in");
    void slide.offsetWidth;
    slide.classList.add("is-in");
  }
  const name = reviewDisplayName(item);
  quote.textContent = item.text;
  author.textContent = name;
  meta.textContent = item.cny ? `${formatNumber(item.cny)} CNY` : "Mijoz";
  const letter = name.replace(/^@/, "").charAt(0) || "Y";
  if (avatar) avatar.textContent = letter.toUpperCase();
  document.querySelectorAll("#reviewDots button").forEach((btn, i) => {
    btn.classList.toggle("is-active", i === reviewCarouselIndex);
  });
}

function renderReviewCarousel() {
  const box = document.getElementById("homeReviews");
  const dots = document.getElementById("reviewDots");
  if (!box || !dots) return;
  if (reviewCarouselTimer) {
    clearInterval(reviewCarouselTimer);
    reviewCarouselTimer = null;
  }
  if (!publicReviews.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  dots.innerHTML = publicReviews
    .map((_, i) => `<button type="button" data-review-dot="${i}" aria-label="Sharh ${i + 1}"></button>`)
    .join("");
  showReviewSlide(0);
  if (publicReviews.length > 1) {
    reviewCarouselTimer = setInterval(() => showReviewSlide(reviewCarouselIndex + 1), 3500);
  }
}

async function syncProfileFromServer() {
  const id = tgUserId();
  if (!id) {
    console.warn("[YuanGo] Telegram ID topilmadi — profil sinxronlanmaydi");
    return;
  }
  try {
    const res = await fetch(`/api/me?tg_id=${id}`, { headers: API_HEADERS });
    const data = await res.json();
    if (!data.ok) return;
    if (!data.registered) {
      console.warn("[YuanGo] Foydalanuvchi bazada ro'yxatdan o'tmagan:", id);
      toast(t("toast.notRegistered"));
      return;
    }
    const user = data.user;
    if (user.first_name) state.profileFirstName = user.first_name;
    if (user.last_name) state.profileLastName = user.last_name;
    if (user.phone) state.phone = user.phone;
    if (user.unique_id) state.uniqueId = `#${user.unique_id}`;
    if (user.lang && I18N[user.lang]) state.lang = user.lang;
    saveState();
    applyI18n();
    renderProfile();
    renderHome();
    renderSettings();
    console.info("[YuanGo] Profil bazadan yuklandi:", user.unique_id);
  } catch (err) {
    console.warn("[YuanGo] Profil sinxronlashda xato:", err);
  }
}

function pushProfileToServer(fields) {
  const id = tgUserId();
  if (!id) return;
  fetch("/api/me", {
    method: "POST",
    headers: API_HEADERS,
    body: JSON.stringify({ tg_id: id, ...fields }),
  }).catch(() => {});
}

function sendTelegramNotification(txItem) {
  const id = tgUserId();
  if (!id) return;
  fetch("/api/notify", {
    method: "POST",
    headers: API_HEADERS,
    body: JSON.stringify({
      tg_id: id,
      tx_id: txItem.id,
      cny: formatNumber(txItem.cny),
      uzs: formatNumber(txItem.uzs),
    }),
  }).catch(() => {});
}

function setLanguage(lang) {
  state.lang = lang;
  saveState();
  pushProfileToServer({ lang });
  applyI18n();
  renderHome();
  renderAllPurchases();
  renderTransactions();
  renderQrs();
  renderQrSelection();
  updateBuyCalc();
  loadRateStats(rateStatsDays);
  if (document.querySelector('.screen.active[data-screen="tx-detail"]')) renderTxDetail();
  if (document.querySelector('.screen.active[data-screen="confirm"]')) renderConfirm();
  if (document.querySelector('.screen.active[data-screen="stats"]')) renderStats();
  validateAmount(!document.getElementById("amountError")?.hidden);
  toast(t("toast.lang"));
}

function setTheme(theme) {
  state.theme = theme;
  saveState();
  applyTheme();
  toast(t("toast.theme"));
}

function initTelegram() {
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const user = tg?.initDataUnsafe?.user;
  // Faqat Telegram/server ma'lumoti — soxta default yo'q
  if (!state.profileFirstName && user?.first_name) state.profileFirstName = user.first_name;
  if (!state.profileLastName && user?.last_name) state.profileLastName = user.last_name;
  if (!state.phone && user?.phone_number) state.phone = user.phone_number;
  saveState();

  document.getElementById("refLink").textContent = user?.id
    ? `t.me/yuan_go_bot?start=ref${user.id}`
    : "t.me/yuan_go_bot?start=ref";
  renderProfile();
  renderHome();
  renderQrs();
  syncConfig();
  syncCards();
  syncReviews();
  syncProfileFromServer();
  syncTransactionsFromServer();
  syncPublicPurchases();

  // Ilova qayta ochilganda/fokus qaytganda bazadan yangilab olish
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncConfig();
      syncCards();
      syncReviews();
      syncProfileFromServer();
      syncTransactionsFromServer();
      syncPublicPurchases();
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Katta telefon rasmlarini saqlashdan oldin siqish
function compressDataUrl(dataUrl, maxSize = 960, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

async function readImageCompressed(file, maxSize = 960, quality = 0.6) {
  const rawDataUrl = await readFileAsDataUrl(file);
  try {
    return await compressDataUrl(rawDataUrl, maxSize, quality);
  } catch (_) {
    // HEIC va ba'zi formatlar canvasda ochilmaydi
    if (file.type && !file.type.startsWith("image/")) throw new Error("unsupported");
    if (rawDataUrl.length > 2_500_000) throw new Error("too large");
    return rawDataUrl;
  }
}

function bindUi() {
  document.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.go));
  });

  document.getElementById("promoWelcomeContinue")?.addEventListener("click", () => {
    markPromoWelcomeSeen();
    go("home");
  });

  document.getElementById("promoDetailsBack")?.addEventListener("click", () => {
    go(promoDetailsReturnTo === "promo-welcome" ? "promo-welcome" : "home");
  });

  document.getElementById("ratePeriods")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rate-days]");
    if (!btn) return;
    loadRateStats(Number(btn.dataset.rateDays) || 7);
  });

  document.querySelectorAll(".tab-item").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.tab));
  });

  document.getElementById("reviewDots")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-review-dot]");
    if (!btn) return;
    if (reviewCarouselTimer) {
      clearInterval(reviewCarouselTimer);
      reviewCarouselTimer = null;
    }
    showReviewSlide(Number(btn.dataset.reviewDot) || 0);
    if (publicReviews.length > 1) {
      reviewCarouselTimer = setInterval(() => showReviewSlide(reviewCarouselIndex + 1), 3500);
    }
  });

  document.getElementById("exitAppBtn")?.addEventListener("click", () => {
    if (tg?.close) tg.close();
    else toast("Exit");
  });

  document.getElementById("avatarBtn")?.addEventListener("click", () => {
    document.getElementById("avatarInput").click();
  });
  document.getElementById("avatarInput")?.addEventListener("change", async () => {
    const file = document.getElementById("avatarInput").files?.[0];
    if (!file) return;
    state.avatarDataUrl = await readImageCompressed(file, 512);
    saveState();
    renderProfile();
    toast(t("toast.avatar"));
  });

  document.getElementById("savePersonalBtn")?.addEventListener("click", () => {
    const firstName = document.getElementById("settingsFirstName").value.trim();
    const lastName = document.getElementById("settingsLastName").value.trim();
    const phone = document.getElementById("settingsPhone").value.trim();
    if (!firstName || !lastName || !phone) return;
    state.profileFirstName = firstName;
    state.profileLastName = lastName;
    state.phone = phone;
    saveState();
    pushProfileToServer({ first_name: firstName, last_name: lastName, phone });
    renderProfile();
    toast(t("settings.saved"));
  });

  document.getElementById("openLangBtn")?.addEventListener("click", () => {
    document.getElementById("langSheet").hidden = false;
  });
  document.getElementById("closeLangBtn")?.addEventListener("click", () => {
    document.getElementById("langSheet").hidden = true;
  });
  document.getElementById("langSheet")?.addEventListener("click", (e) => {
    if (e.target.id === "langSheet") e.currentTarget.hidden = true;
  });
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLanguage(btn.dataset.lang);
      document.getElementById("langSheet").hidden = true;
    });
  });

  document.querySelectorAll("[data-theme-pick]").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.themePick));
  });

  document.getElementById("homeThemeToggle")?.addEventListener("click", () => {
    setTheme(state.theme === "dark" ? "light" : "dark");
  });

  document.getElementById("notifToggle")?.addEventListener("change", (e) => {
    state.notifications = e.target.checked;
    saveState();
    renderNotificationBadge();
  });

  document.getElementById("cnyAmount")?.addEventListener("input", () => {
    updateBuyCalc();
    validateAmount(document.getElementById("cnyAmount").value !== "");
    saveState();
  });

  document.getElementById("cardList")?.addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".pay-card-copy");
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const digits = copyBtn.dataset.copy || "";
      if (!digits || copyBtn.disabled) {
        toast(t("card.copyFail"));
        return;
      }
      const ok = await copyText(digits);
      if (!ok) {
        toast(t("card.copyFail"));
        haptic("medium");
        return;
      }
      copyBtn.classList.add("is-copied");
      const label = copyBtn.querySelector(".pay-card-copy-label");
      if (label) label.textContent = t("card.copied");
      toast(t("card.copied"));
      haptic("success");
      setTimeout(() => {
        copyBtn.classList.remove("is-copied");
        if (label) label.textContent = t("card.copy");
      }, 1600);
      return;
    }
    const card = e.target.closest(".pay-card");
    if (!card) return;
    state.selectedCard = card.dataset.card;
    saveState();
    renderPaymentCards();
    haptic("success");
  });

  document.getElementById("paidBtn")?.addEventListener("click", () => {
    if (!validateAmount(true)) return;
    if (!paymentCards.length || !state.selectedCard) {
      toast(state.lang === "ru" ? "Карта пока недоступна" : state.lang === "en" ? "No card available" : "Hozircha faol karta yo‘q");
      return;
    }
    const amount = Number(document.getElementById("cnyAmount").value);
    state.amount = amount;
    state.receiptDataUrl = null;
    state.note = "";
    state.selectedQr = null;
    state.pendingTransactionId = null;
    state.pendingCreatedAt = null;
    const receiptInput = document.getElementById("receiptInput");
    receiptInput.value = "";
    document.getElementById("receiptPreview").src = "";
    document.getElementById("receiptPreview").hidden = true;
    document.getElementById("receiptPlaceholder").hidden = false;
    document.getElementById("receiptNote").value = "";
    saveState();
    go("receipt");
  });

  const receiptInput = document.getElementById("receiptInput");
  document.getElementById("receiptBox")?.addEventListener("click", () => receiptInput.click());
  document.getElementById("changeReceiptBtn")?.addEventListener("click", () => receiptInput.click());
  receiptInput?.addEventListener("change", async () => {
    const file = receiptInput.files?.[0];
    if (!file) return;
    try {
      state.receiptDataUrl = await readImageCompressed(file);
      const img = document.getElementById("receiptPreview");
      img.src = state.receiptDataUrl;
      img.hidden = false;
      document.getElementById("receiptPlaceholder").hidden = true;
      saveState();
    } catch (_) {
      state.receiptDataUrl = null;
      toast(t("toast.receiptFail"));
    }
  });

  document.getElementById("receiptNextBtn")?.addEventListener("click", () => {
    if (!state.receiptDataUrl) {
      toast(t("toast.receiptRequired"));
      return;
    }
    state.note = document.getElementById("receiptNote").value;
    prepareQrSelection();
    saveState();
    go("qr-select");
  });

  document.getElementById("qrSelectList")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-select-qr]");
    if (!card) return;
    state.selectedQr = card.dataset.selectQr;
    saveState();
    renderQrSelection();
  });

  document.getElementById("newQrPickBtn")?.addEventListener("click", () => {
    if (state.qrs.length >= 5) {
      toast(t("qr.max"));
      return;
    }
    qrEditorMode = "add";
    activeQrId = null;
    pendingQrImage = null;
    document.getElementById("qrImageInput").value = "";
    document.getElementById("qrImageInput").click();
  });

  document.getElementById("qrNextBtn")?.addEventListener("click", () => {
    if (!state.selectedQr) {
      toast(t("qr.selectRequired"));
      return;
    }
    go("confirm");
  });

  document.getElementById("confirmAttachments")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-confirm-image]");
    if (!button) return;
    const src =
      button.dataset.confirmImage === "receipt"
        ? document.getElementById("confirmReceiptImage").src
        : document.getElementById("confirmQrImage").src;
    openReceiptImage(src);
  });

  document.getElementById("confirmBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("confirmBtn");
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.disabled = true;
    toast(t("toast.sending"));
    try {
      const { txItem } = await createTransaction();
      document.getElementById("completedMsg").textContent = `${formatNumber(txItem.cny)} CNY`;
      document.getElementById("completedMeta").textContent = `${txItem.id} • ${formatDate(txItem.createdAt)}`;
      haptic("success");
      go("progress");
    } catch (err) {
      console.warn("[YuanGo] Confirm xatosi:", err);
      toast(t("toast.sendFail"));
    } finally {
      btn.dataset.busy = "0";
      btn.disabled = false;
    }
  });

  document.getElementById("txTabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    state.txFilter = tab.dataset.filter;
    document.querySelectorAll("#txTabs .tab").forEach((x) => x.classList.remove("active"));
    tab.classList.add("active");
    saveState();
    renderTransactions();
  });

  document.getElementById("txList")?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-open-tx]");
    if (item) openTransaction(item.dataset.openTx);
  });

  document.getElementById("notificationList")?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-notification-tx]");
    if (!item) return;
    const transaction = state.transactions.find((entry) => entry.id === item.dataset.notificationTx);
    if (transaction) {
      const key = notificationKey(transaction);
      state.readNotificationIds = state.readNotificationIds || [];
      if (!state.readNotificationIds.includes(key)) {
        state.readNotificationIds.push(key);
        saveState();
        renderNotificationBadge();
      }
    }
    openTransaction(item.dataset.notificationTx);
  });

  document.getElementById("txReceipt")?.addEventListener("click", (e) => {
    const button = e.target.closest("[data-receipt-image]");
    if (button) openReceiptImage(button.dataset.receiptImage);
  });
  document.getElementById("cancelTxBtn")?.addEventListener("click", () => {
    const txItem = state.transactions.find((x) => x.id === state.currentTxId);
    if (!txItem) return;
    txItem.status = "cancelled";
    saveState();
    go("cancelled");
  });

  document.getElementById("addQrBtn")?.addEventListener("click", () => {
    if (state.qrs.length >= 5) {
      toast(t("qr.max"));
      return;
    }
    qrEditorMode = "add";
    activeQrId = null;
    pendingQrImage = null;
    const input = document.getElementById("qrImageInput");
    input.value = "";
    input.click();
  });

  document.getElementById("qrImageInput")?.addEventListener("change", async () => {
    const input = document.getElementById("qrImageInput");
    const file = input.files?.[0];
    if (!file) return;
    let dataUrl;
    try {
      dataUrl = await readImageCompressed(file, 900);
    } catch (_) {
      toast(t("toast.receiptFail"));
      return;
    }
    const editor = document.getElementById("qrEditorSheet");
    if (editor.hidden) {
      openQrEditor("add");
    }
    pendingQrImage = dataUrl;
    document.getElementById("qrEditorPreview").src = pendingQrImage;
  });

  document.getElementById("qrList")?.addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-qr-menu]");
    if (menuButton) openQrActions(menuButton.dataset.qrMenu);
  });

  document.getElementById("closeQrActionBtn")?.addEventListener("click", closeQrActions);
  document.getElementById("qrActionSheet")?.addEventListener("click", (event) => {
    if (event.target.id === "qrActionSheet") closeQrActions();
  });

  document.getElementById("editQrBtn")?.addEventListener("click", () => {
    const qr = state.qrs.find((item) => item.id === activeQrId);
    closeQrActions();
    if (qr) openQrEditor("edit", qr);
  });

  document.getElementById("deleteQrBtn")?.addEventListener("click", () => {
    const qr = state.qrs.find((item) => item.id === activeQrId);
    if (!qr || !window.confirm(t("qr.deleteConfirm"))) return;
    state.qrs = state.qrs.filter((item) => item.id !== activeQrId);
    if (state.selectedQr === activeQrId) state.selectedQr = state.qrs[0]?.id || null;
    saveState();
    renderQrs();
    renderQrSelection();
    closeQrActions();
    toast(t("qr.deleted"));
  });

  document.getElementById("replaceQrImageBtn")?.addEventListener("click", () => {
    const input = document.getElementById("qrImageInput");
    input.value = "";
    input.click();
  });

  document.getElementById("cancelQrEditorBtn")?.addEventListener("click", closeQrEditor);
  document.getElementById("qrEditorSheet")?.addEventListener("click", (event) => {
    if (event.target.id === "qrEditorSheet") closeQrEditor();
  });

  document.getElementById("saveQrBtn")?.addEventListener("click", () => {
    const name = document.getElementById("qrNameInput").value.trim();
    if (!name) {
      toast(t("qr.nameRequired"));
      return;
    }
    if (!pendingQrImage) return;

    if (qrEditorMode === "edit") {
      const qr = state.qrs.find((item) => item.id === activeQrId);
      if (!qr) return;
      qr.title = name;
      qr.dataUrl = pendingQrImage;
      qr.date = new Date().toLocaleDateString(locale());
    } else {
      if (state.qrs.length >= 5) {
        toast(t("qr.max"));
        closeQrEditor();
        return;
      }
      const id = `qr_${Date.now()}`;
      state.qrs.unshift({
        id,
        title: name,
        date: new Date().toLocaleDateString(locale()),
        dataUrl: pendingQrImage,
      });
      state.selectedQr = id;
    }

    saveState();
    renderQrs();
    renderQrSelection();
    closeQrEditor();
    toast(t("qr.saved"));
  });

  document.getElementById("copyRefBtn")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(document.getElementById("refLink").textContent);
    toast(t("toast.copied"));
  });

  document.getElementById("chatForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chatText");
    const text = input.value.trim();
    if (!text) return;
    const log = document.getElementById("chatLog");
    log.insertAdjacentHTML("beforeend", `<div class="bubble out">${text}</div>`);
    input.value = "";
    setTimeout(() => {
      log.insertAdjacentHTML("beforeend", `<div class="bubble in">OK</div>`);
      log.scrollTop = log.scrollHeight;
    }, 400);
    log.scrollTop = log.scrollHeight;
  });

  document.getElementById("demoCompleteBtn")?.addEventListener("click", () => {
    const txItem = state.transactions.find((x) => x.id === state.currentTxId);
    if (txItem) {
      txItem.status = "done";
      saveState();
    }
    go("completed");
  });

  const notif = document.getElementById("notifToggle");
  if (notif) notif.checked = state.notifications !== false;
}

async function bootApp() {
  try {
    await loadI18n();
  } catch (err) {
    console.warn("[YuanGo] i18n yuklanmadi:", err);
  }
  applyTheme();
  applyI18n();
  initTelegram();
  bindUi();
  updateBuyCalc();
  renderProfile();
  renderHome();

  const START_SCREENS = ["home", "buy", "transactions", "rate-stats", "qrs", "profile", "purchases"];
  const requestedScreen = new URLSearchParams(location.search).get("screen");
  if (START_SCREENS.includes(requestedScreen)) {
    markPromoWelcomeSeen();
    go(requestedScreen);
  } else if (shouldShowPromoWelcome()) {
    go("promo-welcome");
  } else {
    go("home");
  }
}

bootApp();
