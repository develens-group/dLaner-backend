# راه‌اندازی Cloudflare R2 و D1 برای dLander

این پروژه فایل‌های template را از طریق API سازگار با S3 در R2 نگه می‌دارد. متن
پاک‌سازی‌شدهٔ ورودی و خروجی درخواست‌های AI در D1 ذخیره می‌شود، اما اطلاعات
تراکنشی مثل وضعیت درخواست، مصرف اعتبار، توکن‌ها و idempotency همچنان در
PostgreSQL می‌ماند. این جداسازی عمدی است؛ D1 جایگزین دیتابیس اصلی پروژه نیست.

## ۱. ساخت R2 از داشبورد Cloudflare

1. وارد Cloudflare Dashboard شوید و از منوی **Storage & databases > R2 Object
   Storage > Overview** گزینه **Create bucket** را بزنید.
2. نامی مثل `dlander-templates-production` انتخاب کنید. برای این کاربرد
   **Standard** مناسب است. نام bucket را بعداً تغییر نمی‌دهیم.
3. در همان صفحهٔ Overview، در بخش **API Tokens** روی **Manage** بزنید.
4. **Create Account API token** (یا User token) را انتخاب کنید، دسترسی را روی
   **Object Read & Write** و فقط همین bucket محدود کنید.
5. مقدارهای **Access Key ID** و **Secret Access Key** را همان لحظه در password
   manager ذخیره کنید؛ Secret دوباره نمایش داده نمی‌شود.
6. Account ID و S3 endpoint را از Overview کپی کنید. endpoint عادی این شکل است:
   `https://ACCOUNT_ID.r2.cloudflarestorage.com`.

متغیرهای محیط production را در سرویس میزبان backend وارد کنید:

```env
TEMPLATE_STORAGE_DRIVER=s3
TEMPLATE_STORAGE_BUCKET=dlander-templates-production
TEMPLATE_STORAGE_REGION=auto
TEMPLATE_STORAGE_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
TEMPLATE_STORAGE_ACCESS_KEY=R2_ACCESS_KEY_ID
TEMPLATE_STORAGE_SECRET_KEY=R2_SECRET_ACCESS_KEY
```

Bucket لازم نیست public شود؛ دانلودهای برنامه با URL امضاشدهٔ کوتاه‌عمر انجام
می‌شوند. اگر bucket را با jurisdiction اروپا ساخته‌اید endpoint باید
`https://ACCOUNT_ID.eu.r2.cloudflarestorage.com` باشد.

## ۲. ساخت D1 از داشبورد Cloudflare

1. از **Storage & databases > D1 SQL database** روی **Create database** بزنید.
2. نام `dlander-ai-history-production` را انتخاب و database را ایجاد کنید.
3. در صفحهٔ database، **Database ID** را کپی کنید و در تب **Console** کل محتوای
   فایل `docker/cloudflare-d1-ai-history.sql` را paste و اجرا کنید.
4. از پروفایل بالا سمت راست به **My Profile > API Tokens > Create Token > Create
   Custom Token** بروید.
5. Permission را روی **Account > D1 > Edit** بگذارید و در Account Resources فقط
   اکانت همین پروژه را انتخاب کنید. IP filtering اختیاری است؛ فقط وقتی فعالش
   کنید که سرویس backend خروجی IP ثابت دارد.
6. Account ID در صفحهٔ Overview اکانت یا R2 قابل مشاهده است. token ساخته‌شده و
   Database ID را در محیط production ثبت کنید:

```env
AI_HISTORY_STORAGE_DRIVER=cloudflare-d1
AI_HISTORY_D1_ACCOUNT_ID=YOUR_ACCOUNT_ID
AI_HISTORY_D1_DATABASE_ID=YOUR_DATABASE_ID
AI_HISTORY_D1_API_TOKEN=YOUR_RESTRICTED_API_TOKEN
AI_HISTORY_RETENTION_DAYS=90
```

این token با credential مربوط به R2 فرق دارد. Global API Key را استفاده نکنید.

## ۳. استقرار و بررسی

پس از ثبت envها backend را redeploy کنید. اعتبارسنجی startup اکنون در صورت خالی
بودن credentialهای فعال، برنامه را با خطای واضح متوقف می‌کند. یک درخواست AI
آزمایشی بفرستید و در D1 Console اجرا کنید:

```sql
SELECT id, user_id, created_at, updated_at, expires_at
FROM ai_history
ORDER BY created_at DESC
LIMIT 10;
```

برای بررسی R2 یک template را publish/export کنید و از صفحهٔ bucket در داشبورد
وجود object را ببینید. credentialها یا محتوای خام prompt را در log چاپ نکنید.

## ۴. نگهداری و بازیابی خطا

D1 حذف خودکار TTL ندارد. دستور زیر باید روزی یک‌بار با scheduler میزبان اجرا
شود تا هم payload منقضی‌شدهٔ D1 و هم metadata قدیمی PostgreSQL پاک شود:

```powershell
npm run retention:cleanup
```

اگر نوشتن یا خواندن D1 موقتاً شکست بخورد، برنامه payload همان درخواست را در
PostgreSQL نگه می‌دارد و API از کار نمی‌افتد. برای دادهٔ حساس، retention کوتاه،
دسترسی حداقلی token و سیاست حریم خصوصی روشن ضروری است.

## آیا این معماری مناسب است؟

R2 برای bundleها و فایل‌های template انتخاب مناسبی است: object storage ارزان،
API سازگار با S3 و دانلود امضاشده دارد. D1 برای history سبک و محدود AI مناسب
است، به‌خصوص وقتی هدف کم‌کردن حجم PostgreSQL باشد. با این حال برای گزارش‌گیری
سنگین، جست‌وجوی متن، write بسیار پرترافیک یا تراکنش مشترک با credit ledger،
PostgreSQL مناسب‌تر است. D1 و PostgreSQL تراکنش اتمیک مشترک ندارند؛ fallback
فعلی این ریسک را کنترل می‌کند ولی سازگاری آن eventual است.
