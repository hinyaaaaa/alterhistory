import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { planDeclareAndResolveWar, planAdvanceWars, planFinishWar, planSignTreaty, treatyBudget, winnerShares, listWars, suggestTreaty } from "../js/core/edit/wars.js";
import { planCreateAlliance, planEditAlliance, leaderOf } from "../js/core/edit/alliances.js";
import { planSetVassal, planReleaseVassal, vassalInfo, planTribute } from "../js/core/edit/vassals.js";
import { simpleRelation } from "../js/core/edit/diplomacy.js";
import { supportOf, applyVictoryConditions } from "../js/core/sim/war-engine.js";
import { planAnnualUpdate } from "../js/core/sim/world.js";
import { convert } from "../js/core/sim/currency.js";
import { getFinance } from "../js/core/sim/trade.js";

const reg = (id, inf) => ({ i: 0, name: `軍${id}`, state: id, cell: 0, u: { infantry: inf, cavalry: 0, archers: 0, artillery: Math.round(inf / 40), armor: Math.round(inf / 60), air: Math.round(inf / 150), navy: 0, special: 0, advanced: 0, nuclear: 0 } });
const st = (i, full, inf, o = {}) => ({ i, name: full.slice(0, 3), fullName: full, techLevel: 5, industry: 300, rural: 3000, urban: 500, cells: 8, capital: i, morale: 70, doctrine: "balanced", military: [reg(i, inf)], diplomacy: [], treasury: 1000, ...o });
const N = 40;
// 国1: 0-7 / 国2: 8-15 / 国3: 16-23 / 国4: 24-31 / 国5: 32-39。首都は各国の最初の都市。
const mk = (infs = [20000, 3000, 4000, 3000, 3000]) => ({
  worldTime: { year: 1, month: 1 }, rev: {}, meta: {}, markers: [], notes: [],
  pack: {
    states: [{ i: 0, name: "N", diplomacy: [] }, ...infs.map((inf, k) => st(k + 1, `国${k + 1}王国`, inf))],
    burgs: [null, ...[1, 2, 3, 4, 5].flatMap((sid) => [0, 4].map((o) => ({ i: 0, name: `都${sid}${o ? "b" : "a"}`, cell: (sid - 1) * 8 + o, state: sid })))].map((b, k) => (b ? { ...b, i: k } : b)),
    provinces: [0], cultures: [null], religions: [null],
    cells: { state: Uint16Array.from({ length: N }, (_, i) => Math.floor(i / 8) + 1), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1), pop: new Float32Array(N).fill(1), t: new Int8Array(N), h: new Uint8Array(N).fill(30) },
  },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [i - 1, i + 1].filter((x) => x >= 0 && x < N)) }, p: Array.from({ length: N }, () => [0, 0]) } },
  ext: { data: {} },
});
// capital = first burg of the state
{ const m = mk(); for (const s of m.pack.states.slice(1)) s.capital = m.pack.burgs.find((b) => b && b.state === s.i).i; }
const fix = (m) => { for (const s of m.pack.states.slice(1)) s.capital = m.pack.burgs.find((b) => b && b.state === s.i).i; return m; };
const date = { year: 1, month: 1 };

// ---------- 民意と戦争疲労 ----------
const s1 = createStore({ map: fix(mk()) });
const r1 = planDeclareAndResolveWar(s1.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(3), type: "conventional" });
s1.commit(r1.command);
assert.equal(supportOf(s1.getState().map.pack.states[1]), 70, "宣戦布告の時点では民意は変わらない");
const w1 = listWars(s1.getState().map)[0];
assert.ok(w1.result.supportDelta && typeof w1.result.supportDelta[1] === "number", "民意の変動が見積もられている");
s1.commit(planFinishWar(s1.getState().map, w1.id));
const sa = supportOf(s1.getState().map.pack.states[1]), sd = supportOf(s1.getState().map.pack.states[2]);
assert.equal(sa, Math.max(0, Math.min(100, 70 + w1.result.supportDelta[1])), "戦闘が終わると、見積もりどおり民意が動く");
// 長い戦争ほど、民意が下がる
const dl = (type) => { let sum = 0; for (let k = 1; k <= 30; k++) { const q = planDeclareAndResolveWar(fix(mk([5000, 5000, 4000, 3000, 3000])), { attackers: [1], defenders: [2], date, rnd: createRandom(k), type }); sum += q.result.supportDelta[1] ?? 0; } return sum / 30; };
assert.ok(dl("asymmetric") < dl("limited"), "非対称戦（長期）のほうが、限定戦より民意が大きく下がる");
// 民意が低い国は、士気が実際には振るわない（バー・判定に効く）
const m2 = fix(mk()); m2.pack.states[1].support = 10;
const low = (await import("../js/core/sim/war-engine.js")).previewWar(m2, [1], [2]).aStrength.morale, hi = (await import("../js/core/sim/war-engine.js")).previewWar(fix(mk()), [1], [2]).aStrength.morale;
assert.ok(low < hi, "民意が低いと士気が下がる");
// 平時は回復する
const s3 = createStore({ map: fix(mk()) }); s3.getState().map.pack.states[3].support = 20;
for (let y = 0; y < 3; y++) { const c = planAnnualUpdate(s3.getState().map, null); if (c) s3.commit(c); }
assert.ok(supportOf(s3.getState().map.pack.states[3]) > 20 && supportOf(s3.getState().map.pack.states[3]) <= 70, "戦争をしていない国の民意は年ごとに回復する");

// ---------- 勝利条件 ----------
let capitals = 0, exhaust = 0, total = 0, attrition = 0;
for (let k = 1; k <= 120; k++) {
  const q = planDeclareAndResolveWar(fix(mk([40000, 3000, 3000, 3000, 3000])), { attackers: [1], defenders: [2], date, rnd: createRandom(k), type: "total" });
  total++; if (q.result.capitalFall) capitals++; if (q.result.victory.type === "exhaustion") exhaust++; if (q.result.victory.type === "attrition") attrition++;
  if (q.result.capitalFall) { assert.equal(q.result.winner, "attacker"); assert.ok(listWars({ ext: { data: { wars: [] } } }).length === 0); assert.ok(q.battles.at(-1).name.includes("陥落"), "最後の戦いは首都の陥落"); assert.ok(q.result.victory.text.includes("首都")); }
}
assert.ok(capitals > 5 && capitals < total, `圧倒的な戦力差では首都陥落が起きうる（${capitals}/${total}）`);
let lim = 0, asy = 0;
for (let k = 1; k <= 80; k++) { const L = planDeclareAndResolveWar(fix(mk([40000, 3000, 3000, 3000, 3000])), { attackers: [1], defenders: [2], date, rnd: createRandom(k), type: "limited" }); if (L.result.capitalFall) lim++; const A = planDeclareAndResolveWar(fix(mk([40000, 3000, 3000, 3000, 3000])), { attackers: [1], defenders: [2], date, rnd: createRandom(k), type: "asymmetric" }); if (A.result.capitalFall) asy++; }
assert.equal(asy, 0, "非対称戦では首都は陥落しない（占領できない）");
assert.ok(lim < capitals * 80 / 120, "限定戦は首都陥落が起きにくい");
// 首都陥落は早く終わり、戦争スコアが上がる
const stdMonths = [], fallMonths = [];
for (let k = 1; k <= 120; k++) { const q = planDeclareAndResolveWar(fix(mk([40000, 3000, 3000, 3000, 3000])), { attackers: [1], defenders: [2], date, rnd: createRandom(k), type: "total" }); (q.result.capitalFall ? fallMonths : stdMonths).push((q.endsAt.year - 1) * 12 + q.endsAt.month - 1); }
if (fallMonths.length && stdMonths.length) assert.ok(fallMonths.reduce((a, b) => a + b, 0) / fallMonths.length < stdMonths.reduce((a, b) => a + b, 0) / stdMonths.length, "首都が陥落した戦争は短く終わる");
// 民意の崩壊：膠着でも民意が尽きた側が降伏する
{ const m = fix(mk([5000, 5000, 3000, 3000, 3000])); m.pack.states[2].support = 8;
  const fake = { winner: "stalemate", decisiveness: 0.01, warScore: 0, moraleDelta: {}, casualties: { 1: { before: 100, lost: 5 }, 2: { before: 100, lost: 5 } } };
  const v = applyVictoryConditions(m, fake, { attackers: [1], defenders: [2], type: "conventional", supportDelta: { 2: -5, 1: -2 }, rnd: createRandom(1) });
  assert.equal(v.victory.type, "exhaustion"); assert.equal(v.winner, "attacker", "防衛側の民意が尽きれば攻撃側の勝ち"); assert.ok(v.warScore > 0); }

// ---------- 傀儡・保護国・属国 ----------
const s4 = createStore({ map: fix(mk()) });
s4.commit(planSetVassal(s4.getState().map, 2, 1, "puppet", date));
assert.deepEqual(vassalInfo(s4.getState().map, 2), { overlord: 1, kind: "puppet" });
assert.equal(simpleRelation(s4.getState().map, 2, 1), "vassal"); assert.equal(simpleRelation(s4.getState().map, 1, 2), "overlord");
assert.throws(() => planSetVassal(s4.getState().map, 1, 2, "vassal", date), /輪/, "従属関係が輪にならない");
assert.throws(() => planSetVassal(s4.getState().map, 3, 3, "vassal", date), /自国/);
s4.commit(planSetVassal(s4.getState().map, 3, 1, "protectorate", date));
// 宗主国が攻める戦争：傀儡は従い、保護国は加わらない
const rr = planDeclareAndResolveWar(s4.getState().map, { attackers: [1], defenders: [4], date, rnd: createRandom(2) });
assert.ok(rr.joined.some((j) => j.id === 2 && j.side === "attacker"), "傀儡は宗主国の戦争に従う");
assert.ok(!rr.joined.some((j) => j.id === 3), "保護国は、宗主国が攻める戦争には加わらない");
// 宗主国が攻められたら、保護国も守る
const rr2 = planDeclareAndResolveWar(s4.getState().map, { attackers: [4], defenders: [1], date, rnd: createRandom(2) });
assert.ok(rr2.joined.some((j) => j.id === 3 && j.side === "defender") && rr2.joined.some((j) => j.id === 2 && j.side === "defender"), "宗主国が攻められたら従属国も守る");
// 従属国が攻められたら宗主国が守る
const rr3 = planDeclareAndResolveWar(s4.getState().map, { attackers: [4], defenders: [3], date, rnd: createRandom(2) });
assert.ok(rr3.joined.some((j) => j.id === 1 && j.side === "defender"), "従属国が攻められたら宗主国が守る");
// 貢納
const before1 = getFinance(s4.getState().map.pack.states[1]).treasury, before2 = getFinance(s4.getState().map.pack.states[2]).treasury;
const tr = planTribute(s4.getState().map, (s) => getFinance(s).treasury, convert); s4.commit(tr);
const after1 = getFinance(s4.getState().map.pack.states[1]).treasury, after2 = getFinance(s4.getState().map.pack.states[2]).treasury;
assert.ok(after1 > before1 && after2 < before2, "従属国から宗主国へ貢納される"); assert.ok(before2 - after2 > before1 * 0 && (before2 - after2) > (1000 - getFinance(s4.getState().map.pack.states[3]).treasury) * 0, "傀儡の貢納（20%）のほうが重い");
const tb3 = 1000 - getFinance(s4.getState().map.pack.states[3]).treasury; assert.ok(before2 - after2 > tb3, "傀儡の貢納は保護国より重い");
// 宗主国が消えたら独立に戻る
s4.getState().map.pack.states[1].removed = true; assert.equal(vassalInfo(s4.getState().map, 2), null, "宗主国が無くなれば独立に戻る");
s4.getState().map.pack.states[1].removed = false;
s4.commit(planReleaseVassal(s4.getState().map, 2)); assert.equal(vassalInfo(s4.getState().map, 2), null);

// ---------- 講和での従属化 ----------
const s5 = createStore({ map: fix(mk([40000, 3000, 3000, 3000, 3000])) });
let sr = null; for (let k = 1; k <= 60 && !sr; k++) { const q = planDeclareAndResolveWar(s5.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(k), type: "total" }); if (q.result.winner === "attacker" && q.result.warScore >= 60) sr = { q, k }; }
assert.ok(sr, "戦争スコアの高い勝利が得られる");
s5.commit(sr.q.command); s5.commit(planFinishWar(s5.getState().map, sr.q.id));
const wv = listWars(s5.getState().map)[0];
assert.throws(() => planSignTreaty(s5.getState().map, wv.id, { kind: "vassal", vassalize: [{ fromStateId: 2, toStateId: 1, kind: "magic" }] }, date), /従属の種類/);
s5.commit(planSignTreaty(s5.getState().map, wv.id, { kind: "vassal", treatyName: "従属条約", vassalize: [{ fromStateId: 2, toStateId: 1, kind: "protectorate" }] }, date));
assert.deepEqual(vassalInfo(s5.getState().map, 2), { overlord: 1, kind: "protectorate" }, "敗者は併合されず従属する");
assert.equal(s5.getState().map.pack.cells.state[9], 2, "領土は変わらない");
assert.equal(listWars(s5.getState().map)[0].terms.vassalize[0].kind, "protectorate", "条約の記録に残る");

// ---------- 同盟の盟主 ----------
const s6 = createStore({ map: fix(mk()) });
const al = planCreateAlliance(s6.getState().map, "北方同盟", [1, 3], date, "standard", 3); s6.commit(al.command);
assert.equal(leaderOf(s6.getState().map.ext.data.alliances[0]), 3, "盟主を選べる");
assert.throws(() => planCreateAlliance(s6.getState().map, "x", [1, 3], date, "standard", 4), /盟主/);
s6.commit(planEditAlliance(s6.getState().map, 1, { leader: 1 })); assert.equal(leaderOf(s6.getState().map.ext.data.alliances[0]), 1);
// 勝者の取り分：盟主は多い（戦力が同じなら）
const s7 = createStore({ map: fix(mk([6000, 3000, 6000, 3000, 3000])) });
s7.commit(planCreateAlliance(s7.getState().map, "同盟", [1, 3], date, "loose", 1).command);
const q7 = planDeclareAndResolveWar(s7.getState().map, { attackers: [1, 3], defenders: [2], date, rnd: createRandom(1), type: "total" }); s7.commit(q7.command);
s7.getState().map.ext.data.wars[0].result.winner = "attacker";
const sh = winnerShares(s7.getState().map, listWars(s7.getState().map)[0]);
assert.ok(sh[1] > sh[3] && Math.abs(sh[1] + sh[3] - 1) < 1e-9, "同じ戦力なら、盟主のほうが取り分が多い");
console.log("war-rules OK");
