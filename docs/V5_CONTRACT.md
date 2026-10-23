# v5 契約（V5-M0）— 文明層の境界・ID・月次tick・保存

実装: `js/core/civ/`。テスト: `tests/v500-civ-m0-m1.test.mjs`、`tests/v500-civ-app.test.mjs`。

## 依存の向き
`core/civ`（文明層）は球面世界の**データ配列**（`world.cell.*`・`world.mesh.*`）を引数で受け取って読むだけで、`core/world` のコードを import しない（列挙値は `world-consts.js` に写しを持ち、一致をテストで固定）。`core/world` は文明層を知らない。`core/civ` は旧エディタ（`core/model`、国家運営層）を知らない。アプリ側（`app/civ-actions.js`・`ui/civ-window.js`）が両者をつなぐ。国家・戦争・外交の既存ロジックとの統合は M2 以降で、橋渡しを通す。

## 不変ID（`ids.js`）
`<種別>_<連番を36進5桁＋検査文字>`。連番は `civ.seq` に保存され、保存・読み込みをまたいで続く。年月・タイトルから作らない。検査文字で壊れた ID を検出（`parseId`）。種別: state / pop / settle / person / event / decision / proposal / tech / culture / lang / religion / species / war / treaty / disaster / work。

## 月次tick（`tick.js`）— 指示書 §2.1 の順序で固定
clock → climate → disaster → economy_pop → culture → tech → ai_plan → apply → conflict → integrity → notify。各システムは自分で月を進めず、`createTicker().register(phase, fn)` で登録する。実行は常にこの順（登録順に依存しない）。順序変更は回帰テストと DECISIONS.md を伴う。世界時計が正（`civ.monthIndex` は tick の clock フェーズが +1）。1 回の tick = 1 か月。年月は月通番（`monthIndex`）で扱い、負の年に対応。
- 現在登録済み: clock（時計・歴史の乱数の月別シード）／economy_pop（人口集団）／integrity。
- 未登録（後続マイルストーン）: climate・disaster（M11）／culture（M2・M4）／tech（M3）／ai_plan・apply（M5）／conflict（M2〜M5）／notify（M10）。

## 乱数
地理の決定性（世界シード）と歴史の乱数は分離。歴史は `civ.historySeed`（既定は新しい乱数。決定性を望む場合だけ固定）と月通番から月ごとの乱数列を作る。同じ `historySeed` なら同じ歴史（開発時の再現用）。ユーザー向けの既定は「毎回違う歴史」（既存の決定: 乱数は固定しない）。

## イベント（`events.js`）
`{eventId, date, kind, title, participants[{entityId, role}], location, causes[{targetId, relation, basis}], effects[{targetId, property, before, after}], decisionId, provenance}`。関係 8 種・根拠 5 種は指示書 §8.2〜8.3。因果の逆引き・双方向索引・信頼度の整備は M6。

## 保存
`.ahmap` v2 の拡張チャンク `civ.state`（JSON）。無い世界（歴史の開始前）はチャンクを書かない。読み込みに失敗したら、世界は開き、警告を出して歴史の開始前に戻す。未知の拡張チャンクの保持は既存どおり。全月の国家状態の列指向・チェックポイント方式は M7。

## プレイヤー不変条件
プレイヤー集団（`player: true`）は高々 1 つ。集団の移住・分派・定住・生業転換は自動で実行されず、「提案」（`civ.proposals`）として出て、命令（`commands.js`）で実行される。命令は NPC と同じ検証を通る。テストで固定。

## V5-M2〜M5 で追加した契約（v4.2.0）

### tick への登録（現在）
clock（時計・月別の乱数）→ economy_pop（人口）→ culture（文化・言語・宗教／コホート）→ tech（技術）→ ai_plan（NPC 国家が計画を立てる。状態は変えない）→ apply（計画を検証つきの行動として実行）→ conflict（国家の形成・安定度／戦争・条約）→ integrity（整合性検査）。未登録: climate・disaster（M11）、notify（M10）。

### 国家（`states.js`）
`civ.states[state_…]`。形成の経路 6 つ（`VIA`）と成立イベント（原因: 防衛連合は脅威となった国家、分離は前身）。プレイヤー集団は自動で国家に組み込まれない（形成は提案→命令 `formState`）。国家は集団の `stateId` で成員を持つ。

### 技術（`tech.js`）
保有者は集団（`g.tech.known`）。発見・伝播・喪失・再発見はすべてイベント。世界の発見記録 `civ.techWorld`。国家は `adopt_tech` で採用して初めて効果（軍事・税収）を得る。小さな集団は人口が足りない技術と、その前提が欠ける上位技術を持ち出せない（創始者効果）。

### コホート（`cohorts.js`）
`g.cohorts[{cultureId, languageId, religionId, speciesId, share, tension, interest}]`。share の合計は常に 1（整合性検査）。3 か月ごとに更新。

### AI と行動（`actions.js`・`ai.js`）
- 行動は `{key, domain, candidates(), execute()}`。AI もプレイヤー（命令 `stateAction`）も `findCandidate` と `runAction` を通る。**同じ状態に同じ結果**になることをテストで固定。
- 無効で登録した行動: disaster_relief（M11）・magic_institution（M8）・nuclear_program（後続）。
- 判断記録 `civ.decisions[]`: `{decisionId, date, actorId, provenance(ai|player), layer(strategy|campaign|routine|crisis|player), type, observations, strategy, candidates, chosen, result{ok,error,eventIds}}`。候補は圧縮配列 `[key, target, opt, total|null, 理由の辞書番号, 欲求の配列|0]`。`expandDecision()` で読みやすい形に戻す。評価間隔は `civ.options.aiInterval`（既定 6 か月。国家ごとにずらす）。
- 何もしない判断（`do_nothing`）も、候補と理由を残す。

### 戦争・条約（`diplomacy.js`）
戦争 `civ.wars`・条約 `civ.treaties`・関係値 `state.relations`。戦争の終結は占領地の移管を伴い、終結後 180 か月は次の征服計画を立てない。旧エディタの戦争モデルとの統合は未実施。
