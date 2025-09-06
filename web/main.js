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
  const t0 = performance.now();
  const client = await createClient({ url });
  const open = performance.now() - t0;
  async function execMulti(sql) {
    const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const s of stmts) await client.execute(s);
  }
  const schemaSQL = `${SQL.sqlite.schema};\n${SQL.sqlite.truncate};`;
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
    metrics: { open, schema, 'insert xN': insertN, 'select-all': selectAll, 'select-lookup': selectLookup, 'update xN': updateN, 'delete xN': deleteN },
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
  const PGlite = mod.PGlite || mod.default?.PGlite;
  if (!PGlite) throw new Error('Failed to load @electric-sql/pglite');
  let db;
  let open;
  const t0 = performance.now();
  console.log('[pglite-wasm] init: storage=%s policy=%s timeout=%sms COI=%s', storage, policy, initTimeoutMs, String(self.crossOriginIsolated));
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
        console.log('[pglite-wasm] worker ready in %dms', open.toFixed(1));
      } catch (e) {
        console.warn('[pglite-wasm] worker (memory) init failed/slow:', e);
        if (!allowFallback) throw e;
        console.log('[pglite-wasm] falling back to inline PGlite()');
        db = new PGlite();
        open = performance.now() - t0;
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
          console.log('[pglite-wasm] inline (disk) ready in %dms', open.toFixed(1));
        } catch (e2) {
          console.error('[pglite-wasm] inline (disk) init failed:', e2);
          throw e2;
        }
      }
    }
  }

  const schemaSQL = `${SQL.postgres.schema};\n${SQL.postgres.truncate};`;
  const t1 = performance.now();
  // Execute statements sequentially (simple splitter)
  const schemaParts = schemaSQL.split(';').map(s => s.trim()).filter(Boolean);
  console.log('[pglite-wasm] schema: %d statements', schemaParts.length);
  for (let i = 0; i < schemaParts.length; i++) {
    const s = schemaParts[i];
    const ts = performance.now();
    try {
      await db.query(s);
      console.log('[pglite-wasm] schema stmt %d ok in %dms', i + 1, (performance.now() - ts).toFixed(1));
    } catch (e) {
      console.error('[pglite-wasm] schema stmt %d failed:', i + 1, e, s.slice(0, 120));
      throw e;
    }
  }
  const schema = performance.now() - t1;
  console.log('[pglite-wasm] schema done in %dms', schema.toFixed(1));

  const t2 = performance.now();
  console.log('[pglite-wasm] insert: BEGIN');
  await db.query('BEGIN');
  try {
    const logEvery = Math.max(1, Math.floor(rows / 10));
    for (let i = 0; i < rows; i++) {
      const name = `name_${i}`;
      const value = i % 100;
      const created = Date.now();
      await db.query('INSERT INTO bench (name, value, created_at) VALUES ($1, $2, $3)', [name, value, created]);
      if ((i + 1) % logEvery === 0) console.log('[pglite-wasm] insert progress %d/%d', i + 1, rows);
    }
    await db.query('COMMIT');
    console.log('[pglite-wasm] insert: COMMIT');
  } catch (e) {
    console.warn('[pglite-wasm] insert failed, ROLLBACK');
    await db.query('ROLLBACK');
    throw e;
  }
  const insertN = performance.now() - t2;
  console.log('[pglite-wasm] insert xN done in %dms', insertN.toFixed(1));

  const t3 = performance.now();
  console.log('[pglite-wasm] select-all');
  const all = await db.query('SELECT * FROM bench');
  void all.rows?.length;
  const selectAll = performance.now() - t3;
  console.log('[pglite-wasm] select-all done in %dms', selectAll.toFixed(1));

  const lookups = Math.min(1000, rows);
  const ids = Array.from({ length: lookups }, () => 1 + Math.floor(Math.random() * rows));
  const t4 = performance.now();
  console.log('[pglite-wasm] select-lookup x%d', lookups);
  for (const id of ids) {
    await db.query('SELECT * FROM bench WHERE id = $1', [id]);
  }
  const selectLookup = performance.now() - t4;
  console.log('[pglite-wasm] select-lookup done in %dms', selectLookup.toFixed(1));

  const updates = Math.max(1, Math.floor(rows / 10));
  const t5 = performance.now();
  console.log('[pglite-wasm] update x%d: BEGIN', updates);
  await db.query('BEGIN');
  try {
    for (let i = 0; i < updates; i++) {
      const id = 1 + Math.floor(Math.random() * rows);
      const nv = Math.random() * 1000;
      await db.query('UPDATE bench SET value = $1 WHERE id = $2', [nv, id]);
    }
    await db.query('COMMIT');
    console.log('[pglite-wasm] update: COMMIT');
  } catch (e) {
    console.warn('[pglite-wasm] update failed, ROLLBACK');
    await db.query('ROLLBACK');
    throw e;
  }
  const updateN = performance.now() - t5;
  console.log('[pglite-wasm] update xN done in %dms', updateN.toFixed(1));

  const deletes = updates;
  const t6 = performance.now();
  console.log('[pglite-wasm] delete x%d: BEGIN', deletes);
  await db.query('BEGIN');
  try {
    for (let i = 0; i < deletes; i++) {
      const id = 1 + Math.floor(Math.random() * rows);
      await db.query('DELETE FROM bench WHERE id = $1', [id]);
    }
    await db.query('COMMIT');
    console.log('[pglite-wasm] delete: COMMIT');
  } catch (e) {
    console.warn('[pglite-wasm] delete failed, ROLLBACK');
    await db.query('ROLLBACK');
    throw e;
  }
  const deleteN = performance.now() - t6;
  console.log('[pglite-wasm] delete xN done in %dms', deleteN.toFixed(1));

  if (storage === 'disk' && db.syncToFs) {
    try { console.log('[pglite-wasm] final syncToFs'); await db.syncToFs(); } catch (e) { console.warn('[pglite-wasm] final syncToFs failed:', e); }
  }

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
    metrics: { open, schema, 'insert xN': insertN, 'select-all': selectAll, 'select-lookup': selectLookup, 'update xN': updateN, 'delete xN': deleteN },
    timestamp: new Date().toISOString(),
    environment: { userAgent: navigator.userAgent, fs: fsKind, workers: policy }
  };
  console.log('[pglite-wasm] closing');
  await db.close?.();
  return result;
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
          if (engine === 'pglite-wasm') return await runPgliteWasmBenchmark(rows, storage, policy, runTimeoutMs, fsKind, allowFallback);
          throw new Error('Unknown engine selected');
        };
        let timer;
        const watchdog = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Watchdog timeout after ${runTimeoutMs}ms`)), runTimeoutMs);
        });
        const r = await Promise.race([runEngine(), watchdog]);
        clearTimeout(timer);
        const table = mdTable([
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

    copyBtn.onclick = () => {
      const text = out.textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        statusEl.textContent = "Copied markdown to clipboard.";
      });
    };
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
