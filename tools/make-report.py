#!/usr/bin/env python3
"""長期実走のログ（JSONL）から、調査報告（Markdown）と zip を作る。使い方: python3 tools/make-report.py run.jsonl out_dir"""
import json, sys, subprocess, collections, statistics as st, os, shutil, zipfile
src, outdir = sys.argv[1], sys.argv[2]; os.makedirs(outdir, exist_ok=True)
a = json.loads(subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "analyze-run.py"), src], capture_output=True, text=True).stdout)
rows = [json.loads(l) for l in open(src, encoding="utf8") if l.strip()]; ch = [r for r in rows if r["t"] == "chunk"]
def at(y):
    c = [r for r in ch if r["year"] == y]; return c[0] if c else None
L = []; P = L.append
P("# AlterHistory 長期実走・調査報告（7000年ラン／メモリ計測／25万セルへの方策）\n")
P(f"- 世界: 1500セル・シード run-10k-c・魔法あり。到達年: {a['years']}年。実時間（再開をまたぐ合計ではなく最後の連続区間）: {a['wall_s']}秒")
P("- 実行環境: 1 CPU・メモリ 4GB のコンテナ。長い実走はコンテナの一時停止で止まるため、500年ごとの保存から再開して走らせた（再開しても同じ歴史が続くことは確認済み）。\n")
P("## 1. 時間とメモリ（実測）\n")
P("| 年 | 100年あたり(秒) | ヒープ(MB) | プロセス全体(MB) | 存続国 | 集団数 | 人口 | 技術/国 |\n|---|---|---|---|---|---|---|---|")
for y in range(500, a["years"] + 1, 500):
    r = at(y)
    if r: P(f"| {y} | {r['sec']} | {r['heap']} | {r['rss']} | {r['states']} | {r['groups']} | {r['pop']:,} | {r['techAvg']} |")
P(f"\n- 増え方: ヒープ {a.get('heap_MB_per_1000y')} MB/1000年、プロセス全体 {a.get('rss_MB_per_1000y')} MB/1000年。100年あたりの時間は 1000年ごとに {a.get('sec_per_100y_slope_per_1000y')} 秒ずつ増える。")
P("- 時間とメモリは、国と集団が増える時代ほど増える。1500セルでも序盤（25秒/100年）と近代（150〜280秒/100年）で約10倍の差がある。\n")
P("### セル数を変えた短期計測（20年分、序盤）\n\n| セル数 | 時間(秒) | 集団数 | ヒープ(MB) | 全体(MB) |\n|---|---|---|---|---|\n| 3000 | 13.7 | 1036 | 23 | 147 |\n| 12000 | 59.6 | 4312 | 42 | 232 |\n| 20000 | 115.9 | 7109 | 58 | 295 |\n")
P("時間は集団数にほぼ比例する。`targetCells` の上限は 20000（`js/core/wcde/config.js`）。25万セルは序盤でも 20年で 10〜25分、序盤のメモリ約2GBの外挿。実走の増え方（時代が進むと時間が約10倍、メモリが約7倍）を見ると、25万セルの近代は現状のままでは現実的でない。\n")
P("## 2. 高速化・軽量化の具体策\n\n3000セル・300年の CPU プロファイル（`--cpu-prof`）から。自己時間の割合。\n")
P("| 割合 | 場所 | 内容 |\n|---|---|---|\n| 約39% | `js/core/civ/tech.js` の `stepTech` ほか（`emergenceRate` 約5%） | 集団ごと・期ごとに、500項目の候補を走査して確率を引いている |\n| 約19% | `population.js` ほか（収容力・到達範囲） | 毎月、収容力と到達範囲を計算し直している |\n| 約10% | `foundSatellite` | 呼ぶたびに全集落から占有セルの集合を作り直している |\n| 約3.7% | 近傍・空間索引 | 近傍集団の配列を毎回作っている |\n| 約3.4% | GC | 一時配列・Set の大量生成 |\n| 約2.9% | `checkCivIntegrity` | 毎月の整合性検査 |\n| 約1.5% | `structuredClone` | 月ごとの巻き戻し用の複製 |\n")
P("### 方策（効果の大きい順）\n")
for t in [
 "**技術の確率判定をイベント駆動にする**（`tech.js`、約39%）。毎期、集団×候補で確率を引く方式をやめ、集団ごとに『次の発見までの時間』を指数分布で引く。候補の発見率の合計 R から待ち時間を引き、その時刻にだけ候補を重みつきで選ぶ。知識・人口・環境が大きく変わったときだけ R を再計算する。競合する指数分布の性質で、確率的には同じ。処理が『集団×期』から『発見の回数』に比例する。",
 "**集団ごとの係数を候補ループの外へ出す**。knowF・contactF・urbanF・econF・learnF・compF・環境の加速は集団で共通なので、集団ごとに1回だけ計算する。候補ごとには人口係数と成立条件だけを見る。候補を minPop の昇順に持てば、人口が足りない候補は先頭で打ち切れる。",
 "**候補の更新を後続技術の索引で行う**。技術を採用・喪失するとき、全500項目を `filter` する代わりに、技術→後続技術の索引を引き、前提がそろった後続だけを候補へ足す／外す。接触・教育による伝播の走査も、500項目ではなく『相手の既知の技術』だけにする。",
 "**占有セルの集合を持ち続ける**（`foundSatellite`、約10%）。`civ.settlements` の変化に合わせて追加・削除し、呼ぶたびに作り直さない。衛星の探索の頻度も、集団ごとの最終試行月で間引く。",
 "**収容力と到達範囲をキャッシュする**（約19%）。収容力は気候と技術が変わる年1回に計算し、月ごとは差分だけにする。到達範囲は国境・集落が変わったときだけ無効にする。",
 "**整合性検査を年1回にする**（約3%）。テストでは毎月のまま。**巻き戻し用の複製**は、変更を記録する方式（ジャーナル）にして、全状態の `structuredClone` をやめる。",
 "**近傍の配列を前計算する**。集団ごとの近傍を配列で持ち、集落・国境が変わったときだけ更新する。一時配列と `Set` の生成を減らし、GC の負荷も下げる。",
]: P("- " + t)
P("\n### 25万セルに向けた構造の変更\n")
for t in [
 "**人のいない土地は、オブジェクトを持たない**。いまは集団がセルごとのオブジェクトで、1000セルあたり約2KB のヒープを使う（実測の傾き）。気候・標高・収容力は型付き配列（`Float32Array`）にし、人のいる集団だけオブジェクトにする。25万セルの基礎部分が約数十MB に収まる。",
 "**活動中の集団だけ毎月処理する**（LOD）。孤立した過疎の集団は、四半期・年の粗い刻みでまとめて進める。戦争・災害・接触が起きたときだけ細かい刻みに戻す。",
 "**戦争のない時期は、時間刻みを粗くする**。月の処理を、戦争・同盟・条約の動きがない国では四半期でまとめる。",
 "**大陸（または海で隔てられた領域）ごとに Web Worker へ分ける**。集団の相互作用は主に近傍で起きるので、領域をまたぐ貿易・移住・伝播は年1回の同期でよい。履歴ストアは別 Worker に置ける（すでに分離されている）。",
 "**出来事の記録を軽くする**。`civ.events` は直近36か月の作業バッファで、古い分は archive へ退避される。25万セルでは1か月あたりの出来事が数十倍になるので、小さな出来事は集計だけを残し、1件ずつの保存をやめる。",
 "**上限の引き上げ**。`RESOLUTION.max`（20000）を引き上げ、まず 6万→12万→25万と段階的に、各段で20年分の時間とメモリを `tools/long-run.mjs` で測る。",
]: P("- " + t)
P("\n### 目標の見積もり\n\n25万セルは 3000セルの約83倍。いまの実走（3000セル換算で近代 100年あたり数百秒）をそのまま延ばすと、7000年で数百〜数千時間になる。技術のイベント駆動化・活動中の集団だけの処理・領域ごとの並列で、桁で1〜2つ下げる必要がある。まず技術（約39%）と人口（約19%）を直し、同じ道具で再計測して効果を確かめる。\n")
P("## 3. 7000年が自然な歴史になっているか\n")
P("### 時代\n")
P("| 年 | 存続国 | 人口 | 技術/国 | 主な政体 |\n|---|---|---|---|---|")
for y in (500, 1000, 2000, 3000, 4000, 5000, 6000, 7000):
    r = at(y)
    if r: P(f"| {y} | {r['states']} | {r['pop']:,} | {r['techAvg']} | " + "、".join(f"{k} {v}" for k, v in sorted(r["regimes"].items(), key=lambda x: -x[1])[:5]) + " |")
P("\n目安は『約4000年で中世、約5000年で現代』。")
P("\n### 出来事の発生率（100年あたり）\n\n| 種類 | 件数 |\n|---|---|")
for k, v in sorted(a["per_century"].items(), key=lambda x: -x[1])[:16]: P(f"| {k} | {v} |")
if "regime_changes" in a:
    P(f"\n### 政体の変更\n\n- 政体変更 {a['regime_changes']} 件、うち原因（前兆など）つき {a['regime_changes_with_cause']} 件。内訳: {a['regime_change_by']}")
    P("- 多い遷移: " + "、".join(f"{k} ×{v}" for k, v in a["top_transitions"][:10]))
    P(f"- 国の寿命（年）: {a['state_lifespan']}")
    P(f"- 個別の出来事の種類数 {a['event_variety']['distinct']}、上位5種の割合 {a['event_variety']['top5_share']}")
P("\n### 評価\n\n（解釈は報告の本文で追記する）\n")
open(os.path.join(outdir, "report.md"), "w", encoding="utf8").write("\n".join(L))
shutil.copy(src, os.path.join(outdir, "run.jsonl")); json.dump(a, open(os.path.join(outdir, "analysis.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
for f in ("tools/long-run.mjs", "tools/analyze-run.py", "tools/make-report.py"):
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), f)
    if os.path.exists(p): shutil.copy(p, os.path.join(outdir, os.path.basename(p)))
print("ok", outdir)
