import { tenderStatus } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { logger } from '../logger.js';
import { PncpClient, toTender } from './pncpClient.js';

const SYNC_KEY = 'pncp-open';
const DAY = 24 * 60 * 60 * 1000;
const SELECT = {
  id: true,
  agencyName: true,
  sphere: true,
  unitName: true,
  city: true,
  state: true,
  object: true,
  modality: true,
  disputeMode: true,
  situationId: true,
  situationName: true,
  estimatedCents: true,
  proposalOpensAt: true,
  proposalClosesAt: true,
  publishedAt: true,
  url: true,
  leftOpenListAt: true,
};

/**
 * Licitações for companies: open public procurement notices from the PNCP,
 * kept in our database by the worker and listed with their current situation.
 */
export class TenderService {
  constructor({ prisma = getPrisma(), client = new PncpClient(), now = () => new Date() } = {}) {
    this.prisma = prisma;
    this.client = client;
    this.now = now;
  }

  // ------------------------------------------------------------------ sync

  /** Takes the sync lease; only one process sweeps at a time (web with embedded worker + worker). */
  async #claim(leaseMs) {
    const now = this.now();
    await this.prisma.syncState.upsert({ where: { key: SYNC_KEY }, update: {}, create: { key: SYNC_KEY } });
    const got = await this.prisma.syncState.updateMany({
      where: { key: SYNC_KEY, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseUntil: new Date(now.getTime() + leaseMs), lastStartedAt: now },
    });
    return got.count === 1;
  }

  /**
   * Sweeps every page of open notices and upserts them. Notices that left the open
   * list before their deadline are marked (suspended, revoked…), never deleted.
   */
  async syncOpen({ maxPages = 2000, delayMs = 1500, leaseMs = 60 * 60 * 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    if (!(await this.#claim(leaseMs))) return { skipped: 'running elsewhere' };
    // A sweep cut short (rate limit, restart) resumes where it stopped, within 6 hours.
    const prev = (await this.prisma.syncState.findUnique({ where: { key: SYNC_KEY } }))?.stats || {};
    const resume = prev.cursorPage > 1 && prev.sweepStartedAt && this.now().getTime() - new Date(prev.sweepStartedAt).getTime() < 6 * 60 * 60 * 1000;
    const started = resume ? new Date(prev.sweepStartedAt) : this.now();
    const firstPage = resume ? prev.cursorPage : 1;
    let pages = 0;
    let upserted = 0;
    let total = 0;
    let complete = false;
    let page = firstPage;
    try {
      for (; page < firstPage + maxPages; page++) {
        const { items, totalPages, total: t } = await this.client.openPage(page);
        total = t;
        pages++;
        upserted += await this.#upsert(items, started);
        if (page >= totalPages || !items.length) {
          complete = true;
          break;
        }
        if (delayMs) await sleep(delayMs);
      }
      // Only a complete sweep can tell what is no longer listed as open.
      const unlisted = complete
        ? await this.prisma.publicTender.updateMany({
            where: { source: 'pncp', lastSeenAt: { lt: started }, leftOpenListAt: null, proposalClosesAt: { gt: this.now() } },
            data: { leftOpenListAt: this.now() },
          })
        : { count: 0 };
      const stats = complete
        ? { pages, upserted, total, complete, resumedFrom: resume ? firstPage : null, unlisted: unlisted.count, ms: this.now().getTime() - started.getTime() }
        : { pages, upserted, total, complete, cursorPage: page, sweepStartedAt: started.toISOString() };
      await this.prisma.syncState.update({ where: { key: SYNC_KEY }, data: { leaseUntil: null, lastSuccessAt: this.now(), lastError: null, stats } });
      logger.info('tenders synced', stats);
      return stats;
    } catch (err) {
      await this.prisma.syncState
        .update({ where: { key: SYNC_KEY }, data: { leaseUntil: null, lastError: String(err.message).slice(0, 200), stats: { pages, upserted, total, cursorPage: page, sweepStartedAt: started.toISOString() } } })
        .catch(() => null);
      logger.warn('tenders sync paused, will resume', { pages, upserted, nextPage: page, error: err.message });
      return { error: err.message, pages, upserted, nextPage: page };
    }
  }

  async #upsert(items, seenAt) {
    let n = 0;
    const rows = items.filter((i) => i?.numeroControlePNCP).map(toTender);
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.publicTender.upsert({
          where: { externalId: row.externalId },
          create: { ...row, lastSeenAt: seenAt },
          update: { ...row, lastSeenAt: seenAt, leftOpenListAt: null },
        }),
      ),
    );
    n += rows.length;
    return n;
  }

  // ------------------------------------------------------------------ read

  #where({ state, city, q, modality, status = 'open' }) {
    const now = this.now();
    const and = [{ source: 'pncp' }];
    if (state) and.push({ state: String(state).toUpperCase() });
    if (city) and.push({ city: { equals: city, mode: 'insensitive' } });
    if (modality) and.push({ modality: { equals: modality, mode: 'insensitive' } });
    if (q) {
      for (const word of String(q).trim().split(/\s+/).filter((w) => w.length >= 2).slice(0, 6)) {
        and.push({ OR: [{ object: { contains: word, mode: 'insensitive' } }, { agencyName: { contains: word, mode: 'insensitive' } }] });
      }
    }
    const valid = { OR: [{ situationId: null }, { situationId: { notIn: [2, 3, 4] } }] };
    const openNow = [valid, { leftOpenListAt: null }, { OR: [{ proposalClosesAt: null }, { proposalClosesAt: { gt: now } }] }, { OR: [{ proposalOpensAt: null }, { proposalOpensAt: { lte: now } }] }];
    if (status === 'open') and.push(...openNow);
    if (status === 'closing') and.push(...openNow, { proposalClosesAt: { lte: new Date(now.getTime() + 3 * DAY) } });
    if (status === 'soon') and.push(valid, { leftOpenListAt: null }, { proposalOpensAt: { gt: now } });
    return { AND: and };
  }

  async list({ state, city, q, modality, status = 'open', page = 1, pageSize = 20 } = {}) {
    const where = this.#where({ state, city, q, modality, status });
    const orderBy = status === 'all' ? [{ publishedAt: 'desc' }] : [{ proposalClosesAt: { sort: 'asc', nulls: 'last' } }, { publishedAt: 'desc' }];
    const [rows, total, sync] = await Promise.all([
      this.prisma.publicTender.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: SELECT }),
      this.prisma.publicTender.count({ where }),
      this.prisma.syncState.findUnique({ where: { key: SYNC_KEY } }),
    ]);
    const now = this.now();
    return {
      items: rows.map((t) => ({ ...t, estimatedCents: t.estimatedCents == null ? null : Number(t.estimatedCents), status: tenderStatus(t, now) })),
      total,
      page,
      pageSize,
      sync: { lastSuccessAt: sync?.lastSuccessAt ?? null, running: Boolean(sync?.leaseUntil && sync.leaseUntil > now), source: 'PNCP — Portal Nacional de Contratações Públicas' },
    };
  }

  /** Cities with open notices in a state (for the filter), most notices first. */
  async cities(state) {
    if (!state) return [];
    const rows = await this.prisma.publicTender.groupBy({
      by: ['city'],
      where: this.#where({ state, status: 'open' }),
      _count: { _all: true },
      orderBy: { _count: { city: 'desc' } },
      take: 300,
    });
    return rows.filter((r) => r.city).map((r) => ({ city: r.city, count: r._count._all }));
  }
}
