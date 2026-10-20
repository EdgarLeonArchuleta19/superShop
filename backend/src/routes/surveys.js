import { Router } from 'express';
import { db, now } from '../db.js';
import { questions } from '../questions.js';
import { getSession, requirePermission } from '../middleware.js';
import { notify } from '../notifications.js';
import { localDate } from '../store.js';

const router = Router();

const validOptions = new Set();
for (const q of questions.questions) for (const o of q.options) validOptions.add(o);

function normalizeRating(value) {
  if (value === 'good' || value === 'regular' || value === 'bad') return value;
  const n = Number(value);
  if (n >= 4) return 'good';
  if (n === 3) return 'regular';
  if (n >= 1 && n <= 2) return 'bad';
  return null;
}

const MAX_BATCH = 200;

// Se preparan al primer uso: este módulo se carga antes de que db.js cree las tablas.
const NAME_TABLES = { branch: 'branches', register: 'registers', cashier: 'cashiers' };
const nameStatements = {};

/** El kiosko manda solo los ids; el nombre se guarda tal como estaba al responder. */
function lookupName(kind, id, given) {
  if (given) return given;
  if (id == null) return null;
  nameStatements[kind] ??= db.prepare(`SELECT name FROM ${NAME_TABLES[kind]} WHERE id = ?`);
  return nameStatements[kind].get(Number(id))?.name ?? null;
}

/** Un aviso por día con las calificaciones malas; cada nueva lo vuelve a marcar como no leído. */
function notifyBadRatings() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = db
    .prepare(
      `SELECT COALESCE(cashier_name, 'Sin cajero(a)') AS name, COUNT(*) AS c FROM surveys
       WHERE rating = 'bad' AND created_at >= ? GROUP BY name ORDER BY c DESC`
    )
    .all(start.toISOString());
  const total = rows.reduce((sum, r) => sum + r.c, 0);
  if (!total) return;
  const top = rows
    .slice(0, 3)
    .map((r) => `${r.name} (${r.c})`)
    .join(', ');
  notify({
    kind: 'surveys',
    tone: 'warning',
    title: total === 1 ? 'Calificación mala hoy' : `${total} calificaciones malas hoy`,
    message: `Por cajero(a): ${top}${rows.length > 3 ? '…' : ''}.`,
    link: '/app/encuestas/respuestas',
    audience: 'surveys.responses',
    dedupeKey: `bad-ratings:${localDate(start.toISOString())}`,
  });
}

/**
 * Recibe encuestas del kiosko en lotes (también las que se guardaron sin conexión y se
 * envían al volver la red). Cada una trae un client_uuid: si ya se recibió, se ignora,
 * así que reenviar un lote nunca duplica datos.
 */
function saveBatch(req, res) {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No hay encuestas para enviar' });
  }
  if (items.length > MAX_BATCH) {
    return res.status(400).json({ error: `Máximo ${MAX_BATCH} encuestas por envío` });
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO surveys (client_uuid, branch_id, branch_name, register_id, register_name, cashier_id, cashier_name, areas, dislikes, likes, rating, created_at, client_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let accepted = 0;
  let badAccepted = 0;
  const invalidUuids = [];
  const txn = db.transaction((arr) => {
    for (const item of arr) {
      const uuid = typeof item.client_uuid === 'string' ? item.client_uuid.trim() : '';
      if (!uuid || uuid.length > 64) {
        invalidUuids.push(item.client_uuid);
        continue;
      }
      const rating = normalizeRating(item.rating);
      if (!rating) {
        invalidUuids.push(uuid);
        continue;
      }
      const areas = Array.isArray(item.areas) ? item.areas.filter((a) => validOptions.has(a)) : [];
      const dislikes = Array.isArray(item.dislikes) ? item.dislikes.filter((a) => validOptions.has(a)) : [];
      const likes = Array.isArray(item.likes) ? item.likes.filter((a) => validOptions.has(a)) : [];
      const created = item.created_at || item.client_ts || now();
      const info = insert.run(
        uuid,
        item.branch_id ?? null,
        lookupName('branch', item.branch_id, item.branch_name),
        item.register_id ?? null,
        lookupName('register', item.register_id, item.register_name),
        item.cashier_id ?? null,
        lookupName('cashier', item.cashier_id, item.cashier_name),
        JSON.stringify(areas),
        JSON.stringify(dislikes),
        JSON.stringify(likes),
        rating,
        created,
        item.client_ts ?? created
      );
      if (info.changes > 0) {
        accepted++;
        if (rating === 'bad') badAccepted++;
      }
    }
  });
  txn(items);
  if (badAccepted > 0) notifyBadRatings();
  res.json({
    accepted,
    duplicates: items.length - accepted - invalidUuids.length,
    invalid: invalidUuids.length,
    invalidUuids,
  });
}

// Solo usuarios con sesión y acceso a "Mi encuesta" pueden enviar encuestas (con la
// dirección pública, si no, cualquiera podría llenar la base de respuestas falsas).
// /surveys/batch es la que usa el kiosko (tiene su propio límite de solicitudes).
router.post('/surveys', requirePermission('surveys.kiosk'), saveBatch);
router.post('/surveys/batch', requirePermission('surveys.kiosk'), saveBatch);

router.get('/surveys/last', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = getSession(token);
  const row = db.prepare('SELECT created_at FROM surveys ORDER BY created_at DESC LIMIT 1').get();
  res.json({ last_at: row?.created_at ?? null, session_valid: !!session });
});

export default router;
