# Azgaar .map フォーマット仕様（公式ソース v1.153.1 と実ファイル2件で検証済み）

## 情報源と検証状況

| 情報源 | 用途 |
|---|---|
| 公式ソース `src/services/io/save.ts` | 行の順序・内容の**正**（MIT License） |
| 公式ソース `src/services/io/load.ts` | 読み込み手順（grid再構築 → pack再構築 → 配列を復元） |
| 公式ソース `src/generators/{voronoi,pack-generator}.ts` | pack形状の再構築アルゴリズム |
| 実ファイル `境界線の貴方.map`（v1.151.1, 53行） | 旧形式の検証 |
| 実ファイル `新世界より.map`（v1.139.11, 47行） | 旧形式の検証 |

### 検証できていないこと（正直な一覧）

| 項目 | 状況 |
|---|---|
| 新形式（v1.152.0 以降で保存）の実ファイル | **未入手。** 公式ソースの読解に基づく実装で、テストは実ファイルを加工した合成データのみ |
| 頂点の手動移動（graphOverride）が入った実ファイル | **未入手。** サンプル2件は空。公式の規則どおりに実装し、合成データで検証 |
| grid / pack.cells の上書き（graphOverride） | 未対応。検出して警告する |
| gzip 圧縮された実ファイル | 実ファイルは未入手。手元のファイルを gzip 圧縮したもので検証 |
| 公式のバージョン差による pack 再構築の違い | 2件（v1.139 / v1.151）で一致を確認。他の版は未確認。**セル数が合わなければ、間違った地図を出さずにエラーにする** |

## 読み込みの絶対条件

1. **行区切りは CRLF (`\r\n`) のみ。** SVG 行の内部に単独の LF が多数あるため LF 分割は不可。
2. **バイナリで読み、`\r\n` のバイト列で分割してから UTF-8 デコードする。** テキストモードは CRLF を LF に変換して壊す。
3. **gzip の判定:** 先頭2バイトが `1f 8b` なら展開してから読む（公式は `.gz` も読む。今回の2ファイルはプレーン）。
4. **新バージョンは末尾に行を足すだけ。** 既存行の位置は変わらない。存在しない行は既定値で読む。
5. **全フィールドを任意扱い。** バージョンで項目が変わる（例: burg の `walls` / `plaza`）。

## 行の割り当て（save.ts の `mapData` 配列）

| 行 | 内容 | 形式 | 今回の扱い |
|---|---|---|---|
| 0 | params | `version｜説明｜日付｜seed｜幅｜高さ｜mapId` | 解析 |
| 1 | settings | 新: `options.map` の JSON / 旧: パイプ区切り(27項目) | 解析（下記） |
| 2 | 座標範囲 | 新: 空(廃止) / 旧: JSON `latT,latN,latS,lonT,lonW,lonE` | 解析 |
| 3 | biomes | JSON | 解析 |
| 4 | notes | 新: 空(廃止、各エンティティの note へ) / 旧: JSON | 解析 |
| 5 | SVG | 描画済みSVG（巨大） | 原文保持のみ |
| 6 | grid | JSON `spacing,cellsX,cellsY,boundary,points,features` | 解析 |
| 7〜11 | grid の `h, prec, f, t, temp` | 数値CSV | 解析 |
| 12 | pack.features | JSON | 解析 |
| 13〜15 | cultures / states / burgs | JSON | 解析 |
| 16 | cells.biome | CSV | 解析 |
| 17 | cells.burg | CSV | 解析 |
| **18** | **cells.conf**（河川合流量） | CSV（疎） | 原文保持 |
| 19 | cells.culture | CSV | 解析 |
| **20** | **cells.fl**（水量 flux） | CSV | 原文保持 |
| 21 | cells.pop | CSV（小数） | 解析 |
| 22 | cells.r（河川ID） | CSV | 解析 |
| 23 | （廃止 road） | 空 | 原文保持 |
| **24** | **cells.s**（居住適性） | CSV | 原文保持 |
| 25 | cells.state | CSV | 解析 |
| 26 | cells.religion | CSV | 解析 |
| 27 | cells.province | CSV | 解析 |
| 28 | （廃止 crossroad） | 空 | 原文保持 |
| 29 | religions | JSON | 解析 |
| 30 | provinces | JSON | 解析 |
| 31 | namesData | `/`区切り×`｜`区切り(6項目) | 解析 |
| 32 | rivers | JSON | 解析 |
| 33 | （廃止 rulers） | 空 | 原文保持 |
| 34 | fonts | JSON | 原文保持 |
| **35** | **markers** | JSON | 解析 |
| 36 | cells.routes | JSON | 解析 |
| 37 | routes | JSON | 解析 |
| 38 | zones | JSON | 解析 |
| 39 | ice | JSON | 解析 |
| **40** | **cells.good** | CSV | 原文保持 |
| 41 | goods | JSON | 解析 |
| 42 | markets | JSON | 解析 |
| **43** | **deals**（交易） | JSON（巨大） | 解析 |
| **44** | **cells.market** | CSV | 原文保持 |
| 45 | customGoodIcons | SVG断片 | 原文保持 |
| **46** | **measurers** | JSON | 解析 |
| 47 | labels（追加ラベル） | JSON | 原文保持 |
| 48 | styleData | JSON | 原文保持 |
| **49** | **relief** | JSON | 解析 |
| 50 | layers | JSON | 原文保持 |
| 51 | graphOverride | JSON | 原文保持 |
| 52 | journeys | JSON | 原文保持 |
| 53〜 | 将来の行 | 不明 | 原文保持 |

太字は、この調査で初めて確定した（または以前の推測を訂正した）行。
**訂正:** 以前のメモで L35 を「レリーフ」、L46 を「rulers」、L43 を「trade」としていたのは誤り。

### 「原文保持」の意味
意味を解釈せずテキストのまま保持し、書き出し時に元の位置へ戻す（情報を失わない）。
セル数が変わる編集（再生成など）を行った場合、セル配列の原文保持行は**無効になる**ため、その時点で破棄する。

## pack のセル形状は保存されていない（最重要）

`.map` に保存されるのは grid の点と、pack のセルごとの**属性**（国家・文化・宗教…）だけ。
pack のセル座標は保存されず、**読み込みのたびに grid から再計算される**。

```
grid.points + grid.boundary ──→ ボロノイ図（grid）             … Grid.rebuildGraph
grid.h / t / f を読み込み
        ↓ Pack.generate                                       … 決定論的
   ① 深い海(h<20 かつ t が -1,-2 以外)の点を捨てる
   ② 岸に接しない湖(t=-2 で i%4==0 または湖)の点を捨てる
   ③ 海岸(t=1 または t=-1)のセルは、隣の同種セルとの中点を追加（i>e は除く、外周セルは除く）
   ④ 残った点群 + boundary でボロノイ図を作り直す           … これが pack
        ↓
   保存済みの属性配列（L16〜L27）を、この pack の添字に対応させる
```

**検証結果（実ファイル2件）:**

| 検証 | 境界線の貴方 | 新世界より |
|---|---|---|
| 再構築セル数 = 保存済み配列の長さ | 7603 = 7603 ✓ | 1965 = 1965 ✓ |
| 再構築の水/陸 = 保存バイオームの海/陸 | 7603/7603 (100%) ✓ | 1965/1965 (100%) ✓ |
| 都市が自セルの多角形の内側 | 1182/1182 ✓ | 244/248（外れた4件は辺から0.08〜0.14の差） |

三角形分割の内部順序まで再現する必要があるため、公式が同梱する Delaunator
（`public/libs/delaunator.min.js`, ISC License）を**同一ビルドで**利用している。別実装・別バージョンは不可。

### 都市の座標について
都市はセル中心にあるとは限らない。港は海岸側へ寄せて配置される（実データで確認:
境界線の貴方では、セル中心からずれた226都市のうち198が港で、港は全数がずれている）。
判定には「セル中心との距離」ではなく「自セルの多角形の内側か」を使うこと。

## 設定行（L1）の新旧形式

判定（公式 `migrateLegacySettings` と同じ）:
`バージョン < 1.152.0` かつ 行が `{` で始まらない → **旧形式**。

旧形式のパイプ区切り項目（公式の変換コードで確認したもののみ）:

| 添字 | 内容 | 添字 | 内容 |
|---|---|---|---|
| 0 | 距離の単位 | 14 | mapSize |
| 1 | 距離の縮尺 | 15 | latitude |
| 2 | 面積の単位 | 16 | 赤道の気温 |
| 3 | 高さの単位 | 17 | 極の気温 |
| 4 | 高さの指数 | 18 | 降水量 |
| 5 | 気温の単位 | 19 | options の JSON（v1.3以前は風の配列） |
| 12 | 人口の縮尺 | 20 | マップ名 |
| 13 | 都市化率 | 24 / 25 | 人口密度 / longitude |

## namesbase について
公式は、既定の名前ベースと同じ語彙なら**空文字で保存**する（`names = default.b === b.b ? "" : b.b`）。
よって語彙が空のベースは「既定を使う」の意味。今回のサンプルでは日本語の語彙が入っていた
（「新世界より」の German/English/Japanese ベースに 608 語のカタカナ地名）。

## 規模の実測

| | 境界線の貴方 | 新世界より |
|---|---|---|
| ファイルサイズ | 5.4 MB | 1.8 MB |
| セル数 (pack) | 7603 | 1965 |
| 読み込み | 約70ms | 約20ms |
| 形状再構築 | 約200ms | 約70ms |

## 形状の手動編集（L51 graphOverride）

頂点ブラシ等でセルの形を動かした結果。公式ソース `generators/graph-override.ts` の規則:

```json
{"pack":{"vertices":{"p":{"<頂点ID>":[[元のx,元のy],[移動後のx,移動後のy]]}}}}
```

再構築した頂点の現在位置が「元の座標」と一致する場合だけ、移動後の座標を適用する。
一致しなければ、別の点を指している可能性があるので捨てる（公式と同じ）。
ALTERHISTORY は、適用できなかった件数を読み込み時の警告として画面に出す。
書き出しでは、この行を **原文のまま** 元の位置に戻す（編集機能を作るまでは変更しないため）。

## ALTERHISTORY 形式（Azgaar 形式の上位互換）

```
行0     ヘッダー   version|説明|日付|seed|幅|高さ|mapId|ALTERHISTORY/1     ← 7番目の項目が目印
行1〜52 Azgaar 形式そのまま（Azgaar 公式でも開ける）
行N     拡張行     {"app":"ALTERHISTORY","format":1,"savedAt":"…","lineCount":<元の行数>,"data":{…}}
```

- 拡張行は**最後の行**に置く（Azgaar が将来行を足しても衝突しない）。行 53 未満のときは空行で埋めて 53 行目以降に置く。
- `lineCount` は Azgaar 部分の元の行数。読み込み時に復元し、**再保存しても行が増えない**。
- 目印があるのに拡張行が無い／壊れている場合は、警告して Azgaar 形式として読む。
- 拡張行の `format` が新しい版のものは、警告して読める範囲で読む。
- Azgaar 互換で書き出すと、目印と拡張行を取り除く（ALTERHISTORY 固有のデータは失われる）。

**書き出しの保証（テストで検証）:** 編集していない地図は、Azgaar 形式でも ALTERHISTORY 形式でも、
元のファイルと **1文字も違わずに** 書き戻せる（日付・目印・拡張行を除く）。


## 保存形式の版と条約（v2.0.0）

`.ahmap`（ALTERHISTORY 形式）の `data`（拡張データ）に、次を持つ。どれも無くても開ける。

- `saveFormat`: 保存形式の版。旧形式 = 1（無い場合も 1 とみなす）、条約を導入した形式 = 2。保存すると必ず 2 を書く。
- `treaties`: 条約の配列。`{ id, kind, name, parties:[{state, role}], signedAt, expiresAt|null, status, endedAt, brokenBy, terms, originWar|null, text|null, ref }`
  - `kind`: `alliance`（軍事同盟・安全保障条約）／`nonaggression`／`economic`／`vassal`／`border`／`declaration`／`peace`
  - `status`: `active`／`expired`／`broken`。期限切れは、`expiresAt` と世界の時刻から計算して判定する（保存値が `active` のままでも期限後は失効として扱う）。
  - `terms`: 種類ごとの条項。同盟 `{bind: strong|medium|weak}`、経済協力 `{tariff: low|mid|high}`、従属 `{kind}`、共同宣言 `{declaration}`、講和 `{kind, notes}`。
  - `ref`: 既存の仕組みとのつながり。`{allianceId}`（`data.alliances`）、`{vassalState}`（国家の `vassal`）、`{warId}`（`data.wars`）。同盟・従属は、既存のデータが引き続き効果の正本で、条約はその「取り決め」の記録と条項を持つ。
- `treatySettings`: `{ civilCallsAllies: boolean }`。内戦（反乱で始まる戦争）でも同盟国を参戦に招集するか。既定は false。
- ゾーン（`zones`）に、疫病・災害の一時表示用の任意項目: `zid`（安定した id）、`startAt` / `endAt`（`{year, month}`）。無いゾーン（読み込んだ地図のもの）は、期間なしで常に表示する。年表の出来事（`historyLog`）に `zoneId` を持てる。
- 旅の記録（`journeys`）は廃止。読み込み時に無視し、保存し直すと消える。

### 読み込み時の変換（版 1 → 2）
`migrateLegacyToTreaties`（`core/edit/treaties.js`）が、`data.alliances`・国家の `vassal`・講和済みの戦争（`data.wars[].terms.treatyName`）を、条約に変換する。冪等（もう一度かけても増えない）。元の同盟・従属・戦争のデータは変えない。


## v2.4.0 の追加項目（保存形式の版 3）

`data`（拡張データ）に追加。どれも無くても開ける。読み込み時に `core/edit/migrate.js` が旧データを移行する。

- `saveFormat`: 保存すると必ず 3 を書く（旧形式 = 1、条約 = 2、指導者・政体・技術ドクトリン = 3）。
- `leaders`: 指導者。`{ [国ID]: { current: Leader|null, history: Leader[] } }`。`Leader = { id, name, gender: "m"|"f", birthYear, since:{year,month}, until?, title, reason, stability, gen }`。`reason` は `founding|death|abdication|deposition|usurpation|election|conquest`。顔は `id` と `gen` から決まるので、保存しない。
- `leaderSeq`: 指導者の ID の連番。
- 旧 `monarchs`（君主）は、読み込み時に `leaders` へ移して消える。性別は称号から、生年は即位年の28年前から推定する。
- 旧 `wars[].forecast`（開戦時の想定の戦闘ログ）は、読み込み時に捨てる。`wars[].types`: 国ごとの戦争形態 `{国ID: "limited"|"conventional"|"total"|"asymmetric"}`。`wars[].type` は合成した形態で、`"asymmetric+total"` のように `+` でつなぐことがある。`wars[].events[].kind` に `type-change`（形態の変更）が加わる。
- 国家（`pack.states[i]`）の追加項目: `regime`（政体のキー。`absolute|constitutional|empire|elective|theocracy|aristocratic|democracy|presidential|party|nationalist|junta|tribal|federation|anarchy`）、`techDoctrine`（`{agri, ind, transport, comms, medicine, energy}` 各 1〜10。`techLevel` はここから導いた値を同時に書く）、`doctrineNodes`（選んだ軍事ドクトリンの節のキー）、`rebelGoal`（反乱側の国のみ。`secession|overthrow`）。`form` と `formName` は、政体から同時に書く。
- 部隊（`state.military[]`）の追加項目: `echelon`（編成の段 1〜5。未設定は Azgaar から取り込んだ部隊で、最初の月に現在の段が入る）。
- 年表（`historyLog`）の `type` に追加: `succession`（指導者の交代）、`regime`、`doctrine`、`treaty-parties`、`natural-<種類>`（月ごとの自動の出来事）。
- v2.6.0 で追加（`saveFormat` は 3 のまま。無い項目は空として読むので、v2.5.0 までの保存データはそのまま開ける）:
  - `techMomentum`: 採用していない技術の機運。`{ [国ID]: { [分野キー]: { target, via } } }`。`target` は採用すると到達する段、`via` は `neighbor`（隣国が先行）| `year`（世界の年）。
  - `pendingEvents`: 予約された後続の出来事（出来事の連鎖）。`[{ key, stateId, due:{year,month}, depth, from }]`。期日が来たら起こし、取り下げる。
  - `pendingEvents` の項目に任意の `fromEvent`（きっかけとなった出来事の年表のキー。v2.7.0）。`techMomentum` の `via` に `progress`（技術の進捗が満ちた）が加わった（v2.7.0）。
  - `shocks`（v2.7.0）: 出来事が残す余波。`[{ s: 国ID, k: "food"|"health"|"order"|"fiscal", a: 強さ（＋は悪化・−は好転）, y, m: 起きた年月, h: 半減期（月）, ev: 出来事の key, from?: 元の出来事の年表のキー }]`。いまの強さは `a × 0.5^(経過月 ÷ h)`。
  - `ideas`（v2.7.0）: 国ごとの思潮。`{ [国ID]: { enlight, liberal, nation, equal, tradition, faith } }`（各 0〜1）。
  - `languages`（v2.7.0）: 文化ごとの言語。`{ [文化ID]: { v, id, parent, order: "MH"|"HM", link, lex: { 見出し: 語 }, proper, male, female, clan, changes: [{ key, label, from }], edited: { 見出し: 1 }, phon } }`。語は音節の記号を `.` でつないだ文字列（例 `ka.raN`）。手で直した語は `~カナ`。無い文化は、地図のシード（`meta.seed`）と文化番号から同じものを作り直す。
  - `migrationAcc`（v2.7.0）: まとまった移住を年表に載せるための積算。`{ "元の国>先の国": 千人 }`。
  - `ai`（v3.0.0）: 国家の自律行動の設定。`{ enabled?, tempo?: "cautious"|"normal"|"active", verbs?: { tech, treaty, war, peace }, targetPlayers?, players?: [国ID] }`。`players`（プレイヤー国）が空なら、自律は動かない。既定の内容になったときは、この項目ごと消える。
  - 年表（`historyLog`）の `type` に `ai`（国家の判断。`detail` は 宣戦・講和・技術の採用・同盟・不可侵条約・経済協力、`data: { ai: true, kind }`、`states[0]` が判断した国）を追加（v3.0.0）。
  - 国（`pack.states[i]`）に任意の `techProgress`（v2.7.0）: `{ [分野キー]: 0〜1 }`。次の段までの進捗。段（`techDoctrine`）は自動では変わらない。
  - 年表（`historyLog`）の `type` に追加（v2.7.0）: `ideas`（思潮が高まった）、`migration`（まとまった移住）、`language`（文化の言語が分かれた）。
  - `heirs`: 世襲の政体の後継者。`{ [国ID]: { name, gender, birthYear, family } }`。
  - `leaders` の `Leader` に任意項目を追加: `family`（姓＝王朝名）、`regentFor`（摂政のとき、幼い君主 `{ name, gender, birthYear, family, title }`）。`reason` に `majority`（成人して親政を始めた）を追加。
  - `historyLog` の項目に任意の `data`（小さな構造データ）。`tech-momentum`（`{ field, target }`）・`treaty-expiring`（`{ treatyId, until }`）で使う。
  - 年表の `type` に追加: `tech-momentum`、`vassal`、`vassal-released`、`treaty-expiring`、`treaty-renewed`、`natural-<pricespike|refugees|riot|recovery|purge|turnover>`（連鎖の後続）。
  - v2.6.1: 反乱で生まれた国の `rebelType`（`uprising`|`independence`|`religious`|`coup`|`noble`）。`rebelGoal`（`overthrow`|`secession`）は従来どおり。反乱側の領土に切り出した属州は、通常の属州として保存される。戦争名の連番は名前の文字列だけで持つ（追加の項目なし）。
  - バランス調整の項目に追加: `momentumRate`、`chainRate`、`chainDepth`（`ext.data.balance` に既定値と違うものだけ保存）。
- 削除: 国家の削除、データ検査、為替の画面、出来事の書き足し・記録（`note` / `manual` の追加操作）。保存データの読み書きには影響しない（既存の `note` / `manual` は読める）。


## 追記: v2.4.1（保存形式は変わらない）
- `data.wars[].burden`（任意）: 戦争中に「実際に起きた負荷」の合計。`{ "<国ID>": { "support": 民意の増減の合計, "treasury": 国庫の減った額の合計, "industry": 産業の落ちた量の合計, "months": 負荷を積んだ月数 } }`。月あたりの値は、合計 ÷ `months`。v2.4.0 以前の戦争には無く、月が進むと付く。無くても読める。`saveFormat` は 3 のまま（変えない）。
