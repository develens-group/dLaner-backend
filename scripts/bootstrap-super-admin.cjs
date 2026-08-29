/**
 * Bootstrap the first SUPER_ADMIN (chicken-and-egg: API needs an existing SUPER_ADMIN).
 *
 * Usage:
 *   node scripts/bootstrap-super-admin.cjs --email=you@example.com --password='StrongPass123'
 *   node scripts/bootstrap-super-admin.cjs --email=you@example.com --password='StrongPass123' --display-name='Aliasghar'
 *
 * If the user already exists, promotes to SUPER_ADMIN and activates the account.
 * Does not print the password.
 */
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient, UserRole, UserStatus, UserPlan } =
  require('@prisma/client');
const argon2 = require('argon2');

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    console.error('Missing .env (DATABASE_URL required).');
    process.exit(1);
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq < 0) {
      out[arg.slice(2)] = true;
      continue;
    }
    out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/** Neon cold-start: give the compute time to wake before Prisma gives up. */
function withNeonTimeouts(url) {
  let next = url.replace(/channel_binding=require/g, 'channel_binding=prefer');
  const add = (key, value) => {
    if (new RegExp(`[?&]${key}=`).test(next)) return;
    next += `${next.includes('?') ? '&' : '?'}${key}=${value}`;
  };
  add('connect_timeout', '30');
  add('pool_timeout', '30');
  return next;
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const email = normalizeEmail(
    args.email || process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL || '',
  );
  const password =
    args.password || process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD || '';
  const displayName =
    args['display-name'] ||
    process.env.BOOTSTRAP_SUPER_ADMIN_DISPLAY_NAME ||
    undefined;

  if (!email || !email.includes('@')) {
    console.error(
      'Usage: node scripts/bootstrap-super-admin.cjs --email=you@example.com --password=\'StrongPass123\' [--display-name=Name]',
    );
    process.exit(1);
  }
  if (password.length < 10 || password.length > 128) {
    console.error('Password must be 10–128 characters.');
    process.exit(1);
  }
  if (!PASSWORD_PATTERN.test(password)) {
    console.error(
      'Password must contain uppercase, lowercase, and numeric characters.',
    );
    process.exit(1);
  }

  process.env.DATABASE_URL = withNeonTimeouts(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();

    let user;
    let action;
    if (existing) {
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: existing.emailVerifiedAt ?? now,
          passwordHash,
          ...(displayName !== undefined
            ? { displayName: String(displayName).trim() || null }
            : {}),
          deletedAt: null,
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          displayName: true,
        },
      });
      action = 'promoted';
    } else {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: displayName
            ? String(displayName).trim() || null
            : null,
          role: UserRole.SUPER_ADMIN,
          plan: UserPlan.FREE,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: now,
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          displayName: true,
        },
      });
      action = 'created';
    }

    await prisma.creditAccount.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          action,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            displayName: user.displayName,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
