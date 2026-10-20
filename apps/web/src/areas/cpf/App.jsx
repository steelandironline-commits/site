import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PageLoader } from '@autopix/ui';
import { ScrollToTop } from '../../components/ScrollToTop.jsx';
import Home from './Home.jsx';
import { COPY } from './copy.js';
import { BACK, NAV, onboardingPath } from './nav.js';

// Roteador da área de pessoas: as rotas de PAGES.CPF (packages/areas/src/manifest.js) e nenhuma outra.
// Caminho fora da lista cai em NotFound, nunca em redirecionamento. Há teste de deriva contra o manifesto.
// As telas que as duas áreas dividem recebem a cópia daqui (./copy.js); as exclusivas são desta pasta.
const Onboarding = lazy(() => import('./Onboarding.jsx'));
const Login = lazy(() => import('../../pages/auth/Login.jsx'));
const Activate = lazy(() => import('../../pages/auth/Activate.jsx'));
const ForgotPassword = lazy(() => import('../../pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('../../pages/auth/ResetPassword.jsx'));
const AppLayout = lazy(() => import('../../pages/app/AppLayout.jsx'));
const Overview = lazy(() => import('./Overview.jsx'));
const Profile = lazy(() => import('./Profile.jsx'));
const Social = lazy(() => import('../../pages/app/Social.jsx'));
const Operations = lazy(() => import('./OperationsPage.jsx'));
const Activity = lazy(() => import('../../pages/app/Activity.jsx'));
const Settings = lazy(() => import('./SettingsPage.jsx'));
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
          <Route path="/login" element={<Login copy={COPY.login} />} />
          <Route path="/activate/:token" element={<Activate copy={COPY.activate} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/app" element={<AppLayout nav={NAV} back={BACK} onboardingTo={onboardingPath} copy={COPY.layout} />}>
            <Route index element={<Overview />} />
            <Route path="perfil" element={<Profile />} />
            <Route path="social" element={<Social copy={COPY.social} />} />
            <Route path="operacao" element={<Operations />} />
            <Route path="activity" element={<Activity copy={COPY.activity} />} />
            <Route path="settings" element={<Settings />} />
            <Route path="confirm/:id" element={<ConfirmChallenge copy={COPY.confirm} />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
