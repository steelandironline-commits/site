import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { badRequest, conflict } from '../errors.js';
import { AuthService } from './authService.js';
import { pickCompanyFields } from './companyService.js';

/**
 * Progressive onboarding. The first step creates a PENDING_PAYMENT user +
 * company and an ONBOARDING-scoped session (HTTP-only cookie), so every
 * following step is persisted server-side and can be resumed.
 */
export class OnboardingService {
  constructor({ prisma = getPrisma(), config = getConfig() } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.auth = new AuthService({ prisma, config });
  }

  async start({ name, email, companyName }, meta = {}) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.status !== 'PENDING_PAYMENT') {
      throw conflict('Este e-mail já possui uma conta AutoPix. Entre ou recupere sua senha.');
    }

    return this.prisma.$transaction(async (tx) => {
      let user;
      if (existing) {
        // Unpaid draft: restart it. Previous draft data is overwritten, never
        // disclosed, and any old onboarding sessions are revoked.
        await tx.session.deleteMany({ where: { userId: existing.id } });
        await tx.company.update({
          where: { id: existing.companyId },
          data: { name: companyName, onboardingStep: 1, onboardingCompletedAt: null },
        });
        user = await tx.user.update({ where: { id: existing.id }, data: { name } });
      } else {
        const company = await tx.company.create({ data: { name: companyName, onboardingStep: 1 } });
        user = await tx.user.create({ data: { email, name, companyId: company.id, status: 'PENDING_PAYMENT' } });
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
    };
  }

  async saveStep(user, { step, data, complete }) {
    if (user.status !== 'PENDING_PAYMENT' && user.status !== 'PENDING_ACTIVATION') {
      throw conflict('Onboarding já concluído.');
    }
    const company = await this.prisma.company.findUnique({ where: { id: user.companyId } });
    const patch = pickCompanyFields(data || {});
    const next = { ...company, ...patch };

    if (complete) {
      const missing = [];
      if (!next.products.length && !next.services.length) missing.push('produtos ou serviços');
      if (!next.idealCustomer) missing.push('cliente ideal');
      if (!next.serviceLocations.length && !next.city) missing.push('região de atendimento');
      if (!next.cnpj) missing.push('CNPJ');
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
}
