import { useState } from 'react';
import { timeAgo, fmtDateTime } from '../lib/format';
import type { AppNotification, NotificationTone } from '../lib/types';
import {
  browserNotificationsEnabled,
  browserNotificationsSupported,
  setBrowserNotifications,
} from '../lib/notifications';
import { IconAlert, IconBell, IconCheck, IconEye, IconInfo, IconLock, IconStar, IconTablet, IconX } from '../components/Icons';

type IconType = (p: { className?: string }) => React.ReactElement;

const KIND_ICON: Record<string, IconType> = {
  security: IconLock,
  surveys: IconStar,
  backup: IconAlert,
  devices: IconTablet,
};

const TONE: Record<NotificationTone, string> = {
  info: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
};

interface Props {
  items: AppNotification[];
  unread: number;
  loaded: boolean;
  onClose: () => void;
  onOpen: (n: AppNotification) => void;
  onMarkRead: (id: number, read: boolean) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: number) => void;
  onDismissRead: () => void;
}

export default function NotificationsPanel({
  items,
  unread,
  loaded,
  onClose,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onDismissRead,
}: Props) {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [browser, setBrowser] = useState(browserNotificationsEnabled);
  const shown = onlyUnread ? items.filter((n) => !n.read) : items;
  const hasRead = items.some((n) => n.read);

  const toggleBrowser = async () => {
    setBrowser(await setBrowserNotifications(!browser));
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="anim-notif-in absolute inset-y-0 right-0 flex w-96 max-w-[92vw] flex-col border-l border-line bg-surface">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <div className="flex items-center gap-2">
            <IconBell className="h-5 w-5 text-brand-600" />
            <p className="text-sm font-semibold tracking-tight">Notificaciones</p>
            {unread > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{unread}</span>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost h-9 w-9" aria-label="Cerrar notificaciones">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
          <div className="flex gap-1.5">
            {(
              [
                [false, 'Todas'],
                [true, 'No leídas'],
              ] as [boolean, string][]
            ).map(([value, label]) => (
              <button
                key={label}
                onClick={() => setOnlyUnread(value)}
                className={`h-8 rounded-full px-3 text-[12px] font-semibold transition ${
                  onlyUnread === value ? 'bg-brand-600 text-white' : 'bg-faint text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {unread > 0 && (
            <button onClick={onMarkAllRead} className="btn-ghost h-8 px-2.5 text-[12px]">
              <IconCheck className="h-4 w-4" />
              Marcar todas
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {!loaded ? null : shown.length === 0 ? (
            <div className="grid place-items-center gap-2 py-16 text-center text-muted">
              <IconBell className="h-7 w-7" />
              <p className="text-sm">{onlyUnread ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones'}</p>
            </div>
          ) : (
            shown.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? IconInfo;
              return (
                <div
                  key={n.id}
                  className={`group relative flex gap-3 rounded-2xl border p-3 transition-colors ${
                    n.read ? 'border-line bg-surface' : 'border-brand-500/25 bg-brand-50/60 dark:bg-brand-500/10'
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE[n.tone] ?? TONE.info}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <button
                    onClick={() => onOpen(n)}
                    className="min-w-0 flex-1 text-left"
                    title={n.link ? 'Abrir' : 'Marcar como leída'}
                  >
                    <p className={`pr-12 text-[13px] text-ink ${n.read ? 'font-medium' : 'font-semibold'}`}>
                      {!n.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-600 align-middle" />}
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted">{n.message}</p>
                    <p className="mt-1 text-[11px] text-muted/80" title={fmtDateTime(n.updated_at)}>
                      {timeAgo(n.updated_at)}
                    </p>
                  </button>
                  <div className="absolute right-2 top-2 flex gap-0.5 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    <button
                      onClick={() => onMarkRead(n.id, !n.read)}
                      className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-faint hover:text-ink"
                      aria-label={n.read ? 'Marcar como no leída' : 'Marcar como leída'}
                      title={n.read ? 'Marcar como no leída' : 'Marcar como leída'}
                    >
                      {n.read ? <IconEye className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => onDismiss(n.id)}
                      className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-faint hover:text-red-600"
                      aria-label="Borrar notificación"
                      title="Borrar"
                    >
                      <IconX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-line p-3">
          {browserNotificationsSupported() && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-1 text-[12px] text-muted">
              <span>Avisarme también fuera de la app (avisos del navegador)</span>
              <input
                type="checkbox"
                checked={browser}
                onChange={() => void toggleBrowser()}
                className="h-4 w-4 accent-brand-600"
              />
            </label>
          )}
          {hasRead && (
            <button onClick={onDismissRead} className="btn-soft h-9 w-full text-[13px]">
              Borrar las leídas
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
