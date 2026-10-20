import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Field, Input } from '@autopix/ui';
import { travelEstimate } from '@autopix/shared';
import { api } from '../../lib/api.js';
import s from './onboarding.module.css';

/** Pessoa física: the CEP where the person lives, and how far they accept to travel for work. */
export function PersonWhereFields({ form, set, errors = {} }) {
  const digits = String(form.postalCode || '').replace(/\D/g, '').slice(0, 8);
  const cep = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  const km = Number(form.serviceRadiusKm) || 0;
  const trip = travelEstimate(km);
  const [place, setPlace] = useState({ state: 'idle' }); // idle | loading | found | missing | offline

  // A full CEP shows the city right away and fills cidade/UF for matching nearby work.
  useEffect(() => {
    if (digits.length !== 8) {
      setPlace({ state: 'idle' });
      return undefined;
    }
    let live = true;
    setPlace({ state: 'loading' });
    api(`/api/cep/${digits}`)
      .then(({ cep: found }) => {
        if (!live) return;
        setPlace({ state: 'found', label: `${found.district ? `${found.district}, ` : ''}${found.city} – ${found.state}` });
        set('city')(found.city);
        set('state')(found.state);
      })
      .catch((err) => {
        if (!live) return;
        setPlace({ state: err.status === 404 ? 'missing' : 'offline', message: err.message });
        if (err.status === 404) {
          set('city')('');
          set('state')('');
        }
      });
    return () => {
      live = false;
    };
    // Only a new CEP triggers a lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const hint =
    place.state === 'loading' ? 'Buscando a cidade…' : place.state === 'found' ? null : place.state === 'idle' ? 'Só os 8 números.' : undefined;

  return (
    <>
      <Field label="CEP onde você mora" hint={hint} error={errors.postalCode || (place.state === 'missing' ? place.message : undefined)}>
        {(a) => (
          <Input
            {...a}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => set('postalCode')(e.target.value.replace(/\D/g, '').slice(0, 8))}
          />
        )}
      </Field>
      {place.state === 'found' && (
        <p className={s.cepPlace} role="status">
          <MapPin size={14} aria-hidden="true" /> {place.label}
        </p>
      )}
      {place.state === 'offline' && <p className={s.cepNote}>{place.message}</p>}
      <Field
        label={`Até quantos km você aceita ir para o trabalho: ${km} km`}
        hint={trip ? `Tempo estimado a 80 km/h: ${trip.oneWay} só de ida, ou ${trip.roundTrip} ida e volta.` : 'Escolha a distância máxima.'}
      >
        {(a) => <input {...a} type="range" min={0} max={200} step={5} className={s.range} value={km} onChange={(e) => set('serviceRadiusKm')(Number(e.target.value))} />}
      </Field>
    </>
  );
}
