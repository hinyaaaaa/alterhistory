#!/usr/bin/env python3
"""long-run.mjs の JSONL から、報告用の数字を出す。使い方: python3 tools/analyze-run.py run.jsonl"""
import json, sys, collections, statistics as st
rows = [json.loads(l) for l in open(sys.argv[1], encoding="utf8") if l.strip()]
ch = [r for r in rows if r["t"] == "chunk"]; fin = next((r for r in rows if r["t"] == "final"), None)
out = {}
out["years"] = ch[-1]["year"] if ch else 0; out["wall_s"] = ch[-1]["total"] if ch else 0
out["time_series"] = [{k: r[k] for k in ("year", "sec", "rss", "heap", "states", "ever", "pop", "groups", "techAvg")} for r in ch]
# メモリの増え方（年あたり）
if len(ch) > 3:
    n = len(ch); xs = [r["year"] for r in ch]; 
    def slope(ys):
        mx, my = sum(xs) / n, sum(ys) / n; return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / max(1e-9, sum((x - mx) ** 2 for x in xs))
    out["heap_MB_per_1000y"] = round(slope([r["heap"] for r in ch]) * 1000, 2); out["rss_MB_per_1000y"] = round(slope([r["rss"] for r in ch]) * 1000, 2); out["sec_per_100y_slope_per_1000y"] = round(slope([r["sec"] for r in ch]) * 1000, 2)
# 世紀あたりの出来事
kinds = collections.Counter(); 
for r in ch:
    for k, v in r.get("kinds", {}).items(): kinds[k] += v
out["event_totals"] = dict(kinds.most_common())
span = max(1, out["years"])
out["per_century"] = {k: round(v / (span / 100), 2) for k, v in kinds.items()}
# 政体: 時代ごとの分布
def era(y): return "0-1000" if y <= 1000 else "1000-3000" if y <= 3000 else "3000-5000" if y <= 5000 else "5000-10000"
byera = collections.defaultdict(collections.Counter)
for r in ch:
    for k, v in r["regimes"].items(): byera[era(r["year"])][k] += v
out["regime_share_by_era"] = {e: {k: round(v / sum(c.values()), 3) for k, v in c.most_common(8)} for e, c in byera.items()}
out["alive_states_range"] = [min(r["states"] for r in ch), max(r["states"] for r in ch)] if ch else None
if fin:
    rcs = fin["regimeChanges"]; out["regime_changes"] = len(rcs); out["regime_changes_with_cause"] = sum(1 for r in rcs if r["cause"])
    tr = collections.Counter(f'{r["from"]}>{r["to"]}' for r in rcs); out["top_transitions"] = tr.most_common(12)
    out["regime_change_by"] = dict(collections.Counter(r["by"] for r in rcs))
    L = fin["lifespans"]; out["state_lifespan"] = {"n": len(L), "median": st.median(L) if L else None, "mean": round(st.mean(L), 1) if L else None, "p90": sorted(L)[int(len(L) * .9)] if L else None, "le10y_share": round(sum(1 for x in L if x <= 10) / max(1, len(L)), 3)}
    ev = fin["eventIds"]; tot = sum(ev.values()); out["event_variety"] = {"distinct": len(ev), "total": tot, "top5_share": round(sum(v for _, v in sorted(ev.items(), key=lambda x: -x[1])[:5]) / max(1, tot), 3), "top": sorted(ev.items(), key=lambda x: -x[1])[:8]}
    al = collections.Counter(a["r"] for a in fin["alive"]); out["final_regimes"] = al.most_common(); out["final_alive"] = len(fin["alive"])
    out["final_mem"] = fin["mem"]
print(json.dumps(out, ensure_ascii=False, indent=1))
