import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, now } from '../db.js';
import { requireAuth, requirePermission, closeUserSessions } from '../middleware.js';

const router = Router();

function bad(res, status, message) {
  return res.status(status).json({ error: message });
}

function cleanName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

const tables = {
  branches: {
    table: 'branches',
    extra: (row) => ({
      registers: db
        .prepare('SELECT COUNT(*) AS c FROM registers WHERE branch_id = ?')
        .get(row.id).c,
    }),
    listSql: 'SELECT id, name, active FROM branches ORDER BY name',
    dupeSql: 'SELECT id FROM branches WHERE lower(trim(name)) = lower(trim(?)) AND id <> ?',
  },
  registers: {
    table: 'registers',
    needsBranch: true,
    extra: () => ({}),
    listSql: `SELECT r.id, r.branch_id, r.name, r.active, b.name AS branch_name
              FROM registers r JOIN branches b ON b.id = r.branch_id
              ORDER BY b.name, r.name`,
    dupeSql: `SELECT id FROM registers WHERE branch_id = ? AND lower(trim(name)) = lower(trim(?)) AND id <> ?`,
  },
  cashiers: {
    table: 'cashiers',
    needsBranch: true,
    extra: () => ({}),
    listSql: `SELECT c.id, c.branch_id, c.name, c.active, b.name AS branch_name
              FROM cashiers c JOIN branches b ON b.id = c.branch_id
              ORDER BY b.name, c.name`,
    dupeSql: `SELECT id FROM cashiers WHERE branch_id = ? AND lower(trim(name)) = lower(trim(?)) AND id <> ?`,
  },
};

function makeCrud(kind) {
  const cfg = tables[kind];
  const r = Router();
  // Leer el catálogo lo necesita cualquier usuario (filtros de estadísticas y respuestas);
  // modificarlo requiere el permiso de esa pantalla.
  const canEdit = requirePermission(`catalog.${kind}`);

  r.get(`/${kind}`, requireAuth(), (_req, res) => {
    const items = db.prepare(cfg.listSql).all().map((row) => ({ ...row, ...cfg.extra(row) }));
    res.json({ items });
  });

  r.post(`/${kind}`, canEdit, (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return bad(res, 400, 'Escribe un nombre');

    if (cfg.needsBranch) {
      const branchId = Number(req.body?.branch_id);
      const branch = db.prepare('SELECT id FROM branches WHERE id = ?').get(branchId);
      if (!branch) return bad(res, 400, 'La sucursal seleccionada no existe');
      const dup = db.prepare(cfg.dupeSql).get(branchId, name, -1);
      if (dup) return bad(res, 409, 'Ya existe una entrada con ese nombre en esa sucursal');
      const info = db
        .prepare(`INSERT INTO ${cfg.table} (branch_id, name, created_at) VALUES (?, ?, ?)`)
        .run(branchId, name, now());
      const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(info.lastInsertRowid);
      return res.status(201).json({ item: { ...row, ...cfg.extra(row) } });
    }

    const dup = db.prepare(cfg.dupeSql).get(name, -1);
    if (dup) return bad(res, 409, 'Ya existe una sucursal con ese nombre');
    const info = db.prepare(`INSERT INTO ${cfg.table} (name, created_at) VALUES (?, ?)`).run(name, now());
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(info.lastInsertRowid);
    return res.status(201).json({ item: { ...row, ...cfg.extra(row) } });
  });

  r.put(`/${kind}/:id`, canEdit, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id);
    if (!row) return bad(res, 404, 'No encontrado');

    const updates = [];
    const params = [];

    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name);
      if (!name) return bad(res, 400, 'Escribe un nombre');
      if (name !== row.name) {
        const dup = cfg.needsBranch
          ? db.prepare(cfg.dupeSql).get(row.branch_id, name, id)
          : db.prepare(cfg.dupeSql).get(name, id);
        if (dup) return bad(res, 409, 'Ya existe una entrada con ese nombre');
      }
      updates.push('name = ?');
      params.push(name);
    }
    if (cfg.needsBranch && req.body?.branch_id !== undefined) {
      const branchId = Number(req.body.branch_id);
      if (!Number.isInteger(branchId) || branchId <= 0) {
        return bad(res, 400, 'Sucursal no válida');
      }
      const branch = db.prepare('SELECT id FROM branches WHERE id = ?').get(branchId);
      if (!branch) return bad(res, 400, 'La sucursal seleccionada no existe');
      if (branchId !== row.branch_id) {
        const finalName = req.body?.name !== undefined ? cleanName(req.body.name) : row.name;
        const dup = db.prepare(cfg.dupeSql).get(branchId, finalName, id);
        if (dup) return bad(res, 409, 'Ya existe una entrada con ese nombre en esa sucursal');
        updates.push('branch_id = ?');
        params.push(branchId);
      }
    }
    if (req.body?.active !== undefined) {
      updates.push('active = ?');
      params.push(req.body.active ? 1 : 0);
    }
    if (!updates.length) return bad(res, 400, 'Nada que actualizar');

    updates.push('updated_at = ?');
    params.push(now(), id);
    db.prepare(`UPDATE ${cfg.table} SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id);
    res.json({ item: { ...updated, ...cfg.extra(updated) } });
  });

  r.delete(`/${kind}/:id`, canEdit, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id);
    if (!row) return bad(res, 404, 'No encontrado');
    db.prepare(`UPDATE ${cfg.table} SET active = 0 WHERE id = ?`).run(id);
    res.json({ ok: true });
  });

  return r;
}

router.use(makeCrud('branches'));
router.use(makeCrud('registers'));
router.use(makeCrud('cashiers'));

router.put('/password', requireAuth(), (req, res) => {
  const { current_password, new_password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user_id);
  if (!user) return bad(res, 404, 'Usuario no encontrado');
  if (!current_password || !new_password) return bad(res, 400, 'Faltan datos');
  if (!bcrypt.compareSync(String(current_password), user.password_hash)) {
    return bad(res, 401, 'La contraseña actual no coincide');
  }
  if (String(new_password).length < 6) {
    return bad(res, 400, 'La nueva contraseña debe tener al menos 6 caracteres');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(String(new_password), 10),
    user.id
  );
  closeUserSessions(user.id);
  res.json({ ok: true });
});

const canManageUsers = requirePermission('settings.users');

function cleanUsername(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '').slice(0, 40);
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    role_id: row.role_id,
    role_name: row.role_name || 'Sin rol',
    active: row.active,
    created_at: row.created_at,
  };
}

const USER_SQL = `
  SELECT u.id, u.username, u.name, u.role, u.role_id, u.active, u.created_at,
         r.name AS role_name, r.is_admin
  FROM users u LEFT JOIN roles r ON r.id = u.role_id`;

const getUser = (id) => db.prepare(`${USER_SQL} WHERE u.id = ?`).get(id);

const getRole = (id) => db.prepare('SELECT id, is_admin FROM roles WHERE id = ?').get(Number(id));

/** Otros administradores activos además del usuario indicado. */
function otherActiveAdmins(userId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.is_admin = 1 AND u.active = 1 AND u.id <> ?`
    )
    .get(userId).c;
}

router.get('/users', canManageUsers, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const offset = (page - 1) * pageSize;

  const total = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const items = db
    .prepare(`${USER_SQL} ORDER BY r.is_admin DESC, role_name, u.name LIMIT ? OFFSET ?`)
    .all(pageSize, offset)
    .map(mapUser);
  res.json({ items, total });
});

router.post('/users', canManageUsers, (req, res) => {
  const username = cleanUsername(req.body?.username);
  const name = cleanName(req.body?.name);
  const password = String(req.body?.password ?? '');
  const role = getRole(req.body?.role_id);
  if (!name) return bad(res, 400, 'Escribe un nombre');
  if (!username || username.length < 3) return bad(res, 400, 'El usuario debe tener al menos 3 caracteres');
  if (password.length < 6) return bad(res, 400, 'La contraseña debe tener al menos 6 caracteres');
  if (!role) return bad(res, 400, 'Selecciona un rol válido');
  if (role.is_admin && !req.access.is_admin) {
    return bad(res, 403, 'Solo un administrador puede crear otros administradores');
  }
  const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (dup) return bad(res, 409, 'Ya existe un usuario con ese nombre');
  const info = db
    .prepare(
      'INSERT INTO users (username, password_hash, name, role, role_id, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
    )
    .run(username, bcrypt.hashSync(password, 10), name, role.is_admin ? 'admin' : 'cashier', role.id, now());
  res.status(201).json({ item: mapUser(getUser(info.lastInsertRowid)) });
});

router.put('/users/:id', canManageUsers, (req, res) => {
  const id = Number(req.params.id);
  const row = getUser(id);
  if (!row) return bad(res, 404, 'Usuario no encontrado');
  const isSelf = req.session.user_id === id;
  if (row.is_admin && !req.access.is_admin) {
    return bad(res, 403, 'Solo un administrador puede modificar a otro administrador');
  }

  const updates = [];
  const params = [];
  let closeSessions = false;

  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return bad(res, 400, 'Escribe un nombre');
    updates.push('name = ?');
    params.push(name);
  }
  if (req.body?.username !== undefined) {
    const username = cleanUsername(req.body.username);
    if (!username || username.length < 3) return bad(res, 400, 'El usuario debe tener al menos 3 caracteres');
    const dup = db
      .prepare('SELECT id FROM users WHERE username = ? AND id <> ?')
      .get(username, id);
    if (dup) return bad(res, 409, 'Ese nombre de usuario ya está en uso');
    updates.push('username = ?');
    params.push(username);
  }
  if (req.body?.role_id !== undefined && Number(req.body.role_id) !== row.role_id) {
    const role = getRole(req.body.role_id);
    if (!role) return bad(res, 400, 'Selecciona un rol válido');
    if (isSelf) return bad(res, 400, 'No puedes cambiar tu propio rol');
    if (role.is_admin && !req.access.is_admin) {
      return bad(res, 403, 'Solo un administrador puede asignar el rol Administrador');
    }
    if (row.is_admin && !role.is_admin && row.active && otherActiveAdmins(id) === 0) {
      return bad(res, 400, 'Debe quedar al menos un administrador activo');
    }
    updates.push('role_id = ?', 'role = ?');
    params.push(role.id, role.is_admin ? 'admin' : 'cashier');
    closeSessions = true;
  }
  if (req.body?.active !== undefined) {
    if (isSelf && !req.body.active) {
      return bad(res, 400, 'No puedes desactivar tu propia cuenta');
    }
    if (!req.body.active) {
      if (row.is_admin && otherActiveAdmins(id) === 0) {
        return bad(res, 400, 'Debe quedar al menos un administrador activo');
      }
      closeSessions = true;
    }
    updates.push('active = ?');
    params.push(req.body.active ? 1 : 0);
  }
  if (req.body?.password) {
    const password = String(req.body.password);
    if (password.length < 6) return bad(res, 400, 'La contraseña debe tener al menos 6 caracteres');
    closeSessions = true;
    updates.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 10));
  }
  if (!updates.length) return bad(res, 400, 'Nada que actualizar');

  params.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  if (closeSessions) closeUserSessions(id);

  res.json({ item: mapUser(getUser(id)) });
});

router.delete('/users/:id', canManageUsers, (req, res) => {
  const id = Number(req.params.id);
  if (req.session.user_id === id) return bad(res, 400, 'No puedes desactivar tu propia cuenta');
  const row = getUser(id);
  if (!row) return bad(res, 404, 'No encontrado');
  if (row.is_admin && !req.access.is_admin) {
    return bad(res, 403, 'Solo un administrador puede desactivar a otro administrador');
  }
  if (row.is_admin && otherActiveAdmins(id) === 0) {
    return bad(res, 400, 'Debe quedar al menos un administrador activo');
  }
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  closeUserSessions(id);
  res.json({ ok: true });
});

export default router;
