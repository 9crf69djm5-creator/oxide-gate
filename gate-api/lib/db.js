const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
const localDbPath = path.join(dataDir, "keys.db");
const renderDiskDb = path.join("/data", "keys.db");

let db = null;
let dbPath = localDbPath;
let dbBackend = "sqlite-local";
let dbEphemeral = true;
let persistTimer = null;
let persistClient = null;
let persistDirty = false;
let persistInFlight = null;

function isDirectory(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Prefer Render persistent disk at /data when mounted.
 * Else Postgres blob on /tmp when DATABASE_URL is set (free tier).
 * Else local ./data/keys.db for development.
 */
function resolveLocalDbPath() {
  const explicit = process.env.DB_PATH ? String(process.env.DB_PATH).trim() : "";
  const dataMounted = isDirectory("/data");

  // Real disk wins — even if DATABASE_URL is also present.
  if (dataMounted) {
    if (explicit && (explicit === "/data/keys.db" || explicit.startsWith("/data/"))) {
      return explicit;
    }
    if (!explicit || explicit.startsWith("/tmp/") || explicit.includes("oxide-keys.db")) {
      return renderDiskDb;
    }
    // Explicit non-/data path while disk exists: honor explicit only if not the
    // free-tier tmp fallback.
    if (explicit && !explicit.startsWith("/tmp/")) return explicit;
    return renderDiskDb;
  }

  if (explicit) {
    // DB_PATH=/data/... but no disk mounted → free-tier fallback
    if (explicit === "/data/keys.db" || explicit.startsWith("/data/")) {
      if (process.env.DATABASE_URL) return path.join("/tmp", "oxide-keys.db");
      console.warn(
        "[db] DB_PATH points at /data but /data is not mounted; using local ./data/keys.db"
      );
      return localDbPath;
    }
    return explicit;
  }

  if (process.env.DATABASE_URL) {
    return path.join("/tmp", "oxide-keys.db");
  }
  return localDbPath;
}

function computeEphemeral(resolvedPath, backend) {
  if (backend === "postgres-blob" || backend === "render-disk") return false;
  const normalized = String(resolvedPath || "").replace(/\\/g, "/");
  return (
    normalized === "./data/keys.db" ||
    normalized.endsWith("/gate-api/data/keys.db") ||
    normalized.startsWith("/tmp/") ||
    !normalized.startsWith("/data/")
  );
}

async function openPersistClient() {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) return null;
  const { Client } = require("pg");
  const client = new Client({
    connectionString: url,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS oxide_sqlite_store (
      id TEXT PRIMARY KEY,
      data BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return client;
}

async function restoreFromPostgres(client, filePath) {
  const res = await client.query(
    "SELECT data FROM oxide_sqlite_store WHERE id = $1",
    ["keys"]
  );
  if (!res.rows.length || !res.rows[0].data) return false;
  const buf = res.rows[0].data;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  console.log(`[db] Restored SQLite blob from Postgres (${buf.length} bytes)`);
  return true;
}

async function flushToPostgres() {
  if (!persistClient || !db) return;
  if (persistInFlight) return persistInFlight;
  persistInFlight = (async () => {
    try {
      try {
        db.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        /* ignore */
      }
      // Prefer main db file; if WAL-only oddity, still read primary path.
      const buf = fs.readFileSync(dbPath);
      await persistClient.query(
        `
        INSERT INTO oxide_sqlite_store (id, data, updated_at)
        VALUES ('keys', $1, NOW())
        ON CONFLICT (id) DO UPDATE
          SET data = EXCLUDED.data, updated_at = NOW()
      `,
        [buf]
      );
      persistDirty = false;
      console.log(`[db] Persisted SQLite blob to Postgres (${buf.length} bytes)`);
    } catch (err) {
      console.error("[db] Persist failed:", err.message);
    } finally {
      persistInFlight = null;
    }
  })();
  return persistInFlight;
}

function markDirty() {
  if (!persistClient) return;
  persistDirty = true;
}

function wrapDbForPersist(database) {
  if (!persistClient) return database;
  const origExec = database.exec.bind(database);
  const origPrepare = database.prepare.bind(database);
  const origPragma = database.pragma.bind(database);
  const origTransaction = database.transaction.bind(database);

  database.exec = (...args) => {
    const r = origExec(...args);
    markDirty();
    return r;
  };
  database.pragma = (...args) => origPragma(...args);
  database.prepare = (sql) => {
    const stmt = origPrepare(sql);
    const origRun = stmt.run.bind(stmt);
    const origGet = stmt.get.bind(stmt);
    const origAll = stmt.all.bind(stmt);
    stmt.run = (...args) => {
      const r = origRun(...args);
      markDirty();
      return r;
    };
    stmt.get = (...args) => origGet(...args);
    stmt.all = (...args) => origAll(...args);
    return stmt;
  };
  database.transaction = (fn) => {
    const tx = origTransaction(fn);
    return (...args) => {
      const r = tx(...args);
      markDirty();
      return r;
    };
  };
  return database;
}

/**
 * Open SQLite. When DATABASE_URL is set (Render free Postgres), restore/save
 * the DB file as a BYTEA blob so keys survive redeploys without a paid disk.
 */
async function initDb() {
  if (db) return { db, dbPath, dbBackend, dbEphemeral };

  dbPath = resolveLocalDbPath();
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  if (process.env.DATABASE_URL) {
    try {
      persistClient = await openPersistClient();
      await restoreFromPostgres(persistClient, dbPath);
      dbBackend = "postgres-blob";
    } catch (err) {
      console.error("[db] DATABASE_URL persist unavailable:", err.message);
      persistClient = null;
      dbBackend = "sqlite-local";
    }
  } else if (String(dbPath).replace(/\\/g, "/").startsWith("/data/")) {
    dbBackend = "render-disk";
  } else {
    dbBackend = "sqlite-local";
  }

  dbEphemeral = computeEphemeral(dbPath, dbBackend);

  let database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database = wrapDbForPersist(database);
  db = database;

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
      duration_days INTEGER,
      discord_user_id TEXT,
      roblox_user_id TEXT,
      roblox_username TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status);
    CREATE INDEX IF NOT EXISTS idx_keys_token ON keys(token);
  `);

  try {
    db.exec("ALTER TABLE keys ADD COLUMN duration_days INTEGER");
  } catch (_) {
    /* already exists */
  }

  try {
    db.exec("ALTER TABLE keys ADD COLUMN discord_user_id TEXT");
  } catch (_) {
    /* already exists */
  }

  try {
    db.exec("ALTER TABLE keys ADD COLUMN roblox_user_id TEXT");
  } catch (_) {
    /* already exists */
  }

  try {
    db.exec("ALTER TABLE keys ADD COLUMN roblox_username TEXT");
  } catch (_) {
    /* already exists */
  }

  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_keys_discord_user ON keys(discord_user_id)"
    );
  } catch (_) {
    /* ignore */
  }

  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_keys_roblox_user ON keys(roblox_user_id)"
    );
  } catch (_) {
    /* ignore */
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS discord_roblox_links (
      discord_user_id TEXT PRIMARY KEY,
      roblox_user_id TEXT NOT NULL,
      roblox_username TEXT NOT NULL,
      linked_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discord_roblox_roblox
      ON discord_roblox_links(roblox_user_id);
  `);

  if (persistClient) {
    // Initial snapshot if store was empty
    await flushToPostgres();
    persistTimer = setInterval(() => {
      if (persistDirty) flushToPostgres().catch(() => {});
    }, 15000);
    if (persistTimer.unref) persistTimer.unref();

    const shutdown = () => {
      flushToPostgres()
        .catch(() => {})
        .finally(() => {
          try {
            if (persistClient) persistClient.end();
          } catch {
            /* ignore */
          }
        });
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  }

  return { db, dbPath, dbBackend, dbEphemeral };
}

function getDb() {
  if (!db) throw new Error("Database not initialized — call initDb() first");
  return db;
}

module.exports = {
  initDb,
  flushToPostgres,
  get db() {
    return getDb();
  },
  get dbPath() {
    return dbPath;
  },
  get dbBackend() {
    return dbBackend;
  },
  get dbEphemeral() {
    return dbEphemeral;
  },
};
