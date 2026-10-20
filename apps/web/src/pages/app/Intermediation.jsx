/* Intermediação: compatible buyers and suppliers (anonymous), the company's
   offer and demand, and where each negotiation stands. Real data only. */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Boxes, ClipboardList, FileSignature, Handshake, Inbox, Network, PackageSearch, Send, ShieldCheck, ShoppingCart, Store } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, SkeletonCard, useApi, useBrand } from '@autopix/ui';
import { CapabilityList, CompletenessMeter } from '../onboarding/operations/ProfileOverview.jsx';
import s from './app.module.css';
import x from './ops.module.css';

const FLOW = ['Oportunidade', 'Cotação', 'Contrato', 'Execução', 'Pagamento'];

function Stat({ icon: Icon, label, value, soon }) {
  return (
    <div className={x.stat}>
      <Icon size={16} aria-hidden="true" />
      <span className={x.statLabel}>{label}</span>
      <strong className={`${x.statValue} num`}>{soon ? '—' : value}</strong>
      {soon && <small className={x.soon}>em breve</small>}
    </div>
  );
}

function MatchList({ title, icon: Icon, items, empty }) {
  return (
    <section className={`${s.panel} ${s.panelPad}`} aria-label={title}>
      <h2 className={s.panelTitle}>
        <Icon size={15} style={{ verticalAlign: -2 }} aria-hidden="true" /> {title}
      </h2>
      {items.length ? (
        <ul className={x.matches}>
          {items.map((m, i) => (
            <li key={`${m.label}-${i}`}>
              <div className={x.matchHead}>
                <strong>{m.label}</strong>
                <Badge tone="primary">{m.score}% compatível</Badge>
              </div>
              {m.need && <p className={x.matchNeed}>{m.need}</p>}
              {m.reasons?.length > 0 && (
                <ul className={x.reasons}>
                  {m.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={x.note}>{empty}</p>
      )}
    </section>
  );
}

export default function Intermediation({ copy }) {
  const { data, error, reload } = useApi('/api/intermediation');
  const { name } = useBrand();

  useEffect(() => {
    document.title = `Intermediação — ${name}`;
  }, [name]);

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <SkeletonCard lines={6} />;
  const c = data.counts;

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Intermediação</h1>
          <p className={s.pageSub}>Quem precisa encontra quem fornece. Quem fornece encontra quem precisa. O {name} faz a ponte.</p>
        </div>
        <Button to="/app/operacao" variant="outline" icon={ClipboardList}>
          Perfil operacional
        </Button>
      </header>

      {!data.hasProfile && (
        <EmptyState
          title="Complete seu perfil operacional"
          message={`Conte o que sua empresa faz, quais equipamentos possui e o que precisa contratar. A partir disso o ${name} encontra compradores e fornecedores compatíveis.`}
          action={
            <Button to="/app/operacao" iconRight={ArrowRight}>
              Completar perfil
            </Button>
          }
        />
      )}

      <div className={x.stats}>
        <Stat icon={Inbox} label="Oportunidades recebidas" value={c.opportunitiesReceived} />
        <Stat icon={Send} label="Demandas publicadas" value={c.demandsPublished} />
        <Stat icon={Store} label="Fornecedores compatíveis" value={c.compatibleSuppliers} />
        <Stat icon={ShoppingCart} label="Compradores compatíveis" value={c.compatibleBuyers} />
        <Stat icon={Boxes} label="Equipamentos disponíveis" value={c.equipmentOffered} />
        <Stat icon={PackageSearch} label="Demandas de equipamentos" value={c.equipmentDemands} />
        <Stat icon={FileSignature} label="Cotações enviadas e recebidas" soon />
        <Stat icon={Handshake} label="Contratos em andamento" value={c.contractsInProgress} />
      </div>

      <section className={`${s.panel} ${s.panelPad}`} aria-label="Status da negociação">
        <h2 className={s.panelTitle}>
          <Network size={15} style={{ verticalAlign: -2 }} aria-hidden="true" /> Status da negociação
        </h2>
        <ol className={x.flow}>
          {FLOW.map((step, i) => (
            <li key={step} className={i === 0 || (i >= 2 && c.contractsInProgress) ? x.flowOn : undefined}>
              <span>{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className={x.note}>
          <ShieldCheck size={13} style={{ verticalAlign: -2 }} aria-hidden="true" /> Os dados das empresas ficam protegidos: a aproximação, a cotação e o contrato acontecem pelo {name}. {copy.payments.before}<Link to="/app/pay">{copy.payments.label}</Link>{copy.payments.after}
        </p>
      </section>

      <div className={x.two}>
        <MatchList
          title="Fornecedores compatíveis"
          icon={Store}
          items={data.suppliers}
          empty={data.sides.buys ? 'Ainda não há fornecedores compatíveis com suas necessidades. Avisamos quando surgir um.' : 'Cadastre o que sua empresa precisa contratar para ver fornecedores compatíveis.'}
        />
        <MatchList
          title="Compradores compatíveis"
          icon={ShoppingCart}
          items={data.buyers}
          empty={data.sides.supplies ? 'Ainda não há compradores com demandas compatíveis. Avisamos quando surgir um.' : 'Cadastre equipamentos, serviços ou frota para ver compradores compatíveis.'}
        />
      </div>

      <div className={x.two}>
        <section className={`${s.panel} ${s.panelPad}`} aria-label="Capacidades">
          <h2 className={s.panelTitle}>Capacidades operacionais</h2>
          <CompletenessMeter value={data.completeness} hint={false} />
          <CapabilityList lines={data.capabilities} empty="Nenhuma capacidade cadastrada ainda." />
        </section>
      </div>
    </>
  );
}
