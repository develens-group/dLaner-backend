import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getLandingPage(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Dlander backend API" />
    <title>Dlander API</title>
    <link rel="stylesheet" href="/dlander-api.css" />
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <div class="status"><span></span> Service online</div>
        <p class="eyebrow">DLANDER BACKEND</p>
        <h1>The API is up and running.</h1>
        <p class="lead">NestJS, Prisma and PostgreSQL are ready to serve your application.</p>
        <nav aria-label="API resources">
          <a class="primary" href="/api/docs">Open Swagger</a>
          <a href="/health/ready">Database status</a>
          <a href="/health/live">Service status</a>
        </nav>
      </section>
      <footer>Dlander API · v1</footer>
    </main>
  </body>
</html>`;
  }

  getStylesheet(): string {
    return `:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#070b14;color:#edf4ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 15%,#17335c 0,transparent 35%),radial-gradient(circle at 85% 80%,#173c32 0,transparent 32%),#070b14}.shell{min-height:100vh;display:grid;place-content:center;padding:24px}.card{width:min(720px,calc(100vw - 48px));padding:clamp(30px,7vw,64px);border:1px solid #ffffff1f;border-radius:28px;background:#0c1424d9;box-shadow:0 30px 80px #0009;backdrop-filter:blur(18px)}.status{display:inline-flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid #43d99b4d;border-radius:999px;color:#8af0c4;background:#14352880;font-size:14px}.status span{width:9px;height:9px;border-radius:50%;background:#42e7a3;box-shadow:0 0 18px #42e7a3}.eyebrow{margin:36px 0 10px;color:#7fa9e8;font-size:13px;font-weight:800;letter-spacing:.18em}h1{max-width:580px;margin:0;font-size:clamp(38px,7vw,68px);line-height:1.02;letter-spacing:-.045em}.lead{max-width:570px;margin:24px 0 34px;color:#aebcd2;font-size:18px;line-height:1.7}nav{display:flex;flex-wrap:wrap;gap:12px}a{padding:12px 16px;border:1px solid #ffffff26;border-radius:12px;color:#dce9ff;text-decoration:none;background:#ffffff0a;transition:.2s ease}a:hover{border-color:#75a9ff80;background:#ffffff12;transform:translateY(-1px)}a.primary{border-color:#5897ff;background:#3979e6;color:#fff;font-weight:700}footer{padding-top:20px;text-align:center;color:#718099;font-size:13px}@media(max-width:520px){nav{display:grid}a{text-align:center}}`;
  }
}
