// V5-M6: 因果グラフ・双方向索引・判断記録の索引。正本は civ.events / civ.decisions（配列）。索引は保存せず、読み込み後に作り直す（毎回の全走査を避けるため増分で更新）。
// 因果は「イベントID」で持つ。タイトル・年月から原因を逆引きしない（改名・同名事件・日時訂正に強い）。
import { RELATIONS, BASES } from "./events.js";
import { invalidateChunks } from "./civ-chunks.js";

export const evMonth = (ev) => ev.date.year * 12 + (ev.date.month - 1);
const idxCache = new WeakMap();
/** 手で原因を編集したときなど、索引を作り直させる（次の問い合わせで全件から再構築） */
export const invalidateGraph = (civ) => { idxCache.delete(civ); invalidateChunks(civ); };
const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

/** 索引（civ ごとに1つ）。civ.events の末尾に増えた分だけを取り込む */
export function graphIndex(civ) {
  let ix = idxCache.get(civ);
  if (!ix || ix.eventsRef !== civ.events || ix.upto > civ.events.length) ix = { eventsRef: civ.events, upto: 0, pos: new Map(), effects: new Map(), byEntity: new Map(), byDecision: new Map(), decUpto: 0, decPos: new Map(), decByActor: new Map(), decByMonth: new Map() }, idxCache.set(civ, ix);
  const E = civ.events;
  for (; ix.upto < E.length; ix.upto++) {
    const ev = E[ix.upto], i = ix.upto; ix.pos.set(ev.eventId, i);
    for (const c of ev.causes) push(ix.effects, c.targetId, { from: ev.eventId, relation: c.relation, basis: c.basis, userEdited: !!c.userEdited });
    const seen = new Set(); for (const p of ev.participants) if (!seen.has(p.entityId)) { seen.add(p.entityId); push(ix.byEntity, p.entityId, i); }
    if (ev.decisionId) push(ix.byDecision, ev.decisionId, i);
  }
  const D = civ.decisions;
  for (; ix.decUpto < D.length; ix.decUpto++) { const d = D[ix.decUpto]; ix.decPos.set(d.decisionId, ix.decUpto); push(ix.decByActor, d.actorId, ix.decUpto); push(ix.decByMonth, d.date.year * 12 + d.date.month - 1, ix.decUpto); }
  return ix;
}
export const getEvent = (civ, id) => { const ix = graphIndex(civ), i = ix.pos.get(id); return i === undefined ? null : civ.events[i]; };
export const getDecision = (civ, id) => { const ix = graphIndex(civ), i = ix.decPos.get(id); return i === undefined ? null : civ.decisions[i]; };

/** 直接の原因（イベントを指すものは本体つきで返す） */
export function causesOf(civ, id) { const ev = getEvent(civ, id); if (!ev) return []; return ev.causes.map((c) => ({ ...c, event: getEvent(civ, c.targetId) })); }
/** 直接の結果（このイベントを原因に挙げたイベント） */
export function consequencesOf(civ, id) { const ix = graphIndex(civ); return (ix.effects.get(id) ?? []).map((r) => ({ ...r, event: getEvent(civ, r.from) })); }
/** ある実体（国家・集団・人物…）が関わったイベント。新しい順、before（イベントID）以前をカーソルにして読む */
export function eventsOfEntity(civ, entityId, { limit = 50, before = null } = {}) {
  const ix = graphIndex(civ), a = ix.byEntity.get(entityId) ?? []; let hi = a.length; if (before) { const p = ix.pos.get(before); if (p !== undefined) { let lo = 0; hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < p) lo = m + 1; else hi = m; } hi = lo; } }
  const out = []; for (let i = hi - 1; i >= 0 && out.length < limit; i--) out.push(civ.events[a[i]]); return out;
}
export const decisionsOfActor = (civ, actorId, { limit = 50, before = null } = {}) => { const ix = graphIndex(civ), a = ix.decByActor.get(actorId) ?? [], out = []; let hi = a.length; if (before != null) { let lo = 0; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < before) lo = m + 1; else hi = m; } hi = lo; } for (let i = hi - 1; i >= 0 && out.length < limit; i--) out.push(civ.decisions[a[i]]); return out; };
/** あるイベントを中心にした局所グラフ（原因側・結果側とも depth まで、ノード上限 maxNodes。切り捨てたら理由を返す） */
export function neighborhood(civ, id, { depth = 2, maxNodes = 60 } = {}) {
  const nodes = new Map(), edges = []; let truncated = null; const root = getEvent(civ, id); if (!root) return { nodes: [], edges: [], truncated: null };
  nodes.set(id, 0); const q = [[id, 0]];
  const add = (nid, d) => { if (nodes.has(nid)) return true; if (nodes.size >= maxNodes) { truncated = `ノード上限 ${maxNodes} に達したため、これより先は表示していません（明示的に広げてください）`; return false; } nodes.set(nid, d); q.push([nid, d]); return true; };
  while (q.length) {
    const [cur, d] = q.shift(); if (d >= depth) continue;
    for (const c of causesOf(civ, cur)) { if (!c.event) continue; if (add(c.targetId, d + 1)) edges.push({ from: cur, to: c.targetId, relation: c.relation, basis: c.basis, userEdited: !!c.userEdited }); }
    for (const r of consequencesOf(civ, cur)) { if (!r.event) continue; if (add(r.from, d + 1)) edges.push({ from: r.from, to: cur, relation: r.relation, basis: r.basis, userEdited: r.userEdited }); }
  }
  return { nodes: [...nodes.keys()].map((n) => getEvent(civ, n)), edges, truncated };
}
/** 改名・日時訂正（IDは変えない）。名称履歴を残す */
export function renameEvent(civ, id, title) { const ev = getEvent(civ, id); if (!ev) throw new Error("イベントが存在しません"); (ev.titleHistory ??= []).push(ev.title); ev.title = title; invalidateChunks(civ); return ev; }
/** ユーザーが編集した因果。シミュレーションが生成した原因は上書き・削除しない（userEdited の分だけ操作できる） */
export function editCause(civ, eventId, op, { targetId, relation = "related_to", basis = "unknown" } = {}) {
  const ev = getEvent(civ, eventId); if (!ev) throw new Error("イベントが存在しません");
  if (op === "add") { if (!RELATIONS.includes(relation) || !BASES.includes(basis)) throw new Error("関係または根拠が不正です"); if (!getEvent(civ, targetId)) throw new Error("原因のイベントが存在しません"); if (ev.causes.some((c) => c.targetId === targetId && c.relation === relation)) throw new Error("すでにあります"); ev.causes.push({ targetId, relation, basis, userEdited: true }); invalidateGraph(civ); return true; }
  if (op === "remove") { const i = ev.causes.findIndex((c) => c.targetId === targetId && c.relation === relation); if (i < 0) throw new Error("その因果はありません"); if (!ev.causes[i].userEdited) throw new Error("シミュレーションが生成した因果は削除できません"); ev.causes.splice(i, 1); invalidateGraph(civ); return true; }
  throw new Error("未知の操作");
}
/** 直近の関連イベント（自動で原因を付けるときの探索）。entityIds のどれかが関わり、kinds に当たり、window か月以内。新しい順 */
export function recentEventsFor(civ, entityIds, kinds, window, limit = 2) {
  const ix = graphIndex(civ), now = civ.monthIndex, out = [], seen = new Set();
  for (const e of entityIds) { const a = ix.byEntity.get(e); if (!a) continue; for (let i = a.length - 1; i >= 0; i--) { const ev = civ.events[a[i]]; if (now - evMonth(ev) > window) break; if (kinds.includes(ev.kind) && !seen.has(ev.eventId)) { seen.add(ev.eventId); out.push(ev); } } }
  out.sort((x, y) => evMonth(y) - evMonth(x) || (x.eventId < y.eventId ? 1 : -1)); return out.slice(0, limit);
}
/** 原因の候補をそのまま cause 配列へ（関係と根拠は呼び出し側が決める） */
export const asCauses = (events, relation, basis) => events.map((e) => ({ targetId: e.eventId, relation, basis }));

/** 整合性: 参照切れ（原因・判断・判断結果のイベントID）が無いこと。fullなら全件 */
export function checkGraph(civ) {
  const errs = [], ix = graphIndex(civ);
  for (const ev of civ.events) {
    for (const c of ev.causes) { if (!RELATIONS.includes(c.relation)) errs.push(`未知の関係 ${ev.eventId}`); if (!BASES.includes(c.basis)) errs.push(`未知の根拠 ${ev.eventId}`); if (/^event_/.test(c.targetId) && !ix.pos.has(c.targetId)) errs.push(`原因の参照切れ ${ev.eventId}→${c.targetId}`); }
    if (ev.decisionId && !ix.decPos.has(ev.decisionId)) errs.push(`判断の参照切れ ${ev.eventId}→${ev.decisionId}`);
  }
  for (const d of civ.decisions) for (const e of d.result?.eventIds ?? []) if (e && !ix.pos.has(e)) errs.push(`判断結果のイベント参照切れ ${d.decisionId}→${e}`);
  return errs;
}
