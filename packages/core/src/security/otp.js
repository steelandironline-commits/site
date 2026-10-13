import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export function createOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code, challengeId, secret) {
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

export function verifyOtp(code, challengeId, secret, expectedHash) {
  if (!/^\d{6}$/.test(String(code || '')) || !expectedHash) return false;
  const actual = Buffer.from(hashOtp(code, challengeId, secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
