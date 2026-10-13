import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from './Icons';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  size?: 'default' | 'sm';
  className?: string;
}

interface Pos {
  left: number;
  top: number;
  width: number;
  up: boolean;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder = 'Selecciona…',
  disabled,
  id,
  size = 'default',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => String(o.value) === value) || null;

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const menuH = Math.min(options.length * 38 + 12, 260);
    const up = below < menuH && r.top > below;
    setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: r.width, up });
  }, [options.length]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    const idx = Math.max(0, options.findIndex((o) => String(o.value) === value));
    setActive(idx);
    place();
    setOpen(true);
  }, [disabled, options, value, place]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => close();
    const onResize = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close, place]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const commit = (idx: number) => {
    const opt = options[idx];
    if (opt) onChange(String(opt.value));
    close();
    btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(active);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const h = size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-sm';

  return (
    <>
      <button
        type="button"
        id={id}
        ref={btnRef}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-xl bg-faint px-3.5 text-left text-ink outline-none ring-brand-400 transition-shadow focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${h} ${
          open ? 'ring-2' : ''
        } ${className}`}
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-muted/70'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onMouseDown={close} />
            <div
              ref={listRef}
              role="listbox"
              style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                width: pos.width,
                transform: pos.up ? 'translateY(-100%)' : undefined,
              }}
              className="anim-pop-in z-[71] max-h-60 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop"
            >
              {options.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted">Sin opciones</p>
              )}
              {options.map((opt, i) => {
                const isSel = String(opt.value) === value;
                return (
                  <button
                    key={`${opt.value}-${i}`}
                    type="button"
                    data-idx={i}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(i)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      active === i ? 'bg-faint' : ''
                    } ${isSel ? 'font-medium text-brand-700 dark:text-brand-300' : 'text-ink/85'}`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSel && <IconCheck className="h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}
    </>
  );
}