import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MembershipStatus } from '../types';
import { ShieldAlert, Clock } from 'lucide-react';
import { motion } from 'motion/react';

interface MembershipGuardProps {
  children: React.ReactNode;
}

export default function MembershipGuard({ children }: MembershipGuardProps) {
  const { user, loading, isApproved } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.isAdmin || isApproved) return <>{children}</>;

  const isPending = user.membershipStatus === MembershipStatus.PENDING;
  const isBlocked = user.membershipStatus === MembershipStatus.BLOCKED;
  const isExpired = user.membershipStatus === MembershipStatus.EXPIRED;

  return (
    <div className="max-w-md mx-auto py-20 px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-8 rounded-3xl"
      >
        <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          {isPending ? <Clock className="text-gold-500" size={32} /> : <ShieldAlert className="text-red-500" size={32} />}
        </div>
        <h2 className="text-2xl font-bold mb-4">
          {isPending ? 'Članarina na čekanju' : isBlocked ? 'Nalog blokiran' : isExpired ? 'Članarina istekla' : 'VIP pristup nije aktivan'}
        </h2>
        <p className="text-neutral-400 mb-8">
          {isPending
            ? 'Vaš nalog čeka odobrenje administratora.'
            : isBlocked
              ? 'Vaš nalog je suspendovan zbog kršenja pravila korišćenja.'
              : isExpired
                ? 'Vaša VIP pretplata je istekla. Izaberite paket za obnovu.'
                : 'Vaš FREE nalog je aktivan. Izaberite paket za VIP pristup.'}
        </p>
        {!isBlocked && (
          <Link
            to="/pricing"
            className="block w-full py-4 bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-2xl transition-all shadow-lg shadow-gold-500/20"
          >
            Vidi cenovnik
          </Link>
        )}
      </motion.div>
    </div>
  );
}
