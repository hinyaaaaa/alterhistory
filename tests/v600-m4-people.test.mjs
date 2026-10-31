// v6.0.0 M4: 人物・家系・都市・過去の復元・原因と結果の追跡。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { figuresAt, ancestorsOf, listCities } from "../js/core/wcde/domains/people.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { lifeScale } from "../js/core/civ/species.js";
import { stateAt } from "../js/core/civ/history.js";
import { checkGraph } from "../js/core/civ/graph.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 3).join(" | ")); } };
const R = createNewWorld({ worldSeed: "e2e-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: true } }); const w = R.w, civ = w.civ;
dispatch(w, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 360 }).ok);
const alive = () => Object.values(civ.states).filter((s) => s.alive), adv = (n) => { const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: n }); assert.ok(r.ok, r.error); };

console.log("=== 指導者と家系 ===");
await check("全ての国家の指導者に人物（経歴・所属・家）が結びつき、家系の不変条件を満たす", () => {
  for (const st of alive()) { const f = civ.figures[st.leaderFigureId]; assert.ok(f, st.id); assert.equal(f.name, st.leader.name); assert.equal(f.stateId, st.id); assert.ok(civ.houses[f.houseId]); assert.equal(f.diedAt, null); }
  assert.deepEqual(checkWcdeIntegrity(w.world, civ), []);
});
await check("出自は捏造しない: 最初の指導者の親は未知（null）で、親子は『継承者を立てた』ときに実際に生まれたものだけ", () => {
  for (const f of Object.values(civ.figures)) { if (f.role === "leader") assert.equal(f.parents, null, "指導者の出自は未知"); else if (f.role === "heir") { assert.equal(f.parents.length, 1); assert.ok(civ.figures[f.parents[0]].children.includes(f.id)); } }
});
const st = alive().filter((s) => civ.figures[s.leaderFigureId]).sort((a, b) => b.pop - a.pop)[0]; const ls = lifeScale(civ, st);
await check("継承者を立てると、指導者の子が実際に生まれ（事件が残る）、親の没後にその子が登位し、同じ家が続く", () => {
  const leaderFig = civ.figures[st.leaderFigureId], house = leaderFig.houseId; st.leader.heir = true; adv(1);
  const heir = civ.figures[st.heirFigureId]; assert.ok(heir, "継承者の人物"); assert.deepEqual(heir.parents, [leaderFig.id]); assert.ok(leaderFig.children.includes(heir.id)); assert.ok(heir.bornAt > leaderFig.bornAt && heir.bornAt < civ.monthIndex); assert.equal(heir.houseId, house);
  assert.ok(civ.events.some((e) => e.kind === "heir_named" && e.participants.some((p) => p.entityId === heir.id)));
  assert.deepEqual(ancestorsOf(civ, heir.id), [leaderFig.id]);
  st.leader.bornAt = civ.monthIndex - Math.round(3000 * ls); let n = 0; while (st.leaderFigureId === leaderFig.id && st.alive && n++ < 240) adv(1);
  assert.ok(st.alive, "国家が滅びた"); assert.equal(st.leaderFigureId, heir.id, "継承者が登位"); assert.equal(st.leader.name, heir.name); assert.equal(leaderFig.diedAt != null, true); assert.equal(st.heirFigureId, null);
  assert.ok(civ.events.some((e) => e.kind === "succession_by_heir" && e.participants.some((p) => p.entityId === heir.id && p.role === "successor")));
  assert.deepEqual(checkWcdeIntegrity(w.world, civ), []);
});
await check("継承者がいない交代（または政変）は別の家系になり、王朝交代が原因・前後の人物つきで残る", () => {
  const s2 = alive().filter((s) => s.id !== st.id && !s.leader.heir && civ.figures[s.leaderFigureId]).sort((a, b) => b.pop - a.pop)[0]; const old = civ.figures[s2.leaderFigureId];
  s2.leader.bornAt = civ.monthIndex - Math.round(3000 * lifeScale(civ, s2)); let n = 0; while (s2.leaderFigureId === old.id && s2.alive && n++ < 240) adv(1); assert.ok(s2.alive, "国家が滅びた");
  const nf = civ.figures[s2.leaderFigureId]; assert.notEqual(nf.houseId, old.houseId); assert.equal(nf.parents, null); const ev = civ.events.filter((e) => e.kind === "dynasty_changed" && e.participants.some((p) => p.entityId === nf.id)); assert.equal(ev.length, 1);
  assert.ok(ev[0].participants.some((p) => p.entityId === old.id && p.role === "predecessor")); assert.ok(old.diedAt != null);
});
await check("政変で指導者が代わると、新しい家系の人物が記録され、政変の事件から辿れる", async () => {
  const { regimeChange, initPolitics } = await import("../js/core/wcde/domains/politics.js"); const s3 = alive().find((s) => civ.figures[s.leaderFigureId] && s.alive); const old = civ.figures[s3.leaderFigureId]; s3.politics ??= initPolitics(s3);
  regimeChange(w.sim.ctx, s3); adv(1); const nf = civ.figures[s3.leaderFigureId]; assert.notEqual(nf.id, old.id); assert.notEqual(nf.houseId, old.houseId); assert.equal(old.diedAt != null, true);
  assert.ok(civ.events.some((e) => e.kind === "regime_change" && e.participants.some((p) => p.entityId === s3.id))); assert.ok(civ.events.some((e) => e.kind === "dynasty_changed" && e.participants.some((p) => p.entityId === nf.id)));
});
await check("過去の時点の人物（生没で判定）。history の過去復元は、当時の指導者の名前を返す", () => {
  const old = Object.values(civ.figures).find((f) => f.diedAt != null); assert.ok(old, "没した人物がいる"); const at = old.diedAt - 1;
  assert.ok(figuresAt(civ, at).some((f) => f.id === old.id)); assert.ok(!figuresAt(civ, old.diedAt + 1).some((f) => f.id === old.id));
  const s = stateAt(civ, old.stateId, at); if (s) assert.equal(s.leader.name, old.name, "当時の指導者");
});
await check("出来事グラフの整合（原因・結果・参加者の参照が壊れていない）", () => assert.deepEqual(checkGraph(civ), []));

console.log("=== 都市 ===");
await check("町以上の集落には、その土地の言語で名前が付き、一度付いた名前は変わらない。国家・交易・立地が結びつく", () => {
  adv(12); const list = listCities(w.sim.ctx); assert.ok(list.length > 0); const named = list.filter((c) => c.name); assert.ok(named.length > 0, "名前付きの都市");
  const snap = new Map(named.map((c) => [c.id, c.name])); adv(24); for (const c of listCities(w.sim.ctx)) if (snap.has(c.id)) assert.equal(c.name, snap.get(c.id), "名前は変わらない");
  for (const c of list) { assert.ok(["town", "city"].includes(c.stage)); assert.equal(typeof c.coastal, "boolean"); assert.ok(c.pop >= 1500); assert.ok(c.stateId === null || civ.states[c.stateId]); }
  assert.ok(list.every((c, i) => i === 0 || list[i - 1].pop >= c.pop), "人口の多い順");
});
await check("WCDE の不変条件を、この時点で全て満たす", () => assert.deepEqual(checkWcdeIntegrity(w.world, civ), []));

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
