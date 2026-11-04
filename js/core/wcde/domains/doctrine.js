// v6.1.0 M6: 軍事ドクトリン。仕様 §8.1。
//   構成は「共通の基幹 5 系統」＋「その国家固有の 3 系統」。各系統は上から下へ段階（tier）を降りる縦の鎖で、各ノードの前提は同じ系統の一つ上（と、あれば他系統の一つ）。
//   ・共通 5 系統: 陸戦（infantry）／機動（mobility）／防衛・築城（defense）／兵站・組織（logistics）／海洋（sea）。
//   ・固有 3 系統: 政体・社会（支持勢力の影響力）・地形・過去の戦争経験・技術から、テンプレートの得点で選ぶ。全国家に同じ固定名を与えない。年 1 回見直し、直近に選んだ系統は選ばれやすい（ふらつき防止）。
//   ・効果は攻撃・防御だけではない。fx: off=攻撃 def=防御 logi=補給の届く範囲 attr=損耗の軽減 naval=海軍運用 siege=攻城 adapt=戦場適応（地形・奇襲） coh=士気の結束 landing=上陸。
//   ・取得に研究点・研究キューは使わない。条件（技術の制度化・政体・系統の前提・財政）を満たす選択可能な方針を選ぶ操作。
//   ・上限: 全体の上限（CAP）と、一つの系統が出せる寄与の上限（CAP × BRANCH_SHARE）。単一の系統の一強化を避ける。
import { BIOMES } from "../../civ/world-consts.js";
import { byState } from "../../civ/spatial.js";

export const FX_KEYS = Object.freeze(["off", "def", "logi", "attr", "naval", "siege", "adapt", "coh", "landing"]);
export const CAP = Object.freeze({ off: 0.25, def: 0.4, logi: 0.3, attr: 0.25, naval: 0.35, siege: 0.3, adapt: 0.2, coh: 0.25, landing: 0.25 });
export const BRANCH_SHARE = 0.6;
export const FX_JA = Object.freeze({ off: "攻撃", def: "防御", logi: "補給", attr: "損耗軽減", naval: "海軍運用", siege: "攻城", adapt: "戦場適応", coh: "士気の結束", landing: "上陸" });

const N = (id, ja, branch, tier, prereq, tech, cost, fx) => ({ id, ja, branch, tier, prereq, tech, cost, fx, special: false });
export const COMMON_BRANCHES = Object.freeze([
  { id: "infantry", ja: "陸戦" }, { id: "mobility", ja: "機動" }, { id: "defense", ja: "防衛・築城" }, { id: "logistics", ja: "兵站・組織" }, { id: "sea", ja: "海洋" },
]);
/** 共通 25 ノード（5 系統 × 5 段）。cost は取得時に国庫から払う */
export const COMMON_NODES = Object.freeze([
  N("levy_drill", "徴集兵の訓練", "infantry", 1, [], [], 20, { off: 0.03, def: 0.02 }),
  N("spear_phalanx", "密集槍陣", "infantry", 2, ["levy_drill"], ["bronze_weapons"], 55, { off: 0.04, def: 0.05 }),
  N("heavy_infantry", "重装歩兵", "infantry", 3, ["spear_phalanx"], ["iron_weapons"], 110, { off: 0.06, def: 0.04, coh: 0.04 }),
  N("gun_line", "線形戦列", "infantry", 4, ["heavy_infantry"], ["gunpowder"], 300, { off: 0.09, def: 0.03, coh: 0.03 }),
  N("open_order", "散開戦術", "infantry", 5, ["gun_line"], ["rifled_arms"], 520, { off: 0.08, def: 0.05, attr: 0.04 }),
  N("scout_screen", "斥候網", "mobility", 1, [], [], 20, { adapt: 0.03, logi: 0.02 }),
  N("mounted_charge", "騎兵突撃", "mobility", 2, ["scout_screen"], ["horse_riding"], 70, { off: 0.07, adapt: 0.02 }),
  N("horse_archery", "騎射", "mobility", 3, ["mounted_charge"], ["horse_riding", "bow"], 100, { off: 0.06, adapt: 0.04 }),
  N("combined_arms", "諸兵科連合", "mobility", 4, ["horse_archery", "heavy_infantry"], ["cavalry"], 180, { off: 0.07, def: 0.03, coh: 0.03 }),
  N("mobile_warfare", "機動戦", "mobility", 5, ["combined_arms"], ["mechanized_warfare"], 600, { off: 0.1, adapt: 0.06, logi: 0.05 }),
  N("shield_wall", "盾の壁", "defense", 1, [], [], 25, { def: 0.06 }),
  N("fortified_camp", "野営築城", "defense", 2, ["shield_wall"], ["fortification"], 60, { def: 0.08, attr: 0.02 }),
  N("siege_craft", "攻城術", "defense", 3, ["fortified_camp"], ["siege_engines"], 120, { off: 0.04, siege: 0.12 }),
  N("bastion_forts", "稜堡式築城", "defense", 4, ["siege_craft"], ["gunpowder"], 320, { def: 0.1, siege: 0.1 }),
  N("depth_defense", "縦深防御", "defense", 5, ["bastion_forts"], ["artillery"], 560, { def: 0.1, attr: 0.04, coh: 0.03 }),
  N("supply_train", "補給線の整備", "logistics", 1, [], [], 25, { logi: 0.05 }),
  N("standing_army", "常備軍", "logistics", 2, ["supply_train"], ["administration"], 200, { off: 0.06, def: 0.04, logi: 0.03 }),
  N("officer_corps", "将校団", "logistics", 3, ["standing_army"], ["writing"], 220, { off: 0.05, def: 0.03, coh: 0.05 }),
  N("general_staff", "参謀組織", "logistics", 4, ["officer_corps"], ["mathematics"], 350, { off: 0.06, def: 0.04, coh: 0.04 }),
  N("rear_services", "後方支援", "logistics", 5, ["general_staff"], ["military_logistics"], 420, { logi: 0.12, attr: 0.08 }),
  N("river_craft", "舟運と渡河", "sea", 1, [], ["seafaring"], 30, { naval: 0.05, logi: 0.02 }),
  N("naval_marines", "海兵", "sea", 2, ["river_craft"], ["shipbuilding"], 110, { off: 0.04, naval: 0.08, landing: 0.06 }),
  N("coast_defense", "沿岸防衛", "sea", 3, ["naval_marines"], ["shipbuilding"], 100, { def: 0.06, naval: 0.05 }),
  N("fleet_doctrine", "艦隊運用", "sea", 4, ["coast_defense"], ["naval_warfare"], 240, { off: 0.03, naval: 0.15 }),
  N("blue_water", "外洋遠征", "sea", 5, ["fleet_doctrine"], ["navigation"], 380, { naval: 0.1, logi: 0.05, landing: 0.12 }),
]);
export const COMMON_BY_ID = Object.freeze(Object.fromEntries(COMMON_NODES.map((d) => [d.id, d])));

// ---- 国家固有の系統のテンプレート（3 段）。score(info) の高い順に 3 本選ぶ
const S = (id, ja, score, tiers) => ({ id, ja, score, tiers });
const T = (ja, tier, tech, cost, fx) => ({ ja, tier, tech, cost, fx });
const sat = (x, k = 1) => Math.max(0, Math.min(1, x / k));
export const SPECIAL_TEMPLATES = Object.freeze([
  S("steppe_riders", "草原の騎射", (i) => 0.9 * i.pastoral + 0.5 * i.steppe, [T("騎馬の氏族軍", 1, [], 30, { off: 0.04, adapt: 0.03 }), T("移動する本営", 2, ["horse_riding"], 70, { logi: 0.07, adapt: 0.04 }), T("包囲と偽装退却", 3, ["horse_riding"], 130, { off: 0.07, attr: 0.04 })]),
  S("mountain_war", "山岳戦", (i) => 1.1 * i.mountain, [T("峠の守り", 1, [], 30, { def: 0.06 }), T("山の隘路", 2, [], 70, { def: 0.05, adapt: 0.05 }), T("山の遊撃", 3, ["bow"], 120, { off: 0.04, attr: 0.06, adapt: 0.04 })]),
  S("river_war", "河川・湿地戦", (i) => 1.0 * i.river + 0.3 * i.wet, [T("渡河の備え", 1, [], 30, { adapt: 0.04, def: 0.02 }), T("河川の舟兵", 2, ["seafaring"], 70, { naval: 0.06, logi: 0.04 }), T("水陸の機動", 3, ["shipbuilding"], 120, { off: 0.04, landing: 0.06, adapt: 0.03 })]),
  S("warband", "戦士団の絆", (i) => (i.polity === "tribal" ? 0.7 : i.polity === "chiefdom" ? 0.55 : 0) + 0.3 * i.inf.military, [T("襲撃の作法", 1, [], 25, { off: 0.05 }), T("戦士団の誓い", 2, [], 50, { off: 0.04, coh: 0.05 }), T("首長の親衛", 3, ["bronze_weapons"], 100, { def: 0.05, coh: 0.06 })]),
  S("feudal_knights", "封建の軍役", (i) => (i.polity === "kingdom" ? 0.6 : 0) + 0.8 * i.inf.nobility, [T("領主の軍役", 1, [], 50, { off: 0.04, def: 0.03 }), T("騎士団", 2, ["horse_riding"], 120, { off: 0.08, coh: 0.03 }), T("城塞と封土", 3, ["fortification"], 150, { def: 0.08, attr: 0.03 })]),
  S("temple_host", "聖戦と神殿", (i) => (i.polity === "theocracy" ? 0.8 : 0) + 0.9 * i.inf.clergy, [T("聖戦の教え", 1, [], 60, { off: 0.06, coh: 0.04 }), T("神殿守護", 2, ["construction"], 90, { def: 0.07, coh: 0.04 }), T("殉教の覚悟", 3, [], 130, { attr: 0.07, coh: 0.06 })]),
  S("citizen_army", "市民の軍", (i) => (i.polity === "republic" ? 0.7 : 0) + 0.7 * i.inf.commoners, [T("市民皆兵", 1, [], 55, { def: 0.06, coh: 0.03 }), T("市民の戦列", 2, ["iron_weapons"], 110, { off: 0.04, def: 0.05, coh: 0.04 }), T("志願の将校", 3, ["writing"], 160, { off: 0.05, coh: 0.06 })]),
  S("imperial_legions", "軍団と官僚", (i) => (i.polity === "empire" ? 0.8 : 0) + (i.admin ? 0.4 : 0) + 0.3 * i.inf.military, [T("軍団制", 1, ["iron_weapons"], 130, { off: 0.06, def: 0.04 }), T("街道と駐屯", 2, ["construction"], 150, { logi: 0.1, def: 0.03 }), T("官僚の兵站", 3, ["administration"], 220, { logi: 0.08, attr: 0.05 })]),
  S("maritime_league", "海上の護り", (i) => 0.9 * i.coast + 0.6 * i.inf.merchants + 0.4 * sat(i.trade, 1), [T("沿岸の護衛船", 1, ["seafaring"], 50, { naval: 0.06 }), T("商船の武装", 2, ["shipbuilding"], 110, { naval: 0.08, logi: 0.04 }), T("通商路の制海", 3, ["naval_warfare"], 200, { naval: 0.1, landing: 0.05 })]),
  S("fortress_towns", "城市の守り", (i) => 0.9 * i.city + 0.5 * sat(i.expDef, 6), [T("城門と市壁", 1, [], 40, { def: 0.06 }), T("市民の守備隊", 2, ["fortification"], 100, { def: 0.07, coh: 0.04 }), T("籠城の備蓄", 3, ["fortification"], 150, { attr: 0.07, def: 0.05 })]),
  S("expedition", "遠征の軍", (i) => 0.8 * sat(i.expOff, 8) + (i.polity === "empire" || i.polity === "kingdom" ? 0.25 : 0), [T("遠征の隊列", 1, [], 60, { logi: 0.05, off: 0.03 }), T("現地調達", 2, [], 110, { logi: 0.08, attr: 0.03 }), T("電撃の進軍", 3, ["military_logistics"], 200, { off: 0.07, adapt: 0.05 })]),
  S("irregular_war", "義勇と遊撃", (i) => 0.7 * sat(i.expLost, 6) + 0.4 * (1 - i.stability), [T("在地の義勇", 1, [], 25, { def: 0.04, adapt: 0.04 }), T("遊撃と撹乱", 2, [], 60, { attr: 0.05, adapt: 0.05 }), T("住民の支え", 3, [], 100, { coh: 0.07, def: 0.04 })]),
  // 下の 2 つは、どの条件にも当てはまらない国家の受け皿
  S("levy_tradition", "民兵の伝統", () => 0.1, [T("村の民兵", 1, [], 20, { def: 0.04 }), T("季節の動員", 2, [], 50, { logi: 0.04, off: 0.03 }), T("在郷の将", 3, [], 90, { coh: 0.05, off: 0.03 })]),
  S("border_guard", "辺境の守り", () => 0.09, [T("烽火と砦", 1, [], 25, { def: 0.04, adapt: 0.02 }), T("辺境の屯田", 2, [], 60, { logi: 0.05 }), T("国境の機動", 3, [], 100, { adapt: 0.05, off: 0.03 })]),
]);
const TPL = Object.freeze(Object.fromEntries(SPECIAL_TEMPLATES.map((t) => [t.id, t])));

/** 国家の事情（固有系統の得点の入力）。地形は領域の集団の位置から集計する */
export function doctrineInfo(ctx, st) {
  const { world, civ } = ctx, ce = world.cell, gs = byState(ctx).get(st.id) ?? [], P = st.politics, inf = { nobility: 0, clergy: 0, merchants: 0, military: 0, commoners: 0 };
  if (P) for (const k of Object.keys(inf)) inf[k] = P.factions[k]?.influence ?? 0;
  let tot = 0, past = 0, mtn = 0, riv = 0, coast = 0, steppe = 0, wet = 0, city = 0;
  for (const g of gs) { tot += g.pop; const c = g.cell; if (g.subsistence === "pastoral") past += g.pop; if ((ce.mountain?.[c] ?? 0) > 0 || ce.biome[c] === BIOMES.ALPINE) mtn += g.pop; if (ce.river[c]) riv += g.pop; if (ce.coastDist[c] <= 1) coast += g.pop; const b = ce.biome[c]; if (b === BIOMES.GRASSLAND || b === BIOMES.SAVANNA || b === BIOMES.COLD_DESERT) steppe += g.pop; if (b === BIOMES.WETLAND) wet += g.pop; const s = g.settlementId ? civ.settlements[g.settlementId]?.stage : null; if (s === "town" || s === "city") city += g.pop; }
  const f = (x) => (tot ? x / tot : 0), x = st.military?.exp ?? {};
  return { polity: st.polity, inf, pastoral: f(past), mountain: f(mtn), river: f(riv), coast: f(coast), steppe: f(steppe), wet: f(wet), city: f(city), trade: Object.values(st.econ?.trade ?? {}).reduce((a, b) => a + b, 0), admin: st.techAdopted?.administration != null, stability: st.stability, expOff: (x.won ?? 0) + (x.sieges ?? 0), expDef: x.defended ?? 0, expLost: x.lost ?? 0 };
}

/** 固有の系統を選ぶ（得点の高い 3 本。直近の系統には加点）。{ id, ja, nodes } の配列。ノードは国家に保存される */
export function chooseSpecial(info, prev = []) {
  const keep = new Set(prev.map((b) => b.key)), list = SPECIAL_TEMPLATES.map((t) => ({ t, s: t.score(info) + (keep.has(t.id) ? 0.12 : 0) })).sort((a, b) => b.s - a.s || (a.t.id < b.t.id ? -1 : 1)).slice(0, 3);
  return list.map(({ t }, bi) => ({ key: t.id, ja: t.ja, lane: bi, nodes: t.tiers.map((x) => ({ id: `sp:${t.id}:${x.tier}`, ja: x.ja, branch: `sp:${t.id}`, tier: x.tier, prereq: x.tier > 1 ? [`sp:${t.id}:${x.tier - 1}`] : [], tech: x.tech, cost: x.cost, fx: x.fx, special: true })) }));
}
export const isTemplate = (key) => !!TPL[key];

/** その国家で使える（定義されている）ノードの一覧: 共通 25 ＋ 固有 9。UI の木・取得の検証・AI の候補はすべてここから導く */
export const nodesOf = (st) => [...COMMON_NODES, ...(st.military?.special ?? []).flatMap((b) => b.nodes)];
export const nodeOf = (st, id) => COMMON_BY_ID[id] ?? (st.military?.special ?? []).flatMap((b) => b.nodes).find((n) => n.id === id) ?? null;
export const branchesOf = (st) => [...COMMON_BRANCHES.map((b) => ({ ...b, special: false })), ...(st.military?.special ?? []).map((b) => ({ id: `sp:${b.key}`, ja: b.ja, special: true }))];

/** 取得済みのうち、今の国家で有効なもの（固有の系統が入れ替わると、前の系統のノードは休眠して効かない） */
export function activeNodes(st) {
  const taken = st.military?.doctrine?.taken ?? {}, sp = new Set((st.military?.special ?? []).map((b) => `sp:${b.key}`)), out = [];
  for (const id in taken) { const n = nodeOf(st, id); if (n && (!n.special || sp.has(n.branch))) out.push(n); }
  return out;
}
/** 効果の集計。系統ごとの寄与は CAP × BRANCH_SHARE まで、全体は CAP まで */
export function doctrineFx(st) {
  const by = new Map(); for (const n of activeNodes(st)) { const m = by.get(n.branch) ?? by.set(n.branch, {}).get(n.branch); for (const k in n.fx) m[k] = (m[k] ?? 0) + n.fx[k]; }
  const out = Object.fromEntries(FX_KEYS.map((k) => [k, 0]));
  for (const m of by.values()) for (const k in m) out[k] += Math.min(m[k], CAP[k] * BRANCH_SHARE);
  for (const k of FX_KEYS) out[k] = Math.round(Math.min(out[k], CAP[k]) * 1000) / 1000; return out;
}
