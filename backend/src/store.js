import { db } from './db.js';

export function mapSurvey(row) {
  if (!row) return row;
  return {
    ...row,
    areas: parseArr(row.areas),
    dislikes: parseArr(row.dislikes),
    likes: parseArr(row.likes),
  };
}

function parseArr(value) {
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function localDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function buildIdFilter(query = {}) {
  const where = [];
  const params = [];

  const branchId = intOrNull(query.branch_id);
  if (branchId) {
    where.push('branch_id = ?');
    params.push(branchId);
  }
  const registerId = intOrNull(query.register_id);
  if (registerId) {
    where.push('register_id = ?');
    params.push(registerId);
  }
  const cashierId = intOrNull(query.cashier_id);
  if (cashierId) {
    where.push('cashier_id = ?');
    params.push(cashierId);
  }
  return { where, params };
}

export function loadSurveys(query = {}, { limit = 1000 } = {}) {
  const { where, params } = buildIdFilter(query);
  let rows = db
    .prepare(
      `SELECT * FROM surveys ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`
    )
    .all(...params);

  const from = query.from ? String(query.from).slice(0, 10) : '';
  const to = query.to ? String(query.to).slice(0, 10) : '';
  if (from || to) {
    rows = rows.filter((r) => {
      const day = localDate(r.created_at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }

  const max = Math.min(Number(query.limit) || limit, 5000);
  return rows.slice(0, max).map(mapSurvey);
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
