import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../middleware.js';
import { activeLocks, originLocked, unlock } from '../security.js';

const router = Router();

// Registro de accesos y bloqueos activos. Solo el Administrador.
router.get('/access-log', requireAdmin, (req, res) => {
  const where =
    req.query.result === 'ok' ? 'WHERE success = 1' : req.query.result === 'fail' ? 'WHERE success = 0' : '';
  const items = db
    .prepare(
      `SELECT id, created_at, username, user_id, success, reason, ip, country, user_agent
       FROM login_log ${where} ORDER BY id DESC LIMIT 500`
    )
    .all()
    .map((r) => ({ ...r, success: !!r.success }));

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const counts = db
    .prepare(
      `SELECT SUM(success = 1) AS ok, SUM(success = 0) AS fail, COUNT(DISTINCT CASE WHEN success = 0 THEN ip END) AS ips
       FROM login_log WHERE created_at >= ?`
    )
    .get(dayAgo);

  res.json({
    items,
    locks: activeLocks(),
    last24h: { ok: counts.ok ?? 0, fail: counts.fail ?? 0, failedIps: counts.ips ?? 0 },
    behindCloudflare: originLocked,
  });
});

router.delete('/access-log/locks/:key', requireAdmin, (req, res) => {
  if (!unlock(req.params.key)) return res.status(404).json({ error: 'Ese bloqueo ya no existe' });
  res.json({ ok: true });
});

export default router;
