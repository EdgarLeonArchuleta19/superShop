// Respaldos: copias locales (ZIP en el servidor) y en Google Drive, cada una con su
// propia programación automática, retención y restauración.
//
// Configuración (settings.backup_config, JSON):
//   { timezone, retention, local: Schedule, drive: Schedule }
//   Schedule = { enabled, frequency: 'daily'|'weekly'|'monthly', time: 'HH:MM', weekday: 0-6, monthday: 1-28 }
// Estado (settings.backup_status, JSON):
//   { local: Status, drive: Status }  Status = { lastRun, lastFile, lastError, lastErrorAt, nextRun }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { db, now, DATA_DIR, seedRoles } from './db.js';
import { notify } from './notifications.js';

const FILE_PREFIX = 'supershop-backup-';
const FILE_RE = /^supershop-backup-[\w-]+\.zip$/;
const DRIVE_FOLDER_NAME = 'SuperShop Respaldos';
export const OAUTH_CALLBACK_PATH = '/api/admin/backup/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
export const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

export const FREQUENCIES = ['daily', 'weekly', 'monthly'];
export const RETENTION_OPTIONS = [5, 10, 20, 30, 60];
const DEFAULT_SCHEDULE = { enabled: false, frequency: 'weekly', time: '03:00', weekday: 1, monthday: 1 };

/** Error con un mensaje apto para mostrar al usuario. */
export class BackupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Configuración y estado
// ---------------------------------------------------------------------------

function readRow() {
  return (
    db.prepare(
      `SELECT backup_config, backup_status, backup_google_drive_tokens, backup_google_drive_folder_id,
              backup_drive_email, backup_local_path,
              backup_enabled, backup_frequency, backup_google_drive_enabled
       FROM settings WHERE id = 1`
    ).get() || {}
  );
}

function writeColumns(values) {
  const keys = Object.keys(values);
  if (!keys.length) return;
  db.prepare(`UPDATE settings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`).run(
    ...keys.map((k) => values[k])
  );
}

function parseJson(raw, fallback) {
  try {
    const value = JSON.parse(raw || 'null');
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function validTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function sanitizeSchedule(input, base) {
  const out = { ...DEFAULT_SCHEDULE, ...base };
  if (!input || typeof input !== 'object') return out;
  if (input.enabled !== undefined) out.enabled = !!input.enabled;
  if (FREQUENCIES.includes(input.frequency)) out.frequency = input.frequency;
  if (typeof input.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) out.time = input.time;
  const weekday = Number(input.weekday);
  if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) out.weekday = weekday;
  const monthday = Number(input.monthday);
  if (Number.isInteger(monthday) && monthday >= 1 && monthday <= 28) out.monthday = monthday;
  return out;
}

/**
 * Instalaciones previas: el programador anterior respaldaba en local cada semana
 * (backup_enabled, activo por defecto) y subía a Drive si estaba habilitado. Se
 * conserva ese comportamiento hasta que se guarde una configuración nueva.
 */
function legacyConfig(row) {
  const frequency = row.backup_frequency === 'monthly' ? 'monthly' : 'weekly';
  return {
    retention: 10,
    local: { enabled: !!row.backup_enabled, frequency },
    drive: { enabled: !!row.backup_google_drive_enabled && !!row.backup_google_drive_tokens, frequency },
  };
}

export function getConfig() {
  const row = readRow();
  const raw = row.backup_config ? parseJson(row.backup_config, {}) : legacyConfig(row);
  return {
    timezone: validTimezone(raw.timezone),
    retention: RETENTION_OPTIONS.includes(raw.retention) ? raw.retention : 10,
    local: sanitizeSchedule(raw.local, DEFAULT_SCHEDULE),
    drive: sanitizeSchedule(raw.drive, DEFAULT_SCHEDULE),
  };
}

function getStatus() {
  const raw = parseJson(readRow().backup_status, {});
  return { local: { ...raw.local }, drive: { ...raw.drive } };
}

function setStatus(target, patch) {
  const status = getStatus();
  status[target] = { ...status[target], ...patch };
  writeColumns({ backup_status: JSON.stringify(status) });
}

export function isDriveAvailable() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function readTokens() {
  return parseJson(readRow().backup_google_drive_tokens, null);
}

export function isDriveConnected() {
  return isDriveAvailable() && !!readTokens();
}

/** Lo que ve la pantalla de respaldos. Nunca incluye tokens ni rutas del servidor. */
export function getPublicSettings() {
  const row = readRow();
  const config = getConfig();
  const status = getStatus();
  const connected = isDriveConnected();
  const pick = (s) => ({
    lastRun: s.lastRun || null,
    lastFile: s.lastFile || null,
    lastError: s.lastError || null,
    lastErrorAt: s.lastErrorAt || null,
    nextRun: s.nextRun || null,
  });
  return {
    config,
    status: { local: pick(status.local), drive: pick(status.drive) },
    drive: {
      available: isDriveAvailable(),
      connected,
      email: connected ? row.backup_drive_email || null : null,
      folderUrl:
        connected && row.backup_google_drive_folder_id
          ? `https://drive.google.com/drive/folders/${row.backup_google_drive_folder_id}`
          : null,
    },
    retentionOptions: RETENTION_OPTIONS,
  };
}

export function updateSettings(input = {}) {
  const current = getConfig();
  const next = {
    timezone: validTimezone(input.timezone) || current.timezone,
    retention: RETENTION_OPTIONS.includes(Number(input.retention)) ? Number(input.retention) : current.retention,
    local: sanitizeSchedule(input.local, current.local),
    drive: sanitizeSchedule(input.drive, current.drive),
  };
  if (next.drive.enabled && !current.drive.enabled && !isDriveConnected()) {
    throw new BackupError('Conecta tu cuenta de Google Drive antes de activar el respaldo automático en la nube.');
  }
  writeColumns({ backup_config: JSON.stringify(next) });
  for (const target of ['local', 'drive']) {
    setStatus(target, { nextRun: next[target].enabled ? computeNextRun(next[target], next.timezone) : null });
  }
  if (next.retention !== current.retention) {
    try {
      pruneLocal(next.retention);
    } catch (e) {
      console.error('[Backup] No se pudieron depurar respaldos locales:', e.message);
    }
  }
  return getPublicSettings();
}

// ---------------------------------------------------------------------------
// Fechas en la zona horaria de la tienda
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function zoneParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || undefined,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: WEEKDAYS.indexOf(p.weekday) };
}

/** Instante UTC (ms) que corresponde a la fecha y hora local indicadas en `tz`. */
function zonedToUtc(y, m, d, h, mi, tz) {
  const target = Date.UTC(y, m - 1, d, h, mi);
  const offset = (t) => {
    const p = zoneParts(new Date(t), tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - t;
  };
  const first = target - offset(target);
  return target - offset(first);
}

/** Próxima ejecución (ISO) posterior a `from` según la programación. */
export function computeNextRun(schedule, tz, from = new Date()) {
  const [hh, mm] = schedule.time.split(':').map(Number);
  const today = zoneParts(from, tz);
  for (let i = 0; i <= 62; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (schedule.frequency === 'weekly' && day.getUTCDay() !== schedule.weekday) continue;
    if (schedule.frequency === 'monthly' && d !== schedule.monthday) continue;
    const t = zonedToUtc(y, m, d, hh, mm, tz);
    if (t > from.getTime()) return new Date(t).toISOString();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Creación de respaldos
// ---------------------------------------------------------------------------

// Las operaciones de respaldo/restauración se ejecutan de una en una.
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

function localDir() {
  const dir = readRow().backup_local_path || path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removeDbFiles(file) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(file + suffix, { force: true });
}

function exportData() {
  const s = db.prepare('SELECT store_name, store_tagline, store_logo FROM settings WHERE id = 1').get();
  return {
    settings: s,
    branches: db.prepare('SELECT * FROM branches').all(),
    registers: db.prepare('SELECT * FROM registers').all(),
    cashiers: db.prepare('SELECT * FROM cashiers').all(),
    roles: db.prepare('SELECT id, name, description, permissions, is_system, is_admin FROM roles').all(),
    users: db.prepare('SELECT id, username, name, role, role_id, active, created_at FROM users').all(),
    surveys: db.prepare('SELECT * FROM surveys').all(),
    exportedAt: now(),
  };
}

/**
 * Genera el ZIP del respaldo en `destPath`: copia consistente de la base de datos
 * (sin sesiones activas ni la conexión de Google Drive) + data.json legible.
 */
async function buildZip(destPath) {
  const snapshot = path.join(os.tmpdir(), `supershop-snapshot-${crypto.randomUUID()}.db`);
  try {
    await db.backup(snapshot);
    const snap = new Database(snapshot);
    try {
      snap.pragma('journal_mode = DELETE');
      snap.prepare('DELETE FROM sessions').run();
      snap.prepare('DELETE FROM login_failures').run();
      snap.prepare('DELETE FROM device_pairings').run();
      snap
        .prepare('UPDATE settings SET backup_google_drive_tokens = NULL, backup_drive_email = NULL, tunnel_token = NULL, access_key = NULL')
        .run();
      snap.exec('VACUUM');
    } finally {
      snap.close();
    }
    const zip = new AdmZip();
    zip.addLocalFile(snapshot, '', 'nallely.db');
    zip.addFile('data.json', Buffer.from(JSON.stringify(exportData(), null, 2), 'utf8'));
    zip.writeZip(destPath);
  } finally {
    removeDbFiles(snapshot);
  }
}

function backupFileName(suffix = '') {
  return `${FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}${suffix}.zip`;
}

async function createLocalBackup(retention, suffix = '') {
  const name = backupFileName(suffix);
  const file = path.join(localDir(), name);
  await buildZip(file);
  pruneLocal(retention);
  return { name, size: fs.statSync(file).size };
}

export function listLocalBackups() {
  const dir = localDir();
  return fs
    .readdirSync(dir)
    .filter((name) => FILE_RE.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function pruneLocal(retention) {
  const dir = localDir();
  for (const file of listLocalBackups().slice(retention)) {
    fs.rmSync(path.join(dir, file.name), { force: true });
  }
}

/** Ruta de un respaldo local por nombre; el nombre se valida para impedir salir de la carpeta. */
export function resolveLocalBackup(name) {
  if (typeof name !== 'string' || !FILE_RE.test(name)) throw new BackupError('Respaldo no encontrado', 404);
  const file = path.join(localDir(), name);
  if (!fs.existsSync(file)) throw new BackupError('Respaldo no encontrado', 404);
  return file;
}

export function deleteLocalBackup(name) {
  fs.rmSync(resolveLocalBackup(name), { force: true });
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

let googleLib;
async function google() {
  if (!googleLib) googleLib = (await import('googleapis')).google;
  return googleLib;
}

function oauthClient(g, origin) {
  if (!isDriveAvailable()) {
    throw new BackupError('La copia en Google Drive no está disponible en esta instalación.');
  }
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `${origin || 'http://localhost:3001'}${OAUTH_CALLBACK_PATH}`;
  return new g.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
}

// `state` de OAuth: liga el regreso de Google a una solicitud iniciada desde SuperShop
// por un usuario autorizado (evita que se vincule una cuenta ajena).
const pendingStates = new Map();
const STATE_TTL_MS = 15 * 60 * 1000;

export async function getAuthUrl(origin) {
  const g = await google();
  const client = oauthClient(g, origin);
  for (const [key, entry] of pendingStates) if (entry.expires < Date.now()) pendingStates.delete(key);
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { origin, expires: Date.now() + STATE_TTL_MS });
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state });
}

export async function handleOAuthCallback(code, state) {
  const entry = typeof state === 'string' ? pendingStates.get(state) : null;
  pendingStates.delete(state);
  if (!entry || entry.expires < Date.now() || !code) {
    throw new BackupError('La solicitud de conexión expiró o no es válida. Vuelve a intentarlo desde SuperShop.');
  }
  const g = await google();
  const client = oauthClient(g, entry.origin);
  const { tokens } = await client.getToken(String(code));
  client.setCredentials(tokens);
  const drive = g.drive({ version: 'v3', auth: client });
  let email = null;
  try {
    const about = await drive.about.get({ fields: 'user(emailAddress)' });
    email = about.data.user?.emailAddress || null;
  } catch {
    /* el correo es solo informativo */
  }
  // Cuenta nueva: la carpeta anterior pertenece a otra cuenta.
  writeColumns({
    backup_google_drive_tokens: JSON.stringify(tokens),
    backup_drive_email: email,
    backup_google_drive_folder_id: null,
  });
  setStatus('drive', { lastError: null, lastErrorAt: null });
  await ensureDriveFolder(drive);
}

async function driveApi() {
  const tokens = readTokens();
  if (!tokens) throw new BackupError('Google Drive no está conectado.');
  const g = await google();
  const client = oauthClient(g);
  client.setCredentials(tokens);
  // googleapis renueva el access_token solo; se guarda el nuevo.
  client.on('tokens', (fresh) => {
    writeColumns({ backup_google_drive_tokens: JSON.stringify({ ...readTokens(), ...fresh }) });
  });
  return { drive: g.drive({ version: 'v3', auth: client }), client, tokens };
}

async function ensureDriveFolder(drive) {
  const current = readRow().backup_google_drive_folder_id;
  if (current) {
    try {
      const res = await drive.files.get({ fileId: current, fields: 'id, trashed' });
      if (!res.data.trashed) return current;
    } catch (e) {
      if (driveStatus(e) !== 404) throw e;
    }
  }
  const res = await drive.files.create({
    requestBody: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  writeColumns({ backup_google_drive_folder_id: res.data.id });
  return res.data.id;
}

async function uploadToDrive(retention) {
  const { drive } = await driveApi();
  const folderId = await ensureDriveFolder(drive);
  const name = backupFileName();
  const tmp = path.join(os.tmpdir(), name);
  try {
    await buildZip(tmp);
    const size = fs.statSync(tmp).size;
    await drive.files.create({
      requestBody: { name, parents: [folderId] },
      media: { mimeType: 'application/zip', body: fs.createReadStream(tmp) },
      fields: 'id',
    });
    await pruneDrive(drive, folderId, retention);
    return { name, size };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

async function pruneDrive(drive, folderId, retention) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and name contains '${FILE_PREFIX}'`,
      orderBy: 'createdTime desc',
      fields: 'files(id)',
      pageSize: 200,
    });
    for (const file of (res.data.files || []).slice(retention)) {
      await drive.files.delete({ fileId: file.id });
    }
  } catch (e) {
    console.error('[Backup] No se pudieron depurar respaldos antiguos en Drive:', e.message);
  }
}

export async function disconnectDrive() {
  const tokens = readTokens();
  if (tokens && isDriveAvailable()) {
    try {
      const g = await google();
      await oauthClient(g).revokeToken(tokens.refresh_token || tokens.access_token);
    } catch {
      /* si Google no responde, igual se olvida la conexión local */
    }
  }
  writeColumns({
    backup_google_drive_tokens: null,
    backup_drive_email: null,
    backup_google_drive_folder_id: null,
  });
  const config = getConfig();
  writeColumns({ backup_config: JSON.stringify({ ...config, drive: { ...config.drive, enabled: false } }) });
  setStatus('drive', { nextRun: null, lastError: null, lastErrorAt: null });
}

function driveStatus(e) {
  return e?.response?.status ?? e?.code ?? e?.status;
}

/** Traduce un error técnico a un mensaje que el usuario entienda. */
function friendlyError(e, target) {
  if (e instanceof BackupError) return e.message;
  const msg = String(e?.message || '');
  const code = e?.code;
  if (['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code) || /fetch failed|network/i.test(msg)) {
    return 'No hay conexión a internet. Se volverá a intentar más tarde.';
  }
  if (code === 'ENOSPC') return 'No hay espacio suficiente en el disco para guardar el respaldo.';
  if (code === 'EACCES' || code === 'EPERM') return 'No hay permiso para escribir en la carpeta de respaldos.';
  if (target === 'drive') {
    if (/invalid_grant|unauthorized_client/i.test(msg) || driveStatus(e) === 401) {
      return 'Google rechazó la conexión: el acceso se revocó o expiró. Vuelve a conectar Google Drive.';
    }
    if (/storageQuotaExceeded|quota/i.test(msg)) return 'Tu Google Drive no tiene espacio suficiente.';
    return 'No se pudo subir el respaldo a Google Drive.';
  }
  return 'No se pudo crear el respaldo.';
}

// ---------------------------------------------------------------------------
// Ejecución (manual y programada)
// ---------------------------------------------------------------------------

function notifyBackup(target, tone, message) {
  const where = target === 'drive' ? 'en Google Drive' : 'local';
  notify({
    kind: 'backup',
    tone,
    title: tone === 'danger' ? `Falló el respaldo ${where}` : `Respaldo ${where} restablecido`,
    message,
    link: '/app/ajustes/respaldos',
    audience: 'settings.backups',
    dedupeKey: `backup:${target}`,
  });
}

/** Crea un respaldo en `target` ('local' | 'drive'). Lanza BackupError con mensaje para el usuario. */
export function runBackup(target) {
  return exclusive(async () => {
    const { retention } = getConfig();
    try {
      const result = target === 'drive' ? await uploadToDrive(retention) : await createLocalBackup(retention);
      const hadError = !!getStatus()[target].lastError;
      setStatus(target, { lastRun: now(), lastFile: result.name, lastError: null, lastErrorAt: null });
      // Solo se avisa si antes había fallado: un respaldo correcto cada semana no es noticia.
      if (hadError) notifyBackup(target, 'success', 'El respaldo volvió a funcionar correctamente.');
      return result;
    } catch (e) {
      const message = friendlyError(e, target);
      if (!(e instanceof BackupError)) console.error(`[Backup] Error en respaldo ${target}:`, e);
      setStatus(target, { lastError: message, lastErrorAt: now() });
      notifyBackup(target, 'danger', message);
      // Acceso revocado: se olvida la conexión para que la pantalla pida reconectar.
      if (target === 'drive' && /Vuelve a conectar/.test(message)) {
        writeColumns({ backup_google_drive_tokens: null, backup_drive_email: null });
      }
      throw new BackupError(message, 500);
    }
  });
}

const RETRY_MS = 60 * 60 * 1000;

async function tick() {
  const config = getConfig();
  const status = getStatus();
  for (const target of ['local', 'drive']) {
    const schedule = config[target];
    if (!schedule.enabled) continue;
    if (target === 'drive' && !isDriveConnected()) continue;
    const next = status[target].nextRun;
    if (!next) {
      setStatus(target, { nextRun: computeNextRun(schedule, config.timezone) });
      continue;
    }
    if (new Date(next).getTime() > Date.now()) continue;
    try {
      await runBackup(target);
      setStatus(target, { nextRun: computeNextRun(schedule, config.timezone) });
      console.log(`[Backup] Respaldo automático ${target} completado`);
    } catch {
      // Sin internet, disco lleno, etc.: se reintenta en una hora.
      setStatus(target, { nextRun: new Date(Date.now() + RETRY_MS).toISOString() });
    }
  }
}

let timer = null;
let ticking = false;

/** Revisa cada minuto si toca algún respaldo. Si el equipo estaba apagado, se hace al arrancar. */
export function scheduleBackups() {
  if (timer) clearInterval(timer);
  const run = () => {
    if (ticking) return;
    ticking = true;
    tick()
      .catch((e) => console.error('[Backup] Error en el programador:', e))
      .finally(() => {
        ticking = false;
      });
  };
  run();
  timer = setInterval(run, 60 * 1000);
}

export function stopSchedule() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ---------------------------------------------------------------------------
// Restauración
// ---------------------------------------------------------------------------

const RESTORE_TABLES = ['roles', 'branches', 'registers', 'cashiers', 'users', 'surveys'];

export function restoreFromZipBuffer(buffer) {
  return exclusive(async () => {
    let entry;
    try {
      const zip = new AdmZip(buffer);
      entry = zip.getEntries().find((e) => !e.isDirectory && /^[^/\\]+\.db$/i.test(e.entryName));
    } catch {
      entry = null;
    }
    if (!entry) throw new BackupError('El archivo no es un respaldo válido de SuperShop.');

    const tmp = path.join(os.tmpdir(), `supershop-restore-${crypto.randomUUID()}.db`);
    try {
      fs.writeFileSync(tmp, entry.getData());
      validateBackupDb(tmp);
      // Copia de seguridad del estado actual por si hay que deshacer la restauración.
      const { retention } = getConfig();
      const safety = await createLocalBackup(retention + 1, '-antes-de-restaurar');
      restoreFromDbFile(tmp);
      return { safetyBackup: safety.name };
    } finally {
      removeDbFiles(tmp);
    }
  });
}

export function restoreLocalBackup(name) {
  return restoreFromZipBuffer(fs.readFileSync(resolveLocalBackup(name)));
}

function validateBackupDb(file) {
  let src;
  try {
    src = new Database(file, { fileMustExist: true });
    src.pragma('journal_mode = DELETE');
    const tables = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all());
    if (!['users', 'surveys', 'branches'].every((t) => tables.has(t))) throw new Error('faltan tablas');
  } catch {
    throw new BackupError('El archivo no es un respaldo válido de SuperShop.');
  } finally {
    src?.close();
  }
}

/**
 * Reemplaza los datos actuales por los del respaldo usando la conexión abierta
 * (no se sobrescribe el archivo en uso). Copia las columnas que existan en ambos
 * lados, así que también acepta respaldos de versiones anteriores.
 */
function restoreFromDbFile(file) {
  const columns = (schema, table) =>
    db.prepare(`PRAGMA ${schema}.table_info(${table})`).all().map((c) => c.name);

  db.pragma('foreign_keys = OFF');
  db.prepare('ATTACH DATABASE ? AS src').run(file);
  try {
    const srcTables = new Set(
      db.prepare("SELECT name FROM src.sqlite_master WHERE type = 'table'").pluck().all()
    );
    db.transaction(() => {
      db.prepare('DELETE FROM main.sessions').run();
      for (const table of [...RESTORE_TABLES].reverse()) db.prepare(`DELETE FROM main.${table}`).run();
      for (const table of RESTORE_TABLES) {
        if (!srcTables.has(table)) continue;
        const srcColumns = new Set(columns('src', table));
        const common = columns('main', table)
          .filter((c) => srcColumns.has(c))
          .map((c) => `"${c}"`)
          .join(', ');
        db.prepare(`INSERT INTO main.${table} (${common}) SELECT ${common} FROM src.${table}`).run();
      }
      if (srcTables.has('settings')) {
        const store = db.prepare('SELECT store_name, store_tagline, store_logo FROM src.settings WHERE id = 1').get();
        if (store) {
          db.prepare('UPDATE main.settings SET store_name = ?, store_tagline = ?, store_logo = ?, updated_at = ? WHERE id = 1')
            .run(store.store_name, store.store_tagline, store.store_logo, now());
        }
      }
    })();
  } finally {
    db.prepare('DETACH DATABASE src').run();
    db.pragma('foreign_keys = ON');
  }
  // Respaldos anteriores a los roles configurables: crea los roles de sistema y los asigna.
  seedRoles();
}
