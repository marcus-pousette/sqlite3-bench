import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export function nowMs(): number {
  const n = process.hrtime.bigint();
  return Number(n / 1_000_000n);
}

export function measure(fn: () => Promise<void>): Promise<number> {
  const start = nowMs();
  return fn().then(() => nowMs() - start);
}

export function envInfo() {
  const cpus = os.cpus();
  const cpu = cpus && cpus.length ? `${cpus[0].model} x${cpus.length}` : "unknown";
  const platform = `${os.platform()} ${os.release()} (${os.arch()})`;
  return {
    node: process.version,
    os: platform,
    cpu,
  };
}

export async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

const reqFromCwd = createRequire(process.cwd() + "/package.json");
export function safeRequire<T = unknown>(id: string): T | undefined {
  try {
    return reqFromCwd(id) as T;
  } catch {
    return undefined;
  }
}

export function formatMarkdownTable(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [] as string[];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "-").join(" | ")} |`);
  for (const r of rows) {
    lines.push(`| ${headers.map((h) => String(r[h] ?? "")).join(" | ")} |`);
  }
  return lines.join("\n");
}

export function updateReadmeTable(markdown: string, betweenStart = "<!-- BENCH_TABLE:START -->", betweenEnd = "<!-- BENCH_TABLE:END -->") {
  const readmePath = path.resolve("README.md");
  const existing = fs.readFileSync(readmePath, "utf8");
  const startIdx = existing.indexOf(betweenStart);
  const endIdx = existing.indexOf(betweenEnd);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error("README markers not found");
  }
  const before = existing.slice(0, startIdx + betweenStart.length);
  const after = existing.slice(endIdx);
  const next = `${before}\n\n${markdown}\n\n${after}`;
  fs.writeFileSync(readmePath, next);
}

const BENCH_COMMENT_START = "<!-- BENCH_COMMENT:START -->";
const BENCH_COMMENT_END = "<!-- BENCH_COMMENT:END -->";

export function setReadmeComment(text?: string) {
  const readmePath = path.resolve("README.md");
  let existing = fs.readFileSync(readmePath, "utf8");
  const content = `Comment (AI):${text ? " " + text : ""}`;
  const render = `${content}`;
  const cStart = existing.indexOf(BENCH_COMMENT_START);
  const cEnd = existing.indexOf(BENCH_COMMENT_END);
  if (cStart !== -1 && cEnd !== -1 && cEnd > cStart) {
    const before = existing.slice(0, cStart + BENCH_COMMENT_START.length);
    const after = existing.slice(cEnd);
    existing = `${before}\n\n${render}\n\n${after}`;
  } else {
    // Insert after bench table markers if possible
    const tEnd = existing.indexOf("<!-- BENCH_TABLE:END -->");
    if (tEnd !== -1) {
      const head = existing.slice(0, tEnd + "<!-- BENCH_TABLE:END -->".length);
      const tail = existing.slice(tEnd + "<!-- BENCH_TABLE:END -->".length);
      const block = `\n\n${BENCH_COMMENT_START}\n\n${render}\n\n${BENCH_COMMENT_END}`;
      existing = `${head}${block}${tail}`;
    } else {
      // Append at end
      existing = `${existing}\n\n${BENCH_COMMENT_START}\n\n${render}\n\n${BENCH_COMMENT_END}\n`;
    }
  }
  fs.writeFileSync(readmePath, existing);
}

export function clearReadmeComment() {
  setReadmeComment("");
}

export function resolvePackageVersion(pkgId: string): string | undefined {
  try {
    const entry = reqFromCwd.resolve(pkgId);
    let dir = path.dirname(entry);
    // Walk up a few levels to find the package.json owning this entry
    for (let i = 0; i < 6; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const json = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (json && typeof json.version === "string") return json.version;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {}
  return undefined;
}
