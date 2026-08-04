# اتصال امن افزونه وردپرس

## ورود افزونه

افزونه به `POST /api/v1/auth/wordpress/login` درخواست می‌زند:

```json
{
  "email": "user@example.com",
  "password": "StrongPass123",
  "siteUrl": "https://shop.example.com",
  "siteName": "فروشگاه من",
  "metadata": { "wpVersion": "6.8", "phpVersion": "8.3", "pluginVersion": "1.0.0" }
}
```

پاسخ شامل `accessToken`، `refreshToken`، `installationKey` و اطلاعات `site`
است. افزونه باید هر سه مقدار محرمانه را ذخیره کند. هر ورود مجدد، کلید نصب را
عوض و نشست‌های قبلی همان دامنه را باطل می‌کند.

## درخواست‌های بعدی

تمام درخواست‌های محافظت‌شده افزونه باید این هدرها را ارسال کنند:

```http
Authorization: Bearer <accessToken>
X-Dlander-Installation-Key: <installationKey>
X-Dlander-Site-Url: https://shop.example.com
```

برای `POST /api/v1/auth/refresh` نیز دو هدر `X-Dlander-*` الزامی‌اند و بدنه
`{ "refreshToken": "<refreshToken>" }` است. هدر دامنه به تنهایی عامل امنیتی
نیست؛ عامل دوم کلید تصادفی نصب است.

## تنظیمات در React

این endpointها فقط با نشست عادی وب قابل استفاده‌اند:

- `GET /api/v1/users/me/wordpress-sites`
- `POST /api/v1/users/me/wordpress-sites`
- `PATCH /api/v1/users/me/wordpress-sites/:id`
- `DELETE /api/v1/users/me/wordpress-sites/:id`
- `POST /api/v1/users/me/wordpress-sites/:id/rotate-key`

بدنه ایجاد سایت `{ "domain": "shop.example.com", "name": "فروشگاه" }` است.
ویرایش می‌تواند شامل `domain`، `name` و `enabled` باشد. تغییر دامنه،
غیرفعال‌سازی و تعویض کلید، نشست‌های فعال آن نصب را فوراً باطل می‌کند. کلید نصب
فقط هنگام ایجاد، ورود افزونه یا تعویض کلید برگردانده می‌شود و در دیتابیس فقط هش
آن ذخیره می‌شود.
