# WAR_API — 戦争システム再設計（v7.0.0）の UI との契約

担当: 戦争エージェント（`js/core/wcde/war-*.js` ほか）。UI 担当は、この文書の命令・状態・決断・イベントだけに依存する。**保存している形を壊さない**ため、状態は下の「保存形」と「画面向けの形（`war.view`）」の 2 つで示す。

## 1. 状態

保存形（`civ.wars[id]`。既存の項目はそのまま）に、次が加わる。

| 項目 | 形 | 説明 |
|---|---|---|
| `goals` | `[{ by, kind, target }]` | 戦争目的。kind: `annex 併合／territory 領土／subjugate 従属化／liberate 解放／throne 王位／religion 宗教／reparations 賠償`。講和で取れる範囲の枠 |
| `phase` | `"active" \| "conference" \| "ended"` | 会議の局面では戦わない |
| `surrender` | `{ [stateId]: { vpPct, limit, support, capitulated, capLost, resist } }` | 国ごとの降伏。`vpPct` 占領された勝利点（%）／`limit` 降伏の限度（%）／`support` 戦争支持 0〜100 |
| `fronts` | `[{ theater, stateId, armies[], commander, plan:{ stance, line[], arrows[{from,to,kind}] } }]` | 戦線・矢印の命令データ |
| `log` | `[{ at, kind, text }]` | 経緯（降伏・会議・講和・抗戦・参戦）。最大 60 件 |
| `conf` | 会議中だけ | 戦争スコア・入札（`conference.*` 参照） |
| `peace` | 終結後 | `{ name, at, kind: "conference"\|"negotiated", winnerSide, demands[] }` |
| `victor` | `"a" \| "d" \| null` | 会議・要求つき講和の勝者の側 |

`sides` は保存形のまま `{ a: [国 id], d: [国 id] }`（a=攻撃側／d=防衛側。主たる交戦国は `aggressor`／`defender`）。契約の `sides[{nations,leader}]` は **`war.view` が返す**（下記）。

画面向けの形（`war.view`）: `{ id, name, goals[], phase, sides:[{ side, nations[], leader, leaderName }], surrender{}, fronts[], log[], conference }`。`conference` は会議中だけ `{ loserSide, winnerSide, scores{国: 持ち点}, spent{国: 使用済み}, bids[{ seq, kind, by, target, groups, amount, cost, ai }] }`。

同盟: `civ.wcde.alliances.items[id] = { id, name, kind, leaderId, members[], obligation, memberObl{}, enemy, formedAt, active, history[], legacy }`。kind: `defense／offense_defense／trade／religion／counter`。obligation: `must 必ず／optional 任意／defense_only 防衛のみ`。国には `credibility`（信用 0〜1・既定 0.7）、`grudges{国: 0〜2}`（恨み）が付く。従属国の `dependency.autonomy`（自治度 0〜1）。

## 2. 命令（`dispatch`）

すべて担当国（`player_order`）の命令。予測・表示は `administrative` でも呼べる（`stateId` を渡す）。

| 命令 | 引数 | 結果 |
|---|---|---|
| `war.declare` | `{ target, goals:[{kind, target?}] }` | `{ warId, goals }`。同盟国・不可侵条約の相手には宣戦できない |
| `war.setStance` | `{ warId, posture:"offensive\|balanced\|defensive", commit, focus }` | 既存の `war.direct` と同じ |
| `war.setPlan` | `{ warId, theater, armies[軍団 id], commander, plan:{ stance, line[集団 id], arrows[{from,to,kind:"march\|siege"}] } }` | `{ front, ordered }`。矢印の `to` へ、その戦線の軍団に行軍／包囲の命令が出る |
| `war.predict` | `{ target, goals[] }` | `{ joins[{stateId,name,side,pct,why}], supportChange, legitimacyChange, expectedMonths, favored, power }` |
| `war.view` | `{ warId }` | 画面向けの形（上記） |
| `peace.propose` | `{ warId, withId?, terms:{ kind:"white" } \| { demands:[{kind,target?,groups?,amount?}] } }` | 受諾なら終戦。拒否は `error` に理由（上位 3 件）。要求つきは主たる交戦国だけ（単独講和は白紙のみ） |
| `peace.predict` | `{ warId, withId?, terms }` | `{ acceptPct, accept, reasons[], factors[], invalid }` |
| `peace.accept／peace.reject` | `{ warId }` | AI からの申し出（決断 `peace_offer`）に答える |
| `conference.bid` | `{ warId, demand:{ kind, target, groups?, amount? } }` | `{ cost, seq, left }`。枠・持ち点・首都の割譲不可を検査 |
| `conference.retract` | `{ warId, seq }` | 取り下げ |
| `conference.finish` | `{ warId }` | 締結（予算を超える入札は後ろから落ちる） |
| `surrender.accept／resist／counter` | `{ warId }` | 降伏の打診（決断 `surrender_call`）に答える。`accept` は打診なしでも可 |
| `alliance.create` | `{ kind, members[], name?, obligation?, enemy? }` | `{ allianceId, members }`。応じた国だけで成立 |
| `alliance.invite／expel／transferLead` | `{ allianceId, target }` | 盟主だけ |
| `alliance.leave` | `{ allianceId }` | 信用 −0.05、盟友との関係悪化 |
| `alliance.setObligation` | `{ allianceId, obligation, memberId? }` | 盟主は全体、本人は自国の分 |
| `alliance.respondCall` | `{ warId, choice:"join\|decline\|mediate" }` | 参戦要請の決断に答える |
| `capital.move` | `{ settlementId }` | 遷都（自国の領土・占領されていない土地だけ。安定 −0.04） |

講和会議の要求 `kind`: `annex／cede（groups 必須）／vassalize／liberate（groups 必須）／regime／reparations／dmz／resource／fleet／hostage／amnesty`。最初の 5 つ＋賠償は戦争目的の枠の中だけ、`dmz〜amnesty` は枠の外。

## 3. 決断（`decision.resolve`）

| kind | 選択肢 | 出るとき |
|---|---|---|
| `surrender_call` | `accept／resist／counter` | 担当国の降伏ゲージが限度に達したとき（回答まで降伏しない） |
| `conference` | `auto／manual／finish` | 担当国が勝者の側で会議が開いたとき。`manual` は決断を残し、`conference.bid／finish` で進める |
| `peace_terms` | `accept` | 担当国が敗者の側で会議が済むとき（条件の確認） |
| `peace_offer` | `accept／reject` | AI の停戦の申し出（既存）。担当国が絡む戦争では、AI が停戦を望めば半年に 1 度まで出る |
| `ally_call` | `join／refuse／mediate` | 同盟国の参戦要請（既存の種類に義務の強さと調停を足した。`payload.obligation`） |

**担当国が関わる戦争は、決断なしに終わらない。** 決断は人間が時間を進めている間（`clock.run`）だけ出る（既存の規則）。`time.advance`（管理操作）では決断が出ないため、担当国も AI と同じく自動で降伏する。

## 4. 歴史イベント（`kind`）

`war_declared`（既存）／`battle_fought`（既存。契約の `battle`）／`capitulated`／`capitulation_reversed`／`conference_opened`／`peace_signed`／`annexed`／`vassalized`／`liberated`／`conquest`（割譲。既存）／`alliance_formed`／`alliance_left`／`alliance_dissolved`／`call_answered`／`autonomy_peak`。当時の国名・参加者（`participants`）と理由（`why`）が付く。

## 5. 規則の要約

- **勝利点**: 集団ごとに、都市の段階（都市 6・町 2.5・村 1）＋集落の数＋人口の平方根。首都は国全体の 35% 以上（最低 6）を加える。降伏ゲージ `vpPct` = 占領された勝利点 ÷ 国の合計。
- **降伏の限度**: 既定 80%。戦争支持が 60 を下回るほど下がり、支持 0 で 20%。首都の陥落で −10。軍の壊滅が 6 か月続くと −15。支持 0 が 12 か月続けば、占領が少なくても降伏。首都を取り戻し、限度を 5 ポイント以上下回ると降伏から戻れる。
- **戦争支持**: 疲労・損耗・国内の不安定・劣勢・抗戦の長さ・戦争の長さで下がる（0〜100）。
- **講和会議**: 片側の主たる交戦国が降伏する（または全員が降伏する）と開く。戦争スコア = 敵国の価値（降伏 100／未降伏 60）× 1.35 × 貢献度（占領した勝利点の割合 7 割＋参加の下限 3 割）。目的に沿う要求は 2 割安い。同じ対象への 2 つ目以降の入札は 1.2 倍ずつ。AI どうしは同じ月に自動で締結し、歴史に記録する。
- **交渉の受諾**: 戦力差・戦況・占領・疲労・戦争支持・達成できそうな戦争目的・降伏の有無が理由として返る。降伏した国は、相手の戦争目的の範囲なら受け入れる。まだ戦える国は併合・従属化を拒む。
- **同盟**: 義務が `must` なら必ず、`optional` なら関係・戦力から、`defense_only` なら守りの戦争だけ参戦。共通の敵（`enemy`）との戦争には義務にかかわらず呼ばれる。同盟国を攻めると同盟を抜け、信用が下がる。

## 動員と戦略（7.0.0-rc.1）
| 命令 | 引数 | 説明 |
|---|---|---|
| `war.mobilize` | `{ stateId, warId, corpsIds, posture?, commit?, focus?, orders?:[{corpsId, kind, targetGroupId?}] }` | 出す部隊（`corpsIds`）と戦略（方針・投入割合・重点）を一度に決める。`orders` に入れた部隊だけ自分で指揮し、入れない動員部隊は「お任せ（auto）」のまま＝AI が自動で戦う。動員から外した部隊は予備に戻る。 |

AI（お任せの部隊）の目標選び: 価値 = √人口 × 規模（首都 1.9・都市 1.6・町 1.25）÷（1＋距離／届く距離）。ドクトリン系統で調整（火力: 都市 ×1.25／機動: 首都 ×1.3・遠くまで／人海: 都市 ×1.1／陣地: 近く優先／特殊: 首都 ×1.5）。補給の届く範囲の 1.3 倍を超える目標は ×0.5。重みは初期値で、バランスは未計測。
