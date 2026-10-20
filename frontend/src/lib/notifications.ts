import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { AppNotification, NotificationsResponse } from './types';

const POLL_MS = 30_000;
const BROWSER_KEY = 'notif-browser';

/** Avisos del sistema operativo (Windows, Android…). Requieren https o localhost. */
export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
}

export function browserNotificationsEnabled(): boolean {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    return localStorage.getItem(BROWSER_KEY) === '1';
  } catch {
    return false;
  }
}

/** Pide permiso al navegador y guarda la preferencia. Devuelve si quedaron activos. */
export async function setBrowserNotifications(enabled: boolean): Promise<boolean> {
  if (!browserNotificationsSupported()) return false;
  if (enabled && Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') return false;
  }
  try {
    localStorage.setItem(BROWSER_KEY, enabled ? '1' : '0');
  } catch {
    /* sin almacenamiento: solo dura esta sesión */
  }
  return enabled;
}

function showBrowserNotification(n: AppNotification, onClick: () => void) {
  try {
    const notification = new Notification(n.title, {
      body: n.message,
      icon: '/icon-192.png',
      tag: `supershop-${n.id}`,
    });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    /* algunos navegadores móviles solo permiten avisos desde el service worker */
  }
}

/**
 * Notificaciones del usuario: se consultan cada 30 s y al volver a la pestaña. Las acciones
 * se aplican al momento en pantalla y luego se confirman con el servidor.
 */
export function useNotifications(enabled: boolean, onOpenLink: (n: AppNotification) => void) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  /** Avisos ya vistos (para avisar en el navegador solo de los nuevos). */
  const seen = useRef<Map<number, string> | null>(null);
  const openLink = useRef(onOpenLink);
  openLink.current = onOpenLink;

  const apply = useCallback((res: NotificationsResponse) => {
    // Primera carga: no se avisa de lo que ya estaba.
    const first = seen.current === null;
    const previous = seen.current ?? new Map<number, string>();
    if (!first && browserNotificationsEnabled() && document.visibilityState === 'hidden') {
      const fresh = res.items.filter((n) => !n.read && previous.get(n.id) !== n.updated_at);
      for (const n of fresh.slice(0, 3)) showBrowserNotification(n, () => openLink.current(n));
    }
    seen.current = new Map(res.items.map((n) => [n.id, n.updated_at]));
    setItems(res.items);
    setUnread(res.unread);
    setLoaded(true);
  }, []);

  const refresh = useCallback(() => {
    if (!enabled) return;
    api<NotificationsResponse>('/api/notifications')
      .then(apply)
      .catch(() => undefined);
  }, [enabled, apply]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  /** Cambio inmediato en pantalla + llamada al servidor (que devuelve la lista actualizada). */
  const act = useCallback(
    (optimistic: (list: AppNotification[]) => AppNotification[], path: string, method: 'POST' | 'DELETE') => {
      setItems((list) => {
        const next = optimistic(list);
        setUnread(next.filter((n) => !n.read).length);
        return next;
      });
      api<NotificationsResponse>(path, { method })
        .then(apply)
        .catch(() => refresh());
    },
    [apply, refresh]
  );

  const markRead = useCallback(
    (id: number, read = true) =>
      act(
        (list) => list.map((n) => (n.id === id ? { ...n, read } : n)),
        `/api/notifications/${id}/${read ? 'read' : 'unread'}`,
        'POST'
      ),
    [act]
  );
  const markAllRead = useCallback(
    () => act((list) => list.map((n) => ({ ...n, read: true })), '/api/notifications/read-all', 'POST'),
    [act]
  );
  const dismiss = useCallback(
    (id: number) => act((list) => list.filter((n) => n.id !== id), `/api/notifications/${id}`, 'DELETE'),
    [act]
  );
  const dismissRead = useCallback(
    () => act((list) => list.filter((n) => !n.read), '/api/notifications', 'DELETE'),
    [act]
  );

  return { items, unread, loaded, refresh, markRead, markAllRead, dismiss, dismissRead };
}
