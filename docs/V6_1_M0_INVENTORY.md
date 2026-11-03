# v6.1.0 M0 インベントリ（機械作成・暫定）

注意: 分類は仕様書のM1〜M9の指示と、ファイル名・参照grepに基づく**候補**。ファイル内容の精査は各マイルストーン着手時に行う。「要確認」は未精査。

## 1. ソース分類（core/civ・core/wcde・ui/v6）

| ファイル | 行数 | 分類 | 担当M | 根拠・方針 |
|---|---|---|---|---|
| js/core/civ/magic.js | 88 | DISABLE | M2 | 魔法の実行経路を除外（登録解除→実体・イベント・保存項目を撤去） |
| js/core/civ/species.js | 20 | REFACTOR | M2 | ファンタジー種族を除外。人類祖先・自然環境の集約モデルへ |
| js/core/civ/tech.js | 81 | REPLACE | M3 | 39件の固定ツリー→統合技術ツリー（発生・伝播・喪失・再発見・制度化） |
| js/core/civ/techfx.js | 8 | REPLACE | M3 | 技術効果を新ツリーの利用効果へ |
| js/core/civ/history.js | 108 | REPLACE | M4 | AI判断記録の永続化を廃止し、結果イベント＋資料消失モデルへ |
| js/core/civ/interpret.js | 70 | REPLACE | M4 | AI理由・観測の永続化を廃止 |
| js/core/civ/ai.js | 91 | REFACTOR | M3-M6 | 研究キュー依存を除去、作戦実行はM6の新戦争モデルへ接続 |
| js/core/civ/diplomacy.js | 75 | REFACTOR | M7 | 戦争・講和を新戦争モデルに接続 |
| js/core/civ/states.js | 93 | REFACTOR | M2/M5/M6 | 魔法参照除去・政治/軍事のWCDE統合 |
| js/core/civ/actions.js | 135 | REFACTOR | M2 | 魔法関連アクション除去 |
| js/core/civ/civ-sim.js | 71 | REFACTOR | M1/M2 | ticker登録をWCDEのドメイン契約と一致。stepMagic登録解除 |
| js/core/civ/tick.js | 39 | REFACTOR | M1 | tick順序・トランザクション失敗時の巻き戻し |
| js/core/sim/military.js | 246 | REPLACE | M6 | War/Theater/Campaign/Battle/Force階層へ置換 |
| js/core/sim/travel.js | 135 | REFACTOR | M2 | 魔法参照除去 |
| js/core/wcde/prehistory.js | 187 | REPLACE | M2 | 500,000年先史の再構築（人類祖先・生態系の集約モデル） |
| js/core/wcde/founding.js | 43 | REFACTOR | M2 | 建国候補→2フロー（担当して建国／委任） |
| js/core/wcde/domains/registry.js | 20 | REFACTOR | M1 | v6.1.0仕様へ（owns/reads/updates/emits/invariants）。magic領域は撤去 |
| js/core/wcde/domains/politics.js | 70 | REFACTOR | M5 | 魔法参照除去・支持勢力/政変/継承 |
| js/core/wcde/domains/military.js | 89 | REPLACE | M6 | ドクトリン5共通+3固有へ |
| js/core/wcde/domains/economy.js | 61 | REFACTOR | M5 | 技術ツリー・自然条件へ接続 |
| js/core/wcde/intervention.js | 79 | REFACTOR | M7 | 複数ドメイン介入・残存補正と収束・災厄コマンド |
| js/core/wcde/savefile.js | 88 | REPLACE | M9 | 新schema。v5/v6.0.0保存は拒否 |
| js/core/wcde/integrity.js | 39 | REFACTOR | M1/M2 | 魔法関連の整合性除去・新ドメイン不変条件 |
| js/core/wcde/config.js | 64 | REFACTOR | M2 | 魔法頻度等の設定を除去 |
| js/core/wcde/warlab.js | 38 | REFACTOR | M6 | 新戦争モデルの入力値へ接続 |
| js/core/wcde/clock.js | 80 | KEEP | M1 | 重大ニュース停止/再開の基盤（tick順序テストを追加） |
| js/core/wcde/contract.js | 82 | REFACTOR | M1 | Command API/AI action/介入/tickトランザクションの分離を明文化 |
| js/core/wcde/commands.js | 44 | KEEP | M1 | 外部命令の入口（dispatch）。Command ID重複防止を検証 |
| js/core/civ/civ-chunks.js | 40 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/civ-lazy.js | 67 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/civ-state.js | 61 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/cohorts.js | 44 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/commands.js | 76 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/culture.js | 44 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/disaster.js | 72 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/events.js | 10 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/graph.js | 79 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/ids.js | 19 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/population.js | 149 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/spatial.js | 23 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/civ/world-consts.js | 4 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/calendar.js | 57 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/control.js | 56 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/index.js | 21 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/negotiation.js | 75 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/save-meta.js | 2 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/world.js | 34 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/domains/actions.js | 38 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/domains/effective.js | 31 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/domains/index.js | 32 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/domains/language.js | 80 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/domains/people.js | 69 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/core/wcde/domains/religion.js | 33 | KEEP | 要確認 | ファイル単位の精査は各Mで実施（現時点は仕様に直接の変更指定なし） |
| js/ui/v6/common.js | 29 | REFACTOR | M8 | 画面を仕様に合わせて改良。全操作をCommand APIへ接続 |
| js/ui/v6/main.js | 65 | REFACTOR | M8 | 画面を仕様に合わせて改良。全操作をCommand APIへ接続 |
| js/ui/v6/map.js | 77 | REFACTOR | M8 | 画面を仕様に合わせて改良。全操作をCommand APIへ接続 |
| js/ui/v6/store.js | 10 | REFACTOR | M8 | 画面を仕様に合わせて改良。全操作をCommand APIへ接続 |
| js/ui/v6/trees.js | 51 | REFACTOR | M8 | 画面を仕様に合わせて改良。全操作をCommand APIへ接続 |
| js/ui/v6/views-a.js | 101 | REFACTOR | M8 | 画面を仕様に合わせて改良。全操作をCommand APIへ接続 |
| js/ui/v6/views-b.js | 125 | REFACTOR | M8 | 画面を仕様に合わせて改良。全操作をCommand APIへ接続 |

## 2. ディレクトリ間の依存（import件数）

| from | to | 件数 |
|---|---|---|
| js/app | js/other | 66 |
| js/app | js/core/sim | 29 |
| js/app | js/core/civ | 10 |
| js/app | js/core/world | 6 |
| js/app | js/render | 4 |
| js/app | js/io | 3 |
| js/core/sim | js/other | 65 |
| js/core/sim | js/render | 1 |
| js/core/wcde | js/core/civ | 39 |
| js/core/wcde | js/core/world | 2 |
| js/core/world | js/other | 1 |
| js/io | js/other | 20 |
| js/io | js/core/civ | 12 |
| js/io | js/render | 4 |
| js/io | js/core/sim | 3 |
| js/io | js/core/world | 2 |
| js/other | js/core/sim | 35 |
| js/other | js/app | 17 |
| js/other | js/render | 8 |
| js/other | js/core/world | 7 |
| js/other | js/core/civ | 5 |
| js/other | js/io | 3 |
| js/other | js/ui/v53 | 1 |
| js/render | js/other | 6 |
| js/render | js/core/world | 5 |
| js/render | js/app | 1 |
| js/ui/v53 | js/core/civ | 5 |
| js/ui/v53 | js/io | 5 |
| js/ui/v53 | js/render | 2 |
| js/ui/v53 | js/core/world | 1 |
| js/ui/v53 | js/app | 1 |
| js/ui/v6 | js/core/wcde | 19 |
| js/ui/v6 | js/core/civ | 6 |
| js/ui/v6 | js/io | 1 |

## 3. 魔法参照（js/、generated除外）。M2の除去対象

| 参照数 | ファイル |
|---|---|
| 53 | js/core/civ/magic.js |
| 24 | js/io/obsidian.js |
| 21 | js/core/wcde/config.js |
| 9 | js/core/wcde/integrity.js |
| 8 | js/core/wcde/domains/registry.js |
| 7 | js/ui/v53/domains.js |
| 7 | js/ui/v53/adapters/live-adapter.js |
| 7 | js/core/civ/species.js |
| 6 | js/ui/v6/main.js |
| 6 | js/core/civ/history.js |
| 5 | js/ui/history-window.js |
| 5 | js/core/wcde/prehistory.js |
| 5 | js/core/civ/actions.js |
| 4 | js/ui/v53/hub-nav.js |
| 4 | js/ui/v53/adapters/mock-adapter.js |
| 4 | js/core/civ/civ-sim.js |
| 4 | js/app/history-actions.js |
| 3 | js/ui/v53/categories.js |
| 3 | js/core/civ/tech.js |
| 2 | js/ui/v6/views-b.js |
| 2 | js/ui/v53/impact.js |
| 2 | js/ui/v53/context-panel.js |
| 2 | js/core/world/ahmap2.js |
| 2 | js/core/civ/techfx.js |
| 2 | js/core/civ/states.js |
| 2 | js/core/civ/civ-state.js |
| 1 | js/ui/v53/adapters/contract.js |
| 1 | js/core/wcde/domains/politics.js |
| 1 | js/core/sim/travel.js |
| 1 | js/core/sim/military.js |

## 4. テスト棚卸し（候補）

集計: UPDATE 50, UPDATE? 42, KEEP 21, REPLACE 17, REPLACE/UPDATE 9, REMOVE/REPLACE 1

| テスト | 候補 | 担当M | 根拠 |
|---|---|---|---|
| annotations.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| atomic.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| attributes.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| auto-check.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| balance-map.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| balance.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| build-integrity.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| builder-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| builder.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| burgs.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| chrome-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| chronicle-timeline.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| chronicle-v260.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| chronicle.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| civil-integrity.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| diplomacy-v240.test.mjs | UPDATE | M7 | 新戦争モデルとの接続に合わせて更新 |
| diplomacy-v260.test.mjs | UPDATE | M7 | 新戦争モデルとの接続に合わせて更新 |
| diplomacy.test.mjs | UPDATE | M7 | 新戦争モデルとの接続に合わせて更新 |
| doctrine-cap.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| economy-travel-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| economy-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| edit-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| event-chains.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| export.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| geometry.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| heir-v260.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| history-facts.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| history-flow.smoke.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| history-native.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| layers.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| lineage-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| lineage.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| load-validation.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| markers.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| monthly-v240.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| naming-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| naming.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| nation-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| natural-events.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| new-windows.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| newfeatures.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| notes.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| nuclear-stock.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| nuclear.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| override.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| paint.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| parcels.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| peace-parcels-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| profile.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| reader.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| rebellion-free.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| rebellion-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| rebellion.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| relations.test.mjs | UPDATE | M7 | 新戦争モデルとの接続に合わせて更新 |
| render-smooth.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| safe-render.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| setup-create.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| sim-economy.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| sim-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| stability.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| stats.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| store.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| support.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| tech-momentum.test.mjs | REPLACE | M3 | 固定ツリー/研究ポイント前提。自然発生・伝播テストへ |
| territory-grow.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| timeline-window.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| trade.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| treaties-ui.smoke.test.mjs | UPDATE | M7 | 新戦争モデルとの接続に合わせて更新 |
| treaty-migration.test.mjs | UPDATE | M7 | 新戦争モデルとの接続に合わせて更新 |
| ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v240-compat.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v250.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v270-causality.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v270-language.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v270-systems.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v270-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v300-autonomy.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v300-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v400-ahmap2.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| v400-architecture.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v400-edit.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| v400-sphere-mesh.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| v400-worldgen.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| v500-civ-app.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v500-civ-m0-m1.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v500-civ-m2-m5.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v500-civ-window.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v500-m10-history-ui.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| v500-m11-disaster.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v500-m13-release.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v500-m6-graph.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v500-m7-history.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| v500-m8-magic-species.test.mjs | REMOVE/REPLACE | M2 | 魔法・ファンタジー種族の検証。魔法が生成されない不変条件テストへ置換 |
| v500-m9-obsidian.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v500-world-map.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| v510-stability.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| v520-history-lazy.test.mjs | REPLACE/UPDATE | M4 | 履歴スキーマ・資料消失モデルへ。過去閲覧の「不明範囲」検証を追加 |
| v520-noise-cache.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| v520-projection.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| v520-render.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| v53-boot-live.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v53-live-adapter.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v53-live-scale.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v53-logic.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v53-scale-index.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v53-ui.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v53-virtual-list-scale.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v531-render.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v600-m1-config.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m2-prehistory.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m2-scale.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m3-domains.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m4-people.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m5-control.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m6-intervention.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m7-obsidian.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m7-save.test.mjs | UPDATE | M1-M9 | v6.0.0契約テスト。v6.1.0契約へ更新 |
| v600-m7-warlab-diplomacy.test.mjs | UPDATE | M7 | 新戦争モデルとの接続に合わせて更新 |
| v600-m8-news.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| v600-m8-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| version-zones-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| version.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| war-burden.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-dynamic.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-events.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-fixes.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-flow.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-hoi4.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-instant.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-progress.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-rules.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-statistics.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-types-v240.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| war-window.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| wars.test.mjs | REPLACE | M6 | v5戦争モデルの挙動検証。新War階層の不変条件・AI対AI/多国間テストへ置換 |
| windows-ui.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |
| world-info.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| writer.test.mjs | UPDATE? | 要確認 | 内容未精査。関連Mで判定 |
| zones.test.mjs | KEEP | - | 地図・描画・基盤。仕様の変更対象外（保存schema変更の影響は M9 で確認） |
| zoom-layers.smoke.test.mjs | UPDATE | M8 | UI構成変更に追随。パリティ回帰テストとして維持 |

### 未検証領域（現時点）
- E2E（tests/e2e 12本）・長期ラン（tests/long）はベースライン未取得。
- 全体 npm test の完走結果が未取得（1時間超）。
- 各テストの具体的な保証内容の精査は未実施。分類はファイル名ベースの候補。
