// 兵科の定義：歩兵・機甲・航空・海軍・特殊部隊・先端技術・核を中心とした構成。
// 公式Azgaarの MilitaryUnit（icon/name/rural/urban/power等）の考え方を踏襲しつつ、
// ユーザー要望の兵科体系に合わせて既定値を作り直したもの。
//
// power: 1ユニットあたりの相対戦闘力（歩兵=1を基準）。
// rural/urban: 年次徴兵で、人口1000人あたり何ユニット生産できるかの目安係数。
// industryShare: 徴兵時、産業力のうちその兵科に回す既定の配分比率（歩兵など人力主体の兵科は0）。
//
// 純粋データ + 純粋関数。DOM に依存しない。

export const UNIT_TYPES = Object.freeze([
  { key: "infantry", label: "歩兵", unit: "人", icon: "⚔️", power: 1, rural: 0.9, urban: 0.5, industryShare: 0 },
  { key: "armor", label: "機甲", unit: "台", icon: "🛡️", power: 8, rural: 0, urban: 0, industryShare: 0.35 },
  { key: "air", label: "航空", unit: "機", icon: "✈️", power: 15, rural: 0, urban: 0, industryShare: 0.25 },
  { key: "navy", label: "海軍", unit: "隻", icon: "🚢", power: 40, rural: 0, urban: 0, industryShare: 0.2, naval: true },
  { key: "special", label: "特殊部隊", unit: "人", icon: "🎖️", power: 4, rural: 0.02, urban: 0.03, industryShare: 0.05 },
  { key: "advanced", label: "先端技術", unit: "人", icon: "🔬", power: 6, rural: 0, urban: 0.02, industryShare: 0.15, minTech: 6 },
  { key: "nuclear", label: "核", unit: "発", icon: "☢️", power: 500, rural: 0, urban: 0, industryShare: 0, minTech: 9 },
]);
export const UNIT_KEYS = UNIT_TYPES.map((u) => u.key);
export const UNIT_BY_KEY = Object.fromEntries(UNIT_TYPES.map((u) => [u.key, u]));

export const DOCTRINES = Object.freeze([
  { key: "balanced", label: "均衡", mult: { infantry: 1, armor: 1, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 } },
  { key: "mechanized", label: "機甲重視", mult: { infantry: 0.8, armor: 1.4, air: 1, navy: 1, special: 1, advanced: 1, nuclear: 1 } },
  { key: "airpower", label: "航空重視", mult: { infantry: 0.8, armor: 1, air: 1.5, navy: 1, special: 1, advanced: 1.1, nuclear: 1 } },
  { key: "attrition", label: "人海戦術", mult: { infantry: 1.4, armor: 0.9, air: 0.9, navy: 1, special: 1, advanced: 0.9, nuclear: 1 } },
]);
export const DOCTRINE_BY_KEY = Object.fromEntries(DOCTRINES.map((d) => [d.key, d]));

/** 空の兵力構成 */
export function emptyForce() {
  return Object.fromEntries(UNIT_KEYS.map((k) => [k, 0]));
}

/** 部隊(regiment)1つの総合戦闘力。ドクトリン補正込み */
export function forcePower(units, doctrineKey = "balanced") {
  const mult = DOCTRINE_BY_KEY[doctrineKey]?.mult ?? DOCTRINE_BY_KEY.balanced.mult;
  let total = 0;
  for (const key of UNIT_KEYS) {
    const n = units?.[key] ?? 0;
    if (n > 0) total += n * UNIT_BY_KEY[key].power * (mult[key] ?? 1);
  }
  return total;
}

/** 部隊の総兵員数（表示用。核・機甲などは「基数」として素朴に合算する） */
export function forceHeadcount(units) {
  return UNIT_KEYS.reduce((sum, k) => sum + (units?.[k] ?? 0), 0);
}
