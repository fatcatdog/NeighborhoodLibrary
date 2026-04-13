const { createClient } = require('@libsql/client');
const path = require('path');
const fs   = require('fs');

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// file: URL tells libSQL to use a local SQLite file — no server needed.
const client = createClient({
  url: `file:${path.join(DATA_DIR, 'bookmoonboard.db')}`,
});

// ── Schema ──────────────────────────────────────────────────────────────────
// executeMultiple runs several DDL statements without wrapping them in a
// single transaction (required for CREATE TABLE IF NOT EXISTS).
client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_public     INTEGER DEFAULT 0,
    latitude      REAL,
    longitude     REAL,
    bio           TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS books (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id              INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title                TEXT NOT NULL,
    author               TEXT,
    cover_url            TEXT,
    is_available         INTEGER DEFAULT 1,
    is_currently_reading INTEGER DEFAULT 0,
    added_at             TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invites (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    to_email     TEXT NOT NULL,
    token        TEXT UNIQUE NOT NULL,
    message      TEXT,
    accepted     INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  );
`)
  .then(() => client.execute('ALTER TABLE invites  ADD COLUMN message          TEXT').catch(() => {}))
  .then(() => client.execute('ALTER TABLE invites  ADD COLUMN declined         INTEGER DEFAULT 0').catch(() => {}))
  .then(() => client.execute('ALTER TABLE users    ADD COLUMN phone            TEXT').catch(() => {}))
  .then(() => client.execute('ALTER TABLE users    ADD COLUMN phone_public     INTEGER DEFAULT 0').catch(() => {}))
  .then(() => client.execute('ALTER TABLE users    ADD COLUMN telegram_username TEXT').catch(() => {}))
  .then(() => client.execute('ALTER TABLE users    ADD COLUMN telegram_public   INTEGER DEFAULT 0').catch(() => {}))
  .then(() => console.log('SQLite database ready.'))
  .catch((err) => { console.error('DB init failed:', err); process.exit(1); });

// ── Boolean auto-conversion ──────────────────────────────────────────────────
// SQLite stores booleans as 0/1 integers. Convert them so API responses
// return proper true/false values.
const BOOL_FIELDS = new Set([
  'is_public', 'is_available', 'is_currently_reading',
  'accepted', 'declined', 'phone_public', 'telegram_public',
]);

function boolify(row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of BOOL_FIELDS) {
    if (key in out) out[key] = out[key] === 1 || out[key] === true;
  }
  return out;
}

// ── PostgreSQL-compatible async query shim ───────────────────────────────────
/**
 * query(sql, params?) → Promise<{ rows }>
 *
 * Converts Postgres-style $1 $2 ... to ? for SQLite, then delegates to
 * @libsql/client. Returns { rows: [...] } just like pg's pool.query().
 */
async function query(sql, params = []) {
  const converted = sql.replace(/\$\d+/g, '?');
  const result    = await client.execute({ sql: converted, args: params });
  return { rows: Array.from(result.rows).map(boolify) };
}

module.exports = { query };
