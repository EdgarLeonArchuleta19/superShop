import crypto from 'node:crypto';
import { db, now } from './db.js';
import { getSession } from './middleware.js';
import { notify } from './notifications.js';
import { clientIp } from './security.js';

/*
 * Tablets de "SuperShop Survey".
 *
 * Se vinculan sin usuario ni contraseña, de dos formas:
 * - QR: en Vincular dispositivos se genera un código de un solo uso (5 min); al escanearlo,
 *   la tablet lo cambia por su token.
 * - Código en la tablet: la app (también la instalada) muestra 6 dígitos y en el panel se
 *   escriben. Sirve cuando el QR se abrió en otro navegador que la app instalada.
 * La tablet guarda su token (en la base solo queda su hash) y lo manda en X-Device-Token;
 * además queda en la cookie ss_device como respaldo, por si se borra el almacenamiento.
 * El token solo sirve para enviar encuestas y para el latido; no abre nada del panel.
 */

export const DEVICE_HEADER = 'x-device-token';
const DEVICE_COOKIE = 'ss_device';
/** 400 días: el máximo que aceptan los navegadores. Se renueva con cada latido. */
const DEVICE_COOKIE_MAX_AGE_S = 400 * 24 * 3600;
export const PAIRING_TTL_MS = 5 * 60 * 1000;
/** Cada cuánto se guarda el latido de una tablet (para no escribir en cada petición). */
const SEEN_EVERY_MS = 60 * 1000;
/**
 * Una tablet desvinculada aún puede entregar, durante este tiempo, las encuestas que
 * respondió antes de desvincularla (las tenía guardadas sin conexión).
 */
const REVOKED_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export const hashSecret = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export const newSecret = () => crypto.randomBytes(32).toString('base64url');

const validToken = (value) => (typeof value === 'string' && value.length >= 20 && value.length <= 128 ? value : null);

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Token de la tablet: el encabezado X-Device-Token o, si no viene, la cookie de respaldo. */
export function readDeviceToken(req) {
  return validToken(req.headers[DEVICE_HEADER]) ?? validToken(readCookie(req, DEVICE_COOKIE));
}

/** ¿El token llegó solo por la cookie? (la tablet perdió su almacenamiento). */
export function tokenFromCookieOnly(req) {
  return !validToken(req.headers[DEVICE_HEADER]) && !!validToken(readCookie(req, DEVICE_COOKIE));
}

export function setDeviceCookie(req, res, token) {
  const parts = [`${DEVICE_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', `Max-Age=${DEVICE_COOKIE_MAX_AGE_S}`, 'HttpOnly', 'SameSite=Lax'];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/** Crea la tablet y devuelve su token (una sola vez: en la base queda solo el hash). */
export function createDevice({ name, branchId, registerId, createdBy, createdByName }, req) {
  const token = newSecret();
  const id = db
    .prepare(
      `INSERT INTO devices (token_hash, kind, name, branch_id, register_id, created_by, created_by_name, created_at, last_seen_at, last_ip, user_agent)
       VALUES (?, 'kiosk', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      hashSecret(token),
      name,
      branchId,
      registerId,
      createdBy ?? null,
      createdByName ?? null,
      now(),
      req ? now() : null,
      req ? clientIp(req) || null : null,
      req ? String(req.headers['user-agent'] || '').slice(0, 300) || null : null
    ).lastInsertRowid;
  return { id, token };
}

/** Le da un token nuevo a una tablet (al recogerlo con el código de 6 dígitos). */
export function issueDeviceToken(deviceId, req) {
  const token = newSecret();
  db.prepare('UPDATE devices SET token_hash = ?, last_seen_at = ?, last_ip = ?, user_agent = ? WHERE id = ?').run(
    hashSecret(token),
    now(),
    clientIp(req) || null,
    String(req.headers['user-agent'] || '').slice(0, 300) || null,
    deviceId
  );
  return token;
}

export function notifyPaired(device) {
  notify({
    kind: 'devices',
    tone: 'success',
    title: 'Tablet de encuestas vinculada',
    message: `${device.name} ya puede recibir encuestas.`,
    link: '/app/ajustes/accesos',
    audience: 'settings.connect',
  });
}

export function findDevice(token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM devices WHERE token_hash = ?').get(hashSecret(token)) ?? null;
}

/** ¿El token es de una tablet vinculada (no desvinculada)? Lo usa accessGate.js. */
export function isActiveDeviceToken(token) {
  const device = findDevice(token);
  return !!device && !device.revoked_at;
}

/** Lo que la tablet necesita saber de sí misma. */
export function publicDevice(id) {
  const row = db
    .prepare(
      `SELECT d.id, d.name, d.branch_id, b.name AS branch_name, d.register_id, r.name AS register_name
       FROM devices d
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN registers r ON r.id = d.register_id
       WHERE d.id = ?`
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    branch: row.branch_id ? { id: row.branch_id, name: row.branch_name } : null,
    register: row.register_id ? { id: row.register_id, name: row.register_name } : null,
  };
}

/** Latido: última conexión, IP, navegador y encuestas pendientes en la tablet. */
export function touchDevice(device, req, pending) {
  const last = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
  const nextPending = Number.isInteger(pending) && pending >= 0 ? Math.min(pending, 1_000_000) : device.pending;
  if (Date.now() - last < SEEN_EVERY_MS && nextPending === device.pending) return;
  // Desde cuándo tiene encuestas sin enviar: se marca al pasar de 0 a más y se borra en 0.
  const pendingSince = nextPending > 0 ? (device.pending_since ?? now()) : null;
  db.prepare(
    'UPDATE devices SET last_seen_at = ?, last_ip = ?, user_agent = ?, pending = ?, pending_since = ? WHERE id = ?'
  ).run(
    now(),
    clientIp(req) || null,
    String(req.headers['user-agent'] || '').slice(0, 300) || null,
    nextPending,
    pendingSince,
    device.id
  );
}

// ---------------------------------------------------------------------------
// Avisos: encuestas atoradas y tablets sin conexión
// ---------------------------------------------------------------------------

const WATCH_EVERY_MS = 10 * 60 * 1000;
/** Encuestas guardadas en la tablet que llevan este tiempo sin poder enviarse. */
export const PENDING_ALERT_MS = 60 * 60 * 1000;
/** Tablet sin latido durante este tiempo (contando solo mientras el servidor está encendido). */
export const OFFLINE_ALERT_MS = 24 * 60 * 60 * 1000;
const serverStartedAt = Date.now();

function ago(ms) {
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} días`;
}

/**
 * Revisa las tablets y avisa a quien maneja Vincular dispositivos. Un aviso por episodio
 * (dedupeKey con la fecha en que empezó): repetir la revisión no lo vuelve a marcar como
 * no leído. La desconexión se cuenta desde que arrancó el servidor, para no avisar de
 * todas las tablets cuando la computadora principal estuvo apagada.
 */
export function checkDevices() {
  const rows = db
    .prepare(
      `SELECT id, name, last_seen_at, pending, pending_since FROM devices
       WHERE revoked_at IS NULL AND kind = 'kiosk'`
    )
    .all();
  const t = Date.now();
  for (const d of rows) {
    const since = d.pending_since ? Date.parse(d.pending_since) : NaN;
    if (d.pending > 0 && t - since >= PENDING_ALERT_MS) {
      notify({
        kind: 'devices',
        tone: 'warning',
        title: `Encuestas sin enviar en ${d.name}`,
        message: `La tablet tiene ${d.pending} encuesta${d.pending === 1 ? '' : 's'} guardada${d.pending === 1 ? '' : 's'} desde hace ${ago(t - since)} sin poder enviarlas. Revisa su internet o wifi; se envían solas al volver la conexión.`,
        link: '/app/ajustes/conectar',
        audience: 'settings.connect',
        dedupeKey: `device-pending:${d.id}:${d.pending_since}`,
        reopen: false,
      });
    }
    const seen = d.last_seen_at ? Date.parse(d.last_seen_at) : NaN;
    if (Number.isFinite(seen) && t - Math.max(seen, serverStartedAt) >= OFFLINE_ALERT_MS) {
      notify({
        kind: 'devices',
        tone: 'warning',
        title: `${d.name} sin conexión`,
        message: `La tablet no se conecta desde hace ${ago(t - seen)}. Revisa que esté encendida, con internet o wifi y con SuperShop Survey abierto.`,
        link: '/app/ajustes/conectar',
        audience: 'settings.connect',
        dedupeKey: `device-offline:${d.id}:${d.last_seen_at}`,
        reopen: false,
      });
    }
  }
}

let watchTimer = null;
export function startDeviceWatch() {
  if (watchTimer) return;
  watchTimer = setInterval(() => {
    try {
      checkDevices();
    } catch (e) {
      console.warn('[Dispositivos] No se pudo revisar las tablets:', e.message);
    }
  }, WATCH_EVERY_MS);
  watchTimer.unref();
}

/** Solo tablets vinculadas. Una desvinculada recibe 401 con `revoked: true`. */
export function requireDevice(req, res, next) {
  const device = findDevice(readDeviceToken(req));
  if (!device || device.revoked_at) {
    return res.status(401).json({ error: 'Este dispositivo no está vinculado', revoked: !!device });
  }
  req.device = device;
  next();
}

/**
 * Envío de encuestas: una tablet vinculada, o cualquier usuario con sesión (equipos que
 * usaban "Mi encuesta" con usuario y todavía tienen encuestas guardadas sin enviar).
 */
export function requireSurveySender(req, res, next) {
  const device = findDevice(readDeviceToken(req));
  if (device && (!device.revoked_at || Date.now() - Date.parse(device.revoked_at) < REVOKED_GRACE_MS)) {
    req.device = device;
    touchDevice(device, req);
    return next();
  }
  const auth = req.headers.authorization || '';
  const session = getSession(auth.startsWith('Bearer ') ? auth.slice(7) : null);
  if (session) {
    req.session = session;
    return next();
  }
  return res.status(401).json({ error: 'Este dispositivo no está vinculado', revoked: !!device });
}

/** Encuestas que acepta una tablet desvinculada: solo las respondidas antes de desvincularla. */
export function acceptedFromDevice(device, item) {
  if (!device.revoked_at) return true;
  const answered = Date.parse(item.client_ts || item.created_at || '');
  return Number.isFinite(answered) && answered <= Date.parse(device.revoked_at);
}
