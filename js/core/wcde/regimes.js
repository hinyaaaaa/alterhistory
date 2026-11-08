// v6.4.0: 政体（15 種）と役職。
//   ・シミュレーション内部の政体（st.polity = tribal/chiefdom/kingdom/empire/republic/theocracy の 6 値）は変えない。
//     表示と建国で選ぶ「政体」は st.regime（15 種）で、内部の政体（core）に対応づける。
//   ・役職（st.offices）は政体ごとに選べる一覧があり、建国のとき・その後いつでも組み替えられる。
//     役職は安定度に小さく効く（分野が揃うほど。上限あり）。担当者は人名と顔を持つ。
//   ・選べる政体は、成立する集団（または国家の首都の集団）が知っている技術で絞る（WCDE の制限）。
import { groupCaps, POLITY_CAP } from "../civ/tech.js";

/** 役職: id → [表示名, 分野] 分野: ruler 元首／admin 行政／mil 軍／econ 経済／faith 信仰／law 司法／cult 文化／dipl 外交／intel 情報 */
export const OFFICES = Object.freeze({
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
export const REGIMES = Object.freeze({
  tribal: { ja: "部族制", core: "tribal", needs: [], ruler: "chief", offices: ["chief", "elder_council", "shaman", "war_leader", "hunt_master"], heredity: false, blurb: "氏族の長老と戦士が合議する。" },
  chiefdom: { ja: "首長制", core: "chiefdom", needs: ["cap:polity:chiefdom"], ruler: "chieftain", offices: ["chieftain", "elder_council", "steward", "war_leader", "shaman", "storyteller", "tribute_collector"], heredity: true, blurb: "首長が貢納を集め、一族で地位を継ぐ。" },
  theocracy: { ja: "神権制", core: "theocracy", needs: ["cap:polity:chiefdom"], ruler: "high_priest", offices: ["high_priest", "temple_steward", "oracle", "inquisitor", "temple_guard", "storyteller", "tribute_collector"], heredity: false, blurb: "神の名のもとに祭司が国を治める。" },
  despotism: { ja: "専制君主制", core: "kingdom", needs: ["cap:polity:kingdom"], ruler: "despot", offices: ["despot", "vizier", "chancellor", "marshal", "treasurer", "chamberlain", "spymaster", "court_historian"], heredity: true, blurb: "君主の意志がそのまま法となる。" },
  kingdom: { ja: "王政", core: "kingdom", needs: ["cap:polity:kingdom"], ruler: "king", offices: ["king", "vizier", "chancellor", "marshal", "treasurer", "chamberlain", "royal_envoy", "court_historian", "court_physician"], heredity: true, blurb: "国王と宰相が官僚を率いる。" },
  feudal: { ja: "封建制", core: "kingdom", needs: ["cap:polity:kingdom", "tech:fortification"], ruler: "overlord", offices: ["overlord", "duke", "constable", "bishop", "chancellor", "treasurer", "royal_envoy"], heredity: true, blurb: "諸侯が土地と軍役で結ばれる。" },
  empire: { ja: "帝政", core: "empire", needs: ["cap:polity:empire"], ruler: "emperor", offices: ["emperor", "grand_secretary", "governor", "censor", "legion_commander", "treasurer", "royal_envoy", "spymaster", "court_historian"], heredity: true, blurb: "皇帝のもと、総督が諸地域を治める。" },
  oligarchic_republic: { ja: "貴族共和制", core: "republic", needs: ["cap:polity:republic"], ruler: "consul", offices: ["consul", "senate", "tribune", "magistrate", "general", "trade_master", "treasurer"], heredity: false, blurb: "有力な家門が元老院で国を動かす。" },
  direct_democracy: { ja: "直接民主制", core: "republic", needs: ["cap:polity:republic", "tech:alphabet"], ruler: "convener", offices: ["convener", "strategos", "archon", "magistrate", "trade_master", "royal_envoy"], heredity: false, blurb: "市民が民会で直接に決める。" },
  constitutional_monarchy: { ja: "立憲君主制", core: "kingdom", needs: ["cap:polity:kingdom", "tech:parliament"], ruler: "figurehead", offices: ["figurehead", "prime_minister", "minister_finance", "minister_defense", "minister_interior", "minister_foreign", "speaker", "chief_justice"], heredity: true, blurb: "君主は象徴となり、議会と内閣が政治を行う。" },
  parliamentary: { ja: "議院内閣制", core: "republic", needs: ["tech:parliament"], ruler: "prime_minister", offices: ["prime_minister", "minister_finance", "minister_defense", "minister_interior", "minister_foreign", "speaker", "chief_justice", "minister_culture"], heredity: false, blurb: "議会の多数派が内閣を組む。" },
  presidential: { ja: "大統領制", core: "republic", needs: ["tech:constitutionalism"], ruler: "president", offices: ["president", "minister_finance", "minister_defense", "minister_interior", "minister_foreign", "speaker", "chief_justice", "intel_director"], heredity: false, blurb: "国民が選んだ大統領が行政を率いる。" },
  socialist: { ja: "社会主義共和制", core: "republic", needs: ["tech:industry", "tech:newspapers"], ruler: "party_secretary", offices: ["party_secretary", "politburo", "commissar", "planner", "prosecutor", "propaganda", "security_chief"], heredity: false, blurb: "一つの党が計画経済と国家を導く。" },
  junta: { ja: "軍事政権", core: "republic", needs: ["tech:standing_army"], ruler: "junta_chair", offices: ["junta_chair", "general", "admiral", "security_chief", "minister_finance", "minister_interior"], heredity: false, blurb: "軍の評議会が非常の権限で統治する。" },
  confederation: { ja: "連邦制", core: "republic", needs: ["cap:polity:republic", "tech:diplomacy"], ruler: "federal_chair", offices: ["federal_chair", "federal_envoy", "federal_court", "minister_finance", "minister_defense", "speaker"], heredity: false, blurb: "自治する諸邦が合議で結びつく。" },
});
export const REGIME_IDS = Object.freeze(Object.keys(REGIMES));
/** 内部の政体から、標準の政体（古い保存・AI が作った国家の表示用） */
export const DEFAULT_REGIME = Object.freeze({ tribal: "tribal", chiefdom: "chiefdom", theocracy: "theocracy", kingdom: "kingdom", empire: "empire", republic: "oligarchic_republic" });
export const regimeOf = (st) => (st.regime && REGIMES[st.regime] && REGIMES[st.regime].core === st.polity ? st.regime : DEFAULT_REGIME[st.polity] ?? "tribal"); // 内部の政体が変わったら、標準の政体に戻る
export const regimeJa = (st) => REGIMES[regimeOf(st)].ja;
export const officeJa = (id) => OFFICES[id]?.[0] ?? id;

/** その政体を選べない理由（選べるなら null）。known: 集団が知っている技術（g.tech.known）／caps: 集団の解禁 */
export function regimeGate(civ, group, id) {
  const r = REGIMES[id]; if (!r) return "未知の政体"; const caps = groupCaps(civ, group);
  for (const n of r.needs) {
    if (n.startsWith("cap:")) { if (!caps.has(n.slice(4))) return `技術の解禁「${n.slice(4)}」が必要`; }
    else if (n.startsWith("tech:")) { if (group.tech.known[n.slice(5)] == null) return `技術「${n.slice(5)}」を知らない`; }
  }
  void POLITY_CAP; return null;
}
/** 選べる政体の一覧（理由つき） */
export const regimeChoices = (civ, group) => REGIME_IDS.map((id) => ({ id, ja: REGIMES[id].ja, blurb: REGIMES[id].blurb, ruler: officeJa(REGIMES[id].ruler), heredity: REGIMES[id].heredity, offices: REGIMES[id].offices, reason: regimeGate(civ, group, id) }));

export const MIN_OFFICES = 3, MAX_OFFICES = 12;
/** 役職の選択の検証。元首の役職は必須。政体で選べないものは不可。戻り値: エラー文または null */
export function checkOffices(regime, ids) {
  const r = REGIMES[regime]; if (!r) return "未知の政体"; if (!Array.isArray(ids)) return "役職の一覧が必要です";
  const set = new Set(ids); if (set.size !== ids.length) return "同じ役職が重複しています";
  for (const i of ids) if (!r.offices.includes(i)) return `「${officeJa(i)}」はこの政体では置けません`;
  if (!set.has(r.ruler)) return `元首の役職「${officeJa(r.ruler)}」は外せません`;
  if (ids.length < MIN_OFFICES) return `役職は ${MIN_OFFICES} 以上`; if (ids.length > MAX_OFFICES) return `役職は ${MAX_OFFICES} まで`;
  return null;
}
/** 既定の役職（元首＋先頭から数個） */
export const defaultOffices = (regime) => { const r = REGIMES[regime]; return r.offices.slice(0, Math.min(r.offices.length, 5)).includes(r.ruler) ? r.offices.slice(0, Math.min(r.offices.length, 5)) : [r.ruler, ...r.offices.filter((x) => x !== r.ruler).slice(0, 4)]; };

/** 役職の効果: 分野が揃うほど安定度が上がる（1 分野 +0.007、上限 +0.04）。元首以外の分野を数える。実際に置かれた役職だけ */
export function officeFx(st) {
  const o = st.offices; if (!o?.length) return { stability: 0, domains: 0 }; const d = new Set(); for (const x of o) { const dom = OFFICES[x.id]?.[1]; if (dom && dom !== "ruler") d.add(dom); }
  return { stability: Math.min(0.04, d.size * 0.007), domains: d.size };
}
export const OFFICE_STABILITY = (st) => officeFx(st).stability;
