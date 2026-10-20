import crypto from 'node:crypto';
import { db, now } from './db.js';
import { getSession } from './middleware.js';
import { notify } from './notifications.js';
import { clientIp } from './security.js';

/*
 * Tablets de "SuperShop Survey".
 *
 * Se vinculan sin usuario ni contraseña: en Vincular dispositivos se genera un QR con un
 * código de un solo uso que vence en 5 minutos. Al escanearlo, la tablet lo cambia por un
 * token propio (en la base solo queda su hash) que manda en el encabezado X-Device-Token.
 * Ese token solo sirve para enviar encuestas y para el latido de la tablet; no abre nada
 * del panel. Cada tablet queda fija a una tienda y una caja.
 */

export const DEVICE_HEADER = 'x-device-token';
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

export function readDeviceToken(req) {
  const value = req.headers[DEVICE_HEADER];
  return typeof value === 'string' && value.length >= 20 && value.length <= 128 ? value : null;
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
