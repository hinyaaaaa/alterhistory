// v6 M3: 領域の台帳。各領域が「何を持ち（owns）・何を読み（reads）・どの処理が動かし（steps）・どの事件を残し（events）・何を保つか（invariants）」を宣言する。
//   台帳はテストで実体と突き合わされる（宣言した項目・処理・事件が実際にある）。新しい領域は、ここに宣言してから作る。
export const DOMAINS = Object.freeze([
  { id: "geography", ja: "地理・環境", owner: "core/world（生成）・civ/climate・civ/disaster", steps: ["stepClimate", "stepDisaster"], owns: ["world.cell.*"], reads: [], events: ["disaster_struck"], invariants: ["地形は生成後に手で変えない（災害・気候は人口・集団へ影響する）"] },
  { id: "population", ja: "人口・移住・集落", owner: "civ/population", steps: ["stepPopulation"], owns: ["groups", "settlements"], reads: ["geography", "tech"], events: ["settlement_founded", "group_split", "famine"], invariants: ["集団は陸にいる・集落と集団は相互参照"] },
  { id: "species", ja: "種族", owner: "civ/species・wcde/config", steps: [], owns: ["species", "speciesDefs"], reads: [], events: ["species_emerged"], invariants: ["独自種族は組み込みと同じ形（寿命・成長・技術・軍事・魔法素質）"] },
  { id: "culture", ja: "文化", owner: "civ/culture・civ/cohorts", steps: ["stepCulture", "stepCohorts"], owns: ["cultures"], reads: ["population"], events: ["culture_split"], invariants: [] },
  { id: "language", ja: "言語・命名", owner: "wcde/domains/language", steps: ["stepLanguage"], owns: ["languages.*.phon"], reads: ["culture"], events: [], invariants: ["名前の音節は、その言語の音節表に収まる", "子言語は親の音素を受け継ぎ、音変化を記録する"] },
  { id: "religion", ja: "宗教", owner: "wcde/domains/religion・civ/culture", steps: ["stepReligion"], owns: ["religions"], reads: ["culture", "language"], events: ["religion_schism"], invariants: ["創始者は分かっているときだけ（未知は null）"] },
  { id: "magic", ja: "魔法", owner: "civ/magic", steps: ["stepMagic"], owns: ["persons", "magic"], reads: ["species"], events: [], invariants: ["魔法を無効にした世界には、魔法の実体が一切ない"] },
  { id: "tech", ja: "技術", owner: "civ/tech", steps: ["stepTech"], owns: ["techWorld"], reads: ["economy", "population"], events: ["tech_discovered"], invariants: ["前提技術のない技術を持たない"] },
  { id: "economy", ja: "経済・産業・交易", owner: "wcde/domains/economy", steps: ["stepEconomy"], owns: ["states.*.econ"], reads: ["population", "tech", "war_diplomacy"], events: ["trade_route_opened", "trade_cut"], invariants: ["産業力・交易は有限の数", "戦争・制裁中は交易が成立しない"] },
  { id: "politics", ja: "国内政治", owner: "wcde/domains/politics", steps: ["stepPolitics"], owns: ["states.*.politics"], reads: ["economy", "war_diplomacy", "religion"], events: ["regime_change"], invariants: ["支持・正統性は 0〜1", "政変は事件として原因とともに残る"] },
  { id: "military", ja: "軍事組織", owner: "wcde/domains/military", steps: ["stepMilitary"], owns: ["states.*.military", "states.*.milBonus", "states.*.milDef"], reads: ["economy", "tech", "politics"], events: ["doctrine_adopted"], invariants: ["ドクトリンの前提・技術・政体を満たす", "攻撃の増分は上限 +25%、防御は +40%"] },
  { id: "war_diplomacy", ja: "戦争・外交", owner: "civ/diplomacy", steps: ["stepWars"], owns: ["wars", "treaties"], reads: ["military", "economy"], events: ["war_declared", "war_ended"], invariants: ["戦争参照は進行中のものだけ"] },
  { id: "states", ja: "国家", owner: "civ/states", steps: ["stepStates"], owns: ["states"], reads: ["population", "politics"], events: ["state_formed", "leader_succession"], invariants: ["担当国家は高々1つ"] },
  { id: "people", ja: "人物・家系", owner: "wcde/domains/people", steps: ["stepPeople"], owns: ["figures", "houses"], reads: ["states"], events: ["heir_named", "succession_by_heir", "dynasty_changed"], invariants: ["親は子より先に生まれ、子は親に載る", "出自は捏造しない（未知は null）"] },
  { id: "cities", ja: "都市", owner: "wcde/domains/people", steps: ["stepCities"], owns: ["settlements.*.name"], reads: ["population", "language", "economy"], events: [], invariants: ["付いた名前は変わらない"] },
  { id: "history", ja: "歴史の記録", owner: "civ/history・civ/graph", steps: ["recordMonth"], owns: ["history", "events", "decisions"], reads: ["states"], events: [], invariants: ["過去の月は、当時の観測値で復元できる"] },
]);
