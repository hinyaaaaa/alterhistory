// v6 M6: 有効値（effective value）。通常計算値（nominal）＋ 介入補正（residual）。
//   ・nominal は WCDE の通常ルールが算出して国家の中に保存している値。ここは nominal を読むだけで、書き換えない（補正の自己取り込みを防ぐ）。
//   ・residual は intervention.js が管理する一時的な補正（civ.wcde.adjust[国家][項目].add）。時間とともに 0 へ減衰する。
//   ・経済・軍事・政治・AI・戦争研究所は、必ずこの effective() を通して値を読む。介入が無ければ nominal をそのまま返す（クランプもしない）。
//   フィールドごとの方式（mode）・範囲・減衰の半減期（月）を、ここに登録する（docs/V6_M6_INTERVENTION.md）。
const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
/** 介入できる計算値の台帳。mode: add = 有効値 = 通常値 + 補正（すべて加算方式。乗算型の値は mul 係数の項目として別に持つ） */
export const FIELDS = Object.freeze({
  industry:    { ja: "産業力",           mode: "add", min: 0, max: 1e12, half: 36, eps: 1,     nominal: (c, s) => s.econ?.industry },
  perCapita:   { ja: "一人あたり産業力",  mode: "add", min: 0, max: 1000,  half: 36, eps: 0.002, nominal: (c, s) => s.econ?.perCapita },
  tradeIncome: { ja: "交易収入",         mode: "add", min: 0, max: 1e9, half: 12, eps: 0.01,  nominal: (c, s) => s.econ?.tradeIncome },
  foodBalance: { ja: "食料の需給",       mode: "add", min: 0, max: 1.5, half: 12, eps: 0.002, nominal: (c, s) => s.econ?.foodBalance },
  taxRevenue:  { ja: "財政（税収の倍率）", mode: "add", min: 0, max: 3,   half: 24, eps: 0.002, nominal: () => 1 },
  equipLevel:  { ja: "装備水準",         mode: "add", min: 0, max: 1,   half: 24, eps: 0.002, nominal: (c, s) => s.military?.equipLevel },
  readiness:   { ja: "練度・即応",       mode: "add", min: 0, max: 1,   half: 12, eps: 0.002, nominal: (c, s) => s.military?.readiness },
  legitimacy:  { ja: "正統性",           mode: "add", min: 0, max: 1,   half: 24, eps: 0.002, nominal: (c, s) => s.politics?.legitimacy },
  fatigue:     { ja: "疲労度",           mode: "add", min: 0, max: 1,   half: 12, eps: 0.002, nominal: (c, s) => s.politics?.fatigue },
});
export const FIELD_KEYS = Object.freeze(Object.keys(FIELDS));
export const nominalOf = (civ, st, key) => { const f = FIELDS[key]; return f ? f.nominal(civ, st) : undefined; };

/** 有効値。介入が無ければ通常値のまま（v5 / 介入なしの世界の数値を変えない） */
export function effective(civ, st, key) {
  const f = FIELDS[key]; if (!f) return 0; const base = f.nominal(civ, st); if (base === undefined || base === null) return 0;
  const A = civ.wcde?.adjust?.[st.id]; let b = base, touched = false;
  // 一人あたり産業力は、産業力（総量）への介入に比例して動く（産業力 → 装備・軍事充足の連鎖。自身にも介入があれば、その補正を足す）
  if (key === "perCapita" && A?.industry) { const ni = st.econ?.industry; if (ni > 0) { b = base * (effective(civ, st, "industry") / ni); touched = true; } }
  const adj = A?.[key]; if (adj == null && !touched) return base; const v = b * (1 + (adj?.mul ?? 0)) + (adj?.add ?? 0); /* mul は M3 から続く倍率の入口（介入レコードは add だけを作る） */ return v < f.min ? f.min : v > f.max ? f.max : v;
}
export const hasAdjust = (civ, stId, key) => civ.wcde?.adjust?.[stId]?.[key] != null;
export { get as _get };
