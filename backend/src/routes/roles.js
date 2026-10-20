import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAdmin, requirePermission } from '../middleware.js';
import { PERMISSIONS, cleanPermissions, parsePermissions } from '../permissions.js';

const router = Router();

function bad(res, status, message) {
  return res.status(status).json({ error: message });
}

function cleanText(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function mapRole(row) {
  const isAdmin = !!row.is_admin;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    permissions: isAdmin ? [...PERMISSIONS] : parsePermissions(row.permissions),
    is_system: !!row.is_system,
    is_admin: isAdmin,
    user_count: row.user_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const LIST_SQL = `
  SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
  FROM roles r`;

// La lista también la necesita quien administra usuarios (para asignar roles).
router.get('/roles', requirePermission('settings.users'), (_req, res) => {
  const items = db.prepare(`${LIST_SQL} ORDER BY r.is_admin DESC, r.is_system DESC, r.name`).all();
  res.json({ items: items.map(mapRole) });
});

router.post('/roles', requireAdmin, (req, res) => {
  const name = cleanText(req.body?.name, 60);
  if (!name) return bad(res, 400, 'Escribe un nombre para el rol');
  const dup = db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
  if (dup) return bad(res, 409, 'Ya existe un rol con ese nombre');
  const permissions = cleanPermissions(req.body?.permissions);
  if (!permissions.length) return bad(res, 400, 'Selecciona al menos una opción');
  const info = db
    .prepare('INSERT INTO roles (name, description, permissions, created_at) VALUES (?, ?, ?, ?)')
    .run(name, cleanText(req.body?.description, 200), JSON.stringify(permissions), now());
  const row = db.prepare(`${LIST_SQL} WHERE r.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ item: mapRole(row) });
});

router.put('/roles/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!row) return bad(res, 404, 'Rol no encontrado');
  if (row.is_admin) return bad(res, 400, 'El rol Administrador siempre tiene acceso total y no se puede modificar');

  const updates = [];
  const params = [];
  if (req.body?.name !== undefined) {
    const name = cleanText(req.body.name, 60);
    if (!name) return bad(res, 400, 'Escribe un nombre para el rol');
    const dup = db.prepare('SELECT id FROM roles WHERE name = ? AND id <> ?').get(name, id);
    if (dup) return bad(res, 409, 'Ya existe un rol con ese nombre');
    updates.push('name = ?');
    params.push(name);
  }
  if (req.body?.description !== undefined) {
    updates.push('description = ?');
    params.push(cleanText(req.body.description, 200));
  }
  if (req.body?.permissions !== undefined) {
    const permissions = cleanPermissions(req.body.permissions);
    if (!permissions.length) return bad(res, 400, 'Selecciona al menos una opción');
    updates.push('permissions = ?');
    params.push(JSON.stringify(permissions));
  }
  if (!updates.length) return bad(res, 400, 'Nada que actualizar');

  updates.push('updated_at = ?');
  params.push(now(), id);
  db.prepare(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare(`${LIST_SQL} WHERE r.id = ?`).get(id);
  res.json({ item: mapRole(updated) });
});

router.delete('/roles/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`${LIST_SQL} WHERE r.id = ?`).get(id);
  if (!row) return bad(res, 404, 'Rol no encontrado');
  if (row.is_system) return bad(res, 400, 'Los roles del sistema no se pueden eliminar');
  if (row.user_count > 0) {
    return bad(res, 409, `Hay ${row.user_count} usuario(s) con este rol. Asígnales otro rol antes de eliminarlo.`);
  }
  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
