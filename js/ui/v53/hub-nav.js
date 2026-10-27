// v5.3 UI: 左レール（幅 56px・1 文字アイコン）。参考モック「ドック方式」に合わせる。
// 世界・国家・外交・軍事（戦争）・内政経済・技術・文化宗教・魔法・歴史研究 | 出力・設定。似た入口を散らさない（指示書 5.1）。
// ※ モックは 8 カテゴリ固定＋魔法は「技術・魔法」へ統合（案）。統合する場合は domains.js から magic を外し tech の一覧に含めるだけ。
import { h } from "./dom.js";
import { DOMAINS, KIND_DOMAIN } from "./domains.js";

export function createHubNav({ ui, adapter }) {
  const buttons = new Map(), badges = new Map();
  const mk = (d) => {
    const badge = d.badge ? h("em", { class: "v53-badge", hidden: true }) : null;
    if (badge) badges.set(d.badge, badge);
    const b = h("button", { type: "button", class: "v53-ri", dataset: { domain: d.id }, title: `${d.label} — ${d.tip}`, "aria-label": d.label }, h("span", { "aria-hidden": "true", text: d.glyph }), badge);
    b.addEventListener("click", () => ui.set({ domain: d.id, selection: null, trail: [], panelOpen: true, startFlow: false }));
    buttons.set(d.id, b); return b;
  };
  const main = DOMAINS.filter((d) => d.id !== "export" && d.id !== "settings").map(mk);
  const util = DOMAINS.filter((d) => d.id === "export" || d.id === "settings").map(mk);
  const el = h("nav", { class: "v53-rail", "aria-label": "領域" }, h("div", { class: "v53-logo", "aria-hidden": "true", text: "AH" }), ...main, h("span", { class: "v53-rail-gap" }), ...util);

  function sync() {
    const s = ui.get();
    const active = s.selection ? (KIND_DOMAIN[s.selection.kind] ?? s.domain) : s.domain;
    for (const [id, b] of buttons) { const on = id === active && !s.startFlow; b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
    const m = adapter.meta(), w = badges.get("wars");
    if (w) { w.hidden = !m.wars; w.textContent = String(m.wars); }
  }
  ui.subscribe(sync); adapter.subscribe(sync); sync();
  return { el, sync };
}
