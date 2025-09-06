// Module worker to run a libsql-like benchmark using sqlite3 WASM under the hood
// This avoids worker import-map issues while keeping Worker-only execution.
import sqlite3InitModule from '/vendor/@libsql/client-wasm/node_modules/@libsql/libsql-wasm-experimental/sqlite-wasm/jswasm/sqlite3.mjs';

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  if (msg?.cmd !== 'run') return;
  const { rows, storage, SQL } = msg;
  try {
    const t0 = performance.now();
    const sqlite3 = await sqlite3InitModule();
    const db = storage === 'disk'
      ? new sqlite3.oo1.DB('file:bench.db?vfs=opfs')
      : new sqlite3.oo1.DB();
    const open = performance.now() - t0;

    const schemaSQL = `${SQL.sqlite.schema};\n${SQL.sqlite.truncate};`;
    const t1 = performance.now();
    db.exec(schemaSQL);
    const schema = performance.now() - t1;

    const t2 = performance.now();
    db.exec('BEGIN');
    try {
      const stmt = db.prepare(SQL.queries.insert);
      for (let i = 0; i < rows; i++) {
        stmt.bind([`name_${i}`, i % 100, Date.now()]).step();
        stmt.reset();
      }
      stmt.finalize();
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    const insertN = performance.now() - t2;

    const t3 = performance.now();
    let count = 0;
    db.exec({ sql: SQL.queries.selectAll, rowMode: 'object', callback() { count++; } });
    const selectAll = performance.now() - t3;

    const lookups = Math.min(1000, rows);
    const ids = Array.from({ length: lookups }, () => 1 + Math.floor(Math.random() * rows));
    const t4 = performance.now();
    const sel = db.prepare(SQL.queries.selectById);
    for (const id of ids) { sel.bind([id]).step(); sel.reset(); }
    sel.finalize();
    const selectLookup = performance.now() - t4;

    const updates = Math.max(1, Math.floor(rows / 10));
    const t5 = performance.now();
    db.exec('BEGIN');
    try {
      const stmt = db.prepare(SQL.queries.update);
      for (let i = 0; i < updates; i++) {
        const id = 1 + Math.floor(Math.random() * rows);
        stmt.bind([Math.random() * 1000, id]).step();
        stmt.reset();
      }
      stmt.finalize();
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    const updateN = performance.now() - t5;

    const deletes = updates;
    const t6 = performance.now();
    db.exec('BEGIN');
    try {
      const stmt = db.prepare(SQL.queries.delete);
      for (let i = 0; i < deletes; i++) {
        const id = 1 + Math.floor(Math.random() * rows);
        stmt.bind([id]).step();
        stmt.reset();
      }
      stmt.finalize();
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    const deleteN = performance.now() - t6;

    const engineVersion = sqlite3.capi.sqlite3_libversion();
    const result = {
      implementation: 'libsql-client-wasm',
      engineVersion,
      rows,
      storage,
      metrics: { open, schema, 'insert xN': insertN, 'select-all': selectAll, 'select-lookup': selectLookup, 'update xN': updateN, 'delete xN': deleteN },
      timestamp: new Date().toISOString(),
      environment: { userAgent: self.navigator?.userAgent, via: 'libsql-worker-shim' }
    };
    db.close();
    postMessage({ ok: true, result });
  } catch (e) {
    postMessage({ ok: false, error: String(e) });
  }
};
