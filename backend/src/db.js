import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { questions } from './questions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'nallely.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const now = () => new Date().toISOString();

export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24);

export const sessionExpiresAt = () =>
  new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

db.exec(`
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cashiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Administrador',
  role TEXT NOT NULL DEFAULT 'admin',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  user_id INTEGER,
  user_name TEXT,
  branch_id INTEGER,
  branch_name TEXT,
  register_id INTEGER,
  register_name TEXT,
  cashier_id INTEGER,
  cashier_name TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  closed_at TEXT,
  close_reason TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_name TEXT NOT NULL DEFAULT 'Super Nallely',
  store_tagline TEXT NOT NULL DEFAULT 'Administración de tiendas',
  store_logo TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_uuid TEXT UNIQUE NOT NULL,
  session_id INTEGER,
  branch_id INTEGER,
  branch_name TEXT,
  register_id INTEGER,
  register_name TEXT,
  cashier_id INTEGER,
  cashier_name TEXT,
  areas TEXT NOT NULL,
  dislikes TEXT NOT NULL,
  likes TEXT NOT NULL,
  rating INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  client_ts TEXT
);

CREATE INDEX IF NOT EXISTS idx_surveys_created ON surveys(created_at);
CREATE INDEX IF NOT EXISTS idx_surveys_branch ON surveys(branch_id);
CREATE INDEX IF NOT EXISTS idx_sessions_closed ON sessions(closed_at);
`);

migrate();
seed();

function hasColumn(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

function migrate() {
  if (!hasColumn('users', 'email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }
  if (!hasColumn('users', 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  }
  if (!hasColumn('sessions', 'expires_at')) {
    db.exec('ALTER TABLE sessions ADD COLUMN expires_at TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');
  const missingExpiry = db
    .prepare('SELECT id, created_at FROM sessions WHERE expires_at IS NULL')
    .all();
  if (missingExpiry.length) {
    const updateExpiry = db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?');
    for (const row of missingExpiry) {
      const base = Date.parse(row.created_at);
      updateExpiry.run(
        Number.isFinite(base)
          ? new Date(base + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString()
          : now(),
        row.id
      );
    }
  }
  db.prepare("UPDATE users SET email = ? WHERE lower(username) = 'admin' AND (email IS NULL OR email = '')").run(
    'admin@nallely.com'
  );
  db.prepare("UPDATE users SET email = username WHERE email IS NULL OR email = ''").run();
  db.prepare("UPDATE users SET role = 'admin' WHERE role IS NULL OR role = ''").run();
}

function seed() {
  const hasSettings = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c > 0;
  if (!hasSettings) {
    db.prepare(
      'INSERT INTO settings (id, store_name, store_tagline, store_logo) VALUES (1, ?, ?, NULL)'
    ).run('Super Nallely', 'Administración de tiendas');
  }

  const admin = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1')
    .get('admin@nallely.com');
  if (!admin) {
    db.prepare(
      'INSERT INTO users (username, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    ).run(
      'admin@nallely.com',
      'admin@nallely.com',
      bcrypt.hashSync('admin123', 10),
      'Administrador',
      'admin'
    );
  }

  const cashierUser = db
    .prepare('SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1')
    .get('cajero@nallely.com');
  if (!cashierUser) {
    db.prepare(
      'INSERT INTO users (username, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    ).run(
      'cajero@nallely.com',
      'cajero@nallely.com',
      bcrypt.hashSync('cajero123', 10),
      'Cajero Demo',
      'cashier'
    );
  }

  const hasBranch = db.prepare('SELECT COUNT(*) AS c FROM branches').get().c > 0;
  if (hasBranch) return;

  const branchId = db
    .prepare('INSERT INTO branches (name) VALUES (?)')
    .run('Super Nallely').lastInsertRowid;

  const regStmt = db.prepare('INSERT INTO registers (branch_id, name) VALUES (?, ?)');
  const cashierStmt = db.prepare('INSERT INTO cashiers (branch_id, name) VALUES (?, ?)');

  const registers = ['Caja 1', 'Caja 2'].map((n) => regStmt.run(branchId, n).lastInsertRowid);
  const cashiers = ['Ana López', 'Sofía Hernández', 'Valeria Cruz'].map(
    (n) => cashierStmt.run(branchId, n).lastInsertRowid
  );

  seedDemoSurveys(branchId, registers, cashiers);
}

function seedDemoSurveys(branchId, registers, cashiers) {
  const [q1, q2, q3] = questions.questions;
  const dislikesNormal = q2.options.filter((o) => o !== 'Ninguna, todo bien');
  const insert = db.prepare(`
    INSERT INTO surveys (client_uuid, branch_id, branch_name, register_id, register_name,
      cashier_id, cashier_name, areas, dislikes, likes, rating, created_at, client_ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

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
    if (r < 0.45) return 5;
    if (r < 0.75) return 4;
    if (r < 0.88) return 3;
    if (r < 0.95) return 2;
    return 1;
  };

  const rows = [];
  for (let i = 0; i < 65; i++) {
    const branchName = db.prepare('SELECT name FROM branches WHERE id=?').get(branchId).name;
    const regId = pick(registers);
    const cashId = pick(cashiers);
    const regName = db.prepare('SELECT name FROM registers WHERE id=?').get(regId).name;
    const cashName = db.prepare('SELECT name FROM cashiers WHERE id=?').get(cashId).name;

    const areas = pickN(q1.options, Math.random() < 0.3 ? 2 : 1);
    const dislikes =
      Math.random() < 0.35 ? ['Ninguna, todo bien'] : pickN(dislikesNormal, Math.random() < 0.3 ? 2 : 1);
    const likes = pickN(q3.options, Math.random() < 0.4 ? 2 : 1);

    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * 21));
    d.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
    const ts = d.toISOString();

    rows.push(
      insert.run(
        `demo-${String(i + 1).padStart(4, '0')}`,
        branchId,
        branchName,
        regId,
        regName,
        cashId,
        cashName,
        JSON.stringify(areas),
        JSON.stringify(dislikes),
        JSON.stringify(likes),
        ratingPick(),
        ts,
        ts
      )
    );
  }
  return rows;
}
