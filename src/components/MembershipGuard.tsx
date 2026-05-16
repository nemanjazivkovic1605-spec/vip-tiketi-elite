import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MembershipStatus } from '../types';
import { ShieldAlert, Mail, Clock, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { mockAuthService } from '../services/mockAuth';

interface MembershipGuardProps {
  children: React.ReactNode;
}

export default function MembershipGuard({ children }: MembershipGuardProps) {
  const { user, loading, isVerified, isApproved, canAccessVip } = useAuth();

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

  // Admin bypasses everything
  if (user.isAdmin) return <>{children}</>;

  if (!isVerified) {
    return (
      <div className="max-w-md mx-auto py-20 px-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-8 rounded-3xl"
        >
          <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="text-gold-500" size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-4">Potvrdite email adresu</h2>
          <p className="text-neutral-400 mb-8">
            Poslali smo vam verifikacioni link na <b>{user.email}</b>. Potvrdite email da biste nastavili.
          </p>
          <button 
            onClick={() => mockAuthService.sendVerificationEmail()}
            className="w-full py-4 bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-2xl transition-all shadow-lg shadow-gold-500/20"
          >
            Pošalji ponovo
          </button>
        </motion.div>
      </div>
    );
  }

  if (!isApproved) {
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
            {isPending ? 'Članarina na čekanju' : isBlocked ? 'Nalog blokiran' : 'Članarina istekla'}
          </h2>
          <p className="text-neutral-400 mb-8">
            {isPending 
              ? 'Vaša prijava se trenutno obrađuje. Naš tim će odobriti vaš nalog u najkraćem roku.' 
              : isBlocked 
                ? 'Vaš nalog je suspendovan zbog kršenja pravila korišćenja.'
                : 'Vaša VIP pretplata je istekla. Obnovite članarinu da biste videli nove tipove.'}
          </p>
          {(isExpired || !isApproved) && (
            <Link 
              to="/#pricing" 
              className="block w-full py-4 bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-2xl transition-all shadow-lg shadow-gold-500/20"
            >
              Vidi cenovnik
            </Link>
          )}
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
