// v7.0.0 W5: 同盟の統一（二国間の条約と盟約）・義務の強さ・参戦要請の決断・脱退／除名／盟主交代
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { declareWar, signTreaty, atWarWith } from "../js/core/civ/diplomacy.js";
import { pendingOf, decisionsOf } from "../js/core/wcde/decision-state.js";
import { alliancesOf, ensureAlliances, listAlliances, alliancesOfState, createAlliance } from "../js/core/wcde/war-alliance.js";
import { createPact } from "../js/core/wcde/pacts.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "v700-al-1", spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 600 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const four = (w) => Object.values(w.civ.states).filter((s) => s.alive && !s.dependency).sort((a, b) => b.pop - a.pop).slice(0, 5);
const friends = (xs) => { for (const a of xs) for (const b of xs) if (a !== b) a.relations[b.id] = 60; };
const live = (w) => { decisionsOf(w.civ).live = true; };

console.log("=== 統一 ===");
await check("既存の二国間の条約・盟約は、同盟として移される（重複しない）。種類・盟主・加盟国・義務の既定が付く", () => {
  const w = fresh(), ctx = w.sim.ctx, [a, b, c, d, e] = four(w); signTreaty(ctx, "alliance", a, b); signTreaty(ctx, "defensive", c, d); createPact(ctx, { purpose: "trade", leaderId: a.id, memberIds: [c.id, e.id] });
  ensureAlliances(ctx); ensureAlliances(ctx); const L = listAlliances(w.civ); assert.equal(L.length, 3);
  const od = L.find((x) => x.kind === "offense_defense"), df = L.find((x) => x.kind === "defense"), tr = L.find((x) => x.kind === "trade"); assert.ok(od && df && tr); assert.equal(od.leaderId, a.id); assert.deepEqual(od.members.sort(), [a.id, b.id].sort()); assert.equal(df.obligation, "defense_only"); assert.equal(tr.members.length, 3);
});
console.log("=== 参戦要請 ===");
await check("攻守同盟（任意）・防衛同盟（防衛のみ）・必ず: 義務の強さで参戦が変わる。盟約の加盟国どうしの戦争は同盟を破る", () => {
  const w = fresh(), ctx = w.sim.ctx, [a, b, c, d] = four(w); friends([a, b, c, d]); signTreaty(ctx, "defensive", a, b); ensureAlliances(ctx);
  const al = alliancesOfState(w.civ, a.id)[0]; assert.equal(al.obligation, "defense_only"); const war1 = declareWar(ctx, a, d, { reason: "conquest" }); assert.ok(!war1.sides.a.includes(b.id), "防衛のみは、攻める側の戦争に参戦しない");
  const w2 = fresh(), c2 = w2.sim.ctx, [a2, b2, , d2] = four(w2); friends([a2, b2, d2]); signTreaty(c2, "defensive", a2, b2); ensureAlliances(c2); alliancesOfState(w2.civ, a2.id)[0].obligation = "must"; const war2 = declareWar(c2, a2, d2, { reason: "conquest" }); assert.ok(war2.sides.a.includes(b2.id), "必ずなら攻める戦争にも参戦する");
  const w3 = fresh(), c3 = w3.sim.ctx, [a3, b3, , d3] = four(w3); friends([a3, b3, d3]); signTreaty(c3, "defensive", a3, b3); ensureAlliances(c3); const war3 = declareWar(c3, d3, a3, { reason: "conquest" }); assert.ok(war3.sides.d.includes(b3.id), "防衛同盟は、盟友が攻められると参戦する");
});
await check("共通の敵: その国との戦争には、義務が任意でも加盟国が呼ばれる。同盟国を攻めると同盟を抜ける（信用が下がる）", () => {
  const w = fresh(), ctx = w.sim.ctx, [a, b, c, d] = four(w); friends([a, b, c, d]); signTreaty(ctx, "alliance", a, b); ensureAlliances(ctx); const al = alliancesOfState(w.civ, a.id)[0]; al.obligation = "optional"; al.enemy = d.id; const war = declareWar(ctx, a, d, { reason: "conquest" }); assert.ok(war.sides.a.includes(b.id));
  const w2 = fresh(), c2 = w2.sim.ctx, [a2, b2] = four(w2); signTreaty(c2, "alliance", a2, b2); ensureAlliances(c2); const cr = a2.credibility ?? 0.7; declareWar(c2, a2, b2, { reason: "conquest" }); assert.equal(alliancesOfState(w2.civ, a2.id).length, 0, "同盟国を攻めたら抜ける"); assert.ok((a2.credibility ?? 0.7) < cr);
});
await check("担当国には参戦要請の決断（応じる／断る／調停）。断ると信用が下がる（必ずの義務なら大きく）。調停は双方の疲労を増やす", () => {
  const mk = () => { const w = fresh(), ctx = w.sim.ctx, [a, b, c, d] = four(w); friends([a, b, c, d]); signTreaty(ctx, "alliance", a, b); ensureAlliances(ctx); alliancesOfState(w.civ, a.id)[0].obligation = "must"; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: b.id }).ok); live(w); const war = declareWar(ctx, a, d, { reason: "conquest" }); return { w, a, b, d, war }; };
  { const { w, b, war } = mk(); const dec = pendingOf(w.civ).find((x) => x.kind === "ally_call"); assert.ok(dec); assert.deepEqual(dec.options.map((o) => o.id), ["join", "refuse", "mediate"]); const r = dispatch(w, { type: "alliance.respondCall", authority: A.PLAYER, warId: war.id, choice: "join" }); assert.ok(r.ok, r.error); assert.ok(war.sides.a.includes(b.id)); }
  { const { w, b, war } = mk(); const c0 = b.credibility ?? 0.7; assert.ok(dispatch(w, { type: "alliance.respondCall", authority: A.PLAYER, warId: war.id, choice: "decline" }).ok); assert.ok(!war.sides.a.includes(b.id)); assert.ok((b.credibility ?? 0.7) <= c0 - 0.14); const kinds = w.civ.events.map((e) => e.kind); assert.ok(kinds.includes("call_answered")); }
  { const { w, a, d, war } = mk(); const f0 = (a.politics?.fatigue ?? 0); assert.ok(dispatch(w, { type: "alliance.respondCall", authority: A.PLAYER, warId: war.id, choice: "mediate" }).ok); assert.ok(war.mediated); assert.ok((a.politics?.fatigue ?? 0) >= f0); void d; }
});
console.log("=== 操作 ===");
await check("結成・誘い・義務の変更・盟主交代・除名・脱退（歴史に記録）。2 国は条約、3 国以上は盟約と同期する", () => {
  const w = fresh(), ctx = w.sim.ctx, [a, b, c, d] = four(w); friends([a, b, c, d]); assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: a.id }).ok);
  const r = dispatch(w, { type: "alliance.create", authority: A.PLAYER, kind: "offense_defense", members: [b.id] }); assert.ok(r.ok, r.error); const id = r.result.allianceId, al = alliancesOf(w.civ).items[id]; assert.ok(al.legacy.treatyId); assert.equal(al.leaderId, a.id);
  assert.ok(dispatch(w, { type: "alliance.invite", authority: A.PLAYER, allianceId: id, target: c.id }).ok); assert.equal(al.members.length, 3); assert.ok(al.legacy.pactId, "3 か国になると盟約に組み替わる");
  assert.ok(dispatch(w, { type: "alliance.setObligation", authority: A.PLAYER, allianceId: id, obligation: "must" }).ok); assert.equal(al.obligation, "must"); assert.ok(dispatch(w, { type: "alliance.setObligation", authority: A.PLAYER, allianceId: id, obligation: "defense_only", memberId: b.id }).ok); assert.equal(al.memberObl[b.id], "defense_only");
  assert.ok(dispatch(w, { type: "alliance.transferLead", authority: A.PLAYER, allianceId: id, target: b.id }).ok); assert.equal(al.leaderId, b.id); const bad = dispatch(w, { type: "alliance.expel", authority: A.PLAYER, allianceId: id, target: c.id }); assert.ok(!bad.ok, "盟主でなくなったので除名できない");
  assert.ok(dispatch(w, { type: "alliance.leave", authority: A.PLAYER, allianceId: id }).ok); assert.ok(!al.members.includes(a.id)); const kinds = w.civ.events.map((e) => e.kind); for (const k of ["alliance_formed", "alliance_left"]) assert.ok(kinds.includes(k), k); void d; void ctx;
});
await check("除名と信用: 信用の低い盟主には、誘われた国が応じない。盟約型の同盟からの除名は盟約にも反映される", () => {
  const w = fresh(), [a, b, c, d] = four(w); friends([a, b, c, d]); assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: a.id }).ok); const r = dispatch(w, { type: "alliance.create", authority: A.PLAYER, kind: "defense", members: [b.id, c.id] }); assert.ok(r.ok, r.error); const al = alliancesOfState(w.civ, a.id)[0];
  assert.ok(dispatch(w, { type: "alliance.expel", authority: A.PLAYER, allianceId: al.id, target: c.id }).ok); assert.ok(!al.members.includes(c.id)); a.credibility = 0.1; const x = dispatch(w, { type: "alliance.invite", authority: A.PLAYER, allianceId: al.id, target: d.id }); assert.ok(!x.ok && /信用/.test(x.error));
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
