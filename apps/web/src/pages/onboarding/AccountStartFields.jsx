import { Building2, UserRound } from 'lucide-react';
import { formatCnpj, formatCpf } from '@autopix/shared';
import { BRLText } from '../../components/brand/BRLIcon.jsx';
import { Field, Input } from '../../components/ui/ui.jsx';
import s from './onboarding.module.css';

/** Shared first step: both account types require an e-mail; company name is separate. */
export function AccountStartFields({ account, setAccount, errors = {}, hasSession, feeLabel }) {
  return (
    <>
      <div className={s.typeChoice} role="radiogroup" aria-label="Tipo de cadastro">
        {[
          { type: 'PERSON', Icon: UserRound, title: 'Cadastro Pessoa Física', note: 'Login pelo CPF · grátis' },
          { type: 'COMPANY', Icon: Building2, title: 'Cadastro Empresas', note: `CNPJ ou MEI · taxa única de ${feeLabel}` },
        ].map(({ type, Icon, title, note }) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={account.accountType === type}
            className={[account.accountType === type ? s.typeOn : '', type === 'COMPANY' ? `${s.typeGold} gold-icons` : ''].join(' ').trim() || undefined}
            disabled={hasSession}
            onClick={() => setAccount({ ...account, accountType: type, document: account.accountType === type ? account.document : '' })}
          >
            <Icon size={20} aria-hidden="true" />
            <strong>{title}</strong>
            <span><BRLText>{note}</BRLText></span>
          </button>
        ))}
      </div>
      {errors.accountType && <p className={s.formError} role="alert">{errors.accountType}</p>}
      <Field label="Seu nome" error={errors.name}>
        {(a) => <Input {...a} autoComplete="name" value={account.name} disabled={hasSession} onChange={(e) => setAccount({ ...account, name: e.target.value })} />}
      </Field>
      {account.accountType && (
        <Field
          label={account.accountType === 'COMPANY' ? 'CNPJ (empresa ou MEI)' : 'CPF'}
          hint={account.accountType === 'COMPANY' ? 'Será o login da empresa: um login por CNPJ. Colaboradores entram com o próprio CPF.' : 'Será o seu login.'}
          error={errors.document}
        >
          {(a) => (
            <Input
              {...a}
              inputMode="numeric"
              autoComplete="off"
              placeholder={account.accountType === 'COMPANY' ? '00.000.000/0000-00' : '000.000.000-00'}
              value={account.document}
              disabled={hasSession}
              onChange={(e) => setAccount({ ...account, document: account.accountType === 'COMPANY' ? formatCnpj(e.target.value) : formatCpf(e.target.value) })}
              maxLength={account.accountType === 'COMPANY' ? 18 : 14}
            />
          )}
        </Field>
      )}
      {account.accountType === 'COMPANY' && (
        <Field label="Nome da empresa" error={errors.companyName}>
          {(a) => <Input {...a} autoComplete="organization" value={account.companyName} disabled={hasSession} onChange={(e) => setAccount({ ...account, companyName: e.target.value })} />}
        </Field>
      )}
      <Field label="E-mail" hint="Para ativar a conta e recuperar a senha." error={errors.email}>
        {(a) => (
          <Input
            {...a}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={account.email}
            disabled={hasSession}
            onChange={(e) => setAccount({ ...account, email: e.target.value })}
          />
        )}
      </Field>
    </>
  );
}
