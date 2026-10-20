import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from './api';
import { accessConfirmed, leaveWithoutAccess } from './access';

export interface StoreSettings {
  store_name: string;
  store_logo: string | null;
  updated_at?: string | null;
  /** Versión web (Turso): no existen respaldos en carpeta, túnel ni red local. */
  cloud?: boolean;
}

const FALLBACK: StoreSettings = {
  store_name: 'Mi Tienda',
  store_logo: null,
};

const CACHE_KEY = 'nallely.settings';

interface SettingsContextValue {
  settings: StoreSettings;
  ready: boolean;
  /** Logo subido por la tienda, o null (usar <StoreLogo>, que muestra el logo de SuperShop). */
  logo: string | null;
  save: (next: Partial<StoreSettings>) => Promise<StoreSettings>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readCache(): StoreSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as StoreSettings) : null;
  } catch {
    return null;
  }
}

function writeCache(value: StoreSettings): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* ignorar */
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings>(() => readCache() ?? FALLBACK);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ settings: StoreSettings }>('/api/settings')
      .then((res) => {
        accessConfirmed();
        if (!alive || !res.settings) return;
        setSettings(res.settings);
        writeCache(res.settings);
      })
      .catch((err) => {
        // 404: enlace privado activo y este dispositivo no lo tiene (ver lib/access.ts).
        if (err instanceof ApiError && err.status === 404) void leaveWithoutAccess();
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Las tablets de encuestas son la app "SuperShop Survey" (encuestas.html).
    document.title = window.location.pathname.startsWith('/encuestas') ? 'SuperShop Survey' : settings.store_name;
  }, [settings.store_name]);

  const save = useCallback(async (next: Partial<StoreSettings>) => {
    const res = await api<{ settings: StoreSettings }>('/api/admin/settings', {
      method: 'PUT',
      role: 'admin',
      body: next,
    });
    setSettings(res.settings);
    writeCache(res.settings);
    return res.settings;
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      ready,
      logo: settings.store_logo || null,
      save,
    }),
    [settings, ready, save]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de SettingsProvider');
  return ctx;
}