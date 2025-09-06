import type { DBAdapter } from "../types.ts";
import { safeRequire } from "../util.ts";

type Sqlite3 = typeof import("sqlite3");
type DB = import("sqlite3").Database;

function promisifyDb(db: DB) {
  return {
    exec(sql: string) {
      return new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => (err ? reject(err) : resolve()));
      });
    },
    run(sql: string, params?: any[]) {
      return new Promise<void>((resolve, reject) => {
        if (params && params.length)
          db.run(sql, params, (err) => (err ? reject(err) : resolve()));
        else db.run(sql, (err) => (err ? reject(err) : resolve()));
      });
    },
    all<T = any>(sql: string, params?: any[]) {
      return new Promise<T[]>((resolve, reject) => {
        if (params && params.length)
          db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
        else db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
      });
    },
    begin() {
      return this.exec("BEGIN");
    },
    commit() {
      return this.exec("COMMIT");
    },
    rollback() {
      return this.exec("ROLLBACK");
    },
    close() {
      return new Promise<void>((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
    },
  } as const;
}

export function nodeSqlite3Adapter(): DBAdapter {
  let mod: Sqlite3 | undefined;
  let db: DB | undefined;
  let p: ReturnType<typeof promisifyDb> | undefined;
  return {
    id: "node-sqlite3",
    detectInstalled() {
      mod = safeRequire<Sqlite3>("sqlite3");
      return !!mod;
    },
    getPackageVersion() {
      const pkg = safeRequire<any>("sqlite3/package.json");
      return pkg?.version;
    },
    async getEngineVersion() {
      try {
        const rows = await p!.all<{ v?: unknown }>("select sqlite_version() as v");
        const first = rows?.[0];
        return first?.v ? String(first.v) : undefined;
      } catch {
        return undefined;
      }
    },
    async open(dbPath: string) {
      if (!mod) throw new Error("sqlite3 not installed");
      const Database = mod.Database;
      db = new Database(dbPath);
      p = promisifyDb(db);
    },
    async close() {
      if (p && db) await p.close();
      p = undefined;
      db = undefined;
    },
    async exec(sql: string) {
      await p!.exec(sql);
    },
    async run(sql: string, params?: any[]) {
      await p!.run(sql, params);
    },
    async all<T = any>(sql: string, params?: any[]) {
      return p!.all<T>(sql, params);
    },
    async beginTransaction() {
      await p!.begin();
    },
    async commitTransaction() {
      await p!.commit();
    },
    async rollbackTransaction() {
      await p!.rollback();
    },
  };
}
