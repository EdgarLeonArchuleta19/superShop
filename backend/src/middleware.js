import { db, now } from './db.js';

export function getSession(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT s.* FROM sessions s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.token = ?
           AND s.closed_at IS NULL
           AND (s.expires_at IS NULL OR s.expires_at > ?)
           AND (s.user_id IS NULL OR u.active = 1)`
      )
      .get(token, now()) || null
  );
}

export function requireAuth(...roles) {
  return (req, res, next) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Sesión no válida' });
    if (roles.length && !roles.includes(session.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    req.session = session;
    next();
  };
}

export function closeUserSessions(userId, { exceptToken, reason = 'revoked' } = {}) {
  if (!userId) return;
  const at = now();
  if (exceptToken) {
    db.prepare(
      `UPDATE sessions SET closed_at = ?, close_reason = ?
       WHERE user_id = ? AND closed_at IS NULL AND token <> ?`
    ).run(at, reason, userId, exceptToken);
  } else {
    db.prepare(
      `UPDATE sessions SET closed_at = ?, close_reason = ?
       WHERE user_id = ? AND closed_at IS NULL`
    ).run(at, reason, userId);
  }
}
