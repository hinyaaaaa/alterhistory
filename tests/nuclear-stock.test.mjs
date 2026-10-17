// v2.4.1 A5: 国家タブの「軍事」から核の保有数を設定する（planSetNuclearStock）。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { planSetNuclearStock, nuclearStock } from "../js/core/sim/nuclear.js";
import { emptyForce } from "../js/core/sim/units.js";

const reg = (i, nuclear, extra = {}) => ({ i, name: `部隊${i}`, state: 1, cell: 1, x: 0, y: 0, u: { ...emptyForce(), infantry: 10, nuclear }, ...extra });
const st = (i, military) => ({ i, name: `国${i}`, techLevel: 5, capital: i, military });
const map = { worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 10, height: 10 },
  pack: { states: [{ i: 0, name: "N" }, st(1, [reg(0, 2), reg(1, 5)]), st(2, []), st(3, [reg(0, 0)])], burgs: [null, { i: 1, cell: 1, state: 1 }, { i: 2, cell: 2, state: 2 }, { i: 3, cell: 3, state: 3 }], provinces: [0],
    cells: { state: new Uint16Array([0, 1, 2, 3]), province: new Uint16Array(4), biome: new Uint8Array([0, 1, 1, 1]) } },
  geometry: { pack: { h: new Uint8Array(4), cells: { c: [[1], [0, 2], [1, 3], [2]] }, p: [[0, 0], [1, 1], [2, 2], [3, 3]] } }, ext: { data: {} } };
const store = createStore({ map });
const S = (i) => store.getState().map.pack.states[i];

assert.equal(nuclearStock(S(1)), 7, "初期の保有数は部隊の合計");
assert.equal(planSetNuclearStock(store.getState().map, 1, 7), null, "同じ数なら何もしない");

// 増やす: 最も核を持つ部隊（部隊1）へ足す
store.commit(planSetNuclearStock(store.getState().map, 1, 10));
assert.equal(nuclearStock(S(1)), 10); assert.equal(S(1).military[1].u.nuclear, 8); assert.equal(S(1).military[0].u.nuclear, 2);
assert.equal(S(1).military[1].u.infantry, 10, "他の兵科は変わらない");
// 減らす: 多い部隊から引き、足りなければ次の部隊から
store.commit(planSetNuclearStock(store.getState().map, 1, 1));
assert.equal(nuclearStock(S(1)), 1); assert.ok(S(1).military.every((r) => r.u.nuclear >= 0));
// ゼロにもできる
store.commit(planSetNuclearStock(store.getState().map, 1, 0)); assert.equal(nuclearStock(S(1)), 0);
// Undo は1回ごとに戻る
store.undo(); assert.equal(nuclearStock(S(1)), 1); store.undo(); assert.equal(nuclearStock(S(1)), 10); store.undo(); assert.equal(nuclearStock(S(1)), 7);

// 部隊が無い国: 首都に「戦略軍」をつくって置く。Undo で消える
store.commit(planSetNuclearStock(store.getState().map, 2, 3));
assert.equal(nuclearStock(S(2)), 3); assert.equal(S(2).military.length, 1); assert.equal(S(2).military[0].cell, 2); assert.match(S(2).military[0].name, /戦略軍/);
store.undo(); assert.equal(S(2).military.length, 0); assert.equal(nuclearStock(S(2)), 0);
// 核0の部隊だけがある国へ増やす
store.commit(planSetNuclearStock(store.getState().map, 3, 4)); assert.equal(nuclearStock(S(3)), 4); assert.equal(S(3).military.length, 1);

// 不正な値・存在しない国は、エラー
assert.throws(() => planSetNuclearStock(store.getState().map, 1, -1), /0以上/);
assert.throws(() => planSetNuclearStock(store.getState().map, 1, 1.5), /整数/);
assert.throws(() => planSetNuclearStock(store.getState().map, 9, 1), /国家/);
console.log("核の保有数の設定: OK");
