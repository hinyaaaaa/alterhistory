// v5.3 UI: 領域の一覧（検索＋絞り込み＋仮想スクロール）。右パネルの上段に出る。
import { h } from "./dom.js";
import { createVList } from "./virtual-list.js";
import { CATEGORIES } from "./categories.js";

const FILTERS = {
  state: { label: "状態", options: [["", "存続中"], ["dead", "滅亡"]] },
  war: { label: "状態", options: [["active", "継続中"], ["", "すべて"], ["ended", "終結"]] }, // 既定は継続中（積もった戦争の中から、まず今のものを見る）
  event: { label: "分類", options: [["", "すべて"], ...CATEGORIES.map((c) => [c.id, c.label])] },
};
// 期間（直近 N 年）。件数が膨大なときに、一覧を現在に近い範囲へ狭める（戦争・出来事）。データは消さない
const RANGES = { war: [["", "全期間"], ["10", "直近10年"], ["100", "直近100年"], ["1000", "直近1000年"]], event: [["", "全期間"], ["10", "直近10年"], ["100", "直近100年"], ["1000", "直近1000年"]] };
const SORTS = { state: [["pop", "人口順"], ["name", "名前順"]] };

export function createEntityList({ adapter, ui, domain, debounceMs = 150 }) {
  const kind = domain.list;
  const saved = ui.get().listFilter[domain.id] ?? {};
  let query = saved.query ?? "", filter = saved.filter ?? (kind === "war" ? "active" : ""), sort = saved.sort ?? "";
  let entity = saved.entity ?? "", entityLabel = saved.entityLabel ?? "", range = saved.range ?? "", pollTimer = 0;
  let memoKey = "", memo = null;

  const search = h("input", { type: "search", class: "v53-input", placeholder: `${domain.label}を検索`, "aria-label": `${domain.label}を検索`, value: query });
  const fcfg = FILTERS[kind];
  const fsel = fcfg ? h("select", { class: "v53-select", "aria-label": fcfg.label }, fcfg.options.map(([v, t]) => h("option", { value: v, selected: v === filter }, t))) : null;
  const scfg = SORTS[kind];
  const ssel = scfg ? h("select", { class: "v53-select", "aria-label": "並び順" }, scfg.map(([v, t]) => h("option", { value: v, selected: v === sort }, t))) : null;
  const rcfg = RANGES[kind];
  const rsel = rcfg ? h("select", { class: "v53-select", "aria-label": "期間" }, rcfg.map(([v, t]) => h("option", { value: v, selected: v === range }, t))) : null;
  const chip = h("p", { class: "v53-entity-chip", hidden: true });
  const count = h("p", { class: "v53-list-count", "aria-live": "polite" });
  const note = h("p", { class: "v53-hint", hidden: true });

  function page(offset, limit) {
    const m = adapter.meta();
    const key = `${kind}|${query}|${filter}|${sort}|${entity}|${range}|${offset}|${limit}|${m.now}|${m.view}|${m.events}|${m.states}|${m.wars}`;
    if (key === memoKey && memo) return memo;
    const res = adapter.list(kind, { query, filter, sort, offset, limit, entity, range });
    if (res.pending) { memoKey = ""; memo = null; clearTimeout(pollTimer); pollTimer = setTimeout(() => vl.refresh(), 40); } // 検索が途中: 続きを進めて取り直す（画面は固まらない）
    else { memoKey = key; memo = res; }
    count.textContent = res.unsupported ? "" : res.pending ? `検索中… ここまで ${res.total.toLocaleString("ja-JP")} 件` : `全 ${res.total.toLocaleString("ja-JP")} 件`;
    note.hidden = !res.unsupported;
    if (res.unsupported) note.textContent = `${domain.label}の情報は、この版ではまだ本体に接続されていません。`;
    return res;
  }
  const vl = createVList({
    label: `${domain.label}の一覧`, rowHeight: 52,
    getPage: page,
    renderRow: (r) => h("div", { class: `v53-row${r.tone ? " tone-" + r.tone : ""}`, tabindex: -1 },
      h("div", { class: "v53-row-main" }, h("b", { text: r.title }), r.sub ? h("span", { text: r.sub }) : null),
      r.tag ? h("span", { class: "v53-chip", text: r.tag }) : null),
    onPick: (r) => ui.select({ kind, id: r.id }, { domain: domain.id }),
    empty: `${domain.label}はまだありません`,
  });

  let timer = 0;
  const showChip = () => {
    chip.hidden = !entity; chip.replaceChildren();
    if (!entity) return;
    chip.append(h("span", { text: `${entityLabel || entity} に関わるものだけ` }), h("button", { type: "button", class: "v53-btn v53-btn-sm", text: "解除 ×", onclick: () => { entity = ""; entityLabel = ""; apply(); } }));
  };
  const apply = () => { memoKey = ""; ui.setFilter(domain.id, { query, filter, sort, entity, entityLabel, range }); showChip(); vl.reset(); };
  rsel?.addEventListener("change", () => { range = rsel.value; apply(); });
  // 詳細の「一覧で開く」など、外から絞り込み（国家・戦争）が指定されたら追従する
  const off = ui.subscribe((s) => { const f = s.listFilter[domain.id] ?? {}; if ((f.entity ?? "") !== entity) { entity = f.entity ?? ""; entityLabel = f.entityLabel ?? ""; showChip(); memoKey = ""; vl.reset(); } });
  search.addEventListener("input", () => { query = search.value; clearTimeout(timer); if (debounceMs <= 0) apply(); else timer = setTimeout(apply, debounceMs); });
  fsel?.addEventListener("change", () => { filter = fsel.value; apply(); });
  ssel?.addEventListener("change", () => { sort = ssel.value; apply(); });

  const el = h("section", { class: "v53-list", "aria-label": `${domain.label}の一覧` },
    h("div", { class: "v53-list-tools" }, search, fsel, rsel, ssel), chip, count, note, vl.el);
  return {
    el, vlist: vl,
    refresh() { memoKey = ""; vl.refresh(); },
    mounted() { showChip(); vl.refresh(); },
    dispose() { clearTimeout(timer); clearTimeout(pollTimer); off(); },
  };
}
