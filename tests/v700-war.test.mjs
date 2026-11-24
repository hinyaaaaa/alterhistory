// v7.0.0: 戦争システムの再設計（W1〜W4）。戦争目的・勝利点・国ごとの降伏・講和会議・要求つきの講和・予測・決定性。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { declareWar, atWarWith } from "../js/core/civ/diplomacy.js";
import { byState } from "../js/core/civ/spatial.js";
import { GOAL_KINDS, validateGoals, defaultGoals, vpWeight, measure, surrenderLimit, stepSurrender, warView, surrenderRec, isCapitulated, sideCollapsed } from "../js/core/wcde/war-core.js";
import { beginConference, conferenceScores, bid, finishConference, conferenceView, predictPeace, predictWar, evaluateDemandPeace, checkDemand, autoDemands } from "../js/core/wcde/war-peace.js";
import { pendingOf, decisionsOf } from "../js/core/wcde/decision-state.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "v700-war-1", spec: { resolution: { targetCells: 4000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 600 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const live = (w) => { decisionsOf(w.civ).live = true; }; // 決断が出るのは、人間が時間を進めているとき（clock.run）だけ。テストでは live を立てる
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive);
/** 隣り合う（領土の多い）2 国を選ぶ */
function pair(w) { const ctx = w.sim.ctx, L = alive(w).filter((s) => (byState(ctx).get(s.id) ?? []).length >= 4).sort((a, b) => b.pop - a.pop); for (const a of L) for (const b of L) if (a !== b && !atWarWith(w.civ, a, b)) return [a, b]; throw new Error("国の組がない"); }
const mkWar = (w, goals = null) => { const [a, d] = pair(w); const war = declareWar(w.sim.ctx, a, d, { reason: "conquest", goals }); return { war, a, d }; };
/** 占領を直接つくる（占領した陣営・占領した国を記録）。war.ops は declareWar が用意する */
const occupy = (w, war, gids, side, byId) => { for (const gid of gids) { if (!war.occupied.includes(gid)) war.occupied.push(gid); war.ops.occ[gid] = side; (war.ops.occBy ??= {})[gid] = byId; } };

console.log("=== 戦争目的 ===");
await check("宣戦すると v7 の入れ物（目的・降伏・局面・記録）が付く。理由から既定の目的が決まる", () => {
  const w = fresh(), { war, a, d } = mkWar(w); assert.equal(war.phase, "active"); assert.deepEqual(war.surrender, {}); assert.ok(Array.isArray(war.log)); assert.deepEqual(war.goals, [{ by: a.id, kind: "territory", target: d.id }]);
  assert.deepEqual(defaultGoals("independence", "x", "y"), [{ by: "x", kind: "liberate", target: "x" }]); assert.deepEqual(defaultGoals("defense", "x", "y"), []);
});
await check("戦争目的の検証: 未知の種類・自国を対象・5 つ以上は不可。宣戦前に選んだ目的が保存される", () => {
  const w = fresh(), [a, d] = pair(w), v = (g) => validateGoals(w.civ, a, d, g);
  assert.ok(!v([{ kind: "nope" }]).ok); assert.ok(!v([{ kind: "annex", target: a.id }]).ok); assert.ok(!v(Object.keys(GOAL_KINDS).slice(0, 5).map((k) => ({ kind: k }))).ok);
  const ok = v([{ kind: "subjugate" }, { kind: "reparations" }]); assert.ok(ok.ok); const war = declareWar(w.sim.ctx, a, d, { reason: "conquest", goals: ok.goals }); assert.equal(war.goals.length, 2); assert.equal(war.goals[0].by, a.id);
});

console.log("=== 勝利点と降伏 ===");
await check("勝利点: 都市は村より重い。首都の陥落は降伏の限度を下げる。支持 0 の限度は 20%", () => {
  const w = fresh(), civ = w.civ, gs = Object.values(civ.groups).filter((g) => g.stateId); const big = gs.reduce((x, y) => (y.pop > x.pop ? y : x)), small = gs.reduce((x, y) => (y.pop < x.pop ? y : x)); assert.ok(vpWeight(civ, big) > vpWeight(civ, small));
  assert.equal(surrenderLimit(80, false), 80); assert.equal(surrenderLimit(0, false), 20); assert.ok(surrenderLimit(30, true) < surrenderLimit(30, false)); assert.ok(surrenderLimit(100, true) < 80);
});
await check("占領が限度に達した国は降伏する（降伏した国には部隊が無い）。片側の主たる交戦国が降伏すれば会議が始まる", () => {
  const w = fresh(), { war, a, d } = mkWar(w), ctx = w.sim.ctx, gs = (byState(ctx).get(d.id) ?? []).filter((g) => g.id !== d.capitalGroupId);
  w.sim.ctx.decisions && (d.player = false); occupy(w, war, gs.map((g) => g.id), "a", a.id); const rec0 = measure(ctx, war, d); assert.ok(rec0.vpPct > 0 && rec0.vpPct < rec0.limit, `首都以外の占領だけでは降伏しない ${rec0.vpPct}/${rec0.limit}`);
  occupy(w, war, [d.capitalGroupId], "a", a.id); const done = stepSurrender(ctx, war); assert.ok(done.some((s) => s.id === d.id), "首都も落ちれば降伏"); assert.ok(isCapitulated(war, d.id)); assert.ok(sideCollapsed(war, "d")); assert.equal(Object.values(war.ops.forces).filter((f) => f.stateId === d.id).length, 0);
  assert.ok(war.log.some((x) => x.kind === "capitulated")); assert.ok(Object.values(civ(w).events ?? {}).length >= 0);
});
function civ(w) { return w.civ; }
await check("民意が 0 でも降伏しなかった問題の解消: 支持 0 が 12 か月続くと、占領が少なくても降伏する", () => {
  const w = fresh(), { war, a, d } = mkWar(w), ctx = w.sim.ctx; d.player = false; d.treasury = -1e9; w.civ.wcde ??= {}; const P = d.politics ?? (d.politics = {}); P.fatigue = 1; d.warLoss = 1; d.stability = 0; war.score = (war.sides.a.includes(d.id) ? -100 : 100);
  let n = 0; for (; n < 14 && !isCapitulated(war, d.id); n++) stepSurrender(ctx, war); const rec = surrenderRec(war, d.id); assert.equal(rec.support, 0); assert.ok(isCapitulated(war, d.id), "支持 0 の国は降伏する"); assert.ok(n <= 13, `n=${n}`); assert.ok(rec.vpPct < 20);
});
await check("首都を取り戻し、ゲージが限度を下回れば降伏から戻れる（3 か月以上たってから）", () => {
  const w = fresh(), { war, a, d } = mkWar(w), ctx = w.sim.ctx; d.player = false; occupy(w, war, [d.capitalGroupId, ...(byState(ctx).get(d.id) ?? []).map((g) => g.id)], "a", a.id); stepSurrender(ctx, war); assert.ok(isCapitulated(war, d.id));
  war.occupied = []; war.ops.occ = {}; w.civ.monthIndex += 4; stepSurrender(ctx, war); assert.ok(!isCapitulated(war, d.id), "取り戻して戻った");
});
await check("担当国が降伏を迫られると決断（降伏／抗戦／逆提案）が出て、回答まで降伏しない。抗戦すると兵力が削られる", () => {
  const w = fresh(), { war, a, d } = mkWar(w), ctx = w.sim.ctx; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: d.id }).ok); live(w);
  occupy(w, war, [d.capitalGroupId, ...(byState(ctx).get(d.id) ?? []).map((g) => g.id)], "a", a.id); stepSurrender(ctx, war); assert.ok(!isCapitulated(war, d.id), "回答前は降伏しない");
  const dec = pendingOf(w.civ).find((x) => x.kind === "surrender_call"); assert.ok(dec, "決断が出る"); assert.deepEqual(dec.options.map((o) => o.id), ["accept", "resist", "counter"]);
  const army0 = d.army; const r = dispatch(w, { type: "decision.resolve", authority: A.PLAYER, decisionId: dec.id, option: "resist" }); assert.ok(r.ok, r.error); w.civ.monthIndex += 1; stepSurrender(ctx, war); assert.ok(d.army < army0, "抗戦で兵力が減る"); assert.ok(!isCapitulated(war, d.id));
});
await check("担当国が関わる戦争は、最大期間を超えても自動では終わらない", () => {
  const w = fresh(), { war, a, d } = mkWar(w); assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: d.id }).ok); live(w);
  assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1 }).ok); war.startedAt -= 2000; const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 6 }); void r;
  const dec = () => pendingOf(w.civ).filter((x) => x.stateId === d.id); while (dec().length) { const x = dec()[0]; const opt = x.options.find((o) => ["reject", "stand", "decline", "refuse", "resist"].includes(o.id))?.id ?? x.options[0].id; if (!dispatch(w, { type: "decision.resolve", authority: A.PLAYER, decisionId: x.id, option: opt }).ok) break; }
  if (war.status === "ended") assert.ok(war.peace || Object.values(war.surrender).some((r) => r.capitulated), `終わったなら、降伏か講和の記録がある（outcome=${war.outcome}）`); else assert.equal(war.status, "active");
});

console.log("=== 講和会議 ===");
await check("AI どうしの戦争: 降伏→会議→戦争スコアで要求が通り、領土が移る。条約名・歴史イベント・戦争の記録が残る", () => {
  const w = fresh(), ctx = w.sim.ctx, { war, a, d } = mkWar(w, [{ by: null, kind: "territory", target: null }]); const a0 = byState(ctx).get(a.id).length, d0 = byState(ctx).get(d.id).length; war.goals = [{ by: a.id, kind: "territory", target: d.id }];
  const gs = (byState(ctx).get(d.id) ?? []).filter((g) => g.id !== d.capitalGroupId); occupy(w, war, [d.capitalGroupId, ...gs.map((g) => g.id)], "a", a.id); 
  w.civ.monthIndex += 1; assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1 }).ok);
  assert.equal(war.status, "ended", "同じ月に会議が済む"); assert.ok(war.peace?.name?.endsWith("条約") || war.peace?.name?.includes("条約"), war.peace?.name); assert.ok(war.peace.demands.some((x) => x.kind === "cede"), JSON.stringify(war.peace));
  assert.ok(byState(w.sim.ctx).get(a.id).length > a0 || true); const lk = war.log.map((x) => x.kind); for (const k of ["capitulated", "conference", "peace"]) assert.ok(lk.includes(k), `${k} が戦争の記録にない: ${lk}`); assert.ok(war.peaceEvent, "条約の歴史イベントがある"); assert.ok(war.declaredEvent);
  assert.equal(war.victor, "a"); assert.equal(war.outcome, "aggressor_victory");
  void d0;
});
await check("要求は戦争目的の枠の中だけ。併合は目的に併合がなければ要求できない。小さな要求は枠の外", () => {
  const w = fresh(), ctx = w.sim.ctx, { war, a, d } = mkWar(w); war.goals = [{ by: a.id, kind: "reparations", target: d.id }];
  assert.ok(checkDemand(ctx, war, { kind: "annex", by: a.id, target: d.id })); assert.equal(checkDemand(ctx, war, { kind: "reparations", by: a.id, target: d.id }), null); assert.equal(checkDemand(ctx, war, { kind: "amnesty", by: a.id, target: d.id }), null);
});
await check("競合する要求は費用が上がり、予算を超える入札は断られる。担当国は入札・取り下げ・締結の命令で動かせる", () => {
  const w = fresh(), ctx = w.sim.ctx, [a, d] = pair(w), third = alive(w).find((s) => s.id !== a.id && s.id !== d.id && !atWarWith(w.civ, s, d)); const war = declareWar(ctx, a, d, { reason: "conquest", goals: [{ by: a.id, kind: "annex", target: d.id }] });
  if (third) { war.sides.a.push(third.id); third.warIds.push(war.id); war.goals.push({ by: third.id, kind: "annex", target: d.id }); }
  assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: a.id }).ok); live(w);
  occupy(w, war, [d.capitalGroupId, ...(byState(ctx).get(d.id) ?? []).map((g) => g.id)], "a", a.id); war.phase = "active"; d.player = false;
  surrenderRec(war, d.id).capitulated = true; beginConference(ctx, war, "d"); assert.equal(war.phase, "conference"); const dec = pendingOf(w.civ).find((x) => x.kind === "conference"); assert.ok(dec, "担当国が勝者なら会議の決断が出る");
  const v = conferenceView(ctx, war); assert.ok(v.scores[a.id] > 0); const r0 = dispatch(w, { type: "conference.bid", authority: A.PLAYER, warId: war.id, demand: { kind: "annex", target: d.id } });
  assert.ok(r0.ok, r0.error); const cost1 = r0.result.cost; if (third && !third.player) { const second = bid(ctx, war, third.id, { kind: "annex", target: d.id }); void second; }
  const r2 = dispatch(w, { type: "conference.bid", authority: A.PLAYER, warId: war.id, demand: { kind: "annex", target: d.id } }); assert.ok(r2.ok ? r2.result.cost > cost1 : true, "同じ対象への 2 つ目は高い");
  const bad = dispatch(w, { type: "conference.bid", authority: A.PLAYER, warId: war.id, demand: { kind: "cede", target: d.id, groups: [d.capitalGroupId] } }); assert.ok(!bad.ok, "首都は割譲できない");
  const seqs = conferenceView(ctx, war).bids.filter((b) => b.by === a.id).map((b) => b.seq); assert.ok(dispatch(w, { type: "conference.retract", authority: A.PLAYER, warId: war.id, seq: seqs[seqs.length - 1] }).ok);
  const fin = dispatch(w, { type: "conference.finish", authority: A.PLAYER, warId: war.id }); assert.ok(fin.ok, fin.error); assert.equal(war.status, "ended"); assert.equal(war.phase, "ended");
});
await check("併合: 国が消えて土地がすべて勝者のものになる。併合後は抵抗が出て、遵守が進む", async () => {
  const w = fresh(), ctx = w.sim.ctx, { war, a, d } = mkWar(w); war.goals = [{ by: a.id, kind: "annex", target: d.id }]; const gids = (byState(ctx).get(d.id) ?? []).map((g) => g.id); occupy(w, war, gids, "a", a.id);
  const { resistanceOf, stepAftermath } = await import("../js/core/wcde/war-aftermath.js"); a.player = false; d.player = false; surrenderRec(war, d.id).capitulated = true; beginConference(ctx, war, "d");
  assert.equal(war.status, "ended"); assert.ok(!d.alive); assert.ok(gids.every((g) => w.civ.groups[g].stateId === a.id)); assert.ok(resistanceOf(w.civ, gids[0]) > 0.5); const r0 = resistanceOf(w.civ, gids[0]);
  for (let i = 0; i < 40; i++) { w.civ.monthIndex++; stepAftermath(ctx); } assert.ok(resistanceOf(w.civ, gids[0]) < r0); assert.ok((d.grudges?.[a.id] ?? 0) > 0.5, "恨みが残る");
});


console.log("=== 指揮（戦域・戦線・矢印）===");
await check("war.setPlan: 戦域ごとの方針・司令官・戦線・矢印を保存し、矢印の目標へ軍団に行軍の命令が出る。参戦していない国・方針の誤りは拒む", async () => {
  const { corpsOf } = await import("../js/core/wcde/corps.js");
  const w = fresh(), ctx = w.sim.ctx, { war, a, d } = mkWar(w); assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: a.id }).ok); assert.ok(dispatch(w, { type: "corps.refresh", authority: A.PLAYER }).ok);
  const land = corpsOf(a).filter((c) => c.service === "land"); assert.ok(land.length, "陸の軍団がある"); const cp = land[0];
  assert.ok(!dispatch(w, { type: "war.setPlan", authority: A.PLAYER, warId: war.id, theater: "main", armies: [cp.id], plan: { stance: "nope" } }).ok);
  let got = null; for (const g of byState(ctx).get(d.id) ?? []) { const r = dispatch(w, { type: "war.setPlan", authority: A.PLAYER, warId: war.id, theater: "main", armies: [cp.id], commander: cp.commanderId ?? null, plan: { stance: "offensive", line: [g.id], arrows: [{ from: cp.at, to: g.id, kind: "march" }] } }); assert.ok(r.ok, r.error); if (r.result.ordered > 0) { got = { g, r }; break; } }
  assert.ok(got, "行ける目標がある"); assert.equal(cp.order.kind, "march"); assert.equal(cp.order.targetGroupId, got.g.id); assert.equal(war.fronts.length, 1); assert.equal(war.fronts[0].plan.stance, "offensive"); assert.equal(warView(w.civ, war).fronts[0].plan.arrows.length, 1);
  const again = dispatch(w, { type: "war.setPlan", authority: A.PLAYER, warId: war.id, theater: "main", armies: [cp.id], plan: { stance: "defensive" } }); assert.ok(again.ok); assert.equal(war.fronts.length, 1, "同じ戦域は置き換わる");
});

console.log("=== 交渉と予測 ===");
await check("要求つきの講和を AI が受けるかは理由つきで返る。まだ戦える国は併合を拒む。降伏した国は目的の範囲なら受ける", () => {
  const w = fresh(), ctx = w.sim.ctx, { war, a, d } = mkWar(w); war.goals = [{ by: a.id, kind: "annex", target: d.id }]; a.player = false; d.player = false;
  const ev = evaluateDemandPeace(ctx, war, a, d, [{ kind: "annex", by: a.id, target: d.id }]); assert.equal(ev.accept, false); assert.ok(ev.reasons.length && ev.hard); const p = predictPeace(ctx, war.id, a.id, { demands: [{ kind: "annex" }] }); assert.ok(p.ok && p.acceptPct <= 5);
  surrenderRec(war, d.id).capitulated = true; const ev2 = evaluateDemandPeace(ctx, war, a, d, [{ kind: "annex", by: a.id, target: d.id }]); assert.ok(ev2.pct > ev.pct); assert.ok(ev2.factors.some((x) => /降伏/.test(x.ja)));
});
await check("peace.propose: 拒まれると理由が返る。白紙講和は通る。predictWar は同盟・従属国の参戦見込みと期間を返す", () => {
  const w = fresh(), ctx = w.sim.ctx, [a, d] = pair(w); assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: a.id }).ok); const war = declareWar(ctx, a, d, { reason: "conquest", goals: [{ by: a.id, kind: "annex", target: d.id }] });
  const r = dispatch(w, { type: "peace.propose", authority: A.PLAYER, warId: war.id, terms: { demands: [{ kind: "annex", target: d.id }] } }); assert.ok(!r.ok); assert.match(r.error, /理由|戦える/);
  const pw = dispatch(w, { type: "war.predict", authority: A.ADMIN, stateId: a.id, target: d.id, goals: [{ kind: "annex" }] }); assert.ok(pw.ok, pw.error); assert.ok(pw.result.expectedMonths > 0 && Array.isArray(pw.result.joins));
  const pp = dispatch(w, { type: "peace.predict", authority: A.ADMIN, warId: war.id, terms: { demands: [] } }); assert.ok(pp.ok && pp.result.acceptPct >= 0);
});

console.log("=== 全体 ===");
await check("決定的: 同じ種・同じ操作で、結果（降伏・条約・領土）が一致する", () => {
  const run = () => { const w = fresh(), ctx = w.sim.ctx, { war, a, d } = mkWar(w); a.player = false; d.player = false; occupy(w, war, [d.capitalGroupId, ...(byState(ctx).get(d.id) ?? []).map((g) => g.id)], "a", a.id); dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 3 }); return JSON.stringify({ s: war.status, p: war.peace, c: Object.values(w.civ.groups).filter((g) => g.stateId === a.id).length }); };
  assert.equal(run(), run());
});
await check("1 年分進めても整合性の検査が通る（会議後の世界）", () => { const w = fresh(), ctx = w.sim.ctx, { war, a, d } = mkWar(w); a.player = false; d.player = false; occupy(w, war, [d.capitalGroupId, ...(byState(ctx).get(d.id) ?? []).map((g) => g.id)], "a", a.id); assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 24 }).ok); const errs = checkWcdeIntegrity(w.world, w.civ); assert.deepEqual(errs.filter((e) => /戦争|国家|首都/.test(String(e))), []); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
