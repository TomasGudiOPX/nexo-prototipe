import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.NEXO_DATA_DIR || "./data", "nexo.sqlite");

export function openDatabase() {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  const migrated = db.prepare("SELECT 1 FROM schema_migrations WHERE version=1").get();
  if (!migrated) {
    db.exec("BEGIN IMMEDIATE;");
    try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('site-admin', 'user')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      transport TEXT NOT NULL,
      encrypted_auth TEXT,
      status TEXT NOT NULL DEFAULT 'unverified',
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS mcp_tools (
      server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
      PRIMARY KEY (server_id, tool_name)
    );
    CREATE TABLE IF NOT EXISTS data_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      connector_type TEXT NOT NULL,
      dataset_id TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      encrypted_credentials TEXT,
      capability_status TEXT NOT NULL DEFAULT 'unsupported',
      sync_status TEXT NOT NULL DEFAULT 'idle',
      last_message TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
    db.prepare("INSERT INTO schema_migrations(version) VALUES (1)").run();
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      db.close();
      throw error;
    }
  }
  const settingsMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE version=2").get();
  if (!settingsMigration) {
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS site_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          ragflow_base_url TEXT,
          encrypted_ragflow_api_key TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.prepare("INSERT INTO schema_migrations(version) VALUES (2)").run();
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      db.close();
      throw error;
    }
  }
  const productionSiteMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE version=3").get();
  if (!productionSiteMigration) {
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS workspace_members (
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (workspace_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS workspace_members_user_id ON workspace_members(user_id);
        CREATE TABLE IF NOT EXISTS workspace_datasets (
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          dataset_id TEXT NOT NULL,
          dataset_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (workspace_id, dataset_id)
        );
        CREATE TABLE IF NOT EXISTS workspace_assistants (
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          assistant_id TEXT NOT NULL,
          assistant_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (workspace_id, assistant_id)
        );
        CREATE TABLE IF NOT EXISTS activity_events (
          id TEXT PRIMARY KEY,
          workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
          actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          event_type TEXT NOT NULL,
          summary TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS activity_events_created_at ON activity_events(created_at DESC);
      `);
      db.prepare("INSERT INTO schema_migrations(version) VALUES (3)").run();
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      db.close();
      throw error;
    }
  }
  // RAGFlow's chat list is tenant-scoped and NEXO talks to it with a single
  // service key, so the author of an assistant can only be recorded here.
  const assistantOwnerMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE version=4").get();
  if (!assistantOwnerMigration) {
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS assistant_owners (
          assistant_id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS assistant_owners_owner_id ON assistant_owners(owner_id);
      `);
      db.prepare("INSERT INTO schema_migrations(version) VALUES (4)").run();
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      db.close();
      throw error;
    }
  }
  // A recorded author keeps the assistant private until they share it with
  // workspace members; assistants with no recorded author stay shared.
  const assistantShareMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE version=5").get();
  if (!assistantShareMigration) {
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS assistant_shares (
          assistant_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (assistant_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS assistant_shares_user_id ON assistant_shares(user_id);
      `);
      db.prepare("INSERT INTO schema_migrations(version) VALUES (5)").run();
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      db.close();
      throw error;
    }
  }
  // Roles grew past site-admin/user and accounts carry an organisational area.
  // SQLite cannot drop a CHECK constraint, so the table is rebuilt following the
  // documented procedure: foreign keys off, new table, copy, drop, rename.
  const rolesMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE version=6").get();
  if (!rolesMigration) {
    db.exec("PRAGMA foreign_keys=OFF;");
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.exec(`
        CREATE TABLE users_rebuilt (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL COLLATE NOCASE UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('site-admin', 'knowledge-manager', 'user', 'auditor')),
          area TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_rebuilt(id,email,display_name,password_hash,role,area,active,created_at,updated_at)
          SELECT id,email,display_name,password_hash,role,'',active,created_at,updated_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_rebuilt RENAME TO users;
      `);
      db.prepare("INSERT INTO schema_migrations(version) VALUES (6)").run();
      db.exec("COMMIT;");
      const violations = db.prepare("PRAGMA foreign_key_check").all();
      if (violations.length) throw new Error("The users rebuild left foreign key violations.");
    } catch (error) {
      db.exec("ROLLBACK;");
      db.close();
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys=ON;");
    }
  }
  return db;
}

export function withDatabase<T>(operation: (db: DatabaseSync) => T): T {
  const db = openDatabase();
  try { return operation(db); } finally { db.close(); }
}
