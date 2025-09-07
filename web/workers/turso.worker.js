// Worker to run Turso Database (in-memory) via WASM/WASI
import { runSqliteBench } from '/bench-core.js';

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  if (msg?.cmd !== 'run') return;
  const { rows, SQL } = msg;
  try {
    const mod = await import('/vendor/@tursodatabase/database-wasm32-wasi/turso.wasi-browser.js');
    const NativeDB = mod.Database || mod.default?.Database || mod.default;
    if (!NativeDB) throw new Error('Failed to load Turso WASI Database');
    const tStartup0 = performance.now();
    const db = new NativeDB(':memory:');
    // Startup: minimal probe
    const open = 0;
    try { db.batch('SELECT 1'); } catch {}
    const startup = performance.now() - tStartup0;

    const adapter = {
      id: 'turso-wasm',
      async open() {},
      async exec(sql) { db.batch(sql); },
      async run(sql, params = []) {
        const stmt = db.prepare(sql);
        try {
          if (params && params.length) stmt.bind(...params);
          // step until done; ignore row results
          // 1=row, 2=done, 3=io
          while (true) {
            const r = stmt.step();
            if (r === 2) break;
            if (r !== 1 && r !== 3) break;
            if (r === 3 && typeof db.ioLoopAsync === 'function') await db.ioLoopAsync();
          }
        } finally {
          try { stmt.finalize?.(); } catch {}
        }
      },
      async all(sql, params = []) {
        const stmt = db.prepare(sql);
        const out = [];
        try {
          if (params && params.length) stmt.bind(...params);
          while (true) {
            const r = stmt.step();
            if (r === 1) { out.push(stmt.row()); continue; }
            if (r === 3 && typeof db.ioLoopAsync === 'function') { await db.ioLoopAsync(); continue; }
            break;
          }
        } finally {
          try { stmt.finalize?.(); } catch {}
        }
        return out;
      },
      async beginTransaction() { db.batch('BEGIN'); },
      async commitTransaction() { db.batch('COMMIT'); },
      async rollbackTransaction() { db.batch('ROLLBACK'); },
    };
    const { metrics: core } = await runSqliteBench(adapter, SQL, rows);
    // engineVersion if possible
    let engineVersion = 'unknown';
    try { const one = db.prepare('select sqlite_version() as v').get(); engineVersion = String(one?.v ?? one?.[0] ?? 'unknown'); } catch {}
    const result = {
      implementation: 'turso-wasm',
      engineVersion,
      rows,
      storage: 'memory',
      metrics: { ...core, startup, open },
      timestamp: new Date().toISOString(),
      environment: { userAgent: self.navigator?.userAgent, via: 'turso-wasi' },
    };
    postMessage({ ok: true, result });
  } catch (e) {
    postMessage({ ok: false, error: String(e) });
  }
};
