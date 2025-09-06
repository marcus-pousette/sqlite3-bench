import type { DBAdapter } from "../types.ts";
import { safeRequire } from "../util.ts";
import type { PGlite as PGliteDB } from "@electric-sql/pglite";

type PGliteConstructor = new (...args: unknown[]) => PGliteDB;

export function pgliteAdapter(): DBAdapter {
  let mod: { PGlite: PGliteConstructor } | undefined;
  let db: PGliteDB | undefined;
  // Simple scoped logger with timestamps and incremental ids
  let opSeq = 0;
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  const nextId = () => ++opSeq;
  return {
    id: "pglite",
    detectInstalled() {
      const m = safeRequire<unknown>("@electric-sql/pglite") as Record<string, unknown> | undefined;
      const ctor = (m && (m["PGlite"] || (m["default"] as any)?.PGlite)) as PGliteConstructor | undefined;
      if (ctor) {
        mod = { PGlite: ctor };
      }
      const installed = !!mod;
      return installed;
    },
    getPackageVersion() {
      const pkg = safeRequire<any>("@electric-sql/pglite/package.json");
      const v = pkg?.version;
      return v;
    },
    async getEngineVersion() {
      try {
        const t0 = now();
        const res = await db!.query<{ v?: unknown }>("select version() as v");
        const dt = (now() - t0).toFixed(1);
        const first = res.rows?.[0];
        const out = first?.v ? String(first.v) : undefined;
        return out;
      } catch {
        return undefined;
      }
    },
    async open(_dbPath: string) {
      if (!mod) throw new Error("@electric-sql/pglite not installed");
      const t0 = now();
      db = new mod.PGlite();
    },
    async close() {
      const t0 = now();
      await db?.close?.();
      db = undefined;
    },
    async exec(sql: string) {
      const execId = nextId();
      const parts = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      let i = 0;
      for (const s of parts) {
        i++;
        const t0 = now();
        try {
          await db!.query(s);
        } catch (err) {
          throw err;
        }
      }
    },
    async run(sql: string, params?: unknown[]) {
      const runId = nextId();
      const p = params ?? [];
      const t0 = now();
      try {
        await db!.query(sql, p);
      } catch (err) {
        throw err;
      }
    },
    async all<T = unknown>(sql: string, params?: unknown[]) {
      const allId = nextId();
      const p = params ?? [];
      const t0 = now();
      try {
        const res = await db!.query(sql, p);
        const out = (res.rows as T[]) ?? [];
        return out;
      } catch (err) {
        throw err;
      }
    },
    async beginTransaction() {
      const t0 = now();
      await db!.query("BEGIN");
    },
    async commitTransaction() {
      const t0 = now();
      await db!.query("COMMIT");
    },
    async rollbackTransaction() {
      const t0 = now();
      await db!.query("ROLLBACK");
    },
  };
}
