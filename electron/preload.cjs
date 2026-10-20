const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  appName: 'SuperShop',
  company: 'ELAN Software',
  // Respaldos (ver ipcMain 'backup:*' en main.cjs)
  /** Abre la carpeta de respaldos locales por defecto. */
  openBackupsFolder: () => ipcRenderer.invoke('backup:open-folder'),
  /** Diálogo "Guardar como" para el respaldo. Devuelve la ruta elegida o null si se canceló. */
  chooseBackupLocation: () => ipcRenderer.invoke('backup:choose-location'),
  /** Deja el respaldo recién creado en la ruta elegida. Devuelve la ruta final. */
  saveBackupToLocation: (fileName) => ipcRenderer.invoke('backup:save-to-location', fileName),
  // Arranque automático con Windows (ver 'app:*-autostart' en main.cjs)
  getAutostart: () => ipcRenderer.invoke('app:get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('app:set-autostart', !!enabled),
});
