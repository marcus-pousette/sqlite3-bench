import { startServer } from "./serve.ts";
import { setTimeout as sleep } from "node:timers/promises";

async function loadBrowser() {
  try {
    const pp = await import("puppeteer");
    return { type: "puppeteer" as const, mod: pp };
  } catch (e) {
    console.error("Failed to load puppeteer:", e);
  }
  return { type: "none" as const, mod: null };
}

function parseArgs() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    const [k, v] = a.includes("=") ? a.split("=", 2) : [a, "true"];
    args.set(k.replace(/^--/, ""), v);
  }
  // Default excludes turso-wasm; include explicitly via --engines if desired
  const engines = (args.get("engines") || "sqlite3-wasm,libsql-client-wasm,pglite-wasm")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rows = Number(args.get("rows") || 5000);
  const port = Number(args.get("port") || 8787);
  const timeout = Number(args.get("timeout") || 600_000);
  const workers = String(args.get("browserWorkers") || 'prefer'); // only|prefer|off
  const headed = args.get("headed") === 'true' || args.get("headed") === '1' || args.get("headed") === 'yes';
  return { engines, rows, port, timeout, workers, headed };
}

async function runWithPuppeteer(pp: any, url: string, maxWaitMs = 600_000, headed = false) {
  const launchOpts: any = { protocolTimeout: maxWaitMs };
  if (headed) {
    launchOpts.headless = false;
    launchOpts.devtools = true;
    launchOpts.args = ['--auto-open-devtools-for-tabs'];
  } else {
    launchOpts.headless = "new";
  }
  const browser = await pp.launch(launchOpts);
  const page = await browser.newPage();
  page.setDefaultTimeout(maxWaitMs);
  // Increase evaluation timeouts as well
  // @ts-ignore private API in some versions
  if (page._client?.()._connection?.setDefaultSessionTimeout) {
    // @ts-ignore
    page._client()._connection.setDefaultSessionTimeout(maxWaitMs);
  }
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('#status', { timeout: 60_000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('#status');
      return el && /Posted results|Error during benchmark/i.test(el.textContent || '');
    }, { timeout: maxWaitMs });
    const status = await page.$eval('#status', (el: any) => el.textContent);
    return status as string;
  } finally {
    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
  }
}

async function main() {
  const { engines, rows, port, timeout, workers, headed } = parseArgs();
  // Start server; if port is busy, try successive ports
  let server;
  let bindPort = port;
  for (let i = 0; i < 3; i++) {
    try {
      server = startServer(bindPort, false, false);
      break;
    } catch (e: any) {
      if (e?.code === 'EADDRINUSE') { bindPort++; continue; }
      throw e;
    }
  }
  if (!server) throw new Error('Failed to bind HTTP server');
  const { type, mod } = await loadBrowser();
  if (type === "none") {
    console.error("No headless browser found. Install 'playwright' or 'puppeteer'.");
    process.exit(1);
    return;
  }
  // Give the server a moment
  await sleep(250);

  for (const engine of engines) {
    const storages = engine === 'libsql-client-wasm' ? ["disk"] as const : engine === 'turso-wasm' ? ["memory"] as const : ["memory","disk"] as const;
    for (const storage of storages) {
      // For disk: run fs variants by engine capabilities
      const fsModes =
        engine === 'pglite-wasm' && storage === 'disk' ? ['idb','opfs'] as const :
        engine === 'sqlite3-wasm' && storage === 'disk' ? ['opfs'] as const :
        engine === 'libsql-client-wasm' && storage === 'disk' ? ['opfs'] as const :
        engine === 'turso-wasm' ? [undefined] as const :
        [undefined] as const;
      for (const fsKind of fsModes) {
        const extra = fsKind ? `&fs=${fsKind}&fallback=0` : '';
        const url = `http://localhost:${bindPort}/?auto=1&engine=${encodeURIComponent(engine)}&rows=${rows}&storage=${storage}&timeout=${timeout}&workers=${encodeURIComponent(workers)}${extra}`;
        let status: string | undefined;
        try {
          console.log(`[browser ${engine} ${storage}${fsKind?'-'+fsKind:''}] starting (timeout=${timeout}ms) -> ${url}`);
          status = await runWithPuppeteer(mod, url, timeout, headed);
          console.log(`[browser ${engine} ${storage}${fsKind?'-'+fsKind:''}] ${status}`);
        } catch (e) {
          console.error(`[browser ${engine} ${storage}${fsKind?'-'+fsKind:''}] failed:`, e);
          // One retry for flaky worker/OPFS cases (notably pglite-wasm disk-opfs)
          const shouldRetry = engine === 'pglite-wasm' && storage === 'disk' && fsKind === 'opfs';
          if (shouldRetry) {
            console.log(`[browser ${engine} ${storage}-opfs] retrying once after failure…`);
            try {
              await sleep(500);
              status = await runWithPuppeteer(mod, url, timeout, headed);
              console.log(`[browser ${engine} ${storage}-opfs] retry succeeded: ${status}`);
            } catch (e2) {
              console.error(`[browser ${engine} ${storage}-opfs] retry failed:`, e2);
            }
          }
        }
        // small delay between runs
        await sleep(250);
      }
    }
  }
  // Close server after runs and force exit to avoid lingering handles
  await new Promise<void>((resolve) => {
    try {
      server.close(() => resolve());
      // In case close callback doesn't fire, fall back
      setTimeout(() => resolve(), 500).unref?.();
    } catch {
      resolve();
    }
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
