import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, Field, Input, Select, useApi } from '@autopix/ui';
import { useAction } from '../../lib/actions.js';
import s from './app.module.css';

/** Chave Pix de recebimento da empresa. Conta de repasse é da área de empresas (Q4). */
export function PayoutCard() {
  const { data, reload } = useApi('/api/company');
  const { run, busy } = useAction();
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('CNPJ');
  const company = data?.company;
  return (
    <section className={`${s.panel} ${s.panelPad}`} aria-labelledby="payout-title">
      <h2 id="payout-title" className={s.panelTitle}>
        <KeyRound size={15} style={{ verticalAlign: -2 }} aria-hidden="true" /> Chave Pix de recebimento
      </h2>
      <p className={s.muted} style={{ fontSize: 13, margin: '6px 0 12px' }}>
        {company?.payoutPixKeyType
          ? `Atual: ${company.payoutPixKeyType} terminando em ${company.payoutPixKeyLast4}.`
          : 'Nenhuma chave cadastrada. Necessária para liberar pagamentos protegidos.'}{' '}
        Alterar exige confirmação com senha.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await run('CHANGE_BANK_DETAILS', { pixKey, pixKeyType });
          reload();
        }}
        noValidate
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <div style={{ width: 120 }}>
          <Field label="Tipo">
            {(a) => (
              <Select {...a} value={pixKeyType} onChange={(e) => setPixKeyType(e.target.value)}>
                {['CNPJ', 'CPF', 'EMAIL', 'PHONE', 'EVP'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Field label="Chave">{(a) => <Input {...a} value={pixKey} onChange={(e) => setPixKey(e.target.value)} autoComplete="off" />}</Field>
        </div>
        <Button type="submit" variant="secondary" loading={busy === 'CHANGE_BANK_DETAILS'} disabled={pixKey.trim().length < 5}>
          Alterar
        </Button>
      </form>
    </section>
  );
}
