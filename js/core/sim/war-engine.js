// 戦争の判定。HoI4 を参考に、制海権・制空権・陸軍力・士気を比べて勝敗を決め、
// 兵力と人口の消耗、士気の変動、戦闘の記録（ドクトリンに基づく）を作る。補給は扱わない。
//
// ・「戦争開始」を押した瞬間に判定する（時間経過では進まない）
// ・招集した部隊(muster)の戦力で戦う。指定が無い国は全部隊
// ・核兵器は通常の戦争では使われない（core/sim/nuclear.js の核作戦で別に扱う）
// 純粋ロジック層：DOM に依存しない。乱数は core/random.js の createRandom を注入する。

import { UNIT_KEYS, UNIT_BY_KEY, DEFAULT_DOCTRINE, DOCTRINE_BY_KEY, stateTypeMult, forceHeadcount } from "./units.js";
import { regimentsOf, isCoastalState } from "./military.js";
import { officialName } from "../names.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const LAND = ["infantry", "cavalry", "archers", "artillery", "armor", "special", "advanced"];
const AIR = ["air"], SEA = ["navy"];
export const BASE_MORALE = 70;

/**
 * 戦争の形態。常に総力戦ではなく、規模と性格を選べる。
 *   lossScale: 兵力の損害の大きさ / popScale: 民間の被害 / duration: 戦争の長さ / scoreScale: 勝者が講和で要求できる大きさ（戦争スコア）
 *   allMuster: true なら、部隊の選択に関係なく全部隊が出る（総力戦）
 */
export const WAR_TYPES = Object.freeze({
  limited: { key: "limited", label: "限定戦（国境紛争）", lossScale: 0.55, popScale: 0.4, duration: 0.5, scoreScale: 0.4, allMuster: false,
    desc: "国境付近の小規模な衝突。損害も期間も小さく、要求できるものも小さい。" },
  conventional: { key: "conventional", label: "通常戦", lossScale: 1, popScale: 1, duration: 1, scoreScale: 0.8, allMuster: false,
    desc: "招集した部隊どうしの正規戦。標準的な損害と期間。" },
  total: { key: "total", label: "総力戦", lossScale: 1.3, popScale: 1.6, duration: 1.3, scoreScale: 1, allMuster: true,
    desc: "国のすべてを注ぎ込む。全部隊が参戦し、損害も民間の被害も大きい。全面降伏まで要求できる。" },
  asymmetric: { key: "asymmetric", label: "非対称戦（ゲリラ・占領戦）", lossScale: 1, popScale: 1.3, duration: 2.2, scoreScale: 0.5, allMuster: false,
    desc: "弱い側が地形と民衆を盾にゲリラ戦を行う。強い側は制空・制海が効きにくく、士気が長期で削られる。決着がつきにくく、長引く。" },
});
export const warTypeOf = (key) => WAR_TYPES[key] ?? WAR_TYPES.conventional;

export const doctrineOf = (state) => DOCTRINE_BY_KEY[state?.doctrine] ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE];
export const moraleOf = (state) => clamp(state?.morale ?? BASE_MORALE, 0, 100);

/** その国から戦争に出る部隊。muster[国ID] が配列ならその部隊だけ、無ければ全部隊 */
export function mobilized(state, muster) {
  const all = regimentsOf(state);
  const sel = muster?.[state.i];
  return Array.isArray(sel) ? all.filter((r) => sel.includes(r.i)) : all;
}

function sumUnits(state, keys, regs) {
  const dm = doctrineOf(state).mult, tm = stateTypeMult(state.type);
  let n = 0;
  for (const r of regs) for (const k of keys) {
    const def = UNIT_BY_KEY[k]; if (!def) continue;
    n += (r.u?.[k] ?? 0) * ((def.soft + def.hard) / 2) * (dm[k] ?? 1) * (tm[k] ?? 1);
  }
  return n;
}

/** 国家1つの戦力内訳（陸・海・空・兵員・士気）。経済力（産業）と技術水準を倍率として反映する */
export function nationStrength(state, muster = null) {
  const regs = mobilized(state, muster);
  const tech = clamp(state.techLevel ?? 3, 1, 10);
  const m = (0.7 + tech * 0.08) * (0.8 + Math.min(1.2, (state.industry ?? 0) / 500));
  return {
    land: sumUnits(state, LAND, regs) * m, sea: sumUnits(state, SEA, regs) * m, air: sumUnits(state, AIR, regs) * m,
    manpower: regs.reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0),
    morale: moraleOf(state),
  };
}

/** 連合（複数国）をまとめた戦力。士気は兵員数で加重平均 */
export function sideStrength(map, ids, muster = null) {
  const out = { land: 0, sea: 0, air: 0, manpower: 0, morale: 0 };
  let wm = 0;
  for (const id of ids) {
    const st = map.pack.states[id]; if (!isLive(st)) continue;
    const s = nationStrength(st, muster);
    out.land += s.land; out.sea += s.sea; out.air += s.air; out.manpower += s.manpower;
    out.morale += s.morale * Math.max(1, s.manpower); wm += Math.max(1, s.manpower);
  }
  out.morale = wm ? out.morale / wm : BASE_MORALE;
  return out;
}

/** 双方の比較値（0〜1。攻撃側の取り分）。バー表示にそのまま使える */
export function compareSides(a, b) {
  const share = (x, y) => (x + y <= 0 ? 0.5 : x / (x + y));
  return { land: share(a.land, b.land), sea: share(a.sea, b.sea), air: share(a.air, b.air), morale: share(a.morale, b.morale) };
}

/** 陣営のドクトリン効果（兵員で加重平均） */
function sideDoctrine(map, ids) {
  const acc = { attack: 0, defense: 0, noise: 0, ownLoss: 0, enemyLoss: 0, speed: 0, moraleHit: 0 };
  let w = 0;
  for (const id of ids) {
    const st = map.pack.states[id]; if (!isLive(st)) continue;
    const wt = Math.max(1, regimentsOf(st).reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0)), d = doctrineOf(st).war ?? {};
    for (const k of Object.keys(acc)) acc[k] += (d[k] ?? (k === "noise" || k === "ownLoss" || k === "enemyLoss" || k === "speed" || k === "moraleHit" ? 1 : 0)) * wt;
    w += wt;
  }
  if (!w) return { attack: 0, defense: 0, noise: 1, ownLoss: 1, enemyLoss: 1, speed: 1, moraleHit: 1 };
  for (const k of Object.keys(acc)) acc[k] /= w;
  return acc;
}

/** 総合の優勢度（攻撃側が優勢なら正）。ブレ(noise)を除いた値 */
export function edgeOf(cmp, atk, def) {
  const score = 0.5 * cmp.land + 0.2 * cmp.air + 0.15 * cmp.sea + 0.15 * cmp.morale;
  return score - 0.5 + (cmp.air - 0.5) * 0.1 + (atk.attack - def.defense) * 0.5;
}

function verdictOf(edge, band = 0.03) {
  const winner = Math.abs(edge) < band ? "stalemate" : edge > 0 ? "attacker" : "defender";
  return { winner, decisiveness: clamp(Math.abs(edge) * 2, 0, 1) };
}

/** 戦争の事前見積もり（戦争開始を押す前のバー表示用）。副作用なし */
export function previewWar(map, attackers, defenders, muster = null) {
  const A = sideStrength(map, attackers, muster), D = sideStrength(map, defenders, muster);
  return { aStrength: A, dStrength: D, compare: compareSides(A, D) };
}

/**
 * 戦争を判定する。副作用なし。
 * @returns {{ winner, decisiveness, compare, aStrength, dStrength, noise, losses:{[id]:number},
 *   casualties:{[id]:{before:number, lost:number}}, moraleDelta:{[id]:number}, popLossShare:{[id]:number} }}
 */
export function resolveWar(map, attackers, defenders, rnd, muster = null, type = "conventional") {
  const T = warTypeOf(type);
  const m = T.allMuster ? null : muster;
  const { aStrength: A, dStrength: D, compare: cmp } = previewWar(map, attackers, defenders, m);
  const da = sideDoctrine(map, attackers), dd = sideDoctrine(map, defenders);
  const noiseAmp = 0.08 * ((da.noise + dd.noise) / 2) * (T.key === "asymmetric" ? 1.5 : 1);
  const noise = rnd.float(-noiseAmp, noiseAmp);
  let edge = edgeOf(cmp, da, dd) + noise;
  // 非対称戦：弱い側はゲリラ戦で戦力差を縮める（制空・制海は強い側の頼みにならない）。決着は僅差になりやすい
  let strongIsAttacker = A.land >= D.land;
  if (T.key === "asymmetric") {
    const weakIds = strongIsAttacker ? defenders : attackers;
    const h = map.geometry?.pack?.h, st = map.pack.cells.state; let tot = 0, rough = 0;
    if (h) for (let i = 0; i < st.length; i++) if (weakIds.includes(st[i])) { tot++; if (h[i] >= 55) rough++; }
    const guerrilla = 0.08 + 0.12 * (tot ? rough / tot : 0);
    edge = edge * 0.4 + (strongIsAttacker ? -guerrilla : guerrilla);
  }
  const verdict = verdictOf(edge, T.key === "asymmetric" ? 0.07 : 0.03);
  const { winner, decisiveness } = verdict;

  // 消耗: 敗者ほど重く、僅差（長期戦）ほど双方が重い。ドクトリンと戦争の形態で変わる
  const base = (0.12 + (1 - decisiveness) * 0.12) * T.lossScale;
  const lossFor = (isWinner) => clamp(isWinner ? base * 0.5 : base * (1 + decisiveness), 0.02, 0.6);
  const aBase = winner === "stalemate" ? base : lossFor(winner === "attacker");
  const dBase = winner === "stalemate" ? base : lossFor(winner === "defender");
  const asym = T.key === "asymmetric";
  const aMul = asym ? (strongIsAttacker ? 1.2 : 0.6) : 1, dMul = asym ? (strongIsAttacker ? 0.6 : 1.2) : 1;
  const aLoss = clamp(aBase * da.ownLoss * dd.enemyLoss * aMul, 0.02, 0.6), dLoss = clamp(dBase * dd.ownLoss * da.enemyLoss * dMul, 0.02, 0.6);
  const losses = {}, casualties = {}, moraleDelta = {}, popLossShare = {};
  const apply = (ids, frac, won, side) => {
    const isStrong = (side === "attacker") === strongIsAttacker;
    for (const id of ids) {
      const st = map.pack.states[id]; if (!isLive(st)) continue;
      const before = mobilized(st, m).reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0);
      losses[id] = frac; casualties[id] = { before, lost: Math.round(before * frac) };
      const hit = doctrineOf(st).war?.moraleHit ?? 1;
      let md = winner === "stalemate" ? -Math.round(6 * hit) : won ? Math.round(4 + 6 * decisiveness) : -Math.round((8 + 24 * decisiveness) * hit);
      if (asym && isStrong) md -= 10; // 長引く占領・掃討で、強い側も士気が削られる（厭戦）
      moraleDelta[id] = md;
      // 民間の被害（戦場になる側ほど大きい）。非対称戦では弱い側の民衆が巻き込まれる
      popLossShare[id] = clamp((frac * 0.15 + (won ? 0 : decisiveness * 0.04) + (side === "defender" ? 0.01 : 0)) * T.popScale * (asym && !isStrong ? 1.4 : 1), 0, 0.35);
    }
  };
  apply(attackers, aLoss, winner === "attacker", "attacker");
  apply(defenders, dLoss, winner === "defender", "defender");
  // 戦争スコア（HoI4 の戦争スコアにあたる）。勝者が講和で「要求できる大きさ」。決着が大きいほど、形態が大きいほど高い
  const warScore = winner === "stalemate" ? 0 : Math.round(clamp(100 * (0.2 + 0.8 * decisiveness) * T.scoreScale, 5, 100));
  return { winner, decisiveness, warScore, type: T.key, compare: cmp, aStrength: A, dStrength: D, noise, losses, casualties, moraleDelta, popLossShare, doctrine: { attacker: da, defender: dd } };
}

/** 核作戦などで状況が変わったあとの再判定。最初に出たブレ(noise)は使い回すので、結果が勝手に揺れない */
export function reevaluateWar(map, war) {
  const r = war.result; if (!r) return null;
  const { aStrength: A, dStrength: D, compare } = previewWar(map, war.attackers, war.defenders, war.muster && Object.keys(war.muster).length ? war.muster : null);
  const edge = edgeOf(compare, r.doctrine?.attacker ?? sideDoctrine(map, war.attackers), r.doctrine?.defender ?? sideDoctrine(map, war.defenders)) + (r.noise ?? 0);
  return { ...r, ...verdictOf(edge, r.type === "asymmetric" ? 0.07 : 0.03), compare, aStrength: A, dStrength: D };
}

/** 損耗率を部隊の兵力に反映した新しい u を返す（核は消耗させない） */
export function applyLossFraction(units, fraction) {
  const out = { ...units };
  for (const k of UNIT_KEYS) if (k !== "nuclear") out[k] = Math.max(0, Math.floor((out[k] ?? 0) * (1 - fraction)));
  return out;
}

// ---------------------------------------------------------------------------
// 前線：戦いが実際に行われる場所
// ---------------------------------------------------------------------------
/** 敵国の領土からの距離（セル数）。味方の領土セルごとに、敵の国境からどれだけ内側かを返す */
function distanceFrom(map, ownerIds, targetIds, maxDepth = 40) {
  const nb = map.geometry?.pack?.cells?.c, st = map.pack.cells.state;
  const dist = new Map(), q = [];
  if (!nb) return dist;
  const enemy = new Set(targetIds);
  for (let i = 0; i < st.length; i++) if (enemy.has(st[i])) { dist.set(i, 0); q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], d = dist.get(k); if (d >= maxDepth) continue;
    for (const j of nb[k] ?? []) if (!dist.has(j)) { dist.set(j, d + 1); q.push(j); }
  }
  const out = new Map();
  for (let i = 0; i < st.length; i++) if (ownerIds.includes(st[i]) && dist.has(i)) out.set(i, dist.get(i));
  return out;
}

/** 国の都市を、敵国との国境に近い順に並べる（戦いは国境の都市から始まり、押し込むほど奥の都市になる） */
export function frontBurgs(map, stateIds, enemyIds) {
  const dist = distanceFrom(map, stateIds, enemyIds);
  const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && stateIds.includes(b.state));
  return burgs.map((b) => ({ b, d: dist.get(b.cell) ?? 999 })).sort((x, y) => x.d - y.d || x.b.i - y.b.i).map((x) => x.b);
}

function burgIsCoastal(map, b) {
  const nb = map.geometry?.pack?.cells?.c, bio = map.pack.cells.biome;
  return !!nb && (nb[b.cell] ?? []).some((j) => bio[j] === 0);
}

// ---------------------------------------------------------------------------
// 戦争名の自動生成：実際に戦いが行われた場所から付ける
// ---------------------------------------------------------------------------
const ROMAN = ["", "第一次", "第二次", "第三次", "第四次", "第五次", "第六次", "第七次", "第八次", "第九次"];

/**
 * 戦争の名前。世界規模なら「第〇次世界大戦」。それ以外は、戦闘の記録のうち最も決定的な戦いの場所から付ける。
 *   首都の戦い → 〇〇包囲戦 / 海に面した都市で海軍が強い → 〇〇上陸作戦 / 非対称戦 → 〇〇紛争 / 限定戦 → 〇〇国境紛争
 */
export function nameWar(map, { attackers, defenders, rnd, existingNames = [], battles = [], type = "conventional" }) {
  const total = attackers.length + defenders.length;
  const liveCount = map.pack.states.filter(isLive).length;
  const worldScale = total >= 5 || (total >= 4 && total >= Math.ceil(liveCount * 0.6));
  let base;
  if (worldScale) {
    const used = existingNames.filter((n) => /^第.+次世界大戦/.test(n)).length;
    base = `${ROMAN[Math.min(used + 1, 9)]}世界大戦`;
  } else {
    const key = battles.length ? battles[battles.length - 1] : null; // 最後の戦い＝決着がついた場所
    const burg = key?.burgId ? map.pack.burgs[key.burgId] : null;
    const place = key?.place ?? pickPlace(map, defenders[0], rnd) ?? officialName(map.pack.states[defenders[0]], "国境");
    const isCapital = burg && [...attackers, ...defenders].some((id) => map.pack.states[id]?.capital === burg.i);
    const kinds = [];
    if (type === "asymmetric") kinds.push(`${place}紛争`, `${place}掃討戦`);
    else if (type === "limited") kinds.push(`${place}国境紛争`, `${place}の戦い`);
    else {
      kinds.push(`${place}戦争`, `${place}の戦い`);
      if (isCapital) kinds.push(`${place}包囲戦`, `${place}攻略戦`);
      if (burg && burgIsCoastal(map, burg)) kinds.push(`${place}上陸作戦`);
    }
    base = isCapital && type !== "asymmetric" && type !== "limited" ? rnd.pick([`${place}包囲戦`, `${place}戦争`]) : rnd.pick(kinds);
  }
  let name = base, k = 2;
  while (existingNames.includes(name)) name = `${base}（${k++}）`;
  return name;
}

function pickPlace(map, stateId, rnd) {
  const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && b.state === stateId);
  return burgs.length ? rnd.pick(burgs).name : null;
}

// ---------------------------------------------------------------------------
// 戦闘の記録（自動生成）。ドクトリンに基づく書きぶりと結果。
// ---------------------------------------------------------------------------
const DOCTRINE_STORY = {
  mobile: { win: ["機甲部隊が前線を突破し、後方の拠点を押さえた", "航空支援のもと快速部隊が敵の側面を回り込んだ"], lose: ["突出した機動部隊が補足され、押し戻された"] },
  firepower: { win: ["集中砲撃で防御線を粉砕し、前進した", "砲兵の圧倒的な火力で敵陣地を制圧した"], lose: ["砲撃は決定打にならず、前進を阻まれた"] },
  battleplan: { win: ["構築した陣地で敵の攻勢を食い止め、反撃に転じた", "縦深防御で攻め手を消耗させた"], lose: ["固めた陣地を迂回され、後退を強いられた"] },
  massassault: { win: ["大兵力を波状に投入し、損害をいとわず突破した", "数の優位で敵を押し切った"], lose: ["大量の損耗を出し、攻勢は頓挫した"] },
  balanced: { win: ["各兵科を連携させ、堅実に勝利した", "均衡の取れた運用で優位を保った"], lose: ["決め手を欠き、後退した"] },
};

/**
 * 戦闘の記録を作る。戦いは実際の前線で起きる：攻められた側(防衛側)の国境の都市から始まり、
 * 攻撃側が優勢なほど奥の都市へ進む。防衛側が優勢なら国境付近で食い止め、終盤は反攻して攻撃側の国境の都市に及ぶ。
 * @returns {{date, name, place, burgId, winner:"attacker"|"defender", text, attackerState, defenderState, winnerState, loserState}[]}
 */
export function generateBattleLog(map, { attackers, defenders, result, startedAt, durationMonths }, rnd, addMonths) {
  const n = clamp(Math.round(2 + Math.log10(1 + (result.aStrength.manpower + result.dStrength.manpower)) * 1.1 + durationMonths / 8), 2, 9);
  const winnerSide = result.winner === "defender" ? "defender" : "attacker";
  const pWin = result.winner === "stalemate" ? 0.5 : clamp(0.55 + result.decisiveness * 0.35, 0.55, 0.9);
  const defenderFront = frontBurgs(map, defenders, attackers), attackerFront = frontBurgs(map, attackers, defenders);
  const depthReach = result.winner === "attacker" ? clamp(0.35 + result.decisiveness * 0.65, 0.3, 1) : 0.3; // 攻撃側が勝つほど奥まで進む
  const log = []; const used = new Set();
  for (let i = 0; i < n; i++) {
    const prog = n === 1 ? 1 : i / (n - 1);
    const side = rnd.next() < pWin ? winnerSide : (winnerSide === "attacker" ? "defender" : "attacker");
    const wId = rnd.pick(side === "attacker" ? attackers : defenders), lId = rnd.pick(side === "attacker" ? defenders : attackers);
    // 反攻：防衛側が勝つ戦争の終盤は、攻撃側の領土が戦場になる
    const counter = result.winner === "defender" && prog > 0.65;
    const pool = counter ? attackerFront : defenderFront;
    const maxIdx = Math.max(0, Math.floor((pool.length - 1) * (counter ? 0.4 : depthReach) * (0.15 + 0.85 * prog)));
    let burg = null;
    for (let t = 0; t < 6 && !burg; t++) { const c = pool[Math.min(maxIdx, Math.floor(rnd.next() * (maxIdx + 1)))]; if (c && !used.has(c.i)) burg = c; }
    if (!burg) burg = pool.find((c) => !used.has(c.i)) ?? null;
    if (!burg && pool.length) burg = pool[Math.min(maxIdx, Math.floor(rnd.next() * (maxIdx + 1)))]; // 都市が少ないときは同じ都市で再び戦う
    if (burg) used.add(burg.i);
    const place = burg?.name ?? officialName(map.pack.states[counter ? attackers[0] : defenders[0]], "国境地帯");
    const dk = doctrineOf(map.pack.states[wId]).key;
    const story = DOCTRINE_STORY[dk] ?? DOCTRINE_STORY.balanced;
    let kind = rnd.pick([`${place}の戦い`, `${place}会戦`, `${place}攻防戦`]);
    for (let k = 2; log.some((x) => x.name === kind); k++) kind = `第${k}次${place}の戦い`; // 同じ場所で再び戦うときは番号を付ける
    const t = Math.min(durationMonths, Math.max(0, Math.round(((i + 1) / (n + 1)) * durationMonths)));
    log.push({ date: addMonths(startedAt, t), name: kind, place, burgId: burg?.i ?? null, winner: side, attackerState: attackers[0], defenderState: defenders[0], winnerState: wId, loserState: lId,
      text: `${officialName(map.pack.states[wId])}軍：${rnd.pick(story.win)}（${officialName(map.pack.states[lId])}軍：${rnd.pick((DOCTRINE_STORY[doctrineOf(map.pack.states[lId]).key] ?? DOCTRINE_STORY.balanced).lose)}）` });
  }
  return log;
}
