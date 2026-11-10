// v6.1.0 M6: 戦争の進行モデル。仕様 §8.2・§8.3。宣戦後に勝敗を 1 回振るのではなく、戦争の中で 作戦（Campaign）・会戦（Battle）・包囲・海戦・上陸 が起きる。
//   データは戦争の記録の中に 1 か所だけ持つ（別々の正本を作らない）: civ.wars[id].ops = { theaters, forces, campaigns, battles, stats, direction, occ, ... }。
//     War      = civ.wars[id]（交戦陣営 sides・開戦・目的・終結・講和）。score（-100〜100）は戦況の要約で、講和の評価・AI・画面が読む。
//     Theater  = 戦域（陸の接触面 / 海域）。名前はその土地の言語から付く。
//     Force    = 国家ごとの野戦軍・艦隊（規模は国家の総兵力から決まる。損耗は国家の兵力へ即座に反映される）。
//     Campaign = 作戦。offensive（前進）/ siege（包囲）/ defense（防衛）/ naval_control（制海）/ blockade（封鎖）/ landing（上陸）。AI が立てて実行し、プレイヤーは方針（posture・投入割合・重点）だけを指示する。
//     Battle   = 会戦・包囲の陥落・海戦・上陸戦の結果（直近の記録）。戦闘名は土地の名前から自動で付く（固有の史実名は持たない）。
//   決定性: 乱数は (historySeed, 月, 戦争, 作戦, 用途) のハッシュから導く（ctx.rng を消費しない＝他の領域の乱数を動かさない）。
//   戦力の定義は power.js（戦争研究所と共通）。技術・ドクトリン・補給・士気・地形・要塞が結果に効く。
import { makeEvent } from "../civ/events.js";
import { byState, neighborGroups } from "../civ/spatial.js";
import { hashSeed, rngOf } from "../civ/civ-state.js";
import { distKm } from "../civ/states.js";
import { neighborStates, endWar, adjustRel, warMaxMonths } from "../civ/diplomacy.js";
import { stateCan } from "../civ/tech.js";
import { BIOMES } from "../civ/world-consts.js";
import { effective } from "./domains/effective.js";
import { nameFor, languageOfGroup } from "./domains/language.js";
import { kanjiNum, siteDescriptors, warNameFor } from "./domains/naming.js";
import { landPower, navalPower, navyShare, landShare, supplyAt } from "./power.js";

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x), r3 = (x) => Math.round(x * 1000) / 1000;
export const POSTURES = Object.freeze({ offensive: "攻勢", balanced: "均衡", defensive: "守勢" });
export const CAMPAIGN_KINDS = Object.freeze({ offensive: "進攻", siege: "包囲", defense: "防衛", naval_control: "制海", blockade: "封鎖", landing: "上陸" });
export const initOps = () => ({ v: 1, theaters: {}, forces: {}, campaigns: {}, battles: [], stats: { battles: 0, big: 0, sieges: 0, naval: 0, landings: 0, dead: {}, won: {} }, direction: {}, occ: {}, occBy: {}, names: {}, seq: 0, broken: { a: 0, d: 0 } });
/** 歴史へ残す戦闘の件数は、1 戦争・1 か月につき 2 件まで（小規模な交戦すべてを個別の資料にしない） */
const evBudget = (ops, mi) => { if (ops._evMonth !== mi) { ops._evMonth = mi; ops._evN = 0; } return ++ops._evN <= 2; };
const nid = (ops, p) => `${p}${++ops.seq}`;
/** 乱数（0〜1）。戦争・月・用途から決まり、ほかの領域の乱数に影響しない */
const U = (civ, ...p) => hashSeed(civ.historySeed, "war", ...p) / 4294967296;

const sideOf = (w, id) => (w.sides.a.includes(id) ? "a" : w.sides.d.includes(id) ? "d" : null), other = (s) => (s === "a" ? "d" : "a");
const members = (civ, w, side) => w.sides[side].map((i) => civ.states[i]).filter((s) => s?.alive);
const enemyIds = (w, st) => w.sides[other(sideOf(w, st.id))];
const isPlayer = (st) => !!st.player;

// ---- 土地の名前（戦闘名・戦域名）。集落に名前があればそれ、無ければ土地の言語から決定的に作る（同じ集団なら同じ名前）
export function placeName(ctx, g) {
  const { civ } = ctx, s = g?.settlementId ? civ.settlements[g.settlementId] : null; if (s?.name) return s.name;
  const lang = languageOfGroup(g); if (!lang || !civ.languages?.[lang]) return "名もなき地";
  return nameFor(civ, rngOf(hashSeed(civ.historySeed, "place", g.id)), lang, "place") ?? "名もなき地";
}
/** 土地の地形（戦場名に添える呼び名の元） */
function siteFeatures(ctx, g) {
  const ce = ctx.world.cell, c = g.cell, b = ce.biome[c];
  return { river: !!ce.river[c], mountain: (ce.mountain?.[c] ?? 0) > 0 || b === BIOMES.ALPINE, coast: ce.coastDist[c] <= 1, forest: b === BIOMES.TEMPERATE_FOREST || b === BIOMES.RAINFOREST || b === BIOMES.TAIGA, wet: b === BIOMES.WETLAND, dry: b === BIOMES.HOT_DESERT || b === BIOMES.COLD_DESERT, plain: b === BIOMES.GRASSLAND || b === BIOMES.SAVANNA };
}
/** v6.2.0: 戦闘名。ふつうは「〇〇の戦い」。同じ土地で再び戦うときは、地形の呼び名（〇〇河畔の戦い・〇〇峠の戦い）で区別する。それでも足りないときだけ「第二次」「第三次」 */
function battleName(ctx, w, kind, g) {
  const { civ } = ctx, p = placeName(ctx, g), used = (civ.battleNames ??= {}), ds = siteDescriptors(siteFeatures(ctx, g));
  const cands = kind === "siege" ? [`${p}包囲戦`, `${p}攻城戦`, `${p}の陥落`] : kind === "naval" ? [`${p}沖海戦`, `${p}湾の海戦`, `${p}海峡の戦い`] : kind === "landing" ? [`${p}上陸戦`, `${p}上陸作戦`] : [`${p}の戦い`, ...ds.map((d) => `${p}${d}の戦い`), `${p}会戦`];
  const r = U(civ, w.id, civ.monthIndex, g.id, kind, "bn"), start = cands.length > 1 && r >= 0.6 ? 1 + Math.floor(((r - 0.6) / 0.4) * (cands.length - 1)) : 0;
  for (let i = 0; i < cands.length; i++) { const nm = cands[(start + i) % cands.length]; if (!used[nm]) { used[nm] = 1; return nm; } }
  const base = cands[0], n = (used[base] = (used[base] ?? 1) + 1);
  return n <= 3 ? `第${kanjiNum(n)}次${base}` : `${civ.date.year}年の${base}`;
}
/** v6.2.0: 野戦の戦場。目標の集落そのものでなく、周りの土地へ散らす（直近の戦場は避ける）。包囲・海戦・上陸は目標の場所のまま */
function fieldSite(ctx, w, camp, g) {
  const { civ } = ctx, ops = w.ops, recent = (ops.sites ??= []), cs = [g, ...[...neighborGroups(ctx, g)].map((o) => civ.groups[o]).filter(Boolean)].sort((x, y) => (x.id < y.id ? -1 : 1));
  const fresh = cs.filter((x) => !recent.includes(x.cell)), pool = fresh.length ? fresh : cs, site = pool[Math.floor(U(civ, w.id, civ.monthIndex, camp.id, "site") * pool.length)];
  recent.push(site.cell); if (recent.length > 8) recent.shift(); return site;
}

// ---- 地形・要塞
const terrainBonus = (world, cell) => { const ce = world.cell, b = ce.biome[cell]; return ((ce.mountain?.[cell] ?? 0) > 0 || b === BIOMES.ALPINE ? 0.25 : 0) + (ce.river[cell] ? 0.1 : 0) + (b === BIOMES.WETLAND || b === BIOMES.TEMPERATE_FOREST || b === BIOMES.RAINFOREST ? 0.1 : 0); };
const stageOf = (civ, g) => (g?.settlementId ? civ.settlements[g.settlementId]?.stage ?? "village" : null);

// ---- 戦争の開始・部隊・戦域
export function initWar(ctx, w) {
  w.ops = initOps(); syncForces(ctx, w); ensureTheaters(ctx, w);
  w.name ??= warNameFor(ctx, w, () => { const g = ctx.civ.groups[ctx.civ.states[w.defender]?.capitalGroupId], p = g ? placeName(ctx, g) : null; return p && p !== "名もなき地" ? p : null; }); // v6.2.0: 戦争名（〇〇戦争・第二次〇〇戦争）
}
const capCell = (civ, st) => civ.groups[st.capitalGroupId]?.cell ?? null;
const commitOf = (w, st) => clamp(w.ops.direction[st.id]?.commit ?? 0.75, 0.3, 1);

/** 参戦国ごとの野戦軍・艦隊を、国家の現在の兵力に合わせる（毎月）。損耗は国家の兵力にすでに反映されている */
export function syncForces(ctx, w) {
  const { civ } = ctx, ops = w.ops, live = new Set();
  for (const side of ["a", "d"]) for (const st of members(civ, w, side)) {
    const c = commitOf(w, st), ns = navyShare(st);
    for (const kind of ["army", "fleet"]) {
      const size = kind === "army" ? st.army * landShare(st) * c : st.army * ns * c; const key = `${st.id}|${kind}`; let f = Object.values(ops.forces).find((x) => x.key === key);
      if (!(size > 0.5) || (kind === "fleet" && ns < 0.02)) { if (f) { if (f.campaignId) delete ops.campaigns[f.campaignId]; delete ops.forces[f.id]; } continue; }
      if (!f) { f = { id: nid(ops, "f"), key, stateId: st.id, kind, side, size: 0, morale: 0.8, supply: 1, cell: capCell(civ, st), campaignId: null, lastBattle: -99 }; ops.forces[f.id] = f; }
      f.size = Math.round(size * 10) / 10; f.side = side; live.add(f.id);
    }
  }
  for (const id of Object.keys(ops.forces)) if (!live.has(id)) { const f = ops.forces[id]; if (f.campaignId) delete ops.campaigns[f.campaignId]; delete ops.forces[id]; }
}
const forcesOf = (w, side, kind = null) => Object.values(w.ops.forces).filter((f) => f.side === side && (!kind || f.kind === kind)).sort((a, b) => (a.id < b.id ? -1 : 1));

/** 戦域: 隣接する敵対国の組ごとに陸の戦域、海から攻める・水軍がある戦争には海域 */
export function ensureTheaters(ctx, w) {
  const { civ } = ctx, ops = w.ops, groups = byState(ctx);
  for (const a of members(civ, w, "a")) for (const d of members(civ, w, "d")) {
    const key = `L|${a.id}|${d.id}`; if (Object.values(ops.theaters).some((t) => t.key === key)) continue; if (!neighborStates(ctx, a).includes(d.id)) continue;
    const cap = civ.groups[a.capitalGroupId], gs = groups.get(d.id) ?? [], g = cap && gs.length ? gs.reduce((b, x) => (!b || distKm(ctx.world, cap.cell, x.cell) < distKm(ctx.world, cap.cell, b.cell) ? x : b), null) : null; if (!g) continue;
    const id = nid(ops, "t"); ops.theaters[id] = { id, key, kind: "land", a: a.id, d: d.id, cell: g.cell, name: `${placeName(ctx, g)}方面`, control: 0 };
  }
  const wantSea = (Object.values(ops.theaters).length === 0) || (forcesOf(w, "a", "fleet").length && forcesOf(w, "d", "fleet").length);
  if (wantSea && !Object.values(ops.theaters).some((t) => t.kind === "sea")) {
    const A = members(civ, w, "a")[0], D = members(civ, w, "d")[0]; const gs = D ? groups.get(D.id) ?? [] : []; const g = gs.find((x) => ctx.world.cell.coastDist[x.cell] <= 1) ?? gs[0];
    if (A && D && g) { const id = nid(ops, "t"); ops.theaters[id] = { id, key: `S|${A.id}|${D.id}`, kind: "sea", a: A.id, d: D.id, cell: g.cell, name: `${placeName(ctx, g)}海域`, control: 0 }; }
  }
}
const seaTheater = (w) => Object.values(w.ops.theaters).find((t) => t.kind === "sea") ?? null;
const landTheaterFor = (w, a, d) => Object.values(w.ops.theaters).find((t) => t.kind === "land" && ((t.a === a && t.d === d) || (t.a === d && t.d === a))) ?? null;

/** 海を渡って戦えるか（水軍と海戦術があり、双方が海に面していて、遠すぎない） */
export function canReach(ctx, a, b) {
  if (neighborStates(ctx, a).includes(b.id)) return true; const { civ, world } = ctx; if (!stateCan(civ, a, "unit:navy") || !stateCan(civ, a, "war:naval") || navyShare(a) < 0.02) return false;
  const cs = (st) => (byState(ctx).get(st.id) ?? []).some((g) => world.cell.coastDist[g.cell] <= 1); if (!cs(a) || !cs(b)) return false;
  const ca = civ.groups[a.capitalGroupId], cb = civ.groups[b.capitalGroupId]; return !!(ca && cb && distKm(world, ca.cell, cb.cell) <= 4500);
}
/** 海の向こうの攻撃目標（AI の征服の計画の候補）。陸で接していない・海から届く国家を近い順に 3 つまで */
export function seaTargets(ctx, st) {
  const { civ, world } = ctx; if (!stateCan(civ, st, "war:naval") || navyShare(st) < 0.02) return []; const land = new Set(neighborStates(ctx, st)), ca = civ.groups[st.capitalGroupId]; if (!ca) return [];
  return Object.values(civ.states).filter((s) => s.alive && s.id !== st.id && !land.has(s.id) && canReach(ctx, st, s)).sort((x, y) => distKm(world, ca.cell, civ.groups[x.capitalGroupId].cell) - distKm(world, ca.cell, civ.groups[y.capitalGroupId].cell) || (x.id < y.id ? -1 : 1)).slice(0, 3);
}

// ---- 方針（プレイヤーの高位の指示。AI は国家の状況から同じ形で決める）
export function postureOf(ctx, w, st) {
  const d = w.ops.direction[st.id]; if (d?.posture) return d.posture;
  const { civ } = ctx, side = sideOf(w, st.id), mine = side === "a" ? w.score : -w.score;
  const my = members(civ, w, side).reduce((s, x) => s + landPower(civ, x) + 0.35 * navalPower(civ, x), 0), en = members(civ, w, other(side)).reduce((s, x) => s + landPower(civ, x) + 0.35 * navalPower(civ, x), 0), ratio = (my + 1) / (en + 1);
  const fat = effective(civ, st, "fatigue"); return ratio >= 1.15 && mine > -30 && fat < 0.7 ? "offensive" : ratio < 0.8 || mine < -40 ? "defensive" : "balanced";
}
/** プレイヤー（担当国家）の方針の指示。検証は呼び出し側（命令）で行う。作戦の実行は AI と同じ経路 */
export function directWar(ctx, st, w, { posture = null, commit = null, focus = null }) {
  if (!w?.ops || w.status !== "active") return { ok: false, error: "その戦争は進行中ではない" }; if (sideOf(w, st.id) == null) return { ok: false, error: "その戦争の参戦国ではない" };
  if (posture != null && !POSTURES[posture]) return { ok: false, error: "方針は offensive / balanced / defensive" }; if (commit != null && !(commit >= 0.3 && commit <= 1)) return { ok: false, error: "投入割合は 0.3〜1" };
  if (focus != null && !w.ops.theaters[focus]) return { ok: false, error: "その戦域はない" };
  const d = (w.ops.direction[st.id] ??= {}); if (posture != null) d.posture = posture; if (commit != null) d.commit = r3(commit); if (focus !== undefined) d.focus = focus; d.since = ctx.civ.monthIndex; syncForces(ctx, w); return { ok: true };
}

// ---- 支配の判定（誰が保持しているか）
const holderSide = (w, g, civ) => w.ops.occ[g.id] ?? (g.stateId ? sideOf(w, g.stateId) : null);
function frontierTargets(ctx, w, side) {
  const { civ } = ctx, groups = byState(ctx), mine = [], seen = new Set(), out = [];
  for (const st of members(civ, w, side)) for (const g of groups.get(st.id) ?? []) if (holderSide(w, g, civ) === side) mine.push(g);
  for (const gid of w.occupied) { const g = civ.groups[gid]; if (g && w.ops.occ[gid] === side) mine.push(g); }
  mine.sort((x, y) => (x.id < y.id ? -1 : 1)); const foe = other(side);
  for (const g of mine.slice(0, 90)) for (const o of neighborGroups(ctx, g)) { if (seen.has(o)) continue; seen.add(o); const t = civ.groups[o]; if (t && holderSide(w, t, civ) === foe && t.stateId && civ.states[t.stateId]?.alive) out.push(t); }
  return out.sort((x, y) => (x.id < y.id ? -1 : 1));
}
const valueOf = (ctx, w, g, from) => { const civ = ctx.civ, st = civ.states[g.stateId], stage = stageOf(civ, g), cap = st?.capitalGroupId === g.id; return Math.sqrt(g.pop + 1) * (cap ? 1.9 : stage === "city" ? 1.6 : stage === "town" ? 1.25 : 1) / (1 + distKm(ctx.world, from, g.cell) / 900); };

// ---- 作戦の立案（AI もプレイヤーの国家も同じ。プレイヤーは方針・投入割合・重点の戦域で導く）
function planFor(ctx, w, f) {
  const { civ, world } = ctx, ops = w.ops, st = civ.states[f.stateId], side = f.side, post = postureOf(ctx, w, st), dir = ops.direction[st.id] ?? {}, mi = civ.monthIndex;
  const mk = (kind, o) => { const id = nid(ops, "c"), c = { id, kind, forceId: f.id, stateId: st.id, side, theaterId: null, targetGroupId: null, targetStateId: null, startedAt: mi, phase: "active", progress: 0, result: null, ...o }; ops.campaigns[id] = c; f.campaignId = id; return c; };
  const foeFleets = forcesOf(w, other(side), "fleet"), sea = seaTheater(w);
  if (f.kind === "fleet") {
    if (!sea) return mk("defense", {}); const ctl = side === "a" ? sea.control : -sea.control;
    if (foeFleets.length) return mk("naval_control", { theaterId: sea.id });
    return ctl > 0.3 && post !== "defensive" ? mk("blockade", { theaterId: sea.id }) : mk("naval_control", { theaterId: sea.id });
  }
  if (post === "defensive") return mk("defense", { theaterId: (dir.focus && ops.theaters[dir.focus] ? dir.focus : Object.values(ops.theaters).find((t) => t.kind === "land")?.id) ?? null });
  const from = capCell(civ, st) ?? 0, cands = frontierTargets(ctx, w, side).filter((g) => !dir.focus || ops.theaters[dir.focus]?.kind !== "land" || [ops.theaters[dir.focus].a, ops.theaters[dir.focus].d].includes(g.stateId));
  if (cands.length) {
    let best = null, bs = -1; for (const g of cands) { const s = valueOf(ctx, w, g, from) * (1 + 0.25 * U(civ, w.id, st.id, mi, "tg", g.id)); if (s > bs) { bs = s; best = g; } }
    const stage = stageOf(civ, best), tst = civ.states[best.stateId], cap = tst?.capitalGroupId === best.id, th = landTheaterFor(w, st.id, best.stateId) ?? Object.values(ops.theaters).find((t) => t.kind === "land");
    return mk(stage === "city" || stage === "town" || cap ? "siege" : "offensive", { theaterId: th?.id ?? null, targetGroupId: best.id, targetStateId: best.stateId });
  }
  // 陸で接していない: 艦隊の護衛のもとで上陸
  const landing = (fx(st).landing ?? 0) > 0 || stateCan(civ, st, "war:naval"); const foeGs = members(civ, w, other(side)).flatMap((s) => byState(ctx).get(s.id) ?? []).filter((g) => world.cell.coastDist[g.cell] <= 1 && holderSide(w, g, civ) === other(side));
  if (landing && sea && foeGs.length && forcesOf(w, side, "fleet").length) { const best = foeGs.reduce((b, g) => (!b || valueOf(ctx, w, g, from) > valueOf(ctx, w, b, from) ? g : b), null); return mk("landing", { theaterId: sea.id, targetGroupId: best.id, targetStateId: best.stateId }); }
  return mk("defense", { theaterId: Object.values(ops.theaters).find((t) => t.kind === "land")?.id ?? null });
}
const fx = (st) => st.military?.fx ?? {};

// ---- 会戦の解決。戦力は power.js（予測と共通）。補給・士気・地形・要塞・ドクトリン（適応・結束・損耗軽減）が効く
function moraleF(f) { return 0.6 + 0.5 * f.morale; }
function fight(ctx, w, { kind, A, D, camp, g, garrison = 0 }) {
  const { civ, world } = ctx, ops = w.ops, mi = civ.monthIndex, sA = civ.states[A.stateId], sD = D ? civ.states[D.stateId] : civ.states[g.stateId];
  const naval = kind === "naval", terr = naval ? 0 : terrainBonus(world, g.cell), stage = stageOf(civ, g), fort = naval ? 1 : 1 + (kind === "siege" || stage ? (sD.defense ?? 0) + (stage === "city" ? 0.3 : stage === "town" ? 0.15 : 0.05) : 0);
  const pA = (naval ? navalPower(civ, sA, A.size) : landPower(civ, sA, A.size)) * moraleF(A) * (0.5 + 0.5 * A.supply), adaptA = fx(sA).adapt ?? 0;
  let pD; if (D) { const base = naval ? navalPower(civ, sD, D.size) : landPower(civ, sD, D.size, { defending: true }), prep = ops.campaigns[D.campaignId]?.kind === "defense" ? 1.12 : ops.campaigns[D.campaignId]?.kind === "offensive" ? 0.75 : 0.9; pD = base * moraleF(D) * prep * (D.lastBattle >= mi - 2 ? 0.88 : 1); } else pD = garrison;
  pD *= (1 + Math.max(0, terr - adaptA)) * fort;
  const rnd = 0.75 + 0.5 * U(civ, w.id, mi, camp.id, "r"), atk = pA * rnd, win = atk > pD ? "A" : "D", q = Math.max(1, win === "A" ? atk / (pD + 1e-9) : pD / (atk + 1e-9)), engaged = 0.5 + 0.5 * U(civ, w.id, mi, camp.id, "e");
  const loserLoss = clamp(0.06 + 0.07 * Math.min(q, 3), 0.05, 0.3) * engaged, winnerLoss = clamp(loserLoss * (0.35 + 0.35 / q), 0.01, 0.2);
  const apply = (F, st, frac, lost) => { const arm = st.army, dead = Math.min(arm, F.size * frac * (1 - (fx(st).attr ?? 0))); st.army = Math.max(0, arm - dead); st.warLoss = clamp((st.warLoss ?? 0) + (arm ? dead / arm * 0.6 : 0), 0, 0.7); F.size = Math.max(0, F.size - dead); F.lastBattle = mi; F.morale = clamp(F.morale + (lost ? -(0.1 + 0.9 * frac) * (1 - 0.8 * (fx(st).coh ?? 0)) : 0.05)); const grs = byState(ctx).get(st.id) ?? []; if (grs.length && dead > 0) { const gg = grs[Math.floor(U(civ, w.id, mi, camp.id, st.id, "g") * grs.length)]; gg.pop = Math.max(1, gg.pop - dead * 0.8); } w.casualties += dead; ops.stats.dead[st.id] = (ops.stats.dead[st.id] ?? 0) + dead; return dead; };
  const deadA = apply(A, sA, win === "A" ? winnerLoss : loserLoss, win !== "A"), deadD = D ? apply(D, sD, win === "A" ? loserLoss : winnerLoss, win === "A") : (sD.army = Math.max(0, sD.army - garrison * 0.03), garrison * 0.03);
  const mx = (s) => s.military?.exp ?? null; { const eA = mx(sA); if (eA) { if (win === "A") eA.won = (eA.won ?? 0) + 1; else eA.lost = (eA.lost ?? 0) + 1; } if (D) { const eD = mx(sD); if (eD) { if (win === "D") eD.defended = (eD.defended ?? 0) + 1; else eD.lost = (eD.lost ?? 0) + 1; } } }
  const winSt = win === "A" ? sA : sD, loseSt = win === "A" ? sD : sA, name = battleName(ctx, w, kind, g), sign = (win === "A" ? A.side : other(A.side)) === "a" ? 1 : -1;
  w.score = clamp(w.score + sign * (2 + 14 * loserLoss), -100, 100);
  const rec = { id: nid(ops, "b"), at: mi, kind, name, theater: camp.theaterId, cell: g.cell, a: A.stateId, d: sD.id, winner: winSt.id, deadA: Math.round(deadA), deadD: Math.round(deadD), win };
  ops.battles.push(rec); if (ops.battles.length > 60) ops.battles.splice(0, ops.battles.length - 60); ops.stats.battles++; ops.stats.won[winSt.id] = (ops.stats.won[winSt.id] ?? 0) + 1; if (kind === "naval") ops.stats.naval++;
  const total = deadA + deadD, notable = total >= Math.max(300, 0.02 * (sA.army + sD.army + total)) || (kind === "siege" && (stage === "city" || sD.capitalGroupId === g.id)) || kind === "landing"; rec.notable = notable; if (notable) ops.stats.big++;
  if (notable && evBudget(ops, mi)) makeEvent(civ, ctx.ids, { kind: "battle_fought", title: `${name}（${sA.name}対${sD.name}、${winSt.name}が制した）`, participants: [{ entityId: w.id, role: "war" }, { entityId: sA.id, role: "attacker" }, { entityId: sD.id, role: "defender" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], effects: [{ targetId: w.id, property: "score", before: null, after: Math.round(w.score) }], facts: { warId: w.id, name, kind, cell: g.cell, winnerStateId: winSt.id, loserStateId: loseSt.id, dead: Math.round(total) }, provenance: "simulation" });
  return { win, rec, loserLoss };
}

/** 集落（群）を占領する。占領した陣営を記録する（終戦のとき、勝った側が領土を受け取る） */
function occupy(ctx, w, g, side, camp) {
  const { civ } = ctx, ops = w.ops; if (!w.occupied.includes(g.id)) w.occupied.push(g.id); ops.occ[g.id] = side; (ops.occBy ??= {})[g.id] = camp.stateId; const owner = g.stateId ? civ.states[g.stateId] : null, occ = civ.states[camp.stateId];
  if (owner && owner.capitalGroupId === g.id) { w.score = clamp(w.score + (side === "a" ? 1 : -1) * 35, -100, 100); for (const f of forcesOf(w, other(side))) if (f.stateId === owner.id) f.morale = clamp(f.morale - 0.3); }
  w.score = clamp(w.score + (side === "a" ? 1 : -1) * (3 + Math.min(10, Math.sqrt(g.pop) / 8)), -100, 100);
  makeEvent(civ, ctx.ids, { kind: "territory_occupied", title: `${placeName(ctx, g)}が${occ.name}に占領された`, participants: [{ entityId: g.id, role: "territory" }, { entityId: w.id, role: "war" }, { entityId: camp.stateId, role: "occupier" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, cell: g.cell, stateId: camp.stateId }, provenance: "simulation" });
}
export function liberate(w, g) { w.occupied = w.occupied.filter((x) => x !== g.id); delete w.ops.occ[g.id]; if (w.ops.occBy) delete w.ops.occBy[g.id]; }

// ---- 作戦の月次の進行
const defenderForce = (ctx, w, side, targetStateId) => { const fs = forcesOf(w, side, "army").filter((f) => f.size > 1); const own = fs.filter((f) => f.stateId === targetStateId); const pool = own.length ? own : fs; return pool.reduce((b, f) => (!b || f.size > b.size ? f : b), null); };
function advance(ctx, w, camp) {
  const { civ, world } = ctx, ops = w.ops, mi = civ.monthIndex, F = ops.forces[camp.forceId]; if (!F || camp.phase !== "active") return; const st = civ.states[F.stateId], side = F.side, foe = other(side);
  const age = mi - camp.startedAt;
  if (camp.kind === "defense") { F.morale = clamp(F.morale + 0.03); F.supply = 1; if (age >= 6) camp.phase = "done"; return; }
  if (camp.kind === "naval_control" || camp.kind === "blockade") {
    const th = ops.theaters[camp.theaterId]; if (!th) { camp.phase = "done"; return; } F.supply = 0.9; const D = forcesOf(w, foe, "fleet").find((f) => f.size > 1);
    if (camp.kind === "naval_control") {
      const site = (byState(ctx).get(D?.stateId) ?? []).find((x) => world.cell.coastDist[x.cell] <= 1) ?? (byState(ctx).get(D?.stateId) ?? [])[0];
      if (D && site && U(civ, w.id, mi, camp.id, "eng") < 0.45) { const coast = site; const r = fight(ctx, w, { kind: "naval", A: F, D, camp, g: coast }); th.control = clamp(th.control + (r.win === "A" ? 1 : -1) * (side === "a" ? 1 : -1) * 0.3, -1, 1); if (F.morale < 0.2) { camp.phase = "done"; camp.result = "failed"; } }
      else if (!D) th.control = clamp(th.control + (side === "a" ? 1 : -1) * 0.08, -1, 1);
      if (age >= 12) camp.phase = "done"; return;
    }
    const ctl = side === "a" ? th.control : -th.control; if (ctl < 0.2 || age >= 12) { camp.phase = "done"; return; }
    for (const e of members(civ, w, foe)) if ((byState(ctx).get(e.id) ?? []).some((g) => world.cell.coastDist[g.cell] <= 1)) { e.blockade = mi + 3; e.treasury -= Math.max(0, e.pop * 0.00003); }
    return;
  }
  const g = civ.groups[camp.targetGroupId]; if (!g || holderSide(w, g, civ) !== foe) { camp.phase = "done"; camp.result = "moot"; return; }
  if (F.size < 1 || F.morale < 0.15) { camp.phase = "done"; camp.result = "failed"; return; }
  const capc = capCell(civ, st) ?? g.cell, dist = distKm(world, capc, g.cell), own = g.stateId && sideOf(w, g.stateId) === side; F.cell = g.cell; F.supply = camp.kind === "landing" ? 0.7 : own ? 1 : supplyAt(civ, st, dist);
  if (F.supply < 0.4) { const lost = F.size * 0.01 * (1 - (fx(st).attr ?? 0)); st.army = Math.max(0, st.army - lost); F.size -= lost; F.morale = clamp(F.morale - 0.03); } // 補給が切れると、戦わずに消耗する
  if (camp.kind === "landing") { const sea = seaTheater(w), ctl = sea ? (side === "a" ? sea.control : -sea.control) : 0; if (ctl < -0.3) { camp.phase = "done"; camp.result = "failed"; return; } camp.progress += 0.18 + 0.4 * (fx(st).landing ?? 0); if (camp.progress < 1) return; }
  const Dn = defenderForce(ctx, w, foe, g.stateId), tst = civ.states[g.stateId], stage = stageOf(civ, g);
  const garrison = (g.pop * 0.02 + 20) * (1 + (tst?.defense ?? 0) * 2 + (tst?.milDef ?? 0)) * (stage === "city" ? 2 : stage === "town" ? 1.4 : 1);
  if (camp.kind === "landing") { const r = fight(ctx, w, { kind: "landing", A: F, D: Dn && Dn.stateId === g.stateId ? Dn : null, camp, g, garrison }); if (r.win === "A") { occupy(ctx, w, g, side, camp); ops.stats.landings++; camp.phase = "done"; camp.result = "success"; } else { camp.phase = "done"; camp.result = "failed"; } return; }
  if (Dn && U(civ, w.id, mi, camp.id, "eng") < (camp.kind === "siege" ? 0.25 : 0.45)) { const r = fight(ctx, w, { kind: "field", A: F, D: Dn, camp, g: fieldSite(ctx, w, camp, g) }); camp.progress = clamp(camp.progress + (r.win === "A" ? 0.3 : -0.25), 0, 1.2); if (r.win !== "A" && F.morale < 0.2) { camp.phase = "done"; camp.result = "failed"; return; } }
  else {
    const atkP = landPower(civ, st, F.size) * moraleF(F) * (0.5 + 0.5 * F.supply), ratio = atkP / (garrison * (1 + terrainBonus(world, g.cell)) + 1);
    const rate = camp.kind === "siege" ? clamp(0.035 * ratio * (1 + 2 * (fx(st).siege ?? 0)), 0.01, 0.22) : clamp(0.06 * ratio, 0.02, 0.3); camp.progress = clamp(camp.progress + rate * (0.6 + 0.4 * F.supply), 0, 1.2);
    if (camp.kind === "siege") { const l = F.size * 0.004 * (1 - (fx(st).attr ?? 0)); st.army = Math.max(0, st.army - l); F.size -= l; w.casualties += l; ops.stats.dead[st.id] = (ops.stats.dead[st.id] ?? 0) + l; }
  }
  if (camp.progress >= 1) {
    if (camp.kind === "siege") { ops.stats.sieges++; const rec = { id: nid(ops, "b"), at: mi, kind: "siege", name: battleName(ctx, w, "siege", g), theater: camp.theaterId, cell: g.cell, a: F.stateId, d: g.stateId, winner: F.stateId, deadA: 0, deadD: 0, win: "A", notable: stage === "city" || tst?.capitalGroupId === g.id }; ops.battles.push(rec); if (rec.notable) { ops.stats.big++; if (evBudget(ops, mi)) makeEvent(civ, ctx.ids, { kind: "battle_fought", title: `${rec.name}（${st.name}が${placeName(ctx, g)}を落とした）`, participants: [{ entityId: w.id, role: "war" }, { entityId: st.id, role: "attacker" }, { entityId: g.stateId, role: "defender" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, name: rec.name, kind: "siege", cell: g.cell, winnerStateId: st.id, loserStateId: g.stateId }, provenance: "simulation" }); } ops.stats.battles++; }
    const wasOurs = g.stateId && sideOf(w, g.stateId) === side; if (wasOurs) { liberate(w, g); w.score = clamp(w.score + (side === "a" ? 1 : -1) * 4, -100, 100); } else occupy(ctx, w, g, side, camp);
    camp.phase = "done"; camp.result = "success"; F.morale = clamp(F.morale + 0.08);
  }
  if (age > 30) { camp.phase = "done"; camp.result = "stalled"; }
}

/** 国家ごとの毎月の処理（戦争とは独立）: 損耗した兵力は少しずつ補充される・封鎖の期限 */
export function monthly(ctx) {
  const { civ } = ctx; for (const id in civ.states) { const s = civ.states[id]; if (!s.alive) continue; if (s.warLoss > 0) { s.warLoss = s.warLoss < 0.004 ? 0 : r3(s.warLoss * 0.97); } if (s.blockade != null && s.blockade <= civ.monthIndex) delete s.blockade; }
}

/** 戦争 1 件の月次（stepWars から。WCDE の世界だけ）。部隊の同期 → 作戦の立案・進行 → 戦況の集約 → 終結の判定 */
export function stepWar(ctx, w) {
  const { civ } = ctx, mi = civ.monthIndex; if (!w.ops) initWar(ctx, w); const ops = w.ops;
  syncForces(ctx, w); if (mi % 3 === 0 || !Object.keys(ops.theaters).length) ensureTheaters(ctx, w);
  for (const f of forcesOf(w, "a").concat(forcesOf(w, "d"))) { const c = f.campaignId ? ops.campaigns[f.campaignId] : null; if (!c || c.phase !== "active") { if (c) delete ops.campaigns[c.id]; f.campaignId = null; planFor(ctx, w, f); } }
  for (const c of Object.values(ops.campaigns).sort((x, y) => (x.id < y.id ? -1 : 1))) advance(ctx, w, c);
  for (const id of Object.keys(ops.campaigns)) if (ops.campaigns[id].phase === "done" && !ops.forces[ops.campaigns[id].forceId]) delete ops.campaigns[id];
  // 士気の回復（戦っていない部隊）と、疲労・補給の反映。戦況は士気の差でゆっくり動く
  for (const f of Object.values(ops.forces)) { const st = civ.states[f.stateId]; if (f.lastBattle < mi - 1) f.morale = clamp(f.morale + 0.015 + 0.02 * (fx(st).coh ?? 0) - 0.02 * (effective(civ, st, "fatigue") ?? 0)); }
  const mor = (side) => { const fs = forcesOf(w, side); const tot = fs.reduce((s, f) => s + f.size, 0); return tot ? fs.reduce((s, f) => s + f.morale * f.size, 0) / tot : 0; };
  const mA = mor("a"), mD = mor("d"); w.score = clamp(w.score + (mA - mD) * 2.5, -100, 100); ops.broken.a = mA < 0.15 ? ops.broken.a + 1 : 0; ops.broken.d = mD < 0.15 ? ops.broken.d + 1 : 0;
  const age = mi - w.startedAt;
  if (w.score >= 80 || ops.broken.d >= 6) endWar(ctx, w, "aggressor_victory"); else if (w.score <= -80 || ops.broken.a >= 6) endWar(ctx, w, "defender_victory"); else if (age > warMaxMonths(ctx.civ.date.year, new Set([...w.sides.a, ...w.sides.d]).size)) endWar(ctx, w, "stalemate"); // v6.9.0: 戦争の長さは時代で決まる（古代 50 年・近代 6 年・大戦 20 年）
}

/** 終結の整理（endWar から）: 作戦・部隊・戦域を片付け、要約だけ残す。小さな戦いは個別に歴史へ残さず、代表的な戦いだけを終結の資料にする */
export function finalize(ctx, w, outcome) {
  const { civ } = ctx, ops = w.ops; if (!ops) return;
  const notable = ops.battles.filter((b) => b.notable).sort((x, y) => y.deadA + y.deadD - (x.deadA + x.deadD) || (x.id < y.id ? -1 : 1)).slice(0, 3).sort((x, y) => x.at - y.at);
  w.summary = { battles: ops.stats.battles, big: ops.stats.big, sieges: ops.stats.sieges, naval: ops.stats.naval, landings: ops.stats.landings, dead: Math.round(Object.values(ops.stats.dead).reduce((a, b) => a + b, 0)), notable: notable.map((b) => ({ name: b.name, at: b.at, kind: b.kind, winner: b.winner })) };
  if (notable.length) makeEvent(civ, ctx.ids, { kind: "war_epilogue", title: `${civ.states[w.aggressor]?.name ?? "?"}と${civ.states[w.defender]?.name ?? "?"}の戦争の主な戦い: ${notable.map((b) => b.name).join("・")}`, participants: [{ entityId: w.id, role: "war" }], causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, battles: w.summary.battles, dead: w.summary.dead, notable: w.summary.notable.map((b) => b.name) }, provenance: "simulation" });
  for (const id of [...w.sides.a, ...w.sides.d]) { const s = civ.states[id]; if (s) { const arm = s.military?.exp; if (arm) arm.wars = (arm.wars ?? 0) + 1; } }
  w.ops = { v: 1, ended: true, battles: notable.map((b) => ({ ...b })), stats: { battles: ops.stats.battles, big: ops.stats.big, sieges: ops.stats.sieges, naval: ops.stats.naval, landings: ops.stats.landings, dead: {}, won: ops.stats.won } };
  w.occupied = []; // 終戦: 占領の記録は不要（領土の移転は endWar が済ませる）
}

/** 構造の検査（整合性）。進行中の戦争の部隊・作戦・戦域の参照 */
export function checkWars(civ) {
  const errs = []; for (const wid of civ.activeWarIds) {
    const w = civ.wars[wid], ops = w?.ops; if (!ops || ops.ended) continue; const ids = new Set([...w.sides.a, ...w.sides.d]);
    for (const f of Object.values(ops.forces)) { if (!ids.has(f.stateId)) errs.push(`戦争 ${wid} の部隊 ${f.id} の国家が参戦していない`); if (!(f.size >= 0) || !Number.isFinite(f.size)) errs.push(`戦争 ${wid} の部隊 ${f.id} の規模が不正`); if (!(f.morale >= 0 && f.morale <= 1)) errs.push(`戦争 ${wid} の部隊 ${f.id} の士気が範囲外`); if (f.campaignId && !ops.campaigns[f.campaignId]) errs.push(`戦争 ${wid} の部隊 ${f.id} の作戦 ${f.campaignId} が無い`); }
    for (const c of Object.values(ops.campaigns)) { if (!ops.forces[c.forceId]) errs.push(`戦争 ${wid} の作戦 ${c.id} の部隊が無い`); if (c.theaterId && !ops.theaters[c.theaterId]) errs.push(`戦争 ${wid} の作戦 ${c.id} の戦域が無い`); if (c.phase !== "done" /* 終わった作戦の目標は、のちに併合・消滅した集団でもよい（履歴として ID だけ残る） */ && c.targetGroupId && !civ.groups[c.targetGroupId]) errs.push(`戦争 ${wid} の作戦 ${c.id} の目標の集団が無い`); }
    for (const gid of Object.keys(ops.occ)) if (!w.occupied.includes(gid)) errs.push(`戦争 ${wid} の占領の記録 ${gid} が占領の一覧に無い`);
  }
  for (const w of Object.values(civ.wars)) if (w.status === "ended" && w.ops && (w.ops.forces || w.ops.campaigns || w.ops.theaters)) errs.push(`終結した戦争 ${w.id} に部隊・作戦・戦域が残っている`);
  return errs;
}

/** v6.1.0 M7: 講和・終戦の領土の整理（endWar から）。勝った側（または「占領地の保持」の講和）は、占領している区画を、占領した国家のものにする。
 *  自陣営の国家の領土は移さない。白紙講和・引き分けでは、占領は解かれて何も移らない。移った区画の一覧 [{ gid, from, to }] を返す（WCDE の戦争モデルでないときは null） */
export function settle(ctx, w, outcome, terms = null) {
  const { civ } = ctx, ops = w.ops; if (!ops || ops.ended) return null;
  const won = outcome === "aggressor_victory" ? "a" : outcome === "defender_victory" ? "d" : null, keep = outcome === "negotiated" && terms?.kind === "cession", out = [];
  if (won || keep) for (const gid of [...w.occupied].sort()) {
    const g = civ.groups[gid]; if (!g || !g.stateId) continue; const side = ops.occ[gid]; if (!keep && side !== won) continue;
    const to = civ.states[ops.occBy?.[gid]]; if (!to?.alive || to.id === g.stateId) continue; if (sideOf(w, g.stateId) === side) continue;
    out.push({ gid, from: g.stateId, to: to.id }); g.stateId = to.id;
  }
  return out;
}
/** 多国間戦争で、同盟側の一国が単独で戦争から抜ける（単独講和）。その国の部隊・占領は片付く。主たる交戦国（開戦国・受けて立った国）は抜けられない */
export function leaveWar(ctx, w, st) {
  const { civ } = ctx, ops = w.ops; if (!ops || ops.ended) return;
  for (const side of ["a", "d"]) w.sides[side] = w.sides[side].filter((i) => i !== st.id);
  st.warIds = st.warIds.filter((i) => i !== w.id); if (st.campaign?.warId === w.id) st.campaign = null; if (ops.direction) delete ops.direction[st.id];
  for (const gid of Object.keys(ops.occBy ?? {})) if (ops.occBy[gid] === st.id) { const g = civ.groups[gid]; if (g) liberate(w, g); else { w.occupied = w.occupied.filter((x) => x !== gid); delete ops.occ[gid]; delete ops.occBy[gid]; } }
  syncForces(ctx, w);
}
export const warSide = (w, id) => sideOf(w, id);
