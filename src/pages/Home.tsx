import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Lock, ShieldCheck, Star, TrendingUp, Trophy, Users, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { mockTipsService } from '../services/mockTips';
import { GlobalStats } from '../types';

export default function Home() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const { user, isVerified } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      setStats(await mockTipsService.getPublicStats());
    };

    fetchStats();
    return mockTipsService.subscribePublicStats(fetchStats);
  }, []);

  const statsCards = [
    { label: 'Hit rate', value: `${stats?.hitRate ?? 0}%`, icon: <Trophy className="text-gold-500" /> },
    { label: 'ROI', value: `${(stats?.roi ?? 0) >= 0 ? '+' : ''}${stats?.roi ?? 0}%`, icon: <TrendingUp className="text-gold-500" /> },
    { label: 'Units profit', value: `${(stats?.unitsProfit ?? 0) >= 0 ? '+' : ''}${stats?.unitsProfit ?? 0}u`, icon: <Zap className="text-gold-500" /> },
    { label: 'Završeni tiketi', value: stats?.completedCount ?? 0, icon: <Users className="text-gold-500" /> },
  ];

  return (
    <div className="overflow-hidden">
      <section className="relative px-6 pb-24 pt-24 md:pb-28 md:pt-28">
        <div className="absolute inset-x-0 top-0 -z-10 mx-auto h-[520px] max-w-6xl bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.13),transparent_58%)]" />

        <div className="mx-auto max-w-7xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-300"
          >
            <span className="h-2 w-2 rounded-full bg-gold-500" />
            Elite VIP Tips
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mx-auto max-w-4xl font-display text-5xl font-black leading-[0.95] tracking-tight md:text-7xl"
          >
            Pametniji pristup <span className="gold-text">sportskim tipovima</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-6 max-w-2xl text-base leading-8 text-neutral-400 md:text-lg"
          >
            Free tipovi za verifikovane korisnike, VIP analize za aktivne članove i javna istorija završenih tiketa.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              to={user && isVerified ? '/pricing' : '/register'}
              className="inline-flex items-center gap-2 rounded-2xl bg-gold-500 px-8 py-4 font-black text-black shadow-xl shadow-gold-500/25 transition-all hover:bg-gold-400"
            >
              Otključaj tipove <ArrowRight size={20} />
            </Link>
            <Link
              to="/tickets"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 font-bold text-neutral-200 transition-all hover:border-gold-500/35 hover:text-gold-300"
            >
              Pogledaj istoriju <TrendingUp size={20} />
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-white/5 bg-white/[0.015] px-6 py-14">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-5 md:grid-cols-4">
          {statsCards.map((stat) => (
            <div key={stat.label} className="rounded-3xl border border-white/5 bg-black/20 p-5 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5">{stat.icon}</div>
              <div className="font-display text-2xl font-black md:text-3xl">{stat.value}</div>
              <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-black md:text-5xl">Kako funkcioniše</h2>
            <p className="mx-auto mt-3 max-w-2xl text-neutral-400">Jednostavan pristup sadržaju, bez konfuzije oko toga šta je javno, free ili VIP.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              { step: '01', title: 'Registrujete nalog', text: 'Kreirate nalog i potvrđujete email adresu.' },
              { step: '02', title: 'Dobijate FREE tipove', text: 'Verifikovani korisnici vide aktivne FREE tipove.' },
              { step: '03', title: 'VIP otključava premium', text: 'Aktivni VIP članovi vide VIP tipove, prognoze i analize.' },
            ].map((item) => (
              <div key={item.step} className="glass rounded-[2rem] border-white/5 p-7">
                <div className="mb-5 inline-flex rounded-2xl border border-gold-500/20 bg-gold-500/10 px-4 py-2 font-display text-xl font-black text-gold-300">{item.step}</div>
                <h3 className="mb-3 text-xl font-black">{item.title}</h3>
                <p className="leading-7 text-neutral-400">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7">
              <CheckCircle2 className="mb-5 text-green-400" size={30} />
              <h3 className="mb-3 text-2xl font-black">FREE tipovi</h3>
              <p className="text-sm leading-7 text-neutral-400">Dostupni registrovanim i email-verifikovanim korisnicima. Neregistrovani posetioci vide zaključane kartice.</p>
            </div>
            <div className="rounded-[2rem] border border-gold-500/25 bg-gold-500/[0.06] p-7">
              <Star className="mb-5 text-gold-400" size={30} />
              <h3 className="mb-3 text-2xl font-black">VIP tipovi</h3>
              <p className="text-sm leading-7 text-neutral-400">Dostupni samo odobrenim VIP članovima sa aktivnom članarinom. VIP analiza ostaje zaključana za non-VIP korisnike.</p>
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7">
              <Lock className="mb-5 text-blue-300" size={30} />
              <h3 className="mb-3 text-2xl font-black">Završeni tiketi</h3>
              <p className="text-sm leading-7 text-neutral-400">Istorija i rezultati su javni. Ako je tiket VIP, tačan VIP tip i analiza ostaju zaključani za korisnike bez VIP pristupa.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-black md:text-5xl">Zašto Elite Tips?</h2>
            <p className="mt-3 text-neutral-400">Analitika, disciplina i upravljanje rizikom umesto nasumičnih tiketa.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { title: 'Rane Informacije', desc: 'Praćenje povreda, rotacija, tržišta kvota i smart money signala.', icon: <ShieldCheck size={30} />, path: '/early-information' },
              { title: 'Dnevna Analiza', desc: 'Profesionalan proces selekcije tipova kroz statistiku, value i rizik.', icon: <Star size={30} />, path: '/daily-analysis' },
              { title: 'Bankroll Management', desc: 'Unit sistem i kontrola uloga za dugoročniji pristup igri.', icon: <Zap size={30} />, path: '/bankroll-management' },
            ].map((feature) => (
              <Link key={feature.title} to={feature.path} className="group block h-full">
                <div className="glass h-full rounded-[2rem] border-white/5 p-7 transition-all group-hover:-translate-y-1 group-hover:border-gold-500/25">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-500">{feature.icon}</div>
                  <h3 className="mb-3 text-2xl font-black">{feature.title}</h3>
                  <p className="text-sm leading-7 text-neutral-400">{feature.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white/[0.015] px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-9">
            <h2 className="font-display text-3xl font-black md:text-5xl">VIP pristup</h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-neutral-400">
              Registracija je besplatna. Kada potvrdite email i ulogujete se, možete izabrati VIP paket i poslati zahtev za aktivaciju.
            </p>
          </div>
          <Link
            to={user && isVerified ? '/pricing' : '/register'}
            className="inline-flex items-center gap-2 rounded-2xl bg-gold-500 px-8 py-4 font-black text-black shadow-xl shadow-gold-500/20 transition-all hover:bg-gold-400"
          >
            {user && isVerified ? 'Pogledaj VIP pakete' : 'Kreiraj FREE nalog'} <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  );
}
