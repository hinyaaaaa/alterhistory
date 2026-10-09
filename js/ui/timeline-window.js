// 年表ウィンドウ（設定メニュー →「📜 年表」）。
//   ・歴史の出来事を、全件、時系列で見る。種類・国・年で絞り込める。件数は削らない。
//   ・項目を押すと、地図がその場所へ移る。手書きの出来事も足せる。
//   ・件数が多くても重くならないよう、画面に見える行だけを描く（仮想スクロール）。行の数は減らさない。
import { buildTimeline } from "../io/chronicle.js";
import { cellIndexOf } from "../core/spatial.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ROW_H = 58; // 1行の高さ（px）。固定にして、見える範囲を計算で出す
const BUFFER = 8;

/** 出来事の種類（絞り込み用）。type の接頭辞・完全一致から決める */
export const TIMELINE_KINDS = [
  { key: "war", label: "戦争・戦闘", test: (t) => /^(war-|battle|covert-op|nuclear-op)/.test(t) },
  { key: "diplomacy", label: "外交・同盟", test: (t) => /^(diplomacy|alliance-)/.test(t) },
  { key: "state", label: "国家の変動", test: (t) => /^(state-merged|independence|sovereignty|created-state|removed-state|rename-state|capital|tech|doctrine|origin-state)/.test(t) },
  { key: "culture", label: "文化・宗教", test: (t) => /(culture|religion)/.test(t) },
  { key: "place", label: "都市・地図", test: (t) => /(burg|province|zone|marker|journey)/.test(t) },
  { key: "era", label: "時代", test: (t) => t === "era" },
  { key: "natural", label: "自然発生", test: (t) => /^(plague|rebellion|schism)/.test(t) },
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

export function initTimelineWindow({ store, wins, editActions, viewport, renderer }) {
  const body = el("div", "tl-body");
  const filters = el("div", "tl-filters");
  const kindSel = el("select"); kindSel.title = "出来事の種類";
  const stateSel = el("select"); stateSel.title = "国";
  const fromIn = el("input"); fromIn.type = "number"; fromIn.placeholder = "から（年）"; fromIn.title = "この年から";
  const toIn = el("input"); toIn.type = "number"; toIn.placeholder = "まで（年）"; toIn.title = "この年まで";
  const textIn = el("input"); textIn.type = "search"; textIn.placeholder = "語で探す"; textIn.title = "題や説明に含まれる語";
  const reset = el("button", "", "絞り込みを外す"); reset.type = "button";
  filters.append(kindSel, stateSel, fromIn, toIn, textIn, reset);
  const count = el("p", "hint tl-count");
  const scroller = el("div", "tl-scroll"); const spacer = el("div", "tl-spacer"); const rowsHost = el("div", "tl-rows");
  spacer.append(rowsHost); scroller.append(spacer);
  const addBox = el("details", "tl-add");
  addBox.append(el("summary", "", "＋ 出来事を書き足す"));
  const fTitle = el("input"); fTitle.placeholder = "出来事の題（必須）";
  const fDetail = el("input"); fDetail.placeholder = "説明（任意）";
  const fYear = el("input"); fYear.type = "number"; fYear.title = "年"; const fMonth = el("input"); fMonth.type = "number"; fMonth.min = 1; fMonth.max = 12; fMonth.title = "月";
  const fState = el("select"); fState.title = "関係する国（任意）";
  const fHere = el("label", "tl-here"); const fHereBox = el("input"); fHereBox.type = "checkbox"; fHere.append(fHereBox, document.createTextNode(" いま画面の中央にある場所を記録する"));
  const fGo = el("button", "primary", "年表に足す"); fGo.type = "button";
  const dateRow = el("div", "tl-date"); dateRow.append(fYear, el("span", "", "年"), fMonth, el("span", "", "月"));
  addBox.append(fTitle, fDetail, dateRow, fState, fHere, fGo);
  body.append(filters, count, scroller, addBox);

  let all = [], shown = [], mapRef = null;
  const live = (map) => map.pack.states.filter((s) => s && s.i > 0);
  const nameOf = (s) => `${s.fullName ?? s.name}${s.removed ? "（消滅）" : ""}`;

  function fillSelects(map) {
    const prevS = stateSel.value, prevK = kindSel.value, prevF = fState.value;
    kindSel.replaceChildren(new Option("すべての種類", ""), ...TIMELINE_KINDS.map((k) => new Option(k.label, k.key)));
    stateSel.replaceChildren(new Option("すべての国", ""), ...live(map).map((s) => new Option(nameOf(s), String(s.i))));
    fState.replaceChildren(new Option("国は指定しない", ""), ...live(map).filter((s) => !s.removed).map((s) => new Option(nameOf(s), String(s.i))));
    kindSel.value = prevK; stateSel.value = prevS; fState.value = prevF;
  }
  const num = (i) => (i.value === "" || !Number.isFinite(+i.value) ? null : +i.value);
  const criteria = () => ({ kind: kindSel.value, stateId: stateSel.value ? +stateSel.value : null, fromYear: num(fromIn), toYear: num(toIn), text: textIn.value });

  function build() {
    const map = store.getState().map; mapRef = map;
    if (!map) { all = []; shown = []; count.textContent = "地図を開いてください"; spacer.style.height = "0px"; rowsHost.replaceChildren(); return; }
    fillSelects(map);
    all = buildTimeline(map);
    const now = map.worldTime ?? { year: 1, month: 1 };
    if (!fYear.value) fYear.value = now.year; if (!fMonth.value) fMonth.value = now.month;
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
      row.append(el("span", "tl-date-col", e.date ?? "日付不明"), el("span", "tl-title", e.title), el("span", "tl-detail", e.detail ?? ""));
      row.addEventListener("click", () => jump(e));
      frag.append(row);
    }
    rowsHost.replaceChildren(frag);
  }
  scroller.addEventListener("scroll", paint);
  for (const c of [kindSel, stateSel, fromIn, toIn]) c.addEventListener("change", apply);
  textIn.addEventListener("input", apply);
  reset.addEventListener("click", () => { kindSel.value = ""; stateSel.value = ""; fromIn.value = ""; toIn.value = ""; textIn.value = ""; apply(); });

  fGo.addEventListener("click", () => {
    const map = store.getState().map; if (!map) return;
    const date = Number.isFinite(+fYear.value) && Number.isFinite(+fMonth.value) && fYear.value !== "" && fMonth.value !== "" ? { year: Math.trunc(+fYear.value), month: Math.min(12, Math.max(1, Math.trunc(+fMonth.value))) } : undefined;
    let cell;
    if (fHereBox.checked) { const [wx, wy] = viewport.toWorld(viewport.screenWidth / 2, viewport.screenHeight / 2); const c = cellIndexOf(map).find(wx, wy); if (c != null && c >= 0) cell = c; }
    editActions.addHistoryEvent({ title: fTitle.value, detail: fDetail.value, date, cell, states: fState.value ? [+fState.value] : [] });
    if (!store.getState().error) { fTitle.value = ""; fDetail.value = ""; }
  });

  wins.register("timeline", { title: "📜 年表", width: 780, body, onOpen: build });
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type) && wins.isOpen("timeline")) build(); });
  return { build };
}
