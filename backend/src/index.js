import './env.js';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { CLOUD, ensureSeed } from './db.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import surveyRoutes from './routes/surveys.js';
import statsRoutes from './routes/stats.js';
import settingsRoutes from './routes/settings.js';
import tunnelRoutes, { bootTunnelConfig } from './routes/tunnel.js';
import { startTunnel, stopTunnel } from './tunnel.js';
import { ensureCertificates, localHttps } from './certs.js';
import backupRoutes from './routes/backup.js';
import { scheduleBackups } from './backup.js';
import { loadSurveys } from './store.js';
import { requirePermission } from './middleware.js';
import roleRoutes from './routes/roles.js';
import securityRoutes from './routes/security.js';
import notificationRoutes from './routes/notifications.js';
import { clientIp, originGuard } from './security.js';
import { accessGate } from './accessGate.js';

await ensureSeed();
// En la nube (Turso) no hay respaldos en carpeta local: Turso guarda su propio historial.
if (!CLOUD) scheduleBackups();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = Number(process.env.PORT || 3001);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Detrás de un proxy HTTPS (TRUST_PROXY=true) se confía en sus encabezados. Si no, solo se
// confía en los que llegan desde esta misma computadora: es el túnel de Cloudflare, que
// envía la IP real del visitante (necesaria para el límite de intentos de inicio de sesión)
// y que la conexión original fue https.
app.set('trust proxy', TRUST_PROXY ? true : 'loopback');

// Antes que todo: con CF_ORIGIN_SECRET solo pasa el tráfico que viene de Cloudflare
// (y de los países de ALLOWED_COUNTRIES). Ver security.js.
app.use(originGuard);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // SuperShop se sirve por http y https a la vez en la red local; HSTS forzaría https
    // también en http://localhost:3001 (la ventana de escritorio). En una instalación web
    // el proxy HTTPS es quien debe enviar HSTS.
    strictTransportSecurity: false,
  })
);

app.use(compression());
// Sin el enlace privado (si está activo) solo se ve la página informativa. Ver accessGate.js.
app.use(accessGate);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

const corsOptions = ALLOWED_ORIGINS.length
  ? {
      origin: (origin, cb) =>
        !origin || ALLOWED_ORIGINS.includes(origin) ? cb(null, true) : cb(null, false),
    }
  : process.env.NODE_ENV === 'production'
    ? { origin: false }
    : { origin: true };

if (process.env.NODE_ENV === 'production' && !ALLOWED_ORIGINS.length) {
  console.warn(
    'ALLOWED_ORIGINS no está configurado; solo se permitirán solicitudes del mismo origen.'
  );
}

app.use(cors(corsOptions));

// Detrás de Cloudflare la IP real viene en CF-Connecting-IP.
const limiterKey = (req) => ipKeyGenerator(clientIp(req));

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: limiterKey,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 5 minutos.' },
});

const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: limiterKey,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/surveys/batch', batchLimiter);

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // /api/health: la revisión interna del hosting llega por http y no debe redirigirse.
    if (req.secure || req.path === '/api/health') return next();
    const host = req.headers.host;
    if (!host) return next();
    const redirectHost = host.replace(String(PORT), String(HTTPS_PORT));
    res.redirect(301, `https://${redirectHost}${req.url}`);
  });
}

app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', settingsRoutes);
app.use('/api', surveyRoutes);
app.use('/api', tunnelRoutes);
// Respaldos en carpeta, Google Drive e importación: solo en la app de escritorio.
if (!CLOUD) app.use('/api', backupRoutes);
app.use('/api/admin', statsRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/admin/surveys', requirePermission('surveys.responses', 'surveys.export'), (req, res) => {
  res.json({ items: loadSurveys(req.query) });
});

app.use('/api/admin', roleRoutes);
app.use('/api/admin', securityRoutes);
app.use('/api', notificationRoutes);
app.use('/api/admin', adminRoutes);

const staticDir = process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(staticDir)) {
  const NO_CACHE = new Set(['index.html', 'sw.js', 'manifest.webmanifest', 'registerSW.js']);
  app.use(
    express.static(staticDir, {
      setHeaders(res, filePath) {
        const base = path.basename(filePath);
        if (NO_CACHE.has(base)) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.disable('x-powered-by');

const httpServer = http.createServer(app);
httpServer.listen(PORT, () => {
  console.log(`Servidor HTTP en puerto ${PORT}`);
  const tunnelConfig = CLOUD ? null : bootTunnelConfig();
  if (tunnelConfig) startTunnel(PORT, tunnelConfig);
});

import { stopSchedule } from './backup.js';

function shutdown() {
  stopTunnel();
  stopSchedule();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => stopTunnel());

// HTTPS en la red local con certificados propios (ver certs.js). Se desactiva con LOCAL_HTTPS=false.
if (!CLOUD && process.env.LOCAL_HTTPS !== 'false') {
  try {
    const { key, cert } = ensureCertificates();
    const httpsServer = https.createServer({ key, cert }, app);
    httpsServer.on('error', (e) => console.warn('[HTTPS] No se pudo iniciar:', e.message));
    httpsServer.listen(HTTPS_PORT, () => {
      localHttps.enabled = true;
      localHttps.port = HTTPS_PORT;
      console.log(`Servidor HTTPS en puerto ${HTTPS_PORT}`);
    });
    // Si cambia la IP de la red local, se renueva el certificado sin reiniciar.
    setInterval(() => {
      try {
        const next = ensureCertificates();
        if (next.changed) httpsServer.setSecureContext({ key: next.key, cert: next.cert });
      } catch (e) {
        console.warn('[HTTPS] No se pudo renovar el certificado:', e.message);
      }
    }, 10 * 60 * 1000).unref();
  } catch (e) {
    console.warn('[HTTPS] No se pudieron preparar los certificados:', e.message);
  }
}
