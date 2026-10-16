import { Router } from 'express';
import { PLAN, PRICING } from '@autopix/shared';
import { CepService } from '@autopix/core';
import { describeSession } from './me.js';

export function systemRoutes({ config, prisma, hub, limiters, cep = new CepService() }) {
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

  /** CEP → cidade/UF (signup "Onde você mora?"). Public, rate limited, nothing stored. */
  r.get('/cep/:cep', limiters?.onboardingCheck ?? ((req, res, next) => next()), async (req, res) => {
    const digits = String(req.params.cep || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(digits)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Informe o CEP com 8 números.' } });
    try {
      const found = await cep.lookup(digits);
      if (!found) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'CEP não encontrado. Confira os números.' } });
      res.set('Cache-Control', 'public, max-age=86400');
      res.json({ cep: found });
    } catch {
      res.status(503).json({ error: { code: 'UNAVAILABLE', message: 'Não foi possível consultar o CEP agora. Você pode continuar mesmo assim.' } });
    }
  });

  /** Public, non-secret runtime flags for the web app. */
  r.get('/config', (req, res) => {
    res.json({
      demoMode: config.demoMode,
      paymentProvider: config.payment.provider,
      simulationAvailable: !config.isProduction && config.payment.provider === 'mock',
      plan: { name: PLAN.name, priceCents: PLAN.priceCents, features: PLAN.features },
      billing: {
        model: config.billing.model,
        commissionTiers: PRICING.commissionTiers.map((t) => ({ label: t.label, rateBps: t.rateBps })),
        commissionLabel: PRICING.commissionLabel,
        companySignupFeeCents: config.billing.model === 'commission' ? config.billing.companySignupFeeCents : 0,
      },
    });
  });

  return r;
}
