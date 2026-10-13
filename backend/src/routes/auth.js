import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, now, sessionExpiresAt } from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Ingresa tu correo y contraseña' });
  }
  const user = db
    .prepare('SELECT * FROM users WHERE (lower(email) = lower(?) OR lower(username) = lower(?)) AND active = 1')
    .get(String(email).trim(), String(email).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = sessionExpiresAt();
  db.prepare(
    'INSERT INTO sessions (token, role, user_id, user_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(token, user.role, user.id, user.name, now(), expiresAt);
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

export default router;
