import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChartNoAxesCombined, Database, LockKeyhole } from 'lucide-react';

export const analyticsInput = 'min-w-0 rounded-md border border-[#303030] bg-[#171717] px-3 py-2 text-sm text-neutral-100 outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400';
export const analyticsCommand = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#303030] bg-[#171717] px-3 py-2 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-[#222] focus-visible:outline-2 focus-visible:outline-gold-400 disabled:cursor-not-allowed disabled:opacity-40';

export default function AnalyticsWorkspace({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0c0c0c] font-sans text-neutral-100 [color-scheme:dark]">
    <header className="border-b border-[#292929] bg-[#111]">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3 sm:gap-5">
          <Link to="/admin" aria-label="Nazad na admin panel" title="Nazad na admin panel" className="rounded p-2 text-neutral-400 hover:bg-white/5 hover:text-white"><ArrowLeft size={18} /></Link>
          <span className="flex items-center gap-2 text-sm font-bold"><ChartNoAxesCombined size={21} className="text-gold-400" />ELITE <span className="font-normal text-neutral-400">ANALYTICS</span></span>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-neutral-500"><LockKeyhole size={12} />Privatni admin pristup</span>
      </div>
      <nav aria-label="Analitički alati" className="mx-auto flex max-w-[1560px] flex-wrap gap-x-5 px-4 text-xs font-semibold sm:gap-x-7 lg:px-6">
        {[
          { to: '/admin/historical-analytics', label: 'Rezultati i H2H', icon: Database },
          { to: '/admin/analize', label: 'Dnevni raspored', icon: CalendarDays },
          { to: '/admin/htft', label: 'HT/FT Rang-lista', icon: ChartNoAxesCombined },
        ].map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-11 items-center gap-2 border-b-2 ${isActive ? 'border-gold-400 text-gold-300' : 'border-transparent text-neutral-400 hover:text-white'}`}><Icon size={15} />{label}</NavLink>)}
      </nav>
    </header>
    {children}
  </div>;
}

export function AnalyticsTabs<T extends string>({ id, value, items, onChange }: {
  id: string;
  value: T;
  items: Array<{ value: T; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }>;
  onChange: (value: T) => void;
}) {
  return <div role="tablist" aria-label="Prikaz analitike" className="grid grid-cols-4 border-b border-[#303030]">
    {items.map((item, index) => <button
      key={item.value} type="button" role="tab" id={`${id}-${item.value}`} aria-controls={`${id}-panel`} aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1}
      onClick={() => onChange(item.value)}
      onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index - 1 + items.length) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); onChange(items[next].value);
        document.getElementById(`${id}-${items[next].value}`)?.focus();
      }}
      className={`flex min-h-12 min-w-0 items-center justify-center gap-2 border-b-2 px-1 text-[11px] font-semibold transition-colors sm:px-3 sm:text-sm ${value === item.value ? 'border-gold-400 text-gold-300' : 'border-transparent text-neutral-400 hover:bg-white/[0.025] hover:text-neutral-100'}`}
    ><item.icon size={15} className="hidden shrink-0 sm:block" />{item.label}</button>)}
  </div>;
}
