// v7.0.0: 動員と戦略の入口（war.mobilize）。指揮する部隊を選ばなかった動員部隊は、AI が自動で戦う。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { declareWar, atWarWith } from "../js/core/civ/diplomacy.js";
import { byState } from "../js/core/civ/spatial.js";
import { corpsOf } from "../js/core/wcde/corps.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const w0 = createNewWorld({ worldSeed: "v700-war-1", spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } }).w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 600 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive);
function setup() {
  const w = fresh(), ctx = w.sim.ctx, L = alive(w).filter((s) => (byState(ctx).get(s.id) ?? []).length >= 4).sort((a, b) => b.pop - a.pop); let a, d;
  for (const x of L) for (const y of L) if (!a && x !== y && !atWarWith(w.civ, x, y)) { a = x; d = y; }
  assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: a.id }).ok);
  const war = declareWar(ctx, a, d, { reason: "conquest" });
  assert.equal(war.status, "active");
  return { w, ctx, a, d, war };
}

console.log("=== 動員と戦略 ===");
await check("動員した部隊のうち、指揮する部隊に選ばなかったものは auto のまま。選んだものだけ命令が入る", () => {
  const { w, a, war } = setup(), land = corpsOf(a).filter((c) => c.service !== "air"); assert.ok(land.length >= 2, "部隊が 2 つ以上");
  const [mine, ...rest] = land, ids = land.map((c) => c.id);
  const r = dispatch(w, { type: "war.mobilize", authority: A.PLAYER, stateId: a.id, warId: war.id, corpsIds: ids, posture: "offensive", commit: 0.8, orders: [{ corpsId: mine.id, kind: "defend", targetGroupId: a.capitalGroupId }] }); assert.ok(r.ok, r.error);
  assert.equal(r.result.manual, 1); assert.equal(r.result.auto, ids.length - 1);
  assert.equal(corpsOf(a).find((c) => c.id === mine.id).order.kind, "defend");
  for (const c of rest) { const cp = corpsOf(a).find((x) => x.id === c.id); assert.equal(cp.order.kind, "auto"); assert.equal(cp.warId, war.id); }
  assert.equal(war.ops.direction[a.id].posture, "offensive"); assert.equal(war.ops.direction[a.id].commit, 0.8);
});
await check("指揮を選ばない（orders 省略）と全部隊が auto。時間を進めると AI が作戦を立てて戦う", () => {
  const { w, a, war } = setup(), ids = corpsOf(a).filter((c) => c.service !== "air").map((c) => c.id);
  const r = dispatch(w, { type: "war.mobilize", authority: A.PLAYER, stateId: a.id, warId: war.id, corpsIds: ids, posture: "offensive" }); assert.ok(r.ok, r.error); assert.equal(r.result.manual, 0);
  assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 6 }).ok);
  const w1 = w.civ.wars[war.id]; assert.ok(w1?.ops?.campaigns, `戦争の作戦が記録される（status=${w1?.status}）`);
  const camps = Object.values(w1.ops.campaigns).filter((c) => c.stateId === a.id); assert.ok(camps.length > 0, "担当国の auto 部隊にも作戦が立つ");
});
await check("動員から外した部隊は予備に戻る。担当国でない国・存在しない戦争は拒否", () => {
  const { w, a, d, war } = setup(), land = corpsOf(a).filter((c) => c.service !== "air"), keep = land[0];
  assert.ok(dispatch(w, { type: "war.mobilize", authority: A.PLAYER, stateId: a.id, warId: war.id, corpsIds: [keep.id] }).ok);
  for (const c of land.slice(1)) assert.equal(corpsOf(a).find((x) => x.id === c.id).order.kind, "reserve");
  assert.equal(dispatch(w, { type: "war.mobilize", authority: A.PLAYER, stateId: d.id, warId: war.id, corpsIds: [] }).ok, false);
  assert.equal(dispatch(w, { type: "war.mobilize", authority: A.PLAYER, stateId: a.id, warId: "nope", corpsIds: [] }).ok, false);
});
console.log(failed ? `${failed} 件失敗` : "全て成功"); process.exit(failed ? 1 : 0);
