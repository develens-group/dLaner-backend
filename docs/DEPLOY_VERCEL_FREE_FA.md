# انتشار رایگان بک‌اند روی Vercel

این پروژه با پشتیبانی رسمی و بدون تنظیم مسیر دستی، به‌صورت یک NestJS Function روی
Vercel اجرا می‌شود. فایل `src/main.ts` ورودی برنامه است. دیتابیس و ایمیل باید
سرویس خارجی باشند؛ پیشنهاد این راهنما Neon و Resend است.

## ۱. پیش‌نیازها

- پروژه را در یک repository خصوصی GitHub/GitLab/Bitbucket قرار دهید.
- حساب رایگان Vercel، Neon و در صورت نیاز Resend بسازید.
- فایل‌های `.env` را commit نکنید. فقط فایل‌های `*.example` باید در Git باشند.
- مقادیر secret داخل فایل‌های example را هرگز در production استفاده نکنید.

## ۲. دیتابیس رایگان Neon

1. در Neon یک Project و database بسازید. region نزدیک به `fra1` (Frankfurt)
   انتخاب شود.
2. از بخش Connect، URL نوع **Direct connection** را موقتاً کپی کنید.
3. روی کامپیوتر خود و در ریشه پروژه migrationها را اجرا کنید:

   ```powershell
   $env:DATABASE_URL='NEON_DIRECT_CONNECTION_URL'
   npm run db:migrate:deploy
   Remove-Item Env:DATABASE_URL
   ```

4. دوباره در Neon، URL نوع **Pooled connection** را کپی کنید. این مقدار
   `DATABASE_URL` در Vercel خواهد بود. وجود `sslmode=require` را حفظ کنید.

Migration را در Build Command یا شروع هر Function اجرا نکنید. هر migration جدید
را یک‌بار با Direct URL و فرمان بالا اجرا کنید و سپس deploy کنید.

## ۳. ساخت secretهای امن

سه مقدار متفاوت بسازید:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

فرمان را سه بار اجرا کنید و خروجی‌ها را برای `JWT_ACCESS_SECRET`،
`JWT_REFRESH_SECRET` و `PAYMENT_WEBHOOK_SECRET` استفاده کنید. این مقادیر نباید
در Git، اسکرین‌شات یا پیام عمومی قرار بگیرند.

## ۴. ساخت پروژه در Vercel

1. وارد Dashboard شوید و **Add New > Project** را بزنید.
2. repository را Import کنید.
3. اگر monorepo نیست، Root Directory همان ریشه repository است.
4. Framework و Build/Output/Install Command را روی حالت تشخیص خودکار و پیش‌فرض
   نگه دارید. Vercel فایل `src/main.ts` را به‌عنوان NestJS تشخیص می‌دهد.
5. قبل از Deploy، متغیرهای بخش بعد را وارد کنید.

## ۵. متغیرهای محیطی Vercel

در **Project > Settings > Environment Variables** محتویات
`.env.production.example` را کلید به کلید اضافه کنید. حداقل این موارد لازم‌اند:

```dotenv
NODE_ENV=production
DATABASE_URL=NEON_POOLED_CONNECTION_URL
JWT_ACCESS_SECRET=UNIQUE_RANDOM_VALUE_1
JWT_REFRESH_SECRET=UNIQUE_RANDOM_VALUE_2
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
EMAIL_VERIFICATION_EXPIRES_IN=24h
EMAIL_VERIFICATION_REQUIRED=false
PASSWORD_RESET_EXPIRES_IN=1h
FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN
CORS_ORIGINS=https://YOUR-FRONTEND-DOMAIN
AUTH_REFRESH_TOKEN_TRANSPORT=body
MAIL_TRANSPORT=resend
RESEND_API_KEY=re_...
MAIL_FROM=Dlander <onboarding@resend.dev>
PAYMENT_PROVIDER=mock
CREDIT_PURCHASE_ENABLED=false
PAYMENT_WEBHOOK_SECRET=UNIQUE_RANDOM_VALUE_3
PAYMENT_RETURN_URL=https://YOUR-FRONTEND-DOMAIN/credits/payment/success
PAYMENT_CANCEL_URL=https://YOUR-FRONTEND-DOMAIN/credits/payment/cancel
MOCK_PAYMENT_ENABLED=false
API_REQUEST_PERSISTENCE_MODE=sync
```

در سناریوی آزمایشی فعلی، `EMAIL_VERIFICATION_REQUIRED=false` حساب را بلافاصله
پس از ثبت‌نام فعال می‌کند و ایمیل تأیید نمی‌فرستد. همچنین
`CREDIT_PURCHASE_ENABLED=false` ساخت سفارش، شروع پرداخت و webhook پرداخت را
غیرفعال می‌کند؛ افزایش موجودی فقط از مسیر محافظت‌شده ادمین انجام می‌شود.

بقیه مقادیر را دقیقاً از `.env.production.example` اضافه کنید، چون validation
برنامه تعدادی از آن‌ها را الزامی می‌داند. متغیر `PORT` لازم نیست؛ Vercel آن را
مدیریت می‌کند، ولی وجود مقدار نمونه نیز مشکلی ایجاد نمی‌کند.

متغیرها را حداقل برای **Production** فعال کنید. اگر Preview Deployments را نیز
تست می‌کنید، همان‌ها یا یک دیتابیس جدا را برای **Preview** اضافه کنید. تغییر env
روی deployهای قبلی اعمال نمی‌شود و بعد از تغییر باید Redeploy انجام شود.

## ۶. ایمیل با Resend

برای تست اولیه، `onboarding@resend.dev` فقط به ایمیل مالک حساب ارسال می‌کند.
برای ارسال عمومی باید domain خود را در Resend تأیید و `MAIL_FROM` را مثلاً به
`Dlander <no-reply@example.com>` تغییر دهید. استفاده از API مبتنی بر HTTPS برای
Function مناسب‌تر از نگه‌داشتن اتصال SMTP است.

## ۷. Deploy و تست

دکمه Deploy را بزنید. بعد از موفقیت، دامنه‌ای مانند
`https://project-name.vercel.app` می‌گیرید. این مسیرها را تست کنید:

```text
GET https://project-name.vercel.app/health/live
GET https://project-name.vercel.app/health/ready
GET https://project-name.vercel.app/api/docs
```

`live` باید وضعیت ok بدهد و `ready` باید اتصال دیتابیس را تأیید کند. اگر frontend
جداست، URL نهایی آن را در `FRONTEND_URL` و `CORS_ORIGINS` قرار دهید و Redeploy
کنید. درخواست‌های credentialed در frontend باید با `credentials: "include"`
ارسال شوند (در صورت استفاده از cookie).

هر push به شاخه production (معمولاً `main`) یک Production Deployment جدید
می‌سازد. push به شاخه‌های دیگر Preview Deployment می‌سازد.

## ۸. روش جایگزین با CLI

Vercel CLI نسخه 48.4.0 یا جدیدتر لازم است:

```powershell
npx vercel@latest login
npx vercel@latest link
npx vercel@latest
npx vercel@latest --prod
```

برای انتشار اول، روش Dashboard و Git ساده‌تر است. secretها را با `--env` در
command history قرار ندهید؛ آن‌ها را در Dashboard وارد کنید.

## ۹. نکات پلن رایگان و serverless

- برنامه یک سرور دائمی نیست و ممکن است cold start داشته باشد.
- فایل محلی و حافظه RAM پایدار نیست؛ state را فقط در PostgreSQL نگه دارید.
- WebSocket دائمی و background loop مناسب این معماری نیست.
- لاگ درخواست در production روی `sync` تنظیم شده، چون کار buffered ممکن است پس
  از ارسال پاسخ متوقف شود.
- اتصال runtime باید Pooled باشد تا تعداد connectionهای Neon با scale شدن
  Function پر نشود.
- region پروژه در `vercel.json` روی Frankfurt تنظیم شده؛ Neon را نزدیک همان
  region بسازید.
- اندازه Function و مدت اجرا محدود است. عملیات طولانی را به queue/provider
  خارجی منتقل کنید.
- mock payment در اینترنت باید همیشه غیرفعال بماند.

## ۱۰. خطاهای رایج

- **Environment validation failed:** همه کلیدهای `.env.production.example` را
  اضافه و مقادیر URL را معتبر کنید.
- **Prisma connection error:** Pooled URL، رمز URL-encoded و
  `sslmode=require` را بررسی کنید.
- **Table does not exist:** migration را با Neon Direct URL اجرا کنید.
- **CORS error:** دامنه frontend را بدون slash انتهایی و دقیقاً در
  `CORS_ORIGINS` قرار دهید.
- **ایمیل ارسال نمی‌شود:** محدودیت گیرنده Resend test sender یا تأیید domain را
  بررسی کنید.
- **تغییر env دیده نمی‌شود:** Redeploy کنید.
