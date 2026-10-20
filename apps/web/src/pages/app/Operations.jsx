/* Perfil operacional: capabilities, completeness and per-module editing. */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Save } from 'lucide-react';
import {
  DOCUMENTS_FIELD,
  OPERATION_START,
  capabilitySummary,
  getPath,
  groupLabel,
  modulesFor,
  normalizeOperationalProfile,
  operationalProfileSchema,
  profileCompleteness,
} from '@autopix/shared';
import { Button, ErrorState, SkeletonCard, useApi } from '@autopix/ui';
import { useToast } from '../../lib/toast.jsx';
import { OperationFields } from '../onboarding/operations/OperationFields.jsx';
import { CapabilityList, CompletenessMeter } from '../onboarding/operations/ProfileOverview.jsx';
import s from './app.module.css';
import x from './ops.module.css';

/** "3 de 7 respondidas" for a module. */
function progressOf(fields, profile) {
  let done = 0;
  let total = 0;
  for (const f of fields) {
    const paths = f.type === 'toggles' ? f.items.map((i) => i.path) : [f.path];
    for (const p of paths) {
      total += 1;
      const v = getPath(profile, p);
      if (Array.isArray(v) ? v.length : v !== null && v !== undefined && v !== '') done += 1;
    }
  }
  return { done, total };
}

function Section({ id, title, group, fields, profile, setProfile, accountType, open, onToggle }) {
  const { done, total } = progressOf(fields, profile);
  return (
    <section className={x.module}>
      <button type="button" className={x.moduleHead} aria-expanded={open} aria-controls={`mod-${id}`} onClick={onToggle}>
        <span>
          {group && <small>{groupLabel(group)}</small>}
          <strong>{title}</strong>
        </span>
        <span className={x.moduleMeta}>
          {done}/{total}
          <ChevronDown size={16} className={open ? x.rot : undefined} aria-hidden="true" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`mod-${id}`} className={x.moduleBody} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <OperationFields fields={fields} profile={profile} onChange={setProfile} accountType={accountType} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Perfil operacional. De onde ele vem e para onde volta depende da área, e a tela não sabe qual é:
 *   source    { path, select(data), accountType(entity), save(operationalProfile), merge(data, saved) }
 *             lê `path`, tira a conta de `data`, grava e devolve o `data` novo
 *   copy      { subtitle }
 *   headerAction, note   elementos opcionais da área (um atalho no cabeçalho e a nota do rodapé)
 */
export default function Operations({ source, copy, headerAction = null, note = null }) {
  const toast = useToast();
  const { data, error, reload, setData } = useApi(source.path);
  const company = data ? source.select(data) : undefined;
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState('operacao');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Perfil operacional — TemPix';
  }, []);
  useEffect(() => {
    if (company) setProfile(normalizeOperationalProfile(company.operationalProfile));
  }, [company]);

  const accountType = source.accountType(company);
  const saved = useMemo(() => (company ? normalizeOperationalProfile(company.operationalProfile) : null), [company]);
  const dirty = profile && saved && JSON.stringify(profile) !== JSON.stringify(saved);
  const modules = useMemo(() => (profile ? modulesFor(profile, accountType) : []), [profile, accountType]);

  const save = async () => {
    const parsed = operationalProfileSchema.safeParse(profile);
    if (!parsed.success) {
      toast.error('Revise os campos marcados.');
      return;
    }
    setSaving(true);
    try {
      const fresh = await source.save(parsed.data);
      setData((d) => source.merge(d, fresh));
      toast.success('Perfil operacional salvo.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!profile) return <SkeletonCard lines={6} />;

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Perfil operacional</h1>
          <p className={s.pageSub}>{copy.subtitle}</p>
        </div>
        {headerAction}
      </header>

      <div className={x.layout}>
        <div className={x.main}>
          <CompletenessMeter value={profileCompleteness(profile, { accountType, company })} />
          <Section
            id="operacao"
            title={OPERATION_START.title}
            group="faz"
            fields={OPERATION_START.fields}
            profile={profile}
            setProfile={setProfile}
            accountType={accountType}
            open={open === 'operacao'}
            onToggle={() => setOpen((o) => (o === 'operacao' ? null : 'operacao'))}
          />
          {modules.map((m) => (
            <Section
              key={m.id}
              id={m.id}
              title={m.title}
              group={m.group}
              fields={m.fields}
              profile={profile}
              setProfile={setProfile}
              accountType={accountType}
              open={open === m.id}
              onToggle={() => setOpen((o) => (o === m.id ? null : m.id))}
            />
          ))}
          <Section
            id="docs"
            title="Documentações e acessos"
            group="revisao"
            fields={[DOCUMENTS_FIELD]}
            profile={profile}
            setProfile={setProfile}
            accountType={accountType}
            open={open === 'docs'}
            onToggle={() => setOpen((o) => (o === 'docs' ? null : 'docs'))}
          />
          {note && <p className={x.note}>{note}</p>}
        </div>
        <aside className={`${s.panel} ${s.panelPad} ${x.side}`} aria-labelledby="caps-title">
          <h2 id="caps-title" className={s.panelTitle}>
            Capacidades operacionais
          </h2>
          <CapabilityList lines={capabilitySummary(profile, company)} empty="Responda às seções ao lado para ver suas capacidades aqui." />
        </aside>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div className={x.saveBar} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
            <span>Alterações não salvas</span>
            <Button variant="ghost" onClick={() => setProfile(saved)} disabled={saving}>
              Descartar
            </Button>
            <Button icon={Save} onClick={save} loading={saving}>
              Salvar
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
