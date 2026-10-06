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
import { resolveWar, nameWar, applyLossFraction, mobilized, generateBattleLog, previewWar, reevaluateWar, warTypeOf, applyVictoryConditions, planSupportDeltas, supportOf, EXHAUST_SUPPORT, WAR_TYPES } from "../sim/war-engine.js";
import { officialName } from "../names.js";
import { newFx, rollWarMonth, fxParts, addMorale, addSupport, mulPop, mulTroops } from "../sim/war-events.js";
import { regimentsOf } from "../sim/military.js";
import { convert, getCurrency } from "../sim/currency.js";
import { getFinance } from "../sim/trade.js";
import { expandWithAllies, estimateDurationMonths, addMonths, proposePeaceVenue, peaceImpact } from "../sim/war-flow.js";
import { diplomacyParts, crossPairs } from "./diplomacy.js";
import { VASSAL_BY_KEY, vassalInfo } from "./vassals.js";
import { leaderOf } from "./alliances.js";

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
  let months = Math.max(1, Math.round(estimateDurationMonths(map, a, d, result, rnd) * speed * T.duration));
  // 民意の変化 → 勝利条件（首都陥落・兵力の壊滅・民意の崩壊）。首都が陥落すれば、戦争は早く終わる
  const supportDelta = planSupportDeltas(result, { attackers: a, defenders: d, months, type: T.key });
  const vic = applyVictoryConditions(map, result, { attackers: a, defenders: d, type: T.key, supportDelta, rnd });
  if (vic.durationFactor !== 1) months = Math.max(1, Math.round(months * vic.durationFactor));
  result.winner = vic.winner; result.warScore = vic.warScore; result.moraleDelta = vic.moraleDelta;
  if (vic.winner !== "stalemate" && vic.victory.type === "exhaustion") result.decisiveness = Math.max(result.decisiveness, 0.2);
  const supportDelta2 = planSupportDeltas(result, { attackers: a, defenders: d, months, type: T.key }); // 勝者が確定したので、勝者の民意の回復を反映して計算し直す
  const endsAt = addMonths(date, months);
  const battles = generateBattleLog(map, { attackers: a, defenders: d, result, startedAt: date, durationMonths: months, capitalFall: vic.capitalFall }, rnd, addMonths);
  // 戦争の名前は、実際に戦いが行われた場所から付ける
  const name = nameWar(map, { attackers: a, defenders: d, rnd, existingNames: listWars(map).map((w) => w.name), battles, type: T.key });
  const war = {
    id: nextWarId(map), name, type: T.key, attackers: a, defenders: d, startedAt: date, endsAt, durationMonths: months, endedAt: null,
    progress: 0, monthsDone: 0, events: [], omens: [], edgeShift: 0, withdrawn: {}, // progress: 経過月数 ÷ 目安の月数（1を超えて長引くこともある）。終わりは決まっておらず、講和条約を結んだ月が終戦の月になる
    joinedAllies: joined, battles, advantage: {}, muster: cleanMuster,
    result: {
      winner: result.winner, decisiveness: result.decisiveness, warScore: result.warScore, type: T.key, compare: result.compare, aStrength: result.aStrength, dStrength: result.dStrength,
      noise: result.noise, doctrine: result.doctrine, casualties: result.casualties, moraleDelta: result.moraleDelta, popLossShare: result.popLossShare, losses: result.losses,
      supportDelta: supportDelta2, victory: vic.victory, capitalFall: vic.capitalFall,
    },
  };
  const parts = [];
  parts.push(...diplomacyParts(map, crossPairs(a, d), "Enemy")); // 戦争をしたら敵対
  const before = listWars(map);
  parts.push({ apply: (mm) => writeWars(mm, [...before, war]), revert: (mm) => writeWars(mm, before) });
  return { command: makeCommand(`戦争開始（${war.name}）`, ["places"], parts), id: war.id, result: war.result, name, joined, endsAt, battles, type: T.key };
}

const monthsBetween = (from, to) => (to.year - from.year) * 12 + (to.month - from.month);
/** 目安の期間(1.0)を超えて長引いた分は、損害の増え方が鈍る（消耗戦になる） */
const effExp = (p) => (p <= 1 ? p : 1 + 0.35 * (p - 1));

/** 戦争の進行（月ごとの損害・士気・民意・民間の被害）を、進行度 q0→q1（effExp の値）の分だけ fx に積む */
function addProgressFx(map, war, fx, q0, q1) {
  const r = war.result; if (!r || q1 <= q0) return;
  const dq = q1 - q0;
  for (const sidStr of Object.keys(r.losses ?? {})) {
    const id = Number(sidStr), st = map.pack.states[id]; if (!isLive(st) || war.withdrawn?.[id]) continue; // 引き上げた国は、もう消耗しない
    mulTroops(fx, map, war, id, Math.pow(1 - (r.losses[id] ?? 0), dq));
    mulPop(fx, id, Math.pow(1 - (r.popLossShare?.[id] ?? 0), dq));
    addMorale(fx, id, (r.moraleDelta?.[id] ?? 0) * dq);
    addSupport(fx, id, (r.supportDelta?.[id] ?? 0) * dq);
  }
}

/** 戦争形態ごとの、長期戦で到達できる戦争スコアの上限（限定戦・非対称戦では、敗者を併合するほどは占領できない） */
const SCORE_CAP = { limited: 50, conventional: 100, total: 100, asymmetric: 65 };

/**
 * 戦争の「いま」の戦争スコア。講和で要求できる大きさの上限になる。
 *   ・目安の期間までは、開戦時の判定（warScore）に向けて上がっていく
 *   ・目安の期間を過ぎても戦争が続けば、占領が進むものとして毎月上がり続ける（形態ごとの上限まで）
 *     → 何十年も戦えば、敗者を全面降伏に追い込める
 */
export function currentWarScore(war) {
  const r = war?.result; if (!r) return 0;
  if (r.winner === "stalemate") return 0;
  const p = r.victory?.collapse ? 1 : war.progress == null ? 1 : Math.min(1, Math.max(0, war.progress)); // 民意の崩壊で降伏したときは、すぐに全額を要求できる
  const base = Math.round((r.warScore ?? 0) * Math.min(1, 0.12 + 0.88 * p));
  const dur = Math.max(1, war.durationMonths ?? 12);
  const done = war.monthsDone ?? Math.round((war.progress ?? 0) * dur);
  const over = Math.max(0, done - dur);
  if (!over) return base;
  const T = WAR_TYPES[war.type] ?? WAR_TYPES.conventional;
  const cap = SCORE_CAP[T.key] ?? 100;
  return Math.round(Math.min(Math.max(base, cap), base + over * 2 * T.scoreScale)); // 1か月あたり +1.6（通常戦）〜 +2（総力戦）
}

/**
 * 民意の崩壊：戦争中に、ある陣営の国の民意が EXHAUST_SUPPORT 以下まで落ちたら、その陣営は戦争を続けられず降伏する（相手の勝ち）。
 * 双方が崩壊したときは、民意の低いほうが負ける。すでに民意の崩壊で決着している戦争は、そのまま。
 * @returns 更新後の戦争。崩壊が起きていなければ null
 */
function exhaustionCollapse(map, war, fx, date) {
  const r = war.result; if (!r || r.victory?.type === "exhaustion") return null;
  const now = (id) => Math.max(0, Math.min(100, supportOf(map.pack.states[id]) + (fx.support.get(id) ?? 0)));
  const worst = (ids) => ids.map((id) => ({ id, v: now(id) })).filter((x) => x.v <= EXHAUST_SUPPORT).sort((a, b) => a.v - b.v)[0] ?? null;
  const a = worst(war.attackers ?? []), d = worst(war.defenders ?? []);
  if (!a && !d) return null;
  const loseSide = a && d ? (a.v <= d.v ? "attacker" : "defender") : a ? "attacker" : "defender";
  const winner = loseSide === "attacker" ? "defender" : "attacker";
  const loser = loseSide === "attacker" ? a : d;
  const T = WAR_TYPES[war.type] ?? WAR_TYPES.conventional;
  const warScore = Math.max(winner === r.winner ? (r.warScore ?? 0) : 0, Math.round(30 + 40 * T.scoreScale));
  const name = map.pack.states[loser.id]?.fullName ?? map.pack.states[loser.id]?.name ?? "敗者";
  const text = `${name}の民意が尽き、戦争を続けられなくなった（民意${Math.round(loser.v)}）。講和を求めて降伏する`;
  return { ...war,
    result: { ...r, winner, warScore, victory: { type: "exhaustion", text, collapse: true } },
    events: [...(war.events ?? []), { date, kind: "collapse", title: "民意の崩壊", text }] };
}

/**
 * 月が進むたびに呼ぶ。戦争中の損害を、経過した月ぶんだけ自動で展開し、ハプニング（rnd があるとき）を起こす。
 * 戦争にあらかじめ決まった終わりは無い。ユーザーが講和条約を結んだ月が、終戦の月になる。
 * @returns コマンド。変化が無ければ null。afterEvents は、状況が動いた戦争のID（呼び出し側で再判定する）
 */
export function planAdvanceWars(map, date, rnd = null) {
  const list = listWars(map);
  const fx = newFx(); const touched = [];
  const after = list.map((w) => {
    if (w.endedAt || !w.result || w.progress == null) return w;
    const dur = Math.max(1, w.durationMonths ?? 12);
    const done0 = w.monthsDone ?? Math.round((w.progress ?? 0) * dur);
    const el = monthsBetween(w.startedAt, date);
    if (el <= done0) return w;
    let cur = { ...w, events: [...(w.events ?? [])], omens: [...(w.omens ?? [])], edgeShift: w.edgeShift ?? 0 };
    const last = Math.min(el, done0 + 24); // 長く放置した場合でも、一度に処理するのは2年分まで
    for (let k = done0 + 1; k <= last; k++) {
      addProgressFx(map, cur, fx, effExp((k - 1) / dur), effExp(k / dur));
      if (rnd) {
        const rr = rollWarMonth(map, cur, addMonths(w.startedAt, k), rnd, fx);
        if (rr.events.length) { cur.events.push(...rr.events); touched.push(w.id); }
        cur.omens = rr.omens; cur.edgeShift += rr.edgeShift; if (rr.mediator != null) cur.mediator = rr.mediator;
      }
    }
    cur.monthsDone = last; cur.progress = last / dur;
    const col = exhaustionCollapse(map, cur, fx, addMonths(w.startedAt, last));
    if (col) { cur = col; touched.push(w.id); }
    return cur;
  });
  if (after.every((w, i) => w === list[i])) return null;
  const parts = fxParts(map, fx, setProps);
  parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, list) });
  const cmd = makeCommand("戦争の進行（月ごとの損害とできごと）", ["places"], parts);
  cmd.touchedWars = [...new Set(touched)];
  return cmd;
}

/** 経過を、目安の期間の終わりまで進める（時間を待たずに、損害を目安の期間ぶん反映する） */
export function planFinishWar(map, warId, rnd = null) {
  const list = listWars(map), w = list.find((x) => x.id === warId);
  if (!w || !w.result) throw new Error("その戦争は存在しません");
  if (w.endedAt) throw new Error("すでに終結しています");
  const dur = Math.max(1, w.durationMonths ?? 12), done0 = w.monthsDone ?? Math.round((w.progress ?? 0) * dur);
  if (done0 >= dur) return null;
  return planAdvanceWars(map, addMonths(w.startedAt, dur), rnd);
}

/** 戦争が続いている（まだ講和していない）。講和条約は、いつでも結べる */
export const warOngoing = (w) => !!w.result && !w.endedAt;
export const warFought = warOngoing;

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
  return peaceImpact(map, loserId, cellGroups, reparations, loser ? wealthOf(loser) : null);
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

/**
 * 軍を引き上げる（戦線から部隊を外す）。regIds は戦線に残す部隊。空なら全軍撤退。
 *   ・引き上げた部隊は、もう損耗しない。戦力バーからも外れる
 *   ・撤退は士気に響く（−6×引き上げた割合）が、戦争への不満は和らぐ（民意 +3×割合）
 *   ・ある陣営の全員が全軍を引き上げると、その陣営は敗北を認めたことになり、相手の勝ちで決着する（講和はこのあと結ぶ）
 */
export function planWithdraw(map, warId, stateId, regIds, date) {
  const list = listWars(map), war = list.find((w) => w.id === warId);
  if (!war || !war.result) throw new Error("その戦争は存在しません");
  if (war.endedAt) throw new Error("終結した戦争では引き上げられません");
  const all = [...war.attackers, ...war.defenders];
  if (!all.includes(stateId)) throw new Error("その国はこの戦争に参加していません");
  const st = map.pack.states[stateId]; if (!isLive(st)) throw new Error("存在しない国家です");
  const have = (st.military ?? []).map((r) => r.i);
  const cur = new Set(war.muster?.[stateId] ?? have);
  const keep = [...new Set(regIds ?? [])].filter((i) => have.includes(i));
  const pulled = [...cur].filter((i) => !keep.includes(i)).length;
  const returned = keep.filter((i) => !cur.has(i)).length;
  if (!pulled && !returned) return null;
  // 全参戦国の召集を、明示的な形にそろえる（未指定＝全部隊 のままだと、引き上げが表せない）
  const muster = {}; for (const id of all) muster[id] = war.muster?.[id] ?? (map.pack.states[id]?.military ?? []).map((r) => r.i);
  muster[stateId] = keep;
  const withdrawn = { ...(war.withdrawn ?? {}) };
  if (!keep.length) withdrawn[stateId] = date ?? true; else delete withdrawn[stateId];
  const name = officialName(st), frac = have.length ? pulled / have.length : 1;
  const events = [...(war.events ?? [])];
  if (!keep.length) events.push({ date: date ?? null, kind: "withdraw", title: "全軍撤退", text: `${name}は全軍を戦線から引き上げた` });
  else if (pulled) events.push({ date: date ?? null, kind: "withdraw", title: "部隊の引き上げ", text: `${name}は一部の部隊（${pulled}隊）を戦線から引き上げた` });
  else events.push({ date: date ?? null, kind: "withdraw", title: "増派", text: `${name}は部隊（${returned}隊）を戦線へ戻した` });
  let result = war.result;
  // ある陣営が全員撤退したら、その陣営の敗北で決着する
  const sideDone = (ids) => ids.every((id) => withdrawn[id]);
  if (sideDone(war.attackers) !== sideDone(war.defenders)) {
    const loserIsAttacker = sideDone(war.attackers);
    result = { ...war.result, winner: loserIsAttacker ? "defender" : "attacker", victory: { type: "withdrawal", text: `${loserIsAttacker ? "攻撃側" : "防衛側"}が全軍を撤退させた` }, warScore: Math.max(war.result.warScore ?? 0, 30) };
    events.push({ date: date ?? null, kind: "withdraw", title: "戦争の決着", text: `${loserIsAttacker ? "攻撃側" : "防衛側"}の全員が撤退し、戦争は相手側の勝利で決着した` });
  }
  const parts = [{ apply: (m) => writeWars(m, list.map((w) => (w.id === warId ? { ...w, muster, withdrawn, events, result } : w))), revert: (m) => writeWars(m, list) }];
  if (pulled) parts.push(setProps(st, { morale: Math.max(0, (st.morale ?? 70) - 6 * frac), support: Math.min(100, (st.support ?? 70) + 3 * frac) }));
  return makeCommand(`${name}が軍を引き上げる`, ["places"], parts);
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
// 割譲は「敗者の領土の何割か」で費用を決める（地図の大きさに左右されない）。領土を全部奪うのが 70、都市は1つにつき +1.5
const COST = { landAll: 70, burg: 1.5, reparPer2pct: 1, annex: 60, annexMinScore: 70, vassal: { puppet: 60, protectorate: 45, vassal: 50 } };
const capitalCellsOf = (map, ids) => { const set = new Set(); for (const sid of ids) { const cap = map.pack.burgs[map.pack.states[sid]?.capital]; if (cap && !cap.removed) set.add(cap.cell); } return set; };

/** 割譲の費用（敗者の領土に占める割合で決まる。産業が集中した土地・都市が多い土地ほど高い） */
export function cessionCost(map, fromId, cells) {
  const from = map.pack.states[fromId]; if (!from || !cells.length) return 0;
  const dens = Math.max(0, Math.min(2, ((from.industry ?? 0) / Math.max(1, from.cells ?? 1)) / 20));
  const set = new Set(cells);
  const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && set.has(b.cell)).length;
  const frac = Math.min(1, cells.length / Math.max(1, from.cells ?? cells.length));
  return COST.landAll * frac * (1 + dens * 0.5) + burgs * COST.burg;
}
/** 国の富（賠償金の基準）。国庫が空の国（Azgaar 由来の国は国庫0が多い）でも、経済の大きさから見積もれるようにする */
export function wealthOf(state) {
  const pop = (state?.rural ?? 0) + (state?.urban ?? 0);
  return Math.max(getFinance(state).treasury, (state?.industry ?? 0) * 5 + pop * 0.2, 1);
}
export function reparationCost(map, fromId, amount) {
  const t = wealthOf(map.pack.states[fromId]);
  return (amount / t) * 100 * 0.5 * COST.reparPer2pct;
}

/** 勝者それぞれの取り分（戦力への貢献で決まる）。戦争スコアは、この割合で各勝者に配られる */
export function winnerShares(map, war) {
  const { winners } = peaceSides(war);
  const m = war.muster && Object.keys(war.muster).length ? war.muster : null;
  const w = {};
  let tot = 0;
  const leaders = new Set((map.ext?.data?.alliances ?? []).filter((a) => !a.dissolvedAt && a.members.filter((x) => winners.includes(x)).length >= 2).map((a) => leaderOf(a)));
  for (const id of winners) {
    const st = map.pack.states[id]; const x = isLive(st) ? previewWar(map, [id], [id], m).aStrength : null;
    w[id] = (x ? Math.max(1, x.land + x.sea + x.air) : 1) * (leaders.has(id) ? 1.4 : 1); // 同盟の盟主は、講和を主導するぶん取り分が多い
    tot += w[id];
  }
  for (const id of winners) w[id] = tot ? w[id] / tot : 1 / winners.length;
  return w;
}

/** 条約の要求の、勝者ごとの費用と上限（戦争スコア×取り分）。UI の残量表示と、締結時の検査に使う */
export function treatyBudget(map, war, terms) {
  const { winners } = peaceSides(war);
  const score = currentWarScore(war), shares = winnerShares(map, war);
  const spent = Object.fromEntries(winners.map((id) => [id, 0]));
  for (const c of terms.cessions ?? []) if (spent[c.toStateId] != null) spent[c.toStateId] += cessionCost(map, c.fromStateId, c.cells);
  for (const r of terms.reparations ?? []) if (spent[r.toStateId] != null && r.amount > 0) spent[r.toStateId] += reparationCost(map, r.fromStateId, r.amount);
  for (const x of terms.annex ?? []) if (spent[x.toStateId] != null) spent[x.toStateId] += COST.annex;
  for (const x of terms.vassalize ?? []) if (spent[x.toStateId] != null) spent[x.toStateId] += COST.vassal[x.kind] ?? 50;
  const annexers = new Set((terms.annex ?? []).map((x) => x.toStateId)); // 全面降伏は、主導する勝者が戦争スコアをそのまま使える
  return winners.map((id) => ({ stateId: id, share: shares[id], budget: Math.round(score * (annexers.has(id) ? 1 : shares[id]) * 10) / 10, spent: Math.round(spent[id] * 10) / 10 }));
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
  const { winners, losers } = peaceSides(war);
  const all = [...war.attackers, ...war.defenders];
  const kind = terms.kind ?? "standard";
  const cessions = kind === "standard" ? (terms.cessions ?? []).filter((c) => c.cells?.length) : [];
  const reparations = kind === "standard" ? (terms.reparations ?? []).filter((r) => r.amount > 0) : [];
  const annex = kind === "annex" ? (terms.annex ?? []) : [];
  const vassalize = kind === "vassal" ? (terms.vassalize ?? []) : [];
  for (const x of vassalize) if (!VASSAL_BY_KEY[x.kind]) throw new Error("従属の種類は 傀儡・保護国・属国 から選んでください");
  for (const x of [...cessions, ...reparations, ...annex, ...vassalize]) {
    if (!all.includes(x.fromStateId) || !all.includes(x.toStateId)) throw new Error("条約の当事国は交戦国から選んでください");
    if (!isLive(map.pack.states[x.fromStateId]) || !isLive(map.pack.states[x.toStateId])) throw new Error("存在しない国家が含まれています");
    if (x.fromStateId === x.toStateId) throw new Error("同じ国どうしでは要求できません");
  }
  const caps = capitalCellsOf(map, all);
  for (const c of cessions) if (c.cells.some((i) => caps.has(i))) throw new Error("首都を含む地域は割譲できません");
  if (enforceBudget && war.result && winners.length) {
    const rows = treatyBudget(map, war, { cessions, reparations, annex, vassalize });
    const over = rows.find((r) => r.spent > r.budget + 0.05);
    if (over) throw new Error(`${officialName(map.pack.states[over.stateId])}の要求が戦争スコアを超えています（使用 ${over.spent} / 上限 ${over.budget}）`);
    if (annex.length && currentWarScore(war) < COST.annexMinScore) throw new Error(`全面降伏（併合）を求めるには、戦争スコアが${COST.annexMinScore}以上の決定的な勝利が必要です。戦争が長引くほど（占領が進むほど）スコアは上がり続けます`);
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
  record.vassalize = [];
  for (const x of vassalize) { // 敗者を併合せず従属させる（傀儡・保護国・属国）
    parts.push(setProps(map.pack.states[x.fromStateId], { vassal: { overlord: x.toStateId, kind: x.kind, since: date } }));
    record.vassalize.push({ fromStateId: x.fromStateId, toStateId: x.toStateId, kind: x.kind });
  }

  const treatyName = uniqueTreatyName(map, terms.treatyName || `${war.name}の講和条約`);
  const full = { kind, treatyName, venue: terms.venue ?? null, notes: terms.notes ?? "", signedAt: date, ...record, score: { total: currentWarScore(war), max: war.result?.warScore ?? 0, byWinner: war.result ? treatyBudget(map, war, { cessions, reparations, annex, vassalize }) : [] } };
  // 終戦の月は、実際に講和条約を結んだ月。経過した月数も記録する
  const endDate = date;
  const after = list.map((w) => (w.id !== warId ? w : { ...w, endedAt: endDate, lastedMonths: Math.max(0, monthsBetween(w.startedAt, date)), terms: full, treatyName, treatyVenue: terms.venue?.place ?? null }));
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
    const treasury = wealthOf(st);
    const share = stalemate ? 0 : Math.max(0, Math.min(0.6, 0.05 + 0.5 * r.decisiveness * lossFracOf(L)));
    cessionByLoser[L] = Math.round(cellsOf(L) * demand * (lossFracOf(L) + 0.5));
    for (const W of winners) { const amount = Math.round(treasury * share * shares[W] * 100) / 100; if (amount > 0) reparations.push({ fromStateId: L, toStateId: W, amount }); }
  }
  return {
    kind: stalemate ? "white" : "standard", warScore: currentWarScore(war), warScoreMax: r.warScore ?? 0, shares, cessionByLoser, reparations,
    cessionCells: Object.values(cessionByLoser).reduce((n, x) => n + x, 0),
    exhaustion: [...winners, ...losers].map((id) => ({ stateId: id, side: winners.includes(id) ? "winner" : "loser", lost: cas[id]?.lost ?? 0, before: cas[id]?.before ?? 0, moraleDelta: r.moraleDelta?.[id] ?? 0, supportDelta: r.supportDelta?.[id] ?? 0, support: supportOf(map.pack.states[id]) })),
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
    chunks.push({ type: "region", name: `${base}周辺`, cells: cells.length, regionCells: cells, fromStateId: fromId, toStateId: to, burgs: cells.filter((i) => burgAt.has(i)).length, burgNames: cells.filter((i) => burgAt.has(i)).map((i) => burgAt.get(i).name) });
  }
  return chunks;
}

/**
 * 講和条約の自動案（要求の中身）。必ず戦争スコアの範囲に収まり、そのまま締結できる。
 *   ・割譲は、国境に近い区画から、消耗に比例した広さまで。各勝者の予算の6割までを割譲に使う
 *   ・賠償金は、残りの予算の範囲で、敗者の富に応じた額を、勝者の取り分に比例して分ける
 *   ・区画は、接している勝者に渡す。その勝者の予算が足りなければ、別の勝者に回す
 * @returns {{kind:string, cessions:object[], reparations:{fromStateId:number,toStateId:number,amount:number}[]}}
 *   cessions は suggestCessionChunks の区画に on（選択済みか）と toStateId（決まった受取国）を付けたもの
 */
export function suggestTerms(map, war, { size = "m" } = {}) {
  const sug = suggestTreaty(map, war); if (!sug) return null;
  const { winners, losers } = peaceSides(war);
  const budget = Object.fromEntries(treatyBudget(map, war, {}).map((r) => [r.stateId, r.budget]));
  const spent = Object.fromEntries(winners.map((w) => [w, 0]));
  const cessions = [];
  if (sug.kind !== "white") for (const L of losers) {
    const want = sug.cessionByLoser?.[L] ?? 0; let sum = 0;
    for (const c of suggestCessionChunks(map, winners, L, { size })) {
      let on = false, to = c.toStateId;
      let chunk = c;
      if (sum < want) {
        const cost = cessionCost(map, L, c.regionCells);
        for (const w of [to, ...winners.filter((x) => x !== to)]) if (spent[w] + cost <= budget[w] * 0.6 + 1e-6) { on = true; to = w; spent[w] += cost; sum += c.cells; break; }
        if (!on) { // 予算が足りないときは、区画を縮めて（国境側の数セルだけ）収める。2セル未満になるなら諦める
          const unit = cost / Math.max(1, c.regionCells.length);
          for (const w of [to, ...winners.filter((x) => x !== to)]) {
            const k = Math.floor((budget[w] * 0.6 - spent[w]) / Math.max(0.01, unit));
            if (k >= 2) {
              const cells = c.regionCells.slice(0, Math.min(k, c.regionCells.length)), set = new Set(cells);
              const names = map.pack.burgs.filter((b) => b && b.i && !b.removed && set.has(b.cell)).map((b) => b.name);
              chunk = { ...c, regionCells: cells, cells: cells.length, burgNames: names, burgs: names.length };
              const cc = cessionCost(map, L, cells); if (spent[w] + cc <= budget[w] * 0.6 + 1e-6) { on = true; to = w; spent[w] += cc; sum += cells.length; break; }
            }
          }
        }
      }
      cessions.push({ ...chunk, toStateId: to, on });
    }
  }
  const reparations = [];
  if (sug.kind !== "white") for (const r of sug.reparations) {
    const rem = Math.max(0, budget[r.toStateId] - spent[r.toStateId]), full = reparationCost(map, r.fromStateId, r.amount);
    const f = full <= 0 ? 0 : Math.min(1, rem / full), amount = Math.floor(r.amount * f * 100) / 100;
    if (amount > 0) { reparations.push({ ...r, amount }); spent[r.toStateId] += reparationCost(map, r.fromStateId, amount); }
  }
  return { kind: sug.kind, cessions, reparations };
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
