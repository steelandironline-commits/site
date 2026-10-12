import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { fmtDateTime } from '../../lib/time.js';
import { Badge, Button, ErrorState, Field, SkeletonCard } from '../../components/ui/ui.jsx';
import { PasswordInput } from '../auth/PasswordInput.jsx';
import s from './app.module.css';

const VIA = { WEB: 'App', API: 'Aplicativo', WHATSAPP: 'WhatsApp', SYSTEM: 'Sistema' };
const STATUS = { PENDING: ['amber', 'Aguardando'], CONFIRMED: ['primary', 'Confirmada'], EXECUTED: ['revenue', 'Executada'], FAILED: ['danger', 'Falhou'], EXPIRED: ['neutral', 'Expirada'], CANCELED: ['neutral', 'Cancelada'] };

/**
 * Step-up authentication for sensitive actions (fund release, refunds, bank
 * details). Requires the signed-in web/PWA session AND the account password.
 */
export default function ConfirmChallenge() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, reload } = useApi(`/api/challenges/${id}`);
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [busy, setBusy] = useState(false);
  const c = data?.challenge;

  useEffect(() => {
    document.title = 'Confirmar ação — AutoPix';
  }, []);

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFieldError(null);
    try {
      const out = await post(`/api/challenges/${id}/confirm`, { password });
      toast.success('Ação confirmada e executada.');
      const paymentId = out.result?.payment?.id;
      navigate(paymentId ? `/app/payments/${paymentId}` : '/app', { replace: true });
    } catch (err) {
      if (err.status === 400) setFieldError(err.message);
      else toast.error(err.message);
      reload();
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  const cancel = async () => {
    await post(`/api/challenges/${id}/cancel`).catch(() => {});
    navigate(-1);
  };

  if (error) return <ErrorState title="Confirmação não encontrada." message={error.message} />;
  if (!c) return <SkeletonCard lines={4} />;
  const [tone, label] = STATUS[c.status] || ['neutral', c.status];

  return (
    <div className={s.confirmWrap}>
      <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="confirm-title">
        <div className={s.confirmIcon} aria-hidden="true">
          <ShieldCheck size={26} />
        </div>
        <p className="eyebrow">Confirmação de segurança</p>
        <h1 id="confirm-title" className={s.pageTitle} style={{ marginTop: 8 }}>
          {c.summary}
        </h1>
        <dl className={s.kv} style={{ marginTop: 18 }}>
          <div>
            <dt>Solicitada via</dt>
            <dd>{VIA[c.requestedVia] || c.requestedVia}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={tone}>{label}</Badge>
            </dd>
          </div>
          <div>
            <dt>Criada</dt>
            <dd>{fmtDateTime(c.createdAt)}</dd>
          </div>
          <div>
            <dt>Expira</dt>
            <dd>{fmtDateTime(c.expiresAt)}</dd>
          </div>
        </dl>
        {c.status === 'PENDING' ? (
          <form onSubmit={confirm} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
            <p className={s.muted} style={{ fontSize: 13 }}>
              Ações financeiras nunca são executadas só por mensagem. Digite sua senha para confirmar neste dispositivo.
            </p>
            <Field label="Senha da conta" error={fieldError}>
              {(a) => <PasswordInput {...a} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            <div className={s.pageActions}>
              <Button type="submit" icon={ShieldCheck} loading={busy} disabled={!password}>
                Confirmar
              </Button>
              <Button variant="ghost" icon={X} onClick={cancel} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div style={{ marginTop: 20 }}>
            <Button variant="secondary" to="/app">
              Voltar ao painel
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
