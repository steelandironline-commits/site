import { Router } from 'express';
import { changePasswordSchema } from '@autopix/shared';
import { unauthorized } from '@autopix/core';
import { parse } from '../middleware/validate.js';
import { requireAuth } from '../middleware/session.js';

/**
 * Public description of the current session (never includes secrets).
 *
 * `area` is the area stored on the session (CNPJ, CPF or ADMIN), so each app knows which menu to
 * build (ARQUITETURA 6.5). It is the session's, not the host's: an admin session on the CNPJ host
 * (no ADMIN_HOST) says ADMIN. Legacy mode has no areas and answers `null`.
 */
export async function describeSession({ prisma, config }, req) {
  const subscription = await prisma.subscription.findUnique({
    where: { companyId: req.user.companyId },
    select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  });
  return {
    scope: req.session.scope,
    area: config.areas?.enabled ? req.session.area ?? null : null,
    user: { id: req.user.id, name: req.user.name, email: req.user.email, status: req.user.status, role: req.user.role, isPlatformAdmin: Boolean(req.user.isPlatformAdmin) },
    company: req.user.company,
    subscription,
    demoMode: config.demoMode,
  };
}

export function meRoutes({ auth, prisma, config }) {
  const r = Router();

  /** Current session (onboarding or full). 401 when anonymous. */
  r.get('/', async (req, res) => {
    if (!req.session) throw unauthorized('Sessão não encontrada.');
    res.json(await describeSession({ prisma, config }, req));
  });


  r.put('/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
    await auth.changePassword(req.user.id, currentPassword, newPassword, req.session.id);
    res.json({ ok: true });
  });

  r.get('/sessions', requireAuth, async (req, res) => {
    const sessions = await auth.listSessions(req.user.id);
    res.json({ items: sessions.map((s) => ({ ...s, current: s.id === req.session.id })) });
  });

  r.delete('/sessions', requireAuth, async (req, res) => {
    const revoked = await auth.revokeAllSessions(req.user.id, { exceptSessionId: req.session.id });
    res.json({ revoked });
  });

  return r;
}
