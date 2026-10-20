import { useState } from 'react';
import { Check, Copy, UserPlus, Users } from 'lucide-react';
import { formatCpf } from '@autopix/shared';
import { Badge, Button, ErrorState, Field, Input, SkeletonCard, del, post, useApi } from '@autopix/ui';
import { useToast } from '../../lib/toast.jsx';
import s from './app.module.css';

const STATUS = {
  ACTIVE: ['primary', 'Ativo'],
  PENDING_ACTIVATION: ['amber', 'Aguardando senha'],
  DISABLED: ['neutral', 'Removido'],
};

/** Company accounts: one login (CNPJ); collaborators get their own CPF login. */
export function TeamCard({ me }) {
  const toast = useToast();
  const team = useApi('/api/team');
  const owner = me.user.role === 'OWNER';
  const [form, setForm] = useState({ name: '', cpf: '', email: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      const res = await post('/api/team', form);
      setInvite({ name: res.member.name, ...res.invite });
      setForm({ name: '', cpf: '', email: '' });
      team.reload();
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await del(`/api/team/${id}`);
      toast.success('Acesso removido.');
      setConfirming(null);
      team.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie.');
    }
  };

  return (
    <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="team">
      <div className={s.sectionHead}>
        <h2 id="team" className={s.panelTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={16} aria-hidden="true" /> Equipe
        </h2>
      </div>
      <p className={s.muted} style={{ fontSize: 13, marginBottom: 12 }}>
        A empresa entra com o CNPJ, um login por empresa. Libere acesso para colaboradores: cada um entra com o próprio CPF e senha.
      </p>
      {team.error ? (
        <ErrorState compact title="Não foi possível carregar a equipe." onRetry={team.reload} />
      ) : !team.data ? (
        <SkeletonCard lines={2} />
      ) : (
        team.data.members.map((m) => {
          const [tone, label] = STATUS[m.status] || ['neutral', m.status];
          return (
            <div key={m.id} className={s.sessionRow}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontWeight: 500 }}>{m.name}</strong>
                <p>
                  {m.role === 'OWNER' ? `Login da empresa · CNPJ ${m.login}` : `Colaborador · CPF ${m.login}`}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone={tone}>{label}</Badge>
                {owner && m.role !== 'OWNER' && m.status !== 'DISABLED' && (
                  confirming === m.id ? (
                    <Button size="sm" variant="secondary" onClick={() => remove(m.id)}>
                      Confirmar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(m.id)}>
                      Remover
                    </Button>
                  )
                )}
              </div>
            </div>
          );
        })
      )}

      {owner && (
        <form onSubmit={submit} noValidate style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <Field label="Nome do colaborador" error={errors.name}>
            {(a) => <Input {...a} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />}
          </Field>
          <Field label="CPF" hint="Será o login dele." error={errors.cpf}>
            {(a) => (
              <Input {...a} inputMode="numeric" value={form.cpf} placeholder="000.000.000-00" onChange={(e) => setForm({ ...form, cpf: formatCpf(e.target.value) })} />
            )}
          </Field>
          <Field label="E-mail" hint="Para ele criar a senha." error={errors.email}>
            {(a) => <Input {...a} type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
          </Field>
          <Button type="submit" icon={UserPlus} loading={saving}>
            Liberar acesso
          </Button>
        </form>
      )}

      {invite && (
        <div className={s.notice} style={{ marginTop: 14, display: 'grid', gap: 8 }} role="status">
          <span>
            Acesso criado para <strong>{invite.name}</strong>. Envie o link para ele criar a senha (vale 48 horas, uso único)
            {invite.emailed ? '. Também enviamos por e-mail.' : '.'}
          </span>
          <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{invite.link}</code>
          <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
            {copied ? 'Copiado' : 'Copiar link'}
          </Button>
        </div>
      )}
    </section>
  );
}
