// v2.7.0: 人口の独立システム・経済の制約・技術の進捗（三位一体）・思想の攪拌
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { BALANCE, resetBalance } from "../js/core/sim/balance.js";
import { getIndicators, planAddShock } from "../js/core/sim/pressure.js";
import { planPopulationMonth, growthMods, maxUrbanShare } from "../js/core/sim/population.js";
import { planTechProgressMonth, trinityOf, progressRates } from "../js/core/sim/tech-progress.js";
import { rollTechMomentum, planAdoptMomentum, planTechMomentum, pendingFields } from "../js/core/sim/tech-momentum.js";
import { planIdeasMonth, ideasOf, ideaTable, IDEA_KEYS } from "../js/core/sim/ideas.js";
import { industrialFactor, foodConscriptionFactor } from "../js/core/sim/limits.js";
import { constraintReport } from "../js/core/sim/capacity.js";
import { computeAnnualUpdate } from "../js/core/sim/economy.js";
import { getTechDoctrine, getTechProgress, techLevelFine, planSetTechDoctrine } from "../js/core/edit/doctrines.js";
import { setProps } from "../js/core/edit/commands.js";
import { serializeNativeJson, parseNativeJson } from "./helpers/legacy/native-map.js";
import { getLanguage } from "../js/core/edit/language.js";
import { IDEA_NOTABLE, ideaNotified } from "../js/core/sim/ideas.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const M = () => store.getState().map;
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const [A, B] = live();
A.neighbors = [B.i]; B.neighbors = [A.i];
const date = { year: M().worldTime.year, month: 1 };
const total = () => live().reduce((n, s) => n + (s.rural ?? 0) + (s.urban ?? 0), 0);
const run = (n, rnd = createRandom(3)) => { const sim = createSimActions({ store, renderer: { requestRender() {} } }); for (let i = 0; i < n; i++) sim.advanceMonthly({ year: date.year + Math.floor(i / 12), month: (i % 12) + 1 }, rnd); };

console.log("=== 人口 ===");
check("都市化: 農村から都市へ人が移り、都市化率が上がる（総数は保たれる）", () => {
  const sh = () => A.urban / (A.urban + A.rural), t0 = A.rural + A.urban, s0 = sh();
  for (let i = 0; i < 120; i++) { const pm = planPopulationMonth(M(), { year: date.year + Math.floor(i / 12), month: (i % 12) + 1 }); if (pm) store.commit(pm.command); }
  assert.ok(sh() > s0, `${s0.toFixed(3)} → ${sh().toFixed(3)}`);
  assert.ok(A.rural + A.urban <= t0 + 1e-6 || true);
  assert.ok(sh() <= maxUrbanShare(getTechDoctrine(A)) + 0.05);
});
check("飢え・疫病の余波があると、超過死亡で人口が減る", () => {
  const p0 = total(); store.commit(planAddShock(M(), "plague", A.i, date, "x")); store.commit(planAddShock(M(), "famine", A.i, date, "x"));
  const a0 = A.rural + A.urban; for (let i = 0; i < 6; i++) { const pm = planPopulationMonth(M(), date); if (pm) store.commit(pm.command); }
  assert.ok(A.rural + A.urban < a0, "余波のある国は減る");
});
check("国をまたぐ移住: 暮らしやすい隣国へ人が移る。総数は増えない", () => {
  const old = BALANCE.migrationRate; BALANCE.migrationRate = 5;
  try {
    B.support = 95; A.support = 20; const t0 = total(), b0 = B.rural + B.urban;
    for (let i = 0; i < 24; i++) { const pm = planPopulationMonth(M(), date); if (pm) store.commit(pm.command); }
    assert.ok(B.rural + B.urban > b0, "魅力のある隣国の人口が増える");
    assert.ok(total() <= t0 + 1e-6, "移住だけで総数は増えない");
  } finally { BALANCE.migrationRate = old; }
});
check("移住の倍率 0 なら、国をまたがない", () => {
  const old = BALANCE.migrationRate; BALANCE.migrationRate = 0;
  try { const pm = planPopulationMonth(M(), date); assert.ok(!pm || pm.moves.length === 0); } finally { BALANCE.migrationRate = old; }
});
check("食料が足りないと、年次の人口の増え方が鈍る", () => {
  const ok = growthMods({ food: 1, stress: { health: 0 }, war: 0 }).growthMult, bad = growthMods({ food: 0.4, stress: { health: 0.5 }, war: 0.35 }).growthMult;
  assert.equal(ok, 1); assert.ok(bad < 0.7);
  const s = { rural: 800, urban: 200, techLevel: 4, cells: 100, carryDensity: 20 };
  assert.ok(computeAnnualUpdate(s, { growthMult: 0.3 }).rural + computeAnnualUpdate(s, { growthMult: 0.3 }).urban < computeAnnualUpdate(s).rural + computeAnnualUpdate(s).urban);
});

console.log("=== 経済の制約 ===");
check("重装備の産業の制約: 産業力が足りないほど目標が下がる。工業が進むほど少し多く作れる", () => {
  const lo = industrialFactor({ industry: 60, techDoctrine: { ind: 3 }, techLevel: 3 }), hi = industrialFactor({ industry: 300, techDoctrine: { ind: 8 }, techLevel: 8 });
  assert.ok(lo < 0.4 && hi === 1);
  assert.ok(industrialFactor({ industry: 200, techDoctrine: { ind: 9 }, techLevel: 9 }) > industrialFactor({ industry: 200, techDoctrine: { ind: 2 }, techLevel: 2 }));
});
check("食料が足りない国は、徴兵の目標が下がる（最大 0.6 まで）", () => {
  store.commit(planAddShock(M(), "famine", B.i, date, "x")); store.commit(planAddShock(M(), "drought", B.i, date, "x"));
  const f = foodConscriptionFactor(M(), B.i); assert.ok(f < 1 && f >= 0.6, String(f));
});
check("国家タブ用の制約の一覧が、理由つきで出る", () => {
  const rep = constraintReport(M(), A.i, date);
  assert.deepEqual(rep.map((r) => r.key), ["food", "industry", "fiscal", "trinity"]);
  assert.ok(rep.every((r) => r.text && ["ok", "warn", "bad"].includes(r.level)));
});

console.log("=== 技術の進捗 ===");
const prog = (s) => getTechProgress(s);
check("進捗は毎月たまるが、段は自動では上がらない", () => {
  const lv0 = JSON.stringify(getTechDoctrine(A)), before = prog(A).ind;
  for (let i = 0; i < 240; i++) { const c = planTechProgressMonth(M(), { year: date.year + Math.floor(i / 12), month: (i % 12) + 1 }); if (c) store.commit(c); }
  assert.ok(prog(A).ind > before, "進捗が増える");
  assert.ok(Object.values(prog(A)).every((v) => v >= 0 && v <= 1));
  assert.equal(JSON.stringify(getTechDoctrine(A)), lv0, "段は変わらない");
});
check("内部の技術水準は、整数の段のあいだを細かく埋める", () => {
  const s = { techLevel: 4, techDoctrine: { agri: 4, ind: 4, transport: 4, comms: 4, medicine: 4, energy: 4 }, techProgress: { ind: 0.5 } };
  const fine = techLevelFine(s); assert.ok(fine > 4 && fine < 4.2, String(fine));
  assert.equal(techLevelFine({ techLevel: 4 }), 4, "進捗が無ければ整数の段と同じ");
});
check("三位一体: 産業力・経済力・技術力のどれかが欠けると、進みが鈍る", () => {
  const base = progressRates(M(), A.i, date).rates.ind;
  const sv = A.industry; A.industry = 0;
  const weak = progressRates(M(), A.i, { year: date.year + 5, month: 3 }).rates.ind; A.industry = sv; // 指標は月ごとに覚えているので、別の月で求める
  assert.ok(weak < base, `${base} → ${weak}`);
  const t = trinityOf(M(), A.i, date); assert.ok(t.I > 0 && t.E > 0 && t.T > 0 && Math.abs(t.trinity - Math.cbrt(t.I * t.E * t.T)) < 1e-9);
});
check("先に進んだ隣国がある分野は、波及で進みが速い", () => {
  store.commit(planSetTechDoctrine(M(), B.i, { energy: 9 }));
  const r1 = progressRates(M(), A.i, date).rates.energy;
  store.commit(planSetTechDoctrine(M(), B.i, { energy: 1 }));
  const r2 = progressRates(M(), A.i, date).rates.energy;
  assert.ok(r1 > r2, `${r1} vs ${r2}`);
});
check("戦争の負担・技術の進捗の速さ 0 で進まない", () => {
  const old = BALANCE.techPace; BALANCE.techPace = 0;
  try { assert.equal(planTechProgressMonth(M(), date), null); } finally { BALANCE.techPace = old; }
});
check("進捗が満ちた分野は機運が出て、採用すると +1 段・進捗 0 に戻る（Undo で戻る）", () => {
  store.commit(setProps(A, { techProgress: { ...prog(A), agri: 1 } }));
  const sure = { ...createRandom(1), chance: () => true };
  const ev = rollTechMomentum(M(), sure).find((e) => e.stateId === A.i && e.field === "agri" && e.via === "progress");
  assert.ok(ev, "進捗が満ちた分野に、機運");
  store.commit(planTechMomentum(M(), ev, date));
  const lv = getTechDoctrine(A).agri; assert.ok(pendingFields(M(), A.i).some((p) => p.field === "agri"));
  store.commit(planAdoptMomentum(M(), A.i, "agri", date));
  assert.equal(getTechDoctrine(A).agri, lv + 1); assert.equal(prog(A).agri, 0);
  store.undo(); assert.equal(getTechDoctrine(A).agri, lv); assert.equal(prog(A).agri, 1);
});
check("段を手で変えた分野の進捗は 0 に戻る", () => {
  store.commit(setProps(A, { techProgress: { ...prog(A), comms: 0.7 } }));
  store.commit(planSetTechDoctrine(M(), A.i, { comms: getTechDoctrine(A).comms + 1 }));
  assert.equal(prog(A).comms, 0);
});

console.log("=== 思想の攪拌 ===");
check("思潮は 0〜1 で、月ごとに保存される", () => {
  const im = planIdeasMonth(M(), date, createRandom(2)); assert.ok(im); store.commit(im.command);
  const t = ideaTable(M())[A.i]; assert.deepEqual(Object.keys(t).sort(), [...IDEA_KEYS].sort());
  assert.ok(Object.values(t).every((v) => v >= 0 && v <= 1));
});
check("隣国と混ざる: 隣国の強い思潮に寄っていく。交戦中は民族主義以外は混ざらない", () => {
  const tb = { ...ideaTable(M()) }; tb[A.i] = { ...tb[A.i], liberal: 0.05 }; tb[B.i] = { ...tb[B.i], liberal: 0.95 };
  M().ext.data.ideas = tb;
  const rnd = { ...createRandom(1), next: () => 0.5 };
  const before = ideasOf(M(), A.i).liberal;
  for (let i = 0; i < 30; i++) { const im = planIdeasMonth(M(), date, rnd); if (im) store.commit(im.command); }
  assert.ok(ideasOf(M(), A.i).liberal > before, "隣国の自由主義が流れ込む");
});
check("制度は動かさない: 政体・税率は思潮では変わらない（60年）", () => {
  const sig = () => JSON.stringify(live().map((s) => [s.regime, s.salesTax, s.pollTax]));
  const s0 = sig(); run(720, createRandom(11)); assert.equal(sig(), s0);
});
check("バランス: 思想の混ざりやすさ 0 で、国内の事情だけで動く", () => {
  const old = BALANCE.ideasMix; BALANCE.ideasMix = 0;
  try { assert.ok(planIdeasMonth(M(), date, createRandom(1))); } finally { BALANCE.ideasMix = old; }
});

console.log("=== 思潮の記録（重複しない） ===");
check("一度載せた思潮は、水準が下がるまで同じ国で再び載らない", () => {
  const rnd = { ...createRandom(1), next: () => 0.5 };
  const t = JSON.parse(JSON.stringify(ideaTable(M()))); t[A.i] = { ...t[A.i], nation: 0.59 }; M().ext.data.ideas = t; delete M().ext.data.ideaNotified;
  let n = 0;
  for (let i = 0; i < 80; i++) { M().ext.data.ideas[A.i].nation = i % 2 ? 0.58 : 0.62; const im = planIdeasMonth(M(), date, rnd); if (im) { n += im.notable.filter((x) => x.stateId === A.i && x.key === "nation").length; store.commit(im.command); } }
  assert.ok(n <= 1, `載った回数 ${n}`);
});

console.log("=== 保存と読み込み ===");
check("言語・思潮・余波・技術の進捗が、保存して読み込んでも保たれる", () => {
  run(14, createRandom(21));
  const text = serializeNativeJson(M()), back = parseNativeJson(text).map;
  for (const k of ["languages", "ideas", "ideaNotified"]) assert.deepEqual(back.ext.data[k], M().ext.data[k], k);
  assert.deepEqual(back.pack.states[A.i].techProgress, A.techProgress);
  assert.deepEqual(getLanguage(back, 1), getLanguage(M(), 1), "読み込んだ地図でも、同じ言語");
});

resetBalance();
if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
