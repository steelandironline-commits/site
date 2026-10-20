import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthShell, Button, Field, FormError, Input, post } from '@autopix/ui';
import s from './authPage.module.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Recuperar senha — TemPix';
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldError(null);
    try {
      const res = await post('/api/auth/forgot-password', { email });
      setSent(res.message);
    } catch (err) {
      setFieldError(err.fields?.email);
      setError(err.fields?.email ? null : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Enviaremos um link de redefinição válido por 1 hora."
      footer={
        <>
          Lembrou? <Link to="/login">Entrar</Link>
        </>
      }
    >
      {sent ? (
        <div className={s.notice} role="status">
          <MailCheck size={16} aria-hidden="true" />
          <span>{sent}</span>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <FormError error={error} />
          <Field label="E-mail da conta" error={fieldError}>
            {(a) => <Input {...a} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
          </Field>
          <Button type="submit" size="lg" block loading={loading}>
            ENVIAR LINK
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
