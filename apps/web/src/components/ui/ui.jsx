import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCw, X } from 'lucide-react';
import s from './ui.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');

export const Button = forwardRef(function Button(
  { as, to, href, variant = 'primary', size = 'md', loading = false, icon: Icon, iconRight: IconRight, block, className, children, disabled, ...rest },
  ref,
) {
  const cls = cx(s.btn, s[`btn-${variant}`], s[`btn-${size}`], block && s.block, loading && s.loading, className);
  const content = (
    <>
      {loading ? <span className={s.spinner} aria-hidden="true" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" /> : null}
      <span className={s.btnLabel}>{children}</span>
      {IconRight && !loading ? (
        <span className={s.btnChip} aria-hidden="true">
          <IconRight size={size === 'sm' ? 12 : 14} strokeWidth={2.4} />
        </span>
      ) : null}
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {content}
      </Link>
    );
  }
  if (href || as === 'a') {
    return (
      <a ref={ref} href={href} className={cls} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <button ref={ref} type="button" className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

export function Badge({ tone = 'neutral', dot = false, pulse = false, children, className }) {
  return (
    <span className={cx(s.badge, s[`badge-${tone}`], className)}>
      {dot && <span className={cx(s.dot, pulse && s.dotPulse)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function DemoBadge({ className, label = 'DEMO' }) {
  return (
    <span className={cx(s.demo, className)} title="Modo demonstração: dados fictícios">
      {label}
    </span>
  );
}

export function Field({ label, hint, error, children, id: idProp, optional }) {
  const auto = useId();
  const id = idProp || auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cx(s.field, error && s.fieldError)}>
      {label && (
        <label htmlFor={id} className={s.label}>
          {label}
          {optional && <span className={s.optional}>opcional</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className={s.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className={s.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, prefix, ...props }, ref) {
  if (prefix) {
    return (
      <div className={s.inputWrap}>
        <span className={s.prefix}>{prefix}</span>
        <input ref={ref} className={cx(s.input, s.withPrefix, className)} {...props} />
      </div>
    );
  }
  return <input ref={ref} className={cx(s.input, className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx(s.input, s.textarea, className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx(s.input, s.select, className)} {...props}>
      {children}
    </select>
  );
});

/** Tag input: Enter or comma adds; Backspace removes the last tag. */
export function TagInput({ value = [], onChange, placeholder, suggestions = [], id, max = 30, ...aria }) {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const t = raw.trim().replace(/,$/, '');
    if (!t || value.includes(t) || value.length >= max) return;
    onChange([...value, t]);
  };
  const remove = (t) => onChange(value.filter((x) => x !== t));
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && !draft && value.length) {
      remove(value[value.length - 1]);
    }
  };
  const remaining = suggestions.filter((sug) => !value.includes(sug));
  return (
    <div>
      <div className={s.tags} onClick={() => document.getElementById(id)?.focus()}>
        {value.map((t) => (
          <span key={t} className={s.tag}>
            {t}
            <button type="button" onClick={() => remove(t)} aria-label={`Remover ${t}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          className={s.tagInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) {
              add(draft);
              setDraft('');
            }
          }}
          placeholder={value.length ? '' : placeholder}
          {...aria}
        />
      </div>
      {remaining.length > 0 && (
        <div className={s.suggestions} aria-label="Sugestões">
          {remaining.slice(0, 12).map((sug) => (
            <button key={sug} type="button" className={s.suggestion} onClick={() => add(sug)}>
              + {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 14, r, className, style }) {
  return <span className={cx(s.skeleton, className)} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className={s.skeletonCard} aria-hidden="true">
      <Skeleton w="40%" h={10} />
      <Skeleton w="70%" h={20} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} w={`${90 - i * 15}%`} h={10} />
      ))}
    </div>
  );
}

export function ErrorState({ title = 'Algo deu errado', message, onRetry, compact }) {
  return (
    <div className={cx(s.state, compact && s.stateCompact)} role="alert">
      <AlertTriangle size={20} className={s.stateIconWarn} aria-hidden="true" />
      <div>
        <p className={s.stateTitle}>{title}</p>
        {message && <p className={s.stateText}>{message}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RotateCw} onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, message, visual, action }) {
  return (
    <div className={cx(s.state, s.empty)}>
      {visual}
      <div>
        <p className={s.stateTitle}>{title}</p>
        {message && <p className={s.stateText}>{message}</p>}
      </div>
      {action}
    </div>
  );
}

/** Small CSS radar used in empty/loading states. */
export function MiniRadar({ size = 96, label }) {
  return (
    <div className={s.miniRadar} style={{ width: size, height: size }} role="img" aria-label={label || 'Radar procurando oportunidades'}>
      <span className={s.ring} style={{ inset: '0%' }} />
      <span className={s.ring} style={{ inset: '18%' }} />
      <span className={s.ring} style={{ inset: '36%' }} />
      <span className={s.sweepCone} />
      <span className={s.blip} style={{ top: '22%', left: '64%' }} />
      <span className={s.blip} style={{ top: '62%', left: '28%', animationDelay: '1.2s' }} />
      <span className={s.core} />
    </div>
  );
}

export function ScoreRing({ score = 0, size = 56, stroke = 4, label = 'Opportunity Score' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 85 ? 'var(--primary)' : score >= 70 ? 'var(--revenue)' : score >= 55 ? 'var(--amber)' : 'var(--muted)';
  return (
    <div className={s.scoreRing} style={{ width: size, height: size }} role="img" aria-label={`${label}: ${score} de 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={`${s.scoreValue} num`} style={{ fontSize: size * 0.3 }}>
        {score}
      </span>
    </div>
  );
}

export function Dialog({ open, title, children, onClose, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, [open]);
  if (!open) return null;
  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <motion.div
        ref={ref}
        tabIndex={-1}
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
      >
        <h2 id="dialog-title" className={s.dialogTitle}>
          {title}
        </h2>
        <div className={s.dialogBody}>{children}</div>
        <div className={s.dialogActions}>{actions}</div>
      </motion.div>
    </div>
  );
}

export { cx };
