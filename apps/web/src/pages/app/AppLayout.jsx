import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Download, LogOut, MoreHorizontal, RefreshCw, X } from 'lucide-react';
import { SUBSCRIPTION_STATUS_LABELS } from '@autopix/shared';
import {
  Button,
  DemoBadge,
  Logo,
  PageLoader,
  SkeletonCard,
  safeStorage,
  useActivityStream,
  useInstallPrompt,
  useIsMobile,
  useServiceWorkerUpdate,
  useSession,
} from '@autopix/ui';
import s from './app.module.css';

function InstallBanner() {
  const install = useInstallPrompt();
  const storage = safeStorage();
  const [dismissed, setDismissed] = useState(() => storage?.getItem('autopix:install-dismissed') === '1');
  if (install.installed || dismissed || (!install.canPrompt && !install.iosInstructions)) return null;
  const close = () => {
    try {
      storage?.setItem('autopix:install-dismissed', '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };
  return (
    <div className={s.banner} role="region" aria-label="Instalar aplicativo">
      <Download size={16} aria-hidden="true" />
      <p>{install.canPrompt ? 'Instale o TemPix para usar em tela cheia.' : 'No Safari: Compartilhar → Adicionar à Tela de Início.'}</p>
      {install.canPrompt && (
        <Button size="sm" onClick={() => install.prompt().then(close)}>
          Instalar
        </Button>
      )}
      <button type="button" className={s.bannerClose} onClick={close} aria-label="Dispensar">
        <X size={14} />
      </button>
    </div>
  );
}

function UpdatePrompt() {
  const update = useServiceWorkerUpdate();
  if (!update.available) return null;
  return (
    <div className={s.banner} role="status">
      <RefreshCw size={16} aria-hidden="true" />
      <p>Nova versão do TemPix disponível.</p>
      <Button size="sm" onClick={update.apply}>
        Atualizar
      </Button>
    </div>
  );
}

function GlobalState({ subscription }) {
  const active = subscription?.status === 'ACTIVE';
  return (
    <span className={`${s.globalState} ${active ? s.globalActive : s.globalPaused}`} role="status">
      <span className={s.globalDot} aria-hidden="true" />
      {active ? 'TEMPIX ATIVO' : `TEMPIX PAUSADO · ${SUBSCRIPTION_STATUS_LABELS[subscription?.status] || 'conta inativa'}`}
    </span>
  );
}

function PageFallback() {
  return (
    <div className={s.pageFallback} aria-busy="true">
      <SkeletonCard lines={1} />
      <div className={s.fallbackGrid}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

/**
 * Panel shell. The navigation and the words belong to the entry that mounts it (legacyNav.js and
 * legacy/copy.js, or areas/<área>/nav.js and copy.js), so this file lists no screen and no area text:
 *   nav         the items this account sees, { to, label, icon, end?, tab?, shortLabel? };
 *               `tab` items go to the mobile tab bar, the others to the "Mais" sheet
 *   back        [pathRegExp, backTo, backLabel] rows: deep pages get a native-style back header on mobile
 *   onboardingTo(me)  where a session still in signup goes (the signup page, or the checkout where one exists)
 *   copy        { offline } the paragraph of the offline screen
 */
export default function AppLayout({ nav, back = [], onboardingTo, copy }) {
  const { loading, me, isAuthenticated, demoMode, logout, offline, refresh } = useSession();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const loggingOut = useRef(false);
  const mobile = useIsMobile();
  const stream = useActivityStream({ enabled: isAuthenticated, initialLimit: 40 });
  // Freeze the routed element per transition: the exiting page must keep
  // rendering its own route, not the new one (prevents double mounts).
  const onLogoutRef = useRef(null);
  const outlet = useOutlet({ stream, me, demoMode, onLogout: () => onLogoutRef.current?.() });
  const mobileTabs = nav.filter((n) => n.tab);
  const moreItems = nav.filter((n) => !n.tab);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  if (loading) return <PageLoader />;
  if (!isAuthenticated && offline) {
    return (
      <div className={s.offline} role="alert">
        <Logo />
        <h1>Você está sem conexão</h1>
        <p>{copy.offline}</p>
        <Button icon={RefreshCw} onClick={refresh}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (!isAuthenticated) {
    if (me?.scope === 'ONBOARDING') return <Navigate to={onboardingTo(me)} replace />;
    if (loggingOut.current) return <Navigate to="/login" replace />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const onLogout = async () => {
    loggingOut.current = true;
    await logout();
  };
  onLogoutRef.current = onLogout;

  return (
    <div className={s.shell}>
      <a href="#app-main" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className={s.sidebar} aria-label="Navegação do painel">
        <Link to="/app" className={s.sideLogo} aria-label="TemPix — visão geral">
          <Logo />
        </Link>
        <nav className={s.sideNav}>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `${s.navItem} ${isActive ? s.navActive : ''}`}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-indicator" className={s.navIndicator} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} />}
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button type="button" className={s.navItem} onClick={onLogout}>
            <LogOut size={17} aria-hidden="true" />
            <span>Sair</span>
          </button>
        </nav>
        <div className={s.sideFoot}>
          <p className={s.sideUser}>{me.user.name}</p>
          <p className={s.sideCompany}>{me.company?.name}</p>
        </div>
      </aside>

      <div className={s.content}>
        <header className={s.topbar}>
          {(() => {
            const backRow = mobile && back.find(([re]) => re.test(location.pathname));
            return backRow ? (
              <Link to={backRow[1]} className={s.topBack} aria-label={`Voltar para ${backRow[2]}`}>
                <ArrowLeft size={18} /> <span>{backRow[2]}</span>
              </Link>
            ) : (
              <Link to="/app" className={s.topLogo} aria-label="TemPix">
                <Logo compact />
              </Link>
            );
          })()}
          <GlobalState subscription={me.subscription} />
          <div className={s.topRight}>
            {demoMode && <DemoBadge label={mobile ? 'DEMO' : 'MODO DEMO'} />}
            <span className={s.streamMode} title="Conexão em tempo real">
              <span data-mode={stream.mode} aria-hidden="true" />
              {stream.mode === 'live' ? 'tempo real' : stream.mode === 'polling' ? 'atualização periódica' : 'conectando'}
            </span>
          </div>
        </header>

        <main id="app-main" className={s.main}>
          <UpdatePrompt />
          <InstallBanner />
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={mobile ? { opacity: 0, x: 18 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={mobile ? { opacity: 0, x: -12 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={<PageFallback />}>
                {outlet}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile navigation */}
      <nav className={s.tabbar} aria-label="Navegação principal">
        {mobileTabs.map(({ to, label, shortLabel, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`}>
            <Icon size={20} aria-hidden="true" />
            <span>{shortLabel ?? label}</span>
          </NavLink>
        ))}
        <button type="button" className={`${s.tab} ${moreOpen ? s.tabActive : ''}`} onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
          <MoreHorizontal size={20} aria-hidden="true" />
          <span>Mais</span>
        </button>
      </nav>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div className={s.sheetBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMoreOpen(false)} />
            <motion.div
              className={s.sheet}
              role="dialog"
              aria-modal="true"
              aria-label="Mais opções"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={s.sheetHead}>
                <span className="eyebrow">Menu</span>
                <button type="button" onClick={() => setMoreOpen(false)} aria-label="Fechar menu" className={s.iconBtn}>
                  <X size={18} />
                </button>
              </div>
              {moreItems.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `${s.sheetItem} ${isActive ? s.navActive : ''}`}>
                  <Icon size={18} aria-hidden="true" /> {label}
                </NavLink>
              ))}
              <button type="button" className={s.sheetItem} onClick={onLogout}>
                <LogOut size={18} aria-hidden="true" /> Sair
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

