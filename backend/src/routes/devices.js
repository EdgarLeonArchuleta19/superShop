import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAdmin, requirePermission } from '../middleware.js';
import crypto from 'node:crypto';
import {
  createDevice,
  findDevice,
  hashSecret,
  issueDeviceToken,
  newSecret,
  notifyPaired,
  PAIRING_TTL_MS,
  publicDevice,
  readDeviceToken,
  requireDevice,
  setDeviceCookie,
  tokenFromCookieOnly,
  touchDevice,
} from '../devices.js';

/*
 * Dispositivos vinculados (ver devices.js):
 * - /api/devices/pair y /api/device/heartbeat los usa la tablet de encuestas.
 * - /api/admin/devices/pairing es el QR de Vincular dispositivos; la lista, editar y
 *   desvincular están en Registro de accesos (permiso settings.connect).
 * - /api/admin/sessions/* (cerrar la sesión de otro equipo) es solo del Administrador.
 */

const router = Router();
const canConnect = requirePermission('settings.connect');

function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
}

/** Tienda activa y caja activa de esa tienda; si no, el mensaje de error. */
function checkPlace(branchId, registerId) {
  const branch = db.prepare('SELECT id, name FROM branches WHERE id = ? AND active = 1').get(Number(branchId));
  if (!branch) return { error: 'Elige una tienda' };
  const register = db
    .prepare('SELECT id, name FROM registers WHERE id = ? AND branch_id = ? AND active = 1')
    .get(Number(registerId), branch.id);
  if (!register) return { error: 'Elige una caja de esa tienda' };
  return { branch, register };
}

// ---------------------------------------------------------------------------
// Tablet
// ---------------------------------------------------------------------------

/** La tablet cambia el código del QR por su token. El código sirve una sola vez. */
router.post('/devices/pair', (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const pairing = code ? db.prepare('SELECT * FROM device_pairings WHERE code_hash = ?').get(hashSecret(code)) : null;
  if (!pairing || pairing.device_id || Date.parse(pairing.expires_at) < Date.now()) {
    return res.status(400).json({ error: 'Este código QR ya se usó o venció. Pide que generen uno nuevo.' });
  }
  // Se aparta el código antes de crear la tablet: si dos la escanean a la vez, solo una entra.
  const claimed = db
    .prepare('UPDATE device_pairings SET device_id = -1 WHERE id = ? AND device_id IS NULL')
    .run(pairing.id).changes;
  if (!claimed) {
    return res.status(400).json({ error: 'Este código QR ya se usó o venció. Pide que generen uno nuevo.' });
  }

  // Si la tablet ya estaba vinculada, la vinculación anterior se reemplaza.
  const previous = findDevice(typeof req.body?.previous_token === 'string' ? req.body.previous_token : null);
  if (previous && !previous.revoked_at) {
    db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ?').run(now(), previous.id);
  }

  const { id, token } = createDevice(
    {
      name: pairing.name,
      branchId: pairing.branch_id,
      registerId: pairing.register_id,
      createdBy: pairing.created_by,
      createdByName: pairing.created_by_name,
    },
    req
  );
  db.prepare('UPDATE device_pairings SET device_id = ? WHERE id = ?').run(id, pairing.id);

  const device = publicDevice(id);
  notifyPaired(device);
  setDeviceCookie(req, res, token);
  res.status(201).json({ token, device });
});

// ---------------------------------------------------------------------------
// Vincular con el código de 6 dígitos que muestra la tablet
// ---------------------------------------------------------------------------

const LINK_TTL_MS = 10 * 60 * 1000;

/** La tablet pide un código para mostrarlo en pantalla. */
router.post('/devices/link-request', (req, res) => {
  db.prepare('DELETE FROM device_link_requests WHERE expires_at < ?').run(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const active = db.prepare('SELECT id FROM device_link_requests WHERE code = ? AND device_id IS NULL AND expires_at > ?');
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const candidate = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    if (!active.get(candidate, now())) code = candidate;
  }
  if (!code) return res.status(503).json({ error: 'Intenta de nuevo en un momento' });
  const secret = newSecret();
  db.prepare('INSERT INTO device_link_requests (code, secret_hash, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    code,
    hashSecret(secret),
    now(),
    new Date(Date.now() + LINK_TTL_MS).toISOString()
  );
  res.status(201).json({ code, secret, ttl_ms: LINK_TTL_MS });
});

/** La tablet pregunta si ya escribieron su código en el panel; si sí, recoge su token. */
router.post('/devices/link-request/claim', (req, res) => {
  const secret = typeof req.body?.secret === 'string' ? req.body.secret : '';
  const row = secret ? db.prepare('SELECT * FROM device_link_requests WHERE secret_hash = ?').get(hashSecret(secret)) : null;
  if (!row || row.claimed_at) return res.json({ status: 'expired' });
  if (!row.device_id) return res.json({ status: Date.parse(row.expires_at) < Date.now() ? 'expired' : 'pending' });
  const taken = db
    .prepare('UPDATE device_link_requests SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL')
    .run(now(), row.id).changes;
  if (!taken) return res.json({ status: 'expired' });
  const token = issueDeviceToken(row.device_id, req);
  setDeviceCookie(req, res, token);
  res.json({ status: 'linked', token, device: publicDevice(row.device_id) });
});

/** Latido de la tablet: confirma que sigue vinculada y devuelve su tienda y caja actuales. */
router.post('/device/heartbeat', requireDevice, (req, res) => {
  const pending = Number(req.body?.pending);
  touchDevice(req.device, req, Number.isInteger(pending) ? pending : undefined);
  // La cookie se renueva en cada latido. Si la tablet se reconoció solo por la cookie (perdió
  // su almacenamiento), se le devuelve su token para que lo vuelva a guardar.
  const token = readDeviceToken(req);
  setDeviceCookie(req, res, token);
  res.json({ device: publicDevice(req.device.id), ...(tokenFromCookieOnly(req) ? { token } : {}) });
});

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------

router.get('/admin/devices', canConnect, (req, res) => {
  const devices = db
    .prepare(
      `SELECT d.id, d.kind, d.name, d.branch_id, b.name AS branch_name, d.register_id, r.name AS register_name,
              d.created_by_name, d.created_at, d.last_seen_at, d.last_ip, d.user_agent, d.pending, d.pending_since
       FROM devices d
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN registers r ON r.id = d.register_id
       WHERE d.revoked_at IS NULL
       ORDER BY b.name, d.name`
    )
    .all();

  res.json({ devices });
});

/** Vincular la tablet que muestra un código de 6 dígitos (la app instalada, por ejemplo). */
router.post('/admin/devices/link', canConnect, (req, res) => {
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return res.status(400).json({ error: 'Escribe los 6 dígitos que muestra la tablet' });
  const place = checkPlace(req.body?.branch_id, req.body?.register_id);
  if (place.error) return res.status(400).json({ error: place.error });
  const request = db
    .prepare('SELECT * FROM device_link_requests WHERE code = ? AND device_id IS NULL AND expires_at > ? ORDER BY id DESC')
    .get(code, now());
  if (!request) return res.status(404).json({ error: 'Ese código no existe o ya venció. Revisa el que muestra la tablet.' });
  const name = cleanName(req.body?.name) || `${place.register.name} · ${place.branch.name}`;
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.session.user_id);
  // La tablet recoge su token con su propio secreto (link-request/claim): aquí no se entrega.
  const { id } = createDevice(
    { name, branchId: place.branch.id, registerId: place.register.id, createdBy: req.session.user_id, createdByName: user?.name ?? null },
    null
  );
  const linked = db
    .prepare('UPDATE device_link_requests SET device_id = ? WHERE id = ? AND device_id IS NULL')
    .run(id, request.id).changes;
  if (!linked) {
    db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    return res.status(409).json({ error: 'Ese código ya se usó' });
  }
  const device = publicDevice(id);
  notifyPaired(device);
  res.status(201).json({ device });
});

/** Código para el QR de "SuperShop Survey". */
router.post('/admin/devices/pairing', canConnect, (req, res) => {
  const place = checkPlace(req.body?.branch_id, req.body?.register_id);
  if (place.error) return res.status(400).json({ error: place.error });
  const name = cleanName(req.body?.name) || `${place.register.name} · ${place.branch.name}`;

  // Los códigos vencidos de más de un día ya no sirven ni para consultar su estado.
  db.prepare('DELETE FROM device_pairings WHERE expires_at < ?').run(new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  const code = newSecret();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.session.user_id);
  const id = db
    .prepare(
      `INSERT INTO device_pairings (code_hash, name, branch_id, register_id, created_by, created_by_name, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(hashSecret(code), name, place.branch.id, place.register.id, req.session.user_id, user?.name ?? null, now(), expiresAt)
    .lastInsertRowid;
  res.status(201).json({ id, code, expires_at: expiresAt, ttl_ms: PAIRING_TTL_MS });
});

/** La pantalla del QR pregunta cada pocos segundos si ya lo escanearon (como WhatsApp Web). */
router.get('/admin/devices/pairing/:id', canConnect, (req, res) => {
  const pairing = db.prepare('SELECT * FROM device_pairings WHERE id = ?').get(Number(req.params.id));
  if (!pairing) return res.json({ status: 'expired' });
  if (pairing.device_id > 0) return res.json({ status: 'used', device: publicDevice(pairing.device_id) });
  if (Date.parse(pairing.expires_at) < Date.now()) return res.json({ status: 'expired' });
  res.json({ status: 'pending' });
});

/** Cambiar nombre, tienda o caja de una tablet; la tablet lo toma en su siguiente latido. */
router.put('/admin/devices/:id', canConnect, (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE id = ? AND revoked_at IS NULL').get(Number(req.params.id));
  if (!device) return res.status(404).json({ error: 'El dispositivo ya no está vinculado' });
  const place = checkPlace(req.body?.branch_id ?? device.branch_id, req.body?.register_id ?? device.register_id);
  if (place.error) return res.status(400).json({ error: place.error });
  const name = req.body?.name !== undefined ? cleanName(req.body.name) : device.name;
  if (!name) return res.status(400).json({ error: 'Escribe un nombre' });
  db.prepare('UPDATE devices SET name = ?, branch_id = ?, register_id = ? WHERE id = ?').run(
    name,
    place.branch.id,
    place.register.id,
    device.id
  );
  res.json({ ok: true });
});

router.delete('/admin/devices/:id', canConnect, (req, res) => {
  const changes = db
    .prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(now(), Number(req.params.id)).changes;
  if (!changes) return res.status(404).json({ error: 'El dispositivo ya no está vinculado' });
  res.json({ ok: true });
});

router.delete('/admin/sessions/:id', requireAdmin, (req, res) => {
  const session = db.prepare('SELECT id, token FROM sessions WHERE id = ? AND closed_at IS NULL').get(Number(req.params.id));
  if (!session) return res.status(404).json({ error: 'La sesión ya estaba cerrada' });
  if (session.token === req.session.token) {
    return res.status(400).json({ error: 'Es tu sesión actual: usa "Cerrar sesión" en el menú' });
  }
  db.prepare('UPDATE sessions SET closed_at = ? WHERE id = ?').run(now(), session.id);
  res.json({ ok: true });
});

export default router;
