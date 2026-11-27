// v6.19.0: 出来事のカタログ（240 種）。要件 §10。
//   各出来事は、見出し・本文・3 つの選択肢（＋自動で「何もしない」）・発生の条件・連鎖（次の出来事）を持つ。
//   選択肢の効果は、出来事の「型」（ARCH）ごとに、4 つ（強行・懐柔・賭け・何もしない）の効果を持ち、どれもメリットとデメリットの両方を持つ。
//   出来事に固有の効果は、x（選択肢ごとの追加効果）で重ねる（指導者の交代・反乱・政体の移行・宣戦など）。
//   効果の記法（空白区切り）: stab 安定度 ±0.01／tre 国庫 ±(国の規模×0.5)／pop 人口 ±1%／army 軍 ±1%／leg 正統性 ±0.01（下がるときは時間で薄れる衝撃）／tens 民の緊張 ±5%／
//     nob mil clr mer com bur art clan 各勢力の支持 ±0.01／relR 最悪の敵との関係／relF 最良の友好国との関係／relA すべての国との関係／
//     ldr:die|assn|coup|abd 指導者の交代／rebel:coup|revolution|noble|religious|separatist 反乱／regime:rev|mil|rep|mon 政体の移行／warby:R:理由 相手が宣戦／war:R:理由 自ら宣戦
//   条件の記法: e1-4（時代: 技術の進み具合 0〜5）／po:kingdom,empire（内部の政体）／her・nher（世襲か）／war・nwar／lows・highs（安定度）／poor・rich／big・small／coast／rival・friend／only（連鎖でだけ起きる）／w2（起きやすさ）
//   連鎖の記法: 次の出来事の id:何か月後:確率（@012 を付けると、その番号の選択肢を選んだときだけ）
export const CATEGORIES = Object.freeze({ ppl: "人物", dyn: "王家継承", cou: "政変・革命", dip: "外交", war: "戦争・軍事", rel: "宗教", eco: "経済・社会", dis: "災害・疫病", cul: "文化・技術", odd: "奇譚" });
/** 型ごとの効果: [強行, 懐柔, 賭け, 何もしない] */
export const ARCH = Object.freeze({
  person: ["bur+3 stab+1 tre-1 nob-2", "tre-3 stab+2 leg+1", "stab-1 mil+2 leg-1 nob+1", "stab-1"],
  tragedy_royal: ["stab+2 tre-3 nob+2", "stab-1 mil+2 leg+1", "stab-3 nob-4 mil+3", "stab-2"],
  coup_threat: ["stab+3 mil-6 army-2 leg-2", "mil+4 tre-4 stab+1", "com+4 mil-3 stab-1 tre-1", "stab-3 mil+1"],
  succession_crisis: ["stab+2 nob-3 leg-2 mil+2", "stab+3 nob+3 tre-2 leg+1", "relF+6 nob-4 stab-1 tre-1", "stab-4 nob-2"],
  crisis: ["stab+4 tre-2 com-4 mil+2", "stab+2 tre-4 nob-3 leg+1", "tre+3 stab-3 mer+3 com-2", "stab-5 tens+2"],
  diplomacy_chance: ["relF+10 tre-1 relR-3", "relF+7 nob+2 tre-2", "relF+5 mer+3 tre+1", "relF-1"],
  war_threat: ["army+4 tre-3 com-2 stab-1 relR-5", "tre-3 relR+8 mil-3 stab-1", "relF+6 tre-1 relR-4 stab+1", "stab-2 army-1"],
  border: ["army+2 relR-12 mil+3 stab+1 tre-2", "relR+5 tre-1 mil-2", "tre-3 army+3 relR-3", "stab-2 relR-3"],
  opportunity_war: ["army-2 mil+3 tre-2 relR-10", "relR-6 tre+2 stab+1", "relR+8 mer+2 mil-3", "mil-2"],
  reform: ["stab-2 bur+4 nob-4 tre-2 leg+1", "stab+1 bur+2 nob-1 tre-1", "com+3 nob-3 stab-1", "stab-1 bur-1"],
  rebel_peasant: ["stab+2 com-5 tre-2 pop-1 army-1", "stab+3 nob-4 tre-3", "stab+1 tre-2 com-2 mil+2", "stab-4 tens+3 pop-1"],
  rebel_noble: ["army-3 tre-3 nob-5 stab+1 mil+3", "nob+4 tre-3 leg-2 stab+2", "relF+3 nob-2 tre-1 leg-2", "stab-3 nob+1 leg-2"],
  fiscal: ["tre+5 com-4 stab-3", "tre+3 nob-3 mil-2 stab-1", "tre+5 relF-3 leg-1", "tre-3 stab-2"],
  omen: ["stab+3 clr+3 com+1 leg+1 tre-1", "stab-1 clr-2", "tre-2 art+2 clr-3 bur+1", "stab-1"],
  religion_move: ["clr+5 stab+2 tre-3 art-1", "stab+1 clr-3 mer+2 art+2", "stab+1 clr+2 com-4 tens+3", "stab-1 clr-1"],
  trade_boom: ["tre-3 mer+4 stab+1", "tre+5 mer-4 stab-1", "tre+3 mer-2 relA-2", "mer+1"],
  culture_boom: ["tre-3 art+4 stab+2 leg+1", "stab+1 art-3 clr+2", "tre+3 art+2 relA+1", "art+1"],
  tech_boom: ["tre-4 bur+3 art+3 stab+1", "tre-1 mil+3 relA-2", "tre-3 stab-2 mer+3", "bur-1"],
  plague: ["pop-1 stab+2 tre-3 mer-3", "stab+3 clr+4 pop-3 tre-1", "tre-5 pop-1 bur+3 art+2", "pop-5 stab-4"],
  famine: ["tre-4 stab+3 pop-1", "stab-1 com-4 mil+2 tre+1 pop-1", "tre-3 mer+3 relF+3", "pop-4 stab-4 tens+3"],
  disaster: ["tre-5 stab+3 pop-1", "clr+4 stab+1 pop-2", "tre+1 com-4 stab-2 pop-3", "pop-3 stab-3"],
});

const parseCond = (s) => { const c = { w: 1 }; for (const t of String(s).split(/\s+/).filter(Boolean)) { let m; if ((m = /^e(\d)(?:-(\d))?$/.exec(t))) { c.e = [+m[1], m[2] != null ? +m[2] : +m[1]]; } else if (t.startsWith("po:")) c.po = t.slice(3).split(","); else if (t === "her" || t === "nher" || t === "war" || t === "nwar" || t === "lows" || t === "highs" || t === "poor" || t === "rich" || t === "big" || t === "small" || t === "coast" || t === "rival" || t === "friend" || t === "only") c[t] = true; else if ((m = /^w(\d)$/.exec(t))) c.w = +m[1]; } return c; };
const parseCh = (s) => String(s).split(",").filter(Boolean).map((t) => { const [body, only] = t.split("@"), [id, d, p] = body.split(":"); return { id, delay: +d, p: +p, only: only != null ? only.split("").map(Number) : null }; }).filter((c) => c.p > 0);
export const EVENTS = [];
const E = (id, cat, arch, title, body, opts, cond = "", ch = "", x = null) => EVENTS.push({ id, cat, arch, title, body, opts, cond: parseCond(cond), ch: parseCh(ch), x });

// ---- 人物（40）
E("gen_rise","ppl","person","辺境の名将が頭角を現す","{s}の国境で、無名の将が異民族を撃退し、兵の人気を集めた。",["要職に登用する","恩賞を与え遠ざける","警戒して監視する"],"e1-5 nwar","gen_coup:18:.35@2,hero_general:24:.4@0");
E("hero_general","ppl","person","民衆が英雄と讃える将軍","{s}の将軍の戦功は、市井の歌にまでなった。",["凱旋式を開く","名誉職で遇する","地方へ出す"],"e1-5 only","acclaimed_emperor:20:.4@0,gen_coup:16:.3@2");
E("acclaimed_emperor","ppl","coup_threat","将軍が皇帝として推戴される","軍と民衆は、勝ち続けた将軍の即位を求めている。",["推戴を受け入れる","形だけ辞退して受ける","推戴を拒み忠誠を誓わせる"],"e1-5 only","civil_war_outbreak:14:.3@2",["ldr:coup","ldr:coup",""]);
E("able_vizier","ppl","person","有能な宰相が国政を整える","{L}は、才あるものを身分を問わず宰相に据えた。",["全権を委ねる","補佐役にとどめる","貴族の反発を抑える"],"e1-5");
E("corrupt_vizier","ppl","person","宰相の汚職が露見する","宮廷の財が、宰相の屋敷に流れていた。",["処刑して見せしめに","罷免のみで済ませる","不問に付す"],"e1-5 poor");
E("prince_rebel","ppl","tragedy_royal","王子が父に背く","{L}の世継ぎが、廷臣と謀って父に反抗した。",["王子を幽閉する","許して和解する","廃嫡し弟を立てる"],"e1-5 her","succ_dispute:10:.35@2");
E("heir_wastrel","ppl","tragedy_royal","世継ぎの放蕩","{s}の世継ぎは、遊興に溺れ、借財を重ねている。",["厳しく矯正する","借財を肩代わりする","弟を後継に推す"],"e1-5 her","succ_dispute:20:.3@2");
E("cruel_governor","ppl","crisis","苛政の総督","遠隔地の総督が、民から過酷な取り立てを行っている。",["解任して罰する","様子を見る","取り立てを国庫に回させる"],"e1-5 big","peasant_revolt:12:.25@12");
E("foreign_advisor","ppl","person","異国人の顧問","{f}から来た賢者が、{s}の統治への助言を申し出た。",["顧問に任じる","学問のみ受け入れる","国政に近づけない"],"e1-5 friend");
E("spy_caught","ppl","omen","他国の間者を捕らえる","{r}の間者が宮廷に潜んでいたことがわかった。",["公開処刑する","二重間者に仕立てる","秘密裏に送還する"],"e1-5 rival");
E("assassin_attempt","ppl","tragedy_royal","暗殺未遂","{L}の食事に毒が盛られていた。企てた者は不明である。",["大規模な粛清を行う","護衛を強化する","犯人探しを控え平静を装う"],"e1-5","dictator_assassination:30:.25@2");
E("dictator_assassination","ppl","tragedy_royal","指導者暗殺","{L}が、側近の凶刃に倒れた。国は動揺している。",["首謀者を追及する","後継を急ぎ定める","国葬で結束を図る"],"e1-5 only","succ_dispute:4:.7,revolution_breaks:18:.25@0",["ldr:assn","ldr:assn","ldr:assn","ldr:assn"]);
E("beloved_leader_dies","ppl","tragedy_royal","慕われた指導者の死","民に愛された{L}が世を去り、国中が喪に服した。",["盛大な国葬を営む","簡素に済ませる","追悼を政治に利用する"],"e1-5","succ_dispute:6:.3");
E("exile_returns","ppl","coup_threat","亡命者の帰還","外国に逃れていた前の王族が、帰国を求めている。",["迎え入れる","国境で拒む","外国に引き渡す"],"e1-5 her","succ_dispute:12:.3@0");
E("mercenary_captain","ppl","coup_threat","傭兵隊長の売り込み","名高い傭兵隊長が、高額で{s}に仕えたいと言う。",["雇い入れる","断る","相手国に雇わせない"],"e1-5 war");
E("old_king_abdicates","ppl","succession_crisis","老王の退位","高齢の{L}が、後進に道を譲りたいと言い出した。",["退位を認める","続投を求める","摂政を置く"],"e1-5 her","succ_dispute:6:.2@1");
E("hunt_accident","ppl","tragedy_royal","狩猟での事故","狩りの最中に{L}が落馬し、重傷を負った。",["最高の医者を集める","祈祷にすがる","事実を伏せる"],"e1-5 her","king_sudden_death:3:.3@2");
E("royal_marriage_love","ppl","tragedy_royal","身分違いの恋","{L}が、貴族でない娘との結婚を望んでいる。",["許して結婚する","諦めさせる","養女の形にして結婚する"],"e1-5 her");
E("tribal_hero","ppl","person","部族の英雄","大熊を倒した若者が、部族の英雄になった。",["戦士長に取り立てる","祝宴を開く","長老の下に置く"],"e0-1 po:tribal,chiefdom");
E("traitor_general","ppl","coup_threat","将軍の内通","将軍が{r}と密かに通じている疑いが出た。",["証拠を固め断罪する","忠誠を試す","疑わず任に就かせる"],"e1-5 war rival","gen_coup:6:.3@2");
E("loyal_servant","ppl","person","忠臣の最期","主君を庇って忠臣が命を落とした。",["顕彰碑を建てる","遺族を厚遇する","語らず喪に服す"],"e1-5");
E("rebel_poet_hero","ppl","omen","反骨の詩人が民衆を鼓舞する","詩人が、重税と貴族の特権を糾弾した。",["捕らえる","対話を持つ","詩を自国の誇りとして取り込む"],"e2-5 lows");
E("farmer_prophet","ppl","omen","農民の預言者","「天の怒りが近い」と説く農民に群衆が集まった。",["説教を許す","弾圧する","聖職者に調べさせる"],"e1-3","peasant_revolt:12:.2@1");
E("sea_captain_voyage","ppl","tech_boom","船長の遠洋航海計画","老練な船長が、未知の海への航海を願い出た。",["船団を与える","資金を半分出す","危険だと却下する"],"e2-5 coast","new_sea_route:36:.45@0");
E("engineer_invention","ppl","tech_boom","技師の発明","技師が、新しい機械の図面を持ち込んだ。",["工房を作らせる","特許状を与える","軍の秘密にする"],"e3-5");
E("peasant_hero","ppl","coup_threat","農民出の勇士","身分の低い勇士が、戦場で貴族を救った。",["貴族に叙す","褒美のみ与える","功績を貴族に与える"],"e1-4 war");

// ---- 王家継承（25）
E("succ_dispute","dyn","succession_crisis","継承をめぐる争い","{s}で、選ばれなかった有力者が、継承の正統性を疑いはじめた。",["争う者を断罪する","領地を分けて懐柔する","外国の仲裁を求める"],"e1-5 only","succ_war:8:.4@2,king_sudden_death:0:0");
E("succ_coup_after","dyn","coup_threat","簒奪をうかがう者","{s}の新王の即位に不満を持つ将が、挙兵の機をうかがっている。",["先手を打って捕える","地位を与え取り込む","兵を集めて備える"],"only","gen_coup:6:.35@2");
E("king_sudden_death","dyn","succession_crisis","王の急死","{L}が、後継を定めぬまま急死した。",["長子を即位させる","重臣会議で決める","摂政を立てる"],"e1-5 her","succ_war:6:.35@1,succ_dispute:4:.4@0",["ldr:die","ldr:die","ldr:die","ldr:die"]);
E("succ_war","dyn","war_threat","継承戦争","{s}の王位をめぐり、{r}が継承権を主張して軍を動かした。",["受けて立つ","譲歩して条件を探る","同盟を頼る"],"e1-5 only rival","personal_union:14:.3@1",["warby:R:succession","","warby:R:succession"]);
E("personal_union","dyn","diplomacy_chance","同君連合の成立","{s}と{r}の王家が結ばれ、一人の王を共に戴くことになった。",["連合を受け入れる","条件を付けて結ぶ","拒んで王位を守る"],"e2-5 only rival her","union_merge:96:.3@0,union_dissolve:60:.4@1");
E("union_merge","dyn","reform","連合の統合","同君連合は、長いあいだに、一つの国としてまとまろうとしている。",["統合を推し進める","自治を保障して統合する","連合のままにする"],"e2-5 only","");
E("union_dissolve","dyn","rebel_noble","連合の解消","連合の二国は、王位の分かれとともに別々の道へ進んだ。",["円満に分かれる","連合の維持を訴える","戦をも辞さない"],"e2-5 only","");
E("regency_power","dyn","coup_threat","摂政の権力","幼い王の摂政が、廷臣を従え、国政を専断している。",["摂政を信頼する","摂政の権限を削る","摂政を排除する"],"e1-5 her","gen_coup:12:.2@0");
E("no_heir","dyn","succession_crisis","世継ぎがいない","{L}には、世継ぎがなく、廷臣は不安を募らせている。",["養子を迎える","遠縁を後継に定める","重臣に選ばせる"],"e1-5 her","succ_dispute:24:.4@1");
E("illegitimate_claim","dyn","succession_crisis","庶子の請求","{L}の庶子が、王位の継承権を主張している。",["認知して領地を与える","証拠なしと退ける","修道院に入れる"],"e1-5 her","succ_dispute:10:.3@1");
E("queen_regent","dyn","person","母后の台頭","幼い王の母が、政務に口を出しはじめた。",["摂政に任命する","廷臣に補佐させる","別の摂政を立てる"],"e1-5 her");
E("royal_marriage_alliance","dyn","diplomacy_chance","政略結婚の申し出","{f}が、王家どうしの婚姻を申し込んできた。",["受け入れる","持参金を条件に応じる","断る"],"e1-5 friend her");
E("royal_marriage_scandal","dyn","tragedy_royal","結婚の破談","{r}との縁談が、直前で壊れた。",["謝罪の使者を出す","強く抗議する","別の縁談を探す"],"e1-5 rival her","border_clash:12:.3@1");
E("fratricide","dyn","tragedy_royal","兄弟の殺し合い","王位を争って兄弟が殺し合った。",["勝者を認める","生き残りを裁く","両者を排し第三者を立てる"],"e1-5 her","succ_dispute:2:.5");
E("deposed_king","dyn","coup_threat","王が廃される","廷臣たちが、無能な{L}を王位から廃した。",["廃位を追認する","王を支持する","新王の選定を急ぐ"],"e1-5 her lows","succ_dispute:3:.4",["ldr:coup","","ldr:coup"]);
E("dynasty_old_decay","dyn","crisis","王朝の衰え","{s}の王朝は、権威が衰え、各地に不満が広がっている。",["改革を進める","外征で威信を取り戻す","慎重に延命を図る"],"e2-5 her lows","dynasty_fall:36:.3@2");
E("dynasty_fall","dyn","rebel_noble","王朝の交代","民心を失った王朝に代わって、新しい家が王位に就いた。",["新王朝を承認する","旧王家を保護する","旧王家に抵抗を促す"],"e1-5 only her","",["ldr:coup","","ldr:coup"]);
E("heir_hostage","dyn","diplomacy_chance","世継ぎを人質に","{f}との友好のため、世継ぎを人質に送る案が出た。",["人質を出す","高官の子を代わりに","断る"],"e1-4 friend her");
E("royal_will","dyn","succession_crisis","王の遺言","病床の{L}が、遺言に後継を記した。",["遺言どおりに","重臣会議にかけ直す","遺言を握りつぶす"],"e1-5 her","succ_dispute:4:.3@2");
E("tanist_council","dyn","succession_crisis","氏族会議の後継選び","氏族長たちが集まり、次の首長を選ぼうとしている。",["最も強い者を推す","年長者を推す","会議を延期する"],"e0-2 po:tribal,chiefdom");
E("pretender_appears","dyn","coup_threat","偽りの王が現れる","「先王の子」を名乗る男が、地方で兵を集めた。",["討伐する","男を取り込む","外国の動きを探る"],"e1-4 her","succ_dispute:6:.25@1");
E("king_mad","dyn","tragedy_royal","王の発狂","{L}は、重い心の病に倒れ、政務を執れなくなった。",["摂政を置く","病を隠す","退位を促す"],"e1-5 her","succ_dispute:8:.3@1");
// ---- 政変・革命（25）
E("gen_coup","cou","coup_threat","将軍のクーデター","{s}で、将軍が兵を率いて宮廷を押さえた。",["新政権を承認する","抵抗する","亡命する"],"e1-5 only","junta_rule:6:.6@0,civil_war_outbreak:4:.3@1",["regime:mil","rebel:coup","ldr:coup"]);
E("junta_rule","cou","reform","軍事政権の方針","権力を握った軍は、国の進む道を決めねばならない。",["外征で団結を図る","行政を整えて安定させる","私腹を肥やす"],"e1-5 only","junta_expedition:12:.5@0,junta_corrupt:18:.5@2");
E("junta_expedition","cou","opportunity_war","軍政の外征","軍事政権は、威信を求めて隣国への出兵を決めた。",["出兵する","示威に留める","内政に専念する"],"only rival","");
E("junta_corrupt","cou","crisis","軍政の腐敗","軍政の高官の私腹が、民の怒りを買っている。",["高官を粛清する","見て見ぬふりをする","民衆の代表を加える"],"only","leader_plot:12:.4@1");
E("leader_plot","cou","coup_threat","指導者暗殺の陰謀","側近の間に、指導者暗殺の企てがある。",["首謀者を捕える","政策を改め不満を緩和する","護衛を増やすのみ"],"e1-5 only","dictator_assassination:8:.5@12");
E("revolution_breaks","cou","rebel_peasant","革命の勃発","圧政に耐えかねた民衆が、都市で蜂起した。",["武力で鎮圧する","改革を約束する","体制の移行を受け入れる"],"e2-5 only","republic_born:6:.5@2",["","","regime:rev"]);
E("republic_born","cou","diplomacy_chance","共和国の誕生","{s}に、王の居ない国の政治が始まった。",["新体制を固める","旧勢力と和解する","周辺国に承認を求める"],"e2-5 only","foreign_intervention:12:.4");
E("foreign_intervention","cou","war_threat","革命への干渉","周辺の君主が、革命の波及を恐れて{s}に圧力をかけてきた。",["干渉を撥ねつける","譲歩して使節を送る","同盟を求める"],"e2-5 only rival","intervention_war:6:.35@0");
E("intervention_war","cou","opportunity_war","干渉戦争","革命を潰そうとする隣国が、国境に軍を進めた。",["全力で防ぐ","講和を探る","革命を輸出する"],"only rival","",["warby:R:ideology","","warby:R:ideology"]);
E("civil_war_outbreak","cou","rebel_noble","内戦の勃発","{s}で、貴族と将軍が分かれ、国が二つに裂けた。",["討伐軍を出す","和平の仲介を頼む","分裂を受け入れる"],"e1-5 only","",["rebel:noble","","rebel:noble"]);
E("palace_coup","cou","coup_threat","宮廷のクーデター","近衛が、{L}を宮殿から追い出した。",["追認する","奪還を試みる","亡命先の保護を求める"],"e1-5 lows","succ_dispute:4:.3",["ldr:coup","","ldr:coup"]);
E("peasant_revolt","cou","rebel_peasant","農民の大反乱","重税と飢えに苦しむ農民が、鍬を手に蜂起した。",["鎮圧する","譲歩して税を軽くする","首謀者を取り込む"],"e1-4 big lows","reform_edict:12:.4@1,dynasty_fall:24:.2@0");
E("reform_edict","cou","reform","改革の勅令","混乱の収まったあと、{s}は大きな制度の改革を決断した。",["断行する","漸進的に進める","棚上げする"],"e1-5 only","");
E("tax_burden","cou","fiscal","重税への不満","相次ぐ増税に、民と商人が不満を募らせている。",["減税する","取り立てを続ける","特権層にも課税する"],"e1-5","peasant_revolt:12:.3@1");
E("noble_conspiracy","cou","rebel_noble","貴族の陰謀","有力貴族が、王権を制限する盟約を結んだ。",["盟約を解散させる","勅許状を与え譲歩する","首謀者だけ懐柔する"],"e2-5 her","constitution_drafted:24:.3@1");
E("clergy_uprising","cou","rebel_noble","聖職者の蜂起","{s}の聖職者が、世俗の支配への反抗を始めた。",["弾圧する","教会に特権を与える","教義の論争を仕掛ける"],"e1-5 lows");
E("garrison_mutiny","cou","coup_threat","駐屯軍の反乱","給金の遅れに怒った駐屯軍が、官庫を襲った。",["未払いを支払う","首謀者を処罰する","兵を入れ替える"],"e1-5 poor");
E("secession_movement","cou","rebel_noble","分離独立の動き","遠い地方の有力者が、独立を宣言した。",["討伐する","自治を認めて懐柔する","他の地方に見せしめにする"],"e1-5 big lows","",["rebel:separatist","","rebel:separatist"]);
E("tribal_split","cou","rebel_noble","部族の分裂","首長の座をめぐって、部族が二派に分かれた。",["一方を支持する","仲裁する","分裂を認める"],"e0-2 po:tribal,chiefdom","",["rebel:separatist","",""]);
E("purge_elite","cou","coup_threat","大粛清","{L}は、政敵を一斉に捕えようとしている。",["粛清を断行する","対象を絞る","思いとどまる"],"e1-5 lows","leader_plot:18:.3@0");
E("student_protest","cou","crisis","学生の抗議","都市で、学生と市民が政治の改革を求めてデモを行った。",["要求を聞き入れる","治安部隊を出す","指導者と対話する"],"e4-5 lows","revolution_breaks:8:.2@1");
E("strike_wave","cou","crisis","大規模なストライキ","工場と港で、賃金を求める大規模なストライキが起きた。",["要求を受け入れる","軍を出して鎮める","仲裁を設ける"],"e4-5","revolution_breaks:10:.15@1");
E("election_fraud","cou","crisis","選挙不正の疑惑","選挙で不正があったとの噂が、都市を駆けめぐった。",["再選挙を行う","調査を約束する","疑惑を封じる"],"e4-5 nher");
E("constitution_drafted","cou","reform","憲法の起草","諸階層は、国の基本法を文章にして定めようとしている。",["憲法を制定する","王権を残して制定する","時期尚早として延ばす"],"e2-5 only","");
E("vassal_rebellion","cou","rebel_noble","従属国の反抗","従属させていた地方が、独立を求めて立ち上がった。",["軍を送る","自治を拡大して宥める","独立を認める"],"e1-5","",["","","rebel:separatist"]);

// ---- 外交（25）
E("border_clash","dip","border","国境での小競り合い","{s}と{r}の国境で、兵が衝突した。",["先制して報復する","抗議にとどめる","砦を築く"],"e1-5 rival","defeat_humiliation:0:0",["warby:R:conquest","",""]);
E("trade_treaty_offer","dip","diplomacy_chance","通商条約の申し出","{f}から、関税を下げる通商協定の申し出が届いた。",["受け入れる","条件を厳しくして受ける","断る"],"e1-5 friend");
E("alliance_plea","dip","diplomacy_chance","同盟国の救援要請","同盟国{f}が、隣国との戦いに助力を求めている。",["援軍を送る","資金で助ける","中立を保つ"],"e1-5 friend war");
E("tribute_demand","dip","war_threat","朝貢の要求","強国{r}が、{s}に貢物を求める使者を送った。",["従う","拒んで備える","外交で時間を稼ぐ"],"e1-4 rival","border_clash:6:.3@1");
E("peace_conference","dip","diplomacy_chance","和平会議の提唱","諸国が、紛争を収める会議の開催を求めている。",["参加して仲介を受ける","条件をつけて出席する","欠席する"],"e3-5 war");
E("trade_war","dip","trade_boom","関税をめぐる争い","{r}が、{s}の商品に高い関税をかけた。",["報復関税をかける","交渉を求める","他の取引先を探す"],"e2-5 rival");
E("border_treaty","dip","diplomacy_chance","国境画定の提案","{f}が、国境の画定を提案した。",["受ける","一部修正して受ける","拒む"],"e2-5 friend");
E("great_embassy","dip","diplomacy_chance","大使節団の来訪","遠方の大国から、大使節団が{s}を訪れた。",["最大限もてなす","簡素に迎える","警戒して制限する"],"e1-4","trade_treaty_offer:6:.4@0");
E("refugee_wave","dip","crisis","難民の流入","戦乱を逃れた難民が、{s}の国境に押し寄せた。",["受け入れる","一部を受け入れる","国境を閉ざす"],"e1-5 rival");
E("naval_incident","dip","border","海上の衝突","{r}の船団と、{s}の船団が、海上で砲火を交えた。",["艦隊を増強する","外交抗議にとどめる","共同の巡視を提案する"],"e3-5 rival coast");
E("rival_embargo","dip","trade_boom","禁輸措置","{r}が、{s}への主要物資の輸出を止めた。",["代替の供給源を探す","武力で打開する","交渉で緩和を求める"],"e2-5 rival","border_clash:6:.3@1");
E("diplomatic_marriage_crisis","dip","tragedy_royal","外交上の婚姻の拒否","{f}が、{s}の縁談を断った。",["不快を示す","別の相手を探す","穏当に受け止める"],"e1-5 friend her");
E("neighbor_collapse","dip","opportunity_war","隣国の混乱","{r}で内乱が続き、国境の守りが薄くなった。",["介入して領土を取る","亡命者を保護し影響を及ぼす","不介入を保つ"],"e1-5 rival","",["warby:R:plunder","",""]);
E("pact_proposal","dip","diplomacy_chance","共同防衛の誘い","数か国が、共同の防衛盟約を結ぼうと{s}を誘った。",["加盟する","条件付きで加わる","加盟しない"],"e2-5");
E("hostage_incident","dip","crisis","人質事件","{s}の商人が、{r}で捕えられた。",["武力をちらつかせる","身代金を払う","使節を送って交渉する"],"e1-5 rival");
E("grain_aid","dip","famine","食糧援助の依頼","{f}が、凶作で食糧の援助を求めている。",["援助する","売却に切り替える","断る"],"e1-5 friend rich");
E("vassal_demand","dip","opportunity_war","従属国の増額要求","従属国が、庇護の見返りの増額を求めた。",["応じる","断る","内部に介入して統制する"],"e2-5");
E("treaty_violation","dip","border","条約違反の疑い","{r}が、結んだ条約に背いたと疑われている。",["厳重に抗議する","証拠を集める","不問に付す"],"e2-5 rival","border_clash:8:.3@0");
E("alliance_betrayal","dip","tragedy_royal","同盟国の裏切り","同盟国が、{s}を見捨て、敵国と和した。",["絶縁する","理由を問いただす","新しい同盟国を探す"],"e1-5 friend war");
// ---- 戦争・軍事（30）
E("defeat_humiliation","war","crisis","敗戦の屈辱","戦いに敗れた{s}は、屈辱的な講和を受け入れた。",["条約を受け入れる","隠れて再起を期す","国民に責任を問う"],"e1-5 nwar lows","reparation_burden:6:.5");
E("reparation_burden","war","fiscal","賠償金の重荷","賠償金の支払いが、{s}の財政を圧迫している。",["増税して払う","支払いの延期を求める","国債で凌ぐ"],"e1-5 only","revanchism:18:.4");
E("revanchism","war","war_threat","復讐主義の高まり","敗北を忘れぬ世論が、軍の再建と報復を求めている。",["報復の準備を進める","世論を宥める","外交で包囲網を作る"],"e1-5 only","revenge_war:24:.35@0");
E("revenge_war","war","opportunity_war","報復の戦い","国力を回復した{s}は、かつての敵に雪辱を果たそうとしている。",["宣戦する","同盟を固めて機を待つ","報復を断念する"],"e1-5 only rival","",["warby:R:conquest","",""]);
E("miracle_victory","war","war_threat","寡兵が大軍を破る","少ない兵で、敵の大軍を打ち破るという奇跡が起きた。",["勝利を大いに宣伝する","追撃して戦果を広げる","講和を探る"],"e1-5 war","legend_forms:12:.5@0");
E("legend_forms","war","culture_boom","奇跡が伝説になる","あの勝利の物語は、歌と絵になって国中に広まっていく。",["伝説を公認する","詩人に庇護を与える","史実の確認を促す"],"e1-5 only","national_identity:36:.4");
E("national_identity","war","culture_boom","国民意識の芽生え","共有する物語のもと、{s}の人々は同じ国の民だと感じはじめた。",["祝日を定める","民族の歌を奨励する","国語を整える"],"e2-5 only");
E("siege_endured","war","war_threat","長い包囲戦","{s}の城塞が、敵軍に長期間包囲されている。",["決死の出撃を行う","降伏の交渉をする","援軍を待つ"],"e1-5 war");
E("mutiny_navy","war","coup_threat","水兵の反乱","艦隊の水兵が、待遇に抗議して反乱を起こした。",["要求を受け入れる","首謀者を処刑する","提督を更迭する"],"e3-5 coast war");
E("plague_in_army","war","plague","軍中の疫病","軍中に疫病が広がり、兵がばたばたと倒れている。",["撤退する","隔離して前進する","医師団を急派する"],"e1-5 war");
E("deserters_flood","war","crisis","脱走兵の続出","長引く戦争に疲れた兵が、脱走を始めた。",["見せしめに処刑する","恩赦を出す","給金を増やす"],"e1-5 war");
E("fortress_built","war","border","国境の要塞建設","国境に大要塞を築く案が、重臣から出された。",["築く","小規模な砦にとどめる","外交で解決を探る"],"e1-5 rival","border_clash:12:.3@0");
E("new_weapon","war","tech_boom","新兵器の登場","{s}の工房が、新しい武器を完成させた。",["大量に装備する","試験的に採用する","他国に売却する"],"e1-5");
E("army_reform","war","reform","軍制の改革","古い軍の編制を改めよとの声が、将校から上がった。",["全面的に改革する","一部の部隊で試す","現状を維持する"],"e1-5 nwar");
E("great_general_dies","war","tragedy_royal","名将の戦死","軍の柱であった将軍が、戦場で倒れた。",["国葬を営む","後任を急ぎ定める","敵の仕業と糾弾する"],"e1-5 war");
E("conscription_riot","war","rebel_peasant","徴兵への抵抗","徴兵に反対して、農村で暴動が起きた。",["武力で鎮める","徴兵を減らす","免役金を認める"],"e3-5 war");
E("fleet_lost","war","tragedy_royal","艦隊の遭難","嵐で、遠征の艦隊が遭難した。",["再建を急ぐ","遠征をあきらめる","他国に支援を求める"],"e2-5 coast");
E("veterans_return","war","reform","帰還兵の処遇","遠征から戻った兵が、恩賞と土地を求めている。",["土地を与える","年金を与える","解散して帰農させる"],"e1-5 nwar","peasant_revolt:12:.15@2");
E("naval_victory","war","war_threat","海戦の大勝","{s}の艦隊が、敵艦隊を打ち破り、制海権を握った。",["海上封鎖へ移る","勝利を機に講和する","海軍を増強する"],"e2-5 coast war");
E("fifth_column","war","omen","内通者の暗躍","敵に通じる者が、軍の動きを漏らしていた。",["大規模に摘発する","偽情報を流す","警戒を呼びかけるのみ"],"e1-5 war");
E("scorched_earth","war","war_threat","焦土作戦","敵の進軍を遅らせるため、国境の村を焼く案が出た。",["実行する","一部のみ行う","民を守って戦う"],"e1-5 war");
E("armistice_offer","war","diplomacy_chance","休戦の申し出","敵が、一時の休戦を申し出た。",["受け入れる","条件を付ける","拒む"],"e1-5 war");
E("captured_commander","war","war_threat","敵将を捕虜にする","戦いで、敵の指揮官を生け捕りにした。",["身代金を取る","丁重に扱い交渉に使う","処刑する"],"e1-5 war");
E("garrison_famine","war","famine","要塞の飢え","包囲された要塞で、食糧が尽きかけている。",["突破を試みる","食糧を空輸する","降伏を考える"],"e3-5 war");
E("mobilization_decree","war","war_threat","総動員の布告","国難に際して、総動員令を出す案がある。",["総動員する","部分動員にとどめる","外交で打開する"],"e3-5 war");
E("nuclear_scare","war","war_threat","核の恐怖","敵国が新型の大量破壊兵器を持ったとの情報が入った。",["査察を求める","軍備を急ぐ","交渉の場を設ける"],"e5 rival");
// ---- 宗教（20）
E("reformation_preacher","rel","religion_move","改革を説く説教師","教会の腐敗を糾弾する説教師が、民衆の人気を集めた。",["弾圧する","討論を許す","改革を取り込む"],"e2-4","church_lands:24:.4@2,religious_war:18:.3@0");
E("church_lands","rel","religion_move","教会領の没収","教会が持つ広大な領地を、国庫に収めようとの案が出た。",["没収する","一部を没収する","寄進を求めるにとどめる"],"e2-4 only","religious_war:12:.4@0,toleration_edict:24:.3@2");
E("religious_war","rel","opportunity_war","宗教戦争","信仰の違いを理由に、国が二つに割れて戦いが始まった。",["正統を掲げて戦う","穏健派と和を探る","外国の調停を頼む"],"e2-4 only","toleration_edict:36:.5",["rebel:religious","",""]);
E("toleration_edict","rel","reform","寛容令","長い争いの末に、信仰の自由を認める勅令が出された。",["寛容令を出す","限定的に認める","従来の方針を続ける"],"e2-5 only");
E("heresy_spread","rel","religion_move","異端の広がり","正統とは異なる教えが、{s}の民に広がっている。",["異端審問を行う","寛容に扱う","教義の議論を促す"],"e1-4");
E("temple_wealth","rel","fiscal","神殿の蓄財","神殿が貴金属を蓄え、国庫を上回る富を持った。",["寄進を求める","神殿を保護する","世俗化を進める"],"e1-4","church_lands:24:.3@0");
E("miracle_claimed","rel","omen","奇跡の主張","「病が癒えた」と、農村で多くの人が証言している。",["奇跡を公認する","調査を命じる","民心を惑わすと禁じる"],"e1-4");
E("religious_schism","rel","crisis","教義の分裂","教義の解釈をめぐって、聖職者が二派に分かれた。",["一方を支持する","公会議を開く","分裂を放置する"],"e1-5","religious_war:18:.2@2");
E("inquisitor_zeal","rel","religion_move","審問官の暴走","異端審問官が、権限を逸脱して貴族を捕えた。",["審問官を抑える","支持する","貴族に慎重を求める"],"e2-4","reformation_preacher:12:.2@1");
E("holy_war_call","rel","war_threat","聖戦の呼びかけ","聖職者が、異教徒との聖戦を民に呼びかけている。",["聖戦を宣言する","呼びかけを抑える","外交で圧力をかける"],"e1-4 rival","border_clash:6:.3@0");
E("sacred_text_found","rel","culture_boom","聖典の発見","古い聖典の写本が発見され、教義の論争が燃えた。",["写本を公認する","研究を命じる","秘蔵する"],"e1-4");
E("priest_king_cult","rel","religion_move","王の神格化","聖職者が、{L}を神の子とする教えを説いた。",["受け入れる","限定的に認める","拒む"],"e0-2 her");
E("secular_reform","rel","reform","政教分離の機運","国の統治と信仰を分けよ、との声が広がっている。",["分離を進める","漸進的に進める","聖職者と協調する"],"e3-5","toleration_edict:12:.2@0");
E("cult_sect_rises","rel","crisis","新興教団の台頭","終末を説く新興教団が、民の心をとらえた。",["解散させる","穏健に取り込む","様子を見る"],"e2-5 lows");
E("temple_collapse","rel","disaster","神殿の崩壊","地震で、国の中心の神殿が崩れた。",["再建に全力を傾ける","簡素に建て直す","吉凶を占う"],"e1-4","omen_comet:6:.2");
E("conversion_ruler","rel","religion_move","君主の改宗","{L}が、新しい教えに帰依したいと言いだした。",["改宗する","形だけ受ける","民の信仰を尊重して改宗しない"],"e1-4 her","religious_war:12:.2@0");

// ---- 経済・社会（25）
E("new_sea_route","eco","trade_boom","新航路の発見","遠洋に出た船団が、未知の海への航路を拓いて帰港した。",["王室の独占事業にする","商人に開放する","航路を秘密にする"],"e3-5 coast","merchant_wealth:24:.5@1,merchant_wealth:36:.35@0");
E("merchant_wealth","eco","trade_boom","交易の富が流れ込む","新しい交易で、港町に莫大な富が集まりはじめた。",["関税を高める","港の自治を認める","投資を呼び込む"],"e3-5 only","merchant_rise:24:.5");
E("merchant_rise","eco","reform","商人の台頭","富を蓄えた商人が、政治への発言を求めはじめた。",["商人を貴族に取り立てる","会議への参加を認める","特権を守る"],"e3-5 only","assembly_founded:24:.4@1");
E("assembly_founded","eco","reform","身分制議会の設置","諸身分の代表が集う議会が、初めて開かれた。",["議会を設ける","諮問機関にとどめる","設置を拒む"],"e3-5 only","constitution_drafted:36:.3@0");
E("labor_shortage","eco","crisis","労働力の不足","人口の減少で、畑と工房の働き手が足りない。",["移民を募る","賃金の上限を定める","労働の自由を広げる"],"e1-4 only","serf_emancipation:24:.4@2");
E("serf_emancipation","eco","reform","農奴の解放","領主に縛られた農民に、移動と契約の自由を与えようとする動きが出た。",["全面的に解放する","有償で解放する","現状を維持する"],"e2-4 only","estates_shaken:12:.5@0");
E("estates_shaken","eco","reform","身分制の動揺","解放された民が都市に流れ、古い身分の秩序が揺らいでいる。",["秩序を守る","新しい秩序を築く","混乱を放置する"],"e2-5 only");
E("great_famine","eco","famine","大飢饉","天候不順が続き、{s}の穀倉が空になった。",["備蓄を開く","他国から買う","耕作を強制する"],"e1-4","tax_burden:12:.35");
E("market_riot","eco","rebel_peasant","市場の暴動","パンの値上がりで、市場が暴徒に襲われた。",["価格を統制する","兵を出す","穀物を配る"],"e2-5 poor");
E("silver_mine","eco","trade_boom","銀鉱の発見","山中で、大きな銀鉱が見つかった。",["王室が直営する","民間に開放する","外国に権利を売る"],"e1-4","inflation_crisis:36:.35@0");
E("inflation_crisis","eco","fiscal","物価の高騰","貨幣の増えすぎで、物価が上がり続けている。",["貨幣の改鋳を行う","価格統制を試みる","市場に任せる"],"e2-5","market_riot:6:.3@2");
E("debt_trap","eco","fiscal","国債の返済難","国の借金が膨らみ、貸し手が返済を急かしている。",["増税で返す","債務の整理を求める","利払いを延ばす"],"e2-5 poor");
E("canal_project","eco","trade_boom","大運河の計画","国を貫く運河を掘れば、交易が潤うと技師が説いた。",["建設を決める","一部の区間から始める","費用を理由に見送る"],"e1-5 rich");
E("road_network","eco","tech_boom","街道網の整備","主要都市をつなぐ街道を整える案が出た。",["国費で整備する","通行税で賄う","軍事用に限る"],"e1-5");
E("tax_reform_proposal","eco","reform","税制の改革案","役人が、土地の広さに応じた新しい税制を提案した。",["導入する","一部の地域で試す","反対する"],"e1-4","tax_burden:12:.2@0");
E("black_market","eco","crisis","闇市の拡大","統制を逃れた闇市が、都市に広がっている。",["取り締まる","課税して公認する","放置する"],"e3-5 lows");
E("urban_fire","eco","disaster","都市の大火","都の商業地区が、炎に包まれた。",["区画整理を断行する","元どおりに再建する","防火の制度を作る"],"e1-5");
E("automation_fear","eco","crisis","機械化への不安","新しい機械が、職人の仕事を奪おうとしている。",["導入を奨励する","導入を遅らせる","補償を設ける"],"e4-5");
// ---- 災害・疫病（20）
E("plague_wave","dis","plague","疫病の流行","都に、原因の分からない疫病が広がっている。",["都市を封鎖する","祈りと儀式に頼る","医師団を派遣する"],"e1-4","labor_shortage:24:.5");
E("earthquake","dis","disaster","大地震","大地震が都を襲い、多くの家屋が倒れた。",["救済を最優先する","復興を王室が主導する","民に委ねる"],"e1-5");
E("flood_great","dis","disaster","大洪水","大河が氾濫し、広大な田畑が水に沈んだ。",["堤防を築く","難民を受け入れる","移住を勧める"],"e1-5","great_famine:6:.3");
E("drought_long","dis","famine","長い干ばつ","雨が降らず、井戸も川も干上がった。",["灌漑を整える","雨乞いを行う","遷都を検討する"],"e1-4","great_famine:6:.4@1");
E("volcano_erupts","dis","disaster","火山の噴火","遠方の火山が噴火し、灰が空を覆った。",["被災地を救援する","天の怒りと解釈する","移住を支援する"],"e1-4 coast","great_famine:12:.4");
E("locust_swarm","dis","famine","蝗の大群","蝗の群れが、畑を食い尽くしている。",["全力で駆除する","祈祷に頼る","収穫を前倒しする"],"e1-3");
E("cold_summer","dis","famine","冷夏","夏が来ても寒く、作物が実らない。",["救荒作物を奨励する","備蓄を放出する","租税を免じる"],"e1-4","great_famine:8:.3");
E("storm_fleet_lost","dis","disaster","嵐で商船団が失われる","大嵐が、交易船団を沈めた。",["再建を支援する","保険の仕組みを作る","自己責任とする"],"e2-4 coast");
E("fire_palace","dis","disaster","宮殿の火災","宮殿が焼け、記録や宝物が失われた。",["再建を急ぐ","簡素に再建する","遷都を検討する"],"e1-5");
E("tsunami","dis","disaster","大津波","沿岸の港町を、巨大な波が呑み込んだ。",["高台への移転を進める","同じ場所に再建する","救援を他国に求める"],"e1-5 coast");
E("epidemic_port","dis","plague","港からの疫病","外国船が運んできた疫病が、港町で広がった。",["港を閉鎖する","検疫を設ける","交易を優先する"],"e2-5 coast","plague_wave:6:.3@2");
E("sea_level_rise","dis","disaster","海面の上昇","沿岸の村々が、潮に浸されはじめた。",["堤防を築く","内陸への移住を進める","様子を見る"],"e4-5 coast");
E("pandemic_modern","dis","plague","新しい感染症","世界のあちこちで、新しい感染症が広がっている。",["国境を封鎖する","医療に投資する","情報の公開を優先する"],"e4-5");

// ---- 文化・技術（20）
E("grand_library","cul","culture_boom","大図書館の構想","学者が、国中の書を集める大図書館を建てたいと願い出た。",["国費で建設する","民間の寄進に任せる","費用を理由に退ける"],"e1-4");
E("university_founded","cul","culture_boom","学院の創設","学問を教える学院を開く案が出された。",["創設する","教会に任せる","見送る"],"e2-4");
E("printing_arrives","cul","tech_boom","印刷術の伝来","異国から、書物を大量に刷る技術が伝わった。",["国で管理する","民間に開放する","検閲を設けて許す"],"e3-4","heresy_spread:12:.2@1");
E("great_monument","cul","culture_boom","大記念建造物","王が、永遠に残る大記念建造物の建設を望んでいる。",["建設する","規模を縮小する","税の負担を理由に見送る"],"e1-4 rich");
E("poet_golden_age","cul","culture_boom","詩の黄金時代","宮廷で優れた詩人が相次ぎ、文化が花開いた。",["保護を厚くする","民間に広げる","費用を抑える"],"e1-5 nwar");
E("steam_engine","cul","tech_boom","蒸気機関の実用化","蒸気の力で動く機械が、実用になった。",["国が導入を主導する","民間の起業を支援する","職人の仕事を守る"],"e3-4","automation_fear:24:.3");
E("railway_plan","cul","tech_boom","鉄道の建設計画","鉄の道を国中に敷く案が、実業家から出た。",["国が建設する","民間に特許を与える","軍事優先で進める"],"e4 rich");
E("radio_broadcast","cul","tech_boom","ラジオ放送の開始","声が電波に乗り、国中に届く時代が来た。",["国営にする","民間に開放する","検閲つきで許す"],"e4-5","propaganda_state:12:.3@0");
E("propaganda_state","cul","reform","国家の宣伝","放送と新聞を使って、国民の意識をまとめる案が出た。",["積極的に進める","穏当に行う","表現の自由を守る"],"e4-5 only");
E("scientific_academy","cul","tech_boom","科学アカデミーの設立","学者の集う、科学アカデミーが設立されようとしている。",["設立する","小規模で始める","宗教界の反対に配慮する"],"e3-4");
E("compulsory_school","cul","reform","義務教育の構想","全ての子供に学校教育を行う案が出た。",["導入する","段階的に進める","時期尚早とする"],"e4-5");
E("space_program","cul","tech_boom","宇宙計画","宇宙への進出を目指す国家計画が提案された。",["大規模に推進する","段階的に進める","地上の問題を優先する"],"e5");
E("ai_dawn","cul","tech_boom","機械知能の夜明け","判断を自ら行う機械が、実験室から出てきた。",["国家が管理する","民間に任せる","規制を設ける"],"e5","automation_fear:12:.4");
E("genetic_medicine","cul","tech_boom","遺伝子医療","生命の設計図に手を加える医療が実用になった。",["公的に推進する","限定的に許可する","倫理上禁じる"],"e5");
E("sailing_chart","cul","tech_boom","航海術の進歩","新しい羅針盤と海図が、航海を変えた。",["造船所に投資する","秘密にする","商人に広げる"],"e2-4 coast","new_sea_route:24:.3@0");
// ---- 奇譚（10）
E("omen_comet","odd","omen","彗星の出現","夜空に、長い尾を引く星が現れた。",["吉兆と布告する","凶兆として祈祷する","学者に観測させる"],"e1-4");
E("omen_eclipse","odd","omen","日食","昼の太陽が、突然欠けた。",["神意と発表する","学者に説明させる","混乱を抑える"],"e0-2");
E("lost_city_found","odd","culture_boom","忘れられた都市の発見","山中で、古い時代の都市の遺構が見つかった。",["発掘する","聖地として封じる","学者に調査させる"],"e1-5");
E("sleeping_king_legend","odd","culture_boom","眠れる王の伝説","「眠れる王が目覚める」という伝説が、民の間にはやった。",["伝説を利用する","禁じる","笑い飛ばす"],"e1-4");


// ---- v7.1.0: 時代ごとの出来事（時代が進んでも同じ出来事ばかり、にならないよう、各時代に固有のものを足す）。型（arch）の効果は共通
// 原始〜古代（e0-1）
E("fire_keeper_feud","ppl","person","火の番の争い","火種を守る家どうしが、誰が火の番かで争い始めた。",["長老が裁く","火を二つに分ける","放っておく"],"e0-1 w3");
E("first_envoy","dip","diplomacy_chance","遠い部族の使者","見知らぬ部族の使者が、贈り物を携えて訪れた。",["盛大にもてなす","贈り物を返して帰す","警戒して追い返す"],"e0-1 w3 friend");
E("hunting_ground_dispute","war","border","狩場の境界争い","隣の集団と、狩場の境で獲物をめぐる争いが起きた。",["戦士を並べて示威する","獲物を分ける","新しい狩場を探す"],"e0-1 w3 rival");
E("ancestor_feast","rel","religion_move","祖霊の大祭","祖霊を祀る大祭の時期が来て、供物の量で意見が割れた。",["盛大に行う","慎ましく行う","若者の祭りに変える"],"e0-2 w2");
E("great_herd","eco","trade_boom","大きな獣の群れ","大きな獣の群れが、近くを通る。",["総出で狩る","一部だけ狩り残す","追わず見送る"],"e0-1 w3");
E("hard_winter","dis","famine","長い冬","雪が例年より長く残り、蓄えが減っていく。",["蓄えを厳しく配る","隣の集団に食を乞う","狩りの遠出を命じる"],"e0-2 w3");
E("young_ones_leave","ppl","crisis","若者たちの独立","若者の一団が、集団を離れて新しい土地へ向かうと言い出した。",["引き止める","食と道具を持たせて送り出す","行かせて様子を見る"],"e0-1 w2");
E("star_priestess","odd","omen","星を読む巫女","ひとりの巫女が、星の動きから季節を言い当てた。",["側に置く","弟子を付ける","惑わすものとして遠ざける"],"e0-2 w2");
// 古代〜中世（e1-3）
E("pilgrim_caravan","rel","religion_move","巡礼団の到来","遠方からの巡礼団が、国内の聖地を目指して通る。",["道を整えて迎える","通行料を取る","国境で止める"],"e1-3 w2");
E("satirical_bard","ppl","omen","風刺する吟遊詩人","吟遊詩人が、宮廷を皮肉る歌で人気を集めた。",["捕らえて黙らせる","宮廷に招いて取り込む","歌わせておく"],"e1-3 w2");
E("monastery_estates","rel","fiscal","修道院の荘園","大きな修道院が、広い土地と免税を求めている。",["免税を認める","税の一部を納めさせる","土地を取り上げる"],"e2-3 w3");
E("heresy_preacher","rel","religion_move","異端の説教者","公認の教えと違うことを説く者が、民の心をつかんでいる。",["弾圧する","討論の場を設ける","見ぬふりをする"],"e2-3 w3");
E("town_charter","eco","reform","城下町の自治要求","城下の商人たちが、自治の特許状を求めている。",["特許状を与える","金と引き換えに与える","断って締め付ける"],"e2-3 w3");
E("mercenary_band","war","crisis","傭兵団の居座り","雇った傭兵団が、給金の滞りを理由に動かなくなった。",["給金を全額払う","土地を与える","討伐する"],"e2-3 w3 poor");
E("coastal_pirates","war","crisis","海賊の跋扈","沿岸の航路で、海賊の襲撃が相次いでいる。",["艦隊を出して討つ","懐柔して私掠免状を出す","航路を護送船団にする"],"e2-4 w3 coast");
E("scholars_petition","cul","culture_boom","学者たちの願い出","学者たちが、学びの場を設けてほしいと願い出た。",["王立の学び舎を建てる","民間の寄進に任せる","費用がかかると退ける"],"e2-3 w3");
E("press_workshop_riot","cul","omen","印刷工房の騒ぎ","印刷工房が、禁じられた小冊子を刷って騒ぎになった。",["工房を閉じる","検閲の制度を作る","自由に刷らせる"],"e3-3 w3");
E("ocean_voyage","eco","trade_boom","外洋航海の計画","船乗りたちが、未知の海へ出る航海を計画している。",["王室が出資する","商人に任せる","危険として止める"],"e2-3 w3 coast");
E("plague_ship","dis","plague","病を運ぶ船","入港した船の乗員に、熱を出して倒れる者が出た。",["港を閉じる","船を沖に留める","隔離の小屋を建てる"],"e2-3 w3 coast");
// 近世〜産業（e3-4）
E("factory_smoke","eco","crisis","工場の煙","工場街の煙で、洗濯物が黒くなり、咳をする者が増えた。",["規制する","補償金を出させる","成長を優先する"],"e4-4 w3");
E("railway_concession","eco","trade_boom","鉄道敷設の利権","鉄道の敷設権をめぐり、複数の商会が争っている。",["国が敷設する","最も出す商会に与える","分割して競わせる"],"e4-4 w3 rich");
E("workers_strike","eco","rebel_peasant","工場労働者の罷業","工場の労働者が、賃上げと労働時間の短縮を求めて持ち場を離れた。",["軍で鎮圧する","交渉の場を設ける","法で最低限を定める"],"e4-4 w3");
E("press_exposure","cul","coup_threat","新聞の暴露","新聞が、高官の不正を詳しく書き立てた。",["発行を止める","調査委員会を作る","高官を更迭する"],"e3-5 w3");
E("country_exodus","eco","crisis","農村の人口流出","若者が農村を離れ、都市の工場へ流れていく。",["農村に補助を出す","都市の住まいを整える","流れに任せる"],"e4-4 w3");
E("telegraph_line","cul","tech_boom","電信線の敷設","電信線を主要都市に通す計画が持ち上がった。",["国費で通す","民間に任せる","軍用に限る"],"e4-4 w3");
E("world_fair","cul","culture_boom","万国博覧会","各国が、技術と産物を並べる大博覧会の開催を呼びかけている。",["主催に名乗りを上げる","参加だけする","費用を理由に見送る"],"e4-4 w3 rich");
E("bank_run","eco","fiscal","銀行の取り付け","ある大銀行の経営不安が広まり、預金者が窓口に殺到した。",["国庫で支える","破綻させ整理する","預金を一部保証する"],"e4-5 w3");
E("immigrant_wave","eco","crisis","移民の流入","新しい工場を求めて、国外から多くの人が流れ込んでいる。",["受け入れて職を与える","数を制限する","地域を定めて住まわせる"],"e4-5 w3");
E("steam_monopoly","eco","trade_boom","蒸気船会社の独占","大きな蒸気船会社が、主な航路を独占しつつある。",["解体する","条件を付けて認める","補助して育てる"],"e4-4 w3 coast");
E("school_act","cul","reform","学校令の提案","子どもに最低限の学びを義務づける法が、提案された。",["全土で義務にする","都市だけで始める","費用が重いと退ける"],"e3-5 w3");
// 現代（e4-5）
E("poll_backlash","cou","crisis","世論調査の逆風","世論調査で、政府への支持が大きく落ちた。",["政策を修正する","宣伝に力を入れる","調査の結果を退ける"],"e4-5 w3 nher");
E("broadcaster_buyout","cul","omen","放送局の買収","大手の放送局が、政権に近い実業家に買い取られようとしている。",["買収を認めない","報道の中立の規則を定める","黙認する"],"e4-5 w3");
E("currency_crisis","eco","fiscal","通貨危機","自国通貨が急落し、輸入品の値が跳ね上がった。",["金利を上げる","外国の支援を受ける","通貨の価値を切り下げる"],"e4-5 w3");
E("grid_blackout","dis","disaster","大規模停電","送電網の事故で、広い地域が数日間停電した。",["送電網に大規模投資する","予備電源を各地に置く","原因の調査に留める"],"e4-5 w3");
E("corruption_charge","cou","coup_threat","汚職の告発","閣僚が、業者から多額の資金を受け取っていたと告発された。",["閣僚を罷免する","第三者に調べさせる","告発を退ける"],"e4-5 w3");
E("general_strike","eco","rebel_peasant","ゼネスト","複数の産業の労働組合が、合わせて全国規模の罷業に入った。",["要求の一部をのむ","強制的に職場へ戻す","調停の場を設ける"],"e4-5 w3");
E("airport_plan","eco","trade_boom","空港建設の計画","大都市に、新しい国際空港を建てる計画が持ち上がった。",["国費で建てる","民間と共同で建てる","見送る"],"e4-5 w3 rich");
E("campus_unrest","cul","rebel_peasant","大学紛争","学生たちが、授業料と大学の運営に抗議して校舎を占拠した。",["警官隊を入れる","学長を交代させる","学生の代表と協議する"],"e4-5 w3");
E("emission_rules","eco","reform","排出規制の圧力","大気の汚れと気候の変化への対策として、排出の規制が求められている。",["厳しい規制を導入する","段階的に導入する","産業を守って見送る"],"e5-5 w3");
E("food_price_spike","eco","famine","食料価格の高騰","世界の市場で穀物が値上がりし、国内の食料も高くなった。",["備蓄を放出する","価格を統制する","輸入先を広げる"],"e4-5 w3");
E("referendum_demand","cou","reform","国民投票の要求","重要な政策を、国民投票で決めるべきだという声が広がった。",["国民投票を行う","議会で決める","要求を退ける"],"e4-5 w3");
E("new_drug","cul","tech_boom","新薬の承認","画期的な新薬が、承認を待っている。",["早期に承認する","通常の審査を守る","高価な薬の公的負担を議論する"],"e4-5 w3");
E("summit_invite","dip","diplomacy_chance","国際会議への招待","主要国の首脳会議に、招かれた。",["自ら出席する","代表を送る","辞退する"],"e4-5 w3 friend");
// 情報・先端（e5）
E("data_leak","cul","crisis","個人情報の流出","政府系のシステムから、市民の個人情報が大量に流出した。",["責任者を処分し再発防止を法で定める","調査に専念する","影響は小さいと説明する"],"e5-5 w4");
E("disinfo_wave","cul","crisis","偽情報の拡散","偽の情報が交流サイトで広まり、世論が割れている。",["発信元を規制する","検証機関を設ける","表現の自由を優先する"],"e5-5 w4");
E("tech_giant_rules","eco","reform","巨大IT企業の規制","巨大なIT企業が、市場と情報を握りつつある。",["分割を命じる","データの扱いを規制する","育成を優先する"],"e5-5 w4");
E("cyber_attack","war","war_threat","サイバー攻撃","重要な施設が、外部からの攻撃で一時止まった。",["報復の攻撃を行う","防御に投資する","外交の場で抗議する"],"e5-5 w4 rival");
E("autonomous_delivery","eco","tech_boom","無人配送の導入","無人の配送機が、物流の主役になりつつある。",["全国に導入する","都市で試す","雇用を守るため制限する"],"e5-5 w3");
E("ai_job_fear","eco","crisis","AI による失業の不安","AI の導入で職を失う不安が、各産業に広がっている。",["再訓練に大規模に投資する","生活の給付を設ける","導入を急がせる"],"e5-5 w4");
E("falling_satellite","dis","disaster","衛星の落下","制御を失った衛星が、国内に落ちる可能性が出てきた。",["警報を出し避難させる","撃ち落とす","観測だけを続ける"],"e5-5 w3");
E("heat_wave_power","dis","disaster","熱波と電力不足","記録的な熱波で電力需要が急増し、供給が追いつかない。",["計画停電を行う","電力を輸入する","企業に節電を命じる"],"e5-5 w3");
E("remote_work_shift","eco","reform","遠隔労働の定着","多くの職場が、遠隔の働き方を取り入れ始めた。",["制度として整える","都市の再開発を進める","従来の出勤を促す"],"e5-5 w3");
E("crypto_crash","eco","fiscal","暗号資産の暴落","広く出回っていた暗号資産が暴落し、多くの人が損失を抱えた。",["救済の基金を設ける","規制を強める","自己責任とする"],"e5-5 w3");
E("new_pandemic","dis","plague","世界的な感染症の流行","新しい感染症が、各国で広がり始めた。",["国境を閉じて検査する","ワクチンの開発に出資する","経済を止めない"],"e4-5 w4");
E("spaceport_bid","eco","tech_boom","宇宙港の誘致","民間の宇宙企業が、国内への宇宙港の建設を持ちかけている。",["誘致に補助を出す","条件を付けて認める","断る"],"e5-5 w3 rich");
export const EVENT_BY_ID = Object.freeze(Object.fromEntries(EVENTS.map((e) => [e.id, e])));
