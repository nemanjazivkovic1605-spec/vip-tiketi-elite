import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  title: string;
  desc: string;
  icon: LucideIcon;
}

export default function FeatureCard({ title, desc, icon: Icon }: FeatureCardProps) {
  return (
    <div className="p-8 rounded-3xl glass transition-all hover:bg-white/[0.08] group">
      <div className="w-14 h-14 bg-gold-500/10 rounded-2xl flex items-center justify-center mb-6 gold-glow transition-transform group-hover:scale-110">
        <Icon className="text-gold-400" size={28} />
      </div>
      <h3 className="text-xl font-bold mb-4 text-white">{title}</h3>
      <p className="text-neutral-400 leading-relaxed">{desc}</p>
    </div>
  );
}
