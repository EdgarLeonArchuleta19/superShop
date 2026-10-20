// Si se lanza desde una terminal que hereda ELECTRON_RUN_AS_NODE (p. ej. la de VS Code,
// que también es Electron), Electron corre como Node y `require('electron')` no trae la
// API. Se relanza sin esa variable.
if (typeof require('electron') === 'string') {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process')
    .spawn(process.execPath, process.argv.slice(1), { env, stdio: 'inherit' })
    .on('exit', (code) => process.exit(code ?? 0));
  return;
}

const { app, BrowserWindow, Menu, Tray, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

let backendProcess = null;
let mainWindow = null;
let tray = null;
let quitting = false;
let trayHintShown = false;
const startHidden = process.argv.includes('--hidden');

const isDev = !app.isPackaged;

const LOG_FILE = path.join(os.tmpdir(), 'supershop-app.log');
function logLine(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

process.on('uncaughtException', (e) => logLine(`[uncaught] ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => logLine(`[rejection] ${e && (e.stack || e.message)}`));

// Raíz de la app: la carpeta del proyecto en desarrollo y resources/app en el build
// (package.json usa "asar": false). Si algún día se activa asar, lo que el servidor y
// cloudflared necesitan leer del disco vive en app.asar.unpacked.
const APP_ROOT = (() => {
  const root = path.join(__dirname, '..');
  const unpacked = root.replace(/app\.asar$/, 'app.asar.unpacked');
  return unpacked !== root && fs.existsSync(unpacked) ? unpacked : root;
})();

function getBackendPath() {
  return path.join(APP_ROOT, 'backend', 'src', 'index.js');
}

function getAssetPath(filename) {
  return path.join(APP_ROOT, 'frontend', 'assets', filename);
}

function getFrontendDistPath() {
  return path.join(APP_ROOT, 'frontend', 'dist');
}

function getCloudflaredPath() {
  return path.join(APP_ROOT, 'electron', 'bin', 'cloudflared.exe');
}

function getDataDir() {
  const appData = process.env.APPDATA;
  if (appData) return path.join(appData, 'SuperShop', 'data');
  return path.join(app.getPath('userData'), 'data');
}

function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUploadsDir() {
  const appData = process.env.APPDATA;
  const base = appData ? path.join(appData, 'SuperShop') : app.getPath('userData');
  const dir = path.join(base, 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Credenciales OAuth de Google Drive. Se leen de electron/google-oauth.json (no versionado,
// se empaqueta con el build) o de variables de entorno, que tienen prioridad.
// Ver electron/google-oauth.example.json.
function getGoogleOAuthEnv() {
  let file = {};
  const filePath = path.join(__dirname, 'google-oauth.json');
  try {
    if (fs.existsSync(filePath)) file = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    logLine(`[google-oauth] no se pudo leer ${filePath}: ${e.message}`);
  }
  const port = process.env.PORT || '3001';
  const env = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || file.clientId,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || file.clientSecret,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || file.redirectUri
      || `http://localhost:${port}/api/admin/backup/oauth2callback`,
  };
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    logLine('[google-oauth] sin credenciales: el respaldo en Google Drive no estará disponible');
    delete env.GOOGLE_CLIENT_ID;
    delete env.GOOGLE_CLIENT_SECRET;
  }
  return env;
}

function startBackend() {
  ensureDataDir();
  const backendPath = getBackendPath();
  const nodePath = process.execPath;
  const env = {
    ...process.env,
    DATA_DIR: getDataDir(),
    PORT: process.env.PORT || '3001',
    FRONTEND_DIST: getFrontendDistPath(),
    CLOUDFLARED_PATH: getCloudflaredPath(),
    UPLOADS_DIR: getUploadsDir(),
    ELECTRON_RUN_AS_NODE: '1',
    ...getGoogleOAuthEnv(),
  };

  logLine(`startBackend: nodePath=${nodePath}`);
  logLine(`startBackend: backendPath=${backendPath}`);
  logLine(`startBackend: DATA_DIR=${getDataDir()}`);
  logLine(`startBackend: FRONTEND_DIST=${getFrontendDistPath()}`);
  logLine(`startBackend: backendExists=${fs.existsSync(backendPath)}`);

  backendProcess = spawn(nodePath, [backendPath], {
    env,
    cwd: path.dirname(backendPath),
    windowsHide: true,
  });

  backendProcess.stdout.on('data', (d) => logLine(`[out] ${d.toString().trim()}`));
  backendProcess.stderr.on('data', (d) => logLine(`[err] ${d.toString().trim()}`));
  backendProcess.on('error', (e) => logLine(`[spawn-error] ${e.message}`));
  backendProcess.on('close', (code) => logLine(`[close] code=${code}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    title: 'SuperShop - ELAN Software',
    icon: getAssetPath('icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL('http://localhost:3001');

  mainWindow.once('ready-to-show', () => {
    // Al encender la computadora (arranque automático) se queda en la bandeja.
    if (!startHidden) mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // Cerrar la ventana no apaga SuperShop: sigue en la bandeja para que las cajas,
  // los celulares y la conexión por internet sigan funcionando. "Salir" la apaga.
  mainWindow.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!trayHintShown && tray) {
      trayHintShown = true;
      tray.displayBalloon?.({
        title: 'SuperShop sigue funcionando',
        content: 'Está junto al reloj. Para cerrarla del todo, clic derecho en el ícono → Salir.',
        iconType: 'info',
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  try {
    const iconPath = getAssetPath('icon-512.png');
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Mostrar SuperShop', click: showWindow },
      { label: 'Abrir en navegador', click: () => shell.openExternal('http://localhost:3001') },
      { type: 'separator' },
      { label: 'Salir', click: () => app.quit() },
    ]);
    tray.setToolTip('SuperShop - ELAN Software');
    tray.setContextMenu(contextMenu);
    tray.on('click', showWindow);
  } catch (e) {
    logLine(`[tray-error] ${e.message}`);
  }
}

// Pantalla de respaldos: carpeta por defecto y "guardar como". Solo responde a la
// ventana de la app; los nombres de respaldo se validan (sin rutas) y la ruta de
// destino solo puede venir del diálogo nativo, nunca de la página.
const BACKUP_FILE_RE = /^supershop-backup-[\w-]+\.zip$/;
let pendingSavePath = null;

function backupsDir() {
  const dir = path.join(getDataDir(), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const fromAppWindow = (event) => !!mainWindow && event.sender === mainWindow.webContents;
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// "Ver respaldos locales": abre la carpeta por defecto.
ipcMain.handle('backup:open-folder', async (event) => {
  if (!fromAppWindow(event)) return false;
  await shell.openPath(backupsDir());
  return true;
});

// "Respaldar ahora", paso 1: el usuario elige dónde guardar (sugiere la carpeta por defecto).
ipcMain.handle('backup:choose-location', async (event) => {
  if (!fromAppWindow(event)) return null;
  const name = `supershop-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar respaldo',
    defaultPath: path.join(backupsDir(), name),
    buttonLabel: 'Guardar respaldo',
    filters: [{ name: 'Respaldo de SuperShop', extensions: ['zip'] }],
  });
  pendingSavePath = res.canceled || !res.filePath ? null : res.filePath;
  return pendingSavePath;
});

// "Respaldar ahora", paso 2: el backend ya creó `fileName` en la carpeta por defecto;
// se deja también en el lugar elegido. Devuelve la ruta final.
ipcMain.handle('backup:save-to-location', async (event, fileName) => {
  if (!fromAppWindow(event) || !pendingSavePath) return null;
  if (typeof fileName !== 'string' || !BACKUP_FILE_RE.test(fileName)) return null;
  const dest = pendingSavePath;
  pendingSavePath = null;
  const dir = backupsDir();
  const src = path.join(dir, fileName);
  if (!fs.existsSync(src) || samePath(src, dest)) return src;
  if (samePath(path.dirname(dest), dir) && BACKUP_FILE_RE.test(path.basename(dest))) {
    // Misma carpeta por defecto con otro nombre: se renombra en vez de duplicar.
    fs.renameSync(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
  return dest;
});

// Arranque automático con Windows. La versión portable se ejecuta desde una carpeta
// temporal distinta cada vez; hay que registrar el .exe original.
const launchExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const loginItemOptions = { path: launchExe, args: ['--hidden'] };

ipcMain.handle('app:get-autostart', (event) => {
  if (!fromAppWindow(event)) return null;
  return app.getLoginItemSettings(loginItemOptions).openAtLogin;
});

ipcMain.handle('app:set-autostart', (event, enabled) => {
  if (!fromAppWindow(event) || !app.isPackaged) return false;
  app.setLoginItemSettings({ ...loginItemOptions, openAtLogin: !!enabled });
  return app.getLoginItemSettings(loginItemOptions).openAtLogin;
});

// Una sola copia de SuperShop: una segunda chocaría con el puerto del servidor.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
}

app.whenReady().then(() => {
  if (!isPrimaryInstance) return;
  logLine(`app.whenReady: isPackaged=${app.isPackaged}`);
  startBackend();
  setTimeout(() => {
    createWindow();
    createTray();
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
  if (backendProcess) backendProcess.kill('SIGINT');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
