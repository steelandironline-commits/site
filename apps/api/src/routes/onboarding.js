import { Router } from 'express';
import { onboardingStartSchema, onboardingStepSchema } from '@autopix/shared';
import { parse } from '../middleware/validate.js';
import { requireOnboardingSession, setSessionCookie } from '../middleware/session.js';

export function onboardingRoutes({ onboarding, config, limiters }) {
  const r = Router();

  r.post('/start', limiters.onboarding, async (req, res) => {
    const input = parse(onboardingStartSchema, req.body);
    const { token, session, user } = await onboarding.start(input, { ip: req.ip, userAgent: req.get('user-agent') });
    setSessionCookie(res, config, token, session.expiresAt);
    res.status(201).json(await onboarding.state(user));
  });

  r.get('/', requireOnboardingSession, async (req, res) => {
    res.json(await onboarding.state(req.user));
  });

  r.put('/step', requireOnboardingSession, async (req, res) => {
    const input = parse(onboardingStepSchema, req.body);
    const company = await onboarding.saveStep(req.user, input);
    res.json({ company });
  });

  return r;
}
