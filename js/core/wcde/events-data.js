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
E("heir_genius","ppl","person","神童と呼ばれる世継ぎ","{s}の世継ぎは、幼くして学問と武芸に秀でた。",["名師をつけ育てる","民に姿を見せ人気を高める","慢心を恐れて隠す"],"e1-5 her");
E("heir_wastrel","ppl","tragedy_royal","世継ぎの放蕩","{s}の世継ぎは、遊興に溺れ、借財を重ねている。",["厳しく矯正する","借財を肩代わりする","弟を後継に推す"],"e1-5 her","succ_dispute:20:.3@2");
E("royal_physician","ppl","person","名医が宮廷に仕える","遠方から名医が招かれ、{L}の持病をやわらげた。",["厚く遇し留める","学院を作らせる","異国の者と警戒する"],"e1-5");
E("war_hero_return","ppl","person","老将の帰還","長年異郷で戦った老将が、故郷{s}に戻ってきた。",["顧問に迎える","領地を与え引退させる","新兵の教練を任せる"],"e1-5 nwar");
E("prophet_beggar","ppl","omen","物乞いの預言者","街角の物乞いが、{s}の行く末を言い当てたと噂される。",["宮廷に招く","聞き流す","風説を禁じる"],"e1-4");
E("court_poet","ppl","person","宮廷詩人の風刺","詩人が、{L}の治世を皮肉る詩を市中に広めた。",["詩人を罰する","詩人を庇護する","同じ詩で国威を宣揚させる"],"e1-5");
E("cruel_governor","ppl","crisis","苛政の総督","遠隔地の総督が、民から過酷な取り立てを行っている。",["解任して罰する","様子を見る","取り立てを国庫に回させる"],"e1-5 big","peasant_revolt:12:.25@12");
E("honest_judge","ppl","person","清廉な裁判官","貧しい者にも公平な裁きを下す裁判官が民の信を集めた。",["法官に昇格させる","褒賞を与える","貴族の反発から守る"],"e1-5");
E("foreign_advisor","ppl","person","異国人の顧問","{f}から来た賢者が、{s}の統治への助言を申し出た。",["顧問に任じる","学問のみ受け入れる","国政に近づけない"],"e1-5 friend");
E("spy_caught","ppl","omen","他国の間者を捕らえる","{r}の間者が宮廷に潜んでいたことがわかった。",["公開処刑する","二重間者に仕立てる","秘密裏に送還する"],"e1-5 rival");
E("assassin_attempt","ppl","tragedy_royal","暗殺未遂","{L}の食事に毒が盛られていた。企てた者は不明である。",["大規模な粛清を行う","護衛を強化する","犯人探しを控え平静を装う"],"e1-5","dictator_assassination:30:.25@2");
E("dictator_assassination","ppl","tragedy_royal","指導者暗殺","{L}が、側近の凶刃に倒れた。国は動揺している。",["首謀者を追及する","後継を急ぎ定める","国葬で結束を図る"],"e1-5 only","succ_dispute:4:.7,revolution_breaks:18:.25@0",["","ldr:assn","ldr:assn"]);
E("beloved_leader_dies","ppl","tragedy_royal","慕われた指導者の死","民に愛された{L}が世を去り、国中が喪に服した。",["盛大な国葬を営む","簡素に済ませる","追悼を政治に利用する"],"e1-5","succ_dispute:6:.3");
E("exile_returns","ppl","coup_threat","亡命者の帰還","外国に逃れていた前の王族が、帰国を求めている。",["迎え入れる","国境で拒む","外国に引き渡す"],"e1-5 her","succ_dispute:12:.3@0");
E("female_ruler_rumor","ppl","person","女傑の評判","{s}に、軍も政も動かすと評判の女性が現れた。",["政務に加える","評判を利用する","宮廷から遠ざける"],"e1-5");
E("mercenary_captain","ppl","coup_threat","傭兵隊長の売り込み","名高い傭兵隊長が、高額で{s}に仕えたいと言う。",["雇い入れる","断る","相手国に雇わせない"],"e1-5 war");
E("tutor_scholar","ppl","culture_boom","学者を家庭教師に","著名な学者が、世継ぎの師となる。",["手厚く迎える","宮廷付けにとどめる","異端と退ける"],"e1-5 her");
E("old_king_abdicates","ppl","succession_crisis","老王の退位","高齢の{L}が、後進に道を譲りたいと言い出した。",["退位を認める","続投を求める","摂政を置く"],"e1-5 her","succ_dispute:6:.2@1");
E("hunt_accident","ppl","tragedy_royal","狩猟での事故","狩りの最中に{L}が落馬し、重傷を負った。",["最高の医者を集める","祈祷にすがる","事実を伏せる"],"e1-5 her","king_sudden_death:3:.3@2");
E("royal_marriage_love","ppl","tragedy_royal","身分違いの恋","{L}が、貴族でない娘との結婚を望んでいる。",["許して結婚する","諦めさせる","養女の形にして結婚する"],"e1-5 her");
E("elder_wisdom","ppl","person","長老たちの諫言","{s}の長老たちが、{L}に政策の転換を求めた。",["諫言を容れる","一部だけ受け入れる","退ける"],"e0-2");
E("tribal_hero","ppl","person","部族の英雄","大熊を倒した若者が、部族の英雄になった。",["戦士長に取り立てる","祝宴を開く","長老の下に置く"],"e0-1 po:tribal,chiefdom");
E("saint_hermit","ppl","omen","聖者の隠遁","徳高い隠者が、山中で人々の相談に応じている。",["庵を建てて保護する","訪ねて教えを請う","民心を惑わすと警戒する"],"e1-4 coast");
E("duelist_champion","ppl","person","武芸者の名乗り","国中の武芸者が集まる試合で、無名の若者が優勝した。",["近衛に取り立てる","褒美を与え故郷へ帰す","試合の定期開催を決める"],"e1-4 nwar");
E("traitor_general","ppl","coup_threat","将軍の内通","将軍が{r}と密かに通じている疑いが出た。",["証拠を固め断罪する","忠誠を試す","疑わず任に就かせる"],"e1-5 war rival","gen_coup:6:.3@2");
E("loyal_servant","ppl","person","忠臣の最期","主君を庇って忠臣が命を落とした。",["顕彰碑を建てる","遺族を厚遇する","語らず喪に服す"],"e1-5");
E("rebel_poet_hero","ppl","omen","反骨の詩人が民衆を鼓舞する","詩人が、重税と貴族の特権を糾弾した。",["捕らえる","対話を持つ","詩を自国の誇りとして取り込む"],"e2-5 lows");
E("beauty_scandal","ppl","tragedy_royal","宮廷の醜聞","{L}の寵愛をめぐって、宮廷が揺れている。",["関係者を遠ざける","事実を公表し収める","醜聞を利用して敵を追い落とす"],"e1-5 her");
E("farmer_prophet","ppl","omen","農民の預言者","「天の怒りが近い」と説く農民に群衆が集まった。",["説教を許す","弾圧する","聖職者に調べさせる"],"e1-3","peasant_revolt:12:.2@1");
E("sea_captain_voyage","ppl","tech_boom","船長の遠洋航海計画","老練な船長が、未知の海への航海を願い出た。",["船団を与える","資金を半分出す","危険だと却下する"],"e2-5 coast","new_sea_route:36:.45@0");
E("engineer_invention","ppl","tech_boom","技師の発明","技師が、新しい機械の図面を持ち込んだ。",["工房を作らせる","特許状を与える","軍の秘密にする"],"e3-5");
E("general_retire","ppl","person","老将軍の引退","長年軍を率いた将軍が、引退を申し出た。",["後任を自ら指名させる","名誉職を与える","慰留する"],"e1-5 nwar");
E("heir_foreign_study","ppl","person","世継ぎの留学","世継ぎが、{f}に学ぶことを望んでいる。",["留学を許す","国内で学ばせる","人質のような形で送る"],"e2-5 her friend");
E("peasant_hero","ppl","coup_threat","農民出の勇士","身分の低い勇士が、戦場で貴族を救った。",["貴族に叙す","褒美のみ与える","功績を貴族に与える"],"e1-4 war");

// ---- 王家継承（25）
E("succ_dispute","dyn","succession_crisis","継承をめぐる争い","{s}で、選ばれなかった有力者が、継承の正統性を疑いはじめた。",["争う者を断罪する","領地を分けて懐柔する","外国の仲裁を求める"],"e1-5 only","succ_war:8:.4@2,king_sudden_death:0:0");
E("succ_coup_after","dyn","coup_threat","簒奪をうかがう者","{s}の新王の即位に不満を持つ将が、挙兵の機をうかがっている。",["先手を打って捕える","地位を与え取り込む","兵を集めて備える"],"only","gen_coup:6:.35@2");
E("king_sudden_death","dyn","succession_crisis","王の急死","{L}が、後継を定めぬまま急死した。",["長子を即位させる","重臣会議で決める","摂政を立てる"],"e1-5 her","succ_war:6:.35@1,succ_dispute:4:.4@0",["ldr:die","ldr:die","ldr:die"]);
E("succ_war","dyn","war_threat","継承戦争","{s}の王位をめぐり、{r}が継承権を主張して軍を動かした。",["受けて立つ","譲歩して条件を探る","同盟を頼る"],"e1-5 only rival","personal_union:14:.3@1",["warby:R:succession","","warby:R:succession"]);
E("personal_union","dyn","diplomacy_chance","同君連合の成立","{s}と{r}の王家が結ばれ、一人の王を共に戴くことになった。",["連合を受け入れる","条件を付けて結ぶ","拒んで王位を守る"],"e2-5 only rival her","union_merge:96:.3@0,union_dissolve:60:.4@1");
E("union_merge","dyn","reform","連合の統合","同君連合は、長いあいだに、一つの国としてまとまろうとしている。",["統合を推し進める","自治を保障して統合する","連合のままにする"],"e2-5 only","");
E("union_dissolve","dyn","rebel_noble","連合の解消","連合の二国は、王位の分かれとともに別々の道へ進んだ。",["円満に分かれる","連合の維持を訴える","戦をも辞さない"],"e2-5 only","");
E("regency_power","dyn","coup_threat","摂政の権力","幼い王の摂政が、廷臣を従え、国政を専断している。",["摂政を信頼する","摂政の権限を削る","摂政を排除する"],"e1-5 her","gen_coup:12:.2@0");
E("heir_born","dyn","person","待望の世継ぎ誕生","{L}に、待望の世継ぎが生まれた。",["盛大な祝祭を行う","減税で民と祝う","慎ましく祝う"],"e1-5 her");
E("no_heir","dyn","succession_crisis","世継ぎがいない","{L}には、世継ぎがなく、廷臣は不安を募らせている。",["養子を迎える","遠縁を後継に定める","重臣に選ばせる"],"e1-5 her","succ_dispute:24:.4@1");
E("illegitimate_claim","dyn","succession_crisis","庶子の請求","{L}の庶子が、王位の継承権を主張している。",["認知して領地を与える","証拠なしと退ける","修道院に入れる"],"e1-5 her","succ_dispute:10:.3@1");
E("queen_regent","dyn","person","母后の台頭","幼い王の母が、政務に口を出しはじめた。",["摂政に任命する","廷臣に補佐させる","別の摂政を立てる"],"e1-5 her");
E("royal_marriage_alliance","dyn","diplomacy_chance","政略結婚の申し出","{f}が、王家どうしの婚姻を申し込んできた。",["受け入れる","持参金を条件に応じる","断る"],"e1-5 friend her");
E("royal_marriage_scandal","dyn","tragedy_royal","結婚の破談","{r}との縁談が、直前で壊れた。",["謝罪の使者を出す","強く抗議する","別の縁談を探す"],"e1-5 rival her","border_clash:12:.3@1");
E("fratricide","dyn","tragedy_royal","兄弟の殺し合い","王位を争って兄弟が殺し合った。",["勝者を認める","生き残りを裁く","両者を排し第三者を立てる"],"e1-5 her","succ_dispute:2:.5");
E("deposed_king","dyn","coup_threat","王が廃される","廷臣たちが、無能な{L}を王位から廃した。",["廃位を追認する","王を支持する","新王の選定を急ぐ"],"e1-5 her lows","succ_dispute:3:.4",["ldr:coup","","ldr:coup"]);
E("dynasty_old_decay","dyn","crisis","王朝の衰え","{s}の王朝は、権威が衰え、各地に不満が広がっている。",["改革を進める","外征で威信を取り戻す","慎重に延命を図る"],"e2-5 her lows","dynasty_fall:36:.3@2");
E("dynasty_fall","dyn","rebel_noble","王朝の交代","民心を失った王朝に代わって、新しい家が王位に就いた。",["新王朝を承認する","旧王家を保護する","旧王家に抵抗を促す"],"e1-5 only her","",["ldr:coup","","ldr:coup"]);
E("marriage_to_commoner","dyn","person","平民の后","王が、平民の出の后を迎えた。",["祝福する","身分を与え貴族に叙す","貴族が反発すると抑える"],"e1-5 her");
E("heir_hostage","dyn","diplomacy_chance","世継ぎを人質に","{f}との友好のため、世継ぎを人質に送る案が出た。",["人質を出す","高官の子を代わりに","断る"],"e1-4 friend her");
E("royal_will","dyn","succession_crisis","王の遺言","病床の{L}が、遺言に後継を記した。",["遺言どおりに","重臣会議にかけ直す","遺言を握りつぶす"],"e1-5 her","succ_dispute:4:.3@2");
E("tanist_council","dyn","succession_crisis","氏族会議の後継選び","氏族長たちが集まり、次の首長を選ぼうとしている。",["最も強い者を推す","年長者を推す","会議を延期する"],"e0-2 po:tribal,chiefdom");
E("pretender_appears","dyn","coup_threat","偽りの王が現れる","「先王の子」を名乗る男が、地方で兵を集めた。",["討伐する","男を取り込む","外国の動きを探る"],"e1-4 her","succ_dispute:6:.25@1");
E("king_mad","dyn","tragedy_royal","王の発狂","{L}は、重い心の病に倒れ、政務を執れなくなった。",["摂政を置く","病を隠す","退位を促す"],"e1-5 her","succ_dispute:8:.3@1");
E("coronation_pomp","dyn","culture_boom","盛大な戴冠式","{s}の新王の戴冠式に、遠方からも使節が来た。",["豪華に営む","簡素に営む","諸国の使節を厚遇する"],"e1-5 her");
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
E("envoy_insult","dip","border","使節への侮辱","{r}の宮廷で、{s}の使節が侮辱を受けた。",["宣戦の口実とする","謝罪を要求する","耐えて関係を保つ"],"e1-5 rival");
E("trade_treaty_offer","dip","diplomacy_chance","通商条約の申し出","{f}から、関税を下げる通商協定の申し出が届いた。",["受け入れる","条件を厳しくして受ける","断る"],"e1-5 friend");
E("alliance_plea","dip","diplomacy_chance","同盟国の救援要請","同盟国{f}が、隣国との戦いに助力を求めている。",["援軍を送る","資金で助ける","中立を保つ"],"e1-5 friend war");
E("tribute_demand","dip","war_threat","朝貢の要求","強国{r}が、{s}に貢物を求める使者を送った。",["従う","拒んで備える","外交で時間を稼ぐ"],"e1-4 rival","border_clash:6:.3@1");
E("peace_conference","dip","diplomacy_chance","和平会議の提唱","諸国が、紛争を収める会議の開催を求めている。",["参加して仲介を受ける","条件をつけて出席する","欠席する"],"e3-5 war");
E("trade_war","dip","trade_boom","関税をめぐる争い","{r}が、{s}の商品に高い関税をかけた。",["報復関税をかける","交渉を求める","他の取引先を探す"],"e2-5 rival");
E("border_treaty","dip","diplomacy_chance","国境画定の提案","{f}が、国境の画定を提案した。",["受ける","一部修正して受ける","拒む"],"e2-5 friend");
E("great_embassy","dip","diplomacy_chance","大使節団の来訪","遠方の大国から、大使節団が{s}を訪れた。",["最大限もてなす","簡素に迎える","警戒して制限する"],"e1-4","trade_treaty_offer:6:.4@0");
E("refugee_wave","dip","crisis","難民の流入","戦乱を逃れた難民が、{s}の国境に押し寄せた。",["受け入れる","一部を受け入れる","国境を閉ざす"],"e1-5 rival");
E("spy_scandal_ally","dip","omen","同盟国への諜報の発覚","{f}に仕掛けた諜報が、露見した。",["関与を否定する","謝罪する","開き直る"],"e2-5 friend");
E("naval_incident","dip","border","海上の衝突","{r}の船団と、{s}の船団が、海上で砲火を交えた。",["艦隊を増強する","外交抗議にとどめる","共同の巡視を提案する"],"e3-5 rival coast");
E("rival_embargo","dip","trade_boom","禁輸措置","{r}が、{s}への主要物資の輸出を止めた。",["代替の供給源を探す","武力で打開する","交渉で緩和を求める"],"e2-5 rival","border_clash:6:.3@1");
E("diplomatic_marriage_crisis","dip","tragedy_royal","外交上の婚姻の拒否","{f}が、{s}の縁談を断った。",["不快を示す","別の相手を探す","穏当に受け止める"],"e1-5 friend her");
E("neighbor_collapse","dip","opportunity_war","隣国の混乱","{r}で内乱が続き、国境の守りが薄くなった。",["介入して領土を取る","亡命者を保護し影響を及ぼす","不介入を保つ"],"e1-5 rival","",["warby:R:plunder","",""]);
E("pact_proposal","dip","diplomacy_chance","共同防衛の誘い","数か国が、共同の防衛盟約を結ぼうと{s}を誘った。",["加盟する","条件付きで加わる","加盟しない"],"e2-5");
E("hostage_incident","dip","crisis","人質事件","{s}の商人が、{r}で捕えられた。",["武力をちらつかせる","身代金を払う","使節を送って交渉する"],"e1-5 rival");
E("protest_note","dip","border","抗議の書簡","{r}が、{s}の政策に抗議する書簡を送ってきた。",["強硬に反論する","丁寧に返答する","無視する"],"e2-5 rival");
E("cultural_exchange","dip","culture_boom","文化交流団","{f}から、学者と楽人が訪れ、交流を申し出た。",["受け入れる","学者のみ受け入れる","断る"],"e1-5 friend");
E("grain_aid","dip","famine","食糧援助の依頼","{f}が、凶作で食糧の援助を求めている。",["援助する","売却に切り替える","断る"],"e1-5 friend rich");
E("vassal_demand","dip","opportunity_war","従属国の増額要求","従属国が、庇護の見返りの増額を求めた。",["応じる","断る","内部に介入して統制する"],"e2-5");
E("neutral_declaration","dip","war_threat","中立の宣言","大国どうしの戦いのなか、{s}は中立を宣言するかどうかを迫られた。",["中立を守る","一方につく","どちらも警戒して軍備を整える"],"e2-5 war");
E("treaty_violation","dip","border","条約違反の疑い","{r}が、結んだ条約に背いたと疑われている。",["厳重に抗議する","証拠を集める","不問に付す"],"e2-5 rival","border_clash:8:.3@0");
E("alliance_betrayal","dip","tragedy_royal","同盟国の裏切り","同盟国が、{s}を見捨て、敵国と和した。",["絶縁する","理由を問いただす","新しい同盟国を探す"],"e1-5 friend war");
E("global_council","dip","diplomacy_chance","国際会議への招待","新しい秩序をつくる国際会議への招きが来た。",["代表団を送る","書面で意見を送る","参加しない"],"e4-5");
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
E("peace_rumor","war","war_threat","和平の噂","敵が和平を探っているとの噂が流れた。",["会談に応じる","戦果を広げてから応じる","噂を無視する"],"e1-5 war");
E("war_profiteer","war","fiscal","戦争成金","戦で財を成した商人が、宮廷に影響力を持ちはじめた。",["課税する","取り込む","遠ざける"],"e2-5 war");
E("veterans_return","war","reform","帰還兵の処遇","遠征から戻った兵が、恩賞と土地を求めている。",["土地を与える","年金を与える","解散して帰農させる"],"e1-5 nwar","peasant_revolt:12:.15@2");
E("siege_engine","war","tech_boom","攻城兵器の開発","新しい攻城兵器が開発され、城壁の価値が揺らいでいる。",["採用する","情報を守る","城壁の強化を優先する"],"e1-3");
E("naval_victory","war","war_threat","海戦の大勝","{s}の艦隊が、敵艦隊を打ち破り、制海権を握った。",["海上封鎖へ移る","勝利を機に講和する","海軍を増強する"],"e2-5 coast war");
E("fifth_column","war","omen","内通者の暗躍","敵に通じる者が、軍の動きを漏らしていた。",["大規模に摘発する","偽情報を流す","警戒を呼びかけるのみ"],"e1-5 war");
E("scorched_earth","war","war_threat","焦土作戦","敵の進軍を遅らせるため、国境の村を焼く案が出た。",["実行する","一部のみ行う","民を守って戦う"],"e1-5 war");
E("armistice_offer","war","diplomacy_chance","休戦の申し出","敵が、一時の休戦を申し出た。",["受け入れる","条件を付ける","拒む"],"e1-5 war");
E("captured_commander","war","war_threat","敵将を捕虜にする","戦いで、敵の指揮官を生け捕りにした。",["身代金を取る","丁重に扱い交渉に使う","処刑する"],"e1-5 war");
E("garrison_famine","war","famine","要塞の飢え","包囲された要塞で、食糧が尽きかけている。",["突破を試みる","食糧を空輸する","降伏を考える"],"e3-5 war");
E("mobilization_decree","war","war_threat","総動員の布告","国難に際して、総動員令を出す案がある。",["総動員する","部分動員にとどめる","外交で打開する"],"e3-5 war");
E("nuclear_scare","war","war_threat","核の恐怖","敵国が新型の大量破壊兵器を持ったとの情報が入った。",["査察を求める","軍備を急ぐ","交渉の場を設ける"],"e5 rival");
E("space_race","war","tech_boom","宇宙をめぐる競争","{r}が軌道に衛星を打ち上げた。",["追随して投資する","同盟国と共同で進める","地上の防衛を優先する"],"e5 rival");
// ---- 宗教（20）
E("reformation_preacher","rel","religion_move","改革を説く説教師","教会の腐敗を糾弾する説教師が、民衆の人気を集めた。",["弾圧する","討論を許す","改革を取り込む"],"e2-4","church_lands:24:.4@2,religious_war:18:.3@0");
E("church_lands","rel","religion_move","教会領の没収","教会が持つ広大な領地を、国庫に収めようとの案が出た。",["没収する","一部を没収する","寄進を求めるにとどめる"],"e2-4 only","religious_war:12:.4@0,toleration_edict:24:.3@2");
E("religious_war","rel","opportunity_war","宗教戦争","信仰の違いを理由に、国が二つに割れて戦いが始まった。",["正統を掲げて戦う","穏健派と和を探る","外国の調停を頼む"],"e2-4 only","toleration_edict:36:.5",["rebel:religious","",""]);
E("toleration_edict","rel","reform","寛容令","長い争いの末に、信仰の自由を認める勅令が出された。",["寛容令を出す","限定的に認める","従来の方針を続ける"],"e2-5 only");
E("heresy_spread","rel","religion_move","異端の広がり","正統とは異なる教えが、{s}の民に広がっている。",["異端審問を行う","寛容に扱う","教義の議論を促す"],"e1-4");
E("pilgrimage_boom","rel","trade_boom","巡礼の盛況","聖地への巡礼が盛んになり、街道に人が絶えない。",["巡礼路を整備する","巡礼税を課す","宿泊所を教会に任せる"],"e1-4");
E("temple_wealth","rel","fiscal","神殿の蓄財","神殿が貴金属を蓄え、国庫を上回る富を持った。",["寄進を求める","神殿を保護する","世俗化を進める"],"e1-4","church_lands:24:.3@0");
E("miracle_claimed","rel","omen","奇跡の主張","「病が癒えた」と、農村で多くの人が証言している。",["奇跡を公認する","調査を命じる","民心を惑わすと禁じる"],"e1-4");
E("religious_schism","rel","crisis","教義の分裂","教義の解釈をめぐって、聖職者が二派に分かれた。",["一方を支持する","公会議を開く","分裂を放置する"],"e1-5","religious_war:18:.2@2");
E("missionary_arrives","rel","religion_move","宣教師の来訪","異国の宣教師が、新しい教えを広めに来た。",["布教を許す","特定の地域に限る","追放する"],"e1-4 friend");
E("inquisitor_zeal","rel","religion_move","審問官の暴走","異端審問官が、権限を逸脱して貴族を捕えた。",["審問官を抑える","支持する","貴族に慎重を求める"],"e2-4","reformation_preacher:12:.2@1");
E("holy_war_call","rel","war_threat","聖戦の呼びかけ","聖職者が、異教徒との聖戦を民に呼びかけている。",["聖戦を宣言する","呼びかけを抑える","外交で圧力をかける"],"e1-4 rival","border_clash:6:.3@0");
E("sacred_text_found","rel","culture_boom","聖典の発見","古い聖典の写本が発見され、教義の論争が燃えた。",["写本を公認する","研究を命じる","秘蔵する"],"e1-4");
E("priest_king_cult","rel","religion_move","王の神格化","聖職者が、{L}を神の子とする教えを説いた。",["受け入れる","限定的に認める","拒む"],"e0-2 her");
E("secular_reform","rel","reform","政教分離の機運","国の統治と信仰を分けよ、との声が広がっている。",["分離を進める","漸進的に進める","聖職者と協調する"],"e3-5","toleration_edict:12:.2@0");
E("cult_sect_rises","rel","crisis","新興教団の台頭","終末を説く新興教団が、民の心をとらえた。",["解散させる","穏健に取り込む","様子を見る"],"e2-5 lows");
E("temple_collapse","rel","disaster","神殿の崩壊","地震で、国の中心の神殿が崩れた。",["再建に全力を傾ける","簡素に建て直す","吉凶を占う"],"e1-4","omen_comet:6:.2");
E("rite_of_spring","rel","culture_boom","春の祭り","国中で、豊穣を祈る祭りが営まれる。",["国費で盛大に行う","民の自主に任せる","簡素にする"],"e0-3");
E("religious_scholars_debate","rel","culture_boom","大論争","諸宗派の学者が、公開で教理を戦わせた。",["自ら臨席する","後援する","騒ぎだと制限する"],"e2-4");
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
E("harvest_boom","eco","trade_boom","大豊作","今年は、収穫が記録的な量に達した。",["余剰を備蓄する","輸出する","民に還元する"],"e1-4");
E("market_riot","eco","rebel_peasant","市場の暴動","パンの値上がりで、市場が暴徒に襲われた。",["価格を統制する","兵を出す","穀物を配る"],"e2-5 poor");
E("guild_monopoly","eco","trade_boom","同業組合の独占","職人組合が、新規参入を排除している。",["特権を認める","独占を禁じる","課税して見逃す"],"e2-4");
E("silver_mine","eco","trade_boom","銀鉱の発見","山中で、大きな銀鉱が見つかった。",["王室が直営する","民間に開放する","外国に権利を売る"],"e1-4","inflation_crisis:36:.35@0");
E("inflation_crisis","eco","fiscal","物価の高騰","貨幣の増えすぎで、物価が上がり続けている。",["貨幣の改鋳を行う","価格統制を試みる","市場に任せる"],"e2-5","market_riot:6:.3@2");
E("debt_trap","eco","fiscal","国債の返済難","国の借金が膨らみ、貸し手が返済を急かしている。",["増税で返す","債務の整理を求める","利払いを延ばす"],"e2-5 poor");
E("canal_project","eco","trade_boom","大運河の計画","国を貫く運河を掘れば、交易が潤うと技師が説いた。",["建設を決める","一部の区間から始める","費用を理由に見送る"],"e1-5 rich");
E("road_network","eco","tech_boom","街道網の整備","主要都市をつなぐ街道を整える案が出た。",["国費で整備する","通行税で賄う","軍事用に限る"],"e1-5");
E("migrant_workers","eco","crisis","出稼ぎ労働者の流入","都市に、各地から貧しい出稼ぎの人々が集まっている。",["住居を整備する","流入を制限する","市場に任せる"],"e3-5");
E("tax_reform_proposal","eco","reform","税制の改革案","役人が、土地の広さに応じた新しい税制を提案した。",["導入する","一部の地域で試す","反対する"],"e1-4","tax_burden:12:.2@0");
E("black_market","eco","crisis","闇市の拡大","統制を逃れた闇市が、都市に広がっている。",["取り締まる","課税して公認する","放置する"],"e3-5 lows");
E("urban_fire","eco","disaster","都市の大火","都の商業地区が、炎に包まれた。",["区画整理を断行する","元どおりに再建する","防火の制度を作る"],"e1-5");
E("orphan_crisis","eco","crisis","孤児の増加","戦と飢えで、街に孤児が溢れている。",["養育院を設ける","教会に委ねる","民間に任せる"],"e1-5");
E("pension_demand","eco","fiscal","年金制度の要求","老いた労働者が、国に生活の保障を求めている。",["制度を作る","小規模に始める","拒む"],"e4-5");
E("housing_shortage","eco","crisis","住宅の不足","都市の人口が急増し、住まいが足りない。",["公営住宅を建てる","民間に任せる","都市の拡張を禁じる"],"e4-5");
E("automation_fear","eco","crisis","機械化への不安","新しい機械が、職人の仕事を奪おうとしている。",["導入を奨励する","導入を遅らせる","補償を設ける"],"e4-5");
E("trade_fair","eco","trade_boom","大市の開催","国境の町で、大きな市が開かれる。",["国が主催する","商人に任せる","関税を免除する"],"e1-4");
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
E("pestilence_cattle","dis","plague","家畜の疫病","牛馬の疫病が広がり、農耕に支障が出ている。",["家畜を処分する","隔離して様子を見る","他国から導入する"],"e1-3");
E("avalanche_pass","dis","disaster","峠の雪崩","交易の要の峠が、雪崩で塞がれた。",["復旧する","別の道を拓く","放置する"],"e1-4");
E("tsunami","dis","disaster","大津波","沿岸の港町を、巨大な波が呑み込んだ。",["高台への移転を進める","同じ場所に再建する","救援を他国に求める"],"e1-5 coast");
E("epidemic_port","dis","plague","港からの疫病","外国船が運んできた疫病が、港町で広がった。",["港を閉鎖する","検疫を設ける","交易を優先する"],"e2-5 coast","plague_wave:6:.3@2");
E("heat_wave","dis","famine","酷暑","猛暑で、家畜と人が倒れている。",["水の配給を行う","祈祷を命じる","作業を夜に移す"],"e1-5");
E("sea_level_rise","dis","disaster","海面の上昇","沿岸の村々が、潮に浸されはじめた。",["堤防を築く","内陸への移住を進める","様子を見る"],"e4-5 coast");
E("industrial_smog","dis","plague","工場の煤煙","工業都市に煤煙が立ち込め、病人が増えている。",["規制を設ける","産業を優先する","移転を命じる"],"e4-5");
E("pandemic_modern","dis","plague","新しい感染症","世界のあちこちで、新しい感染症が広がっている。",["国境を封鎖する","医療に投資する","情報の公開を優先する"],"e4-5");
E("mine_collapse","dis","disaster","炭鉱の落盤","炭鉱で落盤が起き、多くの坑夫が埋まった。",["救出に全力を尽くす","補償する","安全の規則を設ける"],"e3-5");
E("meteor_fall","dis","disaster","隕石の落下","空から降った石が、野を焼いた。",["被害を調べる","聖なる石として祀る","立ち入りを禁じる"],"e1-5");
E("climate_shift_local","dis","famine","気候の変調","数年にわたり、気候が以前と変わってしまった。",["農法を改める","移住を検討する","従来の暮らしを続ける"],"e1-5");

// ---- 文化・技術（20）
E("grand_library","cul","culture_boom","大図書館の構想","学者が、国中の書を集める大図書館を建てたいと願い出た。",["国費で建設する","民間の寄進に任せる","費用を理由に退ける"],"e1-4");
E("university_founded","cul","culture_boom","学院の創設","学問を教える学院を開く案が出された。",["創設する","教会に任せる","見送る"],"e2-4");
E("printing_arrives","cul","tech_boom","印刷術の伝来","異国から、書物を大量に刷る技術が伝わった。",["国で管理する","民間に開放する","検閲を設けて許す"],"e3-4","heresy_spread:12:.2@1");
E("great_monument","cul","culture_boom","大記念建造物","王が、永遠に残る大記念建造物の建設を望んでいる。",["建設する","規模を縮小する","税の負担を理由に見送る"],"e1-4 rich");
E("poet_golden_age","cul","culture_boom","詩の黄金時代","宮廷で優れた詩人が相次ぎ、文化が花開いた。",["保護を厚くする","民間に広げる","費用を抑える"],"e1-5 nwar");
E("steam_engine","cul","tech_boom","蒸気機関の実用化","蒸気の力で動く機械が、実用になった。",["国が導入を主導する","民間の起業を支援する","職人の仕事を守る"],"e3-4","automation_fear:24:.3");
E("railway_plan","cul","tech_boom","鉄道の建設計画","鉄の道を国中に敷く案が、実業家から出た。",["国が建設する","民間に特許を与える","軍事優先で進める"],"e4 rich");
E("electric_light","cul","tech_boom","電気の灯り","都市に、電灯がともった。",["全国に広げる","都市から整える","費用を理由に遅らせる"],"e4");
E("radio_broadcast","cul","tech_boom","ラジオ放送の開始","声が電波に乗り、国中に届く時代が来た。",["国営にする","民間に開放する","検閲つきで許す"],"e4-5","propaganda_state:12:.3@0");
E("propaganda_state","cul","reform","国家の宣伝","放送と新聞を使って、国民の意識をまとめる案が出た。",["積極的に進める","穏当に行う","表現の自由を守る"],"e4-5 only");
E("scientific_academy","cul","tech_boom","科学アカデミーの設立","学者の集う、科学アカデミーが設立されようとしている。",["設立する","小規模で始める","宗教界の反対に配慮する"],"e3-4");
E("compulsory_school","cul","reform","義務教育の構想","全ての子供に学校教育を行う案が出た。",["導入する","段階的に進める","時期尚早とする"],"e4-5");
E("sports_festival","cul","culture_boom","競技会の開催","国中から選手が集まる競技会を開く案が出た。",["国威として開く","地方の祭りに任せる","費用を抑える"],"e1-5 nwar");
E("space_program","cul","tech_boom","宇宙計画","宇宙への進出を目指す国家計画が提案された。",["大規模に推進する","段階的に進める","地上の問題を優先する"],"e5");
E("ai_dawn","cul","tech_boom","機械知能の夜明け","判断を自ら行う機械が、実験室から出てきた。",["国家が管理する","民間に任せる","規制を設ける"],"e5","automation_fear:12:.4");
E("genetic_medicine","cul","tech_boom","遺伝子医療","生命の設計図に手を加える医療が実用になった。",["公的に推進する","限定的に許可する","倫理上禁じる"],"e5");
E("translators_movement","cul","culture_boom","翻訳運動","異国の書物を自国語に訳す大事業が起きた。",["国で支援する","民間に任せる","自国の伝統を守る"],"e2-4");
E("sailing_chart","cul","tech_boom","航海術の進歩","新しい羅針盤と海図が、航海を変えた。",["造船所に投資する","秘密にする","商人に広げる"],"e2-4 coast","new_sea_route:24:.3@0");
E("medical_college","cul","tech_boom","医学校の設立","医術を体系的に教える学校の設立が提案された。",["設立する","小規模から始める","祈祷師の反発を恐れる"],"e2-4");
E("theatre_boom","cul","culture_boom","演劇の隆盛","都市で、民衆が楽しむ演劇が盛んになった。",["保護する","検閲を設ける","税を課す"],"e2-5");
// ---- 奇譚（10）
E("omen_comet","odd","omen","彗星の出現","夜空に、長い尾を引く星が現れた。",["吉兆と布告する","凶兆として祈祷する","学者に観測させる"],"e1-4");
E("omen_eclipse","odd","omen","日食","昼の太陽が、突然欠けた。",["神意と発表する","学者に説明させる","混乱を抑える"],"e0-4");
E("lost_city_found","odd","culture_boom","忘れられた都市の発見","山中で、古い時代の都市の遺構が見つかった。",["発掘する","聖地として封じる","学者に調査させる"],"e1-5");
E("talking_beast","odd","omen","語る獣","「獣が人の言葉を語った」との噂が、村々に広がった。",["調べさせる","噂を放置する","禁じる"],"e0-3");
E("twin_suns","odd","omen","二つの太陽","蜃気楼のなか、空に二つの太陽が見えた。",["瑞兆と祝う","凶兆として備える","観測を命じる"],"e1-4");
E("ghost_fleet","odd","omen","幽霊船","霧の海に、見知らぬ船団が現れ、消えた。",["海軍に警戒させる","祈祷を行う","漁師の話と片付ける"],"e1-5 coast");
E("sleeping_king_legend","odd","culture_boom","眠れる王の伝説","「眠れる王が目覚める」という伝説が、民の間にはやった。",["伝説を利用する","禁じる","笑い飛ばす"],"e1-4");
E("mysterious_stones","odd","omen","奇妙な石の円環","野に、誰が建てたか分からない巨石が並んでいた。",["神殿にする","研究させる","破壊する"],"e0-2");
E("child_oracle","odd","omen","神託の子","幼い子供が、未来を言い当てると評判になった。",["宮廷に迎える","親元に返す","聖職者に預ける"],"e1-4");
E("plague_doctor_cult","odd","omen","奇病治療の流行","根拠のない治療法が、都で大流行している。",["禁止する","医師に検証させる","放置する"],"e2-4");


export const EVENT_BY_ID = Object.freeze(Object.fromEntries(EVENTS.map((e) => [e.id, e])));
