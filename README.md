# ALTERHISTORY

架空の世界を生成し、時間を進めて、国・文化・宗教・戦争・外交の歴史を作る地図シミュレーター。
Azgaar's Fantasy Map Generator に近い見た目の地図と、その上で動く文明史の仕組みを持つ。

> 現在の版: **7.0.0**（画面の一新。モック `AlterHistory_v7_UI.html` に沿った新しい画面。規則は `docs/UI_RULES.md`、操作の行き先表は `docs/UI_FEATURES.md`）。

## 動かす
`index.html` を Edge か Chrome で開くだけ（サーバー不要・`file://` で動く）。`dist/v6.js` がビルド済みで入っている。

## 開発
```
npm ci
npm run build     # js/ → dist/（画面の本体 dist/v6.js ほか）
npm test          # 全スイート（重い。1 本ずつ: npm test -- v700）
npm run test:e2e  # 実ブラウザ（Chromium）で画面を操作する検証
npm run docs      # 台帳・技術ツリー・コマンド一覧を docs/ に再生成
```

## 構成
```
index.html        画面の骨組み（CSS は css/ を読むだけ）
css/              色（tokens.css）と画面ごとの見た目
js/core/          世界のシミュレーション（DOM に触れない。Node で動く）
js/io/            保存・Obsidian 出力・ZIP・PNG
js/ui/v6/         画面（これを作り直す）
js/workers/       履歴の圧縮 Worker
dist/             ビルド成果物（js/ から作る。手で編集しない）
tests/            tests/*.test.mjs（Node）と tests/e2e/（ブラウザ）
docs/             文書（下表）
```

## 文書
| | |
|---|---|
| `docs/UI_GUIDE.md` | **画面を作り直す人はここから**。構成・エンジンとの契約・手順 |
| `docs/ARCHITECTURE.md` | 全体の設計と層の約束 |
| `docs/COMMANDS.md` | 画面が呼べる操作の一覧（自動生成） |
| `docs/WAR_API.md` | 戦争・講和・同盟・動員の API |
| `docs/CITY_REPORT.md` | 都市配置の設計と検証 |
| `docs/ROADMAP.md` / `docs/HANDOFF.md` | これからの予定 / 現状の引き継ぎ |
| `docs/CHANGELOG.md` / `docs/DECISIONS.md` | 変更履歴 / 決定記録 |
