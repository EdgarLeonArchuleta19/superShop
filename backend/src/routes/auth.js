import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, now, sessionExpiresAt } from '../db.js';
import { requireAuth, getUserAccess } from '../middleware.js';

const router = Router();

function publicUser(row) {
  return { id: row.id, username: row.username, name: row.name, role: row.role, ...getUserAccess(row.id) };
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Ingresa tu usuario y contraseña' });
  }
  const identifier = String(username).trim();
  const user = db
    .prepare(
      'SELECT * FROM users WHERE active = 1 AND username = ? COLLATE NOCASE'
    )
    .get(identifier);
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = sessionExpiresAt();
  db.prepare(
    'INSERT INTO sessions (token, role, user_id, user_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(token, user.role, user.id, user.name, now(), expiresAt);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), user.id);
  res.json({ token, user: publicUser(user), expires_at: expiresAt });
});

router.get('/me', requireAuth(), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user_id);
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
  res.json({ user: publicUser(user) });
});

router.post('/logout', requireAuth(), (req, res) => {
  db.prepare('UPDATE sessions SET closed_at = ? WHERE token = ? AND closed_at IS NULL').run(
    now(),
    req.session.token
  );
  res.json({ ok: true });
});

router.put('/password', requireAuth(), async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user_id);
  if (!user || !bcrypt.compareSync(String(current_password), user.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }
  const hash = await bcrypt.hash(String(new_password), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  db.prepare('UPDATE sessions SET closed_at = ? WHERE user_id = ? AND closed_at IS NULL').run(now(), user.id);
  res.json({ ok: true, message: 'Contraseña actualizada. Inicia sesión de nuevo.' });
});

export default router;
