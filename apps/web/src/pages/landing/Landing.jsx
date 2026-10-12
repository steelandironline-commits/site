import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Gauge,
  Menu,
  MessageSquareText,
  Radar,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PLAN, formatCents } from '@autopix/shared';
import { Logo } from '../../components/brand/Logo.jsx';
import { Button, DemoBadge, ScoreRing } from '../../components/ui/ui.jsx';
import { ActivityStream } from '../../components/activity/ActivityStream.jsx';
import { PipelineFlow } from '../../components/activity/Flow.jsx';
import { useDemoFeed } from '../../lib/demoFeed.js';
import { useSession } from '../../lib/session.jsx';
import Descent from './descent/Descent.jsx';
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
  const [immersive, setImmersive] = useState(true);
  const { isAuthenticated } = useSession();
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      const stage = document.querySelector('[data-immersive]');
      setImmersive(Boolean(stage) && stage.getBoundingClientRect().bottom > 64);
    };
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
    <header className={`${s.nav} ${scrolled ? (immersive ? s.navGlass : s.navScrolled) : ''}`}>
      <div className={`container ${s.navInner}`}>
        <Link to="/" aria-label="TemPix — início">
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
            Cadastre-se
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
              CADASTRE-SE AGORA
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
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
          <h2 id="produto-title">O TemPix está trabalhando para sua empresa.</h2>
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
            <p className="mono">tempix / app / oportunidades</p>
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
                      <p className="eyebrow">Por que o TemPix selecionou</p>
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
          <h2>Tem emprego, tem rota, tem serviço. <span>TemPix.</span></h2>
          <Button to="/onboarding" size="lg" iconRight={ArrowRight}>
            CADASTRE-SE AGORA
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
        <p>© {new Date().getFullYear()} TemPix. Tem emprego, tem rota, tem serviço.</p>
        <nav aria-label="Rodapé">
          <Link to="/login">Entrar</Link>
          <a href="#preco">Preço</a>
          <a href="#como-funciona">Como funciona</a>
        </nav>
      </div>
      <p className={`container ${s.footerNote}`}>
        O TemPix utiliza apenas informações públicas de empresas. Nunca consultamos bases vazadas nem coletamos dados pessoais privados.
      </p>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => {
    document.title = 'TemPix — Tem emprego, tem rota, tem serviço';
  }, []);
  return (
    <>
      <a href="#main" className="skip-link">
        Pular para o conteúdo
      </a>
      <Nav />
      <main id="main">
        <Descent />
        <Product />
        <LiveDemo />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
