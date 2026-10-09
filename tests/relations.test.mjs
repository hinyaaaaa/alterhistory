// 外交の正本（relationOf）と、国家統合での同盟・従属・戦争の付け替え。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { relationOf, reconcileParts, diplomacyMismatches, planReconcileDiplomacy } from "../js/core/edit/relations.js";
import { planMergeStates } from "../js/core/edit/sovereignty.js";
import { planCreateAlliance } from "../js/core/edit/alliances.js";
import { planSetVassal } from "../js/core/edit/vassals.js";
import { planDeclareWar, listWars } from "../js/core/edit/wars.js";
import { getRelation } from "../js/core/edit/diplomacy.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.stack?.split("\n").slice(0, 3).join(" | ")}`); } };

const reg = (i, inf) => [{ i: 0, name: "軍", state: i, cell: i, u: { infantry: inf, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } }];
const st = (i, name) => ({ i, name, techLevel: 5, industry: 200, rural: 800, urban: 200, cells: 1, capital: i, military: reg(i, 800), diplomacy: [] });
const N = 12;
const world = () => ({
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 100, height: 100 },
  pack: {
    states: [{ i: 0, name: "Neutrals", diplomacy: [] }, ...[1, 2, 3, 4, 5, 6].map((i) => st(i, `国${i}`))],
    burgs: [null, ...[1, 2, 3, 4, 5, 6].map((i) => ({ i, name: `都${i}`, cell: i, state: i, capital: 1 }))],
    provinces: [0], cultures: [null], religions: [null],
    cells: { state: new Uint16Array([0, 1, 2, 3, 4, 5, 6, 6, 6, 6, 6, 6]), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1), culture: new Uint16Array(N), religion: new Uint16Array(N) },
  },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [Math.max(0, i - 1), Math.min(N - 1, i + 1)]) }, p: Array.from({ length: N }, () => [0, 0]) } },
  markers: [], ext: { data: {} },
});
const date = { year: 4, month: 2 };
const fresh = () => { const store = createStore({ map: world() }); return { store, map: store.getState().map, run: (c) => store.commit(c.command ?? c) }; };

console.log("=== 正本（relationOf） ===");
check("戦争 > 従属 > 同盟 > 外交表 の順で決まる", () => {
  const { map, run } = fresh();
  assert.equal(relationOf(map, 1, 2), null);
  run(planCreateAlliance(map, "同盟", [1, 2, 3], date)); assert.equal(relationOf(map, 1, 2), "Ally");
  run(planSetVassal(map, 2, 1, "vassal", date)); assert.equal(relationOf(map, 2, 1), "Vassal"); assert.equal(relationOf(map, 1, 2), "Suzerain");
  run(planDeclareWar(map, { name: "戦", attackers: [1], defenders: [2], date })); assert.equal(relationOf(map, 1, 2), "Enemy");
  assert.equal(relationOf(map, 1, 3), "Ally");
});
check("外交表だけの値（友好など）は、そのまま残る", () => {
  const { map } = fresh(); map.pack.states[1].diplomacy = ["x", "x", "Friendly"]; map.pack.states[2].diplomacy = ["x", "Friendly"];
  assert.equal(relationOf(map, 1, 2), "Friendly");
});
check("外交表が事実とずれていれば、検出して合わせられる", () => {
  const { map, run, store } = fresh();
  run(planCreateAlliance(map, "同盟", [1, 2], date));
  map.pack.states[1].diplomacy = []; map.pack.states[2].diplomacy = [];
  assert.ok(diplomacyMismatches(map).length >= 1);
  const c = planReconcileDiplomacy(map); assert.ok(c); store.commit(c);
  assert.equal(getRelation(map, 1, 2), "Ally"); assert.deepEqual(diplomacyMismatches(map), []);
  store.undo(); assert.equal(getRelation(map, 1, 2), null);
});

console.log("=== 国家統合での付け替え ===");
check("同盟の加盟国が、統合先に付け替わる（Undoで戻る）", () => {
  const { map, run, store } = fresh();
  run(planCreateAlliance(map, "三国同盟", [1, 2, 3], date, "standard", 2));
  run(planMergeStates(map, { from: 2, to: 4, date }));
  const a = map.ext.data.alliances[0];
  assert.deepEqual(a.members.sort(), [1, 3, 4]); assert.equal(a.leader, 4); assert.ok(!a.dissolvedAt);
  assert.equal(relationOf(map, 1, 4), "Ally"); assert.equal(getRelation(map, 4, 1), "Ally", "外交表も付け替わる");
  assert.equal(relationOf(map, 1, 2), null, "消えた国との関係は残らない");
  store.undo(); assert.deepEqual(map.ext.data.alliances[0].members, [1, 2, 3]);
});
check("統合先がすでに加盟していれば1つにまとまり、2か国未満の同盟は解消される", () => {
  const { map, run } = fresh();
  run(planCreateAlliance(map, "二国同盟", [1, 2], date)); run(planCreateAlliance(map, "四六同盟", [4, 6], date));
  run(planMergeStates(map, { from: 2, to: 1, date: { year: 5, month: 1 } }));
  const a = map.ext.data.alliances.find((x) => x.name === "二国同盟");
  assert.deepEqual(a.members, [1]); assert.deepEqual(a.dissolvedAt, { year: 5, month: 1 });
  assert.ok(!map.ext.data.alliances.find((x) => x.name === "四六同盟").dissolvedAt, "無関係の同盟は触らない");
});
check("従属国は、新しい宗主国に付け替わる", () => {
  const { map, run } = fresh();
  run(planSetVassal(map, 3, 2, "puppet", date));
  run(planMergeStates(map, { from: 2, to: 5, date }));
  assert.equal(map.pack.states[3].vassal.overlord, 5); assert.equal(map.pack.states[3].vassal.kind, "puppet");
  assert.equal(relationOf(map, 3, 5), "Vassal");
});
check("統合先と統合元の従属関係は、統合で消える", () => {
  const { map, run } = fresh();
  run(planSetVassal(map, 5, 2, "vassal", date));
  run(planMergeStates(map, { from: 2, to: 5, date }));
  assert.equal(map.pack.states[5].vassal, null);
});
check("続いている戦争の参戦国が付け替わる", () => {
  const { map, run } = fresh();
  const w = planDeclareWar(map, { name: "対六戦争", attackers: [2], defenders: [6], date }); run(w);
  run(planMergeStates(map, { from: 2, to: 4, date }));
  const war = listWars(map)[0];
  assert.deepEqual(war.attackers, [4]); assert.ok(!war.endedAt);
  assert.equal(relationOf(map, 4, 6), "Enemy"); assert.equal(getRelation(map, 4, 6), "Enemy");
});
check("敵と味方が1つの国になる戦争は、統合で終結する（歴史の記録として残る）", () => {
  const { map, run } = fresh();
  run(planDeclareWar(map, { name: "内輪戦争", attackers: [2], defenders: [3], date }));
  run(planMergeStates(map, { from: 2, to: 3, date: { year: 6, month: 6 } }));
  const war = listWars(map)[0];
  assert.deepEqual(war.endedAt, { year: 6, month: 6 }); assert.equal(war.terms.kind, "white"); assert.ok(war.terms.notes.includes("統合"));
});
check("終わった戦争・解消済みの同盟は書き換えない（当時の記録を守る）", () => {
  const { map, run, store } = fresh();
  run(planCreateAlliance(map, "昔の同盟", [1, 2], date));
  const al = map.ext.data.alliances[0]; al.dissolvedAt = { year: 4, month: 6 };
  run(planMergeStates(map, { from: 2, to: 3, date: { year: 8, month: 1 } }));
  assert.deepEqual(map.ext.data.alliances[0].members, [1, 2]);
});

check("統合された国の部隊は、IDが重ならず、所属も統合先になる", () => {
  const { map, run, store } = fresh();
  map.pack.states[2].military = [{ i: 0, name: "二軍", state: 2, cell: 2, u: { infantry: 100 } }, { i: 1, name: "二軍B", state: 2, cell: 2, u: { infantry: 50 } }];
  map.pack.states[3].military = [{ i: 0, name: "三軍", state: 3, cell: 3, u: { infantry: 70 } }];
  run(planMergeStates(map, { from: 2, to: 3, date }));
  const mil = map.pack.states[3].military;
  assert.equal(mil.length, 3); assert.equal(new Set(mil.map((r) => r.i)).size, 3, "IDが重ならない");
  assert.ok(mil.every((r) => r.state === 3), "所属が統合先");
  assert.equal(mil.find((r) => r.name === "二軍B").u.infantry, 50, "中身は変わらない");
  store.undo(); assert.equal(map.pack.states[3].military.length, 1); assert.equal(map.pack.states[2].military[0].state, 2);
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
