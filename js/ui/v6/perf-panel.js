// v6.20.0 M5: 内部診断画面（ALTERHISTORY / PERFORMANCE）。世界設定ハブの下部に置く。数値は実測値。測定していない項目は「—」。
import { h } from "./common.js";
import { S } from "./store.js";
import { perf, DOMAIN_OF } from "../../core/perf/perf-monitor.js";
import { historyStatus } from "../../core/civ/history-store.js";
const f1 = (x) =>
  x == null || !Number.isFinite(x) ? "—" : x >= 100 ? Math.round(x).toString() : x.toFixed(x >= 10 ? 1 : 2);
export function perfPanel() {
  const civ = S.w.civ,
    r = perf.report(),
    hs = historyStatus(civ),
    last = r.samples.at(-1),
    mem = last?.heapMB,
    T = (k, v, u = "") => h("div", { class: "pfk" }, h("span", {}, k), h("b", {}, v + u));
  const rows = Object.entries(r.domains)
    .filter(([k]) => DOMAIN_OF[k])
    .sort((a, b) => b[1].recent - a[1].recent)
    .map(([k, d]) =>
      h("tr", {}, h("td", {}, DOMAIN_OF[k]), h("td", {}, f1(d.recent)), h("td", {}, f1(d.avg)), h("td", {}, f1(d.max))),
    );
  const extra = Object.entries(r.domains)
    .filter(([k]) => !DOMAIN_OF[k])
    .map(([k, d]) =>
      h("tr", {}, h("td", {}, k), h("td", {}, f1(d.recent)), h("td", {}, f1(d.avg)), h("td", {}, f1(d.max))),
    );
  const alerts = r.alerts
    .slice(-5)
    .map((a) => h("div", { class: "warn" }, new Date(a.at).toLocaleTimeString() + "　" + a.msg));
  return h(
    "details",
    { class: "dt", id: "perf" },
    h("summary", {}, "診断（性能・メモリ）"),
    h("div", { class: "code" }, "ALTERHISTORY / PERFORMANCE"),
    T("現在の年代", String(civ.date.year), " 年"),
    T("作業バッファのイベント", String(civ.events.length), " 件"),
    T("常駐の歴史資料", String(hs.resident), " 件"),
    T("外部保存の資料", String(hs.records), ` 件（${hs.chunks} チャンク・${f1(hs.bytes / 1024)} KB）`),
    T("履歴キャッシュ", String(hs.cached), " チャンク"),
    T("JSヒープ", f1(mem), mem != null ? ` MB（${last.memSource}）` : ""),
    T("増加の傾向", f1(r.slopeMBPerCentury), r.slopeMBPerCentury != null ? " MB / 100年" : ""),
    T("月の処理時間の変化", f1(r.slowdown), r.slowdown != null ? " 倍" : ""),
    hs.blocked ? h("div", { class: "warn" }, hs.blocked) : null,
    h(
      "table",
      { class: "tb" },
      h(
        "thead",
        {},
        h("tr", {}, h("th", {}, "領域"), h("th", {}, "直近 (ms)"), h("th", {}, "平均"), h("th", {}, "最大")),
      ),
      h("tbody", {}, ...rows, ...extra),
    ),
    ...alerts,
    h("small", {}, "診断データは直近 400 サンプルまで。メモリの値は環境により粗い補助値です。"),
  );
}
