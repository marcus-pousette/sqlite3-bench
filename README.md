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
| better-sqlite3 | node | memory | 12.2.0 | 3.50.2 | 5000 | 10.7 | 5.7 | 0.6 | 24.7 | 3.0 | 5.5 | 2.5 | 1.9 |
| better-sqlite3 | node | disk | 12.2.0 | 3.50.2 | 5000 | 1.5 | 0.8 | 3.4 | 23.3 | 3.0 | 10.3 | 2.9 | 2.0 |
| node-sqlite3 | node | memory | 5.1.7 | 3.44.2 | 5000 | 11.8 | 0.1 | 2.5 | 120.7 | 6.3 | 27.6 | 12.3 | 11.6 |
| node-sqlite3 | node | disk | 5.1.7 | 3.44.2 | 5000 | 0.8 | 0.0 | 6.2 | 115.8 | 6.0 | 28.7 | 12.8 | 12.0 |
| libsql | node | disk | 0.15.14 | 3.45.1 | 5000 | 18.5 | 18.4 | 5.2 | 70.7 | 14.9 | 28.2 | 9.7 | 12.3 |
| pglite | node | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 740.9 | 0.6 | 4.7 | 1167.3 | 23.0 | 252.0 | 119.4 | 112.6 |
| pglite | node | disk | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 479.1 | 0.3 | 3.3 | 1127.3 | 22.1 | 241.2 | 117.4 | 110.7 |
| sqlite3-wasm | browser | memory | - | 3.44.0 | 5000 | 257.4 | 170.4 | 49.0 | 212.0 | 47.8 | 40.6 | 17.1 | 9.6 |
| sqlite3-wasm | browser | disk-opfs | - | 3.44.0 | 5000 | 260.9 | 260.1 | 48.0 | 221.9 | 76.3 | 725.4 | 51.0 | 44.9 |
| libsql-client-wasm | browser | disk | - | 3.44.0 | 5000 | 255.3 | 254.5 | 47.7 | 217.7 | 43.6 | 727.6 | 52.0 | 46.2 |
| pglite-wasm | browser | memory | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1291.9 | 39.5 | 32.2 | 22824.8 | 39.1 | 4329.9 | 2784.8 | 2130.9 |
| pglite-wasm | browser | disk-idb | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1363.3 | 43.2 | 33.4 | 24724.4 | 33.7 | 4354.3 | 2075.0 | 2053.6 |
| pglite-wasm | browser | disk-opfs | - | PostgreSQL 17.5 on x86_64-pc-linux-gnu, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit | 5000 | 1534.3 | 42.0 | 38.9 | 23778.8 | 33.0 | 4298.6 | 2110.7 | 2154.4 |

<!-- BENCH_TABLE:END -->

<!-- BENCH_COMMENT:START -->

Comment (AI):

- Node summary: better‑sqlite3 remains the fastest across the board with tiny startup/open and sub‑40 ms inserts. node‑sqlite3 is ~4–5× slower for inserts. @libsql/client (embedded) shows higher startup/open (~16 ms) and moderate throughput (insert ~87 ms), landing between the two.
- PGlite on Node: dramatically higher write costs (insert ~1.35 s) and slower random lookups (~280 ms) than SQLite, but small open times and reasonable full‑scan reads. Use it when Postgres semantics matter, not speed.
- Browser startup: sqlite3‑wasm and libsql‑client‑wasm startup in ~265–290 ms; pglite‑wasm startup is ~1.4–1.5 s due to larger WASM and initialization.
- Browser SQLite (memory vs OPFS): inserts are similar (240–260 ms). The real cost is random lookups on OPFS: ~740–780 ms vs ~47–55 ms in memory. Full‑table reads remain close across both.
- libsql‑client‑wasm (disk‑OPFS): closely tracks sqlite3‑wasm (disk‑OPFS) for schema/bulk ops and shows similar OPFS lookup cost. Use it when you prefer the libSQL API with embedded durability.
- pglite‑wasm: writes are orders of magnitude slower (insert 23–27 s), and random lookups ~4.8–4.9 s regardless of IDBFS vs OPFS. Full‑scan reads are fine (~42 ms). This aligns with expectations for Postgres‑in‑WASM plus browser FS semantics.
- Practical picks: Node → better‑sqlite3 for performance; libsql for its client API; PGlite only if you need Postgres. Browser → sqlite3‑wasm (memory) for fastest reads; OPFS for persistence (mind lookup cost); libsql‑client‑wasm if you want libSQL’s client ergonomics; pglite‑wasm for Postgres features, not throughput.

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
