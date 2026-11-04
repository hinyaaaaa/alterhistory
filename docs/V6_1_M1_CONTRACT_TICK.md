# v6.1.0 M1: 領域の所有権・tick の順序・命令の入口（自動生成）

正本は `js/core/wcde/domains/registry.js`・`js/core/civ/tick.js`・`js/core/wcde/contract.js`。この文書は `node scripts/gen-v61-docs.mjs` で作り直す。

## 命令の入口（4 経路）

| 経路 | 入口 | 権限 | 内容 |
|---|---|---|---|
| 外部命令（Command API） | `contract.dispatch` | player_order, creator_intervention, administrative | UI・プレイヤー・創造主の入口。検証→取り消し点→適用→失敗時は全体を戻す。commandId で二重適用を防ぐ |
| AI 行動（AI action API） | `civ/actions.runAction` | ai_action | tick の ai_plan で計画し apply で共通の行動レジストリを通して実行する。判断の過程は保存しない |
| 創造主の介入 | `wcde/intervention` | creator_intervention | 通常計算値とは別の補正レイヤー。AI・プレイヤーは呼べない |
| 月次 tick のトランザクション | `contract.safeAdvance` | simulation_transition | 各ドメインは tick の中で、自分が所有する正本だけを更新する。失敗した月は取り消し点まで戻して再現し、半端な状態を残さない |

## 月次 tick の順序（PHASES）

1. `clock` — 世界時計を次の月へ
2. `interventions` — 創造主の介入の減衰（当月の有効値を確定）
3. `climate` — 季節・天候・気候の月次状態
4. `disaster` — 自然災害・環境ショック
5. `ecosystem` — 生態系（資源量・環境容量の集約モデル）
6. `economy_pop` — 生業・生産・食料・人口・移住
7. `culture` — 文化・言語・宗教・思想
8. `tech` — 技術の独立発生・伝播・喪失・再発見
9. `economy` — 生産・需要・産業・交易・国家財政
10. `politics` — 国内政治・支持勢力・指導者・制度
11. `military` — 軍事組織・部隊・ドクトリン・軍事能力
12. `ai_plan` — 国家AIの計画（地図を変えない・判断過程は保存しない）
13. `apply` — AI とプレイヤーの行動を共通の検証で実行
14. `conflict` — 外交・戦争・反乱・国家形成／崩壊
15. `people` — 重要人物・家系・指導者継承・都市
16. `archive` — 結果の歴史資料化（今月起きた事実だけ）
17. `integrity` — 整合性検査・診断・ニュース判定
18. `notify` — 描画・年表・パネルへの変更通知

## 領域の台帳

### 時間・暦（`clock`）
- 担当: civ/civ-state・wcde/calendar／位置: `clock`／頻度: monthly（every 1）
- 処理: `advanceClock`
- 所有（正本）: `date`, `monthIndex`
- 読む: なし／書き換える（所有しない）: なし
- 残す結果（emits）: なし
- 不変条件: 時間を進めるのは中央時計だけ / 月ごとの乱数は historySeed と月から決まる（状態を持たない）

### 創造主の介入（一時補正）（`interventions`）
- 担当: wcde/intervention／位置: `interventions`／頻度: monthly（every 1）
- 処理: `stepInterventions`
- 所有（正本）: `wcde.interventions`, `wcde.adjust`, `wcde.edits`
- 読む: economy, politics, military／書き換える（所有しない）: `techOverrides`, `groups.*.tech`, `states.*.techAdopted`
- 残す結果（emits）: なし
- 不変条件: 補正は通常計算値とは別のレイヤー（有効値 = 通常値 + 残存補正） / 介入の台帳は歴史の事実と混ぜない

### 地理・環境（`geography`）
- 担当: core/world（生成）・civ/disaster／位置: `climate`／頻度: monthly（every 1）
- 処理: `stepClimate`, `stepDisaster`
- 所有（正本）: `world.cell`, `climate`, `disasters`
- 読む: なし／書き換える（所有しない）: なし
- 残す結果（emits）: disaster_struck, climate_shift
- 不変条件: 地形は生成後に手で書き換えない（災害・気候の自然過程だけが人口・生態系へ影響する）

### 生態系（`ecosystem`）
- 担当: wcde/domains/ecosystem／位置: `ecosystem`／頻度: yearly（every 12）
- 処理: `stepEcosystem`
- 所有（正本）: `eco`
- 読む: geography, population／書き換える（所有しない）: なし
- 残す結果（emits）: ecosystem_shift
- 不変条件: 資源量は 0〜1 の有限な数 / 個体は追わず、地域の環境容量・資源量で集約する

### 人口・移住・集落（`population`）
- 担当: civ/population／位置: `economy_pop`／頻度: monthly（every 1）
- 処理: `stepPopulation`
- 所有（正本）: `groups.*.pop`, `groups.*.cell`, `groups.*.subsistence`, `groups.*.pressure`, `groups.*.settlementId`, `settlements.*.id`, `settlements.*.groupId`, `settlements.*.cell`, `settlements.*.foundedAt`, `settlements.*.pop`, `settlements.*.stage`
- 読む: geography, ecosystem, tech／書き換える（所有しない）: なし
- 残す結果（emits）: settlement_founded, group_split, famine
- 不変条件: 集団は陸にいる / 集団と集落は相互参照 / 人口は負にならない

### 文化・コホート（`culture`）
- 担当: civ/culture・civ/cohorts／位置: `culture`／頻度: monthly（every 1）
- 処理: `stepCulture`, `stepCohorts`
- 所有（正本）: `cultures`, `groups.*.cohorts`
- 読む: population／書き換える（所有しない）: なし
- 残す結果（emits）: culture_split
- 不変条件: コホートの割合の合計は 1

### 言語・命名（`language`）
- 担当: wcde/domains/language／位置: `culture`／頻度: monthly（every 1）
- 処理: `stepLanguage`
- 所有（正本）: `languages`
- 読む: culture／書き換える（所有しない）: なし
- 残す結果（emits）: language_diverged
- 不変条件: 名前の音節は、その言語の音節表に収まる / 子言語は親の音素を受け継ぐ

### 宗教（`religion`）
- 担当: wcde/domains/religion／位置: `culture`／頻度: monthly（every 1）
- 処理: `stepReligion`
- 所有（正本）: `religions`
- 読む: culture, language／書き換える（所有しない）: なし
- 残す結果（emits）: religion_founded, religion_schism
- 不変条件: 創始者は分かっているときだけ（未知は null）

### 技術（`tech`）
- 担当: civ/tech／位置: `tech`／頻度: monthly（every 1）
- 処理: `stepTech`
- 所有（正本）: `techWorld`, `groups.*.tech`, `groups.*.knowledge`, `states.*.techAdopted`, `techOverrides`
- 読む: population, geography, economy, politics／書き換える（所有しない）: なし
- 残す結果（emits）: tech_discovered, tech_transferred, tech_lost, tech_rediscovered, tech_institutionalized
- 不変条件: 前提技術のない技術を保有しない（喪失は文脈に応じた劣化を伴う） / 研究点・研究キュー・研究所は存在しない / 利用条件（行動・ユニット・制度）は技術ツリーの unlocks から導く

### 経済・産業・交易（`economy`）
- 担当: wcde/domains/economy／位置: `economy`／頻度: quarterly（every 3）
- 処理: `stepEconomy`
- 所有（正本）: `states.*.econ`
- 読む: population, tech, war_diplomacy, geography／書き換える（所有しない）: `states.*.treasury`
- 残す結果（emits）: trade_route_opened, trade_cut
- 不変条件: 産業力・交易は有限の数 / 戦争・制裁中は交易が成立しない / 交易は隣接する国家の間で成立し、開放度は両国の交易技術（fx.trade）で決まる

### 国内政治（`politics`）
- 担当: wcde/domains/politics／位置: `politics`／頻度: quarterly（every 3）
- 処理: `stepPolitics`
- 所有（正本）: `states.*.politics`, `wcde.ideas`
- 読む: economy, war_diplomacy, religion, tech, military／書き換える（所有しない）: `states.*.stability`
- 残す結果（emits）: regime_change, ideology_emerged
- 不変条件: 支持・正統性は 0〜1 / 貴族・軍・民衆は常にあり、ほかの勢力は社会構造・技術・経済・宗教・政体が整うときに成立する（固定 5 枠のコピーにしない） / 思想は条件から自然に生まれ、接触・交易・同盟で広がる。禁止はできず、世界で最初に広まった国だけが記録に残る / 政変は結果として記録される（原因の推測は残さない）

### 軍事組織（`military`）
- 担当: wcde/domains/military・wcde/domains/doctrine／位置: `military`／頻度: quarterly（every 3）
- 処理: `stepMilitary`
- 所有（正本）: `states.*.military`, `states.*.milBonus`, `states.*.milDef`
- 読む: economy, tech, politics／書き換える（所有しない）: なし
- 残す結果（emits）: doctrine_adopted
- 不変条件: ドクトリンの前提（技術・系統の前段・財政）を満たす。取得に研究点・研究キューは使わない / 共通 5 系統＋国家固有 3 系統。効果は全体の上限（攻撃 +25%・防御 +40% など）と、系統ごとの寄与の上限で抑える / 固有の系統の入れ替わりで休眠したノードは効かない（取得の記録は残る）

### 国家AI（計画と実行）（`ai`）
- 担当: civ/ai・civ/actions・wcde/domains/actions／位置: `ai_plan`／頻度: quarterly（every 1）
- 処理: `stepAIPlan`, `stepAIApply`
- 所有（正本）: `states.*.strategy`, `states.*.campaign`, `states.*.personality`
- 読む: states, economy, politics, military, tech, war_diplomacy／書き換える（所有しない）: なし
- 残す結果（emits）: なし
- 不変条件: 判断の理由・候補・観測・採点は保存しない（結果だけが歴史資料になる） / プレイヤー国家は AI が動かさない / AI とプレイヤーは同じ行動レジストリ・同じ検証を通る

### 戦争・外交（`war_diplomacy`）
- 担当: civ/diplomacy・wcde/warfare／位置: `conflict`／頻度: monthly（every 1）
- 処理: `stepWars`
- 所有（正本）: `wars`, `treaties`, `activeWarIds`, `activeTreatyIds`, `proposals`, `states.*.relations`, `states.*.sanctions`, `states.*.warIds`, `states.*.warLoss`, `states.*.blockade`
- 読む: military, economy, tech, politics／書き換える（所有しない）: `states.*.army`, `groups.*.pop`
- 残す結果（emits）: war_declared, war_ended, war_epilogue, battle_fought, territory_occupied, treaty_signed, treaty_ended, diplomacy_failed
- 不変条件: 戦争参照は進行中のものだけ / 同じ命令検証を AI とプレイヤーが通る / 戦争は War / Theater / Force / Campaign / Battle を、戦争の記録（wars.*.ops）の中の一つの正本として持つ（別々に複製しない） / 戦力の定義は戦争研究所と実戦で共通（wcde/power.js） / 終結した戦争に部隊・作戦・戦域は残らない（要約と代表的な戦いだけ） / 戦闘の乱数は (historySeed, 月, 戦争, 作戦) から導く（他の領域の乱数を動かさない）

### 国家（`states`）
- 担当: civ/states／位置: `conflict`／頻度: quarterly（every 3）
- 処理: `stepStates`
- 所有（正本）: `states.*.name`, `states.*.polity`, `states.*.alive`, `states.*.pop`, `states.*.leader`, `states.*.capitalGroupId`, `states.*.army`, `states.*.policy`, `states.*.stability`, `states.*.treasury`, `states.*.player`, `groups.*.stateId`
- 読む: population, politics, tech／書き換える（所有しない）: なし
- 残す結果（emits）: state_formed, state_dissolved, leader_succession, conquest
- 不変条件: 担当国家は高々1つ / 首都は存在する集団に基づく

### 人物・家系（`people`）
- 担当: wcde/domains/people／位置: `people`／頻度: monthly（every 1）
- 処理: `stepPeople`
- 所有（正本）: `figures`, `houses`
- 読む: states／書き換える（所有しない）: なし
- 残す結果（emits）: heir_named, succession_by_heir, dynasty_changed
- 不変条件: 親は子より先に生まれ、子は親に載る / 出自は捏造しない（未知は null）

### 都市（`cities`）
- 担当: wcde/domains/people／位置: `people`／頻度: monthly（every 1）
- 処理: `stepCities`
- 所有（正本）: `settlements.*.name`
- 読む: population, language, economy／書き換える（所有しない）: なし
- 残す結果（emits）: なし
- 不変条件: 付いた名前は変わらない

### 歴史資料（結果の記録）（`archive`）
- 担当: civ/archive／位置: `archive`／頻度: monthly（every 1）
- 処理: `stageArchive`
- 所有（正本）: `events`, `archive`, `interpretations`, `works`
- 読む: states／書き換える（所有しない）: なし
- 残す結果（emits）: なし
- 不変条件: 保存するのは起きた結果だけ（AI の判断理由・候補・観測は保存しない） / 因果リンクは直接かつ明確なものだけ / 記録の残存は recordId と historySeed から決定的に決まる / 固定間隔の完全スナップショットを持たない

### 整合性・診断・ニュース（`integrity`）
- 担当: wcde/integrity・wcde/clock／位置: `integrity`／頻度: monthly（every 1）
- 処理: `checkIntegrity`, `checkWcdeIntegrity`, `syncControl`
- 所有（正本）: `wcde.control`, `wcde.diagnostics`, `wcde.news`, `wcde.time`
- 読む: なし／書き換える（所有しない）: なし
- 残す結果（emits）: なし
- 不変条件: 構造の破損は拒否し、因果的に奇妙な状態は許容する / ニュースは UI への投影で、歴史の正本ではない

