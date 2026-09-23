// 戦闘：ユーザーが指定した攻撃側・防御側の部隊どうしを、即時に判定する。
//
// 方針（ユーザー確定要件）:
//   ・戦闘は明示的な「攻撃」指示でのみ発生する（自動衝突なし）
//   ・勝敗はその場の部隊の戦力比較で即時決定する
//   ・国境は動かさない。占領は講和条約まで持ち越す（ここでは「勝敗」「損耗」のみ記録する）
//
// 計算式:
//   戦力 = Σ(兵科数 × power × ドクトリン補正)   … core/sim/units.js の forcePower
//   攻撃側の地形・水域の適性は簡略化により考慮しない（今後の拡張余地）
//   勝率 = 攻撃側戦力 / (攻撃側戦力 + 防御側戦力)  にランダム性を加味（±15%の乱数幅）
//   損耗 = 負けた側は保有兵力の 15%〜40%、勝った側は 3%〜12%（乱数）を、兵科ごとに比例して失う
//
// 純粋ロジック層：DOM に依存しない。乱数は core/random.js の createRandom を注入する。

import { UNIT_KEYS, forcePower, forceHeadcount } from "./units.js";
import { setProps, makeCommand } from "../edit/commands.js";
import { regimentsOf } from "./military.js";

/** 兵科ごとに比例して n 体（総数）を減らす。0未満にはしない */
function applyLosses(units, fraction) {
  const out = { ...units };
  for (const k of UNIT_KEYS) out[k] = Math.max(0, Math.floor((out[k] ?? 0) * (1 - fraction)));
  return out;
}

/**
 * 戦闘の結果を計算する（副作用なし。適用は planResolveBattle で行う）。
 * @param {object} attacker { units, doctrine }
 * @param {object} defender { units, doctrine }
 * @param {object} rnd core/random.js の createRandom インスタンス
 */
export function simulateBattle(attacker, defender, rnd) {
  const aPower = forcePower(attacker.units, attacker.doctrine);
  const dPower = forcePower(defender.units, defender.doctrine);
  if (aPower <= 0 && dPower <= 0) throw new Error("両軍とも戦力がありません");

  const noise = () => rnd.float(0.85, 1.15);
  const aRoll = aPower * noise();
  const dRoll = dPower * noise();
  const winner = aRoll >= dRoll ? "attacker" : "defender";

  const ratio = Math.max(aRoll, dRoll) / Math.max(1e-9, Math.min(aRoll, dRoll));
  // 差が大きいほど、勝者の被害は小さく敗者の被害は大きくなる
  const winnerLoss = clamp(0.03 + 0.09 / ratio, 0.03, 0.12);
  const loserLoss = clamp(0.4 - 0.25 / ratio, 0.15, 0.4);

  const attackerLoss = winner === "attacker" ? winnerLoss : loserLoss;
  const defenderLoss = winner === "defender" ? winnerLoss : loserLoss;

  return {
    winner, aPower: round(aPower), dPower: round(dPower),
    attackerLossFraction: attackerLoss, defenderLossFraction: defenderLoss,
    attackerCasualties: Math.round(forceHeadcount(attacker.units) * attackerLoss),
    defenderCasualties: Math.round(forceHeadcount(defender.units) * defenderLoss),
  };
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
    { units: aReg.u, doctrine: aReg.doctrine },
    { units: bReg.u, doctrine: bReg.doctrine },
    rnd
  );

  const parts = [
    setProps(aReg, { u: applyLosses(aReg.u, result.attackerLossFraction) }),
    setProps(bReg, { u: applyLosses(bReg.u, result.defenderLossFraction) }),
  ];
  const command = makeCommand(`戦闘（${aReg.name} vs ${bReg.name}）`, [], parts);
  return { command, result };
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function round(v) { return Math.round(v * 100) / 100; }
