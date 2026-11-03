# v6.0.0 WorldState所有権表とtick順序（M0・現状記録）

M1で v6.1.0 仕様へ更新する前の「現状」。registry.js と core/civ/civ-sim.js から抽出。

## 領域の所有権（registry.js）

| id | 名称 | 所有コード | steps | owns | reads |
|---|---|---|---|---|---|
| geography | 地理・環境 | core/world（生成）・civ/climate・civ/disaster | stepClimate, stepDisaster | world.cell.* |  |
| population | 人口・移住・集落 | civ/population | stepPopulation | groups, settlements | geography, tech |
| species | 種族 | civ/species・wcde/config |  | species, speciesDefs |  |
| culture | 文化 | civ/culture・civ/cohorts | stepCulture, stepCohorts | cultures | population |
| language | 言語・命名 | wcde/domains/language | stepLanguage | languages.*.phon | culture |
| religion | 宗教 | wcde/domains/religion・civ/culture | stepReligion | religions | culture, language |
| magic | 魔法 | civ/magic | stepMagic | persons, magic | species |
| tech | 技術 | civ/tech | stepTech | techWorld | economy, population |
| economy | 経済・産業・交易 | wcde/domains/economy | stepEconomy | states.*.econ | population, tech, war_diplomacy |
| politics | 国内政治 | wcde/domains/politics | stepPolitics | states.*.politics | economy, war_diplomacy, religion |
| military | 軍事組織 | wcde/domains/military | stepMilitary | states.*.military, states.*.milBonus, states.*.milDef | economy, tech, politics |
| war_diplomacy | 戦争・外交 | civ/diplomacy | stepWars | wars, treaties | military, economy |
| states | 国家 | civ/states | stepStates | states | population, politics |
| people | 人物・家系 | wcde/domains/people | stepPeople | figures, houses | states |
| cities | 都市 | wcde/domains/people | stepCities | settlements.*.name | population, language, economy |
| history | 歴史の記録 | civ/history・civ/graph | recordMonth | history, events, decisions | states |

## 月次tick順序（civ-sim.js の ticker.register 順）

1. clock（日付更新・月ごとの乱数）
2. climate（stepClimate）
3. disaster（stepDisaster）
4. economy_pop（stepPopulation）
5. culture（stepCulture → stepCohorts → **stepMagic**）
6. tech（stepTech）
7. ai_plan（stepAIPlan）
8. apply（stepAIApply）
9. conflict（stepStates → stepWars → stepInterpretation）
10. integrity（毎月は軽い検査、120か月ごとに全件）→ recordMonth
11. WCDE拡張（経済・政治・軍事・言語など）を extensions で追加登録

## M1への論点
- stepMagic（5番）は M2 で登録解除。
- 外部命令は dispatch()、内部tickはWCDE管理下のトランザクション内で更新、の分離を contract.js に明文化する。
- 拡張ドメインの実行位置は ticker 末尾側。技術→AI→戦争の依存（研究キュー依存の除去）を M3 で見直す。
- 失敗時の巻き戻し（半端な状態を残さない）は現状のテスト保証を M1 で確認する。
