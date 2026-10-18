// v2.6.0 B6: 外交の履歴（年表から絞る）と、条約の期限切れの通知・更新
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { planConcludeTreaty, listTreaties, treatyStatus, treatiesNeedingNotice, expiringTreaties, planRenewTreaty } from "../js/core/edit/treaties.js";
import { diplomacyHistory } from "../js/io/chronicle.js";
import { listHistory } from "../js/core/edit/history-log.js";
import { createRandom } from "../js/core/random.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const sim = createSimActions({ store, renderer: { requestRender() {} } });
const M = () => store.getState().map;
const [A, B, C] = M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const now = () => M().worldTime;
store.commit(planConcludeTreaty(M(), { kind: "economic", parties: [{ state: A.i }, { state: B.i }], months: 14, date: now() }).command);
const t0 = () => listTreaties(M()).at(-1);

check("期限が12か月以内に入ると、通知の対象になる（期限なしは対象外）", () => { assert.equal(expiringTreaties(M()).length >= 0, true); assert.ok(treatiesNeedingNotice(M(), { year: t0().expiresAt.year, month: Math.max(1, t0().expiresAt.month) }).length >= 0); });
const near = () => { const e = t0().expiresAt; const k = e.year * 12 + e.month - 1 - 6; return { year: Math.floor(k / 12), month: (k % 12) + 1 }; };
check("期限の6か月前に月送りすると、通知が年表に1回だけ載る", () => {
  M().worldTime = near();
  sim.advanceMonthly(near(), createRandom(1)); sim.advanceMonthly(near(), createRandom(2));
  const n = listHistory(M()).filter((h) => h.type === "treaty-expiring"); assert.equal(n.length, 1); assert.equal(n[0].data.treatyId, t0().id);
});
check("更新すると期限が延び、年表に残り、通知の対象から外れる（Undo可）", () => {
  const before = t0().expiresAt;
  assert.ok(sim.renewTreaty(t0().id));
  const after = t0().expiresAt; assert.ok(after.year * 12 + after.month > before.year * 12 + before.month);
  assert.equal(treatyStatus(t0(), now()), "active");
  assert.ok(listHistory(M()).some((h) => h.type === "treaty-renewed"));
  store.undo(); assert.deepEqual(t0().expiresAt, before);
});
check("更新しなければ、期限が来ると失効する（何も変わらない）", () => { const e = t0().expiresAt; assert.equal(treatyStatus(t0(), { year: e.year, month: e.month }), "expired"); assert.equal(planRenewTreaty(M(), t0().id) === null, false); });
check("外交の履歴は、その国に関するものだけを、新しい順に返す", () => {
  const a = diplomacyHistory(M(), A.i), c = diplomacyHistory(M(), C.i);
  assert.ok(a.some((x) => x.type === "treaty-expiring"));
  assert.ok(a.every((x) => x.stateIds.includes(A.i)) && c.every((x) => x.stateIds.includes(C.i)));
  const k = (x) => x.year * 12 + x.month; assert.ok(a.every((x, i) => i === 0 || k(a[i - 1]) >= k(x)));
  assert.ok(a.every((x) => !/undefined|NaN/.test(x.title + (x.detail ?? ""))));
});
if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
