// v6.20.1: 歴史の記録の見直し（原因・外交の不成立・言語と文化の比・国境・版の表示）。実際に 250 年ぶんの歴史を作って確かめる。
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { delegateToWorld } from "../js/core/wcde/founding.js";
import { APP_VERSION_FOR_SAVE } from "../js/core/wcde/save-meta.js";
import { APP_VERSION } from "../js/version.js";
import { borderMetrics, cultureMetrics } from "./perf/v6201-metrics.mjs";
let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const { w } = createNewWorld({ worldSeed: "alter-8466", spec: { resolution: { targetCells: 2000 } } }); delegateToWorld(w);
const civ = w.civ, num = (id) => parseInt(String(id).split("_")[1], 36); let last = -1, n = 0, none = 0, failedDip = 0, hard = 0, langDiv = 0, cultDiv = 0; const bad = [];
for (let y = 0; y < 250; y += 2) {
  const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 24, commandId: `t-${y}` }); if (!r.ok) { check("時間が進む", false, JSON.stringify(r).slice(0, 120)); break; }
  for (const e of civ.events) { const k = num(e.eventId); if (k <= last) continue; last = k; n++; if (!e.causes?.length && !e.why) { none++; if (bad.length < 5) bad.push(e.kind); } if (e.kind === "diplomacy_failed") { failedDip++; if (/切れて間もない|すでに多く/.test(e.title)) hard++; } if (e.kind === "language_diverged") langDiv++; if (e.kind === "culture_diverged") cultDiv++; }
}
check("250 年ぶんの歴史ができた", n > 3000, `${n} 件`);
check("原因も理由も記録されていない出来事は 10% 未満（v6.20.0 は約 97%）", none / n < 0.1, `${(100 * none / n).toFixed(1)}% ${bad.join(",")}`);
check("外交の不成立は出来事の 2% 未満（v6.20.0 は約 35%）", failedDip / n < 0.02, `${failedDip} 件`);
check("条約の必須条件の不成立（切れて間もない・すでに多い）は出来事にならない", hard === 0, `${hard} 件`);
const cm = cultureMetrics(w);
check("言語の分化は文化の分化より少ない", langDiv < cultDiv, `言語 ${langDiv} / 文化 ${cultDiv}`);
check("使われている言語の数は、文化の数を超えない", cm.aliveLanguages <= cm.aliveCultures, `言語 ${cm.aliveLanguages} / 文化 ${cm.aliveCultures}`);
const bm = borderMetrics(w);
check("飛び地を持つ国は、国の 20% 以下（v6.20.0 は 7 割に近い国まで）", bm.statesWithExclaves <= Math.max(1, Math.ceil(0.2 * bm.statesWithTerritory)), `${bm.statesWithExclaves}/${bm.statesWithTerritory}`);
check("保存ファイルに書かれる版が、アプリの版と同じ（v6.20.0 は 6.13.0 に固定されていた）", APP_VERSION_FOR_SAVE === APP_VERSION // v7.2.0: 版の数字は固定せず、保存の版とアプリの版が同じことだけを見る, APP_VERSION_FOR_SAVE);
console.log(failed ? `\n${failed} 件失敗` : "\nすべて通りました"); process.exit(failed ? 1 : 0);
