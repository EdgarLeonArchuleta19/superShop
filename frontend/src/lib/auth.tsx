import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, NetError, clearToken, setToken } from './api';
import type { AuthUser, UserRole } from './types';

const SESSION_KEY = 'nallely.session.user';

/** Cierre automático por inactividad. 30 minutos. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const;

type Role = UserRole | null;

interface AuthContextValue {
  role: Role;
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: (reason?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeUser(user: AuthUser): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* ignorar */
  }
}

function clearUser(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignorar */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cached = readUser();
  const [user, setUser] = useState<AuthUser | null>(cached);
  const [ready, setReady] = useState(!cached);

  useEffect(() => {
    if (!cached) return;
    let alive = true;
    api<{ user: AuthUser }>('/api/auth/me')
      .then((res) => {
        if (!alive) return;
        writeUser(res.user);
        setUser(res.user);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          clearUser();
          setUser(null);
        }
        // NetError: se conserva la sesión en caché para seguir trabajando sin conexión
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.token);
    writeUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async (reason = 'logout') => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: { reason } });
    } catch (err) {
      if (!(err instanceof NetError)) {
        // la sesión local se limpia de todos modos
      }
    }
    clearToken();
    clearUser();
    setUser(null);
  }, []);

  const logoutRef = useRef(logout);
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  // Auto-cierre por inactividad.
  useEffect(() => {
    if (!user) return;
    let timer = window.setTimeout(() => void logoutRef.current('idle'), IDLE_TIMEOUT_MS);
    let last = Date.now();
    const reset = () => {
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void logoutRef.current('idle'), IDLE_TIMEOUT_MS);
    };
    for (const ev of IDLE_EVENTS) window.addEventListener(ev, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const ev of IDLE_EVENTS) window.removeEventListener(ev, reset);
    };
  }, [user]);

  const value = useMemo(
    () => ({ role: user?.role ?? null, user, ready, login, logout }),
    [user, ready, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
