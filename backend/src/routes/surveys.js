import { Router } from 'express';
import { db, now } from '../db.js';
import { questions } from '../questions.js';
import { getSession } from '../middleware.js';

const router = Router();

const validOptions = new Set();
for (const q of questions.questions) for (const o of q.options) validOptions.add(o);

router.post('/surveys/batch', (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Formato inválido' });
  if (items.length > 200) return res.status(400).json({ error: 'Lote demasiado grande' });

  const session = getSession(req);
  const branchCache = new Map();
  const registerCache = new Map();
  const cashierCache = new Map();

  const lookup = (cache, table, id) => {
    if (!id) return null;
    if (!cache.has(id)) {
      cache.set(id, db.prepare(`SELECT id, name FROM ${table} WHERE id = ?`).get(id) || null);
    }
    return cache.get(id);
  };

  const insert = db.prepare(`
    INSERT OR IGNORE INTO surveys
      (client_uuid, session_id, branch_id, branch_name, register_id, register_name,
       cashier_id, cashier_name, areas, dislikes, likes, rating, created_at, client_ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let duplicates = 0;
  let invalid = 0;

  const run = db.transaction(() => {
    for (const raw of items) {
      const item = raw && typeof raw === 'object' ? raw : {};
      const uuid = typeof item.client_uuid === 'string' ? item.client_uuid.trim() : '';
      const rating = Number(item.rating);
      const areas = cleanList(item.areas);
      const dislikes = cleanList(item.dislikes);
      const likes = cleanList(item.likes);

      if (
        uuid.length < 8 ||
        uuid.length > 80 ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        !areas.length ||
        !dislikes.length ||
        !likes.length
      ) {
        invalid++;
        continue;
      }

      const branchId = positiveId(item.branch_id) || session?.branch_id || null;
      const registerId = positiveId(item.register_id) || session?.register_id || null;
      const cashierId = positiveId(item.cashier_id) || session?.cashier_id || null;

      const branch = lookup(branchCache, 'branches', branchId);
      const register = lookup(registerCache, 'registers', registerId);
      const cashier = lookup(cashierCache, 'cashiers', cashierId);

      const info = insert.run(
        uuid,
        session?.id ?? null,
        branch?.id ?? branchId ?? null,
        branch?.name ?? null,
        register?.id ?? registerId ?? null,
        register?.name ?? null,
        cashier?.id ?? cashierId ?? null,
        cashier?.name ?? null,
        JSON.stringify(areas),
        JSON.stringify(dislikes),
        JSON.stringify(likes),
        rating,
        now(),
        typeof item.client_ts === 'string' ? item.client_ts.slice(0, 40) : null
      );
      if (info.changes > 0) inserted++;
      else duplicates++;
    }
  });

  run();
  res.json({ inserted, duplicates, invalid });
});

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const v of value.slice(0, 8)) {
    const label = String(v ?? '').trim().slice(0, 60);
    if (label && validOptions.has(label) && !out.includes(label)) out.push(label);
  }
  return out;
}

function positiveId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default router;
