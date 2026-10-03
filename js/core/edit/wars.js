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
import { resolveWar, nameWar, applyLossFraction } from "../sim/war-engine.js";
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
export function planDeclareAndResolveWar(map, { attackers, defenders, date, rnd }) {
  const a0 = [...new Set(attackers)], d0 = [...new Set(defenders)];
  if (!a0.length || !d0.length) throw new Error("攻撃側・防御側とも1カ国以上必要です");
  for (const id of [...a0, ...d0]) if (!isLive(map.pack.states[id])) throw new Error(`国家#${id}は存在しません`);
  if (a0.some((id) => d0.includes(id))) throw new Error("同じ国家が両陣営に入っています");
  // 同盟の拘束力に従って、同盟国が自動で参戦する
  const { attackers: a, defenders: d, joined } = expandWithAllies(map, a0, d0);
  const result = resolveWar(map, a, d, rnd);
  const name = nameWar(map, { attackers: a, defenders: d, winner: result.winner, rnd, existingNames: listWars(map).map((w) => w.name) });
  // 規模・地形・決着の差から、終戦日を自動で決める
  const months = estimateDurationMonths(map, a, d, result, rnd);
  const war = {
    id: nextWarId(map), name, attackers: a, defenders: d, startedAt: date, endsAt: addMonths(date, months), durationMonths: months, endedAt: null,
    joinedAllies: joined, battles: [], advantage: {}, muster: {},
    result: { winner: result.winner, decisiveness: result.decisiveness, compare: result.compare, aStrength: result.aStrength, dStrength: result.dStrength },
  };
  const parts = [];
  for (const [sid, frac] of Object.entries(result.losses)) {
    const st = map.pack.states[Number(sid)];
    for (const r of regimentsOf(st)) parts.push(setProps(r, { u: applyLossFraction(r.u, frac) }));
  }
  parts.push(...diplomacyParts(map, crossPairs(a, d), "Enemy")); // 戦争をしたら敵対
  const before = listWars(map);
  parts.push({ apply: (m) => writeWars(m, [...before, war]), revert: (m) => writeWars(m, before) });
  return { command: makeCommand(`宣戦布告（${war.name}）`, ["places"], parts), id: war.id, result: war.result, name, joined, endsAt: war.endsAt };
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
export function warsAwaitingTreaty(map) { return listWars(map).filter((w) => w.result && !w.endedAt); }

/** 講和の場所と条約名の提案（地名は関係国の都市、または全交戦国と中立の国の都市） */
export function planPeaceVenue(map, warId, rnd) {
  const w = listWars(map).find((x) => x.id === warId);
  return w ? proposePeaceVenue(map, w, rnd) : null;
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

/**
 * 講和条約を締結する。戦争を終結させ、選ばれた地域を攻撃側の代表国へ割譲し、賠償金（任意）を記録する。
 *
 * @param {{provinceIds?:number[], regionCells?:number[][], toStateId:number, reparations?:number}} terms
 *   provinceIds: suggestCessions の type="province" 候補（provinceId の配列）
 *   regionCells: suggestCessions の type="region" 候補（各候補の regionCells をそのまま渡す。配列の配列）
 */
export function planSignPeace(map, warId, terms, date) {
  const list = listWars(map);
  const war = list.find((w) => w.id === warId);
  if (!war) throw new Error("その戦争は存在しません");
  if (war.endedAt) throw new Error("既に終結しています");
  if (!isLive(map.pack.states[terms.toStateId])) throw new Error("割譲先の国家が存在しません");
  const endDate = war.endsAt ?? date; // 終戦日は戦争ごとに自動で決まっている
  const { winners, losers } = peaceSides(war);
  if (!winners.includes(terms.toStateId) && !losers.includes(terms.toStateId)) throw new Error("受け取る国は交戦国から選んでください");

  const parts = [];
  const c = map.pack.cells;
  // 首都は割譲できない（首都のあるセル・属州を含む指定は拒否する）
  const capitalCells = new Set();
  for (const sid of [...war.attackers, ...war.defenders]) {
    const cap = map.pack.burgs[map.pack.states[sid]?.capital];
    if (cap && !cap.removed) capitalCells.add(cap.cell);
  }
  const touchesCapital = (cells) => cells.some((i) => capitalCells.has(i));
  for (const pid of terms.provinceIds ?? []) {
    const cells = []; for (let i = 0; i < c.province.length; i++) if (c.province[i] === pid) cells.push(i);
    if (touchesCapital(cells)) throw new Error("首都を含む地域は割譲できません");
  }
  for (const cells of terms.regionCells ?? []) if (touchesCapital(cells)) throw new Error("首都を含む地域は割譲できません");
  const moveCells = (cells) => {
    if (!cells.length) return;
    const changes = cells.map((i) => [i, c.state[i], terms.toStateId]);
    parts.push(setIndexed((m) => m.pack.cells.state, changes));
    for (const b of map.pack.burgs) {
      if (b && b.i && !b.removed && cells.includes(b.cell)) parts.push(setProps(b, { state: terms.toStateId }));
    }
  };
  for (const pid of terms.provinceIds ?? []) {
    // 属州は分割せず丸ごと移す（前線の一部だけが接している場合でも、属州全体が割譲対象になる）
    const cells = []; for (let i = 0; i < c.province.length; i++) if (c.province[i] === pid) cells.push(i);
    moveCells(cells);
    const province = map.pack.provinces[pid];
    if (province) parts.push(setProps(province, { state: terms.toStateId }));
  }
  for (const cells of terms.regionCells ?? []) moveCells(cells);
  if (terms.reparations) {
    // 賠償金は敗者（割譲を受ける側の相手）の国庫から勝者の国庫へ。額は支払国の通貨で指定し、受取国の通貨に換算する
    const payerId = terms.fromStateId ?? (winners.includes(terms.toStateId) ? losers[0] : winners[0]);
    const payer = map.pack.states[payerId], payee = map.pack.states[terms.toStateId];
    if (payer && payee) {
      const received = convert(map, payerId, terms.toStateId, terms.reparations);
      const fin = (st) => getFinance(st).treasury;
      parts.push(setProps(payer, { treasury: Math.round((fin(payer) - terms.reparations) * 100) / 100 }));
      parts.push(setProps(payee, { treasury: Math.round((fin(payee) + received) * 100) / 100 }));
      terms = { ...terms, reparationsCurrency: getCurrency(payer).name, reparationsReceived: Math.round(received * 100) / 100 };
    }
  }
  const before = list;
  const after = list.map((w) => w.id !== warId ? w : { ...w, endedAt: endDate, terms, treatyName: terms.treatyName || `${w.name}の講和条約` });
  parts.push({ apply: (m) => writeWars(m, after), revert: (m) => writeWars(m, before) });
  // 講和すれば敵対は終わり、中立に戻る（他の戦争で敵対中の組は、その戦争が終わるまで敵対のまま）
  const stillHostile = new Set();
  for (const w of list) if (w.id !== warId && !w.endedAt) for (const x of w.attackers) for (const y of w.defenders) stillHostile.add(x < y ? `${x}-${y}` : `${y}-${x}`);
  const toNeutral = crossPairs(war.attackers, war.defenders).filter(([x, y]) => !stillHostile.has(x < y ? `${x}-${y}` : `${y}-${x}`));
  parts.push(...diplomacyParts(map, toNeutral, "Neutral"));

  return makeCommand(`講和条約（${war.name}）`, ["politics"], parts);
}
