// v6.4.0: 政体と役職（v6.16.0 で 24 種）。
//   ・シミュレーション内部の政体（st.polity = tribal/chiefdom/kingdom/empire/republic/theocracy の 6 値）は変えない。
//     表示と建国で選ぶ「政体」は st.regime（15 種）で、内部の政体（core）に対応づける。
//   ・役職（st.offices）は政体ごとに選べる一覧があり、建国のとき・その後いつでも組み替えられる。
//     役職は安定度に小さく効く（分野が揃うほど。上限あり）。担当者は人名と顔を持つ。
//   ・選べる政体は、成立する集団（または国家の首都の集団）が知っている技術で絞る（WCDE の制限）。
import { groupCaps, POLITY_CAP } from "../civ/tech.js";
import { OFFICE_LISTS, MODERN_REGIMES, MODERN_EXTRA, SIMPLE_CAP } from "./offices-data.js";
import { POLITY_LIST, MIGRATE_REGIME, DEFAULT_BY_CORE } from "./polity30.js";

/** 役職: id → [表示名, 分野] 分野: ruler 元首／admin 行政／mil 軍／econ 経済／faith 信仰／law 司法／cult 文化／dipl 外交／intel 情報 */
const LEGACY_OFFICES = Object.freeze({
  chief: ["族長", "ruler"], elder_council: ["長老会議", "admin"], shaman: ["呪術師", "faith"], war_leader: ["戦士長", "mil"], hunt_master: ["狩猟長", "econ"],
  chieftain: ["首長", "ruler"], steward: ["家政長", "admin"], storyteller: ["語り部", "cult"], tribute_collector: ["貢納取立役", "econ"],
  high_priest: ["大祭司", "ruler"], temple_steward: ["神殿管理官", "admin"], oracle: ["神託官", "faith"], inquisitor: ["審問官", "law"], temple_guard: ["神殿守護長", "mil"],
  despot: ["専制君主", "ruler"], king: ["国王", "ruler"], vizier: ["宰相", "admin"], chancellor: ["大法官", "law"], marshal: ["元帥", "mil"], treasurer: ["財務長官", "econ"],
  chamberlain: ["侍従長", "admin"], court_historian: ["史官", "cult"], royal_envoy: ["王室使節", "dipl"], spymaster: ["密偵頭", "intel"], court_physician: ["侍医", "cult"],
  overlord: ["宗主王", "ruler"], duke: ["大諸侯", "admin"], constable: ["軍務長官", "mil"], bishop: ["司教", "faith"],
  emperor: ["皇帝", "ruler"], governor: ["総督", "admin"], censor: ["監察官", "law"], grand_secretary: ["大書記官長", "admin"], legion_commander: ["軍団司令官", "mil"],
  consul: ["執政官", "ruler"], senate: ["元老院議長", "admin"], tribune: ["護民官", "law"], magistrate: ["司法官", "law"], general: ["将軍", "mil"], trade_master: ["交易長官", "econ"],
  convener: ["民会議長", "ruler"], strategos: ["将軍職", "mil"], archon: ["行政官", "admin"],
  president: ["大統領", "ruler"], prime_minister: ["総理大臣", "ruler"], minister_finance: ["財務大臣", "econ"], minister_defense: ["国防大臣", "mil"], minister_interior: ["内務大臣", "admin"],
  minister_foreign: ["外務大臣", "dipl"], speaker: ["議長", "admin"], chief_justice: ["最高裁判所長官", "law"], intel_director: ["情報機関長官", "intel"], minister_culture: ["文化大臣", "cult"],
  figurehead: ["象徴の君主", "ruler"],
  party_secretary: ["党書記長", "ruler"], politburo: ["政治局員", "admin"], commissar: ["人民委員", "mil"], planner: ["計画経済官", "econ"], prosecutor: ["検察総長", "law"], propaganda: ["宣伝部長", "cult"],
  junta_chair: ["軍事評議会議長", "ruler"], security_chief: ["治安長官", "intel"], admiral: ["提督", "mil"],
  federal_chair: ["連邦議長", "ruler"], federal_envoy: ["連邦使節", "dipl"], federal_court: ["連邦裁判官", "law"],
});
export const OFFICE_DOMAIN_JA = Object.freeze({ ruler: "元首", admin: "行政", mil: "軍事", econ: "経済", faith: "信仰", law: "司法", cult: "文化", dipl: "外交", intel: "情報" });

/** 政体: id → { ja, core（内部の政体）, needs（技術）, ruler（元首の役職）, offices（選べる役職）, heredity（世襲か）, blurb } */
/** v7.1.0: 政体は polity30.js の 30 種。役職の一覧は旧い政体の一覧を元にする（offices-data.js） */
const LEGACY_REGIMES = Object.freeze(Object.fromEntries(POLITY_LIST.map((r) => [r.id, { ja: r.ja, core: r.core, needs: r.needs, ruler: "@", offices: [], heredity: r.heredity, blurb: r.blurb, center: r.center, group: r.grp, ex: r.ex, ...(r.id === "council_republic" ? { crisisOnly: true } : {}) }])));
// v6.12.0: 政体ごとに約 50 個の役職。旧版の役職（id）はそのまま残し（保存の互換）、名前と分野が同じものは同じ id を使う。新しい役職の id は「政体_番号」
const DOM = { R: "ruler", A: "admin", M: "mil", E: "econ", F: "faith", L: "law", C: "cult", D: "dipl", I: "intel" }, byKey = new Map(Object.entries(LEGACY_OFFICES).map(([id, [ja, d]]) => [`${d}:${ja}`, id]));
const GEN_OFFICES = {}, GEN_BY_REGIME = {}, TAGS = {}; // v6.21.0: TAGS = 役職 id → { b: バフの印, d: 欠点の印 }（offices-data.js の「:印」）
const parseTag = (t) => { const m = /^([stmchkdSTMCHKD])?(?:-([np$cmtb]))?$/.exec(t ?? ""); return { b: m?.[1] ?? null, d: m?.[2] ?? null }; };
for (const [rid, text0] of Object.entries(OFFICE_LISTS)) { const ids = [], seen = new Set(); let n = 0, cnt = 0; const text = MODERN_REGIMES.includes(rid) ? text0 + "\n" + MODERN_EXTRA : text0; for (const line of text.trim().split("\n")) { const [k, ...names] = line.trim().split(/\s+/); const dom = DOM[k]; for (const tok of names) { const [ja, tg] = tok.split(":"); n++; if (seen.has(ja)) continue; seen.add(ja); if (SIMPLE_CAP[rid] && ++cnt > SIMPLE_CAP[rid]) continue; const old = byKey.get(`${dom}:${ja}`), id = old ?? `${rid}_${String(n).padStart(2, "0")}`; if (!old) GEN_OFFICES[id] = [ja, dom]; if (tg != null && dom !== "ruler" && !(id in TAGS)) TAGS[id] = parseTag(tg); ids.push(id); } } GEN_BY_REGIME[rid] = ids; }
export const OFFICES = Object.freeze({ ...LEGACY_OFFICES, ...GEN_OFFICES });
export const REGIMES = Object.freeze(Object.fromEntries(Object.entries(LEGACY_REGIMES).map(([id, r]) => [id, { ...r, ruler: r.ruler === "@" ? GEN_BY_REGIME[id][0] : r.ruler, offices: [...new Set([...r.offices, ...(GEN_BY_REGIME[id] ?? [])])] }])));
export const REGIME_IDS = Object.freeze(Object.keys(REGIMES));
/** 内部の政体から、標準の政体（古い保存・AI が作った国家の表示用） */
export const DEFAULT_REGIME = DEFAULT_BY_CORE;
export const regimeOf = (st) => { // 古い保存の政体は、新しい 30 種へ移す
  let r = st.regime; if (r && !REGIMES[r] && MIGRATE_REGIME[r]) r = MIGRATE_REGIME[r];
  return r && REGIMES[r] && REGIMES[r].core === st.polity ? r : DEFAULT_REGIME[st.polity] ?? "elder_council"; }; // 内部の政体が変わったら、標準の政体に戻る
export const regimeJa = (st) => REGIMES[regimeOf(st)].ja;
export const officeJa = (id) => OFFICES[id]?.[0] ?? id;

/** その政体を選べない理由（選べるなら null）。known: 集団が知っている技術（g.tech.known）／caps: 集団の解禁 */
export function regimeGate(civ, group, id0, { crisis = false } = {}) {
  const id = canonRegime(id0);
  const r = REGIMES[id]; if (!r) return "未知の政体"; if (r.crisisOnly && !crisis) return "革命・内戦・国家崩壊のときだけ成立する"; const caps = groupCaps(civ, group);
  for (const n of r.needs) {
    if (n.startsWith("cap:")) { if (!caps.has(n.slice(4))) return `技術の解禁「${n.slice(4)}」が必要`; }
    else if (n.startsWith("tech:")) { if (group.tech.known[n.slice(5)] == null) return `技術「${n.slice(5)}」を知らない`; }
  }
  void POLITY_CAP; return null;
}
/** 選べる政体の一覧（理由つき） */
export const regimeChoices = (civ, group) => REGIME_IDS.map((id) => ({ id, ja: REGIMES[id].ja, blurb: REGIMES[id].blurb, ruler: officeJa(REGIMES[id].ruler), heredity: REGIMES[id].heredity, offices: REGIMES[id].offices, reason: regimeGate(civ, group, id) }));

export const MIN_OFFICES = 3, MAX_OFFICES = 100; // v6.12.0: 全部置ける（置きすぎは維持費と官僚肥大の副作用で抑える。officeEffects）
/** 役職の選択の検証。元首の役職は必須。政体で選べないものは不可。戻り値: エラー文または null */
export function checkOffices(regime0, ids) {
  const regime = canonRegime(regime0);
  const r = REGIMES[regime]; if (!r) return "未知の政体"; if (!Array.isArray(ids)) return "役職の一覧が必要です";
  const set = new Set(ids); if (set.size !== ids.length) return "同じ役職が重複しています";
  for (const i of ids) if (!r.offices.includes(i)) return `「${officeJa(i)}」はこの政体では置けません`;
  if (!set.has(r.ruler)) return `元首の役職「${officeJa(r.ruler)}」は外せません`;
  if (ids.length < MIN_OFFICES) return `役職は ${MIN_OFFICES} 以上`; if (ids.length > MAX_OFFICES) return `役職は ${MAX_OFFICES} まで`;
  return null;
}
/** 既定の役職（元首＋先頭から数個） */
/** 旧い政体 id（部族制 tribal など）も受け付け、30 種の id へ読み替える（v7.1.0） */
export const canonRegime = (id) => (REGIMES[id] ? id : MIGRATE_REGIME[id] ?? id);
export const defaultOffices = (regime) => { const r = REGIMES[canonRegime(regime)]; return r.offices.slice(0, Math.min(r.offices.length, 5)).includes(r.ruler) ? r.offices.slice(0, Math.min(r.offices.length, 5)) : [r.ruler, ...r.offices.filter((x) => x !== r.ruler).slice(0, 4)]; };

// ---- 役職の効果（v6.12.0 → v6.21.0 で、乱数をやめて役職の意味に結びつけた）。役職ごとに「バフ 1 つ」と、あれば「欠点 1 つ」、維持費の階層がある。全部置くと、維持費と官僚肥大（安定度・民衆の支持）が重くなる。
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v), r4 = (x) => Math.round(x * 10000) / 10000;
/** バフの印 → 効果: stab 安定度／tax 税収／mil 軍事力／cult 文化／tech 技術／dipl 外交（条約の受け入れ）／scout 偵察 */
const BUFF = { s: { stab: 0.005 }, t: { tax: 0.009 }, m: { mil: 0.008 }, c: { cult: 0.01 }, h: { tech: 0.008 }, k: { scout: 0.06 }, d: { dipl: 0.04 } };
export const BUFF_JA = Object.freeze({ s: "安定度", t: "税収", m: "軍事力", c: "文化", h: "技術", k: "偵察", d: "外交" });
const DEFAULT_TAG = { admin: "s", mil: "m", econ: "t", faith: "s", law: "s", cult: "c", dipl: "d", intel: "k" }, TIER0 = { admin: 2, mil: 2, econ: 2, faith: 1, law: 2, cult: 1, dipl: 1, intel: 1 };
/** 分野ごとの、味方になる勢力（支持の目標への加減） */
const FAC = { mil: ["military", 0.012], econ: ["merchants", 0.01], faith: ["clergy", 0.012], admin: ["bureaucrats", 0.01], law: ["commoners", 0.004], cult: ["artisans", 0.008], dipl: ["merchants", 0.004], intel: ["commoners", -0.005] };
/** 欠点の印 → [欠点の名前, 勢力の支持の加減, 安定度の加減] */
const DEBUFF_FX = { n: ["arrogant", { nobility: -0.006 }, 0], p: ["unpopular", { commoners: -0.006 }, -0.001], $: ["costly", {}, 0], c: ["clergy", { clergy: -0.006 }, 0], m: ["military", { military: -0.006 }, 0], t: ["merchants", { merchants: -0.006 }, 0], b: ["bureaucrats", { bureaucrats: -0.006 }, 0] };
const infoCache = new Map();
export const DEBUFF_JA = Object.freeze({ costly: "維持費が重い", unpopular: "民衆に疎まれる", arrogant: "貴族が反発する", clergy: "聖職者が反発する", military: "軍が反発する", merchants: "商人が反発する", bureaucrats: "官僚が反発する" });
/** 役職 1 つの効果。fx: バフ／fac: 勢力の支持の目標への加減／tier: 維持費の階層（1〜4）／debuff: 欠点／strong: 重職（効果 1.5 倍・維持費 +1） */
export function officeInfo(id) {
  if (infoCache.has(id)) return infoCache.get(id); const o = OFFICES[id]; if (!o) return null; const dom = o[1];
  if (dom === "ruler") { const info0 = { id, ja: o[0], dom, fx: {}, fac: {}, tier: 0, debuff: null, strong: false }; infoCache.set(id, info0); return info0; }
  const tag = TAGS[id], letter = tag?.b ?? DEFAULT_TAG[dom], strong = letter === letter.toUpperCase(), mult = strong ? 1.5 : 1, fx = {}, fac = {};
  for (const [k, v] of Object.entries(BUFF[letter.toLowerCase()] ?? {})) fx[k] = r4(v * mult); if (FAC[dom]) fac[FAC[dom][0]] = r4(FAC[dom][1] * mult);
  const db = tag?.d ? DEBUFF_FX[tag.d] : null; if (db) { for (const [k, v] of Object.entries(db[1])) fac[k] = r4((fac[k] ?? 0) + v); if (db[2]) fx.stab = r4((fx.stab ?? 0) + db[2]); }
  const deb = db ? db[0] : null, info = { id, ja: o[0], dom, fx, fac, tier: (TIER0[dom] ?? 1) + (strong ? 1 : 0) + (deb === "costly" ? 1 : 0), debuff: deb, strong }; infoCache.set(id, info); return info;
}
/** 国家の役職すべての効果（置いた役職の合計＋官僚肥大＋元首の力量）。上限あり（軽いバフ・デバフ）。mi: 摂政の期限の判定に使う */
export function officeEffects(st, mi = null) {
  const o = { stab: 0, tax: 0, mil: 0, cult: 0, tech: 0, dipl: 0, scout: 0, fac: {}, units: 0, count: 0, comfort: 0, extra: 0, domains: 0 }, doms = new Set();
  for (const x of st.offices ?? []) { const i = officeInfo(x.id); if (!i) continue; o.count++; o.units += i.tier; if (i.dom !== "ruler") doms.add(i.dom); for (const [k, v] of Object.entries(i.fx)) o[k] += v; for (const [k, v] of Object.entries(i.fac)) o.fac[k] = (o.fac[k] ?? 0) + v; }
  o.domains = doms.size; if (o.count) { o.comfort = clampN(5 + Math.round(2 * Math.log2((st.pop ?? 0) / 5000 + 1)), 5, 20); o.extra = Math.max(0, o.count - o.comfort); o.stab -= Math.min(0.05, 0.003 * o.extra); o.fac.commoners = (o.fac.commoners ?? 0) - Math.min(0.08, 0.004 * o.extra); }
  const L = st.leader, reg = L?.regent && (mi == null || L.regent.until > mi) ? L.regent : null, skill = reg ? reg.skill : L?.skill, ld = typeof skill === "number" ? skill - 0.5 : 0; o.stab += ld * 0.05; o.tax += ld * 0.06; o.mil += ld * 0.05;
  o.stab = r4(clampN(o.stab, -0.06, 0.06)); o.tax = r4(clampN(o.tax, -0.12, 0.12)); o.mil = r4(clampN(o.mil, -0.08, 0.08)); o.cult = r4(clampN(o.cult, -0.1, 0.1)); o.tech = r4(clampN(o.tech, -0.1, 0.1)); o.dipl = r4(clampN(o.dipl, -0.3, 0.3)); o.scout = r4(clampN(o.scout, -0.25, 0.25)); for (const k of Object.keys(o.fac)) o.fac[k] = r4(clampN(o.fac[k], -0.12, 0.12));
  return o;
}
/** 維持費（月あたり）: 階層の合計 × 人口。全部置くと、税収の大半が官僚の維持に消える */
export const officeUpkeep = (st) => (officeEffects(st).units * (st.pop ?? 0) * 0.5e-6);
/** 旧来の呼び出し口: 役職の効果のうち、安定度（文化は半分）。担当者がいない国家は 0 */
export function officeFx(st) { const e = officeEffects(st); return { stability: r4(e.stab + 0.5 * e.cult), domains: e.domains }; }
export const OFFICE_STABILITY = (st) => officeFx(st).stability;
