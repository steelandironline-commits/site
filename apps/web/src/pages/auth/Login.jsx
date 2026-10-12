import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useSession } from '../../lib/session.jsx';
import { Button, Field, Input } from '../../components/ui/ui.jsx';
import { AuthShell, FormError } from './AuthShell.jsx';
import { PasswordInput } from './PasswordInput.jsx';
import s from './auth.module.css';

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh, isAuthenticated, loading: sessionLoading, expired } = useSession();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(params.get('expired') || expired ? 'Sua sessão expirou. Entre novamente.' : null);
  const [loading, setLoading] = useState(false);
  const next = params.get('next')?.startsWith('/app') ? params.get('next') : '/app';

  useEffect(() => {
    document.title = 'Entrar — AutoPix';
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
      await post('/api/auth/login', form);
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Entrar no AutoPix"
      subtitle="Acompanhe as oportunidades que seus agentes encontraram."
      footer={
        <>
          Ainda não assina? <Link to="/onboarding">Ativar AutoPix</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormError error={error} />
        <Field label="E-mail" error={errors.email}>
          {(a) => (
            <Input
              {...a}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
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
    </AuthShell>
  );
}
