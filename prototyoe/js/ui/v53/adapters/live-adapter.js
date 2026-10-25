// v5.3 UI ⇔ 既存本体の接続（読み取り中心）。contract.js の形を、現行の store / civActions / history-actions / timeActions / actions で実装する。
//   ・本体のシミュレーション・保存処理・描画は変更しない。呼ぶだけ（時間送り・国家の行動・世界生成・ファイル書き出しは既存関数に委ねる）
//   ・v5.2 で履歴の保存形式や地図の描画基盤が変わっても、直すのはこのファイルだけ（UI 側は契約だけを見る）
//   ・依存は注入。main.js の deps からそのまま渡せる:  createLiveAdapter({ store, civActions, history, timeActions, actions, groupActions, ... })
import { POLITY, VIA } from "../../../core/civ/states.js";
import { TECHS } from "../../../core/civ/tech.js";
import { SUBSISTENCE } from "../../../core/civ/population.js";
import { evMonth, getEvent } from "../../../core/civ/graph.js";
import { cellRaster } from "../../../core/world/cell-raster.js";
import { LAYERS, isLayerOn } from "../../../app/layers.js";
import { viewToRenderOptions } from "../../../render/options.js";
import { DEFAULT_ANNOTATIONS } from "../../../render/layers/annotations.js";
import { buildChronicle, chronicleToMarkdown } from "../../../io/chronicle.js";
import { saveMapBytes } from "../../../io/ahmap-file.js";
import { renderMapToCanvas, canvasToPngBlob, exportFileName, todayString } from "../../../io/exporter.js";
import { obsidianFiles, estimateVault } from "../../../io/obsidian.js";
import { zipFiles } from "../../../io/zip.js";
import { splitIntoParts, DEFAULT_PART_BYTES, DEFAULT_PART_FILES } from "../export/obsidian-split.js";
import { civChronicleChunks } from "../export/civ-chronicle.js";
import { describePng, withCaption } from "../export/png-meta.js";
import { fmtMonth, fmtNum, fmtPct } from "../format.js";
import { categoryOf } from "../categories.js";

const SHOWN_LAYERS = ["states", "cultures", "religions", "biomes", "heights", "borders", "rivers", "burgs"];
const REL_JA = { caused_by: "原因", contributed_to: "寄与", reaction_to: "反応", enabled_by: "前提", part_of: "一部", succeeded_by: "後継", influenced_by: "影響", related_to: "関連" };
const BASIS_JA = { direct: "直接", strong: "強い根拠", plausible: "もっともらしい", contested: "異論あり", unknown: "不明" };
const OUTCOME_JA = { aggressor_victory: "攻撃側の勝利", defender_victory: "防衛側の勝利", negotiated: "講和", stalemate: "膠着", state_dissolved: "国家の消滅" };
const TREATY_JA = { nonaggression: "不可侵条約", alliance: "同盟", trade: "通商条約", defense: "防衛協定", vassal: "従属関係", tribute: "朝貢" };
const FORMATION_CONDITIONS = {
  city_state: ["町・都市の段階の集落がある", "海岸か川の近くにある"],
  agri_union: ["農耕の集落が 3 つ以上ある", "それらの人口が合わせて 3,000 以上"],
  religious_polity: ["同じ宗教を信じる集落が 2 つ以上ある", "それらの人口が合わせて 1,500 以上"],
  nomad_confederation: ["牧畜の集団が 3 つ以上ある", "それらの人口が合わせて 1,500 以上"],
  defense_league: ["異なる文化の集団が近くにある", "近くに、はるかに大きな国家（脅威）がある"],
};
const ENTITY_KIND = (id) => { const p = String(id).split("_")[0]; return p === "state" || p === "war" || p === "event" || p === "treaty" || p === "decision" ? p : null; };

export function createLiveAdapter({ store, civActions, history, timeActions, actions, groupActions = null, createCanvas = null, appVersion = "", openFileDialog = null, editMap = null, now = () => Date.now(), eventChunk = 2000 }) {
  const mapOf = () => store.getState().map, civOf = () => mapOf()?.civ ?? null, worldOf = () => mapOf()?.world ?? null;
  const subs = new Set(); let runGuard = null;
  const viewMi = () => (history.isPast() ? history.viewMonth() : null);
  const stateName = (id) => civOf()?.states[id]?.name ?? String(id);
  const warTitle = (w) => `${stateName(w.aggressor)}対${stateName(w.defender)}`;
  const aliveStates = (civ) => Object.values(civ.states).filter((s) => s.alive);

  // ---- 変更通知: 画面に関係する値が変わったときだけ ----
  let sig = "";
  const signature = () => { const s = store.getState(), c = s.map?.civ, v = s.view; return [!!s.map, !!s.map?.world, c?.monthIndex, c?.events.length, c ? Object.keys(c.states).length : 0, c?.activeWarIds.length, history.isPast() ? history.viewMonth() : "-", s.timeRunning, s.map?.world?.entities?.start?.groupId, c?.proposals.length, SHOWN_LAYERS.map((k) => isLayerOn(v, k) ? 1 : 0).join("")].join("|"); };
  const emit = () => { for (const f of subs) f(); };
  const onChange = () => { const n = signature(); if (n !== sig) { sig = n; metaCache = null; emit(); } };
  store.subscribe(onChange); history.subscribe(() => { sig = ""; metaCache = null; onChange(); });

  let metaCache = null;
  function meta() {
    const m = mapOf(), civ = civOf(), key = `${signature()}`;
    if (metaCache?.key === key) return metaCache.v;
    let v;
    if (!m) v = { hasWorld: false, hasCiv: false, name: "", cells: 0, first: 0, now: 0, view: null, past: false, states: 0, wars: 0, events: 0, population: 0, land: 1 };
    else {
      const w = m.world, hm = civ ? history.meta() : null, al = civ ? aliveStates(civ) : [];
      v = { hasWorld: !!w, hasCiv: !!civ, name: m.meta?.name || store.getState().fileName?.replace(/\.[^.]+$/, "") || "", cells: w ? (w.mesh?.cellCount ?? w.cell?.biome?.length ?? 0) : 0,
        first: hm?.first ?? 0, now: civ?.monthIndex ?? 0, view: viewMi(), past: history.isPast(), states: al.length, wars: civ?.activeWarIds.length ?? 0, events: civ?.events.length ?? 0,
        population: al.reduce((a, s) => a + s.pop, 0), land: 1 };
    }
    metaCache = { key, v }; return v;
  }

  // ---- 一覧 ----
  const warRows = () => { const civ = civOf(); if (!civ) return []; const m = viewMi() ?? civ.monthIndex; return Object.values(civ.wars).filter((w) => w.startedAt <= m).sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? 1 : -1)).map((w) => ({ w, ended: w.endedAt != null && w.endedAt <= m })); };
  const eventIdx = { key: "", total: 0, chunks: [null], at: 0 };
  const CHUNK = eventChunk;
  function eventIndex(query, kind = "") { // 新しい順。chunk ごとのカーソルを持ち、オフセットから近い位置を読む
    const civ = civOf(), key = `${viewMi()}|${query}|${kind}`;
    if (eventIdx.key === key && (now() - eventIdx.at < 1000 || eventIdx.evs === civ.events.length)) return eventIdx;
    let cur = null, total = 0; const chunks = [null];
    for (;;) { const r = history.listEvents({ query, kind: kind || null, before: cur, limit: CHUNK }); total += r.rows.length; if (!r.next) break; cur = r.next; chunks.push(cur); }
    Object.assign(eventIdx, { key, total, chunks, at: now(), evs: civ.events.length }); return eventIdx;
  }
  function eventRow(e) { const c = categoryOf(e.kind); return { id: e.eventId, title: e.title, sub: fmtMonth(evMonth(e)), tag: c.label, tone: c.tone }; }

  function list(kind, { query = "", filter = "", sort = "", offset = 0, limit = 40 } = {}) {
    const civ = civOf(); if (!civ) return { total: 0, rows: [] };
    const q = query.trim();
    if (kind === "state") {
      const r = history.listStates({ query: q, sort: sort || "pop", filter: filter === "dead" ? "dead" : "alive", offset, limit });
      return { total: r.total, rows: r.rows.map((s) => ({ id: s.id, title: s.name, sub: `${POLITY[s.polity] ?? s.polity}・人口 ${fmtNum(s.pop)}`, tag: s.player ? "プレイヤー" : "", tone: s.player ? "accent" : "", pop: s.pop })) };
    }
    if (kind === "war") {
      let rows = warRows().filter(({ w, ended }) => (filter === "active" ? !ended : filter === "ended" ? ended : true) && (!q || warTitle(w).includes(q)));
      const total = rows.length; rows = rows.slice(offset, offset + limit);
      return { total, rows: rows.map(({ w, ended }) => ({ id: w.id, title: warTitle(w), sub: `${fmtMonth(w.startedAt)}〜${ended ? fmtMonth(w.endedAt) : "継続中"}`, tag: ended ? "終結" : "戦争中", tone: ended ? "" : "danger" })) };
    }
    if (kind === "event") {
      const ix = eventIndex(q, "");
      // 分類（filter）は種類の集合なので、画面側で絞る: 分類が選ばれたときは全件をたどって絞る（上限つき）
      if (filter) {
        const out = []; let cur = null, scanned = 0;
        for (;;) { const r = history.listEvents({ query: q, before: cur, limit: 4000 }); for (const e of r.rows) if (categoryOf(e.kind).id === filter) out.push(e); scanned += r.rows.length; if (!r.next || out.length >= 50000) break; cur = r.next; }
        return { total: out.length, rows: out.slice(offset, offset + limit).map(eventRow) };
      }
      if (offset >= ix.total) return { total: ix.total, rows: [] };
      const c = Math.floor(offset / CHUNK), start = c * CHUNK, r = history.listEvents({ query: q, before: ix.chunks[Math.min(c, ix.chunks.length - 1)], limit: offset - start + limit });
      return { total: ix.total, rows: r.rows.slice(offset - start).map(eventRow) };
    }
    if (kind === "treaty") {
      let rows = Object.values(civ.treaties ?? {}).filter((t) => t.active).map((t) => ({ id: t.id, title: `${stateName(t.a)}と${stateName(t.b)}の${TREATY_JA[t.type] ?? t.type}`, sub: `${fmtMonth(t.since ?? t.signedAt ?? 0)}〜`, tag: TREATY_JA[t.type] ?? "条約" }));
      if (q) rows = rows.filter((r) => r.title.includes(q)); return { total: rows.length, rows: rows.slice(offset, offset + limit) };
    }
    if (kind === "tech") { let rows = TECHS.map((t) => ({ id: `tech_${t.key}`, title: t.name, sub: `${aliveStates(civ).filter((s) => s.techAdopted?.[t.key] != null).length} 国が採用`, tag: `段階 ${t.tier ?? ""}` })); if (q) rows = rows.filter((r) => r.title.includes(q)); return { total: rows.length, rows: rows.slice(offset, offset + limit) }; }
    if (kind === "culture") {
      let rows = [...Object.values(civ.cultures ?? {}).map((c) => ({ id: `culture_${c.id}`, title: c.name, sub: "文化", tag: "文化" })), ...Object.values(civ.religions ?? {}).map((c) => ({ id: `religion_${c.id}`, title: c.name, sub: "宗教", tag: "宗教" })), ...Object.values(civ.languages ?? {}).map((c) => ({ id: `language_${c.id}`, title: c.name, sub: "言語", tag: "言語" }))];
      if (q) rows = rows.filter((r) => r.title.includes(q)); return { total: rows.length, rows: rows.slice(offset, offset + limit) };
    }
    if (kind === "magic") { let rows = Object.values(civ.magic?.orgs ?? {}).map((o) => ({ id: `magic_${o.id}`, title: o.name, sub: "魔法組織", tag: "魔法" })); if (q) rows = rows.filter((r) => r.title.includes(q)); return { total: rows.length, rows: rows.slice(offset, offset + limit) }; }
    return { total: 0, rows: [], unsupported: true }; // economy など: v5.4 の集計モデルで接続
  }

  // ---- 詳細（正規化） ----
  const noticeFor = () => (history.isPast() ? `${fmtMonth(history.viewMonth())}の状態（月次履歴から復元・読み取り専用）` : null);
  function detail(kind, id) {
    const civ = civOf(); if (!civ) return null;
    if (kind === "state") {
      const x = history.stateDetail(id); if (!x) return null;
      return { kind, id, title: x.name, subtitle: `${POLITY[x.polity] ?? x.polity}・成立 ${fmtMonth(x.formedAt)}`, tag: !x.alive ? "滅亡" : x.player ? "プレイヤー国家" : "存続中", tone: !x.alive ? "danger" : "accent",
        summary: !x.alive ? `${fmtMonth(x.dissolvedAt)}に滅亡した。` : `${x.name}は${POLITY[x.polity] ?? x.polity}（成立の経路: ${VIA[x.via]?.ja ?? x.via}）。${x.wars.length ? `現在 ${x.wars.length} 件の戦争に関わっている。` : "現在、戦争には関わっていない。"}`,
        stats: [{ label: "人口", value: fmtNum(x.pop) }, { label: "安定度", value: fmtPct(x.stability), tone: x.stability < 0.3 ? "danger" : "" }, { label: "国庫", value: fmtNum(x.treasury) }, { label: "兵力", value: fmtNum(x.army) }, { label: "集落", value: String(x.settlements ?? "—") }, { label: "戦争", value: String(x.wars.length), tone: x.wars.length ? "danger" : "" }],
        related: [...x.wars.map((w) => ({ kind: "war", id: w.id, label: w.name, relation: "戦争中" })), ...x.relations.slice(0, 4).map((r) => ({ kind: "state", id: r.id, label: r.name, relation: "友好" })), ...x.relations.slice(-3).filter((r) => r.value < 0).map((r) => ({ kind: "state", id: r.id, label: r.name, relation: "敵対" }))],
        events: history.listEvents({ entityId: id, limit: 6 }).rows.map((e) => ({ id: e.eventId, month: evMonth(e), title: e.title, kind: e.kind })), notice: noticeFor() };
    }
    if (kind === "war") {
      const w = history.warDetail(id); if (!w) return null; const m = viewMi() ?? civ.monthIndex, ended = w.endedAt != null && w.endedAt <= m;
      const nm = (arr) => arr.map((s) => s.name).join("・");
      return { kind, id, title: w.name, subtitle: `${fmtMonth(w.startedAt)}〜${ended ? fmtMonth(w.endedAt) : "継続中"}`, tag: ended ? "終結" : "戦争中", tone: ended ? "" : "danger",
        summary: ended ? `結果: ${OUTCOME_JA[w.outcome] ?? w.outcome ?? "—"}` : "戦争は続いている。",
        progress: [{ label: "準備", state: "done" }, { label: "戦況", state: ended ? "done" : "now" }, { label: "講和", state: ended ? "done" : "todo" }],
        stats: [{ label: "攻撃側", value: nm(w.sides.a) }, { label: "防衛側", value: nm(w.sides.d) }, { label: "損害", value: w.casualties != null ? `${fmtNum(typeof w.casualties === "number" ? w.casualties : Object.values(w.casualties).reduce((a, b) => a + b, 0))} 人` : "—" }, { label: "経過", value: `${Math.max(0, (ended ? w.endedAt : m) - w.startedAt)} か月` }],
        related: [...w.sides.a.map((s) => ({ kind: "state", id: s.id, label: s.name, relation: "攻撃側" })), ...w.sides.d.map((s) => ({ kind: "state", id: s.id, label: s.name, relation: "防衛側" }))],
        events: w.events.filter((e) => evMonth(e) <= m).slice(-8).reverse().map((e) => ({ id: e.eventId, month: evMonth(e), title: e.title, kind: e.kind })), notice: noticeFor() };
    }
    if (kind === "event") {
      const d = history.eventDetail(id); if (!d) return null; const e = d.event, c = categoryOf(e.kind);
      const who = e.participants.filter((p) => ENTITY_KIND(p.entityId)).slice(0, 12);
      const related = [...who.map((p) => ({ kind: ENTITY_KIND(p.entityId), id: p.entityId, label: ENTITY_KIND(p.entityId) === "state" ? stateName(p.entityId) : ENTITY_KIND(p.entityId) === "war" ? (civ.wars[p.entityId] ? warTitle(civ.wars[p.entityId]) : p.entityId) : p.entityId, relation: `関与（${p.role}）` })),
        ...d.causes.filter((x) => x.event).map((x) => ({ kind: "event", id: x.targetId, label: x.event.title, relation: `原因（${REL_JA[x.relation] ?? x.relation}・${BASIS_JA[x.basis] ?? x.basis}）` })),
        ...d.consequences.filter((x) => x.event).slice(0, 12).map((x) => ({ kind: "event", id: x.from, label: x.event.title, relation: "結果・後続" })),
        ...(d.decision ? [{ kind: "decision", id: d.decision.decisionId, label: `AI判断: ${d.decision.type}`, relation: "背景の判断" }] : [])];
      const noCause = !d.causes.length;
      return { kind, id, title: e.title, subtitle: fmtMonth(evMonth(e)), tag: c.label, tone: c.tone,
        summary: noCause ? "記録された先行事象はありません（環境・状態・主体の判断・確率的な条件による出来事）。" : `原因として ${d.causes.length} 件の関連が記録されています。`,
        stats: [{ label: "種類", value: e.kind }, { label: "関与", value: String(e.participants.length) }, { label: "原因", value: String(d.causes.length) }, { label: "後続", value: String(d.consequences.length) }], related, events: [] };
    }
    if (kind === "decision") {
      const x = history.decisionDetail(id); if (!x) return null;
      return { kind, id, title: `判断: ${x.type}`, subtitle: fmtMonth(x.date.year * 12 + x.date.month - 1), tag: x.layer, summary: `${stateName(x.actorId)}の判断。選択: ${x.chosen?.key ?? "何もしない"}${x.result ? `（結果: ${x.result.ok ? "成功" : x.result.error}）` : ""}`,
        stats: x.candidates.slice(0, 8).map((c) => ({ label: c.key, value: c.eligible ? String(Math.round((c.total ?? 0) * 100) / 100) : `不可（${c.reason ?? "—"}）`, tone: c.key === x.chosen?.key ? "warn" : "" })),
        related: [{ kind: "state", id: x.actorId, label: stateName(x.actorId), relation: "主体" }], events: [] };
    }
    const row = list(kind, { limit: 1e6 }).rows.find((r) => String(r.id) === String(id));
    return row ? { kind, id, title: row.title, subtitle: row.sub, tag: row.tag, summary: kind === "tech" ? "技術の詳細（前提・実用化・普及）は v5.4 の技術モデルで接続されます。" : "", stats: [], related: [], events: [] } : null;
  }

  // ---- 操作（プレイヤー国家の行動） ----
  const optionsCache = { key: "", v: [] };
  function playerOptions(stateId) {
    const o = civActions.playerStateOptions?.(); if (!o || o.state.id !== stateId) return [];
    const list = o.options.map((op, i) => ({ ...op, i })).sort((a, b) => Number(b.eligible) - Number(a.eligible)).slice(0, 14);
    optionsCache.key = stateId; optionsCache.v = list; return list;
  }
  const actions_ = (kind, id) => (kind !== "state" ? [] : playerOptions(id).map((op) => ({ id: `${op.action}|${op.target ?? ""}|${op.opt ?? ""}`, label: op.label, enabled: !!op.eligible, reason: op.reason ?? "" })));
  function runAction(kind, id, actionId) {
    if (history.isPast()) return { ok: false, error: "過去を閲覧中は操作できません（読み取り専用）" };
    const op = playerOptions(id).find((o) => `${o.action}|${o.target ?? ""}|${o.opt ?? ""}` === actionId);
    if (!op) return { ok: false, error: "この操作は、いまは実行できません" };
    const r = civActions.stateAction(id, op.action, op.target ?? null, op.opt ?? null); return r?.ok ? { ok: true } : { ok: false, error: r?.error ?? "実行できませんでした" };
  }

  // ---- 新しい出来事（通知） ----
  let cursor = { civ: null, n: 0 };
  function impactOf(civ, e, worldPop) {
    const sts = e.participants.filter((p) => civ.states[p.entityId]).map((p) => civ.states[p.entityId]);
    const actorPop = sts.reduce((a, s) => a + (s.alive ? s.pop : 0), 0);
    const groupsOf = (role) => e.participants.filter((p) => p.role === role).map((p) => civ.groups[p.entityId]).filter(Boolean);
    const exposed = groupsOf("affected").reduce((a, g) => a + g.pop, 0);
    const changedGroups = (e.effects ?? []).filter((f) => f.property === "stateId").length;
    return { popLossShare: worldPop ? (exposed * 0.5) / worldPop : 0, // 暫定: 被災集団の人口の半分を被害の目安にする（係数は長期統計で調整）
      territoryShare: changedGroups / Math.max(1, Object.keys(civ.groups).length), actorPopShare: worldPop ? actorPop / worldPop : 0, actorCount: sts.length, ripple: Math.min(5, (e.effects ?? []).length), player: sts.some((s) => s.player) };
  }
  function newEvents() {
    const civ = civOf(); if (!civ) { cursor = { civ: null, n: 0 }; return []; }
    if (cursor.civ !== civ || cursor.n > civ.events.length) cursor = { civ, n: civ.events.length };
    if (history.isPast() || cursor.n === civ.events.length) return [];
    const fresh = civ.events.slice(cursor.n); cursor.n = civ.events.length;
    const worldPop = aliveStates(civ).reduce((a, s) => a + s.pop, 0);
    return fresh.map((e) => { const cause = e.causes.map((c) => getEvent(civ, c.targetId)).find(Boolean); return { id: e.eventId, month: evMonth(e), kind: e.kind, title: e.title, detail: "", causeText: cause ? `「${cause.title}」を受けて` : "", actors: e.participants.filter((p) => civ.states[p.entityId]).map((p) => ({ kind: "state", id: p.entityId, name: civ.states[p.entityId].name })), impact: impactOf(civ, e, worldPop) }; });
  }

  const band = ({ from, to, limit = 400 }) => history.band({ from, to, limit }).map((e) => ({ id: e.eventId, month: evMonth(e), kind: e.kind, title: e.title }));
  const layers = () => { const v = store.getState().view; return LAYERS.filter((l) => SHOWN_LAYERS.includes(l.key)).map((l) => ({ key: l.key, label: l.label, on: isLayerOn(v, l.key) })); };

  // ---- 時間 ----
  const guardOk = () => !history.isPast() && (!runGuard || runGuard());
  const time = {
    isRunning: () => timeActions.isRunning(),
    start() { if (guardOk()) timeActions.start(); },
    stop: () => timeActions.stop(),
    step() { if (!guardOk()) return false; timeActions.stepMonth(); return true; },
    speedPerYear: () => timeActions.getSpeed() * 12,
    setSpeedPerYear: (ms) => timeActions.setSpeedPerYear(ms),
  };

  // ---- 開始フロー ----
  const proposalOf = () => civOf()?.proposals.find((p) => !p.resolved && p.kind === "form_state") ?? null;
  const startState = () => {
    const m = mapOf(); if (!m?.world) return { phase: "none", hasWorld: false, groupId: null, months: 0 };
    const civ = m.civ, gid = m.world.entities.start?.groupId ?? null;
    if (!civ) return { phase: "group", hasWorld: true, groupId: gid, months: 0 };
    if (proposalOf()) return { phase: "ready", hasWorld: true, groupId: gid, months: civ.monthIndex };
    const ps = Object.values(civ.states).find((s) => s.player && s.alive);
    return { phase: ps ? "founded" : "running", hasWorld: true, groupId: gid, months: civ.monthIndex };
  };
  const start = {
    state: startState,
    initialGroups() {
      const w = worldOf(); if (!w) return []; const sel = w.entities.start?.groupId ?? store.getState().groups?.selected;
      return w.entities.populations.map((p) => ({ id: p.id, title: `集団 #${p.id}`, sub: SUBSISTENCE[p.subsistence] ?? p.subsistence ?? "", stats: [{ label: "人口", value: fmtNum(p.size) }, { label: "位置", value: `緯度 ${Math.round(p.lat)}°・経度 ${Math.round(p.lon)}°` }], selected: p.id === sel }));
    },
    chooseGroup(id) { if (!groupActions) return { ok: false, error: "初期集団の操作が接続されていません" }; if (!groupActions.selectGroup(id)) return { ok: false, error: "その集団は選べません" }; const r = groupActions.confirmStart(); return r.ok ? { ok: true } : { ok: false, error: r.reason }; },
    begin() { const r = civActions.start(); return r.ok ? { ok: true } : { ok: false, error: r.error }; },
    readiness() {
      const p = proposalOf(); if (!p) return { ready: false, via: null, label: "成立の条件はまだ整っていません", conditions: [], proposalId: null };
      const via = p.payload?.via; return { ready: true, via, label: VIA[via]?.ja ?? via, conditions: (FORMATION_CONDITIONS[via] ?? []).map((label) => ({ label, met: true })), proposalId: p.proposalId };
    },
    async run({ onProgress = null, signal = null, batch = 12, stallMonths = 600 } = {}) {
      const civ0 = civOf(); if (!civ0) return { stopped: "error", error: "歴史がまだ始まっていません", months: 0 };
      const t0 = civ0.monthIndex; let lastSig = "", lastChange = civ0.monthIndex;
      try {
        while (!proposalOf()) {
          if (signal?.aborted) return { stopped: "aborted", months: civOf().monthIndex - t0 };
          if (history.isPast()) return { stopped: "error", error: "過去を閲覧中は進められません。現在へ戻してください", months: 0 };
          for (let i = 0; i < batch && !proposalOf(); i++) timeActions.stepMonth();
          const civ = civOf(), s = `${Object.keys(civ.groups).length}|${Object.keys(civ.settlements).length}|${Math.round(Object.values(civ.groups).reduce((a, g) => a + g.pop, 0))}`;
          if (s !== lastSig) { lastSig = s; lastChange = civ.monthIndex; }
          onProgress?.({ months: civ.monthIndex - t0, year: Math.floor(civ.monthIndex / 12), states: aliveStates(civ).length, stalled: civ.monthIndex - lastChange >= stallMonths, warning: null });
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch (e) { return { stopped: "error", error: e?.message ?? String(e), months: 0 }; }
      return { stopped: "ready", months: civOf().monthIndex - t0 };
    },
    found(proposalId) { const r = civActions.command({ type: "acceptProposal", proposalId }); return r?.ok ? { ok: true } : { ok: false, error: r?.error ?? "成立できませんでした" }; },
  };
  const world = {
    openFile: () => openFileDialog?.(),
    async newWorld(spec, { signal } = {}) { const r = await actions.newWorld(spec); if (signal?.aborted) return { ok: false, cancelled: true }; return r?.ok ? { ok: true } : r?.cancelled ? { ok: false, cancelled: true } : { ok: false, error: store.getState().error ?? (r?.errors ?? []).join(" / ") }; },
    fitView: () => actions.fit(), editMap: () => editMap?.(),
  };

  // ---- 出力 ----
  const fileName = () => store.getState().fileName;
  const renderOpts = () => viewToRenderOptions(store.getState().view);
  const exports_ = {
    describe() { const m = meta(); return { chronicle: { available: m.hasWorld }, ahmap: { available: m.hasWorld }, obsidian: { available: m.hasCiv }, png: { kinds: ["current", "territory"], available: m.hasWorld } }; },
    async chronicle() {
      const map = mapOf(); map.ext ??= { app: "ALTERHISTORY", format: 1, savedAt: "", lineCount: 0, data: {} };
      const md = chronicleToMarkdown(buildChronicle(map, { fileName: fileName(), includeCells: false, exportedAt: todayString() }));
      const civ = map.civ, parts = [md, ...(civ ? civChronicleChunks(civ, { worldName: meta().name }) : [])];
      return { blob: new Blob(parts, { type: "text/markdown" }), name: `${exportFileName(map, fileName(), "x").replace(/\.x$/, "")}.chronicle.md` };
    },
    async ahmap() { const map = mapOf(), bytes = await saveMapBytes(map, { appVersion, savedAt: todayString() }); store.markSaved?.(); return { blob: new Blob([bytes], { type: "application/octet-stream" }), name: exportFileName(map, fileName(), "ahmap") }; },
    obsidianEstimate(range = {}) { const m = mapOf(); return estimateVault(m.world, m.civ, { ...range, cellRaster }); },
    async *obsidian({ fromMonth, toMonth, maxPartBytes = DEFAULT_PART_BYTES, maxPartFiles = DEFAULT_PART_FILES, signal = null, onProgress = null } = {}) {
      const m = mapOf(), name = meta().name || "世界", root = String(name).replace(/[\\/:*?"<>|]/g, "_"), enc = new TextEncoder(), index = []; let manifest = null;
      const sha = async (b) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const opts = { cellRaster }; if (fromMonth != null && Number.isFinite(fromMonth)) opts.fromMonth = fromMonth; if (toMonth != null && Number.isFinite(toMonth)) opts.toMonth = toMonth;
      async function* gen() {
        for await (const f of obsidianFiles(m.world, m.civ, name, opts)) {
          if (f.kind === "manifest") { manifest = JSON.parse(f.data); continue; }
          const raw = typeof f.data === "string" ? enc.encode(f.data) : f.data; index.push([f.path.slice(root.length + 1), raw.length, await sha(raw)]); yield f;
        }
        manifest.files = index; manifest.split = true; yield { path: `${root}/manifest.json`, data: JSON.stringify(manifest, null, 1) };
      }
      yield* splitIntoParts(gen(), { root, maxPartBytes, maxPartFiles, signal, onProgress, zip: (files) => zipFiles(files, { compress: true }) });
    },
    async png({ kind, month }) {
      if (!createCanvas) throw new Error("PNG の書き出しに必要な描画機能が接続されていません");
      const map = mapOf(), mm = meta(), ls = layers();
      if (kind === "territory") {
        if (!map.civ) throw new Error("文明の歴史が始まってから書き出せます");
        const t = history.territory(), W = 2048, H = 1024, c = map.world.cell, cellAt = cellRaster(map.world, W, H), cv = createCanvas(W, H), g = cv.getContext("2d"), img = g.createImageData(W, H);
        const cols = new Map(t.states.map((s) => [s.id, hslToRgb(s.color)]));
        for (let i = 0; i < W * H; i++) { const ci = cellAt[i], water = c.landWater[ci] !== 1; let r = water ? 24 : 70, gg = water ? 52 : 82, b = water ? 96 : 70; const o = t.owner.get(ci), k = o ? cols.get(o) : null; if (k) { r = r * 0.3 + k[0] * 0.7; gg = gg * 0.3 + k[1] * 0.7; b = b * 0.3 + k[2] * 0.7; } img.data[4 * i] = r; img.data[4 * i + 1] = gg; img.data[4 * i + 2] = b; img.data[4 * i + 3] = 255; }
        g.putImageData(img, 0, 0);
        const meta_ = describePng({ kind, month: t.month, worldName: mm.name, layers: ls, legendCount: t.states.length, projection: "等距円筒図（緯度・経度をそのまま平面へ。表示用の投影で、データは球面上に保持）" });
        const out = withCaption(cv, meta_.captionLines, { createCanvas });
        return { blob: await canvasToPngBlob(out), name: exportFileName(map, fileName(), "png", `_territory_${Math.floor(t.month / 12)}`), meta: meta_ };
      }
      const cv = renderMapToCanvas(map, renderOpts(), { scale: 2, createCanvas, annotations: { ...DEFAULT_ANNOTATIONS, ...(store.getState().exportOpts ?? {}) } });
      const meta_ = describePng({ kind: "current", month: month ?? mm.view ?? mm.now, worldName: mm.name, layers: ls, projection: "画面の地図と同じ投影" });
      return { blob: await canvasToPngBlob(withCaption(cv, meta_.captionLines, { createCanvas })), name: exportFileName(map, fileName(), "png"), meta: meta_ };
    },
  };

  return {
    meta, subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    setView: (mi) => history.setView(mi), list, detail, actions: actions_, runAction, band, newEvents,
    worldScale: () => { const civ = civOf(); return { states: civ ? aliveStates(civ).length : 0, population: civ ? aliveStates(civ).reduce((a, s) => a + s.pop, 0) : 0 }; },
    layers, toggleLayer: (k) => actions.toggle(k), setRunGuard(fn) { runGuard = fn; },
    time, world, start, exports: exports_,
  };
}

function hslToRgb(s) { const m = String(s).match(/hsl\((\d+) (\d+)% (\d+)%\)/); if (!m) return [128, 128, 128]; const h = +m[1], sa = +m[2] / 100, l = +m[3] / 100, a = sa * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }; return [f(0), f(8), f(4)]; }

// ---- 本体の地図を地図ポートとして包む（地図の描画基盤には触れない。#stage の中身をそのまま差し込み、選択だけ橋渡しする） ----
export function createLiveMapPort({ stageEl, panels = null, highlight = null }) {
  let pick = null; const origOpen = panels?.openEntity;
  if (panels && origOpen) panels.openEntity = (kind, id) => { if (kind === "state" || kind === "war") { pick?.({ kind, id }); return; } return origOpen.call(panels, kind, id); }; // 既存の「地図で選ぶ」を新パネルへ向ける（差し替えは統合時に 1 か所）
  return { el: stageEl, onPick(fn) { pick = fn; }, highlight(sel) { if (sel && highlight) highlight.show(sel.kind, sel.id); }, refresh() {}, dispose() { if (panels && origOpen) panels.openEntity = origOpen; } };
}
