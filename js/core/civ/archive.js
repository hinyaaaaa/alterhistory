// v6.1.0 M4: 歴史資料（アーカイブ）。仕様 §11。
//   ・保存するのは「起きた結果」だけ。AI の判断理由・候補・観測・採点・内部の計画は保存しない。因果リンクは直接かつ明確なもの（basis: direct）だけ。
//   ・月ごとの出来事は、まず civ.events（直近の作業バッファ）に積まれる。安全な境界（commitArchive）で、意味のある結果だけが civ.archive の世紀ごとのチャンクへ移る。
//     細かい出来事（接触・コホート・生業の変化など）は個別に残さず、件数だけを数える（counts）。
//   ・資料は時間とともに失われる。残るかどうかは (recordId, historySeed, 記録の媒体, 重要度, 経過年) から決定的に決まり、同じ世界・同じ日付なら再実行・保存読み込みで変わらない。
//     経過とともに残存確率は単調に下がるだけなので、一度失われた資料が後から復活しない（コンパクションで安全に捨てられる）。
//   ・固定間隔の完全スナップショットは持たない。過去の閲覧は、残っている資料から再構成する（pastView）。資料が無い部分は「不明」と示す。
//   ・古いチャンクは JSON 文字列（cold）で持ち、必要になったときだけ読む（遅延読み込み）。索引は派生で、保存しない。
import { hashSeed } from "./civ-state.js";

export const ARCHIVE_VERSION = 1;
export const LIVE_MONTHS = 36;        // 直近の作業バッファに残す期間（因果の参照・ニュース・解釈が近い過去を引くため）
export const CHUNK_YEARS = 100;       // チャンクの期間
const COLD_AFTER_YEARS = 120;         // これより古いチャンクは cold（JSON 文字列）にする

/** 出来事の種別ごとの扱い。store: 個別の資料として残すか／ty: 種類（検索・再構成用）／im: 重要度 0〜3（残りやすさ） */
const P = (ty, im, store = true) => ({ ty, im, store });
export const KIND_POLICY = Object.freeze({
  state_formed: P("state", 3), state_dissolved: P("state", 3), regime_change: P("state", 2), leader_succession: P("state", 1), succession_by_heir: P("state", 1), dynasty_changed: P("state", 2), heir_named: P("state", 0, false),
  instability: P("state", 0, false), group_joined_state: P("state", 1), conquest: P("war", 3), territory_occupied: P("war", 2), campaign_abandoned: P("war", 0, false),
  war_declared: P("war", 3), war_ended: P("war", 3), battle_fought: P("war", 2), peace: P("war", 3), reparations: P("war", 2), ally_joined: P("war", 2),
  treaty_signed: P("treaty", 2), treaty_ended: P("treaty", 2), treaty: P("treaty", 2), diplomacy_failed: P("treaty", 1),
  tech_discovered: P("tech", 3), tech_institutionalized: P("tech", 1), tech_rediscovered: P("tech", 2), tech_lost: P("tech", 2),
  culture_diverged: P("culture", 2), language_diverged: P("culture", 1), religion_founded: P("culture", 3), religion_schism: P("culture", 2), religion_spread: P("culture", 0, false), culture_contact: P("culture", 0, false), cohort_formed: P("culture", 0, false), cohort_assimilated: P("culture", 0, false),
  settlement_founded: P("city", 1), settlement_stage: P("city", 1),
  disaster_struck: P("env", 2), disaster_ended: P("env", 0, false), climate_shift: P("env", 2), famine: P("env", 1), ecosystem_shift: P("env", 1),
  group_split: P("pop", 0, false), group_moved: P("pop", 0, false), group_extinct: P("pop", 1), subsistence_changed: P("pop", 0, false), sea_crossed: P("pop", 3), species_emerged: P("pop", 3), prehistory_epoch: P("pop", 2),
  trade_route_opened: P("economy", 1), trade_cut: P("economy", 1), demand_raised: P("economy", 0, false),
  doctrine_adopted: P("military", 1), state_action: P("state", 1), creator_edit: P("creator", 2), chronicle: P("other", 1),
  magic_backlash: P("other", 0, false), magic_power_struggle: P("other", 0, false), magic_org_founded: P("other", 0, false), magic_gifted_died: P("other", 0, false), magic_incident: P("other", 0, false), magic_discrimination: P("other", 0, false), magic_gifted_found: P("other", 0, false),
});
export const policyOf = (kind) => KIND_POLICY[kind] ?? P("other", 1);

// ---- 媒体（記録が何に残るか）。記録を残す側の技術から決まる。残りやすさ（τ: 年）
export const MEDIA = Object.freeze({ trace: { ja: "遺跡・痕跡", tau: 250000 }, oral: { ja: "口承", tau: 120 }, tablet: { ja: "刻まれた記録", tau: 900 }, paper: { ja: "紙の記録", tau: 2800 }, print: { ja: "印刷物", tau: 14000 } });
const IMP_TAU = [0.4, 1, 2.5, 8], IMP_FLOOR = [0.003, 0.01, 0.05, 0.12], GRACE_YEARS = 20;
/** 参加者の技術から媒体を決める（記録する側の最良の媒体）。civ は作成時点の状態を読む */
export function mediaOf(civ, participants, kind) {
  if (kind === "prehistory_epoch" || kind === "species_emerged" || kind === "sea_crossed") return "trace";
  let best = 0; const rank = (k) => (k.printing != null ? 4 : k.papermaking != null ? 3 : (k.writing != null || k.record_keeping != null) ? 2 : 1);
  for (let i = 0; i < participants.length && i < 4; i++) { const id = participants[i].entityId, st = civ.states[id], g = st ? null : civ.groups[id]; const r = st ? rank(st.techAdopted) : g ? rank(g.tech.known) : 1; if (r > best) best = r; }
  return best >= 4 ? "print" : best === 3 ? "paper" : best === 2 ? "tablet" : "oral";
}
/** 残存確率（0〜1）。経過年に対して単調に下がる。直近（GRACE_YEARS）は必ず残る */
export function survivalP(rec, nowMonth) {
  const age = (nowMonth - rec.t) / 12; if (age <= GRACE_YEARS) return 1; const im = rec.im ?? 1, tau = (MEDIA[rec.m]?.tau ?? 120) * IMP_TAU[im], fl = IMP_FLOOR[im];
  return fl + (1 - fl) * Math.exp(-(age - GRACE_YEARS) / tau);
}
/** 決定的な残存判定: 同じ (記録ID, historySeed, 日付) なら常に同じ */
export const survives = (civ, rec, nowMonth = civ.monthIndex) => hashSeed(civ.historySeed, "archive", rec.eventId) / 4294967296 < survivalP(rec, nowMonth);

// ---- 保管
export const emptyArchive = () => ({ v: ARCHIVE_VERSION, chunks: {}, counts: {}, evBase: 0, total: 0, rev: 0 });
export const archiveOf = (civ) => (civ.archive ??= emptyArchive());
const monthOfEvent = (e) => e.date.year * 12 + (e.date.month - 1);
const bucketOf = (m) => Math.floor(m / 12 / CHUNK_YEARS);
/** 作業バッファの出来事を資料の形へ。AI の判断の id・出自の詳細は持たない */
export function toRecord(civ, e) {
  const pol = policyOf(e.kind), r = { eventId: e.eventId, date: e.date, t: monthOfEvent(e), kind: e.kind, ty: pol.ty, im: e.imp ?? pol.im, m: e.media ?? "oral", title: e.title, participants: e.participants, location: e.location ?? null, causes: e.causes?.length ? e.causes : [], effects: pol.im >= 2 ? (e.effects ?? []) : [], provenance: e.provenance ?? "simulation" };
  if (e.facts) r.facts = e.facts; return r;
}
const hot = new WeakMap(); // civ.archive → { key → 解析済みの配列 }（cold チャンクを読んだ結果を少数だけ覚える）
function chunkRecords(a, key) {
  const c = a.chunks[key]; if (!c) return []; if (c.rec) return c.rec; let h = hot.get(a); if (!h) hot.set(a, h = new Map());
  let arr = h.get(key); if (!arr) { arr = JSON.parse(c.cold); h.set(key, arr); if (h.size > 4) h.delete(h.keys().next().value); } return arr;
}
/** 安全な境界（safeAdvance の各チャンクが成功したあと）で、直近のバッファを除く出来事を資料へ移し、古い資料を整理する */
export function commitArchive(ctx) {
  const { civ } = ctx, a = archiveOf(civ), now = civ.monthIndex, cutoff = now - LIVE_MONTHS; let idx = 0;
  const pinned = new Set(); for (const q of civ.wcde?.news?.queue ?? []) if (q.eventId) pinned.add(q.eventId);
  while (idx < civ.events.length && monthOfEvent(civ.events[idx]) < cutoff) idx++;
  if (idx) {
    const moved = civ.events.splice(0, idx), touched = new Set();
    for (const e of moved) { const pol = policyOf(e.kind), key = String(bucketOf(monthOfEvent(e))), c = (a.chunks[key] ??= { y0: Number(key) * CHUNK_YEARS, n: 0, lost: 0, rec: [] });
      if (!pol.store && !pinned.has(e.eventId)) { const k = a.counts[key] ??= {}; k[e.kind] = (k[e.kind] ?? 0) + 1; continue; }
      if (c.cold) { c.rec = chunkRecords(a, key).slice(); delete c.cold; hot.get(a)?.delete(key); } c.rec.push(toRecord(civ, e)); c.n++; a.total++; touched.add(key); }
    a.evBase += idx; a.rev++;
    for (const k of ["eventsChecked"]) if (ctx[k] != null) ctx[k] = Math.max(0, ctx[k] - idx);
    const N = civ.wcde?.news; if (N && N.scanned != null) N.scanned = Math.max(0, N.scanned - idx); if (civ.interpCursor != null) civ.interpCursor = Math.max(0, civ.interpCursor - idx);
  }
  compact(civ); return { moved: idx };
}
/** コンパクション: 残存しなくなった資料を捨て（二度と復活しない）、古い開いたチャンクを cold にする */
export function compact(civ) {
  const a = archiveOf(civ), now = civ.monthIndex; let dropped = 0;
  for (const key in a.chunks) { const c = a.chunks[key], old = (now / 12 - (c.y0 + CHUNK_YEARS)) > COLD_AFTER_YEARS - CHUNK_YEARS; if (c.cold && !old) continue;
    const recs = chunkRecords(a, key), keep = recs.filter((r) => survives(civ, r, now)), lost = recs.length - keep.length;
    if (lost > 0 || (old && !c.cold)) { dropped += lost; c.lost += lost; c.n = keep.length; if (old && now / 12 >= c.y0 + CHUNK_YEARS) { c.cold = JSON.stringify(keep); delete c.rec; hot.get(a)?.delete(key); } else { c.rec = keep; delete c.cold; } }
  }
  if (dropped) { a.rev++; a.total -= dropped; } return dropped;
}
// ---- 問い合わせ（資料と作業バッファを、時間順にひとつの列として扱う。残存しない資料は返さない）
const evAsRecord = (civ, e) => toRecord(civ, { ...e, media: e.media ?? mediaOf(civ, e.participants, e.kind) });
/** 時間の範囲で資料を走査する。バッファの出来事（直近）も、同じ形で返す */
export function* iterRecords(civ, { from = -Infinity, to = Infinity, kinds = null, types = null, includeLost = false } = {}) {
  const a = archiveOf(civ), keys = Object.keys(a.chunks).map(Number).sort((x, y) => x - y), now = civ.monthIndex;
  for (const k of keys) { const y0 = k * CHUNK_YEARS; if (y0 * 12 > to || (y0 + CHUNK_YEARS) * 12 < from) continue; for (const r of chunkRecords(a, String(k))) { if (r.t < from || r.t > to) continue; if (kinds && !kinds.includes(r.kind)) continue; if (types && !types.includes(r.ty)) continue; if (!includeLost && !survives(civ, r, now)) continue; yield r; } }
  for (const e of civ.events) { const t = monthOfEvent(e); if (t < from || t > to) continue; const pol = policyOf(e.kind); if (kinds && !kinds.includes(e.kind)) continue; if (types && !types.includes(pol.ty)) continue; if (!pol.store && !kinds) continue; yield evAsRecord(civ, e); }
}
const idNum = (id) => Number(String(id).split("_").pop());
/** 資料を ID で引く（作業バッファ → 資料）。残存しなければ null。lost: 記録された（はずの）が失われたかどうか */
export function findRecord(civ, id) {
  const live = civ.events.find((e) => e.eventId === id); if (live) return evAsRecord(civ, live);
  const a = archiveOf(civ); for (const k in a.chunks) for (const r of chunkRecords(a, k)) if (r.eventId === id) return survives(civ, r) ? r : null;
  return null;
}
/** ID が作業バッファの範囲か（連番）。範囲外で見つからないなら、資料が（捨てられて）無い */
export const inLiveRange = (civ, id) => !civ.events.length || idNum(id) >= idNum(civ.events[0].eventId);
/** 参加者（国家・集団・都市など）に関わる資料。新しい順 */
export function recordsOf(civ, entityId, { limit = 50 } = {}) { const out = []; for (const r of iterRecords(civ)) if (r.participants.some((p) => p.entityId === entityId)) out.push(r); out.sort((x, y) => y.t - x.t); return out.slice(0, limit); }
/** 原因リンクをたどる。原因の資料が失われていれば lost: true（「資料欠落」と表示する。起きなかった証拠ではない） */
export function causesOfRecord(civ, rec) { return (rec.causes ?? []).map((c) => { const r = findRecord(civ, c.targetId); return { ...c, record: r, lost: !r && !inLiveRange(civ, c.targetId) }; }); }
/** 世紀ごとの残存状況（UI の「この時代の資料の欠落」表示）。total は記録された件数の推定で、特定の出来事を示さない */
export function coverage(civ) { const a = archiveOf(civ), out = []; for (const k of Object.keys(a.chunks).map(Number).sort((x, y) => x - y)) { const c = a.chunks[k], kept = c.n, lost = c.lost; out.push({ y0: c.y0, kept, lost, ratio: kept + lost ? kept / (kept + lost) : 1, minor: Object.values(a.counts[k] ?? {}).reduce((s, v) => s + v, 0) }); } return out; }
export const archiveStats = (civ) => { const a = archiveOf(civ); let cold = 0, bytes = 0; for (const k in a.chunks) { const c = a.chunks[k]; if (c.cold) { cold++; bytes += c.cold.length; } } return { chunks: Object.keys(a.chunks).length, cold, coldBytes: bytes, records: a.total, live: civ.events.length, flushed: a.evBase }; };

// ---- 過去の再構成（残っている資料から）。固定間隔のスナップショットは使わない
/** month 時点の国家・領域を、残っている資料から組み立てる。資料の無い部分は推測せず「不明」として返す */
export function pastView(civ, month) {
  const states = new Map(), cities = [], wars = new Map(); const ensure = (id) => states.get(id) ?? (states.set(id, { id, name: null, polity: null, capitalCell: null, cells: new Set(), formedAt: null, endedAt: null, known: { formed: false, ended: false }, mentions: 0 }), states.get(id));
  for (const r of iterRecords(civ, { to: month, types: ["state", "war", "treaty", "city", "tech"] })) {
    const f = r.facts ?? {}, sid = f.stateId ?? r.participants.find((p) => p.role === "state" || p.role === "actor")?.entityId;
    if (r.kind === "state_formed") { const s = ensure(f.stateId ?? sid); s.name = f.name ?? s.name; s.polity = f.polity ?? s.polity; s.capitalCell = f.capitalCell ?? s.capitalCell; s.formedAt = r.t; s.known.formed = true; for (const c of f.cells ?? []) s.cells.add(c); s.endedAt = null; s.known.ended = false; }
    else if (r.kind === "state_dissolved") { const s = ensure(sid); s.endedAt = r.t; s.known.ended = true; s.mentions++; }
    else if (r.kind === "regime_change" || (r.kind === "state_action" && f.polity)) { const s = ensure(sid); if (f.name) s.name = f.name; if (f.polity) s.polity = f.polity; s.mentions++; }
    else if (r.kind === "group_joined_state" || r.kind === "conquest" || r.kind === "territory_occupied") { const s = ensure(f.stateId ?? sid); for (const c of f.cells ?? (f.cell != null ? [f.cell] : [])) s.cells.add(c); s.mentions++; }
    else if (r.kind === "war_declared") wars.set(f.warId ?? r.eventId, { id: f.warId ?? r.eventId, a: f.aggressor ?? null, b: f.defender ?? null, since: r.t, until: null });
    else if (r.kind === "war_ended") { const w = wars.get(f.warId) ?? null; if (w) w.until = r.t; if (f.stateId) { const s = ensure(f.stateId); for (const c of f.cells ?? []) s.cells.add(c); s.mentions++; } }
    else if (r.kind === "settlement_founded") cities.push({ id: r.eventId, cell: r.location?.cell ?? f.cell ?? null, at: r.t });
  }
  const alive = [...states.values()].filter((s) => (s.formedAt != null || s.mentions > 0) && !s.known.ended);
  const owner = new Map(); for (const s of alive) for (const c of s.cells) owner.set(c, s.id); for (const s of alive) if (s.capitalCell != null) owner.set(s.capitalCell, s.id);
  return { month, states: alive.map((s) => ({ ...s, cells: [...s.cells], known: s.known, partial: !s.known.formed || s.name == null })), owner, cities, wars: [...wars.values()].filter((w) => w.until == null), note: "残っている資料から再構成した姿です。資料が失われた部分は不明で、そこに何も無かったという意味ではありません。" };
}
/** 整合性: 資料の ID 重複・チャンクの件数・因果リンクの種類（direct のみ）・判断の記録を持たないこと */
export function checkArchive(civ) {
  const errs = [], a = civ.archive; if (!a) return errs; const seen = new Set();
  for (const k in a.chunks) { const c = a.chunks[k]; if (!c.rec && typeof c.cold !== "string") { errs.push(`資料チャンク ${k} が空`); continue; }
    for (const r of c.rec ?? []) { if (seen.has(r.eventId)) errs.push(`資料の ID 重複 ${r.eventId}`); seen.add(r.eventId); for (const x of r.causes ?? []) if (x.basis !== "direct") errs.push(`資料 ${r.eventId} に direct 以外の因果リンクがある`); if ("decisionId" in r) errs.push(`資料 ${r.eventId} が判断の ID を持つ`); } }
  if (civ.decisions && civ.decisions.length) errs.push("AI の判断記録が保存されている（v6.1.0 は保存しない）");
  return errs;
}
