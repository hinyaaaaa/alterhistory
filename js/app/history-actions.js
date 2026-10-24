// V5-M10: 歴史ビューアの問い合わせ（検索・一覧・詳細・過去の閲覧）。DOM を持たない（画面は ui/history-window.js）。
//   ・一覧はすべて「位置＋件数」または「カーソル（イベントID）」で読む。全件を一度に返さない。
//   ・過去の月を見ている間は読み取り専用（civ-actions が命令と時間送りを止める）。値は月次履歴（history.js）から復元したもの。
import { graphIndex, getEvent, causesOf, consequencesOf, neighborhood, eventsOfEntity, decisionsOfActor, evMonth } from "../core/civ/graph.js";
import { stateAt, statesAt, groupsAt, ownerMapAt, compositionAt } from "../core/civ/history.js";
import { territoryOf } from "../core/civ/population.js";
import { expandDecision } from "../core/civ/ai.js";
import { TECHS } from "../core/civ/tech.js";

export const WAR_FAMILY_GAP = 120; // 月。同じ国家が関わり、前の戦争の終結から10年以内に始まった戦争は同じ「戦争ファミリー」
const colorOf = (id) => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); const hue = (h >>> 0) % 360; return `hsl(${hue} ${55 + ((h >>> 9) % 30)}% ${50 + ((h >>> 17) % 18)}%)`; };
export { colorOf };

export function createHistoryActions({ store, civActions }) {
  const mapOf = () => store.getState().map, civOf = () => mapOf()?.civ ?? null;
  let view = null; civActions?.setPastGuard?.(() => view != null); const cache = new Map(); const listeners = new Set(); const notify = () => { for (const f of listeners) f(); };
  const memo = (key, build) => { const civ = civOf(), k = `${civ?.events.length}:${civ?.monthIndex}:${view}:${key}`; if (cache.has(k)) return cache.get(k); if (cache.size > 40) cache.clear(); const v = build(); cache.set(k, v); return v; };
  const viewMi = () => (view == null ? civOf()?.monthIndex : view);
  const A = {
    subscribe: (f) => { listeners.add(f); return () => listeners.delete(f); },
    has: () => !!civOf()?.history,
    meta() { const civ = civOf(); if (!civ) return null; const H = civ.history; let first = civ.monthIndex; if (H) for (const id in H.states) first = Math.min(first, H.states[id].from); return { first, now: civ.monthIndex, view, past: view != null, groups: Object.keys(civ.groups).length, states: Object.keys(civ.states).length, events: civ.events.length, decisions: civ.decisions.length }; },
    /** 過去の月を見る（null で現在へ戻る）。過去の間は読み取り専用 */
    setView(mi) { const civ = civOf(); if (!civ) return; view = mi == null || mi >= civ.monthIndex ? null : Math.max(A.meta().first, Math.floor(mi)); cache.clear(); notify(); },
    isPast: () => view != null,
    viewMonth: () => viewMi(),
    /** 国家の一覧（現在 or 過去の月）。sort: pop|formed|name。filter: alive|dead|all */
    listStates({ query = "", sort = "pop", filter = "alive", offset = 0, limit = 40 } = {}) {
      const civ = civOf(); if (!civ) return { total: 0, rows: [] }; const q = query.trim();
      const all = memo(`states:${q}:${sort}:${filter}`, () => {
        let rows = view == null ? Object.values(civ.states).map((s) => ({ id: s.id, name: s.name, polity: s.polity, via: s.via, alive: s.alive, player: s.player, pop: Math.round(s.pop), stability: s.stability, formedAt: s.formedAt, wars: s.warIds.length })) : statesAt(civ, view).map((s) => ({ id: s.id, name: s.name, polity: s.polity, via: s.via, alive: s.alive, player: s.player, pop: s.pop, stability: s.stability, formedAt: civ.states[s.id].formedAt, wars: s.warIds.length }));
        rows = rows.filter((r) => (filter === "all" || (filter === "alive") === r.alive) && (!q || r.name.includes(q) || r.id.includes(q)));
        rows.sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name, "ja") : sort === "formed" ? (a, b) => a.formedAt - b.formedAt || (a.id < b.id ? -1 : 1) : (a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)); return rows;
      });
      return { total: all.length, rows: all.slice(offset, offset + limit) };
    },
    /** 国家の詳細（見ている月の状態）。過去は月次履歴から復元 */
    stateDetail(id) {
      const civ = civOf(); const s = civ?.states[id]; if (!s) return null; const m = viewMi(), x = stateAt(civ, id, m); if (!x) return { id, name: s.name, notYet: true, formedAt: s.formedAt, month: m };
      const cur = view == null; const names = (ids) => ids.map((i) => ({ id: i, name: civ.states[i]?.name ?? i }));
      return { id, month: m, name: x.name, alive: x.alive, polity: x.polity, via: x.via, leader: x.leader, pop: x.pop, treasury: x.treasury, stability: x.stability, army: x.army, settlements: x.settlements, groupCount: x.groupCount, policy: x.policy, strategy: x.strategy, campaign: x.campaign, player: x.player,
        relations: Object.entries(x.relations).map(([k, v]) => ({ id: k, name: civ.states[k]?.name ?? k, value: v })).sort((a, b) => b.value - a.value), techs: x.techAdopted.map((k) => ({ key: k, name: TECHS.find((t) => t.key === k)?.name ?? k })), wars: x.warIds.map((w) => ({ id: w, name: warName(civ, w) })),
        composition: compositionAt(civ, id, Math.floor(m / 120) * 120), magicPower: x.magicPower ?? 0, resilience: x.resilience ?? 0, formedAt: s.formedAt, dissolvedAt: s.dissolvedAt ?? null, predecessor: s.predecessor ? names([s.predecessor])[0] : null, current: cur, interpretations: cur ? (s.interp ?? []).length : null, neighbors: null };
    },
    /** 戦争。families=true なら戦争ファミリー（同じ国家が関わる戦争の連なり）でまとめる */
    warFamilies() { const civ = civOf(); return civ ? memo("warfam", () => buildFamilies(civ)) : []; },
    listWars({ query = "", offset = 0, limit = 40 } = {}) { const q = query.trim(), fam = A.warFamilies().filter((f) => !q || f.title.includes(q)); return { total: fam.length, rows: fam.slice(offset, offset + limit) }; },
    warDetail(id) { const civ = civOf(), w = civ?.wars[id]; if (!w) return null; return { id, name: warName(civ, id), status: w.status, startedAt: w.startedAt, endedAt: w.endedAt ?? null, outcome: w.outcome ?? null, score: w.score, casualties: w.casualties, sides: { a: w.sides.a.map((s) => ({ id: s, name: civ.states[s]?.name ?? s })), d: w.sides.d.map((s) => ({ id: s, name: civ.states[s]?.name ?? s })) }, events: (graphIndex(civ).byEntity.get(id) ?? []).map((i) => civ.events[i]) }; },
    /** イベント（新しい順・カーソル）。entityId で関わった実体、kind で種類、query でタイトルを絞る。見ている月より後は出さない */
    listEvents({ entityId = null, kind = null, query = "", before = null, limit = 50 } = {}) {
      const civ = civOf(); if (!civ) return { rows: [], next: null }; const q = query.trim(), lim = viewMi(), ok = (e) => evMonth(e) <= lim && (!kind || e.kind === kind) && (!q || e.title.includes(q)), rows = [];
      if (entityId) { let cur = before; for (;;) { const page = eventsOfEntity(civ, entityId, { limit: 200, before: cur }); if (!page.length) break; for (const e of page) { if (ok(e)) rows.push(e); if (rows.length >= limit) break; } if (rows.length >= limit) break; cur = page.at(-1).eventId; } }
      else { const ix = graphIndex(civ); let i = before ? (ix.pos.get(before) ?? civ.events.length) - 1 : civ.events.length - 1; for (; i >= 0 && rows.length < limit; i--) if (ok(civ.events[i])) rows.push(civ.events[i]); }
      return { rows, next: rows.length >= limit ? rows.at(-1).eventId : null };
    },
    eventDetail(id) { const civ = civOf(), e = civ && getEvent(civ, id); if (!e) return null; return { event: e, causes: causesOf(civ, id), consequences: consequencesOf(civ, id), decision: e.decisionId ? civ.decisions[graphIndex(civ).decPos.get(e.decisionId)] ?? null : null, graph: neighborhood(civ, id, { depth: 2, maxNodes: 40 }) }; },
    listDecisions(actorId, { before = null, limit = 30 } = {}) { const civ = civOf(); if (!civ) return { rows: [], next: null }; const lim = viewMi(); const rows = decisionsOfActor(civ, actorId, { limit: limit * 2, before }).filter((d) => d.date.year * 12 + d.date.month - 1 <= lim).slice(0, limit); return { rows, next: rows.length >= limit ? graphIndex(civ).decPos.get(rows.at(-1).decisionId) : null }; },
    decisionDetail(id) { const civ = civOf(), ix = civ && graphIndex(civ), i = ix?.decPos.get(id); return i == null ? null : expandDecision(civ, civ.decisions[i]); },
    /** 全体の検索（国家・人物・戦争・文化・イベント）。前方一致を先に、最大 limit 件 */
    search(text, limit = 40) {
      const civ = civOf(), q = text.trim(); if (!civ || !q) return []; const out = [], push = (type, id, name, extra = "") => { const i = name.indexOf(q); if (i >= 0) out.push({ type, id, name, extra, score: i === 0 ? 0 : 1 }); };
      for (const s of Object.values(civ.states)) push("state", s.id, s.name, s.alive ? "存続中" : "滅亡"); for (const p of Object.values(civ.persons)) push("person", p.id, p.name, "魔法の素質者"); for (const c of Object.values(civ.cultures)) push("culture", c.id, c.name); for (const r of Object.values(civ.religions)) push("religion", r.id, r.name);
      for (const w of Object.values(civ.wars)) push("war", w.id, warName(civ, w.id), `${Math.floor(w.startedAt / 12)}年`);
      const lim = viewMi(); for (let i = civ.events.length - 1; i >= 0 && out.length < limit * 3; i--) { const e = civ.events[i]; if (evMonth(e) <= lim) push("event", e.eventId, e.title, `${e.date.year}年${e.date.month}月`); }
      out.sort((a, b) => a.score - b.score); return out.slice(0, limit);
    },
    /** 歴史地図: 見ている月のセルの持ち主（国家ID）と国家の色 */
    territory() { const civ = civOf(), w = mapOf()?.world; if (!civ || !w) return { owner: new Map(), states: [] }; return memo("terr", () => { const m = viewMi(), owner = ownerMapAt(civ, territoryOf, w, m), ids = [...new Set(owner.values())]; return { owner, states: ids.map((id) => ({ id, name: civ.states[id]?.name ?? id, color: colorOf(id) })), month: m }; }); },
    stateCells(id) { const t = A.territory(), out = []; for (const [c, o] of t.owner) if (o === id) out.push(c); return out; },
    /** 時間帯のイベント（下端の年表帯。上限つき）。重要な種類だけ */
    band({ from, to, limit = 200 }) { const civ = civOf(); if (!civ) return []; const KEY = new Set(["state_formed", "state_dissolved", "war_declared", "war_ended", "disaster_struck", "climate_shift", "tech_discovered", "magic_org_founded", "religion_founded"]); const out = []; for (const e of civ.events) { const m = evMonth(e); if (m > to) break; if (m >= from && KEY.has(e.kind)) { out.push(e); if (out.length >= limit) break; } } return out; },
  };
  return A;
}
function warName(civ, id) { const w = civ.wars[id]; return w ? `${civ.states[w.aggressor]?.name ?? "?"}対${civ.states[w.defender]?.name ?? "?"}` : id; }
function buildFamilies(civ) {
  const ws = Object.values(civ.wars).sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : 1)), fams = [];
  for (const w of ws) { const ps = new Set([...w.sides.a, ...w.sides.d]); let f = fams.find((x) => w.startedAt - x.lastEnd <= WAR_FAMILY_GAP && [...ps].some((p) => x.states.has(p))); if (!f) fams.push((f = { states: new Set(), wars: [], lastEnd: -Infinity })); f.wars.push(w.id); for (const p of ps) f.states.add(p); f.lastEnd = Math.max(f.lastEnd, w.endedAt ?? civ.monthIndex); }
  return fams.map((f, i) => { const w0 = civ.wars[f.wars[0]], names = [...f.states].slice(0, 3).map((s) => civ.states[s]?.name ?? s).join("・"); return { id: `warfam_${i}`, title: `${names}${f.states.size > 3 ? "ほか" : ""}の戦争${f.wars.length > 1 ? `（${f.wars.length}戦）` : ""}`, startedAt: w0.startedAt, endedAt: f.lastEnd, wars: f.wars.map((id) => ({ id, name: warName(civ, id), startedAt: civ.wars[id].startedAt, endedAt: civ.wars[id].endedAt ?? null, outcome: civ.wars[id].outcome ?? null })) }; });
}
