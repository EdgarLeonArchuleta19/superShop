import { Router } from 'express';
import { db } from '../db.js';
import { questions } from '../questions.js';
import { requireAuth } from '../middleware.js';
import { loadSurveys, localDate } from '../store.js';

const router = Router();

router.get('/stats', requireAuth('admin', 'cashier'), (req, res) => {
  const rows = loadSurveys(req.query, { limit: 20000 });
  const total = rows.length;
  const ratingSum = rows.reduce((s, r) => s + r.rating, 0);
  const avgRating = total ? Math.round((ratingSum / total) * 100) / 100 : 0;

  const ratingDist = [1, 2, 3, 4, 5].map((r) => ({
    rating: r,
    count: rows.filter((row) => row.rating === r).length,
  }));

  const allGoodCount = rows.filter((r) => r.dislikes.includes('Ninguna, todo bien')).length;

  const areas = countLabels(rows, 'areas', questions.questions[0].options);
  const dislikes = countLabels(rows, 'dislikes', questions.questions[1].options);
  const likes = countLabels(rows, 'likes', questions.questions[2].options);

  const trendMap = new Map();
  for (const r of rows) {
    const day = localDate(r.created_at);
    const entry = trendMap.get(day) || { date: day, count: 0, ratingSum: 0 };
    entry.count++;
    entry.ratingSum += r.rating;
    trendMap.set(day, entry);
  }
  const trend = [...trendMap.values()]
    .map((e) => ({ date: e.date, count: e.count, avg: Math.round((e.ratingSum / e.count) * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byRegister = groupStats(rows, 'register_id', 'register_name');
  const byCashier = groupStats(rows, 'cashier_id', 'cashier_name');
  const byBranch = groupStats(rows, 'branch_id', 'branch_name');

  const recent = rows.slice(0, 8);

  res.json({
    total,
    avgRating,
    allGoodCount,
    allGoodPct: total ? Math.round((allGoodCount / total) * 100) : 0,
    ratingDist,
    areas,
    dislikes,
    likes,
    trend,
    byRegister,
    byCashier,
    byBranch,
    recent,
  });
});

router.get('/activity', requireAuth('admin'), (req, res) => {
  const sessions = db
    .prepare(
      `SELECT id, role, user_name, branch_name, register_name, cashier_name,
              created_at, closed_at, close_reason
       FROM sessions
       ORDER BY COALESCE(closed_at, created_at) DESC
       LIMIT 40`
    )
    .all();

  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const recentClosures = sessions.filter((s) => s.closed_at && s.closed_at >= since);
  const openSessions = sessions.filter((s) => !s.closed_at && s.role === 'cashier').length;

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const surveysLast24h = db
    .prepare('SELECT COUNT(*) AS c FROM surveys WHERE created_at >= ?')
    .get(dayAgo).c;

  res.json({ sessions, recentClosures, openSessions, surveysLast24h });
});

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
    const id = r[idKey];
    const name = r[nameKey] || 'Sin asignar';
    const entry = map.get(id) || { id, name, count: 0, ratingSum: 0 };
    entry.count++;
    entry.ratingSum += r.rating;
    map.set(id, entry);
  }
  return [...map.values()]
    .map((e) => ({ id: e.id, name: e.name, count: e.count, avg: Math.round((e.ratingSum / e.count) * 100) / 100 }))
    .sort((a, b) => b.count - a.count);
}

export default router;
