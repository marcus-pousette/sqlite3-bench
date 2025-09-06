// Shared browser bench core to mirror Node's sequence.
// Expects an adapter with: id, open(), exec(sql), run(sql, params), all(sql, params),
// and optional beginTransaction/commitTransaction/rollbackTransaction.
// Returns { metrics, engineVersion? } where metrics matches Node names.

export async function runBench(adapter, dialect, rows) {
  const metrics = {
    open: 0,
    schema: 0,
    'insert xN': 0,
    'select-all': 0,
    'select-lookup': 0,
    'update xN': 0,
    'delete xN': 0,
  };

  // open
  const t0 = performance.now();
  await adapter.open();
  metrics.open = performance.now() - t0;

  // schema
  const schemaSql = dialect.schemaSql;
  const t1 = performance.now();
  await adapter.exec(schemaSql);
  metrics.schema = performance.now() - t1;

  // insert N rows in a transaction
  const t2 = performance.now();
  if (adapter.beginTransaction) await adapter.beginTransaction();
  try {
    for (let i = 0; i < rows; i++) {
      const name = `name_${i}`;
      const value = i % 100;
      const created = Date.now();
      await adapter.run(dialect.queries.insert, [name, value, created]);
    }
    if (adapter.commitTransaction) await adapter.commitTransaction();
  } catch (e) {
    if (adapter.rollbackTransaction) await adapter.rollbackTransaction();
    throw e;
  }
  metrics['insert xN'] = performance.now() - t2;

  // select-all
  const t3 = performance.now();
  const all = await adapter.all(dialect.queries.selectAll);
  void all.length;
  metrics['select-all'] = performance.now() - t3;

  // select-lookup
  const lookups = Math.min(1000, rows);
  const ids = Array.from({ length: lookups }, () => 1 + Math.floor(Math.random() * rows));
  const t4 = performance.now();
  for (const id of ids) {
    const one = await adapter.all(dialect.queries.selectById, [id]);
    void one[0];
  }
  metrics['select-lookup'] = performance.now() - t4;

  // update N/10 rows
  const updates = Math.max(1, Math.floor(rows / 10));
  const t5 = performance.now();
  if (adapter.beginTransaction) await adapter.beginTransaction();
  try {
    for (let i = 0; i < updates; i++) {
      const id = 1 + Math.floor(Math.random() * rows);
      const nv = Math.random() * 1000;
      await adapter.run(dialect.queries.update, [nv, id]);
    }
    if (adapter.commitTransaction) await adapter.commitTransaction();
  } catch (e) {
    if (adapter.rollbackTransaction) await adapter.rollbackTransaction();
    throw e;
  }
  metrics['update xN'] = performance.now() - t5;

  // delete N/10 rows
  const deletes = updates;
  const t6 = performance.now();
  if (adapter.beginTransaction) await adapter.beginTransaction();
  try {
    for (let i = 0; i < deletes; i++) {
      const id = 1 + Math.floor(Math.random() * rows);
      await adapter.run(dialect.queries.delete, [id]);
    }
    if (adapter.commitTransaction) await adapter.commitTransaction();
  } catch (e) {
    if (adapter.rollbackTransaction) await adapter.rollbackTransaction();
    throw e;
  }
  metrics['delete xN'] = performance.now() - t6;

  return { metrics };
}

// Back-compat convenience for sqlite
export async function runSqliteBench(adapter, SQL, rows) {
  const dialect = { schemaSql: `${SQL.sqlite.schema}\n${SQL.sqlite.truncate}`, queries: SQL.queries };
  return runBench(adapter, dialect, rows);
}
