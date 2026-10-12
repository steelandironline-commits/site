import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { formatDocument } from '@autopix/shared';
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
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState({});
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
      title="Entrar no TemPix"
      subtitle="Acompanhe as oportunidades que seus agentes encontraram."
      footer={
        <>
          Ainda não tem conta? <Link to="/onboarding">Cadastre-se agora</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormError error={error} />
        <Field label="CPF ou CNPJ" hint="Empresas e MEI entram com o CNPJ. Pessoa física e colaboradores, com o CPF." error={errors.identifier}>
          {(a) => (
            <Input
              {...a}
              autoComplete="username"
              inputMode="numeric"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={form.identifier}
              onChange={(e) => {
                const v = e.target.value;
                // Older accounts may still type their e-mail.
                setForm({ ...form, identifier: /[a-z@]/i.test(v) ? v : formatDocument(v) });
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
    </AuthShell>
  );
}
