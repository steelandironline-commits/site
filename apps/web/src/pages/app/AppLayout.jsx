import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity as ActivityIcon,
  Building2,
  Cpu,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Radar,
  Settings,
  Target,
  X,
} from 'lucide-react';
import { SUBSCRIPTION_STATUS_LABELS } from '@autopix/shared';
import { useSession } from '../../lib/session.jsx';
import { useActivityStream } from '../../lib/activityStream.js';
import { Logo } from '../../components/brand/Logo.jsx';
import { DemoBadge, SkeletonCard } from '../../components/ui/ui.jsx';
import { PageLoader } from '../PageLoader.jsx';
import s from './app.module.css';

const NAV = [
  { to: '/app', label: 'Visão Geral', icon: LayoutDashboard, end: true },
  { to: '/app/radar', label: 'Radar', icon: Radar },
  { to: '/app/opportunities', label: 'Oportunidades', icon: Target },
  { to: '/app/activity', label: 'Atividade', icon: ActivityIcon },
  { to: '/app/agents', label: 'Agentes', icon: Cpu },
  { to: '/app/company', label: 'Empresa', icon: Building2 },
  { to: '/app/subscription', label: 'Assinatura', icon: CreditCard },
  { to: '/app/settings', label: 'Configurações', icon: Settings },
];
const MOBILE_TABS = NAV.slice(0, 4);

function GlobalState({ subscription }) {
  const active = subscription?.status === 'ACTIVE';
  return (
    <span className={`${s.globalState} ${active ? s.globalActive : s.globalPaused}`} role="status">
      <span className={s.globalDot} aria-hidden="true" />
      {active ? 'AUTOPIX ATIVO' : `AUTOPIX PAUSADO · ${SUBSCRIPTION_STATUS_LABELS[subscription?.status] || 'sem assinatura'}`}
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

export default function AppLayout() {
  const { loading, me, isAuthenticated, demoMode, logout } = useSession();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const loggingOut = useRef(false);
  const stream = useActivityStream({ enabled: isAuthenticated, initialLimit: 40 });

  useEffect(() => setMoreOpen(false), [location.pathname]);

  if (loading) return <PageLoader />;
  if (!isAuthenticated) {
    if (me?.scope === 'ONBOARDING') return <Navigate to={me.user.status === 'PENDING_PAYMENT' ? '/checkout' : '/onboarding'} replace />;
    if (loggingOut.current) return <Navigate to="/login" replace />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const onLogout = async () => {
    loggingOut.current = true;
    await logout();
  };

  return (
    <div className={s.shell}>
      <a href="#app-main" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className={s.sidebar} aria-label="Navegação do painel">
        <Link to="/app" className={s.sideLogo} aria-label="AutoPix — visão geral">
          <Logo />
        </Link>
        <nav className={s.sideNav}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
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
          <Link to="/app" className={s.topLogo} aria-label="AutoPix">
            <Logo compact />
          </Link>
          <GlobalState subscription={me.subscription} />
          <div className={s.topRight}>
            {demoMode && <DemoBadge label="MODO DEMO" />}
            <span className={s.streamMode} title="Conexão em tempo real">
              <span data-mode={stream.mode} aria-hidden="true" />
              {stream.mode === 'live' ? 'tempo real' : stream.mode === 'polling' ? 'atualização periódica' : 'conectando'}
            </span>
          </div>
        </header>

        <main id="app-main" className={s.main}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={<PageFallback />}>
                <Outlet context={{ stream, me, demoMode, onLogout }} />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile navigation */}
      <nav className={s.tabbar} aria-label="Navegação principal">
        {MOBILE_TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`}>
            <Icon size={20} aria-hidden="true" />
            <span>{label === 'Visão Geral' ? 'Visão' : label}</span>
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
              {NAV.slice(4).map(({ to, label, icon: Icon }) => (
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
