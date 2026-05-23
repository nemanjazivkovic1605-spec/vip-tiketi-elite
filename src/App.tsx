import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AnimatePresence } from 'motion/react';
import { useAuth } from './hooks/useAuth';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import ScrollToTop from './components/utils/ScrollToTop';
import MembershipGuard from './components/MembershipGuard';
import EmailVerificationGate from './components/EmailVerificationGate';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const VipTips = lazy(() => import('./pages/VipTips'));
const Results = lazy(() => import('./pages/Results'));
const Tickets = lazy(() => import('./pages/Tickets'));
const LiveResults = lazy(() => import('./pages/LiveResults'));
const Stats = lazy(() => import('./pages/Stats'));
const Contact = lazy(() => import('./pages/Contact'));
const Terms = lazy(() => import('./pages/Terms'));
const Faq = lazy(() => import('./pages/Faq'));
const BankrollManagement = lazy(() => import('./pages/BankrollManagement'));
const DailyAnalysis = lazy(() => import('./pages/DailyAnalysis'));
const DailyTips = lazy(() => import('./pages/DailyTips'));
const EarlyInformation = lazy(() => import('./pages/EarlyInformation'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const AuthAction = lazy(() => import('./pages/AuthAction'));
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'));

const PageLoader = () => (
  <div className="min-h-[60vh] bg-neutral-950 flex items-center justify-center">
    <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const ProtectedRoute = ({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) => {
  const { user, loading, isAdmin, isVerified } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
  
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (!isVerified) return <EmailVerificationGate />;

  return <>{children}</>;
};

export default function App() {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  return (
    <HelmetProvider>
      <div className="min-h-screen bg-neutral-950 text-neutral-100 selection:bg-gold-500/30">
        <ScrollToTop />
        {!isAdminPath && <Navbar />}
        <main className={!isAdminPath ? "pt-20" : ""}>
          <Suspense fallback={<PageLoader />}>
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/table" element={<Tickets />} />
                <Route path="/results" element={<Results />} />
                <Route path="/live-results" element={<LiveResults />} />
                <Route path="/live" element={<LiveResults />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/statistics" element={<Stats />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/faq" element={<Faq />} />
                <Route path="/cesta-pitanja" element={<Faq />} />
                <Route path="/bankroll-management" element={<BankrollManagement />} />
                <Route path="/daily-analysis" element={<DailyAnalysis />} />
                <Route path="/daily-tips" element={<DailyTips />} />
                <Route path="/dnevne-analize" element={<DailyTips />} />
                <Route path="/dnevni-tipovi" element={<DailyTips />} />
                <Route path="/early-information" element={<EarlyInformation />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/legal" element={<Terms />} />
                <Route path="/pravila-koriscenja" element={<Terms />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/auth-action" element={<AuthAction />} />
                <Route path="/__/auth/action" element={<AuthAction />} />
                
                {/* User Protected Routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />

                <Route path="/vip-tips" element={
                  <ProtectedRoute>
                    <MembershipGuard>
                      <VipTips />
                    </MembershipGuard>
                  </ProtectedRoute>
                } />

                {/* Admin Routes */}
                <Route path="/admin/*" element={
                  <ProtectedRoute requireAdmin={true}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AnimatePresence>
          </Suspense>
        </main>
        {!isAdminPath && <Footer />}
      </div>
    </HelmetProvider>
  );
}
