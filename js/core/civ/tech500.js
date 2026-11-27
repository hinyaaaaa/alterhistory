// v7.1.0: 人類の技術・制度・思想 500 項目（20 分野・各 25 項目）。技術ツリーの正本。
//   書式: 「名前|時代(stage 0〜12)|=既存の仕組みの id（あれば）」。時代は techtree.js の STAGES と同じ（0 原初 … 11 現代・12 未来）。
//   既存の id を付けた項目は、これまでの効果・解禁・成立条件をそのまま引き継ぐ（部隊・政体・条約など、技術で決まる仕組みが壊れない）。
//   id を付けない項目は「分野_番号」。前提は「同じ分野の、ひとつ前の時代の項目」と、CROSS に書いた分野をまたぐ結びつき。
export const FAMILIES = Object.freeze([
  { id: "phys", ja: "物理技術", note: "物質・エネルギー・自然環境を扱う" },
  { id: "info", ja: "情報技術", note: "情報を記録し、伝え、処理する" },
  { id: "inst", ja: "社会制度", note: "人の集まりを組織し、動かす" },
  { id: "idea", ja: "思想体系", note: "社会・国家・経済のあり方についての考え" },
]);
export const FIELDS = Object.freeze([
  { id: "food", ja: "食と保存", fam: "phys", glyph: "◐" }, { id: "agri", ja: "農業", fam: "phys", glyph: "❀" }, { id: "water", ja: "水と環境", fam: "phys", glyph: "≈" },
  { id: "mat", ja: "素材", fam: "phys", glyph: "◆" }, { id: "bld", ja: "建築", fam: "phys", glyph: "▣" }, { id: "mech", ja: "機械", fam: "phys", glyph: "⚙" },
  { id: "energy", ja: "エネルギー", fam: "phys", glyph: "ϟ" }, { id: "trans", ja: "交通", fam: "phys", glyph: "➤" }, { id: "comm", ja: "通信", fam: "info", glyph: "✎" },
  { id: "sci", ja: "数理と観測", fam: "info", glyph: "∑" }, { id: "med", ja: "医療", fam: "phys", glyph: "✚" }, { id: "bio", ja: "生命", fam: "phys", glyph: "❦" },
  { id: "chem", ja: "化学", fam: "phys", glyph: "⚗" }, { id: "digi", ja: "計算機", fam: "info", glyph: "▤" }, { id: "ai", ja: "知能", fam: "info", glyph: "◎" },
  { id: "econ", ja: "経済", fam: "inst", glyph: "¤" }, { id: "gov", ja: "統治", fam: "inst", glyph: "⚖" }, { id: "ideo", ja: "思想", fam: "idea", glyph: "✦" },
  { id: "edu", ja: "知と学び", fam: "inst", glyph: "❖" }, { id: "future", ja: "先端", fam: "phys", glyph: "✧" },
]);
const D = {
  food: `火の利用|0|=fire_control
焼成調理|1
煮沸調理|2
食料乾燥|2|=food_preservation
燻製保存|2
食品発酵|2
塩蔵保存|3
土器調理|3
穀物の粉砕|3
製粉|4
パン製造|4
油脂の圧搾|4
乳製品加工|3
漬物|4
地下貯蔵庫|4
氷室|5
砂糖の精製|6
密封保存|8
缶詰|9
低温殺菌|9
冷凍保存|10
機械式冷蔵|10
冷凍乾燥|11
冷蔵輸送|11
精密発酵食品|12`,
  agri: `採集の管理|1|=foraging_arts
作物の栽培化|2|=agriculture
種子の選別|3
焼畑|3
耕起農業|3
犂耕|4|=plow
灌漑|3|=irrigation
棚田|5|=terracing
輪作|6|=crop_rotation
休耕制度|5
堆肥|5
家畜糞の肥料|5
接ぎ木|6
果樹園|5
温室栽培|8
品種改良|7|=selective_breeding
播種機|8|=seed_drill
農業機械化|10|=agri_mechanization
生物的防除|10
総合的病害虫管理|11
点滴灌漑|11
水耕栽培|11
垂直農業|12
精密農業|11
衛星農地管理|12`,
  water: `井戸掘削|3
貯水槽|3
雨水貯留|3
水路|3
運河|5
水道橋|5|=aqueduct
堤防|4
ダム|8
排水設備|4
上下水道|9|=sanitation
水のろ過|6
水道の消毒|10
下水処理|10
雨水排水網|8
地下水涵養|10
海水淡水化|11
逆浸透膜|11
流域管理|9
土壌保全|9
砂漠化防止|10
森林再生|10
湿地再生|11
保護区の管理|10
生物多様性の観測|11
生態系の修復|12`,
  mat: `石器加工|0|=stone_tools
粘土焼成|2|=pottery
煉瓦|3|=brick
石灰モルタル|4
ガラス|5|=glassmaking
銅の精錬|3|=copper_working
青銅|3|=bronze
鉄の製錬|4|=iron
鍛鉄|5|=bellows
鋳鉄|6
鋼|7|=steel
陶器|5
磁器|6
セメント|8|=concrete
アルミニウム精錬|10
電気めっき|9
合成ゴム|10
合成樹脂|10
合成繊維|10
ステンレス鋼|10
半導体シリコン|11
複合材料|11
炭素繊維|11
グラフェン|12
自己修復材料|12`,
  bld: `巨石建造|2
木造軸組|2|=construction
日干し煉瓦建築|3
石造建築|3|=masonry
アーチ|4
ヴォールト|5
ドーム|5
木造トラス|5
石橋|5
吊橋|7
鉄筋コンクリート|9
鉄骨構造|9|=structural_steel
高層建築|10
昇降機|10
プレハブ建築|10
モジュール建築|11
トンネル掘削|7
杭基礎|6
耐震構造|10
耐風構造|10
都市計画|6|=city_planning
格子状の街路|4
地下インフラ網|10
スマートビル|12
3D 造形建築|12`,
  mech: `てこ|2
滑車|3
車輪と車軸|3|=wheel
歯車|4
ねじ|5
カム|5
クランク|6
機械式時計|7
水車|4|=waterwheel
風車|6|=windmill
旋盤|7
フライス盤|9
精密工作|8|=precision_tools
互換部品|9
工場制手工業|9|=industry
流れ作業|10
大量生産|10
CNC 加工|11
金属鋳造|5
粉末冶金|10
溶接|10
射出成形|10
3D 造形|11
微細加工|11
デジタルツイン製造|12`,
  energy: `薪の燃料|1
木炭|3
石炭|7|=coal_mining
蒸気機関|8|=steam_engine
水力発電|10
水力タービン|9
風力発電|11
内燃機関|10|=internal_combustion
発電機|10|=electricity
交流送電|11|=electric_grid
火力発電|10
原子力発電|11|=nuclear
太陽熱|10
太陽光発電|11
地熱発電|11
バイオ燃料|11
燃料電池|11
リチウムイオン電池|11
蓄電システム|11
揚水発電|11
スマートグリッド|11
需要調整|11
水素エネルギー|12
長時間蓄電|12
核融合発電|12|=fusion_power`,
  trans: `そり|1
荷車|4|=cart
帆船|4|=shipbuilding
航路の開拓|7|=ocean_sailing
道路網|4|=roads
舗装道路|6
街道と橋|6
運河輸送|6
海図航法|6|=navigation
磁針航法|6
駅伝|5
馬車|6
蒸気機関車|9|=railway
蒸気船|9|=steamship
自転車|9
自動車|10|=motor_vehicle
航空機|11|=aviation
コンテナ輸送|11
気動車|10
地下鉄|10
高速鉄道|11
ジェット旅客機|11
衛星測位|11
自動運転|12
駄獣輸送|3`,
  comm: `身振りと記号|1|=symbol_marks
文字|4|=writing
粘土板の記録|3|=record_keeping
パピルスと羊皮紙|5
紙|6|=papermaking
写本|6
木版印刷|7
活字印刷|8|=printing
印刷機|8
新聞|9|=newspapers
郵便|7|=postal_system
手旗通信|6
電信|10|=telegraph
電話|10
ラジオ|10|=radio
テレビ|11
通信衛星|11|=satellites
光ファイバー|11
パケット通信|11
インターネット|11
電子メール|11
携帯通信|11
ビデオ会議|11
交流サイト|11
分散型通信網|12`,
  sci: `数|2|=counting
位取り記数|4
ゼロ|5
そろばん|5
幾何学|4|=mathematics
代数学|5
三角法|6
微積分|8|=calculus
確率論|8
統計学|9|=statistics
数理論理|10
度量衡|4|=weights_measures
標準単位|9
暦|3|=calendar
機械時計の計時|7
振り子時計|8
望遠鏡|7|=optics
顕微鏡|8
温度計|8
気圧計|8
分光分析|10
科学的方法|8|=scientific_method
対照実験|9
査読|9
計算機シミュレーション|11`,
  med: `薬草|1|=herbalism
人体の観察|5|=anatomy
医療の記録|4|=medicine
病院|5
隔離と検疫|6|=quarantine
公衆衛生|7
種痘|8
ワクチン|9|=vaccination
麻酔|9
消毒|9
細菌学|9|=germ_theory
微生物検査|10
抗生物質|10|=antibiotics
血液型判定|10
輸血|10
X 線撮影|10
超音波検査|11
CT 検査|11
MRI 検査|11
臓器移植|11
人工透析|11
生殖補助|11
遠隔医療|11
個別化医療|12
再生医療|12`,
  bio: `微生物の利用|2
作物の選抜|4
家畜の選抜|4
遺伝の法則|9
染色体説|10
DNA 構造の解明|11
組換え DNA|11
塩基配列解析|11
PCR 法|11
ゲノム解析|11
遺伝子工学|11
ゲノム編集|12
合成生物学|12
改変微生物|11
精密発酵|12
組織培養|11
クローン増殖|11
生物試料の凍結|11
幹細胞培養|11
オルガノイド|12
培養肉|12
mRNA 技術|12
遺伝子治療|12
細胞治療|12
人工細胞|12`,
  chem: `石鹸|4
鉱物顔料|3
天然染料|3
なめし|3
蒸留|6
酸とアルカリ|6
化学の体系|8|=chemistry
元素周期表|9
工業電解|10
アンモニア合成|10
硫酸|9
合成染料|10
石油精製|10|=petroleum
石油化学|10
化学肥料|10|=fertilizer
高分子化学|10
触媒|10
クロマトグラフィー|10
膜分離|11
工業バイオプロセス|11
グリーンケミストリー|11
溶媒の再生|11
低炭素プロセス|12
難分解物質の分解|12
CO2 回収・利用|12`,
  digi: `機械式計算機|8
パンチカード|10
アナログ計算機|10
デジタル計算機|11|=computing
プログラム内蔵方式|11
トランジスタ|11
集積回路|11
マイクロプロセッサ|11
半導体メモリ|11
基本ソフト|11
プログラミング言語|11
関係データベース|11
計算機ネットワーク|11
公開鍵暗号|11
情報セキュリティ|11
クラウド|11
分散計算|11
仮想化|11
公開ソフトウェア|11
スマートフォン|11
エッジ計算|12
ブロックチェーン|12
ビッグデータ解析|11
データ統合基盤|12
秘匿計算|12`,
  ai: `フィードバック制御|10
サーボ機構|10
自動制御|10
産業用ロボット|11
機械視覚|11
エキスパートシステム|11
ニューラルネット|11
機械学習|12|=machine_learning
深層学習|12
強化学習|12
言語処理|12
音声認識|12
画像認識|12
推薦システム|12
協働ロボット|12
自律移動ロボット|12
医療支援ロボット|12
農業ロボット|12
物流ロボット|12
生成 AI|12
複合感覚 AI|12
AI エージェント|12
ニューロモーフィック計算|12
汎用ロボット制御|12
自律型科学研究|12`,
  econ: `物々交換|2|=barter_networks
共通尺度の交易|3|=trade_routes
貨幣制度|4|=markets
金属貨幣|5|=coinage
信用取引|6
銀行|7|=banking
複式簿記|7
為替手形|7|=credit_notes
保険|9|=insurance
株式会社|8|=joint_stock
株式市場|9
中央銀行|10|=central_bank
紙幣|8
不換紙幣|10
有限責任|9
協同組合|9
労働組合|9
官民連携|10
福祉経済|10
市場経済|9
計画経済|10
混合経済|10
国有企業|10
循環型経済|11
デジタル経済|11`,
  gov: `成文法|5|=law
裁判|5
契約|5|=diplomacy
戸籍|5|=census
国勢調査|8
土地台帳|4|=surveying
徴税|5|=tax_system
官僚制|6|=bureaucracy
能力による登用|7|=civil_service
公文書館|7
議会|9|=parliament
立憲政治|8|=constitutionalism
三権分立|9
司法の独立|9
選挙|9
普通選挙|10
連邦制|9
地方自治|9
国家予算|9
公的統計|10
社会保険|10
年金|10
公教育行政|9|=public_education
国際機関|11
電子政府|11`,
  ideo: `神授王権|5
徳治思想|5
法治思想|5
古典共和主義|5
立憲主義|8
自由主義|9
保守主義|9
民族主義|9
社会主義|10
階級闘争論|10
共産主義|10
社会民主主義|10
無政府主義|10
労働組合主義|10
職能代表主義|10
宗教民主主義|10
自由至上主義|11
市民的民族主義|10
反植民地主義|11
女性解放思想|10
環境主義|11
専門家統治論|11
能力主義|10
世界市民主義|10
共同体主義|11`,
  edu: `口承|1|=oral_tradition
徒弟制|4
学校|5
書記の養成|4|=administration
図書館|5
アカデミー|7
大学|6
科挙|7
職業教育|9
義務教育|9
識字運動|9
公的研究機関|10
学会|8
博物館|8
公文書の保存|8
標準課程|10
通信教育|10
公開教材|11
デジタル教育|11
大衆出版|9
翻訳機関|6
特許|8
著作権|9
地域の共同体組織|3
国際学術協力|10`,
  future: `商用核融合|12
次世代原子炉|12
全固体電池|12
ナトリウムイオン電池|12
分散型電力網|12
次世代蓄電|12
リチウム直接抽出|12
放射冷却材料|12
高度分解|12
CO2 直接回収|12
人工光合成|12
グリーン水素|12
高温超伝導送電|12
誤り耐性量子計算|12
量子通信網|12
光計算|12
脳型計算|12
脳機械接続|12
次世代遺伝子治療|12
人工細胞プログラム|12
臓器の印刷|12
海洋エネルギー|12
宇宙太陽光発電|12
軌道上製造|12
宇宙資源採掘|12`,
};
// 情報技術に当たる先端の項目（分野は「先端」だが、系統は情報）
const FUTURE_INFO = new Set(["誤り耐性量子計算", "量子通信網", "光計算", "脳型計算", "脳機械接続"]);
/** 分野をまたぐ前提: 項目名 → 前提の項目名（時代が自分より前のものだけが有効） */
const CROSS = `
蒸気機関>石炭,鉄の製錬
内燃機関>鋼
発電機>機械式時計,鋼
原子力発電>発電機,微積分
水力発電>水力タービン,発電機
太陽光発電>半導体シリコン
風力発電>発電機
自動車>内燃機関
航空機>内燃機関,精密工作
ジェット旅客機>航空機,アルミニウム精錬
自動運転>機械学習
鉄筋コンクリート>セメント,鉄の製錬
高層建築>鉄骨構造,昇降機
昇降機>蒸気機関
ダム>石造建築,水路
上下水道>水道橋,医療の記録
下水処理>上下水道,細菌学
水道の消毒>細菌学,上下水道
運河>水路,土地台帳
銅の精錬>火の利用
鉄の製錬>青銅
アルミニウム精錬>発電機
半導体シリコン>化学の体系,発電機
トランジスタ>半導体シリコン,デジタル計算機
集積回路>トランジスタ
電話>電信
テレビ>ラジオ
光ファイバー>ガラス,電話
インターネット>パケット通信,計算機ネットワーク
パケット通信>デジタル計算機
計算機ネットワーク>デジタル計算機,電話
携帯通信>ラジオ,集積回路
活字印刷>紙,鋳鉄
木版印刷>紙
紙>文字
写本>紙
新聞>活字印刷
郵便>道路網,文字
電信>発電機
ラジオ>電信,発電機
機械式計算機>歯車,代数学
フィードバック制御>機械式時計,発電機
産業用ロボット>デジタル計算機,フィードバック制御
ニューラルネット>デジタル計算機,統計学
機械学習>統計学,デジタル計算機
計算機シミュレーション>デジタル計算機,微積分
位取り記数>数
ゼロ>位取り記数
代数学>幾何学,ゼロ
三角法>幾何学,代数学
確率論>代数学
統計学>確率論,国勢調査
数理論理>代数学
標準単位>度量衡,科学的方法
顕微鏡>ガラス
温度計>ガラス
気圧計>ガラス
分光分析>望遠鏡,化学の体系
科学的方法>代数学,活字印刷
対照実験>科学的方法
査読>科学的方法,活字印刷
麻酔>化学の体系
消毒>細菌学
抗生物質>細菌学,化学の体系
X 線撮影>発電機
輸血>血液型判定
血液型判定>細菌学
超音波検査>発電機
CT 検査>X 線撮影,デジタル計算機
MRI 検査>CT 検査
臓器移植>輸血,消毒
人工透析>輸血
遺伝の法則>科学的方法,作物の選抜
染色体説>遺伝の法則,顕微鏡
DNA 構造の解明>染色体説,化学の体系
組換え DNA>DNA 構造の解明
塩基配列解析>DNA 構造の解明,デジタル計算機
PCR 法>組換え DNA
ゲノム解析>塩基配列解析
遺伝子工学>組換え DNA
ゲノム編集>遺伝子工学
mRNA 技術>遺伝子工学
元素周期表>化学の体系
アンモニア合成>元素周期表,工業電解
硫酸>化学の体系
工業電解>発電機,化学の体系
石油化学>石油精製
合成ゴム>石油化学
合成樹脂>石油化学
合成繊維>石油化学
高分子化学>石油化学
複合材料>合成樹脂
炭素繊維>合成繊維
貨幣制度>共通尺度の交易
金属貨幣>青銅,度量衡
信用取引>貨幣制度,文字
複式簿記>信用取引,文字
株式市場>株式会社
紙幣>金属貨幣,紙
不換紙幣>紙幣,中央銀行
有限責任>株式会社,成文法
協同組合>工場制手工業
労働組合>工場制手工業
市場経済>貨幣制度,工場制手工業
計画経済>国勢調査,公的統計
混合経済>市場経済,計画経済
福祉経済>社会保険
デジタル経済>インターネット
循環型経済>化学肥料
裁判>成文法
官僚制>成文法,戸籍,徴税
国勢調査>戸籍,統計学
公文書館>官僚制,紙
三権分立>立憲政治
司法の独立>三権分立
選挙>議会
普通選挙>選挙,義務教育
連邦制>立憲政治
地方自治>官僚制
国家予算>徴税,複式簿記
公的統計>統計学,国勢調査
社会保険>保険,国家予算
年金>社会保険
国際機関>電信,契約
電子政府>インターネット,公的統計
神授王権>書記の養成,契約
徳治思想>書記の養成,文字
法治思想>成文法
古典共和主義>成文法,契約
立憲主義>古典共和主義,活字印刷
自由主義>立憲主義,新聞
保守主義>自由主義
民族主義>新聞,識字運動
社会主義>工場制手工業,新聞
階級闘争論>社会主義
共産主義>階級闘争論
社会民主主義>社会主義,普通選挙
無政府主義>社会主義,新聞
労働組合主義>労働組合,社会主義
職能代表主義>労働組合,国家予算
宗教民主主義>普通選挙,保守主義
自由至上主義>自由主義,株式市場
市民的民族主義>民族主義,普通選挙
反植民地主義>民族主義,電信
女性解放思想>自由主義,義務教育
環境主義>統計学,工場制手工業
専門家統治論>統計学,大学
能力主義>科挙,義務教育
世界市民主義>自由主義,電信
共同体主義>民族主義,自由主義
徒弟制>石器加工
学校>文字,書記の養成
大学>学校,図書館
図書館>文字
科挙>書記の養成,紙
アカデミー>大学,活字印刷
学会>アカデミー,活字印刷
博物館>アカデミー
特許>活字印刷,市場経済
著作権>特許,活字印刷
義務教育>学校,活字印刷
識字運動>義務教育,新聞
大衆出版>印刷機,識字運動
職業教育>義務教育,工場制手工業
公的研究機関>学会,国家予算
標準課程>義務教育,公的統計
通信教育>郵便,標準課程
公開教材>インターネット
デジタル教育>インターネット,標準課程
翻訳機関>文字,大学
国際学術協力>学会,電信
公文書の保存>公文書館,紙
商用核融合>核融合発電,機械学習
次世代原子炉>原子力発電,複合材料
全固体電池>リチウムイオン電池,グラフェン
ナトリウムイオン電池>リチウムイオン電池
分散型電力網>スマートグリッド,蓄電システム
次世代蓄電>蓄電システム,全固体電池
リチウム直接抽出>リチウムイオン電池,膜分離
放射冷却材料>複合材料,太陽熱
高度分解>難分解物質の分解,触媒
CO2 直接回収>CO2 回収・利用,膜分離
人工光合成>触媒,太陽光発電
グリーン水素>水素エネルギー,太陽光発電
高温超伝導送電>交流送電,複合材料
誤り耐性量子計算>集積回路,数理論理
量子通信網>誤り耐性量子計算,光ファイバー
光計算>集積回路,光ファイバー
脳型計算>ニューロモーフィック計算,集積回路
脳機械接続>脳型計算,機械学習
次世代遺伝子治療>ゲノム編集,遺伝子治療
人工細胞プログラム>人工細胞,合成生物学
臓器の印刷>3D 造形,オルガノイド
海洋エネルギー>水力タービン,蓄電システム
宇宙太陽光発電>太陽光発電,軌道上製造
軌道上製造>通信衛星,3D 造形
宇宙資源採掘>軌道上製造,自律型科学研究
`;
/** 分野ごとの根（同じ分野に前の時代の項目が無いときの前提）: 既存の id */
const ROOT = { food: "fire_control", agri: "foraging_arts", water: "construction", mat: "stone_tools", bld: "shelter", mech: "hafted_tools", energy: "fire_control", trans: "cordage", comm: "oral_tradition", sci: "stone_tools", med: "herbalism", bio: "fire_control", chem: "fire_control", digi: "mathematics", ai: "electricity", econ: "barter_networks", gov: "administration", ideo: "administration", edu: "oral_tradition", future: "electricity" };
/** 新しい項目の効果（既存の calibration を崩さないため、収容力（cap）は与えない。小さな値） */
const FX_KIND = { food: "health", agri: "ind", water: "health", mat: "ind", bld: "ind", mech: "ind", energy: "ind", trans: "trade", comm: "learn", sci: "learn", med: "health", bio: "health", chem: "ind", digi: "learn", ai: "learn", econ: "trade", gov: "tax", ideo: "learn", edu: "learn", future: "ind" };
const POP_BY_STAGE = [0, 0, 0, 0, 0, 0, 1500, 3000, 5000, 8000, 15000, 25000, 40000];
export const RECORDED_FIELDS = new Set(); // 歴史資料に残すのは、既存の id を持つ項目（主要な技術）だけ
const parseField = (id, text) => text.trim().split("\n").map((ln, i) => { const [name, st, lg] = ln.split("|"); return { field: id, name: name.trim(), stage: +st, legacy: lg ? lg.replace("=", "").trim() : null, idx: i + 1 }; });
export const DOC_ITEMS = Object.freeze(FIELDS.flatMap((f) => parseField(f.id, D[f.id])));
export const crossLinks = () => { const m = new Map(); for (const ln of CROSS.trim().split("\n")) { const [a, b] = ln.split(">"); m.set(a.trim(), b.split(",").map((x) => x.trim())); } return m; };
/**
 * 既存の節点（legacy）を、500 項目の木に組み替える。
 *   ・既存の id を持つ項目は、既存の節点を引き継ぐ（名前・分野・時代だけ差し替える）。
 *   ・前提のうち、木に残らない節点（採鉱・天文など）は、その前提へたどって付け替える。
 *   ・軍事の節点（mil）と、先史の土台・成立条件を担う節点は、そのまま残す（土台は hidden）。
 */
export function buildDocTree(legacy, E_BY_STAGE) {
  const by = new Map(legacy.map((n) => [n.id, n])), out = [], idOf = new Map(), byName = new Map();
  const famOf = (f, name) => (f.id === "future" && FUTURE_INFO.has(name) ? "info" : f.fam);
  const cntBy = {}; // 分野 → 項目
  for (const f of FIELDS) cntBy[f.id] = [];
  const docNodes = [];
  for (const it of DOC_ITEMS) {
    const f = FIELDS.find((x) => x.id === it.field), id = it.legacy ?? `${it.field}_${String(it.idx).padStart(2, "0")}`; if (it.legacy && !by.has(it.legacy)) throw new Error("既存の id が無い: " + it.legacy);
    const base = it.legacy ? by.get(it.legacy) : null;
    const node = base ? { ...base, ja: it.name, lane: f.id, stage: it.stage, fam: famOf(f, it.name), field: f.id, doc: true, rec: true }
      : { id, ja: it.name, lane: f.id, stage: it.stage, fam: famOf(f, it.name), field: f.id, doc: true, rec: false, prereq: [], E: E_BY_STAGE[it.stage], pre: it.stage <= 2, pop: POP_BY_STAGE[it.stage], s: false, cond: null, caps: [], fx: { [FX_KIND[f.id]]: Math.round((0.003 + 0.0006 * it.stage) * 10000) / 10000 }, desc: "", why: "" };
    docNodes.push(node); idOf.set(it.name, id); byName.set(id, node); cntBy[f.id].push(node);
  }
  const keepMil = new Set(["horse_riding", "fortification"]), keepBase = new Set(["cordage", "hafted_tools", "hide_working", "shelter", "fishing", "pastoralism", "seafaring", "kin_council", "harbor"]);
  const kept = [];
  for (const n of legacy) {
    if (byName.has(n.id)) continue;
    if (n.lane === "mil" || keepMil.has(n.id)) kept.push({ ...n, lane: "mil", fam: "arms", field: "mil", hidden: true, rec: true }) /* 軍事の技術は、画面の木には出さない（要素を増やさない）。木の技術が整うと自動で整う内部の備えで、部隊・兵器の解禁は戦争の画面に出る */;
    else if (keepBase.has(n.id)) kept.push({ ...n, lane: "base", fam: "phys", field: "base", hidden: true, rec: true });
  }
  const live = new Map([...docNodes, ...kept].map((n) => [n.id, n]));
  const dropped = (id, seen = new Set()) => { // 木に残らない節点の前提をたどる
    if (live.has(id)) return [id]; if (seen.has(id)) return []; seen.add(id); const n = by.get(id); if (!n) return []; return n.prereq.flatMap((p) => dropped(p, seen)); };
  const uniq = (a) => [...new Set(a)];
  for (const n of [...docNodes, ...kept]) if (by.has(n.id)) n.prereq = uniq(by.get(n.id).prereq.flatMap((p) => dropped(p))).filter((p) => p !== n.id);
  // 新しい項目の前提: 同じ分野で「時代が前の最後の項目」＋ 分野をまたぐ結びつき
  const X = crossLinks(), stageOf = (id) => live.get(id)?.stage ?? 99;
  for (const f of FIELDS) {
    const list = cntBy[f.id];
    list.forEach((n, i) => {
      if (by.has(n.id)) { // 既存の節点が前提を持つ。持たない根（石器）は除く
        if (!n.prereq.length && n.id !== "stone_tools") n.prereq = [ROOT[f.id]]; return; }
      let prev = null; for (let j = i - 1; j >= 0; j--) if (list[j].stage < n.stage) { prev = list[j]; break; }
      const pre = [prev ? prev.id : ROOT[f.id]];
      for (const nm of X.get(n.ja) ?? []) { const id = idOf.get(nm); if (id && id !== n.id && stageOf(id) < n.stage && !pre.includes(id)) pre.push(id); }
      n.prereq = pre;
    });
  }
  // 既存の節点にも、分野をまたぐ結びつきを足せるもの（時代が前のものだけ）
  for (const n of docNodes) if (by.has(n.id)) for (const nm of X.get(n.ja) ?? []) { const id = idOf.get(nm); if (id && id !== n.id && stageOf(id) < n.stage && !n.prereq.includes(id) && !reaches(live, id, n.id)) n.prereq.push(id); }
  // 軍事の前提も、残った節点に付け替え済み（上の dropped）。未使用の前提は取り除く
  const all = [...docNodes, ...kept];
  for (const n of all) n.prereq = uniq(n.prereq.filter((p) => live.has(p)));
  // 循環の検査（付け替えで循環しないこと）
  const color = new Map(); const visit = (id, path) => { const c = color.get(id); if (c === 2) return; if (c === 1) throw new Error("技術ツリーに循環: " + [...path, id].join(">")); color.set(id, 1); for (const p of live.get(id).prereq) visit(p, [...path, id]); color.set(id, 2); };
  for (const n of all) visit(n.id, []);
  return all;
}
function reaches(live, from, target, seen = new Set()) { // from の前提をたどって target に着くか（付けると循環するか）
  if (from === target) return true; if (seen.has(from)) return false; seen.add(from); return (live.get(from)?.prereq ?? []).some((p) => reaches(live, p, target, seen)); }
