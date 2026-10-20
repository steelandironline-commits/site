import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthShell, Button, Field, FormError, Input, PasswordInput, post, useSession } from '@autopix/ui';
import s from './authPage.module.css';

/**
 * Entrar. O documento que a tela pede e o jeito de digitá-lo vêm da área (`copy.identifier`:
 * label, hint, placeholder e `mask`), assim como a frase de abertura (`copy.subtitle`); esta tela não
 * sabe qual documento é.
 */
export default function Login({ copy }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh, isAuthenticated, loading: sessionLoading, expired } = useSession();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState({});
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(params.get('expired') || expired ? 'Sua sessão expirou. Entre novamente.' : null);
  const [loading, setLoading] = useState(false);
  const next = params.get('next')?.startsWith('/app') ? params.get('next') : '/app';

  useEffect(() => {
    document.title = 'Entrar — TemPix';
  }, []);
  useEffect(() => {
    if (!sessionLoading && isAuthenticated) navigate(next, { replace: true });
  }, [sessionLoading, isAuthenticated, navigate, next]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});
    try {
      const result = await post('/api/auth/login', form);
      if (result.mfaRequired) {
        setMfaChallenge(result.challengeId);
        setError('Enviamos um código de seis dígitos para o WhatsApp vinculado à sua conta.');
        return;
      }
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await post('/api/auth/login/verify-whatsapp', { challengeId: mfaChallenge, code });
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Entrar no TemPix"
      subtitle={copy.subtitle}
      footer={
        <>
          Ainda não tem conta? <Link to="/onboarding">Cadastre-se agora</Link>
        </>
      }
    >
      {mfaChallenge ? (
        <form onSubmit={verifyCode} noValidate>
          <FormError error={error} />
          <Field label="Código do WhatsApp" hint="O código expira em 5 minutos." error={errors.code}>
            {(a) => (
              <Input
                {...a}
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                required
              />
            )}
          </Field>
          <Button type="submit" size="lg" block loading={loading} iconRight={ArrowRight} disabled={code.length !== 6}>
            CONFIRMAR CÓDIGO
          </Button>
          <Button variant="ghost" block onClick={() => { setMfaChallenge(null); setCode(''); setError(null); }} disabled={loading}>
            Voltar ao login
          </Button>
        </form>
      ) : (
      <form onSubmit={submit} noValidate>
        <FormError error={error} />
        <Field label={copy.identifier.label} hint={copy.identifier.hint} error={errors.identifier}>
          {(a) => (
            <Input
              {...a}
              autoComplete="username"
              inputMode="numeric"
              placeholder={copy.identifier.placeholder}
              value={form.identifier}
              onChange={(e) => {
                const v = e.target.value;
                // Older accounts may still type their e-mail.
                setForm({ ...form, identifier: /[a-z@]/i.test(v) ? v : copy.identifier.mask(v) });
              }}
              required
            />
          )}
        </Field>
        <Field label="Senha" error={errors.password}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          )}
        </Field>
        <div className={s.row}>
          <span />
          <Link to="/forgot-password">Esqueci minha senha</Link>
        </div>
        <Button type="submit" size="lg" block loading={loading} iconRight={ArrowRight}>
          ENTRAR
        </Button>
      </form>
      )}
    </AuthShell>
  );
}
