import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LogOut, Monitor } from 'lucide-react';
import { Badge, Button, DemoBadge, ErrorState, Field, PasswordInput, PasswordStrength, SkeletonCard, del, put, useApi, useBrand } from '@autopix/ui';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime, relative } from '../../lib/time.js';
import { InstallCard, NotificationPrefsCard, WhatsAppCard } from './SettingsPlatform.jsx';
import s from './app.module.css';

/**
 * Configurações da conta. O que é da área entra por props, e a tela não sabe qual área é:
 *   copy        { whatsapp: { verified }, notificationCategories, environment: { demo, production } }
 *   team        (me) => elemento ou nada: o cartão de equipe, se a área tem
 *   payout      elemento ou nada: o cartão da chave Pix de recebimento, se a área tem
 */
export default function Settings({ copy, team = null, payout = null }) {
  const { name } = useBrand();
  const toast = useToast();
  const { me, demoMode, onLogout } = useOutletContext();
  const sessions = useApi('/api/me/sessions');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    document.title = `Configurações — ${name}`;
  }, [name]);

  const changePassword = async (e) => {
    e.preventDefault();
    setErrors({});
    if (pw.newPassword !== pw.confirm) return setErrors({ confirm: 'As senhas não conferem.' });
    setSaving(true);
    try {
      await put('/api/me/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success('Senha alterada. Outras sessões foram encerradas.');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      sessions.reload();
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const revokeOthers = async () => {
    setRevoking(true);
    try {
      const res = await del('/api/me/sessions');
      toast.success(`${res.revoked} sessão(ões) encerrada(s).`);
      sessions.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Configurações</h1>
          <p className={s.pageSub}>
            {me.user.name} · {me.user.email}
          </p>
        </div>
        <Button
          variant="secondary"
          icon={LogOut}
          onClick={onLogout}
        >
          Sair
        </Button>
      </header>

      <div className={s.subGrid}>
        <form className={s.panel} onSubmit={changePassword} noValidate>
          <div className={s.formSection}>
            <div className={s.formSectionTitle}>
              <h2>Alterar senha</h2>
              <p>Ao alterar, todas as outras sessões são encerradas.</p>
            </div>
            <div className={s.stack} style={{ gap: 16 }}>
              <Field label="Senha atual" error={errors.currentPassword}>
                {(a) => <PasswordInput {...a} autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}
              </Field>
              <Field label="Nova senha" error={errors.newPassword}>
                {(a) => <PasswordInput {...a} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}
              </Field>
              <PasswordStrength value={pw.newPassword} />
              <Field label="Confirme a nova senha" error={errors.confirm}>
                {(a) => <PasswordInput {...a} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}
              </Field>
              <div>
                <Button type="submit" loading={saving} disabled={!pw.currentPassword || !pw.newPassword}>
                  Salvar nova senha
                </Button>
              </div>
            </div>
          </div>
        </form>

        <div className={s.stack}>
          {team?.(me)}
          <WhatsAppCard copy={copy.whatsapp} />
          <InstallCard />
          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="sess">
            <div className={s.sectionHead}>
              <h2 id="sess" className={s.panelTitle}>
                Sessões ativas
              </h2>
              <Button size="sm" variant="ghost" onClick={revokeOthers} loading={revoking}>
                Encerrar outras
              </Button>
            </div>
            {sessions.error ? (
              <ErrorState compact title="Não foi possível carregar as sessões." onRetry={sessions.reload} />
            ) : !sessions.data ? (
              <SkeletonCard lines={2} />
            ) : (
              sessions.data.items.map((x) => (
                <div key={x.id} className={s.sessionRow}>
                  <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                    <Monitor size={16} aria-hidden="true" style={{ flex: 'none', color: 'var(--muted)', marginTop: 2 }} />
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontWeight: 500 }}>{(x.userAgent || 'Navegador desconhecido').slice(0, 60)}</strong>
                      <p>
                        Ativa {relative(x.lastSeenAt)} · expira {fmtDateTime(x.expiresAt)}
                      </p>
                    </div>
                  </div>
                  {x.current && <Badge tone="primary">Esta sessão</Badge>}
                </div>
              ))
            )}
          </section>

          <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="env">
            <h2 id="env" className={s.panelTitle} style={{ marginBottom: 10 }}>
              Ambiente
            </h2>
            {demoMode ? (
              <p className={s.muted} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <DemoBadge /> {copy.environment.demo}
              </p>
            ) : (
              <p className={s.muted} style={{ fontSize: 13 }}>
                {copy.environment.production}
              </p>
            )}
          </section>
        </div>
      </div>
      <div className={`${s.section} ${s.subGrid}`}>
        <NotificationPrefsCard categories={copy.notificationCategories} />
        {payout}
      </div>
    </>
  );
}
