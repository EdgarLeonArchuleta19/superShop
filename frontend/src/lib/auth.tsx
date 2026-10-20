import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError, NetError, clearToken, setToken } from './api';
import type { AuthUser, UserRole } from './types';
import { can as canUser } from './permissions';

const SESSION_KEY = 'nallely.session.user';

type Role = UserRole | null;

interface AuthContextValue {
  role: Role;
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: (reason?: string) => Promise<void>;
  /** ¿El usuario actual tiene este permiso? Ver lib/permissions.ts. */
  can: (perm?: string) => boolean;
  /** Vuelve a leer rol y permisos del servidor (los cambios a un rol aplican sin re-login). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as AuthUser;
    // Sesiones guardadas antes de los roles configurables: se completan al refrescar /me.
    if (!Array.isArray(user.permissions)) {
      user.permissions = [];
      user.is_admin = user.role === 'admin';
      user.role_name = user.role === 'admin' ? 'Administrador' : 'Cajero(a)';
    }
    return user;
  } catch {
    return null;
  }
}

function writeUser(user: AuthUser): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* ignorar */
  }
}

function clearUser(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
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

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setToken(res.token);
    writeUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: AuthUser }>('/api/auth/me');
      writeUser(res.user);
      setUser(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        clearUser();
        setUser(null);
      }
    }
  }, []);

  const can = useCallback((perm?: string) => canUser(user, perm), [user]);

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

  const value = useMemo(
    () => ({ role: user?.role ?? null, user, ready, login, logout, can, refresh }),
    [user, ready, login, logout, can, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
