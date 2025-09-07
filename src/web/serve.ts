import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { formatMarkdownTable, updateReadmeTable, clearReadmeComment } from "../bench/util.ts";
import type { BenchResult } from "../bench/types.ts";
import ts from "typescript";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const webRoot = path.join(projectRoot, "web");
const resultsDir = path.join(projectRoot, "results");

type BrowserResult = {
  implementation: string;
  packageVersion?: string;
  engineVersion?: string;
  rows: number;
  metrics: Record<string, number>;
  timestamp: string;
  environment?: Record<string, string>;
};

type LogPacket = {
  level?: string;
  logs?: string[];
  error?: string;
  when?: string;
  userAgent?: string;
  href?: string;
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const u = new URL(req.url ?? "/", "http://x");
  let p = u.pathname;
  if (p === "/") p = "/index.html";
  // Vendor mapping to node_modules for browser ESM/WASM
  if (p.startsWith("/vendor/")) {
    const rel = p.replace(/^\/vendor\//, "");
    const target = path.join(projectRoot, "node_modules", rel);
    if (!target.startsWith(path.join(projectRoot, "node_modules"))) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404).end("Not found");
        return;
      }
      const ext = path.extname(target);
      const type =
        ext === ".mjs" || ext === ".js" ? "text/javascript" :
        ext === ".wasm" ? "application/wasm" :
        ext === ".json" ? "application/json" :
        "application/octet-stream";
      res.writeHead(200, {
        "content-type": type,
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      res.end(data);
    });
    return;
  }
  // Dynamic transpile of shared bench core (single source of truth)
  if (p === "/bench-core.js") {
    try {
      const tsPath = path.join(projectRoot, "src", "bench", "core.ts");
      const src = fs.readFileSync(tsPath, "utf8");
      const out = ts.transpileModule(src, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2021,
          sourceMap: false,
          removeComments: false,
          esModuleInterop: true,
        },
        fileName: "core.ts",
        reportDiagnostics: false,
      });
      res.writeHead(200, {
        "content-type": "text/javascript",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      res.end(out.outputText);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
    return;
  }
  // Serve assets/sql.json from project assets
  if (p === "/assets/sql.json") {
    const assetPath = path.join(projectRoot, "assets", "sql.json");
    fs.readFile(assetPath, (err, data) => {
      if (err) return res.writeHead(404).end("Not found");
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(data);
    });
    return;
  }
  const filePath = path.join(webRoot, path.normalize(p));
  if (!filePath.startsWith(webRoot)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const type =
      ext === ".html" ? "text/html" :
      ext === ".js" ? "text/javascript" :
      ext === ".css" ? "text/css" :
      ext === ".wasm" ? "application/wasm" :
      "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      // Enable cross-origin isolation for WASM engines that require SAB (e.g., pglite)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    res.end(data);
  });
}

async function writeBrowserResults(results: BrowserResult[]) {
  await fs.promises.mkdir(resultsDir, { recursive: true });
  const out = path.join(resultsDir, "browser-latest.json");
  let existing: BrowserResult[] = [];
  try {
    const cur = await fs.promises.readFile(out, "utf8");
    existing = JSON.parse(cur);
  } catch {}
  const combined = [...existing, ...results];
  await fs.promises.writeFile(out, JSON.stringify(combined, null, 2));

  // Try to merge with node results if available, else just browser
  let node: BenchResult[] = [];
  try {
    const nodeJson = await fs.promises.readFile(path.join(resultsDir, "node-latest.json"), "utf8");
    node = JSON.parse(nodeJson);
  } catch {}
  let browser: BenchResult[] = [];
  try {
    const b = await fs.promises.readFile(out, "utf8");
    browser = JSON.parse(b);
  } catch {}
  const mapRow = (r: BenchResult, platform: 'node' | 'browser') => ({
    implementation: r.implementation,
    platform,
    storage: (r as any).storage ?? "-",
    version: r.packageVersion ?? "-",
    engine: r.engineVersion ?? "-",
    rows: r.rows,
    startup: (r.metrics as any).startup?.toFixed ? (r.metrics as any).startup.toFixed(1) : ((r.metrics as any).startup != null ? String((r.metrics as any).startup) : '-'),
    open: (r.metrics as any).open?.toFixed ? (r.metrics as any).open.toFixed(1) : String((r.metrics as any).open),
    schema: (r.metrics as any).schema?.toFixed ? (r.metrics as any).schema.toFixed(1) : String((r.metrics as any).schema),
    "insert xN": (r.metrics as any)["insert xN"].toFixed ? (r.metrics as any)["insert xN"].toFixed(1) : String((r.metrics as any)["insert xN"]),
    "select-all": (r.metrics as any)["select-all"].toFixed ? (r.metrics as any)["select-all"].toFixed(1) : String((r.metrics as any)["select-all"]),
    "select-lookup": (r.metrics as any)["select-lookup"].toFixed ? (r.metrics as any)["select-lookup"].toFixed(1) : String((r.metrics as any)["select-lookup"]),
    "update xN": (r.metrics as any)["update xN"].toFixed ? (r.metrics as any)["update xN"].toFixed(1) : String((r.metrics as any)["update xN"]),
    "delete xN": (r.metrics as any)["delete xN"].toFixed ? (r.metrics as any)["delete xN"].toFixed(1) : String((r.metrics as any)["delete xN"]),
  });
  const nodeRows = node.map((r) => mapRow(r as BenchResult, 'node'));
  const browserRows = browser.map((r) => mapRow(r as BenchResult, 'browser'));
  const rows = [...nodeRows, ...browserRows];
  const table = rows.length ? formatMarkdownTable(rows as any) : "No results.";
  updateReadmeTable(table);
  clearReadmeComment();
}

export function startServer(port: number, auto: boolean, once: boolean) {
  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return res.writeHead(204).end();

    if (req.url?.startsWith("/results") && req.method === "POST") {
      try {
        const body = await readBody(req);
        const json = JSON.parse(body);
        await writeBrowserResults(Array.isArray(json) ? json : [json]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        if (once) setTimeout(() => server.close(), 250);
      } catch (e) {
        res.writeHead(400).end(String(e));
      }
      return;
    }
    if (req.url?.startsWith("/logs") && req.method === "POST") {
      try {
        const body = await readBody(req);
        const packet: LogPacket = JSON.parse(body);
        const stamp = new Date().toISOString();
        const line = JSON.stringify({ stamp, ...packet }) + "\n";
        await fs.promises.mkdir(resultsDir, { recursive: true });
        await fs.promises.appendFile(path.join(resultsDir, "browser-logs.ndjson"), line);
        const tag = packet?.level ? String(packet.level).toUpperCase() : "LOG";
        console.log(`[browser ${tag}]`, packet?.href || "", packet?.error || "", (packet?.logs || []).join(" "));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400).end(String(e));
      }
      return;
    }
    return serveStatic(req, res);
  });
  server.listen(port, () => {
    const url = `http://localhost:${port}/` + (auto ? "?auto=1" : "");
    console.log(`Browser benchmark server running at: ${url}`);
  });
  return server;
}

function cli() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    const [k, v] = a.includes("=") ? a.split("=", 2) : [a, "true"];
    args.set(k.replace(/^--/, ""), v);
  }
  const port = Number(args.get("port") ?? 8787);
  const auto = args.get("auto") === "true" || args.get("auto") === "1";
  const once = args.get("once") === "true";
  startServer(port, auto, once);
}
// Only run CLI when executed directly
try {
  const isMain = url.pathToFileURL(process.argv[1] || "").href === import.meta.url;
  if (isMain) cli();
} catch {
  // ignore
}
