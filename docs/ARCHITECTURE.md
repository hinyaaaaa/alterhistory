# アーキテクチャ（7.0.0-rc.1）

## 層と約束
```
js/ui/v6  →  js/core/wcde（dispatch・契約）  →  js/core/civ（文明の計算）  →  js/core/world（球面メッシュ・地形）
js/io（保存・出力）は core を読む。core は ui にも io にも依存しない。
```
1. **世界を変えるのは `dispatch` だけ。** 命令（コマンド）は権限つきで、結果は `{ ok, error | result }`。台帳は `docs/COMMANDS.md`。
2. **`js/core/` は DOM に触れない。** Node でそのまま動き、テストできる。
3. **同じ seed なら同じ世界。** 乱数は seed と日付から決まる（`hashSeed`・`rngOf`）。
4. **黙って失敗しない。** 整合検査（`wcde/integrity.js`・`civ/civ-sim.js`）が、壊れた状態を検出する。
5. **領域（domain）が自分のデータだけを所有する。** 台帳は `core/wcde/domains/registry.js`、生成文書は `V6_1_M1_CONTRACT_TICK.md`。

## 中身
- `core/world/` 球面メッシュ・地形・気候・川。`sites.js` が集落の立地（複数拠点・順位規模則）。
- `core/civ/` 集団・集落（`settlements.js`）・街道（`roads.js`）・国家・文化・技術・外交・出来事・履歴。月次の `tick.js` が順に呼ぶ。
- `core/wcde/` 契約（`contract.js`）と、命令・戦争・決断・政体・人物・保存。
  - 戦争: `warfare.js`（作戦と戦闘）・`war-core.js`（戦争目的・降伏）・`war-peace.js`（講和会議）・`war-alliance.js`（同盟）・`war-aftermath.js`・`corps.js`（軍団と命令）。
  - 領域: `domains/`（経済・政治・軍事・ドクトリン・言語・宗教・人物ほか）。
- `io/` セーブ（`wcde/savefile.js`）・Obsidian 出力（`obsidian.js`・`obsidian-compact.js`）・ZIP・PNG・履歴の IndexedDB。
- `ui/v6/` 画面。`docs/UI_GUIDE.md`。

## 時間と履歴
`time.advance`（即時）と `clock.run`（画面が進める。決断で自動停止）。履歴は区間ごとに圧縮して IndexedDB に置く（`workers/history-worker.js`）。

## ビルドとテスト
`scripts/build.mjs` が `dist/v6.js`・`history-worker.js`・`worldgen-preview.js` と `build-info.json`（版・ビルド識別子・SHA-256）を作る。CI は dist とソースの一致を確かめる。テストは `tests/*.test.mjs`（1 本ずつ実行する。重いものは 1〜5 分）。
