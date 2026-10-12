import { AGENTS } from '@autopix/shared';
import { getPrisma } from '../db.js';

let cache;

/** Ensure the five platform agents exist and return a key -> agent map. */
export async function ensureAgents(prisma = getPrisma()) {
  for (const a of AGENTS) {
    await prisma.agent.upsert({
      where: { key: a.key },
      update: { name: a.name, description: a.description },
      create: { key: a.key, name: a.name, description: a.description },
    });
  }
  cache = undefined;
  return getAgentMap(prisma);
}

export async function getAgentMap(prisma = getPrisma()) {
  if (cache) return cache;
  const agents = await prisma.agent.findMany();
  if (agents.length < AGENTS.length) return ensureAgents(prisma);
  cache = Object.fromEntries(agents.map((a) => [a.key, a]));
  return cache;
}

export function resetAgentCache() {
  cache = undefined;
}
