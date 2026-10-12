import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOnboardingSession } from '../middleware/session.js';
import { runAction } from '../actor.js';
import { parse } from '../middleware/validate.js';

export function paymentRoutes({ payments, actions, limiters }) {
  const r = Router();
  r.use(limiters.payments);

  /** Create (or reuse) the Pix charge for the session's company. */
  r.post('/pix', requireOnboardingSession, async (req, res) => {
    const { result } = await runAction(actions, req, 'CREATE_SUBSCRIPTION_PIX', {});
    res.status(201).json(result);
  });

  r.get('/', requireAuth, async (req, res) => {
    const { kind } = parse(z.object({ kind: z.enum(['SUBSCRIPTION', 'CHARGE']).optional() }), req.query);
    res.json({ items: await payments.listPayments(req.user.companyId, { kind }) });
  });

  r.get('/:id', requireOnboardingSession, async (req, res) => {
    res.json({ payment: await payments.getPayment(req.params.id, req.user.companyId) });
  });

  /** After confirmation, hand a fresh one-time activation token to the payer's browser. */
  r.post('/:id/activation', requireOnboardingSession, async (req, res) => {
    res.json(await payments.claimActivation(req.params.id, req.user));
  });

  /** Development only — refused in production and for real providers. */
  r.post('/:id/simulate', requireOnboardingSession, async (req, res) => {
    res.json(await payments.simulateConfirmation(req.params.id, req.user.companyId));
  });

  return r;
}
