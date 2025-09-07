import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { betterSqlite3Adapter } from "./adapters/betterSqlite3.ts";
import { nodeSqlite3Adapter } from "./adapters/nodeSqlite3.ts";
import { libsqlAdapter } from "./adapters/libsql.ts";
import { pgliteAdapter } from "./adapters/pglite.ts";
import { envInfo, formatMarkdownTable, updateReadmeTable, clearReadmeComment } from "./util.ts";
// Load unified SQL definitions with types
type SqlConfig = {
  sqlite: { preamble: string; schema: string; truncate: string };
  postgres: { schema: string; truncate: string };
  queries: { insert: string; selectAll: string; selectById: string; update: string; delete: string };
  queriesPg: { insert: string; selectAll: string; selectById: string; update: string; delete: string };
};
const sql: SqlConfig = JSON.parse(fs.readFileSync(path.resolve("assets/sql.json"), "utf8")) as SqlConfig;
import type { BenchResult, DBAdapter, MetricName, NodeBenchOptions } from "./types.ts";
import { runAfterOpen, type BenchDialect } from './core.ts';

const DEFAULT_ROWS = 5_000;
const DEFAULT_STORAGE: "memory" | "disk" | "both" = "both";

function parseCli(): NodeBenchOptions {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    const [k, v] = a.includes("=") ? a.split("=", 2) : [a, "true"];
    args.set(k.replace(/^--/, ""), v);
  }
  const rows = Number(args.get("rows") ?? DEFAULT_ROWS);
  const dbDir = args.get("dbDir") ?? "tmp";
  const impls = args.get("impls")?.split(",").map((s) => s.trim());
  const storage = (args.get("storage") as "memory" | "disk" | "both" | undefined) ?? DEFAULT_STORAGE;
  return { rows, dbDir, implementations: impls, storage };
}

async function benchOne(adapter: DBAdapter, dbPath: string, rows: number, storage: "memory"|"disk"): Promise<BenchResult> {
  const info = envInfo();
  const metrics: Record<MetricName, number> = {
    startup: 0,
    open: 0,
    schema: 0,
    "insert xN": 0,
    "select-all": 0,
    "select-lookup": 0,
    "update xN": 0,
    "delete xN": 0,
  };

  const startMs = Date.now();
  // startup (open + first successful request)
  const tStartup0 = performance.now();
  const t0 = performance.now();
  await adapter.open(dbPath);
  metrics.open = performance.now() - t0;
  // First trivial query to confirm readiness
  try {
    await adapter.all("select 1");
  } catch (e) {
    // Fallback per-dialect if needed
    const probe = adapter.id === "pglite" ? "select 1" : "select 1";
    await adapter.all(probe);
  }
  metrics.startup = performance.now() - tStartup0;

  // schema + workload via shared core
  const dialect: BenchDialect = adapter.id === 'pglite'
    ? { schemaSql: `${sql.postgres.schema}\n${sql.postgres.truncate}`, queries: sql.queriesPg }
    : { schemaSql: `${sql.sqlite.preamble}\n${sql.sqlite.schema}\n${sql.sqlite.truncate}`, queries: sql.queries };
  const core = await runAfterOpen(adapter, dialect, rows);
  metrics.schema = core.schema;
  metrics['insert xN'] = core['insert xN'];
  metrics['select-all'] = core['select-all'];
  metrics['select-lookup'] = core['select-lookup'];
  metrics['update xN'] = core['update xN'];
  metrics['delete xN'] = core['delete xN'];

  const pkg = adapter.getPackageVersion?.();
  const eng = adapter.getEngineVersion ? await adapter.getEngineVersion() : undefined;
  await adapter.close();

  return {
    implementation: adapter.id,
    packageVersion: pkg,
    engineVersion: eng,
    environment: info,
    rows,
    storage,
    metrics,
    timestamp: new Date(startMs).toISOString(),
  };
}

function adapters(): DBAdapter[] {
  return [betterSqlite3Adapter(), nodeSqlite3Adapter(), libsqlAdapter(), pgliteAdapter()];
}

async function main() {
  const opts = parseCli();
  const outDir = path.resolve("results");
  await ensureDir(outDir);
  const dbDir = path.resolve(opts.dbDir ?? "tmp");
  await ensureDir(dbDir);

  const selected = adapters().filter((a) => (!opts.implementations || opts.implementations.includes(a.id)) && a.detectInstalled());
  if (!selected.length) {
    console.warn("No implementations detected. Install any of: better-sqlite3, sqlite3, @libsql/client");
    process.exitCode = 1;
    return;
  }
  const results: BenchResult[] = [];
  for (const a of selected) {
    const storages: ("memory"|"disk")[] = (opts.storage === "both" ? ["memory","disk"] : [opts.storage as ("memory"|"disk")]);
    for (const s of storages) {
      let dbPath: string;
      if (a.id === "libsql") {
        const base = path.join(dbDir, `${a.id}.db`);
        if (s === "memory") {
          console.warn("[skip] libsql (memory): @libsql/client file driver does not support in-memory URLs");
          continue;
        }
        dbPath = `file:${base}`;
      } else if (a.id === "node-sqlite3" || a.id === "better-sqlite3") {
        dbPath = s === "memory" ? ":memory:" : path.join(dbDir, `${a.id}.db`);
      } else {
        dbPath = path.join(dbDir, `${a.id}.db`);
      }
      try {
        const r = await benchOne(a, dbPath, opts.rows, s);
        results.push(r);
        console.log(`[ok] ${a.id} (${s})`);
      } catch (e) {
        console.error(`[fail] ${a.id} (${s}):`, e instanceof Error ? e.message : String(e));
      }
    }
  }

  // Persist JSON
  const jsonPath = path.join(outDir, `node-latest.json`);
  await fs.promises.writeFile(jsonPath, JSON.stringify(results, null, 2));

  // Generate table
  const rows = results.map((r) => ({
    implementation: r.implementation,
    platform: 'node',
    storage: r.storage ?? "-",
    version: r.packageVersion ?? "-",
    engine: r.engineVersion ?? "-",
    rows: r.rows,
    startup: r.metrics.startup.toFixed(1),
    open: r.metrics.open.toFixed(1),
    schema: r.metrics.schema.toFixed(1),
    "insert xN": r.metrics["insert xN"].toFixed(1),
    "select-all": r.metrics["select-all"].toFixed(1),
    "select-lookup": r.metrics["select-lookup"].toFixed(1),
    "update xN": r.metrics["update xN"].toFixed(1),
    "delete xN": r.metrics["delete xN"].toFixed(1),
  }));
  const table = rows.length ? formatMarkdownTable(rows as any) : "No results.";
  updateReadmeTable(table);
  // Clear AI comment on every run until explicitly set again
  clearReadmeComment();
  console.log(`Updated README.md with ${results.length} result(s).`);
}

function ensureDir(p: string) {
  return fs.promises.mkdir(p, { recursive: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
