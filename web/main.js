/* global sqlite3InitModule */

const $ = (sel) => document.querySelector(sel);
const out = $("#output");
const statusEl = $("#status");
const collectedLogs = [];

function pushLog(level, args) {
  try {
    collectedLogs.push({ level, msg: args.map(String).join(" ") });
  } catch {}
}

// Patch console to mirror into collectedLogs
const _console = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
console.log = (...a) => { pushLog('log', a); _console.log(...a); };
console.warn = (...a) => { pushLog('warn', a); _console.warn(...a); };
console.error = (...a) => { pushLog('error', a); _console.error(...a); };

function log(msg) {
  out.textContent += msg + "\n";
}

function mdTable(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "-").join(" | ")} |`);
  for (const r of rows) lines.push(`| ${headers.map((h) => String(r[h] ?? "")).join(" | ")} |`);
  return lines.join("\n");
}

function postResults(results) {
  return fetch("/results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(results),
  }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
}

function postLogs(packet) {
  const base = {
    logs: collectedLogs.map((l) => l.msg),
    level: 'info',
    when: new Date().toISOString(),
    userAgent: navigator.userAgent,
    href: location.href,
  };
  return fetch('/logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...base, ...packet }),
  }).catch(() => {});
}

let SQL = null;

async function loadSql() {
  if (SQL) return SQL;
  const res = await fetch('/assets/sql.json');
  SQL = await res.json();
  return SQL;
}

async function runSqlite3WasmBenchmark(sqlite3, rows, storage, policy, fsKind = 'opfs') {
  await loadSql();
  // Always use worker for consistency (memory/disk)
  await loadSql();
  return new Promise((resolve, reject) => {
    const worker = new Worker('/workers/sqlite3.worker.js', { type: 'module' });
    const onMsg = (ev) => {
      const { ok, result, error } = ev.data || {};
      worker.terminate();
      if (ok) resolve(result);
      else reject(new Error(error || 'worker failed'));
    };
    worker.onmessage = onMsg;
    worker.onerror = (e) => { worker.terminate(); reject(e.error || new Error(String(e.message || 'worker error'))); };
    worker.postMessage({ cmd: 'run', rows, SQL, storage, fs: fsKind });
  });

  // (Worker returns result)
}

async function runLibsqlClientWasmInline(rows, storage, fsKind = 'opfs') {
  await loadSql();
  const mod = await import('/vendor/@libsql/client-wasm/lib-esm/wasm.js');
  const createClient = mod.createClient || mod.default?.createClient;
  if (!createClient) throw new Error('Failed to load @libsql/client-wasm');
  if (storage === 'memory') throw new Error('libsql-client-wasm: memory mode not supported');
  const url = 'file:bench.db';
  const tStartup0 = performance.now();
  const t0 = performance.now();
  const client = await createClient({ url });
  const open = performance.now() - t0;
  try { await client.execute('SELECT 1'); } catch {}
  const startup = performance.now() - tStartup0;
  async function execMulti(sql) {
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const s of stmts) await client.execute(s);
  }
  const schemaSQL = `${SQL.sqlite.preamble ? SQL.sqlite.preamble + ';\n' : ''}${SQL.sqlite.schema};\n${SQL.sqlite.truncate};`;
  const t1 = performance.now();
  await execMulti(schemaSQL);
  const schema = performance.now() - t1;
  const t2 = performance.now();
  await client.execute('BEGIN');
  try {
    for (let i = 0; i < rows; i++) {
      const name = `name_${i}`;
      const value = i % 100;
      const created = Date.now();
      await client.execute({ sql: SQL.queries.insert, args: [name, value, created] });
    }
    await client.execute('COMMIT');
  } catch (e) { await client.execute('ROLLBACK'); throw e; }
  const insertN = performance.now() - t2;
  const t3 = performance.now();
  const all = await client.execute(SQL.queries.selectAll);
  void all.rows?.length;
  const selectAll = performance.now() - t3;
  const lookups = Math.min(1000, rows);
  const ids = Array.from({ length: lookups }, () => 1 + Math.floor(Math.random() * rows));
  const t4 = performance.now();
  for (const id of ids) { await client.execute({ sql: SQL.queries.selectById, args: [id] }); }
  const selectLookup = performance.now() - t4;
  const updates = Math.max(1, Math.floor(rows / 10));
  const t5 = performance.now();
  await client.execute('BEGIN');
  try {
    for (let i = 0; i < updates; i++) {
      const id = 1 + Math.floor(Math.random() * rows);
      const nv = Math.random() * 1000;
      await client.execute({ sql: SQL.queries.update, args: [nv, id] });
    }
    await client.execute('COMMIT');
  } catch (e) { await client.execute('ROLLBACK'); throw e; }
  const updateN = performance.now() - t5;
  const deletes = updates;
  const t6 = performance.now();
  await client.execute('BEGIN');
  try {
    for (let i = 0; i < deletes; i++) {
      const id = 1 + Math.floor(Math.random() * rows);
      await client.execute({ sql: SQL.queries.delete, args: [id] });
    }
    await client.execute('COMMIT');
  } catch (e) { await client.execute('ROLLBACK'); throw e; }
  const deleteN = performance.now() - t6;
  let engineVersion = 'unknown';
  try {
    const ver = await client.execute('select sqlite_version() as v');
    const first = ver.rows?.[0];
    engineVersion = String(first?.v ?? first?.[0] ?? 'unknown');
  } catch {}
  const result = {
    implementation: 'libsql-client-wasm',
    engineVersion,
    rows,
    storage: 'disk-opfs',
    metrics: { startup, open, schema, 'insert xN': insertN, 'select-all': selectAll, 'select-lookup': selectLookup, 'update xN': updateN, 'delete xN': deleteN },
    timestamp: new Date().toISOString(),
    environment: { userAgent: navigator.userAgent, url, fs: 'opfs' }
  };
  await client.close?.();
  return result;
}

async function runLibsqlClientWasmBenchmark(rows, storage, policy, fsKind = 'opfs') {
  await loadSql();
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker('/workers/libsql.worker.js', { type: 'module' });
      const onMsg = (ev) => {
        const { ok, result, error } = ev.data || {};
        worker.terminate();
        if (ok) resolve(result);
        else reject(new Error(error || 'worker failed'));
      };
      worker.onmessage = onMsg;
      worker.onerror = (e) => { worker.terminate(); reject(e.error || new Error(String(e.message || 'worker error'))); };
      // libsql-client-wasm currently persists to OPFS for file: URLs; no 'idb' backend
      if (storage === 'memory') {
        reject(new Error('libsql-client-wasm: memory mode not supported'));
        return;
      }
      worker.postMessage({ cmd: 'run', rows, storage: 'disk', fs: 'opfs', SQL });
    });
  } catch (e) {
    console.warn('libsql worker failed', e);
    if (policy === 'only') throw e;
    return runLibsqlClientWasmInline(rows, storage);
  }
}

// fsKind: 'auto' | 'idb' | 'opfs'
// allowFallback: when false, do not silently fall back across implementations
async function runPgliteWasmBenchmark(rows, storage, policy, initTimeoutMs, fsKind = 'auto', allowFallback = false) {
  await loadSql();
  const mod = await import('/vendor/@electric-sql/pglite/dist/index.js');
  const { runBench } = await import('/bench-core.js');
  const PGlite = mod.PGlite || mod.default?.PGlite;
  if (!PGlite) throw new Error('Failed to load @electric-sql/pglite');
  let db;
  let open;
  let startup;
  const t0 = performance.now();
  console.log('[pglite-wasm] init: storage=%s policy=%s timeout=%sms COI=%s', storage, policy, initTimeoutMs, String(self.crossOriginIsolated));
  const tStartup0 = performance.now();
  if (storage === 'memory') {
    if (policy === 'off') {
      console.log('[pglite-wasm] workers=off -> using inline PGlite()');
      db = new PGlite();
      open = performance.now() - t0;
      console.log('[pglite-wasm] inline ready in %dms', open.toFixed(1));
    } else {
      try {
        // Try custom worker wrapper first to avoid module path quirks
        const customWorkerUrl = '/workers/pglite.worker.js';
        console.log('[pglite-wasm] creating custom worker at', customWorkerUrl);
        let worker = new Worker(customWorkerUrl, { type: 'module' });
        const wmod = await import('/vendor/@electric-sql/pglite/dist/worker/index.js');
        const PGliteWorker = wmod.PGliteWorker || wmod.default?.PGliteWorker;
        worker.addEventListener('error', (e) => console.error('[pglite-wasm] worker error:', e?.message || e));
        worker.addEventListener('messageerror', (e) => console.error('[pglite-wasm] worker messageerror:', e));
        worker.addEventListener('message', (e) => console.log('[pglite-wasm] worker message:', e?.data?.type || e?.data));
        const init = PGliteWorker.create(worker, {});
        const guard = Math.max(2000, Math.min(initTimeoutMs || 15000, 60000));
        console.log('[pglite-wasm] waiting for worker init (guard=%dms)', guard);
        const stillTimer = setTimeout(() => console.warn('[pglite-wasm] still waiting for worker init…'), Math.min(guard / 2, 10000));
        const watchdog = new Promise((_, reject) => setTimeout(() => {
          try { worker?.terminate(); console.warn('[pglite-wasm] worker timeout -> terminated'); } catch {}
          reject(new Error('pglite worker init timeout'));
        }, guard));
        db = await Promise.race([init, watchdog]);
        clearTimeout(stillTimer);
      open = performance.now() - t0;
      try { await db.query('SELECT 1'); } catch {}
      startup = performance.now() - tStartup0;
      console.log('[pglite-wasm] worker ready in %dms', open.toFixed(1));
      } catch (e) {
        console.warn('[pglite-wasm] worker (memory) init failed/slow:', e);
        if (!allowFallback) throw e;
        console.log('[pglite-wasm] falling back to inline PGlite()');
        db = new PGlite();
      open = performance.now() - t0;
      try { await db.query('SELECT 1'); } catch {}
      startup = performance.now() - tStartup0;
      console.log('[pglite-wasm] inline ready in %dms', open.toFixed(1));
      }
    }
  } else {
    const supportsSyncAccessHandle = (() => {
      try {
        // Only exposed in workers in many browsers; check before using inline OPFS
        return typeof FileSystemFileHandle !== 'undefined' &&
               FileSystemFileHandle &&
               FileSystemFileHandle.prototype &&
               'createSyncAccessHandle' in FileSystemFileHandle.prototype &&
               !!(navigator.storage && navigator.storage.getDirectory);
      } catch { return false; }
    })();
    if (policy === 'off') {
      console.log('[pglite-wasm] disk mode with workers=off -> inline PGlite(opfs-ahp)');
      try {
        if (fsKind === 'opfs') {
          if (!supportsSyncAccessHandle) throw new Error('SyncAccessHandle not available on Window');
          const fsmod = await import('/vendor/@electric-sql/pglite/dist/fs/opfs-ahp.js');
          const OpfsAhpFS = fsmod.OpfsAhpFS || fsmod.default?.OpfsAhpFS;
          if (!OpfsAhpFS) throw new Error('Failed to load opfs-ahp filesystem');
          const fs = new OpfsAhpFS('file://bench');
          db = new PGlite({ fs, dataDir: 'file://bench' });
        } else if (fsKind === 'idb') {
          console.warn('[pglite-wasm] SyncAccessHandle not available on Window; falling back to IDBFS');
          db = new PGlite('idb://bench');
        } else {
          // auto: prefer OPFS if supported, else IDBFS
          if (supportsSyncAccessHandle) {
            const fsmod = await import('/vendor/@electric-sql/pglite/dist/fs/opfs-ahp.js');
            const OpfsAhpFS = fsmod.OpfsAhpFS || fsmod.default?.OpfsAhpFS;
            if (!OpfsAhpFS) throw new Error('Failed to load opfs-ahp filesystem');
            const fs = new OpfsAhpFS('file://bench');
            db = new PGlite({ fs, dataDir: 'file://bench' });
          } else {
            db = new PGlite('idb://bench');
          }
        }
        try { if (db.waitReady) { console.log('[pglite-wasm] waiting waitReady()'); await db.waitReady; console.log('[pglite-wasm] waitReady() done'); } } catch (e) { console.warn('[pglite-wasm] waitReady failed:', e); }
      open = performance.now() - t0;
      try { await db.query('SELECT 1'); } catch {}
      startup = performance.now() - tStartup0;
      console.log('[pglite-wasm] inline (disk) ready in %dms', open.toFixed(1));
      } catch (e) {
        console.error('[pglite-wasm] inline (disk) init failed:', e);
        throw e;
      }
    } else {
      try {
        const customWorkerUrl = '/workers/pglite.worker.js';
        console.log('[pglite-wasm] disk mode: creating custom worker at', customWorkerUrl);
        const worker = new Worker(customWorkerUrl, { type: 'module' });
        const wmod = await import('/vendor/@electric-sql/pglite/dist/worker/index.js');
        const PGliteWorker = wmod.PGliteWorker || wmod.default?.PGliteWorker;
        worker.addEventListener('error', (e) => console.error('[pglite-wasm] worker error:', e?.message || e));
        worker.addEventListener('messageerror', (e) => console.error('[pglite-wasm] worker messageerror:', e));
        worker.addEventListener('message', (e) => console.log('[pglite-wasm] worker message:', e?.data?.type || e?.data));
        const init = PGliteWorker.create(worker, { fs: 'opfs-ahp', dataDir: 'file://bench' });
        const guard = Math.max(2000, Math.min(initTimeoutMs || 20000, 60000));
        console.log('[pglite-wasm] waiting for worker init (guard=%dms)', guard);
        const watchdog = new Promise((_, reject) => setTimeout(() => {
          try { worker?.terminate(); console.warn('[pglite-wasm] worker timeout -> terminated'); } catch {}
          reject(new Error('pglite worker init timeout'));
        }, guard));
        db = await Promise.race([init, watchdog]);
        try { if (db.waitReady) { console.log('[pglite-wasm] waiting waitReady()'); await db.waitReady; console.log('[pglite-wasm] waitReady() done'); } } catch (e) { console.warn('[pglite-wasm] waitReady failed:', e); }
        open = performance.now() - t0;
        try { await db.waitReady; } catch {}
        try { await db.query('SELECT 1'); } catch {}
        startup = performance.now() - tStartup0;
        console.log('[pglite-wasm] worker (disk) ready in %dms', open.toFixed(1));
      } catch (e) {
        console.warn('[pglite-wasm] worker (disk) init failed/slow:', e);
        if (!allowFallback) throw e;
        console.log('[pglite-wasm] falling back to inline disk');
        try {
          if (fsKind === 'opfs') {
            if (!supportsSyncAccessHandle) throw new Error('SyncAccessHandle not available on Window');
            const fsmod = await import('/vendor/@electric-sql/pglite/dist/fs/opfs-ahp.js');
            const OpfsAhpFS = fsmod.OpfsAhpFS || fsmod.default?.OpfsAhpFS;
            if (!OpfsAhpFS) throw new Error('Failed to load opfs-ahp filesystem');
            const fs = new OpfsAhpFS('file://bench');
            db = new PGlite({ fs, dataDir: 'file://bench' });
          } else if (fsKind === 'idb') {
            db = new PGlite('idb://bench');
          } else {
            if (supportsSyncAccessHandle) {
              const fsmod = await import('/vendor/@electric-sql/pglite/dist/fs/opfs-ahp.js');
              const OpfsAhpFS = fsmod.OpfsAhpFS || fsmod.default?.OpfsAhpFS;
              if (!OpfsAhpFS) throw new Error('Failed to load opfs-ahp filesystem');
              const fs = new OpfsAhpFS('file://bench');
              db = new PGlite({ fs, dataDir: 'file://bench' });
            } else {
              db = new PGlite('idb://bench');
            }
          }
          try { if (db.waitReady) { console.log('[pglite-wasm] waiting waitReady()'); await db.waitReady; console.log('[pglite-wasm] waitReady() done'); } } catch (e2) { console.warn('[pglite-wasm] waitReady failed:', e2); }
          open = performance.now() - t0;
          try { await db.query('SELECT 1'); } catch {}
          startup = performance.now() - tStartup0;
          console.log('[pglite-wasm] inline (disk) ready in %dms', open.toFixed(1));
        } catch (e2) {
          console.error('[pglite-wasm] inline (disk) init failed:', e2);
          throw e2;
        }
      }
    }
  }

  const adapter = {
    id: 'pglite-wasm',
    async open() { /* already opened */ },
    async exec(sql) { const parts = sql.split(';').map(s=>s.trim()).filter(Boolean); for (const s of parts) await db.query(s); },
    async run(sql, params = []) { await db.query(sql, params); },
    async all(sql, params = []) { const r = await db.query(sql, params); return (r.rows||[]); },
    async beginTransaction() { await db.query('BEGIN'); },
    async commitTransaction() { await db.query('COMMIT'); },
    async rollbackTransaction() { await db.query('ROLLBACK'); },
  };
  const dialect = { schemaSql: `${SQL.postgres.schema}\n${SQL.postgres.truncate}`, queries: SQL.queriesPg };
  const { metrics: core } = await runBench(adapter, dialect, rows);

  let engineVersion = 'unknown';
  try {
    console.log('[pglite-wasm] query engine version');
    const ver = await db.query('select version() as v');
    const first = ver.rows?.[0];
    engineVersion = String(first?.v ?? first?.[0] ?? 'unknown');
  } catch {}

  const result = {
    implementation: 'pglite-wasm',
    engineVersion,
    rows,
    storage: storage === 'disk' && fsKind ? `${storage}-${fsKind}` : storage,
    metrics: { ...core, open, startup: startup ?? open },
    timestamp: new Date().toISOString(),
    environment: { userAgent: navigator.userAgent, fs: fsKind, workers: policy }
  };
  console.log('[pglite-wasm] closing');
  await db.close?.();
  return result;
}

async function runSqliteVecBenchmark(rows, dim = 128, k = 10, repeats = 10) {
  return await new Promise((resolve, reject) => {
    const worker = new Worker('/workers/sqlitevec.worker.js', { type: 'module' });
    const onMsg = (ev) => {
      const { ok, result, error } = ev.data || {};
      worker.terminate();
      if (ok) resolve(result);
      else reject(new Error(error || 'worker failed'));
    };
    worker.onmessage = onMsg;
    worker.onerror = (e) => { worker.terminate(); reject(e.error || new Error(String(e.message || 'worker error'))); };
    worker.postMessage({ cmd: 'run', rows, dim, k, repeats });
  });
}

async function main() {
  const params = new URLSearchParams(location.search);
  const auto = params.get("auto") === "1";
  const timeoutParam = params.get('timeout');
  const defaultTimeout = 120000; // 2 minutes
  const runTimeoutMs = timeoutParam ? Number(timeoutParam) : defaultTimeout;
  try {
    const sqlite3 = await sqlite3InitModule();
    statusEl.textContent = `Loaded sqlite3-wasm ${sqlite3.capi.sqlite3_libversion()}`;
    const runBtn = $("#run");
    const copyBtn = $("#copy");
    // No extra config panels needed for embedded libsql-client-wasm
    runBtn.disabled = false;
    runBtn.onclick = async () => {
      out.textContent = "";
      collectedLogs.length = 0;
      const rows = Number($("#rows").value) || 5000;
      const vecDim = Number($("#vec-dim")?.value || 128);
      const vecK = Number($("#vec-k")?.value || 10);
      const vecRepeats = Number($("#vec-repeats")?.value || 10);
      const storage = (params.get('storage') || 'memory');
      statusEl.textContent = `Running benchmark with ${rows} rows…`;
      try {
        const engine = (document.querySelector('#engine').value || 'sqlite3-wasm');
        const policy = (params.get('workers') || 'prefer');
        const fsKind = (params.get('fs') || 'auto'); // auto|idb|opfs
        const allowFallback = params.get('fallback') === '1';
        const runEngine = async () => {
          if (engine === 'sqlite3-wasm') {
            const fsForSqlite = storage === 'disk' ? (fsKind === 'opfs' ? 'opfs' : 'opfs') : undefined;
            return await runSqlite3WasmBenchmark(sqlite3, rows, storage, policy, fsForSqlite);
          }
          if (engine === 'libsql-client-wasm') return await runLibsqlClientWasmBenchmark(rows, storage, policy, 'opfs');
          if (engine === 'turso-wasm') {
            return await new Promise((resolve, reject) => {
              const worker = new Worker('/workers/turso.worker.js', { type: 'module' });
              worker.onmessage = (ev) => { const { ok, result, error } = ev.data || {}; worker.terminate(); ok ? resolve(result) : reject(new Error(error||'worker failed')); };
              worker.onerror = (e) => { worker.terminate(); reject(e.error || new Error(String(e.message || 'worker error'))); };
              worker.postMessage({ cmd: 'run', rows, SQL });
            });
          }
          if (engine === 'pglite-wasm') return await runPgliteWasmBenchmark(rows, storage, policy, runTimeoutMs, fsKind, allowFallback);
          if (engine === 'sqlite3-vec-wasm') return await runSqliteVecBenchmark(rows, vecDim, vecK, vecRepeats);
          if (engine === 'pglite-vec-wasm') {
            return await new Promise((resolve, reject) => {
              const worker = new Worker('/workers/pglite-vec.worker.js', { type: 'module' });
              worker.onmessage = (ev) => { const { ok, result, error } = ev.data || {}; worker.terminate(); ok ? resolve(result) : reject(new Error(error||'worker failed')); };
              worker.onerror = (e) => { worker.terminate(); reject(e.error || new Error(String(e.message || 'worker error'))); };
              worker.postMessage({ cmd: 'run', rows, dim: vecDim, k: vecK, repeats: vecRepeats });
            });
          }
          throw new Error('Unknown engine selected');
        };
        let timer;
        const watchdog = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Watchdog timeout after ${runTimeoutMs}ms`)), runTimeoutMs);
        });
        const r = await Promise.race([runEngine(), watchdog]);
        clearTimeout(timer);
        let table;
        if (r && r.metrics && Object.prototype.hasOwnProperty.call(r.metrics, 'knn@k')) {
          table = mdTable([
            {
              implementation: r.implementation,
              version: r.packageVersion ?? "-",
              engine: r.engineVersion ?? "-",
              rows: r.rows,
              dim: params.get('dim') || String(vecDim),
              k: params.get('k') || String(vecK),
              repeats: params.get('repeats') || String(vecRepeats),
              schema: r.metrics.schema.toFixed ? r.metrics.schema.toFixed(1) : String(r.metrics.schema),
              "insert xN": r.metrics["insert xN"].toFixed ? r.metrics["insert xN"].toFixed(1) : String(r.metrics["insert xN"]),
              "knn@k": r.metrics["knn@k"].toFixed ? r.metrics["knn@k"].toFixed(1) : String(r.metrics["knn@k"]),
              "knn@k (filtered)": r.metrics["knn@k (filtered)"].toFixed ? r.metrics["knn@k (filtered)"].toFixed(1) : String(r.metrics["knn@k (filtered)"]),
              "knn@k xM": r.metrics["knn@k xM"].toFixed ? r.metrics["knn@k xM"].toFixed(1) : String(r.metrics["knn@k xM"]),
            },
          ]);
        } else {
          table = mdTable([
            {
              implementation: r.implementation,
              version: r.packageVersion ?? "-",
              engine: r.engineVersion ?? "-",
              rows: r.rows,
              open: r.metrics.open.toFixed(1),
              schema: r.metrics.schema.toFixed(1),
              "insert xN": r.metrics["insert xN"].toFixed(1),
              "select-all": r.metrics["select-all"].toFixed(1),
              "select-lookup": r.metrics["select-lookup"].toFixed(1),
              "update xN": r.metrics["update xN"].toFixed(1),
              "delete xN": r.metrics["delete xN"].toFixed(1),
            },
          ]);
        }
        log(table);
        await postLogs({ level: 'info', logs: collectedLogs.map((l) => l.msg) });
        const post = await postResults(r);
        statusEl.textContent = post?.ok ? "Posted results and updated README." : "Done. Could not POST results (check server).";
      } catch (e) {
        console.error('Benchmark failed:', e);
        await postLogs({ level: 'error', error: String(e) });
        statusEl.textContent = 'Error during benchmark. Logs posted.';
      }
    };
    // Allow preselecting engine and rows via query params
    const engineParam = params.get('engine');
    if (engineParam) {
      const sel = document.querySelector('#engine');
      if (sel) sel.value = engineParam;
    }
    const rowsParam = params.get('rows');
    if (rowsParam) {
      const input = document.querySelector('#rows');
      if (input) input.value = rowsParam;
    }
    const dimParam = params.get('dim');
    if (dimParam) { const input = document.querySelector('#vec-dim'); if (input) input.value = dimParam; }
    const kParam = params.get('k');
    if (kParam) { const input = document.querySelector('#vec-k'); if (input) input.value = kParam; }
    const repParam = params.get('repeats');
    if (repParam) { const input = document.querySelector('#vec-repeats'); if (input) input.value = repParam; }

    copyBtn.onclick = () => {
      const text = out.textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        statusEl.textContent = "Copied markdown to clipboard.";
      });
    };
    // Show/hide vector options based on engine selection
    const engineSelect = document.querySelector('#engine');
    const vecPanel = document.querySelector('.vector-opts');
    function updateVecPanel() {
      const val = engineSelect?.value;
      if (vecPanel) vecPanel.style.display = (val === 'sqlite3-vec-wasm' || val === 'pglite-vec-wasm') ? 'inline-block' : 'none';
    }
    engineSelect?.addEventListener('change', updateVecPanel);
    updateVecPanel();

    if (auto) {
      $("#run").click();
    }
    window.addEventListener('error', (ev) => {
      postLogs({ level: 'error', error: String(ev?.error || ev?.message || 'window.error') });
    });
    window.addEventListener('unhandledrejection', (ev) => {
      postLogs({ level: 'error', error: String(ev?.reason || 'unhandledrejection') });
    });
  } catch (e) {
    statusEl.textContent = "Failed to load sqlite3-wasm: " + e;
    postLogs({ level: 'error', error: String(e) });
  }
}

main();
