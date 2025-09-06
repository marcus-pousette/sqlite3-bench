import type { DBAdapter } from "../types.ts";
import { safeRequire } from "../util.ts";

type Better = typeof import("better-sqlite3");
type BetterDB = import("better-sqlite3").Database;

export function betterSqlite3Adapter(): DBAdapter {
  let mod: Better | undefined;
  let db: BetterDB | undefined;
  return {
    id: "better-sqlite3",
    detectInstalled() {
      mod = safeRequire<Better>("better-sqlite3");
      return !!mod;
    },
    getPackageVersion() {
      const pkg = safeRequire<any>("better-sqlite3/package.json");
      return pkg?.version;
    },
    async getEngineVersion() {
      try {
        const row = db!.prepare("select sqlite_version() as v").get() as { v?: unknown };
        return row?.v ? String(row.v) : undefined;
      } catch {
        return undefined;
      }
    },
    async open(dbPath: string) {
      if (!mod) throw new Error("better-sqlite3 not installed");
      db = new mod(dbPath);
    },
    async close() {
      db?.close();
      db = undefined;
    },
    async exec(sql: string) {
      db!.exec(sql);
    },
    async run(sql: string, params?: any[]) {
      if (params && params.length) db!.prepare(sql).run(params);
      else db!.prepare(sql).run();
    },
    async all<T = any>(sql: string, params?: any[]) {
      const rows = params && params.length ? db!.prepare(sql).all(params) : db!.prepare(sql).all();
      return rows as T[];
    },
    async beginTransaction() {
      db!.prepare("BEGIN").run();
    },
    async commitTransaction() {
      db!.prepare("COMMIT").run();
    },
    async rollbackTransaction() {
      db!.prepare("ROLLBACK").run();
    },
  };
}
