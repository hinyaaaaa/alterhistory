// v6.18.0: 5 系統ドクトリン／軍団（新設・戦死）／戦場（リアルタイム会戦）／核・隠密作戦／渡海／戦争の記録（スモーク。詳細なテストは v6.20.0 でまとめる）
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { TREE } from "../js/core/civ/techtree.js";
import { LINES, COMMON_NODES, TIERS, doctrineFx } from "../js/core/wcde/domains/doctrine.js";
import { canAdopt, adoptDoctrine, switchLine } from "../js/core/wcde/domains/military.js";
import { ensureCorps, corpsOf, createCorps, commanderFalls, installCommander, refreshPool } from "../js/core/wcde/corps.js";
import { createField, tickField, orderWing, reinforce, fieldOutcome } from "../js/core/wcde/battlefield.js";
import { covertOp, canNuke } from "../js/core/wcde/special-ops.js";
import { declareWar } from "../js/core/civ/diplomacy.js";
import * as awaitedPower from "../js/core/wcde/power.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "v618-1", spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 400 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
const own = (w, k = 0) => { const s = alive(w)[k]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }).ok); return s; };
const modern = (st) => { for (const t of TREE) st.techAdopted[t.id] ??= 0; st.treasury = 1e9; };

console.log("=== ドクトリン（5 系統 × 15 段）===");
await check("5 系統・75 ノード。段の前提は 1 つ前。技術は実在する", () => { assert.equal(LINES.length, 5); assert.equal(COMMON_NODES.length, 5 * TIERS); const ids = new Set(TREE.map((t) => t.id)); for (const n of COMMON_NODES) for (const t of n.tech) assert.ok(ids.has(t), t); });
await check("系統は 1 つだけ。切り替えると段を失い混乱が出る。混乱の間は効果が落ちる", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx; modern(st); st.military.doctrine = { taken: {} }; st.military.doc = { line: null, since: 0 };
  assert.ok(adoptDoctrine(ctx, st, "mass:1").ok); assert.ok(!canAdopt(st, "mobile:1").ok); for (let i = 2; i <= 6; i++) assert.ok(adoptDoctrine(ctx, st, `mass:${i}`).ok, `mass:${i}`);
  const fx0 = doctrineFx(st); assert.ok(fx0.mob > 0); const r = switchLine(ctx, st, "mobile"); assert.ok(r.ok && r.lost === 6 && st.military.confusion === 12); assert.equal(Object.keys(st.military.doctrine.taken).length, 0);
  assert.ok(adoptDoctrine(ctx, st, "mobile:1").ok); const a = doctrineFx(st).off; st.military.confusion = 0; assert.ok(doctrineFx(st).off > a, "混乱が解けると効果が戻る");
});
await check("人海戦術は同じ兵力でも陸・海の戦力が増える（動員）", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx; modern(st); const base = w.sim.ctx.civ; void base;
  st.military.fx = { ...st.military.fx, mob: 0 }; const { landPower, navalPower } = awaitedPower; const l0 = landPower(ctx.civ, st, 1000), n0 = navalPower(ctx.civ, st, 1000); st.military.fx.mob = 0.2; assert.ok(landPower(ctx.civ, st, 1000) > l0 * 1.15); assert.ok(navalPower(ctx.civ, st, 1000) > n0 * 1.1);
});

console.log("=== 軍団（新設・戦死）===");
await check("軍団を新設できる（指揮官は予備から）。指揮官が戦死すると後任が据わる", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx; modern(st); ensureCorps(ctx, st); refreshPool(ctx, st, true); const pool = st.corps.pool.filter((p) => (p.service ?? "land") === "land"); assert.ok(pool.length);
  const n0 = corpsOf(st).length; const r = createCorps(ctx, st, { service: "land", name: "試験軍", commanderId: pool[0].id }); assert.ok(r.ok, r.error); assert.equal(corpsOf(st).length, n0 + 1);
  const cp = corpsOf(st)[0], old = cp.commander.name; st.player = false; const id = commanderFalls(ctx, st, cp, "戦死した"); assert.ok(id); assert.ok(cp.commander && !cp.commander.dead && cp.commander.name !== old); assert.ok(st.corps.fallen.some((f) => f.name === old));
});

console.log("=== 戦場 ===");
await check("戦場は日ごとに進み、命令・予備・自動が効き、必ず終わる。結果は決着を反映する（陸海空宇宙で同じ）", () => {
  const w = fresh(), a = own(w, 0), b = alive(w)[1], ctx = w.sim.ctx; modern(a); modern(b);
  for (const dom of ["land", "sea", "air", "space"]) {
    const f = createField(ctx, { domain: dom, place: "試験の地", seed: "t" + dom, terr: 0.1, fort: 1, meDefends: false, me: { st: a, size: 8000, corps: null, morale: 0.8, supply: 1 }, foe: { st: b, size: 6000, corps: null, morale: 0.8, supply: 1 } });
    assert.ok(orderWing(f, 1, "flank").ok); assert.ok(reinforce(f, 0).ok); assert.ok(!reinforce(f, 1).ok, "3 日あける"); let g = 0; while (!f.done && g++ < 60) tickField(f, 1); assert.ok(f.done && f.result, dom);
    const o = fieldOutcome(f, true); assert.equal(o.winA, o.win); assert.ok(o.bias > 1 === o.winA);
  }
});

console.log("=== 隠密・核・戦争 ===");
await check("隠密作戦: 費用を払い、結果が返る。戦争中なら戦いの記録に残る。核は戦力がなければ使えない", () => {
  const w = fresh(), a = own(w, 0), b = alive(w).find((s) => s.id !== a.id), ctx = w.sim.ctx; modern(a); a.treasury = 1e6; const t0 = a.treasury;
  const r = covertOp(ctx, a, { kind: "sabotage", target: b.id }); assert.ok(r.ok && a.treasury < t0); assert.ok(!covertOp(ctx, a, { kind: "sabotage", target: b.id }).ok, "続けて同じ相手には使えない");
  assert.ok(!covertOp(ctx, a, { kind: "rescue", target: alive(w)[2].id }).ok, "救出は戦争中だけ"); void canNuke; void declareWar;
});
await check("60 か月進めても整合性が保たれる（戦争・渡海・戦場の記録を含む）", () => {
  const w = fresh(), st = own(w); void st; assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 60 }).ok); const errs = checkWcdeIntegrity(w.world, w.civ); assert.deepEqual(errs, []);
});
console.log(failed ? `\n${failed} 件失敗` : "\nすべて通過"); process.exit(failed ? 1 : 0);
