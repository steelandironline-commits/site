import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { get, post } from '../../lib/api.js';
import { useSession } from '../../lib/session.jsx';
import { Button, Field, Skeleton } from '../../components/ui/ui.jsx';
import { AuthShell, FormError, PasswordStrength } from './AuthShell.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import s from './auth.module.css';

export default function Activate() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [info, setInfo] = useState(null);
  const [invalid, setInvalid] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Criar senha — TemPix';
    get(`/api/auth/activate/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) => setInvalid(err.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    if (password !== confirm) {
      setErrors({ confirm: 'As senhas não conferem.' });
      return;
    }
    setLoading(true);
    try {
      await post('/api/auth/activate', { token, password });
      await refresh();
      const wa = await get('/api/whatsapp').catch(() => null);
      navigate(wa?.available && !wa.connection ? '/app/settings?vincular=whatsapp' : '/app', { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (invalid) {
    return (
      <AuthShell
        title="Link indisponível"
        subtitle={invalid}
        footer={
          <>
            Já criou sua senha? <Link to="/login">Entrar</Link>
          </>
        }
      >
        <p className={s.subtitle}>
          Links de verificação são de uso único e expiram em 48 horas. Se você esperava esta mensagem, volte ao cadastro ou ao checkout para reenviar o link.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crie sua senha" subtitle="E-mail confirmado. Defina a senha de acesso ao seu painel.">
      <form onSubmit={submit} noValidate>
        <div className={s.identity}>
          <span>Conta</span>
          {info ? <strong>{info.email}</strong> : <Skeleton w="70%" h={14} />}
        </div>
        <FormError error={error} />
        <Field label="Nova senha" error={errors.password}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
        </Field>
        <PasswordStrength value={password} />
        <Field label="Confirme a senha" error={errors.confirm}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}
        </Field>
        <div className={s.notice}>
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Sua senha é protegida com Argon2 e nunca é enviada por e-mail. Este link funciona uma única vez.</span>
        </div>
        <Button type="submit" size="lg" block loading={loading} disabled={!info} iconRight={ArrowRight}>
          ATIVAR E ENTRAR
        </Button>
      </form>
    </AuthShell>
  );
}
