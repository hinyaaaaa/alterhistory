// v6.12.0: 軍団（Corps）。担当国家の軍を、名前のある軍団に分け、最高指揮官とその部下（副官）を置き、作戦の命令（進軍・包囲・守備・撤退）を出せるようにする。
//   データは担当国家（st.corps）に 1 か所だけ持つ。軍団の兵力の合計は、国家の陸の兵力（st.army × 陸の割合）と一致するよう、毎月そろえる（総兵力の正本は国家のまま）。
//   戦争の実行（作戦・会戦・包囲）は warfare.js が持つ。ここは「軍団の編成・人事・命令・移動・指揮官の能力」だけ。
//   指揮官・副官は人物（名前・能力・特性）で、特性は小さなバフ・デバフ（上限 ±20%）。戦場の経験で能力が育つ。候補は自動で現れ、任命・解任できる。
import { hashSeed, rngOf } from "../civ/civ-state.js";
import { neighborGroups, byState } from "../civ/spatial.js";
import { stateCan } from "../civ/tech.js";
import { navyShare, landShare } from "./power.js";
import { unitName, UNIT_KINDS } from "./domains/military.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
export const CORPS_MAX = 8, POOL_MAX = 8, OFFICER_SLOTS = Object.freeze({ vanguard: "先鋒", quartermaster: "兵站", strategist: "参謀" });
export const ORDER_KINDS = Object.freeze({ auto: "お任せ（自動の作戦）", hold: "待機", march: "進軍", siege: "包囲", defend: "守備", retreat: "撤退", reserve: "予備（戦争に出さない）" });
/** 特性: 小さなバフ・デバフ。off 攻め／def 守り／siege 包囲／logi 補給／coh 士気 */
export const TRAITS = Object.freeze({
  aggressive: { ja: "攻勢巧者", off: 0.06 }, stalwart: { ja: "堅守の将", def: 0.06 }, besieger: { ja: "包囲術", siege: 0.18 }, provisioner: { ja: "補給上手", logi: 0.12 }, inspiring: { ja: "人望", coh: 0.12 },
  reckless: { ja: "無謀", off: 0.08, def: -0.06 }, cautious: { ja: "慎重", def: 0.04, off: -0.05 }, vain: { ja: "名誉欲", off: 0.03, logi: -0.06 }, frugal: { ja: "倹約家", logi: 0.06, coh: -0.04 }, veteran: { ja: "歴戦", off: 0.03, def: 0.03 },
});
const TRAIT_KEYS = Object.keys(TRAITS);
const ORD = ["第一", "第二", "第三", "第四", "第五", "第六", "第七", "第八"];
const idOf = (S, p) => `${p}${++S.seq}`;
export const corpsOf = (st) => st.corps?.list ?? [];
export const corpsById = (st, id) => corpsOf(st).find((c) => c.id === id) ?? null;
const fkeysOf = (st) => Object.keys(st.politics?.factions ?? {});

// ---- 人物（指揮官・副官の候補）
function genPerson(ctx, st, tag, { minSkill = 0.25, spread = 0.6 } = {}) {
  const { civ } = ctx, S = st.corps, seed = hashSeed(civ.historySeed, "cp", st.id, tag, S.seq + 1), r = rngOf(seed), cap = civ.groups[st.capitalGroupId];
  const name = ctx.nameGen?.person(civ, cap, r) ?? `将${S.seq + 1}`, n = r() < 0.55 ? 1 : r() < 0.6 ? 0 : 2, traits = [];
  while (traits.length < n) { const k = TRAIT_KEYS[Math.floor(r() * TRAIT_KEYS.length)]; if (!traits.includes(k)) traits.push(k); }
  const keys = fkeysOf(st); return { id: idOf(S, "pp"), name, skill: r2(minSkill + spread * r()), traits, xp: 0, age: 28 + Math.floor(r() * 25), backer: r() < 0.6 && keys.includes("military") ? "military" : keys.includes("nobility") ? "nobility" : "military", since: civ.monthIndex };
}
export function refreshPool(ctx, st, force = false) {
  const S = st.corps, mi = ctx.civ.monthIndex; if (!S) return; if (!force && mi - (S.poolAt ?? -999) < 12) return; S.poolAt = mi;
  S.pool = (S.pool ?? []).filter((p) => mi - p.since < 120); while (S.pool.length < POOL_MAX && (force || S.pool.length < 4 || hashSeed(ctx.civ.historySeed, "pool", st.id, mi, S.pool.length) % 3 === 0)) { S.pool.push(genPerson(ctx, st, `pool${mi}`)); if (!force && S.pool.length >= 4 && S.pool.length >= POOL_MAX) break; }
}

// ---- 能力（小さなバフ・デバフ。上限 ±0.2）
export function corpsFx(cp) {
  const fx = { off: 0, def: 0, siege: 0, logi: 0, coh: 0, skill: 0 }, add = (p, wt) => { if (!p) return; fx.skill += (p.skill - 0.5) * 0.2 * wt; for (const t of p.traits ?? []) { const T = TRAITS[t]; if (!T) continue; for (const k of ["off", "def", "siege", "logi", "coh"]) if (T[k]) fx[k] += T[k] * wt; } };
  add(cp.commander, 1); for (const o of Object.values(cp.officers ?? {})) add(o, 0.4);
  for (const k of Object.keys(fx)) fx[k] = r2(clamp(fx[k], -0.2, 0.2)); return fx;
}
/** 戦闘の指揮の倍率（攻め role=atk／守り role=def）。軍団でない部隊は 1 */
export function cmdMult(st, F, role) { if (!F?.corpsId) return 1; const cp = corpsById(st, F.corpsId); if (!cp) return 1; const fx = corpsFx(cp); return 1 + clamp(fx.skill + (role === "atk" ? fx.off : fx.def), -0.25, 0.3); }

// ---- 編成
const perCorps = (st) => (st.techAdopted?.gunpowder != null ? 14000 : st.techAdopted?.iron_weapons != null ? 7500 : 3000);
function landKinds(st) { const us = (st.military?.units ?? []).filter((u) => u.kind !== "navy" && u.size > 0), tot = us.reduce((a, u) => a + u.size, 0); return tot > 0 ? us.map((u) => [u.kind, u.size / tot]) : [["infantry", 1]]; }
const mkUnit = (S, st, kind, size) => ({ id: idOf(S, "un"), kind, size: r1(size), name: unitName(st, kind), autoName: true });
/** 国家の軍を軍団に分ける（担当国家にまだ軍団が無いとき）。既存の部隊の配分に合わせ、指揮官と副官は自動で任命する */
export function ensureCorps(ctx, st) {
  if (!st.player || st.corps) return st.corps ?? null; const { civ } = ctx, land = Math.max(0, st.army * landShare(st));
  const S = (st.corps = { v: 1, seq: 0, list: [], pool: [], poolAt: -999 }); const N = clamp(Math.round(land / perCorps(st)), 1, 6), kinds = landKinds(st), cap = civ.groups[st.capitalGroupId];
  refreshPool(ctx, st, true);
  for (let i = 0; i < N; i++) {
    const cp = { id: idOf(S, "cp"), name: `${ORD[i]}軍団`, size: 0, at: cap?.id ?? null, order: { kind: "auto", since: civ.monthIndex }, warId: null, units: [], commander: null, officers: {}, history: [], created: civ.monthIndex };
    for (const [k, sh] of kinds) if (sh >= 0.04) cp.units.push(mkUnit(S, st, k, (land / N) * sh)); cp.size = r1(cp.units.reduce((a, u) => a + u.size, 0));
    cp.commander = S.pool.shift() ?? genPerson(ctx, st, "cmd"); cp.commander.role = "commander"; if (i < 3) { const o = S.pool.shift() ?? genPerson(ctx, st, "off"); o.role = "vanguard"; cp.officers.vanguard = o; if (N <= 2 || i === 0) { const q = S.pool.shift() ?? genPerson(ctx, st, "qm"); q.role = "quartermaster"; cp.officers.quartermaster = q; } }
    S.list.push(cp);
  }
  refreshPool(ctx, st, true); return S;
}
const total = (cp) => cp.units.reduce((a, u) => a + u.size, 0);
/** 毎月: 軍団の兵力を、国家の陸の兵力にそろえる（損耗は戦闘で軍団に直接反映済み。増減の残りは全軍団に比例して配る） */
export function syncCorps(ctx, st) {
  if (!st.player) return; const S = ensureCorps(ctx, st); if (!S) return; const { civ } = ctx, land = Math.max(0, st.army * landShare(st)), cur = S.list.reduce((a, c) => a + total(c), 0);
  if (cur > 0 && Math.abs(land - cur) > Math.max(1, cur * 0.003)) { const f = land / cur; for (const cp of S.list) for (const u of cp.units) u.size = r1(u.size * f); }
  else if (!(cur > 0) && land > 0 && S.list.length) { const per = land / S.list.length, kinds = landKinds(st); for (const cp of S.list) { cp.units = kinds.filter(([, sh]) => sh >= 0.04).map(([k, sh]) => mkUnit(S, st, k, per * sh)); } }
  for (const cp of S.list) { cp.size = r1(total(cp)); for (const u of cp.units) if (u.autoName) u.name = unitName(st, u.kind); if (cp.warId && civ.wars[cp.warId]?.status !== "active") cp.warId = null; if (!civ.groups[cp.at]) cp.at = civ.groups[st.capitalGroupId]?.id ?? null; }
  refreshPool(ctx, st);
}
/** 戦場の損耗を軍団へ反映する（総兵力は国家側で減らしてある。軍団の兵力は次の syncCorps でそろう） */
export function corpsLoss(st, corpsId, dead) { const cp = corpsById(st, corpsId); if (!cp || !(dead > 0)) return; const t = total(cp); if (!(t > 0)) return; const f = Math.max(0, 1 - dead / t); for (const u of cp.units) u.size = r1(u.size * f); cp.size = r1(total(cp)); }
/** 戦闘のあと: 指揮官・副官の経験（勝てば多く）。経験が積もると能力が育つ（上限 0.95） */
export function corpsAfterBattle(ctx, st, F, won, name = null) {
  const cp = corpsById(st, F?.corpsId); if (!cp) return; for (const p of [cp.commander, ...Object.values(cp.officers)]) { if (!p) continue; p.xp = r2((p.xp ?? 0) + (won ? 1 : 0.4)); if (p.xp >= 3) { p.xp = r2(p.xp - 3); p.skill = r2(Math.min(0.95, p.skill + 0.02)); if (!p.traits.includes("veteran") && p.skill >= 0.7 && p.traits.length < 3 && hashSeed(ctx.civ.historySeed, "vet", p.id, ctx.civ.monthIndex) % 4 === 0) p.traits.push("veteran"); } }
  cp.history.push({ at: ctx.civ.monthIndex, won, name }); if (cp.history.length > 12) cp.history.shift();
}

// ---- 移動（行軍ルート）
/** 集団どうしの最短経路（隣接のたどり）。from を含まず、to を含む。たどれなければ null */
export function routeTo(ctx, from, to, maxNodes = 5000) {
  const { civ } = ctx; if (from === to) return []; if (!civ.groups[from] || !civ.groups[to]) return null; const prev = new Map([[from, null]]), q = [from];
  for (let i = 0; i < q.length && prev.size < maxNodes; i++) for (const o of [...neighborGroups(ctx, civ.groups[q[i]])].sort()) { if (prev.has(o) || !civ.groups[o]) continue; prev.set(o, q[i]); if (o === to) { const path = []; for (let c = to; c !== from; c = prev.get(c)) path.push(c); return path.reverse(); } q.push(o); }
  return null;
}
export const marchSteps = (ctx, st) => 2 + (stateCan(ctx.civ, st, "war:far") ? 1 : 0);

// ---- 人事・編成の命令（検証してから変える）
const fail = (error) => ({ ok: false, error });
const need = (st, id) => { const cp = corpsById(st, id); return cp ?? null; };
export function renameCorps(st, { corpsId, name }) { const cp = need(st, corpsId); if (!cp) return fail("その軍団はありません"); const n = typeof name === "string" ? name.trim() : ""; if (!n || n.length > 20) return fail("名前は 1〜20 文字"); cp.name = n; return { ok: true }; }
export function renameUnit(st, { corpsId, unitId, name }) { const cp = need(st, corpsId), u = cp?.units.find((x) => x.id === unitId); if (!u) return fail("その部隊はありません"); const n = typeof name === "string" ? name.trim() : ""; if (!n || n.length > 20) return fail("名前は 1〜20 文字"); u.name = n; u.autoName = false; return { ok: true }; }
/** 軍団を分ける: 各部隊の fraction（0.1〜0.9）を新しい軍団へ。指揮官は候補から任命する（commanderId） */
export function splitCorps(ctx, st, { corpsId, name, fraction, commanderId }) {
  const S = st.corps, cp = need(st, corpsId); if (!cp) return fail("その軍団はありません"); if (S.list.length >= CORPS_MAX) return fail(`軍団は ${CORPS_MAX} まで`); if (!(fraction >= 0.1 && fraction <= 0.9)) return fail("分ける割合は 0.1〜0.9"); const n = typeof name === "string" ? name.trim() : ""; if (!n || n.length > 20) return fail("新しい軍団の名前は 1〜20 文字");
  const cmd = S.pool.find((p) => p.id === commanderId); if (!cmd) return fail("指揮官の候補を選んでください"); const cost = r1(cp.size * fraction * 0.001); if (st.treasury < cost) return fail(`編成の費用 ${cost} が足りない`);
  st.treasury -= cost; const nu = []; for (const u of cp.units) { const m = r1(u.size * fraction); u.size = r1(u.size - m); nu.push({ ...mkUnit(S, st, u.kind, m), name: u.name, autoName: u.autoName }); } S.pool = S.pool.filter((p) => p.id !== cmd.id); cmd.role = "commander"; cp.size = r1(total(cp));
  const nc = { id: idOf(S, "cp"), name: n, size: r1(nu.reduce((a, u) => a + u.size, 0)), at: cp.at, order: { kind: "hold", since: ctx.civ.monthIndex }, warId: cp.warId, units: nu, commander: cmd, officers: {}, history: [], created: ctx.civ.monthIndex }; S.list.push(nc); return { ok: true, corpsId: nc.id, cost };
}
export function mergeCorps(st, { from, into }) {
  const S = st.corps, a = need(st, from), b = need(st, into); if (!a || !b || a === b) return fail("統合する軍団を 2 つ選んでください"); if (S.list.length <= 1) return fail("最後の軍団は統合できない"); if (a.at !== b.at) return fail("同じ場所にいる軍団どうしだけ統合できる");
  for (const u of a.units) { const t = b.units.find((x) => x.kind === u.kind); if (t) t.size = r1(t.size + u.size); else b.units.push(u); } b.size = r1(total(b)); for (const p of [a.commander, ...Object.values(a.officers)]) if (p) { p.role = null; S.pool.push(p); } S.list = S.list.filter((c) => c !== a); return { ok: true };
}
export function transferUnits(st, { from, to, unitId, size }) {
  const a = need(st, from), b = need(st, to), u = a?.units.find((x) => x.id === unitId); if (!a || !b || a === b || !u) return fail("移す部隊と軍団を選んでください"); if (a.at !== b.at) return fail("同じ場所にいる軍団どうしだけ兵を移せる"); const m = r1(Number(size)); if (!(m > 0) || m > u.size) return fail("移す兵力が範囲外"); if (m >= u.size && a.units.length === 1) return fail("軍団の最後の部隊は、すべては移せない");
  u.size = r1(u.size - m); const t = b.units.find((x) => x.kind === u.kind && x.name === u.name) ?? b.units.find((x) => x.kind === u.kind); if (t) t.size = r1(t.size + m); else b.units.push({ ...u, id: idOf(st.corps, "un"), size: m }); a.units = a.units.filter((x) => x.size > 0.05); a.size = r1(total(a)); b.size = r1(total(b)); return { ok: true };
}
/** 部隊の兵種を変える（再訓練）。使える兵種だけ。費用は兵力の 0.2% */
export function convertUnit(ctx, st, { corpsId, unitId, toKind }) {
  const cp = need(st, corpsId), u = cp?.units.find((x) => x.id === unitId); if (!u) return fail("その部隊はありません"); const K = UNIT_KINDS[toKind]; if (!K || toKind === "navy") return fail("その兵種にはできません"); if (!K.need(st, ctx)) return fail(`${K.ja}は今の技術では編制できない`); if (u.kind === toKind) return fail("すでにその兵種です");
  const cost = r1(u.size * 0.002); if (st.treasury < cost) return fail(`再訓練の費用 ${cost} が足りない`); st.treasury -= cost; u.kind = toKind; u.name = unitName(st, toKind); u.autoName = true; const t = cp.units.find((x) => x !== u && x.kind === toKind); if (t) { t.size = r1(t.size + u.size); cp.units = cp.units.filter((x) => x !== u); } return { ok: true, cost };
}
/** 指揮官・副官の任命（候補から）。前の担当者は解任される。任命した人物の支持勢力が少し喜ぶ */
export function appoint(ctx, st, { corpsId, slot, personId }) {
  const S = st.corps, cp = need(st, corpsId); if (!cp) return fail("その軍団はありません"); if (slot !== "commander" && !OFFICER_SLOTS[slot]) return fail("役目は commander / vanguard / quartermaster / strategist");
  const p = S.pool.find((x) => x.id === personId); if (!p) return fail("その候補はいません"); S.pool = S.pool.filter((x) => x.id !== personId); const old = slot === "commander" ? cp.commander : cp.officers[slot]; p.role = slot;
  if (slot === "commander") cp.commander = p; else cp.officers[slot] = p; const F = st.politics?.factions; if (F?.[p.backer]) F[p.backer].support = clamp(F[p.backer].support + 0.02); if (old && F?.[old.backer]) F[old.backer].support = clamp(F[old.backer].support - 0.015);
  return { ok: true, dismissed: old?.name ?? null };
}
export function dismiss(st, { corpsId, slot }) { const cp = need(st, corpsId); if (!cp || !OFFICER_SLOTS[slot]) return fail("解任できるのは副官だけです（指揮官は別の人物を任命してください）"); if (!cp.officers[slot]) return fail("その役目は空いています"); delete cp.officers[slot]; return { ok: true }; }
/** 作戦の命令。march（進軍）・siege（包囲）は敵の土地、defend（守備）・retreat（撤退）は味方の土地へ。ルートは最短（途中に通る土地の一覧を返す） */
export function setOrder(ctx, st, { corpsId, kind, targetGroupId = null, warId = null }) {
  const { civ } = ctx, cp = need(st, corpsId); if (!cp) return fail("その軍団はありません"); if (!ORDER_KINDS[kind]) return fail("未知の命令");
  if (warId != null) { const w = civ.wars[warId]; if (!w || w.status !== "active" || !(w.sides.a.includes(st.id) || w.sides.d.includes(st.id))) return fail("その戦争には参戦していません"); cp.warId = warId; }
  if (kind === "auto" || kind === "hold" || kind === "reserve") { cp.order = { kind, since: civ.monthIndex }; if (kind === "reserve") cp.warId = null; return { ok: true }; }
  const g = civ.groups[targetGroupId]; if (!g) return fail("目標の土地を選んでください");
  if (kind === "retreat" && !targetGroupId) targetGroupId = st.capitalGroupId;
  const route = routeTo(ctx, cp.at, g.id); if (route == null) return fail("そこへ行く道がありません"); cp.order = { kind, targetGroupId: g.id, route, since: civ.monthIndex }; return { ok: true, route: route.length };
}
export function commitWar(ctx, st, { corpsIds, warId }) { const { civ } = ctx, w = civ.wars[warId]; if (!w || w.status !== "active") return fail("その戦争は進行中ではない"); for (const cp of corpsOf(st)) { if (corpsIds.includes(cp.id)) { cp.warId = warId; if (cp.order.kind === "reserve") cp.order = { kind: "auto", since: civ.monthIndex }; } else if (cp.warId === warId) { cp.warId = null; cp.order = { kind: "reserve", since: civ.monthIndex }; } } return { ok: true }; }

/** 戦争 w に出ている軍団（担当国家のみ）。戦争に割り当てがない軍団は、最初に同期された戦争へ割り当てる */
export function corpsForWar(civ, st, w) {
  if (!st.player || !st.corps) return null; const out = [];
  for (const cp of st.corps.list) { if (cp.order.kind === "reserve" || !(cp.size > 0.5)) continue; if (cp.warId && civ.wars[cp.warId]?.status === "active" && cp.warId !== w.id) continue; if (!cp.warId) cp.warId = w.id; out.push(cp); }
  return out;
}
/** 反乱で国が成立したとき、担当国の軍団は忠誠度に応じて軍団ごとに寝返る（v6.12.0）。
 *  忠誠度 = 指揮官の支持勢力の支持度 − 不満（安定度の低さ）。反乱の地域にいる軍団は寝返りやすい。最後の 1 軍団（もっとも忠誠な軍団）は残る。寝返った軍団の兵力は新しい国へ移る */
export function defectCorps(ctx, st, ns, partGroupIds) {
  if (!st.player || !st.corps || !ns?.alive) return []; const { civ } = ctx, S = st.corps, F = st.politics?.factions ?? {}, mi = civ.monthIndex, out = [];
  const loyal = (cp) => { const sup = F[cp.commander?.backer]?.support ?? 0.5, inReg = partGroupIds.includes(cp.at) ? 0.4 : 0; return clamp(0.1 + (0.5 - sup) * 1.2 + (0.4 - st.stability) * 0.8 + inReg - (cp.commander?.skill ?? 0.5) * 0.05, 0, 0.9); };
  const ranked = [...S.list].sort((a, b) => loyal(a) - loyal(b)); const stay = ranked[0]; // もっとも寝返りにくい軍団は残る
  for (const cp of S.list) { if (cp === stay) continue; if (hashSeed(civ.historySeed, "defect", st.id, cp.id, mi) / 4294967296 >= loyal(cp)) continue; out.push(cp); }
  for (const cp of out) { const moved = Math.min(st.army, cp.size); st.army = Math.max(0, st.army - moved); ns.army += moved; S.list = S.list.filter((x) => x !== cp); cp.defected = { to: ns.id, at: mi }; for (const p of [cp.commander, ...Object.values(cp.officers)]) if (p) { p.role = null; } }
  return out.map((cp) => ({ id: cp.id, name: cp.name, size: cp.size }));
}

/** 画面用: 軍団の一覧（指揮の能力・位置・命令） */
export function corpsView(ctx, st) {
  const S = st.corps; if (!S) return null; const { civ } = ctx; const name = (gid) => (civ.groups[gid] ? (civ.settlements[civ.groups[gid].settlementId]?.name ?? null) : null);
  return { list: S.list.map((cp) => ({ ...cp, fx: corpsFx(cp), atName: name(cp.at) })), pool: S.pool, max: CORPS_MAX };
}
void navyShare; void byState;
