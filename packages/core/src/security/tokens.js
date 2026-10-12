import crypto from 'node:crypto';

/** Cryptographically secure random token (URL-safe). 32 bytes = 256 bits. */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Keyed hash of a token. Only this hash is stored in the database, so a
 * database leak does not reveal usable session/activation/reset tokens.
 */
export function hashToken(token, secret) {
  if (!secret) throw new Error('hashToken requires a secret');
  return crypto.createHmac('sha256', secret).update(String(token)).digest('hex');
}

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
