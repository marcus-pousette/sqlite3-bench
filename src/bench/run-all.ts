import { spawnSync } from 'node:child_process';

function parseArgs() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    const [k, v] = a.includes('=') ? a.split('=', 2) : [a, 'true'];
    args.set(k.replace(/^--/, ''), v);
  }
  const rows = String(args.get('rows') ?? 5000);
  const port = String(args.get('port') ?? 8787);
  const storage = String(args.get('storage') ?? 'both'); // for node
  // Default excludes turso-wasm (browser) due to WASI/threads bootstrap requirements.
  // It can be run manually via the UI or by passing --engines=turso-wasm.
  const engines = String(args.get('engines') ?? 'sqlite3-wasm,libsql-client-wasm,pglite-wasm');
  const timeout = String(args.get('timeout') ?? 600000);
  const browserWorkers = String(args.get('browserWorkers') ?? 'prefer');
  return { rows, port, storage, engines, timeout, browserWorkers };
}

function run(cmd: string, args: string[], opts: any = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, TS_NODE_TRANSPILE_ONLY: '1' }, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main() {
  const { rows, port, storage, engines, timeout, browserWorkers } = parseArgs();
  // Reset table + results
  run('node', ['--loader', 'ts-node/esm', 'src/bench/reset.ts']);
  // Node benches
  run('node', ['--loader', 'ts-node/esm', 'src/bench/run-node.ts', `--rows=${rows}`, `--storage=${storage}`]);
  // Browser benches (headless)
  run('node', ['--loader', 'ts-node/esm', 'src/web/headless.ts', `--engines=${engines}`, `--rows=${rows}`, `--port=${port}`, `--timeout=${timeout}`, `--browserWorkers=${browserWorkers}`]);
  // Ensure the script terminates even if some handles remain
  process.exit(0);
}

main();
