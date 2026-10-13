import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import './db.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import surveyRoutes from './routes/surveys.js';
import statsRoutes from './routes/stats.js';
import settingsRoutes from './routes/settings.js';
import { loadSurveys } from './store.js';
import { requireAuth } from './middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = Number(process.env.PORT || 3001);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (TRUST_PROXY) {
  app.set('trust proxy', true);
}

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
  })
);

app.use(compression());
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

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 5 minutos.' },
});

const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/surveys/batch', batchLimiter);

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure) return next();
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
app.use('/api/admin', statsRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/admin/surveys', requireAuth('admin', 'cashier'), (req, res) => {
  res.json({ items: loadSurveys(req.query) });
});

app.use('/api/admin', adminRoutes);

const staticDir = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir, { maxAge: '1y', immutable: true }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.disable('x-powered-by');

const httpServer = http.createServer(app);
httpServer.listen(PORT, () => {
  console.log(`Servidor HTTP en puerto ${PORT}`);
});

const certDir = path.join(__dirname, '..', 'certs');
const certPath = path.join(certDir, 'cert.pem');
const keyPath = path.join(certDir, 'key.pem');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    const httpsOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    const httpsServer = https.createServer(httpsOptions, app);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`Servidor HTTPS en puerto ${HTTPS_PORT}`);
    });
  } catch (e) {
    console.warn('No se pudo iniciar HTTPS:', e);
  }
}
