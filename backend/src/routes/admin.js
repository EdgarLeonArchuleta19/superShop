import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireAuth, closeUserSessions } from '../middleware.js';

const router = Router();
router.use(requireAuth('admin'));

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

  r.get(`/${kind}`, (_req, res) => {
    const items = db.prepare(cfg.listSql).all().map((row) => ({ ...row, ...cfg.extra(row) }));
    res.json({ items });
  });

  r.post(`/${kind}`, (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return bad(res, 400, 'Escribe un nombre');

    if (cfg.needsBranch) {
      const branchId = Number(req.body?.branch_id);
      const branch = db.prepare('SELECT id FROM branches WHERE id = ?').get(branchId);
      if (!branch) return bad(res, 400, 'La sucursal seleccionada no existe');
      const dup = db.prepare(cfg.dupeSql).get(branchId, name, -1);
      if (dup) return bad(res, 409, 'Ya existe una entrada con ese nombre en esa sucursal');
      const info = db
        .prepare(`INSERT INTO ${cfg.table} (branch_id, name) VALUES (?, ?)`)
        .run(branchId, name);
      const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(info.lastInsertRowid);
      return res.status(201).json({ item: { ...row, ...cfg.extra(row) } });
    }

    const dup = db.prepare(cfg.dupeSql).get(name, -1);
    if (dup) return bad(res, 409, 'Ya existe una sucursal con ese nombre');
    const info = db.prepare(`INSERT INTO ${cfg.table} (name) VALUES (?)`).run(name);
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(info.lastInsertRowid);
    return res.status(201).json({ item: { ...row, ...cfg.extra(row) } });
  });

  r.put(`/${kind}/:id`, (req, res) => {
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

    params.push(id);
    db.prepare(`UPDATE ${cfg.table} SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id);
    res.json({ item: { ...updated, ...cfg.extra(updated) } });
  });

  r.delete(`/${kind}/:id`, (req, res) => {
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

router.put('/password', (req, res) => {
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
  closeUserSessions(user.id, { exceptToken: req.session.token, reason: 'password_change' });
  res.json({ ok: true });
});

const ROLES = ['admin', 'cashier'];

function cleanEmail(value) {
  return String(value ?? '').trim().toLowerCase().slice(0, 120);
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    created_at: row.created_at,
  };
}

router.get('/users', (_req, res) => {
  const items = db
    .prepare('SELECT id, email, name, role, active, created_at FROM users ORDER BY role, name')
    .all()
    .map(mapUser);
  res.json({ items });
});

router.post('/users', (req, res) => {
  const email = cleanEmail(req.body?.email);
  const name = cleanName(req.body?.name);
  const role = ROLES.includes(req.body?.role) ? req.body.role : 'cashier';
  const password = String(req.body?.password ?? '');
  if (!name) return bad(res, 400, 'Escribe un nombre');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return bad(res, 400, 'Escribe un correo válido');
  }
  if (password.length < 6) return bad(res, 400, 'La contraseña debe tener al menos 6 caracteres');
  const dup = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)')
    .get(email, email);
  if (dup) return bad(res, 409, 'Ya existe un usuario con ese correo');
  const info = db
    .prepare(
      'INSERT INTO users (username, email, password_hash, name, role, active) VALUES (?, ?, ?, ?, ?, 1)'
    )
    .run(email, email, bcrypt.hashSync(password, 10), name, role);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ item: mapUser(row) });
});

router.put('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return bad(res, 404, 'Usuario no encontrado');

  const updates = [];
  const params = [];
  let roleChanged = false;
  let passwordChanged = false;
  let deactivated = false;

  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return bad(res, 400, 'Escribe un nombre');
    updates.push('name = ?');
    params.push(name);
  }
  if (req.body?.email !== undefined) {
    const email = cleanEmail(req.body.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 400, 'Correo no válido');
    const dup = db
      .prepare('SELECT id FROM users WHERE (lower(email) = lower(?) OR lower(username) = lower(?)) AND id <> ?')
      .get(email, email, id);
    if (dup) return bad(res, 409, 'Ese correo ya está en uso');
    updates.push('email = ?', 'username = ?');
    params.push(email, email);
  }
  if (req.body?.role !== undefined) {
    if (!ROLES.includes(req.body.role)) return bad(res, 400, 'Rol no válido');
    if (req.session.user_id === id && req.body.role !== 'admin') {
      return bad(res, 400, 'No puedes quitarte el rol de administrador');
    }
    if (req.body.role !== row.role) roleChanged = true;
    updates.push('role = ?');
    params.push(req.body.role);
  }
  if (req.body?.active !== undefined) {
    if (req.session.user_id === id && !req.body.active) {
      return bad(res, 400, 'No puedes desactivar tu propia cuenta');
    }
    if (!req.body.active) deactivated = true;
    updates.push('active = ?');
    params.push(req.body.active ? 1 : 0);
  }
  if (req.body?.password) {
    const password = String(req.body.password);
    if (password.length < 6) return bad(res, 400, 'La contraseña debe tener al menos 6 caracteres');
    passwordChanged = true;
    updates.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 10));
  }
  if (!updates.length) return bad(res, 400, 'Nada que actualizar');

  params.push(id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  if (deactivated || passwordChanged) {
    closeUserSessions(id, { reason: deactivated ? 'deactivated' : 'password_change' });
  } else if (roleChanged) {
    closeUserSessions(id, {
      exceptToken: req.session.user_id === id ? req.session.token : undefined,
      reason: 'role_change',
    });
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json({ item: mapUser(updated) });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (req.session.user_id === id) return bad(res, 400, 'No puedes desactivar tu propia cuenta');
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!row) return bad(res, 404, 'No encontrado');
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  closeUserSessions(id, { reason: 'deactivated' });
  res.json({ ok: true });
});

export default router;
