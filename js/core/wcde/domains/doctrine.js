// v6.18.0: 統合ドクトリン。陸・海・空・宇宙の 4 軍で共通の 5 系統（優先火力・高機動戦・人海戦術・陣地戦略・特殊作戦）を、15 段で進める。
//   ・系統は 1 つしか選べない（国の戦争のやり方）。切り替えると、取得した段をすべて失い、約 1 年の「混乱」で効果が落ちる（M.confusion＝残り月数）。
//   ・段は、技術ツリーの技術（火薬・銃・戦車・ステルス…）で解禁される。新しい技術が出れば、同じ系統の次の段が取れる。
//   ・同じ兵力でも、系統によって軍事力が変わる。系統の効果は軍ごとに現れ方が違う（人海戦術: 陸は動員を増やし、海は艦の数を増やす。mob＝動員の上乗せ）。
//   ・基幹・学派・国家固有の旧い系統は廃止した（旧版の保存データは migrateDoctrine が新しい系統へ移す）。
import { BIOMES } from "../../civ/world-consts.js";
import { byState } from "../../civ/spatial.js";

export const FX_KEYS = Object.freeze(["off", "def", "logi", "attr", "naval", "siege", "adapt", "coh", "landing", "armor", "air", "subs", "strike", "mob", "covert", "space"]);
export const CAP = Object.freeze({ off: 0.25, def: 0.4, logi: 0.3, attr: 0.25, naval: 0.35, siege: 0.3, adapt: 0.2, coh: 0.25, landing: 0.25, armor: 0.3, air: 0.35, subs: 0.3, strike: 0.3, mob: 0.3, covert: 0.4, space: 0.3 });
export const BRANCH_SHARE = 1; // 系統は 1 つだけなので、系統ごとの上限は設けない（全体の CAP だけ）
export const FX_JA = Object.freeze({ off: "攻撃", def: "防御", logi: "補給", attr: "損耗軽減", naval: "海軍運用", siege: "攻城", adapt: "戦場適応", coh: "士気の結束", landing: "上陸", armor: "機甲運用", air: "航空運用", subs: "潜水運用", strike: "打撃力", mob: "動員", covert: "秘匿", space: "宇宙運用" });
export const TIERS = 15;
export const SERVICE_JA = Object.freeze({ land: "陸軍", sea: "海軍", air: "空軍", space: "宇宙軍" });

// 系統の定義。tiers: [名前, 技術[], 費用]（15 段）。target: 15 段そろえたときの効果の合計（段ごとに配分）。weak: 小さな欠点
const L = (id, ja, en, color, glyph, desc, svc, target, tiers) => ({ id, ja, en, color, glyph, desc, svc, target, tiers });
export const LINES = Object.freeze([
  L("firepower", "優先火力", "FIREPOWER", "#d0605a", "砲", "まず撃ち、敵を削ってから進む。火力と攻城に優れ、損耗は軽い。",
    { land: "砲兵と火力支援を増やす", sea: "主力艦と艦砲・ミサイルを増やす", air: "爆撃と精密打撃を増やす", space: "軌道からの打撃" },
    { off: 0.13, siege: 0.18, attr: 0.1, strike: 0.15, adapt: -0.03 },
    [["投石と弓の斉射", [], 20], ["弓兵の列", ["bow"], 45], ["青銅の飛び道具", ["bronze_weapons"], 70], ["攻城機械", ["siege_engines"], 110], ["弩の斉射", ["crossbow"], 150], ["火薬の兵器", ["gunpowder"], 220],
     ["銃の一斉射撃", ["firearms"], 300], ["砲兵の組織", ["artillery"], 420], ["施条銃と砲", ["rifled_arms"], 540], ["後装砲と速射", ["breech_loading"], 680], ["機関銃の弾幕", ["machine_gun"], 800], ["榴弾砲の集中", ["howitzer"], 920],
     ["誘導兵器", ["guided_munitions"], 1050], ["ミサイル打撃", ["guided_missiles"], 1180], ["極超音速の打撃", ["hypersonic_weapons"], 1350]]),
  L("mobile", "高機動戦", "MANEUVER", "#6fa8c9", "疾", "速さで敵の防御をすり抜ける。補給の届く範囲と戦場適応が伸びる。",
    { land: "騎兵・機甲・機械化を増やす", sea: "高速艦と空母機動部隊を増やす", air: "制空と空中機動を増やす", space: "軌道上の機動展開" },
    { off: 0.11, adapt: 0.14, logi: 0.12, armor: 0.14, landing: 0.08, def: -0.04 },
    [["斥候と伝令", [], 20], ["騎馬の機動", ["horse_riding"], 45], ["戦車（二輪）の突撃", ["chariot"], 70], ["重騎兵", ["cavalry"], 110], ["街道の行軍", ["roads"], 150], ["兵站の整備", ["military_logistics"], 210],
     ["外洋の機動", ["ocean_sailing"], 290], ["蒸気の機動", ["steam_engine"], 400], ["鉄道動員", ["railway"], 520], ["自動車化", ["motor_vehicle"], 680], ["機械化戦", ["mechanized_warfare"], 820], ["装甲突破", ["tank"], 940],
     ["機械化歩兵の随伴", ["motorized_infantry"], 1050], ["網でつなぐ機動", ["network_warfare"], 1200], ["自律機動", ["autonomous_systems"], 1350]]),
  L("mass", "人海戦術", "MASS", "#d8b45a", "衆", "数で押し切る。動員が増え、士気が高いが、損耗は重い。",
    { land: "多くの兵を動員して競り勝つ", sea: "より多くの艦を動員する", air: "機数を揃えて飽和させる", space: "衛星と軌道機の数を揃える" },
    { mob: 0.2, coh: 0.12, off: 0.06, logi: 0.05, attr: -0.1 },
    [["部族の総出", [], 15], ["数え上げる兵", ["counting"], 40], ["槍兵の大集団", ["bronze_weapons"], 65], ["行政による徴発", ["administration"], 100], ["人口調査", ["census"], 140], ["常備軍の拡大", ["standing_army"], 200],
     ["官僚の動員", ["civil_service"], 280], ["槍と銃の大軍", ["pike_and_shot"], 380], ["国民皆兵", ["conscription"], 500], ["塹壕の人波", ["trench_warfare"], 650], ["対戦車の肉薄", ["anti_tank"], 780], ["総力戦の組織", ["network_warfare"], 920],
     ["無人機の群れ", ["drone_warfare"], 1050], ["自律の大量運用", ["autonomous_systems"], 1200], ["認知を束ねる動員", ["cognitive_warfare"], 1350]]),
  L("position", "陣地戦略", "FORTRESS", "#9fbf8a", "陣", "守りを固め、敵を消耗させる。防御と築城に優れ、攻めは鈍い。",
    { land: "要塞と守備兵を増やす", sea: "沿岸防衛と封鎖を重視する", air: "防空と迎撃を増やす", space: "軌道上の防衛網" },
    { def: 0.2, attr: 0.12, coh: 0.1, siege: 0.06, logi: 0.05, off: -0.04 },
    [["柵と砦", [], 25], ["野営の築城", ["construction"], 50], ["石の城壁", ["masonry"], 75], ["要塞", ["fortification"], 110], ["鉄の守り", ["iron_weapons"], 150], ["城市の整備", ["city_planning"], 200],
     ["コンクリートの堡塁", ["concrete"], 280], ["稜堡と銃眼", ["firearms"], 380], ["鋼の構造", ["structural_steel"], 500], ["塹壕線", ["trench_warfare"], 640], ["対戦車の防御", ["anti_tank"], 770], ["防空網", ["air_defense"], 900],
     ["レーダーの警戒", ["radar_sonar"], 1020], ["衛星の監視", ["satellites"], 1150], ["指向性の盾", ["directed_energy"], 1300]]),
  L("special", "特殊作戦", "SPECIAL OPS", "#a58bd0", "隠", "少数精鋭と情報で、正面を避けて急所を突く。暗殺・破壊工作・潜水・サイバーに強い。",
    { land: "特殊部隊と海兵を増やす", sea: "潜水艦と海兵を増やす", air: "無人機と情報戦を増やす", space: "衛星と軌道上の情報戦" },
    { covert: 0.3, adapt: 0.1, subs: 0.18, landing: 0.1, strike: 0.08, off: 0.04, mob: -0.05 },
    [["斥候と間者", [], 20], ["伏兵の技", ["bow"], 45], ["交易路の耳目", ["barter_networks"], 70], ["使節と密偵", ["diplomacy"], 105], ["弩の暗殺", ["crossbow"], 150], ["駅伝と密書", ["postal_system"], 200],
     ["光学の偵察", ["optics"], 270], ["化学の工作", ["chemistry"], 370], ["電信の傍受", ["telegraph"], 490], ["無線の撹乱", ["radio"], 630], ["特殊部隊", ["special_forces"], 790], ["サイバー戦", ["cyber_warfare"], 930],
     ["ステルス", ["stealth"], 1060], ["認知戦", ["cognitive_warfare"], 1200], ["軌道の秘匿作戦", ["orbital_warfare"], 1350]]),
]);
export const LINE_BY_ID = Object.freeze(Object.fromEntries(LINES.map((l) => [l.id, l])));

// 段ごとの効果の配分: 後ろの段ほど大きい（合計が target に一致）
const W = Array.from({ length: TIERS }, (_, i) => i + 2), WS = W.reduce((a, b) => a + b, 0);
const fxOf = (line, t) => { const o = {}; for (const k in line.target) o[k] = Math.round((line.target[k] * W[t]) / WS * 10000) / 10000; return o; };
const N = (id, ja, branch, tier, prereq, tech, cost, fx) => ({ id, ja, branch, tier, prereq, tech, cost, fx, special: false });
export const COMMON_BRANCHES = Object.freeze(LINES.map((l) => ({ id: l.id, ja: l.ja })));
/** 全 75 ノード（5 系統 × 15 段）。id は "<系統>:<段>"。cost は取得時に国庫から払う */
export const COMMON_NODES = Object.freeze(LINES.flatMap((l) => l.tiers.map(([ja, tech, cost], i) => Object.freeze(N(`${l.id}:${i + 1}`, ja, l.id, i + 1, i ? [`${l.id}:${i}`] : [], tech, cost, fxOf(l, i))))));
export const COMMON_BY_ID = Object.freeze(Object.fromEntries(COMMON_NODES.map((d) => [d.id, d])));
// 旧版の互換（学派・固有の系統は廃止）
export const SCHOOLS = Object.freeze([]), SCHOOL_BY_ID = Object.freeze({}), SCHOOL_NODES = Object.freeze([]), SCHOOL_NODE_BY_ID = Object.freeze({}), SPECIAL_TEMPLATES = Object.freeze([]);
export const isTemplate = () => false;

const sat = (x, k = 1) => Math.max(0, Math.min(1, x / k));
/** 国家の事情（系統の得点の入力）。地形は領域の集団の位置から集計する */
export function doctrineInfo(ctx, st) {
  const { world, civ } = ctx, ce = world.cell, gs = byState(ctx).get(st.id) ?? [], P = st.politics, inf = { nobility: 0, clergy: 0, merchants: 0, military: 0, commoners: 0 };
  if (P) for (const k of Object.keys(inf)) inf[k] = P.factions[k]?.influence ?? 0;
  let tot = 0, past = 0, mtn = 0, riv = 0, coast = 0, steppe = 0, wet = 0, city = 0;
  for (const g of gs) { tot += g.pop; const c = g.cell; if (g.subsistence === "pastoral") past += g.pop; if ((ce.mountain?.[c] ?? 0) > 0 || ce.biome[c] === BIOMES.ALPINE) mtn += g.pop; if (ce.river[c]) riv += g.pop; if (ce.coastDist[c] <= 1) coast += g.pop; const b = ce.biome[c]; if (b === BIOMES.GRASSLAND || b === BIOMES.SAVANNA || b === BIOMES.COLD_DESERT) steppe += g.pop; if (b === BIOMES.WETLAND) wet += g.pop; const s = g.settlementId ? civ.settlements[g.settlementId]?.stage : null; if (s === "town" || s === "city") city += g.pop; }
  const f = (x) => (tot ? x / tot : 0), x = st.military?.exp ?? {};
  return { polity: st.polity, inf, pastoral: f(past), mountain: f(mtn), river: f(riv), coast: f(coast), steppe: f(steppe), wet: f(wet), city: f(city), pop: tot, stability: st.stability, expOff: (x.won ?? 0) + (x.sieges ?? 0), expDef: x.defended ?? 0, expLost: x.lost ?? 0 };
}
/** 系統の得点（国の事情に合う系統ほど高い）。AI の選択・建国の推奨に使う */
export function lineScores(info) {
  const polity = info.polity, big = Math.min(1, (info.pop ?? 0) / 4e6);
  return {
    firepower: 0.3 + 0.5 * info.city + 0.4 * sat(info.expOff, 8) + (polity === "kingdom" || polity === "empire" ? 0.15 : 0),
    mobile: 0.3 + 0.9 * info.pastoral + 0.6 * info.steppe + 0.3 * sat(info.expOff, 8) + (polity === "empire" ? 0.1 : 0),
    mass: 0.3 + 0.5 * big + 0.4 * info.inf.commoners + (polity === "empire" ? 0.3 : 0) + 0.2 * (info.polity === "tribal" ? 1 : 0),
    position: 0.3 + 0.9 * info.mountain + 0.4 * info.city + 0.5 * sat(info.expDef, 6) + 0.3 * (info.polity === "republic" ? 1 : 0) + 0.2 * info.wet,
    special: 0.2 + 0.4 * info.coast + 0.5 * info.inf.merchants + 0.3 * (1 - info.stability) + 0.2 * info.river,
  };
}
export function bestLine(info, prev = null) { const s = lineScores(info); let best = null; for (const l of LINES) { const v = s[l.id] + (prev === l.id ? 0.12 : 0); if (!best || v > best.v || (v === best.v && l.id < best.id)) best = { id: l.id, v }; } return best.id; }
/** 互換: 旧い「固有の系統」は無い */
export const chooseSpecial = () => [];

export const nodesOf = () => COMMON_NODES;
export const nodeOf = (st, id) => COMMON_BY_ID[id] ?? null;
export const branchesOf = () => LINES.map((l) => ({ id: l.id, ja: l.ja, special: false, desc: l.desc }));
/** いま選んでいる系統（取得した段があるか、選んだ記録があるか） */
export const lineOf = (st) => st.military?.doc?.line ?? null;
export const tierOf = (st) => { const l = lineOf(st), t = st.military?.doctrine?.taken ?? {}; let n = 0; if (l) for (let i = 1; i <= TIERS; i++) if (t[`${l}:${i}`] != null) n = i; return n; };
/** 取得済みのうち有効なもの（系統が 1 つなので、すべて） */
export function activeNodes(st) { const taken = st.military?.doctrine?.taken ?? {}, out = []; for (const id in taken) { const n = COMMON_BY_ID[id]; if (n) out.push(n); } return out; }
export const masteredSchools = () => [];
/** 熟達（15 段そろえたとき）の小さな加算 */
const MASTERY = Object.freeze({ off: 0.02, def: 0.02, coh: 0.03 });
/** 効果の集計。全体は CAP まで（欠点の側は CAP の半分まで）。混乱の間は、効果が最大 6 割落ちる */
export function doctrineFx(st) {
  const out = Object.fromEntries(FX_KEYS.map((k) => [k, 0])); for (const n of activeNodes(st)) for (const k in n.fx) if (k in out) out[k] += n.fx[k];
  if (tierOf(st) >= TIERS) for (const k in MASTERY) out[k] += MASTERY[k];
  const conf = Math.max(0, Math.min(1, (st.military?.confusion ?? 0) / 12)), keep = 1 - 0.6 * conf;
  for (const k of FX_KEYS) { const v = (out[k] >= 0 ? out[k] * keep : out[k]); out[k] = Math.round(Math.max(-CAP[k] * 0.5, Math.min(v, CAP[k])) * 1000) / 1000; } return out;
}
/** 軍ごとの現れ方（系統の効果を軍に合わせて読み替える。表示と戦闘の補正に使う） */
export function serviceFx(st, svc) {
  const f = st.military?.fx ?? {}, l = lineOf(st);
  if (!l) return { power: 1, note: "" };
  const p = LINE_BY_ID[l]; let m = 1;
  if (l === "mass") m += (f.mob ?? 0) * (svc === "land" ? 1 : svc === "sea" ? 0.9 : svc === "air" ? 0.6 : 0.4);
  else if (l === "firepower") m += (f.strike ?? 0) * (svc === "air" ? 0.8 : svc === "sea" ? 0.7 : svc === "space" ? 0.9 : 0.5);
  else if (l === "mobile") m += (f.adapt ?? 0) * (svc === "air" ? 0.8 : svc === "sea" ? 0.6 : svc === "space" ? 0.5 : 1);
  else if (l === "position") m += (f.def ?? 0) * (svc === "land" ? 0.5 : svc === "air" ? 0.4 : 0.3);
  else m += (f.covert ?? 0) * (svc === "land" ? 0.15 : svc === "sea" ? 0.35 : svc === "air" ? 0.25 : 0.4);
  return { power: Math.round(m * 1000) / 1000, note: p.svc[svc] ?? "" };
}
/** 旧版の保存データの移行: 旧い系統のノード（陸戦 … 学派 … 固有）は新しい系統の段へ置き換える（取得の数だけ、国の事情に合う系統の先頭から） */
export function migrateDoctrine(st, info = null) {
  const M = st.military; if (!M) return; const taken = M.doctrine?.taken ?? {}, ids = Object.keys(taken);
  M.special = []; M.school = { land: null, sea: null, air: null }; M.confusion ??= 0;
  if (!ids.length || ids.every((i) => COMMON_BY_ID[i])) { if (!M.doc) M.doc = { line: ids.length ? ids[0].split(":")[0] : null, since: 0 }; return; }
  const line = M.doc?.line ?? (info ? bestLine(info) : "position"), n = Math.min(ids.length, TIERS), keep = {}; for (let i = 1; i <= n; i++) keep[`${line}:${i}`] = 0;
  M.doctrine = { taken: keep }; M.doc = { line, since: 0 };
}
