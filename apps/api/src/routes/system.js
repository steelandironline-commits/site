import { Router } from 'express';
import { PLAN, PRICING } from '@autopix/shared';
import { CepService } from '@autopix/core';
import { describeSession } from './me.js';

// Cada rota do sistema é uma montagem própria em app.js, porque cada uma tem as suas áreas
// (ARQUITETURA 6.5): /health em qualquer host; /session, /cep e /config nos hosts de área.

/** GET /api/health: healthcheck da infraestrutura, em qualquer host. */
export function healthRoutes({ prisma, hub }) {
  const r = Router();

  r.get('/', async (req, res) => {
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, realtime: hub?.mode ?? 'off' });
  });

  return r;
}

/** GET /api/session: SPA bootstrap. Always 200, `session` is null when anonymous. */
export function sessionRoutes({ config, prisma }) {
  const r = Router();

  r.get('/', async (req, res) => {
    res.json({ session: req.session ? await describeSession({ prisma, config }, req) : null });
  });

  return r;
}

/** GET /api/cep/:cep: CEP → cidade/UF (signup "Onde você mora?"). Public, rate limited, nothing stored. */
export function cepRoutes({ limiters, cep = new CepService() }) {
  const r = Router();

  r.get('/:cep', limiters?.onboardingCheck ?? ((req, res, next) => next()), async (req, res) => {
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

  return r;
}

/**
 * GET /api/config: public, non-secret runtime flags for the web app.
 *
 * Area mode answers by the host's area (ARQUITETURA 6.5, INVENTARIO 2): the signup fee, the plan and
 * the company commission belong to the company side, so only the CNPJ host receives them. Any other
 * area gets the minimum (fail closed). Legacy mode answers exactly as before.
 */
export function configRoutes({ config }) {
  const r = Router();

  r.get('/', (req, res) => {
    if (config.areas.enabled && req.area !== 'CNPJ') return res.json({ demoMode: config.demoMode });
    return res.json({
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
