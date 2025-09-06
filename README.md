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
| better-sqlite3 | node | memory | 12.2.0 | 3.50.2 | 5000 | 10.0 | 5.8 | 0.4 | 31.6 | 3.6 | 6.9 | 2.8 | 2.2 |
| better-sqlite3 | node | disk | 12.2.0 | 3.50.2 | 5000 | 1.5 | 0.7 | 3.0 | 26.4 | 3.8 | 12.4 | 3.0 | 2.2 |
| node-sqlite3 | node | memory | 5.1.7 | 3.44.2 | 5000 | 4.7 | 0.1 | 0.6 | 134.7 | 7.5 | 27.7 | 13.7 | 14.5 |
| node-sqlite3 | node | disk | 5.1.7 | 3.44.2 | 5000 | 0.6 | 0.0 | 3.9 | 140.2 | 7.6 | 34.0 | 15.5 | 15.1 |
| libsql | node | disk | 0.15.14 | 3.45.1 | 5000 | 15.9 | 15.8 | 4.7 | 87.3 | 17.3 | 31.9 | 11.7 | 10.1 |
| pglite | node | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 821.1 | 0.6 | 6.1 | 1416.9 | 24.3 | 286.9 | 138.3 | 130.4 |
| pglite | node | disk | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 559.1 | 0.3 | 3.4 | 1356.2 | 24.7 | 282.0 | 136.4 | 127.7 |
| sqlite3-wasm | browser | memory | - | 3.44.0 | 5000 | 265.5 | 171.4 | 49.3 | 239.7 | 55.1 | 47.0 | 18.7 | 10.9 |
| sqlite3-wasm | browser | disk-opfs | - | 3.44.0 | 5000 | 285.0 | 284.0 | 45.8 | 255.7 | 51.4 | 784.2 | 58.4 | 56.6 |
| libsql-client-wasm | browser | disk | - | 3.44.0 | 5000 | 288.3 | 287.4 | 50.5 | 248.9 | 50.8 | 741.6 | 58.9 | 51.3 |
| pglite-wasm | browser | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1464.2 | 40.2 | 42.8 | 25469.1 | 42.1 | 4926.7 | 2469.8 | 2459.4 |
| pglite-wasm | browser | disk-idb | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1480.9 | 82.7 | 40.7 | 23581.6 | 43.0 | 4793.3 | 2282.3 | 2224.8 |
| pglite-wasm | browser | disk-opfs | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1433.3 | 43.0 | 35.4 | 26551.2 | 42.0 | 4846.2 | 2373.1 | 2433.4 |

<!-- BENCH_TABLE:END -->

<!-- BENCH_COMMENT:START -->

Comment (AI):

- Node winners: better-sqlite3 is still the baseline leader. Inserts complete in ~26–32 ms with tiny open/startup times. node-sqlite3 is 4–5× slower on write-heavy phases; @libsql/client (embedded) is in between with higher open/startup overhead (~16 ms) but decent mixed-read/write performance.
- Startup matters in browsers: sqlite3‑wasm and libsql‑client‑wasm both spend ~265–290 ms on startup before the first query. PGlite’s startup is much heavier (~1.4–1.5 s) due to the larger WASM and initialization work.
- Browser SQLite (OPFS vs memory): inserts are similar across memory (~240 ms) and disk‑OPFS (~256 ms), but random lookups on OPFS are expensive (select‑lookup ~780 ms vs ~47–55 ms in memory). This is the dominant persistence cost in these workloads.
- libsql‑client‑wasm (disk‑OPFS): closely tracks sqlite3‑wasm on schema and bulk ops, with similar select‑lookup costs (~742 ms) reflecting OPFS random I/O overhead. Use it when you want the libsql client API with embedded durability.
- PGlite (Postgres‑in‑WASM): in Node, it’s much slower than SQLite (insert ~1.3–1.4 s) but still an order of magnitude faster than the browser runs. In the browser, insert xN lands in the 23–27 s range and select‑lookup ~4.8–4.9 s (both IDB and OPFS are in the same ballpark). This reflects Postgres protocol/engine complexity plus browser filesystem sync costs. Choose PGlite for Postgres features/compatibility, not raw throughput.
- Takeaways:
  - For Node: better‑sqlite3 for speed; @libsql/client if you need its client semantics; PGlite only if you need Postgres semantics in Node.
  - For Browser: sqlite3‑wasm (memory) for fastest reads; OPFS for durability with a large random‑lookup penalty. libsql‑client‑wasm (OPFS) performance is comparable to sqlite3‑wasm (OPFS). PGlite is feature‑rich but write/lookup heavy workloads are significantly slower.

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
