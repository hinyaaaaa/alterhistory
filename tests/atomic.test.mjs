// 複合操作の原子性：途中で失敗したら、全部取り消され、ログと世界の状態が一致する。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { makeCommand, setProps } from "../js/core/edit/commands.js";
import { planDeclareWar, listWars } from "../js/core/edit/wars.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message}`); } };

const reg = (i, inf) => [{ i: 0, name: "軍", state: i, cell: i, u: { infantry: inf, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } }];
const st = (i, name, inf) => ({ i, name, techLevel: 5, industry: 200, rural: 800, urban: 200, cells: 1, capital: i, military: reg(i, inf), diplomacy: [] });
const N = 8;
const world = () => ({
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 100, height: 100 },
  pack: {
    states: [{ i: 0, name: "Neutrals", diplomacy: [] }, st(1, "ア", 900), st(2, "イ", 800), st(3, "ウ", 800)],
    burgs: [null, ...[1, 2, 3].map((i) => ({ i, name: `都${i}`, cell: i, state: i, capital: 1 }))],
    provinces: [0], cultures: [null], religions: [null],
    cells: { state: new Uint16Array([0, 1, 2, 3, 3, 3, 3, 3]), province: new Uint16Array(N), biome: new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1]), culture: new Uint16Array(N), religion: new Uint16Array(N) },
  },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [Math.max(0, i - 1), Math.min(N - 1, i + 1)]) }, p: Array.from({ length: N }, () => [0, 0]) } },
  markers: [],
  ext: { data: {} },
});
const snapshot = (map) => JSON.stringify({ states: map.pack.states, cells: [...map.pack.cells.state], wars: listWars(map), markers: map.markers, ext: map.ext });

console.log("=== store.transaction ===");
check("成功すれば1回のUndoで全部戻る", () => {
  const store = createStore({ map: world() });
  const m = store.getState().map;
  store.transaction("2つ変える", () => {
    store.commit(makeCommand("a", [], [setProps(m.pack.states[1], { name: "A" })]));
    store.commit(makeCommand("b", [], [setProps(m.pack.states[2], { name: "B" })]));
  });
  assert.deepEqual([m.pack.states[1].name, m.pack.states[2].name], ["A", "B"]);
  assert.equal(store.undo(), true);
  assert.deepEqual([m.pack.states[1].name, m.pack.states[2].name], ["ア", "イ"]);
  assert.equal(store.canUndo(), false);
});
check("途中で例外なら、適用済みの変更が戻り、履歴にも残らない", () => {
  const store = createStore({ map: world() });
  const m = store.getState().map; const before = snapshot(m);
  assert.throws(() => store.transaction("失敗する", () => {
    store.commit(makeCommand("a", [], [setProps(m.pack.states[1], { name: "A" })]));
    throw new Error("途中で失敗");
  }), /途中で失敗/);
  assert.equal(snapshot(m), before);
  assert.equal(store.canUndo(), false);
  assert.equal(store.isDirty(), false);
});
check("1つのコマンドの途中の部品が失敗しても、半分だけ変わらない", () => {
  const store = createStore({ map: world() });
  const m = store.getState().map; const before = snapshot(m);
  const bad = { apply() { throw new Error("部品の失敗"); }, revert() {} };
  assert.throws(() => store.commit(makeCommand("半端", [], [setProps(m.pack.states[1], { name: "A" }), bad])), /部品の失敗/);
  assert.equal(snapshot(m), before);
});
check("バッチの中に入れ子にでき、内側の失敗だけを戻せる", () => {
  const store = createStore({ map: world() });
  const m = store.getState().map;
  store.beginBatch("外側");
  store.commit(makeCommand("外", [], [setProps(m.pack.states[1], { name: "外" })]));
  assert.throws(() => store.transaction("内側", () => { store.commit(makeCommand("内", [], [setProps(m.pack.states[2], { name: "内" })])); throw new Error("x"); }));
  store.endBatch();
  assert.deepEqual([m.pack.states[1].name, m.pack.states[2].name], ["外", "イ"]);
});

console.log("=== 講和＋併合（signTreaty） ===");
const setup = () => {
  const store = createStore({ map: world() });
  const renderer = { requestRender() {} };
  const sim = createSimActions({ store, renderer });
  const r = planDeclareWar(store.getState().map, { name: "テスト戦争", attackers: [1, 3], defenders: [2], date: { year: 1, month: 1 } });
  store.commit(r.command);
  return { store, sim, warId: r.id };
};
check("併合が失敗したら、講和も成立しない（ログと世界が一致）", () => {
  const { store, sim, warId } = setup();
  const m = store.getState().map; const before = snapshot(m);
  // 「イ」を 1 と 3 の両方に併合させる条項：2つ目の併合は、1つ目で「イ」が消えているため失敗する
  const ok = sim.signTreaty(warId, { kind: "annex", annex: [{ fromStateId: 2, toStateId: 1 }, { fromStateId: 2, toStateId: 3 }], treatyName: "失敗する条約" });
  assert.equal(ok, false);
  assert.equal(snapshot(store.getState().map), before, "世界は戦争中のまま、何も変わらない");
  assert.equal(listWars(store.getState().map)[0].endedAt, null, "戦争は終結していない");
  assert.ok(!listWars(store.getState().map)[0].terms, "条約の記録も残らない");
  assert.ok(store.getState().error, "失敗は画面に出る");
  assert.equal(store.peekUndoLabel()?.includes("宣戦") || store.peekUndoLabel()?.includes("戦争"), true, "取り消し履歴に講和が積まれない");
});
check("併合が成功すれば、講和・併合が1回のUndoで全部戻る", () => {
  const { store, sim, warId } = setup();
  const m = store.getState().map; const before = snapshot(m);
  const ok = sim.signTreaty(warId, { kind: "annex", annex: [{ fromStateId: 2, toStateId: 1 }], treatyName: "成功する条約" });
  assert.equal(ok, true, String(store.getState().error));
  assert.ok(listWars(store.getState().map)[0].endedAt, "戦争は終結");
  assert.equal(store.getState().map.pack.states[2].removed, true, "併合された国は消える");
  store.undo();
  assert.equal(snapshot(store.getState().map), before, "Undo 1回で講和も併合も戻る");
});

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
