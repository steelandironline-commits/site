import { useEffect, useRef, useState } from 'react';
import { Bell, Download, ExternalLink, MessageCircle, Share, Smartphone, Unlink } from 'lucide-react';
import { NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_LABELS } from '@autopix/shared';
import {
  Badge,
  Button,
  Field,
  Input,
  SkeletonCard,
  del,
  disablePush,
  enablePush,
  getPushState,
  post,
  put,
  useApi,
  useInstallPrompt,
} from '@autopix/ui';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime } from '../../lib/time.js';
import s from './app.module.css';

/** `copy.verified`: o que o número vinculado permite (os comandos são da área). */
export function WhatsAppCard({ copy }) {
  const toast = useToast();
  const { data, reload } = useApi('/api/whatsapp');
  const [phone, setPhone] = useState('');
  const [verification, setVerification] = useState(null);
  const [busy, setBusy] = useState(false);
  const conn = data?.connection;
  const box = useRef(null);
  const linking = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('vincular') === 'whatsapp';

  // Coming from signup: bring the card into view so the number is linked right away.
  useEffect(() => {
    if (linking && data) box.current?.scrollIntoView({ block: 'center' });
  }, [linking, data]);

  // While waiting for the user's WhatsApp message, refresh the status.
  useEffect(() => {
    if (conn?.status !== 'PENDING') return undefined;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [conn?.status, reload]);

  const start = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await post('/api/whatsapp/connection', { phoneNumber: phone });
      setVerification(res.verification);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    await del('/api/whatsapp/connection').catch((err) => toast.error(err.message));
    setVerification(null);
    reload();
  };

  return (
    <section ref={box} id="whatsapp" className={`${s.panel} ${s.panelPad}`} aria-labelledby="wa-title">
      <div className={s.sectionHead}>
        <h2 id="wa-title" className={s.panelTitle}>
          <MessageCircle size={15} style={{ verticalAlign: -2 }} aria-hidden="true" /> WhatsApp
        </h2>
        {conn && <Badge tone={conn.status === 'VERIFIED' ? 'primary' : 'amber'}>{conn.status === 'VERIFIED' ? 'Conectado' : 'Aguardando verificação'}</Badge>}
      </div>
      <p className={s.muted} style={{ fontSize: 13, margin: '0 0 12px' }}>
        {linking && !conn ? 'Último passo do cadastro: vincule seu WhatsApp. ' : ''}Um único número por conta, confirmado por você; ele não pode ser
        usado em outra conta.
      </p>
      {!data ? (
        <SkeletonCard lines={1} />
      ) : !data.available ? (
        <p className={s.muted} style={{ fontSize: 13 }}>
          O WhatsApp Business ainda não foi configurado neste ambiente.
        </p>
      ) : conn?.status === 'VERIFIED' ? (
        <>
          <p style={{ fontSize: 14 }}>
            {conn.phoneNumber} · verificado {fmtDateTime(conn.verifiedAt)}
          </p>
          <p className={s.muted} style={{ fontSize: 12, marginTop: 6 }}>
            {copy.verified}
          </p>
          <div style={{ marginTop: 12 }}>
            <Button size="sm" variant="ghost" icon={Unlink} onClick={revoke}>
              Desvincular
            </Button>
          </div>
        </>
      ) : (
        <>
          <form onSubmit={start} noValidate style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <Field label="Número do WhatsApp">
                {(a) => <Input {...a} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98888-7777" />}
              </Field>
            </div>
            <Button type="submit" loading={busy} disabled={phone.replace(/\D/g, '').length < 10}>
              {conn ? 'Gerar novo código' : 'Vincular'}
            </Button>
          </form>
          {verification && (
            <div className={s.verifyBox} role="status">
              <p>
                Envie esta mensagem <strong>a partir do número informado</strong> para o WhatsApp do TemPix
                {verification.businessNumber ? ` (+${verification.businessNumber})` : ''}:
              </p>
              <p className={`${s.verifyCode} mono`}>{verification.message}</p>
              {verification.waLink && (
                <Button size="sm" href={verification.waLink} target="_blank" rel="noopener noreferrer" iconRight={ExternalLink}>
                  Abrir no WhatsApp
                </Button>
              )}
              <p className={s.muted} style={{ fontSize: 12 }}>
                Código válido até {fmtDateTime(verification.expiresAt)}. Esta página atualiza sozinha.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** `categories`: as categorias de aviso que a área tem, [{ key, label }] (a área escolhe quais e como se chamam). */
export function NotificationPrefsCard({ categories }) {
  const toast = useToast();
  const { data, setData } = useApi('/api/notifications/preferences');
  const [push, setPush] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setPush).catch(() => setPush({ supported: false }));
  }, []);

  const toggle = async (channel, category, enabled) => {
    setData((d) => ({ ...d, preferences: { ...d.preferences, [channel]: { ...d.preferences[channel], [category]: enabled } } }));
    try {
      const res = await put('/api/notifications/preferences', { changes: [{ channel, category, enabled }] });
      setData((d) => ({ ...d, preferences: res.preferences }));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (push?.subscribed) await disablePush();
      else await enablePush();
      setPush(await getPushState());
      toast.success(push?.subscribed ? 'Push desativado neste dispositivo.' : 'Push ativado neste dispositivo.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="np-title">
      <div className={s.sectionHead}>
        <h2 id="np-title" className={s.panelTitle}>
          <Bell size={15} style={{ verticalAlign: -2 }} aria-hidden="true" /> Notificações
        </h2>
        {push?.supported && push.configured && (
          <Button size="sm" variant="secondary" loading={pushBusy} onClick={togglePush}>
            {push.subscribed ? 'Desativar push neste aparelho' : 'Ativar push neste aparelho'}
          </Button>
        )}
      </div>
      {!data ? (
        <SkeletonCard lines={3} />
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                {NOTIFICATION_CHANNELS.map((c) => (
                  <th key={c} scope="col" style={{ textAlign: 'center' }}>
                    {NOTIFICATION_CHANNEL_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map(({ key: cat, label }) => (
                <tr key={cat}>
                  <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontSize: 13, color: 'var(--text-2)' }}>
                    {label}
                  </th>
                  {NOTIFICATION_CHANNELS.map((ch) => (
                    <td key={ch} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        className={s.switch}
                        checked={Boolean(data.preferences[ch][cat])}
                        onChange={(e) => toggle(ch, cat, e.target.checked)}
                        aria-label={`${label} por ${NOTIFICATION_CHANNEL_LABELS[ch]}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {push && !push.configured && push.supported && (
        <p className={s.muted} style={{ fontSize: 12, marginTop: 10 }}>
          Push ainda não configurado no servidor (WEB_PUSH_*).
        </p>
      )}
    </section>
  );
}

export function InstallCard() {
  const install = useInstallPrompt();
  const toast = useToast();
  if (install.installed) {
    return (
      <section className={`${s.panel} ${s.panelPad}`}>
        <h2 className={s.panelTitle}>
          <Smartphone size={15} style={{ verticalAlign: -2 }} aria-hidden="true" /> App instalado
        </h2>
        <p className={s.muted} style={{ fontSize: 13, marginTop: 6 }}>
          Você está usando o TemPix como aplicativo.
        </p>
      </section>
    );
  }
  return (
    <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="install-title">
      <h2 id="install-title" className={s.panelTitle}>
        <Smartphone size={15} style={{ verticalAlign: -2 }} aria-hidden="true" /> Instalar o app
      </h2>
      <p className={s.muted} style={{ fontSize: 13, margin: '6px 0 12px' }}>
        Acesso em tela cheia, ícone na tela inicial e notificações.
      </p>
      {install.canPrompt ? (
        <Button
          icon={Download}
          onClick={async () => {
            const outcome = await install.prompt();
            if (outcome === 'accepted') toast.success('TemPix instalado.');
          }}
        >
          Instalar TemPix
        </Button>
      ) : install.iosInstructions ? (
        <p style={{ fontSize: 13 }}>
          No Safari, toque em <Share size={13} style={{ verticalAlign: -2 }} aria-label="Compartilhar" /> e depois em <strong>Adicionar à Tela de Início</strong>.
        </p>
      ) : (
        <p className={s.muted} style={{ fontSize: 13 }}>
          Use o menu do navegador → “Instalar app” (Chrome, Edge) ou “Adicionar à tela inicial”.
        </p>
      )}
    </section>
  );
}
