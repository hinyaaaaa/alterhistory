// 「設定」メニューと、戦争・外交・軍事のウィンドウを組み立てる。
//   戦争      : 宣戦布告・召集する部隊・戦闘の記録・講和（wars-panel.js）
//   外交・同盟: 国どうしの関係の一覧表と、同盟の管理（editor-panel.js の外交表 + alliances-panel.js）
//   軍事      : 国ごとの部隊数・兵種を表で比べ、行を選ぶとその国の部隊を編成できる（military-panel.js）
import { byId } from "./dom.js";
import { initWindows } from "./windows.js";
import { UNIT_TYPES, forcePower, forceHeadcount } from "../core/sim/units.js";
import { regimentsOf } from "../core/sim/military.js";
import { FILL_KEY } from "../app/layers.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;

export function initSettingsWindows({ store, panels, editorPanel, editActions, actions }) {
  const wins = initWindows();
  const noMap = () => el("p", "muted", "地図を開いてください");

  // ---- 戦争 ----
  wins.register("war", { title: "⚔ 戦争", width: 820, body: byId("tab-wars"), onOpen: () => panels.wars.render() });

  // ---- 外交・同盟 ----
  const dipBody = el("div", "dip-body");
  const dipHost = el("div", "dip-host");
  const allyHost = el("div", "editor-section");
  allyHost.append(el("h4", "", "同盟"), byId("tab-alliances"));
  dipBody.append(dipHost, allyHost);
  let focus = null;
  function renderDip() {
    dipHost.replaceChildren();
    const map = store.getState().map;
    if (!map) { dipHost.append(noMap()); return; }
    const states = map.pack.states.filter(isLive);
    if (focus == null || !states.some((s) => s.i === focus)) focus = states[0]?.i ?? null;
    if (focus == null) { dipHost.append(el("p", "muted", "国家がありません")); return; }
    const row = el("div", "state-picker");
    row.append(el("span", "field-label", "関係を設定する国"));
    const sel = document.createElement("select");
    for (const s of states) { const o = document.createElement("option"); o.value = s.i; o.textContent = s.fullName ?? s.name; o.selected = s.i === focus; sel.append(o); }
    sel.addEventListener("change", () => { focus = Number(sel.value); renderDip(); });
    row.append(sel);
    dipHost.append(row, editorPanel.buildDiplomacy(map, focus));
  }
  wins.register("diplomacy", { title: "🤝 外交・同盟", width: 860, body: dipBody, onOpen: () => { renderDip(); panels.alliances.render(); } });

  // ---- 軍事 ----
  const milBody = el("div", "mil-body");
  const overview = el("div", "mil-overview");
  milBody.append(overview, byId("tab-regiments"));
  function renderMil() {
    overview.replaceChildren();
    const map = store.getState().map;
    if (!map) { overview.append(noMap()); return; }
    const states = map.pack.states.filter(isLive);
    const t = el("table", "win-table");
    const head = el("tr"); head.append(el("th", "", "国家"), el("th", "", "部隊"));
    for (const u of UNIT_TYPES) head.append(el("th", "", `${u.icon} ${u.label}`));
    head.append(el("th", "", "総兵員"), el("th", "", "総戦力"));
    t.append(head);
    for (const s of states) {
      const regs = regimentsOf(s), doc = editActions.getDoctrine(s.i);
      const tr = el("tr", `clickable${panels.military.selectedState === s.i ? " active" : ""}`);
      tr.title = "押すと、この国の部隊を下で編成できます";
      tr.append(el("td", "", s.fullName ?? s.name), el("td", "", String(regs.length)));
      let head = 0, power = 0;
      for (const u of UNIT_TYPES) tr.append(el("td", "", regs.reduce((n, r) => n + (r.u?.[u.key] ?? 0), 0).toLocaleString()));
      for (const r of regs) { head += forceHeadcount(r.u); power += forcePower(r.u, doc); }
      tr.append(el("td", "", Math.round(head).toLocaleString()), el("td", "", Math.round(power).toLocaleString()));
      tr.addEventListener("click", () => { panels.military.selectState(s.i); renderMil(); });
      t.append(tr);
    }
    overview.append(t);
  }
  wins.register("military", { title: "🛡 軍事", width: 900, body: milBody, onOpen: () => { renderMil(); panels.military.render(); } });

  // 開いている間は、編集のたびに表を最新にする（戦争・同盟の中身は各パネルが自分で更新する）
  store.subscribe((_s, change) => {
    if (!["replace", "commit", "undo", "redo"].includes(change.type)) return;
    if (wins.isOpen("diplomacy")) renderDip();
    if (wins.isOpen("military")) renderMil();
  });

  // ---- 設定メニュー ----
  const menu = byId("settings-menu");
  menu.addEventListener("click", (e) => {
    const b = e.target instanceof HTMLElement ? e.target.closest("button") : null;
    if (!b) return;
    if (b.dataset.openWin) wins.open(b.dataset.openWin);
    else if (b.dataset.openList) {
      // 国家・文化・宗教・属州の一覧は、左の凡例パネル。その色分けをオンにして開く
      actions.setView({ [FILL_KEY[b.dataset.openList]]: true, legendKind: b.dataset.openList });
      window.dispatchEvent(new Event("request-edit-panel-open"));
    }
    menu.open = false;
  });
  const sync = (s) => menu.classList.toggle("disabled", !s.map);
  store.subscribe(sync); sync(store.getState());
  return wins;
}
