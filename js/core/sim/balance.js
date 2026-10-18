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
  { key: "warTreasuryLoad", label: "戦争の国庫への負荷", desc: "戦争中、毎月、国の年収の1/12に この値×形態の係数×ドクトリンの負荷 をかけた額が国庫から減る（0で国庫に響かない）", def: 0.4, min: 0, max: 3, step: 0.05 },
  { key: "warIndustryLoad", label: "戦争の産業への負荷", desc: "戦争中、毎月、産業が 0.4%×この値×形態の係数×ドクトリンの負荷 だけ落ちる（0で産業に響かない）", def: 1, min: 0, max: 5, step: 0.1 },
  { key: "momentumRate", label: "技術の機運の出やすさ", desc: "隣国が先に進んだ分野で、月ごとに機運が出る確率（世界の年だけが条件のときは半分）。0にすると機運は出ない。採用は自動ではない", def: 0.03, min: 0, max: 0.5, step: 0.005 },
  { key: "chainRate", label: "出来事の連鎖の起きやすさ", desc: "飢饉→物価の高騰、疫病→復興などの「後続の出来事」が起きる確率の倍率。0で連鎖しない", def: 1, min: 0, max: 3, step: 0.1 },
  { key: "chainDepth", label: "出来事の連鎖の長さ", desc: "後続の出来事が、さらに後続を呼べる段数の上限（1なら、最初の出来事の次の1段だけ）", def: 2, min: 1, max: 4, step: 1 },
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
