import { ZodError } from 'zod';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized, unavailable } from '../errors.js';
import { logger } from '../logger.js';
import { createOtp, hashOtp } from '../security/otp.js';
import { areaOfUser } from '../security/area.js';
import { AREAS } from '@autopix/areas/areas';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SECRET_KEYS = /password|token|secret|code|pixKey|cpf|document|link|photo/i;

function sanitize(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 3) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : sanitize(v, depth + 1)]));
}

/**
 * ActionEngine — the single entry point for business actions, independent of
 * any user interface. Web, PWA, WhatsApp and future native clients all call
 * `execute()`; none of them reimplements business rules.
 *
 * Pipeline: authentication → authorization → validation → business rules →
 * (step-up challenge for sensitive actions) → execution → audit log.
 * Handlers publish domain events through ctx.events.
 *
 * Action definition:
 *   { name, description, kind: 'command'|'query', schema (zod),
 *     channels: ['WEB','API','WHATSAPP'], roles: [...],
 *     requiresActiveSubscription, allowOnboarding, sensitive, summarize(input),
 *     platformAdmin (User.isPlatformAdmin required, replaces roles),
 *     areas: ['CNPJ'|'CPF'|'ADMIN', ...] (who may run it, see "Area mode"),
 *     handler(ctx, input) }
 *
 * Area mode (config.areas.enabled, ARQUITETURA 6.6): the user's area comes from the owner of the
 * account (ADMIN for a platform admin, else the company's accountType), never from the host or the
 * channel, and `def.areas` must contain it on EVERY channel (web, API, WhatsApp, system). An action
 * without `areas`, or one the user's area is not in, answers 404 "Ação desconhecida" like an action
 * that does not exist. Legacy mode does not look at areas.
 */
export class ActionEngine {
  constructor({ prisma = getPrisma(), config = getConfig(), services = {} } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.services = services;
    this.actions = new Map();
  }

  register(def) {
    if (!def.name || !def.handler || !def.schema) throw new Error('Invalid action definition');
    if (def.areas !== undefined && !(Array.isArray(def.areas) && def.areas.length > 0 && def.areas.every((a) => AREAS.includes(a)))) {
      throw new Error(`Invalid action definition: ${def.name} has invalid areas`);
    }
    this.actions.set(def.name, {
      kind: 'command',
      channels: ['WEB', 'API', 'WHATSAPP'],
      roles: ['OWNER', 'ADMIN', 'MEMBER'],
      requiresActiveSubscription: false,
      allowOnboarding: false,
      sensitive: false,
      ...def,
    });
    return this;
  }

  get(name) {
    return this.actions.get(name);
  }

  /**
   * Public catalog for clients (no handlers, no internals).
   * Area mode lists only the actions the given area may run (nothing without an area: fail closed).
   * Legacy mode lists everything, as before.
   */
  catalog({ area } = {}) {
    const all = [...this.actions.values()];
    const visible = this.config.areas?.enabled ? all.filter((a) => area && a.areas?.includes(area)) : all;
    return visible.map((a) => ({
      name: a.name,
      description: a.description,
      kind: a.kind,
      channels: a.channels,
      sensitive: Boolean(a.sensitive),
      requiresActiveSubscription: a.requiresActiveSubscription,
      input: a.inputDoc || null,
    }));
  }

  /**
   * @param {object} req
   * @param {string} req.action
   * @param {object} req.input
   * @param {'WEB'|'API'|'WHATSAPP'|'SYSTEM'} req.channel
   * @param {object} req.actor  { userId, sessionId?, sessionScope?, whatsappConnectionId? }
   * @param {string} [req.challengeId] confirmed SensitiveActionChallenge
   * @param {object} [req.meta] { ip }
   */
  async execute({ action, input = {}, channel, actor = {}, challengeId, meta = {} }) {
    const started = Date.now();
    const def = this.actions.get(action);
    let user = null;
    const log = async (status, extra = {}) => {
      try {
        await this.prisma.actionLog.create({
          data: {
            action,
            channel,
            status,
            companyId: user?.companyId ?? null,
            actorUserId: user?.id ?? null,
            input: sanitize(input),
            result: extra.result !== undefined ? sanitize(extra.result) : undefined,
            error: extra.error ? String(extra.error).slice(0, 1000) : null,
            challengeId: extra.challengeId ?? challengeId ?? null,
            ipAddress: meta.ip ? String(meta.ip).slice(0, 64) : null,
            durationMs: Date.now() - started,
          },
        });
      } catch (err) {
        logger.error('action audit log failed', { action, err });
      }
    };

    try {
      if (!def) throw notFound('Ação desconhecida.');

      // 1. Authentication. Who the user is comes first; the session scope and channel are checked
      //    after the area (1b), so that an action of another area answers the same 404 as one that
      //    does not exist, even to a signup (ONBOARDING) session that has no access yet.
      const loaded = await this.#loadUser(actor);

      // 1b. Area (area mode only): the owner's area must be one of the action's areas.
      let area = null;
      if (this.config.areas?.enabled) {
        user = loaded;
        area = await this.#authorizeArea(def, loaded);
      }
      user = await this.#authenticate(def, channel, actor, loaded);

      // 2. Authorization
      if (!def.channels.includes(channel)) throw forbidden('Esta ação não está disponível neste canal.');
      if (def.platformAdmin) {
        if (!user.isPlatformAdmin) throw forbidden('Acesso restrito à administração da plataforma.');
      } else if (!def.roles.includes(user.role)) throw forbidden();

      // 3. Validation
      const parsed = def.schema.parse(input ?? {});

      // 4. Business rules (global)
      const company = await this.prisma.company.findUnique({ where: { id: user.companyId }, include: { subscription: true } });
      if (def.requiresActiveSubscription && company.subscription?.status !== 'ACTIVE') {
        throw conflict('Sua assinatura TemPix não está ativa.');
      }

      // 5. Step-up authentication for sensitive actions
      let effectiveInput = parsed;
      if (def.sensitive) {
        if (!challengeId) {
          const challenge = await this.#createChallenge(def, user, parsed, channel);
          const response = {
            status: 'CONFIRMATION_REQUIRED',
            action,
            challenge: {
              id: challenge.id,
              expiresAt: challenge.expiresAt,
              summary: challenge.summary,
              confirmPath: `/app/confirm/${challenge.id}`,
            },
          };
          await log('CONFIRMATION_REQUIRED', { challengeId: challenge.id });
          return response;
        }
        effectiveInput = await this.#consumeChallenge(def, user, challengeId, channel, actor);
      }

      // 6. Execution
      const ctx = {
        prisma: this.prisma,
        config: this.config,
        services: this.services,
        events: this.services.events,
        user,
        area,
        company,
        channel,
        actor,
        meta,
      };
      const result = await def.handler(ctx, effectiveInput);
      await log('SUCCEEDED', { result: summarizeResult(result) });
      this.services.events?.kick?.();
      return { status: 'SUCCEEDED', action, result };
    } catch (err) {
      const rejected = err instanceof ZodError || (err instanceof AppError && err.status < 500);
      await log(rejected ? 'REJECTED' : 'FAILED', { error: err instanceof ZodError ? 'validation' : err.message });
      throw err;
    }
  }

  /** The acting user: it must exist and not be disabled (the channel-specific checks come later). */
  async #loadUser(actor) {
    if (!actor?.userId) throw unauthorized();
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user || user.status === 'DISABLED') throw unauthorized();
    return user;
  }

  async #authenticate(def, channel, actor, user) {
    if (channel === 'WEB' || channel === 'API') {
      if (!actor.sessionId) throw unauthorized();
      if (actor.sessionScope !== 'FULL' && !def.allowOnboarding) throw unauthorized();
      if (actor.sessionScope === 'FULL' && user.status !== 'ACTIVE') throw forbidden('Sua conta ainda não foi ativada.');
    } else if (channel === 'WHATSAPP') {
      // Identity comes from a VERIFIED linked number — never from the text.
      const conn = actor.whatsappConnectionId
        ? await this.prisma.whatsAppConnection.findUnique({ where: { id: actor.whatsappConnectionId } })
        : null;
      if (!conn || conn.status !== 'VERIFIED' || conn.userId !== user.id) throw unauthorized('Número de WhatsApp não verificado.');
      if (user.status !== 'ACTIVE') throw forbidden('Sua conta ainda não foi ativada.');
    } else if (channel === 'SYSTEM') {
      if (actor.system !== true) throw unauthorized();
    } else {
      throw unauthorized();
    }
    return user;
  }

  /**
   * Area mode: the area of the user (owner of the account) must be in `def.areas`. Returns it, so
   * handlers pass it to the services that filter by area. A missing company, an unknown account type
   * or an action without `areas` is a denial (fail closed), with the same answer as an unknown action.
   */
  async #authorizeArea(def, user) {
    const company = await this.prisma.company.findUnique({ where: { id: user.companyId }, select: { accountType: true } });
    let area = null;
    try {
      area = areaOfUser({ isPlatformAdmin: user.isPlatformAdmin, company });
    } catch {
      area = null; // no company or an unknown account type
    }
    if (!area || !Array.isArray(def.areas) || !def.areas.includes(area)) throw notFound('Ação desconhecida.');
    return area;
  }

  async #createChallenge(def, user, input, channel) {
    const summary = def.summarize ? def.summarize(input) : def.description;
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { userId: user.id } });
    const messenger = this.services.whatsappMessenger;
    const provider = messenger?.provider;
    if (connection?.status === 'VERIFIED' && (!provider?.enabled || (provider.name !== 'mock' && !provider.templates?.authentication))) {
      throw unavailable('A confirmação por WhatsApp requer o provedor da Meta e um template de autenticação aprovado.');
    }
    const code = connection?.status === 'VERIFIED' ? createOtp() : null;
    const challenge = await this.prisma.sensitiveActionChallenge.create({
      data: {
        userId: user.id,
        companyId: user.companyId,
        action: def.name,
        input,
        summary,
        requestedVia: channel,
        mechanism: code ? 'WHATSAPP_OTP' : 'WEB_PASSWORD',
        verificationCodeHash: code ? 'pending' : null,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    if (code) {
      await this.prisma.sensitiveActionChallenge.update({
        where: { id: challenge.id },
        data: { verificationCodeHash: hashOtp(code, challenge.id, this.config.secrets.session) },
      });
      const sent = await messenger.send(connection, 'sendAuthenticationCode', [{ code }]);
      if (sent.status !== 'SENT') {
        await this.prisma.sensitiveActionChallenge.update({ where: { id: challenge.id }, data: { status: 'FAILED' } });
        throw unavailable('Não foi possível enviar o código de confirmação pelo WhatsApp. Tente novamente mais tarde.');
      }
    }
    await this.services.events?.publish({
      type: 'SENSITIVE_ACTION_REQUESTED',
      companyId: user.companyId,
      userId: user.id,
      aggregateType: 'challenge',
      aggregateId: challenge.id,
      payload: { action: def.name, summary, requestedVia: channel, mechanism: challenge.mechanism },
      activity: {
        type: 'SYSTEM',
        title: 'Confirmação de segurança necessária',
        description: summary,
        source: 'ActionEngine',
        severity: 'WARNING',
      },
    });
    return challenge;
  }

  /** A confirmed step-up challenge must be bound to this authenticated session. */
  async #consumeChallenge(def, user, challengeId, channel, actor) {
    if (channel !== 'WEB' && channel !== 'API') throw forbidden('Confirme esta ação no app TemPix.');
    const consumed = await this.prisma.sensitiveActionChallenge.updateMany({
      where: {
        id: challengeId,
        userId: user.id,
        action: def.name,
        status: 'CONFIRMED',
        expiresAt: { gt: new Date() },
        confirmedSessionId: actor.sessionId,
      },
      data: { status: 'EXECUTED' },
    });
    if (consumed.count !== 1) throw forbidden('Confirmação inválida ou expirada.');
    const challenge = await this.prisma.sensitiveActionChallenge.findUnique({ where: { id: challengeId } });
    return def.schema.parse(challenge.input);
  }
}

function summarizeResult(result) {
  if (!result || typeof result !== 'object') return result ?? null;
  const out = {};
  for (const [k, v] of Object.entries(result)) {
    if (v && typeof v === 'object' && 'id' in v) out[k] = { id: v.id, status: v.status };
    else if (typeof v !== 'object') out[k] = v;
  }
  return out;
}

export { badRequest };

