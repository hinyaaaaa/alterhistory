// 年表ウィンドウ（ハブ →「年表」）。
//   ・歴史の出来事を、全件、時系列で見る。種類・国・年で絞り込める。件数は削らない。
//   ・項目を押すと、地図がその場所へ移る。手書きの出来事も足せる。
//   ・件数が多くても重くならないよう、画面に見える行だけを描く（仮想スクロール）。行の数は減らさない。
import { buildTimeline } from "../io/chronicle.js";
import { cellIndexOf } from "../core/spatial.js";
import { el } from "./kit.js";
import { buildStateHistory } from "../io/state-history.js";
import { causeChain } from "../core/edit/lineage.js";
import { TEMP_ZONE_TYPES, ZONE_TYPE_BY_ID, ZONE_PERIODS, findZoneByZid } from "../core/edit/zones.js";

const ROW_H = 58; // 1行の高さ（px）。固定にして、見える範囲を計算で出す
const BUFFER = 8;

/** 出来事の種類（絞り込み用）。type の接頭辞・完全一致から決める */
export const TIMELINE_KINDS = [
  { key: "war", label: "戦争・戦闘", test: (t) => /^(war-|battle|covert-op|nuclear-op)/.test(t) },
  { key: "diplomacy", label: "外交・同盟", test: (t) => /^(diplomacy|alliance-)/.test(t) },
  { key: "state", label: "国家の変動", test: (t) => /^(state-merged|independence|sovereignty|created-state|removed-state|rename-state|capital|tech|doctrine|origin-state)/.test(t) },
  { key: "culture", label: "文化・宗教", test: (t) => /(culture|religion)/.test(t) },
  { key: "place", label: "都市・地図", test: (t) => /(burg|province|zone|marker)/.test(t) },
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
  // ---- ＋ 出来事を記録（疫病・災害）: 種類を選ぶ → 範囲を選ぶ → 期間を選ぶ → 確定。確定するまで何も残さない ----
  const recBox = el("details", "tl-add tl-rec");
  recBox.append(el("summary", "", "＋ 出来事を記録（疫病・災害）"));
  const rType = el("select"); rType.title = "種類";
  for (const id of TEMP_ZONE_TYPES) rType.append(new Option(ZONE_TYPE_BY_ID[id].label, id));
  const rScope = el("select"); rScope.title = "範囲";
  rScope.append(new Option("国全体", "state"), new Option("属州を選ぶ", "provinces"));
  const rState = el("select"); rState.title = "国";
  const rProvs = el("div", "tl-rec-provs"); rProvs.hidden = true;
  const rPeriod = el("select"); rPeriod.title = "続く期間";
  for (const p of ZONE_PERIODS) rPeriod.append(new Option(p.label, String(p.months)));
  rPeriod.value = "12";
  const rGo = el("button", "primary", "記録する"); rGo.type = "button";
  recBox.append(rType, rScope, rState, rProvs, rPeriod, rGo);
  function fillRec(map) {
    const prev = rState.value;
    const states = live(map).filter((s) => !s.removed);
    rState.replaceChildren(...states.map((s) => new Option(nameOf(s), String(s.i)))); if (prev) rState.value = prev;
    fillProvs(map);
  }
  function fillProvs(map) {
    const sid = +rState.value; rProvs.replaceChildren();
    for (const p of map.pack.provinces) if (p && !p.removed && p.i > 0 && p.state === sid) {
      const lab = el("label"); const cb = el("input"); cb.type = "checkbox"; cb.value = String(p.i); lab.append(cb, document.createTextNode(" " + (p.fullName ?? p.name))); rProvs.append(lab);
    }
    if (!rProvs.children.length) rProvs.append(el("span", "hint", "この国には属州がありません"));
  }
  rScope.addEventListener("change", () => { rProvs.hidden = rScope.value !== "provinces"; });
  rState.addEventListener("change", () => { const m = store.getState().map; if (m) fillProvs(m); });
  rGo.addEventListener("click", () => {
    const map = store.getState().map; if (!map) return;
    const scope = rScope.value === "provinces"
      ? { kind: "provinces", ids: [...rProvs.querySelectorAll("input:checked")].map((c) => +c.value) }
      : { kind: "state", id: +rState.value };
    const zid = editActions.recordZoneEvent({ type: rType.value, scope, months: +rPeriod.value });
    if (zid) { actions?.setView({ zoneFocus: null }); recBox.open = false; }
  });
  body.append(filters, count, scroller, recBox, addBox);

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
    fillSelects(map); fillRec(map);
    all = buildTimeline(map);
    const now = map.worldTime ?? { year: 1, month: 1 };
    if (!fYear.value) fYear.value = now.year; if (!fMonth.value) fMonth.value = now.month;
    apply();
  }
  // 期間で絞る・国史として書き出し（窓は増やさない）
  const hist = el("button", "", "国史として書き出し（Markdown）"); hist.type = "button"; hist.title = "「国」で選んだ国の歴史を .md に書き出す（文章は自動生成）";
  hist.addEventListener("click", () => {
    const map = store.getState().map; const id = +stateSel.value; if (!map || !id) { count.textContent = "「国」を選んでから書き出してください"; return; }
    const md = buildStateHistory(map, id, { from: fromIn.value === "" ? null : +fromIn.value, to: toIn.value === "" ? null : +toIn.value });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" })); a.download = `${(map.pack.states[id].name || "国")}の歴史.md`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  filters.append(hist);
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

  fGo.addEventListener("click", () => {
    const map = store.getState().map; if (!map) return;
    const date = Number.isFinite(+fYear.value) && Number.isFinite(+fMonth.value) && fYear.value !== "" && fMonth.value !== "" ? { year: Math.trunc(+fYear.value), month: Math.min(12, Math.max(1, Math.trunc(+fMonth.value))) } : undefined;
    let cell;
    if (fHereBox.checked) { const [wx, wy] = viewport.toWorld(viewport.screenWidth / 2, viewport.screenHeight / 2); const c = cellIndexOf(map).find(wx, wy); if (c != null && c >= 0) cell = c; }
    editActions.addHistoryEvent({ title: fTitle.value, detail: fDetail.value, date, cell, states: fState.value ? [+fState.value] : [] });
    if (!store.getState().error) { fTitle.value = ""; fDetail.value = ""; }
  });

  wins.register("timeline", { title: "年表", width: 780, body, onOpen: build, onClose: () => { if (store.getState().view.zoneFocus) actions?.setView({ zoneFocus: null }); } });
  store.subscribe((_s, ch) => { if (["replace", "commit", "undo", "redo"].includes(ch.type) && wins.isOpen("timeline")) build(); });
  return { build };
}
