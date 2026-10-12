import { Router } from 'express';
import { notFound } from '@autopix/core';
import { requireAuth, requireOnboardingSession } from '../middleware/session.js';

export function paymentRoutes({ payments, prisma, limiters }) {
  const r = Router();
  r.use(limiters.payments);

  /** Create (or reuse) the Pix charge for the session's company. */
  r.post('/pix', requireOnboardingSession, async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    if (!company) throw notFound('Empresa não encontrada.');
    const payment = await payments.createPixCharge({ user: req.user, company });
    res.status(201).json({ payment });
  });

  r.get('/', requireAuth, async (req, res) => {
    res.json({ items: await payments.listPayments(req.user.companyId) });
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
