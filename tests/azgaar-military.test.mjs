import assert from "node:assert/strict";
import { importAzgaarMilitary, planAnnualConscription, regimentsOf } from "../js/core/sim/military.js";
import { forceHeadcount } from "../js/core/sim/units.js";
import { createStore } from "../js/core/store.js";

const reg = (i, u) => ({ i, name: `部隊${i}`, state: 1, cell: 1, u });
const map = {
  settings: { military: [{ name: "infantry", type: "melee" }, { name: "cavalry", type: "mounted" }, { name: "archers", type: "ranged" }, { name: "artillery", type: "machinery" }, { name: "fleet", type: "naval" }, { name: "dragons", type: "magical" }] },
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 },
  pack: { states: [{ i: 0 }, { i: 1, name: "ア", techLevel: 3, industry: 200, rural: 900, urban: 100, cells: 1, capital: 1, military: [reg(0, { infantry: 120, cavalry: 40, archers: 30, artillery: 5, fleet: 7, dragons: 2 }), reg(1, { infantry: 60 })] }],
    burgs: [null, { i: 1, name: "a", cell: 1, state: 1 }], cells: { state: new Uint16Array([0, 1]), biome: new Uint8Array([0, 1]) } },
  geometry: { pack: { cells: { c: [[1], [0]] }, p: [[0, 0], [0, 0]] } }, ext: { data: {} },
};
const before = map.pack.states[1].military.map((r) => Object.values(r.u).reduce((a, b) => a + b, 0));
assert.equal(importAzgaarMilitary(map), 1, "Azgaar形式の部隊だけ変換する");
const r0 = map.pack.states[1].military[0];
assert.deepEqual([r0.u.infantry, r0.u.cavalry, r0.u.archers, r0.u.artillery, r0.u.navy, r0.u.special], [120, 40, 30, 5, 7, 2], "人数は一切変わらない（fleet→海軍・魔法→特殊）");
assert.equal(forceHeadcount(r0.u), before[0], "総人数が元と一致");
assert.equal(r0.azU.fleet, 7, "元のデータは控えてある");
assert.equal(importAzgaarMilitary(map), 0, "2回目は何もしない（冪等）");
// 年次変動：新しい部隊は作らない。人数の急変もしない
const store = createStore({ map });
const n0 = regimentsOf(store.getState().map.pack.states[1]).length;
for (let y = 0; y < 20; y++) { const c = planAnnualConscription(store.getState().map, 1); if (c) store.commit(c); }
const st = store.getState().map.pack.states[1];
assert.equal(regimentsOf(st).length, n0, "部隊は増えない（新しい部隊を錬成しない）");
assert.ok(regimentsOf(st).every((r) => forceHeadcount(r.u) < 5000), "人数が暴走しない");
// 部隊が1つも無い国は何も起きない
const empty = createStore({ map: { ...map, pack: { ...map.pack, states: [{ i: 0 }, { ...map.pack.states[1], military: [] }] } } });
assert.equal(planAnnualConscription(empty.getState().map, 1), null, "部隊の無い国に新しい部隊は作られない");
console.log("azgaar-military OK");
