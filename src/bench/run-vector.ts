import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer } from '../web/serve.ts';
import { formatMarkdownTable, updateReadmeTable } from './util.ts';
import type { DBAdapter as BenchDBAdapter } from './types.ts';
import { runVectorAfterOpen, type VectorDialect } from './core-vector.ts';

// Small DBAdapter local type (reusing bench types)
type DBAdapter = {
  id: string;
  exec(sql: string): Promise<void> | void;
  run(sql: string, params?: unknown[]): Promise<void> | void;
  all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> | T[];
  beginTransaction?(): Promise<void> | void;
  commitTransaction?(): Promise<void> | void;
  rollbackTransaction?(): Promise<void> | void;
};

type VectorResult = {
  implementation: string;
  packageVersion?: string;
  engineVersion?: string;
  rows: number;
  dim: number;
  k: number;
  repeats: number;
  storage: 'disk' | 'memory' | string;
  metrics: Record<string, number>;
  timestamp: string;
  environment?: Record<string, string>;
};

function tryResolveVecNativeFromNodeModules(): string | undefined {
  try {
    const req = createRequire(import.meta.url);
    // Resolve the package.json to locate package root
    const pkgPath = req.resolve('@dao-xyz/sqlite3-vec/package.json');
    const pkgDir = path.dirname(pkgPath);
    const nativeDir = path.join(pkgDir, 'dist', 'native');
    const exts = ['.dylib', '.so', '.dll'];
    if (!fs.existsSync(nativeDir)) return undefined;
    const files = fs.readdirSync(nativeDir).filter((f) => exts.some((e) => f.endsWith(e)));
    // Prefer platform-specific match
    const plat = process.platform;
    const arch = process.arch;
    const preferred = files.find((f) => f.includes('darwin') && plat === 'darwin')
      || files.find((f) => f.includes('linux') && plat === 'linux')
      || files.find((f) => f.includes('win') && plat === 'win32')
      || files[0];
    return preferred ? path.join(nativeDir, preferred) : undefined;
  } catch {
    return undefined;
  }
}

function parseArgs() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    const [k, v] = a.includes('=') ? a.split('=', 2) : [a, 'true'];
    args.set(k.replace(/^--/, ''), v);
  }
  // Lighter defaults for vector workloads to avoid timeouts in headless browsers
  const rows = Number(args.get('rows') || 200);
  const dim = Number(args.get('dim') || 32);
  const k = Number(args.get('k') || 10);
  const repeats = Number(args.get('repeats') || 5);
  const port = Number(args.get('port') || Math.floor(30000 + Math.random() * 20000));
  const timeout = Number(args.get('timeout') || 30_000);
  const skipBrowser = args.get('skipBrowser') === '1' || args.get('skipBrowser') === 'true';
  const skipNode = args.get('skipNode') === '1' || args.get('skipNode') === 'true';
  // Allow comma-separated list via --browserEngine or --browserEngines
  const be = args.get('browserEngines') || args.get('browserEngine') || 'sqlite3-vec-wasm,pglite-vec-wasm';
  const browserEngines = be.split(',').map((s) => s.trim()).filter(Boolean);
  const vecExt = args.get('vecExt');
  return { rows, dim, k, repeats, port, timeout, skipBrowser, skipNode, browserEngines, vecExt };
}

async function runSqlite3VecNode(rows: number, dim: number, kk: number, repeats: number, loadExtensionPath?: string): Promise<VectorResult | null> {
  try {
    // Prefer unified-node entry to ensure native extension load path is discovered on Node
    const req = createRequire(import.meta.url);
    let mod: any;
    try {
      const resolved = req.resolve('@dao-xyz/sqlite3-vec/dist/unified-node.js');
      mod = await import(resolved);
    } catch {}
    if (!mod) {
      try { mod = await import('@dao-xyz/sqlite3-vec'); } catch {}
    }
  const createDatabase: any = (mod && (mod as any).createDatabase) || (mod && (mod as any).default?.createDatabase);
    const dbFile = path.resolve('tmp/sqlitevec-node.db');
    await fs.promises.mkdir(path.dirname(dbFile), { recursive: true });
    const tStartup0 = performance.now();
  const resolvedExt = loadExtensionPath || tryResolveVecNativeFromNodeModules();
  const db = await createDatabase({ database: dbFile, loadExtension: resolvedExt });
    db.open();
    try { await db.exec('SELECT 1'); } catch {}
    const startup = performance.now() - tStartup0;
    const adapter: any = {
      id: 'sqlite3-vec-node',
      async exec(sql: string) { await db.exec(sql); },
      async run(sql: string, params: unknown[] = []) { const stmt = await db.prepare(sql); stmt.run(params); },
      async all<T = unknown>(sql: string, params: unknown[] = []) { const stmt = await db.prepare(sql); return stmt.all(params) as T[]; },
      async beginTransaction() { await db.exec('BEGIN'); },
      async commitTransaction() { await db.exec('COMMIT'); },
      async rollbackTransaction() { await db.exec('ROLLBACK'); },
    };
    // capability check for vec0 (native extension must be loaded)
    try {
      await (adapter.exec('CREATE VIRTUAL TABLE IF NOT EXISTS __vec_probe USING vec0(vector float[2])'));
      await (adapter.exec('DROP TABLE IF EXISTS __vec_probe'));
    } catch (e) {
      await db.close();
      const hint = resolvedExt ? `Tried: ${resolvedExt}` : 'No extension found under node_modules/@dao-xyz/sqlite3-vec/dist/native';
      throw new Error('[vector] sqlite3-vec-node: vec0 not available (native extension not found). ' +
        `Ensure @dao-xyz/sqlite3-vec native extension is available. ${hint}. ` +
        'You can build/copy it to your project dist/native or pass --vecExt=/absolute/path/to/sqlite-vec-<platform>.<dylib|so|dll> or use --skipNode=1');
    }

    const schemaSql = `CREATE VIRTUAL TABLE IF NOT EXISTS vec USING vec0(vector float[${dim}]);\n` +
      `CREATE TABLE IF NOT EXISTS meta(rowid INTEGER PRIMARY KEY, tag INTEGER, value REAL);`;
    const dialect: VectorDialect = {
      schemaSql,
      async insert(ad, rowid, vec, tag, value) {
  await ad.run('INSERT INTO vec(rowid,vector) VALUES(?,?)', [rowid, Buffer.from(vec.buffer)]);
  await ad.run('INSERT INTO meta(rowid,tag,value) VALUES(?,?,?)', [rowid, tag, value]);
      },
      knn(vec, k) {
  return { sql: `SELECT rowid, vec_distance_l2(vector, ?) AS d FROM vec ORDER BY d LIMIT ${k}`, params: [Buffer.from(vec.buffer)] };
      },
      knnFilter(vec, tag, k) {
  return { sql: `SELECT v.rowid, vec_distance_l2(v.vector, ?) AS d FROM vec v JOIN meta m ON m.rowid=v.rowid WHERE m.tag=? ORDER BY d LIMIT ${k}`, params: [Buffer.from(vec.buffer), tag] };
      },
    };
    // warm detection
    let skipInsert = false;
    try {
      const r: any[] = await adapter.all('SELECT COUNT(*) AS c FROM meta');
      const c = Number((r?.[0] as any)?.c ?? (r?.[0] as any)?.[0] ?? 0);
      if (c >= rows) skipInsert = true;
    } catch {}
    const metrics = await runVectorAfterOpen(adapter as unknown as BenchDBAdapter, dialect, { rows, dim, k: kk, repeats, skipInsert });
    (metrics as any).startup = startup;
    await db.close();
    return {
      implementation: 'sqlite3-vec-node',
      engineVersion: '-',
      rows,
      dim,
      k: kk,
      repeats,
      storage: 'disk',
      metrics: metrics as any,
      timestamp: new Date().toISOString(),
      environment: { dbFile },
    };
  } catch (e) {
  // Propagate so the runner fails fast unless --skipNode is set
  console.warn('[vector] sqlite3-vec-node unavailable or failed:', e);
  throw e;
  }
}

function arrToPgVector(vec: Float32Array): string {
  const vals = Array.from(vec).map((x) => Number.isFinite(x) ? x : 0);
  return '[' + vals.join(',') + ']';
}

async function runPgliteVectorNode(rows: number, dim: number, kk: number, repeats: number): Promise<VectorResult | null> {
  try {
    const mod = await import('@electric-sql/pglite');
    const PGlite = (mod as any).PGlite || (mod as any).default?.PGlite;
    const dataDir = path.resolve('tmp/pglite-vec');
    const tStartup0 = performance.now();
    const db = new PGlite(dataDir);
    try { await db.query('SELECT 1'); } catch {}
    const startup = performance.now() - tStartup0;
    const adapter: any = {
      id: 'pglite',
      async exec(sql: string) { const parts = sql.split(';').map((s: string)=>s.trim()).filter(Boolean); for (const s of parts) await db.query(s); },
      async run(sql: string, params: unknown[] = []) { await db.query(sql, params); },
      async all<T = unknown>(sql: string, params: unknown[] = []) { const res = await db.query(sql, params); return (res.rows as T[]) ?? []; },
      async beginTransaction() { await db.query('BEGIN'); },
      async commitTransaction() { await db.query('COMMIT'); },
      async rollbackTransaction() { await db.query('ROLLBACK'); },
    };
    // Try pgvector first; if unavailable, fall back to array math
    let usePgVector = true;
    try { await adapter.exec('CREATE EXTENSION IF NOT EXISTS vector'); }
    catch { usePgVector = false; }

    let dialect: VectorDialect;
    if (usePgVector) {
      const schemaSql = `CREATE TABLE IF NOT EXISTS vec(id BIGINT PRIMARY KEY, vector vector(${dim}), tag INTEGER, value DOUBLE PRECISION);\n` +
        `CREATE INDEX IF NOT EXISTS vec_tag_idx ON vec(tag);`;
      dialect = {
        schemaSql,
        async insert(ad, rowid, vec, tag, value) {
        await ad.run('INSERT INTO vec(id,vector,tag,value) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING', [rowid, arrToPgVector(vec), tag, value]);
        },
        knn(vec, k) {
          return { sql: `SELECT id, (vector <-> $1) AS d FROM vec ORDER BY vector <-> $1 LIMIT ${k}`, params: [arrToPgVector(vec)] };
        },
        knnFilter(vec, tag, k) {
          return { sql: `SELECT id, (v.vector <-> $1) AS d FROM vec v WHERE v.tag=$2 ORDER BY v.vector <-> $1 LIMIT ${k}`, params: [arrToPgVector(vec), tag] };
        },
      };
    } else {
      const schemaSql = `CREATE TABLE IF NOT EXISTS vec(id BIGINT PRIMARY KEY, vector DOUBLE PRECISION[], tag INTEGER, value DOUBLE PRECISION);\n` +
        `CREATE INDEX IF NOT EXISTS vec_tag_idx ON vec(tag);`;
      const l2 = (k: number) => `WITH params(p) AS (SELECT $1::float8[]) SELECT id, sqrt(SUM(POWER(vector[i]-p[i],2))) AS d FROM vec, params, generate_subscripts(vector,1) AS i GROUP BY id ORDER BY d ASC LIMIT ${k}`;
      const l2f = (k: number) => `WITH params(p) AS (SELECT $1::float8[]) SELECT id, sqrt(SUM(POWER(v.vector[i]-p[i],2))) AS d FROM vec v, params, generate_subscripts(v.vector,1) AS i WHERE v.tag=$2 GROUP BY id ORDER BY d ASC LIMIT ${k}`;
      dialect = {
        schemaSql,
        async insert(ad, rowid, vec, tag, value) {
          await ad.run('INSERT INTO vec(id,vector,tag,value) VALUES($1,$2::float8[],$3,$4) ON CONFLICT(id) DO NOTHING', [rowid, '{' + Array.from(vec).join(',') + '}', tag, value]);
        },
        knn(vec, k) { return { sql: l2(k), params: ['{' + Array.from(vec).join(',') + '}'] }; },
        knnFilter(vec, tag, k) { return { sql: l2f(k), params: ['{' + Array.from(vec).join(',') + '}', tag] }; },
      };
    }
    let skipInsert = false;
    try {
      const r: any[] = await adapter.all('SELECT COUNT(*) AS c FROM vec');
      const c = Number((r?.[0] as any)?.c ?? (r?.[0] as any)?.[0] ?? 0);
      if (c >= rows) skipInsert = true;
    } catch {}
    const metrics = await runVectorAfterOpen(adapter as unknown as BenchDBAdapter, dialect, { rows, dim, k: kk, repeats, skipInsert });
    (metrics as any).startup = startup;
    await db.close?.();
    return {
      implementation: 'pglite-vector-node',
      engineVersion: (await (async () => { try { const r = await db.query('select version() as v'); return String((r.rows?.[0] as any)?.v ?? ''); } catch { return ''; }})()),
      rows,
      dim,
      k: kk,
      repeats,
      storage: 'disk',
      metrics: metrics as any,
      timestamp: new Date().toISOString(),
      environment: { dataDir },
    };
  } catch (e) {
    console.warn('[vector] pglite-node unavailable or failed:', e);
    return null;
  }
}

async function runLibsqlVectorNode(rows: number, dim: number, kk: number, repeats: number): Promise<VectorResult | null> {
  try {
    // libsql does not currently ship a vector extension; mark unsupported
    return {
      implementation: 'libsql-vector-node',
      engineVersion: '-',
      rows,
      dim,
      k: kk,
      repeats,
      storage: 'disk',
      metrics: { startup: NaN, schema: NaN, 'insert xN': NaN, 'knn@k': NaN, 'knn@k (filtered)': NaN, 'knn@k xM': NaN },
      timestamp: new Date().toISOString(),
      environment: { note: 'vector extension unsupported' },
    };
  } catch {
    return null;
  }
}

async function writeNodeVectorResults(results: VectorResult[]) {
  const outDir = path.resolve('results');
  await fs.promises.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'node-vector-latest.json');
  let existing: VectorResult[] = [];
  try {
    const cur = await fs.promises.readFile(outFile, 'utf8');
    existing = JSON.parse(cur);
  } catch {}
  const combined = [...existing, ...results];
  await fs.promises.writeFile(outFile, JSON.stringify(combined, null, 2));
}

async function updateVectorReadmeSection() {
  const outDir = path.resolve('results');
  const nodeFile = path.join(outDir, 'node-vector-latest.json');
  const browserFile = path.join(outDir, 'browser-vector-latest.json');
  let nodeVec: VectorResult[] = [];
  let browserVec: VectorResult[] = [];
  try { nodeVec = JSON.parse(await fs.promises.readFile(nodeFile, 'utf8')); } catch {}
  try { browserVec = JSON.parse(await fs.promises.readFile(browserFile, 'utf8')); } catch {}
  const rows = [...nodeVec, ...browserVec].map((r: any) => ({
    implementation: r.implementation,
    platform: r.environment?.userAgent ? 'browser' : 'node',
    storage: r.storage ?? '-',
    version: r.packageVersion ?? '-',
    engine: r.engineVersion ?? '-',
    rows: r.rows,
    dim: r.dim ?? '-',
    k: r.k ?? '-',
    repeats: r.repeats ?? '-',
    startup: r.metrics?.startup != null && typeof r.metrics.startup === 'number' && (r.metrics.startup as any).toFixed ? (r.metrics.startup as any).toFixed(1) : (r.metrics?.startup != null ? String(r.metrics.startup) : '-'),
    schema: r.metrics?.schema != null && (r.metrics.schema as any).toFixed ? (r.metrics.schema as any).toFixed(1) : String(r.metrics?.schema ?? ''),
    'insert xN': r.metrics?.['insert xN'] != null && (r.metrics['insert xN'] as any).toFixed ? (r.metrics['insert xN'] as any).toFixed(1) : String(r.metrics?.['insert xN'] ?? ''),
    'knn@k': r.metrics?.['knn@k'] != null && (r.metrics['knn@k'] as any).toFixed ? (r.metrics['knn@k'] as any).toFixed(1) : String(r.metrics?.['knn@k'] ?? ''),
    'knn@k (filtered)': r.metrics?.['knn@k (filtered)'] != null && (r.metrics['knn@k (filtered)'] as any).toFixed ? (r.metrics['knn@k (filtered)'] as any).toFixed(1) : String(r.metrics?.['knn@k (filtered)'] ?? ''),
    'knn@k xM': r.metrics?.['knn@k xM'] != null && (r.metrics['knn@k xM'] as any).toFixed ? (r.metrics['knn@k xM'] as any).toFixed(1) : String(r.metrics?.['knn@k xM'] ?? ''),
  }));
  const table = rows.length ? formatMarkdownTable(rows as any) : 'No vector results yet.';
  updateReadmeTable(table, '<!-- VEC_TABLE:START -->', '<!-- VEC_TABLE:END -->');
}

async function runBrowserVector(port: number, rows: number, dim: number, kk: number, repeats: number, timeoutMs: number, engine: string) {
  const pp = await import('puppeteer');
  const browser = await pp.launch({ headless: true, protocolTimeout: timeoutMs });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    const url = `http://localhost:${port}/?auto=1&engine=${encodeURIComponent(engine)}&rows=${rows}&dim=${dim}&k=${kk}&repeats=${repeats}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#status', { timeout: 60_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('#status');
      const txt = (el?.textContent || '').toLowerCase();
      return /posted results|could not post results|error during benchmark/.test(txt);
    }, { timeout: timeoutMs });
  } finally {
    try { await browser.close(); } catch {}
  }
}

async function main() {
  const { rows, dim, k, repeats, port, timeout, skipBrowser, skipNode, browserEngines, vecExt } = parseArgs();
  const results: VectorResult[] = [];
  if (!skipNode) {
    const r1 = await runSqlite3VecNode(rows, dim, k, repeats, vecExt); if (r1) results.push(r1);
    const r2 = await runPgliteVectorNode(rows, dim, k, repeats); if (r2) results.push(r2);
    const r3 = await runLibsqlVectorNode(rows, dim, k, repeats); if (r3) results.push(r3);
  }
  await writeNodeVectorResults(results);
  await updateVectorReadmeSection();

  // Start server and run browser vector (sqlite3-vec-wasm) to update README sections
  if (!skipBrowser && browserEngines.length) {
    let srv;
    let bindPort = port;
    for (let i = 0; i < 3; i++) {
      try {
        srv = startServer(bindPort, false, false);
        break;
      } catch (e) {
        if ((e as any)?.code === 'EADDRINUSE') { bindPort++; continue; }
        throw e;
      }
    }
    if (!srv) throw new Error('Failed to start server');
    try {
      for (const eng of browserEngines) {
        await runBrowserVector(bindPort, rows, dim, k, repeats, timeout, eng);
      }
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()))
        .catch(() => {});
    }
    // Update README again in case browser posted new results
    await updateVectorReadmeSection();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
