import { PrismaClient } from '@prisma/client';
import { getConfig } from './config.js';

let prisma;

/** Lazily-created Prisma client singleton. */
export function getPrisma() {
  if (!prisma) {
    const cfg = getConfig();
    prisma = new PrismaClient({
      datasources: cfg.databaseUrl ? { db: { url: cfg.databaseUrl } } : undefined,
      log: cfg.isProduction ? ['error'] : ['error', 'warn'],
    });
  }
  return prisma;
}

export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
