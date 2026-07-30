# Yuan Go

Telegram Mini App + bot: CNY (yuan) sotib olish — Flask, SQLite, pyTelegramBotAPI.

## Imkoniyatlar

- Foydalanuvchi Mini App (uz / ru / en, light/dark)
- Admin panel (yuan yuborish: tasdiqlash / bekor)
- Super Admin panel (kartalar, sozlamalar, statistika, adminlar, sharhlar)
- Muvaffaqiyatli TX dan keyin sharh → kanal + Mini App karusel
- Sozlamalar o‘zgarsa barcha foydalanuvchilarga xabar
- Upload limi: 10 MB / user, yopiq cheklar 7 kundan keyin tozalanadi

## Tezkor start

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

`.env` ni to‘ldiring (`BOT_TOKEN`, `WEBAPP_URL`, `OWNER_TELEGRAM_ID`).

```bash
python main.py
```

- Lokal: http://localhost:3000  
- Bot: [@yuan_go_bot](https://t.me/yuan_go_bot)

## HTTPS (Telegram Mini App)

Telegram WebApp uchun HTTPS shart. Lokal uchun:

1. `.env` ga `NGROK_AUTHTOKEN` qo‘ying — bot o‘zi tunnel ochadi, yoki
2. `ngrok http 3000` → `WEBAPP_URL=https://....ngrok-free.app`

## Rollar

| Rol | Qanday | Mini App / panel |
|-----|--------|------------------|
| Super admin | `OWNER_TELEGRAM_ID` | Super Admin + Admin + Foydalanuvchi |
| Admin | Super Admin → Adminlar | Admin + Foydalanuvchi |
| Foydalanuvchi | `/start` | Foydalanuvchi |

## Xavfsizlik

- `.env`, `yuango.db`, `uploads/` gitga **kirmaydi**
- Token / ngrok kalitini hech qachon commit qilmang
- Sharh kanaliga botni **admin** qilib qo‘ying
- Productionda HTTPS + kuchli host (VPS / Railway / Render)

## Loyiha tuzilishi

```
main.py          # Bot + Flask API
db.py            # SQLite
public/          # Mini App + admin UI
uploads/         # Yuklangan cheklar (gitignore)
.env.example     # Namuna sozlamalar
```

## Repo

https://github.com/000Jasurbek000/YuanGo
