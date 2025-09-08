// Vector bench for sqlite3-vec (vec0) using @dao-xyz/sqlite3-vec (browser side)
import { runVectorAfterOpen } from '/bench-core-vector.js';
import { createDatabase } from '/vendor/@dao-xyz/sqlite3-vec/dist/unified-browser.js';

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  if (msg?.cmd !== 'run') return;
  const { rows, dim = 128, k = 10, repeats = 10 } = msg;
  try {
    const tStartup0 = performance.now();
    const db = await createDatabase({ directory: 'bench-vec' });
    await db.open();
    try { await db.exec('SELECT 1'); } catch {}
    const startup = performance.now() - tStartup0;
    const adapter = {
      id: 'sqlite3-vec',
      async open() {},
      async exec(sql) { await db.exec(sql); },
      async run(sql, params = []) { const stmt = await db.prepare(sql); stmt.run(params); },
      async all(sql, params = []) { const stmt = await db.prepare(sql); return stmt.all(params); },
      async beginTransaction() { await db.exec('BEGIN'); },
      async commitTransaction() { await db.exec('COMMIT'); },
      async rollbackTransaction() { await db.exec('ROLLBACK'); },
    };

    // vec0 virtual table; metadata in side table keyed by rowid
    const schemaSql = `PRAGMA journal_mode = WAL;\nPRAGMA synchronous = NORMAL;\n` +
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec USING vec0(vector float[${dim}]);\n` +
      `CREATE TABLE IF NOT EXISTS meta(rowid INTEGER PRIMARY KEY, tag INTEGER, value REAL);`;
    const dialect = {
      schemaSql,
      async insert(ad, rowid, vec, tag, value) {
        // vec0 expects a BLOB of the float32 buffer; bind as Uint8Array
        const blob = new Uint8Array(vec.buffer);
        await ad.run('INSERT INTO vec(rowid,vector) VALUES(?1,?2)', [rowid, blob]);
        await ad.run('INSERT INTO meta(rowid,tag,value) VALUES(?1,?2,?3)', [rowid, tag, value]);
      },
      knn(vec, kk) {
        const blob = new Uint8Array(vec.buffer);
        return { sql: `SELECT rowid, vec_distance_l2(vector, ?1) AS d FROM vec ORDER BY d LIMIT ${kk}`, params: [blob] };
      },
      knnFilter(vec, tag, kk) {
        const blob = new Uint8Array(vec.buffer);
        return { sql: `SELECT v.rowid, vec_distance_l2(v.vector, ?1) AS d FROM vec v JOIN meta m ON m.rowid=v.rowid WHERE m.tag=?2 ORDER BY d LIMIT ${kk}`, params: [blob, tag] };
      },
    };

    // Determine if existing data is already present (skip inserts on warm runs)
    let skipInsert = false;
    try {
      const r = await adapter.all('SELECT COUNT(*) AS c FROM meta');
      const c = Number(r?.[0]?.c ?? r?.[0]?.[0] ?? 0);
      if (c >= rows) skipInsert = true;
    } catch {}

    const metrics = await runVectorAfterOpen(adapter, dialect, { rows, dim, k, repeats, skipInsert });
    metrics.startup = startup;
    await db.close();
    const result = {
      implementation: 'sqlite3-vec-wasm',
      engineVersion: '-',
      rows,
      dim,
      k,
      repeats,
      storage: 'disk-opfs',
      metrics,
      timestamp: new Date().toISOString(),
      environment: { userAgent: self.navigator?.userAgent },
    };
    postMessage({ ok: true, result });
  } catch (e) {
    postMessage({ ok: false, error: String(e) });
  }
};
