// v6.1.0 M3: 技術（独立発生・伝播・喪失・再発見・制度化）。統合技術ツリー（techtree.js）の上で動く。仕様 §6。
//   ・研究点・研究キュー・研究所は無い。技術は、集団の規模・既存の知識・環境・交流・都市化・経済・競争から、確率的に独立して発生する（発生率 = 1/E × 係数）。
//   ・保有（知っている）・利用（できること）・制度化（国家が採用して設備・制度にする）・普及（国内の人口のうち知っている割合）は別の概念。
//       保有: 集団 g.tech.known[key] = 月。 制度化: 国家 st.techAdopted[key] = 月。 普及: techCoverage()（派生。保存しない）。 利用: caps（解禁される行動・制度・ユニット・条約）。
//   ・伝播は経路ごと: 接触（近隣）・交易（条約）・教育制度・移住（分派が持ち出す）・併合。喪失は人口が必要規模を割ったとき。前提を失っても即座には消さず、機能が劣化する。
//   ・乱数は (historySeed, 期間, 集団, 技術) から決まり、他の機能の乱数消費に左右されない。
//   ・歴史資料へ残すのは世界で初めての発見・国家の制度化・国の首都での喪失などの結果だけ。個々の集団への伝播は件数（techWorld）にだけ数える。
import { makeEvent } from "./events.js";
import { dominant } from "./cohorts.js";
import { neighborGroups } from "./spatial.js";
import { BIOMES, RES } from "./world-consts.js";
import { hashSeed } from "./civ-state.js";
import { lateBoost } from "./calibration.js";
import { TREE, NODE, LANE, LANES, validateTree, layoutGrid, COLS } from "./techtree.js";

export { LANES, validateTree, layoutGrid, COLS };
const nearWater = (w, g) => w.cell.coastDist[g.cell] <= 2 || w.cell.river[g.cell];
const maskCache = new WeakMap();
/** 集団の領域にある資源（ビット和）。領域が変わらない限り使い回す（派生データ） */
export function resMaskOf(w, g) { const cells = g.cells ?? [g.cell], c = maskCache.get(g); if (c && c.n === cells.length && c.c0 === cells[0]) return c.m; let m = 0; for (const x of cells) m |= w.cell.resource[x]; maskCache.set(g, { n: cells.length, c0: cells[0], m }); return m; }
/** 地理条件。名前は techtree.js の cond と対応する（成立の歴史的な条件） */
export const COND = Object.freeze({
  water: { ja: "水辺（海・川・湖）", f: (w, g) => nearWater(w, g) },
  coast: { ja: "海岸", f: (w, g) => w.cell.coastDist[g.cell] <= 1 },
  fertile: { ja: "肥沃で水に近く、人口圧が高い土地", f: (w, g) => w.cell.fertility[g.cell] > 0.45 && nearWater(w, g) && g.pressure > 0.6 },
  grass: { ja: "草原・サバンナで人口圧が高い土地", f: (w, g) => (w.cell.biome[g.cell] === BIOMES.GRASSLAND || w.cell.biome[g.cell] === BIOMES.SAVANNA) && g.pressure > 0.7 },
  clay: { ja: "粘土のある土地", f: (w, g) => (resMaskOf(w, g) & RES.CLAY) !== 0 },
  cu_sn: { ja: "銅または錫のある土地", f: (w, g) => (resMaskOf(w, g) & (RES.COPPER | RES.TIN)) !== 0 },
  iron: { ja: "鉄鉱のある土地", f: (w, g) => (resMaskOf(w, g) & RES.IRON) !== 0 },
  coal: { ja: "石炭のある土地", f: (w, g) => (resMaskOf(w, g) & RES.COAL) !== 0 },
  stone: { ja: "石材のある土地", f: (w, g) => (resMaskOf(w, g) & RES.STONE) !== 0 },
});
const tierOf = (col) => 1 + Math.floor(col / 3);
/** 旧来の形（key・name・field・tier・prereq・minPop・settled・cond）に、新しい項目（E・caps・fx・col・lane）を足したもの。列（col）の昇順＝前提が必ず先 */
export const TECHS = Object.freeze([...TREE].sort((a, b) => a.col - b.col).map((t) => Object.freeze({ key: t.id, name: t.ja, field: LANE[t.lane].ja, lane: t.lane, pre: t.pre, tier: tierOf(t.col), cost: t.id === "stone_tools" ? 0 : 1, prereq: t.prereq, minPop: t.pop, settled: t.s, condKey: t.cond, cond: t.cond ? COND[t.cond].f : null, E: t.E, caps: t.caps, fx: t.fx, col: t.col, desc: t.desc, why: t.why })));
export const TECH = Object.freeze(Object.fromEntries(TECHS.map((t) => [t.key, t])));
const BASE_KNOWLEDGE = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" };
const REDISCOVER = 3.3;               // 失われた技術は、再発見が約 3 倍速い
const POP_REF = 600000;               // 世界人口の効果の基準（Kremer 型。上限 1.5 倍）
const REF_GROUPS = 1300;             // 発生率の基準となる集団数（E の調整はこの規模で行った）
const PERIOD = 3;                     // 評価は 3 か月ごと（集団ごとにずらす）

// ---- 創造主による技術の編集（civ.techOverrides）。通常の AI・プレイヤーの経路ではなく、創造主の命令だけが書く
const ovr = (civ, key) => civ?.techOverrides?.[key] ?? null;
export const prereqOf = (civ, t) => ovr(civ, t.key)?.prereq ?? t.prereq;
export const fxOf = (civ, t) => ovr(civ, t.key)?.fx ?? t.fx;
export const capsOfTech = (civ, t) => ovr(civ, t.key)?.caps ?? t.caps;

/** 次に学べる技術（前提がそろい、まだ知らないもの）。知識が変わったときだけ作り直す */
export const refreshCand = (g, civ = null) => (g.tech.cand = TECHS.filter((t) => g.tech.known[t.key] == null && prereqOf(civ, t).every((p) => g.tech.known[p] != null)).map((t) => t.key));
const learn = (g, key, mi, civ) => { g.tech.known[key] = mi; refreshCand(g, civ); delete g.tech.prog[key]; if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 1; };
const forget = (g, key, civ) => { delete g.tech.known[key]; refreshCand(g, civ); g.tech.lost[key] = true; if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 0; };
/** 成立条件（規模・定住・地理）を満たすか。前提と未知は別に見る */
export const conditionsMet = (w, g, t) => g.pop >= t.minPop && (!t.settled || !!g.settlementId) && (!t.cond || t.cond(w, g));
/** 伝播（接触・交易・教育・併合）で学べるか（v6.8.0）。規模と定住だけを見る。資源・地形の条件（cond）は、独立した発生にだけ課す（技術は知れば、資源のない土地にも伝わる。旧版は同じ集団の領域に粘土と銅・錫が両方ないと青銅が成り立たず、鉄・産業へ続く系統が丸ごと止まった） */
export const spreadable = (g, t) => g.pop >= t.minPop && (!t.settled || !!g.settlementId);
const lateBoostOf = (civ, t) => (civ.options?.wcde && civ.date.year >= 0 ? lateBoost(civ.date.year, t.col) : 1);
export const available = (w, g, t, civ = null) => g.tech.known[t.key] == null && prereqOf(civ, t).every((p) => g.tech.known[p] != null) && conditionsMet(w, g, t);

// ---- 発生率（1年あたり）。画面の説明・先史の圧縮モデル・月次の tick が同じ関数を使う
export const worldDepth = (civ) => Math.min(1, Object.keys(civ.techWorld).length / 45);
/** 知識の蓄積による加速（世界で発見された技術が多いほど、発明は速い）と、世界人口の効果 */
export const accel = (civ, worldPop) => Math.min(1.5, Math.max(0.2, worldPop / POP_REF)) * (0.35 + 1.65 * worldDepth(civ)) * (civ.techPace ?? 1); // v6.8.0: techPace は世界の較正（calibration.js）が掛ける係数
// 集団の知識から導く値（知っている技術の数・学習の効果の和）。知識が変わると refreshCand が cand の配列を作り直すので、その配列を鍵に使い回す（派生データ）
const memo = new WeakMap();
export function knownStats(g, civ = null) { if (!g.tech.cand) refreshCand(g, civ); const c = g.tech.cand; let m = memo.get(c); if (!m) { let n = 0, l = 0; for (const k in g.tech.known) { n++; const t = TECH[k]; if (t) l += fxOf(civ, t).learn ?? 0; } m = { n, l }; memo.set(c, m); } return m; }
const lbCache = new WeakMap();
const stateLearn = (civ, st) => { const c = lbCache.get(st); if (c && civ.monthIndex - c.mi < 6) return c.v; const v = learnBonus(civ, st); lbCache.set(st, { mi: civ.monthIndex, v }); return v; };
const learnFx = (g, civ, st) => knownStats(g, civ).l + (st ? stateLearn(civ, st) * 0.5 : 0);
const stageMult = { village: 1, town: 1.3, city: 1.8 };
/** 独立発生率（年）。env: { accel, contact, rivals }。条件（minPop・定住・地理）を満たさなければ 0 */
export function emergenceRate(world, civ, g, t, env) {
  if (!conditionsMet(world, g, t)) return 0;
  const st = g.stateId ? civ.states[g.stateId] : null, base = 1 / (t.E * (g.tech.lost[t.key] ? 1 / REDISCOVER : 1));
  const popF = Math.min(2.5, Math.sqrt(g.pop / Math.max(60, t.minPop || 60))), known = knownStats(g, civ).n;
  const knowF = 0.7 + 0.5 * Math.min(1, known / 30), contactF = 1 + 0.2 * Math.min(4, env.contact ?? 0);
  const urbanF = g.settlementId ? stageMult[civ.settlements[g.settlementId]?.stage] ?? 1 : 0.85, econF = (st ? 1.2 : 1) * (1 + (st?.econ?.techBoost ?? 0)), learnF = 1 + learnFx(g, civ, st);
  const compF = 1 + (st?.warIds?.length ? 0.12 : 0) + 0.06 * Math.min(3, env.rivals ?? 0);
  return base * popF * knowF * contactF * urbanF * econF * learnF * compF * env.accel * (env.norm ?? 1) * lateBoostOf(civ, t); // v6.8.0: 目標の年を過ぎた技術は発生しやすい
}
/** 期間 years の間に、一度でも発生する確率 */
export const pEmerge = (rate, years) => 1 - Math.exp(-rate * years);
/** 決定的な一様乱数（集団・技術・期間から決まる。ほかの機能の乱数消費に左右されない） */
export const u01 = (civ, ...parts) => hashSeed(civ.historySeed, ...parts) / 4294967296;

const resolve = (civ, g, key, mi, how) => {
  const prior = civ.techWorld[key], wasLost = !!g.tech.lost[key]; learn(g, key, mi, civ); delete g.tech.lost[key];
  const rec = (civ.techWorld[key] ??= { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {} });
  if (!prior || !prior.discoveries) { rec.discoveries = rec.discoveries ?? []; rec.first = rec.first ?? mi; rec.independent = rec.independent ?? 0; rec.spread = rec.spread ?? 0; rec.byChannel = rec.byChannel ?? {}; }
  if (how === "independent") rec.independent++; else { rec.spread++; rec.byChannel[how] = (rec.byChannel[how] ?? 0) + 1; }
  return { first: !prior, wasLost };
};
/** 月次（tech フェーズ）。3 か月ごとに、集団の半分ずつ（ID のハッシュでずらす）を評価する */
export function stepTech(ctx) {
  const { world, civ, ids } = ctx, mi = civ.monthIndex, period = Math.floor(mi / PERIOD), yrs = PERIOD / 12; let worldPop = 0, nG = 0; for (const id in civ.groups) { worldPop += civ.groups[id].pop; nG++; }
  const A = accel(civ, worldPop), norm = Math.min(6, REF_GROUPS / Math.max(150, nG)); // 世界の技術の速さは、集団の数（解像度・細分化）に依らない
  for (const id in civ.groups) {
    const g = civ.groups[id]; if ((hashSeed(id) + mi) % PERIOD !== 0) continue; const k = g.tech.known, d = dominant(g), st = g.stateId ? civ.states[g.stateId] : null;
    if (!g.tech.cand) refreshCand(g, civ);
    const ns = [...neighborGroups(ctx, g)], env = { accel: A, norm, contact: (() => { const mine = knownStats(g, civ).n; let c = 0; for (const o of ns) { const og = civ.groups[o]; if (og?.tech.known && knownStats(og, civ).n >= mine) c++; } return c; })(), rivals: st ? new Set(ns.map((o) => civ.groups[o]?.stateId).filter((s) => s && s !== st.id)).size : 0 };
    // 1) 独立した発生
    for (const key of [...g.tech.cand]) {
      const t = TECH[key], rate = emergenceRate(world, civ, g, t, env); if (rate <= 0 || u01(civ, "tech", period, id, key) >= pEmerge(rate, yrs)) continue;
      const r = resolve(civ, g, key, mi, "independent");
      if (r.first || r.wasLost) makeEvent(civ, ids, { kind: r.wasLost ? "tech_rediscovered" : "tech_discovered", title: `${t.name}を${r.wasLost ? "再発見" : "初めて発見"}`, participants: [{ entityId: g.id, role: "discoverer" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: null, after: mi }] });
    }
    // 2) 近隣からの伝播（接触）。同じ文化・同じ国家は伝わりやすい。件数だけ数え、個々の伝播は歴史資料にしない
    if (ns.length && u01(civ, "contact", period, id) < 0.09) {
      const o = civ.groups[ns[Math.floor(u01(civ, "contactpick", period, id) * ns.length)]];
      if (o) { const cand = TECHS.filter((t) => o.tech.known[t.key] != null && k[t.key] == null && prereqOf(civ, t).every((p) => k[p] != null) && spreadable(g, t)); if (cand.length) { const t = cand[Math.floor(u01(civ, "contacttech", period, id) * cand.length)], same = (dominant(o).cultureId === d.cultureId ? 0.15 : 0) + (o.stateId && o.stateId === g.stateId ? 0.2 : 0); if (u01(civ, "contactacc", period, id) < 0.25 + same) resolve(civ, g, t.key, mi, "contact"); } }
    }
    // 3) 教育制度（国家が記録・文字・印刷・公教育を制度化していると、首都の集団の知識が国内へ広がる）。年に 1 回
    if (st && mi % 12 === (hashSeed(id) % 12) && st.capitalGroupId !== id) { const cap = civ.groups[st.capitalGroupId], boost = learnBonus(civ, st); if (cap && boost > 0) { const cand = TECHS.filter((t) => cap.tech.known[t.key] != null && k[t.key] == null && prereqOf(civ, t).every((p) => k[p] != null) && spreadable(g, t)); if (cand.length && u01(civ, "teach", mi, id) < Math.min(0.6, boost * 2)) resolve(civ, g, cand[Math.floor(u01(civ, "teachpick", mi, id) * cand.length)].key, mi, "teaching"); } }
    // 4) 喪失（人口が必要規模の半分を割ると、まれに知識が途切れる）。上位が先に失われる
    if (u01(civ, "loss", period, id) < 0.003) for (const t of TECHS) if (k[t.key] != null && t.minPop > 0 && g.pop < t.minPop * 0.5) {
      if (TECHS.some((u) => k[u.key] != null && prereqOf(civ, u).includes(t.key) && u.col >= t.col)) continue;
      forget(g, t.key, civ); if (g.id === st?.capitalGroupId) makeEvent(civ, ids, { kind: "tech_lost", title: `${t.name}の知識が失われた`, participants: [{ entityId: g.id, role: "holder" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: mi, after: null }] }); break;
    }
  }
  if (mi % 12 === 6) tradeTransfer(ctx);
}
/** 教育・記録の制度（国家が採用した技術の learn 効果の合計）。国内への伝播の強さ */
export const learnBonus = (civ, st) => { let s = 0; for (const k in st.techAdopted) s += fxOf(civ, TECH[k] ?? { key: k, fx: {} }).learn ?? 0; return s; };
/** 交易（有効な交易条約）の相手の首都集団から、技術が伝わる。年に 1 回 */
function tradeTransfer(ctx) {
  const { world, civ } = ctx, mi = civ.monthIndex;
  for (const tid of civ.activeTreatyIds) {
    const tr = civ.treaties[tid]; if (!tr || tr.type !== "trade") continue; const a = civ.states[tr.a], b = civ.states[tr.b]; if (!a?.alive || !b?.alive) continue;
    for (const [from, to, tag] of [[a, b, "ab"], [b, a, "ba"]]) { const gf = civ.groups[from.capitalGroupId], gt = civ.groups[to.capitalGroupId]; if (!gf || !gt) continue; const cand = TECHS.filter((t) => gf.tech.known[t.key] != null && gt.tech.known[t.key] == null && prereqOf(civ, t).every((p) => gt.tech.known[p] != null) && spreadable(gt, t));
      if (cand.length && u01(civ, "trade", mi, tid, tag) < 0.25) resolve(civ, gt, cand[Math.floor(u01(civ, "tradepick", mi, tid, tag) * cand.length)].key, mi, "trade"); }
  }
}
/** 併合した集団が、国家の首都の知識を学ぶ（併合・征服の経路）。actions.annex_group から呼ぶ */
export function learnByAnnexation(ctx, state, group) {
  const { world, civ } = ctx, cap = civ.groups[state.capitalGroupId]; if (!cap) return 0; let n = 0, mi = civ.monthIndex;
  for (const t of TECHS) if (cap.tech.known[t.key] != null && group.tech.known[t.key] == null && prereqOf(civ, t).every((p) => group.tech.known[p] != null) && spreadable(group, t) && u01(civ, "annex", mi, group.id, t.key) < 0.35) { resolve(civ, group, t.key, mi, "conquest"); n++; }
  return n;
}

// ---- 制度化（国家が採用する）。普及（国内の人口のうち知っている割合）は派生
/** 国内の人口のうち、その技術を知っている割合（0〜1）。派生データ（保存しない） */
export function techCoverage(groups, key) { let tot = 0, have = 0; for (const g of groups) { tot += g.pop; if (g.tech.known[key] != null) have += g.pop; } return tot ? have / tot : 0; }
/** 国家が採用できる技術（所属集団の人口の3割以上が知っていて、まだ採用していない。前提も採用済みか、少なくとも広く知られている） */
export function adoptable(ctx, state, groups) {
  let total = 0; const have = {}; for (const g of groups) { total += g.pop; for (const key in g.tech.known) have[key] = (have[key] ?? 0) + g.pop; }
  return TECHS.filter((t) => t.cost > 0 && state.techAdopted[t.key] == null && (have[t.key] ?? 0) >= total * 0.3).sort((a, b) => a.tier - b.tier || (a.key < b.key ? -1 : 1));
}

// ---- 利用（できること）。行動のボタンの表示条件と、ドメイン側の検証が、同じ caps から導かれる
const capCache = new WeakMap();
/** 国家が持つ caps（採用済みの技術の解禁の和集合）。採用の数が変わらない限り使い回す（派生データ） */
export function capsOf(civ, st) { const n = Object.keys(st.techAdopted).length, c = capCache.get(st); if (c && c.n === n && c.o === (civ?.techOverrides ? 1 : 0)) return c.set; const set = new Set(); for (const k in st.techAdopted) { const t = TECH[k]; if (t) for (const x of capsOfTech(civ, t)) set.add(x); } capCache.set(st, { n, o: civ?.techOverrides ? 1 : 0, set }); return set; }
export const stateCan = (civ, st, cap) => capsOf(civ, st).has(cap);
/** 集団が知っている技術から見た caps（国家の成立前・国家の外の集団。例: 建国の政体の選択肢） */
export function groupCaps(civ, g) { const set = new Set(); for (const k in g.tech.known) { const t = TECH[k]; if (t) for (const x of capsOfTech(civ, t)) set.add(x); } return set; }
/** その caps を解禁する技術（理由の表示用） */
export const techsFor = (cap) => TECHS.filter((t) => t.caps.includes(cap));
/** 行動ごとの必要な caps。AI・プレイヤー・UI が同じ表から検証する */
export const ACTION_CAP = Object.freeze({ found_city: "action:found_city", build_fortification: "action:build_fortification", impose_sanctions: "action:impose_sanctions", covert_op: "action:covert_op", nuclear_program: "action:nuclear_program" });
export const TREATY_CAP = Object.freeze({ nonaggression: "treaty:nonaggression", alliance: "treaty:alliance", trade: "treaty:trade" });
export const POLITY_CAP = Object.freeze({ tribal: null, chiefdom: "polity:chiefdom", theocracy: "polity:chiefdom", kingdom: "polity:kingdom", republic: "polity:republic", empire: "polity:empire" });
/** 必要な caps が無いときの理由（有るなら null） */
export function gateReason(civ, st, cap) { if (!cap || stateCan(civ, st, cap)) return null; const ts = techsFor(cap); return `技術「${ts.map((t) => t.name).join("・")}」を制度化していない`; }

// ---- 技術の効果。採用した技術の fx の和。前提を欠く（喪失など）ときは、その割合だけ劣化する（即座には消さない）
/** 機能の度合い（0〜1）: 前提の技術が国内でどれだけ保たれているか。通常は 1 */
export function techFunction(civ, st, key, groups = null) { const t = TECH[key]; if (!t || !t.prereq.length) return 1; let f = 1; for (const p of prereqOf(civ, t)) { if (st.techAdopted[p] != null) continue; const cov = groups ? techCoverage(groups, p) : 0.5; f = Math.min(f, 0.35 + 0.65 * cov); } return f; }
export function fxSum(civ, st, field, groups = null) { let s = 0; for (const k in st.techAdopted) { const t = TECH[k]; if (!t) continue; const v = fxOf(civ, t)[field]; if (v) s += v * (groups ? techFunction(civ, st, k, groups) : 1); } return s; }
export function fxSumGroup(civ, g, field) { let s = 0; for (const k in g.tech.known) { const t = TECH[k]; if (!t) continue; const v = fxOf(civ, t)[field]; if (v) s += v; } return s; }

/** 創造主の編集の影響（変更前に表示する）: その技術に依存する技術・保有している集団数・採用している国家数 */
export function impactOf(civ, key) { const deps = TECHS.filter((t) => prereqOf(civ, t).includes(key)).map((t) => t.key); let holders = 0, adopters = 0; for (const id in civ.groups) if (civ.groups[id].tech.known[key] != null) holders++; for (const id in civ.states) if (civ.states[id].alive && civ.states[id].techAdopted[key] != null) adopters++; return { dependents: deps, holders, adopters }; }
/** 前提の整合: 保有している技術の前提が保有されていない集団（創造主の編集・喪失の後の矛盾。壊れた構造ではなく、機能劣化として扱う） */
export function missingPrereqs(civ, g) { const out = []; for (const k in g.tech.known) { const t = TECH[k]; if (!t) continue; for (const p of prereqOf(civ, t)) if (g.tech.known[p] == null) out.push([k, p]); } return out; }
