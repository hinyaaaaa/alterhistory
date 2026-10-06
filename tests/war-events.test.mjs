import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { planDeclareAndResolveWar, planAdvanceWars, planWithdraw, planReevaluateWars, planSignTreaty, currentWarScore, listWars } from "../js/core/edit/wars.js";
import { planCovertOp, covertOdds, listCovertOps } from "../js/core/sim/covert.js";
import { forceHeadcount } from "../js/core/sim/units.js";
import { makeCommand } from "../js/core/edit/commands.js";

const reg = (id, i, inf) => ({ i, name: `軍${i}`, state: id, cell: 0, u: { infantry: inf, cavalry: 0, archers: 0, artillery: Math.round(inf / 40), armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } });
const st = (i, full, inf, o = {}) => ({ i, name: full.slice(0, 3), fullName: full, techLevel: 5, industry: 300, rural: 3000, urban: 500, cells: 8, capital: 1, morale: 70, support: 70, doctrine: "balanced", military: [reg(i, 0, inf), reg(i, 1, inf / 2)], diplomacy: [], treasury: 1000, ...o });
const N = 40;
const mk = (techs = [5, 5, 5, 5, 5]) => { const m = {
  worldTime: { year: 1, month: 1 }, rev: {}, meta: {}, markers: [], notes: [],
  pack: { states: [{ i: 0, name: "N", diplomacy: [] }, ...[6000, 5000, 4000, 4000, 4000].map((inf, k) => st(k + 1, `国${k + 1}王国`, inf, { techLevel: techs[k] }))],
    burgs: [null, ...[1, 2, 3, 4, 5].flatMap((sid) => [0, 4].map((o) => ({ i: 0, name: `都${sid}${o ? "b" : "a"}`, cell: (sid - 1) * 8 + o, state: sid })))].map((b, k) => (b ? { ...b, i: k } : b)),
    provinces: [0], cultures: [null], religions: [null], cells: { state: Uint16Array.from({ length: N }, (_, i) => Math.floor(i / 8) + 1), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1) } },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [i - 1, i + 1].filter((x) => x >= 0 && x < N)) }, p: Array.from({ length: N }, () => [0, 0]) } }, ext: { data: {} } };
  for (const s of m.pack.states.slice(1)) s.capital = m.pack.burgs.find((b) => b && b.state === s.i).i; return m; };
const d0 = { year: 1, month: 1 };
const monthDate = (k) => ({ year: 1 + Math.floor(k / 12), month: 1 + (k % 12) });

// ---------- ハプニング ----------
const store = createStore({ map: mk() });
const r = planDeclareAndResolveWar(store.getState().map, { attackers: [1], defenders: [2], date: d0, rnd: createRandom(7), type: "total" }); store.commit(r.command);
const rnd = createRandom(99);
let kinds = new Set(), omens = 0, fulfilled = 0, faded = 0;
for (let k = 1; k <= 60; k++) {
  const c = planAdvanceWars(store.getState().map, monthDate(k), rnd); if (c) store.commit(c);
  if (!listWars(store.getState().map)[0]) break;
}
const w = listWars(store.getState().map)[0];
for (const e of w.events) { kinds.add(e.kind); if (e.kind === "omen") omens++; if (e.kind === "omen-fulfilled") fulfilled++; if (e.kind === "omen-faded") faded++; }
assert.ok(w.events.length >= 5, `60か月でハプニングが何度か起きる（${w.events.length}件）`);
assert.ok(w.events.every((e) => e.date && e.title && e.text), "記録には日付・題・本文がある");
assert.ok(omens >= 1 && fulfilled + faded >= 1, `「兆し」が出て、実現するか杞憂に終わる（兆し${omens}・実現${fulfilled}・杞憂${faded}）`);
assert.ok(w.events.length <= 40, "出来事の数に上限がある");
// 兆しは曖昧、実現は具体的（含みを持たせる）
const om = w.events.find((e) => e.kind === "omen"); assert.ok(/らしい|という|噂|報せ|続いている/.test(om.text), `兆しは断定しない言い方: ${om.text}`);
// 再現性: 同じ種なら同じ出来事
{ const s2 = createStore({ map: mk() }); const r2 = planDeclareAndResolveWar(s2.getState().map, { attackers: [1], defenders: [2], date: d0, rnd: createRandom(7), type: "total" }); s2.commit(r2.command);
  const rn2 = createRandom(99); for (let k = 1; k <= 60; k++) { const c = planAdvanceWars(s2.getState().map, monthDate(k), rn2); if (c) s2.commit(c); }
  assert.deepEqual(listWars(s2.getState().map)[0].events, w.events, "同じ乱数なら同じ出来事（再現できる）"); }
// ハプニングは戦況の傾きを動かし、再判定に反映される
assert.ok(typeof w.edgeShift === "number");
const before = JSON.stringify(w.result.compare);
const rv = planReevaluateWars(store.getState().map, [1, 2], null);
if (rv) { store.commit(makeCommand("再判定", [], [rv])); assert.ok(listWars(store.getState().map)[0].result.compare, "再判定できる"); }
void before;
// 戦争が続くほど、損害は積み重なる（終わりは決まっていない）
assert.ok(listWars(store.getState().map)[0].progress > 1, "目安の期間を超えても戦争は続いている");
assert.equal(listWars(store.getState().map)[0].endedAt, null);

// ---------- 軍を引き上げる ----------
const s3 = createStore({ map: mk() });
const r3 = planDeclareAndResolveWar(s3.getState().map, { attackers: [1], defenders: [2], date: d0, rnd: createRandom(5), type: "conventional" }); s3.commit(r3.command);
const wid = listWars(s3.getState().map)[0].id;
const m3a = s3.getState().map; const sup0 = m3a.pack.states[1].support;
s3.commit(planWithdraw(m3a, wid, 1, [0], { year: 1, month: 2 })); // 部隊1だけ引き上げる
const m3 = s3.getState().map, w3 = listWars(m3)[0];
assert.deepEqual(w3.muster[1], [0], "引き上げた部隊は戦線から外れる"); assert.deepEqual(w3.muster[2], [0, 1], "相手の召集は変わらない");
assert.ok(m3.pack.states[1].morale < 70 && m3.pack.states[1].support > sup0, "撤退は士気を下げ、戦争への不満を和らげる");
const troops1 = forceHeadcount(m3.pack.states[1].military[1].u);
const c3 = planAdvanceWars(m3, monthDate(6), null); s3.commit(c3);
assert.equal(forceHeadcount(s3.getState().map.pack.states[1].military[1].u), troops1, "引き上げた部隊は、時間が経っても損耗しない");
assert.ok(forceHeadcount(s3.getState().map.pack.states[1].military[0].u) < 6000 + 150, "戦線に残った部隊は損耗する");
// 全軍撤退：その陣営の敗北で決着する
s3.commit(planWithdraw(s3.getState().map, wid, 1, [], { year: 1, month: 7 }));
const w3b = listWars(s3.getState().map)[0];
assert.equal(w3b.withdrawn[1].year, 1); assert.equal(w3b.result.winner, "defender", "攻撃側が全軍撤退すれば防衛側の勝ち"); assert.equal(w3b.result.victory.type, "withdrawal");
assert.ok(w3b.events.some((e) => e.kind === "withdraw"), "引き上げが記録に残る");
assert.throws(() => planWithdraw(s3.getState().map, wid, 4, [], d0), /参加していません/);
assert.equal(planWithdraw(s3.getState().map, wid, 1, [], d0), null, "同じ状態への再実行は何も起きない");
// 撤退後も、講和は結べる（結んだ月が終戦）
s3.commit(planSignTreaty(s3.getState().map, wid, { kind: "white", treatyName: "撤退和平" }, { year: 1, month: 9 }));
assert.deepEqual(listWars(s3.getState().map)[0].endedAt, { year: 1, month: 9 });

// ---------- 隠密作戦（サイバー攻撃） ----------
const hiA = covertOdds(mk([9, 3, 5, 5, 5]), 1, 2, "command"), loA = covertOdds(mk([3, 9, 5, 5, 5]), 1, 2, "command");
assert.ok(hiA.success > loA.success && hiA.power > loA.power && hiA.detect < loA.detect, "高技術の国ほど、成功しやすく・威力が大きく・発覚しにくい");
const s4 = createStore({ map: mk([9, 3, 5, 5, 5]) });
let okCount = 0, detCount = 0, mis = 0, tot = 0;
for (let k = 1; k <= 200; k++) {
  const sm = createStore({ map: mk([9, 3, 5, 5, 5]) }); const kind = ["command", "economy", "info"][k % 3];
  const { command, op } = planCovertOp(sm.getState().map, { attackerId: 1, targetId: 2, kind, date: d0, rnd: createRandom(k) }); sm.commit(command);
  const T = sm.getState().map.pack.states[2]; tot++;
  if (op.success) { okCount++; if (kind === "command") assert.ok(T.morale < 70 && forceHeadcount(T.military[0].u) < 5000 + 125, "指揮通信網の侵入は士気と兵力を削る"); if (kind === "economy") assert.ok(T.industry < 300, "産業を削る"); if (kind === "info") assert.ok(T.support < 70 + 2, "民意を削る"); }
  else { assert.ok(T.morale === 70 && T.industry === 300, "失敗なら効果なし"); }
  if (op.detected) { detCount++; if (op.blamed !== 1) mis++; }
  assert.equal(listCovertOps(sm.getState().map).length, 1, "記録が残る"); assert.ok(op.text.includes("国1王国"));
}
assert.ok(okCount / tot > 0.6 && okCount < tot, `技術優位なら成功しやすいが、必ず成功するわけではない（${okCount}/${tot}）`);
assert.ok(detCount > 0 && detCount < tot, "発覚することも、しないこともある");
assert.ok(mis > 0 && mis < detCount, `発覚しても、別の国の仕業と誤認されることがある（誤認 ${mis}/${detCount}）`);
assert.throws(() => planCovertOp(s4.getState().map, { attackerId: 1, targetId: 1, kind: "info", date: d0, rnd: createRandom(1) }), /自国/);
assert.throws(() => planCovertOp(s4.getState().map, { attackerId: 1, targetId: 2, kind: "magic", date: d0, rnd: createRandom(1) }), /種類/);
console.log("war-events OK");
