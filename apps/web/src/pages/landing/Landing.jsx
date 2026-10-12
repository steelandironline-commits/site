import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Gauge,
  Globe,
  Menu,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { PLAN, formatCents } from '@autopix/shared';
import { Logo } from '../../components/brand/Logo.jsx';
import { Button, DemoBadge, ScoreRing } from '../../components/ui/ui.jsx';
import LazyRadar from '../../components/radar/LazyRadar.jsx';
import { ActivityStream } from '../../components/activity/ActivityStream.jsx';
import { PipelineFlow } from '../../components/activity/Flow.jsx';
import { DEMO_RADAR_NODES, useDemoFeed } from '../../lib/demoFeed.js';
import { useIsMobile } from '../../lib/hooks.js';
import { useSession } from '../../lib/session.jsx';
import Cinematic from './Cinematic.jsx';
import s from './landing.module.css';

const ease = [0.22, 1, 0.36, 1];
const reveal = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease },
};

/* ------------------------------------------------------------------ nav */
function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated } = useSession();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);
  const links = [
    ['#produto', 'Produto'],
    ['#como-funciona', 'Como funciona'],
    ['#oportunidades', 'Oportunidades'],
    ['#preco', 'Preço'],
  ];
  return (
    <header className={`${s.nav} ${scrolled ? s.navScrolled : ''}`}>
      <div className={`container ${s.navInner}`}>
        <Link to="/" aria-label="AutoPix — início">
          <Logo />
        </Link>
        <nav className={s.navLinks} aria-label="Principal">
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className={s.navActions}>
          <Link to={isAuthenticated ? '/app' : '/login'} className={s.navLogin}>
            {isAuthenticated ? 'Painel' : 'Entrar'}
          </Link>
          <Button to="/onboarding" size="sm" className={s.navCta}>
            Ativar AutoPix
          </Button>
          <button type="button" className={s.menuBtn} onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}>
            <Menu size={20} />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className={s.sheet}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className={s.sheetHead}>
              <Logo />
              <button type="button" className={s.menuBtn} onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X size={20} />
              </button>
            </div>
            <nav className={s.sheetLinks}>
              {links.map(([href, label], i) => (
                <motion.a
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                >
                  {label}
                </motion.a>
              ))}
              <Link to={isAuthenticated ? '/app' : '/login'} onClick={() => setOpen(false)}>
                {isAuthenticated ? 'Painel' : 'Entrar'}
              </Link>
            </nav>
            <Button to="/onboarding" size="lg" block>
              ATIVAR AUTOPIX
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ----------------------------------------------------------------- hero */
function Hero() {
  const mobile = useIsMobile();
  return (
    <section id="hero" className={s.hero} aria-labelledby="hero-title">
      <div className={s.heroGrid} aria-hidden="true" />
      <div className={`container ${s.heroInner}`}>
        <motion.div className={s.heroCopy} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
          <p className={s.kicker}>
            <span className={s.kickerDot} aria-hidden="true" /> Sua empresa trabalha. O AutoPix procura oportunidades.
          </p>
          <h2 id="hero-title" className={s.heroTitle}>
            Procuramos vendas e serviços <span>pra você.</span>
          </h2>
          <p className={s.heroLead}>
            Enquanto você trabalha, o AutoPix procura empresas, sinais de demanda e oportunidades comerciais compatíveis com o seu negócio.
          </p>
          <div className={s.heroCtas}>
            <Button to="/onboarding" size="lg" iconRight={ArrowRight}>
              ATIVAR POR R$597/MÊS
            </Button>
            <Button href="#como-funciona" size="lg" variant="outline">
              VER COMO FUNCIONA
            </Button>
          </div>
          <ul className={s.trust}>
            <li>
              <Check size={14} aria-hidden="true" /> Sem fidelidade.
            </li>
            <li>
              <Check size={14} aria-hidden="true" /> Cancele quando quiser.
            </li>
            <li>
              <Check size={14} aria-hidden="true" /> Pagamento via Pix.
            </li>
          </ul>
        </motion.div>

        <motion.div className={s.heroRadar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, delay: 0.2 }}>
          <div className={s.radarFrame}>
            <div className={s.radarHud}>
              <span className="eyebrow">Opportunity radar</span>
              <DemoBadge label="DEMO · ilustrativo" />
            </div>
            <LazyRadar nodes={DEMO_RADAR_NODES} height={mobile ? 340 : 560} demo />
            <div className={s.radarLegend} aria-hidden="true">
              <span>
                <i className={s.lgPrimary} /> Match ≥ 85%
              </span>
              <span>
                <i className={s.lgRevenue} /> 70–84%
              </span>
              <span>
                <i className={s.lgAmber} /> &lt; 70%
              </span>
            </div>
          </div>
        </motion.div>
      </div>
      <a href="#produto" className={s.scrollHint} aria-label="Rolar para o produto">
        <ChevronDown size={18} />
      </a>
    </section>
  );
}

/* -------------------------------------------------------------- product */
function Product() {
  const { events, latest } = useDemoFeed();
  const values = [
    { icon: Radar, title: 'Monitoramento contínuo', text: 'Agentes procuram empresas e sinais no mercado 24 horas por dia.' },
    { icon: Gauge, title: 'Opportunity Score', text: 'Cada oportunidade recebe uma nota explicável de 0 a 100.' },
    { icon: MessageSquareText, title: 'Abordagem pronta', text: 'Sugestões de contato com base no sinal detectado.' },
  ];
  return (
    <section id="produto" className={s.section} aria-labelledby="produto-title">
      <div className="container">
        <motion.header className={s.sectionHead} {...reveal}>
          <p className="eyebrow">Produto</p>
          <h2 id="produto-title">O AutoPix está trabalhando para sua empresa.</h2>
          <p>Cada busca, cada site analisado e cada sinal aparece no seu painel no momento em que acontece.</p>
        </motion.header>

        <div className={s.productGrid}>
          <motion.div className={s.flowCard} {...reveal}>
            <header className={s.flowHead}>
              <span className="eyebrow">Pipeline de inteligência comercial</span>
              <DemoBadge />
            </header>
            <PipelineFlow latest={latest} />
            <ul className={s.values}>
              {values.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <Icon size={18} aria-hidden="true" />
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }}>
            <ActivityStream events={events} mode="demo" demo title="Atividade" max={8} className={s.landingStream} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- how it works */
const STEPS = [
  { n: '01', title: 'ENTENDEMOS SUA EMPRESA', text: 'Você diz o que vende e quem quer encontrar.', icon: Building2, detail: ['Produtos e serviços', 'Cliente ideal', 'Região e raio', 'Ticket médio'] },
  { n: '02', title: 'PROCURAMOS O MERCADO', text: 'O AutoPix monitora fontes comerciais.', icon: Globe, detail: ['Busca web', 'Sites institucionais', 'Notícias regionais', 'Cadastros públicos'] },
  { n: '03', title: 'DETECTAMOS SINAIS', text: 'Novos projetos. Expansões. Contratações. Compras. Obras. Demandas.', icon: Zap, detail: ['Expansão', 'Obras', 'Compras e cotações', 'Contratações'] },
  { n: '04', title: 'CLASSIFICAMOS', text: 'Cada oportunidade recebe um score.', icon: Target, detail: ['Setor', 'Serviços compatíveis', 'Localização', 'Força do sinal', 'Valor'] },
  { n: '05', title: 'VOCÊ VENDE', text: 'As melhores oportunidades chegam ao painel.', icon: ArrowRight, detail: ['Prioridade', 'Contato comercial público', 'Abordagem sugerida', 'Status do funil'] },
];

function HowItWorks() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];
  const onKey = (e) => {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + STEPS.length) % STEPS.length;
    setActive(next);
    document.getElementById(`step-tab-${next}`)?.focus();
  };
  return (
    <section id="como-funciona" className={`${s.section} ${s.sectionAlt}`} aria-labelledby="como-title">
      <div className="container">
        <motion.header className={s.sectionHead} {...reveal}>
          <p className="eyebrow">Como funciona</p>
          <h2 id="como-title">Do perfil da sua empresa à oportunidade qualificada.</h2>
        </motion.header>
        <div className={s.steps}>
          <div className={s.stepList} role="tablist" aria-label="Etapas" aria-orientation="vertical" onKeyDown={onKey}>
            {STEPS.map((st, i) => (
              <button
                key={st.n}
                id={`step-tab-${i}`}
                type="button"
                role="tab"
                aria-selected={active === i}
                aria-controls="step-panel"
                tabIndex={active === i ? 0 : -1}
                className={`${s.stepTab} ${active === i ? s.stepTabActive : ''}`}
                onClick={() => setActive(i)}
              >
                <span className={s.stepN}>{st.n}</span>
                <span className={s.stepT}>{st.title}</span>
                {active === i && <motion.span layoutId="step-bar" className={s.stepBar} transition={{ duration: 0.35, ease }} />}
              </button>
            ))}
          </div>
          <div id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${active}`} className={s.stepPanel}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease }}
                className={s.stepPanelInner}
              >
                <span className={s.stepIcon}>
                  <step.icon size={22} aria-hidden="true" />
                </span>
                <p className={s.stepNum}>Step {step.n}</p>
                <h3>{step.title}</h3>
                <p className={s.stepText}>{step.text}</p>
                <ul className={s.stepDetail}>
                  {step.detail.map((d, i) => (
                    <motion.li key={d} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i + 0.1 }}>
                      <span aria-hidden="true">›</span> {d}
                    </motion.li>
                  ))}
                </ul>
                <div className={s.stepProgress} aria-hidden="true">
                  {STEPS.map((_, i) => (
                    <span key={i} className={i <= active ? s.stepProgressOn : ''} />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- live demo */
function LiveDemo() {
  const [open, setOpen] = useState(false);
  return (
    <section id="oportunidades" className={s.section} aria-labelledby="demo-title">
      <div className="container">
        <motion.header className={s.sectionHead} {...reveal}>
          <p className="eyebrow">Oportunidades</p>
          <h2 id="demo-title">É isso que chega ao seu painel.</h2>
          <p>Empresa fictícia, para demonstração.</p>
        </motion.header>
        <motion.div className={s.preview} {...reveal}>
          <div className={s.previewChrome} aria-hidden="true">
            <span />
            <span />
            <span />
            <p className="mono">autopix / app / oportunidades</p>
            <DemoBadge />
          </div>
          <div className={s.previewBody}>
            <div className={s.previewMain}>
              <div className={s.previewTop}>
                <div>
                  <p className="eyebrow">Oportunidade</p>
                  <h3 className={s.previewCompany}>INDÚSTRIA PORTO ATLÂNTICO</h3>
                  <p className={s.previewMeta}>Indústria · Joinville / SC</p>
                </div>
                <div className={s.previewScore}>
                  <span className="eyebrow">Match</span>
                  <ScoreRing score={94} size={72} />
                </div>
              </div>
              <dl className={s.previewFacts}>
                <div>
                  <dt>Signal</dt>
                  <dd>Nova expansão operacional.</dd>
                </div>
                <div>
                  <dt>Serviços compatíveis</dt>
                  <dd className={s.previewChips}>
                    <span>Usinagem</span>
                    <span>Caldeiraria</span>
                    <span>Manutenção</span>
                  </dd>
                </div>
                <div>
                  <dt>Valor potencial</dt>
                  <dd className={s.previewValue}>R$20.000 – R$60.000</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={s.previewHigh}>● ALTA PRIORIDADE</span>
                  </dd>
                </div>
              </dl>
              <Button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="demo-detail" iconRight={ArrowRight}>
                {open ? 'OCULTAR DETALHES' : 'VER OPORTUNIDADE'}
              </Button>
            </div>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  id="demo-detail"
                  className={s.previewDetail}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease }}
                >
                  <div className={s.previewDetailInner}>
                    <div>
                      <p className="eyebrow">Por que o AutoPix selecionou</p>
                      <ul>
                        <li>Setor preferencial: Indústria</li>
                        <li>Demanda compatível com usinagem e caldeiraria</li>
                        <li>Dentro da região de atendimento (Joinville/SC)</li>
                        <li>Expansão operacional identificada em fonte pública</li>
                      </ul>
                    </div>
                    <div>
                      <p className="eyebrow">Abordagem sugerida</p>
                      <p className={s.previewApproach}>
                        “Olá! Vi que vocês estão em fase de expansão operacional. Atendemos indústrias da região com usinagem, caldeiraria e
                        manutenção. Podemos agendar 15 minutos para entender a demanda?”
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- pricing */
function Pricing() {
  return (
    <section id="preco" className={`${s.section} ${s.sectionAlt}`} aria-labelledby="preco-title">
      <div className="container">
        <motion.header className={s.sectionHead} {...reveal}>
          <p className="eyebrow">Preço</p>
          <h2 id="preco-title">Um plano. Tudo incluído.</h2>
        </motion.header>
        <motion.article className={s.price} {...reveal}>
          <div className={s.priceTop}>
            <Logo />
            <p className={s.priceValue}>
              <span className={s.priceCurrency}>R$</span>597<span className={s.pricePer}>/mês</span>
            </p>
            <p className={s.priceNote}>{formatCents(PLAN.priceCents)} por mês, via Pix. Sem fidelidade.</p>
          </div>
          <ul className={s.priceList}>
            {PLAN.features.map((f) => (
              <li key={f}>
                <Check size={15} aria-hidden="true" /> {f}
              </li>
            ))}
          </ul>
          <Button to="/onboarding" size="lg" block iconRight={ArrowRight}>
            ATIVAR COM PIX
          </Button>
          <p className={s.priceSafe}>
            <ShieldCheck size={14} aria-hidden="true" /> Pagamento confirmado pelo provedor. Sua senha é criada por você, nunca enviada por e-mail.
          </p>
        </motion.article>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className={s.final}>
      <div className="container">
        <motion.div className={s.finalInner} {...reveal}>
          <h2>Sua empresa trabalha. O AutoPix procura oportunidades.</h2>
          <Button to="/onboarding" size="lg" iconRight={ArrowRight}>
            ATIVAR AUTOPIX
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={s.footer}>
      <div className={`container ${s.footerInner}`}>
        <Logo />
        <p>© {new Date().getFullYear()} AutoPix. Procuramos vendas e serviços pra você.</p>
        <nav aria-label="Rodapé">
          <Link to="/login">Entrar</Link>
          <a href="#preco">Preço</a>
          <a href="#como-funciona">Como funciona</a>
        </nav>
      </div>
      <p className={`container ${s.footerNote}`}>
        O AutoPix utiliza apenas informações públicas de empresas. Nunca consultamos bases vazadas nem coletamos dados pessoais privados.
      </p>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => {
    document.title = 'AutoPix — Procuramos vendas e serviços pra você';
  }, []);
  return (
    <>
      <a href="#main" className="skip-link">
        Pular para o conteúdo
      </a>
      <Nav />
      <main id="main">
        <Cinematic />
        <Hero />
        <Product />
        <HowItWorks />
        <LiveDemo />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
