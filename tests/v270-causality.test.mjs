// v2.7.0: 因果の土台。出来事が残す状態の変化（余波）が、あとの出来事の起きやすさ・影響・原因の記録を実際に変える。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { BALANCE, resetBalance } from "../js/core/sim/balance.js";
import { getIndicators, listShocks, shockNow, stressOf, eventFactors, drivenWeight, planAddShock, dominantCause } from "../js/core/sim/pressure.js";
import { rollMinorEvents, planMinorEvent, MINOR_EVENTS } from "../js/core/sim/minor-events.js";
import { planScheduleChain, planRunPending, listPending } from "../js/core/sim/event-chains.js";
import { listHistory } from "../js/core/edit/history-log.js";
import { buildTimeline } from "../js/io/chronicle.js";
import { attachCauses } from "../js/core/edit/lineage.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const M = () => store.getState().map;
const A = M().pack.states.find((s) => s && s.i > 0 && !s.removed).i;
const date = { year: M().worldTime.year, month: 1 };
const keyOf = (h) => `${h.type}|${h.year}-${h.month}|${h.title}`;

check("指標が国ごとに求まる（食料・都市化・産業力・余波）", () => {
  const ind = getIndicators(M(), date).get(A);
  assert.ok(ind.food > 0 && ind.urbanShare >= 0 && ind.urbanShare <= 1 && ind.industryRatio >= 0);
  assert.deepEqual(Object.keys(ind.stress).sort(), ["fiscal", "food", "health", "order"]);
});

check("余波は半減期で薄れる", () => {
  const sh = { a: 0.8, y: 10, m: 1, h: 6 };
  assert.ok(Math.abs(shockNow(sh, { year: 10, month: 1 }) - 0.8) < 1e-9);
  assert.ok(Math.abs(shockNow(sh, { year: 10, month: 7 }) - 0.4) < 1e-9);
  assert.ok(Math.abs(shockNow(sh, { year: 11, month: 1 }) - 0.2) < 1e-9);
});

check("飢饉が起きると余波が残り、食料の指標が悪化する（Undo で戻る）", () => {
  const before = getIndicators(M(), date).get(A).food;
  const c = planMinorEvent(M(), { key: "famine", stateId: A }, date); store.commit(c);
  assert.ok(listShocks(M()).some((s) => s.s === A && s.k === "food" && s.a > 0 && s.from));
  const after = getIndicators(M(), date).get(A).food;
  assert.ok(after < before, `食料 ${before.toFixed(2)} → ${after.toFixed(2)}`);
  assert.ok(stressOf(M(), A, date).food > 0.5);
  store.undo();
  assert.equal(listShocks(M()).length, 0);
  assert.ok(Math.abs(getIndicators(M(), date).get(A).food - before) < 1e-9);
});

check("余波が強いほど、後続の確率の倍率が上がる（物価高・暴動）", () => {
  const calm = getIndicators(M(), date).get(A);
  store.commit(planMinorEvent(M(), { key: "famine", stateId: A }, date));
  const hot = getIndicators(M(), date).get(A);
  assert.ok(eventFactors("pricespike", hot).w > eventFactors("pricespike", calm).w);
  assert.ok(eventFactors("famine", hot).w > eventFactors("famine", calm).w);
  assert.equal(drivenWeight("pricespike", calm), 0);
  assert.ok(drivenWeight("pricespike", hot) > 0);
  store.undo();
});

check("余波があると、連鎖の表を待たずに後続が単独でも起きる。余波が無ければ起きない", () => {
  const count = (m, key) => { let n = 0; for (let i = 0; i < 1500; i++) n += rollMinorEvents(m, createRandom(i + 1), null, date).filter((e) => e.key === key && e.stateId === A).length; return n; };
  assert.equal(count(M(), "pricespike"), 0);
  store.commit(planMinorEvent(M(), { key: "famine", stateId: A }, date));
  assert.ok(count(M(), "pricespike") > 0);
  store.undo();
});

check("因果の強さ 0 なら従来どおり（状態に関係なく決まり、後続は単独で起きない）", () => {
  const old = BALANCE.causalStrength; BALANCE.causalStrength = 0;
  try {
    store.commit(planMinorEvent(M(), { key: "famine", stateId: A }, date));
    for (let i = 0; i < 800; i++) assert.ok(!rollMinorEvents(M(), createRandom(i + 1), null, date).some((e) => e.key === "pricespike"));
    store.undo();
  } finally { BALANCE.causalStrength = old; }
});

check("悪い出来事の被害は、国の状態で変わる（食料が足りない国の飢饉は民意の落ち込みが大きい）", () => {
  const s = () => M().pack.states[A];
  s().support = 70;
  const c0 = planMinorEvent(M(), { key: "famine", stateId: A }, date); store.commit(c0); const lossCalm = 70 - s().support; store.undo();
  s().support = 70;
  store.commit(planAddShock(M(), "famine", A, date, "x")); // 先に食料の余波が重なっている
  const c1 = planMinorEvent(M(), { key: "famine", stateId: A }, date); store.commit(c1); const lossHot = 70 - s().support;
  assert.ok(lossHot >= lossCalm, `${lossCalm} → ${lossHot}`);
  store.undo(); store.undo();
});

check("連鎖: 後続の予約に「きっかけ」が残り、起きた後続の年表に cause が載る", () => {
  const rnd = { ...createRandom(5), chance: () => true, int: (a) => a };
  store.commit(planMinorEvent(M(), { key: "famine", stateId: A }, date));
  const sc = planScheduleChain(M(), { key: "famine", stateId: A }, date, rnd, 0); assert.ok(sc); store.commit(sc);
  const p = listPending(M()).find((x) => x.key === "pricespike"); assert.ok(p && p.fromEvent && /^natural-famine\|/.test(p.fromEvent));
  const run = planRunPending(M(), p, { year: date.year, month: 4 }, rnd); for (const c of run.commands) store.commit(c);
  const h = listHistory(M()).find((x) => x.type === "natural-pricespike");
  assert.equal(h.cause, p.fromEvent);
  const tl = attachCauses(buildTimeline(M()).slice().reverse()); // 古い順
  const e = tl.find((x) => x.type === "natural-pricespike");
  assert.ok(e.causeKey && /飢饉/.test(e.causeTitle ?? ""), "年表で、物価高の原因が飢饉につながる");
});

check("余波の元の出来事が、後続の原因として優先される（dominantCause）", () => {
  const famine = listHistory(M()).find((x) => x.type === "natural-famine");
  assert.equal(dominantCause(M(), "pricespike", A, date), keyOf(famine));
});

check("月送りを重ねても落ちず、余波が溜まり続けない", () => {
  const sim = createSimActions({ store: createStore({ map: M() }), renderer: { requestRender() {} } });
  for (let i = 0; i < 240; i++) sim.advanceMonthly({ year: date.year + Math.floor(i / 12), month: (i % 12) + 1 }, createRandom(i + 7));
  assert.ok(listShocks(M()).length < 400);
});

resetBalance();
if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
