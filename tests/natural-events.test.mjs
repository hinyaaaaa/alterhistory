// 自然発生イベント：独立・疫病・反乱・宗教の分派。オン／オフと頻度、年表への記録、取り消し。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { rollNaturalEvents, getNaturalSettings, planSetNaturalSettings, planPlague, FREQUENCIES } from "../js/core/sim/natural-events.js";
import { buildTimeline } from "../js/io/chronicle.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { snapshotBaseline, checkIntegrity } from "../js/core/edit/integrity.js";
import { setProps, makeCommand } from "../js/core/edit/commands.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.stack?.split("\n").slice(0, 3).join(" | ")}`); } };

const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const sim = createSimActions({ store, renderer: { requestRender() {} } });
const live = () => store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
const date = { year: 40, month: 1 };
const sure = () => ({ ...createRandom(7), next: () => 0 }); // 確率の判定が必ず「起きる」側になる乱数（テスト用。実際の遊びでは固定しない）
const never = () => ({ ...createRandom(7), next: () => 0.999999 });

console.log("=== 設定（オン／オフ・頻度） ===");
check("初期はオン・頻度ふつう", () => assert.deepEqual(getNaturalSettings(store.getState().map), { enabled: true, frequency: "normal" }));
check("オフにすると、何も起きない（Undoで戻る）", () => {
  sim.setNaturalEvents({ enabled: false });
  assert.equal(getNaturalSettings(store.getState().map).enabled, false);
  assert.deepEqual(rollNaturalEvents(store.getState().map, sure()), []);
  assert.deepEqual(sim.applyNaturalEvents(date, sure()), []);
  store.undo(); assert.equal(getNaturalSettings(store.getState().map).enabled, true);
});
check("頻度は まれ < ふつう < 多い（国ごとの確率が倍率で変わる）", () => {
  const count = (freq) => { const m = store.getState().map; const r = createRandom(Date.now() ^ freq.length); let n = 0; for (let i = 0; i < 3000; i++) n += rollNaturalEvents(m, r, { enabled: true, frequency: freq }).length; return n; };
  const lo = count("low"), mid = count("normal"), hi = count("high");
  assert.ok(lo < mid && mid < hi, `${lo} < ${mid} < ${hi}`);
  assert.ok(hi / 3000 < 3, `1年あたり ${(hi / 3000).toFixed(2)} 件（多すぎない）`);
});
check("確率が低い乱数なら何も起きない", () => assert.deepEqual(rollNaturalEvents(store.getState().map, never()), []));
check("不正な頻度は受け付けない", () => assert.throws(() => planSetNaturalSettings(store.getState().map, { frequency: "毎日" })));

console.log("=== 起きたことが世界に反映され、年表に載る ===");
// 国を不安定にして、反乱・独立が起きやすい状態にする（属州が複数ある国だけ）
const unstable = store.getState().map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
for (const s of unstable) store.commit(makeCommand("民意を下げる", [], [setProps(s, { support: 20 })]));
const before = JSON.stringify({ r: live().map((s) => [s.i, s.rural, s.urban, s.support]) });
const nStates0 = live().length, nRel0 = store.getState().map.pack.religions.filter((r) => r && !r.removed && r.i > 0).length;
const happened = sim.applyNaturalEvents(date, sure());
const kinds = new Set(happened.map((h) => h.kind));
check("疫病・反乱が起き、人口と民意が変わる", () => {
  assert.ok(kinds.has("plague") && kinds.has("rebellion"), [...kinds].join(","));
  assert.notEqual(JSON.stringify({ r: live().map((s) => [s.i, s.rural, s.urban, s.support]) }), before);
});
const tl = () => buildTimeline(store.getState().map);
check("疫病・反乱が年表に載る（日付・関係国つき）", () => {
  const p = tl().find((e) => e.type === "plague" && e.year === 40), r = tl().find((e) => e.type === "rebellion" && e.year === 40);
  assert.ok(p && r && p.stateIds.length === 1 && p.detail.includes("%") && r.detail.includes("民意"));
});
check("独立が起きたなら、新しい国が増え、年表の主権の記録に載る", () => {
  if (!kinds.has("independence")) return; // この世界に独立できる属州が無ければ起きない
  assert.ok(live().length > nStates0);
  assert.ok(tl().some((e) => e.type === "independence" && e.year === 40));
});
check("分派が起きたなら、新しい宗教が増え、親から分かれたと年表に載る", () => {
  if (!kinds.has("schism")) return;
  const m = store.getState().map;
  assert.ok(m.pack.religions.filter((r) => r && !r.removed && r.i > 0).length > nRel0);
  assert.ok(tl().some((e) => e.type === "schism" && e.title.includes("分かれた")));
});
console.log(`  （この世界で起きた出来事: ${happened.map((h) => h.title).join("、") || "なし"}）`);
check("独立・分派のどちらかは、この合成世界でも起きる（機能が動いている確認）", () => assert.ok(kinds.has("independence") || kinds.has("schism"), [...kinds].join(",")));

console.log("=== 全部成功か全部取り消し／Undo ===");
check("疫病の計画が失敗（存在しない国）しても、世界は変わらない", () => {
  const snap = JSON.stringify(live().map((s) => [s.i, s.rural, s.urban]));
  assert.throws(() => planPlague(store.getState().map, { stateId: 9999, ruralLoss: 0.1, urbanLoss: 0.1 }, date));
  assert.equal(JSON.stringify(live().map((s) => [s.i, s.rural, s.urban])), snap);
});
check("起きた出来事は Undo で戻せる", () => {
  const snapNow = JSON.stringify(live().map((s) => [s.i, s.rural, s.urban, s.support]));
  let n = 0; while (store.canUndo() && JSON.stringify(live().map((s) => [s.i, s.rural, s.urban, s.support])) === snapNow && n++ < 5) store.undo();
  assert.notEqual(JSON.stringify(live().map((s) => [s.i, s.rural, s.urban, s.support])), snapNow);
});
check("乱数は固定されていない（同じ世界でも、呼ぶたびに違う結果になりうる）", () => {
  const m = store.getState().map; const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(JSON.stringify(rollNaturalEvents(m, createRandom(Date.now() + i * 7919 + Math.floor(Math.random() * 1e9)), { enabled: true, frequency: "high" }).map((e) => e.kind)));
  assert.ok(seen.size > 1, `${seen.size}通り`);
});

console.log("=== 疫病は、セル単位の人口・都市・属州・宗教の集計も一緒に減らす ===");
{
  const fresh = (await buildHistoricalWorld()).map;
  const fs = createStore({ map: fresh });
  const sid = fresh.pack.states.find((s) => s && s.i > 0 && !s.removed).i;
  const cellPop = (m) => m.pack.cells.pop.reduce((a, b) => a + b, 0);
  const base = snapshotBaseline(fresh);
  const pop0 = cellPop(fresh), st0 = fresh.pack.states[sid].rural, urb0 = fresh.pack.states[sid].urban;
  const cmd = planPlague(fresh, { stateId: sid, ruralLoss: 0.1, urbanLoss: 0.2 }, date);
  fs.commit(cmd);
  const m = fs.getState().map;
  check("セルの人口が減る（この国の分だけ）", () => assert.ok(cellPop(m) < pop0));
  check("国の農村・都市の人口が、指定の割合で減る", () => { assert.ok(Math.abs(m.pack.states[sid].rural - st0 * 0.9) < 0.01 + st0 * 0.001); assert.ok(Math.abs(m.pack.states[sid].urban - urb0 * 0.8) < 0.01 + urb0 * 0.001); });
  check("疫病で、整合性の問題が新しく増えない（集計とセル合計が合う）", () => assert.deepEqual(checkIntegrity(m, base), []));
  fs.undo();
  check("Undo でセル・国・都市の人口が全部戻る", () => { assert.ok(Math.abs(cellPop(fs.getState().map) - pop0) < 1e-9); assert.equal(fs.getState().map.pack.states[sid].rural, st0); assert.deepEqual(checkIntegrity(fs.getState().map, base), []); });
}

console.log("=== 起きる頻度の目安（民意が低くても、毎年のようには起きない） ===");
{
  const w = (await buildHistoricalWorld()).map;
  const sts = w.pack.states.filter((s) => s && s.i > 0 && !s.removed);
  for (const s of sts) s.support = 10;
  const N = 3000, rnd = createRandom(Date.now() >>> 0);
  const perState = (freq) => { let n = 0; for (let i = 0; i < N; i++) n += rollNaturalEvents(w, rnd, { enabled: true, frequency: freq }).filter((e) => e.kind === "rebellion").length; return n / N / sts.length; };
  const normal = perState("normal"), high = perState("high");
  console.log(`  （民意10の国の反乱: ふつう ${(normal * 100).toFixed(1)}%/年, 多い ${(high * 100).toFixed(1)}%/年）`);
  // 設計上の上限は 0.025 × 2.5 = 6.25%/年（多いは2倍の12.5%）。標本のぶれ（約0.5ポイント）を見込んで 7% / 14%
  check("民意10でも、反乱は1国あたり ふつう で年7%以下（設計の上限は6.25%）", () => assert.ok(normal <= 0.07, `${normal}`));
  check("民意10でも、反乱は1国あたり 多い でも年14%以下（設計の上限は12.5%）", () => assert.ok(high <= 0.14, `${high}`));
  check("それでも、民意が低ければ反乱は起きる（ふつうで年2%以上）", () => assert.ok(normal >= 0.02, `${normal}`));
  for (const s of sts) s.support = 70;
  let calm = 0; for (let i = 0; i < 2000; i++) calm += rollNaturalEvents(w, rnd, { enabled: true, frequency: "high" }).filter((e) => e.kind === "rebellion" || e.kind === "independence").length;
  check("民意が高い国では、反乱も独立も起きない", () => assert.equal(calm, 0));
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
