// Module worker to run a libsql-like benchmark using sqlite3 WASM under the hood
// This avoids worker import-map issues while keeping Worker-only execution.
import sqlite3InitModule from '/vendor/@libsql/client-wasm/node_modules/@libsql/libsql-wasm-experimental/sqlite-wasm/jswasm/sqlite3.mjs';
import { runSqliteBench } from '/bench-core.js';

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  if (msg?.cmd !== 'run') return;
  const { rows, storage, SQL } = msg;
  try {
    const tStartup0 = performance.now();
    const t0 = performance.now();
    const sqlite3 = await sqlite3InitModule();
    const db = storage === 'disk'
      ? new sqlite3.oo1.DB('file:bench.db?vfs=opfs')
      : new sqlite3.oo1.DB();
    const open = performance.now() - t0;
    try { db.exec('SELECT 1'); } catch {}
    const startup = performance.now() - tStartup0;

    // Adapter wrapper and shared bench
    const adapter = {
      id: 'libsql-client-wasm',
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
      implementation: 'libsql-client-wasm',
      engineVersion,
      rows,
      storage,
      metrics: { ...core, open, startup },
      timestamp: new Date().toISOString(),
      environment: { userAgent: self.navigator?.userAgent, via: 'libsql-worker-shim' }
    };
    db.close();
    postMessage({ ok: true, result });
  } catch (e) {
    postMessage({ ok: false, error: String(e) });
  }
};
