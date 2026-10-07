// 全テストの実行役。tests/*.test.mjs を全て走らせ、1件でも失敗したら非0で終わる。
// 合成マップを毎回作り直すので、実マップが無くても npm test は完結する。
//   npm test                 … 合成マップのみ（標準。常に緑であること）
//   npm run test:compat      … REAL_MAPS=1。SAMPLES_DIR に置いた実Azgaarマップで互換性を検証
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const compat = process.argv.includes("--compat");
const env = { ...process.env };
if (compat) {
  env.REAL_MAPS = "1";
  if (!env.SAMPLES_DIR) { console.error("test:compat には SAMPLES_DIR（実マップのフォルダ）の指定が必要です"); process.exit(2); }
} else {
  env.SAMPLES_DIR = join(root, "tests", ".samples");
  const r = spawnSync(process.execPath, [join(root, "tests/helpers/make-samples.mjs"), env.SAMPLES_DIR], { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const files = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.mjs")).sort();
const failed = [];
for (const f of files) {
  console.log(`\n##### ${f}`);
  const r = spawnSync(process.execPath, [join(root, "tests", f)], { stdio: "inherit", env, cwd: root });
  if (r.status !== 0) failed.push(f);
}
console.log(`\n===== ${files.length - failed.length}/${files.length} スイート合格`);
if (failed.length) { console.log("失敗: " + failed.join(", ")); process.exit(1); }
