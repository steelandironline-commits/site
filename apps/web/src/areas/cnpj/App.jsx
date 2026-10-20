import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from '@autopix/ui';
import { ScrollToTop } from '../../components/ScrollToTop.jsx';
import { COMPANY_PRICING_FEATURES } from '@autopix/shared';
import Landing from '../../pages/landing/Landing.jsx';
import { COPY, LANDING } from './copy.js';
import { BACK, NAV, onboardingPath } from './nav.js';

// Roteador da área de empresas: as rotas de PAGES.CNPJ (packages/areas/src/manifest.js) e nenhuma outra.
// Caminho fora da lista cai em NotFound, nunca em redirecionamento. Há teste de deriva contra o manifesto.
const Onboarding = lazy(() => import('./Onboarding.jsx'));
const Checkout = lazy(() => import('../../pages/checkout/Checkout.jsx'));
const Login = lazy(() => import('../../pages/auth/Login.jsx'));
const Activate = lazy(() => import('../../pages/auth/Activate.jsx'));
const ForgotPassword = lazy(() => import('../../pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('../../pages/auth/ResetPassword.jsx'));
const AppLayout = lazy(() => import('../../pages/app/AppLayout.jsx'));
const Overview = lazy(() => import('../../pages/app/Overview.jsx'));
const RadarPage = lazy(() => import('../../pages/app/RadarPage.jsx'));
const Opportunities = lazy(() => import('../../pages/app/Opportunities.jsx'));
const OpportunityDetail = lazy(() => import('../../pages/app/OpportunityDetail.jsx'));
const Social = lazy(() => import('../../pages/app/Social.jsx'));
const Operations = lazy(() => import('./OperationsPage.jsx'));
const Intermediation = lazy(() => import('../../pages/app/Intermediation.jsx'));
const Activity = lazy(() => import('../../pages/app/Activity.jsx'));
const Agents = lazy(() => import('../../pages/app/Agents.jsx'));
const Company = lazy(() => import('../../pages/app/Company.jsx'));
const Subscription = lazy(() => import('../../pages/app/Subscription.jsx'));
const Settings = lazy(() => import('./SettingsPage.jsx'));
const Pay = lazy(() => import('../../pages/app/Pay.jsx'));
const TransactionDetail = lazy(() => import('../../pages/app/TransactionDetail.jsx'));
const PaymentDetail = lazy(() => import('../../pages/app/PaymentDetail.jsx'));
const Freight = lazy(() => import('../../pages/app/Freight.jsx'));
const Tenders = lazy(() => import('../../pages/app/Tenders.jsx'));
const FreightMatchDetail = lazy(() => import('../../pages/app/Freight.jsx').then((m) => ({ default: m.FreightMatchDetail })));
const Workforce = lazy(() => import('../../pages/app/Workforce.jsx'));
const WorkforceMatchDetail = lazy(() => import('../../pages/app/Workforce.jsx').then((m) => ({ default: m.WorkforceMatchDetail })));
const ConfirmChallenge = lazy(() => import('../../pages/app/ConfirmChallenge.jsx'));
const NotFound = lazy(() => import('../../pages/NotFound.jsx'));

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing copy={LANDING} />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Login copy={COPY.login} />} />
          <Route path="/activate/:token" element={<Activate copy={COPY.activate} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/app" element={<AppLayout nav={NAV} back={BACK} onboardingTo={onboardingPath} copy={COPY.layout} />}>
            <Route index element={<Overview />} />
            <Route path="radar" element={<RadarPage />} />
            <Route path="licitacoes" element={<Tenders />} />
            <Route path="opportunities" element={<Opportunities />} />
            <Route path="opportunities/:id" element={<OpportunityDetail />} />
            <Route path="social" element={<Social copy={COPY.social} />} />
            <Route path="operacao" element={<Operations />} />
            <Route path="intermediacao" element={<Intermediation />} />
            <Route path="activity" element={<Activity copy={COPY.activity} />} />
            <Route path="agents" element={<Agents />} />
            <Route path="company" element={<Company />} />
            <Route path="subscription" element={<Subscription features={COMPANY_PRICING_FEATURES} gold />} />
            <Route path="settings" element={<Settings />} />
            <Route path="pay" element={<Pay />} />
            <Route path="pay/transactions/:id" element={<TransactionDetail />} />
            <Route path="payments" element={<Navigate to="/app/pay" replace />} />
            <Route path="payments/:id" element={<PaymentDetail />} />
            <Route path="freight" element={<Freight />} />
            <Route path="freight/matches/:id" element={<FreightMatchDetail />} />
            <Route path="workforce" element={<Workforce />} />
            <Route path="workforce/matches/:id" element={<WorkforceMatchDetail />} />
            <Route path="confirm/:id" element={<ConfirmChallenge copy={COPY.confirm} />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
