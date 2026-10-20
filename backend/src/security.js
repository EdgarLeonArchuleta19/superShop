import crypto from 'node:crypto';
import { db, now } from './db.js';
import { notify } from './notifications.js';

/*
 * Protección de la versión en internet:
 * - Puerta de Cloudflare: con CF_ORIGIN_SECRET solo se aceptan peticiones que traigan la
 *   clave que Cloudflare agrega (regla de transformación). Así nadie entra directo por
 *   la dirección de Render y se salta el firewall de Cloudflare.
 * - Países: con ALLOWED_COUNTRIES (ej. "MX") se rechaza lo que Cloudflare marque como de
 *   otro país. Solo se aplica junto con CF_ORIGIN_SECRET, porque sin ella el encabezado
 *   del país se puede falsificar.
 * - Inicio de sesión: los intentos fallidos se guardan en la base (sobreviven reinicios)
 *   y bloquean la cuenta y la IP con esperas que crecen. Todo intento queda registrado.
 */

const ORIGIN_SECRET = process.env.CF_ORIGIN_SECRET || '';
export const ORIGIN_HEADER = 'x-supershop-origin';
const ALLOWED_COUNTRIES = (process.env.ALLOWED_COUNTRIES || '')
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);

export const originLocked = ORIGIN_SECRET.length > 0;

if (ORIGIN_SECRET && ORIGIN_SECRET.length < 24) {
  console.warn('[Seguridad] CF_ORIGIN_SECRET es muy corta; usa al menos 24 caracteres al azar.');
}
if (ALLOWED_COUNTRIES.length && !originLocked) {
  console.warn('[Seguridad] ALLOWED_COUNTRIES no se aplica sin CF_ORIGIN_SECRET (el país se podría falsificar).');
}

function sameSecret(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(ORIGIN_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** IP real del visitante. Detrás de Cloudflare (puerta cerrada) es CF-Connecting-IP. */
export function clientIp(req) {
  if (originLocked) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf.trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

/** País según Cloudflare (código de 2 letras), o null si no hay forma confiable de saberlo. */
export function clientCountry(req) {
  if (!originLocked) return null;
  const c = req.headers['cf-ipcountry'];
  return typeof c === 'string' && c ? c.toUpperCase() : null;
}

function deny(req, res, message) {
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: message });
  res.status(403).type('text/plain; charset=utf-8').send(message);
}

/** Middleware global: puerta de Cloudflare y países permitidos. */
export function originGuard(req, res, next) {
  if (!originLocked) return next();
  // Render revisa la salud del servicio directo, sin pasar por Cloudflare.
  if (req.path === '/api/health') return next();
  if (!sameSecret(req.headers[ORIGIN_HEADER])) {
    return deny(req, res, 'Acceso no permitido.');
  }
  if (ALLOWED_COUNTRIES.length) {
    const country = clientCountry(req);
    // Sin encabezado de país (geolocalización apagada en Cloudflare) se deja pasar; el
    // firewall de Cloudflare es el filtro principal. "T1" es la red Tor.
    if (country && (country === 'T1' || !ALLOWED_COUNTRIES.includes(country))) {
      return deny(req, res, 'Acceso no permitido desde tu ubicación.');
    }
  }
  next();
}

// ---------------------------------------------------------------------------
// Intentos de inicio de sesión
// ---------------------------------------------------------------------------

/** Fallos permitidos antes de bloquear: por cuenta y por IP. */
const ACCOUNT_THRESHOLD = 5;
const IP_THRESHOLD = 15;
const MINUTE = 60 * 1000;
const MAX_LOCK_MS = 15 * MINUTE;
/** Si pasa este tiempo sin fallos, el contador vuelve a cero. */
const FAILURE_WINDOW_MS = 24 * 60 * MINUTE;
const LOG_RETENTION_DAYS = 90;

// Se preparan al primer uso: este módulo se carga antes de que db.js cree las tablas.
let stmts = null;
function q() {
  stmts ??= {
    get: db.prepare('SELECT * FROM login_failures WHERE key = ?'),
    upsert: db.prepare(
      // Parámetros por posición: con Turso (réplica) las escrituras se reenvían a la nube y
      // los parámetros con nombre (@x) no siempre se envían bien.
      `INSERT INTO login_failures (key, count, last_at, locked_until) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET count = excluded.count, last_at = excluded.last_at, locked_until = excluded.locked_until`
    ),
    clear: db.prepare('DELETE FROM login_failures WHERE key = ?'),
    active: db.prepare('SELECT * FROM login_failures WHERE locked_until > ? ORDER BY locked_until DESC'),
    log: db.prepare(
      `INSERT INTO login_log (created_at, username, user_id, success, reason, ip, country, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    prune: db.prepare('DELETE FROM login_log WHERE created_at < ?'),
    failedSince: db.prepare(
      'SELECT COUNT(*) AS c, COUNT(DISTINCT ip) AS ips FROM login_log WHERE success = 0 AND created_at >= ?'
    ),
    pruneFailures: db.prepare('DELETE FROM login_failures WHERE last_at < ? AND (locked_until IS NULL OR locked_until < ?)'),
  };
  return stmts;
}

const accountKey = (username) => `user:${String(username || '').trim().toLowerCase()}`;
const ipKey = (ip) => `ip:${ip}`;

function lockMs(count, threshold) {
  if (count < threshold) return 0;
  return Math.min(MAX_LOCK_MS, MINUTE * 2 ** (count - threshold));
}

/** Milisegundos que faltan para poder intentar de nuevo (0 si no hay bloqueo). */
function loginLockRemainingUnsafe(username, ip) {
  const t = Date.now();
  let remaining = 0;
  for (const key of [accountKey(username), ipKey(ip)]) {
    const row = q().get.get(key);
    if (row?.locked_until) remaining = Math.max(remaining, new Date(row.locked_until).getTime() - t);
  }
  return Math.max(0, remaining);
}

function recordLoginFailureUnsafe(username, ip) {
  const t = Date.now();
  for (const [key, threshold] of [
    [accountKey(username), ACCOUNT_THRESHOLD],
    [ipKey(ip), IP_THRESHOLD],
  ]) {
    const row = q().get.get(key);
    const fresh = !row || t - new Date(row.last_at).getTime() > FAILURE_WINDOW_MS;
    const count = fresh ? 1 : row.count + 1;
    const ms = lockMs(count, threshold);
    q().upsert.run(key, count, new Date(t).toISOString(), ms ? new Date(t + ms).toISOString() : null);
    if (ms) notifyLock(key, count, ms);
  }
}

const hourBucket = () => new Date().toISOString().slice(0, 13);

function notifyLock(key, count, ms) {
  const value = key.slice(key.indexOf(':') + 1);
  const isIp = key.startsWith('ip:');
  const minutes = Math.round(ms / MINUTE);
  notify({
    kind: 'security',
    tone: 'danger',
    title: isIp ? 'IP bloqueada' : 'Cuenta bloqueada',
    message: `${isIp ? `La IP ${value}` : `La cuenta "${value}"`} se bloqueó ${minutes} min tras ${count} intentos fallidos.`,
    link: '/app/ajustes/accesos',
    audience: 'admin',
    dedupeKey: `lock:${key}:${hourBucket()}`,
  });
}

/** Cantidades de fallos en una hora a partir de las que se vuelve a avisar como no leído. */
const FAILED_MILESTONES = new Set([5, 10, 25, 50, 100, 250, 500, 1000]);

function notifyFailedLogins() {
  const since = new Date(Date.now() - 60 * MINUTE).toISOString();
  const { c, ips } = q().failedSince.get(since);
  if (c < 5) return;
  notify({
    kind: 'security',
    tone: 'danger',
    title: 'Intentos de acceso sospechosos',
    message: `${c} intentos fallidos de inicio de sesión en la última hora${ips > 1 ? `, desde ${ips} IPs distintas` : ''}.`,
    link: '/app/ajustes/accesos',
    audience: 'admin',
    dedupeKey: `failed-logins:${hourBucket()}`,
    reopen: FAILED_MILESTONES.has(c),
  });
}

function clearLoginFailuresUnsafe(username, ip) {
  q().clear.run(accountKey(username));
  q().clear.run(ipKey(ip));
}

export function activeLocks() {
  return q()
    .active.all(now())
    .map((r) => ({
      key: r.key,
      kind: r.key.startsWith('ip:') ? 'ip' : 'user',
      value: r.key.slice(r.key.indexOf(':') + 1),
      count: r.count,
      locked_until: r.locked_until,
    }));
}

export function unlock(key) {
  return q().clear.run(String(key)).changes > 0;
}

let lastPrune = 0;

/** Guarda un intento de inicio de sesión (exitoso o no) en el registro de accesos. */
function logLoginUnsafe(req, { username, userId = null, success, reason }) {
  q().log.run(
    now(),
    String(username || '').trim().slice(0, 80),
    userId,
    success ? 1 : 0,
    reason,
    clientIp(req).slice(0, 64),
    clientCountry(req),
    String(req.headers['user-agent'] || '').slice(0, 200)
  );
  if (!success) notifyFailedLogins();
  if (Date.now() - lastPrune > 60 * MINUTE) {
    lastPrune = Date.now();
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * MINUTE).toISOString();
    q().prune.run(cutoff);
    const stale = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
    q().pruneFailures.run(stale, now());
  }
}

/**
 * El registro de intentos nunca debe impedir iniciar sesión: si la base falla, se anota en
 * los logs del servidor y el login sigue (sin bloqueo por intentos en ese momento).
 */
function safe(name, fn, fallback) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (e) {
      console.error(`[Seguridad] ${name} falló:`, e);
      return fallback;
    }
  };
}

export const loginLockRemaining = safe('loginLockRemaining', loginLockRemainingUnsafe, 0);
export const recordLoginFailure = safe('recordLoginFailure', recordLoginFailureUnsafe);
export const clearLoginFailures = safe('clearLoginFailures', clearLoginFailuresUnsafe);
export const logLogin = safe('logLogin', logLoginUnsafe);
