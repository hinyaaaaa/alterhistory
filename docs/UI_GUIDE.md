# 画面（UI）ガイド

**v7 の画面を足すときは、先に `docs/UI_RULES.md`（規則）と `docs/UI_FEATURES.md`（操作の行き先表）を読む。** この文書は、エンジンとの境目とファイルの地図。

画面は `js/ui/v6/` と `css/` と `index.html` だけ。世界の計算（`js/core/`）には触れずに作り直せる。

## 1. 守る約束（エンジンとの境目）
- **世界を変えるのは `dispatch(w, { type, authority, ...引数 })` だけ。** 画面から `w.civ` などを直接書き換えない。
  - 使える操作は `docs/COMMANDS.md`（自動生成。92 件）。引数の形は `js/core/wcde/commands.js`・`war-commands.js` の `defineCommand`。
  - 権限: `player_order`（担当国の操作）・`creator_intervention`（創造主）・`administrative`（時間・保存など）。
- **読むのは自由**（`w.civ.states` など）。ただし表示のための計算は画面側で行い、結果を世界に書かない。
- 画面の一時状態は `S`（`js/ui/v6/store.js`）に置く。世界の正本は `S.w`。
- 操作は `store.js` の 3 つを使う: `act`（担当国）・`creator`（創造主）・`run`（管理）。失敗は理由つきで自動通知される。
  - 通知の名前は `store.js` の `LABEL` に足す。

## 2. ファイルの地図
v7 の外枠・パネル・全面画面は `js/ui/v7/`（`frame.js` 入れ物／`chrome.js` 上部バー・レール・表示・検索・国のカード／`panels*.js` 左パネル／`screens.js`・`war-screens.js` 全面画面／`ui.js`・`icons.js` 部品）。旧部品は次の表（`js/ui/v6/`）。
| 役割 | ファイル |
|---|---|
| 起動・全体の配置・時間 | `main.js`、`store.js` |
| タイトル・世界の設定・建国 | `title.js`、`scenes.js`（背景）、`wizard.js` |
| 地図 | `map.js`（層と描画。集落の位置は `sitePos`）、`terrain.js`（見た目） |
| 国家ページ（6 タブ） | `nation.js`、`policy.js`、`doctrine.js`、`trees.js` |
| 軍・戦争 | `military.js`、`war.js`、`warconfirm.js`、`battle.js` |
| 外交・同盟 | `diplo.js`、`alliance.js` |
| 決断・通知 | `decision.js`、`notify.js` |
| 世界の一覧・統計・設定 | `views-a.js`（国家詳細）、`views-b.js`（文化・言語・宗教・世界設定・創造主）、`stats.js`、`perf-panel.js` |
| 部品 | `common.js`（DOM の組み立て）、`visual.js`（旗・グラフ）、`flagview.js`、`badges.js`、`domsafe.js` |

## 3. 見た目（`css/`）
読む順（`index.html` の `<link>` と同じ）: `tokens.css`（旧）→ `base.css`（土台・タイトル・建国）→ `widgets.css` → `views.css`（ビジュアル・全面タブ）→ `layout.css`（地図とパネルの配置。基準 1280×853）→ `nation.css` → **`v7-tokens.css`（色・書体・寸法・動きの値はここだけ）→ `v7-components.css`（部品）→ `v7-shell.css`（外枠）→ `v7-legacy.css`（旧部品の取り込み）**。

## 4. 作り直しの進め方
1. `npm run build` → `index.html` を開く（または `npm run test:e2e`）。ビルドは `js/ui/v6/main.js` から `dist/v6.js` を作る。
2. 画面を差し替えるときは、新しい画面を `js/ui/` の下に置き、`scripts/build.mjs` の入口を替える。使われなくなった旧画面は削除する（未使用コードは残さない）。
3. 新しい動きに必要な操作が無いときは、画面で世界を触らず、`js/core/wcde/commands.js` に `defineCommand` を足す（`docs/COMMANDS.md` は `npm run docs` で更新）。
4. 確認用の足場: ブラウザの `window.__v6`（`S`・`run`・`act`・`render`）。`tests/e2e/v7.e2e.mjs` が使い方の例。

## 5. このあと画面が使うもの（未接続）
- 戦争: `war.mobilize`（動員と戦略。指揮する部隊を `orders` に入れなければ AI が自動で戦う）、`war.setPlan`（戦域の矢印）、講和・降伏・同盟の決断（`surrender_call`・`conference`・`peace_terms`・`ally_call`）。`docs/WAR_API.md`。
- 集落: `settlement.rename`、街道・航路（`civ.roads`）、`settlement.rank`（1 大都市〜4 村）、`nameHistory`。
- Obsidian 出力の `layout:"detail"`（従来の 1 実体 1 ノート）の選択肢。
