// v6.1.0 M9: 開始時代と規模の較正、判断を保存しない世界、資料アーカイブ、決定性。
//   tests/legacy-v5/ へ移した旧スイート（v5 の起動手順・判断の保存・月ごとの全件スナップショット）が守っていた性質のうち、v6.1.0 でも成り立つものを、v6 の世界で検証する。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { delegateToWorld } from "../js/core/wcde/founding.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { checkCivIntegrity } from "../js/core/civ/civ-sim.js";
import { archiveStats, iterRecords, LIVE_MONTHS } from "../js/core/civ/archive.js";
import { NEOLITHIC_YEARS } from "../js/core/wcde/config.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 4).join(" | ")); } };
const make = (seed, cells = 1500) => createNewWorld({ worldSeed: seed, spec: { resolution: { targetCells: cells } } });
const SEEDS = ["m9-a", "m9-b", "m9-c"], worlds = SEEDS.map((s) => make(s));
const yearOf = (civ, k) => Math.round(civ.wcde.prehistory.firstTech[k] / 12);
const popOf = (civ) => Object.values(civ.groups).reduce((s, g) => s + g.pop, 0);

console.log("=== 開始時代の較正（歴史の始まり＝最初の国家が現れる頃） ===");
await check("農耕・牧畜・大規模建築は、年 0 の約 1 万年前より後に初めて現れる。農耕は先史の途中（数十万年前）には現れない", () => {
  for (const r of worlds) { const P = r.w.civ.wcde.prehistory.firstTech; assert.ok(P.agriculture != null, "農耕が現れる"); const y = yearOf(r.w.civ, "agriculture"); assert.ok(y >= -NEOLITHIC_YEARS - 500 && y <= -2500, `農耕の初出 ${y}`); for (const k of ["pastoralism", "construction"]) if (P[k] != null) assert.ok(yearOf(r.w.civ, k) >= -NEOLITHIC_YEARS, `${k} ${yearOf(r.w.civ, k)}`); }
});
await check("航海は約 6 万年前より後、土器は約 2 万年前より後（氷期の間は現れにくい技術）", () => { for (const r of worlds) { const P = r.w.civ.wcde.prehistory.firstTech; if (P.seafaring != null) assert.ok(yearOf(r.w.civ, "seafaring") >= -60000); if (P.pottery != null) assert.ok(yearOf(r.w.civ, "pottery") >= -20000); } });
await check("歴史の始まりの世界人口は、史実の規模（約 1,400 万人）の 0.3〜3 倍。農耕の集団は 1 割以上（史実でも、第一王朝の頃の農耕は世界の一部）、建国の候補がある", () => {
  for (const r of worlds) { const civ = r.w.civ, p = popOf(civ), gs = Object.values(civ.groups), ag = gs.filter((g) => g.tech.known.agriculture).length / gs.length; assert.ok(p > 2.5e6 && p < 4.2e7, `世界人口 ${Math.round(p)}`); assert.ok(ag >= 0.1, `農耕の集団 ${ag}`); assert.ok(civ.wcde.candidates.length >= 1); assert.equal(civ.wcde.phase, "founding"); }
});
await check("世界人口は解像度（セル数）にほとんど依存しない（1,500 セルと 3,000 セルで 3 倍以内）", () => { const a = popOf(worlds[0].w.civ), b = popOf(make(SEEDS[0], 3000).w.civ); const r = a / b; assert.ok(r > 1 / 3 && r < 3, `比 ${r.toFixed(2)}`); });
await check("同じシードは同じ先史になる（決定的）", () => { const a = make(SEEDS[1]).w.civ, b = worlds[1].w.civ; assert.deepEqual(a.wcde.prehistory.firstTech, b.wcde.prehistory.firstTech); assert.equal(Math.round(popOf(a)), Math.round(popOf(b))); });
await check("先史の終わりの世界は、整合性を満たす", () => { for (const r of worlds) { assert.deepEqual(checkCivIntegrity(r.w.world, r.w.civ, { sinceEvent: 0, structure: true }), []); assert.deepEqual(checkWcdeIntegrity(r.w.world, r.w.civ), []); } });

console.log("=== 歴史の最初の 100 年 ===");
const w = worlds[0].w; delegateToWorld(w); const p0 = popOf(w.civ);
await check("委任で国家が成立し、100 年進めても整合性が保たれ、世界人口が急減しない", () => {
  const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1200, commandId: "m9-100" }); assert.ok(r.ok, JSON.stringify(r).slice(0, 200)); const civ = w.civ;
  assert.ok(Object.values(civ.states).filter((s) => s.alive).length >= 5, "国家が成立している"); assert.ok(popOf(civ) > p0 * 0.5, `人口 ${Math.round(p0)} → ${Math.round(popOf(civ))}`);
  assert.deepEqual(checkCivIntegrity(w.world, civ, { sinceEvent: 0, structure: true }), []); assert.deepEqual(checkWcdeIntegrity(w.world, civ), []);
});
await check("AI の判断は保存しない（civ.decisions も、月ごとの全件スナップショット civ.history も無い）。行動は結果の出来事として残る", () => { const civ = w.civ; assert.equal(civ.decisions, undefined); assert.equal(civ.history, undefined); assert.ok([...iterRecords(civ)].length > 0); });
await check("作業バッファは直近だけ（出来事は資料アーカイブへ移り、件数は期間に比例して膨らまない）", () => {
  const civ = w.civ, s = archiveStats(civ); assert.ok(s.records > 0, "アーカイブに記録がある"); const oldest = civ.events[0]?.date; if (oldest) assert.ok(civ.monthIndex - (oldest.year * 12 + oldest.month) <= LIVE_MONTHS + 12, "作業バッファが長すぎる");
});
await check("国家の成立は、原因（どの集団・どの文明候補から）つきで出来事に残る", () => { const found = [...iterRecords(w.civ)].filter((r) => /state_formed|state_founded|nation_founded/.test(r.kind)); assert.ok(found.length >= 1 || Object.values(w.civ.states).some((s) => s.formedAt != null), "建国の記録"); });

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
