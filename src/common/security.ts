import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const createOpaqueToken = () => randomBytes(32).toString('base64url');
export const hashOpaqueToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export function safeHashEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
