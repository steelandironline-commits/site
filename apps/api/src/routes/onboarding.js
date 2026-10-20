import { Router } from 'express';
import { onboardingCheckSchema, onboardingStartSchema, onboardingStepSchema } from '@autopix/shared';
import { parse } from '../middleware/validate.js';
import { requireOnboardingSession, setSessionCookie } from '../middleware/session.js';

export function onboardingRoutes({ onboarding, config, limiters }) {
  const r = Router();

  r.post('/start', limiters.onboarding, async (req, res) => {
    const input = parse(onboardingStartSchema, req.body);
    const { token, session, user } = await onboarding.start(input, { ip: req.ip, userAgent: req.get('user-agent') });
    setSessionCookie(res, config, token, session.expiresAt, req.area);
    res.status(201).json(await onboarding.state(user));
  });

  /** First step: tells whether the e-mail or the CNPJ/CPF already has an account, before anything is saved. */
  r.post('/check', limiters.onboardingCheck, async (req, res) => {
    res.json(await onboarding.check(parse(onboardingCheckSchema, req.body), { sessionUserId: req.user?.id ?? null }));
  });

  r.get('/', requireOnboardingSession, async (req, res) => {
    res.json(await onboarding.state(req.user));
  });

  r.put('/step', requireOnboardingSession, async (req, res) => {
    const input = parse(onboardingStepSchema, req.body);
    const company = await onboarding.saveStep(req.user, input);
    res.json({ company });
  });

  /** Commission model: complete signup without a charge → activation hand-off. */
  r.post('/finish', requireOnboardingSession, async (req, res) => {
    res.json(await onboarding.finish(req.user));
  });

  return r;
}
