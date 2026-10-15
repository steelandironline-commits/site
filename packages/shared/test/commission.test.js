import { describe, expect, it } from 'vitest';
import { COMMISSION_TIERS, commissionRateBps } from '../src/index.js';

/** Contract values in cents. The tier steps at each order of magnitude. */
describe('commission by contract value tier', () => {
  it('charges 5% up to R$ 10.000, inclusive', () => {
    expect(commissionRateBps(1)).toBe(500);
    expect(commissionRateBps(1_000_000)).toBe(500);
  });

  it('steps down to 4%, 3% and 2% at each order of magnitude', () => {
    expect(commissionRateBps(1_000_001)).toBe(400); // R$ 10.000,01
    expect(commissionRateBps(10_000_000)).toBe(400); // R$ 100.000,00
    expect(commissionRateBps(10_000_001)).toBe(300); // R$ 100.000,01
    expect(commissionRateBps(100_000_000)).toBe(300); // R$ 1.000.000,00
    expect(commissionRateBps(100_000_001)).toBe(200); // R$ 1.000.000,01
    expect(commissionRateBps(50_000_000_000)).toBe(200);
  });

  it('keeps the tiers in decreasing order with no gaps', () => {
    expect(COMMISSION_TIERS.map((t) => t.rateBps)).toEqual([500, 400, 300, 200]);
    for (let i = 1; i < COMMISSION_TIERS.length; i++) {
      expect(COMMISSION_TIERS[i].maxCents).toBeGreaterThan(COMMISSION_TIERS[i - 1].maxCents);
    }
  });
});
