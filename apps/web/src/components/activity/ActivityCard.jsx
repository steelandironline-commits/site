import { Link } from 'react-router-dom';
import { Cpu, Globe, QrCode, Radar, Server, Target, Zap } from 'lucide-react';
import { BRLText, DemoBadge, cx } from '@autopix/ui';
import { KIND_STYLE, eventKind } from '../../lib/eventKind.js';
import { fmtTime } from '../../lib/time.js';
import s from '../cards/cards.module.css';

export const ACTIVITY_ICON = { SEARCH: Radar, RESEARCH: Globe, SIGNAL: Zap, OPPORTUNITY: Target, AGENT: Cpu, SYSTEM: Server, PAYMENT: QrCode };

/**
 * One event of the activity feed. `eventLink(event)` gives the page the event opens, or nothing: the
 * pages an event can lead to belong to the area (the entry passes them in), not to this card.
 */
export function ActivityCard({ event: e, compact = false, eventLink }) {
  const kind = eventKind(e);
  const Icon = kind ? KIND_STYLE[kind].Icon : ACTIVITY_ICON[e.type] || Server;
  const agentName = e.agent?.name || e.source;
  const to = eventLink?.(e);
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
  if (to) {
    return (
      <Link to={to} className={cx(s.act, s.actLink, compact && s.actCompact)}>
        {content}
      </Link>
    );
  }
  return <div className={cx(s.act, compact && s.actCompact)}>{content}</div>;
}
