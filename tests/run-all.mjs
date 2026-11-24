// 全テストの実行役。tests/*.test.mjs を全て走らせ、1件でも失敗したら非0で終わる。
//   npm test                 … 全スイート（常に緑であること）
//   npm test -- v700         … ファイル名に v700 を含むものだけ
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const files = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.mjs") && (!only.length || only.some((o) => f.includes(o)))).sort();
const failed = [];
for (const f of files) {
  console.log(`\n##### ${f}`);
  const r = spawnSync(process.execPath, [join(root, "tests", f)], { stdio: "inherit", cwd: root });
  if (r.status !== 0) failed.push(f);
}
console.log(`\n===== ${files.length - failed.length}/${files.length} スイート合格`);
if (failed.length) { console.log("失敗: " + failed.join(", ")); process.exit(1); }
