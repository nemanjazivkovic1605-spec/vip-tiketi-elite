import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, ShieldCheck, Zap, TrendingUp, Users, Star, ArrowRight, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { VIP_PACKAGES } from '../lib/demoData';
import { mockTipsService } from '../services/mockTips';
import { GlobalStats } from '../types';

export default function Home() {
  const [stats, setStats] = useState<GlobalStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setStats(await mockTipsService.getStats());
    };

    fetchStats();
    return mockTipsService.subscribe(fetchStats);
  }, []);

  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 px-6">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full -z-10 overflow-hidden">
           <div className="absolute top-0 left-[10%] w-[40%] h-[40%] bg-gold-500/10 blur-[120px] rounded-full"></div>
           <div className="absolute bottom-[20%] right-[10%] w-[30%] h-[30%] bg-gold-500/5 blur-[100px] rounded-full"></div>
        </div>

        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-medium mb-8"
          >
            <span className="flex h-2 w-2 rounded-full bg-gold-500 animate-pulse"></span>
            <span className="gold-text font-bold">ELITE VIP TIPS</span>
            <span className="text-neutral-500">|</span>
            <span className="text-neutral-400">Preko 85% uspešnosti</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl lg:text-8xl font-display font-black tracking-tighter mb-8 leading-[0.9]"
          >
            DOMINIRAJ <br />
            <span className="gold-text">SPORTSKIM</span> <br />
            KLADIONICAMA
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl mx-auto text-lg text-neutral-400 mb-12"
          >
            Pridruži se najelitnijoj grupi sportskih analitičara. Koristimo napredne algoritme i rane informacije za maksimalan profit.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              to="/register"
              className="px-8 py-4 bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-2xl transition-all shadow-lg shadow-gold-500/20 flex items-center gap-2 group"
            >
              Započni besplatno <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/stats"
              className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 font-bold rounded-2xl transition-all flex items-center gap-2"
            >
              Vidi statistiku <TrendingUp size={20} className="text-gold-500" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Stats Quick View */}
      <section className="py-20 px-6 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: 'Uspešnost', value: `${stats?.successRate ?? 0}%`, icon: <Trophy className="text-gold-500" /> },
              { label: 'Dnevnih Tipova', value: '3-5', icon: <Zap className="text-gold-500" /> },
              { label: 'Članova', value: '1.2k+', icon: <Users className="text-gold-500" /> },
              { label: 'Mesečni ROI', value: `${(stats?.roi ?? 0) >= 0 ? '+' : ''}${stats?.roi ?? 0}%`, icon: <TrendingUp className="text-gold-500" /> },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-white/5 rounded-2xl mb-4">
                  {stat.icon}
                </div>
                <div className="text-3xl font-display font-bold mb-1">{stat.value}</div>
                <div className="text-sm text-neutral-500 font-medium uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">ZAŠTO IZABRATI <br /> <span className="gold-text">ELITE TIPS?</span></h2>
            <p className="text-neutral-400">Naša strategija nije sreća, već čista analiza i disciplina.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                title: 'Rane Informacije',
                desc: 'Prvi saznajemo o povredama, promenama u sastavima i sumnjivim kretanjima kvota.',
                icon: <ShieldCheck size={32} />,
                path: '/early-information',
                badges: ['Opening Line Edge', 'Smart Money Tracking', 'Early Value Detection']
              },
              {
                title: 'Dnevna Analiza',
                desc: 'Svaki VIP tip dolazi sa detaljnim objašnjenjem zašto verujemo u taj ishod.',
                icon: <Star size={32} />,
                path: '/daily-analysis',
                eyebrow: 'Premium Sports Analytics',
                pulse: 'Value Based Analysis'
              },
              {
                title: 'Bankroll Management',
                desc: 'Učimo vas kako da pametno ulažete i sačuvate profit na duge staze.',
                icon: <Zap size={32} />,
                path: '/bankroll-management'
              }
            ].map((f, i) => {
              const card = (
                <motion.div
                  whileHover={{ y: -10 }}
                  className="glass h-full p-8 rounded-[2.5rem] border-white/5 hover:border-gold-500/30 transition-all duration-500"
                >
                  <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center mb-6 text-gold-500">
                    {f.icon}
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{f.title}</h3>
                  {'eyebrow' in f && f.eyebrow && (
                    <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-gold-400">
                      {f.eyebrow}
                    </div>
                  )}
                  <p className="text-neutral-400 leading-relaxed">{f.desc}</p>
                  {'badges' in f && f.badges && (
                    <div className="mt-6 flex flex-wrap gap-2">
                      {f.badges.map((badge) => (
                        <span key={badge} className="rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-gold-300">
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                  {'pulse' in f && f.pulse && (
                    <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gold-300">
                      <span className="h-2 w-2 rounded-full bg-gold-500 animate-pulse" />
                      {f.pulse}
                    </div>
                  )}
                </motion.div>
              );

              return f.path ? (
                <Link key={i} to={f.path} className="block h-full">
                  {card}
                </Link>
              ) : (
                <React.Fragment key={i}>{card}</React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-32 px-6 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">POSTANI <span className="gold-text">VIP ČLAN</span></h2>
            <p className="text-neutral-400">Izaberi paket koji najbolje odgovara tvojoj igri.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {VIP_PACKAGES.map((pkg, i) => (
              <div
                key={i}
                className={`flex flex-col glass p-8 rounded-[2.5rem] relative ${pkg.isPopular ? 'border-gold-500/50 gold-glow' : 'border-white/5'}`}
              >
                {pkg.isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gold-500 text-black text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-tighter">
                    Najpopularnije
                  </div>
                )}
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-neutral-400 mb-2">{pkg.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-display font-black">€{pkg.price}</span>
                    <span className="text-neutral-500 text-sm">/ {pkg.durationDays} dana</span>
                  </div>
                </div>

                <div className="flex-1 space-y-4 mb-10">
                  {pkg.features.map((f, j) => (
                    <div key={j} className="flex items-center gap-3 text-neutral-300">
                      <div className="w-5 h-5 bg-gold-500/10 rounded-full flex items-center justify-center">
                         <div className="w-1.5 h-1.5 bg-gold-500 rounded-full"></div>
                      </div>
                      <span className="text-sm font-medium">{f}</span>
                    </div>
                  ))}
                </div>

                <Link
                  to={`/register?plan=${pkg.id}`}
                  className={`w-full py-4 rounded-2xl font-bold transition-all text-center ${pkg.isPopular ? 'bg-gold-500 hover:bg-gold-600 text-black ring-4 ring-gold-500/20' : 'bg-white/5 hover:bg-white/10'}`}
                >
                  Izaberi paket
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative glass p-12 md:p-20 rounded-[3rem] text-center overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gold-500/5 -z-10 blur-[80px]"></div>
            <h2 className="text-4xl md:text-6xl font-display font-bold mb-8">SPREMAN ZA <br /> <span className="gold-text">VELIKE DOBITKE?</span></h2>
            <Link
              to="/register"
              className="inline-flex items-center gap-3 px-12 py-5 bg-gold-500 hover:bg-gold-600 text-black font-black rounded-2xl transition-all shadow-xl shadow-gold-500/30 text-lg uppercase tracking-tight"
            >
              PRIDRUŽI SE ELITI <ArrowRight />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
