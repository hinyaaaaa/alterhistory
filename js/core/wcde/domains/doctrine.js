// v6.1.0 M6: 軍事ドクトリン。仕様 §8.1。
//   構成は「共通の基幹 5 系統」＋「その国家固有の 3 系統」。各系統は上から下へ段階（tier）を降りる縦の鎖で、各ノードの前提は同じ系統の一つ上（と、あれば他系統の一つ）。
//   ・共通 5 系統: 陸戦（infantry）／機動（mobility）／防衛・築城（defense）／兵站・組織（logistics）／海洋（sea）。
//   ・固有 3 系統: 政体・社会（支持勢力の影響力）・地形・過去の戦争経験・技術から、テンプレートの得点で選ぶ。全国家に同じ固定名を与えない。年 1 回見直し、直近に選んだ系統は選ばれやすい（ふらつき防止）。
//   ・効果は攻撃・防御だけではない。fx: off=攻撃 def=防御 logi=補給の届く範囲 attr=損耗の軽減 naval=海軍運用 siege=攻城 adapt=戦場適応（地形・奇襲） coh=士気の結束 landing=上陸。
//   ・取得に研究点・研究キューは使わない。条件（技術の制度化・政体・系統の前提・財政）を満たす選択可能な方針を選ぶ操作。
//   ・上限: 全体の上限（CAP）と、一つの系統が出せる寄与の上限（CAP × BRANCH_SHARE）。単一の系統の一強化を避ける。
import { BIOMES } from "../../civ/world-consts.js";
import { byState } from "../../civ/spatial.js";

export const FX_KEYS = Object.freeze(["off", "def", "logi", "attr", "naval", "siege", "adapt", "coh", "landing", "armor", "air", "subs", "strike"]);
export const CAP = Object.freeze({ off: 0.25, def: 0.4, logi: 0.3, attr: 0.25, naval: 0.35, siege: 0.3, adapt: 0.2, coh: 0.25, landing: 0.25, armor: 0.3, air: 0.35, subs: 0.3, strike: 0.3 });
export const BRANCH_SHARE = 0.6;
export const FX_JA = Object.freeze({ off: "攻撃", def: "防御", logi: "補給", attr: "損耗軽減", naval: "海軍運用", siege: "攻城", adapt: "戦場適応", coh: "士気の結束", landing: "上陸", armor: "機甲運用", air: "航空運用", subs: "潜水運用", strike: "打撃力" });

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

// ---- v6.13.0: 軍の学派（HoI4 のドクトリンと同じ作り）。陸・海・空の 3 軍それぞれが、路線（学派）を 1 つ選び、6 段の鎖を下りる。
//   ・学派は軍ごとに排他（陸の「機動戦」を選んだら、同じ陸の「火力優勢」は取れない）。取った段は記録に残る。
//   ・段が進むほど、近代〜現代〜未来の技術（機関銃・戦車・空母・ステルス・自律兵器…）が要る。効果には小さな欠点（補給・損耗）が付く路線もある。
//   ・選んだ学派は、兵種の自動配分（orbat.js）に出る（機動戦なら機甲・機械化が増える）。6 段そろえると、熟達の小さな加算（攻 2%・守 2%・結束 3%）。
//   ・効果の種類は、基幹と同じ FX_KEYS（armor=機甲運用・air=航空運用・subs=潜水運用・strike=打撃力 を新設）。上限 CAP と、系統ごとの寄与の上限は、基幹と同じ仕組みで効く。
const SC = (id, service, ja, desc, tiers) => ({ id, service, ja, desc, tiers });
const ST_ = (ja, tech, cost, fx) => ({ ja, tech, cost, fx });
export const SCHOOLS = Object.freeze([
  SC("firepower", "land", "火力優勢", "砲と火力で敵を削り、味方の損耗を抑える。", [
    ST_("火力の集中", ["firearms"], 280, { off: 0.03, siege: 0.04 }), ST_("砲兵の組織化", ["artillery", "pike_and_shot"], 420, { off: 0.04, siege: 0.06, attr: 0.02 }), ST_("弾幕射撃", ["howitzer"], 600, { off: 0.05, def: 0.03, attr: 0.03 }),
    ST_("制圧射撃", ["machine_gun"], 760, { def: 0.06, off: 0.03 }), ST_("精密火力", ["guided_munitions"], 900, { off: 0.06, siege: 0.06, attr: 0.03 }), ST_("網でつなぐ火力", ["network_warfare"], 1100, { off: 0.05, coh: 0.04, adapt: 0.03 })]),
  SC("mass", "land", "大衆動員", "兵の数と士気で押す。補給と損耗が重くなる。", [
    ST_("大衆の動員", ["firearms"], 260, { off: 0.03, coh: 0.03, logi: -0.02 }), ST_("徴兵と予備役", ["conscription"], 400, { off: 0.04, coh: 0.04, attr: -0.02 }), ST_("人海の突撃", ["breech_loading"], 560, { off: 0.06, coh: 0.03, attr: -0.04 }),
    ST_("総力戦体制", ["machine_gun", "railway"], 740, { logi: 0.06, def: 0.04, coh: 0.04 }), ST_("全国民の防衛", ["anti_tank"], 880, { def: 0.08, coh: 0.05 }), ST_("動員の自動化", ["network_warfare"], 1100, { logi: 0.06, off: 0.04, coh: 0.03 })]),
  SC("battle_plan", "land", "作戦計画", "参謀が練った計画で、軍を精密に動かす。", [
    ST_("計画された作戦", ["standing_army", "firearms"], 280, { coh: 0.03, logi: 0.03 }), ST_("参謀本部の拡充", ["pike_and_shot"], 420, { off: 0.03, def: 0.03, coh: 0.03 }), ST_("鉄道動員計画", ["railway"], 580, { logi: 0.08, off: 0.03 }),
    ST_("作戦術", ["howitzer", "machine_gun"], 760, { off: 0.05, def: 0.04, adapt: 0.03 }), ST_("統合指揮", ["network_warfare"], 900, { coh: 0.06, logi: 0.05, adapt: 0.03 }), ST_("全域作戦", ["drone_warfare"], 1100, { off: 0.05, def: 0.04, adapt: 0.05 })]),
  SC("mobile", "land", "機動戦", "機甲と機械化で、敵の防御を突き抜ける。", [
    ST_("騎兵と機動", ["firearms", "horse_riding"], 280, { adapt: 0.04, off: 0.03 }), ST_("自動車化", ["motor_vehicle"], 440, { logi: 0.05, adapt: 0.03 }), ST_("装甲突破", ["tank"], 640, { off: 0.07, adapt: 0.04, armor: 0.06 }),
    ST_("電撃戦", ["motorized_infantry", "radio"], 820, { off: 0.06, adapt: 0.05, armor: 0.06, def: -0.02 }), ST_("縦深突破", ["network_warfare"], 960, { off: 0.06, adapt: 0.05, logi: 0.04, armor: 0.05 }), ST_("自律機動", ["autonomous_systems"], 1200, { off: 0.06, adapt: 0.05, armor: 0.06 })]),
  SC("decisive", "sea", "艦隊決戦", "主力艦を揃え、敵の艦隊を一戦で決する。", [
    ST_("戦列の砲戦", ["ship_of_the_line"], 300, { naval: 0.06, off: 0.02 }), ST_("装甲艦の運用", ["ironclad"], 440, { naval: 0.06, off: 0.03 }), ST_("大口径砲の統制", ["dreadnought"], 640, { naval: 0.08, off: 0.04, def: 0.02 }),
    ST_("電波による索敵", ["radar_sonar"], 780, { naval: 0.06, adapt: 0.03 }), ST_("ミサイル戦", ["guided_missiles"], 920, { naval: 0.06, off: 0.05 }), ST_("指向性の防御", ["directed_energy"], 1100, { naval: 0.06, def: 0.05 })]),
  SC("interdiction", "sea", "通商破壊", "潜水艦と護衛で、敵の補給と交易を断つ。", [
    ST_("私掠と巡航", ["ship_of_the_line"], 300, { naval: 0.04, logi: 0.02 }), ST_("魚雷の運用", ["torpedo"], 440, { naval: 0.05, subs: 0.06 }), ST_("潜水艦戦", ["submarine"], 640, { subs: 0.1, naval: 0.04 }),
    ST_("音による探知", ["radar_sonar"], 780, { subs: 0.06, def: 0.03 }), ST_("長期潜航", ["nuclear_propulsion"], 920, { subs: 0.08, naval: 0.04, logi: 0.04 }), ST_("無人の潜航体", ["autonomous_systems"], 1100, { subs: 0.08, naval: 0.05 })]),
  SC("base_strike", "sea", "空母打撃", "空母と上陸戦力で、海から陸を叩く。", [
    ST_("沿岸への砲撃", ["ship_of_the_line"], 300, { landing: 0.04, naval: 0.03 }), ST_("上陸の準備", ["ironclad"], 440, { landing: 0.05, logi: 0.03 }), ST_("空母機動部隊", ["aircraft_carrier"], 700, { air: 0.06, naval: 0.05, strike: 0.04 }),
    ST_("水陸両用戦", ["amphibious_assault"], 820, { landing: 0.1, off: 0.03 }), ST_("遠距離の打撃", ["stealth"], 940, { strike: 0.07, air: 0.05 }), ST_("極超音速の打撃", ["hypersonic_weapons"], 1100, { strike: 0.08, naval: 0.04 })]),
  SC("superiority", "air", "制空", "空の主導権を握り、陸と海を守る。", [
    ST_("空の偵察", ["military_aviation"], 320, { air: 0.05 }), ST_("戦闘機の編隊", ["fighter_aircraft"], 460, { air: 0.06, def: 0.02 }), ST_("防空と迎撃", ["radar_sonar"], 640, { air: 0.06, adapt: 0.03 }),
    ST_("ジェットの時代", ["jet_engine"], 800, { air: 0.07 }), ST_("ステルス優位", ["stealth"], 960, { air: 0.07, off: 0.03 }), ST_("宇宙からの制空", ["orbital_warfare"], 1150, { air: 0.06, def: 0.04 })]),
  SC("strategic", "air", "戦略爆撃", "後方の工業と都市を叩き、戦争の継続力を奪う。", [
    ST_("爆撃の構想", ["military_aviation"], 320, { air: 0.03, strike: 0.03 }), ST_("重爆撃", ["bomber_aircraft"], 480, { strike: 0.07, siege: 0.05 }), ST_("高高度の爆撃", ["jet_engine"], 660, { strike: 0.07, siege: 0.05 }),
    ST_("弾道ミサイル", ["ballistic_missile"], 820, { strike: 0.08, def: 0.03 }), ST_("核の抑止", ["nuclear_arsenal"], 980, { strike: 0.08, def: 0.06 }), ST_("極超音速の打撃", ["hypersonic_weapons"], 1150, { strike: 0.08, off: 0.04 })]),
  SC("support", "air", "戦場支援", "地上軍に寄り添い、近接の航空支援と偵察を提供する。", [
    ST_("観測と連絡", ["military_aviation"], 320, { air: 0.03, adapt: 0.03 }), ST_("近接支援", ["fighter_aircraft"], 460, { air: 0.04, off: 0.03, adapt: 0.03 }), ST_("空中機動", ["helicopter"], 640, { off: 0.05, adapt: 0.04 }),
    ST_("誘導兵器の支援", ["guided_munitions"], 800, { off: 0.06, siege: 0.04, air: 0.04 }), ST_("無人機の群れ", ["drone_warfare"], 960, { off: 0.05, air: 0.05, attr: 0.03 }), ST_("自律する支援", ["autonomous_systems"], 1150, { off: 0.06, air: 0.05, adapt: 0.04 })]),
]);
export const SCHOOL_BY_ID = Object.freeze(Object.fromEntries(SCHOOLS.map((s) => [s.id, s])));
/** 学派のノード（学派 × 6 段）。id は "<軍>:<学派>:<段>"。固有の系統（special）とは別 */
export const SCHOOL_NODES = Object.freeze(SCHOOLS.flatMap((s) => s.tiers.map((x, i) => Object.freeze({ id: `${s.service}:${s.id}:${i + 1}`, ja: x.ja, branch: `${s.service}:${s.id}`, tier: i + 1, prereq: i ? [`${s.service}:${s.id}:${i}`] : [], tech: x.tech, cost: x.cost, fx: x.fx, special: false, service: s.service, school: s.id }))));
export const SCHOOL_NODE_BY_ID = Object.freeze(Object.fromEntries(SCHOOL_NODES.map((d) => [d.id, d])));
export const SERVICE_JA = Object.freeze({ land: "陸軍", sea: "海軍", air: "空軍" });

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

/** その国家で使える（定義されている）ノードの一覧: 基幹 25 ＋ 学派 60（陸 4・海 3・空 3 の路線 × 6 段）＋ 固有 9。UI の木・取得の検証・AI の候補はすべてここから導く */
export const nodesOf = (st) => [...COMMON_NODES, ...SCHOOL_NODES, ...(st.military?.special ?? []).flatMap((b) => b.nodes)];
export const nodeOf = (st, id) => COMMON_BY_ID[id] ?? SCHOOL_NODE_BY_ID[id] ?? (st.military?.special ?? []).flatMap((b) => b.nodes).find((n) => n.id === id) ?? null;
export const branchesOf = (st) => [...COMMON_BRANCHES.map((b) => ({ ...b, special: false })), ...SCHOOLS.map((s) => ({ id: `${s.service}:${s.id}`, ja: `${SERVICE_JA[s.service]}・${s.ja}`, special: false, service: s.service, school: s.id, desc: s.desc })), ...(st.military?.special ?? []).map((b) => ({ id: `sp:${b.key}`, ja: b.ja, special: true }))];

/** 取得済みのうち、今の国家で有効なもの（固有の系統が入れ替わると、前の系統のノードは休眠して効かない） */
export function activeNodes(st) {
  const taken = st.military?.doctrine?.taken ?? {}, sp = new Set((st.military?.special ?? []).map((b) => `sp:${b.key}`)), out = [];
  for (const id in taken) { const n = nodeOf(st, id); if (n && (!n.special || sp.has(n.branch))) out.push(n); }
  return out;
}
/** 学派を 6 段そろえたときの熟達（小さな加算） */
const MASTERY = Object.freeze({ off: 0.02, def: 0.02, coh: 0.03 });
export const masteredSchools = (st) => { const taken = st.military?.doctrine?.taken ?? {}; return SCHOOLS.filter((s) => s.tiers.every((_, i) => taken[`${s.service}:${s.id}:${i + 1}`] != null)); };
/** 効果の集計。系統ごとの寄与は CAP × BRANCH_SHARE まで、全体は CAP まで（欠点の側は、CAP の半分まで） */
export function doctrineFx(st) {
  const by = new Map(); for (const n of activeNodes(st)) { const m = by.get(n.branch) ?? by.set(n.branch, {}).get(n.branch); for (const k in n.fx) m[k] = (m[k] ?? 0) + n.fx[k]; }
  const out = Object.fromEntries(FX_KEYS.map((k) => [k, 0]));
  for (const m of by.values()) for (const k in m) if (k in out) out[k] += Math.min(m[k], CAP[k] * BRANCH_SHARE);
  for (const s of masteredSchools(st)) for (const k in MASTERY) out[k] += MASTERY[k];
  for (const k of FX_KEYS) out[k] = Math.round(Math.max(-CAP[k] * 0.5, Math.min(out[k], CAP[k])) * 1000) / 1000; return out;
}
