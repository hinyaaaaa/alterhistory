// 兵科の定義：歩兵・機甲・航空・海軍・特殊部隊・先端技術・核を中心とした構成。
// 公式Azgaarの MilitaryUnit（icon/name/rural/urban/power等）の考え方を踏襲しつつ、
// Hearts of Iron IV の戦闘モデル（soft attack / hard attack / hardness）を簡略化して取り込む。
//
// soft: 対・非装甲目標（歩兵など）への攻撃力。
// hard: 対・装甲目標（機甲など）への攻撃力。
// hardness: 0〜1。自軍がどれだけ「装甲目標」として扱われるか（歩兵中心の部隊は低い、機甲中心は高い）。
//   実際の戦闘では、攻撃側の火力は「防御側の装甲化率」に応じて soft と hard を按分して当てる
//   （HOI4と同じ考え方）。歩兵しか持たない軍は、機甲中心の相手に攻撃が通りにくくなる。
// rural/urban: 年次徴兵で、人口1000人あたり何ユニット生産できるかの目安係数。
// industryShare: 徴兵時、産業力のうちその兵科に回す既定の配分比率（歩兵など人力主体の兵科は0）。
//
// 純粋データ + 純粋関数。DOM に依存しない。

export const UNIT_TYPES = Object.freeze([
  { key: "infantry", label: "歩兵", unit: "人", icon: "⚔️", soft: 1, hard: 0.1, hardness: 0, rural: 0.9, urban: 0.5, industryShare: 0 },
  { key: "armor", label: "機甲", unit: "台", icon: "🛡️", soft: 3, hard: 10, hardness: 0.9, rural: 0, urban: 0, industryShare: 0.35 },
  { key: "air", label: "航空", unit: "機", icon: "✈️", soft: 5, hard: 6, hardness: 0, rural: 0, urban: 0, industryShare: 0.25 },
  { key: "navy", label: "海軍", unit: "隻", icon: "🚢", soft: 8, hard: 14, hardness: 0.6, rural: 0, urban: 0, industryShare: 0.2, naval: true },
  { key: "special", label: "特殊部隊", unit: "人", icon: "🎖️", soft: 1.5, hard: 0.5, hardness: 0.1, rural: 0.02, urban: 0.03, industryShare: 0.05 },
  { key: "advanced", label: "先端技術", unit: "人", icon: "🔬", soft: 2, hard: 6, hardness: 0.5, rural: 0, urban: 0.02, industryShare: 0.15, minTech: 6 },
  { key: "nuclear", label: "核", unit: "発", icon: "☢️", soft: 500, hard: 500, hardness: 0, rural: 0, urban: 0, industryShare: 0, minTech: 9 },
]);
export const UNIT_KEYS = UNIT_TYPES.map((u) => u.key);
export const UNIT_BY_KEY = Object.fromEntries(UNIT_TYPES.map((u) => [u.key, u]));

// --- ドクトリン：国家が1つだけ選ぶ恒久的な国是（HOI4の国家ドクトリンに相当）。
//   部隊ごとではなく state.doctrine として国家に紐づく。soft/hard 双方への倍率と、
//   士気（組織率）の減りにくさ morale（1が標準、小さいほど崩れにくい）を持つ。
export const DOCTRINES = Object.freeze([
  { key: "balanced", label: "均衡", mult: { infantry: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 }, moraleLoss: 1 },
  { key: "mobile", label: "機動戦", mult: { infantry: 0.9, armor: 1.3, air: 1.15, navy: 1, special: 1, advanced: 1, nuclear: 1 }, moraleLoss: 0.85 },
  { key: "firepower", label: "火力主義", mult: { infantry: 1.15, armor: 1, air: 1, navy: 1, special: 1.15, advanced: 1, nuclear: 1 }, moraleLoss: 1 },
  { key: "battleplan", label: "計画防御", mult: { infantry: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 }, moraleLoss: 1, defenseBonus: 0.15 },
  { key: "massassault", label: "人海戦術", mult: { infantry: 1.3, armor: 0.85, air: 0.85, navy: 1, special: 1, advanced: 0.85, nuclear: 1 }, moraleLoss: 1.25, conscriptBonus: 0.3 },
]);
export const DOCTRINE_BY_KEY = Object.fromEntries(DOCTRINES.map((d) => [d.key, d]));
export const DEFAULT_DOCTRINE = "balanced";

// --- 国家タイプ補正：地図生成時に決まる国家の地理的性格（Azgaarの state.type を踏襲）。
//   HOI4の「国家タイプ×兵科」補正マトリクスと同じ考え方を、このプロジェクトの兵科体系に翻訳したもの。
//   soft/hard の両方に同じ倍率をかける（装備の質ではなく「その兵科をどれだけ揃えやすい社会か」の表現）。
export const STATE_TYPE_MULT = Object.freeze({
  Generic: { infantry: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1 },
  Naval: { infantry: 0.85, armor: 0.9, air: 1.05, navy: 1.8, special: 1.05, advanced: 1 },
  Nomadic: { infantry: 0.75, armor: 1.15, air: 0.6, navy: 0.3, special: 1.25, advanced: 0.9 },
  Highland: { infantry: 1.15, armor: 0.6, air: 0.6, navy: 0.3, special: 1.35, advanced: 1 },
  Hunting: { infantry: 1.1, armor: 0.5, air: 0.5, navy: 0.6, special: 1.4, advanced: 0.9 },
  Lake: { infantry: 1, armor: 1, air: 1, navy: 1.2, special: 1, advanced: 1 },
  River: { infantry: 1.05, armor: 1, air: 1, navy: 1.15, special: 1, advanced: 1 },
});
/** 国家タイプ（未知/未設定なら Generic 扱い）に対応する兵科補正マップを返す */
export function stateTypeMult(type) {
  return STATE_TYPE_MULT[type] ?? STATE_TYPE_MULT.Generic;
}

/** 空の兵力構成 */
export function emptyForce() {
  return Object.fromEntries(UNIT_KEYS.map((k) => [k, 0]));
}

/**
 * 部隊(regiment)1つの目安戦力（表示用）。国家タイプ・相手の装甲率は考慮しない対称な指標。
 * 実際の戦闘計算（相手依存・非対称）は core/sim/battle.js の attackDamage を使う。
 */
export function forcePower(units, doctrineKey = DEFAULT_DOCTRINE) {
  const mult = DOCTRINE_BY_KEY[doctrineKey]?.mult ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE].mult;
  let total = 0;
  for (const key of UNIT_KEYS) {
    const n = units?.[key] ?? 0;
    if (n > 0) total += n * ((UNIT_BY_KEY[key].soft + UNIT_BY_KEY[key].hard) / 2) * (mult[key] ?? 1);
  }
  return total;
}

/** 部隊の総兵員数（表示用。核・機甲などは「基数」として素朴に合算する） */
export function forceHeadcount(units) {
  return UNIT_KEYS.reduce((sum, k) => sum + (units?.[k] ?? 0), 0);
}

/** 兵力構成の加重平均 hardness（0〜1）。装甲化された部隊がどれだけの割合を占めるかの目安 */
export function forceHardness(units) {
  let weight = 0, sum = 0;
  for (const key of UNIT_KEYS) {
    const n = units?.[key] ?? 0;
    if (n <= 0) continue;
    weight += n;
    sum += n * UNIT_BY_KEY[key].hardness;
  }
  return weight > 0 ? sum / weight : 0;
}

/**
 * HOI4の soft/hard attack 按分と同じ考え方の攻撃力計算。
 * 攻撃側の兵力構成・ドクトリン・国家タイプ補正を、防御側の装甲化率(defenderHardness)に応じて按分する。
 * @param {object} units 攻撃側の兵力構成
 * @param {number} defenderHardness 防御側の加重平均hardness（0〜1）
 * @param {string} doctrineKey 攻撃側が属する国家のドクトリン
 * @param {string} stateType 攻撃側の国家タイプ（未指定はGeneric）
 */
export function attackDamage(units, defenderHardness, doctrineKey = DEFAULT_DOCTRINE, stateType = "Generic") {
  const dmult = DOCTRINE_BY_KEY[doctrineKey]?.mult ?? DOCTRINE_BY_KEY[DEFAULT_DOCTRINE].mult;
  const tmult = stateTypeMult(stateType);
  let total = 0;
  for (const key of UNIT_KEYS) {
    const n = units?.[key] ?? 0;
    if (n <= 0) continue;
    const def = UNIT_BY_KEY[key];
    const effective = def.soft * (1 - defenderHardness) + def.hard * defenderHardness;
    total += n * effective * (dmult[key] ?? 1) * (tmult[key] ?? 1);
  }
  return total;
}
