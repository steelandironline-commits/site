/* Generic renderer for the operational question engine (@autopix/shared).
   A module is a list of declarative fields; this file knows how to draw each
   field type, so new categories need no new screens. */
import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Anchor,
  Briefcase,
  Building2,
  Check,
  Cog,
  Construction,
  Cpu,
  Factory,
  Flame,
  Hammer,
  HardHat,
  KeyRound,
  Package,
  Plus,
  Route,
  Ship,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  User,
  Wrench,
} from 'lucide-react';
import {
  AVAILABILITY,
  BUYER_NEEDS,
  EQUIPMENT_TYPES,
  EQUIPMENT_USAGE,
  NEED_EQUIPMENT,
  OPERATOR_MODES,
  SPEC_FIELDS,
  TERRAIN_TYPES,
  URGENCY,
  VEHICLE_TYPES,
  conditionMet,
  getPath,
  labelOf,
  operationTypesFor,
  setPath,
} from '@autopix/shared';
import { Field, Input, TagInput } from '../../../components/ui/ui.jsx';
import { OPS_COPY as T } from './copy.js';
import o from './operations.module.css';

const ICONS = {
  factory: Factory,
  cog: Cog,
  flame: Flame,
  truck: Truck,
  route: Route,
  anchor: Anchor,
  ship: Ship,
  wrench: Wrench,
  building: Building2,
  hardhat: HardHat,
  key: KeyRound,
  crane: Construction,
  hammer: Hammer,
  briefcase: Briefcase,
  store: Store,
  package: Package,
  cart: ShoppingCart,
  cpu: Cpu,
  user: User,
  plus: Plus,
};

const uid = () => Math.random().toString(36).slice(2, 10);
const ease = [0.22, 1, 0.36, 1];
const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.25, ease } };

/* ----------------------------------------------------------- primitives */
function Group({ label, hint, error, count, children }) {
  return (
    <fieldset className={o.group}>
      {label && (
        <legend className={o.legend}>
          {label}
          {count > 0 && <span className={o.count}>{T.selected(count)}</span>}
        </legend>
      )}
      {hint && <p className={o.hint}>{hint}</p>}
      {children}
      {error && (
        <p className={o.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Multi- or single-select chips; long lists fold after a few options. */
export function ChipGroup({ options, value, onChange, multiple = true, icons = false, fold = 14 }) {
  const [open, setOpen] = useState(false);
  const selected = multiple ? value || [] : value ? [value] : [];
  const visible = open || options.length <= fold ? options : options.filter((x, i) => i < fold - 2 || selected.includes(x.id));
  const toggle = (id) => {
    if (multiple) onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
    else onChange(selected.includes(id) ? undefined : id);
  };
  return (
    <div className={`${o.chips} ${icons ? o.chipsIcons : ''}`}>
      {visible.map((x) => {
        const on = selected.includes(x.id);
        const Icon = icons ? ICONS[x.icon] || Plus : null;
        return (
          <button key={x.id} type="button" className={`${o.chip} ${on ? o.chipOn : ''}`} aria-pressed={on} onClick={() => toggle(x.id)}>
            {Icon ? <Icon size={16} aria-hidden="true" /> : on ? <Check size={13} aria-hidden="true" /> : null}
            <span>{x.label}</span>
            {Icon && on && <Check size={14} className={o.tick} aria-hidden="true" />}
          </button>
        );
      })}
      {options.length > fold && (
        <button type="button" className={o.more} onClick={() => setOpen((v) => !v)}>
          {open ? T.less : `${T.more} (${options.length - visible.length})`}
        </button>
      )}
    </div>
  );
}

export function YesNo({ value, onChange, small = false, label }) {
  return (
    <div className={`${o.yesno} ${small ? o.yesnoSmall : ''}`} role="radiogroup" aria-label={label}>
      {[
        [true, T.yes],
        [false, T.no],
      ].map(([v, text]) => (
        <button key={text} type="button" role="radio" aria-checked={value === v} className={value === v ? o.yesnoOn : undefined} onClick={() => onChange(value === v ? null : v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function NumberField({ label, unit, value, onChange, hint }) {
  return (
    <Field label={label} hint={hint}>
      {(a) => (
        <div className={o.unitWrap}>
          <Input
            {...a}
            type="number"
            inputMode="decimal"
            min={0}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          {unit && <span className={o.unit}>{unit}</span>}
        </div>
      )}
    </Field>
  );
}

function TextField({ label, value, onChange, placeholder, maxLength = 200, type = 'text' }) {
  return (
    <Field label={label}>
      {(a) => <Input {...a} type={type} value={value ?? ''} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

function Toggles({ label, items, profile, set }) {
  return (
    <Group label={label}>
      <ul className={o.toggles}>
        {items.map((it) => (
          <li key={it.path}>
            <span>{it.label}</span>
            <YesNo small label={it.label} value={getPath(profile, it.path) ?? null} onChange={(v) => set(it.path, v)} />
          </li>
        ))}
      </ul>
    </Group>
  );
}

/* --------------------------------------------------------- equipment */
function EquipmentEditor({ label, value = [], onChange, groups }) {
  const types = EQUIPMENT_TYPES.filter((t) => groups.includes(t.group) || t.group === 'any');
  const has = new Set(value.map((i) => i.type));
  const toggleType = (type) =>
    onChange(has.has(type) ? value.filter((i) => i.type !== type) : [...value, { id: uid(), type, quantity: 1, regions: [] }]);
  const patch = (id, k, v) => onChange(value.map((i) => (i.id === id ? { ...i, [k]: v } : i)));
  const shown = value.filter((i) => types.some((t) => t.id === i.type));
  return (
    <Group label={label} hint={T.equipmentPick}>
      <ChipGroup options={types} value={[...has]} onChange={(next) => {
        const added = next.find((t) => !has.has(t));
        const removed = [...has].find((t) => !next.includes(t) && types.some((x) => x.id === t));
        if (added) toggleType(added);
        else if (removed) toggleType(removed);
      }} />
      <AnimatePresence initial={false}>
        {shown.map((item) => {
          const def = EQUIPMENT_TYPES.find((t) => t.id === item.type);
          const offered = def.group !== 'industrial';
          return (
            <motion.div key={item.id} className={o.item} {...reveal}>
              <header className={o.itemHead}>
                <strong>{def.label}</strong>
                <span className={o.itemActions}>
                  <button type="button" className={o.link} onClick={() => onChange([...value, { id: uid(), type: item.type, quantity: 1, regions: [] }])}>
                    <Plus size={13} /> {T.addAnother}
                  </button>
                  <button type="button" className={o.iconBtn} aria-label={`${T.remove} ${def.label}`} onClick={() => onChange(value.filter((i) => i.id !== item.id))}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </header>
              <div className={o.grid}>
                <NumberField label={T.quantity} value={item.quantity} onChange={(v) => patch(item.id, 'quantity', v)} />
                {def.specs.map((k) => (
                  <NumberField key={k} label={SPEC_FIELDS[k].label} unit={SPEC_FIELDS[k].unit} value={item[k]} onChange={(v) => patch(item.id, k, v)} />
                ))}
                <TextField label={T.brand} value={item.brand} maxLength={60} onChange={(v) => patch(item.id, 'brand', v)} />
                <TextField label={T.model} value={item.model} maxLength={60} onChange={(v) => patch(item.id, 'model', v)} />
              </div>
              <Group label={T.usage}>
                <ChipGroup multiple={false} options={EQUIPMENT_USAGE} value={item.usage} onChange={(v) => patch(item.id, 'usage', v)} />
              </Group>
              {item.usage !== 'uso_interno' && (
                <>
                  <Group label={T.availability}>
                    <ChipGroup multiple={false} options={AVAILABILITY} value={item.availability} onChange={(v) => patch(item.id, 'availability', v)} />
                  </Group>
                  {offered && (
                    <>
                      <Group label={T.operator}>
                        <ChipGroup multiple={false} options={OPERATOR_MODES} value={item.operator} onChange={(v) => patch(item.id, 'operator', v)} />
                      </Group>
                      <ul className={o.toggles}>
                        <li>
                          <span>{T.rental}</span>
                          <YesNo small label={T.rental} value={item.rental ?? null} onChange={(v) => patch(item.id, 'rental', v)} />
                        </li>
                        <li>
                          <span>{T.sale}</span>
                          <YesNo small label={T.sale} value={item.sale ?? null} onChange={(v) => patch(item.id, 'sale', v)} />
                        </li>
                      </ul>
                      <Field label={T.regions}>
                        {(a) => <TagInput {...a} value={item.regions || []} onChange={(v) => patch(item.id, 'regions', v)} placeholder={T.regionsPlaceholder} max={20} />}
                      </Field>
                    </>
                  )}
                </>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </Group>
  );
}

/* ----------------------------------------------------------- vehicles */
function VehicleEditor({ label, value = [], onChange }) {
  const has = new Set(value.map((v) => v.type));
  const patch = (id, k, v) => onChange(value.map((i) => (i.id === id ? { ...i, [k]: v } : i)));
  return (
    <Group label={label} hint={T.vehiclePick}>
      <ChipGroup
        options={VEHICLE_TYPES}
        value={[...has]}
        onChange={(next) => {
          const added = next.find((t) => !has.has(t));
          const removed = [...has].find((t) => !next.includes(t));
          if (added) onChange([...value, { id: uid(), type: added, quantity: 1 }]);
          else if (removed) onChange(value.filter((i) => i.type !== removed));
        }}
      />
      <AnimatePresence initial={false}>
        {value.map((v) => (
          <motion.div key={v.id} className={o.item} {...reveal}>
            <header className={o.itemHead}>
              <strong>{labelOf(VEHICLE_TYPES, v.type)}</strong>
              <button type="button" className={o.iconBtn} aria-label={`${T.remove} ${labelOf(VEHICLE_TYPES, v.type)}`} onClick={() => onChange(value.filter((i) => i.id !== v.id))}>
                <Trash2 size={15} />
              </button>
            </header>
            <div className={o.grid}>
              <NumberField label={T.quantity} value={v.quantity} onChange={(x) => patch(v.id, 'quantity', x)} />
              <NumberField label={T.payload} unit="t" value={v.payloadTons} onChange={(x) => patch(v.id, 'payloadTons', x)} />
              <NumberField label={T.length} unit="m" value={v.lengthM} onChange={(x) => patch(v.id, 'lengthM', x)} />
              <NumberField label={T.maxWeight} unit="t" value={v.maxWeightTons} onChange={(x) => patch(v.id, 'maxWeightTons', x)} />
              <TextField label={T.baseCity} value={v.baseCity} maxLength={80} onChange={(x) => patch(v.id, 'baseCity', x)} />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </Group>
  );
}

/* -------------------------------------------------------------- lanes */
function LaneEditor({ label, value = [], onChange }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const fromId = useId();
  const toId = useId();
  const add = () => {
    if (from.trim().length < 2 || to.trim().length < 2) return;
    onChange([...value, { id: uid(), from: from.trim(), to: to.trim() }]);
    setFrom('');
    setTo('');
  };
  return (
    <Group label={label}>
      <div className={o.lane}>
        <label htmlFor={fromId} className="sr-only">
          {T.laneFrom}
        </label>
        <Input id={fromId} value={from} onChange={(e) => setFrom(e.target.value)} placeholder={T.lanePlaceholderFrom} maxLength={80} />
        <span aria-hidden="true">→</span>
        <label htmlFor={toId} className="sr-only">
          {T.laneTo}
        </label>
        <Input
          id={toId}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={T.lanePlaceholderTo}
          maxLength={80}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className={o.addBtn} onClick={add} aria-label={T.laneAdd}>
          <Plus size={16} />
        </button>
      </div>
      {value.length > 0 && (
        <ul className={o.laneList}>
          {value.map((l) => (
            <li key={l.id || `${l.from}-${l.to}`}>
              {l.from} → {l.to}
              <button type="button" aria-label={`${T.remove} ${l.from} → ${l.to}`} onClick={() => onChange(value.filter((x) => x !== l))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Group>
  );
}

/* ----------------------------------------------------- buyer requests */
function RequestEditor({ profile, set }) {
  const needs = (profile.buyer?.needs || []).filter((n) => n !== 'outros');
  const requests = profile.buyer?.requests || [];
  // One detail card per marked need (details are kept when needs change).
  useEffect(() => {
    const next = needs.map((n) => requests.find((r) => r.need === n) || { id: uid(), need: n });
    if (JSON.stringify(next) !== JSON.stringify(requests)) set('buyer.requests', next);
  }, [needs.join(','), requests.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (id, k, v) => set('buyer.requests', requests.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  return (
    <Group hint={T.requestHint}>
      {requests.map((r) => {
        const equipment = Boolean(NEED_EQUIPMENT[r.need]);
        const lifting = ['munck', 'guindaste', 'plataforma_elevatoria'].includes(r.need);
        return (
          <div key={r.id} className={o.item}>
            <header className={o.itemHead}>
              <strong>{labelOf(BUYER_NEEDS, r.need)}</strong>
            </header>
            <div className={o.grid}>
              {equipment && <NumberField label={T.minCapacity} unit="t" value={r.minCapacityTons} onChange={(v) => patch(r.id, 'minCapacityTons', v)} />}
              {lifting && <NumberField label={T.height} unit="m" value={r.heightM} onChange={(v) => patch(r.id, 'heightM', v)} />}
              {lifting && <NumberField label={T.reach} unit="m" value={r.reachM} onChange={(v) => patch(r.id, 'reachM', v)} />}
              {lifting && <NumberField label={T.load} unit="t" value={r.loadTons} onChange={(v) => patch(r.id, 'loadTons', v)} />}
              <NumberField label={T.duration} unit={T.days} value={r.durationDays} onChange={(v) => patch(r.id, 'durationDays', v)} />
              <TextField label={T.start} type="date" value={r.startDate} onChange={(v) => patch(r.id, 'startDate', v)} />
              <TextField label={T.end} type="date" value={r.endDate} onChange={(v) => patch(r.id, 'endDate', v)} />
              <TextField label={T.location} value={r.location} maxLength={120} placeholder="Ex.: Campinas/SP" onChange={(v) => patch(r.id, 'location', v)} />
              <NumberField label={T.budget} unit="R$" value={r.budget} onChange={(v) => patch(r.id, 'budget', v)} />
            </div>
            <TextField label={T.serviceType} value={r.serviceType} placeholder="Ex.: içamento de tesouras metálicas" onChange={(v) => patch(r.id, 'serviceType', v)} />
            <ul className={o.toggles}>
              {equipment && (
                <li>
                  <span>{T.requiresOperator}</span>
                  <YesNo small label={T.requiresOperator} value={r.requiresOperator ?? null} onChange={(v) => patch(r.id, 'requiresOperator', v)} />
                </li>
              )}
              {equipment && (
                <li>
                  <span>{T.requiresTransport}</span>
                  <YesNo small label={T.requiresTransport} value={r.requiresTransport ?? null} onChange={(v) => patch(r.id, 'requiresTransport', v)} />
                </li>
              )}
            </ul>
            <Group label={T.urgency}>
              <ChipGroup multiple={false} options={URGENCY} value={r.urgency} onChange={(v) => patch(r.id, 'urgency', v)} />
            </Group>
            <Group label={T.terrain}>
              <ChipGroup multiple={false} options={TERRAIN_TYPES} value={r.terrain} onChange={(v) => patch(r.id, 'terrain', v)} />
            </Group>
          </div>
        );
      })}
    </Group>
  );
}

/* ------------------------------------------------------------- fields */
function FieldView({ f, profile, set, accountType, errors }) {
  if (f.when && !conditionMet(f.when, profile)) return null;
  const value = f.path ? getPath(profile, f.path) : undefined;
  const error = f.path ? errors?.[f.path] : undefined;
  switch (f.type) {
    case 'chips':
      return (
        <Group label={f.label} hint={f.hint || T.multiHint} error={error} count={(value || []).length}>
          <ChipGroup options={f.byAccount ? operationTypesFor(accountType) : f.options} value={value || []} onChange={(v) => set(f.path, v)} icons={f.byAccount} fold={f.byAccount ? 40 : 14} />
        </Group>
      );
    case 'choice':
      return (
        <Group label={f.label} hint={f.hint} error={error}>
          <ChipGroup multiple={false} options={f.options} value={value} onChange={(v) => set(f.path, v)} />
        </Group>
      );
    case 'yesno':
      return (
        <Group label={f.label} hint={f.hint}>
          <YesNo label={f.label} value={value ?? null} onChange={(v) => set(f.path, v)} />
          <AnimatePresence initial={false}>
            {value === true && f.children && (
              <motion.div className={o.children} {...reveal}>
                {f.children.map((c, i) => (
                  <FieldView key={(c.path || c.label) + i} f={c} profile={profile} set={set} accountType={accountType} errors={errors} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </Group>
      );
    case 'toggles':
      return <Toggles label={f.label} items={f.items} profile={profile} set={set} />;
    case 'number':
      return <NumberField label={f.label} unit={f.unit} hint={f.hint} value={value} onChange={(v) => set(f.path, v)} />;
    case 'text':
      return <TextField label={f.label} value={value} placeholder={f.placeholder} maxLength={f.maxLength || 200} onChange={(v) => set(f.path, f.maxLength === 2 ? v.toUpperCase() : v)} />;
    case 'tags':
      return (
        <Field label={f.label} hint={f.hint}>
          {(a) => <TagInput {...a} value={value || []} onChange={(v) => set(f.path, v)} placeholder={f.placeholder} max={20} />}
        </Field>
      );
    case 'equipment':
      return <EquipmentEditor label={f.label} value={value} groups={f.groups} onChange={(v) => set(f.path, v)} />;
    case 'vehicles':
      return <VehicleEditor label={f.label} value={value} onChange={(v) => set(f.path, v)} />;
    case 'lanes':
      return <LaneEditor label={f.label} value={value} onChange={(v) => set(f.path, v)} />;
    case 'requests':
      return <RequestEditor profile={profile} set={set} />;
    default:
      return null;
  }
}

/** Renders a module's fields bound to the profile. `onChange(nextProfile)`. */
export function OperationFields({ fields, profile, onChange, accountType, errors }) {
  const set = (path, value) => onChange((p) => setPath(p, path, value));
  return (
    <div className={o.fields}>
      {fields.map((f, i) => (
        <FieldView key={(f.path || f.label) + i} f={f} profile={profile} set={set} accountType={accountType} errors={errors} />
      ))}
    </div>
  );
}
