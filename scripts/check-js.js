import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const roots = ["server.js", "public/js", "scripts", "test"];

function collectJavaScriptFiles(target) {
  const stats = statSync(target);
  if (stats.isFile()) return target.endsWith(".js") ? [target] : [];

  return readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => collectJavaScriptFiles(path.join(target, entry.name)));
}

const files = roots.flatMap(collectJavaScriptFiles).sort();
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout);
  }
}

if (failed) process.exit(1);
console.log(`JavaScript syntax check passed (${files.length} files).`);
