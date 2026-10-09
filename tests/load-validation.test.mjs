// 読み込み時の検査：問題は警告として出し、開けなくはしない。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { serializeNativeJson } from "../js/io/native-map.js";
import { validateMap } from "../js/core/model.js";
import { checkHistoryRefs } from "../js/core/edit/integrity.js";

const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message}`); } };
const enc = (t) => new TextEncoder().encode(t);

const { map } = await buildHistoricalWorld();
const ahmap = async (m, patch = (d) => d) => { const doc = JSON.parse(serializeNativeJson(m)); return loadFromBytes(enc(JSON.stringify(patch(doc))), Delaunator); };

console.log("=== 健全な地図 ===");
await check("健全な保存は、歴史の記録の問題を出さない", async () => {
  assert.deepEqual(checkHistoryRefs(map), []);
  const { warnings } = await ahmap(map);
  assert.ok(!warnings.some((w) => w.includes("歴史の記録の検査")), warnings.join("\n"));
});

console.log("=== 壊れた参照 ===");
await check("宗教の参照が範囲外なら検査が見つける", () => {
  const m = structuredClone(map); m.pack.cells.religion = [...m.pack.cells.religion]; m.pack.cells.religion[3] = 9999;
  assert.ok(validateMap(m).some((p) => p.includes("religion")));
});
await check("数値列の NaN / null を見つける（黙って0にしない）", () => {
  const m = structuredClone(map); m.pack.cells.pop = [...m.pack.cells.pop]; m.pack.cells.pop[2] = NaN; m.pack.cells.pop[5] = null;
  assert.ok(validateMap(m).some((p) => p.includes("pop") && p.includes("2 個")));
});
await check("存在しない国を参照する戦争・条約・同盟・外交を見つける", () => {
  const m = structuredClone(map);
  m.ext.data.wars = [...(m.ext.data.wars ?? []), { id: 99, name: "幽霊戦争", attackers: [1], defenders: [777], battles: [{ attackerState: 888, defenderState: 1 }], terms: { annex: [{ fromStateId: 1, toStateId: 999 }] } }];
  m.ext.data.alliances = [...(m.ext.data.alliances ?? []), { id: 99, name: "幽霊同盟", members: [1, 555] }];
  m.ext.data.diplomacyLog = [...(m.ext.data.diplomacyLog ?? []), { year: 1, month: 1, a: 1, b: 444, from: null, to: "Enemy" }];
  const p = checkHistoryRefs(m).join("\n");
  for (const n of ["777", "888", "999", "555", "444"]) assert.ok(p.includes(n), `#${n} が見つかる`);
});
await check("消滅した国（removed）は、歴史に残る国として参照してよい", () => {
  const m = structuredClone(map); const s = m.pack.states.find((x) => x && x.i > 0); s.removed = true;
  m.ext.data.wars = [{ id: 98, name: "古い戦争", attackers: [s.i], defenders: [m.pack.states.find((x) => x && x.i > 0 && !x.removed).i], battles: [] }];
  assert.deepEqual(checkHistoryRefs(m), []);
});

console.log("=== 開くときは警告だけで、開ける ===");
await check("壊れた記録を含むファイルも開け、警告が出る", async () => {
  const { map: loaded, warnings } = await ahmap(map, (d) => { d.data.wars = [...(d.data.wars ?? []), { id: 99, name: "幽霊戦争", attackers: [1], defenders: [777], battles: [] }]; return d; });
  assert.ok(loaded.pack.states.length > 1, "地図は開ける");
  assert.ok(warnings.some((w) => w.includes("歴史の記録の検査") && w.includes("777")), warnings.join("\n"));
});
await check("NaN を含むファイルも開け、警告が出る", async () => {
  const { map: loaded, warnings } = await ahmap(map, (d) => { d.cells.pop[0] = null; return d; });
  assert.ok(loaded.pack.cells.pop.length > 0);
  assert.ok(warnings.some((w) => w.includes("構造の検査") && w.includes("pop")), warnings.join("\n"));
});
await check("新しい形式版のファイルは、はっきりした警告を出して開ける", async () => {
  const { warnings } = await ahmap(map, (d) => { d.formatVersion = 99; return d; });
  const w = warnings.find((x) => x.includes("より新しい版"));
  assert.ok(w && w.includes("99") && w.includes("別名でコピー"), warnings.join("\n"));
});

await check("Azgaar の .map の数値列に数値でない値があれば、警告が出る（読み込みは続く）", async () => {
  const { text } = buildSyntheticMapText({ seed: 3 });
  const lines = text.split("\n");
  const i = 8; // 格子の標高の行（カンマ区切りの数値列）
  const parts = lines[i].split(","); assert.ok(parts.length > 50 && /^\d+$/.test(parts[7]), "数値列の行");
  parts[7] = "abc"; lines[i] = parts.join(",");
  const { map: loaded, warnings } = await loadFromBytes(enc(lines.join("\n")), Delaunator);
  assert.ok(loaded.pack.cells.state.length > 0);
  assert.ok(warnings.some((w) => w.includes("数値でない値が 1 個")), warnings.join("\n"));
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
