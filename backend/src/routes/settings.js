import { Router } from 'express';
import { CLOUD, db, now } from '../db.js';
import { requirePermission } from '../middleware.js';

const router = Router();

const MAX_LOGO_BYTES = 600 * 1024;

function readSettings() {
  return (
    db
      .prepare('SELECT store_name, store_logo, updated_at FROM settings WHERE id = 1')
      .get() || {
      store_name: 'SuperShop',
      store_logo: null,
      updated_at: null,
    }
  );
}

router.get('/settings', (_req, res) => {
  // `cloud`: versión web (Turso); el frontend oculta lo que solo existe en escritorio.
  res.json({ settings: { ...readSettings(), cloud: CLOUD } });
});

router.put('/admin/settings', requirePermission('settings.info'), (req, res) => {
  const current = readSettings();
  const store_name = clean(req.body?.store_name, 60) || current.store_name;
  let logo = validateLogo(req.body?.store_logo);
  if (logo === 'invalid') {
    return res.status(400).json({ error: 'La imagen es demasiado grande o no es válida (máx. 600 KB)' });
  }
  if (logo === undefined) logo = current.store_logo;

  db.prepare(
    'UPDATE settings SET store_name = ?, store_logo = ?, updated_at = ? WHERE id = 1'
  ).run(store_name, logo, now());

  res.json({ settings: { ...readSettings(), cloud: CLOUD } });
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