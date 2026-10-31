// v6.0.0 M8: 重大ニュースと時間制御の状態機械（停止・確認・自動再開）。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { timeOf, newsOf, newsFeed, classifyEvent, scanNews, SPEEDS, CRITICAL_SCORE } from "../js/core/wcde/clock.js";
import { checkWcdeIntegrity } from "../js/core/wcde/integrity.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 6).join(" | ")); } };
const R = createNewWorld({ worldSeed: "m8-1", spec: { resolution: { targetCells: 6000 } }, magic: { enabled: false } }); const w0 = R.w;
dispatch(w0, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w0, { type: "time.advance", authority: A.ADMIN, months: 200 }).ok);
const BASE = serializeWorld(w0), fresh = () => deserializeWorld(BASE);
const run = (w, n) => dispatch(w, { type: "clock.run", authority: A.ADMIN, months: n });
const ack = (w, id) => dispatch(w, { type: "news.ack", authority: A.ADMIN, ...(id ? { id } : {}) });
/** 重大ニュースが出るまで再生する（出なければ null） */
const untilNews = (w, max = 3000) => { for (let i = 0; i < max; i += 12) { const r = run(w, 12); assert.ok(r.ok, r.error); if (timeOf(w.civ).hold) return true; } return false; };

console.log("=== 重大度の実測（通常ニュースで頻繁に止まらない） ===");
await check("重大ニュースは年に1件未満（実測。全件確認しながら 1200 か月再生）", () => {
  const w = fresh(); let crit = 0, months = 0, hist = {}; while (months < 1200) { const r = run(w, 12); assert.ok(r.ok, r.error); months += r.result.advanced; while (newsOf(w.civ).queue.length) { const q = newsOf(w.civ).queue[0]; crit++; hist[q.kind] = (hist[q.kind] ?? 0) + 1; assert.ok(ack(w).ok); } }
  const per12 = crit / (months / 12); console.log(`     ${months}か月で重大ニュース ${crit} 件（12か月あたり ${per12.toFixed(3)}）`, JSON.stringify(hist)); assert.ok(per12 < 1, "年に1件未満"); assert.ok(crit >= 1, "まったく出ないのも不自然（閾値が高すぎる）");
});
await check("通常の出来事（条約・移住・技術の移転など）は重大にならない", () => { const w = fresh(); for (const kind of ["treaty_signed", "group_moved", "tech_transferred", "settlement_founded", "battle_fought", "cohort_formed"]) assert.equal(classifyEvent(w.civ, { kind, title: "x", participants: [] }).level, "normal", kind); });

console.log("=== 停止・確認・再開 ===");
await check("重大ニュースの月で世界時計が止まり、OK まで進まない（clock.run / time.advance とも拒否）。AI の月次行動も進まない", () => {
  const w = fresh(); assert.ok(untilNews(w), "重大ニュースが出る"); const mi = w.civ.monthIndex, ev = w.civ.events.length, T = timeOf(w.civ), q0 = newsOf(w.civ).queue.length; assert.ok(T.hold && q0 >= 1); assert.ok(newsOf(w.civ).queue[0].eventId);
  for (const cmd of [{ type: "clock.run", months: 5 }, { type: "time.advance", months: 5 }]) { const r = dispatch(w, { authority: A.ADMIN, ...cmd }); assert.equal(r.ok, false); assert.ok(/確認待ち/.test(r.error ?? ""), r.error); }
  assert.equal(w.civ.monthIndex, mi); assert.equal(w.civ.events.length, ev, "AI・シミュレーションは動いていない"); assert.deepEqual(checkWcdeIntegrity(w.world, w.civ), []);
});
await check("複数件は重大度順に順番に確認でき、最後の確認で停止前の速度へ自動復帰。先頭以外の確認は拒否", () => {
  const w = fresh(); dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 3 }); assert.ok(untilNews(w)); const N = newsOf(w.civ), T = timeOf(w.civ); assert.equal(T.resumeSpeed, 3, "停止直前の速度を保存");
  // 同じ月に重大ニュースが複数ある状況を作る: 大国どうしの戦争の終結と、大国の滅亡という事実イベントを 2 件（種類が違うので、同じ種類の再通知の抑制には当たらない）
  N.acked = []; N.lastCrit = {}; /* 直前の通知による再通知の抑制を外す */ ack(w); assert.equal(T.hold, false); assert.equal(T.speed, 3, "自動復帰"); const big = Object.values(w.civ.states).filter((x) => x.alive).sort((x, y) => y.pop - x.pop).slice(0, 6).map((x) => ({ entityId: x.id, role: "state" }));
  w.civ.events.push({ eventId: "event_zz1", date: { ...w.civ.date }, kind: "war_ended", title: "（試験）大戦の終結", participants: big, location: null, causes: [], effects: [], decisionId: null, provenance: "simulation" }, { eventId: "event_zz2", date: { ...w.civ.date }, kind: "state_dissolved", title: "（試験）大国の滅亡", participants: big, location: null, causes: [], effects: [], decisionId: null, provenance: "simulation" }); w.civ.monthIndex += 0; const n = scanNews(w.civ); assert.equal(n, 2); assert.equal(T.hold, true); assert.equal(T.resumeSpeed, 3);
  const [a, b] = N.queue.map((q) => q.id); assert.equal(ack(w, b).ok, false, "先頭以外は確認できない"); const r1 = ack(w, a); assert.ok(r1.ok && r1.result.resumed === false && r1.result.next.id === b); assert.equal(T.hold, true); const r2 = ack(w, b); assert.ok(r2.result.resumed); assert.equal(T.speed, 3); assert.equal(T.hold, false); assert.equal(ack(w).ok, false, "確認待ちなし");
});
await check("OK のあとは進める。同じニュースは再表示されない（確認済みID）", () => {
  const w = fresh(); assert.ok(untilNews(w)); const eid = newsOf(w.civ).queue[0].eventId; ack(w); const before = w.civ.monthIndex; assert.ok(run(w, 3).ok); assert.ok(w.civ.monthIndex > before); assert.ok(!newsOf(w.civ).queue.some((q) => q.eventId === eid)); assert.ok(newsOf(w.civ).acked.includes(eid));
});
await check("停止中のユーザー操作の優先順位: hold 中の速度変更は復帰時の速度になり、0（停止）なら復帰後も止まったまま", () => {
  const w = fresh(); dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 2 }); assert.ok(untilNews(w)); const T = timeOf(w.civ); assert.equal(T.resumeSpeed, 2);
  assert.ok(dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 4 }).ok); assert.equal(T.resumeSpeed, 4); assert.equal(T.hold, true, "速度変更では hold は解けない");
  assert.ok(dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 0 }).ok); while (newsOf(w.civ).queue.length) ack(w); assert.equal(T.hold, false); assert.equal(T.speed, 0, "ユーザーが止めたので、止まったまま");
  assert.equal(dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 99 }).ok, false);
});
await check("保存・復元しても、未確認ニュース・停止前の速度・確認済みが失われず、不正に繰り返されない", () => {
  const w = fresh(); dispatch(w, { type: "clock.setSpeed", authority: A.ADMIN, speed: 3 }); assert.ok(untilNews(w)); const q = JSON.stringify(newsOf(w.civ).queue), t = JSON.stringify(timeOf(w.civ));
  const c = deserializeWorld(serializeWorld(w)); assert.equal(JSON.stringify(newsOf(c.civ).queue), q); assert.equal(JSON.stringify(timeOf(c.civ)), t); assert.equal(run(c, 1).ok, false, "復元後も確認待ち"); const d = deserializeWorld(serializeWorld(c)); assert.equal(JSON.stringify(newsOf(d.civ)), JSON.stringify(newsOf(c.civ)), "再保存でも同じ");
  while (newsOf(c.civ).queue.length) ack(c); assert.equal(timeOf(c.civ).speed, 3); const n = newsOf(c.civ).queue.length; assert.ok(run(c, 1).ok); assert.equal(newsOf(c.civ).queue.length, n, "同じニュースが再び出ない"); assert.deepEqual(checkWcdeIntegrity(c.world, c.civ), []);
});
await check("過去の閲覧中は再生できない。時間の速度表は 停止 + 4 段階", () => { const w = fresh(); dispatch(w, { type: "view.past", authority: A.ADMIN, month: w.civ.monthIndex - 6 }); const r = run(w, 1); assert.equal(r.ok, false); assert.equal(r.code, "past_view"); assert.equal(SPEEDS[0].mps, 0); assert.ok(SPEEDS.length >= 4); });
await check("再生は決定的: 一度に進めても、1か月ずつ（ニュースを確認しながら）進めても、同じ世界（ニュースの確認は世界の事実を変えない）", () => {
  const a = fresh(), b = fresh(); let m = 0; while (m < 120) { const r = run(a, 120 - m); m += r.result.advanced; while (newsOf(a.civ).queue.length) ack(a); } for (let i = 0; i < 120; i++) { run(b, 1); while (newsOf(b.civ).queue.length) ack(b); } assert.equal(a.civ.monthIndex, b.civ.monthIndex); assert.equal(JSON.stringify(a.civ.states), JSON.stringify(b.civ.states)); assert.equal(a.civ.events.length, b.civ.events.length);
});
await check("ニュース一覧は事実イベントから作る投影（保存しない・新しい順・重大度で絞れる）", () => { const w = fresh(); run(w, 120); while (newsOf(w.civ).queue.length) ack(w); const f = newsFeed(w.civ, { limit: 20, minLevel: "major" }); assert.ok(f.length >= 1); for (let i = 1; i < f.length; i++) assert.ok(f[i - 1].eventId >= f[i].eventId); assert.ok(f.every((x) => x.level !== "normal")); assert.ok(!("feed" in newsOf(w.civ))); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
