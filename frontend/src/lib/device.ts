import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, clearDeviceToken, getDeviceToken, setDeviceToken } from './api';
import { getPendingCount } from './offline';

/*
 * Tablet de "SuperShop Survey": se vincula escaneando el QR de Vincular dispositivos,
 * sin usuario ni contraseña. Queda fija a una tienda y una caja; solo puede responder
 * encuestas. Ver backend/src/devices.js.
 */

export interface DeviceInfo {
  id: number;
  name: string;
  branch: { id: number; name: string } | null;
  register: { id: number; name: string } | null;
}

/** 'paired' vinculada · 'revoked' la desvincularon desde el panel · 'unpaired' nunca se vinculó. */
export type DeviceStatus = 'paired' | 'revoked' | 'unpaired';

const INFO_KEY = 'supershop.device.info';
const HEARTBEAT_MS = 2 * 60 * 1000;

function readInfo(): DeviceInfo | null {
  try {
    const raw = localStorage.getItem(INFO_KEY);
    return raw ? (JSON.parse(raw) as DeviceInfo) : null;
  } catch {
    return null;
  }
}

function writeInfo(info: DeviceInfo | null): void {
  try {
    if (info) localStorage.setItem(INFO_KEY, JSON.stringify(info));
    else localStorage.removeItem(INFO_KEY);
  } catch {
    /* ignorar */
  }
}

export function isPairedDevice(): boolean {
  return !!getDeviceToken();
}

/** Cambia el código del QR por el token de la tablet. Reemplaza una vinculación anterior. */
export async function pairDevice(code: string): Promise<DeviceInfo> {
  const res = await api<{ token: string; device: DeviceInfo }>('/api/devices/pair', {
    method: 'POST',
    body: { code, previous_token: getDeviceToken() },
  });
  setDeviceToken(res.token);
  writeInfo(res.device);
  return res.device;
}

/** Deja de usar este equipo como tablet de encuestas (solo después de que la desvincularon). */
export function forgetDevice(): void {
  clearDeviceToken();
  writeInfo(null);
}

/**
 * Estado de la tablet. Sin conexión se usa lo último que se supo; cada 2 minutos manda un
 * latido con las encuestas pendientes (se ven en la lista de dispositivos del panel) y
 * recibe su tienda y caja actuales, por si las cambiaron.
 */
export function useKioskDevice(): { status: DeviceStatus; device: DeviceInfo | null } {
  const [device, setDevice] = useState<DeviceInfo | null>(() => (getDeviceToken() ? readInfo() : null));
  const [status, setStatus] = useState<DeviceStatus>(() => (getDeviceToken() ? 'paired' : 'unpaired'));

  const beat = useCallback(async () => {
    if (!getDeviceToken()) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const res = await api<{ device: DeviceInfo }>('/api/device/heartbeat', {
        method: 'POST',
        body: { pending: getPendingCount() },
        timeoutMs: 15_000,
      });
      writeInfo(res.device);
      setDevice(res.device);
      setStatus('paired');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setStatus('revoked');
      // Sin conexión u otro error: se sigue con lo último que se supo.
    }
  }, []);

  useEffect(() => {
    if (status === 'unpaired') return;
    void beat();
    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);
    window.addEventListener('online', beat);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', beat);
    };
  }, [beat, status]);

  return { status, device };
}

/**
 * En las pantallas de encuestas el navegador ofrece instalar "SuperShop Survey" (logo
 * blanco, abre directo en /encuestas) en lugar de "SuperShop".
 */
export function useSurveyAppManifest(): void {
  useEffect(() => {
    // Manifiesto, íconos y nombre de SuperShop Survey (logo blanco); al salir se restauran
    // los de SuperShop (logo de fondo azul).
    const swaps: Array<[Element | null, string, string]> = [
      [document.querySelector('link[rel="manifest"]'), 'href', '/encuestas.webmanifest'],
      [document.querySelector('link[rel="apple-touch-icon"]'), 'href', '/survey-apple-touch-icon.png'],
      [document.querySelector('link[rel="icon"]'), 'href', '/survey-icon-192.png'],
      [document.querySelector('meta[name="apple-mobile-web-app-title"]'), 'content', 'SuperShop Survey'],
      [document.querySelector('meta[name="theme-color"]'), 'content', '#ffffff'],
    ];
    const prev = swaps.map(([el, attr]) => el?.getAttribute(attr) ?? null);
    const prevTitle = document.title;
    for (const [el, attr, value] of swaps) el?.setAttribute(attr, value);
    document.title = 'SuperShop Survey';
    return () => {
      swaps.forEach(([el, attr], i) => {
        const value = prev[i];
        if (el && value !== null) el.setAttribute(attr, value);
      });
      document.title = prevTitle;
    };
  }, []);
}
