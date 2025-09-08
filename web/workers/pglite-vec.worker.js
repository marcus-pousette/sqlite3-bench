// Vector bench for PGlite in browser (disk OPFS) using array math fallback
import { runVectorAfterOpen } from '/bench-core-vector.js';

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  if (msg?.cmd !== 'run') return;
  const { rows, dim = 128, k = 10, repeats = 10 } = msg;
  try {
    const tStartup0 = performance.now();
    const mod = await import('/vendor/@electric-sql/pglite/dist/index.js');
    const fsmod = await import('/vendor/@electric-sql/pglite/dist/fs/opfs-ahp.js');
    const PGlite = mod.PGlite || mod.default?.PGlite;
    const OpfsAhpFS = fsmod.OpfsAhpFS || fsmod.default?.OpfsAhpFS;
    const fs = new OpfsAhpFS('file://bench-vec');
    const db = new PGlite({ fs, dataDir: 'file://bench-vec' });
    try { await db.query('SELECT 1'); } catch {}
    const startup = performance.now() - tStartup0;
    const adapter = {
      id: 'pglite-wasm',
      async exec(sql) { const parts = String(sql).split(';').map(s=>s.trim()).filter(Boolean); for (const s of parts) await db.query(s); },
      async run(sql, params = []) { await db.query(sql, params); },
      async all(sql, params = []) { const res = await db.query(sql, params); return (res.rows || []); },
      async beginTransaction() { await db.query('BEGIN'); },
      async commitTransaction() { await db.query('COMMIT'); },
      async rollbackTransaction() { await db.query('ROLLBACK'); },
    };

    // Array-based dialect (no pgvector extension in browser build)
    const toArr = (v) => '{' + Array.from(v).join(',') + '}';
    const schemaSql = `CREATE TABLE IF NOT EXISTS vec(id BIGINT PRIMARY KEY, vector DOUBLE PRECISION[], tag INTEGER, value DOUBLE PRECISION);\n` +
      `CREATE INDEX IF NOT EXISTS vec_tag_idx ON vec(tag);`;
    const dialect = {
      schemaSql,
      async insert(ad, rowid, vec, tag, value) {
        await ad.run('INSERT INTO vec(id,vector,tag,value) VALUES($1,$2::float8[],$3,$4) ON CONFLICT(id) DO NOTHING', [rowid, toArr(vec), tag, value]);
      },
      knn(vec, kk) {
        const base = `WITH params(p) AS (SELECT $1::float8[]) SELECT id, sqrt(SUM(POWER(vector[i]-p[i],2))) AS d FROM vec, params, generate_subscripts(vector,1) AS i GROUP BY id ORDER BY d ASC LIMIT ${kk}`;
        return { sql: base, params: [toArr(vec)] };
      },
      knnFilter(vec, tag, kk) {
        const base = `WITH params(p) AS (SELECT $1::float8[]) SELECT id, sqrt(SUM(POWER(v.vector[i]-p[i],2))) AS d FROM vec v, params, generate_subscripts(v.vector,1) AS i WHERE v.tag=$2 GROUP BY id ORDER BY d ASC LIMIT ${kk}`;
        return { sql: base, params: [toArr(vec), tag] };
      },
    };

    // Check warm start (existing data)
    let skipInsert = false;
    try {
      const r = await adapter.all('SELECT COUNT(*) AS c FROM vec');
      const c = Number(r?.[0]?.c ?? r?.[0]?.[0] ?? 0);
      if (c >= rows) skipInsert = true;
    } catch {}

    const metrics = await runVectorAfterOpen(adapter, dialect, { rows, dim, k, repeats, skipInsert });
    metrics.startup = startup;
    await db.close?.();
    const result = {
      implementation: 'pglite-vec-wasm',
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
