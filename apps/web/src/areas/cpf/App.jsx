import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PageLoader } from '@autopix/ui';
import { ScrollToTop } from '../../components/ScrollToTop.jsx';
import Home from './Home.jsx';
import { BACK, NAV } from './nav.js';

// Roteador da área de pessoas: as rotas de PAGES.CPF (packages/areas/src/manifest.js) e nenhuma outra.
// Caminho fora da lista cai em NotFound, nunca em redirecionamento. Há teste de deriva contra o manifesto.
// As telas comuns ainda são as de sempre; a ETAPA 5 as divide por área.
const Onboarding = lazy(() => import('./Onboarding.jsx'));
const Login = lazy(() => import('../../pages/auth/Login.jsx'));
const Activate = lazy(() => import('../../pages/auth/Activate.jsx'));
const ForgotPassword = lazy(() => import('../../pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('../../pages/auth/ResetPassword.jsx'));
const AppLayout = lazy(() => import('../../pages/app/AppLayout.jsx'));
const Overview = lazy(() => import('../../pages/app/Overview.jsx'));
const Social = lazy(() => import('../../pages/app/Social.jsx'));
const Operations = lazy(() => import('../../pages/app/Operations.jsx'));
const Activity = lazy(() => import('../../pages/app/Activity.jsx'));
const Settings = lazy(() => import('../../pages/app/Settings.jsx'));
const ConfirmChallenge = lazy(() => import('../../pages/app/ConfirmChallenge.jsx'));
const NotFound = lazy(() => import('../../pages/NotFound.jsx'));

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/login" element={<Login />} />
          <Route path="/activate/:token" element={<Activate />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/app" element={<AppLayout nav={NAV} back={BACK} />}>
            <Route index element={<Overview />} />
            <Route path="social" element={<Social />} />
            <Route path="operacao" element={<Operations />} />
            <Route path="activity" element={<Activity />} />
            <Route path="settings" element={<Settings />} />
            <Route path="confirm/:id" element={<ConfirmChallenge />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
