import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';

export interface StoreSettings {
  store_name: string;
  store_tagline: string;
  store_logo: string | null;
  updated_at?: string | null;
}

const FALLBACK: StoreSettings = {
  store_name: 'Super Nallely',
  store_tagline: 'Administración de tiendas',
  store_logo: null,
};

const CACHE_KEY = 'nallely.settings';

interface SettingsContextValue {
  settings: StoreSettings;
  ready: boolean;
  logo: string;
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
        if (!alive || !res.settings) return;
        setSettings(res.settings);
        writeCache(res.settings);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    document.title = `${settings.store_name} · ${settings.store_tagline}`;
  }, [settings.store_name, settings.store_tagline]);

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
      logo: settings.store_logo || '/logo-tienda.jpg',
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
