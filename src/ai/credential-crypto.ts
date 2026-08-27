import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

export function encryptSecret(plain: string, encryptionKeyHex: string) {
  const key = parseKey(encryptionKeyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptSecret(payload: string, encryptionKeyHex: string) {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== PREFIX || !ivB64 || !tagB64 || !dataB64)
    throw new Error('Invalid encrypted credential payload');
  const key = parseKey(encryptionKeyHex);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function keyHint(apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length < 8) return '****';
  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

function parseKey(encryptionKeyHex: string) {
  const normalized = encryptionKeyHex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(normalized))
    throw new Error(
      'AI_CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string',
    );
  return Buffer.from(normalized, 'hex');
}
