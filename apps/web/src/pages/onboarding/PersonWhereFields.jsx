import { Field, Input } from '../../components/ui/ui.jsx';
import { travelEstimate } from '@autopix/shared';
import s from './onboarding.module.css';

/** Pessoa física: the CEP where the person lives, and how far they accept to travel for work. */
export function PersonWhereFields({ form, set, errors = {} }) {
  const digits = String(form.postalCode || '').replace(/\D/g, '').slice(0, 8);
  const cep = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  const km = Number(form.serviceRadiusKm) || 0;
  const trip = travelEstimate(km);
  return (
    <>
      <Field label="CEP onde você mora" error={errors.postalCode}>
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
      <Field
        label={`Até quantos km você aceita ir para o trabalho: ${km} km`}
        hint={trip ? `Tempo estimado a 80 km/h: ${trip.oneWay} só de ida, ou ${trip.roundTrip} ida e volta.` : 'Escolha a distância máxima.'}
      >
        {(a) => <input {...a} type="range" min={0} max={200} step={5} className={s.range} value={km} onChange={(e) => set('serviceRadiusKm')(Number(e.target.value))} />}
      </Field>
    </>
  );
}
