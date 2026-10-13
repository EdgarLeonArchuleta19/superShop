import { useEffect } from 'react';
import { SURVEY_COOLDOWN_MS } from '../kioskTypes';

interface Props {
  onRestart: () => void;
  cooldownMs?: number;
}

export default function ThanksScreen({ onRestart, cooldownMs = SURVEY_COOLDOWN_MS }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onRestart, cooldownMs);
    return () => window.clearTimeout(timer);
  }, [cooldownMs, onRestart]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
      <div className="anim-floaty pointer-events-none absolute h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="anim-floaty-alt pointer-events-none absolute h-96 w-96 rounded-full bg-brand-500/10 blur-3xl" />

      <div className="anim-pop-in relative">
        <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-emerald-400/25" />
        <div className="relative grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_22px_55px_-12px_rgba(16,185,129,0.65)] ring-8 ring-emerald-500/10">
          <svg viewBox="0 0 52 52" className="h-14 w-14 text-white">
            <path
              d="M15 27l7.5 7.5L37.5 19"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 40,
                strokeDashoffset: 40,
                animation: 'draw-check 0.7s 0.3s cubic-bezier(0.22,1,0.36,1) forwards',
              }}
            />
          </svg>
        </div>
      </div>

      <h1 className="anim-fade-up delay-200 mt-8 text-[26px] font-semibold tracking-tight sm:text-[32px]">
        ¡Gracias por tu opinión!
      </h1>
      <p className="anim-fade-up delay-300 mt-2.5 max-w-xs text-[15px] leading-relaxed text-muted">
        Tu opinión nos ayuda a mejorar.
      </p>
    </div>
  );
}
