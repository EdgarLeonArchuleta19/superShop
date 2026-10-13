import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { createPortal } from 'react-dom';
import {
  IconAlert,
  IconInfo,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from '../components/Icons';

export type ToastTone = 'create' | 'update' | 'activate' | 'deactivate' | 'error' | 'info';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  closing: boolean;
}

interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
  create: (title: string, description?: string) => void;
  update: (title: string, description?: string) => void;
  activate: (title: string, description?: string) => void;
  deactivate: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const DURATION = 3600;
const EXIT_MS = 180;

const ToastContext = createContext<ToastContextValue | null>(null);

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const TONES: Record<ToastTone, { bg: string; Icon: IconComponent }> = {
  create: { bg: 'bg-emerald-600', Icon: IconPlus },
  update: { bg: 'bg-brand-600', Icon: IconPencil },
  activate: { bg: 'bg-sky-600', Icon: IconRefresh },
  deactivate: { bg: 'bg-amber-500', Icon: IconTrash },
  error: { bg: 'bg-red-600', Icon: IconAlert },
  info: { bg: 'bg-slate-700', Icon: IconInfo },
};

function Toaster({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  if (typeof document === 'undefined' || items.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
      {items.map((toast) => {
        const { bg, Icon } = TONES[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-2xl px-4 py-3 text-white shadow-pop ${bg} ${
              toast.closing ? 'anim-toast-out' : 'anim-toast-in'
            }`}
          >
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13.5px] font-semibold leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-[12.5px] leading-snug text-white/85">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar aviso"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/75 transition hover:bg-white/20 hover:text-white"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
            <span
              className="anim-shrink absolute bottom-0 left-0 h-0.5 bg-white/40"
              style={{ animationDuration: `${DURATION}ms` }}
            />
          </div>
        );
      })}
    </div>,
    document.body
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  const show = useCallback(
    ({ title, description, tone = 'info' }: ToastOptions) => {
      const id = (seq.current += 1);
      setItems((prev) => [...prev, { id, title, description, tone, closing: false }]);
      window.setTimeout(() => dismiss(id), DURATION);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      create: (title, description) => show({ title, description, tone: 'create' }),
      update: (title, description) => show({ title, description, tone: 'update' }),
      activate: (title, description) => show({ title, description, tone: 'activate' }),
      deactivate: (title, description) => show({ title, description, tone: 'deactivate' }),
      error: (title, description) => show({ title, description, tone: 'error' }),
      info: (title, description) => show({ title, description, tone: 'info' }),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}