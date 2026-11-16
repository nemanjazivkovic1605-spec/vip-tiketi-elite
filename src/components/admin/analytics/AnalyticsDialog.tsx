import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function AnalyticsDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className="m-auto max-h-[92vh] max-w-5xl overflow-y-auto rounded-lg border border-[#333] bg-[#121212] p-4 text-neutral-100 backdrop:bg-black/80 sm:p-6" style={{ width: 'calc(100% - 1.5rem)' }}>
    <div onClick={event => event.stopPropagation()}><button type="button" aria-label={`Zatvori ${title.toLowerCase()}`} title="Zatvori" className="mb-3 ml-auto flex rounded p-1 text-neutral-400 hover:bg-white/5 hover:text-white" onClick={onClose}><X size={19} /></button>{children}</div>
  </dialog>;
}
