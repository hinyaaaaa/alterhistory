// 技術の進捗（v2.7.0）。見える段（6分野×10段）とドクトリンはそのまま、その間を「進捗」（次の段まで 0〜1）で細分化する。
//   ・進捗は毎月たまる。速さは「産業力 × 経済力 × 技術力」の三位一体（幾何平均）で決まる。どれかが欠けると全体が鈍る。
//       産業力 I … 産業の実力（いまの産業÷その技術水準で見込まれる産業）
//       経済力 E … 財政の余力（余波・戦争・軍事費を引いたもの）と、食料の裏づけ
//       技術力 T … 知の土台（都市化・通信・啓蒙／保守の思潮）と、先に進んだ隣国からの波及
//   ・分野ごとに効き方が違う（農業は食料の不足が、医療は疫病が、工業・エネルギーは産業力が、交通は経済力が後押しする）
//   ・進捗が満ちても段は自動では上がらない。機運（tech-momentum.js）が出て、採用ボタンで +1 段（v2.6.0 の決定を維持）
//   ・保存先: 国の techProgress = { 分野: 0〜1 }
// 純粋ロジック層：DOM に依存しない。
import { makeCommand, setProps } from "../edit/commands.js";
import { TECH_TRACKS, TECH_MAX, getTechDoctrine, getTechProgress } from "../edit/doctrines.js";
import { getIndicators } from "./pressure.js";
import { ideasOf, ideaTechBonus } from "./ideas.js";
import { neighborsOfStates } from "./tech-momentum.js";
import { militaryBurden } from "./world.js";
import { BALANCE } from "./balance.js";
import { paceMultiplier } from "./ai-pace.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** 条件がそろったときに、1つの段を進めるのにかかる月数（既定は約50年） */
export const BASE_MONTHS = 600;

/** 産業力・経済力・技術力（それぞれ 1 前後が標準） */
export function trinityOf(map, stateId, date = map.worldTime ?? { year: 1, month: 1 }, inds = null) {
  const s = map.pack.states[stateId]; if (!isLive(s)) return null;
  const ind = (inds ?? getIndicators(map, date)).get(stateId); if (!ind) return null;
  const ideas = ideasOf(map, stateId, ind);
  const I = clamp(ind.industryRatio, 0.3, 1.5);
  const E = clamp(ind.fiscalSlack - 0.6 * militaryBurden(s), 0.15, 1.2) * Math.sqrt(clamp(ind.food, 0.3, 1));
  const T = clamp(0.55 + 0.5 * ind.urbanShare + 0.025 * ind.lv.comms + ideaTechBonus(ideas), 0.3, 1.6);
  return { I, E, T, trinity: Math.cbrt(I * E * T), ind, ideas };
}

/** 分野ごとの、1か月あたりの進捗の増え。段が上がる手前（最高段）は 0 */
export function progressRates(map, stateId, date, ctx = {}) {
  const tri = trinityOf(map, stateId, date, ctx.inds ?? null); if (!tri) return null;
  const { ind } = tri, lv = ind.lv, nb = ctx.nb ?? neighborsOfStates(map);
  const neigh = [...(nb.get(stateId) ?? [])].filter((n) => isLive(map.pack.states[n]));
  // v3.0.0: アルゴリズム国家は、プレイヤー国とのペースの差に応じて速さを補正する（進みすぎは鈍り、遅れは速まる）
  const pace = ((BALANCE.techPace ?? 1) / BASE_MONTHS) * paceMultiplier(map, stateId, date), out = {};
  for (const t of TECH_TRACKS) {
    if (lv[t.key] >= TECH_MAX) { out[t.key] = 0; continue; }
    const ahead = neigh.length ? neigh.filter((n) => getTechDoctrine(map.pack.states[n])[t.key] > lv[t.key]).length / neigh.length : 0;
    const tf = { agri: 1 + 0.3 * Math.max(0, 1 - ind.food), medicine: 1 + 0.4 * clamp(ind.stress.health, 0, 1), ind: Math.sqrt(tri.I), energy: Math.sqrt(tri.I), transport: Math.sqrt(tri.E), comms: 0.8 + 0.4 * ind.urbanShare }[t.key] ?? 1;
    out[t.key] = pace * tri.trinity * tf * (1 + 0.6 * ahead) * (1 - 0.5 * ind.war) / (1 + 0.1 * (lv[t.key] - 1));
  }
  return { rates: out, ...tri };
}

/** 1か月ぶんの進捗を進めるコマンド（変化が無ければ null）。段は上げない（満ちたら 1 で止まる） */
export function planTechProgressMonth(map, date) {
  if (!((BALANCE.techPace ?? 1) > 0)) return null;
  let inds; try { inds = getIndicators(map, date); } catch { return null; }
  const nb = neighborsOfStates(map), parts = [];
  for (const s of map.pack.states) {
    if (!isLive(s)) continue;
    const r = progressRates(map, s.i, date, { inds, nb }); if (!r) continue;
    const cur = getTechProgress(s), next = { ...cur }; let changed = false;
    for (const t of TECH_TRACKS) { const v = Math.round(clamp(cur[t.key] + r.rates[t.key], 0, 1) * 10000) / 10000; if (v !== cur[t.key]) { next[t.key] = v; changed = true; } }
    if (changed) parts.push(setProps(s, { techProgress: next }));
  }
  return parts.length ? makeCommand("技術の進捗（月）", [], parts) : null;
}
