import type { DBAdapter } from './types.ts';

export type VectorBenchOptions = {
  rows: number;
  dim: number;
  k: number;
  repeats: number; // repeated knn for amortized timing
  skipInsert?: boolean; // when true, skip inserts (e.g., persistent db already populated)
};

export type VectorDialect = {
  // SQL to initialize schema; should create vector storage and optional metadata table
  schemaSql: string;
  // Insert one vector row with optional metadata
  insert(adapter: DBAdapter, rowid: number, vec: Float32Array, tag: number, value: number): Promise<void>;
  // KNN: returns SQL and params given a probe vector
  knn(vec: Float32Array, k: number): { sql: string; params: unknown[] };
  // Filter + KNN on tag equality
  knnFilter(vec: Float32Array, tag: number, k: number): { sql: string; params: unknown[] };
};

export type VectorMetrics = {
  startup?: number;
  schema: number;
  'insert xN': number;
  'knn@k': number;
  'knn@k (filtered)': number;
  'knn@k xM': number;
};

export async function runVectorAfterOpen(
  adapter: DBAdapter,
  dialect: VectorDialect,
  opts: VectorBenchOptions,
  rng: () => number = Math.random,
): Promise<VectorMetrics> {
  const metrics: VectorMetrics = {
    schema: 0,
    'insert xN': 0,
    'knn@k': 0,
    'knn@k (filtered)': 0,
    'knn@k xM': 0,
  };

  const { rows, dim, k, repeats, skipInsert } = opts;

  // schema
  const t1 = performance.now();
  await adapter.exec(dialect.schemaSql);
  metrics.schema = performance.now() - t1;

  // helper: random vector (Float32Array)
  const mkVec = () => {
    const v = new Float32Array(dim);
    for (let i = 0; i < dim; i++) v[i] = rng();
    return v;
  };

  // insert rows in a txn (unless skipped)
  if (skipInsert) {
    metrics['insert xN'] = 0;
  } else {
    const t2 = performance.now();
    if (adapter.beginTransaction) await adapter.beginTransaction();
    try {
      for (let i = 1; i <= rows; i++) {
        const vec = mkVec();
        const tag = Math.floor(rng() * 100);
        const val = rng() * 1000;
        await dialect.insert(adapter, i, vec, tag, val);
      }
      if (adapter.commitTransaction) await adapter.commitTransaction();
    } catch (e) {
      if (adapter.rollbackTransaction) await adapter.rollbackTransaction();
      throw e;
    }
    metrics['insert xN'] = performance.now() - t2;
  }

  // single knn
  const probe = mkVec();
  const q1 = dialect.knn(probe, k);
  const t3 = performance.now();
  await adapter.all(q1.sql, q1.params);
  metrics['knn@k'] = performance.now() - t3;

  // filter + knn
  const q2 = dialect.knnFilter(probe, 42, k);
  const t4 = performance.now();
  await adapter.all(q2.sql, q2.params);
  metrics['knn@k (filtered)'] = performance.now() - t4;

  // repeated knn (amortized)
  const t5 = performance.now();
  for (let i = 0; i < repeats; i++) {
    const p = mkVec();
    const q = dialect.knn(p, k);
    await adapter.all(q.sql, q.params);
  }
  metrics['knn@k xM'] = performance.now() - t5;

  return metrics;
}
