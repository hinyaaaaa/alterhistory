// 経済・人口の簡易モデル：年次に、技術水準と国家規模に応じて人口・産業力を緩やかに変化させる。
//
// 設計方針:
//   ・公式Azgaarの生成ロジック(文化/宗教/地形補正込みの徴兵計算)は「地図生成時に1回」を想定した
//     ものであり、そのまま毎年適用すると計算コストと複雑さが見合わない。ここでは意図的に簡略化し、
//     「技術水準」「相対的な国力(既存のrural/urban人口)」を主要因とする単純な年成長率モデルにする。
//   ・人口(rural/urban)は既存のAzgaarデータをそのまま基盤にする（実データで確認済みの数値域）。
//   ・techLevel は 1〜10 の整数。数値が高いほど成長率も産業力係数も上がるが、人口支持上限に近づくと
//     成長は鈗化する（ロジスティック成長：小国が延々に指数成長しないようにするため）。
//
// 純粋ロジック層：DOM に依存しない。

export const TECH_MIN = 1;
export const TECH_MAX = 10;

/** 技術水準ごとの年間人口成長率（上限に対する割合。ロジスティック成長の r） */
const GROWTH_RATE_BY_TECH = (tech) => 0.006 + (tech - 1) * 0.0016; // tech1:0.6% 〜 tech10:2.1%

/** 技術水準ごとの産業係数（人口1000人あたりの産業力） */
const INDUSTRY_PER_CAPITA_BY_TECH = (tech) => 0.05 + (tech - 1) * 0.09; // tech1:0.05 〜 tech10:0.86

/** 人口支持上限。領土(cells)が分かればそれに比例、分からない旧データは現人口の1.5倍を下限にする */
export function carryingCapacity(state) {
  const tech = clampTech(state.techLevel ?? 3);
  const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
  const techFactor = 1 + (tech - 1) * 0.18; // 技術が高いほど同じ土地でも多くを養える
  const cells = Number(state.cells) || 0;
  if (cells > 0) {
    // 初回は現人口が上限の約8割になる密度を基準にし、その後は面積と技術だけで決まる
    const density = state.carryDensity ?? (pop > 0 ? (pop / cells) / 0.8 / techFactor : 1);
    return Math.max(1, cells * density * techFactor);
  }
  return Math.max(1, pop * 1.5);
}

/** 国家に経済フィールドが無ければ既定値を補う（読み込んだ地図が旧データのままでも動くように） */
export function ensureEconomy(state) {
  if (typeof state.techLevel !== "number") state.techLevel = 3;
  if (typeof state.industry !== "number") state.industry = 0;
  // 人口支持上限は領土の広さと技術水準から毎回求める（割譲・併合で領土が変わっても追従する）。
  // 保存値 popCarryCap は表示・互換のために更新するだけで、計算の元にはしない。
  // 初回に「領土1セルあたりの支持人口」を固定する。以後は面積と技術だけで上限が動く
  if (typeof state.carryDensity !== "number" && Number(state.cells) > 0) {
    const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
    const techFactor = 1 + (clampTech(state.techLevel ?? 3) - 1) * 0.18;
    state.carryDensity = pop > 0 ? (pop / state.cells) / 0.8 / techFactor : 1;
  }
  state.popCarryCap = carryingCapacity(state);
  return state;
}

/**
 * 国家1つぶんの年次更新。state を直接変更しない（呼び出し側が差分を commit する設計に合わせるため）。
 * @returns {{rural:number, urban:number, industry:number}} 更新後の値
 */
export function computeAnnualUpdate(state) {
  const tech = clampTech(state.techLevel ?? 3);
  const pop = Math.max(0, (state.rural ?? 0) + (state.urban ?? 0));
  const cap = carryingCapacity(state);
  const r = GROWTH_RATE_BY_TECH(tech);

  // ロジスティック成長: 上限に近づくほど増加率が下がる
  const growth = pop > 0 ? r * pop * (1 - pop / cap) : 0;
  // 人口は支持上限を超えない（領土を失って上限が下がった国は、次の年次更新で上限まで下がる）
  const newPop = Math.max(0, Math.min(pop + growth, cap));

  // rural/urban の比率は維持したまま増分を配分する（片方が0の国での0除算を避ける）
  const ratio = pop > 0 ? (state.urban ?? 0) / pop : 0.3;
  const newUrban = round2((state.urban ?? 0) + growth * ratio);
  const newRural = round2(newPop - newUrban);

  const industry = round2((newPop / 1000) * INDUSTRY_PER_CAPITA_BY_TECH(tech));
  return { rural: newRural, urban: newUrban, industry };
}

export function clampTech(v) {
  return Math.min(TECH_MAX, Math.max(TECH_MIN, Math.round(v)));
}

function round2(v) { return Math.round(v * 100) / 100; }
