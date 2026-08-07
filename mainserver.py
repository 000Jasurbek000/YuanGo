"""Yuan Go — LOCAL test (Windows / kompyuter).

Serverga / GitHub ga yuklash uchun: main.py
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qsl

try:
    import fcntl
except ImportError:  # Windows
    fcntl = None

import telebot
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from telebot import types

import db

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
LEGACY_USERS_FILE = BASE_DIR / "users.json"
USER_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024  # 10 MB / foydalanuvchi
MAX_SINGLE_UPLOAD_BYTES = 5 * 1024 * 1024  # bitta fayl maks.
RECEIPT_RETENTION_DAYS = 7

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
PORT = int(os.getenv("PORT", "3000"))
WEBAPP_URL = os.getenv("WEBAPP_URL", f"http://localhost:{PORT}").strip()
NGROK_AUTHTOKEN = os.getenv("NGROK_AUTHTOKEN", "").strip()
OPERATOR_USERNAME = os.getenv("OPERATOR_USERNAME", "jasurbek0521").strip().lstrip("@")
OWNER_TELEGRAM_ID = int(os.getenv("OWNER_TELEGRAM_ID", "1024063189") or "1024063189")
def _parse_channel(value: str):
    """@username yoki raqamli kanal ID (-100...)."""
    raw = (value or "").strip()
    if not raw:
        return "@Yuan_Go"
    if raw.startswith("@"):
        return raw
    # Raqamli chat_id (masalan -1001234567890)
    if raw.lstrip("-").isdigit():
        return int(raw)
    return "@" + raw.lstrip("@")


REVIEWS_CHANNEL = _parse_channel(os.getenv("REVIEWS_CHANNEL", "@Yuan_Go"))

if not BOT_TOKEN:
    raise SystemExit("BOT_TOKEN topilmadi. .env faylini tekshiring.")


def ensure_https_webapp_url() -> str:
    global WEBAPP_URL
    if WEBAPP_URL.lower().startswith("https://"):
        return WEBAPP_URL

    if not NGROK_AUTHTOKEN:
        return WEBAPP_URL

    from pyngrok import conf, ngrok

    conf.get_default().auth_token = NGROK_AUTHTOKEN
    tunnel = ngrok.connect(PORT, "http")
    WEBAPP_URL = tunnel.public_url
    if WEBAPP_URL.startswith("http://"):
        WEBAPP_URL = "https://" + WEBAPP_URL.removeprefix("http://")
    print(f"Ngrok tunnel: {WEBAPP_URL}")
    return WEBAPP_URL


WEBAPP_URL = ensure_https_webapp_url()
WEBAPP_READY = WEBAPP_URL.lower().startswith("https://")

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB
bot = telebot.TeleBot(BOT_TOKEN, parse_mode=None)

RATE_UZS = 1840
MIN_CNY = 30
MAX_CNY = 500
HISTORY_PAGE_SIZE = 3

# ---------------------------------------------------------------- I18N

def load_i18n() -> dict:
    """Tillar locales/*.json dan yuklanadi."""
    folder = BASE_DIR / "locales"
    data = {}
    for lang in ("uz", "ru", "en"):
        path = folder / f"{lang}.json"
        if not path.exists():
            raise SystemExit(f"Til fayli topilmadi: {path}")
        with open(path, encoding="utf-8") as f:
            data[lang] = json.load(f)
    return data


I18N = load_i18n()

LANG_NAMES = {"uz": "🇺🇿 O'zbekcha", "ru": "🇷🇺 Русский", "en": "🇬🇧 English"}


def labels(key: str) -> set:
    return {I18N[lang][key] for lang in I18N}


# Ro'yxatdan o'tish / sharh holati endi DB da (reg_step, review_state).
# Passenger multi-worker da xotira dict ishlamaydi.

def migrate_legacy_users() -> None:
    """Eski users.json faylini SQLite bazaga ko'chiradi."""
    if not LEGACY_USERS_FILE.exists():
        return
    try:
        data = json.loads(LEGACY_USERS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return

    for chat_id, info in data.items():
        try:
            telegram_id = int(chat_id)
        except ValueError:
            continue
        db.ensure_user(telegram_id)
        parts = (info.get("name") or "").split()
        db.update_user(
            telegram_id,
            first_name=parts[0] if parts else "",
            last_name=" ".join(parts[1:]),
            phone=info.get("phone", ""),
            lang=info.get("lang", "uz"),
            registered=1 if info.get("registered") else 0,
        )
    LEGACY_USERS_FILE.rename(LEGACY_USERS_FILE.with_suffix(".json.bak"))
    print("users.json bazaga ko'chirildi.")


migrate_legacy_users()


def full_name(user: dict) -> str:
    return f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()


def is_registered(chat_id) -> bool:
    user = db.get_user(int(chat_id))
    return bool(user and user.get("registered"))


def t(chat_id, key: str) -> str:
    user = db.get_user(int(chat_id))
    lang = user.get("lang", "uz") if user else "uz"
    return I18N.get(lang, I18N["uz"])[key]


def live_rate_settings() -> dict:
    s = db.get_settings()
    return {
        "rate": int(float(s.get("rate_uzs") or RATE_UZS)),
        "min": int(float(s.get("min_cny") or MIN_CNY)),
        "max": int(float(s.get("max_cny") or MAX_CNY)),
        "hours": s.get("work_hours") or "07:00–23:00",
        "commission": s.get("commission") or "0%",
    }


def fmt_uzs(cny: int) -> str:
    rate = live_rate_settings()["rate"]
    return f"{cny * rate:,}".replace(",", " ")


# ---------------------------------------------------------------- Keyboards

def main_keyboard(chat_id) -> types.ReplyKeyboardMarkup:
    """Asosiy reply markup — rolga qarab ochilish tugmalari bilan."""
    user = db.get_user(int(chat_id)) or {}
    lang = user.get("lang", "uz")
    tr = I18N[lang]
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True)

    sync_owner(chat_id)
    if is_super(chat_id):
        keyboard.row(
            types.KeyboardButton(
                text="👑 Super Admin",
                web_app=types.WebAppInfo(url=f"{WEBAPP_URL}/admin?tg_id={chat_id}"),
            )
        )
        keyboard.row(
            types.KeyboardButton(
                text="🛡 Admin",
                web_app=types.WebAppInfo(url=f"{WEBAPP_URL}/admin-app?tg_id={chat_id}"),
            ),
            types.KeyboardButton(
                text="💱 Foydalanuvchi",
                web_app=types.WebAppInfo(url=f"{WEBAPP_URL}/?tg_id={chat_id}"),
            ),
        )
    elif is_operator(chat_id):
        keyboard.row(
            types.KeyboardButton(
                text="🛡 Admin",
                web_app=types.WebAppInfo(url=f"{WEBAPP_URL}/admin-app?tg_id={chat_id}"),
            ),
            types.KeyboardButton(
                text="💱 Foydalanuvchi",
                web_app=types.WebAppInfo(url=f"{WEBAPP_URL}/?tg_id={chat_id}"),
            ),
        )
    else:
        keyboard.row(
            types.KeyboardButton(
                text=tr["btn_buy"],
                web_app=types.WebAppInfo(url=f"{WEBAPP_URL}?tg_id={chat_id}"),
            )
        )

    keyboard.row(
        types.KeyboardButton(text=tr["btn_history"]),
        types.KeyboardButton(text=tr["btn_rate"]),
    )
    keyboard.row(
        types.KeyboardButton(text=tr["btn_qr"]),
        types.KeyboardButton(text=tr["btn_contact"]),
    )
    keyboard.row(types.KeyboardButton(text=tr["btn_settings"]))
    return keyboard


def lang_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup()
    for code, name in LANG_NAMES.items():
        keyboard.add(types.InlineKeyboardButton(name, callback_data=f"lang:{code}"))
    return keyboard


def phone_keyboard(chat_id) -> types.ReplyKeyboardMarkup:
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    keyboard.add(
        types.KeyboardButton(text=t(chat_id, "share_phone"), request_contact=True)
    )
    return keyboard


def https_required_text() -> str:
    return (
        "Mini App ochish uchun HTTPS manzil kerak.\n\n"
        ".env fayliga NGROK_AUTHTOKEN qo‘ying yoki WEBAPP_URL ni https://... qiling,\n"
        "keyin python main.py ni qayta ishga tushiring."
    )


def sync_owner(chat_id: int) -> None:
    """Egasi doim super admin."""
    if int(chat_id) == OWNER_TELEGRAM_ID:
        db.update_user(chat_id, is_admin=1, is_super_admin=1)


def is_owner(chat_id: int) -> bool:
    return int(chat_id) == OWNER_TELEGRAM_ID


def is_super(chat_id: int) -> bool:
    if is_owner(chat_id):
        return True
    user = db.get_user(int(chat_id))
    return bool(user and user.get("is_super_admin"))


def is_operator(chat_id: int) -> bool:
    """Oddiy admin yoki super admin."""
    if is_super(chat_id):
        return True
    user = db.get_user(int(chat_id))
    return bool(user and user.get("is_admin"))


def send_start_menu(chat_id: int, text: str | None = None) -> None:
    sync_owner(chat_id)
    user = db.get_user(chat_id)
    if is_super(chat_id):
        msg = text or "👋 <b>Xush kelibsiz!</b>\n\nPastdagi tugmalardan rolni tanlang:"
    elif is_operator(chat_id):
        msg = text or "🛡 <b>Admin</b>\n\nPastdagi tugmalardan tanlang:"
    else:
        name = full_name(user) if user else ""
        msg = text or (
            t(chat_id, "welcome_back").format(name=name)
            if is_registered(chat_id)
            else "💱 <b>Yuan Go</b>"
        )
    bot.send_message(chat_id, msg, parse_mode="HTML", reply_markup=main_keyboard(chat_id))


# ---------------------------------------------------------------- Registration

def _prompt_language(chat_id: int, for_operator: bool = False) -> None:
    """Til tanlash — faqat step yangi o'zgaganda yoki foydalanuvchi /start qilganda."""
    text = (
        "🌐 Foydalanuvchi uchun tilni tanlang · Выберите язык · Choose a language:"
        if for_operator
        else "🌐 Tilni tanlang · Выберите язык · Choose a language:"
    )
    bot.send_message(chat_id, text, reply_markup=lang_keyboard())


def continue_registration(chat_id: int, *, for_operator: bool = False) -> None:
    """Ro'yxatdan o'tishni DB dagi bosqichdan davom ettirish (multi-worker xavfsiz)."""
    step = db.get_reg_step(chat_id)
    if step in ("name", "edit_name"):
        bot.send_message(chat_id, t(chat_id, "ask_name"), parse_mode="HTML")
        return
    if step in ("phone", "edit_phone"):
        bot.send_message(
            chat_id,
            t(chat_id, "ask_phone"),
            reply_markup=phone_keyboard(chat_id),
        )
        return
    # lang yoki bo'sh
    if step != "lang":
        db.set_reg_step(chat_id, "lang")
    _prompt_language(chat_id, for_operator=for_operator)


@bot.message_handler(commands=["reregister", "qayta"])
def cmd_reregister(message: types.Message) -> None:
    """Mavjud akkauntda qayta ro'yxatdan o'tishni sinash (test)."""
    chat_id = message.chat.id
    db.ensure_user(
        chat_id,
        message.from_user.username if message.from_user else "",
    )
    db.reset_registration(chat_id)
    bot.send_message(
        chat_id,
        "🔄 Ro‘yxat tozalandi.\n"
        "Qayta boshlaymiz — tilni tanlang.\n\n"
        "<i>Test buyrug‘i: /reregister yoki /qayta</i>",
        parse_mode="HTML",
        reply_markup=types.ReplyKeyboardRemove(),
    )
    continue_registration(chat_id, for_operator=is_operator(chat_id))


@bot.message_handler(commands=["start"])
def cmd_start(message: types.Message) -> None:
    chat_id = message.chat.id
    username = message.from_user.username if message.from_user else ""
    db.ensure_user(chat_id, username or "")
    sync_owner(chat_id)

    if not WEBAPP_READY:
        bot.send_message(chat_id, https_required_text())
        return

    # Admin / super admin — darhol rol tugmalari
    if is_operator(chat_id):
        send_start_menu(chat_id)
        if not is_registered(chat_id):
            continue_registration(chat_id, for_operator=True)
        return

    # Oddiy foydalanuvchi
    if is_registered(chat_id):
        db.clear_reg_step(chat_id)
        send_start_menu(chat_id)
        return

    # Yangi foydalanuvchi — darhol 5 CNY bonus xabari
    bot.send_message(
        chat_id,
        t(chat_id, "promo_welcome_new"),
        parse_mode="HTML",
    )
    continue_registration(chat_id)


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("lang:"))
def cb_language(call: types.CallbackQuery) -> None:
    chat_id = call.message.chat.id
    lang = call.data.split(":", 1)[1]
    if lang not in I18N:
        bot.answer_callback_query(call.id)
        return

    db.ensure_user(chat_id)
    db.update_user(chat_id, lang=lang)

    bot.answer_callback_query(call.id, LANG_NAMES[lang])
    try:
        bot.edit_message_text(
            f"🌐 {LANG_NAMES[lang]}",
            chat_id=chat_id,
            message_id=call.message.message_id,
        )
    except Exception:
        pass

    if is_registered(chat_id):
        db.clear_reg_step(chat_id)
        bot.send_message(
            chat_id,
            t(chat_id, "lang_changed").format(lang_name=LANG_NAMES[lang]),
            parse_mode="HTML",
            reply_markup=main_keyboard(chat_id),
        )
        return

    db.set_reg_step(chat_id, "name")
    bot.send_message(chat_id, t(chat_id, "ask_name"), parse_mode="HTML")


@bot.message_handler(
    func=lambda m: db.get_reg_step(m.chat.id) in ("name", "edit_name")
)
def reg_name(message: types.Message) -> None:
    chat_id = message.chat.id
    name = (message.text or "").strip()
    if len(name) < 3 or len(name.split()) < 2:
        bot.send_message(chat_id, t(chat_id, "name_invalid"))
        return

    parts = name.split()
    db.update_user(
        chat_id,
        first_name=parts[0],
        last_name=" ".join(parts[1:]),
    )

    editing = db.get_reg_step(chat_id) == "edit_name"
    db.set_reg_step(chat_id, "edit_phone" if editing else "phone")
    bot.send_message(
        chat_id,
        t(chat_id, "ask_phone"),
        reply_markup=phone_keyboard(chat_id),
    )


@bot.message_handler(
    content_types=["contact"],
    func=lambda m: db.get_reg_step(m.chat.id) in ("phone", "edit_phone"),
)
def reg_phone_contact(message: types.Message) -> None:
    finish_registration(message.chat.id, message.contact.phone_number)


@bot.message_handler(
    func=lambda m: db.get_reg_step(m.chat.id) in ("phone", "edit_phone")
)
def reg_phone_text(message: types.Message) -> None:
    chat_id = message.chat.id
    phone = (message.text or "").strip()
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 9:
        bot.send_message(chat_id, t(chat_id, "phone_invalid"))
        return
    finish_registration(chat_id, phone)


def finish_registration(chat_id, phone: str) -> None:
    if not phone.startswith("+"):
        phone = "+" + re.sub(r"\D", "", phone)

    editing = db.get_reg_step(chat_id) == "edit_phone" and is_registered(chat_id)
    db.update_user(chat_id, phone=phone, registered=1)
    db.clear_reg_step(chat_id)
    sync_owner(chat_id)

    user = db.get_user(chat_id)
    key = "info_updated" if editing else "registered"
    bot.send_message(
        chat_id,
        t(chat_id, key).format(
            name=full_name(user),
            uid=user["unique_id"],
            phone=user["phone"],
        ),
        parse_mode="HTML",
        reply_markup=main_keyboard(chat_id),
    )


def require_registration(message: types.Message) -> bool:
    if is_registered(message.chat.id):
        return True
    bot.send_message(
        message.chat.id,
        t(message.chat.id, "need_register"),
        parse_mode="HTML",
        reply_markup=types.ReplyKeyboardRemove(),
    )
    return False


# ---------------------------------------------------------------- Settings

@bot.message_handler(func=lambda m: m.text in labels("btn_settings"))
def cmd_settings(message: types.Message) -> None:
    if not require_registration(message):
        return
    chat_id = message.chat.id
    user = db.get_user(chat_id)
    keyboard = types.InlineKeyboardMarkup()
    keyboard.add(
        types.InlineKeyboardButton(t(chat_id, "change_lang"), callback_data="set:lang")
    )
    keyboard.add(
        types.InlineKeyboardButton(t(chat_id, "edit_info"), callback_data="set:edit")
    )
    bot.send_message(
        chat_id,
        t(chat_id, "settings_text").format(
            name=full_name(user),
            uid=user["unique_id"],
            phone=user["phone"],
            lang_name=LANG_NAMES.get(user["lang"], user["lang"]),
        ),
        parse_mode="HTML",
        reply_markup=keyboard,
    )


@bot.callback_query_handler(func=lambda c: c.data == "set:lang")
def cb_settings_lang(call: types.CallbackQuery) -> None:
    bot.answer_callback_query(call.id)
    bot.send_message(
        call.message.chat.id,
        t(call.message.chat.id, "choose_lang"),
        reply_markup=lang_keyboard(),
    )


@bot.callback_query_handler(func=lambda c: c.data == "set:edit")
def cb_settings_edit(call: types.CallbackQuery) -> None:
    chat_id = call.message.chat.id
    bot.answer_callback_query(call.id)
    db.set_reg_step(chat_id, "edit_name")
    bot.send_message(chat_id, t(chat_id, "ask_name"), parse_mode="HTML")


# ---------------------------------------------------------------- History

def _user_history(chat_id) -> list[dict]:
    return db.user_txs(int(chat_id))


def history_page_count(chat_id) -> int:
    total = len(_user_history(chat_id))
    return max(1, -(-total // HISTORY_PAGE_SIZE)) if total else 1


def history_page_text(chat_id, page: int) -> str:
    items_all = _user_history(chat_id)
    total_pages = history_page_count(chat_id)
    start = page * HISTORY_PAGE_SIZE
    items = items_all[start : start + HISTORY_PAGE_SIZE]

    lines = [f"{t(chat_id, 'history_title')}  ({page + 1}/{total_pages})", ""]
    for tx in items:
        status = t(chat_id, f"status_{tx['status']}")
        created = tx.get("created_at") or ""
        lines.append(
            f"{status}\n"
            f"🆔 <b>{tx['tx_id']}</b>\n"
            f"💴 {tx['cny']:g} CNY · 💵 {fmt_uzs(int(tx['cny']))} UZS\n"
            f"📅 <i>{created}</i>"
        )
        lines.append("")

    done = sum(1 for item in items_all if item["status"] == "done")
    lines.append(
        t(chat_id, "history_total").format(total=len(items_all), done=done)
    )
    return "\n".join(lines)


def history_keyboard(chat_id, page: int) -> types.InlineKeyboardMarkup | None:
    total_pages = history_page_count(chat_id)
    if total_pages <= 1:
        return None

    buttons = []
    if page > 0:
        buttons.append(
            types.InlineKeyboardButton(
                t(chat_id, "prev"), callback_data=f"hist:{page - 1}"
            )
        )
    if page < total_pages - 1:
        buttons.append(
            types.InlineKeyboardButton(
                t(chat_id, "next"), callback_data=f"hist:{page + 1}"
            )
        )

    keyboard = types.InlineKeyboardMarkup()
    keyboard.row(*buttons)
    return keyboard


@bot.message_handler(func=lambda m: m.text in labels("btn_history"))
def cmd_history(message: types.Message) -> None:
    if not require_registration(message):
        return
    chat_id = message.chat.id

    if not _user_history(chat_id):
        bot.send_message(
            chat_id,
            f"{t(chat_id, 'history_title')}\n\n{t(chat_id, 'history_empty')}",
            parse_mode="HTML",
        )
        return

    bot.send_message(
        chat_id,
        history_page_text(chat_id, 0),
        parse_mode="HTML",
        reply_markup=history_keyboard(chat_id, 0),
    )


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("hist:"))
def cb_history_page(call: types.CallbackQuery) -> None:
    chat_id = call.message.chat.id
    try:
        page = int(call.data.split(":", 1)[1])
    except ValueError:
        bot.answer_callback_query(call.id)
        return

    page = max(0, min(page, history_page_count(chat_id) - 1))
    try:
        bot.edit_message_text(
            history_page_text(chat_id, page),
            chat_id=chat_id,
            message_id=call.message.message_id,
            parse_mode="HTML",
            reply_markup=history_keyboard(chat_id, page),
        )
    except Exception:
        pass
    bot.answer_callback_query(call.id)


# ---------------------------------------------------------------- Sections

@bot.message_handler(func=lambda m: m.text in labels("btn_rate"))
def cmd_rate(message: types.Message) -> None:
    if not require_registration(message):
        return
    chat_id = message.chat.id
    now = datetime.now().strftime("%d.%m.%Y %H:%M")
    cfg = live_rate_settings()
    bot.send_message(
        chat_id,
        t(chat_id, "rate_text").format(
            rate=f"{cfg['rate']:,}".replace(",", " "),
            min=cfg["min"],
            max=cfg["max"],
            now=now,
        ),
        parse_mode="HTML",
    )


@bot.message_handler(func=lambda m: m.text in labels("btn_qr"))
def cmd_qr(message: types.Message) -> None:
    if not require_registration(message):
        return
    chat_id = message.chat.id
    keyboard = None
    if WEBAPP_READY:
        keyboard = types.InlineKeyboardMarkup()
        keyboard.add(
            types.InlineKeyboardButton(
                text=t(chat_id, "qr_open"),
                web_app=types.WebAppInfo(url=f"{WEBAPP_URL}?screen=qrs&tg_id={chat_id}"),
            )
        )
    bot.send_message(
        chat_id,
        t(chat_id, "qr_text"),
        parse_mode="HTML",
        reply_markup=keyboard,
    )


@bot.message_handler(func=lambda m: m.text in labels("btn_contact"))
def cmd_contact(message: types.Message) -> None:
    if not require_registration(message):
        return
    chat_id = message.chat.id
    keyboard = types.InlineKeyboardMarkup()
    keyboard.add(
        types.InlineKeyboardButton(
            text=t(chat_id, "contact_write"),
            url=f"https://t.me/{OPERATOR_USERNAME}",
        )
    )
    bot.send_message(
        chat_id,
        t(chat_id, "contact_text").format(operator=OPERATOR_USERNAME),
        parse_mode="HTML",
        reply_markup=keyboard,
    )


@bot.message_handler(func=lambda m: m.text in labels("btn_buy"))
def cmd_buy_unregistered(message: types.Message) -> None:
    # Ro'yxatdan o'tganlarda bu tugma web_app sifatida ochiladi va matn kelmaydi.
    require_registration(message)


@bot.message_handler(commands=["app"])
def cmd_app(message: types.Message) -> None:
    if not WEBAPP_READY:
        bot.send_message(message.chat.id, https_required_text())
        return
    if not require_registration(message):
        return

    keyboard = types.InlineKeyboardMarkup()
    keyboard.add(
        types.InlineKeyboardButton(
            text=t(message.chat.id, "btn_buy"),
            web_app=types.WebAppInfo(url=f"{WEBAPP_URL}?tg_id={message.chat.id}"),
        )
    )
    bot.send_message(message.chat.id, "Yuan Go:", reply_markup=keyboard)


# ---------------------------------------------------------------- Web & API

@app.get("/")
def index():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.after_request
def no_cache(response):
    """Telegram webview eski keshni ishlatmasligi uchun."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response

def _stable_webhook_secret() -> str:
    """Har workerda bir xil webhook yo'li — aks holda /start ikki marta kelishi mumkin."""
    env_secret = os.getenv("WEBHOOK_SECRET", "").strip()
    if env_secret:
        return env_secret
    path = BASE_DIR / ".webhook_secret"
    if path.exists():
        saved = path.read_text(encoding="utf-8").strip()
        if saved:
            return saved
    secret = secrets.token_hex(16)
    try:
        path.write_text(secret, encoding="utf-8")
    except OSError as exc:
        print(f"Webhook secret faylga yozilmadi: {exc}")
    return secret


WEBHOOK_SECRET = _stable_webhook_secret()
WEBHOOK_PATH = f"/bot/webhook/{WEBHOOK_SECRET}"


@app.post(WEBHOOK_PATH)
def telegram_webhook():
    json_str = request.get_data().decode("utf-8")
    update = telebot.types.Update.de_json(json_str)
    if update is None:
        return "", 200
    # Telegram qayta yuborgan update ikki marta ishlanmasin
    if getattr(update, "update_id", None) is not None:
        if not db.claim_telegram_update(update.update_id):
            return "", 200
    bot.process_new_updates([update])
    return "", 200

@app.get("/api/health")
def health():
    return jsonify(ok=True, app="Yuan Go", webapp_url=WEBAPP_URL)


@app.get("/api/me")
def api_me():
    tg_id = request.args.get("tg_id", type=int)
    if not tg_id:
        return jsonify(ok=False, error="tg_id required"), 400

    user = db.get_user(tg_id)
    if not user or not user.get("registered"):
        return jsonify(ok=True, registered=False)

    return jsonify(
        ok=True,
        registered=True,
        user={
            "unique_id": user["unique_id"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "phone": user["phone"],
            "lang": user["lang"],
        },
    )


@app.post("/api/me")
def api_me_update():
    data = request.get_json(silent=True) or {}
    tg_id = data.get("tg_id")
    if not tg_id:
        return jsonify(ok=False, error="tg_id required"), 400

    tg_id = int(tg_id)
    db.ensure_user(tg_id)
    fields = {
        key: str(data[key]).strip()
        for key in ("first_name", "last_name", "phone", "lang")
        if data.get(key)
    }
    if fields.get("lang") not in (None, *I18N.keys()):
        fields.pop("lang", None)
    db.update_user(tg_id, **fields)
    return jsonify(ok=True)


@app.post("/api/notify")
def api_notify():
    data = request.get_json(silent=True) or {}
    tg_id = data.get("tg_id")
    tx_id = data.get("tx_id")
    if not tg_id or not tx_id:
        return jsonify(ok=False, error="tg_id and tx_id required"), 400

    chat_id = int(tg_id)
    try:
        bot.send_message(
            chat_id,
            t(chat_id, "notify_tx").format(
                tx_id=tx_id,
                cny=data.get("cny", "-"),
                uzs=data.get("uzs", "-"),
            ),
            parse_mode="HTML",
        )
    except Exception as exc:
        return jsonify(ok=False, error=str(exc)), 500
    return jsonify(ok=True)


# ---------------------------------------------------------------- Uploads & Transactions API

def safe_upload_path(url_or_name: str) -> Path | None:
    if not url_or_name:
        return None
    name = Path(str(url_or_name)).name
    if not name or name.startswith(".") or "/" in name or "\\" in name:
        return None
    path = UPLOADS_DIR / name
    try:
        path.resolve().relative_to(UPLOADS_DIR.resolve())
    except ValueError:
        return None
    return path


def delete_upload_file(url_or_name: str) -> bool:
    path = safe_upload_path(url_or_name)
    if not path or not path.exists() or not path.is_file():
        return False
    try:
        path.unlink()
        return True
    except OSError as exc:
        print(f"Upload o'chirish xato ({path.name}): {exc}")
        return False


def user_upload_files(tg_id: int) -> list[Path]:
    return [p for p in UPLOADS_DIR.glob(f"{int(tg_id)}_*") if p.is_file()]


def enforce_user_upload_quota(tg_id: int) -> None:
    """Foydalanuvchi fayllari 10 MB dan oshsa eng eski (avvalo yopiq) fayllarni o'chiradi."""
    files = user_upload_files(tg_id)
    if not files:
        return
    refs = db.user_media_refs(int(tg_id))

    def sort_key(path: Path):
        status = refs.get(path.name, "")
        # progress oxirida o'chiriladi; done/cancelled/orphan birinchi
        keep_last = 1 if status == "progress" else 0
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0
        return (keep_last, mtime)

    files.sort(key=sort_key)
    total = 0
    for path in files:
        try:
            total += path.stat().st_size
        except OSError:
            pass

    removed = 0
    while total > USER_UPLOAD_LIMIT_BYTES and files:
        victim = files.pop(0)
        try:
            size = victim.stat().st_size
        except OSError:
            size = 0
        if delete_upload_file(victim.name):
            db.clear_media_filename_refs(victim.name)
            total = max(0, total - size)
            removed += 1
    if removed:
        print(f"Upload quota: tg_id={tg_id}, removed={removed}, left~{total}B")


def cleanup_closed_tx_media() -> int:
    """done/cancelled tranzaksiya rasmlarini 7 kundan keyin o'chiradi."""
    cutoff = (datetime.now() - timedelta(days=RECEIPT_RETENTION_DAYS)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    cleaned = 0
    for tx in db.closed_txs_with_media_before(cutoff):
        for field in ("receipt", "qr", "admin_receipt"):
            delete_upload_file(tx.get(field) or "")
        db.clear_tx_media(tx["tx_id"])
        cleaned += 1
    return cleaned


def cleanup_orphan_uploads() -> int:
    """Hech qanday TX ga bog'lanmagan va 7 kundan eski fayllarni o'chiradi."""
    referenced = db.all_media_filenames()
    cutoff_ts = (datetime.now() - timedelta(days=RECEIPT_RETENTION_DAYS)).timestamp()
    removed = 0
    for path in UPLOADS_DIR.iterdir():
        if not path.is_file():
            continue
        if path.name in referenced:
            continue
        try:
            if path.stat().st_mtime > cutoff_ts:
                continue
            path.unlink()
            removed += 1
        except OSError:
            pass
    return removed


def run_storage_cleanup() -> None:
    try:
        closed = cleanup_closed_tx_media()
        orphans = cleanup_orphan_uploads()
        if closed or orphans:
            print(f"Storage cleanup: closed_txs={closed}, orphans={orphans}")
    except Exception as exc:
        print(f"Storage cleanup xato: {exc}")


def start_storage_cleanup_loop() -> None:
    def loop():
        run_storage_cleanup()
        while True:
            threading.Event().wait(3600)  # har soat
            run_storage_cleanup()

    threading.Thread(target=loop, daemon=True).start()


@app.get("/uploads/<path:filename>")
def serve_upload(filename: str):
    return send_from_directory(UPLOADS_DIR, filename)


@app.post("/api/upload")
def api_upload():
    """Chek/QR rasmini alohida yuklash (katta JSON muammosini oldini olish)."""
    tg_id = _request_tg_id()
    if not tg_id:
        return jsonify(ok=False, error="tg_id required"), 400

    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify(ok=False, error="file required"), 400

    # Bitta fayl hajmini cheklash
    file.stream.seek(0, 2)
    size = file.stream.tell()
    file.stream.seek(0)
    if size <= 0:
        return jsonify(ok=False, error="empty file"), 400
    if size > MAX_SINGLE_UPLOAD_BYTES:
        return jsonify(ok=False, error="file too large (max 5MB)"), 400

    raw_ext = Path(file.filename).suffix.lower()
    ext = raw_ext if raw_ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"} else ".jpg"
    name = f"{tg_id}_{secrets.token_hex(8)}{ext}"
    file.save(UPLOADS_DIR / name)
    enforce_user_upload_quota(tg_id)
    return jsonify(ok=True, url=f"/uploads/{name}")


@app.post("/api/tx")
def api_tx_create():
    """Mini App'dan yangi tranzaksiyani qabul qilish."""
    data = request.get_json(silent=True)
    if data is None:
        # Juda katta base64 JSON yoki boshqa parse xatosi
        print(f"[api/tx] JSON parse xatosi, content-length={request.content_length}")
        return jsonify(ok=False, error="invalid json — upload images separately"), 400

    tg_id = _request_tg_id()
    if not tg_id:
        try:
            tg_id = int(data.get("tg_id") or 0) or None
        except (TypeError, ValueError):
            tg_id = None
    if not tg_id:
        return jsonify(ok=False, error="tg_id required"), 400
    tx_id = data.get("tx_id")
    if not tx_id:
        return jsonify(ok=False, error="tx_id required"), 400

    status = str(data.get("status") or "progress")
    if status not in ("progress", "done", "cancelled"):
        status = "progress"

    created_at = str(data.get("created_at") or "")
    if created_at:
        # ISO formatni bazadagi formatga keltirish
        try:
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00")).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
        except ValueError:
            created_at = ""

    # Base64 rasmni JSON orqali qabul qilmaymiz — faqat URL yoki bo'sh
    receipt = str(data.get("receipt") or "")
    qr = str(data.get("qr") or "")
    if receipt.startswith("data:"):
        receipt = ""
    if qr.startswith("data:"):
        qr = ""

    db.create_tx(
        tx_id=str(tx_id),
        telegram_id=int(tg_id),
        cny=float(data.get("cny") or 0),
        uzs=float(data.get("uzs") or 0),
        card=str(data.get("card") or ""),
        receipt=receipt,
        qr=qr,
        status=status,
        created_at=created_at,
    )
    print(f"[api/tx] yaratildi {tx_id} user={tg_id} status={status}")
    if status == "progress":
        payload = {
            "tx_id": str(tx_id),
            "telegram_id": int(tg_id),
            "cny": float(data.get("cny") or 0),
            "uzs": float(data.get("uzs") or 0),
            "card": str(data.get("card") or ""),
        }
        threading.Thread(
            target=notify_admins_new_tx, args=(payload,), daemon=True
        ).start()
    return jsonify(ok=True)


def notify_admins_new_tx(tx: dict) -> None:
    """Yangi o'tkazma haqida barcha adminlarga xabar."""
    user = db.get_user(int(tx["telegram_id"])) or {}
    name = full_name(user) or "Noma'lum"
    username = f" · @{user['username']}" if user.get("username") else ""
    phone = user.get("phone") or "—"
    cny = f"{tx['cny']:g}"
    uzs = f"{tx['uzs']:,.0f}".replace(",", " ")
    card = tx.get("card") or "—"

    for admin_id in db.list_admin_chat_ids(OWNER_TELEGRAM_ID):
        try:
            text = t(admin_id, "notify_admin_tx").format(
                tx_id=tx["tx_id"],
                name=name,
                username=username,
                phone=phone,
                cny=cny,
                uzs=uzs,
                card=card,
            )
            kb = types.InlineKeyboardMarkup()
            if is_super(admin_id):
                panel_url = f"{WEBAPP_URL}/admin?tg_id={admin_id}"
            else:
                panel_url = f"{WEBAPP_URL}/admin-app?tg_id={admin_id}"
            if WEBAPP_READY:
                kb.add(
                    types.InlineKeyboardButton(
                        text=t(admin_id, "notify_admin_open"),
                        web_app=types.WebAppInfo(url=panel_url),
                    )
                )
            bot.send_message(
                admin_id,
                text,
                parse_mode="HTML",
                reply_markup=kb if WEBAPP_READY else None,
            )
        except Exception as exc:
            print(f"Admin TX notify xatosi ({admin_id}): {exc}")


def notify_admins_tx_result(
    tx: dict,
    status: str,
    reason: str = "",
    by_admin_id: int | None = None,
) -> None:
    """Tasdiqlash / bekor qilish haqida barcha adminlarga xabar."""
    user = db.get_user(int(tx["telegram_id"])) or {}
    name = full_name(user) or "Noma'lum"
    username = f" · @{user['username']}" if user.get("username") else ""
    cny = f"{float(tx.get('cny') or 0):g}"
    uzs = f"{float(tx.get('uzs') or 0):,.0f}".replace(",", " ")
    by_admin = "Admin"
    if by_admin_id:
        admin_user = db.get_user(int(by_admin_id)) or {}
        by_admin = full_name(admin_user) or str(by_admin_id)

    key = "notify_admin_done" if status == "done" else "notify_admin_cancelled"
    for admin_id in db.list_admin_chat_ids(OWNER_TELEGRAM_ID):
        try:
            text = t(admin_id, key).format(
                tx_id=tx["tx_id"],
                name=name,
                username=username,
                cny=cny,
                uzs=uzs,
                reason=reason or "—",
                by_admin=by_admin,
            )
            bot.send_message(admin_id, text, parse_mode="HTML")
        except Exception as exc:
            print(f"Admin TX result notify xatosi ({admin_id}): {exc}")


@app.get("/api/tx")
def api_tx_list():
    """Foydalanuvchining tranzaksiya statuslari (Mini App sinxron uchun)."""
    tg_id = request.args.get("tg_id", type=int)
    if not tg_id:
        return jsonify(ok=False, error="tg_id required"), 400
    return jsonify(ok=True, transactions=db.user_txs(tg_id))


@app.get("/api/purchases")
def api_public_purchases():
    """Bosh sahifa uchun umumiy muvaffaqiyatli xaridlar."""
    limit = request.args.get("limit", default=20, type=int)
    limit = max(1, min(limit or 20, 50))
    items = []
    for tx in db.list_txs(status="done", limit=limit):
        items.append(
            {
                "tx_id": tx["tx_id"],
                "cny": tx["cny"],
                "uzs": tx["uzs"],
                "created_at": tx["created_at"],
                "first_name": tx.get("first_name") or "",
                "last_name": tx.get("last_name") or "",
            }
        )
    return jsonify(ok=True, purchases=items)


# ---------------------------------------------------------------- Admin API / Telegram WebApp auth

def verify_telegram_init_data(init_data: str, max_age_sec: int = 86400) -> dict | None:
    """Telegram Mini App initData imzosini tekshiradi. Muvaffaqiyatda user dict."""
    if not init_data or not BOT_TOKEN:
        return None
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    except (TypeError, ValueError):
        return None
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode("utf-8"), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc_hash, received_hash):
        return None
    try:
        auth_date = int(parsed.get("auth_date") or 0)
    except (TypeError, ValueError):
        return None
    if not auth_date or (time.time() - auth_date) > max_age_sec:
        return None
    user_raw = parsed.get("user")
    if not user_raw:
        return None
    try:
        user = json.loads(user_raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(user, dict) or not user.get("id"):
        return None
    return user


def _request_init_data() -> str:
    return (
        request.headers.get("X-Telegram-Init-Data")
        or request.headers.get("X-Telegram-Init-Data".lower())
        or request.args.get("initData")
        or ""
    ).strip()


def _verified_telegram_user() -> dict | None:
    return verify_telegram_init_data(_request_init_data())


def _request_tg_id() -> int | None:
    """Avval imzolangan initData, bo'lmasa ?tg_id / form / JSON (Mini App qulayligi uchun)."""
    tg_user = _verified_telegram_user()
    if tg_user:
        try:
            return int(tg_user.get("id") or 0) or None
        except (TypeError, ValueError):
            pass
    tg_id = request.args.get("tg_id", type=int)
    if tg_id:
        return tg_id
    form_id = request.form.get("tg_id")
    if form_id:
        try:
            return int(form_id) or None
        except (TypeError, ValueError):
            pass
    data = request.get_json(silent=True) or {}
    try:
        return int(data.get("tg_id") or 0) or None
    except (TypeError, ValueError):
        return None


def _admin_user() -> dict | None:
    """Admin paneli: initData yoki bot ochgan ?tg_id."""
    tg_id = _request_tg_id()
    if not tg_id:
        return None
    tg_user = _verified_telegram_user()
    username = str((tg_user or {}).get("username") or "")
    db.ensure_user(tg_id, username)
    sync_owner(tg_id)
    user = db.get_user(tg_id)
    if not user:
        return None
    if is_owner(tg_id) or user.get("is_super_admin") or user.get("is_admin"):
        return user
    return None


def _check_admin() -> int | None:
    user = _admin_user()
    return int(user["telegram_id"]) if user else None


def _check_super_admin() -> int | None:
    user = _admin_user()
    if not user:
        return None
    tid = int(user["telegram_id"])
    if is_owner(tid) or user.get("is_super_admin"):
        return tid
    return None


def notify_admins_card_change(action: str, card: dict, by_admin_id: int) -> None:
    """Karta qo'shish / o'zgartirish / o'chirish haqida adminlarga xabar."""
    admin_user = db.get_user(by_admin_id) or {}
    by_name = full_name(admin_user) or str(by_admin_id)
    brand = str(card.get("brand") or "").upper()
    title = card.get("title") or "—"
    digits = re.sub(r"\D", "", str(card.get("number") or ""))
    masked = (
        f"{digits[:4]} **** **** {digits[-4:]}"
        if len(digits) >= 8
        else (card.get("number") or "—")
    )
    action_map = {
        "create": "➕ Karta qo‘shildi",
        "update": "✏️ Karta o‘zgartirildi",
        "delete": "🗑 Karta o‘chirildi",
    }
    title_line = action_map.get(action, "💳 Karta yangilandi")
    text = (
        f"🔐 <b>{title_line}</b>\n\n"
        f"🏷 {title}\n"
        f"💳 {brand} · <code>{masked}</code>\n"
        f"🛡 Admin: {by_name}"
    )
    for admin_id in db.list_admin_chat_ids(OWNER_TELEGRAM_ID):
        try:
            bot.send_message(admin_id, text, parse_mode="HTML")
        except Exception as exc:
            print(f"Card notify xatosi ({admin_id}): {exc}")


@app.get("/admin")
def admin_page():
    """Professional desktop panel — faqat super admin."""
    return send_from_directory(PUBLIC_DIR, "admin.html")


@app.get("/admin-app")
def admin_app_page():
    """Oddiy admin (yuan yuboruvchi) — light Mini App panel."""
    return send_from_directory(PUBLIC_DIR, "admin-app.html")


@app.get("/api/admin/me")
def api_admin_me():
    user = _admin_user()
    if not user:
        return jsonify(ok=False, role=None), 403
    tid = int(user["telegram_id"])
    role = "super" if (is_owner(tid) or user.get("is_super_admin")) else "admin"
    return jsonify(
        ok=True,
        role=role,
        user={
            "telegram_id": user["telegram_id"],
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name", ""),
            "unique_id": user.get("unique_id", ""),
        },
    )


@app.get("/api/admin/operators")
def api_admin_operators_list():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    items = []
    for u in db.list_admins():
        items.append(
            {
                "telegram_id": u["telegram_id"],
                "unique_id": u.get("unique_id", ""),
                "first_name": u.get("first_name", ""),
                "last_name": u.get("last_name", ""),
                "username": u.get("username", ""),
                "phone": u.get("phone", ""),
                "updated_at": u.get("updated_at", ""),
            }
        )
    return jsonify(ok=True, operators=items)


@app.post("/api/admin/operators")
def api_admin_operators_add():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    data = request.get_json(silent=True) or {}
    try:
        telegram_id = int(str(data.get("telegram_id") or "").strip())
    except ValueError:
        return jsonify(ok=False, error="Telegram ID noto'g'ri"), 400
    if telegram_id <= 0:
        return jsonify(ok=False, error="Telegram ID noto'g'ri"), 400
    if telegram_id == OWNER_TELEGRAM_ID:
        return jsonify(ok=False, error="Bu ID allaqachon super admin"), 400

    fio = str(data.get("fio") or "").strip()
    parts = fio.split()
    if len(parts) < 2:
        return jsonify(ok=False, error="FIO ni to'liq kiriting (ism familiya)"), 400
    first_name = parts[0]
    last_name = " ".join(parts[1:])

    existing = db.get_user(telegram_id)
    if existing and existing.get("is_super_admin"):
        return jsonify(ok=False, error="Super adminni o'zgartirib bo'lmaydi"), 400

    user = db.grant_ordinary_admin(telegram_id, first_name, last_name)
    try:
        bot.send_message(
            telegram_id,
            "🛡 <b>Sizga Admin berildi!</b>\n\n"
            "Botga /start yuboring — <b>Admin</b> va <b>Foydalanuvchi</b> tugmalari chiqadi.\n"
            "Siz faqat yuan yuborish (tasdiqlash/bekor) qila olasiz.",
            parse_mode="HTML",
            reply_markup=main_keyboard(telegram_id),
        )
    except Exception as exc:
        print(f"Admin notify xatosi ({telegram_id}): {exc}")

    return jsonify(
        ok=True,
        operator={
            "telegram_id": user["telegram_id"],
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name", ""),
            "unique_id": user.get("unique_id", ""),
        },
    )


@app.post("/api/admin/operators/<int:telegram_id>/revoke")
def api_admin_operators_revoke(telegram_id: int):
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    if telegram_id == OWNER_TELEGRAM_ID:
        return jsonify(ok=False, error="Super adminni olib bo'lmaydi"), 400
    if not db.revoke_ordinary_admin(telegram_id):
        return jsonify(ok=False, error="Admin topilmadi"), 404
    try:
        bot.send_message(
            telegram_id,
            "ℹ️ Admin huquqingiz olib tashlandi. Endi faqat foydalanuvchi sifatida ishlaysiz.",
            reply_markup=main_keyboard(telegram_id),
        )
    except Exception:
        pass
    return jsonify(ok=True)


@app.get("/api/admin/summary")
def api_admin_summary():
    if not _check_admin():
        return jsonify(ok=False, error="forbidden"), 403
    return jsonify(ok=True, summary=db.tx_summary())


@app.get("/api/admin/tx")
def api_admin_tx_list():
    if not _check_admin():
        return jsonify(ok=False, error="forbidden"), 403
    status = request.args.get("status") or None
    return jsonify(ok=True, transactions=db.list_txs(status=status))


@app.get("/api/admin/users")
def api_admin_users():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    users = []
    for u in db.all_users():
        users.append(
            {
                "telegram_id": u["telegram_id"],
                "unique_id": u.get("unique_id", ""),
                "first_name": u.get("first_name", ""),
                "last_name": u.get("last_name", ""),
                "username": u.get("username", ""),
                "phone": u.get("phone", ""),
                "lang": u.get("lang", "uz"),
                "registered": bool(u.get("registered")),
                "reg_step": str(u.get("reg_step") or "").strip(),
                "is_admin": bool(u.get("is_admin")),
                "is_super_admin": bool(u.get("is_super_admin")),
                "created_at": u.get("created_at", ""),
                "updated_at": u.get("updated_at", ""),
            }
        )
    return jsonify(ok=True, users=users)


@app.get("/api/admin/stats")
def api_admin_stats():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    return jsonify(ok=True, stats=db.stats_detailed())


@app.get("/api/admin/settings")
def api_admin_settings_get():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    return jsonify(ok=True, settings=db.get_settings())


@app.post("/api/admin/settings")
def api_admin_settings_set():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    data = request.get_json(silent=True) or {}
    allowed = {"rate_uzs", "min_cny", "max_cny", "work_hours", "commission"}
    values = {k: str(data[k]).strip() for k in allowed if k in data}
    old = db.get_settings()
    new = db.set_settings(values)
    if "rate_uzs" in values:
        old_rate = _as_float(old.get("rate_uzs"))
        new_rate = _as_float(new.get("rate_uzs"))
        if abs(old_rate - new_rate) > 1e-9:
            db.add_rate_history(new_rate)
    changed = _settings_changed(old, new, ("rate_uzs", "min_cny", "max_cny"))
    if changed:
        threading.Thread(
            target=broadcast_settings_change,
            args=(old, new),
            daemon=True,
        ).start()
    return jsonify(ok=True, settings=new, broadcast=changed)


def _as_float(value, default: float = 0.0) -> float:
    try:
        return float(str(value).replace(" ", "").replace(",", "."))
    except (TypeError, ValueError):
        return default


def _fmt_num(value) -> str:
    n = _as_float(value)
    if abs(n - round(n)) < 1e-9:
        return f"{int(round(n)):,}".replace(",", " ")
    return f"{n:,.2f}".replace(",", " ")


def _settings_changed(old: dict, new: dict, keys: tuple) -> bool:
    for key in keys:
        if abs(_as_float(old.get(key)) - _as_float(new.get(key))) > 1e-9:
            return True
    return False


def build_settings_broadcast_text(lang: str, old: dict, new: dict) -> str | None:
    tr = I18N.get(lang, I18N["uz"])
    lines = [tr["settings_broadcast_title"], ""]
    has_change = False

    old_rate, new_rate = _as_float(old.get("rate_uzs")), _as_float(new.get("rate_uzs"))
    if abs(old_rate - new_rate) > 1e-9:
        has_change = True
        key = "settings_rate_up" if new_rate > old_rate else "settings_rate_down"
        arrow = "🔺" if new_rate > old_rate else "🔻"
        lines.append(tr[key])
        lines.append(
            f"💱 1 CNY: <b>{_fmt_num(old_rate)}</b> → <b>{_fmt_num(new_rate)}</b> UZS {arrow}"
        )
        lines.append("")

    old_min, new_min = _as_float(old.get("min_cny")), _as_float(new.get("min_cny"))
    if abs(old_min - new_min) > 1e-9:
        has_change = True
        key = "settings_min_up" if new_min > old_min else "settings_min_down"
        arrow = "🔺" if new_min > old_min else "🔻"
        lines.append(tr[key])
        lines.append(f"⬇️ <b>{_fmt_num(old_min)}</b> → <b>{_fmt_num(new_min)}</b> CNY {arrow}")
        lines.append("")

    old_max, new_max = _as_float(old.get("max_cny")), _as_float(new.get("max_cny"))
    if abs(old_max - new_max) > 1e-9:
        has_change = True
        key = "settings_max_up" if new_max > old_max else "settings_max_down"
        arrow = "🔺" if new_max > old_max else "🔻"
        lines.append(tr[key])
        lines.append(f"⬆️ <b>{_fmt_num(old_max)}</b> → <b>{_fmt_num(new_max)}</b> CNY {arrow}")
        lines.append("")

    if not has_change:
        return None

    lines.append(tr["settings_current"])
    lines.append(f"💱 1 CNY = <b>{_fmt_num(new_rate)} UZS</b>")
    lines.append(
        f"⬇️ Min <b>{_fmt_num(new_min)}</b> · ⬆️ Max <b>{_fmt_num(new_max)}</b> CNY"
    )
    hours = new.get("work_hours") or "07:00–23:00"
    commission = new.get("commission") or "0%"
    lines.append(f"🆓 {commission} · 🕗 {hours}")
    lines.append("")
    lines.append(f"🔄 <i>{datetime.now().strftime('%d.%m.%Y %H:%M')}</i>")
    return "\n".join(lines)


def broadcast_settings_change(old: dict, new: dict) -> None:
    """Barcha bot foydalanuvchilariga sozlamalar o'zgarishini yuboradi."""
    import time

    sent = 0
    failed = 0
    for user in db.all_users():
        chat_id = int(user["telegram_id"])
        lang = user.get("lang") or "uz"
        text = build_settings_broadcast_text(lang, old, new)
        if not text:
            return
        kb = types.InlineKeyboardMarkup()
        kb.add(
            types.InlineKeyboardButton(
                text=I18N.get(lang, I18N["uz"])["settings_open"],
                web_app=types.WebAppInfo(url=f"{WEBAPP_URL}/?tg_id={chat_id}"),
            )
        )
        try:
            bot.send_message(chat_id, text, parse_mode="HTML", reply_markup=kb)
            sent += 1
            time.sleep(0.04)
        except Exception as exc:
            failed += 1
            print(f"Settings broadcast xato ({chat_id}): {exc}")
    print(f"Settings broadcast: sent={sent}, failed={failed}")


def _broadcast_image_path(image_url: str) -> Path | None:
    url = str(image_url or "").strip()
    if not url:
        return None
    if url.startswith("/uploads/"):
        path = UPLOADS_DIR / url.removeprefix("/uploads/")
        return path if path.is_file() else None
    path = Path(url)
    if path.is_file() and UPLOADS_DIR in path.resolve().parents:
        return path
    return None


def send_broadcast_to_all(text: str, image_url: str = "") -> tuple[int, int]:
    """Barcha foydalanuvchilarga matn/rasm yuboradi. (sent, failed)"""
    import time

    body = str(text or "").strip()
    photo_path = _broadcast_image_path(image_url)
    if not body and not photo_path:
        return 0, 0

    sent = 0
    failed = 0
    for user in db.all_users():
        chat_id = int(user["telegram_id"])
        try:
            if photo_path:
                caption = body[:1024] if body else None
                with open(photo_path, "rb") as photo:
                    try:
                        bot.send_photo(
                            chat_id,
                            photo,
                            caption=caption,
                            parse_mode="HTML" if caption else None,
                        )
                    except Exception:
                        photo.seek(0)
                        bot.send_photo(chat_id, photo, caption=caption)
                if body and len(body) > 1024:
                    try:
                        bot.send_message(chat_id, body, parse_mode="HTML")
                    except Exception:
                        bot.send_message(chat_id, body)
            else:
                try:
                    bot.send_message(chat_id, body, parse_mode="HTML")
                except Exception:
                    bot.send_message(chat_id, body)
            sent += 1
            time.sleep(0.04)
        except Exception as exc:
            failed += 1
            print(f"Broadcast xato ({chat_id}): {exc}")
    return sent, failed


def process_broadcast_item(item: dict) -> None:
    sent, failed = send_broadcast_to_all(
        item.get("text") or "",
        item.get("image_url") or "",
    )
    db.mark_broadcast_sent(int(item["id"]), sent, failed)
    print(
        f"Broadcast #{item['id']}: sent={sent}, failed={failed},"
        f" mode={item.get('mode')}"
    )


def run_due_broadcasts() -> None:
    try:
        due = db.claim_due_broadcasts()
        for item in due:
            try:
                process_broadcast_item(item)
            except Exception as exc:
                print(f"Broadcast ishlash xato #{item.get('id')}: {exc}")
    except Exception as exc:
        print(f"Broadcast scheduler xato: {exc}")


def start_broadcast_loop() -> None:
    def loop():
        threading.Event().wait(5)
        while True:
            run_due_broadcasts()
            threading.Event().wait(60)

    threading.Thread(target=loop, daemon=True).start()


@app.get("/api/admin/broadcasts")
def api_admin_broadcasts_list():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    return jsonify(ok=True, broadcasts=db.list_broadcasts())


@app.post("/api/admin/broadcasts")
def api_admin_broadcasts_create():
    admin_id = _check_super_admin()
    if not admin_id:
        return jsonify(ok=False, error="forbidden"), 403
    data = request.get_json(silent=True) or {}
    text = str(data.get("text") or "").strip()
    image_url = str(data.get("image_url") or "").strip()
    mode = str(data.get("mode") or "once").strip().lower()
    try:
        interval_hours = int(data.get("interval_hours") or 0)
    except (TypeError, ValueError):
        interval_hours = 0

    if not text and not image_url:
        return jsonify(ok=False, error="text or image required"), 400
    if mode not in ("once", "interval"):
        return jsonify(ok=False, error="mode invalid"), 400
    if mode == "interval" and not (1 <= interval_hours <= 720):
        return jsonify(ok=False, error="interval_hours must be 1–720"), 400
    if image_url and not _broadcast_image_path(image_url):
        return jsonify(ok=False, error="image not found"), 400

    item = db.create_broadcast(
        text=text,
        image_url=image_url,
        mode=mode,
        interval_hours=interval_hours,
        created_by=admin_id,
        send_now=True,
    )
    threading.Thread(target=run_due_broadcasts, daemon=True).start()
    return jsonify(ok=True, broadcast=item)


@app.post("/api/admin/broadcasts/<int:broadcast_id>/stop")
def api_admin_broadcasts_stop(broadcast_id: int):
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    item = db.stop_broadcast(broadcast_id)
    if not item:
        return jsonify(ok=False, error="not found"), 404
    return jsonify(ok=True, broadcast=item)


@app.delete("/api/admin/broadcasts/<int:broadcast_id>")
def api_admin_broadcasts_delete(broadcast_id: int):
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    if not db.delete_broadcast(broadcast_id):
        return jsonify(ok=False, error="not found"), 404
    return jsonify(ok=True)


@app.get("/api/admin/cards")
def api_admin_cards():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    return jsonify(ok=True, cards=db.list_cards())


@app.post("/api/admin/cards")
def api_admin_cards_create():
    admin_id = _check_super_admin()
    if not admin_id:
        return jsonify(ok=False, error="forbidden"), 403
    data = request.get_json(silent=True) or {}
    brand = str(data.get("brand") or "").lower().strip()
    number = str(data.get("number") or "").strip()
    owner_name = str(data.get("owner_name") or "").strip()
    title = str(data.get("title") or "").strip()
    if brand not in ("uzcard", "humo", "visa"):
        return jsonify(ok=False, error="brand invalid"), 400
    if len(re.sub(r"\D", "", number)) < 12:
        return jsonify(ok=False, error="number invalid"), 400
    if not owner_name or not title:
        return jsonify(ok=False, error="owner_name and title required"), 400
    card = db.create_card(brand, number, owner_name, title)
    threading.Thread(
        target=notify_admins_card_change,
        args=("create", card, admin_id),
        daemon=True,
    ).start()
    return jsonify(ok=True, card=card)


@app.post("/api/admin/cards/<int:card_id>")
def api_admin_cards_update(card_id: int):
    admin_id = _check_super_admin()
    if not admin_id:
        return jsonify(ok=False, error="forbidden"), 403
    data = request.get_json(silent=True) or {}
    fields = {}
    if "brand" in data:
        brand = str(data["brand"]).lower().strip()
        if brand not in ("uzcard", "humo", "visa"):
            return jsonify(ok=False, error="brand invalid"), 400
        fields["brand"] = brand
    if "number" in data:
        fields["number"] = str(data["number"]).strip()
    if "owner_name" in data:
        fields["owner_name"] = str(data["owner_name"]).strip()
    if "title" in data:
        fields["title"] = str(data["title"]).strip()
    if "active" in data:
        fields["active"] = 1 if data["active"] else 0
    card = db.update_card(card_id, **fields)
    if not card:
        return jsonify(ok=False, error="not found"), 404
    threading.Thread(
        target=notify_admins_card_change,
        args=("update", card, admin_id),
        daemon=True,
    ).start()
    return jsonify(ok=True, card=card)


@app.post("/api/admin/cards/<int:card_id>/delete")
def api_admin_cards_delete(card_id: int):
    admin_id = _check_super_admin()
    if not admin_id:
        return jsonify(ok=False, error="forbidden"), 403
    card = db.get_card(card_id) or {"id": card_id, "brand": "", "title": "", "number": ""}
    db.delete_card(card_id)
    threading.Thread(
        target=notify_admins_card_change,
        args=("delete", card, admin_id),
        daemon=True,
    ).start()
    return jsonify(ok=True)


@app.get("/api/cards")
def api_public_cards():
    """Mini App uchun faol kartalar (to'liq raqam + maska — nusxa olish uchun)."""
    cards = []
    for c in db.list_cards(active_only=True):
        digits = re.sub(r"\D", "", c["number"])
        masked = (
            f"{digits[:4]} **** **** {digits[-4:]}"
            if len(digits) >= 8
            else c["number"]
        )
        cards.append(
            {
                "id": c["id"],
                "brand": c["brand"],
                "title": c["title"],
                "owner_name": c["owner_name"],
                "number": c["number"],
                "masked": masked,
            }
        )
    return jsonify(ok=True, cards=cards)


@app.get("/api/config")
def api_public_config():
    s = db.get_settings()
    return jsonify(
        ok=True,
        config={
            "rate_uzs": int(float(s.get("rate_uzs") or RATE_UZS)),
            "min_cny": int(float(s.get("min_cny") or 30)),
            "max_cny": int(float(s.get("max_cny") or 500)),
            "work_hours": s.get("work_hours") or "07:00–23:00",
            "commission": s.get("commission") or "0%",
        },
    )


@app.get("/api/rate-history")
def api_rate_history():
    """Mini App kurs statistikasi uchun."""
    days = request.args.get("days", default=7, type=int) or 7
    if days not in (7, 30, 90):
        days = 7
    points = db.rate_history(days)
    rates = [float(p["rate"]) for p in points] or [float(RATE_UZS)]
    first, last = rates[0], rates[-1]
    change_pct = ((last - first) / first * 100.0) if first else 0.0
    return jsonify(
        ok=True,
        days=days,
        current=int(round(last)),
        min=int(round(min(rates))),
        max=int(round(max(rates))),
        avg=int(round(sum(rates) / len(rates))),
        change_pct=round(change_pct, 2),
        points=[
            {"rate": float(p["rate"]), "created_at": p["created_at"]} for p in points
        ],
    )


@app.get("/api/admin/tx/<tx_id>")
def api_admin_tx_detail(tx_id: str):
    if not _check_admin():
        return jsonify(ok=False, error="forbidden"), 403
    tx = db.get_tx(tx_id)
    if not tx:
        return jsonify(ok=False, error="not found"), 404
    user = db.get_user(tx["telegram_id"]) or {}
    tx["user"] = {
        "first_name": user.get("first_name", ""),
        "last_name": user.get("last_name", ""),
        "phone": user.get("phone", ""),
        "username": user.get("username", ""),
        "unique_id": user.get("unique_id", ""),
    }
    return jsonify(ok=True, tx=tx)


def _notify_tx_status(tx: dict, key: str, reason: str = "", photo_path: Path | None = None) -> None:
    chat_id = tx["telegram_id"]
    caption = t(chat_id, key).format(
        tx_id=tx["tx_id"],
        cny=f"{tx['cny']:g}",
        uzs=f"{tx['uzs']:,.0f}".replace(",", " "),
        reason=reason or "-",
    )
    reply_markup = None
    if key == "notify_done" and not db.get_review_by_tx(tx["tx_id"]):
        reply_markup = types.InlineKeyboardMarkup()
        reply_markup.add(
            types.InlineKeyboardButton(
                text=t(chat_id, "review_btn"),
                callback_data=f"review:start:{tx['tx_id']}",
            )
        )
    try:
        if photo_path and photo_path.exists():
            with photo_path.open("rb") as photo:
                bot.send_photo(
                    chat_id,
                    photo,
                    caption=caption,
                    parse_mode="HTML",
                    reply_markup=reply_markup,
                )
        else:
            bot.send_message(
                chat_id,
                caption,
                parse_mode="HTML",
                reply_markup=reply_markup,
            )
    except Exception as exc:
        print(f"Notify xatosi ({chat_id}): {exc}")


def clear_message_buttons(chat_id: int, message_id: int | None) -> None:
    if not message_id:
        return
    try:
        bot.edit_message_reply_markup(chat_id, message_id, reply_markup=None)
    except Exception:
        pass


def review_confirm_keyboard(chat_id: int) -> types.InlineKeyboardMarkup:
    kb = types.InlineKeyboardMarkup()
    kb.row(
        types.InlineKeyboardButton(t(chat_id, "review_send"), callback_data="review:send"),
        types.InlineKeyboardButton(t(chat_id, "review_edit"), callback_data="review:edit"),
    )
    kb.add(
        types.InlineKeyboardButton(t(chat_id, "review_cancel"), callback_data="review:cancel")
    )
    return kb


def publish_review_to_channel(chat_id: int, tx: dict, text: str) -> dict | None:
    user = db.get_user(chat_id) or {}
    # Maxfiylik: kanalga faqat @username (ism/familiya yo'q)
    uname = (user.get("username") or "").strip()
    display_user = f"@{uname}" if uname else "Mijoz"
    channel_text = t(chat_id, "review_channel").format(
        username=display_user,
        text=text,
        cny=f"{tx['cny']:g}",
        tx_id=tx["tx_id"],
    )
    channel_msg_id = None
    try:
        msg = bot.send_message(
            REVIEWS_CHANNEL,
            channel_text,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
        channel_msg_id = msg.message_id
    except Exception as exc:
        print(f"Kanalga sharh yuborilmadi: {exc}")

    return db.create_review(
        telegram_id=chat_id,
        tx_id=tx["tx_id"],
        text=text,
        first_name=user.get("first_name", ""),
        last_name=user.get("last_name", ""),
        username=user.get("username", ""),
        cny=tx.get("cny") or 0,
        channel_message_id=channel_msg_id,
    )


@bot.callback_query_handler(func=lambda c: c.data and c.data.startswith("review:"))
def cb_review(call: types.CallbackQuery) -> None:
    chat_id = call.message.chat.id
    parts = call.data.split(":", 2)
    action = parts[1] if len(parts) > 1 else ""

    if action == "start":
        tx_id = parts[2] if len(parts) > 2 else ""
        tx = db.get_tx(tx_id)
        if not tx or int(tx["telegram_id"]) != int(chat_id):
            bot.answer_callback_query(call.id, "Tranzaksiya topilmadi")
            return
        if db.get_review_by_tx(tx_id):
            clear_message_buttons(chat_id, call.message.message_id)
            bot.answer_callback_query(call.id, t(chat_id, "review_exists"), show_alert=True)
            return
        # Tasdiqlash xabaridagi tugmani darhol olib tashlash
        clear_message_buttons(chat_id, call.message.message_id)
        db.set_review_state(
            chat_id,
            {
                "step": "ask",
                "tx_id": tx_id,
                "text": "",
                "invite_msg_id": call.message.message_id,
            },
        )
        bot.answer_callback_query(call.id)
        bot.send_message(chat_id, t(chat_id, "review_ask"), parse_mode="HTML")
        return

    state = db.get_review_state(chat_id)
    if not state:
        clear_message_buttons(chat_id, call.message.message_id)
        bot.answer_callback_query(call.id, "Avval sharh yozishni boshlang")
        return

    if action == "edit":
        clear_message_buttons(chat_id, call.message.message_id)
        state["step"] = "ask"
        state["text"] = ""
        state.pop("preview_msg_id", None)
        db.set_review_state(chat_id, state)
        bot.answer_callback_query(call.id)
        bot.send_message(chat_id, t(chat_id, "review_ask"), parse_mode="HTML")
        return

    if action == "cancel":
        clear_message_buttons(chat_id, call.message.message_id)
        clear_message_buttons(chat_id, state.get("invite_msg_id"))
        db.clear_review_state(chat_id)
        bot.answer_callback_query(call.id)
        bot.send_message(chat_id, t(chat_id, "review_cancelled"), parse_mode="HTML")
        return

    if action == "send":
        text = (state.get("text") or "").strip()
        if len(text) < 5:
            bot.answer_callback_query(call.id, t(chat_id, "review_empty"), show_alert=True)
            return
        tx = db.get_tx(state.get("tx_id") or "")
        if not tx:
            clear_message_buttons(chat_id, call.message.message_id)
            clear_message_buttons(chat_id, state.get("invite_msg_id"))
            db.clear_review_state(chat_id)
            bot.answer_callback_query(call.id, "Tranzaksiya topilmadi", show_alert=True)
            return
        if db.get_review_by_tx(tx["tx_id"]):
            clear_message_buttons(chat_id, call.message.message_id)
            clear_message_buttons(chat_id, state.get("invite_msg_id"))
            db.clear_review_state(chat_id)
            bot.answer_callback_query(call.id, t(chat_id, "review_exists"), show_alert=True)
            return
        publish_review_to_channel(chat_id, tx, text)
        clear_message_buttons(chat_id, call.message.message_id)
        clear_message_buttons(chat_id, state.get("invite_msg_id"))
        db.clear_review_state(chat_id)
        bot.answer_callback_query(call.id, "✅")
        bot.send_message(chat_id, t(chat_id, "review_sent"), parse_mode="HTML")
        return

    bot.answer_callback_query(call.id)


@bot.message_handler(
    func=lambda m: db.get_review_state(m.chat.id).get("step") == "ask"
    and not db.get_reg_step(m.chat.id)
    and bool((m.text or "").strip())
    and not (m.text or "").startswith("/")
)
def review_text_handler(message: types.Message) -> None:
    chat_id = message.chat.id
    text = (message.text or "").strip()
    if len(text) < 5:
        bot.send_message(chat_id, t(chat_id, "review_empty"))
        return
    if len(text) > 500:
        text = text[:500]
    state = db.get_review_state(chat_id) or {}
    state["step"] = "confirm"
    state["text"] = text
    db.set_review_state(chat_id, state)
    preview = bot.send_message(
        chat_id,
        t(chat_id, "review_preview").format(text=text),
        parse_mode="HTML",
        reply_markup=review_confirm_keyboard(chat_id),
    )
    state["preview_msg_id"] = preview.message_id
    db.set_review_state(chat_id, state)


@app.get("/api/reviews")
def api_public_reviews():
    items = []
    for r in db.list_reviews(active_only=True, limit=50):
        uname = (r.get("username") or "").strip()
        # Maxfiylik: ommaviy joyda faqat username
        display = f"@{uname}" if uname else "Mijoz"
        items.append(
            {
                "id": r["id"],
                "text": r["text"],
                "name": display,
                "username": uname,
                "cny": r.get("cny") or 0,
                "tx_id": r.get("tx_id") or "",
                "created_at": r.get("created_at") or "",
            }
        )
    return jsonify(ok=True, reviews=items)


@app.get("/api/admin/reviews")
def api_admin_reviews():
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    items = []
    for r in db.list_reviews(active_only=False, limit=200):
        name = f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip() or "—"
        items.append(
            {
                "id": r["id"],
                "telegram_id": r["telegram_id"],
                "tx_id": r.get("tx_id") or "",
                "text": r["text"],
                "name": name,
                "username": r.get("username") or "",
                "cny": r.get("cny") or 0,
                "active": bool(r.get("active")),
                "channel_message_id": r.get("channel_message_id"),
                "created_at": r.get("created_at") or "",
            }
        )
    return jsonify(ok=True, reviews=items)


@app.post("/api/admin/reviews/<int:review_id>/delete")
def api_admin_reviews_delete(review_id: int):
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    review = db.get_review(review_id)
    if not review:
        return jsonify(ok=False, error="not found"), 404
    db.delete_review(review_id)
    if review.get("channel_message_id"):
        try:
            bot.delete_message(REVIEWS_CHANNEL, int(review["channel_message_id"]))
        except Exception as exc:
            print(f"Kanal sharhini o'chirish xato: {exc}")
    return jsonify(ok=True)


@app.post("/api/admin/reviews/<int:review_id>/republish")
def api_admin_reviews_republish(review_id: int):
    """Saqlangan sharhni kanalga qayta yuborish (kanal sozlamasi keyin to'g'rilanganda)."""
    if not _check_super_admin():
        return jsonify(ok=False, error="forbidden"), 403
    review = db.get_review(review_id)
    if not review or not review.get("active"):
        return jsonify(ok=False, error="not found"), 404

    uname = (review.get("username") or "").strip()
    display_user = f"@{uname}" if uname else "Mijoz"
    chat_id = int(review.get("telegram_id") or OWNER_TELEGRAM_ID)
    channel_text = t(chat_id, "review_channel").format(
        username=display_user,
        text=review.get("text") or "",
        cny=f"{float(review.get('cny') or 0):g}",
        tx_id=review.get("tx_id") or "",
    )
    try:
        msg = bot.send_message(
            REVIEWS_CHANNEL,
            channel_text,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
        db.set_review_channel_message_id(review_id, msg.message_id)
        return jsonify(ok=True, channel_message_id=msg.message_id)
    except Exception as exc:
        print(f"Kanalga qayta yuborish xato: {exc}")
        return jsonify(ok=False, error=str(exc)), 500


@app.post("/api/admin/tx/<tx_id>/approve")
def api_admin_tx_approve(tx_id: str):
    admin_id = _check_admin()
    if not admin_id:
        return jsonify(ok=False, error="forbidden"), 403
    data = request.get_json(silent=True) or {}
    admin_receipt = str(data.get("admin_receipt") or "").strip()
    if not admin_receipt or not admin_receipt.startswith("/uploads/"):
        return jsonify(ok=False, error="admin_receipt required"), 400

    tx = db.get_tx(tx_id)
    if not tx:
        return jsonify(ok=False, error="not found"), 404

    db.set_tx_status(tx_id, "done", admin_receipt=admin_receipt)
    photo_path = UPLOADS_DIR / Path(admin_receipt).name
    _notify_tx_status(tx, "notify_done", photo_path=photo_path)
    threading.Thread(
        target=notify_admins_tx_result,
        args=(tx, "done"),
        kwargs={"by_admin_id": admin_id},
        daemon=True,
    ).start()
    return jsonify(ok=True)


@app.post("/api/admin/tx/<tx_id>/cancel")
def api_admin_tx_cancel(tx_id: str):
    admin_id = _check_admin()
    if not admin_id:
        return jsonify(ok=False, error="forbidden"), 403
    data = request.get_json(silent=True) or {}
    reason = str(data.get("reason") or "").strip()
    if not reason:
        return jsonify(ok=False, error="reason required"), 400
    tx = db.get_tx(tx_id)
    if not tx:
        return jsonify(ok=False, error="not found"), 404
    db.set_tx_status(tx_id, "cancelled", reason)
    _notify_tx_status(tx, "notify_cancelled", reason)
    threading.Thread(
        target=notify_admins_tx_result,
        args=(tx, "cancelled"),
        kwargs={"reason": reason, "by_admin_id": admin_id},
        daemon=True,
    ).start()
    return jsonify(ok=True)


def run_bot() -> None:
    print("Bot ishlayapti: @yuan_go_bot")
    print(f"WebApp URL: {WEBAPP_URL}")
    if not WEBAPP_READY:
        print("OGOHLANTIRISH: WEBAPP_URL HTTPS emas — Telegram Mini App ishlamaydi.")
    while True:
        try:
            bot.infinity_polling(skip_pending=True, timeout=25, long_polling_timeout=20)
        except Exception as exc:
            print(f"Bot polling xato, 3s dan keyin qayta: {exc}")
            time.sleep(3)

def start_bot_once() -> None:
    """Agar domen (HTTPS) tayyor bo'lsa — webhook o'rnatadi (Passenger'ga mos,
    doimiy jarayon kerak emas). Aks holda — vaqtincha polling'ga tushadi
    (faqat bitta workerda, fayl-lock orqali)."""
    if WEBAPP_READY:
        try:
            bot.remove_webhook()
            time.sleep(1)
            webhook_url = WEBAPP_URL.rstrip("/") + WEBHOOK_PATH
            bot.set_webhook(url=webhook_url)
            print(f"Webhook o'rnatildi: {webhook_url}")
        except Exception as exc:
            print(f"Webhook o'rnatishda xato: {exc}")
        return

    lock_path = BASE_DIR / "yuango_bot.lock"
    lock_file = open(lock_path, "a+")
    try:
        if fcntl is not None:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        elif sys.platform == "win32":
            import msvcrt

            lock_file.seek(0)
            if lock_file.read(1) == "":
                lock_file.write("0")
                lock_file.flush()
            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        print("Bot allaqachon boshqa workerda ishlayapti, bu yerda ishga tushirilmaydi.")
        return
    threading.Thread(target=run_bot, daemon=True).start()


db.ensure_rate_history_seeded()
start_storage_cleanup_loop()
start_broadcast_loop()
start_bot_once()

if __name__ == "__main__":
    print(f"Yuan Go web: http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
