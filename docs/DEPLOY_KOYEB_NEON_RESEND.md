# استقرار رایگان Backend با Koyeb، Neon و Resend

این راهنما برای استقرار آزمایشی پروژه است. پرداخت mock در production غیرفعال
می‌ماند و تا زمان پیاده‌سازی provider واقعی نباید برای فروش واقعی credit استفاده
شود.

## ۱. آماده‌سازی GitHub

یک repository خصوصی در GitHub بسازید و پروژه را push کنید:

```bash
git add .
git commit -m "chore(deploy): configure Koyeb Neon and Resend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

فایل‌های `.env` در `.gitignore` هستند. آن‌ها را commit نکنید.

## ۲. ساخت PostgreSQL در Neon

1. وارد `https://console.neon.tech` شوید.
2. یک project جدید بسازید.
3. نزدیک‌ترین region به سرور Koyeb را انتخاب کنید. برای Koyeb Frankfurt یک
   region اروپایی Neon انتخاب کنید.
4. از صفحه Connect، connection string نوع `Direct connection` را کپی کنید.
5. مطمئن شوید انتهای آن `sslmode=require` دارد.

نمونه:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

connection string را داخل GitHub یا فایل‌های پروژه قرار ندهید. migrationها هنگام
شروع container با `prisma migrate deploy` اجرا می‌شوند.

## ۳. آماده‌سازی Resend

1. وارد `https://resend.com` شوید و حساب بسازید.
2. در بخش API Keys یک کلید با دسترسی ارسال ایمیل بسازید.
3. مقدار `re_...` را همان لحظه در محل امن نگه دارید.
4. برای تست اولیه از `Dlander <onboarding@resend.dev>` استفاده کنید.

فرستنده آزمایشی Resend فقط اجازه ارسال به ایمیل صاحب حساب را می‌دهد. برای ارسال
به کاربران:

1. یک دامنه تهیه کنید.
2. در Resend به Domains بروید و دامنه یا subdomain مثل `mail.example.com` را
   اضافه کنید.
3. رکوردهای SPF و DKIM نمایش‌داده‌شده را در DNS وارد کنید.
4. بعد از وضعیت Verified، مقدار زیر را تنظیم کنید:

```env
MAIL_FROM=Dlander <no-reply@mail.example.com>
```

پروژه از Resend HTTPS API استفاده می‌کند، بنابراین به پورت SMTP وابسته نیست.

## ۴. تولید secretها

در PowerShell این دستور را سه بار اجرا کنید:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

خروجی‌های متفاوت را برای این متغیرها نگه دارید:

```text
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
PAYMENT_WEBHOOK_SECRET
```

هیچ دو مقداری نباید یکسان باشند.

## ۵. ساخت Web Service در Koyeb

1. وارد `https://app.koyeb.com` شوید.
2. Create Web Service را انتخاب کنید.
3. GitHub را متصل و repository خصوصی پروژه را انتخاب کنید.
4. Builder را روی Dockerfile قرار دهید.
5. Free Instance و region Frankfurt را انتخاب کنید.
6. Port را `3000` و protocol را HTTP قرار دهید.
7. Health check را روی مسیر `/health/live` تنظیم کنید.
8. متغیرهای زیر را در Environment Variables وارد کنید.

مقادیر واقعی را جایگزین کنید:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=CONNECTION_STRING_COPIED_FROM_NEON

JWT_ACCESS_SECRET=FIRST_RANDOM_SECRET
JWT_REFRESH_SECRET=SECOND_RANDOM_SECRET
PAYMENT_WEBHOOK_SECRET=THIRD_RANDOM_SECRET
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
EMAIL_VERIFICATION_EXPIRES_IN=24h
PASSWORD_RESET_EXPIRES_IN=1h

FRONTEND_URL=https://YOUR_FRONTEND_DOMAIN
CORS_ORIGINS=https://YOUR_FRONTEND_DOMAIN
AUTH_REFRESH_TOKEN_TRANSPORT=body
AUTH_REFRESH_COOKIE_NAME=refresh_token

MAIL_TRANSPORT=resend
RESEND_API_KEY=YOUR_RESEND_API_KEY
MAIL_FROM=Dlander <onboarding@resend.dev>

LOG_LEVELS=log,error,warn
TRUST_PROXY=1

API_REQUEST_STORAGE_ENABLED=true
API_REQUEST_BODY_CAPTURE_ENABLED=false
API_REQUEST_RETENTION_DAYS=7
API_REQUEST_MAX_BODY_BYTES=8192
API_REQUEST_MAX_QUERY_BYTES=4096
API_REQUEST_PERSISTENCE_MODE=buffered
API_REQUEST_QUEUE_MAX_SIZE=1000
API_REQUEST_CAPTURE_IP=false

AI_HISTORY_STORE_INPUT=true
AI_HISTORY_STORE_OUTPUT=true
AI_HISTORY_MAX_INPUT_BYTES=8192
AI_HISTORY_MAX_OUTPUT_BYTES=8192
AI_HISTORY_RETENTION_DAYS=14
AI_PROVIDER_TIMEOUT_MS=30000

DEFAULT_CURRENCY=USD
CREDIT_MAX_TRANSACTION_AMOUNT=1000000000
CREDIT_RESERVATION_TTL_SECONDS=900

PAYMENT_PROVIDER=mock
MOCK_PAYMENT_ENABLED=false
PAYMENT_RETURN_URL=https://YOUR_FRONTEND_DOMAIN/credits/payment/success
PAYMENT_CANCEL_URL=https://YOUR_FRONTEND_DOMAIN/credits/payment/cancel

AI_CREDIT_CHARGING_ENABLED=true
AI_CREDIT_FIXED_COST=1
AI_CREDIT_INPUT_UNIT_BYTES=4096
AI_CREDIT_INPUT_UNIT_COST=1
AI_CREDIT_OUTPUT_UNIT_BYTES=4096
AI_CREDIT_OUTPUT_UNIT_COST=0
```

اگر هنوز frontend آنلاین ندارید، موقتاً URL واقعی localhost قابل استفاده نیست.
ابتدا frontend را deploy کنید یا یک URL معتبر آزمایشی HTTPS قرار دهید. بعداً هر
دو متغیر `FRONTEND_URL` و `CORS_ORIGINS` را اصلاح و redeploy کنید.

9. روی Deploy کلیک کنید.
10. در log باید اجرای موفق این مراحل را ببینید:

```text
prisma migrate deploy
node dist/main
```

## ۶. کنترل استقرار

آدرس Koyeb شبیه زیر است:

```text
https://YOUR_APP-YOUR_ORG.koyeb.app
```

این مسیرها را بررسی کنید:

```text
GET /health/live
GET /health/ready
GET /api/docs
GET /api/docs-json
```

`/health/live` روشن‌بودن برنامه و `/health/ready` اتصال واقعی Neon را بررسی
می‌کند.

## ۷. آزمایش ثبت‌نام و ایمیل

تا قبل از verify کردن دامنه Resend، در Swagger فقط ایمیل خود حساب Resend را
استفاده کنید:

```json
{
  "email": "YOUR_RESEND_ACCOUNT_EMAIL",
  "password": "StrongPass123",
  "displayName": "Test User"
}
```

در Swagger:

```text
POST /api/v1/auth/register
```

پس از دریافت ایمیل، token داخل لینک را بردارید و این endpoint را اجرا کنید:

```text
POST /api/v1/auth/verify-email
```

## ۸. عیب‌یابی

### برنامه بالا نمی‌آید

در Koyeb Logs دنبال خطای validation متغیرهای محیطی یا `prisma migrate deploy`
بگردید. تمام متغیرهای فایل `.env.production.example` باید مقدار معتبر داشته
باشند.

### دیتابیس وصل نمی‌شود

- connection string باید Direct Neon باشد.
- `sslmode=require` باید وجود داشته باشد.
- password دارای کاراکترهای خاص باید در URL encode شده باشد؛ connection string
  آماده Neon را بدون دستکاری کپی کنید.
- `/health/ready` را بررسی کنید.

### ایمیل ارسال نمی‌شود

- `MAIL_TRANSPORT=resend` باشد.
- API key با `re_` شروع شود.
- با `onboarding@resend.dev` فقط به ایمیل حساب Resend ارسال کنید.
- برای سایر گیرنده‌ها ابتدا دامنه را verify کنید.
- پاسخ خطای Resend در Koyeb Logs ثبت می‌شود.

### خطای CORS

مقدار `CORS_ORIGINS` باید origin دقیق frontend باشد و در انتها `/` نداشته باشد:

```env
CORS_ORIGINS=https://app.example.com
```

## ۹. محدودیت‌های محیط رایگان

- Koyeb Free بعد از یک ساعت بی‌ترافیکی به حالت sleep می‌رود.
- Neon Free فضای محدود دارد؛ retentionهای production example را افزایش ندهید.
- Resend Free محدودیت روزانه و ماهانه دارد.
- `MOCK_PAYMENT_ENABLED=false` را تغییر ندهید.
- این محیط برای تست و Pilot است، نه پرداخت واقعی یا SLA شرکتی.
