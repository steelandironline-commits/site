import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { BRLText, Button, Field, Input } from '@autopix/ui';
import s from './onboarding.module.css';

const ease = [0.22, 1, 0.36, 1];

/**
 * Tela final do cadastro, só a apresentação. Quem decide o que ela diz e o que o botão faz é a
 * área (areas/<área>/Onboarding.jsx): o texto, o rodapé e o destino não ficam aqui.
 *
 *   title, text, foot   textos da tela
 *   cta                 { label, onClick }
 *   busy, error         estado da chamada em andamento
 *   taken               'email' | 'document' | null: o que o servidor recusou
 *   retryLabel, emailPlaceholder, documentLabel   textos da recusa
 *   onRetryEmail(email) tenta de novo com outro e-mail
 */
export function ReadyView({ title, text, foot, cta, busy, error, taken, retryLabel, emailPlaceholder, documentLabel, onRetryEmail }) {
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState(null);

  // The e-mail already has an account: sign up with another one without starting over.
  const retryWithEmail = (e) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setEmailError('E-mail inválido');
    setEmailError(null);
    onRetryEmail(email);
    return undefined;
  };

  return (
    <motion.div className={s.ready} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
      <span className={s.readyIcon}>
        <Check size={26} />
      </span>
      <h1 className={s.readyTitle}>{title}</h1>
      <p className={s.readyText}><BRLText>{text}</BRLText></p>
      <Button size="lg" iconRight={ArrowRight} onClick={cta.onClick} loading={busy}>
        {cta.label}
      </Button>
      {error && (
        <p className={s.readySafe} role="alert">
          <BRLText>{error}</BRLText>
        </p>
      )}
      {taken === 'email' && (
        <form className={s.readyFix} onSubmit={retryWithEmail} noValidate>
          <Field label="Outro e-mail" error={emailError}>
            {(a) => (
              <Input {...a} type="email" inputMode="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={emailPlaceholder} />
            )}
          </Field>
          <Button type="submit" variant="secondary" loading={busy} disabled={!newEmail.trim()}>
            {retryLabel}
          </Button>
          <Link to="/login" className={s.readyLink}>
            Já tenho conta: entrar
          </Link>
        </form>
      )}
      {taken === 'document' && (
        <Link to="/login" className={s.readyLink}>
          Entrar com o {documentLabel}
        </Link>
      )}
      <p className={s.readySafe}>
        <Lock size={13} aria-hidden="true" /> <BRLText>{foot}</BRLText>
      </p>
    </motion.div>
  );
}

/** Resposta do servidor a um cadastro recusado: a mensagem e qual campo (e-mail ou documento) já tem conta. */
export function failureOf(err, fallback) {
  return { error: err.message || fallback, taken: err.status === 409 ? err.details?.field || null : null };
}
