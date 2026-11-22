import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return <section className="mx-auto min-h-[60vh] max-w-7xl px-6 py-20">
    <p className="text-xs font-semibold uppercase text-gold-400">Greška 404</p>
    <h1 className="mt-3 text-3xl font-bold">Stranica nije pronađena</h1>
    <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-400">Adresa nije dostupna. Otvorite početnu stranu ili javni fudbalski pregled.</p>
    <div className="mt-6 flex flex-wrap gap-3"><Link to="/" className="inline-flex items-center gap-2 rounded-md bg-gold-500 px-4 py-3 text-sm font-semibold text-black"><ArrowLeft size={16}/>Početna</Link><a href="/fudbal" className="rounded-md border border-white/15 px-4 py-3 text-sm">Fudbalska statistika</a></div>
  </section>;
}
