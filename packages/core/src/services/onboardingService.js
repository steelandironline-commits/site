import { COMMISSION_PLAN_CODE, formatCents } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { hashToken } from '../security/tokens.js';
import { badRequest, conflict, unavailable } from '../errors.js';
import { AuthService } from './authService.js';
import { pickCompanyFields } from './companyService.js';

/**
 * Progressive onboarding. The first step creates a PENDING_PAYMENT user +
 * company and an ONBOARDING-scoped session (HTTP-only cookie), so every
 * following step is persisted server-side and can be resumed.
 */
export class OnboardingService {
  constructor({ prisma = getPrisma(), config = getConfig(), email } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.email = email;
    this.auth = new AuthService({ prisma, config, email });
  }

  async start({ name, email, companyName, accountType = 'COMPANY', document }, meta = {}) {
    // A professional's account is named after the person.
    const accountName = accountType === 'PERSON' ? name : companyName;
    const loginId = document; // CNPJ (company) or CPF (person), digits only
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.status !== 'PENDING_PAYMENT') {
      throw conflict('Este e-mail já possui uma conta TemPix. Entre ou recupere sua senha.');
    }
    // One login per CNPJ / CPF. An unfinished draft never holds it.
    const holder = loginId ? await this.prisma.user.findUnique({ where: { loginId } }) : null;
    const staleDraft = holder && holder.id !== existing?.id && holder.status === 'PENDING_PAYMENT';
    if (holder && holder.id !== existing?.id && !staleDraft) {
      throw conflict(
        accountType === 'COMPANY'
          ? 'Este CNPJ já tem cadastro no TemPix. Entre com ele ou recupere a senha.'
          : 'Este CPF já tem cadastro no TemPix. Entre com ele ou recupere a senha.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (staleDraft) await tx.user.update({ where: { id: holder.id }, data: { loginId: null } });
      let user;
      if (existing) {
        // Unpaid draft: restart it. Previous draft data is overwritten, never
        // disclosed, and any old onboarding sessions are revoked.
        await tx.session.deleteMany({ where: { userId: existing.id } });
        await tx.company.update({
          where: { id: existing.companyId },
          data: { name: accountName, accountType, cnpj: accountType === 'COMPANY' ? loginId : null, onboardingStep: 1, onboardingCompletedAt: null },
        });
        user = await tx.user.update({ where: { id: existing.id }, data: { name, loginId } });
      } else {
        const company = await tx.company.create({
          data: { name: accountName, accountType, cnpj: accountType === 'COMPANY' ? loginId : null, onboardingStep: 1 },
        });
        user = await tx.user.create({ data: { email, name, loginId, companyId: company.id, status: 'PENDING_PAYMENT' } });
      }
      const { token, session } = await this.auth.createSession(user.id, { scope: 'ONBOARDING', ...meta }, tx);
      return { token, session, user };
    });
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
        if (!next.serviceLocations.length && !next.city) missing.push('cidade ou região');
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
    const token = await this.prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({ where: { companyId: company.id }, update: access, create: { companyId: company.id, ...access } });
      await tx.user.update({ where: { id: fresh.id }, data: { status: 'PENDING_ACTIVATION' } });
      await tx.activationToken.updateMany({ where: { userId: fresh.id, usedAt: null }, data: { usedAt: now } });
      return this.auth.issueActivationToken(fresh.id, tx);
    });
    const sent = await this.email?.activationEmail({ to: fresh.email, name: fresh.name, link: `${this.config.appUrl}/activate/${token}` });
    if (!sent) {
      await this.prisma.activationToken.updateMany({ where: { userId: fresh.id, usedAt: null }, data: { usedAt: new Date() } });
      throw unavailable('Não foi possível enviar o link de verificação. O cadastro está gratuito, mas o e-mail de ativação precisa estar configurado para liberar o acesso.');
    }
    await this.prisma.activationToken.updateMany({ where: { tokenHash: hashToken(token, this.config.secrets.activation) }, data: { emailSentAt: new Date() } });
    return { emailVerificationRequired: true, emailSent: true };
  }
}
