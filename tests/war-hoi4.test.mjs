import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { planDeclareAndResolveWar, planFinishWar, planWarPreview, planReevaluateWars, planSignPeace, suggestTreaty, suggestCessionChunks, uniqueTreatyName, listWars, planPeaceVenue } from "../js/core/edit/wars.js";
import { planDraftNuclearOp, planExecuteNuclearOp } from "../js/core/sim/nuclear.js";
import { planNextCollapse } from "../js/core/sim/collapse.js";
import { DOCTRINES } from "../js/core/sim/units.js";

const W = 12, N = W;
const reg = (id, i, inf, extra = {}) => ({ i, name: `軍${i}`, state: id, cell: 0, u: { infantry: inf, cavalry: 0, archers: 0, artillery: 0, armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0, ...extra } });
const st = (i, name, regs, o = {}) => ({ i, name, techLevel: 6, industry: 300, rural: 900, urban: 100, cells: 4, capital: i, morale: 70, doctrine: "balanced", military: regs, diplomacy: [], ...o });
const mk = () => ({
  worldTime: { year: 1, month: 1 }, rev: { places: 0, politics: 0, terrain: 0 }, meta: { width: 10, height: 10 }, markers: [], notes: [],
  pack: {
    states: [{ i: 0, name: "N", diplomacy: [] },
      st(1, "ア", [reg(1, 0, 3000), reg(1, 1, 3000)], { treasury: 1000 }), st(2, "イ", [reg(2, 0, 2500)], { treasury: 800 })],
    burgs: [null, { i: 1, name: "アーク", cell: 0, state: 1 }, { i: 2, name: "イード", cell: 11, state: 2 }, { i: 3, name: "イーナ", cell: 10, state: 2 }],
    provinces: [0], cultures: [null], religions: [null],
    cells: { state: Uint16Array.from([1, 1, 1, 1, 0, 0, 0, 0, 2, 2, 2, 2]), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1) },
  },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [i - 1, i + 1].filter((x) => x >= 0 && x < N).concat(i === 3 ? [8] : i === 8 ? [3] : [])) }, p: Array.from({ length: N }, () => [0, 0]) } },
  ext: { data: {} },
});
const date = { year: 1, month: 1 };

// --- 招集した部隊だけで戦う ---
const m0 = mk();
const full = planWarPreview(m0, { attackers: [1], defenders: [2] });
const half = planWarPreview(m0, { attackers: [1], defenders: [2], muster: { 1: [0] } });
assert.ok(half.aStrength.land < full.aStrength.land * 0.6, "招集した部隊だけが戦力になる（バーが変わる）");
const store = createStore({ map: mk() });
const r = planDeclareAndResolveWar(store.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(5), muster: { 1: [0] } });
store.commit(r.command);
store.commit(planFinishWar(store.getState().map, r.id));
const m = store.getState().map;
assert.equal(m.pack.states[1].military[1].u.infantry, 3000, "招集しなかった部隊は損耗しない");
assert.ok(m.pack.states[1].military[0].u.infantry < 3000, "招集した部隊は損耗する");
const w = listWars(m)[0];
assert.ok(w.forecast.length >= 2 && w.forecast.every((b) => b.name && b.text && b.date), "想定の戦闘ログが自動生成される");
  assert.equal(w.battles.length, 0, "実際の戦闘は、まだ記録されていない");
assert.ok(w.result.casualties[2].lost > 0 && w.result.casualties[1].before === 3000, "各国の消耗が記録される");
// --- 士気が変動する ---
assert.notEqual(m.pack.states[1].morale, 70, "戦争で士気が動く");
assert.ok(m.pack.states[1].morale !== m.pack.states[2].morale);
const winner = w.result.winner === "attacker" ? 1 : 2, loser = winner === 1 ? 2 : 1;
if (w.result.winner !== "stalemate") assert.ok(m.pack.states[winner].morale > m.pack.states[loser].morale, "勝者の士気が敗者より高い");

// --- 講和：消耗に比例した自動案、小さな区画、条約名の重複回避 ---
const sug = suggestTreaty(m, w);
assert.ok(sug.exhaustion.length === 2 && Array.isArray(sug.reparations) && sug.cessionCells >= 0 && sug.warScore >= 0);
const chunks = suggestCessionChunks(m, [1], 2, { size: "s" });
assert.ok(chunks.length >= 1 && chunks.every((c) => c.cells <= 2 && !c.regionCells.includes(11) || c.regionCells.length <= 2), "小さい区画（既存の州に関係なく数セル）");
assert.ok(chunks.every((c) => !c.regionCells.includes(11)), "首都のセル(11?)は含まれない");
const big = suggestCessionChunks(m, [1], 2, { size: "l" });
assert.ok(big[0].cells >= chunks[0].cells, "大きさを選べる");
const v = planPeaceVenue(m, w.id, createRandom(1));
store.commit(planSignPeace(m, w.id, { toStateId: winner, fromStateId: loser, regionCells: [chunks[0].regionCells], treatyName: v.treatyName, venue: { place: v.place } }, date));
assert.notEqual(uniqueTreatyName(store.getState().map, v.treatyName), v.treatyName, "同じ名前の条約は避けられる");

// --- 各ドクトリンに良さがある ---
for (const d of DOCTRINES) assert.ok(d.merit && d.war, `${d.label}に効果と説明がある`);
assert.equal(new Set(DOCTRINES.map((d) => d.merit)).size, DOCTRINES.length);

// --- 核が戦争の判定・士気に効く ---
const s2 = createStore({ map: mk() });
s2.getState().map.pack.states[1].military[0].u.nuclear = 2;
{ const rr = planDeclareAndResolveWar(s2.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(11) }); s2.commit(rr.command); s2.commit(planFinishWar(s2.getState().map, rr.id)); }
const w2 = listWars(s2.getState().map)[0];
const landBefore = w2.result.compare.land, moraleBefore = s2.getState().map.pack.states[2].morale;
const d = planDraftNuclearOp(s2.getState().map, { attackerId: 1, targetId: 2, warheads: 2 }); s2.commit(d.command);
s2.commit(planExecuteNuclearOp(s2.getState().map, d.id, date));
const re = planReevaluateWars(s2.getState().map, [2, 1], "☢ 核使用"); s2.commit({ label: "再判定", apply: re.apply, revert: re.revert, layers: [] }.apply ? (await import("../js/core/edit/commands.js")).makeCommand("再判定", [], [re]) : null);
const w2b = listWars(s2.getState().map)[0];
assert.ok(s2.getState().map.pack.states[2].morale < moraleBefore, "標的国の士気が下がる");
assert.ok(w2b.result.compare.land > landBefore, "核の打撃で陸軍力のバーが攻撃側へ動く");
assert.ok(w2b.result.compare.morale > w2.result.compare.morale, "士気のバーも動く");
assert.ok(w2b.events.some((e) => e.kind === "reevaluate" && e.text.includes("☢")), "戦争の出来事に核使用が残る（戦闘の記録とは別）");

// --- 人口の大部分が消えた国は崩壊（敵に併合） ---
const s3 = createStore({ map: mk() });
{ const rr = planDeclareAndResolveWar(s3.getState().map, { attackers: [1], defenders: [2], date, rnd: createRandom(2) }); s3.commit(rr.command); s3.commit(planFinishWar(s3.getState().map, rr.id)); }
assert.equal(planNextCollapse(s3.getState().map, date), null, "通常の戦争では崩壊しない");
s3.getState().map.pack.states[2].rural = 50; s3.getState().map.pack.states[2].urban = 10; // 人口が大幅に消滅
const c = planNextCollapse(s3.getState().map, date);
assert.ok(c && c.stateId === 2 && c.annexer === 1, "人口を失った国は、敵国に併合される");
s3.commit(c.command);
assert.ok(s3.getState().map.pack.states[2].removed, "国家が消滅する");
console.log("war-hoi4 OK");
