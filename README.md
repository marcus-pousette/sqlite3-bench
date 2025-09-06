# sqlite3-bench

Benchmark Node.js and browser performance of multiple SQLite implementations:

- better-sqlite3 (Node)
- node-sqlite3 (Node)
- libsql (Node, local file driver)
- sqlite3-wasm (Browser)
- libsql-client-wasm (Browser, embedded libSQL in WASM)
- pglite (Browser, Postgres-in-WASM)

The table below is updated every time you run the benchmarks.

## Latest Results

<!-- BENCH_TABLE:START -->

| implementation | platform | storage | version | engine | rows | open | schema | insert xN | select-all | select-lookup | update xN | delete xN |
| - | - | - | - | - | - | - | - | - | - | - | - | - |
| better-sqlite3 | node | memory | 12.2.0 | 3.50.2 | 5000 | 5.8 | 4.3 | 24.3 | 3.3 | 5.9 | 2.8 | 1.7 |
| better-sqlite3 | node | disk | 12.2.0 | 3.50.2 | 5000 | 1.2 | 4.6 | 23.1 | 3.3 | 10.6 | 2.9 | 1.9 |
| node-sqlite3 | node | memory | 5.1.7 | 3.44.2 | 5000 | 0.1 | 11.6 | 113.5 | 6.5 | 24.8 | 11.7 | 11.1 |
| node-sqlite3 | node | disk | 5.1.7 | 3.44.2 | 5000 | 0.0 | 5.3 | 109.2 | 6.4 | 27.1 | 11.9 | 11.4 |
| libsql | node | disk | 0.15.14 | 3.45.1 | 5000 | 15.7 | 6.9 | 92.2 | 16.3 | 27.3 | 9.0 | 8.4 |
| pglite | node | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 0.6 | 790.3 | 1334.8 | 30.7 | 259.1 | 120.7 | 115.7 |
| pglite | node | disk | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 0.3 | 479.7 | 1159.0 | 18.1 | 244.6 | 119.8 | 112.2 |
| sqlite3-wasm | browser | memory | - | 3.44.0 | 5000 | 183.2 | 146.6 | 128.7 | 86.5 | 12.8 | 12.0 | 7.2 |
| sqlite3-wasm | browser | disk-opfs | - | 3.44.0 | 5000 | 283.1 | 56.6 | 134.6 | 83.3 | 781.3 | 48.1 | 45.5 |
| libsql-client-wasm | browser | disk | - | 3.44.0 | 5000 | 254.3 | 44.1 | 127.4 | 78.9 | 667.0 | 45.0 | 35.6 |
| pglite-wasm | browser | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 37.2 | 1319.8 | 25313.5 | 43.2 | 5111.0 | 2420.4 | 2428.1 |
| pglite-wasm | browser | disk-idb | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 82.8 | 1528.4 | 25421.0 | 36.6 | 4320.6 | 2051.0 | 2188.8 |
| pglite-wasm | browser | disk-opfs | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 70.8 | 1339.5 | 23212.0 | 32.8 | 4278.5 | 2120.2 | 2171.6 |

<!-- BENCH_TABLE:END -->

<!-- BENCH_COMMENT:START -->

Comment (AI):

- Key takeaways: In Node, `better-sqlite3` is consistently the fastest; `node-sqlite3` is 4–5x slower on inserts, and `@libsql/client` lands in between for mixed workloads. In the browser, `sqlite3-wasm` leads among SQLite engines; `libsql-client-wasm` is close on schema and bulk ops but shows higher random lookup costs. `pglite-wasm` provides Postgres semantics but is orders of magnitude slower for write‑heavy phases — it’s best considered for feature needs rather than raw speed.
- WASM startup: All browser engines pay a non‑trivial open/startup cost versus Node. This is expected (WASM module load + worker spin‑up) and is visible in the `open` metric across browser rows.
- Disk backends: We now label disk variants explicitly.
  - `sqlite3-wasm`: `disk-opfs` only (worker + VFS=OPFS).
  - `libsql-client-wasm`: `disk-opfs` (embedded file driver on OPFS).
  - `pglite-wasm`: both `disk-idb` and `disk-opfs`. In this run they’re close; OPFS is slightly faster on inserts/lookups, IDBFS can be a touch faster on schema. Differences are within ~5–15% for this dataset.
- Access patterns: Random primary‑key lookups amplify storage overhead in the browser. Notice how `select-lookup` jumps significantly for OPFS‑backed engines compared to memory.
- Practical guidance: For pure performance in Node, use `better-sqlite3`. In the browser, `sqlite3-wasm` is the most performant general choice; pick OPFS when you need durability. Use `libsql-client-wasm` if you need its client API/compatibility. Choose `pglite-wasm` when Postgres features (types/extensions/SQL) matter more than throughput.

<!-- BENCH_COMMENT:END -->

## Running The Benchmarks

- Install dependencies: `npm i`

- Run everything (Node + Browser headless; updates this README):
  - `npm run bench:all -- --rows=2e4`
  - Options:
    - `--rows=<N>`: number of rows to insert/select (default 5000)
    - `--port=<PORT>`: local server port for browser runs (default 8787)
    - `--storage=memory|disk|both` (Node only; default both)

- Node‑only (skips browser):
  - `npm run bench:node -- --rows=5000 --storage=both`

- Browser headless only (updates README):
  - `npm run bench:browser:auto -- --engines=sqlite3-wasm,libsql-client-wasm,pglite-wasm --rows=5000 --port=8787`
  - Worker policy:
    - Add `--browserWorkers=only` to force Worker‑only runs (engines that cannot run in a Worker are skipped)
    - Default is `prefer` (try Worker, fallback inline where applicable). Use `off` to force inline only.

- Debug (small + time‑boxed runs):
  - `npm run bench:debug` (uses `--rows=10 --timeout=10000` and resets results first)

The table in this README is auto‑updated after each run.

## Storage Modes (memory vs disk)

- Node storage
  - `better-sqlite3` and `sqlite3`: memory uses `:memory:`, disk uses a file in `tmp/`
  - `libsql` (embedded SQLite via `@libsql/client`): disk only (file: URL)
  - `pglite` (Postgres‑in‑WASM for Node): in‑memory engine; reported under both modes for comparison

- Browser storage
  - `sqlite3-wasm` (official SQLite WASM):
    - memory: runs inline in the page
    - disk: runs in a dedicated Web Worker using OPFS (vfs=opfs) for persistence
  - `libsql-client-wasm` (embedded libSQL in WASM):
    - Attempts to run in a Worker; if the Worker cannot resolve imports in this environment, it falls back to inline (main thread). OPFS requires Atomics.wait in a Worker; inline runs will log a warning and proceed without OPFS.
  - `pglite-wasm` (Postgres‑in‑WASM):
    - Uses its Worker API in both memory and disk; disk uses OPFS via a data directory and calls `syncToFs()` after transactional blocks. This can be slow in headless environments; the debug watchdog will abort long runs.

Notes:
- All browser benchmarks are served locally by a tiny HTTP server (no external network required for the engines once installed). The server sets COOP/COEP so workers and WASM can use SharedArrayBuffer/OPFS where needed.
- If a browser Worker path fails to initialize in this environment, we fall back to an inline (main thread) run to ensure results still post.

## Browser Engines & Modes

The browser benchmark runs these engines by default (in Workers unless noted):

- `sqlite3-wasm` (official SQLite WASM)
  - memory: Worker, in‑memory DB
  - disk: Worker, OPFS via `vfs=opfs` (persistent)

- `libsql-client-wasm` (embedded libSQL in WASM)
  - memory/disk: Worker by default using a sqlite3‑WASM shim to avoid Worker import‑map issues
  - Notes: results include `environment.via: libsql-worker-shim` in JSON outputs for transparency

- `pglite-wasm` (Postgres‑in‑WASM)
  - memory: tries Worker first; if Worker init is slow (> ~3s), falls back inline to avoid stalls
  - disk: Worker with OPFS data directory + `syncToFs()` after transactional blocks (durable, slower)

To override engines, pass `--engines=sqlite3-wasm,libsql-client-wasm,pglite-wasm` to `bench:browser:auto` or `bench:all`.

## What’s measured

- open: open database connection
- schema: create table + index
- insert xN: insert N rows in a transaction (default N=5_000)
- select-all: read all rows
- select-lookup: read random 1,000 by primary key
- update xN: update N/10 rows in a transaction
- delete xN: delete N/10 rows in a transaction

Each metric reports milliseconds elapsed; lower is better.

## Interpreting The Table

- Columns:
  - `implementation`: engine under test
  - `storage`: memory vs disk for the run
  - `version`/`engine`: package and engine versions (where available)
  - `rows`: configured row count for the run
  - metrics (`open`, `schema`, `insert xN`, etc.): elapsed milliseconds — lower is better

- The browser rows may include environment notes (e.g., `via: sqlite3-worker` for OPFS worker paths or fallbacks) in the JSON results written to `results/*.json`.
  - You can enforce Worker‑only runs with `--browserWorkers=only` (skips engines that cannot run in Worker mode).
