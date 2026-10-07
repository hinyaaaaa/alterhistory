// バランス調整用の数値。コードを直さずに、画面（設定 → ⚖ バランス調整）から変えられる。
//   BALANCE は書き換え可能な1つのオブジェクト。シミュレーションはここを毎回読む。
//   既定値は従来どおり（変えなければ挙動は変わらない）。
export const BALANCE_META = Object.freeze([
  { key: "upkeepFactor", label: "軍の維持費の重さ", desc: "大きいほど、軍が税収を食う。重み付き兵力が人口(千人)あたり1.0のときの税収比", def: 0.2, min: 0, max: 1, step: 0.01 },
  { key: "upkeepMax", label: "軍事費の上限", desc: "軍事費が税収に占める割合の頭打ち", def: 0.8, min: 0.1, max: 1, step: 0.05 },
  { key: "noiseAmp", label: "番狂わせの起きやすさ", desc: "大きいほど、弱い側が勝つことが増える。0にすると戦力どおりに決まる", def: 0.18, min: 0, max: 0.6, step: 0.01 },
  { key: "scoreBase", label: "戦争スコアの下駄", desc: "戦力差が小さくても得られる最低限の割合（最大スコア = 100×(下駄+(1−下駄)×優勢度)×形態係数）", def: 0.15, min: 0, max: 0.8, step: 0.01 },
  { key: "scoreGrowth", label: "戦争が長引いたときのスコア上昇", desc: "目安期間を過ぎたあと、毎月 この値×形態係数 だけスコアが増える", def: 2, min: 0, max: 10, step: 0.1 },
  { key: "annexMinScore", label: "全面降伏に必要なスコア", desc: "併合を求めるのに必要な戦争スコア", def: 70, min: 10, max: 100, step: 1 },
  { key: "cessionCostScale", label: "割譲の費用", desc: "小さいほど、同じスコアで多く割譲させられる", def: 1, min: 0.1, max: 3, step: 0.05 },
]);
export const BALANCE_DEFAULTS = Object.freeze(Object.fromEntries(BALANCE_META.map((m) => [m.key, m.def])));
export const BALANCE = { ...BALANCE_DEFAULTS };

/** 値を、そのキーの範囲内に収める。知らないキー・数でない値は null */
export function clampBalanceValue(key, value) {
  const m = BALANCE_META.find((x) => x.key === key); const v = Number(value);
  return m && Number.isFinite(v) ? Math.min(m.max, Math.max(m.min, v)) : null;
}

/** 値を範囲内に収めて反映する。知らないキー・数でない値は無視する。反映後の BALANCE を返す */
export function setBalance(patch) {
  for (const m of BALANCE_META) {
    const v = Number(patch?.[m.key]);
    if (patch && m.key in patch && Number.isFinite(v)) BALANCE[m.key] = Math.min(m.max, Math.max(m.min, v));
  }
  return BALANCE;
}
export function resetBalance() { Object.assign(BALANCE, BALANCE_DEFAULTS); return BALANCE; }
