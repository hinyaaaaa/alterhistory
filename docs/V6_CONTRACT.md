# v6.0.0 契約（WCDE: World & Civilization Dynamics Engine）

仕様: `AlterHistory_v6_0_0_Claude_Implementation_Spec.md`。この文書は M0（契約）で、実装は `js/core/wcde/`。M1〜M5 の実装範囲と未実装は `V6_STATUS.md`。

## 1. 層と依存の向き
```
js/core/world/   球面世界（地形・気候・肥沃度）。生成のみ。国家運営層を知らない
js/core/civ/     文明層（集団・国家・戦争・技術・AI・履歴）。v5 のまま、必要最小限の接続点だけ追加
js/core/wcde/    v6 の層。world と civ の上に立つ。WorldState の唯一の変更経路（contract.js）を持つ
```
- `core/civ` は `core/wcde` を知らない。WCDE の領域は `createCivSim(world, civ, { extensions })` の拡張として tick に登録される。
- `core/wcde` のうち `config.js`（WorldSpec の検証）と `world.js`（地理の生成）だけが `core/world` を import する（`tests/v400-architecture.test.mjs` の許可表）。
- WCDE の世界は `civ.options.wcde = true`。この印がない世界（v5）では、新しい領域の処理は何もしない（v5 の数値は変わらない）。

## 2. WorldState の所有（領域の台帳は `domains/registry.js`）
| 領域 | 持つもの | 動かす処理（tick フェーズ） |
|---|---|---|
| 地理・環境 | `world.cell.*`（生成後は変えない）、気候・災害 | climate, disaster |
| 人口・集落 | `groups`, `settlements` | economy_pop |
| 種族 | `species`, `speciesDefs`（独自種族） | — |
| 文化・言語・宗教 | `cultures`, `languages.*.phon`, `religions` | culture |
| 魔法 | `persons`, `magic`（`options.magic=false` なら実体を持たない） | culture |
| 技術 | `techWorld`, 集団の `tech` | tech |
| 経済・産業・交易 | `states.*.econ` | **economy** |
| 国内政治 | `states.*.politics`（5勢力・議会・正統性・疲労） | **politics** |
| 軍事組織 | `states.*.military`, `milBonus`, `milDef` | **military** |
| 戦争・外交・国家 | `wars`, `treaties`, `states` | ai_plan, apply, conflict |
| 人物・家系・都市 | `figures`, `houses`, `settlements.*.name` | conflict |
| 歴史の記録 | `events`, `decisions`, `history` | integrity |

月次 tick の順序（`tests/v500-civ-m0-m1.test.mjs` で固定）:
`clock → climate → disaster → economy_pop → culture → tech → economy → politics → military → ai_plan → apply → conflict → integrity → notify`。
v5 の 11 段階に、経済・政治・軍事の 3 段階を tech と ai_plan の間へ追加した（仕様 §6 の「技術→経済→政治→軍事→AI」の順）。創造主の介入の減衰（M6）は clock の直後に入れる予定（未実装）。

## 3. 命令の経路（`contract.js`）
WorldState を変える入口は `dispatch(w, cmd)` だけ。`cmd = { type, authority, commandId?, ... }`。

| 権限 | 意味 | 使える命令（`commands.js`） |
|---|---|---|
| `player_order` | 担当国家の命令 | `founding.found`, `state.act`, `state.reorganize`, `state.adoptDoctrine`（担当国家のみ） |
| `creator_intervention` | 創造主 | `creator.editState`, `creator.rename`, `state.reorganize`, `calendar.edit` |
| `ai_action` | 国家 AI | tick の中で、プレイヤーと同じ行動レジストリ（`civ/actions.js`）を通る（`dispatch` は通らない） |
| `simulation_transition` | tick | `time.advance` の中身 |
| `administrative` | 時間・担当・表示 | `time.advance`, `control.take`, `control.release`, `founding.delegate`, `founding.refresh`, `view.past`, `calendar.edit` |

実行の手順: 命令の存在 → 権限 → 冪等性（commandId）→ 過去閲覧中の禁止 → 段階（prehistory / founding / running）→ 担当国家の確認 → 検証 → 取り消し点 → 適用。
- **原子性**: `apply` が例外を投げたら、states・groups・figures・seq（ID 連番）・events・decisions などを命令前へ戻す（入れ物は同じオブジェクトのまま中身を戻す）。`apply` が `{ ok:false }` を返すときは「何も変えていない」契約（検証を先に済ませる）。
- **tick の原子性**（`safeAdvance`）: 120 か月ごとに取り消し点を取る。月の処理が例外になったら、取り消し点へ戻し、決定的にやり直して「最後に成功した月」まで進めて止まる。診断は `civ.wcde.diagnostics`。
- **冪等性**: 同じ `commandId` は二度実行しない（直近 2,000 件）。
- **過去閲覧**: `view.past` の間は、世界を変える命令をすべて拒否する。
- **乱数**: 歴史の乱数は `hash(historySeed, 月)` から導く（状態を持たない）。保存した `historySeed` と同じ入力列から、同じ未来になる。地理の乱数（`worldSeed`）と歴史の乱数は別。WCDE のコードは `Math.random` / `Date.now` を使わない（テストで検査）。
- **保存**: `serializeWorld` は設定（`civ.wcde.config`）と `civ`。地理は設定から再生成する。

## 4. 担当国家
担当できる国家は同時に最大 1。担当は `civ.wcde.control.stateId` が正で、`states.*.player` はその写し。担当が無いとき（創造主モード）は全国家が AI。表示する国家（UI の状態）は担当と別で、世界を変えない。担当国家が滅びたら自動で外れる（`control.lost` を記録）。

## 5. 創造主の直接編集（M5）と介入（M6）の境目
- M5: 直接設定できる項目だけ（国名・政体・税・動員・寛容・同化・自治・財政・安定・指導者名）。範囲を検証し、1 つでも不正なら全体を適用しない。変更前後を `civ.wcde.edits` と事件（`provenance: "creator"`）に残す。
- 計算で決まる値（産業力・軍事能力・正統性など）は直接変えない。M6 で、記録・期間・減衰・因果つきの「介入」として扱う。その入口として `effective(civ, st, key)` と `civ.wcde.adjust` を用意した（現状は名目値）。

## 6. ID の種類
v5 の種類に `house`（家）, `candidate`（建国の候補）, `unit`（部隊）を追加。人物は `person`（魔法の人物は `civ.persons`、指導者・継承者は `civ.figures`）。
