import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const createOpaqueToken = () => randomBytes(32).toString('base64url');
/** 6-digit numeric OTP for email verification / password reset */
export const createEmailOtpCode = () =>
  String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hashOpaqueToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export function safeHashEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
