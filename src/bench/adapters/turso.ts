import type { DBAdapter } from "../types.ts";
import { resolvePackageVersion, safeRequire } from "../util.ts";
// Turso ESM has types bundled but ts-node/esm type resolution can be flaky; keep typing light.
type TursoModule = any;

export function tursoAdapter(): DBAdapter {
  let mod: TursoModule | undefined;
  let db: any;
  return {
    id: 'turso',
    detectInstalled() {
      mod = safeRequire<TursoModule>('@tursodatabase/database');
      return !!mod;
    },
    getPackageVersion() {
      return resolvePackageVersion('@tursodatabase/database');
    },
    async getEngineVersion() {
      try {
        const row = (await db.prepare('select sqlite_version() as v').get()) as any;
        const v = row?.v ?? row?.[0];
        return v ? String(v) : undefined;
      } catch {
        return undefined;
      }
    },
    async open(dbPath: string) {
      if (!mod) throw new Error('@tursodatabase/database not installed');
      const { connect } = mod;
      // In-memory only per request
      db = await connect(':memory:');
    },
    async close() {
      await db?.close?.();
      db = undefined;
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async run(sql: string, params?: unknown[]) {
      const stmt = db.prepare(sql);
      stmt.run(...(params ?? []));
    },
    async all<T = unknown>(sql: string, params?: unknown[]) {
      const stmt = db.prepare(sql);
      const rows = stmt.all(...(params ?? [])) as T[];
      return rows ?? [];
    },
    async beginTransaction() {
      await db.exec('BEGIN');
    },
    async commitTransaction() {
      await db.exec('COMMIT');
    },
    async rollbackTransaction() {
      await db.exec('ROLLBACK');
    },
  };
}
