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
    rating: row.rating,
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
  const conditions = [];
  const params = {};

  if (q.from) {
    conditions.push('created_at >= @from');
    params.from = q.from;
  }
  if (q.to) {
    conditions.push('created_at <= @to');
    params.to = q.to;
  }
  if (q.branch_id) {
    conditions.push('branch_id = @branch_id');
    params.branch_id = Number(q.branch_id);
  }
  if (q.register_id) {
    conditions.push('register_id = @register_id');
    params.register_id = Number(q.register_id);
  }
  if (q.cashier_id) {
    conditions.push('cashier_id = @cashier_id');
    params.cashier_id = Number(q.cashier_id);
  }
  if (q.rating) {
    conditions.push('rating = @rating');
    params.rating = q.rating;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT * FROM surveys ${where} ORDER BY created_at DESC LIMIT @limit`
    )
    .all({ ...params, limit });
  return rows.map(mapSurvey);
}

export function localDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
