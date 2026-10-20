# `.ahmap` v2 コンテナ仕様（v4.0.0）

実装: `js/core/world/ahmap2.js`。v1（Azgaar 互換の行形式）とは別形式で、v1 の移行は別アダプタ（未実装）。

## 構造
```
[マジック 8B "AHMAP2\0\0"] [コンテナ版 u32 LE] [manifest 長 u32 LE] [manifest: UTF-8 JSON] [チャンク本体 …]
```
- manifest: `format, containerVersion, schemaVersion, worldSpecSchema, appVersion, generatorVersion, meshVersion, savedAt, cellCount, triangleCount, meshFrequency, worldHash, required[], chunks[]`
- チャンク: `name, kind(json|f32|u8|u16|i32|u32|ext), codec(raw|gzip), rawBytes, storedBytes, crc32, offset(本体先頭から), count(型付き配列のみ)`
- 版は 3 つに分ける: コンテナ版（バイト配置）、スキーマ版（チャンクの意味）、アプリ版（情報）。

## 必須チャンク
`world.spec`、`geom.centerXYZ / verticesXYZ / neighborOffsets / neighborIds / cellVertexIds`、`cell.*`（elevation, landWater, plate, temp, precip, biome, soil, fertility, resource, riverTo, riverFlow, river, basin, coastDist, capacity, areaKm2, lat, lon, volcanic, filled, continent, mountain）、`entities.populations`、`world.stats`。

## 拡張
- 名前が必須一覧にないチャンク（`extensions.*`、将来版の追加）は、読み込み時に保持し、再保存で必ず戻す。
- v5 は `entities.*`・`history.*` などを別チャンクで追加する（既存チャンクの意味は変えない）。

## 読み込みの検証（失敗したら例外。元ファイルは上書きしない）
マジック／コンテナ版・スキーマ版（新しすぎる版は拒否）／manifest の切断／必須チャンクの欠落／チャンク範囲外／展開失敗／長さ・要素数／CRC32／セル数と周波数の整合／配列の大きさ／隣接・頂点 ID の範囲／landWater・biome・riverTo・basin の値域／WorldSpec／世界のハッシュ／球面トポロジー／流路が海へ着くこと。

## 保存の原則
- 保存はスナップショットから全体を組み立てて 1 つのバイト列にする。呼び出し側（アプリ）は、一時ファイルへ書いてから置き換える（未実装・M2 の残り）。
- 更新されていないチャンクは、前回の圧縮結果（`chunkCache`）を再利用できる。

## 計測（Xeon 2.1GHz 1 コア・Node 22・249,642 セル。Surface Go 4 ではない）
保存 約 1.1 秒／読み込み（展開と全検証）約 0.7 秒／ファイル 21.3 MB（非圧縮 39.2 MB）。
