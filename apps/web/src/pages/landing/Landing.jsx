import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Download,
  Gauge,
  Menu,
  MessageSquareText,
  Radar,
  Share,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PRICING, formatCents } from '@autopix/shared';
import { BRLSymbol, BRLText, Button, Dialog, Logo, ScoreRing, isIos, useInstallPrompt, useSession } from '@autopix/ui';
import { WhatsAppIcon } from '../../components/brand/WhatsAppIcon.jsx';
import { ActivityStream } from '../../components/activity/ActivityStream.jsx';
import ProductStage from './ProductStage.jsx';
import { useDemoFeed } from '../../lib/demoFeed.js';
import Descent from './descent/Descent.jsx';
import { ConstructionSection, Ecosystem, Maritime } from './sectors/Sectors.jsx';
import s from './landing.module.css';

const ease = [0.22, 1, 0.36, 1];
const reveal = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease },
};

/* ------------------------------------------------------------ download */
/** "Instalar App": installs the TemPix app (PWA). iPhone gets the two-tap instructions. */
function DownloadButton({ block = false }) {
  const { installed, canPrompt, prompt } = useInstallPrompt();
  const navigate = useNavigate();
  const [help, setHelp] = useState(null);
  const onClick = async () => {
    if (installed) return navigate('/app');
    if (canPrompt) {
      const outcome = await prompt();
      if (outcome !== 'unavailable') return undefined;
    }
    setHelp(isIos() ? 'ios' : 'other');
    return undefined;
  };
  return (
    <>
      <Button size={block ? 'lg' : 'sm'} block={block} icon={Download} onClick={onClick} className={block ? undefined : s.navCta}>
        {block ? 'INSTALAR APP' : 'Instalar App'}
      </Button>
      <Dialog
        open={Boolean(help)}
        title="Instale o app TemPix"
        onClose={() => setHelp(null)}
        actions={
          <Button size="sm" onClick={() => setHelp(null)}>
            ENTENDI
          </Button>
        }
      >
        {help === 'ios' ? (
          <ol className={s.installSteps}>
            <li>
              No Safari, toque em <Share size={15} aria-hidden="true" /> <strong>Compartilhar</strong>.
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>Abra o TemPix pelo ícone, como qualquer app.</li>
          </ol>
        ) : (
          <ol className={s.installSteps}>
            <li>
              No Android, abra este site no <strong>Chrome</strong> e toque em <strong>Instalar app</strong> no menu ⋮.
            </li>
            <li>
              No computador, use o ícone de instalar na barra de endereço do <strong>Chrome</strong> ou do <strong>Edge</strong>.
            </li>
            <li>O TemPix abre como app, com avisos de clientes, cargas e Pix.</li>
          </ol>
        )}
      </Dialog>
    </>
  );
}

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
    ['#setores', 'Setores'],
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
          <DownloadButton />
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
            <Button to="/onboarding" size="lg" block icon={WhatsAppIcon} iconRight={ArrowRight}>
              CADASTRE-SE AGORA
            </Button>
            <DownloadButton block />
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* -------------------------------------------------------------- product */
function Product() {
  const { events } = useDemoFeed();
  const values = [
    { icon: Radar, title: 'Monitoramento contínuo', text: 'Agentes procuram empresas e sinais no mercado 24 horas por dia.' },
    { icon: Gauge, title: 'Nota de oportunidade', text: 'Cada oportunidade recebe uma nota de 0 a 100, com o motivo explicado.' },
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
              <span className="eyebrow">Como o TemPix encontra oportunidades</span>
            </header>
            <ProductStage />
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
            <ActivityStream events={events} mode="demo" demo badge={false} title="Atividade" max={8} className={s.landingStream} />
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
          <p>Uma oportunidade encontrada pelos agentes, com o motivo e a abordagem sugerida.</p>
        </motion.header>
        <motion.div className={s.preview} {...reveal}>
          <div className={s.previewChrome} aria-hidden="true">
            <span />
            <span />
            <span />
            <p className="mono">tempix / app / oportunidades</p>
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
                  <span className="eyebrow">Compatível</span>
                  <ScoreRing score={94} size={72} />
                </div>
              </div>
              <dl className={s.previewFacts}>
                <div>
                  <dt>Sinal</dt>
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
                  <dd className={s.previewValue}><BRLText>R$20.000 – R$60.000</BRLText></dd>
                </div>
                <div>
                  <dt>Situação</dt>
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
const perDay = (cents) => (cents / 100 / 365).toFixed(2).replace('.', ',');

function Pricing() {
  const fee = PRICING.commissionLabel;
  const { config } = useSession();
  const signup = config?.billing?.companySignupFeeCents ?? PRICING.companySignupFeeCents;
  return (
    <section id="preco" className={`${s.section} ${s.sectionAlt}`} aria-labelledby="preco-title">
      <div className="container">
        <motion.header className={s.sectionHead} {...reveal}>
          <p className="eyebrow">Preço</p>
          <h2 id="preco-title">Sem mensalidade. Nunca.</h2>
          <p>
            Profissional entra grátis. Empresa paga só um cadastro, uma única vez. Depois, o TemPix só ganha quando você ganha: {fee} dos
            valores intermediados com sucesso.
          </p>
        </motion.header>
        <div className={s.priceGrid}>
          <motion.article className={s.price} {...reveal}>
            <div className={s.priceTop}>
              <p className="eyebrow">Cadastro Pessoa Física · login pelo CPF</p>
              <p className={s.priceValue}>
                <BRLSymbol className={s.priceCurrency} style={{ verticalAlign: '0.19em', marginRight: '0.04em' }} />0<span className={s.pricePer}> para sempre</span>
              </p>
              <p className={s.priceNote}>Para trabalhadores e autônomos se identificarem e receberem vagas, serviços e fretes.</p>
            </div>
            <ul className={s.priceList}>
              {PRICING.person.map((f) => (
                <li key={f}>
                  <Check size={15} aria-hidden="true" /> <BRLText>{f}</BRLText>
                </li>
              ))}
            </ul>
            <Button to="/onboarding?tipo=profissional" size="lg" block variant="outline" iconRight={ArrowRight}>
              CADASTRAR GRÁTIS
            </Button>
          </motion.article>
          <motion.article className={`${s.price} ${s.priceMain}`} {...reveal} transition={{ ...reveal.transition, delay: 0.08 }}>
            <div className={s.priceTop}>
              <p className="eyebrow">Cadastro Empresas · CNPJ ou MEI</p>
              <p className={s.priceValue}>
                <BRLSymbol className={s.priceCurrency} style={{ verticalAlign: '0.19em', marginRight: '0.04em' }} />0<span className={s.pricePer}>/mês</span>
              </p>
              <p className={s.priceNote}>
                <BRLText>Cadastro único de {formatCents(signup)}: menos de R$ {perDay(signup)} por dia no primeiro ano, e nada de mensalidade depois.</BRLText>
              </p>
            </div>
            <ul className={`${s.priceList} gold-icons`}>
              {PRICING.company.map((f) => (
                <li key={f}>
                  <Check size={15} aria-hidden="true" /> <BRLText>{f}</BRLText>
                </li>
              ))}
            </ul>
            <Button to="/onboarding?tipo=empresa" size="lg" block iconRight={ArrowRight}>
              CADASTRAR EMPRESA
            </Button>
          </motion.article>
        </div>
        <motion.div className={s.priceFoot} {...reveal}>
          <p>
            <strong><BRLText>Em todo valor intermediado com sucesso: {fee}.</BRLText></strong>{' '}
            <BRLText>Exemplo: contrato de R$ 10.000,00 → R$ 500,00 para o TemPix e R$ 9.500,00 para quem executou.</BRLText>
          </p>
          <p className={s.priceSafe}>
            <ShieldCheck size={14} aria-hidden="true" /> Pagamento assegurado até a conclusão: em obras, serviços, rotas e transportes, o valor fica
            protegido na instituição de pagamento parceira e só é liberado quando a conclusão é confirmada.
          </p>
          <div className={s.priceCtas}>
            <Button to="/login" size="lg" variant="outline">
              FAZER LOGIN
            </Button>
            <Button to="/onboarding" size="lg" icon={WhatsAppIcon} iconRight={ArrowRight}>
              CADASTRE-SE AGORA
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className={s.final}>
      <div className="container">
        <motion.div className={s.finalInner} {...reveal}>
          <h2>
            Tem emprego, tem rota, tem serviço. <span>TemPix.</span>
          </h2>
          <p className={s.finalSub}>Profissional entra grátis · empresa paga só o cadastro, uma vez · sem mensalidade</p>
          <div className={s.priceCtas}>
            <Button to="/login" size="lg" variant="outline">
              FAZER LOGIN
            </Button>
            <Button to="/onboarding" size="lg" icon={WhatsAppIcon} iconRight={ArrowRight}>
              CADASTRE-SE AGORA
            </Button>
          </div>
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
      <main id="main" style={{ overflowX: 'clip' }}>
        <Descent />
        <Ecosystem />
        <Maritime />
        <ConstructionSection />
        <Product />
        <LiveDemo />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

