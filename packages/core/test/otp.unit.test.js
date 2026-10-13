import { describe, expect, it } from 'vitest';
import { createOtp, hashOtp, verifyOtp } from '../src/security/otp.js';

describe('one-time codes', () => {
  it('creates a six-digit decimal code, including leading zeroes', () => {
    for (let i = 0; i < 100; i += 1) expect(createOtp()).toMatch(/^\d{6}$/);
  });

  it('verifies only the code bound to the same challenge and secret', () => {
    const code = '004217';
    const hash = hashOtp(code, 'challenge-1', 'session-secret');
    expect(verifyOtp(code, 'challenge-1', 'session-secret', hash)).toBe(true);
    expect(verifyOtp(code, 'challenge-2', 'session-secret', hash)).toBe(false);
    expect(verifyOtp(code, 'challenge-1', 'other-secret', hash)).toBe(false);
    expect(verifyOtp('4217', 'challenge-1', 'session-secret', hash)).toBe(false);
  });
});
