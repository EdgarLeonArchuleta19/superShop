import { useState } from 'react';
import { IconChevronLeft, IconChevronRight } from './Icons';

const WEEKDAYS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseISO(value?: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDisplay(value?: string): string {
  const d = parseISO(value);
  if (!d) return '';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Props {
  value?: string;
  onSelect: (value: string) => void;
  min?: string;
  max?: string;
  onClear?: () => void;
}

export default function Calendar({ value, onSelect, min, max, onClear }: Props) {
  const selected = parseISO(value);
  const todayISO = toISO(new Date());
  const [view, setView] = useState(() => {
    const base = selected || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = view.getFullYear();
  const month = view.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));

  const shift = (delta: number) => setView(new Date(year, month + delta, 1));

  const isDisabled = (d: Date) => {
    const iso = toISO(d);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  return (
    <div className="w-[288px] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-faint hover:text-ink"
          aria-label="Mes anterior"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-[13px] font-semibold tracking-tight">
          {MONTHS[month].charAt(0).toUpperCase() + MONTHS[month].slice(1)} {year}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-faint hover:text-ink"
          aria-label="Mes siguiente"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span
            key={w}
            className="grid h-8 place-items-center text-[11px] font-semibold uppercase text-muted"
          >
            {w}
          </span>
        ))}
        {days.map((d, i) => {
          const iso = toISO(d);
          const outside = d.getMonth() !== month;
          const isSelected = iso === value;
          const isToday = iso === todayISO;
          const disabled = isDisabled(d);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(iso)}
              className={`grid h-8 w-8 place-items-center rounded-full text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                isSelected
                  ? 'bg-brand-600 text-white'
                  : isToday
                    ? 'text-brand-700 ring-1 ring-brand-400 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/15'
                    : outside
                      ? 'text-muted/40 hover:bg-faint'
                      : 'text-ink/80 hover:bg-faint'
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2">
        <button
          type="button"
          onClick={() => onSelect(todayISO)}
          className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:hover:bg-brand-500/15"
        >
          Hoy
        </button>
        {onClear && value && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted transition-colors hover:bg-faint"
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}