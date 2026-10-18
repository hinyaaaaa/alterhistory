// v2.6.0 B4: 出来事の連鎖（飢饉→物価高騰・難民／疫病→復興／クーデター未遂→粛清／選挙の敗北→政権交代）
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { planScheduleChain, listPending, duePending, rebellionSpark, CHAINS } from "../js/core/sim/event-chains.js";
import { planMinorEvent } from "../js/core/sim/minor-events.js";
import { listHistory } from "../js/core/edit/history-log.js";
import { BALANCE } from "../js/core/sim/balance.js";
import { setProps, makeCommand } from "../js/core/edit/commands.js";
import { ensureLeaders, leaderRecord } from "../js/core/edit/leaders.js";
import { buildChronicle, chronicleToMarkdown } from "../js/io/chronicle.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const sim = createSimActions({ store, renderer: { requestRender() {} } });
const M = () => store.getState().map;
const S = M().pack.states.find((s) => s && s.i > 0 && !s.removed);
ensureLeaders(M());
const sure = { ...createRandom(5), chance: () => true, int: (a) => a };
const none = { ...createRandom(5), chance: () => false };
const d0 = { year: M().worldTime.year, month: 1 };
const nat = (type) => listHistory(M()).filter((h) => h.type === `natural-${type}`);

console.log("=== 予約 ===");
check("飢饉のあとに、物価の高騰と難民の流入が予約される（保存形式 pendingEvents）", () => {
  const c = planScheduleChain(M(), { key: "famine", stateId: S.i }, d0, sure, 0); assert.ok(c); store.commit(c);
  const p = listPending(M()); assert.deepEqual(p.map((x) => x.key).sort(), ["pricespike", "refugees"]); assert.ok(p.every((x) => x.due.year && x.depth === 1 && x.from === "famine"));
});
check("確率0なら予約されない / chainRate 0 でも連鎖しない", () => { assert.equal(planScheduleChain(M(), { key: "famine", stateId: S.i }, d0, none, 0), null); const o = BALANCE.chainRate; BALANCE.chainRate = 0; try { assert.equal(planScheduleChain(M(), { key: "famine", stateId: S.i }, d0, sure, 0), null); } finally { BALANCE.chainRate = o; } });
check("連鎖の長さ: chainDepth 1 なら、後続のさらに後続は予約しない", () => { const o = BALANCE.chainDepth; BALANCE.chainDepth = 1; try { assert.equal(planScheduleChain(M(), { key: "pricespike", stateId: S.i }, d0, sure, 1), null); assert.ok(planScheduleChain(M(), { key: "famine", stateId: S.i }, d0, sure, 0)); } finally { BALANCE.chainDepth = o; } });
check("選挙は、敗北（swing<0）のときだけ政権交代を予約する", () => { assert.equal(planScheduleChain(M(), { key: "election", stateId: S.i, swing: 3 }, d0, sure, 0), null); assert.ok(planScheduleChain(M(), { key: "election", stateId: S.i, swing: -2 }, d0, sure, 0)); });

console.log("=== 期日が来ると起きる ===");
check("期日前には起きない / 期日が来ると、後続が年表に載り、予約が減る", () => {
  assert.equal(duePending(M(), d0).length, 0);
  const n0 = listPending(M()).length;
  let y = d0.year; for (let m = 1; m <= 12; m++) sim.advanceMonthly({ year: y, month: m }, none);
  assert.ok(nat("pricespike").length >= 1 && nat("refugees").length >= 1, "後続が起きる");
  assert.ok(listPending(M()).length < n0);
});
check("後続は、さらに後続（暴動）を予約できる（段の上限まで）", () => { const c = planScheduleChain(M(), { key: "pricespike", stateId: S.i }, d0, sure, 1); assert.ok(c); });
check("政権交代は、指導者の交代につながる", () => {
  const before = leaderRecord(M(), S.i).current.id;
  store.commit(makeCommand("t", [], [])); // no-op
  const p = { key: "turnover", stateId: S.i, due: { ...d0 }, depth: 1, from: "election" };
  const cmd = makeCommand("予約", [], [{ apply: (m) => { m.ext.data.pendingEvents = [...(m.ext.data.pendingEvents ?? []), p]; }, revert: () => {} }]); store.commit(cmd);
  sim.advanceMonthly({ year: d0.year + 5, month: 6 }, none);
  assert.ok(nat("turnover").length >= 1); assert.notEqual(leaderRecord(M(), S.i).current.id, before);
});
check("連鎖の末に民意が低くなっても、反乱は起きない（火種として表示するだけ）", () => {
  const rebellionsBefore = listHistory(M()).filter((h) => h.type === "rebellion" || h.type === "independence").length;
  store.commit(makeCommand("民意", [], [setProps(M().pack.states[S.i], { support: 10 })]));
  const sp = rebellionSpark(M(), S.i); assert.ok(sp && sp.level === "強い");
  for (let m = 1; m <= 12; m++) sim.advanceMonthly({ year: d0.year + 6, month: m }, none);
  assert.equal(listHistory(M()).filter((h) => h.type === "rebellion" || h.type === "independence").length, rebellionsBefore);
});
check("民意が高ければ火種は出ない", () => { store.commit(makeCommand("民意", [], [setProps(M().pack.states[S.i], { support: 70 })])); assert.equal(rebellionSpark(M(), S.i), null); });
check("Undo で予約も戻る", () => { const n = listPending(M()).length; const c = planScheduleChain(M(), { key: "famine", stateId: S.i }, d0, sure, 0); store.commit(c); assert.ok(listPending(M()).length > n); store.undo(); assert.equal(listPending(M()).length, n); });
check("クロニクルに連鎖の出来事が日本語で載る・undefined なし", () => { const md = chronicleToMarkdown(buildChronicle(M(), { includeCells: false })); assert.ok(md.includes("[物価の高騰]") && !/undefined|NaN/.test(md)); });
if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
