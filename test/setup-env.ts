import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.test.local');
const content = readFileSync(envPath, 'utf8');
for (const line of content.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const separator = trimmed.indexOf('=');
  if (separator < 1) continue;
  const key = trimmed.slice(0, separator).trim();
  const value = trimmed.slice(separator + 1).trim();
  process.env[key] = value;
}
process.env.NODE_ENV = 'test';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL is required in .env.test.local');
const parsed = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
  !parsed.pathname.replace(/^\//, '').endsWith('_test')
) {
  throw new Error(
    'E2E tests refuse any database that is not local and suffixed with _test',
  );
}
