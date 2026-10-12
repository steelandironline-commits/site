import styles from './Logo.module.css';

/**
 * AutoPix symbol: radar arc (scan) + signal pulse + transaction path that
 * ends in a settled node. Deliberately unrelated to the official Pix mark.
 */
export function LogoMark({ size = 28, animated = false, className = '' }) {
  return (
    <svg
      className={`${styles.mark} ${animated ? styles.animated : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="var(--line-3)" strokeWidth="1.4" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="var(--line-2)" strokeWidth="1.2" />
      <path className={styles.sweep} d="M16 3.5A12.5 12.5 0 0 1 28.5 16" fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" />
      <path
        className={styles.pulse}
        d="M5.5 19h5.2l2.3-5.6 3.4 8.2 2.3-4.6h6.3"
        fill="none"
        stroke="var(--text)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.6" cy="17" r="2" fill="var(--primary)" />
    </svg>
  );
}

export function Logo({ size = 26, animated = false, compact = false }) {
  return (
    <span className={styles.logo} aria-label="AutoPix">
      <LogoMark size={size} animated={animated} />
      {!compact && (
        <span className={styles.word} aria-hidden="true">
          <span className={styles.auto}>AUTO</span>
          <span className={styles.pix}>PIX</span>
        </span>
      )}
    </span>
  );
}
