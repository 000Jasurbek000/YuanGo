"""Konkurs / referal ball tizimi (DB + biznes logika)."""

from __future__ import annotations

from datetime import datetime, timedelta

import db

# Ball qiymatlari
PTS_ENTRY = 5
PTS_REGISTER = 10
PTS_CHANNEL = 10
PTS_REF_START = 5
PTS_REF_REGISTER = 10
PTS_REF_CHANNEL = 10

DEFAULT_PRIZE_POOL = 300_000
DEFAULT_PRIZE_1 = 150_000
DEFAULT_PRIZE_2 = 100_000
DEFAULT_PRIZE_3 = 50_000

# Orqaga moslik
PRIZE_POOL = DEFAULT_PRIZE_POOL
PRIZE_1 = DEFAULT_PRIZE_1
PRIZE_2 = DEFAULT_PRIZE_2
PRIZE_3 = DEFAULT_PRIZE_3


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _parse_prize(value, default: int) -> int:
    try:
        n = int(float(str(value).replace(" ", "").replace(",", ".")))
    except (TypeError, ValueError):
        return int(default)
    return max(0, min(n, 1_000_000_000))


def fmt_uzs_amount(n: int | float) -> str:
    try:
        return f"{int(n):,}".replace(",", " ")
    except (TypeError, ValueError):
        return "0"


# --- schema ---
db._conn.execute(
    """
    CREATE TABLE IF NOT EXISTS contest_profile (
        telegram_id   INTEGER PRIMARY KEY,
        points        INTEGER NOT NULL DEFAULT 0,
        self_entry    INTEGER NOT NULL DEFAULT 0,
        self_register INTEGER NOT NULL DEFAULT 0,
        self_channel  INTEGER NOT NULL DEFAULT 0,
        referred_by   INTEGER,
        created_at    TEXT    NOT NULL,
        updated_at    TEXT    NOT NULL
    )
    """
)
db._conn.execute(
    """
    CREATE TABLE IF NOT EXISTS contest_ref_events (
        referrer_id INTEGER NOT NULL,
        referred_id INTEGER NOT NULL,
        event       TEXT    NOT NULL,
        points      INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL,
        PRIMARY KEY (referrer_id, referred_id, event)
    )
    """
)
db._conn.commit()

for _k, _v in {
    "contest_enabled": "0",
    "contest_days": "7",
    "contest_ends_at": "",
    "contest_channel": "@Yuan_Go",
    "contest_reminded_2d": "0",
    "contest_reminded_1d": "0",
    "contest_started_at": "",
    "contest_prize_pool": str(DEFAULT_PRIZE_POOL),
    "contest_prize_1": str(DEFAULT_PRIZE_1),
    "contest_prize_2": str(DEFAULT_PRIZE_2),
    "contest_prize_3": str(DEFAULT_PRIZE_3),
}.items():
    db._conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (_k, _v)
    )
db._conn.commit()


def is_contest_enabled() -> bool:
    raw = str(db.get_settings().get("contest_enabled", "0")).strip().lower()
    return raw in ("1", "true", "yes", "on")


def get_contest_config() -> dict:
    s = db.get_settings()
    try:
        days = int(float(s.get("contest_days") or 7))
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(days, 365))
    ends = str(s.get("contest_ends_at") or "").strip()
    left_days = None
    if ends:
        try:
            end_dt = datetime.strptime(ends, "%Y-%m-%d %H:%M:%S")
            left_days = max(0, (end_dt - datetime.now()).total_seconds() / 86400.0)
        except ValueError:
            left_days = None
    return {
        "enabled": is_contest_enabled(),
        "days": days,
        "ends_at": ends,
        "channel": str(s.get("contest_channel") or "@Yuan_Go").strip() or "@Yuan_Go",
        "reminded_2d": str(s.get("contest_reminded_2d") or "0") in ("1", "true"),
        "reminded_1d": str(s.get("contest_reminded_1d") or "0") in ("1", "true"),
        "started_at": str(s.get("contest_started_at") or ""),
        "left_days": left_days,
        "prize_pool": _parse_prize(s.get("contest_prize_pool"), DEFAULT_PRIZE_POOL),
        "prize_1": _parse_prize(s.get("contest_prize_1"), DEFAULT_PRIZE_1),
        "prize_2": _parse_prize(s.get("contest_prize_2"), DEFAULT_PRIZE_2),
        "prize_3": _parse_prize(s.get("contest_prize_3"), DEFAULT_PRIZE_3),
    }


def update_contest_prizes(
    prize_pool=None,
    prize_1=None,
    prize_2=None,
    prize_3=None,
) -> dict:
    cur = get_contest_config()
    db.set_settings(
        {
            "contest_prize_pool": str(
                _parse_prize(
                    prize_pool if prize_pool is not None else cur["prize_pool"],
                    DEFAULT_PRIZE_POOL,
                )
            ),
            "contest_prize_1": str(
                _parse_prize(
                    prize_1 if prize_1 is not None else cur["prize_1"],
                    DEFAULT_PRIZE_1,
                )
            ),
            "contest_prize_2": str(
                _parse_prize(
                    prize_2 if prize_2 is not None else cur["prize_2"],
                    DEFAULT_PRIZE_2,
                )
            ),
            "contest_prize_3": str(
                _parse_prize(
                    prize_3 if prize_3 is not None else cur["prize_3"],
                    DEFAULT_PRIZE_3,
                )
            ),
        }
    )
    return get_contest_config()


def set_contest_enabled(
    enabled: bool,
    days: int | None = None,
    channel: str | None = None,
    prizes: dict | None = None,
) -> dict:
    values: dict = {"contest_enabled": "1" if enabled else "0"}
    if channel is not None:
        ch = str(channel).strip()
        if ch:
            values["contest_channel"] = ch
    if prizes:
        values["contest_prize_pool"] = str(
            _parse_prize(prizes.get("prize_pool"), DEFAULT_PRIZE_POOL)
        )
        values["contest_prize_1"] = str(
            _parse_prize(prizes.get("prize_1"), DEFAULT_PRIZE_1)
        )
        values["contest_prize_2"] = str(
            _parse_prize(prizes.get("prize_2"), DEFAULT_PRIZE_2)
        )
        values["contest_prize_3"] = str(
            _parse_prize(prizes.get("prize_3"), DEFAULT_PRIZE_3)
        )
    if enabled:
        d = days if days is not None else get_contest_config()["days"]
        try:
            d = int(d)
        except (TypeError, ValueError):
            d = 7
        d = max(1, min(d, 365))
        values["contest_days"] = str(d)
        values["contest_started_at"] = _now()
        values["contest_ends_at"] = (datetime.now() + timedelta(days=d)).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        values["contest_reminded_2d"] = "0"
        values["contest_reminded_1d"] = "0"
    db.set_settings(values)
    return get_contest_config()


def update_contest_channel(channel: str) -> dict:
    ch = str(channel or "").strip() or "@Yuan_Go"
    db.set_settings({"contest_channel": ch})
    return get_contest_config()


def ensure_profile(telegram_id: int) -> dict:
    tid = int(telegram_id)
    with db._lock:
        row = db._conn.execute(
            "SELECT * FROM contest_profile WHERE telegram_id = ?", (tid,)
        ).fetchone()
        if row:
            return dict(row)
        now = _now()
        db._conn.execute(
            "INSERT INTO contest_profile"
            " (telegram_id, points, created_at, updated_at) VALUES (?, 0, ?, ?)",
            (tid, now, now),
        )
        db._conn.commit()
    return get_profile(tid) or {}


def get_profile(telegram_id: int) -> dict | None:
    row = db._conn.execute(
        "SELECT * FROM contest_profile WHERE telegram_id = ?",
        (int(telegram_id),),
    ).fetchone()
    return dict(row) if row else None


def _add_points(telegram_id: int, pts: int) -> int:
    tid = int(telegram_id)
    ensure_profile(tid)
    with db._lock:
        db._conn.execute(
            "UPDATE contest_profile SET points = points + ?, updated_at = ?"
            " WHERE telegram_id = ?",
            (int(pts), _now(), tid),
        )
        db._conn.commit()
    p = get_profile(tid)
    return int((p or {}).get("points") or 0)


def _set_flag(telegram_id: int, field: str) -> None:
    if field not in ("self_entry", "self_register", "self_channel"):
        return
    with db._lock:
        db._conn.execute(
            f"UPDATE contest_profile SET {field} = 1, updated_at = ?"
            " WHERE telegram_id = ?",
            (_now(), int(telegram_id)),
        )
        db._conn.commit()


def set_referred_by(telegram_id: int, referrer_id: int) -> bool:
    """Bir marta bog'lash. True = yangi bog'landi."""
    tid = int(telegram_id)
    rid = int(referrer_id)
    if tid == rid:
        return False
    ensure_profile(tid)
    ensure_profile(rid)
    with db._lock:
        row = db._conn.execute(
            "SELECT referred_by FROM contest_profile WHERE telegram_id = ?",
            (tid,),
        ).fetchone()
        if row and row["referred_by"]:
            return False
        db._conn.execute(
            "UPDATE contest_profile SET referred_by = ?, updated_at = ?"
            " WHERE telegram_id = ? AND (referred_by IS NULL OR referred_by = 0)",
            (rid, _now(), tid),
        )
        db._conn.commit()
        check = db._conn.execute(
            "SELECT referred_by FROM contest_profile WHERE telegram_id = ?",
            (tid,),
        ).fetchone()
        return bool(check and int(check["referred_by"] or 0) == rid)


def _credit_ref_event(
    referrer_id: int, referred_id: int, event: str, points: int
) -> bool:
    if referrer_id == referred_id or points <= 0:
        return False
    with db._lock:
        try:
            db._conn.execute(
                "INSERT INTO contest_ref_events"
                " (referrer_id, referred_id, event, points, created_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (int(referrer_id), int(referred_id), event, int(points), _now()),
            )
            db._conn.commit()
        except Exception:
            return False
    _add_points(referrer_id, points)
    return True


def invite_count(telegram_id: int) -> int:
    row = db._conn.execute(
        "SELECT COUNT(DISTINCT referred_id) AS c FROM contest_ref_events"
        " WHERE referrer_id = ? AND event = 'start'",
        (int(telegram_id),),
    ).fetchone()
    return int(row["c"] if row else 0)


def award_self_entry(telegram_id: int) -> dict | None:
    if not is_contest_enabled():
        return None
    p = ensure_profile(telegram_id)
    if int(p.get("self_entry") or 0):
        return None
    _set_flag(telegram_id, "self_entry")
    total = _add_points(telegram_id, PTS_ENTRY)
    return {"event": "entry", "points": PTS_ENTRY, "total": total}


def award_self_register(telegram_id: int) -> dict | None:
    if not is_contest_enabled():
        return None
    p = ensure_profile(telegram_id)
    if int(p.get("self_register") or 0):
        return None
    user = db.get_user(int(telegram_id))
    if not user or not user.get("registered"):
        return None
    _set_flag(telegram_id, "self_register")
    total = _add_points(telegram_id, PTS_REGISTER)
    return {"event": "register", "points": PTS_REGISTER, "total": total}


def award_self_channel(telegram_id: int) -> dict | None:
    if not is_contest_enabled():
        return None
    p = ensure_profile(telegram_id)
    if int(p.get("self_channel") or 0):
        return None
    _set_flag(telegram_id, "self_channel")
    total = _add_points(telegram_id, PTS_CHANNEL)
    return {"event": "channel", "points": PTS_CHANNEL, "total": total}


def bootstrap_self_for_user(telegram_id: int) -> list[dict]:
    """Konkursga kirganda: entry (+ register agar allaqachon registered)."""
    gained = []
    a = award_self_entry(telegram_id)
    if a:
        gained.append(a)
    user = db.get_user(int(telegram_id))
    if user and user.get("registered"):
        a = award_self_register(telegram_id)
        if a:
            gained.append(a)
    return gained


def on_referral_start(referred_id: int, referrer_id: int) -> dict | None:
    if not is_contest_enabled():
        return None
    if not set_referred_by(referred_id, referrer_id):
        return None
    if not _credit_ref_event(referrer_id, referred_id, "start", PTS_REF_START):
        return None
    p = get_profile(referrer_id)
    return {
        "event": "ref_start",
        "points": PTS_REF_START,
        "total": int((p or {}).get("points") or 0),
        "referred_id": int(referred_id),
        "referrer_id": int(referrer_id),
    }


def on_referral_register(referred_id: int) -> dict | None:
    if not is_contest_enabled():
        return None
    award_self_register(int(referred_id))
    p = get_profile(int(referred_id))
    if not p or not p.get("referred_by"):
        return None
    rid = int(p["referred_by"])
    if not _credit_ref_event(rid, int(referred_id), "register", PTS_REF_REGISTER):
        return None
    rp = get_profile(rid)
    return {
        "event": "ref_register",
        "points": PTS_REF_REGISTER,
        "total": int((rp or {}).get("points") or 0),
        "referred_id": int(referred_id),
        "referrer_id": rid,
    }


def on_channel_subscribe(referred_id: int) -> dict:
    """Kanal tekshiruvi muvaffaqiyatli — self + optional ref."""
    self_award = award_self_channel(int(referred_id))
    ref_award = None
    p = get_profile(int(referred_id))
    if p and p.get("referred_by"):
        rid = int(p["referred_by"])
        if _credit_ref_event(rid, int(referred_id), "channel", PTS_REF_CHANNEL):
            rp = get_profile(rid)
            ref_award = {
                "event": "ref_channel",
                "points": PTS_REF_CHANNEL,
                "total": int((rp or {}).get("points") or 0),
                "referred_id": int(referred_id),
                "referrer_id": rid,
            }
    return {"self": self_award, "ref": ref_award}


def mask_public_name(
    first_name: str | None = None,
    last_name: str | None = None,
    username: str | None = None,
    telegram_id: int | None = None,
) -> str:
    """TOP uchun: ism to‘liq, familiya 3 belgi+..., otasining ismi yashirinadi."""
    first = str(first_name or "").strip()
    # last_name: "Familiya OtasiningIsmi" — faqat birinchi so‘z (familiya)
    last_parts = str(last_name or "").strip().split()
    family = last_parts[0] if last_parts else ""
    if family:
        if len(family) <= 3:
            masked_family = family + "..."
        else:
            masked_family = family[:3] + "..."
    else:
        masked_family = ""
    name = f"{first} {masked_family}".strip()
    if name:
        return name
    if username:
        return f"@{username}"
    if telegram_id:
        return str(telegram_id)
    return "—"


def top_ranking(limit: int = 10) -> list[dict]:
    rows = db._conn.execute(
        "SELECT c.telegram_id, c.points, u.first_name, u.last_name, u.username"
        " FROM contest_profile c"
        " LEFT JOIN users u ON u.telegram_id = c.telegram_id"
        " WHERE c.points > 0"
        " ORDER BY c.points DESC, c.updated_at ASC"
        " LIMIT ?",
        (max(1, min(int(limit), 50)),),
    ).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        item["display_name"] = mask_public_name(
            item.get("first_name"),
            item.get("last_name"),
            item.get("username"),
            item.get("telegram_id"),
        )
        out.append(item)
    return out


def user_rank(telegram_id: int) -> tuple[int | None, int]:
    p = get_profile(int(telegram_id))
    pts = int((p or {}).get("points") or 0)
    if pts <= 0:
        return None, 0
    row = db._conn.execute(
        "SELECT COUNT(*) AS c FROM contest_profile WHERE points > ?",
        (pts,),
    ).fetchone()
    return int(row["c"]) + 1, pts


def parse_ref_payload(text: str) -> int | None:
    parts = (text or "").strip().split(maxsplit=1)
    if len(parts) < 2:
        return None
    payload = parts[1].strip()
    if payload.lower().startswith("ref"):
        payload = payload[3:]
    if payload.startswith("_"):
        payload = payload[1:]
    if not payload.isdigit():
        return None
    tid = int(payload)
    return tid if tid > 0 else None


def due_contest_reminders() -> list[str]:
    cfg = get_contest_config()
    if not cfg["enabled"] or not cfg["ends_at"] or cfg["left_days"] is None:
        return []
    left = cfg["left_days"]
    due = []
    if left <= 2.05 and left > 1.0 and not cfg["reminded_2d"]:
        due.append("2d")
    if left <= 1.05 and left >= 0 and not cfg["reminded_1d"]:
        due.append("1d")
    return due


def mark_reminder_sent(kind: str) -> None:
    if kind == "2d":
        db.set_settings({"contest_reminded_2d": "1"})
    elif kind == "1d":
        db.set_settings({"contest_reminded_1d": "1"})
