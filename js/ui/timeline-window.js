// 年表ウィンドウ（ハブ →「年表」）。
//   ・歴史の出来事を、全件、新しい順で見る。種類・国・年で絞り込める。件数は削らない。
//   ・項目を押すと、地図がその場所へ移る。
//   ・件数が多くても重くならないよう、画面に見える行だけを描く（仮想スクロール）。行の数は減らさない。
import { buildTimeline } from "../io/chronicle.js";
import { cellIndexOf } from "../core/spatial.js";
import { el } from "./kit.js";
import { causeChain } from "../core/edit/lineage.js";
import { findZoneByZid } from "../core/edit/zones.js";

const ROW_H = 58; // 1行の高さ（px）。固定にして、見える範囲を計算で出す
const BUFFER = 8;

/** 出来事の種類（絞り込み用）。type の接頭辞・完全一致から決める */
export const TIMELINE_KINDS = [
  { key: "war", label: "戦争・戦闘", test: (t) => /^(war-|battle|covert-op|nuclear-op)/.test(t) },
  { key: "diplomacy", label: "外交・同盟", test: (t) => /^(diplomacy|alliance-|treaty)/.test(t) },
  { key: "state", label: "国家の変動", test: (t) => /^(state-merged|independence|sovereignty|created-state|removed-state|rename-state|capital|tech|doctrine|origin-state|succession|regime)/.test(t) },
  { key: "culture", label: "文化・宗教", test: (t) => /(culture|religion)/.test(t) },
  { key: "place", label: "都市・地図", test: (t) => /(burg|province|zone|marker)/.test(t) },
  { key: "era", label: "時代", test: (t) => t === "era" },
  { key: "natural", label: "自然発生", test: (t) => /^(plague|rebellion|schism|natural-)/.test(t) },
  { key: "note", label: "記録・手書き", test: (t) => t === "note" || t === "manual" },
];
export const kindOfType = (type) => TIMELINE_KINDS.find((k) => k.test(String(type)))?.key ?? "other";

/** 絞り込み。kind=""/stateId=null/年が null なら、その条件は使わない */
export function filterTimeline(entries, { kind = "", stateId = null, fromYear = null, toYear = null, text = "" } = {}) {
  const q = String(text).trim();
  return entries.filter((e) => {
    if (kind && kindOfType(e.type) !== kind) return false;
    if (stateId != null && !e.stateIds?.includes(stateId)) return false;
    if (fromYear != null && (e.year == null || e.year < fromYear)) return false;
    if (toYear != null && (e.year == null || e.year > toYear)) return false;
    if (q && !`${e.title} ${e.detail ?? ""}`.includes(q)) return false;
    return true;
  });
}

/** 見える範囲 [first, last) を出す（仮想スクロールの計算。単体でテストできる） */
export function visibleRange(scrollTop, viewH, total, rowH = ROW_H, buffer = BUFFER) {
  const first = Math.max(0, Math.floor(scrollTop / rowH) - buffer);
  const last = Math.min(total, Math.ceil((scrollTop + viewH) / rowH) + buffer);
  return [first, Math.max(first, last)];
}

export function initTimelineWindow({ store, wins, editActions, viewport, renderer, actions }) {
  const body = el("div", "tl-body");
  const filters = el("div", "tl-filters");
  const kindSel = el("select"); kindSel.title = "出来事の種類";
  const stateSel = el("select"); stateSel.title = "国";
  const textIn = el("input"); textIn.type = "search"; textIn.placeholder = "語で探す"; textIn.title = "題や説明に含まれる語";
  const reset = el("button", "", "絞り込みを外す"); reset.type = "button";
  const fromIn = el("input"); fromIn.type = "number"; fromIn.placeholder = "から（年）"; fromIn.title = "この年から";
  const toIn = el("input"); toIn.type = "number"; toIn.placeholder = "まで（年）"; toIn.title = "この年まで";
  filters.append(kindSel, stateSel, fromIn, toIn, textIn, reset);
  const count = el("p", "hint tl-count");
  const scroller = el("div", "tl-scroll"); const spacer = el("div", "tl-spacer"); const rowsHost = el("div", "tl-rows");
  spacer.append(rowsHost); scroller.append(spacer);
  body.append(filters, count, scroller);

  let all = [], shown = [], mapRef = null;
  const live = (map) => map.pack.states.filter((s) => s && s.i > 0);
  const nameOf = (s) => `${s.fullName ?? s.name}${s.removed ? "（消滅）" : ""}`;

  function fillSelects(map) {
    const prevS = stateSel.value, prevK = kindSel.value;
    kindSel.replaceChildren(new Option("すべての種類", ""), ...TIMELINE_KINDS.map((k) => new Option(k.label, k.key)));
    stateSel.replaceChildren(new Option("すべての国", ""), ...live(map).map((s) => new Option(nameOf(s), String(s.i))));
    kindSel.value = prevK; stateSel.value = prevS;
  }
  const num = (i) => (i.value === "" || !Number.isFinite(+i.value) ? null : +i.value);
  const criteria = () => ({ kind: kindSel.value, stateId: stateSel.value ? +stateSel.value : null, fromYear: num(fromIn), toYear: num(toIn), text: textIn.value });

  function build() {
    const map = store.getState().map; mapRef = map;
    if (!map) { all = []; shown = []; count.textContent = "地図を開いてください"; spacer.style.height = "0px"; rowsHost.replaceChildren(); return; }
    fillSelects(map);
    all = buildTimeline(map).reverse(); // 新しい順（v2.5.0）。データは古い順のまま持ち、表示だけ逆にする
    apply();
  }
  function apply() {
    shown = filterTimeline(all, criteria());
    const filtered = shown.length !== all.length;
    count.textContent = `${shown.length} 件${filtered ? `（全 ${all.length} 件のうち）` : ""}。項目を押すと、地図がその場所へ移ります。`;
    spacer.style.height = `${shown.length * ROW_H}px`;
    paint();
  }

  function jump(entry) {
    const map = store.getState().map; if (!map) return;
    // ゾーンのついた出来事: そのゾーンの輪郭を赤い線で強調し、地図をその範囲へ移す（期間が過ぎて消えていても、選んでいる間は出す）
    const zone = findZoneByZid(map, entry.zoneId);
    if (zone && zone.cells?.length) {
      actions?.setView({ zoneFocus: zone.zid });
      const P = map.geometry.pack.p; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of zone.cells) { const p = P[i]; if (!p) continue; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      if (Number.isFinite(x0)) {
        const w = Math.max(40, x1 - x0), h = Math.max(40, y1 - y0);
        const k = Math.min(viewport.screenWidth / (w * 1.8), viewport.screenHeight / (h * 1.8));
        viewport.centerOn((x0 + x1) / 2, (y0 + y1) / 2, Math.max(viewport.fitK, Math.min(k, viewport.fitK * 8)));
      }
      renderer.requestRender(); return;
    }
    actions?.setView({ zoneFocus: null });
    if (entry.cell == null) { count.textContent = "この出来事には、地図上の場所がありません"; return; }
    const pt = map.geometry.pack.p[entry.cell]; if (!pt) return;
    viewport.centerOn(pt[0], pt[1], Math.max(viewport.k, viewport.fitK * 2.5));
    renderer.requestRender();
  }

  function paint() {
    const [first, last] = visibleRange(scroller.scrollTop, scroller.clientHeight || 400, shown.length);
    rowsHost.style.transform = `translateY(${first * ROW_H}px)`;
    const frag = document.createDocumentFragment();
    for (let i = first; i < last; i++) {
      const e = shown[i];
      const row = el("button", `tl-row tl-${kindOfType(e.type)}${e.cell == null ? " tl-nowhere" : ""}`); row.type = "button";
      row.title = [e.title, e.detail].filter(Boolean).join("\n");
      row.classList.toggle("tl-zone", !!e.zoneId);
      if (e.causeText) row.title = "経緯: " + causeChain(all, e).map((x) => x.title).concat(e.title).join(" → ");
      row.append(el("span", "tl-date-col", e.date ?? "日付不明"), el("span", "tl-title", e.title), el("span", "tl-detail", [e.detail, e.causeText ? "↳ " + e.causeText : ""].filter(Boolean).join("　")));
      row.addEventListener("click", () => jump(e));
      frag.append(row);
    }
    rowsHost.replaceChildren(frag);
  }
  // 戦争の窓などから「この種類で年表を見る」と頼まれたら、絞り込みを合わせる
  window.addEventListener("timeline-filter", (ev) => { const k = ev.detail?.kind ?? ""; if (wins.isOpen("timeline")) { build(); } kindSel.value = k; stateSel.value = ""; apply(); });
  scroller.addEventListener("scroll", paint);
  for (const c of [kindSel, stateSel, fromIn, toIn]) c.addEventListener("change", apply);
  textIn.addEventListener("input", apply);
  reset.addEventListener("click", () => { kindSel.value = ""; stateSel.value = ""; fromIn.value = ""; toIn.value = ""; textIn.value = ""; apply(); });


  wins.register("timeline", { title: "年表", width: 780, body, onOpen: build, onClose: () => { if (store.getState().view.zoneFocus) actions?.setView({ zoneFocus: null }); } });
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type) && wins.isOpen("timeline")) build(); });
  return { build };
}
