// Custom PGlite worker that initializes the DB and exposes it to tabs
import { worker } from '/vendor/@electric-sql/pglite/dist/worker/index.js';
import { PGlite } from '/vendor/@electric-sql/pglite/dist/index.js';

// Prefer OPFS AHP in worker; fall back to IDBFS if OPFS not available
async function initPGlite() {
  try {
    const fsmod = await import('/vendor/@electric-sql/pglite/dist/fs/opfs-ahp.js');
    const OpfsAhpFS = fsmod.OpfsAhpFS || fsmod.default?.OpfsAhpFS;
    if (!OpfsAhpFS) throw new Error('opfs-ahp missing');
    const fs = new OpfsAhpFS('file://bench');
    return new PGlite({ fs, dataDir: 'file://bench' });
  } catch (e) {
    // Fallback to IDBFS
    return new PGlite('idb://bench');
  }
}

worker({
  async init() {
    return await initPGlite();
  },
});

