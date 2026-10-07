// ※ リポジトリのソースが古かったため、ビルド済みの dist/app.js から復元したファイルです（動作は同じ。コメントは失われています）。
import { byId } from "./dom.js";
import { initWindows } from "./windows.js";
import { UNIT_TYPES, forcePower, forceHeadcount } from "../core/sim/units.js";
import { regimentsOf } from "../core/sim/military.js";
import { FILL_KEY } from "../app/layers.js";
import { BALANCE, BALANCE_META, BALANCE_DEFAULTS, setBalance, resetBalance } from "../core/sim/balance.js";

const el = (tag, cls, text2) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text2 != null) e.textContent = text2;
  return e;
};
const isLive = (e) => !!e && typeof e === "object" && !e.removed && e.i > 0;
export function initSettingsWindows({ store, panels, editorPanel, editActions, actions, warOutcome }) {
  const wins = initWindows();
  const noMap = () => el("p", "muted", "地図を開いてください");
  wins.register("war", { title: "⚔ 戦争", width: 820, body: byId("tab-wars"), onOpen: () => panels.wars.render() });
  const dipBody = el("div", "dip-body");
  const dipHost = el("div", "dip-host");
  const allyHost = el("div", "editor-section");
  allyHost.append(el("h4", "", "同盟"), byId("tab-alliances"));
  dipBody.append(dipHost, allyHost);
  let focus = null;
  function renderDip() {
    dipHost.replaceChildren();
    const map = store.getState().map;
    if (!map) {
      dipHost.append(noMap());
      return;
    }
    const states = map.pack.states.filter(isLive);
    if (focus == null || !states.some((s) => s.i === focus)) focus = states[0]?.i ?? null;
    if (focus == null) {
      dipHost.append(el("p", "muted", "国家がありません"));
      return;
    }
    const row = el("div", "state-picker");
    row.append(el("span", "field-label", "関係を設定する国"));
    const sel = document.createElement("select");
    for (const s of states) {
      const o = document.createElement("option");
      o.value = s.i;
      o.textContent = s.fullName ?? s.name;
      o.selected = s.i === focus;
      sel.append(o);
    }
    sel.addEventListener("change", () => {
      focus = Number(sel.value);
      renderDip();
    });
    row.append(sel);
    dipHost.append(row, editorPanel.buildDiplomacy(map, focus));
  }
  wins.register("diplomacy", { title: "🤝 外交・同盟", width: 860, body: dipBody, onOpen: () => {
    renderDip();
    panels.alliances.render();
  } });
  const milBody = el("div", "mil-body");
  const overview = el("div", "mil-overview");
  milBody.append(overview, byId("tab-regiments"));
  function renderMil() {
    overview.replaceChildren();
    const map = store.getState().map;
    if (!map) {
      overview.append(noMap());
      return;
    }
    const states = map.pack.states.filter(isLive);
    const t = el("table", "win-table");
    const head = el("tr");
    head.append(el("th", "", "国家"), el("th", "", "部隊"));
    for (const u of UNIT_TYPES) head.append(el("th", "", `${u.icon} ${u.label}`));
    head.append(el("th", "", "総兵員"), el("th", "", "総戦力"));
    t.append(head);
    for (const s of states) {
      const regs = regimentsOf(s), doc = editActions.getDoctrine(s.i);
      const tr = el("tr", `clickable${panels.military.selectedState === s.i ? " active" : ""}`);
      tr.title = "押すと、この国の部隊を下で編成できます";
      tr.append(el("td", "", s.fullName ?? s.name), el("td", "", String(regs.length)));
      let head2 = 0, power = 0;
      for (const u of UNIT_TYPES) tr.append(el("td", "", regs.reduce((n, r) => n + (r.u?.[u.key] ?? 0), 0).toLocaleString()));
      for (const r of regs) {
        head2 += forceHeadcount(r.u);
        power += forcePower(r.u, doc);
      }
      tr.append(el("td", "", Math.round(head2).toLocaleString()), el("td", "", Math.round(power).toLocaleString()));
      tr.addEventListener("click", () => {
        panels.military.selectState(s.i);
        renderMil();
      });
      t.append(tr);
    }
    overview.append(t);
  }
  wins.register("military", { title: "🛡 軍事", width: 900, body: milBody, onOpen: () => {
    renderMil();
    panels.military.render();
  } });
  // ⚖ バランス調整: 経済・戦争の数値をコードを直さずに変える。この端末のブラウザに保存する（地図ファイルには入らない）
  const BAL_KEY = "alterhistory.balance";
  try { const saved = JSON.parse(localStorage.getItem(BAL_KEY) ?? "null"); if (saved) setBalance(saved); } catch { /* 保存が使えない環境では既定値のまま */ }
  const balBody = el("div", "balance-body");
  function saveBalance() { try { localStorage.setItem(BAL_KEY, JSON.stringify(BALANCE)); } catch { /* 保存できなくても、このセッションでは有効 */ } }
  function renderBalance() {
    balBody.replaceChildren(el("p", "hint", "経済・戦争の数値を調整します。変えるとすぐ反映され、この端末のブラウザに保存されます（地図ファイルには入りません）。"));
    const t = el("table", "win-table");
    for (const m of BALANCE_META) {
      const tr = el("tr");
      const th = el("th", "", m.label);
      th.title = m.desc;
      const input = document.createElement("input");
      input.type = "number"; input.min = m.min; input.max = m.max; input.step = m.step; input.value = BALANCE[m.key];
      input.addEventListener("change", () => { setBalance({ [m.key]: input.value }); input.value = BALANCE[m.key]; saveBalance(); });
      const td = el("td"); td.append(input);
      tr.append(th, td, el("td", "muted", `既定 ${BALANCE_DEFAULTS[m.key]}`), el("td", "hint", m.desc));
      t.append(tr);
    }
    const reset = el("button", "", "すべて既定値に戻す");
    reset.type = "button";
    reset.addEventListener("click", () => { resetBalance(); saveBalance(); renderBalance(); });
    balBody.append(t, reset);
  }
  wins.register("balance", { title: "⚖ バランス調整", width: 860, body: balBody, onOpen: renderBalance });
  if (warOutcome) wins.register("treaty", { title: "📜 講和条約", width: 920, body: warOutcome.treatyBody, onOpen: () => warOutcome.renderTreaty(), onClose: () => warOutcome.clearHighlight() });
  if (warOutcome) wins.register("currency", { title: "💱 通貨・為替", width: 900, body: warOutcome.currencyBody, onOpen: () => warOutcome.renderCurrency() });
  store.subscribe((_s, change) => {
    if (!["replace", "commit", "undo", "redo"].includes(change.type)) return;
    if (wins.isOpen("diplomacy")) renderDip();
    if (wins.isOpen("military")) renderMil();
  });
  const menu = byId("settings-menu");
  menu.addEventListener("click", (e) => {
    const b = e.target instanceof HTMLElement ? e.target.closest("button") : null;
    if (!b) return;
    if (b.dataset.openWin) wins.open(b.dataset.openWin);
    else if (b.dataset.click) byId(b.dataset.click)?.click();
    menu.open = false;
  });
  const sync = (s) => menu.classList.toggle("disabled", !s.map);
  store.subscribe(sync);
  sync(store.getState());
  return wins;
}
