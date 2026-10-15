/* Perfil operacional: capabilities, completeness and per-module editing. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Network, Save } from 'lucide-react';
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
import { executeAction } from '../../lib/actions.js';
import { useApi } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { Button, ErrorState, SkeletonCard } from '../../components/ui/ui.jsx';
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

export default function Operations() {
  const toast = useToast();
  const { data, error, reload, setData } = useApi('/api/company');
  const company = data?.company;
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState('operacao');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Perfil operacional — TemPix';
  }, []);
  useEffect(() => {
    if (company) setProfile(normalizeOperationalProfile(company.operationalProfile));
  }, [company]);

  const accountType = company?.accountType || 'COMPANY';
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
      const { result } = await executeAction('UPDATE_COMPANY_PROFILE', { operationalProfile: parsed.data });
      setData((d) => ({ ...d, company: { ...d.company, ...result.company } }));
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
          <p className={s.pageSub}>O que sua empresa faz, possui, fornece e compra. É isso que decide quais oportunidades chegam até você.</p>
        </div>
        <Button to="/app/intermediacao" variant="outline" icon={Network}>
          Intermediação
        </Button>
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
          <p className={x.note}>
            Cidade, regiões, produtos e cliente ideal ficam em <Link to="/app/company">Empresa</Link>.
          </p>
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
