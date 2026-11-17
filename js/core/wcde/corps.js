// v6.12.0: 軍団（Corps）。担当国家の軍を、名前のある軍団に分け、最高指揮官とその部下（副官）を置き、作戦の命令（進軍・包囲・守備・撤退）を出せるようにする。
//   データは担当国家（st.corps）に 1 か所だけ持つ。軍団の兵力の合計は、国家の陸の兵力（st.army × 陸の割合）と一致するよう、毎月そろえる（総兵力の正本は国家のまま）。
//   戦争の実行（作戦・会戦・包囲）は warfare.js が持つ。ここは「軍団の編成・人事・命令・移動・指揮官の能力」だけ。
//   指揮官・副官は人物（名前・能力・特性）で、特性は小さなバフ・デバフ（上限 ±20%）。戦場の経験で能力が育つ。候補は自動で現れ、任命・解任できる。
import { hashSeed, rngOf } from "../civ/civ-state.js";
import { neighborGroups, byState } from "../civ/spatial.js";
import { stateCan } from "../civ/tech.js";
import { SERVICES, SERVICE_KEYS, UNIT_TYPES, serviceOf, unitName, autoRoster } from "./orbat.js";
import { navyShare, landShare } from "./power.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v), r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;
export const CORPS_MAX = 12, POOL_MAX = 12, SERVICE_CAP = Object.freeze({ land: 6, sea: 3, air: 3, space: 2 }), AI_CAP = Object.freeze({ land: 4, sea: 2, air: 2, space: 1 }), OFFICER_SLOTS = Object.freeze({ vanguard: "先鋒", quartermaster: "兵站", strategist: "参謀" });
export const ORDER_KINDS = Object.freeze({ auto: "お任せ（自動の作戦）", hold: "待機", march: "進軍", siege: "包囲", defend: "守備", retreat: "撤退", reserve: "予備（戦争に出さない）" });
/** 特性: 小さなバフ・デバフ。off 攻め／def 守り／siege 包囲／logi 補給／coh 士気 */
export const TRAITS = Object.freeze({
  aggressive: { ja: "攻勢巧者", off: 0.06 }, stalwart: { ja: "堅守の将", def: 0.06 }, besieger: { ja: "包囲術", siege: 0.18 }, provisioner: { ja: "補給上手", logi: 0.12 }, inspiring: { ja: "人望", coh: 0.12 },
  reckless: { ja: "無謀", off: 0.08, def: -0.06 }, cautious: { ja: "慎重", def: 0.04, off: -0.05 }, vain: { ja: "名誉欲", off: 0.03, logi: -0.06 }, frugal: { ja: "倹約家", logi: 0.06, coh: -0.04 }, veteran: { ja: "歴戦", off: 0.03, def: 0.03 },
  // v6.13.0: 軍ごとの特性（その軍の指揮官だけが持つ）
  armored_thinker: { ja: "機甲の閃き", off: 0.07, svc: "land" }, logistician: { ja: "兵站の鬼", logi: 0.1, svc: "land" },
  storm_wise: { ja: "荒海の将", logi: 0.08, coh: 0.05, svc: "sea" }, gunnery: { ja: "砲術の名手", off: 0.07, svc: "sea" }, convoy: { ja: "護衛の達人", def: 0.06, logi: 0.04, svc: "sea" },
  air_ace: { ja: "撃墜王", off: 0.08, svc: "air" }, air_strategist: { ja: "戦略眼", siege: 0.12, svc: "air" }, air_defender: { ja: "防空の名手", def: 0.08, svc: "air" },
  // v6.18.0: 系統（ドクトリン）との相性。いまの系統と一致すると、攻め +4%・士気 +3% が加わる（line）。宇宙軍の特性もここ
  gunner: { ja: "砲兵の鬼", off: 0.03, siege: 0.08, line: "firepower" }, maneuverist: { ja: "機動の達人", off: 0.03, logi: 0.05, line: "mobile" }, mass_mobilizer: { ja: "動員の名人", coh: 0.05, logi: 0.03, line: "mass" },
  fortifier: { ja: "築城の名手", def: 0.05, coh: 0.03, line: "position" }, raider: { ja: "奇襲の達人", off: 0.04, line: "special" }, orbital_mind: { ja: "軌道の目", off: 0.05, svc: "space" }, uplink: { ja: "通信の達人", coh: 0.06, svc: "space" },
});
const TRAIT_KEYS = Object.keys(TRAITS), traitsFor = (svc) => TRAIT_KEYS.filter((k) => !TRAITS[k].svc || TRAITS[k].svc === svc);
const ORD = ["第一", "第二", "第三", "第四", "第五", "第六", "第七", "第八", "第九", "第十", "第十一", "第十二"];
const idOf = (S, p) => `${p}${++S.seq}`;
export const corpsOf = (st) => st.corps?.list ?? [];
export const corpsById = (st, id) => corpsOf(st).find((c) => c.id === id) ?? null;
const fkeysOf = (st) => Object.keys(st.politics?.factions ?? {});

// ---- 人物（指揮官・副官の候補）。service＝どの軍の人か（陸・海・空）
export const rankOf = (p) => { const R = SERVICES[p?.service ?? "land"].ranks, s = p?.skill ?? 0; return R[s < 0.4 ? 0 : s < 0.6 ? 1 : s < 0.8 ? 2 : 3]; };
function genPerson(ctx, st, tag, { minSkill = 0.25, spread = 0.6, service = "land" } = {}) {
  const { civ } = ctx, S = st.corps, seed = hashSeed(civ.historySeed, "cp", st.id, tag, S.seq + 1), r = rngOf(seed), cap = civ.groups[st.capitalGroupId];
  const name = ctx.nameGen?.person(civ, cap, r) ?? `将${S.seq + 1}`, n = r() < 0.55 ? 1 : r() < 0.6 ? 0 : 2, traits = [], pool = traitsFor(service);
  while (traits.length < n) { const k = pool[Math.floor(r() * pool.length)]; if (!traits.includes(k)) traits.push(k); }
  const keys = fkeysOf(st); return { id: idOf(S, "pp"), name, service, skill: r2(minSkill + spread * r()), traits, xp: 0, age: 28 + Math.floor(r() * 25), backer: r() < 0.6 && keys.includes("military") ? "military" : keys.includes("nobility") ? "nobility" : "military", since: civ.monthIndex };
}
/** 今の技術・地理で、その軍が成り立つか（陸は常に。海・空は、その軍の兵種が 1 つでも使える） */
export const serviceUsable = (ctx, st, svc) => svc === "land" || Object.values(UNIT_TYPES).some((T) => T.service === svc && T.need(st, ctx));
export function refreshPool(ctx, st, force = false) {
  const S = st.corps, mi = ctx.civ.monthIndex; if (!S || !st.player) return; if (!force && mi - (S.poolAt ?? -999) < 12) return; S.poolAt = mi;
  S.pool = (S.pool ?? []).filter((p) => mi - p.since < 120); for (const p of S.pool) p.service ??= "land";
  for (const svc of SERVICE_KEYS) { if (!serviceUsable(ctx, st, svc)) continue; const want = svc === "land" ? 4 : 2; let n = S.pool.filter((p) => p.service === svc).length; while (n < want && S.pool.length < POOL_MAX + 4) { S.pool.push(genPerson(ctx, st, `pool${mi}${svc}`, { service: svc })); n++; } }
  while (S.pool.length < POOL_MAX && (force || hashSeed(ctx.civ.historySeed, "pool", st.id, mi, S.pool.length) % 3 === 0)) { S.pool.push(genPerson(ctx, st, `pool${mi}`)); if (!force && S.pool.length >= 4) break; }
}

// ---- 能力（小さなバフ・デバフ。上限 ±0.2）
export function corpsFx(cp, st = null) {
  const fx = { off: 0, def: 0, siege: 0, logi: 0, coh: 0, skill: 0 }, add = (p, wt) => { if (!p) return; fx.skill += (p.skill - 0.5) * 0.2 * wt; for (const t of p.traits ?? []) { const T = TRAITS[t]; if (!T) continue; for (const k of ["off", "def", "siege", "logi", "coh"]) if (T[k]) fx[k] += T[k] * wt; if (T.line && T.line === st?.military?.doc?.line) { fx.off += 0.04 * wt; fx.coh += 0.03 * wt; } } };
  add(cp.commander?.dead ? null : cp.commander, 1); for (const o of Object.values(cp.officers ?? {})) add(o, 0.4); add(st?.corps?.chiefs?.[cp.service ?? "land"], 0.35); // v6.13.0: その軍の総司令官が、全部隊に効く
  for (const k of Object.keys(fx)) fx[k] = r2(clamp(fx[k], -0.2, 0.2)); return fx;
}
/** 戦闘の指揮の倍率（攻め role=atk／守り role=def）。軍団でない部隊は 1。アルゴリズム国家の部隊は、その軍の主力の部隊（F.lead）の指揮官が効く */
export function cmdMult(st, F, role) { const id = F?.corpsId ?? F?.lead; if (!id) return 1; const cp = corpsById(st, id); if (!cp) return 1; const fx = corpsFx(cp, st); return 1 + clamp(fx.skill + (role === "atk" ? fx.off : fx.def), -0.25, 0.3); }

// ---- 編成（v6.13.0: 陸・海・空の部隊。兵種ごとの人数は、国家の人数（orbat.js）を部隊へ割り当てる）
//   部隊の構成は「自動」（国家の人数を、部隊の重みで分ける）か「手動」（cp.manual = { 兵種: 人数 }）。手動の部隊が先に取り、残りを自動の部隊が分ける。
//   手動の合計が国家の人数を超える兵種は、比例して縮む（国家の人数を増やすには、国家の軍制を手動にして人数を決める）。
const perFormation = (st, svc) => svc === "land" ? (st.techAdopted?.tank != null ? 30000 : st.techAdopted?.breech_loading != null ? 20000 : st.techAdopted?.gunpowder != null ? 14000 : st.techAdopted?.iron_weapons != null ? 7500 : 3000) : svc === "sea" ? (st.techAdopted?.dreadnought != null ? 25000 : st.techAdopted?.ironclad != null ? 12000 : 4000) : 9000;
const mkUnit = (S, st, kind, size) => ({ id: idOf(S, "un"), kind, size: r1(size), name: unitName(st, kind), autoName: true });
const total = (cp) => cp.units.reduce((a, u) => a + u.size, 0);
const headsOfSvc = (R, svc) => Object.entries(R).reduce((a, [k, v]) => a + (serviceOf(k) === svc ? v : 0), 0);
/** 国家の今の人数（兵種ごと）。最後の更新（3 か月ごと）からの総兵力の増減を、比例して反映する */
export function liveRoster(ctx, st) {
  const us = st.military?.units ?? [], base = us.reduce((a, u) => a + u.size, 0); if (!(base > 0)) return autoRoster(ctx, st);
  const f = st.army / base, out = {}; for (const u of us) out[u.kind] = u.size * f; return out;
}
const capOf = (st, svc) => (st.player ? SERVICE_CAP : AI_CAP)[svc];
function newFormation(ctx, st, svc) {
  const S = st.corps, n = S.list.filter((c) => c.service === svc).length, cap = ctx.civ.groups[st.capitalGroupId];
  const cp = { id: idOf(S, "cp"), name: `${ORD[n] ?? `第${n + 1}`}${SERVICES[svc].formation}`, service: svc, comp: "auto", weight: 1, manual: null, size: 0, at: cap?.id ?? null, order: { kind: "auto", since: ctx.civ.monthIndex }, warId: null, units: [], commander: null, officers: {}, history: [], created: ctx.civ.monthIndex };
  S.list.push(cp); return cp;
}
/** 国家の軍を、陸・海・空の部隊に分ける（まだ無ければ作る）。担当国もアルゴリズム国家も同じ。指揮官は自動で任命する（アルゴリズム国家は総司令官も） */
export function ensureCorps(ctx, st) {
  if (!st?.alive) return st?.corps ?? null; let S = st.corps; if (S?.chiefs && !("space" in S.chiefs)) S.chiefs.space = null;
  if (S && S.v >= 2) { const cur = S.list.reduce((a, c) => a + c.size, 0); if (Math.abs(cur - st.army) > Math.max(1, st.army * 0.01)) assignRoster(ctx, st); if (st.player && (S.pool?.length ?? 0) < 3) refreshPool(ctx, st, true); /* アルゴリズム国家から担当国になった直後は、候補がいない */ return S; } // 国家の兵力と部隊の合計がずれていたら、割り当て直す
  if (S) { S.v = 2; S.chiefs ??= { land: null, sea: null, air: null }; for (const cp of S.list) { cp.service ??= "land"; if (!cp.comp) { cp.comp = "manual"; cp.manual = Object.fromEntries(cp.units.map((u) => [u.kind, u.size])); } cp.weight ??= 1; } for (const p of S.pool ?? []) p.service ??= "land"; return S; }
  S = st.corps = { v: 2, seq: 0, list: [], pool: [], poolAt: -999, chiefs: { land: null, sea: null, air: null, space: null } };
  refreshPool(ctx, st, true); growFormations(ctx, st); assignRoster(ctx, st); staffAll(ctx, st, true); refreshPool(ctx, st, true); return S;
}
function growFormations(ctx, st) {
  const S = st.corps, R = liveRoster(ctx, st);
  for (const svc of SERVICE_KEYS) {
    const heads = headsOfSvc(R, svc), have = S.list.filter((c) => c.service === svc).length; if (svc !== "land" && heads < 30) continue;
    const want = clamp(Math.round(heads / perFormation(st, svc)), heads > 0.5 ? 1 : 0, capOf(st, svc)), room = (st.player ? CORPS_MAX : 99) - S.list.length;
    for (let i = have; i < want && i - have < room; i++) newFormation(ctx, st, svc);
  }
}
function setUnits(S, st, cp, heads) {
  const old = new Map(cp.units.map((u) => [u.kind, u])), next = [];
  for (const k of Object.keys(UNIT_TYPES)) { const n = heads[k]; if (!(n > 0.05)) continue; const u = old.get(k) ?? mkUnit(S, st, k, n); u.size = r1(n); if (u.autoName) u.name = unitName(st, k); next.push(u); }
  cp.units = next; cp.size = r1(total(cp));
}
/** 国家の人数を、各軍の部隊へ割り当てる（手動の部隊が先、残りを自動の部隊が重みで分ける） */
export function assignRoster(ctx, st) {
  const S = st.corps; if (!S) return; const R = liveRoster(ctx, st);
  for (const svc of SERVICE_KEYS) {
    const fs = S.list.filter((c) => c.service === svc); if (!fs.length) continue;
    const autos = fs.filter((c) => c.comp !== "manual"), mans = fs.filter((c) => c.comp === "manual"), give = new Map(fs.map((c) => [c, {}]));
    for (const k of Object.keys(R).filter((x) => serviceOf(x) === svc)) {
      const Rk = R[k]; let ms = 0; for (const c of mans) ms += c.manual?.[k] ?? 0; const f = ms > Rk ? Rk / ms : 1;
      for (const c of mans) { const v = (c.manual?.[k] ?? 0) * f; if (v > 0) give.get(c)[k] = v; }
      const rest = Math.max(0, Rk - ms * f); if (rest > 0) { const pool = autos.length ? autos : fs, ws = pool.reduce((a, c) => a + (c.weight ?? 1), 0) || 1; for (const c of pool) give.get(c)[k] = (give.get(c)[k] ?? 0) + (rest * (c.weight ?? 1)) / ws; }
    }
    for (const c of fs) setUnits(S, st, c, give.get(c));
  }
}
/** 部隊を手動にする（今の構成を固定する）。移動・分割・統合・再訓練のあと */
const lockManual = (cp) => { cp.comp = "manual"; cp.manual = Object.fromEntries(cp.units.map((u) => [u.kind, u.size])); };
// ---- 人事の自動（アルゴリズム国家は全員を自動で。担当国は、空いた指揮官の席だけ自動で埋める）
function staffOne(ctx, st, cp, i) {
  const S = st.corps, svc = cp.service ?? "land"; if (cp.commander) return;
  const k = st.player ? S.pool.findIndex((p) => (p.service ?? "land") === svc) : -1;
  cp.commander = k >= 0 ? S.pool.splice(k, 1)[0] : genPerson(ctx, st, "cmd", { service: svc, minSkill: st.player ? 0.25 : 0.3 }); cp.commander.role = "commander";
  if (svc === "land" && st.player && i < 3) { const j = S.pool.findIndex((p) => (p.service ?? "land") === "land"), o = j >= 0 ? S.pool.splice(j, 1)[0] : genPerson(ctx, st, "off"); o.role = "vanguard"; cp.officers.vanguard = o; }
}
function staffAll(ctx, st, initial = false) {
  const S = st.corps; for (const svc of SERVICE_KEYS) S.list.filter((c) => c.service === svc).forEach((cp, i) => staffOne(ctx, st, cp, i));
  if (!st.player) for (const svc of SERVICE_KEYS) { const has = S.list.some((c) => c.service === svc); if (has && !S.chiefs[svc]) { const c = genPerson(ctx, st, `chief${svc}`, { service: svc, minSkill: 0.4, spread: 0.45 }); c.age += 10; c.role = "chief"; S.chiefs[svc] = c; } }
}
/** アルゴリズム国家の指揮官は、歳をとって交代する（年 1 回）。担当国の人事は、担当者が決める */
function retireOld(ctx, st) {
  if (st.player) return; const S = st.corps, mi = ctx.civ.monthIndex, old = (p) => p && p.age + (mi - p.since) / 12 > 58 + (hashSeed(ctx.civ.historySeed, "ret", p.id) % 12);
  for (const cp of S.list) if (old(cp.commander)) { cp.commander = null; staffOne(ctx, st, cp, 9); }
  for (const svc of SERVICE_KEYS) if (old(S.chiefs[svc])) S.chiefs[svc] = null; staffAll(ctx, st);
}
/** 毎月: 部隊を、国家の人数にそろえる（損耗は戦闘で部隊に直接反映済み。残りの増減は割り当てで配る）。アルゴリズム国家は、戦争に入るときと、年 1 回 */
export function syncCorps(ctx, st) {
  if (!st?.alive) return; const S = ensureCorps(ctx, st); if (!S) return; const { civ } = ctx, mi = civ.monthIndex;
  growFormations(ctx, st); assignRoster(ctx, st); staffAll(ctx, st);
  for (const cp of S.list) { for (const u of cp.units) if (u.autoName) u.name = unitName(st, u.kind); if (cp.warId && civ.wars[cp.warId]?.status !== "active") cp.warId = null; if (!civ.groups[cp.at]) cp.at = civ.groups[st.capitalGroupId]?.id ?? null; }
  if (mi % 12 === 0) retireOld(ctx, st);
  refreshPool(ctx, st);
}
/** 戦場の損耗を部隊へ反映する（総兵力は国家側で減らしてある）。手動の指定も同じ割合で減る */
export function corpsLoss(st, corpsId, dead) { const cp = corpsById(st, corpsId); if (!cp || !(dead > 0)) return; const t = total(cp); if (!(t > 0)) return; const f = Math.max(0, 1 - dead / t); for (const u of cp.units) u.size = r1(u.size * f); if (cp.manual) for (const k in cp.manual) cp.manual[k] *= f; cp.size = r1(total(cp)); }
/** 軍ぜんたいの損耗を、その軍の部隊へ大きさに応じて配る（アルゴリズム国家の部隊） */
export function serviceLoss(st, svc, dead) { const fs = corpsOf(st).filter((c) => c.service === svc), t = fs.reduce((a, c) => a + c.size, 0); if (!(t > 0) || !(dead > 0)) return; for (const c of fs) corpsLoss(st, c.id, (dead * c.size) / t); }
/** その軍の主力の部隊（いちばん大きい部隊）。アルゴリズム国家の部隊の指揮官になる */
export const leadCorps = (st, svc) => corpsOf(st).filter((c) => c.service === svc && c.size > 0.5).reduce((b, c) => (!b || c.size > b.size ? c : b), null);
/** 戦闘のあと: 指揮官・副官・総司令官の経験（勝てば多く）。経験が積もると能力が育つ（上限 0.95） */
export function corpsAfterBattle(ctx, st, F, won, name = null, big = false) {
  const cp = corpsById(st, F?.corpsId ?? F?.lead); if (!cp) return;
  if (cp.commander && !cp.commander.dead) { const p = (won ? 0.02 : 0.09) * (big ? 1.6 : 1) * (1.2 - 0.4 * (cp.commander.skill ?? 0.5)); if (hashSeed(ctx.civ.historySeed, "fall", cp.id, ctx.civ.monthIndex, name ?? "") / 4294967296 < p) commanderFalls(ctx, st, cp, won ? "戦場で倒れた" : "敗戦のなかで戦死した"); } const chief = st.corps?.chiefs?.[cp.service ?? "land"];
  for (const p of [cp.commander, ...Object.values(cp.officers), chief]) { if (!p) continue; p.xp = r2((p.xp ?? 0) + (won ? 1 : 0.4)); if (p.xp >= 3) { p.xp = r2(p.xp - 3); p.skill = r2(Math.min(0.95, p.skill + 0.02)); if (!p.traits.includes("veteran") && p.skill >= 0.7 && p.traits.length < 3 && hashSeed(ctx.civ.historySeed, "vet", p.id, ctx.civ.monthIndex) % 4 === 0) p.traits.push("veteran"); } }
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
/** 軍団を分ける: 各部隊の fraction（0.1〜0.9）を新しい部隊へ。指揮官は候補（同じ軍の人）から任命する（commanderId）。分けた部隊は、手動の構成になる */
export function splitCorps(ctx, st, { corpsId, name, fraction, commanderId }) {
  const S = st.corps, cp = need(st, corpsId); if (!cp) return fail("その部隊はありません"); if (S.list.length >= CORPS_MAX) return fail(`部隊は ${CORPS_MAX} まで`); if (S.list.filter((c) => c.service === cp.service).length >= SERVICE_CAP[cp.service]) return fail(`${SERVICES[cp.service].ja}の部隊は ${SERVICE_CAP[cp.service]} まで`);
  if (!(fraction >= 0.1 && fraction <= 0.9)) return fail("分ける割合は 0.1〜0.9"); const n = typeof name === "string" ? name.trim() : ""; if (!n || n.length > 20) return fail("新しい部隊の名前は 1〜20 文字");
  const cmd = S.pool.find((p) => p.id === commanderId); if (!cmd) return fail("指揮官の候補を選んでください"); if ((cmd.service ?? "land") !== cp.service) return fail(`${SERVICES[cp.service].ja}の指揮官には、${SERVICES[cp.service].ja}の人物を選んでください`);
  const cost = r1(cp.size * fraction * 0.001); if (st.treasury < cost) return fail(`編成の費用 ${cost} が足りない`);
  st.treasury -= cost; const nu = []; for (const u of cp.units) { const m = r1(u.size * fraction); u.size = r1(u.size - m); nu.push({ ...mkUnit(S, st, u.kind, m), name: u.name, autoName: u.autoName }); } S.pool = S.pool.filter((p) => p.id !== cmd.id); cmd.role = "commander"; cp.size = r1(total(cp)); lockManual(cp);
  const nc = { id: idOf(S, "cp"), name: n, service: cp.service, comp: "manual", weight: 1, manual: null, size: r1(nu.reduce((a, u) => a + u.size, 0)), at: cp.at, order: { kind: "hold", since: ctx.civ.monthIndex }, warId: cp.warId, units: nu, commander: cmd, officers: {}, history: [], created: ctx.civ.monthIndex }; lockManual(nc); S.list.push(nc); return { ok: true, corpsId: nc.id, cost };
}
export function mergeCorps(st, { from, into }) {
  const S = st.corps, a = need(st, from), b = need(st, into); if (!a || !b || a === b) return fail("統合する部隊を 2 つ選んでください"); if (a.service !== b.service) return fail("同じ軍の部隊どうしだけ統合できる"); if (S.list.filter((c) => c.service === a.service).length <= 1 && a.service === "land") return fail("最後の陸軍の部隊は統合できない"); if (a.at !== b.at) return fail("同じ場所にいる部隊どうしだけ統合できる");
  for (const u of a.units) { const t = b.units.find((x) => x.kind === u.kind); if (t) t.size = r1(t.size + u.size); else b.units.push(u); } b.size = r1(total(b)); lockManual(b); for (const p of [a.commander, ...Object.values(a.officers)]) if (p) { p.role = null; S.pool.push(p); } S.list = S.list.filter((c) => c !== a); return { ok: true };
}
export function transferUnits(st, { from, to, unitId, size }) {
  const a = need(st, from), b = need(st, to), u = a?.units.find((x) => x.id === unitId); if (!a || !b || a === b || !u) return fail("移す部隊と移し先を選んでください"); if (a.service !== b.service) return fail("同じ軍の部隊どうしだけ兵を移せる"); if (a.at !== b.at) return fail("同じ場所にいる部隊どうしだけ兵を移せる"); const m = r1(Number(size)); if (!(m > 0) || m > u.size) return fail("移す人数が範囲外"); if (m >= u.size && a.units.length === 1) return fail("部隊の最後の兵種は、すべては移せない");
  u.size = r1(u.size - m); const t = b.units.find((x) => x.kind === u.kind && x.name === u.name) ?? b.units.find((x) => x.kind === u.kind); if (t) t.size = r1(t.size + m); else b.units.push({ ...u, id: idOf(st.corps, "un"), size: m }); a.units = a.units.filter((x) => x.size > 0.05); a.size = r1(total(a)); b.size = r1(total(b)); lockManual(a); lockManual(b); return { ok: true };
}
/** 国家の軍制を手動にして、兵種 from の人数を size だけ減らし、to に足す（部隊の再訓練・構成の変更が、国家の人数に反映されるように） */
function bumpTarget(ctx, st, deltas) {
  const M = st.military; if (!M) return; const cur = M.orbat?.mode === "manual" && M.orbat.target ? { ...M.orbat.target } : Object.fromEntries((M.units ?? []).map((u) => [u.kind, Math.round(u.size)]));
  for (const [k, d] of Object.entries(deltas)) cur[k] = Math.max(0, Math.round((cur[k] ?? 0) + d)); for (const k in cur) if (!(cur[k] > 0)) delete cur[k]; M.orbat = { mode: "manual", target: cur };
}
/** 部隊の兵種を変える（再訓練）。同じ軍の使える兵種だけ。費用は人数の 0.2%。国家の軍制は手動になる */
export function convertUnit(ctx, st, { corpsId, unitId, toKind }) {
  const cp = need(st, corpsId), u = cp?.units.find((x) => x.id === unitId); if (!u) return fail("その兵種の部隊はありません"); const K = UNIT_TYPES[toKind]; if (!K) return fail("その兵種にはできません"); if (K.service !== serviceOf(u.kind)) return fail("同じ軍の兵種にしか変えられません"); if (!K.need(st, ctx)) return fail(`${K.ja}は今の技術・地理では編制できない`); if (u.kind === toKind) return fail("すでにその兵種です");
  const cost = r1(u.size * 0.002); if (st.treasury < cost) return fail(`再訓練の費用 ${cost} が足りない`); st.treasury -= cost; bumpTarget(ctx, st, { [u.kind]: -u.size, [toKind]: u.size }); const from = u.kind; u.kind = toKind; u.name = unitName(st, toKind); u.autoName = true; const t = cp.units.find((x) => x !== u && x.kind === toKind); if (t) { t.size = r1(t.size + u.size); cp.units = cp.units.filter((x) => x !== u); } lockManual(cp); void from; return { ok: true, cost };
}
/** 部隊の構成を、兵種ごとの人数で決める（手動）。heads={兵種: 人数}。国家の人数を超える分は、割り当てで縮む。mode:"auto" なら自動に戻す */
export function setComposition(ctx, st, { corpsId, mode = "manual", heads, weight }) {
  const cp = need(st, corpsId); if (!cp) return fail("その部隊はありません");
  if (weight != null) { const w = Number(weight); if (!(w >= 0.2 && w <= 5)) return fail("重みは 0.2〜5"); cp.weight = w; }
  if (mode === "auto") { cp.comp = "auto"; cp.manual = null; assignRoster(ctx, st); return { ok: true }; }
  if (mode !== "manual") return fail("mode は auto か manual");
  if (!heads || typeof heads !== "object") return fail("兵種ごとの人数を指定してください"); const out = {};
  for (const [k, v] of Object.entries(heads)) { const K = UNIT_TYPES[k]; if (!K) return fail(`未知の兵種 ${k}`); if (K.service !== cp.service) return fail(`${K.ja}は${SERVICES[K.service].ja}の兵種です（この部隊は${SERVICES[cp.service].ja}）`); const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0) return fail("人数は 0 以上の整数"); if (n > 0 && !K.need(st, ctx)) return fail(`${K.ja}は今の技術・地理では編制できない`); if (n > 0) out[k] = n; }
  if (!Object.keys(out).length) return fail("少なくとも 1 つの兵種に人数を入れてください");
  cp.comp = "manual"; cp.manual = out; assignRoster(ctx, st); const R = liveRoster(ctx, st), clipped = Object.keys(out).filter((k) => (cp.units.find((u) => u.kind === k)?.size ?? 0) < out[k] - 1 && out[k] > (R[k] ?? 0) - 0); return { ok: true, clipped };
}
/** 指揮官・副官の任命（候補から）。前の担当者は解任される。任命した人物の支持勢力が少し喜ぶ。指揮官は、その軍の人物だけ */
export function appoint(ctx, st, { corpsId, slot, personId }) {
  const S = st.corps, cp = need(st, corpsId); if (!cp) return fail("その部隊はありません"); if (slot !== "commander" && !OFFICER_SLOTS[slot]) return fail("役目は commander / vanguard / quartermaster / strategist");
  const p = S.pool.find((x) => x.id === personId); if (!p) return fail("その候補はいません"); if (slot === "commander" && (p.service ?? "land") !== cp.service) return fail(`${SERVICES[cp.service].ja}の部隊の指揮官には、${SERVICES[cp.service].ja}の人物を選んでください`);
  S.pool = S.pool.filter((x) => x.id !== personId); const old = slot === "commander" ? cp.commander : cp.officers[slot]; p.role = slot;
  if (slot === "commander") cp.commander = p; else cp.officers[slot] = p; const F = st.politics?.factions; if (F?.[p.backer]) F[p.backer].support = clamp(F[p.backer].support + 0.02); if (old && F?.[old.backer]) F[old.backer].support = clamp(F[old.backer].support - 0.015);
  return { ok: true, dismissed: old?.name ?? null };
}
export function dismiss(st, { corpsId, slot }) { const cp = need(st, corpsId); if (!cp || !OFFICER_SLOTS[slot]) return fail("解任できるのは副官だけです（指揮官は別の人物を任命してください）"); if (!cp.officers[slot]) return fail("その役目は空いています"); delete cp.officers[slot]; return { ok: true }; }
/** 総司令官（陸・海・空の各軍に 1 人。その軍の全部隊に小さく効く）。候補（同じ軍の人物）から任命する。前の人は候補に戻る */
export function appointChief(ctx, st, { service, personId }) {
  const S = st.corps; if (!SERVICES[service]) return fail("軍は land / sea / air"); const p = S.pool.find((x) => x.id === personId); if (!p) return fail("その候補はいません"); if ((p.service ?? "land") !== service) return fail(`${SERVICES[service].chief}には、${SERVICES[service].ja}の人物を選んでください`);
  S.pool = S.pool.filter((x) => x.id !== personId); const old = S.chiefs[service]; if (old) { old.role = null; S.pool.push(old); } p.role = "chief"; S.chiefs[service] = p; const F = st.politics?.factions; if (F?.[p.backer]) F[p.backer].support = clamp(F[p.backer].support + 0.025); return { ok: true, replaced: old?.name ?? null };
}
export function dismissChief(st, { service }) { const S = st.corps; if (!SERVICES[service] || !S.chiefs[service]) return fail("その軍の総司令官は空いています"); const old = S.chiefs[service]; old.role = null; S.pool.push(old); S.chiefs[service] = null; return { ok: true }; }
/** 作戦の命令。陸軍: march（進軍）・siege（包囲）は敵の土地、defend（守備）・retreat（撤退）は味方の土地へ。海軍: お任せ・待機・守備・予備。空軍: お任せ・待機・予備。ルートは最短 */
export function setOrder(ctx, st, { corpsId, kind, targetGroupId = null, warId = null }) {
  const { civ } = ctx, cp = need(st, corpsId); if (!cp) return fail("その部隊はありません"); if (!ORDER_KINDS[kind]) return fail("未知の命令");
  if (cp.service === "air" && !["auto", "hold", "reserve"].includes(kind)) return fail("空軍の部隊には、お任せ・待機・予備の命令だけ出せます（航空戦力は、陸と海の戦いを支えます）");
  if (cp.service === "sea" && !["auto", "hold", "reserve", "defend"].includes(kind)) return fail("海軍の部隊には、お任せ・待機・守備・予備の命令だけ出せます");
  if (warId != null) { const w = civ.wars[warId]; if (!w || w.status !== "active" || !(w.sides.a.includes(st.id) || w.sides.d.includes(st.id))) return fail("その戦争には参戦していません"); cp.warId = warId; }
  if (kind === "auto" || kind === "hold" || kind === "reserve" || (kind === "defend" && cp.service !== "land")) { cp.order = { kind, since: civ.monthIndex }; if (kind === "reserve") cp.warId = null; return { ok: true }; }
  const g = civ.groups[targetGroupId]; if (!g) return fail("目標の土地を選んでください");
  if (kind === "retreat" && !targetGroupId) targetGroupId = st.capitalGroupId;
  const route = routeTo(ctx, cp.at, g.id); if (route == null) return fail("そこへ行く道がありません"); cp.order = { kind, targetGroupId: g.id, route, since: civ.monthIndex }; return { ok: true, route: route.length };
}
export function commitWar(ctx, st, { corpsIds, warId }) { const { civ } = ctx, w = civ.wars[warId]; if (!w || w.status !== "active") return fail("その戦争は進行中ではない"); for (const cp of corpsOf(st)) { if (cp.service === "air") continue; if (corpsIds.includes(cp.id)) { cp.warId = warId; if (cp.order.kind === "reserve") cp.order = { kind: "auto", since: civ.monthIndex }; } else if (cp.warId === warId) { cp.warId = null; cp.order = { kind: "reserve", since: civ.monthIndex }; } } return { ok: true }; }

/** 戦争 w に出ている部隊（担当国のみ。アルゴリズム国家は、軍ごとに 1 つの部隊として出る＝warfare.js の syncForces）。service: land=陸軍の軍団、sea=海軍の艦隊。戦争に割り当てがない部隊は、最初に同期された戦争へ割り当てる */
export function corpsForWar(civ, st, w, service = "land") {
  if (!st.player || !st.corps) return null; const out = [];
  for (const cp of st.corps.list) { if (cp.service !== service || cp.order.kind === "reserve" || !(cp.size > 0.5)) continue; if (cp.warId && civ.wars[cp.warId]?.status === "active" && cp.warId !== w.id) continue; if (!cp.warId) cp.warId = w.id; out.push(cp); }
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

/** 画面用: 部隊の一覧（指揮の能力・位置・命令・階級）と、総司令官・軍ごとの人数 */
export function corpsView(ctx, st) {
  const S = st.corps; if (!S) return null; const { civ } = ctx; const name = (gid) => (civ.groups[gid] ? (civ.settlements[civ.groups[gid].settlementId]?.name ?? null) : null);
  const heads = Object.fromEntries(SERVICE_KEYS.map((k) => [k, r1(S.list.filter((c) => c.service === k).reduce((a, c) => a + c.size, 0))]));
  return { list: S.list.map((cp) => ({ ...cp, fx: corpsFx(cp, st), atName: name(cp.at), rank: cp.commander ? rankOf(cp.commander) : null })), pool: S.pool.map((p) => ({ ...p, rank: rankOf(p) })), chiefs: Object.fromEntries(SERVICE_KEYS.map((k) => [k, S.chiefs?.[k] ? { ...S.chiefs[k], rank: rankOf(S.chiefs[k]) } : null])), heads, usable: Object.fromEntries(SERVICE_KEYS.map((k) => [k, serviceUsable(ctx, st, k)])), max: CORPS_MAX };
}
void navyShare; void landShare; void byState;

// ---- v6.18.0: 指揮官の戦死と後任
/** 後任の候補（3〜5 人）: その軍団の副官・同じ軍の予備の人物・下級の将校。能力の低い者しかいないときは、そのとおりに出す */
export function successorCandidates(ctx, st, cp) {
  const S = st.corps, svc = cp.service ?? "land", out = [];
  for (const [slot, p] of Object.entries(cp.officers ?? {})) if (p && !p.dead) out.push({ p, from: `副官（${OFFICER_SLOTS[slot] ?? slot}）`, slot });
  for (const p of S.pool ?? []) if ((p.service ?? "land") === svc && out.length < 5) out.push({ p, from: "控えの将" });
  let k = 0; while (out.length < 3) { out.push({ p: genPerson(ctx, st, `succ${ctx.civ.monthIndex}_${k++}`, { minSkill: 0.12, spread: 0.3, service: svc }), from: "下級の将校", fresh: true }); }
  return out.slice(0, 5);
}
/** 後任を据える（副官・予備・新任のいずれも）。前任は戦没者の記録に残る */
export function installCommander(st, cp, person, slot = null) {
  const S = st.corps; S.pool = (S.pool ?? []).filter((x) => x.id !== person.id); if (slot && cp.officers[slot]?.id === person.id) delete cp.officers[slot]; else for (const k of Object.keys(cp.officers)) if (cp.officers[k]?.id === person.id) delete cp.officers[k];
  const old = cp.commander; if (old) { (S.fallen ??= []).push({ name: old.name, corps: cp.name, at: old.fellAt ?? null, cause: old.cause ?? "" }); if (S.fallen.length > 30) S.fallen.shift(); }
  person.role = "commander"; person.service ??= cp.service ?? "land"; cp.commander = person; cp.vacant = false; return person;
}
/** 指揮官の戦死。担当国は専用の決断（後任の選択）、そうでなければ最も有能な後任を自動で据える */
export function commanderFalls(ctx, st, cp, cause = "戦死した") {
  const old = cp.commander; if (!old || old.dead) return null; old.dead = true; old.fellAt = ctx.civ.monthIndex; old.cause = cause; cp.vacant = true;
  const cands = successorCandidates(ctx, st, cp), hook = st.player ? ctx.decisions?.commanderDeath : null, id = hook ? hook(ctx, st, cp, cands, cause) : null;
  if (!id) { const best = cands.slice().sort((a, b) => b.p.skill - a.p.skill)[0]; installCommander(st, cp, best.p, best.slot ?? null); }
  return id ?? true;
}
/** 新しい軍団を編成する（担当国）。指揮官を予備の人物から選び、国家の人数を自動の配分で分け直す。費用 25 */
export function createCorps(ctx, st, { service = "land", name, commanderId }) {
  const S = st.corps; if (!S) return fail("軍団のデータがありません"); if (!SERVICES[service]) return fail("未知の軍です"); if (!serviceUsable(ctx, st, service)) return fail(`${SERVICES[service].ja}は、まだ編成できません`);
  if (S.list.length >= CORPS_MAX) return fail(`軍団は ${CORPS_MAX} まで`); if (S.list.filter((c) => c.service === service).length >= SERVICE_CAP[service]) return fail(`${SERVICES[service].ja}の軍団は ${SERVICE_CAP[service]} まで`);
  const nm = typeof name === "string" ? name.trim() : ""; if (nm.length > 20) return fail("名前は 20 文字まで"); const cmd = S.pool.find((p) => p.id === commanderId); if (!cmd || (cmd.service ?? "land") !== service) return fail("指揮官を選んでください");
  if (st.treasury < 25) return fail("編成の費用 25 が足りない"); st.treasury -= 25;
  const cp = newFormation(ctx, st, service); if (nm) cp.name = nm; S.pool = S.pool.filter((p) => p.id !== cmd.id); cmd.role = "commander"; cp.commander = cmd; assignRoster(ctx, st); return { ok: true, corpsId: cp.id, cost: 25 };
}
