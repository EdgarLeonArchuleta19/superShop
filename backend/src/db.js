import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questions } from './questions.js';
import { DEFAULT_CASHIER_PERMISSIONS } from './permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.PORTABLE_DATA_DIR) return process.env.PORTABLE_DATA_DIR;
  const appData = process.env.APPDATA;
  if (appData) return path.join(appData, 'SuperShop', 'data');
  return path.join(__dirname, '..', 'data');
}

export const DATA_DIR = resolveDataDir();
export const DB_PATH = path.join(DATA_DIR, 'nallely.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Modo nube (versión web en Render): la base vive en Turso (SQLite en la nube) y se
 * activa con TURSO_DATABASE_URL. Se usa una réplica local que lee rápido y envía las
 * escrituras a Turso. En la app de escritorio sigue siendo un archivo SQLite local.
 * Para probar el modo nube sin Turso: TURSO_DATABASE_URL=file:local
 */
export const CLOUD = !!process.env.TURSO_DATABASE_URL;

function openDatabase() {
  if (!CLOUD) return import('better-sqlite3').then(({ default: Database }) => new Database(DB_PATH));
  return import('libsql').then(({ default: Database }) => {
    const url = process.env.TURSO_DATABASE_URL;
    const replica = path.join(DATA_DIR, 'turso-replica.db');
    if (url.startsWith('file:')) return new Database(replica);
    return new Database(replica, { syncUrl: url, authToken: process.env.TURSO_AUTH_TOKEN });
  });
}

export const db = await openDatabase();
if (CLOUD && typeof db.sync === 'function' && !process.env.TURSO_DATABASE_URL.startsWith('file:')) {
  db.sync();
  // Otra instancia o una restauración en Turso pudo cambiar datos: se trae lo nuevo cada minuto.
  setInterval(() => {
    try {
      db.sync();
    } catch (e) {
      console.warn('[Turso] No se pudo sincronizar:', e.message);
    }
  }, 60 * 1000).unref();
} else if (!CLOUD) {
  db.pragma('journal_mode = WAL');
}
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export const now = () => new Date().toISOString();

export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24);

export const sessionExpiresAt = () =>
  new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

export function ensureSeed() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_name TEXT NOT NULL DEFAULT 'SuperShop',
      store_tagline TEXT DEFAULT 'Administración de tiendas',
      store_logo TEXT,
      updated_at TEXT,
      backup_enabled INTEGER NOT NULL DEFAULT 1,
      backup_frequency TEXT DEFAULT 'weekly',
      backup_google_drive_enabled INTEGER NOT NULL DEFAULT 0,
      backup_google_drive_tokens TEXT,
      backup_google_drive_folder_id TEXT,
      backup_last_run TEXT,
      backup_next_run TEXT,
      backup_local_enabled INTEGER NOT NULL DEFAULT 1,
      backup_local_path TEXT
    );

    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS registers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_registers_branch ON registers(branch_id);

    CREATE TABLE IF NOT EXISTS cashiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cashiers_branch ON cashiers(branch_id);

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      description TEXT,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_system INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','cashier')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      last_login_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','cashier')),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_closed ON sessions(closed_at);

    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_uuid TEXT UNIQUE NOT NULL,
      branch_id INTEGER REFERENCES branches(id),
      branch_name TEXT,
      register_id INTEGER REFERENCES registers(id),
      register_name TEXT,
      cashier_id INTEGER REFERENCES cashiers(id),
      cashier_name TEXT,
      areas TEXT NOT NULL,
      dislikes TEXT NOT NULL,
      likes TEXT NOT NULL,
      rating TEXT NOT NULL,
      created_at TEXT NOT NULL,
      client_ts TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_surveys_created_at ON surveys(created_at);
    CREATE INDEX IF NOT EXISTS idx_surveys_branch ON surveys(branch_id);
    CREATE INDEX IF NOT EXISTS idx_surveys_register ON surveys(register_id);
    CREATE INDEX IF NOT EXISTS idx_surveys_cashier ON surveys(cashier_id);
    CREATE INDEX IF NOT EXISTS idx_surveys_rating ON surveys(rating);
  `);

  const backupColumns = [
    { name: 'backup_enabled', type: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'backup_frequency', type: "TEXT DEFAULT 'weekly'" },
    { name: 'backup_google_drive_enabled', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'backup_google_drive_tokens', type: 'TEXT' },
    { name: 'backup_google_drive_folder_id', type: 'TEXT' },
    { name: 'backup_last_run', type: 'TEXT' },
    { name: 'backup_next_run', type: 'TEXT' },
    { name: 'backup_local_enabled', type: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'backup_local_path', type: 'TEXT' },
    { name: 'backup_local_auto_enabled', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'backup_local_auto_frequency', type: "TEXT DEFAULT 'weekly'" },
    { name: 'backup_drive_auto_enabled', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'backup_drive_auto_frequency', type: "TEXT DEFAULT 'weekly'" },
    // Configuración y estado actuales de respaldos (JSON, ver backup.js). Las columnas
    // backup_* anteriores quedan solo para migrar instalaciones existentes.
    { name: 'backup_config', type: 'TEXT' },
    { name: 'backup_status', type: 'TEXT' },
    { name: 'backup_drive_email', type: 'TEXT' },
    // Vincular dispositivos: iniciar el túnel de Cloudflare al arrancar.
    { name: 'tunnel_autostart', type: 'INTEGER NOT NULL DEFAULT 0' },
    // Túnel fijo (dominio propio): 'quick' | 'fixed', token de Cloudflare y dirección pública.
    { name: 'tunnel_mode', type: "TEXT DEFAULT 'quick'" },
    { name: 'tunnel_token', type: 'TEXT' },
    { name: 'tunnel_hostname', type: 'TEXT' },
  ];
  for (const col of backupColumns) {
    try {
      db.prepare(`ALTER TABLE settings ADD COLUMN ${col.name} ${col.type}`).run();
    } catch (e) {
      if (!String(e.message).includes('duplicate column')) throw e;
    }
  }

  const settings = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settings) {
    db.prepare(
      `INSERT INTO settings (id, store_name, store_tagline, store_logo, updated_at,
        backup_enabled, backup_frequency, backup_google_drive_enabled, backup_local_enabled)
       VALUES (1, ?, ?, ?, ?, 1, 'weekly', 0, 1)`
    ).run('SuperShop', 'Administración de tiendas', null, now());
  }

  // Usuarios iniciales: solo en la primera instalación (sin ningún usuario). Antes se
  // recreaban si se renombraban, y volvía a aparecer la contraseña de fábrica.
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) seedUsers();

  seedRoles();

  // Datos de ejemplo solo en escritorio; en la nube la tienda empieza vacía.
  const branchCount = db.prepare('SELECT COUNT(*) AS c FROM branches').get().c;
  if (branchCount === 0 && !CLOUD) {
    seedDemoData();
  }
}

function seedUsers() {
  const insert = db.prepare(
    'INSERT INTO users (username, email, password_hash, name, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  );
  if (CLOUD) {
    // En internet no puede existir una contraseña conocida: la del primer administrador
    // se define en INITIAL_ADMIN_PASSWORD (o se genera una y se muestra una sola vez en el log).
    let password = process.env.INITIAL_ADMIN_PASSWORD || '';
    if (password.length < 8) {
      password = crypto.randomBytes(9).toString('base64url');
      console.warn(`[Inicio] Usuario "admin" creado con contraseña temporal: ${password}  (cámbiala al entrar)`);
    }
    insert.run('admin', 'admin@supershop.local', bcrypt.hashSync(password, 10), 'Administrador', 'admin', now());
    return;
  }
  insert.run('admin', 'admin@supershop.local', bcrypt.hashSync('admin123', 10), 'Administrador', 'admin', now());
  insert.run('cajero', 'cajero@supershop.local', bcrypt.hashSync('cajero123', 10), 'Cajero', 'cashier', now());
}

// Roles de sistema y migración de users.role ('admin' | 'cashier') a users.role_id.
// users.role se conserva como "nivel": 'admin' solo para el rol Administrador,
// 'cashier' para cualquier otro rol.
export function seedRoles() {
  try {
    db.prepare('ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)').run();
  } catch (e) {
    if (!String(e.message).includes('duplicate column')) throw e;
  }

  let adminRole = db.prepare('SELECT id FROM roles WHERE is_admin = 1 AND is_system = 1').get();
  if (!adminRole) {
    const id = db
      .prepare(
        "INSERT INTO roles (name, description, permissions, is_system, is_admin, created_at) VALUES ('Administrador', 'Acceso total al sistema', '[]', 1, 1, ?)"
      )
      .run(now()).lastInsertRowid;
    adminRole = { id };
  }

  let cashierRole = db.prepare('SELECT id FROM roles WHERE is_system = 1 AND is_admin = 0').get();
  if (!cashierRole) {
    const id = db
      .prepare(
        "INSERT INTO roles (name, description, permissions, is_system, is_admin, created_at) VALUES ('Cajero(a)', 'Personal de caja', ?, 1, 0, ?)"
      )
      .run(JSON.stringify(DEFAULT_CASHIER_PERMISSIONS), now()).lastInsertRowid;
    cashierRole = { id };
  }

  db.prepare("UPDATE users SET role_id = ? WHERE role_id IS NULL AND role = 'admin'").run(adminRole.id);
  db.prepare('UPDATE users SET role_id = ? WHERE role_id IS NULL').run(cashierRole.id);
}

function seedDemoData() {
  const branchId = db
    .prepare("INSERT INTO branches (name, active, created_at) VALUES ('Mi Tienda', 1, ?)")
    .run(now()).lastInsertRowid;

  const r1 = db
    .prepare("INSERT INTO registers (branch_id, name, active, created_at) VALUES (?, 'Caja 1', 1, ?)")
    .run(branchId, now()).lastInsertRowid;
  const r2 = db
    .prepare("INSERT INTO registers (branch_id, name, active, created_at) VALUES (?, 'Caja 2', 1, ?)")
    .run(branchId, now()).lastInsertRowid;

  const c1 = db
    .prepare("INSERT INTO cashiers (branch_id, name, active, created_at) VALUES (?, 'Ana López', 1, ?)")
    .run(branchId, now()).lastInsertRowid;
  const c2 = db
    .prepare("INSERT INTO cashiers (branch_id, name, active, created_at) VALUES (?, 'Sofía Hernández', 1, ?)")
    .run(branchId, now()).lastInsertRowid;
  const c3 = db
    .prepare("INSERT INTO cashiers (branch_id, name, active, created_at) VALUES (?, 'Valeria Cruz', 1, ?)")
    .run(branchId, now()).lastInsertRowid;

  seedDemoSurveys(branchId, { 'Caja 1': r1, 'Caja 2': r2 }, [
    { id: c1, name: 'Ana López' },
    { id: c2, name: 'Sofía Hernández' },
    { id: c3, name: 'Valeria Cruz' },
  ]);
}

function seedDemoSurveys(branchId, regMap, cashiers) {
  const [q1, q2, q3] = questions.questions;
  const dislikesNormal = q2.options.filter((o) => o !== 'Ninguna, todo bien');
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pickN = (arr, n) => {
    const copy = [...arr];
    const out = [];
    while (out.length < n && copy.length) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
  };
  const ratingPick = () => {
    const r = Math.random();
    if (r < 0.65) return 'good';
    if (r < 0.88) return 'regular';
    return 'bad';
  };
  const insert = db.prepare(
    'INSERT OR IGNORE INTO surveys (client_uuid, branch_id, branch_name, register_id, register_name, cashier_id, cashier_name, areas, dislikes, likes, rating, created_at, client_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const txn = db.transaction(() => {
    for (let i = 0; i < 65; i++) {
      const regName = pick(['Caja 1', 'Caja 2']);
      const regId = regMap[regName];
      const cashier = pick(cashiers);
      const areas = pickN(q1.options, Math.random() < 0.3 ? 2 : 1);
      const dislikes =
        Math.random() < 0.35
          ? ['Ninguna, todo bien']
          : pickN(dislikesNormal, Math.random() < 0.3 ? 2 : 1);
      const likes = pickN(q3.options, Math.random() < 0.4 ? 2 : 1);
      const d = new Date();
      d.setDate(d.getDate() - Math.floor(Math.random() * 21));
      d.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
      const ts = d.toISOString();
      insert.run(
        `demo-${String(i + 1).padStart(4, '0')}`,
        branchId,
        'Mi Tienda',
        regId,
        regName,
        cashier.id,
        cashier.name,
        JSON.stringify(areas),
        JSON.stringify(dislikes),
        JSON.stringify(likes),
        ratingPick(),
        ts,
        ts
      );
    }
  });
  txn();
}
