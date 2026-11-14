# 地形・都市プラグイン（v6.13.0）

別のエージェント／プログラムが書いた「地形生成・都市生成を自然にするコード」を、本体を書き換えずに差し込むための仕組み。
差し込み口は `js/core/world/plugins.js`（登録簿）と `js/core/world/generate.js`（地形の生成の入口）。
プラグインが無ければ、これまでと **同じ世界**（同じハッシュ）ができる。

## 使い方（最短）

渡されたファイルを `js/plugins/` に置き、`js/plugins/index.js` の「登録」に 1 行足し、`npm run build` → `npm test`。
（`index.js` は `js/main.js` から読み込まれる。何も登録しなければ標準の生成。）下は同じことをコードで書いたもの。

```js
import { registerTerrainPlugin, registerCityPlugin } from "./js/core/world/plugins.js";
import myTerrain from "./my-terrain.js";   // 渡されたプログラム
import myCity from "./my-city.js";

registerTerrainPlugin({ id: "my-terrain", version: "1.0.0", refine: myTerrain });      // 標準の生成のあとに手を入れる
registerCityPlugin({ id: "my-city", version: "1.0.0", siteScore: myCity.siteScore });  // 集落の立地の得点を差し替える
// 以降の createNewWorld / deserializeWorld が、そのまま使う。外すときは clearPlugins() か activatePlugin("terrain", null)
```

`registerPlugin` は既定で、登録と同時に有効にする（`{ activate: false }` で登録だけ）。

## 1. 地形プラグイン（terrain）

`generate` か `refine` の少なくとも 1 つを持つ。

| 関数 | 役割 |
|---|---|
| `generate(spec, options) → world` | 地形の生成を **置き換える**。標準の `generateWorld` と同じ形の世界を返す |
| `refine(world, spec, options) → world \| void` | 標準（または `generate`）の結果に **手を入れる**。world を直接書き換えてよい（返さなくてもよい） |

- どちらも結果は `validateWorld` を通る。**通らない・例外を投げた場合は、標準の生成へ戻り**、理由が `world.pluginReport.notes` に残る（`options.onWarning` にも通知）。世界は必ずできる。
- `refine` を使ったあと、`world.hash` は自動で再計算される。

### world の形（`generateWorld` の出力と同じ）

```
world.spec                  WorldSpec（worldSeed・resolution.targetCells・landFraction ほか）
world.mesh                  球面メッシュ。cellCount / neighborOffsets / neighborIds（CSR 形式の隣接）ほか
world.cell.<配列>           長さ mesh.cellCount の型付き配列:
  elevation(Float32, m)  landWater(Uint8: LAND_WATER.OCEAN=0/LAND=1/LAKE=2)  plate  temp(℃)  precip  biome(BIOMES)
  soil(SOILS)  fertility  resource(RES のビット和)  riverTo(流下先。海は -1 でよいが、陸は海まで続くこと)
  riverFlow  river(0/1)  basin  coastDist(海岸からの距離。1 以下が沿岸)  capacity(人口の受け皿)  areaKm2  lat  lon(rad)
  volcanic  filled  continent  mountain  moisture
world.entities.populations  初期の人口集団 [{ id, cell, subsistence, size, ... }]
world.stats / world.hash    統計と決定性のハッシュ
```

### 守るべき整合（`validateWorld` が検査する）

- 数値配列に NaN / Infinity を入れない（`elevation, temp, precip, riverFlow, fertility, capacity`）。
- **標高と海陸**: `elevation <= 0` ⇔ `landWater === OCEAN`。
- **川**: 陸のセルの `riverTo` をたどると、循環せず、行き止まりなく、隣接セルをたどって海に着く。
- 初期集団は陸のセルにいる。
- 標高を変えたら、気温・降水・バイオーム・土壌・肥沃度・河川も作り直す必要がある。標準の部品を再利用できる:
  `tempAt` / `precipAt` / `biomeAt` / `computeHydrology` / `landUseAt` / `recomputeStats`（`js/core/world/worldgen.js` の export。地形編集の局所再計算も同じ部品を使っている）。
- **決定性**: 同じ `worldSeed` と設定なら同じ結果になること。乱数は `spec.worldSeed` から導く（`Math.random` / 時刻は使わない）。

## 2. 都市プラグイン（city）

次の 3 つのうち、必要なものだけ持てばよい（どれも `null` / 範囲外を返すと標準に任せる。例外も標準へ）。

| 関数 | 呼ばれる場所 | 役割 |
|---|---|---|
| `initialGroups(g, spec, variant) → [{cell, ...}]` | 世界生成の初期集団の配置（`placeInitialGroups`） | 初期の人口集団の位置を置き換える。**陸のセルだけ**。1 つでも海なら全体を無視 |
| `siteScore(world, cell, { civ, group, base }) → number` | 集落（都市・町・村）を置く立地の選定（先史の終わりの `planSettlements`・のちの定住 `foundSettlement`） | 立地の得点。大きいほど良い。`base` は標準の得点（`generatorVersion >= 6.13.0` の世界では `sites.js` の適地スコア＝肥沃さ・淡水・合流点・河口・良港・防御性・平坦さ。それ未満では 肥沃度＋川＋沿岸）。定住では、既存の集落に近い所の減点がそのあとに掛かる |
| `settlementCell(world, civ, group, cells, defaultCell) → cell` | 同上 | 集落を置くセルを直接選ぶ。`cells` に含まれる整数だけ有効 |

`g` は `{ mesh, landWater, fertility, temp, river, coastDist, lat, lon }`（地形の生成中の配列）。

## 3. 動く場所

プラグインは **メインスレッドの生成**（`createNewWorld`・保存の読み込み）で使われる。世界設定の画面のプレビュー用 Worker（`js/generated/worldgen-worker.txt`）は標準の生成のまま。

## 4. 保存と読み込み

保存は設定だけで、地理は設定から **再生成** する。そのため、使ったプラグインを `civ.wcde.plugins`（`{ terrain: "id@version", city: ... }`）に記録し、
読み込み時に今の設定と食い違えば `world.pluginWarnings` に説明を入れる。**同じプラグイン（同じ version）を登録してから読み込む**こと。
プラグインの出力が変わるときは `version` を上げる。

## 5. 検査

`tests/v613-core.test.mjs` の「地形・都市プラグイン」に、登録・選択・検証・失敗時の復帰・初期集団の差し替えの試験がある。
渡されたプログラムを入れたら、まずこの試験の形（`generateWorldPluggable(spec)` が `validateWorld` を通り、同じ設定で同じ `hash` になること）で確かめる。
