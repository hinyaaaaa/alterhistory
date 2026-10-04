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
  { key: "infantry", label: "歩兵", unit: "人", icon: "⚔️", soft: 1, hard: 0.1, hardness: 0, rural: 0.9, urban: 0.5, industryShare: 0,
    desc: "軍の主力。安価で数が出せるが、戦車には弱い。" },
  { key: "cavalry", label: "騎兵", unit: "騎", icon: "🐎", soft: 1.6, hard: 0.3, hardness: 0, rural: 0.2, urban: 0.05, industryShare: 0, maxTech: 6,
    desc: "馬に乗った機動兵。古い時代の主力で、機関銃や戦車の時代には衰える。" },
  { key: "archers", label: "弓兵", unit: "人", icon: "🏹", soft: 0.8, hard: 0.05, hardness: 0, rural: 0.4, urban: 0.1, industryShare: 0, maxTech: 4,
    desc: "弓・弩の遠距離兵。火器の時代には使われなくなる。" },
  { key: "artillery", label: "砲兵", unit: "門", icon: "💥", soft: 4, hard: 1.5, hardness: 0.05, rural: 0.05, urban: 0.04, industryShare: 0.08, minTech: 2,
    desc: "歩兵の支援火力。人に対して強く、歩兵が多い軍ほど効果が出る。" },
  { key: "armor", label: "機甲", unit: "台", icon: "🛡️", soft: 3, hard: 10, hardness: 0.9, rural: 0, urban: 0, industryShare: 0.35, minTech: 4,
    desc: "戦車・装甲車。突破力が高いが高価で、整備できる産業が要る。" },
  { key: "air", label: "航空", unit: "機", icon: "✈️", soft: 5, hard: 6, hardness: 0, rural: 0, urban: 0, industryShare: 0.25, minTech: 4,
    desc: "戦闘機・爆撃機。制空権を取ると陸軍の損害が減る。" },
  { key: "navy", label: "海軍", unit: "隻", icon: "🚢", soft: 8, hard: 14, hardness: 0.6, rural: 0, urban: 0, industryShare: 0.2, naval: true, minTech: 2, needsCoast: true,
    desc: "艦艇。制海権を取れる。海に面していない国は持てない。" },
  { key: "special", label: "特殊部隊", unit: "人", icon: "🎖️", soft: 1.5, hard: 0.5, hardness: 0.1, rural: 0.02, urban: 0.03, industryShare: 0.05, minTech: 3,
    desc: "空挺・山岳・特殊作戦。少数精鋭で、地形の悪い所に強い。" },
  { key: "advanced", label: "先端技術", unit: "基", icon: "🔬", soft: 2, hard: 6, hardness: 0.5, rural: 0, urban: 0.02, industryShare: 0.15, minTech: 6,
    desc: "ミサイル・電子戦・無人機。技術水準が高い国だけが持てる。" },
  { key: "nuclear", label: "核", unit: "発", icon: "☢️", soft: 500, hard: 500, hardness: 0, rural: 0, urban: 0, industryShare: 0, minTech: 9,
    desc: "通常の戦争では使われない。作戦として立案・実行する。年次では増えない。" },
]);
export const UNIT_KEYS = UNIT_TYPES.map((u) => u.key);
export const UNIT_BY_KEY = Object.fromEntries(UNIT_TYPES.map((u) => [u.key, u]));

// --- ドクトリン：国家が1つだけ選ぶ恒久的な国是（HOI4の国家ドクトリンに相当）。
//   部隊ごとではなく state.doctrine として国家に紐づく。soft/hard 双方への倍率と、
//   士気（組織率）の減りにくさ morale（1が標準、小さいほど崩れにくい）を持つ。
// ドクトリン（国全体の戦い方）。mult は兵科ごとの戦力倍率。war は戦争の判定への効き方。
//   attack: 攻める側のときの総合戦力ボーナス / defense: 守る側のときのボーナス
//   noise : 判定のブレの大きさ（小さいほど安定）/ ownLoss: 自軍の損害の倍率 / enemyLoss: 相手に与える損害の倍率
//   speed : 戦争が長引く度合い（小さいほど短期決戦）/ moraleHit: 負けたときの士気の崩れやすさ
//   merit : その方針の「良さ」（画面に出す説明）
export const DOCTRINES = Object.freeze([
  { key: "balanced", label: "均衡", mult: { infantry: 1, cavalry: 1, archers: 1, artillery: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 }, moraleLoss: 1,
    war: { attack: 0.02, defense: 0.02, noise: 0.5, ownLoss: 1, enemyLoss: 1, speed: 1, moraleHit: 1 },
    desc: "偏りのない標準的な軍。得意も苦手もない。",
    merit: "判定のブレが小さく、安定して実力どおりの結果になる。攻めも守りも少し有利。" },
  { key: "mobile", label: "機動戦", mult: { infantry: 0.9, cavalry: 1.2, archers: 1, artillery: 0.9, armor: 1.3, air: 1.15, navy: 1, special: 1, advanced: 1, nuclear: 1 }, moraleLoss: 0.85,
    war: { attack: 0.08, defense: -0.03, noise: 1.2, ownLoss: 1, enemyLoss: 1.1, speed: 0.7, moraleHit: 0.85 },
    desc: "戦車・騎兵・航空機で敵の後方へ突破する。機甲・航空が強く、士気が崩れにくい。歩兵・砲兵は少し弱い。",
    merit: "短期決戦に強い（戦争が短く終わる）。攻める側で特に強く、敵の士気を大きく削る。" },
  { key: "firepower", label: "火力主義", mult: { infantry: 1.15, cavalry: 1, archers: 1.1, artillery: 1.3, armor: 1, air: 1, navy: 1, special: 1.15, advanced: 1, nuclear: 1 }, moraleLoss: 1,
    war: { attack: 0.03, defense: 0.03, noise: 0.8, ownLoss: 0.8, enemyLoss: 1.2, speed: 1.1, moraleHit: 1 },
    desc: "大量の砲撃で押しつぶす。歩兵と砲兵が強い。突破力はない。",
    merit: "自軍の損害が少なく、相手に大きな損害を与える消耗戦に強い。" },
  { key: "battleplan", label: "計画防御", mult: { infantry: 1, cavalry: 0.95, archers: 1.1, artillery: 1.1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 }, moraleLoss: 1,
    war: { attack: -0.02, defense: 0.15, noise: 0.7, ownLoss: 0.9, enemyLoss: 1, speed: 1.3, moraleHit: 0.9 },
    desc: "陣地を固めて守る。守る側のとき戦力が15%上がる。攻めは普通。",
    merit: "守りで非常に強く、損害も少ない。戦争は長引くが、簡単には負けない。" },
  { key: "massassault", label: "人海戦術", mult: { infantry: 1.3, cavalry: 1.1, archers: 1.1, artillery: 1, armor: 0.85, air: 0.85, navy: 1, special: 1, advanced: 0.85, nuclear: 1 }, moraleLoss: 1.25, conscriptBonus: 0.3,
    war: { attack: 0.05, defense: 0, noise: 1.1, ownLoss: 1.25, enemyLoss: 1, speed: 0.9, moraleHit: 1.25 },
    desc: "数で押す。歩兵が強く徴兵も多い。損害が出ると士気が崩れやすい。機甲・航空は弱い。",
    merit: "兵が多い国ほど圧倒できる。損害は大きいが、徴兵の補充が速く立て直せる。" },
]);
export const DOCTRINE_BY_KEY = Object.fromEntries(DOCTRINES.map((d) => [d.key, d]));
export const DEFAULT_DOCTRINE = "balanced";

// --- 国家タイプ補正：地図生成時に決まる国家の地理的性格（Azgaarの state.type を踏襲）。
//   HOI4の「国家タイプ×兵科」補正マトリクスと同じ考え方を、このプロジェクトの兵科体系に翻訳したもの。
//   soft/hard の両方に同じ倍率をかける（装備の質ではなく「その兵科をどれだけ揃えやすい社会か」の表現）。
export const STATE_TYPE_MULT = Object.freeze({
  Generic: { artillery: 1, infantry: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1 },
  Naval: { artillery: 1, infantry: 0.85, armor: 0.9, air: 1.05, navy: 1.8, special: 1.05, advanced: 1 },
  Nomadic: { artillery: 1, infantry: 0.75, armor: 1.15, air: 0.6, navy: 0.3, special: 1.25, advanced: 0.9 },
  Highland: { artillery: 1, infantry: 1.15, armor: 0.6, air: 0.6, navy: 0.3, special: 1.35, advanced: 1 },
  Hunting: { artillery: 1, infantry: 1.1, armor: 0.5, air: 0.5, navy: 0.6, special: 1.4, advanced: 0.9 },
  Lake: { artillery: 1, infantry: 1, armor: 1, air: 1, navy: 1.2, special: 1, advanced: 1 },
  River: { artillery: 1, infantry: 1.05, armor: 1, air: 1, navy: 1.15, special: 1, advanced: 1 },
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
