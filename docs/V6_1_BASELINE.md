# v6.1.0 M0 ベースライン記録（途中版）

- 基準: main = bba77f21d7bd6713ad8e02c62445d646e2dc15f1（v6.0.0 released）。先行コミットなし。作業ブランチ: feat/v6.1.0-wcde
- 作業ツリー: クリーン（実装着手前）

## 実行結果（Node・サンドボックス環境）
| 項目 | 結果 |
|---|---|
| npm ci | 成功（61パッケージ） |
| npm run build | 成功（6.0.0） |
| npm run build:check | 成功（全OK） |
| npm test | 実行に1時間以上。取得時点で OK 2443件・FAIL 2件。全体は未完了（スイートは tests/*.test.mjs 140ファイル） |
| test:e2e | 未実行（Playwright用ブラウザの取得先がネットワーク許可外の見込み。ユーザー環境で実行が必要） |
| tests/long/long-run.mjs | 未実行（軽量ベースライン方針のため対象外） |
| GitHub Actions（基準コミットのCI） | 未確認（API 403。ブラウザで要確認） |

## FAIL 2件の暫定分類（全体実行時）
1. tests/v300-autonomy.test.mjs「アルゴリズム国家どうしの戦争は、講和条約で終わる…」
   - 単独再実行では全件成功（OK 29・exit 0）。全体実行時のみ失敗 → 非再現。負荷・実行順依存の可能性。原因は未特定。
   - 検証対象はv5戦争進行であり、M6で戦争実行を置換する際に不変条件テストへ置換予定。
2. tests/v500-civ-m2-m5.test.mjs「性能: 1,000年の月次進行が30秒以内」: 32.6秒
   - 実装バグではなく環境差（共有CPU・他プロセス並走）の疑い。単独再計測は未実施。閾値は緩和しない。

## 構成メモ（M1以降の入口）
- js/core/wcde: 約1,500行。domains/registry.js に領域台帳（geography, population, species, culture, language, religion, magic, tech …）。
- 魔法: registry の magic 領域、civ/magic.js、civ/species.js、civ/techfx.js、civ/tech.js、civ/states.js、civ/civ-sim.js、civ/actions.js、wcde/prehistory.js・integrity.js・config.js・domains/politics.js、sim/military.js・travel.js、ui/v6/main.js・views-b.js 等が参照（M2で実行経路から切り離す。削除は依存確認後）。
- 既存テストの魔法・ファンタジー種族検証（例: M8魔法、種族の軍事適性）はM2で REPLACE/REMOVE 候補。

## 未了（M0残り）
- 既存機能一覧（ユーザー向け機能・画面・保存挙動）
- テスト棚卸し（KEEP/UPDATE/REPLACE/MERGE/REMOVE 分類。140ファイル）
- 全体 npm test の完走結果
