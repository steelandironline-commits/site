import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/landing/Landing.jsx';
import { PageLoader } from './pages/PageLoader.jsx';

const Onboarding = lazy(() => import('./pages/onboarding/Onboarding.jsx'));
const Checkout = lazy(() => import('./pages/checkout/Checkout.jsx'));
const Login = lazy(() => import('./pages/auth/Login.jsx'));
const Activate = lazy(() => import('./pages/auth/Activate.jsx'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword.jsx'));
const AppLayout = lazy(() => import('./pages/app/AppLayout.jsx'));
const Overview = lazy(() => import('./pages/app/Overview.jsx'));
const RadarPage = lazy(() => import('./pages/app/RadarPage.jsx'));
const Opportunities = lazy(() => import('./pages/app/Opportunities.jsx'));
const OpportunityDetail = lazy(() => import('./pages/app/OpportunityDetail.jsx'));
const Activity = lazy(() => import('./pages/app/Activity.jsx'));
const Agents = lazy(() => import('./pages/app/Agents.jsx'));
const Company = lazy(() => import('./pages/app/Company.jsx'));
const Subscription = lazy(() => import('./pages/app/Subscription.jsx'));
const Settings = lazy(() => import('./pages/app/Settings.jsx'));
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
          <Route path="/" element={<Landing />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Login />} />
          <Route path="/activate/:token" element={<Activate />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Overview />} />
            <Route path="radar" element={<RadarPage />} />
            <Route path="opportunities" element={<Opportunities />} />
            <Route path="opportunities/:id" element={<OpportunityDetail />} />
            <Route path="activity" element={<Activity />} />
            <Route path="agents" element={<Agents />} />
            <Route path="company" element={<Company />} />
            <Route path="subscription" element={<Subscription />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
