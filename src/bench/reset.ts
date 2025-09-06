import fs from 'node:fs';
import path from 'node:path';

function resetReadme() {
  const readmePath = path.resolve('README.md');
  let s = fs.readFileSync(readmePath, 'utf8');
  const start = s.indexOf('<!-- BENCH_TABLE:START -->');
  const end = s.indexOf('<!-- BENCH_TABLE:END -->');
  if (start !== -1 && end !== -1 && end > start) {
    const before = s.slice(0, start + '<!-- BENCH_TABLE:START -->'.length);
    const after = s.slice(end);
    const placeholder = '\n\nNo results yet. Run `npm run bench:all`.\n\n';
    s = before + placeholder + after;
  }
  // Clear comment block too
  const cStart = s.indexOf('<!-- BENCH_COMMENT:START -->');
  const cEnd = s.indexOf('<!-- BENCH_COMMENT:END -->');
  if (cStart !== -1 && cEnd !== -1 && cEnd > cStart) {
    const before = s.slice(0, cStart + '<!-- BENCH_COMMENT:START -->'.length);
    const after = s.slice(cEnd);
    s = before + '\n\nComment (AI):\n\n' + after;
  }
  fs.writeFileSync(readmePath, s);
}

function resetResultsDir() {
  const dir = path.resolve('results');
  try {
    for (const f of ['node-latest.json', 'browser-latest.json']) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch {}
}

resetReadme();
resetResultsDir();
console.log('Reset README and results/*.json');

