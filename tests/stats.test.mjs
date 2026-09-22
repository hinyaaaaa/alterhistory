import { readFileSync } from "node:fs";
import { parseAzgaarBytes } from "../js/io/azgaar-reader.js";
// テスト用の実マップの置き場所。既定は開発環境のパス。SAMPLES_DIR=... で変更できる
const SAMPLES = process.env.SAMPLES_DIR ?? "/mnt/user-data/uploads";
import { computeCellCounts, findCountDrift, activeEntities } from "../js/core/stats.js";

let failed = 0;
const check = (label, ok, extra = "") => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failed++;
};

for (const f of ["境界線の貴方.map", "新世界より.map"]) {
  console.log("=====", f);
  const { map: m } = parseAzgaarBytes(readFileSync(SAMPLES + "/" + f));
  const counts = computeCellCounts(m);
  const n = m.pack.cells.state.length;

  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  check("国家の集計合計=セル数", sum(counts.state) === n, `${sum(counts.state)}/${n}`);
  check("宗教の集計合計=セル数", sum(counts.religion) === n, `${sum(counts.religion)}/${n}`);

  const states = activeEntities(m.pack.states);
  check("実在国家が1つ以上", states.length > 0, `実在=${states.length} (要素=${m.pack.states.length})`);
  check("削除済みが除外される", states.every((s) => !s.removed));
  check("中立(0番)が除外される", states.every((s) => s.i !== 0));
  check("中立を含める指定が効く", activeEntities(m.pack.states, { includeNeutral: true }).length === states.length + 1);

  const drift = findCountDrift(m);
  console.log(`  情報: 保存値と実測値のずれ ${drift.length}件`,
    drift.slice(0, 3).map((d) => `${d.label}${d.id}「${d.name}」保存${d.stored}/実測${d.actual}`).join(" | "));

  // 入力を破壊していないこと
  const before = JSON.stringify(m.pack.cells.state.slice(0, 50));
  computeCellCounts(m);
  check("入力データを変更しない", before === JSON.stringify(m.pack.cells.state.slice(0, 50)));
}
console.log(failed === 0 ? "\n全テスト合格" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
