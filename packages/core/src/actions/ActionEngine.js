import { ZodError } from 'zod';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from '../errors.js';
import { logger } from '../logger.js';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const SECRET_KEYS = /password|token|secret|code|pixKey/i;

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
 *     handler(ctx, input) }
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

  /** Public catalog for clients (no handlers, no internals). */
  catalog() {
    return [...this.actions.values()].map((a) => ({
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

      // 1. Authentication
      user = await this.#authenticate(def, channel, actor);

      // 2. Authorization
      if (!def.channels.includes(channel)) throw forbidden('Esta ação não está disponível neste canal.');
      if (!def.roles.includes(user.role)) throw forbidden();

      // 3. Validation
      const parsed = def.schema.parse(input ?? {});

      // 4. Business rules (global)
      const company = await this.prisma.company.findUnique({ where: { id: user.companyId }, include: { subscription: true } });
      if (def.requiresActiveSubscription && company.subscription?.status !== 'ACTIVE') {
        throw conflict('Sua assinatura AutoPix não está ativa.');
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
        company,
        channel,
        actor,
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

  async #authenticate(def, channel, actor) {
    if (!actor?.userId) throw unauthorized();
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user || user.status === 'DISABLED') throw unauthorized();

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

  async #createChallenge(def, user, input, channel) {
    const summary = def.summarize ? def.summarize(input) : def.description;
    const challenge = await this.prisma.sensitiveActionChallenge.create({
      data: {
        userId: user.id,
        companyId: user.companyId,
        action: def.name,
        input,
        summary,
        requestedVia: channel,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    await this.services.events?.publish({
      type: 'SENSITIVE_ACTION_REQUESTED',
      companyId: user.companyId,
      userId: user.id,
      aggregateType: 'challenge',
      aggregateId: challenge.id,
      payload: { action: def.name, summary, requestedVia: channel },
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

  /**
   * A sensitive action executes only with a challenge CONFIRMED in an
   * authenticated web session (password step-up). Possession of a WhatsApp
   * number is never enough.
   */
  async #consumeChallenge(def, user, challengeId, channel, actor) {
    if (channel !== 'WEB' && channel !== 'API') throw forbidden('Confirme esta ação no app AutoPix.');
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
