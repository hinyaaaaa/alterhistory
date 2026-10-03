// 戦争の即時判定。宣戦布告の瞬間に、双方（連合どうしも可）の戦力を比べて結果を決める。
//
// ユーザー要件:
//   ・結果は自動判定。過程（個々の戦闘）はユーザーに見せない（結果の要約だけ返す）
//   ・兵士などの資源が消耗する
//   ・制海権・制空権・陸軍力・士気を比較できるよう、数値を返す（ウィンドウのバー表示用）
//   ・補給は扱わない。核兵器は通常戦争では使わない（別途、作戦として立案・実行する想定）
//
// 純粋ロジック層：DOM に依存しない。乱数は core/random.js の createRandom を注入する。

import { UNIT_KEYS, UNIT_BY_KEY, DEFAULT_DOCTRINE, forceHeadcount } from "./units.js";
import { regimentsOf, isCoastalState } from "./military.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

/** 兵科ごとの役割。核は通常戦争の戦力に数えない */
const LAND = ["infantry", "artillery", "armor", "special", "advanced"];
const AIR = ["air"];
const SEA = ["navy"];

function sumUnits(state, keys) {
  let n = 0;
  for (const r of regimentsOf(state)) for (const k of keys) {
    const u = UNIT_BY_KEY[k];
    const w = u ? (u.soft + u.hard) / 2 : 1; // 対人・対装甲の平均を戦力の重みにする
    n += (r.u?.[k] ?? 0) * w;
  }
  return n;
}

/** 国家1つの戦力内訳。経済力（産業）と技術水準を倍率として反映する */
export function nationStrength(state) {
  const tech = clamp(state.techLevel ?? 3, 1, 10);
  const techMult = 0.7 + tech * 0.08;
  const econ = 0.8 + Math.min(1.2, (state.industry ?? 0) / 500);
  const m = techMult * econ;
  return {
    land: sumUnits(state, LAND) * m,
    sea: sumUnits(state, SEA) * m,
    air: sumUnits(state, AIR) * m,
    manpower: regimentsOf(state).reduce((n, r) => n + forceHeadcount({ ...r.u, nuclear: 0 }), 0),
    morale: clamp(state.morale ?? 70, 10, 100),
  };
}

/** 連合（複数国）をまとめた戦力。士気は兵員数で加重平均 */
export function sideStrength(map, ids) {
  const out = { land: 0, sea: 0, air: 0, manpower: 0, morale: 0 };
  let wm = 0;
  for (const id of ids) {
    const st = map.pack.states[id];
    if (!isLive(st)) continue;
    const s = nationStrength(st);
    out.land += s.land; out.sea += s.sea; out.air += s.air; out.manpower += s.manpower;
    out.morale += s.morale * Math.max(1, s.manpower); wm += Math.max(1, s.manpower);
  }
  out.morale = wm ? out.morale / wm : 50;
  return out;
}

/** 双方の比較値（0〜1。攻撃側の取り分）。バー表示にそのまま使える */
export function compareSides(a, b) {
  const share = (x, y) => (x + y <= 0 ? 0.5 : x / (x + y));
  return { land: share(a.land, b.land), sea: share(a.sea, b.sea), air: share(a.air, b.air), morale: share(a.morale, b.morale) };
}

/**
 * 戦争を判定する。副作用なし。
 * @returns {{ winner:"attacker"|"defender"|"stalemate", decisiveness:number, compare, aStrength, dStrength,
 *   losses:{[stateId]:number}, summary:string }}
 */
export function resolveWar(map, attackers, defenders, rnd) {
  const A = sideStrength(map, attackers), D = sideStrength(map, defenders);
  const cmp = compareSides(A, D);
  // 陸を主、制空・制海を補助として総合。制空権は陸軍に強く効く（HoI4の空軍優勢の効果を簡略化）
  const score = (c) => 0.5 * c.land + 0.2 * c.air + 0.15 * c.sea + 0.15 * c.morale;
  const edge = score(cmp) - 0.5 + (cmp.air - 0.5) * 0.1;
  const noisy = edge + rnd.float(-0.08, 0.08);
  const decisiveness = clamp(Math.abs(noisy) * 2, 0, 1);
  const winner = Math.abs(noisy) < 0.03 ? "stalemate" : noisy > 0 ? "attacker" : "defender";

  // 消耗: 敗者ほど重く、差が小さい（長期戦）ほど双方が重い
  const base = 0.12 + (1 - decisiveness) * 0.12;
  const lossFor = (isWinner) => clamp(isWinner ? base * 0.5 : base * (1 + decisiveness), 0.03, 0.55);
  const aLoss = winner === "stalemate" ? base : lossFor(winner === "attacker");
  const dLoss = winner === "stalemate" ? base : lossFor(winner === "defender");
  const losses = {};
  for (const id of attackers) losses[id] = aLoss;
  for (const id of defenders) losses[id] = dLoss;
  return { winner, decisiveness, compare: cmp, aStrength: A, dStrength: D, losses };
}

/** 損耗率を部隊の兵力に反映した新しい u を返す（核は消耗させない） */
export function applyLossFraction(units, fraction) {
  const out = { ...units };
  for (const k of UNIT_KEYS) if (k !== "nuclear") out[k] = Math.max(0, Math.floor((out[k] ?? 0) * (1 - fraction)));
  return out;
}

// ---------------------------------------------------------------------------
// 戦争名の自動生成
// ---------------------------------------------------------------------------
const ROMAN = ["", "第一次", "第二次", "第三次", "第四次", "第五次", "第六次", "第七次", "第八次", "第九次"];

/** 戦争の規模と性格から、実際の戦争のような名前を付ける */
export function nameWar(map, { attackers, defenders, winner, rnd, existingNames = [] }) {
  const nm = (id) => map.pack.states[id]?.name ?? `国家${id}`;
  const total = attackers.length + defenders.length;
  const worldScale = total >= 5 || total >= Math.ceil(map.pack.states.filter(isLive).length * 0.6) && total >= 4;
  let base;
  if (worldScale) {
    const used = existingNames.filter((n) => /^第.+次世界大戦$/.test(n)).length;
    base = `${ROMAN[Math.min(used + 1, 9)]}世界大戦`;
  } else {
    const a = attackers[0], d = defenders[0];
    const place = pickPlace(map, d, rnd) ?? nm(d);
    const kinds = [];
    if (total === 2) kinds.push(`${nm(a)}・${nm(d)}戦争`, `${nm(a)}${nm(d)}戦争`);
    else kinds.push(`${nm(a)}連合・${nm(d)}連合戦争`);
    kinds.push(`${place}の戦い`, `${place}包囲戦`);
    if (map.pack.cells && isCoastalState(map, d)) kinds.push(`${place}上陸作戦`);
    base = rnd.pick(kinds);
  }
  let name = base, k = 2;
  while (existingNames.includes(name)) name = `${base}（${k++}）`;
  return name;
}

function pickPlace(map, stateId, rnd) {
  const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed && b.state === stateId);
  return burgs.length ? rnd.pick(burgs).name : null;
}
