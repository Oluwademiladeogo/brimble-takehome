import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import * as schema from "./schema.js";

mkdirSync(dirname(config.databaseUrl), { recursive: true });

const sqlite = new Database(config.databaseUrl);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Inline migrations — simple enough for this scope; Drizzle-kit would be the
// upgrade path once the schema moves.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    commit_sha TEXT,
    status TEXT NOT NULL,
    image_tag TEXT,
    container_id TEXT,
    host_port INTEGER,
    container_port INTEGER,
    route_path TEXT NOT NULL,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deployment_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deployment_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    stream TEXT NOT NULL,
    phase TEXT NOT NULL,
    line TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_logs_by_deployment
    ON deployment_logs (deployment_id, id);
`);

export const db = drizzle(sqlite, { schema });
export { schema };
