import { describe, it, expect } from 'vitest';
import { tenderStatus } from '../src/tenders.js';

const now = new Date('2026-10-16T15:00:00Z');
const h = (n) => new Date(now.getTime() + n * 3600e3);

describe('situação da licitação', () => {
  it('open, closing soon, opening soon and closed by the proposal window', () => {
    expect(tenderStatus({ proposalOpensAt: h(-48), proposalClosesAt: h(24 * 10) }, now)).toMatchObject({ code: 'OPEN', label: 'Recebendo propostas', open: true });
    expect(tenderStatus({ proposalOpensAt: h(-48), proposalClosesAt: h(30) }, now)).toMatchObject({ code: 'CLOSING', label: 'Prazo acabando', tone: 'amber', open: true });
    expect(tenderStatus({ proposalOpensAt: h(30), proposalClosesAt: h(24 * 9) }, now)).toMatchObject({ code: 'SOON', label: 'Abre em breve', open: false });
    expect(tenderStatus({ proposalOpensAt: h(-100), proposalClosesAt: h(-1) }, now)).toMatchObject({ code: 'CLOSED', label: 'Propostas encerradas', open: false });
    expect(tenderStatus({ proposalClosesAt: h(5) }, now).detail).toMatch(/em 5 h/);
  });

  it('the official status wins: revoked, annulled, suspended', () => {
    expect(tenderStatus({ situationId: 2, proposalClosesAt: h(48) }, now)).toMatchObject({ code: 'REVOKED', label: 'Revogada', open: false });
    expect(tenderStatus({ situationId: 3 }, now).label).toBe('Anulada');
    expect(tenderStatus({ situationId: 4 }, now).label).toBe('Suspensa');
  });

  it('flags a notice that left the open list before its deadline', () => {
    expect(tenderStatus({ proposalClosesAt: h(48), leftOpenListAt: h(-1) }, now)).toMatchObject({ code: 'UNLISTED', open: false });
  });
});
