import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAdmin } from '../middleware.js';
import { activeLocks, unlock } from '../security.js';

const router = Router();

/**
 * Dispositivos: sesiones con actividad reciente (la actividad se guarda cada 5 min, ver
 * middleware.js) y todas las tablets de encuestas vinculadas, también las apagadas, para
 * poder desvincular una perdida.
 */
const SESSION_ONLINE_MS = 10 * 60 * 1000;

router.get('/access-log/online', requireAdmin, (req, res) => {
  const t = Date.now();
  const sessions = db
    .prepare(
      `SELECT s.id, s.token, s.user_name, u.username, ro.name AS role_name, s.created_at,
              COALESCE(s.last_seen_at, s.created_at) AS last_seen_at, s.ip, s.user_agent
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN roles ro ON ro.id = u.role_id
       WHERE s.closed_at IS NULL AND s.expires_at > ? AND COALESCE(s.last_seen_at, s.created_at) >= ?
       ORDER BY COALESCE(s.last_seen_at, s.created_at) DESC`
    )
    .all(now(), new Date(t - SESSION_ONLINE_MS).toISOString())
    .map(({ token, ...s }) => ({ ...s, current: token === req.session.token }));

  const devices = db
    .prepare(
      `SELECT d.id, d.name, d.branch_id, b.name AS branch_name, d.register_id, r.name AS register_name,
              d.created_at, d.created_by_name, d.last_seen_at, d.last_ip AS ip, d.user_agent, d.pending, d.pending_since
       FROM devices d
       LEFT JOIN branches b ON b.id = d.branch_id
       LEFT JOIN registers r ON r.id = d.register_id
       WHERE d.revoked_at IS NULL
       ORDER BY d.last_seen_at DESC`
    )
    .all();

  res.json({ sessions, devices, locks: activeLocks() });
});

// Historial de inicios de sesión (exitosos y fallidos) y bloqueos activos. Solo el Administrador.
router.get('/access-log', requireAdmin, (req, res) => {
  const where =
    req.query.result === 'ok' ? 'WHERE success = 1' : req.query.result === 'fail' ? 'WHERE success = 0' : '';
  const items = db
    .prepare(
      `SELECT id, created_at, username, user_id, success, reason, ip, user_agent
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
  });
});

router.delete('/access-log/locks/:key', requireAdmin, (req, res) => {
  if (!unlock(req.params.key)) return res.status(404).json({ error: 'Ese bloqueo ya no existe' });
  res.json({ ok: true });
});

export default router;
