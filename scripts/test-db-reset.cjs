const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const envPath = resolve(process.cwd(), '.env.test.local');
if (!existsSync(envPath)) {
  console.error('Missing .env.test.local. Copy .env.test.example and keep the _test database name.');
  process.exit(1);
}
const env = { ...process.env, NODE_ENV: 'test' };
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const separator = trimmed.indexOf('=');
  if (separator > 0) env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
}
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is required in .env.test.local.');
  process.exit(1);
}
const url = new URL(env.DATABASE_URL);
const database = url.pathname.replace(/^\//, '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !database.endsWith('_test')) {
  console.error(`Refusing to reset unsafe database: ${url.hostname}/${database}`);
  process.exit(1);
}
const prismaCli = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
if (!existsSync(prismaCli)) {
  console.error('Prisma CLI is not installed. Run npm install first.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'reset', '--force', '--skip-seed'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});
if (result.error) console.error(`Unable to start Prisma: ${result.error.message}`);
process.exit(result.status ?? 1);
