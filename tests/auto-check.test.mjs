// 自動検査: 操作後と5年ごとに、問題があるときだけ通知する。無所属の土地はエラーではない。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createAutoCheck, AUTO_CHECK_YEARS } from "../js/app/auto-check.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { checkIntegrity } from "../js/core/edit/integrity.js";
import { setProps, makeCommand } from "../js/core/edit/commands.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const timers = []; const ac = createAutoCheck({ store, setTimer: (f) => { timers.push(f); return timers.length; }, clearTimer: (i) => { if (i) timers[i - 1] = null; } });
const M = () => store.getState().map;
const flush = () => { for (const f of timers.splice(0)) f?.(); };
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);

console.log("=== 問題が無ければ、何も出ない ===");
check("健全なら、検査しても何も通知しない", () => { assert.equal(ac.run(), false); assert.ok(!store.getState().error); });
check("5年ごとの検査は、問題が無ければ通知しない", () => { assert.equal(ac.onYear(AUTO_CHECK_YEARS * 8), false); assert.ok(!store.getState().error); });
check("5の倍数でない年は、検査しない", () => { const bad = live()[0]; const cap = M().pack.burgs[bad.capital]; const old = bad.capital; bad.capital = 999999; assert.equal(ac.onYear(41), false); bad.capital = old; });

console.log("=== 無所属の土地はエラーではない ===");
check("都市が無所属の土地にあっても、検査はエラーにしない", () => {
  const b = M().pack.burgs.find((x) => x && x.i && !x.removed && x.state !== 0 && !live().some((s) => s.capital === x.i));
  if (!b) return;
  const c = M().pack.cells; const keepS = c.state[b.cell], keepB = b.state; c.state[b.cell] = 0; b.state = 0;
  const probs = checkIntegrity(M(), null, { skipEconomyChecks: true }).filter((p) => /無所属/.test(p));
  c.state[b.cell] = keepS; b.state = keepB; assert.equal(probs.length, 0, probs.join(","));
});

console.log("=== 問題があるときだけ通知する ===");
const target = () => live()[0];
check("操作のあと、問題があれば右下に出る（少し待ってからまとめて検査）", () => {
  store.update((s) => { s.error = null; });
  store.commit(makeCommand("わざと壊す", [], [setProps(target(), { capital: 9999999 })]));
  assert.ok(!store.getState().error, "待つ間は出ない"); flush();
  assert.ok(/データに問題があります/.test(store.getState().error ?? ""), store.getState().error);
});
check("同じ問題は、直るまで繰り返し出さない", () => { store.update((s) => { s.error = null; }); assert.equal(ac.run(), false); assert.ok(!store.getState().error); });
check("5年ごとの自動検査も、問題があれば出る（別の問題として）", () => {
  store.update((s) => { s.error = null; });
  const s2 = live()[1]; store.commit(makeCommand("もう1つ壊す", [], [setProps(s2, { capital: 8888888 })])); flush();
  assert.ok(/データに問題があります/.test(store.getState().error ?? ""));
  store.update((s) => { s.error = null; });
});
check("直ると、また出るようになる（記憶が消える）", () => { store.undo(); store.undo(); flush(); store.update((s) => { s.error = null; }); assert.equal(ac.run(), false); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
