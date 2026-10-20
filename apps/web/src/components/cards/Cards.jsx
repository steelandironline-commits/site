import { useEffect, useRef } from 'react';
import { KIND_STYLE, eventKind } from '../../lib/eventKind.js';
import { Link } from 'react-router-dom';
import { animate, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  Globe,
  MapPin,
  MessageSquareText,
  PhoneCall,
  QrCode,
  Radar,
  Server,
  Target,
  Zap,
} from 'lucide-react';
import {
  formatBRL,
  formatCents,
  formatCnpj,
  formatNumber,
  formatRange,
  OPPORTUNITY_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  SIGNAL_TYPE_LABELS,
} from '@autopix/shared';
import { BRLSymbol, BRLText, Badge, Button, DemoBadge, ScoreRing, Skeleton, cx } from '@autopix/ui';
import { fmtDate, fmtDateTime, fmtTime, formatDuration, relative } from '../../lib/time.js';
import s from './cards.module.css';

/* ---------------------------------------------------------- count up */
export function CountUp({ value = 0, format = formatNumber }) {
  const ref = useRef(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();
  const currency = /^\s*R\$/.test(format(0));
  const display = (amount) => {
    const text = format(amount);
    return currency ? text.replace(/^\s*R\$/, '') : text;
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (reduce) {
      el.textContent = display(value);
      prev.current = value;
      return undefined;
    }
    const controls = animate(prev.current, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = display(Math.round(v));
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, format, reduce]);
  return (
    <>
      {currency && <BRLSymbol />}
      <span ref={ref}>{display(0)}</span>
    </>
  );
}

/* ---------------------------------------------------------- MetricCard */
export function MetricCard({ label, value, format, hint, icon: Icon, tone = 'default', loading, index = 0 }) {
  return (
    <motion.article
      className={cx(s.metric, s[`metric-${tone}`])}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className={s.metricHead}>
        <span className="eyebrow"><BRLText>{label}</BRLText></span>
        {Icon && <Icon size={15} aria-hidden="true" className={s.metricIcon} />}
      </header>
      <p className={cx(s.metricValue, 'num')}>{loading ? <Skeleton w="60%" h={30} /> : <CountUp value={value} format={format} />}</p>
      {hint && <p className={s.metricHint}><BRLText>{hint}</BRLText></p>}
    </motion.article>
  );
}

/* --------------------------------------------------------- shared bits */
export const STATUS_TONE = {
  NEW: 'primary',
  RESEARCHING: 'info',
  CONTACTED: 'info',
  INTERESTED: 'revenue',
  PROPOSAL: 'amber',
  WON: 'revenue',
  LOST: 'danger',
  ARCHIVED: 'neutral',
};
export const PRIORITY_TONE = { HIGH: 'primary', MEDIUM: 'revenue', LOW: 'neutral' };

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status]}>{OPPORTUNITY_STATUS_LABELS[status] || status}</Badge>;
}

export function PriorityBadge({ priority }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} dot>
      {PRIORITY_LABELS[priority]} prioridade
    </Badge>
  );
}

const SOURCE_LABELS = { DEMO: 'Fonte DEMO', SEARCH: 'Busca web', WEBSITE: 'Website', NEWS: 'Notícias', PUBLIC_REGISTRY: 'Cadastro público' };

/* ---------------------------------------------------- OpportunityCard */
export function OpportunityCard({ opportunity: o, onApproach, onContact, busy, layout = 'card', index = 0 }) {
  const location = [o.city, o.state].filter(Boolean).join(' / ');
  const source = o.sources?.[0];
  return (
    <motion.article
      layout
      className={cx(s.opp, layout === 'row' && s.oppRow, o.priority === 'HIGH' && s.oppHigh)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={s.oppMain}>
        <header className={s.oppHead}>
          <div className={s.oppTitleWrap}>
            <div className={s.oppBadges}>
              <PriorityBadge priority={o.priority} />
              <StatusBadge status={o.status} />
              {o.isDemo && <DemoBadge />}
            </div>
            <h3 className={s.oppTitle}>
              <Link to={`/app/opportunities/${o.id}`}>{o.targetCompanyName}</Link>
            </h3>
            <p className={s.oppMeta}>
              {o.industry && (
                <span>
                  <Building2 size={13} aria-hidden="true" /> {o.industry}
                </span>
              )}
              {location && (
                <span>
                  <MapPin size={13} aria-hidden="true" /> {location}
                </span>
              )}
            </p>
          </div>
          <ScoreRing score={o.score} size={layout === 'row' ? 48 : 54} />
        </header>

        <div className={s.oppSignal}>
          <span className="eyebrow">Sinal</span>
            <p><BRLText>{o.signal}</BRLText></p>
        </div>

        <dl className={s.oppFacts}>
          <div>
            <dt>Potencial</dt>
            <dd className={cx(s.revenue, 'num')}><BRLText>{formatRange(o.estimatedMinValue, o.estimatedMaxValue)}</BRLText></dd>
          </div>
          <div>
            <dt>Fonte</dt>
            <dd>{source ? SOURCE_LABELS[source.type] || source.type : '—'}</dd>
          </div>
          <div>
            <dt>Detectada</dt>
            <dd title={fmtDateTime(o.createdAt)}>{relative(o.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <footer className={s.oppActions}>
        <Button to={`/app/opportunities/${o.id}`} size="sm" variant="secondary" icon={ArrowUpRight}>
          Analisar
        </Button>
        <Button size="sm" variant="ghost" icon={MessageSquareText} onClick={() => onApproach?.(o)} loading={busy === 'approach'}>
          Gerar abordagem
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={o.status === 'CONTACTED' ? CheckCircle2 : PhoneCall}
          onClick={() => onContact?.(o)}
          loading={busy === 'contact'}
          disabled={o.status === 'CONTACTED'}
        >
          {o.status === 'CONTACTED' ? 'Em contato' : 'Marcar contato'}
        </Button>
      </footer>
    </motion.article>
  );
}

/* ---------------------------------------------------------- AgentCard */
const AGENT_STATUS = {
  ACTIVE: { tone: 'primary', label: 'Ativo' },
  RUNNING: { tone: 'revenue', label: 'Executando' },
  IDLE: { tone: 'neutral', label: 'Ocioso' },
  ERROR: { tone: 'danger', label: 'Erro' },
  PAUSED: { tone: 'amber', label: 'Pausado' },
};
const AGENT_ICON = { RADAR: Radar, RESEARCH: Globe, SIGNAL: Zap, SCORING: Target, SALES: MessageSquareText };

export function AgentCard({ agent, index = 0 }) {
  const st = AGENT_STATUS[agent.status] || AGENT_STATUS.IDLE;
  const Icon = AGENT_ICON[agent.key] || Cpu;
  return (
    <motion.article
      className={cx(s.agent, agent.status === 'RUNNING' && s.agentRunning, agent.status === 'ERROR' && s.agentError)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <header className={s.agentHead}>
        <span className={s.agentIcon}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <Badge tone={st.tone} dot pulse={agent.status === 'RUNNING' || agent.status === 'ACTIVE'}>
          {st.label}
        </Badge>
      </header>
      <h3 className={s.agentTitle}><BRLText>{agent.title}</BRLText></h3>
      <p className={s.agentDesc}><BRLText>{agent.description}</BRLText></p>
      <dl className={s.agentStats}>
        <div>
          <dt>Última execução</dt>
          <dd>{agent.lastRunAt ? relative(agent.lastRunAt) : '—'}</dd>
        </div>
        <div>
          <dt>Jobs hoje</dt>
          <dd className="num">{agent.jobsToday}</dd>
        </div>
        <div>
          <dt>Eventos</dt>
          <dd className="num">{agent.eventsToday}</dd>
        </div>
        <div>
          <dt>Erros</dt>
          <dd className={cx('num', agent.errorsToday > 0 && s.danger)}>{agent.errorsToday}</dd>
        </div>
        <div className={s.agentWide}>
          <dt>Duração média</dt>
          <dd className="num">{formatDuration(agent.avgDurationMs)}</dd>
        </div>
      </dl>
      {agent.lastError && <p className={s.agentErr}><BRLText>{agent.lastError}</BRLText></p>}
    </motion.article>
  );
}

/* ------------------------------------------------------- ActivityCard */
export const ACTIVITY_ICON = { SEARCH: Radar, RESEARCH: Globe, SIGNAL: Zap, OPPORTUNITY: Target, AGENT: Cpu, SYSTEM: Server, PAYMENT: QrCode };

export function ActivityCard({ event: e, compact = false }) {
  const kind = eventKind(e);
  const Icon = kind ? KIND_STYLE[kind].Icon : ACTIVITY_ICON[e.type] || Server;
  const agentName = e.agent?.name || e.source;
  const content = (
    <>
      <time className={cx(s.actTime, 'mono')} dateTime={e.createdAt}>
        {fmtTime(e.createdAt)}
      </time>
      <span
        className={cx(s.actIcon, s[`sev-${e.severity}`])}
        style={kind ? { color: KIND_STYLE[kind].color, borderColor: `${KIND_STYLE[kind].color}66`, background: `${KIND_STYLE[kind].color}1f` } : undefined}
        aria-hidden="true"
      >
        <Icon size={14} />
      </span>
      <div className={s.actBody}>
        <p className={s.actTitle}>
          <BRLText>{e.title}</BRLText>
          {e.isDemo && <DemoBadge className={s.actDemo} />}
        </p>
        {!compact && e.description && <p className={s.actDesc}><BRLText>{e.description}</BRLText></p>}
        {agentName && <p className={s.actSource}><BRLText>{agentName}</BRLText></p>}
      </div>
    </>
  );
  if (e.opportunityId) {
    return (
      <Link to={`/app/opportunities/${e.opportunityId}`} className={cx(s.act, s.actLink, compact && s.actCompact)}>
        {content}
      </Link>
    );
  }
  return <div className={cx(s.act, compact && s.actCompact)}>{content}</div>;
}

/* ---------------------------------------------------------- SignalCard */
export function SignalCard({ signal }) {
  return (
    <article className={s.signal}>
      <header>
        <Badge tone="primary">{SIGNAL_TYPE_LABELS[signal.type] || signal.type}</Badge>
        <span className={cx(s.signalStrength, 'mono')}>{Math.round(signal.strength * 100)}%</span>
      </header>
      <h4><BRLText>{signal.title}</BRLText></h4>
      {signal.description && <p><BRLText>{signal.description}</BRLText></p>}
      <div className={s.strengthBar} aria-hidden="true">
        <motion.span initial={{ width: 0 }} animate={{ width: `${signal.strength * 100}%` }} transition={{ duration: 0.8 }} />
      </div>
      <footer>
        <Clock size={12} aria-hidden="true" /> {fmtDateTime(signal.detectedAt)}
        {signal.isDemo && <DemoBadge />}
      </footer>
    </article>
  );
}

/* --------------------------------------------------------- PaymentCard */
export function PaymentCard({ payment }) {
  const tone = { CONFIRMED: 'revenue', PENDING: 'amber', FAILED: 'danger', EXPIRED: 'neutral', REFUNDED: 'info', CANCELED: 'neutral' }[payment.status];
  return (
    <article className={s.payment}>
      <span className={s.paymentIcon} aria-hidden="true">
        <QrCode size={16} />
      </span>
      <div className={s.paymentBody}>
        <p className={cx(s.paymentAmount, 'num')}><BRLText>{formatCents(payment.amountCents)}</BRLText></p>
        <p className={s.paymentMeta}>
          Pix · {payment.provider} · {fmtDate(payment.paidAt || payment.createdAt)}
        </p>
      </div>
      <Badge tone={tone}>{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
    </article>
  );
}

/* --------------------------------------------------------- CompanyCard */
export function CompanyCard({ company, footer }) {
  return (
    <article className={s.company}>
      <header>
        <span className={s.companyAvatar} aria-hidden="true">
          {company.name?.slice(0, 2).toUpperCase()}
        </span>
        <div>
            <h3><BRLText>{company.name}</BRLText></h3>
          <p className="mono">{company.cnpj ? formatCnpj(company.cnpj) : 'CNPJ não informado'}</p>
        </div>
      </header>
      <dl>
        <div>
          <dt>Região</dt>
          <dd><BRLText>{[company.city, company.state].filter(Boolean).join(' / ') || '—'}</BRLText></dd>
        </div>
        <div>
          <dt>Ticket médio</dt>
          <dd className="num"><BRLText>{formatBRL(company.averageTicket)}</BRLText></dd>
        </div>
        <div>
          <dt>Raio</dt>
          <dd className="num">{company.serviceRadiusKm ? `${company.serviceRadiusKm} km` : '—'}</dd>
        </div>
        <div>
          <dt>Config. de busca</dt>
          <dd className="mono">v{company.searchConfigVersion}</dd>
        </div>
      </dl>
      {company.services?.length > 0 && (
        <ul className={s.chips} aria-label="Serviços cadastrados">
          {company.services.slice(0, 6).map((x) => (
            <li key={x}><BRLText>{x}</BRLText></li>
          ))}
        </ul>
      )}
      {footer}
    </article>
  );
}
