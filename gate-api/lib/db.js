const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "keys.db");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS keys (
    key TEXT PRIMARY KEY,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused',
    hwid TEXT,
    created_at TEXT NOT NULL,
    activated_at TEXT,
    expires_at TEXT,
    token TEXT,
    duration_days INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status);
  CREATE INDEX IF NOT EXISTS idx_keys_token ON keys(token);
`);

// Migrate older DBs missing duration_days
try {
  db.exec("ALTER TABLE keys ADD COLUMN duration_days INTEGER");
} catch (_) {
  /* already exists */
}

db.exec(`
  CREATE TABLE IF NOT EXISTS roblox_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roblox_user_id TEXT NOT NULL,
    roblox_username TEXT,
    asset_id TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    plan TEXT NOT NULL,
    key TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    UNIQUE(roblox_user_id, asset_id)
  );
  CREATE INDEX IF NOT EXISTS idx_roblox_claims_user ON roblox_claims(roblox_user_id);
  CREATE INDEX IF NOT EXISTS idx_roblox_claims_key ON roblox_claims(key);
`);

module.exports = { db, dbPath };
