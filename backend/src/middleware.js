import { db, now, sessionExpiresAt, SESSION_TTL_HOURS } from './db.js';
import { PERMISSIONS, parsePermissions } from './permissions.js';
import { clientIp } from './security.js';

const TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
const RENEW_EVERY_MS = Math.min(24 * 60 * 60 * 1000, TTL_MS / 2);
/** Cada cuánto se guarda la última actividad de una sesión (Conectados ahora, en Registro de accesos). */
const SEEN_EVERY_MS = 5 * 60 * 1000;

export function mapSession(session) {
  if (!session) return null;
  return {
    token: session.token,
    role: session.role,
    user_id: session.user_id,
    user_name: session.user_name,
    created_at: session.created_at,
    expires_at: session.expires_at,
  };
}

function touchSession(token) {
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(
    sessionExpiresAt(),
    token
  );
}

export function getSession(token) {
  if (!token) return null;
  const session = db
    .prepare('SELECT * FROM sessions WHERE token = ? AND closed_at IS NULL')
    .get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('UPDATE sessions SET closed_at = ? WHERE id = ?').run(now(), session.id);
    return null;
  }
  // Se renueva como máximo una vez al día para no escribir en la base en cada petición.
  const remaining = new Date(session.expires_at).getTime() - Date.now();
  if (remaining < TTL_MS - RENEW_EVERY_MS) touchSession(token);
  return session;
}

export function requireAuth(...roles) {
  return (req, res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const session = getSession(token);
    if (!session) return res.status(401).json({ error: 'Sesión no válida o expirada' });
    if (roles.length && !roles.includes(session.role)) {
      return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    touchActivity(session, req);
    req.session = session;
    next();
  };
}

/** Última actividad, IP y navegador de la sesión; se escribe como máximo cada 5 minutos. */
function touchActivity(session, req) {
  const last = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  if (Date.now() - last < SEEN_EVERY_MS) return;
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 300) || null;
  db.prepare('UPDATE sessions SET last_seen_at = ?, ip = ?, user_agent = ? WHERE id = ?').run(
    now(),
    clientIp(req) || null,
    userAgent,
    session.id
  );
}

// Rol y permisos actuales del usuario, leídos de la BD en cada petición para que
// los cambios a un rol apliquen de inmediato sin volver a iniciar sesión.
export function getUserAccess(userId) {
  const row = db
    .prepare(
      `SELECT r.id AS role_id, r.name AS role_name, r.is_admin, r.permissions
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .get(userId);
  if (!row || !row.role_id) {
    return { role_id: null, role_name: 'Sin rol', is_admin: false, permissions: [] };
  }
  const isAdmin = !!row.is_admin;
  return {
    role_id: row.role_id,
    role_name: row.role_name,
    is_admin: isAdmin,
    permissions: isAdmin ? [...PERMISSIONS] : parsePermissions(row.permissions),
  };
}

/**
 * Permite el paso si el usuario es Administrador o tiene al menos uno de los
 * permisos indicados. Sin permisos (`requirePermission()`) solo pasa el Administrador.
 */
export function requirePermission(...perms) {
  const auth = requireAuth();
  return (req, res, next) =>
    auth(req, res, () => {
      const access = getUserAccess(req.session.user_id);
      if (!access.is_admin && !perms.some((p) => access.permissions.includes(p))) {
        return res.status(403).json({ error: 'Tu rol no tiene acceso a esta opción' });
      }
      req.access = access;
      next();
    });
}

export const requireAdmin = requirePermission();

export function closeUserSessions(userId) {
  const info = db
    .prepare('UPDATE sessions SET closed_at = ? WHERE user_id = ? AND closed_at IS NULL')
    .run(now(), userId);
  return info.changes;
}
