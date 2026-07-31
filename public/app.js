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
const DEMO_TX_IDS = [];

const I18N = {
  uz: {
    "home.tagline": "Xavfsiz • Tezkor • Ishonchli",
    "home.greeting": "Assalomu alaykum",
    "home.liveRate": "BUGUNGI KURS",
    "home.updated": "Oxirgi yangilanish:",
    "home.min": "Minimum",
    "home.max": "Maksimum",
    "home.fee": "Komissiya",
    "home.hours": "Ish vaqti",
    "home.buy": "Yuan sotib olish",
    "home.buySub": "Tez, xavfsiz va qulay",
    "home.recent": "Oxirgi xaridlar",
    "home.seeAll": "Barchasini ko‘rish ›",
    "home.securityTitle": "Sizning xavfsizligingiz biz uchun muhim",
    "home.securityText": "To‘lovlaringiz zamonaviy himoya tizimlari bilan xavfsiz saqlanadi",
    "home.reviews": "Mijozlar fikri",
    "home.noTx": "Hali tranzaksiya yo‘q",
    "home.success": "Muvaffaqiyatli",
    "home.bought": "sotib oldi",
    "nav.home": "Bosh sahifa",
    "nav.tx": "Tranzaksiyalarim",
    "nav.qr": "QR kodlarim",
    "nav.transfer": "Yuan olish",
    "nav.profile": "Profil",
    "profile.title": "Profil",
    "profile.avatarHint": "Rasm qo‘yish ixtiyoriy",
    "profile.firstName": "Ism",
    "profile.lastName": "Familiya",
    "profile.phone": "Telefon",
    "profile.uniqueId": "Unique ID",
    "profile.language": "Til tanlash",
    "profile.settings": "Sozlamalar",
    "profile.stats": "Statistika",
    "profile.help": "Yordam",
    "settings.title": "Sozlamalar",
    "settings.personal": "Shaxsiy ma’lumotlar",
    "settings.personalHint": "Ism va aloqa ma’lumotlarini yangilang",
    "settings.save": "Saqlash",
    "settings.saved": "Ma’lumotlar saqlandi",
    "settings.languageHint": "Ilova tilini o‘zgartirish",
    "settings.notificationHint": "Tranzaksiya yangiliklarini olish",
    "settings.theme": "Rejim",
    "settings.light": "Yorug‘",
    "settings.dark": "Tungi",
    "settings.notifications": "Bildirishnomalar",
    "stats.title": "Statistika",
    "stats.total": "Jami",
    "stats.done": "Yakunlangan",
    "stats.progress": "Jarayonda",
    "stats.volume": "Hajm (CNY)",
    "stats.chartTitle": "6 oylik faollik",
    "stats.chartHint": "Muvaffaqiyatli CNY hajmi",
    "stats.details": "Batafsil",
    "stats.successRate": "Muvaffaqiyat darajasi",
    "stats.uzsVolume": "Jami to‘lov",
    "stats.average": "O‘rtacha xarid",
    "stats.cancelled": "Bekor qilingan",
    "common.close": "Yopish",
    "status.progress": "Jarayonda",
    "status.done": "Yakunlandi",
    "status.cancelled": "Bekor qilingan",
    "toast.copied": "Nusxalandi",
    "toast.avatar": "Profil rasmi yangilandi",
    "toast.lang": "Til o‘zgartirildi",
    "toast.notRegistered": "Avval botda ro‘yxatdan o‘ting: /start",
    "toast.receiptRequired": "Avval to‘lov chekini yuklang",
    "toast.receiptFail": "Rasm yuklanmadi. Boshqa format yoki kichikroq rasm tanlang",
    "toast.sending": "Yuborilmoqda…",
    "toast.sendFail": "Serverga yuborilmadi. Internetni tekshirib qayta urinib ko‘ring",
    "toast.theme": "Rejim o‘zgartirildi",
    "lang.uz": "O‘zbek",
    "lang.ru": "Русский",
    "lang.en": "English",
    "user.default": "Foydalanuvchi",
    "transactions.mine": "Tranzaksiyalarim",
    "filter.all": "Hammasi",
    "filter.progress": "Jarayonda",
    "filter.cancelled": "Bekor qilingan",
    "filter.done": "Muvaffaqiyatli",
    "purchases.title": "Barcha xaridlar",
    "purchases.subtitle": "So‘nggi muvaffaqiyatli xaridlar",
    "transaction.title": "Tranzaksiya",
    "transaction.progressTitle": "Tranzaksiya jarayonda",
    "transaction.progressMessage": "Chekingiz tasdiqlangach, yuan hisobingizga o‘tkazib beriladi. Iltimos, biroz kuting.",
    "transaction.cancelledTitle": "Bekor qilingan",
    "transaction.cancelledMessage": "Tranzaksiya bekor qilindi.",
    "transaction.cancelReason": "Sabab",
    "transaction.cancelReasonValue": "To‘lov tasdiqlanmadi",
    "transaction.doneTitle": "Muvaffaqiyatli",
    "transaction.doneMessage": "Yuan muvaffaqiyatli yuborildi. Quyida elektron chekingiz ko‘rsatilgan.",
    "transaction.receipt": "Muvaffaqiyatli",
    "transaction.openReceipt": "Chek rasmini ochish",
    "qr.add": "＋ Yangi QR qo‘shish",
    "qr.edit": "Tahrirlash",
    "qr.delete": "O‘chirish",
    "qr.nameTitle": "QR nomini kiriting",
    "qr.name": "QR nomi",
    "qr.replaceImage": "Rasmni almashtirish",
    "qr.save": "Saqlash",
    "qr.max": "Ko‘pi bilan 5 ta QR saqlash mumkin",
    "qr.nameRequired": "QR nomini kiriting",
    "qr.saved": "QR saqlandi",
    "qr.deleted": "QR o‘chirildi",
    "qr.deleteConfirm": "Bu QR kodni o‘chirasizmi?",
    "qr.selectOne": "Yuan qabul qilish uchun bitta QR kodni tanlang",
    "qr.autoSelected": "Yagona QR kod avtomatik tanlandi",
    "qr.empty": "Hali QR kodingiz yo‘q. Davom etish uchun QR qo‘shing",
    "qr.listEmpty": "Hali QR kod yo‘q. Qo‘shish uchun pastdagi tugmani bosing",
    "qr.selectRequired": "Davom etish uchun QR kodni tanlang",
    "qr.noImage": "Rasm yo‘q",
    "common.dash": "—",
    "proof.payment": "To‘lov cheki",
    "proof.alipay": "Alipay QR",
    "proof.yuan": "Yuan o‘tkazma cheki",
    "amount.invalid": "Bunday miqdor mumkin emas. Eng kam 30 CNY, eng ko‘p 500 CNY.",
    "notifications.title": "Bildirishnomalar",
    "notifications.approved": "Tranzaksiya tasdiqlandi",
    "notifications.approvedText": "Yuan muvaffaqiyatli yuborildi",
    "notifications.cancelled": "Tranzaksiya bekor qilindi",
    "notifications.cancelledText": "Bekor qilish sababini tafsilotlarda ko‘ring",
    "notifications.empty": "Hozircha bildirishnomalar yo‘q",
    "notifications.new": "Yangi",
    "notifications.read": "Ko‘rilgan",
  },
  ru: {
    "home.tagline": "Безопасно • Быстро • Надёжно",
    "home.greeting": "Здравствуйте",
    "home.liveRate": "КУРС СЕГОДНЯ",
    "home.updated": "Обновлено:",
    "home.min": "Минимум",
    "home.max": "Максимум",
    "home.fee": "Комиссия",
    "home.hours": "Время работы",
    "home.buy": "Купить юань",
    "home.buySub": "Быстро, безопасно и удобно",
    "home.recent": "Последние покупки",
    "home.seeAll": "Смотреть все ›",
    "home.securityTitle": "Ваша безопасность важна для нас",
    "home.securityText": "Ваши платежи защищены современными системами безопасности",
    "home.reviews": "Отзывы клиентов",
    "home.noTx": "Пока нет операций",
    "home.success": "Успешно",
    "home.bought": "купил(а)",
    "nav.home": "Главная",
    "nav.tx": "Мои операции",
    "nav.qr": "Мои QR",
    "nav.transfer": "Купить юань",
    "nav.profile": "Профиль",
    "profile.title": "Профиль",
    "profile.avatarHint": "Фото необязательно",
    "profile.firstName": "Имя",
    "profile.lastName": "Фамилия",
    "profile.phone": "Телефон",
    "profile.uniqueId": "Unique ID",
    "profile.language": "Язык",
    "profile.settings": "Настройки",
    "profile.stats": "Статистика",
    "profile.help": "Помощь",
    "settings.title": "Настройки",
    "settings.personal": "Личные данные",
    "settings.personalHint": "Обновите имя и контактные данные",
    "settings.save": "Сохранить",
    "settings.saved": "Данные сохранены",
    "settings.languageHint": "Изменить язык приложения",
    "settings.notificationHint": "Получать новости об операциях",
    "settings.theme": "Тема",
    "settings.light": "Светлая",
    "settings.dark": "Тёмная",
    "settings.notifications": "Уведомления",
    "stats.title": "Статистика",
    "stats.total": "Всего",
    "stats.done": "Завершено",
    "stats.progress": "В процессе",
    "stats.volume": "Объём (CNY)",
    "stats.chartTitle": "Активность за 6 месяцев",
    "stats.chartHint": "Объём успешных операций в CNY",
    "stats.details": "Подробнее",
    "stats.successRate": "Процент успеха",
    "stats.uzsVolume": "Общая сумма платежей",
    "stats.average": "Средняя покупка",
    "stats.cancelled": "Отменено",
    "common.close": "Закрыть",
    "status.progress": "В процессе",
    "status.done": "Завершено",
    "status.cancelled": "Отменено",
    "toast.copied": "Скопировано",
    "toast.avatar": "Фото обновлено",
    "toast.lang": "Язык изменён",
    "toast.notRegistered": "Сначала зарегистрируйтесь в боте: /start",
    "toast.receiptRequired": "Сначала загрузите чек оплаты",
    "toast.receiptFail": "Не удалось загрузить фото. Выберите другой формат или меньший файл",
    "toast.sending": "Отправка…",
    "toast.sendFail": "Не удалось отправить на сервер. Проверьте интернет и попробуйте снова",
    "toast.theme": "Тема изменена",
    "lang.uz": "O‘zbek",
    "lang.ru": "Русский",
    "lang.en": "English",
    "user.default": "Пользователь",
    "transactions.mine": "Мои операции",
    "filter.all": "Все",
    "filter.progress": "В процессе",
    "filter.cancelled": "Отменённые",
    "filter.done": "Успешные",
    "purchases.title": "Все покупки",
    "purchases.subtitle": "Последние успешные покупки",
    "transaction.title": "Операция",
    "transaction.progressTitle": "Операция в процессе",
    "transaction.progressMessage": "После подтверждения чека юани будут отправлены на ваш счёт. Пожалуйста, подождите.",
    "transaction.cancelledTitle": "Отменено",
    "transaction.cancelledMessage": "Операция была отменена.",
    "transaction.cancelReason": "Причина",
    "transaction.cancelReasonValue": "Платёж не подтверждён",
    "transaction.doneTitle": "Успешно",
    "transaction.doneMessage": "Юани успешно отправлены. Электронный чек показан ниже.",
    "transaction.receipt": "Успешно",
    "transaction.openReceipt": "Открыть фото чека",
    "qr.add": "＋ Добавить новый QR",
    "qr.edit": "Редактировать",
    "qr.delete": "Удалить",
    "qr.nameTitle": "Введите название QR",
    "qr.name": "Название QR",
    "qr.replaceImage": "Заменить изображение",
    "qr.save": "Сохранить",
    "qr.max": "Можно сохранить не более 5 QR",
    "qr.nameRequired": "Введите название QR",
    "qr.saved": "QR сохранён",
    "qr.deleted": "QR удалён",
    "qr.deleteConfirm": "Удалить этот QR-код?",
    "qr.selectOne": "Выберите один QR-код для получения юаней",
    "qr.autoSelected": "Единственный QR-код выбран автоматически",
    "qr.empty": "У вас пока нет QR-кода. Добавьте QR для продолжения",
    "qr.listEmpty": "Пока нет QR-кодов. Нажмите кнопку ниже, чтобы добавить",
    "qr.selectRequired": "Выберите QR-код для продолжения",
    "qr.noImage": "Нет изображения",
    "common.dash": "—",
    "proof.payment": "Чек оплаты",
    "proof.alipay": "Alipay QR",
    "proof.yuan": "Чек перевода юаней",
    "amount.invalid": "Такая сумма недоступна. Минимум 30 CNY, максимум 500 CNY.",
    "notifications.title": "Уведомления",
    "notifications.approved": "Операция подтверждена",
    "notifications.approvedText": "Юани успешно отправлены",
    "notifications.cancelled": "Операция отменена",
    "notifications.cancelledText": "Причина указана в деталях операции",
    "notifications.empty": "Уведомлений пока нет",
    "notifications.new": "Новые",
    "notifications.read": "Просмотренные",
  },
  en: {
    "home.tagline": "Safe • Fast • Reliable",
    "home.greeting": "Hello",
    "home.liveRate": "TODAY'S RATE",
    "home.updated": "Last update:",
    "home.min": "Minimum",
    "home.max": "Maximum",
    "home.fee": "Fee",
    "home.hours": "Working hours",
    "home.buy": "Buy Yuan",
    "home.buySub": "Fast, safe and easy",
    "home.recent": "Recent purchases",
    "home.seeAll": "See all ›",
    "home.securityTitle": "Your security matters to us",
    "home.securityText": "Your payments are protected by modern security systems",
    "home.reviews": "Customer reviews",
    "home.noTx": "No transactions yet",
    "home.success": "Successful",
    "home.bought": "bought",
    "nav.home": "Home",
    "nav.tx": "My transactions",
    "nav.qr": "My QR",
    "nav.transfer": "Buy Yuan",
    "nav.profile": "Profile",
    "profile.title": "Profile",
    "profile.avatarHint": "Photo is optional",
    "profile.firstName": "First name",
    "profile.lastName": "Last name",
    "profile.phone": "Phone",
    "profile.uniqueId": "Unique ID",
    "profile.language": "Language",
    "profile.settings": "Settings",
    "profile.stats": "Statistics",
    "profile.help": "Help",
    "settings.title": "Settings",
    "settings.personal": "Personal information",
    "settings.personalHint": "Update your name and contact details",
    "settings.save": "Save",
    "settings.saved": "Information saved",
    "settings.languageHint": "Change application language",
    "settings.notificationHint": "Receive transaction updates",
    "settings.theme": "Theme",
    "settings.light": "Light",
    "settings.dark": "Dark",
    "settings.notifications": "Notifications",
    "stats.title": "Statistics",
    "stats.total": "Total",
    "stats.done": "Completed",
    "stats.progress": "In progress",
    "stats.volume": "Volume (CNY)",
    "stats.chartTitle": "6-month activity",
    "stats.chartHint": "Successful CNY volume",
    "stats.details": "Details",
    "stats.successRate": "Success rate",
    "stats.uzsVolume": "Total payments",
    "stats.average": "Average purchase",
    "stats.cancelled": "Cancelled",
    "common.close": "Close",
    "status.progress": "In progress",
    "status.done": "Completed",
    "status.cancelled": "Cancelled",
    "toast.copied": "Copied",
    "toast.notRegistered": "Please register in the bot first: /start",
    "toast.receiptRequired": "Please upload the payment receipt first",
    "toast.receiptFail": "Could not load the image. Try another format or a smaller file",
    "toast.sending": "Sending…",
    "toast.sendFail": "Failed to reach the server. Check your connection and try again",
    "toast.avatar": "Avatar updated",
    "toast.lang": "Language changed",
    "toast.theme": "Theme changed",
    "lang.uz": "O‘zbek",
    "lang.ru": "Русский",
    "lang.en": "English",
    "user.default": "User",
    "transactions.mine": "My transactions",
    "filter.all": "All",
    "filter.progress": "In progress",
    "filter.cancelled": "Cancelled",
    "filter.done": "Successful",
    "purchases.title": "All purchases",
    "purchases.subtitle": "Latest successful purchases",
    "transaction.title": "Transaction",
    "transaction.progressTitle": "Transaction in progress",
    "transaction.progressMessage": "Once your receipt is confirmed, the yuan will be sent to your account. Please wait.",
    "transaction.cancelledTitle": "Cancelled",
    "transaction.cancelledMessage": "The transaction was cancelled.",
    "transaction.cancelReason": "Reason",
    "transaction.cancelReasonValue": "Payment was not confirmed",
    "transaction.doneTitle": "Successful",
    "transaction.doneMessage": "Yuan was sent successfully. Your electronic receipt is shown below.",
    "transaction.receipt": "Successful",
    "transaction.openReceipt": "Open receipt image",
    "qr.add": "＋ Add new QR",
    "qr.edit": "Edit",
    "qr.delete": "Delete",
    "qr.nameTitle": "Enter QR name",
    "qr.name": "QR name",
    "qr.replaceImage": "Replace image",
    "qr.save": "Save",
    "qr.max": "You can save up to 5 QR codes",
    "qr.nameRequired": "Enter a QR name",
    "qr.saved": "QR saved",
    "qr.deleted": "QR deleted",
    "qr.deleteConfirm": "Delete this QR code?",
    "qr.selectOne": "Select one QR code to receive yuan",
    "qr.autoSelected": "The only QR code was selected automatically",
    "qr.empty": "You have no QR codes yet. Add one to continue",
    "qr.listEmpty": "No QR codes yet. Tap the button below to add one",
    "qr.selectRequired": "Select a QR code to continue",
    "qr.noImage": "No image",
    "common.dash": "—",
    "proof.payment": "Payment receipt",
    "proof.alipay": "Alipay QR",
    "proof.yuan": "Yuan transfer receipt",
    "amount.invalid": "This amount is not allowed. Minimum 30 CNY, maximum 500 CNY.",
    "notifications.title": "Notifications",
    "notifications.approved": "Transaction approved",
    "notifications.approvedText": "Yuan was sent successfully",
    "notifications.cancelled": "Transaction cancelled",
    "notifications.cancelledText": "See the cancellation reason in transaction details",
    "notifications.empty": "No notifications yet",
    "notifications.new": "New",
    "notifications.read": "Viewed",
  },
};

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
  const langValue = document.getElementById("langValue");
  if (langValue) langValue.textContent = t(`lang.${state.lang}`);
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === state.lang);
  });
  document.documentElement.lang = state.lang;
}

function go(screen) {
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
  }
  if (screen === "profile") renderProfile();
  if (screen === "stats") renderStats();
  if (screen === "settings") renderSettings();
  window.scrollTo(0, 0);
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
      return `
        <button class="pay-card ${brandClass} ${selected ? "selected" : ""}" type="button" data-card="${card.id}" aria-pressed="${selected}">
          <div class="pay-card-top">
            <span class="pay-card-brand">${(card.brand || "").toUpperCase()}</span>
            <span class="pay-card-choice"><i></i><b>${selected ? "Tanlangan" : "Tanlash"}</b></span>
          </div>
          <div class="pay-card-chip-row">
            <span class="bank-chip" aria-hidden="true"></span>
            <span class="contactless" aria-hidden="true">)))</span>
          </div>
          <p class="pay-card-title-line">${escapeHtml(card.title || "")}</p>
          <p class="pay-card-number">${escapeHtml(card.masked || "")}</p>
          <div class="pay-card-bottom">
            <div>
              <small>KARTA EGASI</small>
              <strong>${escapeHtml(ownerInitials(card.owner_name))}</strong>
            </div>
            <div>
              <small>AMAL QILISH</small>
              <strong>**/**</strong>
            </div>
            <span class="copy" data-copy="${digits}">⧉ Nusxa</span>
          </div>
        </button>`;
    })
    .join("");
}

function updateBuyCalc() {
  const input = document.getElementById("cnyAmount");
  const amount = Number(input.value) || 0;
  state.amount = amount;
  document.getElementById("uzsTotal").textContent = `${formatNumber(amount * RATE)} UZS`;
  document.getElementById("buyRate").textContent = `${formatNumber(RATE)} UZS`;
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
      headers: { "ngrok-skip-browser-warning": "true" },
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
      headers: API_HEADERS,
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

const API_HEADERS = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

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
    chEl.innerHTML = `<b class="${changeClass}">${arrow} ${formatRatePct(change)}</b> davr ichida`;
  }
  const chartCur = document.getElementById("rateChartCurrent");
  if (chartCur) chartCur.textContent = `${formatNumber(current)} UZS`;

  const periodLabel = document.getElementById("rateChartPeriodLabel");
  if (periodLabel) {
    periodLabel.textContent =
      data.days === 30 ? "So‘nggi 1 oy" : data.days === 90 ? "So‘nggi 3 oy" : "So‘nggi 7 kun";
  }

  document.querySelectorAll("#ratePeriods [data-rate-days]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.rateDays) === Number(data.days));
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
      data.days === 7 ? "Haftalik minimum" : data.days === 30 ? "Oylik minimum" : "Minimum";
  }
  if (maxLabel) {
    maxLabel.textContent =
      data.days === 7 ? "Haftalik maksimum" : data.days === 30 ? "Oylik maksimum" : "Maksimum";
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
    const res = await fetch("/api/cards", { headers: API_HEADERS });
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
  validateAmount(!document.getElementById("amountError").hidden);
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

  document.getElementById("cardList")?.addEventListener("click", (e) => {
    const card = e.target.closest(".pay-card");
    if (!card) return;
    if (e.target.classList.contains("copy")) {
      navigator.clipboard?.writeText(e.target.dataset.copy || "");
      toast(t("toast.copied"));
      haptic();
      return;
    }
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

applyTheme();
applyI18n();
initTelegram();
bindUi();
updateBuyCalc();
renderProfile();
renderHome();

const START_SCREENS = ["home", "buy", "transactions", "rate-stats", "qrs", "profile", "purchases"];
const requestedScreen = new URLSearchParams(location.search).get("screen");
go(START_SCREENS.includes(requestedScreen) ? requestedScreen : "home");
