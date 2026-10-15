import { COMMISSION_PLAN_CODE } from '@autopix/shared';
import { badRequest, forbidden, notFound } from '../errors.js';

/**
 * Cortesia de acesso: a platform admin gives one company free access, instead
 * of the one-time signup fee. It is a complimentary grant, never a payment: no
 * Pix is created or marked as paid, and the grant is recorded in the financial
 * audit log with the reason. Reached only through the ActionEngine, which
 * requires admin rights and a password confirmation.
 */
export class CourtesyAccessService {
  constructor({ prisma, audit }) {
    this.prisma = prisma;
    this.audit = audit;
  }

  async grant({ admin, cnpj, reason, ip, userAgent }) {
    if (!admin?.isPlatformAdmin) throw forbidden('Acesso restrito à administração da plataforma.');
    const doc = String(cnpj || '').replace(/\D/g, '');
    if (doc.length !== 14) throw badRequest('Informe um CNPJ com 14 dígitos.');
    const company = await this.prisma.company.findFirst({ where: { cnpj: doc }, include: { subscription: true } });
    if (!company) throw notFound('Nenhuma empresa cadastrada com este CNPJ.');
    if (company.accountType !== 'COMPANY') throw badRequest('Cortesia de acesso vale só para contas de empresa.');
    if (company.subscription?.status === 'ACTIVE') return { companyId: company.id, alreadyActive: true };

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.upsert({
        where: { companyId: company.id },
        update: { plan: COMMISSION_PLAN_CODE, priceCents: 0, status: 'ACTIVE', provider: 'courtesy', cancelAtPeriodEnd: false, canceledAt: null, activatedAt: now },
        create: { companyId: company.id, plan: COMMISSION_PLAN_CODE, priceCents: 0, status: 'ACTIVE', provider: 'courtesy', activatedAt: now },
      });
      await this.audit.log(
        { action: 'COURTESY_ACCESS_GRANTED', source: 'ADMIN', userId: admin.id, companyId: company.id, ip, userAgent, metadata: { reason, cnpjLast4: doc.slice(-4) } },
        tx,
      );
    });
    return { companyId: company.id, granted: true };
  }
}
