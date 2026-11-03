// v6.1.0 M3: 統合技術ツリー（データ）。ひとつにつながった有向グラフ。仕様 §6.1。
//   ・lane（縦の分野レーン）× stage（左→右の時代の列）の規則的なグリッド。ノードの位置は (lane, stage, slot) から決まり、状態では動かない。
//   ・prereq は「すべて必要（AND）」。前提の stage は必ず自分より小さい（左から右へだけ進む）。validateTree() が検査する。
//   ・E: 理想的な条件での独立発見の期待年数（1 集団あたり）。実際の発生率は 1/E に、人口・既存知識・環境・交流・都市化・経済・競争の係数が掛かる（研究点・研究キューは無い）。
//   ・cond: 成立に必要な地理条件（資源・地形）。pop: 成立に必要な集団規模。s: 定住が必要。
//   ・caps: この技術が解禁する「できること」（行動・制度・ユニット・条約・経済・人口）。ゲームの検証とUIの表示条件は、同じ caps から導く。
//   ・fx: 数値の効果（加算の倍率）。cap=収容力 tax=税収 trade=交易 ind=産業力 off=攻撃 def=防御 health=衛生 learn=学習・伝播の速さ。
export const LANES = Object.freeze([
  { id: "mat", ja: "素材・道具", glyph: "◆" }, { id: "agr", ja: "農業・牧畜", glyph: "❀" }, { id: "bld", ja: "建築", glyph: "▣" }, { id: "trn", ja: "輸送・航海", glyph: "➤" },
  { id: "sci", ja: "数学・測量・天文", glyph: "∑" }, { id: "rec", ja: "記録・文字・通信", glyph: "✎" }, { id: "med", ja: "医療・衛生", glyph: "✚" }, { id: "gov", ja: "統治・行政・法", glyph: "⚖" },
  { id: "eco", ja: "経済・金融", glyph: "¤" }, { id: "mil", ja: "軍事・兵站", glyph: "⚔" }, { id: "ind", ja: "エネルギー・産業", glyph: "⚙" },
]);
export const STAGES = Object.freeze(["原初", "後期旧石器", "新石器", "青銅器", "鉄器・古典", "古典後期", "中世", "近世初期", "近世", "産業革命", "近代", "現代"]);
const POOL = 6000; // 歴史時代の E は「世界全体で次の技術が出るまでの年数 × 同条件の集団の数と、発生率に掛かる係数の典型値の積（約6000）」。1 集団あたりの独立発見は非常にまれで、世界のどこかで起こる
const E_BY_STAGE = [400000, 1200000, 4500000, ...[110, 150, 190, 230, 250, 260, 220, 200, 170].map((y) => y * POOL)]; // 先史（原初〜新石器）の E は、集団数が数百・数千年の刻みで進む圧縮モデルを前提とした値（先史の技術は 1 集団あたり数十万〜数百万年に1回）
const nodes = [];
const n = (id, ja, lane, stage, prereq, o = {}) => nodes.push({ id, ja, lane, stage, pre: stage <= 2, prereq, E: o.E ?? E_BY_STAGE[stage], pop: o.pop ?? 0, s: !!o.s, cond: o.cond ?? null, caps: o.caps ?? [], fx: o.fx ?? {}, desc: o.d ?? "", why: o.why ?? "" });
// ---- 素材・道具
n("stone_tools", "石器", "mat", 0, [], { E: 0, d: "打ち欠いた石の刃。すべての集団が最初から持つ。" });
n("fire_control", "火の利用", "mat", 0, ["stone_tools"], { caps: ["pop:cold"], fx: { cap: 0.04 }, d: "火を保ち、調理と暖をとる。寒冷な土地へ住める。", why: "石器の使用が広がった集団で、火が日常的に使われる" });
n("hafted_tools", "組み合わせ道具", "mat", 1, ["stone_tools", "fire_control"], { fx: { cap: 0.04 }, d: "柄をつけた斧・槍。狩猟と加工が効率化する。", why: "火で樹脂や膠を扱える" });
n("cordage", "縄・網", "mat", 1, ["stone_tools"], { fx: { cap: 0.03 }, d: "植物繊維の縄と網。漁撈・罠・筏の基礎。" });
n("hide_working", "皮なめし・衣服", "mat", 1, ["fire_control"], { caps: ["pop:cold"], fx: { cap: 0.05 }, d: "皮を加工し衣服にする。高緯度の氷期を耐える。" });
n("pottery", "土器", "mat", 2, ["fire_control"], { E: 8000000, cond: "clay", caps: ["storage:pottery"], fx: { cap: 0.04 }, d: "粘土を焼いた容器。煮炊きと貯蔵。", why: "粘土のある土地で、火を使い慣れた集団" });
n("weaving", "織物", "mat", 2, ["cordage"], { fx: { cap: 0.03 }, d: "糸を撚り布を織る。", why: "縄・網の技術が繊維の加工へ広がる" });
n("copper_working", "銅加工", "mat", 3, ["pottery", "fire_control"], { cond: "cu_sn", pop: 300, d: "自然銅や銅鉱を熱して叩き、器具にする。", why: "銅・錫のある土地で、焼成の経験がある" });
n("bronze", "青銅", "mat", 3, ["copper_working", "pottery"], { pop: 400, cond: "cu_sn", caps: ["unit:ranged"], fx: { ind: 0.1 }, d: "銅と錫の合金。道具と武具が硬くなる。" });
n("iron", "鉄", "mat", 4, ["bronze"], { pop: 800, cond: "iron", fx: { ind: 0.15, cap: 0.05 }, d: "鉄鉱から鉄を得る。農具と武具が広く普及する。", why: "鉄鉱があり、青銅の炉の技術がある" });
n("bellows", "送風・高炉", "mat", 5, ["iron"], { pop: 1200, fx: { ind: 0.1 }, d: "ふいごと炉の改良。高温を安定して得る。" });
n("glassmaking", "ガラス", "mat", 5, ["pottery", "bellows"], { d: "砂を高温で溶かす。器・窓・のちのレンズの基礎。" });
n("steel", "鋼", "mat", 6, ["iron", "bellows"], { pop: 2000, fx: { ind: 0.15 }, d: "炭素を制御した鉄。刃物と構造材が飛躍する。" });
n("precision_tools", "精密工作", "mat", 7, ["steel", "mathematics"], { pop: 6000, fx: { ind: 0.12 }, d: "旋盤・測定具。部品の精度が上がる。" });
n("chemistry", "化学", "mat", 8, ["glassmaking", "natural_philosophy"], { pop: 8000, fx: { ind: 0.1, health: 0.03 }, d: "物質の変化を体系的に扱う。" });
// ---- 農業・牧畜
n("foraging_arts", "採集の知識", "agr", 1, ["stone_tools", "fire_control"], { fx: { cap: 0.04 }, d: "食べられる植物の見分けと加工。" });
n("fishing", "漁撈", "agr", 1, ["cordage"], { cond: "water", fx: { cap: 0.05 }, caps: ["subsist:fishing"], d: "網・簗・釣針で魚介を獲る。" });
n("agriculture", "農耕", "agr", 2, ["foraging_arts"], { E: 8000000, cond: "fertile", caps: ["subsist:agriculture", "action:found_city"], fx: { cap: 0.2 }, d: "作物を植えて育てる。定住が可能になる。", why: "肥沃で水に近い土地で、人口圧が高く、採集の知識が蓄積している" });
n("pastoralism", "牧畜", "agr", 2, ["foraging_arts"], { E: 8000000, cond: "grass", caps: ["subsist:pastoral"], fx: { cap: 0.1 }, d: "家畜を飼い、群れとともに移動する。", why: "草原・サバンナで、狩猟の対象となる群れがあり、人口圧が高い" });
n("food_preservation", "保存食", "agr", 2, ["fire_control", "foraging_arts"], { fx: { cap: 0.04 }, d: "燻製・乾燥・塩漬け。冬と航海を越える。" });
n("horse_riding", "騎乗", "agr", 3, ["pastoralism"], { pop: 200, caps: ["unit:cavalry", "pop:steppe"], d: "馬を飼いならして乗る。移動と戦いが変わる。", why: "馬のいる草原で牧畜が営まれている" });
n("irrigation", "灌漑", "agr", 3, ["agriculture", "construction"], { s: true, fx: { cap: 0.15 }, d: "水路と堰で畑へ水を引く。" });
n("plow", "犂", "agr", 4, ["irrigation", "pastoralism"], { s: true, fx: { cap: 0.2 }, d: "家畜に引かせる犂。耕作の規模が広がる。" });
n("terracing", "段々畑", "agr", 5, ["plow", "masonry"], { fx: { cap: 0.08 }, d: "斜面を耕地にする。" });
n("crop_rotation", "輪作", "agr", 6, ["plow", "terracing"], { s: true, fx: { cap: 0.25 }, d: "休閑と作物の入れ替えで地力を保つ。" });
n("selective_breeding", "品種改良", "agr", 7, ["crop_rotation", "natural_philosophy"], { fx: { cap: 0.1 }, d: "選抜で作物と家畜を改良する。" });
n("seed_drill", "条播機", "agr", 8, ["crop_rotation", "precision_tools"], { fx: { cap: 0.1 }, d: "播種を機械化する。" });
n("fertilizer", "化学肥料", "agr", 9, ["selective_breeding", "chemistry"], { fx: { cap: 0.3 }, d: "窒素・リン酸を工業的に供給する。" });
n("agri_mechanization", "農業機械化", "agr", 10, ["seed_drill", "internal_combustion"], { fx: { cap: 0.25 }, d: "動力による耕作・収穫。" });
// ---- 建築
n("shelter", "住居", "bld", 1, ["hafted_tools", "hide_working"], { caps: ["pop:cold"], fx: { cap: 0.03 }, d: "小屋・テント・竪穴住居。" });
n("construction", "建築", "bld", 2, ["shelter"], { E: 9000000, pop: 300, caps: ["action:found_city"], d: "継続して住める家屋と公共の建物。", why: "共同で資材を運べる規模の集団" });
n("masonry", "石造", "bld", 3, ["construction"], { cond: "stone", pop: 600, d: "石材を積む。大きく長持ちする建造物。" });
n("brick", "煉瓦", "bld", 3, ["pottery", "construction"], { cond: "clay", fx: { cap: 0.03 }, d: "焼成煉瓦。石の乏しい土地でも大建築ができる。" });
n("fortification", "城壁", "bld", 4, ["masonry"], { pop: 500, caps: ["action:build_fortification", "unit:garrison"], fx: { def: 0.1 }, d: "都市を囲む壁。" });
n("roads", "道路", "bld", 4, ["construction", "wheel"], { pop: 1000, caps: ["trade:land_long"], fx: { trade: 0.08 }, d: "固めた道と橋。遠方との往来と補給。" });
n("aqueduct", "水道橋", "bld", 5, ["masonry", "irrigation"], { pop: 4000, fx: { cap: 0.06, health: 0.04 }, d: "水を遠くから都市へ運ぶ。" });
n("city_planning", "都市計画", "bld", 6, ["roads", "administration"], { pop: 6000, fx: { cap: 0.05, tax: 0.05 }, d: "区画・街路・市場の配置を統治が決める。" });
n("concrete", "コンクリート", "bld", 7, ["masonry", "chemistry"], { d: "水硬性の材料で大構造物を作る。" });
n("structural_steel", "鉄骨構造", "bld", 9, ["steel", "concrete", "industry"], { fx: { cap: 0.08 }, d: "高層・長大橋梁。" });
// ---- 輸送・航海
n("seafaring", "航海", "trn", 2, ["cordage"], { E: 5000000, cond: "coast", pop: 300, caps: ["move:sea", "subsist:fishing"], d: "筏・丸木舟で海・湖へ出る。", why: "海岸に近く、縄・網を使い、一定の規模の集団" });
n("wheel", "車輪", "trn", 3, ["pottery", "construction"], { pop: 600, d: "車輪と轆轤。運搬が楽になる。" });
n("cart", "荷車", "trn", 4, ["wheel", "pastoralism"], { fx: { trade: 0.05 }, d: "家畜が引く荷車。" });
n("shipbuilding", "造船", "trn", 4, ["seafaring", "construction"], { cond: "coast", caps: ["unit:navy"], fx: { trade: 0.05 }, d: "竜骨と板張りの船。" });
n("harbor", "港湾", "trn", 5, ["shipbuilding", "masonry"], { cond: "coast", pop: 3000, caps: ["trade:sea_long"], fx: { trade: 0.12 }, d: "港・桟橋・倉庫。海上交易の拠点。" });
n("navigation", "航法", "trn", 6, ["astronomy", "shipbuilding"], { caps: ["move:ocean"], d: "星と羅針で外洋を渡る。" });
n("ocean_sailing", "外洋帆船", "trn", 7, ["navigation", "harbor"], { fx: { trade: 0.12 }, d: "大洋を渡る帆船。" });
n("steamship", "蒸気船", "trn", 9, ["steam_engine", "shipbuilding"], { fx: { trade: 0.15 }, d: "風に依らない大型船。" });
n("railway", "鉄道", "trn", 9, ["steam_engine", "steel"], { caps: ["trade:rail"], fx: { trade: 0.2, cap: 0.05 }, d: "鉄の道を蒸気機関車が走る。" });
n("motor_vehicle", "自動車", "trn", 10, ["internal_combustion", "roads"], { fx: { trade: 0.1 }, d: "内燃機関の車。" });
n("aviation", "航空", "trn", 11, ["internal_combustion", "precision_tools", "motor_vehicle"], { caps: ["unit:air"], d: "動力による飛行。" });
// ---- 数学・測量・天文
n("counting", "計数", "sci", 2, ["stone_tools"], { fx: { learn: 0.05 }, d: "数を刻み、数える。" });
n("calendar", "暦", "sci", 3, ["record_keeping", "counting"], { s: true, d: "季節と天体から年を数える。", why: "記録の習慣があり、季節が農耕・祭祀に結びつく" });
n("mathematics", "数学", "sci", 4, ["writing", "counting"], { fx: { learn: 0.05 }, d: "算術・幾何。" });
n("surveying", "測量", "sci", 4, ["mathematics", "construction"], { d: "土地と距離を測る。", caps: ["admin:land_survey"] });
n("astronomy", "天文", "sci", 5, ["calendar", "mathematics"], { d: "天体の運行を観測し予測する。" });
n("optics", "光学", "sci", 7, ["glassmaking", "mathematics"], { d: "レンズによる観測。" });
n("natural_philosophy", "自然哲学", "sci", 7, ["mathematics", "writing", "astronomy"], { pop: 5000, fx: { learn: 0.05 }, d: "自然を理由づけて理解しようとする伝統。" });
n("scientific_method", "実験科学", "sci", 8, ["natural_philosophy", "printing"], { fx: { learn: 0.15 }, d: "観察・実験・公表で知識を積み上げる。" });
n("calculus", "微積分", "sci", 8, ["mathematics", "natural_philosophy"], { d: "変化を数式で扱う。" });
n("statistics", "統計", "sci", 9, ["mathematics", "bureaucracy", "scientific_method"], { fx: { tax: 0.04 }, d: "集計から全体を知る。" });
// ---- 記録・文字・通信
n("oral_tradition", "口承", "rec", 1, ["stone_tools"], { fx: { learn: 0.06 }, d: "言葉と歌で知識を世代へ渡す。" });
n("symbol_marks", "記号", "rec", 2, ["oral_tradition", "counting"], { d: "刻み目・絵・印で数や所有を残す。" });
n("record_keeping", "記録", "rec", 3, ["pottery", "symbol_marks"], { pop: 800, s: true, caps: ["admin:records"], fx: { learn: 0.05 }, d: "粘土板・結縄で在庫と取引を残す。", why: "貯蔵と取引が増えて、記憶だけでは足りなくなる" });
n("writing", "文字", "rec", 4, ["record_keeping"], { pop: 1000, s: true, caps: ["action:covert_op"], fx: { learn: 0.12 }, d: "言葉を写す体系。" });
n("alphabet", "表音文字", "rec", 5, ["writing"], { fx: { learn: 0.1 }, d: "音を少数の文字で表す。読み書きが広がる。" });
n("papermaking", "紙", "rec", 6, ["writing"], { pop: 3000, fx: { learn: 0.1 }, d: "軽く安い記録媒体。" });
n("postal_system", "駅伝・郵便", "rec", 6, ["roads", "writing", "administration"], { caps: ["admin:courier"], d: "公の通信網。" });
n("printing", "印刷", "rec", 7, ["papermaking"], { pop: 5000, fx: { learn: 0.2 }, d: "複製が安くなり、知識が速く広がる。" });
n("newspapers", "新聞", "rec", 8, ["printing", "alphabet"], { fx: { learn: 0.06 }, d: "定期刊行の情報。" });
n("telegraph", "電信", "rec", 9, ["electricity"], { d: "電気信号で即時に通信する。" });
n("radio", "無線通信", "rec", 10, ["telegraph", "electric_grid"], { fx: { learn: 0.1, trade: 0.04 }, d: "電波で通信・放送する。" });
n("computing", "計算機", "rec", 11, ["electricity", "calculus", "precision_tools"], { fx: { learn: 0.15, ind: 0.1 }, d: "電子計算。" });
// ---- 医療・衛生
n("herbalism", "薬草", "med", 1, ["foraging_arts"], { fx: { health: 0.03 }, d: "薬になる植物の経験知。" });
n("bone_setting", "外傷の手当", "med", 2, ["herbalism", "hafted_tools"], { fx: { health: 0.03 }, d: "骨折・外傷の処置。" });
n("medicine", "医学", "med", 4, ["herbalism", "writing"], { fx: { health: 0.05 }, d: "症状と治療を記録し体系化する。" });
n("hygiene_practice", "公衆衛生の習慣", "med", 5, ["medicine", "aqueduct"], { pop: 4000, fx: { health: 0.06, cap: 0.03 }, d: "水・排泄・埋葬の管理。" });
n("sanitation", "衛生", "med", 6, ["medicine", "hygiene_practice"], { pop: 5000, fx: { cap: 0.1, health: 0.08 }, d: "上下水道・ごみの管理。都市が大きくなれる。" });
n("quarantine", "検疫", "med", 6, ["medicine", "harbor"], { d: "疫病の流入を隔離で防ぐ。", fx: { health: 0.04 } });
n("anatomy", "解剖学", "med", 7, ["medicine", "natural_philosophy"], { d: "身体の構造を観察する。" });
n("germ_theory", "病原体説", "med", 9, ["optics", "chemistry", "anatomy"], { fx: { health: 0.12 }, d: "微生物が病気を起こすという理解。" });
n("vaccination", "予防接種", "med", 9, ["germ_theory"], { fx: { health: 0.1, cap: 0.05 }, d: "感染症を予防する。" });
n("antibiotics", "抗生物質", "med", 10, ["germ_theory", "chemistry", "industry"], { fx: { health: 0.12, cap: 0.05 }, d: "細菌感染の治療。" });
// ---- 統治・行政・法
n("kin_council", "長老会議", "gov", 1, ["oral_tradition"], { caps: ["polity:chiefdom"], d: "年長者・有力者が集まり決める。" });
n("administration", "行政", "gov", 4, ["writing", "kin_council"], { pop: 1500, caps: ["polity:kingdom", "admin:officials"], fx: { tax: 0.25 }, d: "官職と記録による統治。", why: "文字があり、数千人規模の集住" });
n("law", "法", "gov", 5, ["administration"], { caps: ["polity:republic"], fx: { tax: 0.05 }, d: "成文の規則と裁き。" });
n("census", "戸籍・人口調査", "gov", 5, ["administration", "counting"], { fx: { tax: 0.06 }, d: "人と土地を数える。" });
n("diplomacy", "外交慣行", "gov", 5, ["writing", "kin_council"], { caps: ["treaty:alliance"], d: "使節・誓約・条約の書式。" });
n("tax_system", "租税制度", "gov", 5, ["administration", "record_keeping"], { caps: ["policy:tax_high"], fx: { tax: 0.1 }, d: "定まった税目と徴収。" });
n("bureaucracy", "官僚制", "gov", 6, ["law", "census", "tax_system"], { pop: 8000, caps: ["polity:empire"], fx: { tax: 0.3 }, d: "階層化された官吏組織。" });
n("civil_service", "官吏登用", "gov", 7, ["bureaucracy", "papermaking"], { fx: { tax: 0.08, learn: 0.05 }, d: "試験・資格による登用。" });
n("constitutionalism", "立憲主義", "gov", 8, ["law", "printing"], { d: "権力を法で縛る。" });
n("parliament", "議会制", "gov", 9, ["constitutionalism"], { caps: ["policy:parliament"], fx: { tax: 0.04 }, d: "代表が集まり決める。" });
n("public_education", "公教育", "gov", 9, ["printing", "bureaucracy"], { fx: { learn: 0.15 }, d: "広く読み書きを教える。" });
// ---- 経済・金融
n("barter_networks", "交換網", "eco", 2, ["cordage", "oral_tradition"], { caps: ["treaty:nonaggression"], d: "集団どうしが産物を交換する。" });
n("trade_routes", "長距離交易", "eco", 3, ["barter_networks"], { caps: ["treaty:trade", "action:impose_sanctions"], fx: { trade: 0.1 }, d: "遠方との定期的な交易路。" });
n("markets", "市場", "eco", 4, ["trade_routes", "record_keeping"], { pop: 1500, s: true, fx: { trade: 0.08, tax: 0.05 }, d: "定期・常設の市。" });
n("weights_measures", "度量衡", "eco", 4, ["counting", "administration"], { fx: { trade: 0.04 }, d: "計量の統一。" });
n("coinage", "貨幣", "eco", 5, ["bronze", "weights_measures"], { pop: 2000, caps: ["econ:coinage"], fx: { tax: 0.2, trade: 0.1 }, d: "価値を保証した金属貨幣。" });
n("banking", "金融", "eco", 7, ["coinage", "mathematics"], { pop: 8000, caps: ["econ:credit"], fx: { tax: 0.25, ind: 0.05 }, d: "預かり・貸付・為替。" });
n("credit_notes", "手形・信用", "eco", 7, ["banking", "writing"], { fx: { trade: 0.08 }, d: "遠隔の決済。" });
n("joint_stock", "株式会社", "eco", 8, ["banking", "law"], { fx: { ind: 0.1 }, d: "出資者が有限の責任で事業を共有する。" });
n("insurance", "保険", "eco", 9, ["banking", "statistics"], { fx: { trade: 0.05 }, d: "危険を広く分散する。" });
n("central_bank", "中央銀行", "eco", 10, ["banking", "bureaucracy", "statistics"], { fx: { tax: 0.05 }, d: "通貨と信用の管理。" });
// ---- 軍事・兵站
n("hunting_weapons", "狩猟具", "mil", 1, ["hafted_tools"], { fx: { off: 0.02 }, d: "投槍・罠。" });
n("bow", "弓", "mil", 2, ["hafted_tools", "cordage"], { caps: ["unit:ranged"], fx: { off: 0.03 }, d: "弓矢。" });
n("bronze_weapons", "青銅武器", "mil", 3, ["bronze"], { caps: ["unit:ranged"], fx: { off: 0.2 }, d: "青銅の剣・槍・鏃。" });
n("chariot", "戦車", "mil", 4, ["wheel", "horse_riding", "bronze_weapons"], { fx: { off: 0.1 }, d: "馬に引かせる戦闘用の車。" });
n("cavalry", "騎兵", "mil", 4, ["horse_riding", "bronze_weapons"], { caps: ["unit:cavalry"], fx: { off: 0.3 }, d: "騎乗戦闘部隊。" });
n("iron_weapons", "鉄武器", "mil", 5, ["iron", "bronze_weapons"], { fx: { off: 0.35 }, d: "鉄の剣・槍・鎧。" });
n("siege_engines", "攻城兵器", "mil", 5, ["iron_weapons", "construction"], { fx: { off: 0.05 }, d: "破城槌・投石機。" });
n("standing_army", "常備軍", "mil", 6, ["administration", "iron_weapons", "tax_system"], { fx: { off: 0.08, def: 0.04 }, d: "平時にも維持される職業軍。" });
n("military_logistics", "兵站", "mil", 6, ["roads", "administration"], { d: "補給の組織化。遠い戦場へ軍を送れる。", caps: ["war:far"] });
n("naval_warfare", "海戦術", "mil", 6, ["shipbuilding", "iron_weapons"], { caps: ["war:naval"], fx: { off: 0.05 }, d: "艦隊の編成と衝角・接舷戦。" });
n("gunpowder", "火薬", "mil", 7, ["steel", "mathematics", "chemistry"], { pop: 8000, caps: ["unit:firearms"], fx: { off: 0.8 }, d: "黒色火薬。" });
n("firearms", "銃", "mil", 8, ["gunpowder", "precision_tools"], { fx: { off: 0.1 }, d: "火縄銃から燧発銃へ。" });
n("artillery", "火砲", "mil", 8, ["gunpowder", "bellows"], { fx: { off: 0.1, def: 0.03 }, d: "大砲による城攻めと野戦。" });
n("rifled_arms", "施条銃", "mil", 9, ["firearms", "precision_tools"], { fx: { off: 0.1 }, d: "命中精度の高い小銃。" });
n("mechanized_warfare", "機械化戦", "mil", 11, ["motor_vehicle", "steel", "standing_army"], { caps: ["unit:armor"], fx: { off: 0.2 }, d: "車両・無線を用いる軍。" });
// ---- エネルギー・産業
n("mining", "採鉱", "ind", 3, ["bronze", "construction"], { pop: 500, d: "坑道を掘り鉱石を得る。", fx: { ind: 0.05 } });
n("waterwheel", "水車", "ind", 4, ["construction", "wheel"], { cond: "water", fx: { ind: 0.1 }, d: "水の力で挽く・叩く。" });
n("windmill", "風車", "ind", 6, ["waterwheel"], { fx: { ind: 0.06 }, d: "風の力。" });
n("coal_mining", "石炭採掘", "ind", 7, ["mining", "bellows"], { cond: "coal", pop: 6000, fx: { ind: 0.1 }, d: "石炭を燃料とする。" });
n("steam_engine", "蒸気機関", "ind", 8, ["coal_mining", "precision_tools"], { pop: 15000, fx: { ind: 0.25 }, d: "熱を動力に変える。" });
n("industry", "機械工業", "ind", 9, ["steel", "steam_engine", "banking"], { pop: 20000, fx: { ind: 0.5 }, d: "工場と機械による大量生産。" });
n("electricity", "電気", "ind", 10, ["industry"], { pop: 40000, fx: { ind: 0.3 }, d: "発電と電動機。" });
n("internal_combustion", "内燃機関", "ind", 10, ["industry", "chemistry"], { fx: { ind: 0.15 }, d: "石油を燃料とする小型の動力。" });
n("petroleum", "石油", "ind", 10, ["chemistry", "mining"], { cond: "coal", d: "石油の採掘と精製。", fx: { ind: 0.1 } });
n("electric_grid", "送電網", "ind", 11, ["electricity", "industry"], { fx: { ind: 0.2 }, d: "電力を広域に配る。" });
n("nuclear", "核", "ind", 11, ["electricity", "calculus"], { pop: 100000, caps: ["action:nuclear_program"], fx: { ind: 0.1 }, d: "原子核のエネルギー。" });

// 列（col）= max(宣言した時代, 前提の列 + 1)。左から右へだけ進むことを、データの手書きではなく構造で保証する（前提の位置は必ず自分より左）
{ const by = new Map(nodes.map((x) => [x.id, x])), memo = new Map(), colOf = (id, seen = new Set()) => { if (memo.has(id)) return memo.get(id); if (seen.has(id)) throw new Error("技術ツリーに循環がある: " + id); seen.add(id); const t = by.get(id); let c = t.stage; for (const p of t.prereq) c = Math.max(c, colOf(p, seen) + 1); memo.set(id, c); return c; }; for (const t of nodes) t.col = colOf(t.id); }
export const TREE = Object.freeze(nodes.map((x) => Object.freeze(x)));
export const COLS = Math.max(...nodes.map((x) => x.col)) + 1;
export const NODE = Object.freeze(Object.fromEntries(TREE.map((x) => [x.id, x])));
export const LANE = Object.freeze(Object.fromEntries(LANES.map((l) => [l.id, l])));
/** 各ノードの座標（グリッド）。(lane, stage) ごとに、定義順で slot を振る。状態では動かない */
export function layoutGrid() {
  const slot = new Map(), lanes = LANES.map((l) => l.id), count = new Map(), pos = {};
  for (const t of TREE) { const k = t.lane + "|" + t.col, i = count.get(k) ?? 0; count.set(k, i + 1); slot.set(t.id, i); }
  // レーンごとの行数 = そのレーンの各ステージの最大 slot 数。レーンの y 開始位置はそれらの累積
  const rows = {}; for (const l of lanes) rows[l] = 1; for (const [k, c] of count) { const l = k.split("|")[0]; rows[l] = Math.max(rows[l], c); }
  const y0 = {}; let acc = 0; for (const l of lanes) { y0[l] = acc; acc += rows[l]; }
  for (const t of TREE) pos[t.id] = { col: t.col, row: y0[t.lane] + slot.get(t.id), lane: t.lane };
  return { pos, rows, y0, totalRows: acc, cols: COLS };
}
/** 構造の検査: 前提の存在・前提の stage が小さい・循環なし・ID 重複なし・各ノードに意味（解禁・効果・他の前提になる）がある */
export function validateTree(tree = TREE) {
  const errs = [], by = new Map(); for (const t of tree) { if (by.has(t.id)) errs.push(`ID 重複 ${t.id}`); by.set(t.id, t); }
  const used = new Set(); for (const t of tree) for (const p of t.prereq) used.add(p);
  for (const t of tree) {
    if (!LANE[t.lane]) errs.push(`${t.id}: 未知のレーン ${t.lane}`); if (!(t.stage >= 0 && t.stage < STAGES.length)) errs.push(`${t.id}: stage が範囲外`);
    for (const p of t.prereq) { const q = by.get(p); if (!q) errs.push(`${t.id}: 前提 ${p} が無い`); else if (q.col >= t.col) errs.push(`${t.id}: 前提 ${p} の列が同じか右（左から右へ進まない）`); }
    if (t.id !== "stone_tools" && !t.prereq.length) errs.push(`${t.id}: 前提が無い（根は石器だけ）`);
    if (!t.caps.length && !Object.keys(t.fx).length && !used.has(t.id)) errs.push(`${t.id}: 解禁も効果も後続も無い（効果のないノード）`);
  }
  return errs;
}
