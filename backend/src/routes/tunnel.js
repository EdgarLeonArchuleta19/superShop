import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { CLOUD, db } from '../db.js';
import { requireAdmin, requirePermission } from '../middleware.js';
import { accessGateInfo, grantAccess, invalidateAccessGate, newAccessKey } from '../accessGate.js';
import { getTunnelStatus, startTunnel, stopTunnel } from '../tunnel.js';
import { lanIPv4 } from '../network.js';
import { caCertificatePem, localHttps } from '../certs.js';

const router = Router();
const canConnect = requirePermission('settings.connect');

// En la nube SuperShop ya está en internet: no hay túnel ni red local que configurar.
const desktopOnly = (_req, res, next) =>
  CLOUD ? res.status(400).json({ error: 'Esta opción solo existe en la app de escritorio.' }) : next();

const PORT = Number(process.env.PORT || 3001);

// Contraseñas con las que se crean los usuarios de ejemplo (ver db.js).
const DEFAULT_PASSWORDS = [
  ['admin', 'admin123'],
  ['cajero', 'cajero123'],
];

/** Direcciones de esta computadora en la red local, con su versión https si está activa. */
export function lanAddresses() {
  return lanIPv4().map(({ name, address }) => ({
    name,
    address,
    url: `http://${address}:${PORT}`,
    httpsUrl: localHttps.enabled ? `https://${address}:${localHttps.port}` : null,
  }));
}

function readTunnelSettings() {
  return (
    db.prepare('SELECT tunnel_autostart, tunnel_mode, tunnel_token, tunnel_hostname FROM settings WHERE id = 1').get() ||
    {}
  );
}

/** Configuración con la que debe arrancar el túnel, o null si no debe arrancar solo. */
export function bootTunnelConfig() {
  const s = readTunnelSettings();
  // El túnel fijo debe estar siempre en línea: arranca siempre que esté configurado.
  if (s.tunnel_mode === 'fixed' && s.tunnel_token && s.tunnel_hostname) {
    return { mode: 'fixed', token: s.tunnel_token, hostname: s.tunnel_hostname };
  }
  // La conexión temporal (trycloudflare) ya no tiene pantalla: no se inicia sola aunque
  // una instalación anterior tenga tunnel_autostart activo.
  return null;
}

function currentConfig() {
  return bootTunnelConfig() ?? { mode: 'quick' };
}

/** Usuarios activos que todavía usan la contraseña de fábrica. */
function weakPasswordUsers() {
  const out = [];
  for (const [username, password] of DEFAULT_PASSWORDS) {
    const row = db.prepare('SELECT password_hash FROM users WHERE username = ? AND active = 1').get(username);
    if (row && bcrypt.compareSync(password, row.password_hash)) out.push(username);
  }
  return out;
}

function payload() {
  const s = readTunnelSettings();
  const fixedConfigured = s.tunnel_mode === 'fixed' && !!s.tunnel_token && !!s.tunnel_hostname;
  return {
    cloud: CLOUD,
    port: PORT,
    tunnel: getTunnelStatus(),
    autostart: !!s.tunnel_autostart,
    // El token nunca sale del servidor.
    fixed: { configured: fixedConfigured, hostname: fixedConfigured ? s.tunnel_hostname : null },
    lan: lanAddresses(),
    https: { enabled: localHttps.enabled, port: localHttps.port, certificateUrl: '/api/certificado-supershop.crt' },
    weakPasswordUsers: weakPasswordUsers(),
    access: accessGateInfo(),
  };
}

/** Acepta el token solo o el comando completo que muestra Cloudflare. */
function parseTunnelToken(input) {
  const match = String(input ?? '').match(/eyJ[A-Za-z0-9_\-+/=]{40,}/);
  if (!match) return null;
  try {
    const data = JSON.parse(Buffer.from(match[0], 'base64').toString('utf8'));
    return data && data.a && data.t && data.s ? match[0] : null;
  } catch {
    return null;
  }
}

/** "https://App.SuperShop-MX.com/algo" → "app.supershop-mx.com" */
function parseHostname(input) {
  const host = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#:].*$/, '');
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ? host : null;
}

// Acceso solo con enlace privado (ver accessGate.js). Solo el Administrador lo cambia.
// Quien lo activa o genera un enlace nuevo recibe la cookie en ese momento, para no
// quedarse fuera.
router.put('/admin/access-gate', requireAdmin, (req, res) => {
  const current = db.prepare('SELECT access_key FROM settings WHERE id = 1').get() || {};
  const enabled = !!req.body?.enabled;
  const key = current.access_key || newAccessKey();
  db.prepare('UPDATE settings SET access_gate = ?, access_key = ? WHERE id = 1').run(enabled ? 1 : 0, key);
  invalidateAccessGate();
  if (enabled) grantAccess(req, res, key);
  res.json(payload());
});

router.post('/admin/access-gate/regenerate', requireAdmin, (req, res) => {
  const key = newAccessKey();
  db.prepare('UPDATE settings SET access_key = ? WHERE id = 1').run(key);
  invalidateAccessGate();
  grantAccess(req, res, key);
  res.json(payload());
});

// Certificado público de la tienda, para instalarlo en los dispositivos que usan la
// dirección https de la red local. Es público por diseño (no lleva la llave privada).
router.get('/certificado-supershop.crt', (_req, res) => {
  const pem = caCertificatePem();
  if (!pem) return res.status(404).json({ error: 'La conexión segura en la red local no está activa.' });
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="SuperShop-certificado.crt"');
  res.send(pem);
});

router.get('/admin/tunnel', canConnect, (_req, res) => {
  res.json(payload());
});

router.post('/admin/tunnel/start', canConnect, desktopOnly, (_req, res) => {
  startTunnel(PORT, currentConfig());
  res.json(payload());
});

router.post('/admin/tunnel/stop', canConnect, (_req, res) => {
  stopTunnel();
  res.json(payload());
});

router.put('/admin/tunnel/settings', canConnect, desktopOnly, (req, res) => {
  if (req.body?.autostart !== undefined) {
    db.prepare('UPDATE settings SET tunnel_autostart = ? WHERE id = 1').run(req.body.autostart ? 1 : 0);
  }
  res.json(payload());
});

// Configura el túnel fijo (dominio propio) y lo conecta.
router.put('/admin/tunnel/fixed', canConnect, desktopOnly, (req, res) => {
  const token = parseTunnelToken(req.body?.token);
  if (!token) {
    return res.status(400).json({ error: 'El token no parece válido. Cópialo completo desde Cloudflare (empieza con "eyJ").' });
  }
  const hostname = parseHostname(req.body?.hostname);
  if (!hostname) {
    return res.status(400).json({ error: 'Escribe la dirección completa, por ejemplo app.supershop-mx.com' });
  }
  db.prepare("UPDATE settings SET tunnel_mode = 'fixed', tunnel_token = ?, tunnel_hostname = ? WHERE id = 1").run(
    token,
    hostname
  );
  startTunnel(PORT, { mode: 'fixed', token, hostname });
  res.json(payload());
});

// Quita la dirección fija y vuelve a la conexión temporal.
router.delete('/admin/tunnel/fixed', canConnect, desktopOnly, (_req, res) => {
  db.prepare("UPDATE settings SET tunnel_mode = 'quick', tunnel_token = NULL, tunnel_hostname = NULL WHERE id = 1").run();
  stopTunnel();
  res.json(payload());
});

export default router;
