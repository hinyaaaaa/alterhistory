// 経済・交易ビュー：国ごとの財政と、産物・需給・貿易相手を見る／税率と国庫を直す。
// 「見るだけ」が既定。税率・国庫は、開いた国のカードの中でだけ変えられる（段階的開示）。

import { militaryBurden } from "../core/sim/world.js";
import { el, btn, swatch, slider, isLive } from "./kit.js";

const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("ja-JP");
const signed = (v) => (v > 0.05 ? `+${fmt(v)}` : v < -0.05 ? `${fmt(v)}` : "±0");

export function createEconomyView({ store, editActions, builderActions }) {
  let selected = null; // 開いている国のID

  function summary(eco, states) {
    const total = eco.trade.deals.reduce((a, d) => a + d.value, 0);
    const box = el("div", "b-eco-sum");
    box.append(
      stat("取引", `${eco.trade.deals.length}件`),
      stat("取引額", fmt(total)),
      stat("国の数", `${states.length}`),
    );
    return box;
  }
  const stat = (k, v) => { const d = el("div", "b-stat"); d.append(el("div", "b-stat-v", v), el("div", "b-mini", k)); return d; };

  function stateRow(map, eco, s) {
    const f = editActions.getFinance(s.i);
    const info = eco.trade.states.get(s.i);
    const card = el("div", `b-card${selected === s.i ? " active" : ""}`);
    const row = el("div", "b-row b-click");
    row.append(swatch(s.color));
    const main = el("div", "b-row-main");
    main.append(el("div", "b-row-name", s.fullName ?? s.name));
    const rev = eco.revenue(s.i);
    const burden = militaryBurden(s);
    const upkeep = burden > 0 ? `（軍事費 ${Math.round(burden * 100)}% → 手取り +${fmt(rev * (1 - burden))}）` : "";
    main.append(el("div", "b-row-meta", `国庫 ${fmt(f.treasury)}・年収 +${fmt(rev)}${upkeep}・貿易 ${signed(info.exportValue - info.importValue)}`));
    row.append(main, el("span", "b-chev", selected === s.i ? "▴" : "▾"));
    row.addEventListener("click", () => {
      selected = selected === s.i ? null : s.i;
      if (selected == null) builderActions.showTradeLines(null);
      render();
    });
    card.append(row);
    if (selected === s.i) card.append(detail(map, eco, s, f, info));
    return card;
  }

  function detail(map, eco, s, f, info) {
    const d = el("div", "b-details");

    // 税率（つまみを離したときに確定）
    const rates = el("div", "b-tax");
    rates.append(
      slider({ label: "売上税（輸出にかかる）", min: 0, max: 0.6, step: 0.01, value: f.salesTax, format: (v) => `${Math.round(v * 100)}%`, onCommit: (v) => editActions.setFinance(s.i, { salesTax: v }) }),
      slider({ label: "人頭税（人口にかかる）", min: 0, max: 0.5, step: 0.01, value: f.pollTax, format: (v) => `${Math.round(v * 100)}%`, onCommit: (v) => editActions.setFinance(s.i, { pollTax: v }) }),
    );
    d.append(rates);
    d.append(el("p", "b-hint", `年収の見込み: 人頭税 ${fmt(info.pollTaxRevenue)} + 輸出の売上税 ${fmt(info.salesTaxRevenue)} = ${fmt(eco.revenue(s.i))}`));

    const tre = el("label", "b-field");
    tre.append(el("span", "b-mini", "国庫（直接書き換えられます）"));
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = "0"; inp.step = "1"; inp.value = String(Math.round(f.treasury * 100) / 100);
    inp.addEventListener("change", () => editActions.setFinance(s.i, { treasury: inp.value }));
    tre.append(inp);
    d.append(tre);

    // 産物・需要・差
    const tbl = el("div", "b-goods");
    const head = el("div", "b-goods-row b-goods-head");
    head.append(el("span", "", "産物"), el("span", "", "産"), el("span", "", "需"), el("span", "", "差"));
    tbl.append(head);
    for (const g of eco.goods) {
      const p = info.production[g.id], dm = info.demand[g.id], net = info.net[g.id];
      if (p < 0.05 && dm < 0.05) continue;
      const r = el("div", "b-goods-row");
      const diff = el("span", net >= 0 ? "pos" : "neg", signed(net));
      r.append(el("span", "", `${g.icon} ${g.label}`), el("span", "", fmt(p)), el("span", "", fmt(dm)), diff);
      tbl.append(r);
    }
    d.append(tbl);

    // 貿易相手
    const partners = eco.partners(s.i);
    d.append(el("h5", "b-sub", "貿易相手"));
    if (!partners.length) d.append(el("p", "b-hint", "取引相手がいません（戦争中・孤立・余剰なし）。"));
    for (const p of partners.slice(0, 5)) {
      const ps = map.pack.states[p.partner];
      const r = el("div", "b-partner");
      r.append(swatch(ps.color, false), el("span", "b-partner-name", ps.name),
        el("span", "b-mini", `輸出 ${fmt(p.exportValue)} / 輸入 ${fmt(p.importValue)}`),
        el("span", "b-partner-goods", p.goods.map((id) => eco.goods.find((g) => g.id === id)?.icon ?? "").join("")));
      d.append(r);
    }
    d.append(el("p", "b-hint", "地図の金の線は輸出超過、青緑の線は輸入超過の相手です。"));
    return d;
  }

  function render(container) {
    if (container) render.container = container;
    const c = render.container;
    if (!c) return;
    c.replaceChildren();
    const map = store.getState().map;
    if (!map) { c.append(el("p", "b-hint", "地図を開いてください。")); return; }
    const eco = builderActions.economy();
    const states = map.pack.states.filter(isLive).sort((a, b) => eco.revenue(b.i) - eco.revenue(a.i));
    if (selected != null && !states.some((s) => s.i === selected)) selected = null;
    // 税率などを変えると取引が変わるので、開いている国の貿易線も描き直す（表示だけの変更で、再描画は起きない）
    if (selected != null) builderActions.showTradeLines(selected, eco);
    c.append(el("p", "b-lead", "国の財政と交易を見ます。年が変わるたびに、人頭税と輸出の売上税から軍の維持費を引いた分が国庫にたまります。"));
    c.append(summary(eco, states));
    const list = el("div", "b-cards");
    for (const s of states) list.append(stateRow(map, eco, s));
    c.append(list);
    c.append(el("p", "b-hint", "産物は地図（バイオーム・人口・海岸）から計算した簡易モデルです。戦争中の国どうしは取引しません。"));
  }

  return { render, leave() { selected = null; builderActions.showTradeLines(null); } };
}
