import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOnboardingSession } from '../middleware/session.js';
import { runAction } from '../actor.js';
import { parse } from '../middleware/validate.js';

export function paymentRoutes({ payments, actions, limiters }) {
  const r = Router();
  r.use(limiters.payments);

  /**
   * Create (or reuse) a Pix charge. The amount is ALWAYS computed on the
   * server: the plan price for the subscription, or the TemPix Pay
   * transaction amount when `transactionId` is given. Client amounts are ignored.
   */
  r.post('/pix', requireOnboardingSession, async (req, res) => {
    const { transactionId } = parse(z.object({ transactionId: z.string().trim().min(1).max(64).optional() }).passthrough(), req.body);
    const { result } = transactionId
      ? await runAction(actions, req, 'CREATE_TRANSACTION_PIX', { id: transactionId })
      : await runAction(actions, req, 'CREATE_SUBSCRIPTION_PIX', {});
    res.status(201).json(result);
  });

  r.get('/', requireAuth, async (req, res) => {
    const { kind } = parse(z.object({ kind: z.enum(['SUBSCRIPTION', 'CHARGE', 'SIGNUP_FEE', 'INTERVIEW_FEE', 'HIRING_FEE']).optional() }), req.query);
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
