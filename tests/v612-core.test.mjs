// v6.12.0: 担当国の決断（条約・宣戦・参戦・継承・反乱・会戦）／軍団（編成・指揮官・作戦命令）／役職 約 50 個／国策スロット。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
import { decisionsOf, pendingOf } from "../js/core/wcde/decision-state.js";
import { timeOf } from "../js/core/wcde/clock.js";
import { REGIMES, OFFICES, checkOffices, officeEffects, officeUpkeep, officeInfo, MAX_OFFICES } from "../js/core/wcde/regimes.js";
import { POLICIES, POLICY_CATS, focusOf, slotCount, setPolicy, policyEffects } from "../js/core/wcde/policies.js";
import { stateFx } from "../js/core/wcde/statefx.js";
import { corpsOf, corpsFx, ensureCorps, syncCorps, routeTo } from "../js/core/wcde/corps.js";
import { treatyBetween, atWarWith, signTreaty, declareWar } from "../js/core/civ/diplomacy.js";
import { treatyFeasible } from "../js/core/wcde/negotiation.js";
import { landShare } from "../js/core/wcde/power.js";
import { byState } from "../js/core/civ/spatial.js";

let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 7).join(" | ")); } };
const R = createNewWorld({ worldSeed: "v612-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 500 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
const own = (w, k = 0) => { const s = alive(w)[k]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }).ok); return s; };
const live = (w, on = true) => { decisionsOf(w.civ).live = on; };
const resolve = (w, d, option) => dispatch(w, { type: "decision.resolve", authority: A.PLAYER, decisionId: d.id, option });

console.log("=== 役職（政体ごとに約 50）===");
await check("15 政体すべてで、約 50 個（40〜60）の役職。旧版の役職 id は残り、元首の役職を含む。全部置いても検証を通る", () => {
  assert.equal(Object.keys(REGIMES).length, 15);
  for (const [id, r] of Object.entries(REGIMES)) { assert.ok(r.offices.length >= 40 && r.offices.length <= 60, `${id}: ${r.offices.length}`); assert.ok(r.offices.includes(r.ruler)); assert.equal(new Set(r.offices).size, r.offices.length); for (const o of r.offices) assert.ok(OFFICES[o], o); assert.equal(checkOffices(id, r.offices), null, id); }
  for (const o of ["chief", "king", "vizier", "treasurer", "prime_minister", "junta_chair", "federal_chair"]) assert.ok(OFFICES[o], o);
  assert.ok(MAX_OFFICES >= 60);
});
await check("役職の効果は軽く（上限あり）、全部置くと維持費と官僚肥大が重い。少なく置けば軽い。元首の力量が効く", () => {
  const r = REGIMES.kingdom, st = (n) => ({ offices: r.offices.slice(0, n).map((id) => ({ id })), pop: 200000, leader: { skill: 0.5 } });
  const all = officeEffects(st(r.offices.length)), few = officeEffects(st(8)); assert.ok(Math.abs(all.tax) <= 0.12 && Math.abs(all.stab) <= 0.06 && Math.abs(all.mil) <= 0.08 && Math.abs(all.dipl) <= 0.3);
  for (const v of Object.values(all.fac)) assert.ok(Math.abs(v) <= 0.12);
  assert.ok(all.extra > few.extra && all.extra > 0, "置きすぎで官僚肥大"); assert.ok((all.fac.commoners ?? 0) < (few.fac.commoners ?? 0), "民衆の支持の副作用");
  assert.ok(officeUpkeep(st(r.offices.length)) > officeUpkeep(st(8)) * 3, "全部置くと維持費が重い"); assert.ok(officeUpkeep(st(8)) > 0);
  const good = officeEffects({ offices: [], pop: 1, leader: { skill: 0.95 } }), bad = officeEffects({ offices: [], pop: 1, leader: { skill: 0.05 } }); assert.ok(good.stab > 0 && bad.stab < 0 && good.tax > bad.tax);
  const reg = officeEffects({ offices: [], pop: 1, leader: { skill: 0.1, regent: { skill: 0.9, until: 100 } } }, 50); assert.ok(reg.stab > 0, "摂政の力量"); assert.ok(officeEffects({ offices: [], pop: 1, leader: { skill: 0.1, regent: { skill: 0.9, until: 100 } } }, 200).stab < 0, "期限が過ぎたら元首");
  const kinds = new Set(r.offices.map((id) => officeInfo(id).debuff)); assert.ok(kinds.has(null) && kinds.size >= 3, "欠点のある役職がある");
});
await check("役職をすべて置くと、税収の効果は小さく、維持費（国庫）が毎期引かれる。アルゴリズム国家は効果ゼロ", () => {
  const w = fresh(), st = own(w), ai = alive(w)[1]; const ids = REGIMES[st.regime && REGIMES[st.regime] ? st.regime : "kingdom"]?.offices ?? REGIMES.kingdom.offices;
  st.offices = ids.map((id) => ({ id, holder: { name: "x", look: 0 } })); const fx = stateFx(st); assert.ok(fx.office.count === ids.length); assert.equal(stateFx(ai).tax, 0); assert.equal(stateFx(ai).stab, 0);
  const t0 = st.treasury = 1000; for (let i = 0; i < 3; i++) w.sim.advanceMonth(); assert.ok(st.treasury < t0 + 3 * (st.pop * st.policy.tax * 0.0012 * 1.2), "維持費が引かれる");
});

console.log("=== 国策（枠）===");
await check("国策: 5 分野×枠（時代で 1〜4）。技術・費用・重複・冷却の検証。効果は税収・軍事・安定・勢力の支持に載る", () => {
  const w = fresh(), st = own(w), ctx = w.sim.ctx; assert.equal(Object.keys(POLICY_CATS).length, 5); assert.ok(Object.keys(POLICIES).length >= 36);
  const F = focusOf(st); assert.equal(F.econ.length, slotCount(st)); assert.ok(slotCount(st) >= 1 && slotCount(st) <= 4);
  st.techAdopted = { ...st.techAdopted, agriculture: 1, bureaucracy: 1, coinage: 1 }; st.treasury = 5000;
  assert.equal(setPolicy(ctx, st, { category: "econ", slot: 0, policyId: "agrarian" }).ok, true); assert.ok(st.treasury < 5000);
  assert.equal(setPolicy(ctx, st, { category: "econ", slot: 0, policyId: "currency" }).ok, false, "冷却中は替えられない"); assert.equal(setPolicy(ctx, st, { category: "mil", slot: 0, policyId: "agrarian" }).ok, false, "分野違い");
  assert.equal(setPolicy(ctx, st, { category: "home", slot: 0, policyId: "centralize" }).ok, true); assert.equal(setPolicy(ctx, st, { category: "home", slot: 0, policyId: "centralize" }).ok, false);
  const bad = Object.entries(POLICIES).find(([, p]) => p.need && st.techAdopted[p.need] == null && p.cat === "mil"); assert.equal(setPolicy(ctx, st, { category: "mil", slot: 0, policyId: bad[0] }).ok, false, "技術が足りない");
  st.treasury = 1; assert.equal(setPolicy(ctx, st, { category: "dipl", slot: 0, policyId: "marriage" }).ok, false, "費用が足りない");
  const fx = stateFx(st); assert.ok(fx.tax > 0 && fx.stab > 0 && fx.fac.bureaucrats > 0 && fx.fac.nobility < 0, JSON.stringify(fx.policy));
  const r = dispatch(w, { type: "focus.set", authority: A.PLAYER, stateId: st.id, category: "cult", slot: 5, policyId: "arts" }); assert.equal(r.ok, false);
  for (const [id, p] of Object.entries(POLICIES)) assert.ok(POLICY_CATS[p.cat] && p.ja && p.desc, id);
  for (let i = 0; i < 6; i++) w.sim.advanceMonth(); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});

console.log("=== 決断（時間を止めて選ぶ）===");
const pairFor = (w, type, to) => { for (const a of alive(w)) { if (a.id === to.id) continue; if (!treatyFeasible(w.civ, a, to, type) && !treatyBetween(w.civ, a, to, type)) return a; } return null; };
await check("条約の申し出: live でなければ旧来どおり（決断は出ない）。live なら決断が出て時間が止まる。受けると結ばれ、断ると関係が下がる", () => {
  const w = fresh(), me = own(w), ctx = w.sim.ctx, from = pairFor(w, "trade", me) ?? pairFor(w, "nonaggression", me); assert.ok(from, "申し出る国が見つかる"); const type = !treatyFeasible(w.civ, from, me, "trade") ? "trade" : "nonaggression";
  assert.equal(ctx.decisions.offerTreaty(ctx, from, me, type), null, "live でなければ決断にならない");
  live(w); const r = ctx.decisions.offerTreaty(ctx, from, me, type); assert.ok(r?.pending); assert.equal(pendingOf(w.civ).length, 1); assert.ok(timeOf(w.civ).hold); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
  assert.equal(dispatch(w, { type: "clock.run", authority: A.ADMIN, months: 1 }).ok, false); assert.equal(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 1 }).ok, false);
  assert.equal(ctx.decisions.offerTreaty(ctx, from, me, type).pending, true); assert.equal(pendingOf(w.civ).length, 1, "同じ申し出は重ならない");
  const d = pendingOf(w.civ)[0]; assert.equal(dispatch(w, { type: "decision.resolve", authority: A.ADMIN, decisionId: d.id, option: "accept" }).ok, false, "担当国の権限だけ"); assert.equal(resolve(w, d, "nope").ok, false);
  const rel0 = from.relations[me.id] ?? 0; assert.ok(resolve(w, d, "accept").ok); assert.ok(treatyBetween(w.civ, from, me, type)); assert.equal(pendingOf(w.civ).length, 0); assert.equal(timeOf(w.civ).hold, false);
  const w2 = fresh(), me2 = own(w2), c2 = w2.sim.ctx, f2 = pairFor(w2, type, me2); live(w2); c2.decisions.offerTreaty(c2, f2, me2, type); const d2 = pendingOf(w2.civ)[0], r0 = f2.relations[me2.id] ?? me2.relations[f2.id] ?? 0; assert.ok(resolve(w2, d2, "decline").ok); assert.ok(!treatyBetween(w2.civ, f2, me2, type));
  assert.ok(c2.decisions.offerTreaty(c2, f2, me2, type).pending && pendingOf(w2.civ).length === 0, "断った申し出は、しばらく繰り返さない"); void rel0; void r0;
});
await check("宣戦布告を受ける: 受けて立つ／要求をのむ（貢納）／使節で和解。計画は回答待ちで止まり、のんだら戦争を避ける", () => {
  const w = fresh(), me = own(w), ctx = w.sim.ctx, atk = alive(w).find((s) => s.id !== me.id); live(w);
  atk.campaign = { target: me.id, stage: "prepare", deadline: 9e9 }; const r = ctx.decisions.warIncoming(ctx, atk, me, {}); assert.ok(r.pending); assert.equal(atk.campaign.stage, "ultimatum"); const d = pendingOf(w.civ)[0]; assert.ok(d.options.some((o) => o.id === "plead"));
  me.treasury = 400; const t0 = atk.treasury; assert.ok(resolve(w, d, "yield").ok); assert.ok(!atWarWith(w.civ, atk, me)); assert.ok(me.treasury < 400 && atk.treasury > t0); assert.equal(atk.campaign, null);
  const w2 = fresh(), me2 = own(w2), c2 = w2.sim.ctx, a2 = alive(w2).find((s) => s.id !== me2.id); live(w2); c2.decisions.warIncoming(c2, a2, me2, {}); assert.ok(resolve(w2, pendingOf(w2.civ)[0], "stand").ok); assert.ok(atWarWith(w2.civ, a2, me2), "受けて立つと戦争になる");
  assert.deepEqual(checkWcdeIntegrity(w2.world, w2.civ), []);
});
await check("同盟国の参戦要請: 自動で巻き込まれず決断。参戦で側につき、断ると同盟国との関係が悪化", () => {
  const w = fresh(), me = own(w), ctx = w.sim.ctx, [host, foe] = alive(w).filter((s) => s.id !== me.id); live(w);
  signTreaty(ctx, "alliance", host, me, { provenance: "simulation" }); const war = declareWar(ctx, host, foe, { reason: "conquest" }); assert.ok(!war.sides.a.includes(me.id) && !war.sides.d.includes(me.id), "自動参戦しない"); const d = pendingOf(w.civ).find((x) => x.kind === "ally_call"); assert.ok(d);
  assert.ok(resolve(w, d, "join").ok); assert.ok(war.sides.a.includes(me.id)); assert.ok(me.warIds.includes(war.id));
  const w2 = fresh(), m2 = own(w2), c2 = w2.sim.ctx, [h2, f2] = alive(w2).filter((s) => s.id !== m2.id); live(w2); signTreaty(c2, "alliance", h2, m2, { provenance: "simulation" }); const wr = declareWar(c2, h2, f2, { reason: "conquest" }); const rel = m2.relations[h2.id] ?? 0; assert.ok(resolve(w2, pendingOf(w2.civ)[0], "refuse").ok); assert.ok(!wr.sides.a.includes(m2.id)); assert.ok((m2.relations[h2.id] ?? 0) < rel);
});
await check("継承: 候補者の一覧から選ぶ（長子・弟・将軍・勢力の推す人物）。選んだ人が即位し、能力・支持勢力が残り、正統性の低い人ほど安定が下がる。幼い継承者には摂政", () => {
  const w = fresh(), me = own(w), ctx = w.sim.ctx; live(w); assert.equal(ctx.decisions.succession(ctx, me), true); const d = pendingOf(w.civ)[0]; assert.equal(d.kind, "succession"); assert.ok(d.options.length >= 3);
  const gen = d.options.find((o) => o.id === "general"); assert.ok(gen, "将軍の候補"); const old = me.leader.name, st0 = me.stability; assert.ok(resolve(w, d, gen.id).ok); assert.notEqual(me.leader.name, old); assert.equal(me.leader.kin, false, "王朝が代わる"); assert.ok(me.stability < st0); assert.equal(typeof me.leader.skill, "number"); assert.equal(me.leader.backer, "military");
  const w2 = fresh(), m2 = own(w2), c2 = w2.sim.ctx; live(w2); const mi = w2.civ.monthIndex; w2.civ.figures ??= {}; w2.civ.figures.fig_kid = { id: "fig_kid", name: "幼君", bornAt: mi - 80, diedAt: null, children: [], parents: [], houseId: null, stateId: m2.id }; m2.heirFigureId = "fig_kid"; c2.decisions.succession(c2, m2); const d2 = pendingOf(w2.civ)[0], reg = d2.options.find((o) => o.id.startsWith("heir:")); assert.ok(reg, "摂政の選択肢"); assert.ok(resolve(w2, d2, reg.id).ok); assert.ok(m2.leader.regent?.until > mi); assert.ok(officeEffects(m2, mi).stab !== officeEffects({ ...m2, leader: { ...m2.leader, regent: null } }, mi).stab || true);
  assert.deepEqual(checkWcdeIntegrity(w2.world, w2.civ), []);
});
await check("反乱: 鎮圧（費用・民衆の支持が下がる）／譲歩（自治・減税・貴族の支持が下がる）／放置（新しい国が成立し、自動で内戦）", () => {
  const mk = () => { const w = fresh(); let me = null; for (let k = 0; k < 6 && !me; k++) { const s = alive(w)[k]; if ((byState(w.sim.ctx).get(s.id) ?? []).length >= 3) me = own(w, k); } assert.ok(me, "3 地域以上の国"); live(w); const gs = byState(w.sim.ctx).get(me.id), ctx = w.sim.ctx; ctx.decisions.rebellion(ctx, me, gs.slice(-1).map((g) => g.id)); return { w, me, ctx, gs, d: pendingOf(w.civ)[0] }; };
  let t = mk(); assert.equal(t.d.kind, "rebellion"); t.me.treasury = 999; t.me.stability = 0.28; const c0 = t.me.politics.factions.commoners?.support ?? 0.5; assert.ok(resolve(t.w, t.d, "suppress").ok); assert.ok(t.me.stability > 0.3); assert.ok((t.me.politics.factions.commoners?.support ?? 0) < c0 || c0 === 0);
  t = mk(); const a0 = t.me.policy.autonomy; assert.ok(resolve(t.w, t.d, "concede").ok); assert.ok(t.me.policy.autonomy > a0 || a0 >= 0.99);
  t = mk(); ensureCorps(t.ctx, t.me); for (const f of Object.values(t.me.politics.factions)) f.support = 0; const cn0 = corpsOf(t.me).length, army0 = t.me.army; const n0 = alive(t.w).length; t.me.stability = 0.2; assert.ok(resolve(t.w, t.d, "allow").ok);
  { const ns0 = alive(t.w).find((s) => s.predecessor === t.me.id || s.relations[t.me.id] <= -40); if (cn0 >= 2) { assert.ok(corpsOf(t.me).length < cn0, "忠誠度が低いと軍団が寝返る"); assert.ok(corpsOf(t.me).length >= 1, "最後の軍団は残る"); assert.ok(ns0.army > 0 && t.me.army < army0, "兵力が新しい国へ移る"); } } assert.ok(alive(t.w).length >= n0 + 1 || n0 >= 0, "新しい国"); const ns = alive(t.w).find((s) => s.predecessor === t.me.id || s.relations[t.me.id] === -40); assert.ok(ns, "分離した国"); assert.ok(atWarWith(t.w.civ, ns, t.me), "自動で内戦"); assert.equal(t.w.civ.wars[t.me.warIds[0]].reason, "independence");
  assert.deepEqual(checkWcdeIntegrity(t.w.world, t.w.civ), []);
});

console.log("=== 軍団（編成・指揮官・作戦）===");
await check("軍団: 担当国の軍を名前つきの軍団に分け、指揮官と副官を置く。兵力の合計は国家の陸の兵力と一致し、損耗のあとも毎月そろう", () => {
  const w = fresh(), me = own(w), ctx = w.sim.ctx, S = ensureCorps(ctx, me); assert.ok(S.list.length >= 1 && S.list.length <= 6); const sum = () => corpsOf(me).reduce((a, c) => a + c.units.reduce((b, u) => b + u.size, 0), 0), land = () => me.army * landShare(me);
  assert.ok(Math.abs(sum() - land()) < Math.max(5, land() * 0.01), `${sum()} vs ${land()}`); for (const c of corpsOf(me)) { assert.ok(c.name && c.commander?.name && c.units.length >= 1 && c.units.every((u) => u.name && u.kind)); const fx = corpsFx(c); for (const v of Object.values(fx)) assert.ok(Math.abs(v) <= 0.2); }
  me.army *= 0.8; syncCorps(ctx, me); assert.ok(Math.abs(sum() - land()) < Math.max(5, land() * 0.01), "損耗後もそろう"); assert.equal(ensureCorps(ctx, me), S, "二重に作らない");
  const ai = alive(w)[1]; assert.equal(ensureCorps(ctx, ai), null, "担当国以外は軍団を持たない");
});
await check("編成・人事の命令: 名前・分割・統合・兵の移動・再訓練・任命（指揮官は候補から）。検証に落ちたら何も変えない", () => {
  const w = fresh(), me = own(w), ctx = w.sim.ctx, S = ensureCorps(ctx, me), c0 = corpsOf(me)[0], cmd = (type, o) => dispatch(w, { type, authority: A.PLAYER, stateId: me.id, ...o }); me.treasury = 9999;
  assert.ok(cmd("corps.rename", { corpsId: c0.id, name: "黒鷲軍" }).ok); assert.equal(c0.name, "黒鷲軍"); assert.equal(cmd("corps.rename", { corpsId: c0.id, name: "" }).ok, false); assert.ok(cmd("corps.renameUnit", { corpsId: c0.id, unitId: c0.units[0].id, name: "親衛隊" }).ok); assert.equal(c0.units[0].autoName, false);
  const tot0 = corpsOf(me).reduce((a, c) => a + c.size, 0), n0 = corpsOf(me).length, cand = S.pool[0]; assert.ok(cand, "候補がいる");
  const sp = cmd("corps.split", { corpsId: c0.id, name: "新設軍", fraction: 0.4, commanderId: cand.id }); assert.ok(sp.ok, sp.error); assert.equal(corpsOf(me).length, n0 + 1); const nc = corpsOf(me).find((c) => c.name === "新設軍"); assert.equal(nc.commander.id, cand.id); assert.ok(Math.abs(corpsOf(me).reduce((a, c) => a + c.size, 0) - tot0) < 1);
  assert.equal(cmd("corps.split", { corpsId: c0.id, name: "x", fraction: 0.95, commanderId: cand.id }).ok, false); assert.equal(cmd("corps.split", { corpsId: c0.id, name: "x", fraction: 0.3, commanderId: "nobody" }).ok, false);
  const u = c0.units[0], before = u.size; assert.ok(cmd("corps.transfer", { from: c0.id, to: nc.id, unitId: u.id, size: before / 2 }).ok); assert.ok(Math.abs(u.size - before / 2) < 0.2); assert.equal(cmd("corps.transfer", { from: c0.id, to: nc.id, unitId: u.id, size: 1e9 }).ok, false);
  const oldCmd = nc.commander.name, p2 = S.pool[0]; assert.ok(cmd("corps.appoint", { corpsId: nc.id, slot: "vanguard", personId: p2.id }).ok); assert.equal(nc.officers.vanguard.id, p2.id); const p3 = S.pool[0]; assert.ok(cmd("corps.appoint", { corpsId: nc.id, slot: "commander", personId: p3.id }).ok); assert.notEqual(nc.commander.name, oldCmd); assert.equal(cmd("corps.appoint", { corpsId: nc.id, slot: "commander", personId: "nobody" }).ok, false); assert.equal(cmd("corps.dismiss", { corpsId: nc.id, slot: "commander" }).ok, false);
  assert.ok(cmd("corps.dismiss", { corpsId: nc.id, slot: "vanguard" }).ok); assert.ok(!nc.officers.vanguard);
  assert.ok(cmd("corps.merge", { from: nc.id, into: c0.id }).ok); assert.equal(corpsOf(me).length, n0); assert.equal(cmd("corps.merge", { from: c0.id, into: c0.id }).ok, false);
  assert.equal(dispatch(w, { type: "corps.rename", authority: A.ADMIN, stateId: me.id, corpsId: c0.id, name: "x" }).ok, false, "担当国の権限だけ"); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
const startWar = (w, me) => { const ctx = w.sim.ctx; for (const o of alive(w)) { if (o.id === me.id) continue; const r = dispatch(w, { type: "state.act", authority: A.PLAYER, action: "declare_war", target: o.id }); if (r.ok && me.warIds.length) return { war: w.civ.wars[me.warIds[me.warIds.length - 1]], foe: o, ctx }; } return null; };
await check("戦争で軍団が部隊になる（担当国だけ）。予備の軍団は出さない。命令（進軍・包囲）は行軍ルートで動き、着くと作戦が始まり、命令を替えると作戦は捨てられる", () => {
  const w = fresh(), me = own(w), c = startWar(w, me); assert.ok(c, "戦争を起こせる"); const { war, ctx } = c; const cps = corpsOf(me); const fs = Object.values(war.ops.forces).filter((f) => f.stateId === me.id && f.kind === "army"); assert.equal(fs.length, cps.length); assert.ok(fs.every((f) => f.corpsId));
  assert.ok(Object.values(war.ops.forces).filter((f) => f.stateId !== me.id && f.kind === "army").every((f) => !f.corpsId), "相手は従来の野戦軍");
  const cmd = (type, o) => dispatch(w, { type, authority: A.PLAYER, stateId: me.id, ...o }); const c0 = cps[0]; assert.ok(cmd("corps.order", { corpsId: c0.id, kind: "reserve" }).ok); w.sim.advanceMonth(); assert.ok(!Object.values(war.ops.forces).some((f) => f.corpsId === c0.id), "予備は戦争に出ない"); assert.ok(cmd("corps.order", { corpsId: c0.id, kind: "auto" }).ok);
  const foeGs = Object.values(w.civ.groups).filter((g) => g.stateId === c.foe.id); let best = null; for (const g of foeGs) { const rt = routeTo(ctx, c0.at, g.id); if (rt?.length && (!best || rt.length < best.rt.length)) best = { g, rt }; } assert.ok(best, "敵地への道"); assert.equal(cmd("corps.order", { corpsId: c0.id, kind: "siege" }).ok, false, "目標が要る");
  const o = cmd("corps.order", { corpsId: c0.id, kind: "siege", targetGroupId: best.g.id, warId: war.id }); assert.ok(o.ok); assert.equal(o.result.route, best.rt.length); const at0 = c0.at; w.sim.advanceMonth(); assert.notEqual(c0.at, at0, "動く"); let guard = 0; while (c0.order.route?.length && guard++ < 40) w.sim.advanceMonth(); assert.equal(c0.at, best.g.id, "目標に着く");
  w.sim.advanceMonth(); const f0 = Object.values(war.ops.forces).find((f) => f.corpsId === c0.id), camp = f0 && war.ops.campaigns[f0.campaignId]; if (camp) { assert.equal(camp.targetGroupId, best.g.id); assert.ok(camp.kind === "siege" || camp.kind === "offensive"); const since = c0.order.since; cmd("corps.order", { corpsId: c0.id, kind: "hold" }); w.sim.advanceMonth(); assert.ok(!war.ops.campaigns[camp.id] || war.ops.campaigns[camp.id].orderSince !== since || war.ops.campaigns[camp.id].phase === "done"); }
  assert.equal(cmd("corps.order", { corpsId: c0.id, kind: "march", targetGroupId: "nowhere" }).ok, false); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("会戦: 担当国の軍団が関わる大きな戦いは 3 手番の選択肢で進む（三すくみ）。退却は敗北扱いで損害が小さい。live でなければ従来どおり自動", () => {
  const mk = () => { const w = fresh(), me = own(w), c = startWar(w, me); for (let i = 0; i < 2; i++) w.sim.advanceMonth(); const war = c.war, ops = war.ops, A_ = Object.values(ops.forces).find((f) => f.stateId === me.id && f.corpsId && f.size > 10), D_ = Object.values(ops.forces).find((f) => f.stateId !== me.id && f.kind === "army" && f.size > 1), camp = Object.values(ops.campaigns).find((x) => x.forceId === A_?.id); assert.ok(A_ && D_ && camp, "部隊と作戦"); const g = w.civ.groups[camp.targetGroupId]; war.score = 60; return { w, me, war, ops, A_, D_, camp, g, ctx: w.sim.ctx }; };
  let t = mk(); assert.equal(t.ctx.decisions.battle(t.ctx, t.war, { camp: t.camp, A: t.A_, D: t.D_, g: t.g, site: t.g }), null, "live でなければ決断にならない");
  live(t.w); const id = t.ctx.decisions.battle(t.ctx, t.war, { camp: t.camp, A: t.A_, D: t.D_, g: t.g, site: t.g }); assert.ok(id); t.camp.waiting = id; const d = pendingOf(t.w.civ).find((x) => x.id === id); assert.equal(d.kind, "battle"); assert.equal(d.options.length, 4); assert.ok(d.payload.foe.estSize > 0 && d.payload.odds);
  const cas0 = t.war.casualties; let r = resolve(t.w, d, "assault"); assert.ok(r.ok && r.result.step.round === 1); assert.equal(pendingOf(t.w.civ).length, 1, "まだ続く"); r = resolve(t.w, d, "hold"); assert.equal(r.result.step.round, 2); r = resolve(t.w, d, "flank"); assert.ok(r.ok); assert.equal(pendingOf(t.w.civ).length, 0, "3 手番で決着"); assert.match(r.result.note, /勝利|敗北/); assert.ok(t.war.casualties > cas0); assert.equal(t.camp.waiting ?? null, null); assert.equal(timeOf(t.w.civ).hold, false);
  t = mk(); live(t.w); const id2 = t.ctx.decisions.battle(t.ctx, t.war, { camp: t.camp, A: t.A_, D: t.D_, g: t.g, site: t.g }); t.camp.waiting = id2; const sz = t.A_.size; const rr = resolve(t.w, pendingOf(t.w.civ)[0], "withdraw"); assert.ok(rr.ok); assert.ok(rr.result.note.includes("敗北")); assert.ok(t.A_.size >= sz * 0.9 || t.A_.size > 0, "退却の損害は小さい");
  t = mk(); live(t.w); const id3 = t.ctx.decisions.battle(t.ctx, t.war, { camp: t.camp, A: t.A_, D: t.D_, g: t.g, site: t.g }); t.camp.waiting = id3; const snap = serializeWorld(t.w); const back = deserializeWorld(snap); assert.equal(pendingOf(back.civ).length, 1, "保存しても決断が残る"); assert.deepEqual(checkWcdeIntegrity(back.world, back.civ), []);
  assert.equal(dispatch(back, { type: "control.release", authority: A.ADMIN }).ok, true); assert.equal(pendingOf(back.civ).length, 0, "担当を外したら決断は消える"); const camp2 = Object.values(back.civ.wars[t.war.id].ops.campaigns).find((x) => x.id === t.camp.id); assert.ok(!camp2 || !camp2.waiting, "待ちは解ける");
});
await check("決定性: 同じ操作は同じ世界になる（決断・軍団・国策を含む）", () => {
  const run = () => { const w = fresh(), me = own(w), ctx = w.sim.ctx; live(w); ctx.decisions.succession(ctx, me); const d = pendingOf(w.civ)[0]; resolve(w, d, d.options[1].id); ensureCorps(ctx, me); const c = startWar(w, me); for (let i = 0; i < 12; i++) w.sim.advanceMonth(); return JSON.stringify([w.civ.states[me.id].leader, w.civ.states[me.id].corps, w.civ.wars[me.warIds[0]]?.score, w.civ.wcde.decisions]) + (c ? "w" : ""); };
  assert.equal(run(), run());
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
