// v6.20.0 M4: コンパクション・キュー。整理が必要になったデータを、その発生時点（条約の失効・国家の滅亡・人物の没）で登録し、毎月、決まった件数ずつ消化する。
//   v6.9.0〜v6.19.0 は、年 1 回、全条約・全国家・全人物・全言語を走査して整理していた。対象が増えるほど、その月だけ処理が重くなっていた。
//   ここは葉のモジュール（writerOf だけを使う）。キューは派生データで、保存しない（読み込み後や、登録されなかったものは、最初の消化のときに全体を 1 回だけ走査して作り直す）。
//   キューへの追加・取り出し・整理の書き込みは、月次トランザクションの journal を通す（失敗した月は、整理も登録も元に戻る）。
//   重要: コンパクションは「履歴の削除」ではない。人物の生没年・親子関係・家系・国家の名前・年・首都・政体・指導者は残し、今の計算に要らない細部だけを落とす。
import { writerOf } from "../sim/month-transaction.js";

export const COMPACT = Object.freeze({ treatyKeepMonths: 600, proposalKeepMonths: 360, deadStateMonths: 600, figureMonths: 3600, historyMonths: 720, budget: 64, langBudget: 400, reseedMonths: 1200 });
export const DEAD_STATE_HEAVY = Object.freeze(["relations", "politics", "econ", "military", "sanctions", "strategy", "campaign", "interp", "interpDirty", "offices", "magic", "tradeRoutes"]);
const RETAIN = { treaty: COMPACT.treatyKeepMonths, state: COMPACT.deadStateMonths, hist: COMPACT.historyMonths, fig: COMPACT.figureMonths };
const KINDS = Object.keys(RETAIN);
const Q = new WeakMap();
const fresh = () => ({ a: [], h: 0 });
/** キューの本体（civ ごと・保存しない）。種類ごとに「発生順 = 期限順」の FIFO（種類ごとに保持期間が一定なので、発生順がそのまま期限順になる） */
export function queueOf(civ) { let q = Q.get(civ); if (!q) { q = { seeded: false, seedAt: -Infinity, lang: { keys: null, i: 0, live: null, at: -Infinity }, stats: { drained: 0, pending: 0 } }; for (const k of KINDS) q[k] = fresh(); Q.set(civ, q); } return q; }
/** 発生時点の登録（at: 発生した月）。呼ぶのは、条約の失効・国家の滅亡・人物の没の処理 */
export function enqueue(ctx, kind, id, at) { const J = writerOf(ctx), b = queueOf(ctx.civ)[kind]; if (b) J.push(b.a, { id, due: at + RETAIN[kind] }); }

/** 最初の消化（読み込み後・長い間隔）: 既にある対象を発生順に並べて登録する。1 回だけの走査 */
function seed(ctx) {
  const { civ } = ctx, J = writerOf(ctx), q = queueOf(civ), by = (k, list) => { list.sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1)); J.set(q, k, { a: list.map((x) => ({ id: x.id, due: x.at + RETAIN[k] })), h: 0 }); };
  const tr = [], st = [], hi = [], fg = [];
  for (const id in civ.treaties) { const t = civ.treaties[id]; if (!t.active && t.endedAt != null) tr.push({ id, at: t.endedAt }); }
  for (const id in civ.states) { const s = civ.states[id]; if (!s.alive && !s.compacted && s.dissolvedAt != null) st.push({ id, at: s.dissolvedAt }); }
  for (const id in civ.figures ?? {}) { const f = civ.figures[id]; if (f.diedAt == null) continue; if (!f.compacted) hi.push({ id, at: f.diedAt }); fg.push({ id, at: f.diedAt }); }
  by("treaty", tr); by("state", st); by("hist", hi); by("fig", fg); J.set(q, "seeded", true); J.set(q, "seedAt", civ.monthIndex);
}
const pinnedFigures = (civ) => { const keep = new Set(); for (const id in civ.states) { const s = civ.states[id]; if (s.leaderFigureId) keep.add(s.leaderFigureId); if (s.heirFigureId) keep.add(s.heirFigureId); } return keep; };
const parentOfLiving = (civ, f) => { for (const c of f.children ?? []) if (civ.figures[c]) return true; return false; };

/** 毎月: 期限が来たものを、決まった件数（budget）まで消化する。残りは次の月へ持ち越す。返り値は整理した件数 */
export function drainQueue(ctx, budget = COMPACT.budget) {
  const { civ } = ctx, J = writerOf(ctx), mi = civ.monthIndex, q0 = queueOf(civ);
  if (!q0.seeded || mi - q0.seedAt >= COMPACT.reseedMonths) seed(ctx);
  const q = queueOf(civ), stats = (civ.stats ??= {}); let used = 0, keep = null;
  const take = (b) => { if (b.h >= b.a.length || b.a[b.h].due > mi) return null; const it = b.a[b.h]; J.set(b, "h", b.h + 1); if (b.h > 4096 && b.h * 2 > b.a.length) { J.splice(b.a, 0, b.h); J.set(b, "h", 0); } return it; };
  const bump = (k) => J.set(stats, k, (stats[k] ?? 0) + 1);
  while (used < budget) { const it = take(q.treaty); if (!it) break; used++; const t = civ.treaties[it.id]; if (t && !t.active && t.endedAt != null && mi - t.endedAt > COMPACT.treatyKeepMonths) { J.delete(civ.treaties, it.id); bump("treatiesPruned"); } }
  while (used < budget) { const it = take(q.state); if (!it) break; used++; const s = civ.states[it.id]; if (s && !s.alive && !s.compacted && s.dissolvedAt != null && mi - s.dissolvedAt >= COMPACT.deadStateMonths) { for (const k of DEAD_STATE_HEAVY) J.delete(s, k); J.set(s, "compacted", true); } }
  while (used < budget) { const it = take(q.hist); if (!it) break; used++; const f = civ.figures?.[it.id]; if (f && f.diedAt != null && mi - f.diedAt > COMPACT.historyMonths && !f.compacted) { if ((f.history?.length ?? 0) > 2) J.set(f, "history", [f.history[0], f.history[f.history.length - 1]]); J.set(f, "compacted", true); } }
  while (used < budget) {
    const it = take(q.fig); if (!it) break; used++; const f = civ.figures?.[it.id]; if (!f || f.diedAt == null || mi - f.diedAt <= COMPACT.figureMonths) continue;
    keep ??= pinnedFigures(civ); if (keep.has(it.id) || f.children?.length || parentOfLiving(civ, f)) continue; // 指導者・後継者・子を持つ人物は残す（骨格は葉から順に消える。子が消えたとき、親は再登録される）
    for (const pid of f.parents ?? []) { const par = civ.figures[pid]; if (par) { J.set(par, "children", par.children.filter((c) => c !== it.id)); if (par.diedAt != null) J.push(q.fig.a, { id: pid, due: Math.max(par.diedAt + RETAIN.fig, mi + 12) }); } } // 親の子の一覧から外す（整合性: 子は対になる）。子を失った親は次の年に整理される
    J.delete(civ.figures, it.id); bump("figuresPruned");
  }
  q.stats.pending = KINDS.reduce((n, k) => n + q[k].a.length - q[k].h, 0); J.set(q.stats, "drained", q.stats.drained + used);
  return used;
}

/** 年 1 回の周期のもの（外交の提案の記録）と、言語の音素表の分割走査（1 周 = 1 年。毎月 langBudget 件ずつ） */
export function sweepSlow(ctx) {
  const { civ } = ctx, J = writerOf(ctx), mi = civ.monthIndex, stats = (civ.stats ??= {}), q = queueOf(civ), L = q.lang;
  if (mi % 12 === 7) { const led = civ.wcde?.diplomacy; if (led?.proposals?.length > 200) { const before = led.proposals.length; J.set(led, "proposals", led.proposals.filter((p) => (p.kind === "peace" && p.status === "accepted") || mi - p.at <= COMPACT.proposalKeepMonths)); J.set(stats, "proposalsPruned", (stats.proposalsPruned ?? 0) + (before - led.proposals.length)); } }
  if (civ.languages) {
    if (!L.keys && mi % 12 === 7 && mi !== L.at) { const live = new Set(); for (const id in civ.groups) for (const co of civ.groups[id].cohorts ?? []) if (co.languageId) live.add(co.languageId); J.set(L, "keys", Object.keys(civ.languages)); J.set(L, "live", live); J.set(L, "i", 0); J.set(L, "at", mi); }
    if (L.keys) { let lp = 0; const end = Math.min(L.keys.length, L.i + COMPACT.langBudget); for (let i = L.i; i < end; i++) { const l = civ.languages[L.keys[i]]; if (l && l.phon && !L.live.has(l.id ?? L.keys[i])) { J.delete(l, "phon"); J.set(l, "phonDropped", true); lp++; } } J.set(L, "i", end); if (end >= L.keys.length) { J.set(L, "keys", null); J.set(L, "live", null); } if (lp) J.set(stats, "languageProfilesPruned", (stats.languageProfilesPruned ?? 0) + lp); }
  }
}
