"""Yuan Go uchun SQLite ma'lumotlar bazasi."""

import secrets
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "yuango.db"

_lock = threading.Lock()
_conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
_conn.row_factory = sqlite3.Row

_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        unique_id   TEXT    UNIQUE NOT NULL,
        first_name  TEXT    NOT NULL DEFAULT '',
        last_name   TEXT    NOT NULL DEFAULT '',
        phone       TEXT    NOT NULL DEFAULT '',
        username    TEXT    NOT NULL DEFAULT '',
        lang        TEXT    NOT NULL DEFAULT 'uz',
        registered  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
    )
    """
)
_conn.commit()

# Eski bazalarga admin ustunlarini qo'shish
_user_cols = {row[1] for row in _conn.execute("PRAGMA table_info(users)").fetchall()}
if "is_admin" not in _user_cols:
    _conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    _conn.commit()
_user_cols = {row[1] for row in _conn.execute("PRAGMA table_info(users)").fetchall()}
if "is_super_admin" not in _user_cols:
    _conn.execute("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0")
    _conn.commit()

_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS transactions (
        tx_id       TEXT    PRIMARY KEY,
        telegram_id INTEGER NOT NULL,
        cny         REAL    NOT NULL,
        uzs         REAL    NOT NULL,
        card        TEXT    NOT NULL DEFAULT '',
        receipt     TEXT    NOT NULL DEFAULT '',
        qr          TEXT    NOT NULL DEFAULT '',
        status      TEXT    NOT NULL DEFAULT 'progress',
        reason      TEXT    NOT NULL DEFAULT '',
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
    )
    """
)
_conn.commit()

_tx_cols = {row[1] for row in _conn.execute("PRAGMA table_info(transactions)").fetchall()}
if "admin_receipt" not in _tx_cols:
    _conn.execute(
        "ALTER TABLE transactions ADD COLUMN admin_receipt TEXT NOT NULL DEFAULT ''"
    )
    _conn.commit()

_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS cards (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        brand       TEXT    NOT NULL,
        number      TEXT    NOT NULL,
        owner_name  TEXT    NOT NULL DEFAULT '',
        title       TEXT    NOT NULL DEFAULT '',
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
    )
    """
)
_conn.commit()

_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
    )
    """
)
_conn.commit()

# Default sozlamalar
_defaults = {
    "rate_uzs": "1840",
    "min_cny": "30",
    "max_cny": "500",
    "work_hours": "07:00–23:00",
    "commission": "0%",
}
for _k, _v in _defaults.items():
    _conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (_k, _v)
    )
# Eski default (1080) → yangi boshlang‘ich kurs (1840)
_row = _conn.execute(
    "SELECT value FROM settings WHERE key = 'rate_uzs'"
).fetchone()
if _row and str(_row["value"]).strip() in ("1080", "1080.0"):
    _conn.execute(
        "UPDATE settings SET value = ? WHERE key = 'rate_uzs'", ("1840",)
    )
_conn.commit()

_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS rate_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        rate       REAL    NOT NULL,
        created_at TEXT    NOT NULL
    )
    """
)
_conn.commit()

_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS reviews (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id         INTEGER NOT NULL,
        tx_id               TEXT    NOT NULL DEFAULT '',
        text                TEXT    NOT NULL,
        first_name          TEXT    NOT NULL DEFAULT '',
        last_name           TEXT    NOT NULL DEFAULT '',
        username            TEXT    NOT NULL DEFAULT '',
        cny                 REAL    NOT NULL DEFAULT 0,
        channel_message_id  INTEGER,
        active              INTEGER NOT NULL DEFAULT 1,
        created_at          TEXT    NOT NULL
    )
    """
)
_conn.commit()

ALLOWED_FIELDS = {
    "first_name",
    "last_name",
    "phone",
    "username",
    "lang",
    "registered",
    "is_admin",
    "is_super_admin",
}


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _generate_unique_id() -> str:
    """10 belgili unikal ID: YG + 8 ta raqam."""
    while True:
        uid = "YG" + "".join(secrets.choice("0123456789") for _ in range(8))
        exists = _conn.execute(
            "SELECT 1 FROM users WHERE unique_id = ?", (uid,)
        ).fetchone()
        if not exists:
            return uid


def ensure_user(telegram_id: int, username: str = "") -> dict:
    """Foydalanuvchini qaytaradi, bo'lmasa yaratadi."""
    with _lock:
        row = _conn.execute(
            "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
        ).fetchone()
        if row:
            _conn.execute(
                "UPDATE users SET username = COALESCE(NULLIF(?, ''), username), updated_at = ?"
                " WHERE telegram_id = ?",
                (username or "", _now(), telegram_id),
            )
            _conn.commit()
            return get_user(telegram_id)

        now = _now()
        _conn.execute(
            "INSERT INTO users (telegram_id, unique_id, username, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (telegram_id, _generate_unique_id(), username or "", now, now),
        )
        _conn.commit()
    return get_user(telegram_id)


def get_user(telegram_id: int) -> dict | None:
    row = _conn.execute(
        "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
    ).fetchone()
    return dict(row) if row else None


def update_user(telegram_id: int, **fields) -> None:
    data = {k: v for k, v in fields.items() if k in ALLOWED_FIELDS and v is not None}
    if not data:
        return
    with _lock:
        assignments = ", ".join(f"{key} = ?" for key in data)
        _conn.execute(
            f"UPDATE users SET {assignments}, updated_at = ? WHERE telegram_id = ?",
            (*data.values(), _now(), telegram_id),
        )
        _conn.commit()


def all_users() -> list[dict]:
    rows = _conn.execute("SELECT * FROM users ORDER BY created_at").fetchall()
    return [dict(row) for row in rows]


def list_admins() -> list[dict]:
    """Oddiy adminlar (super admin emas)."""
    rows = _conn.execute(
        "SELECT * FROM users WHERE is_admin = 1 AND COALESCE(is_super_admin, 0) = 0"
        " ORDER BY updated_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def list_admin_chat_ids(owner_id: int | None = None) -> list[int]:
    """Barcha admin / super admin telegram ID lari."""
    ids: set[int] = set()
    if owner_id:
        ids.add(int(owner_id))
    rows = _conn.execute(
        "SELECT telegram_id FROM users"
        " WHERE is_admin = 1 OR COALESCE(is_super_admin, 0) = 1"
    ).fetchall()
    for row in rows:
        ids.add(int(row["telegram_id"]))
    return sorted(ids)


def grant_ordinary_admin(telegram_id: int, first_name: str, last_name: str) -> dict:
    ensure_user(telegram_id)
    update_user(
        telegram_id,
        first_name=first_name,
        last_name=last_name,
        is_admin=1,
        is_super_admin=0,
    )
    return get_user(telegram_id)


def revoke_ordinary_admin(telegram_id: int) -> bool:
    user = get_user(telegram_id)
    if not user:
        return False
    if user.get("is_super_admin"):
        return False
    update_user(telegram_id, is_admin=0)
    return True


# ---------------------------------------------------------------- Transactions

def create_tx(
    tx_id: str,
    telegram_id: int,
    cny: float,
    uzs: float,
    card: str = "",
    receipt: str = "",
    qr: str = "",
    status: str = "progress",
    created_at: str = "",
) -> None:
    now = _now()
    with _lock:
        _conn.execute(
            "INSERT OR IGNORE INTO transactions"
            " (tx_id, telegram_id, cny, uzs, card, receipt, qr, status, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (tx_id, telegram_id, cny, uzs, card, receipt, qr, status, created_at or now, now),
        )
        _conn.commit()


def get_tx(tx_id: str) -> dict | None:
    row = _conn.execute(
        "SELECT * FROM transactions WHERE tx_id = ?", (tx_id,)
    ).fetchone()
    return dict(row) if row else None


def set_tx_status(tx_id: str, status: str, reason: str = "", admin_receipt: str = "") -> None:
    with _lock:
        if admin_receipt:
            _conn.execute(
                "UPDATE transactions SET status = ?, reason = ?, admin_receipt = ?, updated_at = ?"
                " WHERE tx_id = ?",
                (status, reason, admin_receipt, _now(), tx_id),
            )
        else:
            _conn.execute(
                "UPDATE transactions SET status = ?, reason = ?, updated_at = ?"
                " WHERE tx_id = ?",
                (status, reason, _now(), tx_id),
            )
        _conn.commit()


def user_media_refs(telegram_id: int) -> dict[str, str]:
    """filename -> status (progress/done/cancelled)."""
    rows = _conn.execute(
        "SELECT status, receipt, qr, admin_receipt FROM transactions"
        " WHERE telegram_id = ?",
        (telegram_id,),
    ).fetchall()
    refs: dict[str, str] = {}
    for row in rows:
        status = row["status"] or "progress"
        for field in ("receipt", "qr", "admin_receipt"):
            url = row[field] or ""
            if "/uploads/" in url:
                name = url.rsplit("/", 1)[-1]
                # progress ustunlik qiladi — o'chirmaslik uchun
                if name not in refs or status == "progress":
                    refs[name] = status
    return refs


def clear_media_filename_refs(filename: str) -> None:
    """Fayl o'chirilganda DB dagi yo'llarni tozalash."""
    like = f"%/{filename}"
    with _lock:
        for col in ("receipt", "qr", "admin_receipt"):
            _conn.execute(
                f"UPDATE transactions SET {col} = '' WHERE {col} LIKE ?",
                (like,),
            )
        _conn.commit()


def clear_tx_media(tx_id: str) -> None:
    with _lock:
        _conn.execute(
            "UPDATE transactions SET receipt = '', qr = '', admin_receipt = '', updated_at = ?"
            " WHERE tx_id = ?",
            (_now(), tx_id),
        )
        _conn.commit()


def closed_txs_with_media_before(cutoff: str) -> list[dict]:
    """done/cancelled va updated_at <= cutoff, hali rasm yo'li bor."""
    rows = _conn.execute(
        "SELECT tx_id, telegram_id, receipt, qr, admin_receipt, status, updated_at"
        " FROM transactions"
        " WHERE status IN ('done', 'cancelled')"
        " AND updated_at <= ?"
        " AND ("
        "   (receipt != '' AND receipt IS NOT NULL) OR"
        "   (qr != '' AND qr IS NOT NULL) OR"
        "   (admin_receipt != '' AND admin_receipt IS NOT NULL)"
        " )"
        " ORDER BY updated_at ASC",
        (cutoff,),
    ).fetchall()
    return [dict(r) for r in rows]


def all_media_filenames() -> set[str]:
    rows = _conn.execute(
        "SELECT receipt, qr, admin_receipt FROM transactions"
    ).fetchall()
    names: set[str] = set()
    for row in rows:
        for field in ("receipt", "qr", "admin_receipt"):
            url = row[field] or ""
            if "/uploads/" in url:
                names.add(url.rsplit("/", 1)[-1])
    return names


def user_txs(telegram_id: int) -> list[dict]:
    """Foydalanuvchining o'z tranzaksiyalari (rasmlar bilan)."""
    rows = _conn.execute(
        "SELECT tx_id, cny, uzs, card, receipt, qr, status, reason, admin_receipt,"
        " created_at, updated_at"
        " FROM transactions WHERE telegram_id = ? ORDER BY created_at DESC",
        (telegram_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def list_txs(status: str | None = None, limit: int = 100) -> list[dict]:
    """Admin uchun: tranzaksiyalar + foydalanuvchi ma'lumotlari (rasmlarsiz)."""
    query = (
        "SELECT t.tx_id, t.telegram_id, t.cny, t.uzs, t.card, t.status, t.reason,"
        " t.created_at, t.updated_at,"
        " u.first_name, u.last_name, u.phone, u.username, u.unique_id"
        " FROM transactions t LEFT JOIN users u ON u.telegram_id = t.telegram_id"
    )
    params: tuple = ()
    if status:
        query += " WHERE t.status = ?"
        params = (status,)
    query += " ORDER BY t.created_at DESC LIMIT ?"
    params += (limit,)
    rows = _conn.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def tx_summary() -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    row = _conn.execute(
        "SELECT"
        " SUM(CASE WHEN created_at LIKE ? THEN 1 ELSE 0 END) AS today,"
        " SUM(CASE WHEN status = 'progress' THEN 1 ELSE 0 END) AS progress,"
        " SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,"
        " SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,"
        " COUNT(*) AS total,"
        " COALESCE(SUM(CASE WHEN status = 'done' THEN cny ELSE 0 END), 0) AS volume_cny,"
        " COALESCE(SUM(CASE WHEN status = 'done' THEN uzs ELSE 0 END), 0) AS volume_uzs"
        " FROM transactions",
        (f"{today}%",),
    ).fetchone()
    return {
        "today": row["today"] or 0,
        "progress": row["progress"] or 0,
        "done": row["done"] or 0,
        "cancelled": row["cancelled"] or 0,
        "total": row["total"] or 0,
        "volume_cny": row["volume_cny"] or 0,
        "volume_uzs": row["volume_uzs"] or 0,
    }


# ---------------------------------------------------------------- Cards

def list_cards(active_only: bool = False) -> list[dict]:
    query = "SELECT * FROM cards"
    if active_only:
        query += " WHERE active = 1"
    query += " ORDER BY id DESC"
    return [dict(r) for r in _conn.execute(query).fetchall()]


def get_card(card_id: int) -> dict | None:
    row = _conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    return dict(row) if row else None


def create_card(brand: str, number: str, owner_name: str, title: str) -> dict:
    now = _now()
    with _lock:
        cur = _conn.execute(
            "INSERT INTO cards (brand, number, owner_name, title, active, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, 1, ?, ?)",
            (brand, number, owner_name, title, now, now),
        )
        _conn.commit()
        card_id = cur.lastrowid
    return get_card(card_id)


def update_card(card_id: int, **fields) -> dict | None:
    allowed = {"brand", "number", "owner_name", "title", "active"}
    data = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not data:
        return get_card(card_id)
    with _lock:
        assignments = ", ".join(f"{k} = ?" for k in data)
        _conn.execute(
            f"UPDATE cards SET {assignments}, updated_at = ? WHERE id = ?",
            (*data.values(), _now(), card_id),
        )
        _conn.commit()
    return get_card(card_id)


def delete_card(card_id: int) -> None:
    with _lock:
        _conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        _conn.commit()


# ---------------------------------------------------------------- Settings

def get_settings() -> dict:
    rows = _conn.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


def set_settings(values: dict) -> dict:
    with _lock:
        for key, value in values.items():
            _conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (str(key), str(value)),
            )
        _conn.commit()
    return get_settings()


# ---------------------------------------------------------------- Rate history

def ensure_rate_history_seeded() -> None:
    """Agar tarix bo'sh bo'lsa — joriy kursdan boshlang'ich nuqta yozadi."""
    with _lock:
        count = _conn.execute("SELECT COUNT(*) AS c FROM rate_history").fetchone()["c"]
        if count:
            return
        try:
            rate = float(get_settings().get("rate_uzs") or 1840)
        except (TypeError, ValueError):
            rate = 1840.0
        _conn.execute(
            "INSERT INTO rate_history (rate, created_at) VALUES (?, ?)",
            (rate, _now()),
        )
        _conn.commit()


def add_rate_history(rate: float, created_at: str | None = None) -> None:
    with _lock:
        _conn.execute(
            "INSERT INTO rate_history (rate, created_at) VALUES (?, ?)",
            (float(rate), created_at or _now()),
        )
        _conn.commit()


def rate_history(days: int = 7) -> list[dict]:
    """So'nggi N kunlik kurs tarixi (vaqt bo'yicha o'sish tartibida)."""
    ensure_rate_history_seeded()
    days = max(1, min(int(days or 7), 365))
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    rows = _conn.execute(
        "SELECT rate, created_at FROM rate_history"
        " WHERE created_at >= ?"
        " ORDER BY created_at ASC, id ASC",
        (since,),
    ).fetchall()
    points = [dict(r) for r in rows]
    if points:
        return points
    # Period ichida nuqta yo'q — eng so'nggi kursni qaytar
    last = _conn.execute(
        "SELECT rate, created_at FROM rate_history"
        " ORDER BY created_at DESC, id DESC LIMIT 1"
    ).fetchone()
    return [dict(last)] if last else []


# ---------------------------------------------------------------- Reviews

def create_review(
    telegram_id: int,
    tx_id: str,
    text: str,
    first_name: str = "",
    last_name: str = "",
    username: str = "",
    cny: float = 0,
    channel_message_id: int | None = None,
) -> dict:
    now = _now()
    with _lock:
        cur = _conn.execute(
            "INSERT INTO reviews"
            " (telegram_id, tx_id, text, first_name, last_name, username, cny,"
            " channel_message_id, active, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
            (
                telegram_id,
                tx_id,
                text,
                first_name,
                last_name,
                username,
                cny,
                channel_message_id,
                now,
            ),
        )
        _conn.commit()
        rid = cur.lastrowid
    return get_review(rid)


def get_review(review_id: int) -> dict | None:
    row = _conn.execute("SELECT * FROM reviews WHERE id = ?", (review_id,)).fetchone()
    return dict(row) if row else None


def get_review_by_tx(tx_id: str) -> dict | None:
    row = _conn.execute(
        "SELECT * FROM reviews WHERE tx_id = ? AND active = 1 ORDER BY id DESC LIMIT 1",
        (tx_id,),
    ).fetchone()
    return dict(row) if row else None


def list_reviews(active_only: bool = True, limit: int = 100) -> list[dict]:
    query = "SELECT * FROM reviews"
    if active_only:
        query += " WHERE active = 1"
    query += " ORDER BY id DESC LIMIT ?"
    return [dict(r) for r in _conn.execute(query, (limit,)).fetchall()]


def delete_review(review_id: int) -> bool:
    with _lock:
        cur = _conn.execute(
            "UPDATE reviews SET active = 0 WHERE id = ?", (review_id,)
        )
        _conn.commit()
        return cur.rowcount > 0


def set_review_channel_message_id(review_id: int, message_id: int | None) -> None:
    with _lock:
        _conn.execute(
            "UPDATE reviews SET channel_message_id = ? WHERE id = ?",
            (message_id, review_id),
        )
        _conn.commit()


# ---------------------------------------------------------------- Stats

def stats_detailed() -> dict:
    summary = tx_summary()
    users_count = _conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    registered = _conn.execute(
        "SELECT COUNT(*) AS c FROM users WHERE registered = 1"
    ).fetchone()["c"]

    # Oxirgi 7 kunlik hajm
    daily = []
    for i in range(6, -1, -1):
        d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        row = _conn.execute(
            "SELECT COUNT(*) AS cnt,"
            " COALESCE(SUM(CASE WHEN status='done' THEN cny ELSE 0 END),0) AS cny,"
            " SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,"
            " SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled,"
            " SUM(CASE WHEN status='progress' THEN 1 ELSE 0 END) AS progress"
            " FROM transactions WHERE created_at LIKE ?",
            (f"{d}%",),
        ).fetchone()
        daily.append(
            {
                "date": d,
                "label": d[5:],  # MM-DD
                "count": row["cnt"] or 0,
                "cny": row["cny"] or 0,
                "done": row["done"] or 0,
                "cancelled": row["cancelled"] or 0,
                "progress": row["progress"] or 0,
            }
        )

    recent_users = _conn.execute(
        "SELECT unique_id, first_name, last_name, username, phone, lang,"
        " registered, updated_at, created_at"
        " FROM users ORDER BY updated_at DESC LIMIT 15"
    ).fetchall()

    recent_txs = list_txs(limit=10)

    return {
        "summary": summary,
        "users_total": users_count,
        "users_registered": registered,
        "daily": daily,
        "recent_users": [dict(r) for r in recent_users],
        "recent_txs": recent_txs,
    }
