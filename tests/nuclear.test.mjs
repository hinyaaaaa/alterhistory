import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { planDraftNuclearOp, planExecuteNuclearOp, planCancelNuclearOp, listNuclearOps, nuclearStock } from "../js/core/sim/nuclear.js";
import { planDeclareAndResolveWar } from "../js/core/edit/wars.js";
import { planAnnualConscription } from "../js/core/sim/military.js";
import { createRandom } from "../js/core/random.js";

const st = (i, tech, nuke) => ({ i, name: `国${i}`, techLevel: tech, industry: 300, rural: 900, urban: 100, cells: 1, capital: i, morale: 70, diplomacy: [], military: [{ i: 0, name: "軍", state: i, cell: i, u: { infantry: 1000, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: nuke } }] });
const map = { worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 10, height: 10 },
  pack: { states: [{ i: 0, name: "N", diplomacy: [] }, st(1, 9, 3), st(2, 5, 0), st(3, 5, 0)], burgs: [null, { i: 1, name: "a", cell: 1, state: 1 }, { i: 2, name: "b", cell: 2, state: 2 }, { i: 3, name: "c", cell: 3, state: 3 }],
    provinces: [0], cells: { state: new Uint16Array([0, 1, 2, 3]), province: new Uint16Array(4), biome: new Uint8Array([0, 1, 1, 1]) } },
  geometry: { pack: { h: new Uint8Array(4), cells: { c: [[1], [0, 2], [1, 3], [2]] }, p: [[0, 0], [0, 0], [0, 0], [0, 0]] } }, ext: { data: {} } };
const store = createStore({ map });
const date = { year: 1, month: 1 };
assert.ok(planDraftNuclearOp(store.getState().map, { attackerId: 1, targetId: 3 }).id, "戦争していない相手にも、核を持っていれば立案できる");
assert.throws(() => planDraftNuclearOp(store.getState().map, { attackerId: 2, targetId: 1 }), /足りません/, "核を持たない国は立案できない");
store.commit(planDeclareAndResolveWar(store.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(1) }).command);
assert.throws(() => planDraftNuclearOp(store.getState().map, { attackerId: 1, targetId: 2, warheads: 9 }), /足りません/);
const stockBefore = nuclearStock(store.getState().map.pack.states[1]);
const d = planDraftNuclearOp(store.getState().map, { attackerId: 1, targetId: 2, warheads: 2 }); store.commit(d.command);
assert.equal(nuclearStock(store.getState().map.pack.states[1]), stockBefore, "立案しただけでは核は減らない");
const S2 = store.getState().map.pack.states[2]; const popBefore = S2.rural, moraleBefore = S2.morale, troopsBefore = S2.military[0].u.infantry, indBefore = S2.industry;
store.commit(planExecuteNuclearOp(store.getState().map, d.id, date));
const m = store.getState().map;
assert.equal(nuclearStock(m.pack.states[1]), stockBefore - 2, "実行で核を消費する");
const T2 = m.pack.states[2];
assert.ok(T2.rural < popBefore * 0.9, "人口に打撃");
assert.ok(T2.morale < moraleBefore, "士気が実際に下がる（戦争の判定に使われる値そのもの）");
assert.ok(T2.military[0].u.infantry < troopsBefore, "軍隊にも打撃");
assert.ok(T2.industry < indBefore, "産業にも打撃");
// 技術が高いほど精度・威力が上がる
import("../js/core/sim/nuclear.js").then(({ warheadSpec }) => { const lo = warheadSpec(3), hi = warheadSpec(9); assert.ok(hi.accuracy > lo.accuracy && hi.yieldK > lo.yieldK && hi.popLoss / hi.yieldK < lo.popLoss / lo.yieldK, "高技術ほど精度・威力が上がり、民間への当たりが減る"); });
assert.equal(listNuclearOps(m)[0].status, "executed");
assert.throws(() => planExecuteNuclearOp(m, d.id, date), /すでに/);
store.undo(); assert.equal(nuclearStock(store.getState().map.pack.states[1]), stockBefore, "Undoで戻る");
// 年次の兵力変動・宣戦布告の自動判定では核は使われない・増えない
const s2 = createStore({ map: JSON.parse(JSON.stringify({ x: 0 })) && store.getState().map });
for (let y = 0; y < 5; y++) { const c = planAnnualConscription(s2.getState().map, 1); if (c) s2.commit(c); }
assert.equal(nuclearStock(s2.getState().map.pack.states[1]), stockBefore, "年次で核は増えない");
const op2 = planDraftNuclearOp(s2.getState().map, { attackerId: 1, targetId: 2 }); s2.commit(op2.command);
s2.commit(planCancelNuclearOp(s2.getState().map, op2.id)); assert.equal(listNuclearOps(s2.getState().map).length, 1, "取り消したのは新しい作戦だけ（先の立案は残る）");
console.log("nuclear OK");
