import crypto from 'node:crypto';
import { CLOUD, db } from './db.js';

/*
 * Acceso solo con enlace privado.
 *
 * Con la opción activa (Ajustes → Vincular dispositivos), quien no tenga el enlace solo ve
 * una página fija de SuperShop (como el panel azul del login); todo lo demás (login, panel,
 * API) responde "no encontrado". Al abrir https://…/?acceso=<clave> el servidor guarda en
 * ese navegador una cookie privada (un año) y redirige a la misma página sin la clave.
 *
 * Siempre pasan /api/health (Render y UptimeRobot) y la ventana de la app de escritorio
 * (conexión directa desde esta computadora, sin pasar por el túnel).
 * Emergencia: ACCESS_GATE_DISABLED=true apaga la protección sin entrar a la app.
 */

export const ACCESS_PARAM = 'acceso';
const COOKIE = 'ss_acceso';
const MAX_AGE_S = 400 * 24 * 3600;
const CACHE_MS = 30 * 1000;
const FORCE_OFF = process.env.ACCESS_GATE_DISABLED === 'true';

if (FORCE_OFF) console.warn('[Seguridad] ACCESS_GATE_DISABLED=true: el acceso con enlace privado está apagado.');

let cache = null;
let cacheAt = 0;

function config() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const row =
    db
      .prepare('SELECT access_gate, access_key FROM settings WHERE id = 1')
      .get() || {};
  cache = {
    enabled: !FORCE_OFF && !!row.access_gate && !!row.access_key,
    key: row.access_key || null,
  };
  cacheAt = Date.now();
  return cache;
}

export function invalidateAccessGate() {
  cache = null;
}

/** Estado para la pantalla de Vincular dispositivos. */
export function accessGateInfo() {
  const c = config();
  return { enabled: c.enabled, key: c.enabled ? c.key : null, forcedOff: FORCE_OFF };
}

export function newAccessKey() {
  return crypto.randomBytes(24).toString('base64url');
}

function same(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Guarda la cookie de acceso en el navegador de quien hace la petición. */
export function grantAccess(req, res, key) {
  const parts = [`${COOKIE}=${encodeURIComponent(key)}`, 'Path=/', `Max-Age=${MAX_AGE_S}`, 'HttpOnly', 'SameSite=Lax'];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/** La ventana de escritorio: conexión directa desde esta computadora (el túnel agrega encabezados). */
function isLocalWindow(req) {
  if (CLOUD) return false;
  const addr = req.socket?.remoteAddress || '';
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  return loopback && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'];
}

/**
 * Service worker de reemplazo para dispositivos sin acceso que ya tenían la app guardada
 * para funcionar sin conexión: esa copia se abre sin preguntarle al servidor. Al buscar
 * actualización reciben esto, que borra la copia, se da de baja y recarga la pestaña,
 * así se ve la página pública. Las encuestas pendientes (localStorage) no se tocan.
 */
const REMOVE_OFFLINE_APP_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const w of windows) w.navigate(w.url);
  })());
});
`;

/** Imágenes que la página pública necesita aunque no se tenga el enlace. */
const PUBLIC_FILES = new Set(['/supershop_fondo_azul.png', '/icon-192.png']);

/** Página pública fija: la misma presentación que el panel azul del inicio de sesión. */
function landingPage() {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#233a9f">
<title>SuperShop</title>
<link rel="icon" href="/icon-192.png">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: flex; flex-direction: column; align-items: center;
         justify-content: center; padding: 32px 16px; text-align: center; color: #fff;
         font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: linear-gradient(135deg, #2b46c4 0%, #233a9f 50%, #1d307f 100%); }
  main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  img { width: 128px; height: 128px; border-radius: 16px; object-fit: cover; margin-bottom: 32px;
        box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.45); outline: 4px solid rgb(255 255 255 / 0.3); }
  h1 { margin: 0 0 12px; font-size: clamp(36px, 8vw, 48px); font-weight: 700; letter-spacing: -0.025em; }
  p { margin: 0; font-size: 20px; font-weight: 500; color: #e1e8ff; }
  footer { width: 100%; max-width: 448px; margin-top: 48px; padding-top: 32px;
           border-top: 1px solid rgb(255 255 255 / 0.15); font-size: 13px; color: rgb(199 211 255 / 0.7); }
  footer span { display: block; margin-top: 4px; }
</style>
</head>
<body>
<main>
  <img src="/supershop_fondo_azul.png" alt="SuperShop">
  <h1>SuperShop</h1>
  <p>Sistema de administración de tiendas</p>
</main>
<footer>© ${year} SuperShop · Desarrollado por ELAN Software<span>Todos los derechos reservados.</span></footer>
</body>
</html>`;
}

/** Middleware global. Va después de helmet para que la página pública lleve sus encabezados. */
export function accessGate(req, res, next) {
  const c = config();
  if (!c.enabled) return next();
  if (req.path === '/api/health' || PUBLIC_FILES.has(req.path)) return next();
  if (isLocalWindow(req)) return next();

  const given = typeof req.query?.[ACCESS_PARAM] === 'string' ? req.query[ACCESS_PARAM] : null;
  if (given && same(given, c.key)) {
    grantAccess(req, res, c.key);
    const url = new URL(req.originalUrl, 'http://x');
    url.searchParams.delete(ACCESS_PARAM);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, url.pathname + url.search);
  }
  if (same(readCookie(req), c.key)) return next();

  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado' });
  if (req.path === '/sw.js') return res.type('application/javascript').send(REMOVE_OFFLINE_APP_SW);
  const status = req.path === '/' ? 200 : 404;
  return res.status(status).type('html').send(landingPage());
}
