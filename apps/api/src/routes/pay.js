import { Router } from 'express';
import { z } from 'zod';
import { forbidden } from '@autopix/core';
import { requireAuth } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';

/**
 * TemPix Pay read API. Every mutation goes through POST /api/actions/:name
 * (ActionEngine); these routes only read, always scoped to the session's company.
 */
export function payRoutes({ transactions, protectedPayments, commissions, trips, limiters }) {
  const r = Router();
  r.use(requireAuth);
  r.use(limiters.api);

  r.get('/capabilities', (req, res) => {
    res.json({ ...transactions.capabilities(), protectedPayment: protectedPayments.status() });
  });

  r.get('/summary', async (req, res) => {
    const caps = transactions.capabilities();
    res.json({ summary: await transactions.summary(req.user.companyId), sandbox: caps.sandbox, provider: caps.label });
  });

  r.get('/transactions', async (req, res) => {
    const { view } = parse(z.object({ view: z.enum(['all', 'charges', 'payments', 'receivable', 'toRelease', 'history', 'commissions']).default('all') }), req.query);
    res.json({ items: await transactions.list(req.user.companyId, { view }) });
  });

  r.get('/transactions/:id', async (req, res) => {
    res.json(await transactions.get(req.params.id, { companyId: req.user.companyId, isPlatformAdmin: Boolean(req.user.isPlatformAdmin) }));
  });

  r.get('/commission/quote', async (req, res) => {
    const q = parse(
      z.object({ grossCents: z.coerce.number().int().min(100).max(100_000_000), type: z.enum(['SALES', 'FREIGHT', 'WORKFORCE', 'SERVICE']).default('SERVICE') }),
      req.query,
    );
    res.json({ quote: await commissions.quote({ transactionType: q.type, companyId: req.user.companyId, grossCents: q.grossCents }) });
  });

  // Carrier-side trip view (coordinates only for the company that owns the match).
  r.get('/trips/:matchId', async (req, res) => {
    res.json({ trip: await trips.get({ company: { id: req.user.companyId }, matchId: req.params.matchId }) });
  });

  return r;
}

/** Restricted financial back office (User.isPlatformAdmin). Read-only + audited annotations. */
export function adminRoutes({ admin, disputes, commissions }) {
  const r = Router();
  r.use(requireAuth);
  r.use((req, res, next) => (req.user?.isPlatformAdmin ? next() : next(forbidden('Acesso restrito à administração da plataforma.'))));
  const status = (req) => (typeof req.query.status === 'string' && /^[A-Z_]{2,40}$/.test(req.query.status) ? req.query.status : undefined);

  r.get('/overview', async (req, res) => res.json({ overview: await admin.overview(req.user) }));
  r.get('/payments', async (req, res) => res.json({ items: await admin.payments(req.user, { status: status(req) }) }));
  r.get('/transactions', async (req, res) => res.json({ items: await admin.transactions(req.user, { status: status(req) }) }));
  r.get('/provider-events', async (req, res) => res.json({ items: await admin.providerEvents(req.user, { processingStatus: status(req) }) }));
  r.get('/failed-webhooks', async (req, res) => res.json({ items: await admin.failedWebhooks(req.user) }));
  r.get('/reconciliation', async (req, res) => res.json({ items: await admin.issues(req.user, { status: status(req) }) }));
  r.get('/refunds', async (req, res) => res.json({ items: await admin.refunds(req.user, { status: status(req) }) }));
  r.get('/disputes', async (req, res) => res.json({ items: await admin.disputeList(req.user, { status: status(req) }) }));
  r.post('/disputes/:id/summary', async (req, res) => res.json({ summary: await disputes.summarize(req.params.id) }));
  r.post('/disputes/:id/review', async (req, res) => res.json({ dispute: await disputes.startReview({ admin: req.user, disputeId: req.params.id }) }));
  r.get('/payout-failures', async (req, res) => res.json({ items: await admin.payoutFailures(req.user) }));
  r.get('/commission-rules', async (req, res) => res.json({ items: await commissions.list() }));
  r.get('/audit', async (req, res) => {
    const q = parse(z.object({ companyId: z.string().max(64).optional(), transactionId: z.string().max(64).optional(), paymentId: z.string().max(64).optional() }), req.query);
    res.json({ items: await admin.auditLog(req.user, q) });
  });
  return r;
}
