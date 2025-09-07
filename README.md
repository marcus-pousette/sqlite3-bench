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

<!-- BENCH_TABLE:END -->

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
