"""Yuan Go uchun SQLite ma'lumotlar bazasi."""

import json
import random
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "yuango.db"

# Parallel so'rovlar / multi-worker: kutish + WAL (database is locked → 502 oldini olish)
_SQLITE_TIMEOUT_SEC = 30.0
_BUSY_TIMEOUT_MS = 30_000
_LOCK_RETRIES = 14

_lock = threading.RLock()
_local = threading.local()


def _is_lock_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return "locked" in msg or "busy" in msg


def _configure(conn: sqlite3.Connection) -> None:
    conn.row_factory = sqlite3.Row
    conn.execute(f"PRAGMA busy_timeout = {_BUSY_TIMEOUT_MS}")
    mode = conn.execute("PRAGMA journal_mode = WAL").fetchone()
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA wal_autocheckpoint = 1000")
    conn.execute("PRAGMA foreign_keys = ON")
    if mode and str(mode[0]).upper() != "WAL":
        print(f"SQLite WAL yoqilmadi (mode={mode[0]}); busy_timeout ishlaydi")


def _raw_conn() -> sqlite3.Connection:
    """Har bir thread uchun alohida connection (SQLite thread-safety)."""
    conn = getattr(_local, "conn", None)
    if conn is not None:
        return conn
    conn = sqlite3.connect(
        str(DB_PATH),
        timeout=_SQLITE_TIMEOUT_SEC,
        check_same_thread=True,
    )
    try:
        _configure(conn)
    except sqlite3.Error as exc:
        print(f"SQLite PRAGMA ogohlantirish: {exc}")
    _local.conn = conn
    return conn


def _retry_sql(fn):
    last: BaseException | None = None
    for attempt in range(_LOCK_RETRIES):
        try:
            return fn()
        except sqlite3.OperationalError as exc:
            last = exc
            if not _is_lock_error(exc):
                raise
            time.sleep(min(0.05 * (2**attempt), 1.25) + random.uniform(0, 0.08))
        except sqlite3.DatabaseError as exc:
            last = exc
            if not _is_lock_error(exc):
                raise
            time.sleep(min(0.05 * (2**attempt), 1.25) + random.uniform(0, 0.08))
    assert last is not None
    raise last


class _ConnProxy:
    """db._conn — thread-local + locked/busy retry."""

    def execute(self, sql, parameters=()):
        return _retry_sql(lambda: _raw_conn().execute(sql, parameters))

    def executemany(self, sql, seq_of_parameters):
        return _retry_sql(lambda: _raw_conn().executemany(sql, seq_of_parameters))

    def commit(self):
        return _retry_sql(lambda: _raw_conn().commit())

    def rollback(self):
        return _retry_sql(lambda: _raw_conn().rollback())

    def cursor(self, *args, **kwargs):
        return _retry_sql(lambda: _raw_conn().cursor(*args, **kwargs))

    def __getattr__(self, name):
        return getattr(_raw_conn(), name)


_conn = _ConnProxy()

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
_user_cols = {row[1] for row in _conn.execute("PRAGMA table_info(users)").fetchall()}
if "reg_step" not in _user_cols:
    _conn.execute(
        "ALTER TABLE users ADD COLUMN reg_step TEXT NOT NULL DEFAULT ''"
    )
    _conn.commit()
_user_cols = {row[1] for row in _conn.execute("PRAGMA table_info(users)").fetchall()}
if "review_state" not in _user_cols:
    _conn.execute(
        "ALTER TABLE users ADD COLUMN review_state TEXT NOT NULL DEFAULT ''"
    )
    _conn.commit()
_user_cols = {row[1] for row in _conn.execute("PRAGMA table_info(users)").fetchall()}
if "registered_at" not in _user_cols:
    _conn.execute(
        "ALTER TABLE users ADD COLUMN registered_at TEXT NOT NULL DEFAULT ''"
    )
    _conn.commit()
    # Eski ro'yxatdan o'tganlarga created_at ni yozib qo'yamiz
    _conn.execute(
        "UPDATE users SET registered_at = created_at"
        " WHERE registered = 1 AND (registered_at IS NULL OR registered_at = '')"
    )
    _conn.commit()
_user_cols = {row[1] for row in _conn.execute("PRAGMA table_info(users)").fetchall()}
if "last_seen_at" not in _user_cols:
    _conn.execute(
        "ALTER TABLE users ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT ''"
    )
    _conn.commit()
    # Eski yozuvlar uchun eng yaqin faollik sifatida updated_at
    _conn.execute(
        "UPDATE users SET last_seen_at = COALESCE(NULLIF(updated_at, ''), created_at)"
        " WHERE last_seen_at IS NULL OR last_seen_at = ''"
    )
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
    "bonus_enabled": "1",
    "bonus_cny": "5",
    "bonus_min_cny": "50",
    "test_mode": "0",
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
    "reg_step",
    "review_state",
    "registered_at",
    "last_seen_at",
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


def ensure_user(telegram_id: int, username: str = "", *, touch_seen: bool = False) -> dict:
    """Foydalanuvchini qaytaradi, bo'lmasa yaratadi."""
    with _lock:
        row = _conn.execute(
            "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
        ).fetchone()
        now = _now()
        if row:
            if touch_seen:
                _conn.execute(
                    "UPDATE users SET username = COALESCE(NULLIF(?, ''), username),"
                    " updated_at = ?, last_seen_at = ? WHERE telegram_id = ?",
                    (username or "", now, now, telegram_id),
                )
            else:
                _conn.execute(
                    "UPDATE users SET username = COALESCE(NULLIF(?, ''), username), updated_at = ?"
                    " WHERE telegram_id = ?",
                    (username or "", now, telegram_id),
                )
            _conn.commit()
            return get_user(telegram_id)

        _conn.execute(
            "INSERT INTO users"
            " (telegram_id, unique_id, username, created_at, updated_at, last_seen_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (telegram_id, _generate_unique_id(), username or "", now, now, now),
        )
        _conn.commit()
    return get_user(telegram_id)


def touch_last_seen(telegram_id: int) -> None:
    """Foydalanuvchi bot/ilovadan foydalanganda chaqiriladi."""
    now = _now()
    with _lock:
        row = _conn.execute(
            "SELECT telegram_id FROM users WHERE telegram_id = ?", (telegram_id,)
        ).fetchone()
        if not row:
            return
        _conn.execute(
            "UPDATE users SET last_seen_at = ?, updated_at = ? WHERE telegram_id = ?",
            (now, now, telegram_id),
        )
        _conn.commit()


def mark_registered(telegram_id: int, **fields) -> None:
    """Ro'yxatni yakunlash — registered_at birinchi marta yoziladi."""
    user = get_user(telegram_id)
    data = dict(fields)
    data["registered"] = 1
    if user and not str(user.get("registered_at") or "").strip():
        data["registered_at"] = _now()
    update_user(telegram_id, **data)
    touch_last_seen(telegram_id)


def get_user(telegram_id: int) -> dict | None:
    with _lock:
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


def get_reg_step(telegram_id: int) -> str:
    user = get_user(telegram_id)
    return str((user or {}).get("reg_step") or "").strip()


def set_reg_step(telegram_id: int, step: str) -> None:
    ensure_user(telegram_id)
    update_user(telegram_id, reg_step=str(step or ""))


def clear_reg_step(telegram_id: int) -> None:
    set_reg_step(telegram_id, "")


def reset_registration(telegram_id: int) -> None:
    """Test uchun: foydalanuvchini qayta ro'yxatdan o'tish holatiga qaytaradi."""
    ensure_user(telegram_id)
    update_user(
        telegram_id,
        first_name="",
        last_name="",
        phone="",
        registered=0,
        registered_at="",
        reg_step="",
    )
    clear_review_state(telegram_id)


def get_review_state(telegram_id: int) -> dict:
    user = get_user(telegram_id)
    raw = str((user or {}).get("review_state") or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def set_review_state(telegram_id: int, state: dict | None) -> None:
    ensure_user(telegram_id)
    if not state:
        update_user(telegram_id, review_state="")
        return
    update_user(telegram_id, review_state=json.dumps(state, ensure_ascii=False))


def clear_review_state(telegram_id: int) -> None:
    set_review_state(telegram_id, None)


_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS processed_updates (
        update_id  INTEGER PRIMARY KEY,
        created_at TEXT    NOT NULL
    )
    """
)
_conn.commit()


def claim_telegram_update(update_id: int) -> bool:
    """Bir xil Telegram update ikki marta ishlanmasin. True = yangi."""
    try:
        with _lock:
            _conn.execute(
                "INSERT INTO processed_updates (update_id, created_at) VALUES (?, ?)",
                (int(update_id), _now()),
            )
            # eski yozuvlarni tozalash (24 soatdan eski)
            cutoff = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
            _conn.execute(
                "DELETE FROM processed_updates WHERE created_at < ?", (cutoff,)
            )
            _conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


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


def get_bonus_config() -> dict:
    """Birinchi xarid bonusi sozlamalari."""
    s = get_settings()
    enabled_raw = str(s.get("bonus_enabled", "1")).strip().lower()
    enabled = enabled_raw in ("1", "true", "yes", "on")
    try:
        cny = float(str(s.get("bonus_cny") or "5").replace(",", "."))
    except (TypeError, ValueError):
        cny = 5.0
    try:
        min_cny = float(str(s.get("bonus_min_cny") or "50").replace(",", "."))
    except (TypeError, ValueError):
        min_cny = 50.0
    if cny <= 0:
        cny = 5.0
    if min_cny <= 0:
        min_cny = 50.0
    # Butun son ko'rsatish uchun
    cny_i = int(cny) if abs(cny - round(cny)) < 1e-9 else cny
    min_i = int(min_cny) if abs(min_cny - round(min_cny)) < 1e-9 else min_cny
    return {
        "enabled": enabled,
        "cny": cny_i,
        "min_cny": min_i,
    }


# ---------------------------------------------------------------- Test mode

_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS test_users (
        telegram_id INTEGER PRIMARY KEY,
        note        TEXT    NOT NULL DEFAULT '',
        created_at  TEXT    NOT NULL
    )
    """
)
_conn.commit()


def is_test_mode() -> bool:
    raw = str(get_settings().get("test_mode", "0")).strip().lower()
    return raw in ("1", "true", "yes", "on")


def set_test_mode(enabled: bool) -> dict:
    set_settings({"test_mode": "1" if enabled else "0"})
    return get_test_mode_config()


def list_test_user_ids() -> set[int]:
    rows = _conn.execute("SELECT telegram_id FROM test_users").fetchall()
    return {int(r["telegram_id"]) for r in rows}


def list_test_users() -> list[dict]:
    rows = _conn.execute(
        "SELECT t.telegram_id, t.note, t.created_at,"
        " u.first_name, u.last_name, u.username, u.unique_id"
        " FROM test_users t"
        " LEFT JOIN users u ON u.telegram_id = t.telegram_id"
        " ORDER BY t.created_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def add_test_user(telegram_id: int, note: str = "") -> dict:
    tid = int(telegram_id)
    ensure_user(tid)
    with _lock:
        _conn.execute(
            "INSERT INTO test_users (telegram_id, note, created_at) VALUES (?, ?, ?)"
            " ON CONFLICT(telegram_id) DO UPDATE SET note = excluded.note",
            (tid, str(note or "").strip(), _now()),
        )
        _conn.commit()
    return next((u for u in list_test_users() if int(u["telegram_id"]) == tid), {"telegram_id": tid})


def remove_test_user(telegram_id: int) -> bool:
    with _lock:
        cur = _conn.execute(
            "DELETE FROM test_users WHERE telegram_id = ?", (int(telegram_id),)
        )
        _conn.commit()
        return cur.rowcount > 0


def is_bot_access_allowed(telegram_id: int, *, allow_admins: bool = True) -> bool:
    """Test rejimda faqat test userlar (+ adminlar boshqaruv uchun)."""
    if not is_test_mode():
        return True
    tid = int(telegram_id)
    if tid in list_test_user_ids():
        return True
    if allow_admins:
        user = get_user(tid)
        if user and (user.get("is_super_admin") or user.get("is_admin")):
            return True
    return False


def broadcast_audience() -> list[dict]:
    """Ommaviy xabar oluvchilar — test rejimda faqat test userlar."""
    users = all_users()
    if not is_test_mode():
        return users
    allowed = list_test_user_ids()
    return [u for u in users if int(u["telegram_id"]) in allowed]


def get_test_mode_config() -> dict:
    return {
        "enabled": is_test_mode(),
        "users": list_test_users(),
        "count": len(list_test_user_ids()),
    }


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


# ---------------------------------------------------------------- Broadcasts (ommaviy xabar)

_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS broadcasts (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        text            TEXT    NOT NULL DEFAULT '',
        image_url       TEXT    NOT NULL DEFAULT '',
        mode            TEXT    NOT NULL DEFAULT 'once',
        interval_hours  INTEGER NOT NULL DEFAULT 0,
        active          INTEGER NOT NULL DEFAULT 1,
        last_sent_at    TEXT    NOT NULL DEFAULT '',
        next_send_at    TEXT    NOT NULL DEFAULT '',
        send_count      INTEGER NOT NULL DEFAULT 0,
        last_sent       INTEGER NOT NULL DEFAULT 0,
        last_failed     INTEGER NOT NULL DEFAULT 0,
        created_by      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT    NOT NULL
    )
    """
)
_conn.commit()


def create_broadcast(
    *,
    text: str,
    image_url: str = "",
    mode: str = "once",
    interval_hours: int = 0,
    created_by: int = 0,
    send_now: bool = True,
) -> dict:
    """mode: once | interval. send_now=True bo'lsa next_send_at=hozir."""
    now = _now()
    mode = "interval" if mode == "interval" else "once"
    hours = max(1, int(interval_hours or 0)) if mode == "interval" else 0
    next_at = now if send_now else (
        (datetime.now() + timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
        if mode == "interval"
        else now
    )
    with _lock:
        cur = _conn.execute(
            "INSERT INTO broadcasts"
            " (text, image_url, mode, interval_hours, active, next_send_at, created_by, created_at)"
            " VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
            (
                str(text or "").strip(),
                str(image_url or "").strip(),
                mode,
                hours,
                next_at,
                int(created_by or 0),
                now,
            ),
        )
        _conn.commit()
        bid = cur.lastrowid
    return get_broadcast(bid)


def get_broadcast(broadcast_id: int) -> dict | None:
    row = _conn.execute(
        "SELECT * FROM broadcasts WHERE id = ?", (int(broadcast_id),)
    ).fetchone()
    return dict(row) if row else None


def list_broadcasts(limit: int = 50) -> list[dict]:
    rows = _conn.execute(
        "SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT ?",
        (max(1, min(int(limit), 200)),),
    ).fetchall()
    return [dict(r) for r in rows]


def stop_broadcast(broadcast_id: int) -> dict | None:
    with _lock:
        _conn.execute(
            "UPDATE broadcasts SET active = 0, next_send_at = '' WHERE id = ?",
            (int(broadcast_id),),
        )
        _conn.commit()
    return get_broadcast(broadcast_id)


def delete_broadcast(broadcast_id: int) -> bool:
    with _lock:
        cur = _conn.execute(
            "DELETE FROM broadcasts WHERE id = ?", (int(broadcast_id),)
        )
        _conn.commit()
        return cur.rowcount > 0


def claim_due_broadcasts() -> list[dict]:
    """Yuborish vaqti kelgan aktiv broadcastlarni oladi (atomic next_send_at yangilanadi)."""
    now = _now()
    claimed: list[dict] = []
    with _lock:
        rows = _conn.execute(
            "SELECT * FROM broadcasts"
            " WHERE active = 1 AND next_send_at != '' AND next_send_at <= ?"
            " ORDER BY next_send_at ASC LIMIT 20",
            (now,),
        ).fetchall()
        for row in rows:
            item = dict(row)
            bid = int(item["id"])
            mode = item.get("mode") or "once"
            hours = int(item.get("interval_hours") or 0)
            if mode == "interval" and hours > 0:
                next_at = (datetime.now() + timedelta(hours=hours)).strftime(
                    "%Y-%m-%d %H:%M:%S"
                )
                active = 1
            else:
                next_at = ""
                active = 0
            cur = _conn.execute(
                "UPDATE broadcasts SET next_send_at = ?, active = ?"
                " WHERE id = ? AND active = 1 AND next_send_at = ?",
                (next_at, active, bid, item.get("next_send_at") or ""),
            )
            if cur.rowcount:
                item["next_send_at"] = next_at
                item["active"] = active
                claimed.append(item)
        _conn.commit()
    return claimed


def mark_broadcast_sent(broadcast_id: int, sent: int, failed: int) -> None:
    now = _now()
    with _lock:
        _conn.execute(
            "UPDATE broadcasts SET last_sent_at = ?, last_sent = ?, last_failed = ?,"
            " send_count = send_count + 1 WHERE id = ?",
            (now, int(sent), int(failed), int(broadcast_id)),
        )
        _conn.commit()
