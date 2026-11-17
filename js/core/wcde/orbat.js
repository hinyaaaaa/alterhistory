// v6.13.0: 軍制（Order of Battle）。陸・海・空の 3 軍と、各軍の兵種ごとの「人数」を扱う。
//   ・編成は比率（%）ではなく、兵種ごとの人数。自動（技術・地理・ドクトリンから決める）か、手動（兵種ごとに人数を指定）。
//   ・総兵力の正本は、これまでどおり国家の st.army。手動の指定が総兵力より多ければ、比例して縮め、少なければ、残りは予備役（徴集民兵）になる。
//   ・兵種の解禁は、技術ツリー（techtree.js）の技術のキーから導く（陸の機甲・砲兵、海の戦艦・潜水艦・空母、空の戦闘機・爆撃機・ミサイル・サイバー・軌道）。
//   ・アルゴリズム国家も担当国も、同じ関数を通る（世界の較正を保つため、古い時代の重みは従来の配分と同じ）。
import { byState } from "../civ/spatial.js";
import { stateCan } from "../civ/tech.js";

const has = (st, k) => st.techAdopted?.[k] != null;
const can = (ctx, st, cap) => stateCan(ctx.civ, st, cap);
const coastal = (ctx, st) => (byState(ctx).get(st.id) ?? []).some((g) => ctx.world.cell.coastDist[g.cell] <= 1);

/** 3 軍。formation=その軍の部隊の呼び名。ranks=指揮官の階級（能力の低い順） */
export const SERVICES = Object.freeze({
  land: { ja: "陸軍", formation: "軍団", chief: "陸軍総司令官", color: "#9fbf8a", ranks: ["隊長", "将軍", "大将", "元帥"] },
  sea: { ja: "海軍", formation: "艦隊", chief: "海軍総司令官", color: "#6fa8c9", ranks: ["艦長", "提督", "大提督", "元帥提督"] },
  air: { ja: "空軍", formation: "航空軍", chief: "空軍総司令官", color: "#c9b36f", ranks: ["航空隊長", "空将", "空軍大将", "空軍元帥"] },
  space: { ja: "宇宙軍", formation: "軌道軍", chief: "宇宙軍総司令官", color: "#b58bd0", ranks: ["管制官", "宙将", "宙軍大将", "宙軍元帥"] },
});
export const SERVICE_KEYS = Object.freeze(["land", "sea", "air", "space"]);

const T = (id, service, ja, need, terms, o = {}) => [id, { id, service, ja, need, terms, item: o.item ?? null, per: o.per ?? 0, hint: o.hint ?? "" }];
/** 兵種。terms=[[技術のキー, 名前]...]（上から最初に当てはまるものが名前になる。null は常に当てはまる） */
export const UNIT_TYPES = Object.freeze(Object.fromEntries([
  // ---- 陸軍
  T("infantry", "land", "歩兵", () => true, [["network_warfare", "現代歩兵師団"], ["breech_loading", "近代歩兵師団"], ["gunpowder", "線列歩兵団"], ["steel", "精鋭歩兵団"], ["iron_weapons", "重装歩兵団"], ["bronze_weapons", "槍兵団"], [null, "戦士団"]], { hint: "軍の主力。安く、数が出せる" }),
  T("levy", "land", "予備役・民兵", () => true, [["conscription", "予備役団"], [null, "徴集民兵団"]], { hint: "数合わせ。弱いが守りには粘る" }),
  T("ranged", "land", "弓・投射兵", (st, ctx) => can(ctx, st, "unit:ranged") && !has(st, "breech_loading"), [["crossbow", "弩兵団"], ["steel", "弩兵団"], ["bronze_weapons", "弓兵団"], [null, "投射兵団"]], { hint: "後方から削る" }),
  T("cavalry", "land", "騎兵", (st, ctx) => can(ctx, st, "unit:cavalry"), [["gunpowder", "胸甲騎兵団"], ["iron_weapons", "重騎兵団"], [null, "騎馬隊"]], { hint: "機動と追撃" }),
  T("garrison", "land", "守備兵", (st, ctx) => can(ctx, st, "unit:garrison"), [["fortification", "城塞守備軍"], [null, "守備隊"]], { hint: "守りに強い。攻めには向かない" }),
  T("firearms", "land", "銃兵", (st, ctx) => can(ctx, st, "unit:firearms") && !has(st, "breech_loading"), [["steel", "近衛銃兵団"], [null, "銃兵団"]], { hint: "火力で押す" }),
  T("artillery", "land", "砲兵", (st) => has(st, "artillery"), [["guided_munitions", "誘導砲兵団"], ["howitzer", "野戦砲兵団"], [null, "砲兵団"]], { hint: "城攻めと火力支援" }),
  T("armor", "land", "機甲", (st) => has(st, "tank"), [["network_warfare", "機甲旅団"], [null, "戦車団"]], { hint: "突破と機動。対戦車兵器に弱い" }),
  T("mechanized", "land", "機械化歩兵", (st) => has(st, "motorized_infantry"), [[null, "機械化歩兵団"]], { hint: "戦車に随伴する歩兵" }),
  T("special", "land", "特殊部隊", (st) => has(st, "special_forces"), [["power_armor", "特殊作戦群"], [null, "特殊部隊"]], { hint: "少数精鋭。奇襲と破壊" }),
  T("marine", "land", "海兵", (st, ctx) => has(st, "amphibious_assault") && coastal(ctx, st), [[null, "海兵隊"]], { hint: "上陸作戦" }),
  T("powered", "land", "強化装甲兵", (st) => has(st, "power_armor"), [[null, "強化外骨格兵団"]], { hint: "未来の歩兵" }),
  T("autonomous", "land", "自律戦闘群", (st) => has(st, "autonomous_systems"), [[null, "自律戦闘群"]], { hint: "未来の無人地上戦力" }),
  // ---- 海軍（人数＝乗員の数。item は艦 1 隻あたりの人数の目安）
  T("navy", "sea", "水上艦隊", (st, ctx) => can(ctx, st, "unit:navy") && coastal(ctx, st), [["guided_missiles", "ミサイル護衛艦隊"], ["steamship", "蒸気艦隊"], ["gunpowder", "大艦隊"], ["naval_warfare", "艦隊"], [null, "舟軍"]], { item: "隻", per: 120, hint: "護衛・哨戒・主力" }),
  T("capital_ship", "sea", "主力艦", (st, ctx) => has(st, "ship_of_the_line") && coastal(ctx, st), [["dreadnought", "戦艦戦隊"], ["ironclad", "装甲艦戦隊"], [null, "戦列艦隊"]], { item: "隻", per: 900, hint: "艦隊決戦の主力" }),
  T("submarine", "sea", "潜水艦", (st, ctx) => has(st, "submarine") && coastal(ctx, st), [["nuclear_propulsion", "原潜部隊"], [null, "潜水艦隊"]], { item: "隻", per: 90, hint: "通商破壊と待ち伏せ" }),
  T("carrier", "sea", "空母", (st, ctx) => has(st, "aircraft_carrier") && coastal(ctx, st), [[null, "空母機動部隊"]], { item: "隻", per: 2800, hint: "航空戦力を海へ運ぶ" }),
  // ---- 空軍（人数＝搭乗員と地上要員。item は 1 機あたりの人数の目安）
  T("air_corps", "air", "初期航空隊", (st) => has(st, "military_aviation") && !has(st, "fighter_aircraft"), [[null, "航空隊"]], { item: "機", per: 14, hint: "偵察と観測" }),
  T("fighter", "air", "戦闘機", (st) => has(st, "fighter_aircraft"), [["stealth", "ステルス戦闘航空団"], ["jet_engine", "ジェット戦闘航空団"], [null, "戦闘航空団"]], { item: "機", per: 10, hint: "制空。敵の航空戦力を落とす" }),
  T("bomber", "air", "爆撃機", (st) => has(st, "bomber_aircraft"), [["jet_engine", "ジェット爆撃航空団"], [null, "爆撃航空団"]], { item: "機", per: 26, hint: "地上・港・工業を叩く" }),
  T("helicopter", "air", "ヘリコプター", (st) => has(st, "helicopter"), [[null, "航空機動団"]], { item: "機", per: 14, hint: "空中機動・近接支援" }),
  T("drone", "air", "無人機", (st) => has(st, "drone_warfare"), [[null, "無人機部隊"]], { item: "機", per: 6, hint: "偵察と精密打撃" }),
  T("missile", "air", "ミサイル", (st) => has(st, "guided_missiles"), [[null, "ミサイル旅団"]], { item: "基", per: 30, hint: "遠距離の精密打撃" }),
  T("strategic", "air", "戦略ロケット", (st) => has(st, "ballistic_missile"), [["nuclear_arsenal", "戦略核ロケット軍"], [null, "戦略ロケット軍"]], { item: "基", per: 45, hint: "抑止。国の守りを固める" }),
  T("cyber", "air", "サイバー", (st) => has(st, "cyber_warfare"), [["cognitive_warfare", "情報・認知戦軍"], [null, "サイバー軍"]], { hint: "情報網の防御と撹乱" }),
  // ---- 宇宙軍（v6.18.0。人数＝運用要員）
  T("satellite", "space", "衛星網", (st) => has(st, "satellites"), [[null, "衛星運用軍"]], { item: "基", per: 12, hint: "偵察・通信・測位。陸海空の戦いを支える" }),
  T("orbital", "space", "軌道戦力", (st) => has(st, "orbital_warfare"), [[null, "軌道軍"]], { item: "基", per: 40, hint: "軌道上の攻撃・防衛・迎撃" }),
]));
export const serviceOf = (kind) => UNIT_TYPES[kind]?.service ?? "land";
const KEYS = Object.keys(UNIT_TYPES);

/** 部隊の名前（技術に合わせて改まる）。ドクトリンの傾き（攻め・守り）が冠になる */
export function unitTerm(st, kind) {
  const T0 = UNIT_TYPES[kind]; if (!T0) return kind;
  for (const [k, t] of T0.terms) if (k == null || has(st, k)) return t;
  return T0.ja;
}
export function unitName(st, kind) {
  const fx = st.military?.fx ?? {}, tag = kind === "navy" || serviceOf(kind) !== "land" ? "" : (fx.off ?? 0) >= 0.06 && (fx.off ?? 0) >= (fx.def ?? 0) ? "突撃" : (fx.def ?? 0) >= 0.08 ? "堅陣" : "";
  return `${tag}${unitTerm(st, kind)}`;
}
/** 使える兵種（技術・地理で決まる） */
export const availableKinds = (ctx, st) => KEYS.filter((k) => UNIT_TYPES[k].need(st, ctx));
/** 艦・機・基の数の目安（表示用） */
export const itemsOf = (kind, heads) => { const t = UNIT_TYPES[kind]; return t?.per ? Math.max(1, Math.round(heads / t.per)) : null; };

// ---- 自動の配分
const sat = (x, k = 1) => Math.max(0, Math.min(1, x / k));
/** 自動配分の重み。古い時代（陸の歩兵・騎兵・守備兵・銃兵、水軍）は従来の配分と同じ。新しい兵種は、解禁されたときだけ重みを持つ。
 *  学派（陸・海・空のドクトリンの選択）は、その傾きの兵種の重みを上げる（HoI4 のドクトリンと同じく、選んだ路線が編成に出る） */
export function autoWeights(ctx, st) {
  const gs = byState(ctx).get(st.id) ?? [], pastoral = gs.length ? gs.filter((g) => g.subsistence === "pastoral").length / gs.length : 0, M = st.military ?? {}, w = {};
  for (const k of KEYS) if (UNIT_TYPES[k].need(st, ctx)) w[k] = 0;
  const set = (k, v) => { if (k in w) w[k] = v; };
  set("infantry", 1); set("ranged", 0.25); set("cavalry", 0.2 + 0.5 * pastoral); set("navy", 0.15); set("garrison", 0.1); set("firearms", 0.4);
  if (has(st, "breech_loading")) { w.infantry += 0.4; } // 銃兵は近代の歩兵に統合
  set("artillery", 0.2 + (has(st, "howitzer") ? 0.1 : 0)); set("armor", 0.3); set("mechanized", 0.28); set("special", 0.04); set("marine", 0.05); set("powered", 0.06); set("autonomous", 0.1);
  set("levy", has(st, "conscription") ? 0.3 : 0);
  set("capital_ship", has(st, "dreadnought") ? 0.1 : 0.07); set("submarine", 0.05); set("carrier", 0.04);
  set("air_corps", 0.08); set("fighter", 0.14); set("bomber", 0.1); set("helicopter", 0.06); set("drone", 0.05); set("missile", 0.05); set("strategic", 0.02); set("cyber", 0.02); set("satellite", 0.012); set("orbital", 0.01);
  if (w.infantry != null && has(st, "tank")) w.infantry *= 0.9; // 現代戦でも歩兵は主力のまま（機甲・砲兵・空が混ざる）
  // 系統（優先火力・高機動戦・人海戦術・陣地戦略・特殊作戦）の傾き。同じ系統が、軍ごとに違う形で編成に出る
  const bias = (k, f) => { if (k in w) w[k] *= f; }, line = M.doc?.line ?? null;
  if (line === "firepower") { bias("artillery", 2); bias("firearms", 1.3); bias("capital_ship", 1.6); bias("missile", 1.8); bias("bomber", 1.5); bias("strategic", 1.5); bias("orbital", 1.5); }
  else if (line === "mobile") { bias("armor", 2); bias("mechanized", 1.8); bias("cavalry", 1.5); bias("infantry", 0.8); bias("carrier", 1.8); bias("navy", 1.3); bias("fighter", 1.4); bias("helicopter", 1.8); }
  else if (line === "mass") { bias("infantry", 1.5); bias("levy", 2.2); bias("artillery", 0.8); bias("armor", 0.7); bias("navy", 1.8); bias("drone", 2); bias("air_corps", 1.5); bias("satellite", 1.6); }
  else if (line === "position") { bias("garrison", 2.2); bias("artillery", 1.2); bias("infantry", 0.9); bias("navy", 0.8); bias("fighter", 1.4); bias("missile", 1.3); bias("satellite", 1.4); }
  else if (line === "special") { bias("special", 4); bias("marine", 2.2); bias("submarine", 2.4); bias("cyber", 3); bias("drone", 1.6); bias("powered", 1.5); bias("orbital", 1.4); bias("infantry", 0.85); }
  // 地理・経済: 海に面していなければ海軍は小さい（使える兵種に海軍が出ないので自然に 0）。産業が小さい国は、高価な兵種（空・機甲）を控える
  const ind = sat(st.econ?.perCapita ?? 0.5, 1.6); // 1 人あたりの産出（recompute の装備水準と同じ尺度）
  for (const k of KEYS) if (k in w && w[k] > 0 && (serviceOf(k) === "air" || serviceOf(k) === "space" || k === "armor" || k === "carrier" || k === "capital_ship")) w[k] *= 0.5 + 0.7 * ind;
  return w;
}
/** 自動の人数（total を重みで割る）。小数のまま返す（合計が total に一致） */
export function autoRoster(ctx, st, total = st.army) {
  const w = autoWeights(ctx, st), tot = Object.values(w).reduce((a, b) => a + b, 0), out = {}; if (!(tot > 0) || !(total > 0)) return out;
  for (const k in w) if (w[k] > 0) out[k] = (total * w[k]) / tot; return out;
}
/** 手動の指定（兵種ごとの人数）から、今の総兵力に合わせた人数を出す。多ければ比例して縮め、少なければ残りは予備役（なければ歩兵） */
export function manualRoster(ctx, st, target, total = st.army) {
  const ok = Object.fromEntries(Object.entries(target ?? {}).filter(([k, v]) => UNIT_TYPES[k] && v > 0 && UNIT_TYPES[k].need(st, ctx))), S = Object.values(ok).reduce((a, b) => a + b, 0), out = {};
  if (!(total > 0)) return out;
  if (S >= total) { for (const k in ok) out[k] = (ok[k] * total) / S; return out; }
  for (const k in ok) out[k] = ok[k]; const rest = total - S, sink = UNIT_TYPES.levy.need(st, ctx) ? "levy" : "infantry"; out[sink] = (out[sink] ?? 0) + rest; return out;
}
/** 国家の人数の配分（自動／手動）。stepMilitary が 3 か月ごとに呼ぶ */
export function rosterOf(ctx, st) {
  const O = st.military?.orbat;
  return O?.mode === "manual" && O.target ? manualRoster(ctx, st, O.target) : autoRoster(ctx, st);
}

// ---- 軍ごとの集計（power.js・corps.js・画面が使う。部隊の一覧 st.military.units を見る）
export const headsOf = (st, service) => (st.military?.units ?? []).reduce((a, u) => a + (serviceOf(u.kind) === service ? u.size : 0), 0);
export const shareOfService = (st, service) => (st.army > 0 ? Math.max(0, Math.min(1, headsOf(st, service) / st.army)) : 0);
export const countOf = (st, kind) => (st.military?.units ?? []).find((u) => u.kind === kind)?.size ?? 0;

/** 手動の指定の検証（命令用）。ok:false なら reason */
export function validateTarget(ctx, st, heads) {
  if (!heads || typeof heads !== "object") return { ok: false, reason: "兵種ごとの人数を指定してください" };
  const out = {};
  for (const [k, v] of Object.entries(heads)) {
    if (!UNIT_TYPES[k]) return { ok: false, reason: `未知の兵種 ${k}` };
    const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0) return { ok: false, reason: "人数は 0 以上の整数" };
    if (n > 0 && !UNIT_TYPES[k].need(st, ctx)) return { ok: false, reason: `${UNIT_TYPES[k].ja}は今の技術・地理では編制できない` };
    if (n > 0) out[k] = n;
  }
  if (!Object.keys(out).length) return { ok: false, reason: "少なくとも 1 つの兵種に人数を入れてください" };
  return { ok: true, target: out };
}
