import { db } from './db.js';

export function mapSurvey(row) {
  if (!row) return row;
  return {
    id: row.id,
    client_uuid: row.client_uuid,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    register_id: row.register_id,
    register_name: row.register_name,
    cashier_id: row.cashier_id,
    cashier_name: row.cashier_name,
    areas: parseJson(row.areas, []),
    dislikes: parseJson(row.dislikes, []),
    likes: parseJson(row.likes, []),
    // 'none' = no tocaron ninguna carita: la API lo entrega como null ("Sin respuesta").
    rating: row.rating === 'none' ? null : row.rating,
    created_at: row.created_at,
    client_ts: row.client_ts,
  };
}

function parseJson(s, fallback) {
  if (!s) return fallback;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function loadSurveys(q = {}, opts = {}) {
  const limit = opts.limit || Number(q.limit) || 5000;
  // Parámetros por posición: con Turso (réplica) los parámetros con nombre (@x) no siempre
  // se envían y la consulta regresa vacía sin marcar error.
  const conditions = [];
  const params = [];
  const add = (sql, value) => {
    conditions.push(sql);
    params.push(value);
  };

  if (q.from) add('created_at >= ?', dayBound(q.from, 'T00:00:00'));
  if (q.to) add('created_at <= ?', dayBound(q.to, 'T23:59:59.999'));
  if (q.branch_id) add('branch_id = ?', Number(q.branch_id));
  if (q.register_id) add('register_id = ?', Number(q.register_id));
  if (q.cashier_id) add('cashier_id = ?', Number(q.cashier_id));
  if (q.rating) add('rating = ?', q.rating);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM surveys ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit);
  return rows.map(mapSurvey);
}

/**
 * created_at se guarda en ISO UTC ("2026-10-19T15:04:05.000Z"). Si el filtro llega como
 * día suelto ("2026-10-19"), compararlo tal cual deja fuera todo ese día en el límite
 * "hasta": se convierte al inicio o fin del día en la hora local del servidor.
 */
function dayBound(value, time) {
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s}${time}`);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

export function localDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
