import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { getPaymentProvider } from '../payments/index.js';
import { conflict, notFound } from '../errors.js';
import { ActivityService } from './activityService.js';

export class SubscriptionService {
  constructor({ prisma = getPrisma(), config = getConfig(), providerFactory = getPaymentProvider } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.providerFactory = providerFactory;
    this.activity = new ActivityService({ prisma });
  }

  async get(companyId) {
    const subscription = await this.prisma.subscription.findUnique({ where: { companyId } });
    if (!subscription) return null;
    const daysLeft = subscription.currentPeriodEnd
      ? Math.max(0, Math.ceil((subscription.currentPeriodEnd.getTime() - Date.now()) / 86_400_000))
      : null;
    return { ...subscription, daysLeft, canRenew: subscription.status !== 'ACTIVE' || (daysLeft !== null && daysLeft <= 5) };
  }

  /** Cancel at period end: no new charges, access until currentPeriodEnd. */
  async cancel(companyId, userId) {
    const sub = await this.prisma.subscription.findUnique({ where: { companyId } });
    if (!sub) throw notFound('Assinatura não encontrada.');
    if (sub.status !== 'ACTIVE') throw conflict('A assinatura não está ativa.');
    if (sub.cancelAtPeriodEnd) return this.get(companyId);
    await this.providerFactory(sub.provider, this.config).cancelSubscription(sub);
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
    });
    await this.activity.record({
      companyId,
      userId,
      type: 'SYSTEM',
      title: 'Cancelamento agendado',
      description: `Seu AutoPix continua ativo até ${sub.currentPeriodEnd?.toLocaleDateString('pt-BR') ?? 'o fim do período'}.`,
      source: 'subscription',
      severity: 'WARNING',
    });
    return this.get(companyId);
  }

  async resume(companyId, userId) {
    const sub = await this.prisma.subscription.findUnique({ where: { companyId } });
    if (!sub) throw notFound('Assinatura não encontrada.');
    if (sub.status !== 'ACTIVE' || !sub.cancelAtPeriodEnd) throw conflict('Não há cancelamento agendado.');
    await this.prisma.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false, canceledAt: null } });
    await this.activity.record({
      companyId,
      userId,
      type: 'SYSTEM',
      title: 'Cancelamento revertido',
      source: 'subscription',
      severity: 'SUCCESS',
    });
    return this.get(companyId);
  }

  /** Move subscriptions past their period end to CANCELED / PAST_DUE. */
  async sweepExpired() {
    const now = new Date();
    const due = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
      select: { id: true, companyId: true, cancelAtPeriodEnd: true },
    });
    for (const sub of due) {
      const status = sub.cancelAtPeriodEnd ? 'CANCELED' : 'PAST_DUE';
      const { count } = await this.prisma.subscription.updateMany({
        where: { id: sub.id, status: 'ACTIVE' },
        data: { status },
      });
      if (count) {
        await this.prisma.searchJob.updateMany({
          where: { companyId: sub.companyId, status: 'QUEUED' },
          data: { status: 'CANCELED' },
        });
        await this.activity.record({
          companyId: sub.companyId,
          type: 'SYSTEM',
          title: status === 'CANCELED' ? 'Assinatura encerrada' : 'Renovação pendente',
          description:
            status === 'CANCELED'
              ? 'Os agentes foram pausados.'
              : 'Os agentes foram pausados até a confirmação do próximo Pix.',
          source: 'subscription',
          severity: 'WARNING',
        });
      }
    }
    return due.length;
  }
}
