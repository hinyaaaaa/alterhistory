# v6.1.0 テスト変更レポート（M9）

ベースライン（v6.1.0-m8）: `npm test` 140 スイート中 115 合格・25 失敗。

## 方針

仕様 §17.6 に従い、(a) 実装が悪いものは実装を直し、(b) v6.1.0 で意図して変えた仕様にテストが追いついていないものはテストを直し、
(c) v5 の起動手順を前提にして成り立たないものは削除せず `tests/legacy-v5/` へ移した（`npm run test:legacy`）。閾値を緩めたのは (b) で理由があるものだけ。

## 実装を直したもの

- 終わった戦争の作戦が、のちに消滅した集団を参照して整合性違反になる（`warfare.js`）。
- 台帳（`domains/registry.js`）が、歴史資料の書き出しを月次処理と誤って宣言／存在しない `techOverrides` を宣言。
- 先史の技術年代・人口規模・海渡り（`docs/V6_1_CALIBRATION.md`）。
- 起動画面の副題が中央に揃わない（CSS クラス名の衝突）。建国画面で操作が下に押し出される。

## テストを仕様に合わせたもの

- `v600-m3-domains`: ドクトリン（共通 25 + 国家固有 3 系統）、勢力、履歴（月次スナップショットなし。資料アーカイブ）。
- `v600-m5-control`: AI の判断は保存しない（結果の出来事 provenance=ai）／創造主の編集は介入の台帳に残り出来事とは混ぜない。
- `v600-m7-warlab-diplomacy`・`v600-m7-obsidian`: 攻める側・守る側で入力が違う／要因は台帳に保存しない。
- `v600-m8-ui.smoke`・`v600-m2-scale`・`v400-worldgen`・`v500-world-map`・`v520-noise-cache`・`version*`: 文言・上限セル数・既定の陸地率・当時の既定の明示・版。
- `tests/e2e/v6.e2e.mjs`: 重大ニュースの全画面が出たら OK を押してから操作する。

## 新規

`v610-m9-core`（較正・人口の解像度非依存・決定性・判断を保存しない・資料アーカイブ・100 年の整合性）、`v610-m1-config`、`v600-m7-save` に schema 2 の拒否テスト。

## tests/legacy-v5/ へ移したもの

v500-civ-m0-m1 v500-civ-m2-m5 v500-civ-window.smoke v500-m10-history-ui v500-m11-disaster v500-m13-release v500-m6-graph v500-m7-history v500-m8-magic-species v500-m9-obsidian v510-stability v520-history-lazy v53-boot-live v53-live-adapter v53-live-scale v600-m1-config 

v5 の起動手順（単一の初期集団・判断の保存・月ごとの全件スナップショット・魔法・独自種族）を前提にし、v6.1.0 では成り立たない。
代替: 上の新規テストと、v600 系のテストが、v6.1.0 で成り立つ性質（国家の成立・整合性・保存・アーカイブ・決定性）を引き継ぐ。
v5 の画面（`v5.html`）を対象にしたテストは、そのまま `tests/` に残している。

## 既知の未検証

建国後 700 年を超える長期の速さ・性能（`docs/V6_1_CALIBRATION.md`）。実機（Surface Go 4 / Edge）での確認。
