import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();

const MAX_LOGO_BYTES = 600 * 1024;

function readSettings() {
  return (
    db
      .prepare('SELECT store_name, store_tagline, store_logo, updated_at FROM settings WHERE id = 1')
      .get() || {
      store_name: 'Super Nallely',
      store_tagline: 'Administración de tiendas',
      store_logo: null,
      updated_at: null,
    }
  );
}

router.get('/settings', (_req, res) => {
  res.json({ settings: readSettings() });
});

router.put('/admin/settings', requireAuth('admin'), (req, res) => {
  const current = readSettings();
  const store_name = clean(req.body?.store_name, 60) || current.store_name;
  const store_tagline = clean(req.body?.store_tagline, 80) || current.store_tagline;
  let logo = validateLogo(req.body?.store_logo);
  if (logo === 'invalid') {
    return res.status(400).json({ error: 'La imagen es demasiado grande o no es válida (máx. 600 KB)' });
  }
  if (logo === undefined) logo = current.store_logo;

  db.prepare(
    'UPDATE settings SET store_name = ?, store_tagline = ?, store_logo = ?, updated_at = ? WHERE id = 1'
  ).run(store_name, store_tagline, logo, now());

  res.json({ settings: readSettings() });
});

function clean(value, max) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

function validateLogo(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) return 'invalid';
  if (value.length > MAX_LOGO_BYTES) return 'invalid';
  return value;
}

export default router;
