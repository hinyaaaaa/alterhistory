// 戦闘：ユーザーが指定した攻撃側・防御側の部隊どうしを、即時に判定する。
//
// 方針（ユーザー確定要件）:
//   ・戦闘は明示的な「攻撃」指示でのみ発生する（自動衝突なし）
//   ・勝敗はその場の部隊の戦力比較で即時決定する
//   ・国境は動かさない。占領は講和条約まで持ち越す（ここでは「勝敗」「損耗」のみ記録する）
//
// 計算式（HOI4の soft attack / hard attack / hardness を簡略化して踏襲。詳細は units.js）:
//   攻撃力 = attackDamage(自軍の兵力構成, 相手の装甲化率, 自国のドクトリン, 自国のタイプ)
//     → 相手が機甲中心なら hard attack が、歩兵中心なら soft attack が主に効く非対称な計算。
//   勝率 = 攻撃側の攻撃力 / (攻撃側の攻撃力 + 防御側の攻撃力)  にランダム性を加味（±15%の乱数幅）
//   損耗 = 負けた側は保有兵力の 15%〜40%、勝った側は 3%〜12%（乱数）を、兵科ごとに比例して失う。
//     計画防御ドクトリンは防御側に立ったとき被害をさらに軽減する。
//
// 純粋ロジック層：DOM に依存しない。乱数は core/random.js の createRandom を注入する。

import { UNIT_KEYS, forceHeadcount, forceHardness, attackDamage, DOCTRINE_BY_KEY, DEFAULT_DOCTRINE } from "./units.js";
import { setProps, makeCommand } from "../edit/commands.js";
import { regimentsOf } from "./military.js";

/** 兵科ごとに比例して n 体（総数）を減らす。0未満にはしない */
function applyLosses(units, fraction) {
  const out = { ...units };
  for (const k of UNIT_KEYS) out[k] = Math.max(0, Math.floor((out[k] ?? 0) * (1 - fraction)));
  return out;
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function round(v) { return Math.round(v * 100) / 100; }

/**
 * 戦闘の結果を計算する（副作用なし。適用は planResolveBattle で行う）。
 * @param {object} attacker { units, doctrine, stateType }
 * @param {object} defender { units, doctrine, stateType }
 * @param {object} rnd core/random.js の createRandom インスタンス
 */
export function simulateBattle(attacker, defender, rnd) {
  const aHardness = forceHardness(attacker.units), dHardness = forceHardness(defender.units);
  const aPower = attackDamage(attacker.units, dHardness, attacker.doctrine, attacker.stateType);
  const dPower = attackDamage(defender.units, aHardness, defender.doctrine, defender.stateType);
  if (aPower <= 0 && dPower <= 0) throw new Error("両軍とも戦力がありません");

  const noise = () => rnd.float(0.85, 1.15);
  const aRoll = aPower * noise();
  const dRoll = dPower * noise();
  const winner = aRoll >= dRoll ? "attacker" : "defender";

  const ratio = Math.max(aRoll, dRoll) / Math.max(1e-9, Math.min(aRoll, dRoll));
  // 差が大きいほど、勝者の被害は小さく敗者の被害は大きくなる
  let winnerLoss = clamp(0.03 + 0.09 / ratio, 0.03, 0.12);
  let loserLoss = clamp(0.4 - 0.25 / ratio, 0.15, 0.4);

  // 計画防御ドクトリンは、防御に回ったときだけ被害が軽くなる（HOI4のGrand Battleplanに相当）
  const defBonusOf = (doctrineKey) => DOCTRINE_BY_KEY[doctrineKey]?.defenseBonus ?? 0;
  const defenderBonus = defBonusOf(defender.doctrine);
  if (winner === "attacker") loserLoss *= (1 - defenderBonus); else winnerLoss *= (1 - defenderBonus);

  const attackerLoss = winner === "attacker" ? winnerLoss : loserLoss;
  const defenderLoss = winner === "defender" ? winnerLoss : loserLoss;

  return {
    winner, aPower: round(aPower), dPower: round(dPower),
    attackerLossFraction: attackerLoss, defenderLossFraction: defenderLoss,
    attackerCasualties: Math.round(forceHeadcount(attacker.units) * attackerLoss),
    defenderCasualties: Math.round(forceHeadcount(defender.units) * defenderLoss),
  };
}

/** 国家のドクトリン（未設定なら既定値）とタイプ（未設定ならGeneric）をまとめて取り出す */
function stateProfile(state) {
  return { doctrine: state.doctrine ?? DEFAULT_DOCTRINE, stateType: state.type ?? "Generic" };
}

/**
 * 戦闘を実行し、両部隊の損耗を反映するコマンドを作る。
 * @param {{stateId:number, regId:number}} a 攻撃側
 * @param {{stateId:number, regId:number}} b 防御側
 */
export function planResolveBattle(map, a, b, rnd) {
  const aState = map.pack.states[a.stateId], bState = map.pack.states[b.stateId];
  const aReg = regimentsOf(aState).find((r) => r.i === a.regId);
  const bReg = regimentsOf(bState).find((r) => r.i === b.regId);
  if (!aReg) throw new Error("攻撃側の部隊が見つかりません");
  if (!bReg) throw new Error("防御側の部隊が見つかりません");
  if (a.stateId === b.stateId) throw new Error("同じ国家の部隊どうしでは戦闘できません");

  const result = simulateBattle(
    { units: aReg.u, ...stateProfile(aState) },
    { units: bReg.u, ...stateProfile(bState) },
    rnd
  );

  const parts = [
    setProps(aReg, { u: applyLosses(aReg.u, result.attackerLossFraction) }),
    setProps(bReg, { u: applyLosses(bReg.u, result.defenderLossFraction) }),
  ];
  const command = makeCommand(`戦闘（${aReg.name} vs ${bReg.name}）`, [], parts);
  return { command, result };
}

// ---------------------------------------------------------------------------
// 動員戦闘（複数部隊の合算）：
//
// 現実の会戦を模して、「同じ場所に集結した複数部隊が、まとめて1つの戦力として戦う」
// ことをできるようにする。1対1の simulateBattle 自体は変えず、戦力の合算・損耗の
// 按分だけをここに追加する。離れた部隊を同時に動員することはできない
// （事前に planMoveRegiment で集結させておく想定。行軍にあたる）。
//
// 損耗の按分：合算の勝敗・被害率(fraction)が決まった後、各部隊の戦力に比例して
// 同じ割合(fraction)の損害を配分する。全部隊が同じ割合で消耗するため、
// 「弱い部隊がまとめて壊滅し、強い部隊は無傷」といった不自然な偏りは起きない。
// 動員部隊はすべて同一国家に属するため、ドクトリン・国家タイプは共通で1つ。
// ---------------------------------------------------------------------------

/** 部隊配列の合算兵力構成（soft/hard按分の計算対象。1つの巨大部隊とみなす） */
function musterUnits(regiments) {
  const out = Object.fromEntries(UNIT_KEYS.map((k) => [k, 0]));
  for (const r of regiments) for (const k of UNIT_KEYS) out[k] += r.u?.[k] ?? 0;
  return out;
}
function musterHeadcount(regiments) {
  return regiments.reduce((sum, r) => sum + forceHeadcount(r.u), 0);
}

/**
 * 複数部隊 対 複数部隊の会戦を計算する（副作用なし）。
 * @param {object[]} attackerRegs 攻撃側として動員する部隊（同じセルにいるもの）
 * @param {object[]} defenderRegs 防御側として応戦する部隊（狙われたセルにいる、その国の全部隊）
 * @param {object} attackerProfile { doctrine, stateType } 攻撃側国家
 * @param {object} defenderProfile { doctrine, stateType } 防御側国家
 */
export function simulateMuster(attackerRegs, defenderRegs, attackerProfile, defenderProfile, rnd) {
  const aUnits = musterUnits(attackerRegs), dUnits = musterUnits(defenderRegs);
  const aHardness = forceHardness(aUnits), dHardness = forceHardness(dUnits);
  const aPower = attackDamage(aUnits, dHardness, attackerProfile.doctrine, attackerProfile.stateType);
  const dPower = attackDamage(dUnits, aHardness, defenderProfile.doctrine, defenderProfile.stateType);
  if (aPower <= 0) throw new Error("動員した部隊に戦力がありません");
  if (dPower <= 0) throw new Error("防御側に戦力がありません");

  const noise = () => rnd.float(0.85, 1.15);
  const aRoll = aPower * noise();
  const dRoll = dPower * noise();
  const winner = aRoll >= dRoll ? "attacker" : "defender";

  const ratio = Math.max(aRoll, dRoll) / Math.max(1e-9, Math.min(aRoll, dRoll));
  let winnerLoss = clamp(0.03 + 0.09 / ratio, 0.03, 0.12);
  let loserLoss = clamp(0.4 - 0.25 / ratio, 0.15, 0.4);

  const defenderBonus = DOCTRINE_BY_KEY[defenderProfile.doctrine]?.defenseBonus ?? 0;
  if (winner === "attacker") loserLoss *= (1 - defenderBonus); else winnerLoss *= (1 - defenderBonus);

  const attackerLoss = winner === "attacker" ? winnerLoss : loserLoss;
  const defenderLoss = winner === "defender" ? winnerLoss : loserLoss;

  return {
    winner, aPower: round(aPower), dPower: round(dPower),
    attackerLossFraction: attackerLoss, defenderLossFraction: defenderLoss,
    attackerCasualties: Math.round(musterHeadcount(attackerRegs) * attackerLoss),
    defenderCasualties: Math.round(musterHeadcount(defenderRegs) * defenderLoss),
    attackerRegimentCount: attackerRegs.length,
    defenderRegimentCount: defenderRegs.length,
  };
}

/**
 * 動員会戦を実行し、参加した全部隊（攻撃側・防御側とも）に同じ割合で損耗を反映するコマンドを作る。
 * @param {{stateId:number, regIds:number[]}} a 攻撃側（動員する部隊のID一覧。同じセルにいる部隊のみ選べる前提はUI側で担保する）
 * @param {{stateId:number, regId:number}} b 防御側が狙う部隊（実際にはこの部隊がいるセルの、防御側国家の全部隊が応戦する）
 */
export function planResolveMuster(map, a, b, rnd) {
  const aState = map.pack.states[a.stateId], bState = map.pack.states[b.stateId];
  if (a.stateId === b.stateId) throw new Error("同じ国家の部隊どうしでは戦闘できません");
  if (!aState || !bState) throw new Error("国家が見つかりません");

  const aAll = regimentsOf(aState);
  const attackerRegs = a.regIds.map((id) => aAll.find((r) => r.i === id)).filter(Boolean);
  if (!attackerRegs.length) throw new Error("動員する部隊が見つかりません");
  const firstCell = attackerRegs[0].cell;
  if (attackerRegs.some((r) => r.cell !== firstCell)) throw new Error("同じ場所にいる部隊しか、まとめて動員できません");

  const bAll = regimentsOf(bState);
  const targetReg = bAll.find((r) => r.i === b.regId);
  if (!targetReg) throw new Error("防御側の部隊が見つかりません");
  // 防御側は「狙われた部隊と同じセルにいる、その国の全部隊」がまとめて応戦する
  const defenderRegs = bAll.filter((r) => r.cell === targetReg.cell);

  const result = simulateMuster(attackerRegs, defenderRegs, stateProfile(aState), stateProfile(bState), rnd);

  const parts = [
    ...attackerRegs.map((r) => setProps(r, { u: applyLosses(r.u, result.attackerLossFraction) })),
    ...defenderRegs.map((r) => setProps(r, { u: applyLosses(r.u, result.defenderLossFraction) })),
  ];
  const label = `会戦（${aState.name}軍 ${attackerRegs.length}部隊 vs ${bState.name}軍 ${defenderRegs.length}部隊）`;
  const command = makeCommand(label, [], parts);
  return { command, result };
}
