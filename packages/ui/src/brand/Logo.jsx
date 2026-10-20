import { useId } from 'react';
import styles from './Logo.module.css';

/**
 * TemPix symbol: a raised 2.5D tile (same language as the landing islands)
 * with a check — "tem": it's there, it's done. Deliberately unrelated to the
 * official Pix mark (no interlocking shapes, own colours).
 */
export function LogoMark({ size = 28, animated = false, className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={`${styles.mark} ${animated ? styles.animated : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-top`} x1="6" y1="4" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5ff0d8" />
          <stop offset="1" stopColor="#16b39b" />
        </linearGradient>
      </defs>
      <rect x="6.1" y="7.6" width="19.8" height="19.8" rx="5" transform="rotate(45 16 17.5)" fill="#1c2a45" />
      <rect className={styles.tile} x="6.1" y="5.6" width="19.8" height="19.8" rx="5" transform="rotate(45 16 15.5)" fill={`url(#${id}-top)`} />
      <path className={styles.check} d="M10.7 15.7l3.7 3.7 7-7.3" fill="none" stroke="#04201b" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 26, animated = false, compact = false }) {
  return (
    <span className={styles.logo} aria-label="TemPix">
      <LogoMark size={size} animated={animated} />
      {!compact && (
        <span className={styles.word} aria-hidden="true">
          <span className={styles.tem}>Tem</span>
          <span className={styles.pix}>Pix</span>
        </span>
      )}
    </span>
  );
}
