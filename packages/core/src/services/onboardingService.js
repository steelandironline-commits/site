import { COMMISSION_PLAN_CODE, formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { hashToken } from '../security/tokens.js';
import { badRequest, conflict, gone, unavailable } from '../errors.js';
import { accountTypeForHost } from '../security/area.js';
import { areaOf } from '@autopix/areas/areas';
import { AuthService } from './authService.js';
import { pickCompanyFields } from './companyService.js';

/**
 * Progressive onboarding. The first step creates a PENDING_PAYMENT user +
 * company and an ONBOARDING-scoped session (HTTP-only cookie), so every
 * following step is persisted server-side and can be resumed.
 */
/** An unpaid signup has one hour to be finished; after that it is purged and must be started again. */
const DRAFT_TTL_MS = 60 * 60 * 1000;
/**
 * A Pix paid in its last minute may be confirmed by the bank a little later.
 * A signup with a charge is never purged until this long after the charge
 * expired, so a paid account is never reset.
 */
const PAYMENT_GRACE_MS = 30 * 60 * 1000;

/** Area mode: a signup the host does not take. Generic on purpose; it never names the other area. */
const WRONG_SIGNUP_MESSAGE = 'Não foi possível iniciar o cadastro. Confira os dados e tente novamente.';
/**
 * Area mode: an unpaid draft in progress holds its e-mail, for everyone who is not the draft's own
 * onboarding session, on every host. Says nothing about which area the draft belongs to.
 */
const DRAFT_IN_PROGRESS_MESSAGE = 'Já existe um cadastro em andamento com este e-mail. Use outro e-mail ou tente novamente mais tarde.';

export class OnboardingService {
  constructor({ prisma = getPrisma(), config = getConfig(), email } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.email = email;
    this.auth = new AuthService({ prisma, config, email });
  }

  /**
   * Area mode (ARQUITETURA 6.2): the host sets the account type, CNPJ -> COMPANY and CPF -> PERSON.
   * A body that declares another type is a generic 400 (checked before the schema, so the
   * field errors never speak of the other area); a body that leaves it out gets the host's.
   * Legacy mode: the body is returned untouched.
   */
  applyHostAccountType(body, hostArea) {
    if (!this.config.areas?.enabled) return body;
    const hostType = accountTypeForHost(hostArea);
    const declared = body?.accountType;
    if (!hostType || (declared !== undefined && declared !== hostType)) throw badRequest(WRONG_SIGNUP_MESSAGE);
    return { ...body, accountType: hostType };
  }

  #assertHostAccountType(accountType, hostArea) {
    if (this.config.areas?.enabled && accountType !== accountTypeForHost(hostArea)) throw badRequest(WRONG_SIGNUP_MESSAGE);
  }

  /**
   * `meta.sessionUserId` is the user of the onboarding session the request carries, if any: it is how
   * the owner of a draft proves it is theirs (see #availability). The rest of `meta` goes to the session.
   */
  async start({ name, email, companyName, accountType = 'COMPANY', document }, { sessionUserId = null, ...meta } = {}) {
    this.#assertHostAccountType(accountType, meta.hostArea);
    // A professional's account is named after the person.
    const accountName = accountType === 'PERSON' ? name : companyName;
    const loginId = document; // CNPJ (company) or CPF (person), digits only
    const { sessionUserId = null, ...sessionMeta } = meta;
    await this.#purgeExpiredDrafts();
    const { existing, taken } = await this.#availability({ email, accountType, loginId, hostArea: meta.hostArea, sessionUserId });
    if (taken.email) throw conflict(taken.email, { field: 'email' });
    if (taken.document) throw conflict(taken.document, { field: 'document' });
    const pendingExpiresAt = new Date(Date.now() + DRAFT_TTL_MS);

    return this.prisma.$transaction(async (tx) => {
      let user;
      if (existing) {
        // Unpaid draft: restart it. Previous draft data is overwritten, never
        // disclosed, and any old onboarding sessions are revoked.
        await tx.session.deleteMany({ where: { userId: existing.id } });
        await tx.company.update({
          where: { id: existing.companyId },
          data: { name: accountName, accountType, cnpj: accountType === 'COMPANY' ? loginId : null, onboardingStep: 1, onboardingCompletedAt: null },
        });
        user = await tx.user.update({ where: { id: existing.id }, data: { name, loginId, pendingExpiresAt } });
      } else {
        const company = await tx.company.create({
          data: { name: accountName, accountType, cnpj: accountType === 'COMPANY' ? loginId : null, onboardingStep: 1 },
        });
        user = await tx.user.create({ data: { email, name, loginId, companyId: company.id, status: 'PENDING_PAYMENT', pendingExpiresAt } });
      }
      const { token, session } = await this.auth.createSession(user.id, { scope: 'ONBOARDING', ...sessionMeta }, tx);
      return { token, session, user };
    });
  }

  /** First signup step: which of the e-mail and the CNPJ/CPF already have an account (message per field). */
  async check({ email, accountType, document }, meta = {}) {
    this.#assertHostAccountType(accountType, meta.hostArea);
    await this.#purgeExpiredDrafts();
    const { taken } = await this.#availability({ email, accountType, loginId: document, hostArea: meta.hostArea, sessionUserId: meta.sessionUserId });
    return { available: !taken.email && !taken.document, taken };
  }

  /**
   * One account per e-mail, per CPF and per CNPJ. An unpaid draft holds its CPF/CNPJ
   * until its hour is up; the same e-mail may restart its own draft.
   */
  async #availability({ email, accountType, loginId, hostArea, sessionUserId = null }) {
    const taken = {};
    const found = await this.prisma.user.findUnique({ where: { email }, include: { company: { select: { accountType: true } } } });
    // Area mode: an unpaid draft is restarted only by the onboarding session that owns it. For anyone
    // else, on any host, the e-mail is simply held, with one neutral message: comparing the two hosts
    // must not tell which area a draft belongs to, and a stranger who knows the e-mail must not wipe
    // it. A draft of the other area is never this host's to restart either (it would flip the account
    // type), whoever asks. Legacy mode keeps restarting by e-mail alone.
    const heldDraft = Boolean(
      this.config.areas?.enabled &&
        found?.status === 'PENDING_PAYMENT' &&
        (found.id !== sessionUserId || areaOf(found.company.accountType) !== hostArea),
    );
    const existing = heldDraft ? null : found;
    if (heldDraft) taken.email = DRAFT_IN_PROGRESS_MESSAGE;
    else if (existing && existing.status !== 'PENDING_PAYMENT') {
      taken.email = 'Já existe um cadastro com este e-mail. Use outro e-mail ou entre com a sua conta.';
    }
    const holder = loginId ? await this.prisma.user.findUnique({ where: { loginId } }) : null;
    const companyHolder = accountType === 'COMPANY' && loginId ? await this.prisma.company.findUnique({ where: { cnpj: loginId } }) : null;
    // Only the e-mail's own unpaid draft may reuse its CPF/CNPJ.
    const draft = existing?.status === 'PENDING_PAYMENT' ? existing : null;
    if ((holder && holder.id !== draft?.id) || (companyHolder && companyHolder.id !== draft?.companyId)) {
      taken.document =
        accountType === 'COMPANY'
          ? 'Este CNPJ já tem cadastro no TemPix. Entre com ele ou recupere a senha.'
          : 'Este CPF já tem cadastro no TemPix. Entre com ele ou recupere a senha.';
    }
    // A draft whose signup fee is in play (open Pix, or paid) is restarted only by its own session.
    // Restarting by e-mail alone would hand the activation token to whoever knows the e-mail, while
    // someone else pays the fee. The answer is the same message as a taken e-mail, so nothing shows
    // that a draft exists.
    if (existing?.status === 'PENDING_PAYMENT' && existing.id !== sessionUserId && (await this.#hasPaymentAtStake(existing.companyId))) {
      taken.email = 'Já existe um cadastro com este e-mail. Use outro e-mail ou entre com a sua conta.';
    }
    return { existing, taken };
  }

  /**
   * Deletes unpaid signups past their hour, freeing their CNPJ and CPF. Never
   * touches a signup with a confirmed payment, nor one whose Pix could still be
   * confirmed (open, or expired less than PAYMENT_GRACE_MS ago).
   */
  async #purgeExpiredDrafts() {
    const now = new Date();
    const drafts = await this.prisma.user.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        OR: [{ pendingExpiresAt: { lt: now } }, { pendingExpiresAt: null, createdAt: { lt: new Date(now.getTime() - DRAFT_TTL_MS) } }],
      },
      select: { companyId: true },
    });
    for (const { companyId } of drafts) {
      if (!(await this.#hasPaymentAtStake(companyId, now))) await this.prisma.company.deleteMany({ where: { id: companyId } });
    }
  }

  /**
   * Is the signup fee of this company in play? A confirmed (or refunded) payment, or a pending one
   * whose Pix is open or expired less than PAYMENT_GRACE_MS ago. The purge and the restart use this
   * same rule, so a draft that cannot be purged cannot be restarted by a stranger either.
   */
  async #hasPaymentAtStake(companyId, now = new Date()) {
    const open = await this.prisma.payment.count({
      where: {
        companyId,
        OR: [
          { status: { in: ['CONFIRMED', 'REFUNDED'] } },
          { status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now.getTime() - PAYMENT_GRACE_MS) } }] },
        ],
      },
    });
    return open > 0;
  }

  /** Refuses to continue an unpaid signup whose hour has passed. */
  async #assertNotExpired(userId) {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, pendingExpiresAt: true, companyId: true } });
    if (row.status !== 'PENDING_PAYMENT' || !row.pendingExpiresAt || row.pendingExpiresAt > new Date()) return;
    const sub = await this.prisma.subscription.findUnique({ where: { companyId: row.companyId } });
    if (sub?.status === 'ACTIVE') return;
    throw gone('O prazo de 1 hora para concluir este cadastro acabou. Comece de novo.');
  }

  async state(user) {
    const [company, subscription, payment] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: user.companyId } }),
      this.prisma.subscription.findUnique({ where: { companyId: user.companyId } }),
      this.prisma.payment.findFirst({
        where: { companyId: user.companyId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, expiresAt: true },
      }),
    ]);
    return {
      user: { id: user.id, name: user.name, email: user.email, status: user.status },
      company,
      subscription: subscription ? { status: subscription.status } : null,
      latestPayment: payment,
      billingModel: this.config.billing.model,
      signupFeeCents: this.#signupFee(company),
    };
  }

  /** Companies pay a one-time signup fee (commission model); professionals don't. */
  #signupFee(company) {
    if (this.config.billing.model !== 'commission' || company?.accountType !== 'COMPANY') return 0;
    return this.config.billing.companySignupFeeCents;
  }

  async saveStep(user, { step, data, complete }) {
    if (user.status !== 'PENDING_PAYMENT' && user.status !== 'PENDING_ACTIVATION') {
      throw conflict('Onboarding já concluído.');
    }
    await this.#assertNotExpired(user.id);
    const company = await this.prisma.company.findUnique({ where: { id: user.companyId } });
    const patch = pickCompanyFields(data || {});
    // The CNPJ given at the start is the company's login: it can't change here.
    if (company.cnpj) delete patch.cnpj;
    if (company.accountType === 'PERSON') delete patch.cnpj;
    const next = { ...company, ...patch };

    if (complete) {
      const missing = [];
      if (company.accountType === 'PERSON') {
        if (!next.services.length) missing.push('profissão ou serviços');
        if (!next.postalCode) missing.push('CEP');
      } else {
        if (!next.products.length && !next.services.length) missing.push('produtos ou serviços');
        if (!next.idealCustomer) missing.push('cliente ideal');
        if (!next.serviceLocations.length && !next.city) missing.push('região de atendimento');
        if (!next.cnpj) missing.push('CNPJ');
      }
      if (missing.length) throw badRequest(`Complete: ${missing.join(', ')}.`, { missing });
    }

    return this.prisma.company.update({
      where: { id: company.id },
      data: {
        ...patch,
        onboardingStep: Math.max(company.onboardingStep, step),
        ...(complete ? { onboardingCompletedAt: new Date() } : {}),
      },
    });
  }

  /**
   * Commission model: no subscription. Professionals sign up free; companies
   * pay a one-time signup fee first (its confirmed payment opens the access
   * record). Once the profile is complete, an activation token is handed to
   * this same onboarding session, so the owner creates the password next (the
   * password is always chosen by the user).
   */
  async finish(user) {
    if (this.config.billing.model !== 'commission') throw conflict('Conclua o pagamento para ativar a conta.');
    const fresh = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (fresh.status === 'ACTIVE') return { alreadyActive: true };
    if (fresh.status !== 'PENDING_PAYMENT' && fresh.status !== 'PENDING_ACTIVATION') throw conflict('Onboarding já concluído.');
    await this.#assertNotExpired(fresh.id);
    const company = await this.prisma.company.findUnique({ where: { id: fresh.companyId } });
    if (!company.onboardingCompletedAt) throw badRequest('Complete os dados do cadastro antes de continuar.');
    const fee = this.#signupFee(company);
    if (fee > 0) {
      const access = await this.prisma.subscription.findUnique({ where: { companyId: company.id } });
      if (access?.status !== 'ACTIVE') {
        throw conflict(`Contas de empresa têm taxa única de cadastro de ${formatCents(fee)}. Gere o Pix para concluir.`);
      }
      const token = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: fresh.id }, data: { status: 'PENDING_ACTIVATION' } });
        return this.auth.issueActivationToken(fresh.id, tx);
      });
      return { token };
    }
    const now = new Date();
    const access = {
      plan: COMMISSION_PLAN_CODE,
      priceCents: 0,
      status: 'ACTIVE',
      provider: 'none',
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      activatedAt: now,
    };
    const { token, area } = await this.prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({ where: { companyId: company.id }, update: access, create: { companyId: company.id, ...access } });
      await tx.user.update({ where: { id: fresh.id }, data: { status: 'PENDING_ACTIVATION' } });
      await tx.activationToken.updateMany({ where: { userId: fresh.id, usedAt: null }, data: { usedAt: now } });
      return this.auth.issueActivation(fresh.id, tx);
    });
    const sent = await this.email?.activationEmail({ to: fresh.email, name: fresh.name, link: this.auth.activationLink(token, area) });
    if (!sent) {
      await this.prisma.activationToken.updateMany({ where: { userId: fresh.id, usedAt: null }, data: { usedAt: new Date() } });
      throw unavailable('Não foi possível enviar o link de verificação. O cadastro está gratuito, mas o e-mail de ativação precisa estar configurado para liberar o acesso.');
    }
    await this.prisma.activationToken.updateMany({ where: { tokenHash: hashToken(token, this.config.secrets.activation) }, data: { emailSentAt: new Date() } });
    return { emailVerificationRequired: true, emailSent: true };
  }
}
