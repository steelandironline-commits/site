import { Router } from 'express';
import { PLAN, PRICING } from '@autopix/shared';
import { describeSession } from './me.js';

export function systemRoutes({ config, prisma, hub }) {
  const r = Router();

  r.get('/health', async (req, res) => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, realtime: hub?.mode ?? 'off' });
  });

  /** SPA bootstrap: always 200, `session` is null when anonymous. */
  r.get('/session', async (req, res) => {
    res.json({ session: req.session ? await describeSession({ prisma, config }, req) : null });
  });

  /** Public, non-secret runtime flags for the web app. */
  r.get('/config', (req, res) => {
    res.json({
      demoMode: config.demoMode,
      paymentProvider: config.payment.provider,
      simulationAvailable: !config.isProduction && config.payment.provider === 'mock',
      plan: { name: PLAN.name, priceCents: PLAN.priceCents, features: PLAN.features },
      billing: { model: config.billing.model, commissionRateBps: PRICING.commissionRateBps, commissionLabel: PRICING.commissionLabel },
    });
  });

  return r;
}
