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

| implementation | platform | storage | version | engine | rows | startup | open | schema | insert xN | select-all | select-lookup | update xN | delete xN |
| - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| better-sqlite3 | node | memory | 12.2.0 | 3.50.2 | 5000 | 16.5 | 12.5 | 1.0 | 25.3 | 3.1 | 5.8 | 2.3 | 6.9 |
| better-sqlite3 | node | disk | 12.2.0 | 3.50.2 | 5000 | 1.4 | 1.0 | 1.8 | 30.2 | 3.4 | 10.7 | 3.2 | 2.2 |
| node-sqlite3 | node | memory | 5.1.7 | 3.44.2 | 5000 | 14.2 | 0.1 | 1.6 | 167.4 | 7.7 | 33.3 | 16.0 | 12.0 |
| node-sqlite3 | node | disk | 5.1.7 | 3.44.2 | 5000 | 1.1 | 0.0 | 2.1 | 132.2 | 6.5 | 33.1 | 14.5 | 12.6 |
| libsql | node | disk | 0.15.14 | 3.45.1 | 5000 | 11.0 | 10.9 | 3.2 | 75.7 | 15.6 | 28.8 | 9.9 | 10.7 |
| pglite | node | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1047.0 | 0.5 | 5.4 | 1378.8 | 23.6 | 305.0 | 134.4 | 118.5 |
| pglite | node | disk | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 538.0 | 0.3 | 4.4 | 1395.7 | 21.3 | 269.4 | 126.5 | 124.4 |
| turso | node | memory | 0.1.4 | 3.47.0 | 5000 | 10.9 | 8.0 | 1.4 | 74.9 | 25.7 | 145.4 | 9.3 | 5.7 |
| sqlite3-wasm | browser | memory | - | 3.44.0 | 5000 | 369.8 | 206.1 | 60.0 | 253.3 | 52.9 | 44.1 | 17.5 | 9.9 |
| sqlite3-wasm | browser | disk-opfs | - | 3.44.0 | 5000 | 317.3 | 316.5 | 66.1 | 258.4 | 45.9 | 746.3 | 89.5 | 84.2 |
| libsql-client-wasm | browser | disk | - | 3.44.0 | 5000 | 473.5 | 472.6 | 86.4 | 300.3 | 69.5 | 1931.3 | 258.4 | 737.9 |
| pglite-wasm | browser | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 3131.3 | 127.6 | 67.0 | 30761.5 | 40.3 | 6009.1 | 3619.9 | 2775.3 |
| pglite-wasm | browser | disk-idb | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1465.2 | 45.7 | 34.8 | 25315.9 | 32.8 | 5074.9 | 2274.4 | 2926.0 |
| pglite-wasm | browser | disk-opfs | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1560.0 | 53.2 | 37.6 | 30307.1 | 35.2 | 5677.3 | 2773.9 | 2274.4 |
| sqlite3-wasm | browser | memory | - | 3.44.0 | 200 | 260.0 | 171.2 | 39.9 | 34.6 | 5.3 | 19.3 | 2.6 | 1.3 |
| sqlite3-wasm | browser | disk-opfs | - | 3.44.0 | 200 | 321.8 | 320.9 | 54.9 | 44.9 | 9.2 | 258.7 | 12.6 | 9.8 |
| libsql-client-wasm | browser | disk | - | 3.44.0 | 200 | 293.0 | 292.1 | 56.0 | 39.2 | 6.5 | 266.9 | 12.2 | 10.2 |
| pglite-wasm | browser | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 200 | 1659.6 | 46.4 | 38.4 | 1144.1 | 8.3 | 1102.8 | 115.0 | 112.4 |
| pglite-wasm | browser | disk-idb | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 200 | 1390.9 | 45.7 | 33.5 | 1095.3 | 7.6 | 995.7 | 107.3 | 105.9 |
| pglite-wasm | browser | disk-opfs | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 200 | 1689.6 | 44.0 | 42.7 | 1259.7 | 8.3 | 1077.8 | 121.1 | 129.8 |
| pglite-wasm | browser | disk-opfs | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 200 | 1334.4 | 47.6 | 52.2 | 1271.7 | 9.3 | 1247.1 | 109.1 | 105.9 |
| sqlite3-wasm | browser | memory | - | 3.44.0 | 200 | 276.8 | 190.2 | 46.8 | 33.3 | 6.5 | 20.5 | 2.6 | 1.3 |
| sqlite3-wasm | browser | disk-opfs | - | 3.44.0 | 200 | 335.9 | 334.7 | 67.0 | 38.9 | 7.2 | 226.5 | 12.2 | 9.7 |
| libsql-client-wasm | browser | disk | - | 3.44.0 | 200 | 292.4 | 291.6 | 47.7 | 30.7 | 6.1 | 174.5 | 11.5 | 9.0 |
| pglite-wasm | browser | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 200 | 1358.4 | 39.5 | 35.1 | 1157.6 | 7.6 | 1127.1 | 123.5 | 122.2 |
| pglite-wasm | browser | disk-idb | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 200 | 1378.8 | 43.2 | 36.4 | 1164.3 | 7.2 | 1187.0 | 124.1 | 122.2 |
| pglite-wasm | browser | disk-opfs | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 200 | 2018.4 | 46.7 | 42.4 | 1309.8 | 8.6 | 1209.6 | 148.9 | 133.1 |
| pglite-wasm | browser | disk-opfs | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 200 | 1511.8 | 48.1 | 48.1 | 1236.7 | 8.3 | 1266.6 | 138.7 | 126.5 |

<!-- BENCH_TABLE:END -->

## Vector Results

<!-- VEC_TABLE:START -->

| implementation | platform | storage | version | engine | rows | dim | k | repeats | startup | schema | insert xN | knn@k | knn@k (filtered) | knn@k xM |
| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |
| libsql-vector-node | node | disk | - | - | 50 | 8 | 3 | 2 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 50 | 8 | 3 | 2 | 415.5 | 112.1 | 37.9 | 12.7 | 1.2 | 1.9 |
| libsql-vector-node | node | disk | - | - | 50 | 8 | 3 | 2 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 50 | 8 | 3 | 2 | 173.3 | 3.8 | 0.0 | 9.8 | 1.4 | 2.5 |
| libsql-vector-node | node | disk | - | - | 50 | 8 | 3 | 2 | - |  |  |  |  |  |
| libsql-vector-node | node | disk | - | - | 200 | 32 | 10 | 5 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 200 | 32 | 10 | 5 | 242.4 | 6.4 | 135.3 | 9.0 | 1.3 | 15.7 |
| libsql-vector-node | node | disk | - | - | 200 | 32 | 10 | 5 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 60 | 16 | 5 | 3 | 199.1 | 3.6 | 0.0 | 11.5 | 1.9 | 12.6 |
| libsql-vector-node | node | disk | - | - | 60 | 16 | 5 | 3 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 80 | 16 | 5 | 3 | 522.3 | 11.9 | 0.0 | 28.2 | 2.9 | 10.0 |
| libsql-vector-node | node | disk | - | - | 80 | 16 | 5 | 3 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 10 | 8 | 3 | 1 | 202.1 | 4.8 | 0.0 | 13.4 | 2.0 | 6.6 |
| libsql-vector-node | node | disk | - | - | 10 | 8 | 3 | 1 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 10 | 8 | 3 | 1 | 179.4 | 3.3 | 0.0 | 11.6 | 2.0 | 3.9 |
| libsql-vector-node | node | disk | - | - | 10 | 8 | 3 | 1 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 20 | 8 | 3 | 2 | 199.3 | 4.1 | 0.0 | 11.9 | 1.8 | 8.5 |
| libsql-vector-node | node | disk | - | - | 20 | 8 | 3 | 2 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 20 | 8 | 3 | 2 | 197.0 | 5.8 | 0.0 | 10.5 | 1.7 | 8.9 |
| libsql-vector-node | node | disk | - | - | 20 | 8 | 3 | 2 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 10 | 8 | 3 | 1 | 191.7 | 4.4 | 0.0 | 11.3 | 1.5 | 4.2 |
| libsql-vector-node | node | disk | - | - | 10 | 8 | 3 | 1 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 10 | 8 | 3 | 1 | 209.0 | 5.7 | 0.0 | 12.8 | 2.9 | 6.2 |
| libsql-vector-node | node | disk | - | - | 10 | 8 | 3 | 1 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 5000 | 128 | 10 | 10 | 343.0 | 4.1 | 3425.6 | 260.7 | 4.6 | 2321.7 |
| libsql-vector-node | node | disk | - | - | 5000 | 128 | 10 | 10 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 5000 | 128 | 10 | 10 | 234.3 | 8.8 | 0.0 | 247.0 | 4.2 | 2320.4 |
| libsql-vector-node | node | disk | - | - | 5000 | 128 | 10 | 10 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 50 | 8 | 3 | 2 | 201.6 | 3.8 | 0.0 | 201.6 | 2.9 | 304.3 |
| libsql-vector-node | node | disk | - | - | 50 | 8 | 3 | 2 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 50 | 8 | 3 | 2 | 235.3 | 8.6 | 0.0 | 176.8 | 3.2 | 308.0 |
| libsql-vector-node | node | disk | - | - | 50 | 8 | 3 | 2 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 50 | 8 | 3 | 2 | 215.3 | 5.2 | 0.0 | 173.2 | 3.4 | 304.2 |
| libsql-vector-node | node | disk | - | - | 50 | 8 | 3 | 2 | - |  |  |  |  |  |
| pglite-vector-node | node | disk | - |  | 10 | 8 | 3 | 1 | 219.2 | 5.7 | 0.0 | 182.9 | 3.0 | 270.7 |
| libsql-vector-node | node | disk | - | - | 10 | 8 | 3 | 1 | - |  |  |  |  |  |
| pglite-vec-wasm | browser | disk-opfs | - | - | 200 | 32 | 10 | 5 | 1607.2 | 12.9 | 270.5 | 8.8 | 2.1 | 25.0 |
| pglite-vec-wasm | browser | disk-opfs | - | - | 80 | 16 | 5 | 3 | 2118.8 | 14.3 | 128.7 | 4.0 | 1.4 | 7.3 |
| pglite-vec-wasm | browser | disk-opfs | - | - | 10 | 8 | 3 | 1 | 1373.4 | 13.2 | 22.5 | 3.9 | 2.6 | 1.8 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 20 | 8 | 3 | 2 | 313.7 | 502.3 | 17.0 | 5.0 | 1.3 | 4.1 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 20 | 8 | 3 | 2 | 314.2 | 38.8 | 16.6 | 5.5 | 1.5 | 3.7 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 10 | 8 | 3 | 1 | 301.7 | 38.9 | 11.4 | 4.7 | 1.0 | 1.1 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 10 | 8 | 3 | 1 | 343.7 | 51.8 | 12.9 | 5.2 | 1.0 | 1.1 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 5000 | 128 | 10 | 10 | 402.0 | 40.8 | 2487.3 | 386.8 | 78.1 | 3970.7 |
| pglite-vec-wasm | browser | disk-opfs | - | - | 5000 | 128 | 10 | 10 | 2734.2 | 14.7 | 7153.3 | 312.5 | 6.0 | 2177.6 |
| pglite-vec-wasm | browser | disk-opfs | - | - | 5000 | 128 | 10 | 10 | 1550.2 | 12.5 | 6991.9 | 210.4 | 5.7 | 2336.5 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 50 | 8 | 3 | 2 | 302.7 | 37.7 | 24.0 | 6.8 | 1.6 | 6.1 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 50 | 8 | 3 | 2 | 356.6 | 56.9 | 29.8 | 7.4 | 2.2 | 7.2 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 50 | 8 | 3 | 2 | 294.6 | 35.5 | 26.3 | 7.1 | 2.0 | 9.1 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 50 | 8 | 3 | 2 | 336.2 | 41.8 | 25.3 | 7.2 | 2.0 | 6.6 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 50 | 8 | 3 | 2 | 259.2 | 0.8 | 0.0 | 17.7 | 3.1 | 7.2 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 50 | 8 | 3 | 2 | 322.8 | 49.7 | 25.9 | 9.9 | 1.8 | 8.3 |
| sqlite3-vec-wasm | browser | disk-opfs | - | - | 20 | 8 | 3 | 1 | 302.3 | 36.3 | 15.1 | 5.5 | 1.1 | 1.6 |

<!-- VEC_TABLE:END -->

<!-- BENCH_COMMENT:START -->

Comment (AI):

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
