import { formatBRL, normalizeKey, PRIORITY_LABELS } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';
import { ActivityService } from '../services/activityService.js';
import { EventEngine } from '../events/EventEngine.js';
import { getAgentMap } from '../services/agentRegistry.js';
import { buildSourceAdapters } from './sources/index.js';
import { OpportunityDiscoveryService } from './OpportunityDiscoveryService.js';
import { CompanyResearchService } from './CompanyResearchService.js';
import { SignalDetectionService } from './SignalDetectionService.js';
import { OpportunityScoringService } from './OpportunityScoringService.js';
import { SalesIntelligenceService } from './SalesIntelligenceService.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * AgentOrchestrator — runs one SearchJob through the pipeline:
 *
 *   DISCOVER (Radar) → RESEARCH → DETECT SIGNALS → SCORE → (score ≥ threshold)
 *   → CREATE OPPORTUNITY + APPROACH (Sales Intelligence) → ACTIVITY EVENTS
 *
 * Each stage is an AgentRun with start/end/status/errors/metrics. Every
 * activity event is persisted; nothing is emitted that did not happen.
 */
export class AgentOrchestrator {
  constructor({ prisma = getPrisma(), config = getConfig(), adapters, pacingMs, events } = {}) {
    this.prisma = prisma;
    this.events = events ?? new EventEngine({ prisma });
    this.config = config;
    this.adapters = adapters ?? buildSourceAdapters(config);
    this.discovery = new OpportunityDiscoveryService({ adapters: this.adapters });
    this.research = new CompanyResearchService({ adapters: this.adapters });
    this.signals = new SignalDetectionService();
    this.scoring = new OpportunityScoringService();
    this.sales = new SalesIntelligenceService();
    this.activity = new ActivityService({ prisma });
    // In demo mode the steps are paced so the live stream is readable.
    this.pacingMs = pacingMs ?? (config.demoMode && !config.isTest ? 900 : 0);
  }

  async #pace(factor = 1) {
    if (this.pacingMs) await sleep(this.pacingMs * factor * (0.6 + Math.random() * 0.8));
  }

  async #startRun(agentKey, job) {
    const agents = await getAgentMap(this.prisma);
    return this.prisma.agentRun.create({
      data: { agentId: agents[agentKey].id, companyId: job.companyId, jobId: job.id, status: 'RUNNING' },
    });
  }

  async #finishRun(run, { status = 'SUCCEEDED', error, metrics, metadata } = {}) {
    const finishedAt = new Date();
    return this.prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt,
        durationMs: finishedAt.getTime() - run.startedAt.getTime(),
        error: error ? String(error).slice(0, 1000) : null,
        metrics: metrics ?? undefined,
        metadata: metadata ?? undefined,
      },
    });
  }

  async #event(job, data) {
    const event = await this.activity.record({ companyId: job.companyId, jobId: job.id, isDemo: job.isDemo, ...data });
    await this.#pace(data.pace ?? 1);
    return event;
  }

  /** Execute one job. Returns stats persisted on the SearchJob. */
  async runJob(job) {
    const profile = await this.prisma.company.findUnique({ where: { id: job.companyId } });
    if (!profile) throw new Error('company not found');
    const sub = await this.prisma.subscription.findUnique({ where: { companyId: job.companyId } });
    if (sub?.status !== 'ACTIVE') {
      return { skipped: 'subscription_inactive', companiesAnalyzed: 0, signalsDetected: 0, opportunitiesCreated: 0 };
    }
    if (profile.agentsPaused) {
      return { skipped: 'agents_paused', companiesAnalyzed: 0, signalsDetected: 0, opportunitiesCreated: 0 };
    }
    // Area mode: the search belongs to the CNPJ area. A job for a PERSON account (queued by a payment,
    // a profile change or an old backlog) is skipped before anything is written or notified.
    if (this.config.areas?.enabled && profile.accountType !== 'COMPANY') {
      return { skipped: 'not_company', companiesAnalyzed: 0, signalsDetected: 0, opportunitiesCreated: 0 };
    }

    // Never run the demo pipeline when DEMO_MODE is off (and vice-versa).
    const isDemo = this.config.demoMode;
    job = { ...job, isDemo };
    const stats = { companiesAnalyzed: 0, signalsDetected: 0, opportunitiesCreated: 0 };

    if (!this.discovery.hasSources) {
      await this.#event(job, {
        type: 'SYSTEM',
        title: 'Nenhuma fonte de dados configurada',
        description: 'Configure SEARCH_API_KEY, NEWS_SOURCE_ENABLED ou outra fonte para que os agentes possam buscar oportunidades reais.',
        source: 'AgentOrchestrator',
        severity: 'WARNING',
      });
      return { ...stats, skipped: 'no_sources' };
    }

    // ------------------------------------------------------------ RADAR
    const radarRun = await this.#startRun('RADAR', job);
    let candidates;
    try {
      await this.#event(job, {
        agentKey: 'RADAR',
        type: 'SEARCH',
        title: 'Busca iniciada',
        description: `Fontes: ${this.discovery.adapters.map((a) => a.name).join(', ')}`,
        source: 'Agente Radar',
        metadata: { trigger: job.trigger, configVersion: profile.searchConfigVersion },
      });
      const result = await this.discovery.discover(profile, { limit: isDemo ? 6 : 15 });
      candidates = result.candidates;
      for (const err of result.errors) {
        await this.#event(job, {
          agentKey: 'RADAR',
          type: 'AGENT',
          title: `Fonte indisponível: ${err.adapter}`,
          description: 'A busca continuou com as demais fontes.',
          source: 'Agente Radar',
          severity: 'WARNING',
          pace: 0,
        });
      }
      await this.#event(job, {
        agentKey: 'RADAR',
        type: 'SEARCH',
        title: `Analisando ${candidates.length} empresas`,
        source: 'Agente Radar',
        metadata: { candidates: candidates.length },
      });
      await this.#finishRun(radarRun, {
        status: result.errors.length && !candidates.length ? 'FAILED' : 'SUCCEEDED',
        error: result.errors.length && !candidates.length ? result.errors.map((e) => `${e.adapter}: ${e.message}`).join('; ') : null,
        metrics: { candidates: candidates.length, sources: result.sources.length, errors: result.errors.length },
      });
    } catch (err) {
      await this.#finishRun(radarRun, { status: 'FAILED', error: err.message });
      throw err;
    }
    if (!candidates.length) return stats;

    // ---------------------------------------------- RESEARCH / SIGNAL / SCORING / SALES
    const researchRun = await this.#startRun('RESEARCH', job);
    const signalRun = await this.#startRun('SIGNAL', job);
    const scoringRun = await this.#startRun('SCORING', job);
    const salesRun = await this.#startRun('SALES', job);
    const m = { researched: 0, researchErrors: 0, signals: 0, scored: 0, qualified: 0, created: 0, duplicates: 0 };

    try {
      for (const candidate of candidates) {
        stats.companiesAnalyzed += 1;
        const label = candidate.name;

        // RESEARCH
        await this.#event(job, {
          agentKey: 'RADAR',
          type: 'SEARCH',
          title: 'Empresa encontrada',
          description: label,
          source: candidate.source?.type === 'DEMO' ? 'Fonte DEMO' : candidate.adapter,
          metadata: { company: label, city: candidate.city, state: candidate.state },
          pace: 0.6,
        });
        const research = await this.research.research(candidate);
        m.researched += 1;
        m.researchErrors += research.errors.length;
        if (research.websiteAnalyzed) {
          await this.#event(job, {
            agentKey: 'RESEARCH',
            type: 'RESEARCH',
            title: 'Website analisado',
            description: label,
            source: 'Agente de Pesquisa',
            metadata: { url: candidate.website },
          });
        }
        if (research.industry) {
          await this.#event(job, {
            agentKey: 'RESEARCH',
            type: 'RESEARCH',
            title: 'Perfil comercial identificado',
            description: `${label} · ${research.industry}${research.city ? ` · ${research.city}/${research.state || ''}` : ''}`,
            source: 'Agente de Pesquisa',
            pace: 0.6,
          });
        }
        if (research.contacts.length) {
          await this.#event(job, {
            agentKey: 'RESEARCH',
            type: 'RESEARCH',
            title: 'Contato comercial público identificado',
            description: label,
            source: 'Agente de Pesquisa',
            pace: 0.6,
          });
        }

        // SIGNALS
        const signals = this.signals.detect({ candidate, research });
        m.signals += signals.length;
        stats.signalsDetected += signals.length;
        for (const s of signals.slice(0, 2)) {
          await this.#event(job, {
            agentKey: 'SIGNAL',
            type: 'SIGNAL',
            title: s.title,
            description: `${label}: ${s.description}`,
            source: 'Agente de Sinais',
            severity: s.strength >= 0.8 ? 'SUCCESS' : 'INFO',
            metadata: { signalType: s.type, strength: s.strength },
          });
        }

        // SCORING
        const scored = this.scoring.score({ profile, candidate, research, signals });
        m.scored += 1;
        await this.#event(job, {
          agentKey: 'SCORING',
          type: 'AGENT',
          title: `Compatibilidade calculada: ${scored.score}%`,
          description: label,
          source: 'Agente de Pontuação',
          metadata: { score: scored.score, breakdown: scored.breakdown, disqualified: scored.disqualified },
          pace: 0.6,
        });

        const signalRows = signals.map((s) => ({
          companyId: job.companyId,
          targetCompanyName: label,
          type: s.type,
          title: s.title,
          description: s.description,
          strength: s.strength,
          sourceUrl: s.sourceUrl,
          isDemo,
        }));

        if (scored.disqualified || scored.score < this.config.search.scoreThreshold || !signals.length) {
          if (signalRows.length) await this.prisma.companySignal.createMany({ data: signalRows });
          continue;
        }
        m.qualified += 1;

        // SALES INTELLIGENCE + OPPORTUNITY
        const targetKey = normalizeKey(candidate.website || candidate.name);
        const exists = await this.prisma.opportunity.findUnique({
          where: { companyId_targetKey: { companyId: job.companyId, targetKey } },
          select: { id: true },
        });
        if (exists) {
          m.duplicates += 1;
          if (signalRows.length) {
            await this.prisma.companySignal.createMany({ data: signalRows.map((r) => ({ ...r, opportunityId: exists.id })) });
          }
          continue;
        }

        const top = signals[0];
        const approach = this.sales.buildApproach({
          profile,
          candidate: { name: label, industry: research.industry, city: research.city },
          signal: top,
          matchingServices: scored.matchingServices,
          estimate: scored.estimate,
        });

        const opportunity = await this.prisma.$transaction(async (tx) => {
          const opp = await tx.opportunity.create({
            data: {
              companyId: job.companyId,
              targetKey,
              targetCompanyName: label,
              targetWebsite: candidate.website || null,
              industry: research.industry,
              city: research.city,
              state: research.state,
              score: scored.score,
              confidence: scored.confidence,
              priority: scored.priority,
              signal: top.title,
              signalType: top.type,
              description: top.description,
              reasons: scored.reasons,
              matchingServices: scored.matchingServices,
              estimatedMinValue: scored.estimate.min,
              estimatedMaxValue: scored.estimate.max,
              suggestedApproach: approach,
              isDemo,
              metadata: { breakdown: scored.breakdown, jobId: job.id, configVersion: profile.searchConfigVersion },
            },
          });
          const seenUrls = new Set();
          const sources = research.sources.filter((s) => {
            const k = `${s.type}:${s.url || s.title}`;
            if (seenUrls.has(k)) return false;
            seenUrls.add(k);
            return true;
          });
          if (sources.length) {
            await tx.opportunitySource.createMany({
              data: sources.map((s) => ({
                opportunityId: opp.id,
                type: s.type,
                title: String(s.title || s.url || 'Fonte').slice(0, 300),
                url: s.url || null,
                snippet: s.snippet ? String(s.snippet).slice(0, 600) : null,
              })),
            });
          }
          if (research.contacts.length) {
            await tx.contact.createMany({
              data: research.contacts.slice(0, 3).map((c) => ({
                opportunityId: opp.id,
                name: c.name,
                role: c.role,
                companyPhone: c.companyPhone,
                businessEmail: c.businessEmail,
                linkedinUrl: c.linkedinUrl || null,
                publicSource: c.publicSource,
                verified: Boolean(c.verified),
              })),
            });
          }
          if (signalRows.length) {
            await tx.companySignal.createMany({ data: signalRows.map((r) => ({ ...r, opportunityId: opp.id })) });
          }
          return opp;
        });

        m.created += 1;
        stats.opportunitiesCreated += 1;
        const oppPayload = {
          score: scored.score,
          priority: scored.priority,
          estimatedMin: scored.estimate.min,
          estimatedMax: scored.estimate.max,
          link: `/app/opportunities/${opportunity.id}`,
        };
        await this.events.publish({
          type: 'OPPORTUNITY_CREATED',
          companyId: job.companyId,
          aggregateType: 'opportunity',
          aggregateId: opportunity.id,
          isDemo,
          payload: oppPayload,
          activity: {
            agentKey: 'SALES',
            type: 'OPPORTUNITY',
            opportunityId: opportunity.id,
            jobId: job.id,
            title: 'Oportunidade criada',
            description: `${label} · ${formatBRL(scored.estimate.min)} – ${formatBRL(scored.estimate.max)}`,
            source: 'Inteligência Comercial',
            severity: 'SUCCESS',
            metadata: { score: scored.score, estimatedMax: scored.estimate.max, priority: scored.priority },
          },
        });
        await this.#pace();
        if (scored.priority === 'HIGH') {
          await this.events.publish({
            type: 'OPPORTUNITY_HIGH_PRIORITY',
            companyId: job.companyId,
            aggregateType: 'opportunity',
            aggregateId: opportunity.id,
            isDemo,
            payload: oppPayload,
            activity: {
              agentKey: 'SCORING',
              type: 'OPPORTUNITY',
              opportunityId: opportunity.id,
              jobId: job.id,
              title: `Lead classificado como ${PRIORITY_LABELS.HIGH.toLowerCase()} prioridade`,
              description: label,
              source: 'Agente de Pontuação',
              severity: 'SUCCESS',
            },
          });
          await this.#pace(0.6);
        }
        await this.#event(job, {
          agentKey: 'SALES',
          type: 'OPPORTUNITY',
          opportunityId: opportunity.id,
          title: 'Abordagem comercial sugerida',
          description: label,
          source: 'Inteligência Comercial',
          pace: 0.6,
        });
      }

      await this.#finishRun(researchRun, { metrics: { researched: m.researched, errors: m.researchErrors } });
      await this.#finishRun(signalRun, { metrics: { signals: m.signals } });
      await this.#finishRun(scoringRun, { metrics: { scored: m.scored, qualified: m.qualified } });
      await this.#finishRun(salesRun, { metrics: { created: m.created, duplicates: m.duplicates } });
    } catch (err) {
      logger.error('pipeline failed', { jobId: job.id, err });
      for (const run of [researchRun, signalRun, scoringRun, salesRun]) {
        await this.#finishRun(run, { status: 'FAILED', error: err.message, metrics: m }).catch(() => {});
      }
      throw err;
    }

    await this.#event(job, {
      type: 'SYSTEM',
      title: 'Ciclo de busca concluído',
      description: `${stats.companiesAnalyzed} empresas analisadas · ${stats.signalsDetected} sinais · ${stats.opportunitiesCreated} novas oportunidades`,
      source: 'AgentOrchestrator',
      severity: stats.opportunitiesCreated ? 'SUCCESS' : 'INFO',
      metadata: stats,
      pace: 0,
    });
    return stats;
  }
}
