import { db, now } from './db.js';
import { getUserAccess } from './middleware.js';

/*
 * Notificaciones del panel. Las crea el servidor cuando pasa algo (seguridad, encuestas,
 * respaldos) y cada usuario lleva su propio estado de leída / borrada.
 *
 * audience: 'admin' (solo Administrador), una clave de permiso (quien la tenga) o null
 * (todos). dedupeKey agrupa avisos repetidos en uno solo que se actualiza; con reopen,
 * la actualización lo vuelve a marcar como no leído para todos.
 */

const RETENTION_DAYS = 60;

// Se preparan al primer uso: este módulo se carga antes de que db.js cree las tablas.
let stmts = null;
function q() {
  stmts ??= {
    byKey: db.prepare('SELECT id, updated_at FROM notifications WHERE dedupe_key = ?'),
    insert: db.prepare(
      `INSERT INTO notifications (created_at, updated_at, kind, tone, title, message, link, audience, dedupe_key)
       VALUES (@t, @t, @kind, @tone, @title, @message, @link, @audience, @dedupeKey)`
    ),
    update: db.prepare(
      'UPDATE notifications SET tone = ?, title = ?, message = ?, link = ?, updated_at = ? WHERE id = ?'
    ),
    clearState: db.prepare('DELETE FROM notification_state WHERE notification_id = ?'),
    prune: db.prepare('DELETE FROM notifications WHERE updated_at < ?'),
    pruneState: db.prepare(
      'DELETE FROM notification_state WHERE notification_id NOT IN (SELECT id FROM notifications)'
    ),
    upsertState: db.prepare(
      `INSERT INTO notification_state (notification_id, user_id, read_at, dismissed_at) VALUES (@id, @user, @read, @dismissed)
       ON CONFLICT(notification_id, user_id) DO UPDATE SET
         read_at = CASE WHEN @setRead THEN @read ELSE read_at END,
         dismissed_at = CASE WHEN @setDismissed THEN @dismissed ELSE dismissed_at END`
    ),
  };
  return stmts;
}

let lastPrune = 0;

/** Crea (o actualiza, con dedupeKey) una notificación. Nunca lanza: un aviso no debe romper la acción. */
export function notify({ kind, tone = 'info', title, message, link = null, audience = null, dedupeKey = null, reopen = true }) {
  try {
    const t = now();
    if (dedupeKey) {
      const existing = q().byKey.get(dedupeKey);
      if (existing) {
        q().update.run(tone, title, message, link, reopen ? t : existing.updated_at, existing.id);
        if (reopen) q().clearState.run(existing.id);
        return existing.id;
      }
    }
    const id = q().insert.run({ t, kind, tone, title, message, link, audience, dedupeKey }).lastInsertRowid;
    if (Date.now() - lastPrune > 3600 * 1000) {
      lastPrune = Date.now();
      q().prune.run(new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString());
      q().pruneState.run();
    }
    return id;
  } catch (e) {
    console.error('[Notificaciones] No se pudo guardar:', e.message);
    return null;
  }
}

/** Condición SQL (sobre el alias n) de las notificaciones que puede ver el usuario. */
function audienceFilter(userId) {
  const access = getUserAccess(userId);
  if (access.is_admin) return { sql: '1 = 1', params: [] };
  const perms = access.permissions;
  if (!perms.length) return { sql: 'n.audience IS NULL', params: [] };
  return { sql: `(n.audience IS NULL OR n.audience IN (${perms.map(() => '?').join(', ')}))`, params: perms };
}

function visibleRows(userId, { unreadOnly = false, limit = 200 } = {}) {
  const aud = audienceFilter(userId);
  return db
    .prepare(
      `SELECT n.id, n.created_at, n.updated_at, n.kind, n.tone, n.title, n.message, n.link, s.read_at
       FROM notifications n
       LEFT JOIN notification_state s ON s.notification_id = n.id AND s.user_id = ?
       WHERE s.dismissed_at IS NULL AND ${aud.sql} ${unreadOnly ? 'AND s.read_at IS NULL' : ''}
       ORDER BY n.updated_at DESC, n.id DESC
       LIMIT ?`
    )
    .all(userId, ...aud.params, limit);
}

export function listNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
  const items = visibleRows(userId, { unreadOnly, limit }).map((r) => ({ ...r, read: !!r.read_at }));
  const unread = visibleRows(userId, { unreadOnly: true, limit: 1000 }).length;
  return { items, unread };
}

function canSee(userId, id) {
  const aud = audienceFilter(userId);
  return !!db.prepare(`SELECT 1 FROM notifications n WHERE n.id = ? AND ${aud.sql}`).get(id, ...aud.params);
}

function setState(userId, ids, { read, dismissed }) {
  const t = now();
  db.transaction(() => {
    for (const id of ids) {
      q().upsertState.run({
        id,
        user: userId,
        read: read === undefined ? null : read ? t : null,
        dismissed: dismissed ? t : null,
        setRead: read === undefined ? 0 : 1,
        setDismissed: dismissed === undefined ? 0 : 1,
      });
    }
  })();
}

export function markNotification(userId, id, read) {
  if (!canSee(userId, id)) return false;
  setState(userId, [id], { read });
  return true;
}

export function dismissNotification(userId, id) {
  if (!canSee(userId, id)) return false;
  setState(userId, [id], { read: true, dismissed: true });
  return true;
}

export function markAllRead(userId) {
  const ids = visibleRows(userId, { unreadOnly: true, limit: 1000 }).map((r) => r.id);
  setState(userId, ids, { read: true });
  return ids.length;
}

/** Borra (para este usuario) las que ya leyó. */
export function dismissRead(userId) {
  const ids = visibleRows(userId, { limit: 1000 })
    .filter((r) => r.read_at)
    .map((r) => r.id);
  setState(userId, ids, { dismissed: true });
  return ids.length;
}
