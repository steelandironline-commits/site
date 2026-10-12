import { getConfig, getPrisma, disconnectPrisma, logger, startWorker } from '@autopix/core';

// AutoPix background worker: scheduler + Postgres job queue consumer.
// Deploy as a separate Railway service with `npm run start:worker`.

async function main() {
  // Least privilege: the worker never receives webhooks, so it runs without webhook secrets.
  process.env.PROCESS_ROLE ??= 'worker';
  const config = getConfig();
  if (config.embeddedWorker) {
    logger.warn('EMBEDDED_WORKER=true: the API already runs a worker; this process will also consume jobs (safe, jobs are claimed with SKIP LOCKED).');
  }
  await getPrisma().$connect();
  const worker = startWorker({ concurrency: Number(process.env.WORKER_CONCURRENCY) || 2 });

  const shutdown = async (signal) => {
    logger.info('worker shutting down', { signal });
    await worker.stop();
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
