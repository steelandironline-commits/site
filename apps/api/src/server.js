import { getConfig, getPrisma, disconnectPrisma, ensureAgents, logger, startWorker } from '@autopix/core';
import { buildServices, createApp } from './app.js';
import { ActivityHub } from './realtime/activityHub.js';

async function main() {
  const config = getConfig();
  const prisma = getPrisma();
  await prisma.$connect();
  await ensureAgents(prisma);

  const services = buildServices({ config, prisma });
  await services.commissions.ensureDefaults();
  const hub = await new ActivityHub({ activity: services.activity, databaseUrl: config.databaseUrl }).start();
  const app = createApp({ services, hub });

  const server = app.listen(config.port, () => {
    logger.info('TemPix API listening', {
      port: config.port,
      env: config.env,
      demoMode: config.demoMode,
      paymentProvider: config.payment.provider,
      realtime: hub.mode,
    });
  });
  server.keepAliveTimeout = 65_000;

  const worker = config.embeddedWorker ? startWorker() : null;

  // BB Pay: say at boot whether returns (devoluções) are allowed for this app.
  if (config.payment.provider === 'bb_pay') {
    Promise.resolve()
      .then(() => services.payments.provider().checkRefundPermission?.())
      .catch((err) => logger.warn('bb pay refund permission check failed', { code: err.code || err.name }));
  }

  const shutdown = async (signal) => {
    logger.info('shutting down', { signal });
    server.close();
    await worker?.stop();
    await hub.stop();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message);
  process.exit(1);
});
