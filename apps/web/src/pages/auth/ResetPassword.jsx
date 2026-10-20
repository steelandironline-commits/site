import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthShell, Button, Field, FormError, PasswordInput, PasswordStrength, Skeleton, get, post } from '@autopix/ui';
import { useToast } from '../../lib/toast.jsx';
import s from './authPage.module.css';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [invalid, setInvalid] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Nova senha — TemPix';
    get(`/api/auth/reset-password/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) => setInvalid(err.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    if (password !== confirm) return setErrors({ confirm: 'As senhas não conferem.' });
    setLoading(true);
    try {
      await post('/api/auth/reset-password', { token, password });
      toast.success('Senha redefinida. Entre com a nova senha.');
      navigate('/login', { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setLoading(false);
    }
    return undefined;
  };

  if (invalid) {
    return (
      <AuthShell title="Link indisponível" subtitle={invalid} footer={<Link to="/forgot-password">Solicitar novo link</Link>}>
        <p className={s.subtitle}>Links de redefinição expiram em 1 hora e só podem ser usados uma vez.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Defina uma nova senha" subtitle="Por segurança, todas as sessões abertas serão encerradas.">
      <form onSubmit={submit} noValidate>
        <div className={s.identity}>
          <span>Conta</span>
          {info ? <strong>{info.email}</strong> : <Skeleton w="70%" h={14} />}
        </div>
        <FormError error={error} />
        <Field label="Nova senha" error={errors.password}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <PasswordStrength value={password} />
        <Field label="Confirme a senha" error={errors.confirm}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" block loading={loading} disabled={!info}>
          SALVAR NOVA SENHA
        </Button>
      </form>
    </AuthShell>
  );
}
