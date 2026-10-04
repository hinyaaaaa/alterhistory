// 戦争：宣戦布告から、戦闘の勝敗記録の蓄積、講和条約（割譲・賠償金）までを扱う。
//
// データ構造（ALTERHISTORY拡張データに保存。Azgaar形式には無い概念）:
//   ext.data.wars = [{
//     id, name, attackers:[stateId], defenders:[stateId],
//     startedAt: {year, month}, endedAt: {year, month}|null,
//     battles: [{ year, month, attackerState, defenderState, winner, ... }],  // 戦績の記録
//     advantage: { [stateId]: number },  // 講和候補の算出に使う「優勢度」の累積
//   }]
//
// 講和の割譲候補: 「防御側の領土のうち、攻撃側と隣接するセルを含む属州」を機械的に提示する
// （実際の占領地ではなく、あくまで候補の提示。最終的にユーザーが選ぶ）。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setIndexed, setProps } from "./commands.js";
import { ensureExt } from "./ext.js";
import { resolveWar, nameWar, applyLossFraction, mobilized, generateBattleLog, previewWar, reevaluateWar, warTypeOf } from "../sim/war-engine.js";
import { officialName } from "../names.js";
import { regimentsOf } from "../sim/military.js";
import { convert, getCurrency } from "../sim/currency.js";
import { getFinance } from "../sim/trade.js";
import { expandWithAllies, estimateDurationMonths, addMonths, proposePeaceVenue, peaceImpact } from "../sim/war-flow.js";
import { diplomacyParts, crossPairs } from "./diplomacy.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

export function listWars(map) {
  return map.ext?.data?.wars ?? [];
}
function nextWarId(map) {
  const list = listWars(map);
  return list.length ? Math.max(...list.map((w) => w.id)) + 1 : 1;
}
function writeWars(m, list) { const ext = ensureExt(m); ext.data.wars = list; if (!list.length) delete ext.data.wars; }

export function activeWars(map) {
  return listWars(map).filter((w) => !w.endedAt);
}
export function warsOf(map, stateId) {
  return listWars(map).filter((w) => w.attackers.includes(stateId) || w.defenders.includes(stateId));
}

/** 宣戦布告。attackers/defenders はそれぞれ1カ国以上 */
/** 戦争名が既に使われているか（自分自身 exceptId は除く） */
export function warNameTaken(map, name, exceptId = null) {
  const n = String(name ?? "").trim();
  return !!n && listWars(map).some((w) => w.id !== exceptId && w.name === n);
}
/** 既定の戦争名が重なるときは「（第2次）」「（第3次）」…を付けて一意にする */
function uniqueDefaultName(map, base) {
  if (!warNameTaken(map, base)) return base;
  for (let k = 2; ; k++) { const n = `${base}（第${k}次）`; if (!warNameTaken(map, n)) return n; }
}

export function planDeclareWar(map, { name, attackers, defenders, date }) {
  const a = [...new Set(attackers)], d = [...new Set(defenders)];
  if (!a.length || !d.length) throw new Error("攻撃側・防御側とも1カ国以上必要です");
  for (const id of [...a, ...d]) if (!isLive(map.pack.states[id])) throw new Error(`国家#${id}は存在しません`);
  if (a.some((id) => d.includes(id))) throw new Error("同じ国家が両陣営に入っています");
  const aNames = a.map((id) => map.pack.states[id].name), dNames = d.map((id) => map.pack.states[id].name);
  const explicit = String(name ?? "").trim();
  if (explicit && warNameTaken(map, explicit)) throw new Error(`「${explicit}」という戦争名は既に使われています`);
  const war = {
    id: nextWarId(map), name: explicit || uniqueDefaultName(map, `${aNames[0]}対${dNames[0]}戦争`),
    attackers: a, defenders: d, startedAt: date, endedAt: null, battles: [], advantage: {},
    muster: {}, // 召集する部隊: { [国家ID]: [部隊ID, ...] }（チェックを付けた部隊がこの戦争の戦力）
  };
  const before = listWars(map);
  return { command: makeCommand(`宣戦布告（${war.name}）`, [], [{ apply: (m) => writeWars(m, [...before, war]), revert: (m) => writeWars(m, before) }]), id: war.id };
}

/**
 * 宣戦布告と同時に、戦争を即時判定する。名前は自動で付き、両陣営の全部隊が消耗する。
 * 結果（勝敗・制海/制空/陸軍/士気の比較）は war.result に保存され、講和ウィンドウが読む。
 * @returns {{command, id, result}}
 */
export function planDeclareAndResolveWar(map, { attackers, defenders, date, rnd, muster = null, type = "conventional" }) {
  const a0 = [...new Set(attackers)], d0 = [...new Set(defenders)];
  if (!a0.length || !d0.length) throw new Error("攻撃側・防御側とも1カ国以上必要です");
  for (const id of [...a0, ...d0]) if (!isLive(map.pack.states[id])) throw new Error(`国家#${id}は存在しません`);
  if (a0.some((id) => d0.includes(id))) throw new Error("同じ国家が両陣営に入っています");
  const T = warTypeOf(type);
  // 同盟の拘束力に従って、同盟国が自動で参戦する（参戦した国は全部隊で戦う）
  const { attackers: a, defenders: d, joined } = expandWithAllies(map, a0, d0);
  const cleanMuster = {};
  if (!T.allMuster) for (const [sid, ids] of Object.entries(muster ?? {})) {
    const id = Number(sid);
    if (![...a, ...d].includes(id) || !Array.isArray(ids)) continue;
    const have = new Set(regimentsOf(map.pack.states[id]).map((r) => r.i));
    cleanMuster[id] = ids.filter((x) => have.has(x));
  }
  const m = Object.keys(cleanMuster).length ? cleanMuster : null;
  const result = resolveWar(map, a, d, rnd, m, T.key);
  // 規模・地形・決着の差・ドクトリン・戦争の形態から、戦争の長さ（終戦日）を自動で決める
  const speed = (result.doctrine.attacker.speed + result.doctrine.defender.speed) / 2;
  const months = Math.max(1, Math.round(estimateDurationMonths(map, a, d, result, rnd) * speed * T.duration));
  const endsAt = addMonths(date, months);
  const battles = generateBattleLog(map, { attackers: a, defenders: d, result, startedAt: date, durationMonths: months }, rnd, addMonths);
  // 戦争の名前は、実際に戦いが行われた場所から付ける
  const name = nameWar(map, { attackers: a, defenders: d, rnd, existingNames: listWars(map).map((w) => w.name), battles, type: T.key });
  const war = {
    id: nextWarId(map), name, type: T.key, attackers: a, defenders: d, startedAt: date, endsAt, durationMonths: months, endedAt: null,
    progress: 0, // 0〜1。月が進むごとに損害が積み重なり、1で戦闘が終わって講和できる
    joinedAllies: joined, battles, advantage: {}, muster: cleanMuster,
    result: {
      winner: result.winner, decisiveness: result.decisiveness, warScore: result.warScore, type: T.key, compare: result.compare, aStrength: result.aStrength, dStrength: result.dStrength,
      noise: result.noise, doctrine: result.doctrine, casualties: result.casualties, moraleDelta: result.moraleDelta, popLossShare: result.popLossShare, losses: result.losses,
    },
  };
  const parts = [];
  parts.push(...diplomacyParts(map, crossPairs(a, d), "Enemy")); // 戦争をしたら敵対
  const before = listWars(map);
  parts.push({ apply: (mm) => writeWars(mm, [...before, war]), revert: (mm) => writeWars(mm, before) });
  return { command: makeCommand(`戦争開始（${war.name}）`, ["places"], parts), id: war.id, result: war.result, name, joined, endsAt, battles, type: T.key };
}

const monthsBetween = (from, to) => (to.year - from.year) * 12 + (to.month - from.month);

/** 戦争の進行（月ごとの損害）を、進行度 q0→q1 の分だけ反映する部品。損害・士気・民間の被害は、期間に均等に積み重なる */
function progressParts(map, war, q0, q1) {
  const parts = [];
  const r = war.result; if (!r || q1 <= q0) return parts;
  const dq = q1 - q0;
  const m = war.muster && Object.keys(war.muster).length ? war.muster : null;
  for (const sidStr of Object.keys(r.losses ?? {})) {
    const id = Number(sidStr), st = map.pack.states[id]; if (!isLive(st)) continue;
    const f = r.losses[id] ?? 0;
    const step = 1 - Math.pow(1 - f, dq); // 全期間で f 失う損害を、dq の分だけ
    for (const reg of mobilized(st, m)) parts.push(setProps(reg, { u: applyLossFraction(reg.u, step) }));
    const pl = r.popLossShare?.[id] ?? 0, pstep = 1 - Math.pow(1 - pl, dq);
    const pop0 = (st.rural ?? 0) + (st.urban ?? 0);
    parts.push(setProps(st, {
      morale: Math.max(0, Math.min(100, (st.morale ?? 70) + (r.moraleDelta?.[id] ?? 0) * dq)),
      popPeak: Math.max(st.popPeak ?? 0, pop0),
      rural: Math.round((st.rural ?? 0) * (1 - pstep) * 100) / 100, urban: Math.round((st.urban ?? 0) * (1 - pstep) * 100) / 100,
    }));
  }
  return parts;
}

/** 月が進むたびに呼ぶ。戦闘中の戦争の損害を、経過した分だけ自動で展開する。変化が無ければ null */
export function planAdvanceWars(map, date) {
  const list = listWars(map);
  const parts = []; let changed = false;
  const after = list.map((w) => {
    if (w.endedAt || !w.result || w.progress == null || w.progress >= 1) return w;
    const p = Math.min(1, monthsBetween(w.startedAt, date) / Math.max(1, w.durationMonths));
    if (p <= w.progress) return w;
    parts.push(...progressParts(map, w, w.progress, p)); changed = true;
    return { ...w, progress: p };
  });
  if (!changed) return null;
  parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) });
  return makeCommand("戦争の進行（月ごとの損害）", ["places"], parts);
}

/** 戦闘を最後まで進める（残りの損害をまとめて反映して、講和できる状態にする） */
export function planFinishWar(map, warId) {
  const list = listWars(map), w = list.find((x) => x.id === warId);
  if (!w || !w.result) throw new Error("その戦争は存在しません");
  if (w.endedAt) throw new Error("すでに終結しています");
  if (w.progress == null || w.progress >= 1) return null;
  const parts = progressParts(map, w, w.progress, 1);
  const after = list.map((x) => (x.id === warId ? { ...x, progress: 1 } : x));
  parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) });
  return makeCommand(`戦闘を最後まで進める（${w.name}）`, ["places"], parts);
}

/** 戦闘が終わって、講和を待っている戦争（進行度が1。旧データは進行度なし＝終わっているとみなす） */
export const warFought = (w) => !!w.result && !w.endedAt && (w.progress == null || w.progress >= 1);
export const warOngoing = (w) => !!w.result && !w.endedAt && w.progress != null && w.progress < 1;

/** 戦争開始前の見積もり（招集した部隊でのバー表示）。同盟の参戦も反映する */
export function planWarPreview(map, { attackers, defenders, muster = null, type = "conventional" }) {
  const { attackers: a, defenders: d, joined } = expandWithAllies(map, [...new Set(attackers)], [...new Set(defenders)]);
  return { ...previewWar(map, a, d, warTypeOf(type).allMuster ? null : muster), attackers: a, defenders: d, joined };
}

/** 核作戦などのあとで、まだ講和していない戦争の結果を、いまの戦力・士気で再判定する（記録も残す） */
export function planReevaluateWars(map, stateIds, note) {
  const list = listWars(map);
  let changed = false;
  const after = list.map((w) => {
    if (w.endedAt || !w.result || ![...w.attackers, ...w.defenders].some((id) => stateIds.includes(id))) return w;
    const r = reevaluateWar(map, w); if (!r) return w;
    changed = true;
    return { ...w, result: { ...w.result, ...r }, battles: note ? [...w.battles, { date: null, name: note, place: "", winner: r.winner === "defender" ? "defender" : "attacker", text: note, attackerState: w.attackers[0], defenderState: w.defenders[0] }] : w.battles };
  });
  return changed ? { apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) } : null;
}

/** 戦争名を変える（重複は不可） */
export function planRenameWar(map, warId, name) {
  const list = listWars(map);
  const w = list.find((x) => x.id === warId);
  if (!w) throw new Error("その戦争は存在しません");
  const n = (name ?? "").trim();
  if (!n) throw new Error("戦争の名前を入力してください");
  if (n === w.name) return null;
  if (warNameTaken(map, n, warId)) throw new Error(`「${n}」という戦争はすでにあります`);
  const after = list.map((x) => (x.id === warId ? { ...x, name: n } : x));
  return makeCommand("戦争名の変更", [], [{ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) }]);
}

/** 講和待ちの戦争（判定は出たが、講和条約がまだ結ばれていないもの） */
export function warsAwaitingTreaty(map) { return listWars(map).filter(warFought); }
/** 戦闘中（まだ時間が進んでいる）の戦争 */
export function warsOngoing(map) { return listWars(map).filter(warOngoing); }

/** 講和の場所と条約名の提案（地名は関係国の都市、または全交戦国と中立の国の都市）。条約名は他とかぶらない */
export function planPeaceVenue(map, warId, rnd) {
  const w = listWars(map).find((x) => x.id === warId);
  if (!w) return null;
  const usedPlaces = new Set(listWars(map).map((x) => x.treatyVenue).filter(Boolean));
  let v = null;
  for (let i = 0; i < 8; i++) { const c = proposePeaceVenue(map, w, rnd); if (!c) break; v = c; if (!usedPlaces.has(c.place)) break; } // 過去の講和地は避ける
  return v ? { ...v, treatyName: uniqueTreatyName(map, v.treatyName) } : null;
}

/** 講和の勝者側・敗者側 */
export function peaceSides(war) {
  const winnerSide = war.result?.winner === "defender" ? "defenders" : "attackers";
  return { winners: war[winnerSide], losers: war[winnerSide === "attackers" ? "defenders" : "attackers"], stalemate: war.result?.winner === "stalemate" };
}

/** 講和で相手に渡る量の見積もり（UI表示用） */
export function estimatePeace(map, warId, { loserId, cellGroups, reparations = 0 }) {
  const loser = map.pack.states[loserId];
  return peaceImpact(map, loserId, cellGroups, reparations, loser ? getFinance(loser).treasury : null);
}

/** 召集する部隊を保存する。muster は { [国家ID]: [部隊ID, ...] }。参戦国以外・存在しない部隊は取り除く */
export function planSetMuster(map, warId, muster) {
  const list = listWars(map);
  const war = list.find((w) => w.id === warId);
  if (!war) throw new Error("その戦争は存在しません");
  if (war.endedAt) throw new Error("終結した戦争の召集は変えられません");
  const sides = new Set([...war.attackers, ...war.defenders]);
  const clean = {};
  for (const [sid, ids] of Object.entries(muster ?? {})) {
    const st = map.pack.states[Number(sid)];
    if (!sides.has(Number(sid)) || !Array.isArray(st?.military)) continue;
    const have = new Set(st.military.map((r) => r.i));
    const keep = [...new Set(ids)].filter((i) => have.has(i));
    if (keep.length) clean[sid] = keep;
  }
  const after = list.map((x) => (x.id !== warId ? x : { ...x, muster: clean }));
  return makeCommand("部隊の召集", [], [{ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) }]);
}

/** 戦闘結果を戦争記録に追記する（battle.js の planResolveBattle と組み合わせて呼ぶ） */
export function planRecordBattle(map, warId, { attackerState, defenderState, result, date }) {
  const list = listWars(map);
  const war = list.find((w) => w.id === warId);
  if (!war) throw new Error("その戦争は存在しません");
  if (war.endedAt) throw new Error("終結した戦争には記録できません");
  const entry = { year: date.year, month: date.month, attackerState, defenderState, winner: result.winner, aPower: result.aPower, dPower: result.dPower };
  const advGain = result.winner === "attacker" ? 1 : -1;
  const before = list;
  const after = list.map((w) => w.id !== warId ? w : {
    ...w, battles: [...w.battles, entry],
    advantage: { ...w.advantage, [attackerState]: (w.advantage[attackerState] ?? 0) + advGain, [defenderState]: (w.advantage[defenderState] ?? 0) - advGain },
  });
  return makeCommand("戦績を記録", [], [{ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, before) }]);
}

/**
 * 講和の割譲候補を機械的に算出する。
 * defenderId の領土のうち attackerId と隣接するセルを起点に、以下2種類の候補を作る:
 *   1. 属州単位: 前線セルが属する属州（属州は実データでは領土の一部にしか存在しないため）
 *   2. 未所属の前線: 属州の無い前線セルを、隣接する同条件のセルどうしでまとめた「地域」
 *      （フラッドフィルで連結成分を作る。深すぎる内陸までは広げず、前線から一定深さに留める）
 * どちらも「候補の提示」であり、実際に割譲するかはユーザーが選ぶ（planSignPeace）。
 */
export function suggestCessions(map, attackerId, defenderId, { maxDepth = 3 } = {}) {
  const c = map.pack.cells;
  const { cells: geomCells } = map.geometry.pack;
  const n = c.state.length;

  // 前線セル（防御側の領土で、攻撃側と直接隣接する）を起点に、maxDepth まで幅優先で広げる
  const depth = new Int16Array(n).fill(-1);
  const queue = [];
  for (let i = 0; i < n; i++) {
    if (c.state[i] !== defenderId || c.biome[i] === 0) continue;
    if (geomCells.c[i].some((j) => c.state[j] === attackerId)) { depth[i] = 0; queue.push(i); }
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (depth[i] >= maxDepth) continue;
    for (const j of geomCells.c[i]) {
      if (c.state[j] === defenderId && c.biome[j] !== 0 && depth[j] < 0) { depth[j] = depth[i] + 1; queue.push(j); }
    }
  }
  const frontierCells = queue; // depth>=0 のセル全て

  // 1) 属州単位の候補
  const provinceCandidates = new Map();
  for (const i of frontierCells) {
    const pid = c.province[i];
    if (pid > 0) provinceCandidates.set(pid, (provinceCandidates.get(pid) ?? 0) + 1);
  }
  const byProvince = [...provinceCandidates.keys()].map((pid) => {
    const p = map.pack.provinces[pid];
    return { type: "province", provinceId: pid, name: p?.fullName ?? p?.name ?? `属州#${pid}`, cells: p?.cells ?? provinceCandidates.get(pid) };
  });

  // 2) 属州の無い前線セルを、連結成分ごとに「地域」としてまとめる
  const noProvince = new Set(frontierCells.filter((i) => c.province[i] === 0));
  const regions = [];
  const visited = new Set();
  for (const start of noProvince) {
    if (visited.has(start)) continue;
    const comp = [start]; visited.add(start);
    for (let h = 0; h < comp.length; h++) {
      for (const j of geomCells.c[comp[h]]) {
        if (noProvince.has(j) && !visited.has(j)) { visited.add(j); comp.push(j); }
      }
    }
    regions.push(comp);
  }
  const byRegion = regions.map((cells, idx) => ({ type: "region", regionCells: cells, name: `未編入地域${idx + 1}（${cells.length}セル）`, cells: cells.length }));

  // 首都を含む候補は提示しない（首都は割譲できない）
  const capCells = new Set();
  for (const st of map.pack.states) {
    const cap = isLive(st) ? map.pack.burgs[st.capital] : null;
    if (cap && !cap.removed) capCells.add(cap.cell);
  }
  const provHasCapital = (pid) => { for (let i = 0; i < c.province.length; i++) if (c.province[i] === pid && capCells.has(i)) return true; return false; };
  return [...byProvince.filter((x) => !provHasCapital(x.provinceId)), ...byRegion.filter((x) => !x.regionCells.some((i) => capCells.has(i)))]
    .sort((a, b) => b.cells - a.cells);
}

// 1つの要求にかかる「戦争スコア」の費用（HoI4 の講和会議と同じく、勝者は戦争スコアの範囲でしか要求できない）
const COST = { cellBase: 1, burg: 6, reparPer2pct: 1, annex: 100 };
const capitalCellsOf = (map, ids) => { const set = new Set(); for (const sid of ids) { const cap = map.pack.burgs[map.pack.states[sid]?.capital]; if (cap && !cap.removed) set.add(cap.cell); } return set; };

/** 割譲の費用（敗者の産業が集中した土地・都市が多い土地ほど高い） */
export function cessionCost(map, fromId, cells) {
  const from = map.pack.states[fromId]; if (!from || !cells.length) return 0;
  const dens = Math.max(0, Math.min(2, ((from.industry ?? 0) / Math.max(1, from.cells ?? 1)) / 20));
  const set = new Set(cells);
  const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && set.has(b.cell)).length;
  return cells.length * (COST.cellBase + dens) + burgs * COST.burg;
}
export function reparationCost(map, fromId, amount) {
  const t = Math.max(1, getFinance(map.pack.states[fromId]).treasury);
  return (amount / t) * 100 * 0.5 * COST.reparPer2pct;
}

/** 勝者それぞれの取り分（戦力への貢献で決まる）。戦争スコアは、この割合で各勝者に配られる */
export function winnerShares(map, war) {
  const { winners } = peaceSides(war);
  const m = war.muster && Object.keys(war.muster).length ? war.muster : null;
  const w = {};
  let tot = 0;
  for (const id of winners) { const st = map.pack.states[id]; const x = isLive(st) ? previewWar(map, [id], [id], m).aStrength : null; w[id] = x ? Math.max(1, x.land + x.sea + x.air) : 1; tot += w[id]; }
  for (const id of winners) w[id] = tot ? w[id] / tot : 1 / winners.length;
  return w;
}

/** 条約の要求の、勝者ごとの費用と上限（戦争スコア×取り分）。UI の残量表示と、締結時の検査に使う */
export function treatyBudget(map, war, terms) {
  const { winners } = peaceSides(war);
  const score = war.result?.warScore ?? 0, shares = winnerShares(map, war);
  const spent = Object.fromEntries(winners.map((id) => [id, 0]));
  for (const c of terms.cessions ?? []) if (spent[c.toStateId] != null) spent[c.toStateId] += cessionCost(map, c.fromStateId, c.cells);
  for (const r of terms.reparations ?? []) if (spent[r.toStateId] != null && r.amount > 0) spent[r.toStateId] += reparationCost(map, r.fromStateId, r.amount);
  for (const x of terms.annex ?? []) if (spent[x.toStateId] != null) spent[x.toStateId] += COST.annex;
  return winners.map((id) => ({ stateId: id, share: shares[id], budget: Math.round(score * shares[id] * 10) / 10, spent: Math.round(spent[id] * 10) / 10 }));
}

/**
 * 講和条約を締結する（複数国対応）。terms:
 *   { kind:"standard"|"white"|"annex", treatyName, venue:{place,stateId}, notes,
 *     cessions:[{cells, fromStateId, toStateId, name}], reparations:[{fromStateId, toStateId, amount}], annex:[{fromStateId, toStateId}] }
 * 勝者は、戦争スコア×取り分の範囲でしか要求できない。首都は割譲できない。賠償金は支払国の通貨で、受取国の通貨に換算して渡る。
 * 締結した内容は war.terms に残り、あとから確認できる。
 */
export function planSignTreaty(map, warId, terms, date, { enforceBudget = true, allowOngoing = false } = {}) {
  const list = listWars(map);
  const war = list.find((w) => w.id === warId);
  if (!war) throw new Error("その戦争は存在しません");
  if (war.endedAt) throw new Error("既に終結しています");
  if (!allowOngoing && warOngoing(war)) throw new Error("戦闘がまだ続いています。最後まで進めてから講和してください");
  const { winners, losers } = peaceSides(war);
  const all = [...war.attackers, ...war.defenders];
  const kind = terms.kind ?? "standard";
  const cessions = kind === "standard" ? (terms.cessions ?? []).filter((c) => c.cells?.length) : [];
  const reparations = kind === "standard" ? (terms.reparations ?? []).filter((r) => r.amount > 0) : [];
  const annex = kind === "annex" ? (terms.annex ?? []) : [];
  for (const x of [...cessions, ...reparations, ...annex]) {
    if (!all.includes(x.fromStateId) || !all.includes(x.toStateId)) throw new Error("条約の当事国は交戦国から選んでください");
    if (!isLive(map.pack.states[x.fromStateId]) || !isLive(map.pack.states[x.toStateId])) throw new Error("存在しない国家が含まれています");
    if (x.fromStateId === x.toStateId) throw new Error("同じ国どうしでは要求できません");
  }
  const caps = capitalCellsOf(map, all);
  for (const c of cessions) if (c.cells.some((i) => caps.has(i))) throw new Error("首都を含む地域は割譲できません");
  if (enforceBudget && war.result && winners.length) {
    const rows = treatyBudget(map, war, { cessions, reparations, annex });
    const over = rows.find((r) => r.spent > r.budget + 0.05);
    if (over) throw new Error(`${officialName(map.pack.states[over.stateId])}の要求が戦争スコアを超えています（使用 ${over.spent} / 上限 ${over.budget}）`);
    if (annex.length && (war.result.warScore ?? 0) < 85) throw new Error("全面降伏（併合）を求めるには、戦争スコアが85以上の決定的な勝利が必要です");
  }

  const c = map.pack.cells, parts = [], record = { cessions: [], reparations: [], annex: [] };
  for (const cs of cessions) {
    const changes = cs.cells.map((i) => [i, c.state[i], cs.toStateId]);
    parts.push(setIndexed((m) => m.pack.cells.state, changes));
    const set = new Set(cs.cells);
    for (const b of map.pack.burgs) if (b && b.i && !b.removed && set.has(b.cell)) parts.push(setProps(b, { state: cs.toStateId }));
    record.cessions.push({ name: cs.name ?? "", fromStateId: cs.fromStateId, toStateId: cs.toStateId, cells: cs.cells.length, burgs: map.pack.burgs.filter((b) => b && b.i && !b.removed && set.has(b.cell)).map((b) => b.name) });
  }
  // 賠償金：同じ国の国庫が複数の条項で動くので、国ごとにまとめて1回だけ書き換える
  const delta = new Map();
  const fin = (id) => getFinance(map.pack.states[id]).treasury;
  for (const r of reparations) {
    const received = convert(map, r.fromStateId, r.toStateId, r.amount);
    delta.set(r.fromStateId, (delta.get(r.fromStateId) ?? 0) - r.amount);
    delta.set(r.toStateId, (delta.get(r.toStateId) ?? 0) + received);
    record.reparations.push({ fromStateId: r.fromStateId, toStateId: r.toStateId, amount: r.amount, currency: getCurrency(map.pack.states[r.fromStateId]).name, received: Math.round(received * 100) / 100, receivedCurrency: getCurrency(map.pack.states[r.toStateId]).name });
  }
  for (const [id, d] of delta) parts.push(setProps(map.pack.states[id], { treasury: Math.round((fin(id) + d) * 100) / 100 }));
  for (const x of annex) record.annex.push({ fromStateId: x.fromStateId, toStateId: x.toStateId });

  const treatyName = uniqueTreatyName(map, terms.treatyName || `${war.name}の講和条約`);
  const full = { kind, treatyName, venue: terms.venue ?? null, notes: terms.notes ?? "", signedAt: date, ...record, score: { total: war.result?.warScore ?? 0, byWinner: war.result ? treatyBudget(map, war, { cessions, reparations, annex }) : [] } };
  const endDate = war.endsAt ?? date;
  const after = list.map((w) => (w.id !== warId ? w : { ...w, endedAt: endDate, terms: full, treatyName, treatyVenue: terms.venue?.place ?? null }));
  parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) });
  // 講和すれば敵対は終わり、中立に戻る（他の戦争で敵対中の組は、その戦争が終わるまで敵対のまま）
  const stillHostile = new Set();
  for (const w of list) if (w.id !== warId && !w.endedAt) for (const x of w.attackers) for (const y of w.defenders) stillHostile.add(x < y ? `${x}-${y}` : `${y}-${x}`);
  const toNeutral = crossPairs(war.attackers, war.defenders).filter(([x, y]) => !stillHostile.has(x < y ? `${x}-${y}` : `${y}-${x}`));
  parts.push(...diplomacyParts(map, toNeutral, "Neutral"));
  return makeCommand(`講和条約（${war.name}）`, ["politics"], parts);
}

/**
 * 旧い形式の講和（1つの受取国・領域の配列・賠償金1つ）。内部では新しい形式に直して締結する。戦争スコアの上限は設けない。
 * @param {{provinceIds?:number[], regionCells?:number[][], toStateId:number, fromStateId?:number, reparations?:number}} terms
 */
export function planSignPeace(map, warId, terms, date) {
  const war = listWars(map).find((w) => w.id === warId);
  if (!war) throw new Error("その戦争は存在しません");
  if (!isLive(map.pack.states[terms.toStateId])) throw new Error("割譲先の国家が存在しません");
  const { winners, losers } = peaceSides(war);
  if (!winners.includes(terms.toStateId) && !losers.includes(terms.toStateId)) throw new Error("受け取る国は交戦国から選んでください");
  const c = map.pack.cells;
  const groups = [...(terms.regionCells ?? [])];
  for (const pid of terms.provinceIds ?? []) { const cells = []; for (let i = 0; i < c.province.length; i++) if (c.province[i] === pid) cells.push(i); groups.push(cells); }
  const payerId = terms.fromStateId ?? (winners.includes(terms.toStateId) ? losers[0] : winners[0]);
  const cessions = groups.map((cells) => ({ cells, fromStateId: c.state[cells[0]] || payerId, toStateId: terms.toStateId }));
  const reparations = terms.reparations ? [{ fromStateId: payerId, toStateId: terms.toStateId, amount: terms.reparations }] : [];
  return planSignTreaty(map, warId, { kind: "standard", cessions, reparations, treatyName: terms.treatyName, venue: terms.venue, notes: terms.notes }, date, { enforceBudget: false, allowOngoing: true });
}


// ---------------------------------------------------------------------------
// 講和の自動案：消耗に比例した割譲・賠償の目安と、小さな区画での割譲候補
// ---------------------------------------------------------------------------
const cellsOfState = (map, id) => { const out = []; const c = map.pack.cells.state; for (let i = 0; i < c.length; i++) if (c[i] === id) out.push(i); return out; };
const capitalCellOf = (map, id) => { const b = map.pack.burgs[map.pack.states[id]?.capital]; return b && !b.removed ? b.cell : -1; };

/**
 * 消耗に比例した講和の目安。勝者が受け取るもの（割譲する広さ・賠償金）と、各国の消耗の一覧を返す。
 *   ・戦争の勝敗が大きく、敗者の兵力の消耗が大きいほど、多くを求める
 *   ・賠償金は、勝者側の兵員損害にかかった費用を、敗者の国庫の範囲で請求する（敗者の通貨）
 *   ・引き分けは白紙和平を勧める
 */
export function suggestTreaty(map, war) {
  const r = war.result; if (!r) return null;
  const { winners, losers, stalemate } = peaceSides(war);
  const cas = r.casualties ?? {};
  const shares = winnerShares(map, war);
  const lossFracOf = (id) => { const c = cas[id]; return c && c.before > 0 ? c.lost / c.before : 0; };
  const cellsOf = (id) => map.pack.states[id]?.cells ?? cellsOfState(map, id).length;
  const demand = stalemate ? 0 : Math.max(0, Math.min(0.5, 0.02 + 0.3 * r.decisiveness * 1.2));
  const reparations = [], cessionByLoser = {};
  for (const L of losers) {
    const st = map.pack.states[L]; if (!isLive(st)) continue;
    const treasury = Math.max(0, getFinance(st).treasury);
    const share = stalemate ? 0 : Math.max(0, Math.min(0.6, 0.05 + 0.5 * r.decisiveness * lossFracOf(L)));
    cessionByLoser[L] = Math.round(cellsOf(L) * demand * (lossFracOf(L) + 0.5));
    for (const W of winners) { const amount = Math.round(treasury * share * shares[W] * 100) / 100; if (amount > 0) reparations.push({ fromStateId: L, toStateId: W, amount }); }
  }
  return {
    kind: stalemate ? "white" : "standard", warScore: r.warScore ?? 0, shares, cessionByLoser, reparations,
    cessionCells: Object.values(cessionByLoser).reduce((n, x) => n + x, 0),
    exhaustion: [...winners, ...losers].map((id) => ({ stateId: id, side: winners.includes(id) ? "winner" : "loser", lost: cas[id]?.lost ?? 0, before: cas[id]?.before ?? 0, moraleDelta: r.moraleDelta?.[id] ?? 0 })),
  };
}

/**
 * 割譲候補を、既存の州にとらわれず小さな区画（数セル）で出す。勝者の領土に接した敗者の国境から順に切り出す。
 * 首都のセルは含めない。区画の大きさは size: "s"（小）| "m"（中）| "l"（大）。
 */
export function suggestCessionChunks(map, toIds, fromId, { size = "m", maxChunks = 10 } = {}) {
  const winners = Array.isArray(toIds) ? toIds : [toIds];
  const nb = map.geometry?.pack?.cells?.c; if (!nb) return [];
  const st = map.pack.cells.state, cap = capitalCellOf(map, fromId);
  const mine = cellsOfState(map, fromId); if (!mine.length) return [];
  const pct = { s: 0.015, m: 0.04, l: 0.09 }[size] ?? 0.04;
  const target = Math.max(2, Math.round(mine.length * pct));
  const used = new Set(); const chunks = [];
  const adjWinner = (i) => { const cnt = new Map(); for (const j of nb[i]) if (winners.includes(st[j])) cnt.set(st[j], (cnt.get(st[j]) ?? 0) + 1); return [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
  let seeds = mine.filter((i) => i !== cap && adjWinner(i) != null);
  if (!seeds.length) seeds = mine.filter((i) => i !== cap && nb[i].some((j) => st[j] !== fromId)); // 国境を接していないときは、他国や海に近い所から
  const burgAt = new Map(); for (const b of map.pack.burgs) if (b && b.i && !b.removed) burgAt.set(b.cell, b);
  const provName = (cell) => { const p = map.pack.provinces[map.pack.cells.province[cell]]; return p && !p.removed && p.i ? (p.fullName ?? p.name) : null; };
  for (const seed of seeds) {
    if (chunks.length >= maxChunks) break;
    if (used.has(seed)) continue;
    const cells = [seed], seen = new Set([seed]), q = [seed];
    while (q.length && cells.length < target) {
      const k = q.shift();
      for (const j of nb[k]) if (!seen.has(j) && st[j] === fromId && j !== cap && !used.has(j)) { seen.add(j); cells.push(j); q.push(j); if (cells.length >= target) break; }
    }
    for (const i of cells) used.add(i);
    const burg = cells.map((i) => burgAt.get(i)).find(Boolean);
    const base = burg?.name ?? provName(seed) ?? `区画${chunks.length + 1}`;
    // 受け取る勝者の初期値：その区画に最も接している勝者
    const tally = new Map(); for (const i of cells) { const w = adjWinner(i); if (w != null) tally.set(w, (tally.get(w) ?? 0) + 1); }
    const to = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? winners[0];
    chunks.push({ type: "region", name: `${base}周辺`, cells: cells.length, regionCells: cells, fromStateId: fromId, toStateId: to, burgs: cells.filter((i) => burgAt.has(i)).length });
  }
  return chunks;
}

/** 条約名が他の条約と重ならないようにする（◯◯条約 → ◯◯和約 → ◯◯平和条約 → 番号） */
export function uniqueTreatyName(map, base) {
  const taken = new Set(listWars(map).map((w) => w.treatyName).filter(Boolean));
  if (!taken.has(base)) return base;
  const place = base.replace(/(講和)?条約$/, "");
  for (const cand of [`${place}和約`, `${place}平和条約`, `${place}講和条約`, `${place}協定`]) if (!taken.has(cand)) return cand;
  let k = 2; while (taken.has(`${place}条約（${k}）`)) k++;
  return `${place}条約（${k}）`;
}
