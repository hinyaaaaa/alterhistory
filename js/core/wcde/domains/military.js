// v6 M3: 軍事組織。国家の軍（v5 の st.army＝総兵力）を、部隊（種類・規模・装備・練度）に分け、装備は産業・財政・技術から決まり、
//   ドクトリン（共通 20＋政体固有 10）の取得が軍事能力に効く。能力は st.milBonus（攻防の倍率）として、既存の戦力計算（milMult・strength）に接続される。
//   上限: ドクトリンによる攻撃の増分は +25%、防御は +40% まで（極端な一強にならないように）。
import { byState } from "../../civ/spatial.js";
import { makeEvent } from "../../civ/events.js";
import { effective } from "./effective.js";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const has = (st, k) => st.techAdopted?.[k] != null;
export const UNIT_KINDS = Object.freeze({
  infantry: { ja: "歩兵", need: () => true }, ranged: { ja: "弓・投射兵", need: (st) => has(st, "bronze_weapons") }, cavalry: { ja: "騎兵", need: (st) => has(st, "horse_riding") || has(st, "cavalry") },
  navy: { ja: "水軍", need: (st, ctx) => has(st, "shipbuilding") && coastal(ctx, st) }, garrison: { ja: "守備兵", need: (st) => has(st, "fortification") }, firearms: { ja: "銃兵", need: (st) => has(st, "gunpowder") },
});
const coastal = (ctx, st) => (byState(ctx).get(st.id) ?? []).some((g) => ctx.world.cell.coastDist[g.cell] <= 1);
const shareOf = (ctx, st) => {
  const gs = byState(ctx).get(st.id) ?? [], pastoral = gs.length ? gs.filter((g) => g.subsistence === "pastoral").length / gs.length : 0, w = {};
  for (const [k, def] of Object.entries(UNIT_KINDS)) if (def.need(st, ctx)) w[k] = k === "infantry" ? 1 : k === "ranged" ? 0.25 : k === "cavalry" ? 0.2 + 0.5 * pastoral : k === "navy" ? 0.15 : k === "garrison" ? 0.1 : 0.4;
  if (w.firearms) { delete w.ranged; } const tot = Object.values(w).reduce((a, b) => a + b, 0); for (const k in w) w[k] /= tot; return w;
};

/** ドクトリン。共通 20（技術・前提の連鎖）と、政体固有 10。effect: off=攻撃倍率の増分, def=防御の増分 */
const D = (id, ja, tier, prereq, tech, cost, off, def, polity = null) => ({ id, ja, tier, prereq, tech, cost, off, def, polity });
export const DOCTRINES = Object.freeze([
  D("levy_drill", "徴集兵の訓練", 1, [], [], 20, 0.03, 0.02), D("shield_wall", "盾の壁", 1, [], [], 25, 0, 0.06), D("skirmish", "散兵戦", 1, [], [], 25, 0.04, 0),
  D("ranged_volley", "斉射", 2, ["skirmish"], ["bronze_weapons"], 50, 0.05, 0), D("spear_phalanx", "密集槍陣", 2, ["shield_wall"], ["bronze_weapons"], 55, 0.04, 0.05),
  D("scout_screen", "斥候網", 1, [], [], 20, 0.02, 0.02), D("fortified_camp", "野営築城", 2, ["shield_wall"], ["fortification"], 60, 0, 0.08),
  D("mounted_charge", "騎兵突撃", 2, ["skirmish"], ["horse_riding"], 70, 0.07, 0), D("horse_archery", "騎射", 3, ["mounted_charge", "ranged_volley"], ["horse_riding"], 100, 0.06, 0),
  D("heavy_infantry", "重装歩兵", 3, ["spear_phalanx"], ["iron_weapons"], 110, 0.06, 0.04), D("siege_craft", "攻城術", 3, ["fortified_camp"], ["construction", "iron_weapons"], 120, 0.05, 0),
  D("combined_arms", "諸兵科連合", 4, ["heavy_infantry", "mounted_charge"], [], 180, 0.07, 0.03), D("supply_train", "補給線の整備", 2, ["scout_screen"], ["construction"], 70, 0.03, 0.03),
  D("naval_marines", "海兵", 3, ["scout_screen"], ["shipbuilding"], 110, 0.05, 0.02), D("coast_defense", "沿岸防衛", 3, ["fortified_camp"], ["shipbuilding"], 100, 0, 0.07),
  D("standing_army", "常備軍", 4, ["levy_drill", "supply_train"], ["administration"], 200, 0.06, 0.04), D("officer_corps", "将校団", 4, ["standing_army"], ["writing"], 220, 0.05, 0.03),
  D("gun_line", "線形戦列", 5, ["combined_arms"], ["gunpowder"], 300, 0.09, 0.03), D("bastion_forts", "稜堡式築城", 5, ["siege_craft", "supply_train"], ["gunpowder"], 320, 0, 0.1), D("general_staff", "参謀組織", 5, ["officer_corps"], ["mathematics"], 350, 0.06, 0.04),
  // 政体固有
  D("raid_tactics", "襲撃戦術", 1, [], [], 25, 0.05, 0, "tribal"), D("warband_bond", "戦士団の絆", 2, ["raid_tactics"], [], 45, 0.05, 0.02, "tribal"),
  D("sworn_retinue", "誓約の近侍", 2, [], [], 50, 0.04, 0.03, "chiefdom"), D("holy_war", "聖戦の教え", 2, [], [], 60, 0.07, 0, "theocracy"), D("temple_guard", "神殿守護", 3, ["holy_war"], ["construction"], 90, 0.02, 0.08, "theocracy"),
  D("feudal_levy", "封建軍役", 2, [], [], 55, 0.05, 0.03, "kingdom"), D("knight_order", "騎士団", 3, ["feudal_levy"], ["horse_riding"], 120, 0.08, 0.02, "kingdom"),
  D("legion_system", "軍団制", 3, [], ["iron_weapons"], 130, 0.07, 0.05, "empire"), D("citizen_militia", "市民皆兵", 2, [], [], 55, 0.02, 0.07, "republic"), D("naval_league", "海上同盟", 3, [], ["shipbuilding"], 110, 0.05, 0.05, "republic"),
]);
export const DOCTRINE = Object.freeze(Object.fromEntries(DOCTRINES.map((d) => [d.id, d])));
export const OFF_CAP = 0.25, DEF_CAP = 0.4;

export const initMilitary = () => ({ units: [], equipLevel: 0.3, readiness: 0.5, doctrine: { taken: {} }, shares: null });
/** 取れるか。理由つき */
export function canAdopt(st, id) {
  const d = DOCTRINE[id]; if (!d) return { ok: false, reason: "そのドクトリンはありません" }; const M = st.military; if (M?.doctrine.taken[id] != null) return { ok: false, reason: "すでに取得済み" };
  if (d.polity && d.polity !== st.polity) return { ok: false, reason: `${d.ja}は政体「${d.polity}」固有` };
  for (const p of d.prereq) if (M?.doctrine.taken[p] == null) return { ok: false, reason: `前提のドクトリン「${DOCTRINE[p].ja}」が未取得` };
  for (const t of d.tech) if (!has(st, t)) return { ok: false, reason: `技術「${t}」が必要` };
  if (st.treasury < d.cost) return { ok: false, reason: `財政が足りない（${d.cost}）` };
  return { ok: true };
}
export function adoptDoctrine(ctx, st, id, { provenance = "simulation", decisionId = null } = {}) {
  const c = canAdopt(st, id); if (!c.ok) return c; const { civ, ids } = ctx, d = DOCTRINE[id]; const M = (st.military ??= initMilitary());
  st.treasury -= d.cost; M.doctrine.taken[id] = civ.monthIndex;
  const ev = makeEvent(civ, ids, { kind: "doctrine_adopted", title: `${st.name}が「${d.ja}」を取り入れた`, participants: [{ entityId: st.id, role: "state" }], effects: [{ targetId: st.id, property: "military.doctrine", before: null, after: id }], provenance, decisionId });
  recompute(ctx, st); return { ok: true, eventId: ev?.eventId ?? null };
}
const activeDoctrines = (st) => Object.keys(st.military?.doctrine.taken ?? {}).map((i) => DOCTRINE[i]).filter((d) => d && (!d.polity || d.polity === st.polity));
function recompute(ctx, st) {
  const M = st.military, ind = effective(ctx.civ, st, "perCapita"), wTech = (has(st, "bronze_weapons") ? 0.08 : 0) + (has(st, "iron_weapons") ? 0.12 : 0) + (has(st, "steel") ? 0.05 : 0) + (has(st, "gunpowder") ? 0.1 : 0);
  M.equipLevel = clamp(0.15 + 0.35 * clamp(ind / 1.6) + wTech + (st.treasury > 0 ? 0.1 : -0.1) + 0.1 * (st.econ?.investment ?? 0), 0, 1);
  M.readiness = clamp(0.5 * st.stability + 0.3 * (st.treasury >= 0 ? 1 : 0) + 0.2 * (1 - (st.politics ? effective(ctx.civ, st, "fatigue") : 0)), 0, 1);
  const ds = activeDoctrines(st), off = clamp(ds.reduce((s, d) => s + d.off, 0), 0, OFF_CAP), def = clamp(ds.reduce((s, d) => s + d.def, 0), 0, DEF_CAP);
  const eqE = effective(ctx.civ, st, "equipLevel"), rdE = effective(ctx.civ, st, "readiness"); // 介入があれば有効値（通常値＋補正）で軍事能力を決める
  st.milBonus = Math.round(clamp(0.35 * (eqE - 0.3) + 0.15 * (rdE - 0.5) + off, -0.6, 0.6) * 1000) / 1000; st.milDef = Math.round(def * 1000) / 1000;
}
/** 月次（3か月ごと）: 総兵力を部隊に分け、装備・練度・軍事能力を更新 */
export function stepMilitary(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex; if (!civ.options.wcde || mi % 3 !== 0) return;
  for (const st of Object.values(civ.states)) {
    if (!st.alive) continue; const M = (st.military ??= initMilitary()); recompute(ctx, st);
    const shares = M.shares && Object.keys(M.shares).every((k) => UNIT_KINDS[k]?.need(st, ctx)) ? M.shares : shareOf(ctx, st); if (M.shares && shares !== M.shares) M.shares = null; // 使えなくなった編制は自動の配分へ戻る
    const old = new Map(M.units.map((u) => [u.kind, u])), next = [];
    for (const [k, sh] of Object.entries(shares)) {
      const u = old.get(k) ?? { id: ids.next("unit"), kind: k, name: `${st.name}の${UNIT_KINDS[k].ja}`, since: mi };
      u.size = Math.round(st.army * sh * 10) / 10; u.equip = Math.round(clamp(effective(ctx.civ, st, "equipLevel") + (k === "firearms" ? 0.1 : k === "cavalry" ? 0.03 : 0)) * 100) / 100; u.readiness = Math.round(effective(ctx.civ, st, "readiness") * 100) / 100; next.push(u);
    }
    M.units = next; M.armyBasis = st.army; // 部隊は、この時点の総兵力の配分（兵力はその後の月で変わる）
  }
}
/** 部隊編制の変更（プレイヤー・創造主の命令）。使える種類だけ・配分の合計が1・費用を払える */
export function reorganize(ctx, st, shares) {
  const sum = Object.values(shares).reduce((a, b) => a + b, 0); if (Math.abs(sum - 1) > 0.01) return { ok: false, reason: "配分の合計は 1" };
  for (const [k, v] of Object.entries(shares)) { if (!UNIT_KINDS[k]) return { ok: false, reason: `未知の部隊 ${k}` }; if (!(v >= 0)) return { ok: false, reason: "配分は 0 以上" }; if (v > 0 && !UNIT_KINDS[k].need(st, ctx)) return { ok: false, reason: `${UNIT_KINDS[k].ja}は今の技術・地理では編制できない` }; }
  const cost = Math.round(st.army * 0.002 * 10) / 10; if (st.treasury < cost) return { ok: false, reason: `再編の費用 ${cost} が足りない` };
  st.treasury -= cost; (st.military ??= initMilitary()).shares = Object.fromEntries(Object.entries(shares).filter(([, v]) => v > 0)); stepMilitaryNow(ctx, st); return { ok: true, cost };
}
function stepMilitaryNow(ctx, st) { const mi = ctx.civ.monthIndex; const prev = ctx.civ.monthIndex; ctx.civ.monthIndex = mi - (mi % 3); const only = (s) => s; try { const states = ctx.civ.states; const keep = Object.values(states).filter((s) => s !== st).map((s) => [s, s.alive]); for (const [s] of keep) s.alive = false; stepMilitary(ctx); for (const [s, a] of keep) s.alive = a; } finally { ctx.civ.monthIndex = prev; } }

