import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Building2, ChevronDown, ChevronUp, Clock, ExternalLink, Info, Mail, MapPin, MessageCircle, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { jobAreaName } from '@autopix/shared';
import { BRLText, Badge, Button, EmptyState, ErrorState, Field, Input, Select, SkeletonCard, get, useApi, useBrand, useDebounced, useVisibleInterval } from '@autopix/ui';
import { relative } from '../../lib/time.js';
import { VAGAS } from './copy.js';
import s from '../../pages/app/app.module.css';
import v from './vagas.module.css';

// "Vagas": as vagas da área de atuação da pessoa (GET /api/jobs), no estilo da lista de Oportunidades do CNPJ.
// Cada cartão mostra o cargo completo, o contratante, o local, o salário, há quanto tempo foi publicada, o prazo
// (só quando a fonte informa), o contato, o sinal de confiança com os motivos e a descrição, que abre ao pedido.

const PAGE_SIZE = 20;
const TONE = { BOM: 'revenue', VERIFIQUE: 'amber', ATENCAO: 'danger' };

/** Links vêm da API, mas a tela só liga o que tem a forma esperada: nada de javascript: nem data:. */
const safeWhatsapp = (url) => (typeof url === 'string' && /^https:\/\/wa\.me\/55\d{10,11}(\?[^\s]*)?$/.test(url) ? url : null);
const safeMailto = (url) => (typeof url === 'string' && /^mailto:[^\s@]+@[^\s@]+(\?[^\s]*)?$/.test(url) ? url : null);
const safeHttp = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
};

const sign = (delta) => (delta > 0 ? `+${delta}` : `${delta}`);

function ScoreBlock({ score }) {
  const tone = TONE[score.level] ?? 'amber';
  const Icon = score.level === 'ATENCAO' ? TriangleAlert : Info;
  return (
    <div className={v.score}>
      <div className={v.scoreHead}>
        <Badge tone={tone}>
          <Icon size={12} aria-hidden="true" /> {score.label}
        </Badge>
        <span className={v.scoreValue}>{score.value}/100</span>
      </div>
      {score.reasons?.length > 0 && (
        <ul className={v.reasons} aria-label="Motivos do sinal de confiança">
          {score.reasons.map((reason) => (
            <li key={reason.code}>
              <span className={`${v.delta} ${reason.delta > 0 ? v.deltaUp : v.deltaDown}`}>{sign(reason.delta)}</span>
              <span>{reason.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={v.scoreNote}>{VAGAS.scoreNote}</p>
    </div>
  );
}

function ContactButtons({ item }) {
  const whatsapp = item.contact?.whatsapp && safeWhatsapp(item.contact.whatsapp.url);
  const email = item.contact?.email && safeMailto(item.contact.email.url);
  const buttons = (item.contact?.order ?? ['WHATSAPP', 'EMAIL'])
    .map((kind) => {
      if (kind === 'WHATSAPP' && whatsapp) {
        return { key: 'WHATSAPP', href: whatsapp, icon: MessageCircle, label: 'WhatsApp', aria: `Chamar no WhatsApp${item.contact.whatsapp.display ? `: ${item.contact.whatsapp.display}` : ''}` };
      }
      if (kind === 'EMAIL' && email) return { key: 'EMAIL', href: email, icon: Mail, label: 'E-mail', aria: `Enviar e-mail para ${item.contact.email.address}` };
      return null;
    })
    .filter(Boolean);
  if (buttons.length === 0) return <p className={v.noContact}>{VAGAS.noContact}</p>;
  return (
    <div className={v.actions}>
      {buttons.map((b, i) => (
        <Button key={b.key} as="a" href={b.href} target="_blank" rel="noopener noreferrer" variant={i === 0 ? 'primary' : 'secondary'} size="sm" icon={b.icon} aria-label={b.aria}>
          {b.label}
        </Button>
      ))}
    </div>
  );
}

/** Um cartão de vaga. A descrição completa vem do detalhe, só quando a pessoa pede e o trecho não basta. */
export function JobCard({ item }) {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const place = [item.city, item.state].filter(Boolean).join(' / ');
  const text = item.description ?? full ?? item.excerpt ?? '';
  const sourceUrl = safeHttp(item.sourceUrl);
  const soon = item.deadlineDays !== null && item.deadlineDays !== undefined && item.deadlineDays <= 3;
  const hasDeadline = item.deadlineDays !== null && item.deadlineDays !== undefined;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && item.descriptionTruncated && full === null && !item.description) {
      setLoading(true);
      setFailed(false);
      try {
        const res = await get(`/api/jobs/${encodeURIComponent(item.id)}`);
        setFull(res.item.description ?? '');
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <article className={v.card} data-source={item.source}>
      <header className={v.cardHead}>
        <h2 className={v.title}>{item.title}</h2>
        <span className={v.areaChip}>{item.area?.name}</span>
      </header>

      <p className={v.employer}>
        <Building2 size={15} aria-hidden="true" /> {item.company || VAGAS.unknownEmployer}
      </p>

      <dl className={v.meta}>
        <div>
          <dt className="sr-only">Local</dt>
          <dd>
            <MapPin size={14} aria-hidden="true" /> {place || VAGAS.unknownPlace}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Salário</dt>
          <dd className={item.salary ? v.salary : v.salaryNone}>
            <BRLText>{item.salaryLabel}</BRLText>
          </dd>
        </div>
      </dl>

      <ul className={v.times} aria-label="Datas da vaga">
        <li className={v.time}>
          <Clock size={14} aria-hidden="true" /> {item.postedLabel}
        </li>
        <li className={`${v.time} ${hasDeadline ? (soon ? v.timeSoon : '') : v.timeUnknown}`}>
          <Clock size={14} aria-hidden="true" /> {item.deadlineLabel}
        </li>
      </ul>

      <ScoreBlock score={item.score} />

      <ContactButtons item={item} />

      <div id={bodyId}>
        {text && <p className={v.description}>{open || !item.descriptionTruncated ? text : item.excerpt}</p>}
        {loading && <p className={v.noContact}>Carregando a descrição…</p>}
        {failed && <p className={v.noContact}>Não foi possível abrir a descrição completa. Use o link da fonte.</p>}
      </div>

      <footer className={v.cardFoot}>
        {item.descriptionTruncated ? (
          <button type="button" className={v.toggle} onClick={toggle} aria-expanded={open} aria-controls={bodyId}>
            {open ? VAGAS.seeLess : VAGAS.seeFull} {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
        ) : (
          <span />
        )}
        <span className={v.sourceName}>
          Fonte: {item.sourceName}
          {sourceUrl && (
            <>
              {' · '}
              <a className={v.link} href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                {VAGAS.seeSource} <ExternalLink size={13} aria-hidden="true" />
              </a>
            </>
          )}
        </span>
      </footer>
    </article>
  );
}

/** O texto da lista vazia: busca sem resultado, fonte não ligada, primeira busca em andamento ou área sem vagas. */
function emptyCopy({ searching, source }) {
  if (searching) return VAGAS.emptySearch;
  if (!source?.configured && !source?.demo) return VAGAS.notConfigured;
  if (!source?.lastSuccessAt) return VAGAS.waiting;
  return VAGAS.empty;
}

/** A tela, com os dados já carregados. Separada de `Vagas` para a leitura da lista e dos avisos ficar à vista. */
export function VagasView({ data, error, loading, items, onReload, onMore, moreLoading, filters, setFilter }) {
  const profile = data?.profile;
  const source = data?.source;
  const demo = items.some((item) => item.source === 'DEMO');
  const searching = Boolean(filters.q.trim() || filters.area);

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>{VAGAS.title}</h1>
          <p className={s.pageSub}>{VAGAS.subtitle}</p>
        </div>
      </header>

      {profile?.needsArea && (
        <div className={`${v.band} ${v.bandWarn}`} role="note">
          <TriangleAlert size={18} aria-hidden="true" />
          <div>
            <strong>{VAGAS.needsArea.title}</strong>
            {VAGAS.needsArea.message}{' '}
            <Link to="/app/perfil" className={v.bandLink}>
              {VAGAS.needsArea.link}
            </Link>
          </div>
        </div>
      )}

      {demo && (
        <div className={`${v.band} ${v.bandDemo}`} role="note">
          <Info size={18} aria-hidden="true" />
          <div>
            <strong>{VAGAS.demo.title}</strong>
            {VAGAS.demo.message}
          </div>
        </div>
      )}

      <section className={v.filters} aria-label="Filtros">
        <label className={s.search}>
          <span className="sr-only">{VAGAS.searchLabel}</span>
          <Search size={15} aria-hidden="true" />
          <Input type="search" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder={VAGAS.searchPlaceholder} maxLength={80} />
        </label>
        <Field label={VAGAS.areaLabel}>
          {(a) => (
            <Select {...a} value={filters.area} onChange={(e) => setFilter('area', e.target.value)}>
              <option value="">{VAGAS.areaAll}</option>
              {profile?.workArea && <option value={profile.workArea}>{profile.workAreaName}</option>}
              {profile?.workArea !== 'logistica' && <option value="logistica">{jobAreaName('logistica')}</option>}
            </Select>
          )}
        </Field>
      </section>

      <p className={v.syncLine} role="status">
        <span>
          {data ? (
            <>
              <strong>{items.length}</strong> {items.length === 1 ? 'vaga' : 'vagas'}
              {data.nextCursor ? ' ou mais' : ''}
              {source?.lastSuccessAt ? ` · atualizado ${relative(source.lastSuccessAt)}` : ''}
            </>
          ) : (
            'Carregando…'
          )}
        </span>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onReload} loading={loading && !!data}>
          Atualizar
        </Button>
      </p>

      {error && !data ? (
        <ErrorState title={VAGAS.loadError} message={error.message} onRetry={onReload} />
      ) : !data ? (
        <div className={v.list}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState visual={<Briefcase size={28} aria-hidden="true" />} title={emptyCopy({ searching, source }).title} message={emptyCopy({ searching, source }).message} />
      ) : (
        <>
          <div className={v.list}>
            {items.map((item) => (
              <JobCard key={item.id} item={item} />
            ))}
          </div>
          {data.nextCursor && (
            <div className={v.more}>
              <Button variant="secondary" onClick={onMore} loading={moreLoading}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function Vagas() {
  const { name } = useBrand();
  const [filters, setFilters] = useState({ q: '', area: '' });
  const q = useDebounced(filters.q, 400).trim();
  const [extra, setExtra] = useState({ base: null, items: [], nextCursor: null });
  const [moreLoading, setMoreLoading] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (q) p.set('q', q.slice(0, 80));
    if (filters.area) p.set('area', filters.area);
    return `/api/jobs?${p}`;
  }, [q, filters.area]);

  const { data, error, loading, reload } = useApi(query);

  useEffect(() => {
    document.title = `${VAGAS.title} — ${name}`;
  }, [name]);

  // As páginas seguintes valem enquanto a primeira não for recarregada: nova busca ou atualização as descarta.
  const loadedMore = extra.base === data && data !== null;
  const items = useMemo(() => (data ? [...data.items, ...(loadedMore ? extra.items : [])] : []), [data, extra, loadedMore]);
  const nextCursor = loadedMore && extra.items.length > 0 ? extra.nextCursor : data?.nextCursor ?? null;

  // A lista se mantém fresca enquanto a página está aberta (o worker sincroniza as fontes a cada hora).
  useVisibleInterval(() => !loadedMore && reload(), 120_000, true);

  const onMore = async () => {
    if (!nextCursor) return;
    setMoreLoading(true);
    try {
      const res = await get(`${query}&cursor=${encodeURIComponent(nextCursor)}`);
      setExtra({ base: data, items: [...(loadedMore ? extra.items : []), ...res.items], nextCursor: res.nextCursor });
    } catch {
      /* o botão continua: a pessoa tenta de novo */
    } finally {
      setMoreLoading(false);
    }
  };

  return (
    <VagasView
      data={data ? { ...data, nextCursor } : data}
      error={error}
      loading={loading}
      items={items}
      onReload={reload}
      onMore={onMore}
      moreLoading={moreLoading}
      filters={filters}
      setFilter={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
    />
  );
}
