// AutoPix seed.
//  - Always: ensures the five platform agents exist.
//  - DEMO_MODE=true (non-production only): creates a fictional demo company
//    with an active subscription, runs one demo search cycle and prints a
//    one-time activation link so you define the password yourself.
//    No password is ever generated, printed or stored in plaintext.

import {
  getConfig,
  getPrisma,
  disconnectPrisma,
  ensureAgents,
  AuthService,
  AgentOrchestrator,
  JobQueue,
  CommissionService,
} from '@autopix/core';
import { PLAN } from '@autopix/shared';

const DEMO_EMAIL = 'demo@autopix.example';

async function main() {
  const config = getConfig();
  const prisma = getPrisma();

  await ensureAgents(prisma);
  console.log('✓ agents ready');
  // Commission rules are configuration (not money): 1.5% marketplace default.
  await new CommissionService({ prisma }).ensureDefaults();
  console.log('✓ commission rules ready');
  // No payments, transactions or provider events are ever seeded: a seed must
  // never produce something that looks like a real (or real-looking) payment.

  if (!config.demoMode || config.isProduction) {
    console.log('DEMO_MODE is off (or production): skipping demo data.');
    return;
  }

  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    const company = await prisma.company.create({
      data: {
        name: 'Usinagem Exemplo (DEMO)',
        cnpj: '11222333000181',
        website: 'https://usinagem-exemplo.example',
        city: 'Joinville',
        state: 'SC',
        serviceLocations: ['Joinville - SC', 'Curitiba - PR', 'Blumenau - SC'],
        serviceRadiusKm: 250,
        description: 'Usinagem CNC, caldeiraria e manutenção industrial para médias e grandes indústrias.',
        products: ['Peças usinadas sob medida'],
        services: ['Usinagem', 'Caldeiraria', 'Manutenção'],
        idealCustomer: 'Indústrias de médio e grande porte',
        averageTicket: 18000,
        minimumDeal: 5000,
        preferredIndustries: ['Indústria', 'Metalurgia', 'Alimentos e bebidas', 'Automotivo'],
        excludedIndustries: ['Setor público'],
        keywords: ['manutenção preventiva', 'expansão'],
        onboardingStep: 99,
        onboardingCompletedAt: new Date(),
      },
    });
    user = await prisma.user.create({
      data: { email: DEMO_EMAIL, name: 'Equipe Demo', companyId: company.id, status: 'PENDING_ACTIVATION' },
    });
    const now = new Date();
    const sub = await prisma.subscription.create({
      data: {
        companyId: company.id,
        priceCents: PLAN.priceCents,
        provider: 'mock',
        status: 'ACTIVE',
        activatedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + PLAN.intervalDays * 86_400_000),
      },
    });
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        companyId: company.id,
        provider: 'mock',
        providerPaymentId: `mock_seed_${company.id}`,
        amountCents: PLAN.priceCents,
        status: 'CONFIRMED',
        paidAt: now,
        idempotencyKey: `seed-${company.id}`,
        metadata: { seed: true },
      },
    });
    console.log('✓ demo company created');

    // One synchronous demo cycle so the dashboard has data immediately.
    const queue = new JobQueue({ prisma });
    const { job } = await queue.enqueue(company.id, { trigger: 'MANUAL', isDemo: true });
    const claimed = await prisma.searchJob.update({ where: { id: job.id }, data: { status: 'RUNNING', startedAt: new Date(), attempts: 1 } });
    const orchestrator = new AgentOrchestrator({ prisma, config, pacingMs: 0 });
    for (let i = 0; i < 3; i += 1) {
      const stats = await orchestrator.runJob(claimed);
      if (i === 0) await queue.complete(job.id, stats);
      else {
        await prisma.searchJob.create({
          data: { companyId: company.id, status: 'COMPLETED', trigger: 'MANUAL', isDemo: true, finishedAt: new Date(), ...stats },
        });
      }
    }
    console.log('✓ demo search cycles executed');
  }

  if (user.status !== 'ACTIVE') {
    const auth = new AuthService({ prisma, config });
    const token = await auth.issueActivationToken(user.id);
    console.log('\nDemo account:', DEMO_EMAIL);
    console.log('Define the password (one-time link, 48h):');
    console.log(`  ${config.appUrl}/activate/${token}\n`);
  } else {
    console.log(`Demo account ${DEMO_EMAIL} already active. Use /forgot-password to reset it.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
