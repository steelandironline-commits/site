import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { onlyDigits } from '@autopix/shared';
import { Button, ErrorState, Field, Input, SkeletonCard, TagInput, Textarea, put, useApi } from '@autopix/ui';
import { useToast } from '../../lib/toast.jsx';
import { PersonWhereFields } from './PersonWhereFields.jsx';
import s from '../../pages/app/app.module.css';

// "Meu perfil": o perfil da pessoa física. Lê e grava só GET/PUT /api/profile, a rota do CPF; a rota
// de empresa não existe neste host e esta tela não a conhece.

const TEXT = ['name', 'phone', 'postalCode', 'city', 'state', 'description'];
const SUGGESTIONS = ['Eletricista', 'Pedreiro', 'Motorista', 'Pintor', 'Encanador', 'Soldador', 'Ajudante geral', 'Operador de empilhadeira'];

function toForm(p) {
  const f = {};
  TEXT.forEach((k) => (f[k] = p[k] ?? ''));
  f.serviceRadiusKm = p.serviceRadiusKm ?? 0;
  f.services = p.services ?? [];
  return f;
}

function toPayload(f) {
  const out = {};
  TEXT.forEach((k) => (out[k] = typeof f[k] === 'string' && f[k].trim() === '' ? null : f[k]));
  out.name = f.name;
  out.serviceRadiusKm = Number(onlyDigits(String(f.serviceRadiusKm ?? 0)) || 0);
  out.services = f.services;
  return out;
}

/** Carrega o perfil e entrega ao formulário; erro e espera ficam aqui. */
export default function Profile() {
  const { data, error, reload, setData } = useApi('/api/profile');

  useEffect(() => {
    document.title = 'Meu perfil';
  }, []);

  if (error) return <ErrorState title="Não foi possível carregar o seu perfil." message={error.message} onRetry={reload} />;
  if (!data) return <SkeletonCard lines={8} />;
  return <ProfileForm profile={data.profile} onSaved={(profile) => setData({ profile })} />;
}

/** O formulário de "Meu perfil": parte do perfil recebido e grava com PUT /api/profile. */
export function ProfileForm({ profile, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => toForm(profile));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(toForm(profile)), [form, profile]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await put('/api/profile', toPayload(form));
      setForm(toForm(res.profile));
      onSaved(res.profile);
      toast.success('Perfil salvo.');
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const place = [profile.city, profile.state].filter(Boolean).join(' / ');

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Meu perfil</h1>
          <p className={s.pageSub}>Seus dados e o trabalho que você faz. É por eles que chegam as vagas e os serviços certos para você.</p>
        </div>
      </header>

      <div className={s.subGrid} style={{ gridTemplateColumns: undefined }}>
        <form onSubmit={submit} noValidate className={s.panel}>
          <div className={s.formSection}>
            <div className={s.formSectionTitle}>
              <h2>Seus dados</h2>
            </div>
            <div className={s.formGrid}>
              <Field label="Nome" error={errors.name}>
                {(a) => <Input {...a} autoComplete="name" value={form.name} onChange={set('name')} />}
              </Field>
              <Field label="WhatsApp" optional hint="Só para avisos de vagas e serviços." error={errors.phone}>
                {(a) => <Input {...a} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="(47) 99999-0000" />}
              </Field>
            </div>
          </div>

          <div className={s.formSection}>
            <div className={s.formSectionTitle}>
              <h2>O que você faz</h2>
              <p>Profissão e serviços que você presta.</p>
            </div>
            <div className={s.formGrid}>
              <div className={s.span2}>
                <Field label="Profissão e serviços" hint="Pressione Enter para adicionar." error={errors.services}>
                  {(a) => <TagInput {...a} value={form.services} onChange={set('services')} placeholder="Ex.: Eletricista, Motorista" suggestions={SUGGESTIONS} />}
                </Field>
              </div>
              <div className={s.span2}>
                <Field label="Sobre você" optional error={errors.description}>
                  {(a) => <Textarea {...a} value={form.description} onChange={set('description')} placeholder="Experiência, certificações, ferramentas próprias." maxLength={2000} />}
                </Field>
              </div>
            </div>
          </div>

          <div className={s.formSection}>
            <div className={s.formSectionTitle}>
              <h2>Onde você mora</h2>
            </div>
            <div className={s.stack} style={{ gap: 16 }}>
              <PersonWhereFields form={form} set={set} errors={errors} />
            </div>
          </div>

          <div className={s.stickyBar} style={{ margin: 12 }}>
            <p>{dirty ? 'Alterações não salvas.' : 'Tudo salvo.'}</p>
            <div className={s.pageActions}>
              <Button variant="ghost" disabled={!dirty || saving} onClick={() => setForm(toForm(profile))}>
                Descartar
              </Button>
              <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>
                Salvar perfil
              </Button>
            </div>
          </div>
        </form>

        <div className={s.stack}>
          <aside className={`${s.panel} ${s.panelPad}`} aria-labelledby="registro">
            <h2 id="registro" className={s.panelTitle}>
              Seu cadastro
            </h2>
            <dl className={s.kv} style={{ marginTop: 14 }}>
              <div>
                <dt>Nome</dt>
                <dd>{profile.name}</dd>
              </div>
              <div>
                <dt>CPF</dt>
                <dd className="mono">{profile.cpfMasked || '—'}</dd>
              </div>
              <div>
                <dt>Região</dt>
                <dd>{place || '—'}</dd>
              </div>
              <div>
                <dt>Distância aceita</dt>
                <dd className="num">{profile.serviceRadiusKm ? `${profile.serviceRadiusKm} km` : '—'}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </>
  );
}
