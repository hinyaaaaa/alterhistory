// v2.4.0 の戦争形態: 国ごとに選べる・双方が食い違ってよい・進行中に上げると負荷が増す・非対称戦の特殊な出来事。
import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { planDeclareAndResolveWar, planSetWarType, planAdvanceWars, listWars } from "../js/core/edit/wars.js";
import { warTypeOf, warTypeKey, asymOf, supportOf, planSupportDeltas } from "../js/core/sim/war-engine.js";
import { rollWarMonth, newFx } from "../js/core/sim/war-events.js";
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
const fix0 = (m) => m;
console.log("=== 戦争形態は国ごとに選べる（食い違ってよい） ===");
const A = fix(mk([6000, 6000, 4000, 3000, 3000])), r = planDeclareAndResolveWar(A, { attackers: [1], defenders: [2], date, rnd: createRandom(5), type: "conventional", types: { 1: "total", 2: "asymmetric" } });
const s = createStore({ map: A }); s.commit(r.command);
const w = listWars(s.getState().map)[0];
assert.deepEqual(w.types, { 1: "total", 2: "asymmetric" }, "国ごとの選択が戦争に残る");
assert.equal(w.type, "asymmetric+total", "戦争全体は、2つの選択を合成した形態");
assert.ok(warTypeOf(w.type).asym && asymOf(w.type), "どちらかが非対称戦なら、特殊な出来事が起きる形態になる");
assert.ok(Math.abs(warTypeOf(w.type).weary - (warTypeOf("total").weary + warTypeOf("asymmetric").weary) / 2) < 1e-9, "数値は双方の平均");
const same = planDeclareAndResolveWar(fix(mk()), { attackers: [1], defenders: [2], date, rnd: createRandom(5), types: { 1: "limited", 2: "limited" } });
assert.equal(same.type, "limited", "双方が同じなら、そのまま");
console.log("  OK   国ごとの選択・食い違いの合成");

console.log("=== 国への負荷は、形態ごと・ドクトリンごとに違う ===");
const res = { aStrength: { land: 10 }, dStrength: { land: 5 }, losses: { 1: 0.1, 2: 0.1 }, winner: "attacker" };
const d1 = planSupportDeltas(res, { attackers: [1], defenders: [2], months: 24, type: "conventional", types: { 1: "total", 2: "limited" } });
const d2 = planSupportDeltas(res, { attackers: [1], defenders: [2], months: 24, type: "conventional", types: { 1: "limited", 2: "limited" } });
assert.ok(d1[1] < d2[1], "同じ国でも、総力戦を選ぶほうが民意が下がる（負荷が大きい）");
const mp = fix(mk()); mp.pack.states[1].doctrine = "balanced"; mp.pack.states[1].doctrineNodes = ["u.party.1"]; mp.pack.states[1].regime = "party";
const d3 = planSupportDeltas(res, { attackers: [1], defenders: [2], months: 24, type: "conventional", types: { 1: "conventional", 2: "conventional" }, map: mp });
const d4 = planSupportDeltas(res, { attackers: [1], defenders: [2], months: 24, type: "conventional", types: { 1: "conventional", 2: "conventional" }, map: fix(mk()) });
assert.ok(d3[1] !== d4[1], "軍事ドクトリンでも、同じ形態の負荷が変わる");
console.log("  OK   形態×ドクトリンの負荷");

console.log("=== 進行中に形態を上げると負荷が増す（限定戦 → 通常戦） ===");
const B = fix(mk()), rb = planDeclareAndResolveWar(B, { attackers: [1], defenders: [2], date, rnd: createRandom(8), types: { 1: "limited", 2: "limited" } });
const sb = createStore({ map: B }); sb.commit(rb.command);
const wid = listWars(sb.getState().map)[0].id, sup0 = supportOf(sb.getState().map.pack.states[1]);
const up = planSetWarType(sb.getState().map, wid, 1, "conventional", date); sb.commit(up);
const wb = listWars(sb.getState().map)[0];
assert.ok(supportOf(sb.getState().map.pack.states[1]) < sup0, "形態を上げると、民意が下がる");
assert.equal(wb.types[1], "conventional"); assert.equal(wb.type, "conventional+limited");
assert.ok(wb.events.some((e) => e.kind === "type-change"), "形態の変更が戦争の記録に残る");
const sup1 = supportOf(sb.getState().map.pack.states[1]);
sb.commit(planSetWarType(sb.getState().map, wid, 1, "limited", date));
assert.equal(supportOf(sb.getState().map.pack.states[1]), sup1, "形態を下げるのに負荷は無い");
assert.equal(planSetWarType(sb.getState().map, wid, 1, "limited", date), null, "変化が無ければ何もしない");
assert.throws(() => planSetWarType(sb.getState().map, wid, 5, "total", date), /加わっていない/);
sb.undo(); sb.undo();
assert.equal(listWars(sb.getState().map)[0].types[1], "limited", "Undo で戻る");
console.log("  OK   形態の変更・負荷・Undo");

console.log("=== 非対称戦では特殊な出来事が起きる ===");
const countKinds = (type) => { const kinds = new Set(); for (let k = 1; k <= 400; k++) { const mm = fix(mk([20000, 3000])); const ww = { id: 1, attackers: [1], defenders: [2], type, events: [], omens: [], startedAt: date, withdrawn: {}, muster: {} }; const out = rollWarMonth(mm, ww, { year: 1, month: 1 }, createRandom(k), newFx()); for (const e of out.events) if (e.kind === "event") kinds.add(e.title); } return kinds; };
const asym = countKinds("asymmetric"), conv = countKinds("conventional");
assert.ok(["ゲリラの待ち伏せ", "占領地の抵抗", "民衆の蜂起"].every((t) => asym.has(t)), "非対称戦の特殊な出来事が起きる");
assert.ok(!["ゲリラの待ち伏せ", "占領地の抵抗", "民衆の蜂起", "補給線への破壊工作"].some((t) => conv.has(t)), "通常戦では起きない");
assert.ok(countKinds("asymmetric+total").has("占領地の抵抗"), "合成した形態でも、非対称が入っていれば起きる");
console.log("  OK   非対称戦の出来事");

console.log("=== 技術ドクトリンに合わない出来事は出ない ===");
const lowTech = new Set(); for (let k = 1; k <= 600; k++) { const mm = fix(mk([20000, 3000])); for (const st of mm.pack.states.slice(1)) st.techLevel = 1; const ww = { id: 1, attackers: [1], defenders: [2], type: "conventional", events: [], omens: [], startedAt: date, withdrawn: {}, muster: {} }; for (const e of rollWarMonth(mm, ww, date, createRandom(k), newFx()).events) if (e.kind === "event") lowTech.add(e.title); }
assert.ok(!lowTech.has("反戦運動") && !lowTech.has("技術的突破") && !lowTech.has("調停の申し出"), "技術水準が低い時代に、反戦デモや新型兵器は出ない");
console.log("  OK   時代に合う出来事だけ");
console.log("\n全て成功");
