import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { planDeclareAndResolveWar, planSignPeace, listWars } from "../js/core/edit/wars.js";
import { planSetCurrency, exchangeRate, planUpdateRates } from "../js/core/sim/currency.js";
import { carryingCapacity, computeAnnualUpdate } from "../js/core/sim/economy.js";
import { createStore } from "../js/core/store.js";

const mk = (i, name, inf) => ({ i, name, techLevel: 3, industry: 100, rural: 1000, urban: 200, capital: i, military: [{ i: 0, name: "軍", state: i, cell: i, u: { infantry: inf, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } }] });
const map = {
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0, labels: 0, lines: 0 },
  pack: {
    states: [{ i: 0, name: "Neutrals" }, mk(1, "アルダ", 9000), mk(2, "ボルク", 1000)],
    burgs: [null, { i: 1, name: "アルダ市", cell: 1, state: 1 }, { i: 2, name: "ボルク市", cell: 2, state: 2 }],
    provinces: [0], cells: { state: new Uint16Array([0, 1, 2, 2]), province: new Uint16Array(4), biome: new Uint8Array([1, 1, 1, 1]) },
  },
  geometry: { pack: { cells: { c: [[1], [0, 2], [1, 3], [2]] } } },
};
const store = createStore({ map });
const rnd = createRandom(7);
const r = planDeclareAndResolveWar(store.getState().map, { attackers: [1], defenders: [2], date: { year: 1, month: 1 }, rnd });
store.commit(r.command);
const m = store.getState().map;
assert.equal(r.result.winner, "attacker", "兵力9倍の側が勝つ");
assert.ok(m.pack.states[2].military[0].u.infantry < 1000, "敗者の兵が消耗する");
assert.ok(listWars(m)[0].name.length > 0);
assert.ok(r.result.compare.land > 0.8);
// 首都の割譲は拒否
assert.throws(() => planSignPeace(m, r.id, { regionCells: [[2, 3]], toStateId: 1 }, { year: 1, month: 2 }), /首都/);
// 首都以外は可。賠償金は通貨換算で移る
store.commit(planSetCurrency(m, 1, { name: "ゴールド" }));
const peace = planSignPeace(store.getState().map, r.id, { regionCells: [[3]], toStateId: 1, reparations: 50, treatyName: "アルダ条約" }, { year: 1, month: 2 });
store.commit(peace);
assert.equal(listWars(store.getState().map)[0].treatyName, "アルダ条約");
assert.equal(store.getState().map.pack.cells.state[3], 1);
// 固定相場は基準国に連動
store.commit(planSetCurrency(store.getState().map, 2, { regime: "pegged", pegTo: 1 }));
const up = planUpdateRates(store.getState().map, rnd); if (up) store.commit(up);
const mm = store.getState().map;
assert.equal(mm.pack.states[2].currency.rate, mm.pack.states[1].currency.rate);
assert.throws(() => planSetCurrency(mm, 1, { regime: "pegged", pegTo: 2 }), /お互い/);
// 人口は上限を超えない
const s = { rural: 5000, urban: 5000, cells: 100, techLevel: 3, carryDensity: 10 };
assert.ok(computeAnnualUpdate(s).rural + computeAnnualUpdate(s).urban <= carryingCapacity(s) + 1e-6);
console.log("war-instant OK");
