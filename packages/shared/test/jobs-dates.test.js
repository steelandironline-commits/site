import { describe, expect, it } from 'vitest';
import { daysSincePosted, daysUntilDeadline, deadlineLabel, postedLabel } from '../src/index.js';

const NOW = new Date('2026-10-21T15:00:00.000Z');
const ago = (ms) => new Date(NOW.getTime() - ms);
const DAY = 24 * 60 * 60 * 1000;

describe('vagas · há quantos dias foi publicada', () => {
  it('conta dias inteiros desde postedAt', () => {
    expect(daysSincePosted(ago(0), NOW)).toBe(0);
    expect(daysSincePosted(ago(DAY - 1), NOW)).toBe(0);
    expect(daysSincePosted(ago(DAY), NOW)).toBe(1);
    expect(daysSincePosted(ago(3 * DAY + 12 * 3600e3), NOW)).toBe(3);
    expect(daysSincePosted(ago(45 * DAY), NOW)).toBe(45);
  });

  it('aceita texto ISO e data no futuro vira hoje', () => {
    expect(daysSincePosted('2026-10-18T15:00:00.000Z', NOW)).toBe(3);
    expect(daysSincePosted(new Date(NOW.getTime() + 2 * DAY), NOW)).toBe(0);
  });

  it('sem data válida, nulo', () => {
    for (const bad of [null, undefined, '', 'ontem', new Date('x')]) expect(daysSincePosted(bad, NOW), String(bad)).toBeNull();
  });

  it('"publicada há N dias"', () => {
    expect(postedLabel(0)).toBe('publicada hoje');
    expect(postedLabel(1)).toBe('publicada há 1 dia');
    expect(postedLabel(5)).toBe('publicada há 5 dias');
    expect(postedLabel(null)).toBe('data de publicação não informada');
  });
});

describe('vagas · prazo', () => {
  it('conta os dias inteiros até expiresAt', () => {
    expect(daysUntilDeadline(new Date(NOW.getTime() + 10 * DAY), NOW)).toBe(10);
    expect(daysUntilDeadline(new Date(NOW.getTime() + 10 * DAY + 20 * 3600e3), NOW)).toBe(10);
    expect(daysUntilDeadline(new Date(NOW.getTime() + 3600e3), NOW)).toBe(0);
    expect(daysUntilDeadline(new Date(NOW.getTime() - 3600e3), NOW)).toBe(-1);
  });

  it('a fonte não informou: nunca inventa o prazo', () => {
    for (const none of [null, undefined, '', 'sem prazo']) expect(daysUntilDeadline(none, NOW), String(none)).toBeNull();
    expect(deadlineLabel(null)).toBe('prazo não informado pela fonte');
    expect(deadlineLabel(undefined)).toBe('prazo não informado pela fonte');
  });

  it('"prazo: N dias" quando a fonte informa', () => {
    expect(deadlineLabel(12)).toBe('prazo: 12 dias');
    expect(deadlineLabel(1)).toBe('prazo: 1 dia');
    expect(deadlineLabel(0)).toBe('prazo: termina hoje');
    expect(deadlineLabel(-3)).toBe('prazo encerrado');
  });
});
