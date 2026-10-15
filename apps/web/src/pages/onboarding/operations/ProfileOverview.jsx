/* Completeness meter and capability list of an operational profile. */
import { OPS_COPY as T } from './copy.js';
import o from './operations.module.css';

export function CompletenessMeter({ value, hint = true }) {
  return (
    <div className={o.meter} role="group" aria-label={T.completeness(value)}>
      <strong>{T.completeness(value)}</strong>
      <div className={o.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span style={{ width: `${value}%` }} />
      </div>
      {hint && <p>{T.completenessHint}</p>}
    </div>
  );
}

/** Lines from capabilitySummary(), grouped by section. */
export function CapabilityList({ lines, empty = T.reviewEmpty }) {
  if (!lines?.length) return <p className={o.hint}>{empty}</p>;
  const sections = [...new Set(lines.map((l) => l.section))];
  return (
    <div className={o.summary}>
      {sections.map((sec) => (
        <section key={sec}>
          <h3>{sec}</h3>
          <dl>
            {lines
              .filter((l) => l.section === sec)
              .map((l, i) => (
                <div key={`${l.label}-${i}`}>
                  <dt>{l.label}</dt>
                  <dd>{l.value}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
