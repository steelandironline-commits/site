import { Router } from 'express';
import { PLAN } from '@autopix/shared';

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

  /** Public, non-secret runtime flags for the web app. */
  r.get('/config', (req, res) => {
    res.json({
      demoMode: config.demoMode,
      paymentProvider: config.payment.provider,
      simulationAvailable: !config.isProduction && config.payment.provider === 'mock',
      plan: { name: PLAN.name, priceCents: PLAN.priceCents, features: PLAN.features },
    });
  });

  return r;
}
