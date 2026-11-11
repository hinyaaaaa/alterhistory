// v6.0.0 M8 → v6.1.2: 重大ニュースと時間制御（状態機械・停止・確認・自動再開）。
//   v6.1.2: 重大ニュース（時間を止めるもの）は「自国（担当国）に関する重大な出来事」と「世界大戦」だけ。基準の利用者設定（news.configure）は廃止。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { timeOf, newsOf, newsFeed, classifyEvent, scanNews, SPEEDS, WORLD_WAR, OWN_CRITICAL, ownIds, isWorldWar } from "../js/core/wcde/clock.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "m8-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 200 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const run = (w, n) => dispatch(w, { type: "clock.run", authority: A.ADMIN, months: n });
const ack = (w, id) => dispatch(w, { type: "news.ack", authority: A.ADMIN, ...(id ? { id } : {}) });
const alive = (w) => Object.values(w.civ.states).filter((s) => s.alive).sort((a, b) => b.pop - a.pop);
/** 最大の国を担当する */
const own = (w, k = 0) => { const s = alive(w)[k]; assert.ok(dispatch(w, { type: "control.take", authority: A.ADMIN, stateId: s.id }).ok); return s; };
let seq = 0;
const mkEv = (w, kind, ids, extra = {}) => ({ eventId: `event_zt${++seq}`, date: { ...w.civ.date }, kind, title: `（試験）${kind}`, participants: ids.map((id) => ({ entityId: id, role: "state" })), location: null, causes: [], effects: [], decisionId: null, provenance: "simulation", ...extra });
const push = (w, e) => { w.civ.events.push(e); return e; };
/** 自国の重大な出来事を 1 件入れて走査する（時計が止まる） */
const holdOwn = (w, kind = "war_declared") => { const s = own(w); push(w, mkEv(w, kind, [s.id])); assert.equal(scanNews(w.civ), 1); return s; };
/** 世界大戦の戦争の記録（試験用）: 両陣営に国を割り当て、人口を大きくする */
const mkWar = (w, na, nd, bigPop = true) => { const st = alive(w), ids = st.slice(0, na + nd).map((s) => s.id), a = ids.slice(0, na), d = ids.slice(na); if (bigPop) for (const i of ids) w.civ.states[i].pop = 1e9; const id = `war_zt${++seq}`; w.civ.wars[id] = { id, aggressor: a[0], defender: d[0], sides: { a, d }, startedAt: w.civ.monthIndex, status: "active", reason: "conquest", score: 0, occupied: [], outcome: null, endedAt: null, casualties: 0 }; return w.civ.wars[id]; };
const warEv = (w, war) => mkEv(w, "war_declared", [war.aggressor, war.defender], { facts: { warId: war.id, aggressor: war.aggressor, defender: war.defender } });

console.log("=== 重大ニュースの条件（自国の重大事と世界大戦だけ） ===");
await check("自国（担当国）が当事者の重大な種類の出来事は重大。他国の同じ出来事は重大にならない", () => {
  const w = fresh(), s = own(w), other = alive(w).find((x) => x.id !== s.id);
  for (const kind of OWN_CRITICAL) { assert.equal(classifyEvent(w.civ, mkEv(w, kind, [s.id])).level, "critical", kind + "（自国）"); assert.notEqual(classifyEvent(w.civ, mkEv(w, kind, [other.id])).level, "critical", kind + "（他国）"); }
  assert.equal(classifyEvent(w.civ, mkEv(w, "war_ended", [other.id, s.id])).level, "critical", "当事者の一方が自国");
});
await check("担当国がない（見守り）ときは、自国の重大事がないので、これらの出来事で止まらない", () => {
  const w = fresh(); assert.equal(ownIds(w.civ).size, 0); for (const kind of OWN_CRITICAL) for (const s of alive(w).slice(0, 3)) assert.notEqual(classifyEvent(w.civ, mkEv(w, kind, [s.id])).level, "critical", kind);
  const n0 = newsOf(w.civ).queue.length; push(w, mkEv(w, "war_declared", alive(w).slice(0, 2).map((s) => s.id))); assert.equal(scanNews(w.civ), 0); assert.equal(newsOf(w.civ).queue.length, n0); assert.equal(timeOf(w.civ).hold, false);
});
await check("自国でも、重大でない種類（条約・飢え・災害・文化の分岐・世代交代など）では止まらない。創造主の災厄も止まらない", () => {
  const w = fresh(), s = own(w); for (const kind of ["treaty_signed", "famine", "disaster_struck", "culture_diverged", "language_diverged", "dynasty_changed", "tech_lost", "religion_founded", "climate_shift", "battle_fought", "group_moved"]) assert.notEqual(classifyEvent(w.civ, mkEv(w, kind, [s.id])).level, "critical", kind);
  assert.notEqual(classifyEvent(w.civ, mkEv(w, "catastrophe", [s.id], { facts: { mortality: 0.9, scope: "world" } })).level, "critical", "災厄");
});
await check("担当を外れた（滅亡で担当が外れた）直後の月でも、自国の滅亡のニュースは重大として出る", () => {
  const w = fresh(), s = own(w); w.civ.wcde.control.stateId = null; w.civ.wcde.log = (w.civ.wcde.log ?? []).concat([{ at: w.civ.monthIndex, type: "control.lost", ok: true, stateId: s.id }]);
  assert.ok(ownIds(w.civ).has(s.id)); push(w, mkEv(w, "state_dissolved", [s.id])); assert.equal(scanNews(w.civ), 1);
  const v = fresh(), t = own(v); v.civ.wcde.control.stateId = null; v.civ.wcde.log = (v.civ.wcde.log ?? []).concat([{ at: v.civ.monthIndex - 30, type: "control.lost", ok: true, stateId: t.id }]); assert.ok(!ownIds(v.civ).has(t.id), "ずっと前に失った担当国は自国として扱わない");
});
await check("世界大戦: 参戦国が多く（6 か国以上・両陣営 2 か国以上）、世界の人口の大きな割合を巻き込む戦争の開戦は重大。担当国がなくても止まる", () => {
  const w = fresh(); const war = mkWar(w, 3, 3); assert.equal(isWorldWar(w.civ, war), true); push(w, warEv(w, war)); assert.equal(scanNews(w.civ), 1);
  const q = newsOf(w.civ).queue[0]; assert.ok(/世界大戦/.test(q.title), q.title); assert.equal(timeOf(w.civ).hold, true); assert.equal(ownIds(w.civ).size, 0, "担当国なしでも出る");
  assert.equal(newsOf(w.civ).worldWars[war.id], q.eventId, "開戦の時点で記録する");
  assert.equal(scanNews(w.civ), 0, "同じ戦争で重ねて出ない"); const f = newsFeed(w.civ, { limit: 5, minLevel: "critical" }); assert.ok(f.some((x) => /世界大戦/.test(x.title) && x.level === "critical"), "右のニュース欄にも出る");
});
await check("世界大戦にならない戦争: 2 か国どうし／参戦国が少ない／片方の陣営が 1 か国／人口の割合が小さい", () => {
  for (const [na, nd, big] of [[1, 1, true], [2, 2, true], [1, 5, true], [5, 1, true], [3, 3, false]]) { const w = fresh(); const war = mkWar(w, na, nd, big); if (!big) for (const i of [...war.sides.a, ...war.sides.d]) w.civ.states[i].pop = 1; assert.equal(isWorldWar(w.civ, war), false, `${na}対${nd} 人口${big ? "大" : "小"}`); push(w, warEv(w, war)); assert.equal(scanNews(w.civ), 0); assert.ok(!newsOf(w.civ).worldWars?.[war.id]); }
  assert.equal(WORLD_WAR.minStates, 6);
});
await check("同じ種類・同じ国の繰り返しは、戦争と滅亡は毎回知らせ、それ以外（政変・建国・征服）は 60 か月は主要ニュースへ格下げ", () => {
  const w = fresh(), s = own(w); for (let i = 0; i < 2; i++) { push(w, mkEv(w, "war_declared", [s.id])); assert.equal(scanNews(w.civ), 1, "宣戦は毎回"); ack(w); }
  push(w, mkEv(w, "regime_change", [s.id])); assert.equal(scanNews(w.civ), 1); ack(w); push(w, mkEv(w, "regime_change", [s.id])); assert.equal(scanNews(w.civ), 0, "同じ政変は繰り返さない");
});
await check("基準の利用者設定は廃止: news.configure は存在せず、旧版の保存に残る基準（settings）は無視されて消える", () => {
  const w = fresh(); assert.equal(dispatch(w, { type: "news.configure", authority: A.ADMIN, reset: true }).ok, false); assert.equal(dispatch(w, { type: "news.configure", authority: A.CREATOR, criticalScore: 20 }).ok, false);
  newsOf(w.civ).settings = { criticalScore: 20, majorScore: 0, sizeK: 60, maxPerScan: 20, kinds: { culture_diverged: 300 } }; push(w, mkEv(w, "culture_diverged", alive(w).slice(0, 3).map((x) => x.id))); assert.equal(scanNews(w.civ), 0, "旧設定で重大にならない"); assert.ok(!("settings" in newsOf(w.civ)));
});
await check("通常の出来事（条約・移住・技術の移転など）は重大にならない", () => { const w = fresh(); for (const kind of ["treaty_signed", "group_moved", "tech_transferred", "settlement_founded", "battle_fought", "cohort_formed"]) assert.equal(classifyEvent(w.civ, { kind, title: "x", participants: [] }).level, "normal", kind); });
await check("重大ニュースは年に1件未満（実測。最大の国を担当して、全件確認しながら 1200 か月再生）", () => {
  const w = fresh(); own(w); let crit = 0, months = 0, hist = {}; while (months < 1200) { const r = run(w, 12); assert.ok(r.ok, r.error); months += r.result.advanced; while (newsOf(w.civ).queue.length) { const q = newsOf(w.civ).queue[0]; crit++; hist[q.kind] = (hist[q.kind] ?? 0) + 1; assert.ok(ack(w).ok); } }
  const per12 = crit / (months / 12); console.log(`     ${months}か月で重大ニュース ${crit} 件（12か月あたり ${per12.toFixed(3)}）`, JSON.stringify(hist)); assert.ok(per12 < 1, "年に1件未満"); for (const k of Object.keys(hist)) assert.ok(OWN_CRITICAL.has(k), k + " は自国の重大事の種類");
});

console.log("=== 停止・確認・再開 ===");
await check("重大ニュースの月で世界時計が止まり、OK まで進まない（clock.run / time.advance とも拒否）。AI の月次行動も進まない", () => {
  const w = fresh(); holdOwn(w); const mi = w.civ.monthIndex, ev = w.civ.events.length, T = timeOf(w.civ), q0 = newsOf(w.civ).queue.length; assert.ok(T.hold && q0 >= 1); assert.ok(newsOf(w.civ).queue[0].eventId);
  for (const cmd of [{ type: "clock.run", months: 5 }, { type: "time.advance", months: 5 }]) { const r = dispatch(w, { authority: A.ADMIN, ...cmd }); assert.equal(r.ok, false); assert.ok(/確認待ち/.test(r.error ?? ""), r.error); }
  assert.equal(w.civ.monthIndex, mi); assert.equal(w.civ.events.length, ev, "AI・シミュレーションは動いていない"); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("実際の再生でも、自国の重大な出来事が起きた月で止まる（clock.run の途中で止まり、その先へ進まない）", () => {
  const w = fresh(), s = own(w); push(w, mkEv(w, "war_declared", [s.id])); /* 走査位置より後ろにある未走査の出来事 */ const r = run(w, 12); assert.ok(r.ok, r.error); assert.equal(r.result.held, true); assert.equal(r.result.advanced, 1, "最初の月で止まる"); assert.equal(timeOf(w.civ).hold, true); assert.equal(run(w, 1).ok, false);
});
await check("複数件は順番に確認でき、最後の確認で停止前の速度へ自動復帰。先頭以外の確認は拒否", () => {
  const w = fresh(); dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 3 }); const s = own(w); push(w, mkEv(w, "war_ended", [s.id])); push(w, mkEv(w, "state_dissolved", [s.id])); const N = newsOf(w.civ), T = timeOf(w.civ);
  assert.equal(scanNews(w.civ), 2); assert.equal(T.hold, true); assert.equal(T.resumeSpeed, 3, "停止直前の速度を保存");
  const [a, b] = N.queue.map((q) => q.id); assert.equal(ack(w, b).ok, false, "先頭以外は確認できない"); const r1 = ack(w, a); assert.ok(r1.ok && r1.result.resumed === false && r1.result.next.id === b); assert.equal(T.hold, true); const r2 = ack(w, b); assert.ok(r2.result.resumed); assert.equal(T.speed, 3); assert.equal(T.hold, false); assert.equal(ack(w).ok, false, "確認待ちなし");
});
await check("OK のあとは進める。同じニュースは再表示されない（確認済みID）", () => {
  const w = fresh(); holdOwn(w); const eid = newsOf(w.civ).queue[0].eventId; ack(w); const before = w.civ.monthIndex; assert.ok(run(w, 3).ok); assert.ok(w.civ.monthIndex > before); assert.ok(!newsOf(w.civ).queue.some((q) => q.eventId === eid)); assert.ok(newsOf(w.civ).acked.includes(eid));
});
await check("停止中のユーザー操作の優先順位: hold 中の速度変更は復帰時の速度になり、0（停止）なら復帰後も止まったまま", () => {
  const w = fresh(); dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 2 }); holdOwn(w); const T = timeOf(w.civ); assert.equal(T.resumeSpeed, 2);
  assert.ok(dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 4 }).ok); assert.equal(T.resumeSpeed, 4); assert.equal(T.hold, true, "速度変更では hold は解けない");
  assert.ok(dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 0 }).ok); while (newsOf(w.civ).queue.length) ack(w); assert.equal(T.hold, false); assert.equal(T.speed, 0, "ユーザーが止めたので、止まったまま");
  assert.equal(dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 99 }).ok, false);
});
await check("保存・復元しても、未確認ニュース・停止前の速度・確認済み・世界大戦の記録が失われず、不正に繰り返されない", () => {
  const w = fresh(); dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 3 }); const s = own(w); push(w, mkEv(w, "war_declared", [s.id])); const war = mkWar(w, 3, 3); push(w, warEv(w, war)); assert.equal(scanNews(w.civ), 2); const q = JSON.stringify(newsOf(w.civ).queue), t = JSON.stringify(timeOf(w.civ));
  const c = deserializeWorld(serializeWorld(w)); assert.equal(JSON.stringify(newsOf(c.civ).queue), q); assert.equal(JSON.stringify(timeOf(c.civ)), t); assert.equal(run(c, 1).ok, false, "復元後も確認待ち"); assert.ok(newsOf(c.civ).worldWars[war.id]); const d = deserializeWorld(serializeWorld(c)); assert.equal(JSON.stringify(newsOf(d.civ)), JSON.stringify(newsOf(c.civ)), "再保存でも同じ");
  while (newsOf(c.civ).queue.length) ack(c); assert.equal(timeOf(c.civ).speed, 3); const n = newsOf(c.civ).queue.length; assert.ok(run(c, 1).ok); assert.equal(newsOf(c.civ).queue.length, n, "同じニュースが再び出ない");
});
await check("過去の閲覧中は再生できない。時間の速度表は 停止 + 4 段階", () => { const w = fresh(); dispatch(w, { type: "view.past", authority: A.ADMIN, month: w.civ.monthIndex - 6 }); const r = run(w, 1); assert.equal(r.ok, false); assert.equal(r.code, "past_view"); assert.equal(SPEEDS[0].mps, 0); assert.ok(SPEEDS.length >= 4); });
await check("再生は決定的: 一度に進めても、1か月ずつ（ニュースを確認しながら）進めても、同じ世界（ニュースの確認は世界の事実を変えない）", () => {
  const a = fresh(), b = fresh(); own(a); own(b); let m = 0; while (m < 120) { const r = run(a, 120 - m); m += r.result.advanced; while (newsOf(a.civ).queue.length) ack(a); } for (let i = 0; i < 120; i++) { run(b, 1); while (newsOf(b.civ).queue.length) ack(b); } assert.equal(a.civ.monthIndex, b.civ.monthIndex); assert.equal(JSON.stringify(a.civ.states), JSON.stringify(b.civ.states)); assert.equal(a.civ.events.length, b.civ.events.length);
});
await check("ニュース一覧は事実イベントから作る投影（保存しない・新しい順・重大度で絞れる）", () => { const w = fresh(); run(w, 120); while (newsOf(w.civ).queue.length) ack(w); const st2 = alive(w); push(w, mkEv(w, "war_declared", [st2[0].id, st2[1].id])); /* v6.10.1: 120 か月で重大な出来事が起きるかは乱数しだいなので、重大な出来事を 1 件入れる */ const f = newsFeed(w.civ, { limit: 20, minLevel: "major" }); assert.ok(f.length >= 1); for (let i = 1; i < f.length; i++) assert.ok(f[i - 1].eventId >= f[i].eventId); assert.ok(f.every((x) => x.level !== "normal")); assert.ok(!("feed" in newsOf(w.civ))); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
