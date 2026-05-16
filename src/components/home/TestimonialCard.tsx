import React from 'react';
import { Star } from 'lucide-react';

interface TestimonialCardProps {
  name: string;
  comment: string;
  rating: number;
}

const TestimonialCard: React.FC<TestimonialCardProps> = ({ name, comment, rating }) => {
  return (
    <div className="p-8 rounded-3xl bg-neutral-950 border border-white/5 relative overflow-hidden">
      <div className="flex mb-6">
        {[...Array(rating)].map((_, i) => (
          <Star key={i} size={16} className="text-gold-400 fill-current" />
        ))}
      </div>
      <p className="text-neutral-300 leading-relaxed mb-6 italic">"{comment}"</p>
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full bg-gold-500/20 flex items-center justify-center text-gold-400 font-bold">
          {name[0]}
        </div>
        <div className="font-bold text-white">{name}</div>
      </div>
      <div className="absolute top-0 right-0 w-24 h-24 bg-gold-500/5 rounded-full -mr-12 -mt-12 blur-2xl"></div>
    </div>
  );
};

export default TestimonialCard;
