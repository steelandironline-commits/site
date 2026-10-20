import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/landing/Landing.jsx';
import { PageLoader } from '@autopix/ui';
import { COPY, LANDING } from './legacy/copy.js';
import { PersonPriceCard } from './legacy/PersonPriceCard.jsx';

// Build legado (convive com os builds de área até o go-live): as telas de sempre, para os dois tipos de
// conta, com a cópia de src/legacy/copy.js. As páginas que dependem do tipo da conta têm o seu
// invólucro em src/legacy/; as áreas passam o que é delas direto de areas/<área>/App.jsx.
const Onboarding = lazy(() => import('./legacy/Onboarding.jsx'));
const Checkout = lazy(() => import('./pages/checkout/Checkout.jsx'));
const Login = lazy(() => import('./pages/auth/Login.jsx'));
const Activate = lazy(() => import('./pages/auth/Activate.jsx'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword.jsx'));
const AppLayout = lazy(() => import('./legacy/LegacyLayout.jsx'));
const Overview = lazy(() => import('./pages/app/Overview.jsx'));
const RadarPage = lazy(() => import('./pages/app/RadarPage.jsx'));
const Opportunities = lazy(() => import('./pages/app/Opportunities.jsx'));
const OpportunityDetail = lazy(() => import('./pages/app/OpportunityDetail.jsx'));
const Social = lazy(() => import('./pages/app/Social.jsx'));
const Operations = lazy(() => import('./legacy/OperationsPage.jsx'));
const Intermediation = lazy(() => import('./pages/app/Intermediation.jsx'));
const Activity = lazy(() => import('./pages/app/Activity.jsx'));
const Agents = lazy(() => import('./pages/app/Agents.jsx'));
const Company = lazy(() => import('./pages/app/Company.jsx'));
const Subscription = lazy(() => import('./legacy/SubscriptionPage.jsx'));
const Settings = lazy(() => import('./legacy/SettingsPage.jsx'));
const Pay = lazy(() => import('./pages/app/Pay.jsx'));
const TransactionDetail = lazy(() => import('./pages/app/TransactionDetail.jsx'));
const Admin = lazy(() => import('./pages/app/Admin.jsx'));
const PaymentDetail = lazy(() => import('./pages/app/PaymentDetail.jsx'));
const Freight = lazy(() => import('./pages/app/Freight.jsx'));
const Tenders = lazy(() => import('./pages/app/Tenders.jsx'));
const FreightMatchDetail = lazy(() => import('./pages/app/Freight.jsx').then((m) => ({ default: m.FreightMatchDetail })));
const Workforce = lazy(() => import('./pages/app/Workforce.jsx'));
const WorkforceMatchDetail = lazy(() => import('./pages/app/Workforce.jsx').then((m) => ({ default: m.WorkforceMatchDetail })));
const ConfirmChallenge = lazy(() => import('./pages/app/ConfirmChallenge.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing copy={LANDING} personCard={<PersonPriceCard />} />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Login copy={COPY.login} />} />
          <Route path="/activate/:token" element={<Activate copy={COPY.activate} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/app" element={<AppLayout />}>
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
            <Route path="subscription" element={<Subscription />} />
            <Route path="settings" element={<Settings />} />
            <Route path="pay" element={<Pay />} />
            <Route path="pay/transactions/:id" element={<TransactionDetail />} />
            <Route path="payments" element={<Navigate to="/app/pay" replace />} />
            <Route path="admin" element={<Admin />} />
            <Route path="payments/:id" element={<PaymentDetail />} />
            <Route path="freight" element={<Freight />} />
            <Route path="freight/matches/:id" element={<FreightMatchDetail />} />
            <Route path="workforce" element={<Workforce />} />
            <Route path="workforce/matches/:id" element={<WorkforceMatchDetail />} />
            <Route path="confirm/:id" element={<ConfirmChallenge copy={COPY.confirm} />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

