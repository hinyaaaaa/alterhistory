import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { createStore } from "../js/core/store.js";
import { planDeclareAndResolveWar, planAdvanceWars, planSetWarType, listWars } from "../js/core/edit/wars.js";
import { DOCTRINE_BY_KEY } from "../js/core/sim/units.js";
import { monthlyWarLoad, warTypeOf } from "../js/core/sim/war-engine.js";
import { BALANCE, resetBalance } from "../js/core/sim/balance.js";

const reg = (id, i, inf) => ({ i, name: `軍${i}`, state: id, cell: 0, u: { infantry: inf, cavalry: 0, archers: 0, artillery: Math.round(inf / 40), armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } });
const st = (i, full, inf, o = {}) => ({ i, name: full.slice(0, 3), fullName: full, techLevel: 5, industry: 300, rural: 3000, urban: 500, cells: 8, capital: 1, morale: 70, support: 70, doctrine: "balanced", military: [reg(i, 0, inf), reg(i, 1, inf / 2)], diplomacy: [], treasury: 1000, ...o });
const N = 40;
const mk = (techs = [5, 5, 5, 5, 5]) => { const m = {
  worldTime: { year: 1, month: 1 }, rev: {}, meta: {}, markers: [], notes: [],
  pack: { states: [{ i: 0, name: "N", diplomacy: [] }, ...[6000, 5000, 4000, 4000, 4000].map((inf, k) => st(k + 1, `国${k + 1}王国`, inf, { techLevel: techs[k] }))],
    burgs: [null, ...[1, 2, 3, 4, 5].flatMap((sid) => [0, 4].map((o) => ({ i: 0, name: `都${sid}${o ? "b" : "a"}`, cell: (sid - 1) * 8 + o, state: sid })))].map((b, k) => (b ? { ...b, i: k } : b)),
    provinces: [0], cultures: [null], religions: [null], cells: { state: Uint16Array.from({ length: N }, (_, i) => Math.floor(i / 8) + 1), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1) } },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [i - 1, i + 1].filter((x) => x >= 0 && x < N)) }, p: Array.from({ length: N }, () => [0, 0]) } }, ext: { data: {} } };
  for (const s of m.pack.states.slice(1)) s.capital = m.pack.burgs.find((b) => b && b.state === s.i).i; return m; };
const d0 = { year: 1, month: 1 };
const monthDate = (k) => ({ year: 1 + Math.floor(k / 12), month: 1 + (k % 12) });


// v2.4.1 A2: 戦争形態の負荷が、国庫・産業にも出る。
const run = (type, months = 6, tweak = null) => {
  const store = createStore({ map: mk() }); const m0 = store.getState().map;
  if (tweak) tweak(m0);
  const before = m0.pack.states.map((s) => ({ t: s.treasury, ind: s.industry, sup: s.support }));
  const r = planDeclareAndResolveWar(m0, { attackers: [1], defenders: [2], date: d0, rnd: createRandom(5), type }); store.commit(r.command);
  const rnd = createRandom(50);
  for (let k = 1; k <= months; k++) { const c = planAdvanceWars(store.getState().map, monthDate(k), rnd); if (c) store.commit(c); }
  return { store, map: store.getState().map, before, war: listWars(store.getState().map)[0] };
};
const loss = (x, id) => ({ t: x.before[id].t - x.map.pack.states[id].treasury, ind: x.before[id].ind - x.map.pack.states[id].industry });
const lim = run("limited"), con = run("conventional"), tot = run("total");
console.log("=== 形態が重いほど、国庫・産業が減る ===");
for (const id of [1, 2]) {
  assert.ok(loss(lim, id).t >= 0 && loss(con, id).t > loss(lim, id).t && loss(tot, id).t > loss(con, id).t, `国庫の減り（国${id}）: 限定${loss(lim, id).t.toFixed(1)} < 通常${loss(con, id).t.toFixed(1)} < 総力${loss(tot, id).t.toFixed(1)}`);
  assert.ok(loss(lim, id).ind >= 0 && loss(con, id).ind > loss(lim, id).ind && loss(tot, id).ind > loss(con, id).ind, `産業の落ち（国${id}）`);
}
// 戦争に加わっていない国は、変わらない
assert.equal(con.map.pack.states[3].treasury, con.before[3].t); assert.equal(con.map.pack.states[3].industry, con.before[3].ind);
console.log("=== 実際に起きた減りが、戦争に記録される（概要タブの表示の元） ===");
for (const id of [1, 2]) {
  const b = con.war.burden?.[id]; assert.ok(b, `国${id}の負荷の記録がある`);
  assert.equal(b.months, 6, "月数が記録される");
  assert.ok(Math.abs(b.treasury - loss(con, id).t) < 0.1, `記録の国庫の減りが、実際の減りと一致（${b.treasury.toFixed(2)} vs ${loss(con, id).t.toFixed(2)}）`);
  assert.ok(Math.abs(b.industry - loss(con, id).ind) < 1.5, `記録の産業の落ちが、実際と一致（${b.industry.toFixed(2)} vs ${loss(con, id).ind.toFixed(2)}）`);
  assert.ok(b.support <= 0, "民意の実際の増減が記録される");
}
console.log("=== 全体の調整値・国庫の底 ===");
{ BALANCE.warTreasuryLoad = 0; BALANCE.warIndustryLoad = 0; const z = run("total"); resetBalance();
  assert.equal(z.map.pack.states[1].treasury, z.before[1].t, "国庫の負荷0なら、国庫は減らない"); assert.equal(z.map.pack.states[1].industry, z.before[1].ind, "産業の負荷0なら、産業は落ちない"); }
{ const poor = run("total", 6, (m) => { m.pack.states[1].treasury = 3; }); assert.ok(poor.map.pack.states[1].treasury >= 0, "国庫は0より下がらない"); assert.ok(poor.war.burden[1].treasury <= 3 + 1e-9, "記録も、実際に減った額まで"); }
console.log("=== ドクトリンの負荷（moraleLoss）と、非対称戦の占領側 ===");
{ const ks = Object.keys(DOCTRINE_BY_KEY); const ml = (k) => DOCTRINE_BY_KEY[k].moraleLoss ?? 1; const hi = ks.reduce((a, b) => (ml(b) > ml(a) ? b : a)), lo = ks.reduce((a, b) => (ml(b) < ml(a) ? b : a));
  if (ml(hi) > ml(lo)) { const T = warTypeOf("conventional"); const a = monthlyWarLoad({ doctrine: hi, techLevel: 5 }, T, { revenue: 1200 }), b = monthlyWarLoad({ doctrine: lo, techLevel: 5 }, T, { revenue: 1200 });
    assert.ok(a.treasury > b.treasury && a.industryShare > b.industryShare, `moraleLoss が大きいドクトリン（${hi}）のほうが負荷が重い`); }
  const A = warTypeOf("asymmetric"), s5 = { doctrine: "balanced", techLevel: 5 };
  assert.ok(monthlyWarLoad(s5, A, { revenue: 1200, occupier: true }).treasury > monthlyWarLoad(s5, A, { revenue: 1200, occupier: false }).treasury, "非対称戦は、占領する側の国庫の負担が重い");
  assert.equal(monthlyWarLoad(s5, warTypeOf("conventional"), { revenue: 1200, occupier: true }).treasury, monthlyWarLoad(s5, warTypeOf("conventional"), { revenue: 1200, occupier: false }).treasury, "通常戦は、占領側の区別が無い"); }
console.log("=== 形態を上げると、国庫にも少し効く（下げるのは負担なし） ===");
{ const store = createStore({ map: mk() }); const r = planDeclareAndResolveWar(store.getState().map, { attackers: [1], defenders: [2], date: d0, rnd: createRandom(5), type: "limited" }); store.commit(r.command);
  const id = listWars(store.getState().map)[0].id, t0 = store.getState().map.pack.states[1].treasury;
  store.commit(planSetWarType(store.getState().map, id, 1, "total", d0)); const t1 = store.getState().map.pack.states[1].treasury;
  assert.ok(t1 < t0 && t1 > t0 * 0.9, `限定→総力で国庫が少し減る（${t0} → ${t1}）`);
  store.commit(planSetWarType(store.getState().map, id, 1, "limited", d0)); assert.equal(store.getState().map.pack.states[1].treasury, t1, "下げても国庫は戻らず、減りもしない"); }
console.log("戦争形態の負荷（国庫・産業）: OK");
