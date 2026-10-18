// v2.6.0 B3: 技術の機運（通知＋採用ボタン）。自動では進まない・採用で+1段・Undo・押さなければ変わらない
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { getTechDoctrine, planSetTechDoctrine } from "../js/core/edit/doctrines.js";
import { rollTechMomentum, pendingFields } from "../js/core/sim/tech-momentum.js";
import { listHistory } from "../js/core/edit/history-log.js";
import { buildTimeline } from "../js/io/chronicle.js";
import { BALANCE } from "../js/core/sim/balance.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const sim = createSimActions({ store, renderer: { requestRender() {} } });
const M = () => store.getState().map;
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const [A, B] = live();
A.neighbors = [B.i]; B.neighbors = [A.i]; // 合成マップには cells.c が無いので、Azgaar の neighbors で隣国を与える
const set = (id, p) => store.commit(planSetTechDoctrine(M(), id, p));
set(A.i, { ind: 5 }); set(B.i, { ind: 3 });
const sure = { ...createRandom(1), chance: () => true };
const date = { year: M().worldTime.year, month: 1 };

check("隣国が先に進んだ分野に、機運が出る（条件: 隣国の段）", () => {
  const evs = rollTechMomentum(M(), sure);
  assert.ok(evs.length >= 1 && evs.every((e) => e.target === getTechDoctrine(M().pack.states[e.stateId])[e.field] + 1));
});
check("確率0なら出ない（バランス調整）", () => { const old = BALANCE.momentumRate; BALANCE.momentumRate = 0; try { assert.equal(rollTechMomentum(M(), sure).length, 0); } finally { BALANCE.momentumRate = old; } });
check("月送りで機運が年表に載り、技術は自動では進まない", () => {
  const before = JSON.stringify(live().map((s) => getTechDoctrine(s)));
  for (let i = 0; i < 60; i++) sim.advanceMonthly({ year: date.year, month: (i % 12) + 1 }, sure);
  assert.ok(listHistory(M()).some((h) => h.type === "tech-momentum" && h.data?.field));
  assert.equal(JSON.stringify(live().map((s) => getTechDoctrine(s))), before);
});
check("年表（新聞）の項目が、分野・段つきで出る", () => { const e = buildTimeline(M()).find((x) => x.type === "tech-momentum"); assert.ok(e && e.data.field && e.stateIds.length === 1 && !/undefined/.test(e.title + e.detail)); });
const target = listHistory(M()).find((h) => h.type === "tech-momentum");
check("採用すると、その国の該当分野だけ +1 段（年表にも残る）", () => {
  const sid = target.states[0], f = target.data.field, lv = getTechDoctrine(M().pack.states[sid]);
  assert.ok(pendingFields(M(), sid).some((p) => p.field === f));
  assert.ok(sim.adoptTechMomentum(sid, f));
  const after = getTechDoctrine(M().pack.states[sid]);
  assert.equal(after[f], lv[f] + 1);
  for (const k of Object.keys(lv)) if (k !== f) assert.equal(after[k], lv[k]);
  assert.ok(!pendingFields(M(), sid).some((p) => p.field === f));
  assert.ok(listHistory(M()).some((h) => h.type === "tech" && /機運/.test(h.detail ?? "")));
});
check("もう一度は採用できない", () => assert.equal(sim.adoptTechMomentum(target.states[0], target.data.field), false));
check("Undo で段も機運も戻る", () => {
  const sid = target.states[0], f = target.data.field, cur = getTechDoctrine(M().pack.states[sid])[f];
  store.undo(); assert.equal(getTechDoctrine(M().pack.states[sid])[f], cur - 1); assert.ok(pendingFields(M(), sid).some((p) => p.field === f));
});
if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
