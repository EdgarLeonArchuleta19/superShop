import { useEffect, useState } from 'react';
import { IconChevronDown, IconChevronRight } from '../../../components/Icons';
import { useSettings } from '../../../lib/settings';
import type { KioskSessionInfo } from '../../../lib/types';
import { cooldownRemainingMs } from '../kioskTypes';

interface Props {
  session: KioskSessionInfo;
  onStart: () => void;
}

export default function HomeScreen({ session, onStart }: Props) {
  const { settings, logo } = useSettings();
  const [wait, setWait] = useState(() => Math.ceil(cooldownRemainingMs() / 1000));

  useEffect(() => {
    const tick = () => setWait(Math.ceil(cooldownRemainingMs() / 1000));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);

  const waiting = wait > 0;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10 text-center">
      <div className="anim-floaty pointer-events-none absolute top-1/4 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />

      <div className="anim-fade-up relative flex flex-col items-center">
        <div className="relative">
          <span className="anim-pulse-ring absolute inset-0 rounded-3xl bg-brand-500/30" />
          <img
            src={logo}
            alt={settings.store_name}
            className="anim-floaty-alt relative h-20 w-20 rounded-3xl object-cover shadow-pop ring-1 ring-line"
          />
        </div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-tight sm:text-[26px]">
          ¿Cómo te atendieron hoy?
        </h1>
        <p className="mt-2 max-w-xs text-[14px] text-muted">
          Cuéntanos tu experiencia en {settings.store_name}. Toma menos de un minuto.
        </p>
      </div>

      {!waiting && (
        <div className="anim-fade-up delay-200 mt-8 flex flex-col items-center gap-1.5 text-brand-600 dark:text-brand-300">
          <span className="anim-bounce-hint grid h-10 w-10 place-items-center rounded-full bg-brand-50 dark:bg-brand-500/15">
            <IconChevronDown className="h-5 w-5" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
            Toca para empezar
          </span>
        </div>
      )}

      <div className="relative mt-4 inline-flex">
        {!waiting && (
          <span className="anim-pulse-ring pointer-events-none absolute inset-0 rounded-full bg-brand-500/40" />
        )}
        <button
          onClick={waiting ? undefined : onStart}
          disabled={waiting}
          aria-disabled={waiting}
          className="btn-primary anim-fade-up anim-shine group relative h-12 overflow-hidden px-8 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {waiting ? `Disponible en ${wait} s` : 'Empezar encuesta'}
          <IconChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
        </button>
      </div>

      <p className="anim-fade-up delay-300 mt-6 text-[11px] text-muted">
        {session.branch.name} · {session.register.name} · {session.cashier.name}
      </p>
    </div>
  );
}