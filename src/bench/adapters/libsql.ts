import type { DBAdapter } from "../types.ts";
import { safeRequire, resolvePackageVersion } from "../util.ts";
import type { Client as LibsqlClient, ResultSet } from "@libsql/client";

type Libsql = typeof import("@libsql/client");
type Client = LibsqlClient;

export function libsqlAdapter(): DBAdapter {
  let lib: Libsql | undefined;
  let client: Client | undefined;
  return {
    id: "libsql",
    detectInstalled() {
      lib = safeRequire<Libsql>("@libsql/client");
      return !!lib;
    },
    getPackageVersion() {
      return resolvePackageVersion("@libsql/client");
    },
    async getEngineVersion() {
      // libsql supports PRAGMA libsql_version when using embedded engine
      try {
        const r = await client!.execute("select sqlite_version() as v");
        const first = (r.rows?.[0] ?? {}) as Record<string, unknown>;
        const v = (first["v"] ?? (first as any)[0]) as unknown;
        return v ? String(v) : undefined;
      } catch {
        return undefined;
      }
    },
    async open(dbPath: string) {
      if (!lib) throw new Error("@libsql/client not installed");
      // If caller passes a full file: URL, use as-is; otherwise prefix with file:
      const url = dbPath.startsWith("file:") ? dbPath : `file:${dbPath}`;
      client = lib.createClient({ url });
    },
    async close() {
      await client?.close();
      client = undefined;
    },
    async exec(sql: string) {
      // libsql client does not support multiple statements in one call.
      const stmts = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of stmts) {
        await client!.execute(s);
      }
    },
    async run(sql: string, params?: unknown[]) {
      // Use positional args call signature to avoid strict InArgs typing issues
      await client!.execute(sql, (params ?? []) as any);
    },
    async all<T = unknown>(sql: string, params?: unknown[]) {
      const res: ResultSet = await client!.execute(sql, (params ?? []) as any);
      return (res.rows as T[]) ?? [];
    },
    async beginTransaction() {
      await client!.execute("BEGIN");
    },
    async commitTransaction() {
      await client!.execute("COMMIT");
    },
    async rollbackTransaction() {
      await client!.execute("ROLLBACK");
    },
  };
}
