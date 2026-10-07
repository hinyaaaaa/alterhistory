// 戦争の勝敗は開戦時に固定されず、いまの戦力に追従する（再判定）ことの検証。
import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { makeCommand } from "../js/core/edit/commands.js";
import { planDeclareAndResolveWar, planAdvanceWars, planReevaluateWars, listWars } from "../js/core/edit/wars.js";

const reg = (i, inf) => [{ i: 0, name: "軍", state: i, cell: i, u: { infantry: inf, cavalry: 0, archers: 0, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } }];
const st = (i, name, inf) => ({ i, name, techLevel: 5, industry: 200, rural: 800, urban: 200, cells: 1, capital: i, military: reg(i, inf), diplomacy: [] });
const N = 8;
const map = () => ({
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 100, height: 100 },
  pack: {
    states: [{ i: 0, name: "Neutrals", diplomacy: [] }, st(1, "ア", 5000), st(2, "イ", 800)],
    burgs: [null, ...[1, 2].map((i) => ({ i, name: `都${i}`, cell: i, state: i }))],
    provinces: [0], cultures: [null], religions: [null],
    cells: { state: new Uint16Array([0, 1, 2, 2, 2, 2, 2, 2]), province: new Uint16Array(N), biome: new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1]), culture: new Uint16Array(N), religion: new Uint16Array(N) },
  },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [Math.max(0, i - 1), Math.min(N - 1, i + 1)]) }, p: Array.from({ length: N }, () => [0, 0]) } },
  ext: { data: {} },
});

const store = createStore({ map: map() });
const date = { year: 1, month: 1 };
const r = planDeclareAndResolveWar(store.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(3) });
store.commit(r.command);
const getWar = () => listWars(store.getState().map).find((w) => w.id === r.id);

// 首都陥落・民意崩壊で決着した戦争は覆らない仕様なので、通常の優勢による判定に揃えてから試す
{
  const m = store.getState().map; const w = getWar();
  w.result.victory = { type: "superiority", text: "" };
  void m;
}
assert.equal(getWar().result.winner, "attacker", "兵力5000対800: 開戦時は攻撃側が優勢");

// 1) 攻撃側の軍が壊滅したあと再判定すると、勝敗が追従する
store.getState().map.pack.states[1].military = reg(1, 10);
const re = planReevaluateWars(store.getState().map, [1, 2], null);
assert.ok(re, "再判定のコマンドが作られる");
store.commit(makeCommand("戦況の再判定", [], [re]));
assert.notEqual(getWar().result.winner, "attacker", "攻撃側が壊滅したなら、開戦時の勝者のままではない");

// 2) 月が進んだ戦争は、毎月の再判定の対象としてコマンドに記録される
const store2 = createStore({ map: map() });
const r2 = planDeclareAndResolveWar(store2.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(5) });
store2.commit(r2.command);
const adv = planAdvanceWars(store2.getState().map, { year: 1, month: 3 }, null);
assert.ok(adv, "2か月ぶん進行する");
assert.ok(adv.touchedWars.includes(r2.id), "進んだ戦争は再判定の対象（touchedWars）に入る");

console.log("  OK   戦争の勝敗は戦力の変化に追従する");
console.log("\n全テスト合格");
