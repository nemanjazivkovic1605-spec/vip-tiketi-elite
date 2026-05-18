import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AnimatePresence } from 'motion/react';
import { useAuth } from './hooks/useAuth';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import ScrollToTop from './components/utils/ScrollToTop';
import MembershipGuard from './components/MembershipGuard';

// Pages
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import VipTips from './pages/VipTips';
import Results from './pages/Results';
import Tickets from './pages/Tickets';
import LiveResults from './pages/LiveResults';
import Stats from './pages/Stats';
import Contact from './pages/Contact';
import Terms from './pages/Terms';
import Faq from './pages/Faq';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/Admin/AdminDashboard';

const ProtectedRoute = ({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
  
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;

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
              <Route path="/terms" element={<Terms />} />
              <Route path="/legal" element={<Terms />} />
              <Route path="/pravila-koriscenja" element={<Terms />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
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
        </main>
        {!isAdminPath && <Footer />}
      </div>
    </HelmetProvider>
  );
}
