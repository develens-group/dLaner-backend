# اتصال افزونه وردپرس به دیلندر

جریان محصول دیگر لاگین جدا با ایمیل/رمز از داخل افزونه ندارد و دامنه را
دستی در پنل دیلندر از قبل ثبت نمی‌کنید. افزونه کلید نصب را خودش می‌سازد،
درخواست اتصال می‌فرستد، و کاربر در **سایت دیلندر** (تب/پاپ‌آپ) لاگین یا تأیید می‌کند.

## ۱) ایجاد درخواست اتصال (افزونه)

افزونه یک `installationKey` تصادفی می‌سازد و فقط همان را نزد خود نگه می‌دارد.
سپس:

`POST /api/v1/wordpress/connection-requests`

```json
{
  "siteUrl": "https://shop.example.com",
  "installationKey": "<کلید-۳۲-کاراکتر-یا-بیشتر>",
  "siteName": "فروشگاه من",
  "metadata": { "wpVersion": "6.8", "pluginVersion": "1.0.0" }
}
```

پاسخ شامل `requestId`، `expiresAt` (حدود ۱۵ دقیقه) و `approveUrl` است.
در بک‌اند فقط **هش** کلید ذخیره می‌شود.

## ۲) تأیید در دیلندر (مرورگر وب)

افزونه `approveUrl` را باز می‌کند، مثلاً:

`{FRONTEND_URL}/connect/wordpress?requestId=...`

- اگر کاربر لاگین وب نباشد → اول لاگین وب
- سپس اکانت و دامنه را می‌بیند و تأیید می‌کند:

`POST /api/v1/wordpress/connection-requests/:id/approve`  
(با `Authorization: Bearer <accessToken>` نشست وب)

رد کردن: `POST .../:id/deny`

افزونه وضعیت را poll می‌کند:

`GET /api/v1/wordpress/connection-requests/:id`  
→ `PENDING | APPROVED | DENIED | EXPIRED`

پس از `APPROVED`، سایت به اکانت وصل است و **انقضای اجباری ندارد**. قطع اتصال با
حذف سایت، غیرفعال‌سازی، یا چرخش کلید انجام می‌شود.

## ۳) احراز هویت درخواست‌های بعدی افزونه

```http
X-Dlander-Installation-Key: <installationKey>
X-Dlander-Site-Url: https://shop.example.com
```

توکن JWT وردپرس لازم نیست.

## ۴) مدیریت سایت‌های متصل (فقط وب)

- `GET /api/v1/users/me/wordpress-sites`
- `PATCH /api/v1/users/me/wordpress-sites/:id` — `name` / `enabled` (تغییر دامنه از این مسیر نیست؛ اتصال مجدد)
- `DELETE /api/v1/users/me/wordpress-sites/:id` — قطع اتصال
- `POST /api/v1/users/me/wordpress-sites/:id/rotate-key` — کلید جدید (یک‌بار در پاسخ؛ باید در افزونه جایگزین شود)

## ۵) جلسه ادیت (متن / عکس / ویدیو)

بعد از اتصال:

1. افزونه `POST /api/v1/wordpress/edit-sessions` با هدرهای نصب (+ متن اختیاری)
2. آپلود ورودی: `POST .../edit-sessions/:id/assets` (multipart فیلد `file`)
3. کاربر در `editorUrl` برگشتی روی دیلندر کار می‌کند (نشست وب)
4. ادیتور `POST .../:id/complete` و در صورت نیاز `POST .../:id/output-assets`
5. افزونه `GET .../:id/result` را می‌گیرد

انواع مجاز: `image/jpeg|png|webp|gif` (تا ۱۰MB) و `video/mp4|webm` (تا ۱۰۰MB).

## استفاده بدون افزونه

لاگین وب، lands، templates و بقیه APIها مستقل‌اند و به اتصال وردپرس وابسته نیستند.

## حذف‌شده

- `POST /api/v1/auth/wordpress/login`
