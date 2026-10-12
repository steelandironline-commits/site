import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '../../components/brand/Logo.jsx';
import { MiniRadar } from '../../components/ui/ui.jsx';
import s from './auth.module.css';

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className={s.shell}>
      <aside className={s.aside} aria-hidden="true">
        <Link to="/" className={s.asideLogo} tabIndex={-1}>
          <Logo />
        </Link>
        <div className={s.asideCenter}>
          <MiniRadar size={220} />
          <p className={s.asideQuote}>Sua empresa trabalha. O AutoPix procura oportunidades.</p>
        </div>
        <p className={s.asideFoot}>Procuramos vendas e serviços pra você.</p>
      </aside>
      <main className={s.main}>
        <Link to="/" className={s.mobileLogo} aria-label="AutoPix — início">
          <Logo />
        </Link>
        <motion.div className={s.panel} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <h1 className={s.title}>{title}</h1>
          {subtitle && <p className={s.subtitle}>{subtitle}</p>}
          <div className={s.body}>{children}</div>
          {footer && <div className={s.footer}>{footer}</div>}
        </motion.div>
      </main>
    </div>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  return (
    <p className={s.formError} role="alert">
      {error}
    </p>
  );
}

/** Lightweight password strength meter (length + variety). */
export function PasswordStrength({ value }) {
  let score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 14) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  const labels = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];
  return (
    <div className={s.strength} aria-live="polite">
      <div className={s.strengthBars} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} data-on={i < score} data-level={score} />
        ))}
      </div>
      <span>{value ? labels[score] : 'Mínimo de 10 caracteres, com letras e números'}</span>
    </div>
  );
}
