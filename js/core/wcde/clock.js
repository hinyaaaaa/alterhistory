// v6 M8: ニュースと時間制御（状態機械）。仕様 §12。
//   ・月次 tick を確定したあとに、その月の事実イベントから重大ニュースを判定し、キューへ入れる。キューがあれば世界時計を止める（hold）。
//   ・hold 中は、OK（ack）が押されるまで、世界時計・国家 AI の月次行動・時間依存の更新を一切進めない（clock.run / time.advance は拒否）。
//   ・全件を確認し終えたら、停止直前の進行速度へ自動で戻る。hold 中にユーザーが速度を変えたら、その選択が優先され、復帰時の速度になる（0 = 停止のままにする）。
//   ・同じ月の途中状態は外へ出さない: ニュースの判定は tick の確定後だけ。重大ニュースが出た月で必ず止まる（その先へ進めない）。
//   ・ニュースは UI 向けの投影で、正本ではない。キュー・確認済み ID・停止前の速度・走査位置だけを保存し、画面の一覧は事実イベントから都度作る。
//   ・時間を早送りする管理命令（time.advance）は、ニュースを判定せず走査位置だけを進める（早送りで飛ばした出来事で、後から全画面が出ない）。
import { checkpointFull, restoreInto } from "./contract.js";

export const SPEEDS = Object.freeze([{ id: 0, label: "停止", mps: 0 }, { id: 1, label: "1か月/秒", mps: 1 }, { id: 2, label: "3か月/秒", mps: 3 }, { id: 3, label: "1年/秒", mps: 12 }, { id: 4, label: "5年/秒", mps: 60 }]);
export const DEFAULT_SPEED = 1, ACK_KEEP = 400, MAX_RUN = 240, COOLDOWN = 60; // 同じ種類・同じ国の重大ニュースは、60か月は繰り返さない（次は通常の「主要ニュース」に格下げ）
export const timeOf = (civ) => (civ.wcde.time ??= { speed: DEFAULT_SPEED, hold: false, resumeSpeed: null });
export const newsOf = (civ) => (civ.wcde.news ??= { queue: [], acked: [], scanned: civ.events.length });
export const isRunning = (civ) => { const t = timeOf(civ); return !t.hold && t.speed > 0; };

/** 重大度の判定。世界の人口に対する国家の割合（規模）で決める。閾値は tests/v600-m8-news.test.mjs で実測して調整する */
export const CRITICAL_SCORE = 85;
export function newsContext(civ) {
  const alive = Object.values(civ.states).filter((s) => s.alive), total = alive.reduce((a, s) => a + s.pop, 0) || 1, n = Math.max(1, alive.length), rel = {};
  for (const s of Object.values(civ.states)) rel[s.id] = (s.pop / total) * n; // 相対規模: 1 = 平均的な国。国の数が増えても「大きな国かどうか」で判断する
  return { rel };
}
const KIND = { state_dissolved: 40, war_declared: 25, war_ended: 30, regime_change: 25, conquest: 35, state_formed: 20, religion_founded: 25, religion_schism: 20, famine: 15, disaster_struck: 15, climate_shift: 20, dynasty_changed: 15, culture_diverged: 10, language_diverged: 10, tech_lost: 20 };
const SIZE_K = 15; // 規模の加点: SIZE_K × log2(1 + 相対規模)。相対規模 6（平均の6倍の国どうしの戦争）で +42
export function classifyEvent(civ, ev, cx = newsContext(civ)) {
  const base = KIND[ev.kind]; if (base == null) return { level: "normal", score: 0 };
  const ids = ev.participants.map((p) => p.entityId).filter((i) => civ.states[i]), sum = ids.reduce((a, i) => a + (cx.rel[i] ?? 0), 0), big = Math.max(0, ...ids.map((i) => cx.rel[i] ?? 0));
  let score = base + SIZE_K * Math.log2(1 + sum);
  if (ev.kind === "regime_change" || ev.kind === "dynasty_changed") score = base + SIZE_K * Math.log2(1 + big); // 小国の政変では止めない
  if (ev.kind === "culture_diverged" || ev.kind === "language_diverged" || ev.kind === "famine" || ev.kind === "disaster_struck") score = Math.min(score, 69);
  score = Math.round(score); return { level: score >= CRITICAL_SCORE ? "critical" : score >= 40 ? "major" : "normal", score };
}
export const newsItem = (civ, ev, c) => ({ id: "news_" + ev.eventId, eventId: ev.eventId, date: ev.date, kind: ev.kind, title: ev.title, level: c.level, score: c.score, entityIds: [...new Set(ev.participants.map((p) => p.entityId))] });

/** 走査: 前回以降の事実イベントから重大ニュースを判定してキューへ入れる。入れた件数を返す */
export function scanNews(civ) {
  const N = newsOf(civ), T = timeOf(civ); if (N.scanned > civ.events.length) N.scanned = civ.events.length; const cx = newsContext(civ), fresh = [];
  for (let i = N.scanned; i < civ.events.length; i++) { const ev = civ.events[i], c = classifyEvent(civ, ev, cx); if (c.level === "critical") { const keys = ev.participants.filter((p) => civ.states[p.entityId]).map((p) => ev.kind + "|" + p.entityId), mi = civ.monthIndex, last = (N.lastCrit ??= {}); if (keys.some((k) => last[k] != null && mi - last[k] < COOLDOWN)) { c.level = "major"; } else for (const k of keys) last[k] = mi; }
    if (c.level === "critical" && !N.acked.includes(ev.eventId) && !N.queue.some((q) => q.eventId === ev.eventId)) fresh.push(newsItem(civ, ev, c)); }
  N.scanned = civ.events.length; fresh.sort((a, b) => b.score - a.score || (a.eventId < b.eventId ? -1 : 1)); N.queue.push(...fresh);
  if (N.queue.length && !T.hold) { T.hold = true; T.resumeSpeed = T.speed; } return fresh.length;
}
export const skipNews = (civ) => { newsOf(civ).scanned = civ.events.length; };

/** 世界時計を最大 months か月進める（UI の再生が呼ぶ）。重大ニュースが出た月で止まる。hold 中は拒否 */
export function clockRun(w, months) {
  const { civ } = w, T = timeOf(civ); if (T.hold) return { ok: false, code: "news_hold", error: "重大ニュースの確認待ちです（OK を押すまで時間は進みません）" };
  const n = Math.max(1, Math.min(MAX_RUN, months | 0)), snap = checkpointFull(civ); let done = 0, held = false;
  try { for (; done < n; done++) { w.sim.advanceMonth(); if (scanNews(civ) > 0 || timeOf(civ).hold) { done++; held = true; break; } } } catch (err) {
    // 失敗した月の手前まで、取り消し点から決定的に再現する（その手前の月は重大ニュースを出していない）
    restoreInto(w, snap); const msg = String(err?.message ?? err); for (let i = 0; i < done; i++) w.sim.advanceMonth(); const ok = done;
    skipNews(civ); timeOf(civ).speed = 0; civ.wcde.diagnostics.push({ at: civ.monthIndex, failedMonth: civ.monthIndex + 1, message: msg }); if (civ.wcde.diagnostics.length > 50) civ.wcde.diagnostics.shift();
    return { ok: false, advanced: ok, error: msg, haltedAt: { ...civ.date } };
  }
  return { ok: true, advanced: done, held, date: { ...civ.date } };
}

/** 重大ニュースの確認（OK）。先頭だけ確認できる。最後の 1 件を確認したら、停止前の速度へ自動復帰 */
export function ackNews(w, { id = null } = {}) {
  const { civ } = w, N = newsOf(civ), T = timeOf(civ), head = N.queue[0]; if (!head) return { ok: false, error: "確認待ちのニュースはありません" };
  if (id != null && id !== head.id) return { ok: false, error: "最初のニュースから順に確認してください" };
  N.queue.shift(); N.acked.push(head.eventId); if (N.acked.length > ACK_KEEP) N.acked.splice(0, N.acked.length - ACK_KEEP);
  if (!N.queue.length) { T.hold = false; T.speed = T.resumeSpeed ?? DEFAULT_SPEED; T.resumeSpeed = null; return { ok: true, resumed: true, speed: T.speed, next: null }; }
  return { ok: true, resumed: false, next: N.queue[0] };
}
/** 速度の変更。hold 中は、復帰時の速度として記録する（ユーザーの明示的な選択が優先） */
export function setSpeed(w, { speed }) {
  const { civ } = w, T = timeOf(civ); if (!SPEEDS.some((s) => s.id === speed)) return { ok: false, error: "その速度はありません" };
  if (T.hold) { T.resumeSpeed = speed; return { ok: true, held: true, willResume: speed }; } T.speed = speed; return { ok: true, speed };
}
/** 右パネル用のニュース一覧（事実イベントから都度作る。保存しない）。新しい順 */
export function newsFeed(civ, { limit = 40, minLevel = "major", before = null } = {}) {
  const cx = newsContext(civ), out = [], rank = { normal: 0, major: 1, critical: 2 }; for (let i = (before ?? civ.events.length) - 1; i >= 0 && out.length < limit; i--) { const ev = civ.events[i], c = classifyEvent(civ, ev, cx); if (rank[c.level] >= rank[minLevel]) out.push(newsItem(civ, ev, c)); } return out;
}
export function checkClock(civ) {
  const errs = [], T = civ.wcde.time, N = civ.wcde.news; if (!T && !N) return errs;
  if (T) { if (!SPEEDS.some((s) => s.id === T.speed)) errs.push("時間の速度が不正"); if (T.hold && !(N?.queue.length)) errs.push("停止中なのに確認待ちのニュースがない（時間が止まったままになる）"); if (!T.hold && N?.queue.length) errs.push("確認待ちのニュースがあるのに時間が止まっていない"); if (T.hold && T.resumeSpeed != null && !SPEEDS.some((s) => s.id === T.resumeSpeed)) errs.push("復帰時の速度が不正"); }
  if (N) { const seen = new Set(); for (const q of N.queue) { if (seen.has(q.id)) errs.push(`ニュース ${q.id} が重複`); seen.add(q.id); if (!civ.events.some((e) => e.eventId === q.eventId)) errs.push(`ニュース ${q.id} の元の事実イベントがない`); if (N.acked.includes(q.eventId)) errs.push(`確認済みのニュース ${q.id} がキューにある`); } if (N.scanned > civ.events.length || !Number.isInteger(N.scanned) || N.scanned < 0) errs.push("ニュースの走査位置が不正"); }
  return errs;
}
