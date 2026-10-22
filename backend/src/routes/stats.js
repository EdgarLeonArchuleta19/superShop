import { Router } from 'express';
import { db } from '../db.js';
import { questions } from '../questions.js';
import { requireAuth, requirePermission } from '../middleware.js';
import { loadSurveys, localDate } from '../store.js';

const router = Router();

// Respuesta con la forma de StatsResponse (frontend/src/lib/types.ts).
router.get('/stats', requirePermission('surveys.stats'), (req, res) => {
  const rows = loadSurveys(req.query, { limit: 20000 });
  const total = rows.length;

  const ratingCounts = { good: 0, regular: 0, bad: 0, none: 0 };
  for (const r of rows) ratingCounts[ratingKey(r.rating)]++;

  const allGoodCount = rows.filter((r) => r.dislikes.includes('Ninguna, todo bien')).length;

  const tz = typeof req.query.tz === 'string' ? req.query.tz : undefined;
  const trendMap = new Map();
  for (const r of rows) {
    const day = localDate(r.created_at, tz);
    if (!day) continue;
    const entry = trendMap.get(day) || { date: day, count: 0, good: 0, regular: 0, bad: 0, none: 0 };
    entry.count++;
    entry[ratingKey(r.rating)]++;
    trendMap.set(day, entry);
  }
  const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  res.json({
    total,
    ratingCounts,
    allGoodCount,
    allGoodPct: total ? Math.round((allGoodCount / total) * 100) : 0,
    areas: countLabels(rows, 'areas', questions.questions[0].options),
    dislikes: countLabels(rows, 'dislikes', questions.questions[1].options),
    likes: countLabels(rows, 'likes', questions.questions[2].options),
    trend,
    byRegister: groupStats(rows, 'register_id', 'register_name'),
    byCashier: groupStats(rows, 'cashier_id', 'cashier_name'),
    byBranch: groupStats(rows, 'branch_id', 'branch_name'),
    recent: rows.slice(0, 8),
  });
});

// Respuesta con la forma de ActivityResponse. La tabla sessions solo guarda usuarios,
// así que los datos de tienda/caja/cajero y el motivo de cierre van en null.
router.get('/activity', requireAuth(), (_req, res) => {
  const sessions = db
    .prepare(
      `SELECT id, role, user_name, NULL AS branch_name, NULL AS register_name,
              NULL AS cashier_name, created_at, closed_at, NULL AS close_reason
       FROM sessions
       ORDER BY COALESCE(closed_at, created_at) DESC
       LIMIT 40`
    )
    .all();

  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const recentClosures = sessions.filter((s) => s.closed_at && s.closed_at >= since);
  const openSessions = db
    .prepare('SELECT COUNT(*) AS c FROM sessions WHERE closed_at IS NULL AND expires_at > ?')
    .get(new Date().toISOString()).c;

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const surveysLast24h = db
    .prepare('SELECT COUNT(*) AS c FROM surveys WHERE created_at >= ?')
    .get(dayAgo).c;

  res.json({ sessions, recentClosures, openSessions, surveysLast24h });
});

function ratingKey(rating) {
  return rating === 'good' || rating === 'regular' || rating === 'bad' ? rating : 'none';
}

function countLabels(rows, key, canonical) {
  const index = new Map(canonical.map((label, i) => [label, i]));
  const counts = new Map(canonical.map((label) => [label, 0]));
  for (const row of rows) {
    for (const label of row[key]) {
      if (index.has(label)) counts.set(label, counts.get(label) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || index.get(a.label) - index.get(b.label));
}

function groupStats(rows, idKey, nameKey) {
  const map = new Map();
  for (const r of rows) {
    const id = r[idKey] ?? null;
    const entry = map.get(id) || { id, name: r[nameKey] || 'Sin asignar', count: 0, good: 0, regular: 0, bad: 0, none: 0 };
    entry.count++;
    entry[ratingKey(r.rating)]++;
    map.set(id, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export default router;
