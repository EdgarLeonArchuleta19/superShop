import type { ReactNode } from 'react';
import { IconX } from './Icons';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, children, onClose, footer, wide }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`anim-pop-in w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-3xl bg-surface shadow-pop ring-1 ring-line`}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4 sm:px-6">
          <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-faint hover:text-ink"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-hairline px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger,
  loading,
  onConfirm,
  onClose,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost h-11 px-5 text-sm">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`btn h-11 px-5 text-sm ${
              danger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-brand-600 text-white shadow-glow hover:bg-brand-700'
            }`}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[15px] leading-relaxed text-ink/80">{message}</div>
    </Modal>
  );
}

export function ThemeToggleButton({
  onClick,
  theme,
  className = '',
}: {
  onClick: () => void;
  theme: 'light' | 'dark';
  className?: string;
}) {
  const isDark = theme === 'dark';
  const skin = isDark
    ? 'bg-white/10 text-white border-white/20 hover:bg-white/20 dark:border-white/30'
    : 'bg-faint text-ink/80 border-line hover:bg-hairline';
  return (
    <button
      onClick={onClick}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
      className={`grid h-10 w-10 place-items-center rounded-full border transition ${skin} ${className}`}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}