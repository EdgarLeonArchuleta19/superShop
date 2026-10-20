import { useEffect, useState } from 'react';

// Instalación de la app (PWA). Android/Chrome/Edge permiten mostrar su diálogo de
// instalación desde un botón (evento `beforeinstallprompt`); en iPhone/iPad no existe
// esa opción y hay que guiar a la persona por "Compartir → Agregar a inicio".

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/**
 * Debe llamarse al arrancar la app (main.tsx): el navegador avisa una sola vez que
 * se puede instalar y, si nadie escucha en ese momento, el aviso se pierde.
 */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    justInstalled = true;
    notify();
  });
}

export type InstallPlatform =
  | 'installed' // ya se abrió como app
  | 'prompt' // el navegador permite instalar con un botón
  | 'ios-safari'
  | 'ios-other' // Chrome/Firefox/Edge en iPhone
  | 'in-app' // navegador dentro de WhatsApp, Facebook, Instagram…
  | 'android-manual' // Android sin botón (otro navegador o conexión no segura)
  | 'desktop-manual';

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || justInstalled) return 'installed';
  if (/FBAN|FBAV|Instagram|Line\/|WhatsApp|; wv\)/i.test(ua)) return 'in-app';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (deferredPrompt) return 'prompt';
  return /Android/i.test(ua) ? 'android-manual' : 'desktop-manual';
}

export function useInstall() {
  const [platform, setPlatform] = useState<InstallPlatform>(detectPlatform);

  useEffect(() => {
    const update = () => setPlatform(detectPlatform());
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  /** Abre el diálogo de instalación del navegador. Devuelve true si la persona aceptó. */
  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    const prompt = deferredPrompt;
    try {
      await prompt.prompt();
    } catch {
      // El navegador no abrió el diálogo; se conserva para volver a intentarlo.
      return false;
    }
    deferredPrompt = null;
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') justInstalled = true;
    notify();
    return outcome === 'accepted';
  };

  const isMobile = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

  return { platform, install, isMobile };
}
