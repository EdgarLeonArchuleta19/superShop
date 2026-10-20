const RELOAD_FLAG = 'ss-sin-acceso';

/**
 * El acceso con enlace privado está activo y este dispositivo no lo tiene (el servidor
 * responde 404 a /api/settings, que siempre existe). La app guardada para funcionar sin
 * conexión se abrió sin preguntarle al servidor: se borra y se recarga para que el
 * navegador muestre la página pública. Las encuestas pendientes (localStorage) no se tocan.
 */
export async function leaveWithoutAccess(): Promise<void> {
  try {
    // Una sola vez por pestaña, por si algo impide borrar la copia guardada.
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    return;
  }
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* sin service worker */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* sin Cache Storage */
  }
  window.location.replace('/');
}

/** El dispositivo tiene acceso: se permite volver a detectar si lo pierde más adelante. */
export function accessConfirmed(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignorar */
  }
}
