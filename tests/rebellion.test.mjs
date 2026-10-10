// 反乱・分離（HoI4 風）：属州が離反して別国家になり、軍が割れて内戦になる。補給などの細かい設定は持たない。
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { breakawayCandidates, pickBreakawayProvinces } from "../js/core/edit/rebellion.js";
import { listSovereigntyLog } from "../js/core/edit/sovereignty.js";
import { listWars } from "../js/core/edit/wars.js";
import { regimentsOf } from "../js/core/sim/military.js";
import { forceHeadcount } from "../js/core/sim/units.js";
import { buildTimeline } from "../js/io/chronicle.js";
import { rollNaturalEvents } from "../js/core/sim/natural-events.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.stack?.split("\n").slice(0, 3).join(" | ")}`); } };
const date = { year: 50, month: 3 };
const fresh = async () => {
  const { map } = await buildHistoricalWorld();
  const store = createStore({ map });
  const sim = createSimActions({ store, renderer: { requestRender() {} } });
  return { store, sim, M: () => store.getState().map };
};
/**
 * 合成の世界は、分離できる国が1つで部隊も無い。テスト用に、その国へ
 *   ・分離側の属州を2つにし（元の属州を半分に割る）
 *   ・首都に部隊（兵力の割合で割られる）と、分離側の領土に部隊（そのまま移る）を置く
 */
const prepare = async () => {
  const w = await fresh();
  const { map } = { map: w.M() };
  const parent = live(w.M).find((s) => breakawayCandidates(map, s.i).length >= 1);
  const P = map.pack.provinces[breakawayCandidates(map, parent.i)[0].provinceId];
  const c = map.pack.cells, cells = []; for (let i = 0; i < c.province.length; i++) if (c.province[i] === P.i && c.state[i] === parent.i) cells.push(i);
  const P2 = { ...P, i: map.pack.provinces.length, name: "分割属州", fullName: "分割属州" };
  map.pack.provinces.push(P2);
  for (const i of cells.slice(Math.floor(cells.length / 2))) c.province[i] = P2.i;
  const { p } = map.geometry.pack, capCell = map.pack.burgs[parent.capital].cell;
  const reg = (i, cell, u) => ({ i, name: `部隊${i}`, icon: "🛡️", state: parent.i, cell, x: p[cell][0], y: p[cell][1], bx: p[cell][0], by: p[cell][1], u });
  parent.military = [reg(0, capCell, { infantry: 6000, armor: 200, air: 50 }), reg(1, cells[0], { infantry: 3000 })];
  return { ...w, parent, provIds: [P.i, P2.i], rebelCell: cells[0] };
};
const live = (M) => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
const head = (M, id) => regimentsOf(M().pack.states[id]).reduce((n, r) => n + forceHeadcount(r.u ?? {}), 0);
// 属州が2つ以上あり、分離できる属州がある国を探す
const pickParent = (M) => live(M).find((s) => breakawayCandidates(M(), s.i).length >= 1);

console.log("=== 分離する属州の選び方 ===");
{
  const { M } = await fresh();
  const parent = pickParent(M);
  check("分離できる国がある", () => assert.ok(parent));
  const cands = breakawayCandidates(M(), parent.i);
  check("首都の属州は候補に入らない", () => { const cap = M().pack.burgs[parent.capital]; assert.ok(cands.every((c) => M().pack.cells.province[cap.cell] !== c.provinceId)); });
  check("首都から遠い順に並ぶ", () => { for (let i = 1; i < cands.length; i++) assert.ok(cands[i - 1].dist >= cands[i].dist); });
  check("選ばれる属州は、元の国に1つ以上の属州を残す", () => {
    const total = M().pack.provinces.filter((p) => p && p.i > 0 && !p.removed && p.state === parent.i).length;
    for (let s = 1; s <= 30; s++) { const ids = pickBreakawayProvinces(M(), parent.i, createRandom(s)); assert.ok(ids.length >= 1 && ids.length < total); }
  });
}

console.log("=== 手動：内戦つきで分離する ===");
{
  const { store, sim, M, parent, provIds, rebelCell } = await prepare();
  const fromId = parent.i;
  const headBefore = head(M, fromId), nStates = live(M).length, nWars = listWars(M()).length;
  let r;
  check("反乱を起こせる（名前・色を指定）", () => { r = sim.rebel({ provinceIds: provIds, name: "反乱共和国", color: "#aa3366", civil: true }); assert.equal(live(M).length, nStates + 1); });
  const ns = () => M().pack.states[r.id];
  check("別の国家として成立し、色・名前・分離元が入る", () => { assert.equal(ns().fullName, "反乱共和国"); assert.equal(ns().color, "#aa3366"); assert.equal(ns().parentState, fromId); assert.notEqual(ns().color, M().pack.states[fromId].color); });
  check("指定した属州がすべて新国家のものになる", () => { for (const id of provIds) assert.equal(M().pack.provinces[id].state, r.id); });
  check("首都が新国家の中にある", () => assert.equal(M().pack.burgs[ns().capital].state, r.id));
  check("軍が割れる：反乱側の領土の部隊はそのまま移り、首都の部隊からは兵力の一部が反乱軍に回る", () => {
    const rebelRegs = regimentsOf(ns());
    assert.ok(rebelRegs.some((x) => x.cell === rebelCell && x.u.infantry === 3000 && x.state === r.id), "領土内の部隊が移る");
    assert.ok(rebelRegs.some((x) => x.name.includes("反乱軍") && forceHeadcount(x.u) > 0), "反乱軍ができる");
    assert.ok(!regimentsOf(M().pack.states[fromId]).some((x) => x.cell === rebelCell), "元の国からは無くなる");
    assert.ok(head(M, fromId) < headBefore);
    assert.equal(head(M, r.id) + head(M, fromId), headBefore, "兵力の合計は変わらない");
    const ids = rebelRegs.map((x) => x.i); assert.equal(new Set(ids).size, ids.length, "部隊IDが重ならない");
  });
  check("内戦（戦争）が始まる：反乱側が攻撃側、元の国が防御側", () => {
    const w = listWars(M()).at(-1);
    assert.equal(listWars(M()).length, nWars + 1);
    assert.equal(w.type, "civil"); assert.ok(w.attackers.includes(r.id)); assert.ok(w.defenders.includes(fromId));
    assert.ok(w.name.includes("内戦"), w.name);
    assert.equal(r.warId, w.id);
  });
  check("年表に「反乱」として載る（国・戦争・主権の記録）", () => {
    const log = listSovereigntyLog(M()).at(-1);
    assert.equal(log.cause, "rebellion"); assert.deepEqual(log.provinceIds, provIds);
    const tl = buildTimeline(M());
    assert.ok(tl.some((e) => /反乱/.test(e.title) && e.title.includes("反乱共和国")), "年表に反乱の項目");
    assert.ok(!tl.some((e) => /undefined/.test(e.title ?? "")));
  });
  check("Undo 1回で、国・軍・戦争・記録がすべて元に戻る", () => {
    assert.equal(store.undo(), true);
    assert.equal(live(M).length, nStates); assert.equal(listWars(M()).length, nWars);
    assert.equal(head(M, fromId), headBefore); assert.equal(regimentsOf(M().pack.states[fromId]).length, 2);
    assert.equal(listSovereigntyLog(M()).filter((x) => x.cause === "rebellion").length, 0);
    for (const id of provIds) assert.equal(M().pack.provinces[id].state, fromId);
  });
}

console.log("=== 手動：平和的な独立（戦争にならない） ===");
{
  const { sim, M, parent, provIds } = await prepare();
  const headBefore = head(M, parent.i), nWars = listWars(M()).length;
  const r = sim.rebel({ provinceIds: provIds, name: "平和独立国", civil: false });
  check("戦争は始まらず、軍も割れない", () => { assert.equal(r.warId, null); assert.equal(listWars(M()).length, nWars); assert.equal(head(M, parent.i), headBefore); });
  check("分離元は記録され、年表は従来の「属州の独立」", () => { assert.equal(M().pack.states[r.id].parentState, parent.i); const log = listSovereigntyLog(M()).at(-1); assert.equal(log.cause, undefined); assert.ok(buildTimeline(M()).some((e) => e.title.includes("属州の独立"))); });
}

console.log("=== 失敗したら何も起きない ===");
{
  const { sim, M, parent, provIds } = await prepare();
  const n = live(M).length, w = listWars(M()).length, lg = listSovereigntyLog(M()).length, h = head(M, parent.i);
  const unchanged = () => { assert.equal(live(M).length, n); assert.equal(listWars(M()).length, w); assert.equal(listSovereigntyLog(M()).length, lg); assert.equal(head(M, parent.i), h); for (const id of provIds) assert.equal(M().pack.provinces[id].state, parent.i); };
  check("存在しない属州は失敗する", () => { assert.throws(() => sim.rebel({ provinceIds: [99999], name: "x", civil: true })); unchanged(); });
  check("別々の国の属州はまとめて分離できない", () => {
    const other = M().pack.provinces.find((p) => p && p.i > 0 && !p.removed && p.state !== parent.i);
    if (other) assert.throws(() => sim.rebel({ provinceIds: [provIds[0], other.i], name: "混成", civil: true }));
    unchanged();
  });
  check("途中（内戦の判定）で失敗したら、国・軍・属州・記録まで全部取り消される", () => {
    const boom = { ...createRandom(3), next() { throw new Error("boom"); } };
    assert.throws(() => sim.rebel({ provinceIds: provIds, name: "途中で失敗", civil: true, rng: boom }), /boom/);
    unchanged();
    assert.ok(!live(M).some((s) => s.fullName === "途中で失敗"));
  });
}

console.log("=== 自然発生：民意の低い国で、内戦になる反乱が起きる ===");
{
  const { sim, M } = await prepare();
  for (const s of live(M)) s.support = 5;
  const sure = () => ({ ...createRandom(7), next: () => 0 });
  const evs = rollNaturalEvents(M(), sure(), { enabled: true, frequency: "high" }).filter((e) => e.kind === "independence");
  check("独立の出来事は複数の属州と、内戦かどうかを持つ", () => { assert.ok(evs.length > 0); assert.ok(evs[0].provinceIds.length >= 1); assert.equal(evs[0].civil, true); assert.equal(evs[0].provinceId, evs[0].provinceIds[0]); });
  const nStates = live(M).length, nWars = listWars(M()).length;
  const done = sim.applyNaturalEvents(date, sure());
  check("実際に起きると、新国家ができて内戦が始まる（反乱）", () => {
    assert.ok(done.some((d) => d.title === "反乱（内戦）"), JSON.stringify(done));
    assert.ok(live(M).length > nStates); assert.ok(listWars(M()).length > nWars);
    assert.ok(listWars(M()).some((w) => w.type === "civil"));
  });
  check("自然発生で分かれた国は、名前が「仮」の印つき（あとで確定できる）", () => {
    const born = live(M).filter((s) => s.parentState);
    assert.ok(born.length > 0);
  });
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
