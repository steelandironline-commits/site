import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { BR_STATES, INDUSTRY_SUGGESTIONS, formatCnpj, onlyDigits } from '@autopix/shared';
import { executeAction } from '../../lib/actions.js';
import { useApi } from '../../lib/hooks.js';
import { useToast } from '../../lib/toast.jsx';
import { CompanyCard } from '../../components/cards/Cards.jsx';
import { Button, ErrorState, Field, Input, Select, SkeletonCard, TagInput, Textarea } from '../../components/ui/ui.jsx';
import s from './app.module.css';

const TEXT = ['name', 'cnpj', 'website', 'instagram', 'phone', 'city', 'state', 'description', 'idealCustomer'];
const NUM = ['serviceRadiusKm', 'averageTicket', 'minimumDeal'];
const LISTS = ['serviceLocations', 'products', 'services', 'preferredIndustries', 'excludedIndustries', 'keywords'];

function toForm(c) {
  const f = {};
  TEXT.forEach((k) => (f[k] = c[k] ?? ''));
  NUM.forEach((k) => (f[k] = c[k] ?? ''));
  LISTS.forEach((k) => (f[k] = c[k] ?? []));
  f.cnpj = f.cnpj ? formatCnpj(f.cnpj) : '';
  return f;
}

function toPayload(f) {
  const out = {};
  TEXT.forEach((k) => (out[k] = typeof f[k] === 'string' && f[k].trim() === '' ? null : f[k]));
  out.name = f.name;
  NUM.forEach((k) => (out[k] = f[k] === '' || f[k] == null ? null : Number(onlyDigits(String(f[k])))));
  LISTS.forEach((k) => (out[k] = f[k]));
  return out;
}

function Money({ value, onChange, ...rest }) {
  const display = value === '' || value == null ? '' : new Intl.NumberFormat('pt-BR').format(Number(onlyDigits(String(value)) || 0));
  return <Input {...rest} inputMode="numeric" prefix="R$" value={display} onChange={(e) => onChange(onlyDigits(e.target.value))} />;
}

export default function Company() {
  const toast = useToast();
  const { data, error, reload, setData } = useApi('/api/company');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Empresa — TemPix';
  }, []);
  useEffect(() => {
    if (data?.company) setForm(toForm(data.company));
  }, [data?.company]);

  const dirty = useMemo(() => form && data && JSON.stringify(form) !== JSON.stringify(toForm(data.company)), [form, data]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { result: res } = await executeAction('UPDATE_COMPANY_PROFILE', toPayload(form));
      const { payoutPixKey, ...company } = res.company;
      setData({ company: { ...company, payoutPixKeyLast4: payoutPixKey ? payoutPixKey.slice(-4) : null } });
      toast.success(res.searchRequeued ? 'Perfil salvo. Os agentes vão buscar com a nova configuração.' : 'Perfil salvo.');
    } catch (err) {
      setErrors(err.fields || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorState title="Não foi possível carregar a empresa." message={error.message} onRetry={reload} />;
  if (!form) return <SkeletonCard lines={8} />;

  const F = ({ k, label, hint, optional, span, children }) => (
    <div className={span ? s.span2 : undefined}>
      <Field label={label} hint={hint} optional={optional} error={errors[k]}>
        {children}
      </Field>
    </div>
  );

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Empresa</h1>
          <p className={s.pageSub}>Alterações no perfil comercial mudam a configuração das próximas buscas.</p>
        </div>
      </header>

      <div className={s.subGrid} style={{ gridTemplateColumns: undefined }}>
        <form onSubmit={submit} noValidate className={s.panel}>
          <div className={s.formSection}>
            <div className={s.formSectionTitle}>
              <h2>Dados cadastrais</h2>
            </div>
            <div className={s.formGrid}>
              {F({ k: 'name', label: 'Nome da empresa', children: (a) => <Input {...a} value={form.name} onChange={set('name')} /> })}
              {F({ k: 'cnpj', label: 'CNPJ', children: (a) => <Input {...a} inputMode="numeric" value={form.cnpj} onChange={(e) => set('cnpj')(formatCnpj(e.target.value))} /> })}
              {F({ k: 'website', label: 'Website', optional: true, children: (a) => <Input {...a} inputMode="url" value={form.website} onChange={set('website')} /> })}
              {F({ k: 'instagram', label: 'Instagram', optional: true, children: (a) => <Input {...a} value={form.instagram} onChange={set('instagram')} placeholder="@empresa" /> })}
              {F({ k: 'phone', label: 'Telefone', optional: true, children: (a) => <Input {...a} type="tel" value={form.phone} onChange={set('phone')} /> })}
              {F({ k: 'description', label: 'Descrição', optional: true, span: true, children: (a) => <Textarea {...a} value={form.description} onChange={set('description')} maxLength={2000} /> })}
            </div>
          </div>

          <div className={s.formSection}>
            <div className={s.formSectionTitle}>
              <h2>O que você vende</h2>
              <p>Usado para encontrar demandas compatíveis.</p>
            </div>
            <div className={s.formGrid}>
              {F({ k: 'products', label: 'Produtos', span: true, children: (a) => <TagInput {...a} value={form.products} onChange={set('products')} placeholder="Adicionar produto" /> })}
              {F({ k: 'services', label: 'Serviços', span: true, children: (a) => <TagInput {...a} value={form.services} onChange={set('services')} placeholder="Adicionar serviço" /> })}
              {F({ k: 'keywords', label: 'Palavras-chave', span: true, children: (a) => <TagInput {...a} value={form.keywords} onChange={set('keywords')} placeholder="Adicionar termo" max={40} /> })}
              {F({ k: 'averageTicket', label: 'Ticket médio', children: (a) => <Money {...a} value={form.averageTicket} onChange={set('averageTicket')} /> })}
              {F({ k: 'minimumDeal', label: 'Menor negócio aceitável', children: (a) => <Money {...a} value={form.minimumDeal} onChange={set('minimumDeal')} /> })}
            </div>
          </div>

          <div className={s.formSection}>
            <div className={s.formSectionTitle}>
              <h2>Mercado-alvo</h2>
            </div>
            <div className={s.formGrid}>
              {F({ k: 'idealCustomer', label: 'Cliente ideal', span: true, children: (a) => <Textarea {...a} value={form.idealCustomer} onChange={set('idealCustomer')} maxLength={1000} /> })}
              {F({
                k: 'preferredIndustries',
                label: 'Setores preferidos',
                span: true,
                children: (a) => <TagInput {...a} value={form.preferredIndustries} onChange={set('preferredIndustries')} suggestions={INDUSTRY_SUGGESTIONS} placeholder="Adicionar setor" />,
              })}
              {F({
                k: 'excludedIndustries',
                label: 'Setores excluídos',
                span: true,
                children: (a) => <TagInput {...a} value={form.excludedIndustries} onChange={set('excludedIndustries')} placeholder="Adicionar setor" />,
              })}
            </div>
          </div>

          <div className={s.formSection}>
            <div className={s.formSectionTitle}>
              <h2>Região</h2>
            </div>
            <div className={s.formGrid}>
              {F({ k: 'city', label: 'Cidade', children: (a) => <Input {...a} value={form.city} onChange={set('city')} /> })}
              {F({
                k: 'state',
                label: 'UF',
                children: (a) => (
                  <Select {...a} value={form.state} onChange={set('state')}>
                    <option value="">—</option>
                    {BR_STATES.map((uf) => (
                      <option key={uf}>{uf}</option>
                    ))}
                  </Select>
                ),
              })}
              {F({
                k: 'serviceRadiusKm',
                label: 'Raio de atendimento (km)',
                children: (a) => <Input {...a} inputMode="numeric" value={form.serviceRadiusKm} onChange={(e) => set('serviceRadiusKm')(onlyDigits(e.target.value))} />,
              })}
              {F({
                k: 'serviceLocations',
                label: 'Regiões atendidas',
                span: true,
                children: (a) => <TagInput {...a} value={form.serviceLocations} onChange={set('serviceLocations')} placeholder="Ex.: Joinville - SC" />,
              })}
            </div>
          </div>

          <div className={s.stickyBar} style={{ margin: 12 }}>
            <p>{dirty ? 'Alterações não salvas.' : 'Tudo salvo.'}</p>
            <div className={s.pageActions}>
              <Button variant="ghost" disabled={!dirty || saving} onClick={() => setForm(toForm(data.company))}>
                Descartar
              </Button>
              <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>
                Salvar perfil
              </Button>
            </div>
          </div>
        </form>
        <div className={s.stack}>
          <CompanyCard company={data.company} />
        </div>
      </div>
    </>
  );
}
