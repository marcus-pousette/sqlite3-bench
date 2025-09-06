// Module worker running official sqlite3-wasm with OPFS VFS
import sqlite3InitModule from '/vendor/@libsql/client-wasm/node_modules/@libsql/libsql-wasm-experimental/sqlite-wasm/jswasm/sqlite3.mjs';
import { runSqliteBench } from '/bench-core.js';

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  if (msg?.cmd !== 'run') return;
  const { rows, SQL, storage, fs: fsKind } = msg;
  try {
    const tStartup0 = performance.now();
    const t0 = performance.now();
    const sqlite3 = await sqlite3InitModule();
    // Open DB: memory vs OPFS-backed depending on storage
    let db;
    let storageLabel = storage || 'memory';
    if (storage === 'disk') {
      if (fsKind && fsKind !== 'opfs') {
        throw new Error(`sqlite3-wasm: fs=${fsKind} not supported (only opfs)`);
      }
      db = new sqlite3.oo1.DB('file:bench.db?vfs=opfs');
      storageLabel = 'disk-opfs';
    } else {
      db = new sqlite3.oo1.DB();
    }
    const open = performance.now() - t0;
    // First successful request
    try { db.exec('SELECT 1'); } catch {}
    const startup = performance.now() - tStartup0;

    // Wrap DB in adapter and delegate to shared bench
    const adapter = {
      id: 'sqlite3-wasm',
      async open() { /* already opened */ },
      async exec(sql) { db.exec(sql); },
      async run(sql, params = []) {
        const stmt = db.prepare(sql);
        try {
          if (params && params.length) stmt.bind(params);
          stmt.step();
        } finally { try { stmt.finalize(); } catch {} }
      },
      async all(sql, params = []) {
        const rows = [];
        db.exec({ sql, bind: params && params.length ? params : undefined, rowMode: 'object', callback: (row) => { rows.push(row); } });
        return rows;
      },
      async beginTransaction() { db.exec('BEGIN'); },
      async commitTransaction() { db.exec('COMMIT'); },
      async rollbackTransaction() { db.exec('ROLLBACK'); },
    };

    const { metrics: core } = await runSqliteBench(adapter, SQL, rows);

    const engineVersion = sqlite3.capi.sqlite3_libversion();
    const result = {
      implementation: 'sqlite3-wasm',
      engineVersion,
      rows,
      storage: storageLabel,
      metrics: { ...core, open, startup },
      timestamp: new Date().toISOString(),
      environment: { userAgent: self.navigator?.userAgent, via: 'sqlite3-worker', fs: storage === 'disk' ? 'opfs' : 'memory' }
    };
    db.close();
    postMessage({ ok: true, result });
  } catch (e) {
    postMessage({ ok: false, error: String(e) });
  }
};
