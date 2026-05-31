import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleX,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tip } from '../../types';
import { TicketStatus } from '../../types';
import { calculateTicketUnitsProfit } from '../../utils/tickets';

const signedUnits = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}u`;

export function TopNoticeBar({
  latestMonthProfitUnits,
  yesterdayWonOdds,
  completedCount,
  hitRate,
}: {
  latestMonthProfitUnits: number | null;
  yesterdayWonOdds: number | null;
  completedCount: number | null;
  hitRate: number | null;
}) {
  const items = [
    { label: 'Poslednji mesec', value: latestMonthProfitUnits === null ? 'Uskoro' : signedUnits(latestMonthProfitUnits) },
    { label: 'Juče pogođena kvota', value: yesterdayWonOdds === null ? 'Nema podataka' : yesterdayWonOdds.toFixed(2) },
    { label: 'Završeni tiketi', value: completedCount === null ? 'Uskoro' : `+${completedCount}` },
    { label: 'Prolaznost', value: hitRate === null ? 'Uskoro' : `${hitRate.toFixed(1)}%` },
  ];

  return (
    <div className="border-b border-gold-500/20 bg-black/80">
      <div className="mx-auto flex max-w-7xl items-center gap-5 overflow-x-auto px-5 py-2.5 text-[10px] font-black uppercase tracking-wider [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:justify-between md:px-6">
        <div className="flex shrink-0 items-center gap-2 text-gold-300">
          <BellRing size={14} />
          Obaveštenje
        </div>
        {items.map((item) => (
          <div key={item.label} className="flex shrink-0 items-center gap-2 border-l border-white/10 pl-5 text-neutral-400">
            <span>{item.label}:</span>
            <strong className="text-green-400">{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <article className="flex min-h-24 items-center gap-4 border-white/10 px-4 py-4 md:justify-center md:border-l">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold-500/20 bg-gold-500/10 text-gold-400">
        <Icon size={25} />
      </div>
      <div>
        <div className="font-display text-2xl font-black text-white md:text-3xl">{value}</div>
        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-neutral-500">{label}</p>
      </div>
    </article>
  );
}

export function FeatureCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="flex items-start gap-4 border-white/10 px-5 py-4 md:border-l">
      <Icon className="mt-0.5 shrink-0 text-gold-400" size={28} />
      <div>
        <h3 className="text-xs font-black uppercase tracking-wide text-neutral-100">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-neutral-500">{text}</p>
      </div>
    </article>
  );
}

export function DailyPickCard({
  title,
  description,
  price,
  features,
  tone,
  badge,
  buttonLabel,
}: {
  title: string;
  description: string;
  price: string;
  features: string[];
  tone: 'vip' | 'safe';
  badge?: string;
  buttonLabel: string;
}) {
  const isVip = tone === 'vip';
  return (
    <article className={`relative overflow-hidden rounded-xl border p-5 ${
      isVip
        ? 'border-rose-500/65 bg-[linear-gradient(135deg,rgba(84,0,27,0.92),rgba(12,3,8,0.96))] shadow-[0_0_30px_rgba(225,29,72,0.15)]'
        : 'border-blue-500/60 bg-[linear-gradient(135deg,rgba(0,41,105,0.92),rgba(2,10,26,0.96))] shadow-[0_0_30px_rgba(37,99,235,0.14)]'
    }`}>
      <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl ${isVip ? 'bg-rose-500/20' : 'bg-blue-500/20'}`} />
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-black uppercase text-white">{title}</h3>
            <p className="mt-1 text-xs text-neutral-300">{description}</p>
          </div>
          {badge && <span className="rounded-lg border border-blue-400 bg-blue-950/75 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-300">{badge}</span>}
        </div>
        <ul className="space-y-2.5 text-xs text-neutral-100">
          {features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <Check size={15} className={isVip ? 'text-gold-400' : 'text-cyan-300'} />
              {feature}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-stretch">
          <div className={`flex items-center rounded-l-lg border px-4 font-display text-2xl font-black ${isVip ? 'border-rose-400/70 bg-rose-700 text-white' : 'border-blue-400/70 bg-blue-700 text-white'}`}>
            {price}
          </div>
          <Link
            to="/contact"
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-r-lg px-4 py-3 text-xs font-black uppercase tracking-wide transition-all ${
              isVip ? 'bg-gold-400 text-black hover:bg-gold-300' : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            <ShoppingCart size={16} /> {buttonLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}

export type PricingCardProps = {
  key?: React.Key;
  name: string;
  description: string;
  price: string;
  duration?: string;
  features: string[];
  tone: 'free' | 'silver' | 'gold' | 'elite';
  buttonLabel: string;
  target: string;
  popular?: boolean;
};

export function PricingCard({
  name,
  description,
  price,
  duration,
  features,
  tone,
  buttonLabel,
  target,
  popular,
}: PricingCardProps) {
  const styles = {
    free: 'border-neutral-600/70 bg-neutral-950',
    silver: 'border-neutral-500/70 bg-[linear-gradient(145deg,rgba(45,45,45,0.82),rgba(7,7,7,0.98))]',
    gold: 'border-yellow-400/80 bg-[linear-gradient(145deg,rgba(103,72,0,0.62),rgba(15,11,0,0.98))] shadow-[0_0_28px_rgba(250,204,21,0.18)]',
    elite: 'border-purple-500/70 bg-[linear-gradient(145deg,rgba(54,8,96,0.68),rgba(13,3,25,0.98))]',
  }[tone];
  const accent = tone === 'gold' ? 'text-yellow-300' : tone === 'elite' ? 'text-purple-300' : 'text-neutral-100';
  const button = tone === 'gold'
    ? 'bg-yellow-400 text-black hover:bg-yellow-300'
    : tone === 'elite'
      ? 'bg-purple-700 text-white hover:bg-purple-600'
      : 'border border-white/25 bg-white/5 text-white hover:bg-white/10';

  return (
    <article className={`relative flex min-h-[310px] flex-col rounded-xl border p-5 ${styles}`}>
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-b-lg rounded-t-md bg-yellow-400 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-black">
          Najpopularniji
        </div>
      )}
      <h3 className={`text-center font-display text-xl font-black uppercase ${accent}`}>{name}</h3>
      <p className="mt-1 text-center text-xs leading-5 text-neutral-400">{description}</p>
      <div className={`mt-4 text-center font-display text-4xl font-black ${accent}`}>{price}</div>
      {duration && <div className="mt-1 text-center text-xs text-neutral-300">/ {duration}</div>}
      <ul className="my-5 flex-1 space-y-2 text-xs text-neutral-300">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className={tone === 'gold' ? 'text-yellow-300' : tone === 'elite' ? 'text-purple-300' : 'text-green-400'} size={15} />
            {feature}
          </li>
        ))}
      </ul>
      <Link to={target} className={`rounded-lg px-4 py-3 text-center text-xs font-black uppercase tracking-wide transition-all ${button}`}>
        {buttonLabel}
      </Link>
    </article>
  );
}

export function RecentTicketsTable({ tips }: { tips: Tip[] }) {
  if (tips.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-10 text-center text-sm text-neutral-500">
        Još nema završenih tiketa.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/55">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="border-b border-white/10 text-left text-[9px] font-black uppercase tracking-widest text-neutral-500">
          <tr>
            <th className="px-4 py-3">Datum</th>
            <th className="px-4 py-3">Meč</th>
            <th className="px-4 py-3">Tip</th>
            <th className="px-4 py-3">Kvota</th>
            <th className="px-4 py-3">Rezultat</th>
            <th className="px-4 py-3 text-right">Profit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {tips.map((tip) => {
            const match = tip.matches[0];
            const won = tip.status === TicketStatus.WON;
            const profit = calculateTicketUnitsProfit(tip);
            return (
              <tr key={tip.id} className="transition-colors hover:bg-white/[0.025]">
                <td className="px-4 py-3 text-neutral-400">{tip.date}</td>
                <td className="max-w-[260px] truncate px-4 py-3 font-bold text-neutral-200">
                  {tip.matches.length > 1 ? `${tip.matches.length} para · ${match.homeTeam} - ${match.awayTeam}` : `${match.homeTeam} - ${match.awayTeam}`}
                </td>
                <td className="px-4 py-3 font-black text-gold-300">{match.prediction}</td>
                <td className="px-4 py-3 text-neutral-300">{tip.totalOdds.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                    won ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-red-500/40 bg-red-500/10 text-red-300'
                  }`}>
                    {won ? <CheckCircle2 size={12} /> : <CircleX size={12} />}
                    {won ? 'Dobitan' : 'Gubitan'}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-black ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {signedUnits(profit)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CompactInfoCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="shrink-0 text-gold-400" size={24} />
      <div>
        <h4 className="text-xs font-black text-white">{title}</h4>
        <p className="mt-1 text-xs text-neutral-500">{text}</p>
      </div>
    </div>
  );
}

export function HistoryLink() {
  return (
    <Link to="/history" className="inline-flex items-center gap-2 text-xs font-bold text-neutral-300 transition-colors hover:text-gold-300">
      Pogledaj kompletnu istoriju <ChevronRight size={15} />
    </Link>
  );
}

export function SecondaryCta({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-black/35 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition-all hover:border-gold-500/50 hover:text-gold-300">
      {children} <TrendingUp size={16} />
    </Link>
  );
}
