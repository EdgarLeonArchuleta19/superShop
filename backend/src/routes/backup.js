import { Router } from 'express';
import { requirePermission } from '../middleware.js';
import {
  BackupError,
  MAX_IMPORT_BYTES,
  deleteLocalBackup,
  disconnectDrive,
  getAuthUrl,
  getPublicSettings,
  handleOAuthCallback,
  listLocalBackups,
  resolveLocalBackup,
  restoreFromZipBuffer,
  restoreLocalBackup,
  runBackup,
  updateSettings,
} from '../backup.js';

const router = Router();
const canBackup = requirePermission('settings.backups');

const requestOrigin = (req) => `${req.protocol}://${req.get('host')}`;

function fail(res, e) {
  if (e instanceof BackupError) return res.status(e.status).json({ error: e.message });
  console.error('[Backup]', e);
  return res.status(500).json({ error: 'Ocurrió un error inesperado con los respaldos.' });
}

router.get('/admin/backup/settings', canBackup, (_req, res) => {
  res.json(getPublicSettings());
});

router.put('/admin/backup/settings', canBackup, (req, res) => {
  try {
    res.json(updateSettings(req.body || {}));
  } catch (e) {
    fail(res, e);
  }
});

router.post('/admin/backup/run', canBackup, async (req, res) => {
  const target = req.body?.target === 'drive' ? 'drive' : 'local';
  try {
    const result = await runBackup(target);
    res.json({ result, settings: getPublicSettings() });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/admin/backup/files', canBackup, (_req, res) => {
  try {
    res.json({ items: listLocalBackups() });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/admin/backup/files/:name', canBackup, (req, res) => {
  try {
    res.download(resolveLocalBackup(req.params.name), req.params.name);
  } catch (e) {
    fail(res, e);
  }
});

router.delete('/admin/backup/files/:name', canBackup, (req, res) => {
  try {
    deleteLocalBackup(req.params.name);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/admin/backup/files/:name/restore', canBackup, async (req, res) => {
  try {
    res.json({ result: await restoreLocalBackup(req.params.name) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/admin/backup/import', canBackup, async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_IMPORT_BYTES) throw new BackupError('El archivo es demasiado grande.', 413);
      chunks.push(chunk);
    }
    res.json({ result: await restoreFromZipBuffer(Buffer.concat(chunks)) });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/admin/backup/auth-url', canBackup, async (req, res) => {
  try {
    res.json({ authUrl: await getAuthUrl(requestOrigin(req)) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/admin/backup/drive/disconnect', canBackup, async (_req, res) => {
  try {
    await disconnectDrive();
    res.json(getPublicSettings());
  } catch (e) {
    fail(res, e);
  }
});

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function resultPage(ok, title, message) {
  const color = ok ? '#059669' : '#dc2626';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f7;font-family:system-ui,sans-serif;color:#1d1d1f">
<main style="max-width:420px;margin:16px;padding:32px;background:#fff;border-radius:24px;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:center">
<h1 style="font-size:20px;color:${color};margin:0 0 8px">${escapeHtml(title)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0;color:#555">${escapeHtml(message)}</p>
</main></body></html>`;
}

// Regreso de Google. No lleva sesión (lo abre Google), pero solo acepta un `state`
// emitido por /auth-url a un usuario con permiso de respaldos.
router.get('/admin/backup/oauth2callback', async (req, res) => {
  if (req.query.error) {
    return res
      .status(400)
      .send(resultPage(false, 'No se conectó Google Drive', 'Cancelaste la autorización o Google la rechazó. Puedes cerrar esta ventana e intentarlo de nuevo.'));
  }
  try {
    await handleOAuthCallback(req.query.code, req.query.state);
    res.send(resultPage(true, 'Google Drive conectado', 'Listo. Ya puedes cerrar esta ventana y volver a SuperShop.'));
  } catch (e) {
    if (!(e instanceof BackupError)) console.error('[Backup] Error en OAuth:', e);
    const message =
      e instanceof BackupError ? e.message : 'No se pudo completar la conexión con Google Drive. Inténtalo de nuevo.';
    res.status(400).send(resultPage(false, 'No se conectó Google Drive', message));
  }
});

export default router;
