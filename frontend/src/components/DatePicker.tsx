import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Calendar, { formatDisplay } from './Calendar';
import { IconCalendar } from './Icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  min?: string;
  max?: string;
  className?: string;
}

interface Pos {
  left: number;
  top: number;
  up: boolean;
}

const MENU_WIDTH = 288;
const MENU_HEIGHT = 366;

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Selecciona una fecha…',
  disabled,
  id,
  min,
  max,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < MENU_HEIGHT && r.top > below;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - MENU_WIDTH - 8);
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, up });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => close();
    const onResize = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close, place]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') return close();
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKeyDown}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl bg-faint px-3.5 text-left text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand-400 disabled:pointer-events-none disabled:opacity-50 ${
          open ? 'bg-surface ring-2 ring-brand-400' : ''
        } ${className}`}
      >
        <span className={`truncate ${value ? 'text-ink' : 'text-muted/70'}`}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <IconCalendar className="h-4 w-4 shrink-0 text-muted" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onMouseDown={close} />
            <div
              style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                transform: pos.up ? 'translateY(-100%)' : undefined,
              }}
              className="anim-pop-in z-[71] rounded-2xl border border-line bg-surface shadow-pop"
            >
              <Calendar
                value={value}
                min={min}
                max={max}
                onSelect={(v) => {
                  onChange(v);
                  close();
                }}
                onClear={() => {
                  onChange('');
                  close();
                }}
              />
            </div>
          </>,
          document.body
        )}
    </>
  );
}