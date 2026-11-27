// v7.1.0: 政体 30 種（6 つの系統）と、独立して選ぶ 3 つの軸（経済体制 8・国家構造 4・国家思想 12）。
//   政体は「誰が、どのように統治するか」だけを決める。経済・構造・思想は別の軸で、組み合わせは自由（王政の社会主義国・企業連合の自由市場国 など）。
//   core は内部の政体（st.polity: tribal/chiefdom/kingdom/empire/republic/theocracy）。needs は「tech:」「cap:」（regimes.js の regimeGate）。
//   tier は時代の新しさ、fam は系統（regime-evolution.js）: tri 前国家／the 神権／mon 君主・官僚／rep 共和・民主／aut 一党・軍・統制／org 企業・職能。
import { TREE } from "../civ/techtree.js";
const ID = Object.fromEntries(TREE.map((t) => [t.ja, t.id])), T = (name) => { if (!ID[name]) throw new Error("技術名が無い: " + name); return "tech:" + ID[name]; };
export const POLITY_GROUPS = Object.freeze([
  { id: "mon", ja: "君主・王権", note: "君主と血統が正統性の中心" }, { id: "rep", ja: "共和・民主", note: "議会・国民・評議会が統治権を持つ" },
  { id: "eli", ja: "エリート・専門家", note: "特定の階層や専門家が決める" }, { id: "aut", ja: "権威主義・組織支配", note: "政党・軍・指導者に権力が集まる" },
  { id: "rel", ja: "宗教・伝統・共同体", note: "宗教や長老・首長の合議が基礎" }, { id: "org", ja: "企業・生産組織", note: "企業・職能団体・労働者が統治の基盤" },
]);
// [id, 名前, 系統グループ, core, needs, 世襲, tier, fam, 稀少度, 統治の中心, 一言, 参考（史実）, 役職の元になる旧い政体, 元首の役職]
const R = (id, ja, grp, core, needs, heredity, tier, fam, rarity, center, blurb, ex, src, ruler) => ({ id, ja, grp, core, needs, heredity, tier, fam, rarity, center, blurb, ex, src, ruler });
export const POLITY_LIST = Object.freeze([
  R("absolute_monarchy", "絶対君主制", "mon", "kingdom", ["cap:polity:kingdom", "tech:administration", "tech:standing_army"], true, 6, "mon", 1, "君主", "君主が法も軍も握る。決断は速く、国の運は君主の器で決まる。", "ルイ14世のフランス・近世ロシア", "despotism", "絶対君主"),
  R("dual_monarchy", "二元立憲君主制", "mon", "kingdom", ["cap:polity:kingdom", "tech:constitutionalism"], true, 7, "mon", 1, "君主・議会", "議会はあるが、軍と行政は君主の手にある。", "ドイツ帝国・明治憲法下の日本", "constitutional_monarchy", "君主（立憲）"),
  R("parliamentary_monarchy", "議会君主制", "mon", "kingdom", ["cap:polity:kingdom", "tech:parliament"], true, 7, "mon", 1, "議会・内閣", "君主は象徴。政治は議会と内閣が担う。", "イギリス・現代日本", "constitutional_monarchy", "象徴の君主"),
  R("elective_monarchy", "選挙君主制", "mon", "kingdom", ["cap:polity:kingdom", "tech:law", "tech:diplomacy"], false, 5, "mon", 1, "選ばれた君主", "有力者の合議が、次の王を選ぶ。", "ポーランド・リトアニア、神聖ローマ帝国", "elective_monarchy", "選ばれた王"),
  R("estates_monarchy", "身分制君主制", "mon", "kingdom", ["cap:polity:kingdom", "tech:fortification"], true, 3, "mon", 1, "君主・諸侯", "王と貴族・領主が権力を分け合う。地方は強く、中央は遅い。", "中世ヨーロッパの諸王国", "kingdom", "宗主王"),
  R("parliamentary_republic", "議院内閣制", "rep", "republic", ["tech:parliament"], false, 8, "rep", 1, "議会", "議会が内閣をつくり、政府は議会に責任を負う。", "ドイツ・イタリア", "parliamentary", "総理大臣"),
  R("presidential_republic", "大統領制", "rep", "republic", ["tech:constitutionalism", T("選挙")], false, 8, "rep", 1, "大統領", "大統領が元首と行政の長を兼ねる。", "アメリカ・ブラジル", "presidential", "大統領"),
  R("semi_presidential", "半大統領制", "rep", "republic", ["tech:parliament", "tech:constitutionalism"], false, 8, "rep", 0.8, "大統領・首相", "大統領と首相が行政を分け合う。", "フランス", "presidential", "大統領"),
  R("direct_democracy", "直接民主制", "rep", "republic", ["cap:polity:republic", "tech:writing", "tech:law"], false, 3, "rep", 0.7, "国民", "国民が投票で政策を直接決める。", "古代アテネ・スイス", "direct_democracy", "民会議長"),
  R("consociational_republic", "協調民主制", "rep", "republic", ["tech:parliament", T("連邦制")], false, 8, "rep", 0.6, "複数の社会集団", "民族・宗教・地域の集団が、政府の座を分け合う。", "ベルギー・レバノン", "confederation", "連邦議長"),
  R("council_republic", "評議会共和制", "rep", "republic", [T("労働組合"), T("社会主義")], false, 8, "rep", 0.3, "地域・職場の評議会", "職場や地域の評議会が代表を送り、国を動かす。", "パリ・コミューン、ロシア革命期のソビエト", "anarchist", "評議会の調整役"),
  R("aristocratic_republic", "貴族共和制", "eli", "republic", ["cap:polity:republic"], false, 3, "rep", 1, "貴族", "いくつかの家門が、政治の座を独占する。", "ヴェネツィア", "oligarchic_republic", "執政官"),
  R("plutocracy", "財閥寡頭制", "eli", "republic", ["cap:polity:republic", "tech:banking", "tech:shipbuilding"], false, 5, "rep", 0.9, "富裕層・財閥", "大商人と金融が、国の舵を握る。", "カルタゴ・商業都市", "merchant_republic", "元首（総督）"),
  R("bureaucratic_state", "官僚国家", "eli", "empire", ["cap:polity:empire"], false, 4, "mon", 1, "官僚機構", "政治家より官僚機構が、国を動かす。", "プロイセン・歴代の官僚国家", "empire", "皇帝"),
  R("technocracy", "技術官僚制", "eli", "republic", [T("専門家統治論"), T("公的統計")], false, 10, "aut", 0.45, "専門家", "科学者・技術者・経済の専門家が、評議会で統治する。", "サン＝シモンの構想・専門家主導の行政", "technocracy", "最高技術評議会の議長"),
  R("meritocratic_state", "能力選抜国家", "eli", "empire", ["tech:civil_service", T("科挙")], false, 5, "mon", 0.9, "試験・実績の選抜", "試験と実績が、統治者への道を決める。", "科挙の中国", "empire", "皇帝"),
  R("one_party_state", "一党国家", "aut", "republic", ["tech:electricity", "tech:radio"], false, 9, "aut", 0.7, "単一政党", "ひとつの政党が政治を独占する。", "ソビエト連邦・キューバ", "one_party", "党の第一書記"),
  R("dominant_party", "優位政党制", "aut", "republic", [T("選挙"), "tech:newspapers"], false, 9, "aut", 0.7, "支配政党", "選挙はあるが、同じ政党が政権を保ち続ける。", "PRI 支配期のメキシコ", "one_party", "党の第一書記"),
  R("military_junta", "軍事評議会", "aut", "republic", ["tech:standing_army", "tech:conscription"], false, 8, "aut", 0.6, "軍部", "将軍たちの評議会が、非常の権限で統治する。", "ギリシャ・アルゼンチンの軍政", "junta", "軍事評議会議長"),
  R("personal_dictatorship", "個人独裁", "aut", "republic", ["tech:standing_army"], false, 6, "aut", 0.7, "個人の指導者", "ひとりの指導者に権力が集まり、国家機関は従う。", "マルコス政権・モブツ政権", "totalitarian", "総統（最高指導者）"),
  R("mobilized_state", "総動員国家", "aut", "republic", ["tech:radio", "tech:mechanized_warfare"], false, 9, "aut", 0.5, "支配思想・政党", "国家の理念が、政治から文化まで社会のすべてを統制する。", "ナチス・ドイツ、スターリン期のソ連", "totalitarian", "総統（最高指導者）"),
  R("theocracy", "聖職者神権制", "rel", "theocracy", ["cap:polity:chiefdom"], false, 2, "the", 1, "聖職者", "聖職者が、最高の政治権力を持つ。", "教皇領・チベットの政教一致", "theocracy", "大祭司"),
  R("theocratic_republic", "宗教監督共和制", "rel", "theocracy", ["tech:constitutionalism", "tech:writing"], false, 8, "the", 0.6, "議会・宗教機関", "議会も大統領もあるが、宗教機関が法と政策を監督する。", "イラン・イスラム共和国", "clerical_state", "教皇（教主）"),
  R("elder_council", "長老評議制", "rel", "tribal", [], false, 0, "tri", 1, "長老", "年長者と伝統の指導者が合議で決める。", "アカン系諸社会の長老会", "tribal", "族長"),
  R("chiefs_league", "首長連合制", "rel", "chiefdom", ["cap:polity:chiefdom"], true, 1, "tri", 1, "地域の首長", "複数の首長が連合し、共通の機関をつくる。", "アシャンティ連合", "chiefdom", "首長"),
  R("corporate_state", "企業国家", "org", "republic", ["tech:joint_stock", "tech:shipbuilding"], false, 8, "org", 0.4, "単一の企業", "ひとつの企業が、領土・行政・徴税を運営する。", "東インド会社のインド統治", "merchant_republic", "総裁（最高経営者）"),
  R("corporate_league", "企業連合国家", "org", "republic", ["tech:joint_stock", T("株式市場"), "tech:railway"], false, 9, "org", 0.35, "複数企業の評議会", "巨大企業の評議会が、国を共同で運営する。", "商業寡頭制を発展させた構想", "merchant_republic", "評議会議長（輪番）"),
  R("corporatist_state", "職能団体国家", "org", "republic", [T("職能代表主義")], false, 9, "aut", 0.4, "産業・職業団体", "産業・労働・農業の団体が、分野ごとに政策を決める。", "ムッソリーニ期のイタリア", "totalitarian", "統領"),
  R("planned_socialist", "計画社会主義国家", "org", "republic", [T("計画経済"), "tech:industry"], false, 8, "aut", 0.5, "国家計画機関", "国が主要産業を持ち、中央の計画が生産と配分を決める。", "ソビエト連邦・東欧諸国", "socialist", "党書記長"),
  R("self_managed_republic", "自主管理共和国", "org", "republic", [T("協同組合"), T("労働組合")], false, 9, "rep", 0.35, "労働者・協同組合", "現場の労働者と協同組合が、経営と配分に関わる。", "ユーゴスラビア", "socialist", "連邦評議会議長"),
]);
/** 旧い政体 id → 新しい政体 id（古い保存の移行） */
export const MIGRATE_REGIME = Object.freeze({ tribal: "elder_council", chiefdom: "chiefs_league", theocracy: "theocracy", clerical_state: "theocratic_republic", despotism: "absolute_monarchy", kingdom: "estates_monarchy", feudal: "estates_monarchy", empire: "bureaucratic_state", oligarchic_republic: "aristocratic_republic", direct_democracy: "direct_democracy", constitutional_monarchy: "parliamentary_monarchy", parliamentary: "parliamentary_republic", presidential: "presidential_republic", socialist: "planned_socialist", junta: "military_junta", confederation: "consociational_republic", city_state: "aristocratic_republic", merchant_republic: "plutocracy", elective_monarchy: "elective_monarchy", one_party: "one_party_state", anarchist: "council_republic", totalitarian: "mobilized_state", technocracy: "technocracy", adv_direct_democracy: "direct_democracy" });
/** 内部の政体ごとの、標準の政体 */
export const DEFAULT_BY_CORE = Object.freeze({ tribal: "elder_council", chiefdom: "chiefs_league", theocracy: "theocracy", kingdom: "estates_monarchy", empire: "bureaucratic_state", republic: "aristocratic_republic" });
// ---- 独立した 3 つの軸 ----
export const ECONOMY = Object.freeze([
  { id: "free_market", ja: "自由市場", note: "民間企業と競争が中心" }, { id: "regulated", ja: "規制市場", note: "市場を保ち、政府が規制する" }, { id: "welfare", ja: "福祉資本主義", note: "市場と社会保障を両立する" },
  { id: "state_capital", ja: "国家資本主義", note: "国が企業を持ち、市場にも出る" }, { id: "planned", ja: "計画経済", note: "国が生産と配分を計画する" }, { id: "market_socialism", ja: "市場社会主義", note: "社会的所有と競争を組み合わせる" },
  { id: "cooperative", ja: "協同組合経済", note: "協同組合が生産と経営を担う" }, { id: "mixed", ja: "混合経済", note: "民間・国家・協同組合が並ぶ" },
]);
export const STRUCTURE = Object.freeze([
  { id: "unitary", ja: "単一国家", note: "中央政府が基本の権限を持つ" }, { id: "federal", ja: "連邦国家", note: "中央と構成地域が権限を分ける" },
  { id: "league", ja: "国家連合", note: "独立した国が共通機関をつくる" }, { id: "devolved", ja: "分権国家", note: "地方政府に強い自治を与える" },
]);
export const IDEOLOGY = Object.freeze([
  { id: "liberal", ja: "自由主義", note: "個人の自由と権利" }, { id: "conservative", ja: "保守主義", note: "伝統と既存の制度" }, { id: "socialist", ja: "社会主義", note: "社会的所有と平等" },
  { id: "nationalist", ja: "民族主義", note: "民族・国民の統一" }, { id: "internationalist", ja: "国際主義", note: "国際協調" }, { id: "militarist", ja: "軍国主義", note: "軍事力と安全保障" },
  { id: "pacifist", ja: "平和主義", note: "非軍事の解決" }, { id: "religious", ja: "宗教主義", note: "宗教の価値観" }, { id: "green", ja: "環境主義", note: "自然と持続可能性" },
  { id: "statist", ja: "国家主義", note: "国家の権威と統一" }, { id: "progressive_tech", ja: "技術進歩主義", note: "科学技術の発展" }, { id: "pragmatist", ja: "実利主義", note: "国益と実際の成果" },
]);
/** 政体ごとの、標準の組み合わせ（まだ選んでいない国の表示用。決める操作は別） */
export const AXIS_DEFAULT = Object.freeze({ absolute_monarchy: ["regulated", "unitary", "conservative"], estates_monarchy: ["regulated", "devolved", "conservative"], planned_socialist: ["planned", "unitary", "socialist"], self_managed_republic: ["market_socialism", "federal", "socialist"], corporate_state: ["free_market", "unitary", "pragmatist"], corporate_league: ["free_market", "league", "pragmatist"], military_junta: ["state_capital", "unitary", "militarist"], theocracy: ["regulated", "unitary", "religious"], theocratic_republic: ["state_capital", "unitary", "religious"], technocracy: ["mixed", "unitary", "progressive_tech"], consociational_republic: ["welfare", "federal", "internationalist"], parliamentary_republic: ["welfare", "unitary", "liberal"], presidential_republic: ["regulated", "federal", "liberal"] });
export const axisOf = (st, regimeId) => { const d = AXIS_DEFAULT[regimeId] ?? ["regulated", "unitary", "pragmatist"]; return { economy: st.economySystem ?? d[0], structure: st.stateStructure ?? d[1], ideology: st.stateIdeology ?? d[2] }; };
