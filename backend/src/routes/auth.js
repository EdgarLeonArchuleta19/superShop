import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, now, sessionExpiresAt } from '../db.js';
import { requireAuth, getUserAccess } from '../middleware.js';
import { passwordProblem } from '../passwords.js';
import { clearLoginFailures, clientIp, logLogin, loginLockRemaining, recordLoginFailure } from '../security.js';

const router = Router();

const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

function publicUser(row) {
  return { id: row.id, username: row.username, name: row.name, role: row.role, ...getUserAccess(row.id) };
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Ingresa tu usuario y contraseña' });
  }
  const identifier = String(username).trim();
  const ip = clientIp(req);

  const lockedMs = loginLockRemaining(identifier, ip);
  if (lockedMs > 0) {
    const minutes = Math.ceil(lockedMs / 60000);
    logLogin(req, { username: identifier, success: false, reason: 'bloqueado' });
    res.setHeader('Retry-After', String(Math.ceil(lockedMs / 1000)));
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
    });
  }

  const user = db
    .prepare(
      'SELECT * FROM users WHERE active = 1 AND username = ? COLLATE NOCASE'
    )
    .get(identifier);
  // Si el usuario no existe se compara igual contra un hash de relleno: así la respuesta
  // tarda lo mismo y no revela qué usuarios existen.
  const valid = bcrypt.compareSync(String(password), user?.password_hash ?? DUMMY_HASH) && !!user;
  if (!valid) {
    recordLoginFailure(identifier, ip);
    logLogin(req, { username: identifier, userId: user?.id ?? null, success: false, reason: user ? 'contraseña' : 'usuario' });
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  clearLoginFailures(identifier, ip);
  logLogin(req, { username: user.username, userId: user.id, success: true, reason: 'ok' });
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = sessionExpiresAt();
  db.prepare(
    'INSERT INTO sessions (token, role, user_id, user_name, created_at, expires_at, ip, user_agent, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    token,
    user.role,
    user.id,
    user.name,
    now(),
    expiresAt,
    ip || null,
    String(req.headers['user-agent'] || '').slice(0, 300) || null,
    now()
  );
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
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user_id);
  if (!user || !bcrypt.compareSync(String(current_password), user.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }
  const problem = passwordProblem(new_password, user.username);
  if (problem) return res.status(400).json({ error: problem });
  const hash = await bcrypt.hash(String(new_password), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  db.prepare('UPDATE sessions SET closed_at = ? WHERE user_id = ? AND closed_at IS NULL').run(now(), user.id);
  res.json({ ok: true, message: 'Contraseña actualizada. Inicia sesión de nuevo.' });
});

export default router;
