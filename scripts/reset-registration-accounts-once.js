import { PrismaClient } from '@prisma/client';

const expectedAction = 'erase-registration-accounts';
if (process.env.TEMP_MAINTENANCE_ACTION !== expectedAction) {
  throw new Error('Maintenance action guard did not match.');
}
if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'production') {
  throw new Error('This one-time reset is restricted to the production environment.');
}

const prisma = new PrismaClient();

try {
  await prisma.$connect();

  const [users, admins] = await Promise.all([
    prisma.user.findMany({ where: { isPlatformAdmin: false }, select: { companyId: true } }),
    prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { companyId: true } }),
  ]);
  const protectedCompanyIds = new Set(admins.map((user) => user.companyId));
  const companyIds = [...new Set(users.map((user) => user.companyId))].filter((id) => !protectedCompanyIds.has(id));
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const [pendingPayments, cancelableSubscriptions] = await Promise.all([
      companyIds.length
        ? tx.payment.count({ where: { companyId: { in: companyIds }, status: 'PENDING' } })
        : Promise.resolve(0),
      companyIds.length
        ? tx.subscription.count({ where: { companyId: { in: companyIds }, status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] } } })
        : Promise.resolve(0),
    ]);

    if (companyIds.length) {
      await tx.payment.updateMany({
        where: { companyId: { in: companyIds }, status: 'PENDING' },
        data: {
          status: 'CANCELED',
          pixQrCodeBase64: null,
          pixCopyPaste: null,
          expiresAt: now,
          payerName: null,
          payerDocument: null,
          payerEmail: null,
          createdByUserId: null,
        },
      });
      await tx.subscription.updateMany({
        where: { companyId: { in: companyIds }, status: { in: ['PENDING', 'ACTIVE', 'PAST_DUE'] } },
        data: { status: 'CANCELED', cancelAtPeriodEnd: false, canceledAt: now },
      });
      await tx.company.updateMany({
        where: { id: { in: companyIds } },
        data: {
          name: 'Cadastro encerrado',
          cnpj: null,
          website: null,
          instagram: null,
          phone: null,
          city: null,
          state: null,
          serviceLocations: [],
          serviceRadiusKm: null,
          description: null,
          products: [],
          services: [],
          idealCustomer: null,
          averageTicket: null,
          minimumDeal: null,
          preferredIndustries: [],
          excludedIndustries: [],
          keywords: [],
          agentsPaused: true,
          payoutPixKey: null,
          payoutPixKeyType: null,
          onboardingStep: 0,
          onboardingCompletedAt: null,
        },
      });
    }

    const removedUsers = await tx.user.deleteMany({ where: { isPlatformAdmin: false } });
    return {
      registrationsRemoved: removedUsers.count,
      companyProfilesCleared: companyIds.length,
      pendingPaymentsCanceled: pendingPayments,
      subscriptionsCanceled: cancelableSubscriptions,
      platformAdminsPreserved: admins.length,
    };
  });

  console.log(JSON.stringify({ reset: 'completed', ...result }));
} finally {
  await prisma.$disconnect();
}
