// v5.3 UI: 右の文脈パネル。選択対象があれば詳細、無ければ左ハブで選んだ領域の画面（一覧・世界・出力・設定）を出す。
//   ・対象を選ぶと詳細（概要・状態・関連・出来事・操作）。「戻る」で直前の対象、無ければ一覧へ
//   ・過去閲覧中は読み取り専用（操作ボタンは無効＋理由）。状態の数値も、見ている月のもの
import { h, clear } from "./dom.js";
import { domainById } from "./domains.js";
import { createEntityList } from "./entity-list.js";
import { createExportPanel } from "./export-panel.js";
import { renderDetail } from "./views/detail-view.js";
import { renderWorldView } from "./views/world-view.js";
import { renderSettingsView } from "./views/settings-view.js";

const KIND_LABEL = { state: "国家", war: "戦争", event: "出来事", treaty: "条約", economy: "経済", tech: "技術", culture: "文化・宗教", magic: "魔法" };

export function createContextPanel({ adapter, ui, download }) {
  const back = h("button", { type: "button", class: "v53-iconbtn", "aria-label": "戻る", title: "戻る", text: "←" });
  const kicker = h("small", { class: "v53-kicker" });
  const title = h("h2", { class: "v53-panel-title" });
  const tag = h("span", { class: "v53-chip", hidden: true });
  const close = h("button", { type: "button", class: "v53-iconbtn", "aria-label": "パネルを閉じる", title: "パネルを閉じる", text: "×" });
  const head = h("header", { class: "v53-panel-head" }, back, h("div", { class: "v53-panel-headtext" }, kicker, title, tag), close);
  const body = h("div", { class: "v53-panel-body" });
  const foot = h("footer", { class: "v53-panel-foot", hidden: true }, h("button", { type: "button", class: "v53-btn", dataset: { act: "chronicle" }, text: "年代記を開く", onclick: () => ui.set({ domain: "history", selection: null, trail: [], panelOpen: true }) }));
  const el = h("aside", { class: "v53-panel v53-dock", "aria-label": "詳細パネル" }, head, body, foot);

  back.addEventListener("click", () => { if (!ui.back()) ui.select(null); });
  close.addEventListener("click", () => ui.set({ panelOpen: false }));

  let cur = { key: "", list: null, exp: null };
  const disposeCur = () => { cur.list?.dispose?.(); cur.exp?.dispose?.(); cur = { key: "", list: null, exp: null }; };

  function renderDetailBody() {
    const s = ui.get().selection, m = adapter.meta();
    const d = s ? adapter.detail(s.kind, s.id) : null;
    clear(body); foot.hidden = !d;
    kicker.textContent = d ? `選択中 ・ ${KIND_LABEL[s.kind] ?? s.kind}` : "";
    if (!d) { title.textContent = "見つかりません"; tag.hidden = true; body.append(h("p", { class: "v53-empty", text: "この対象は、見ている時点には存在しません。" })); return; }
    title.textContent = d.title; tag.hidden = !d.tag; tag.textContent = d.tag ?? ""; tag.className = `v53-chip${d.tone ? " tone-" + d.tone : ""}`;
    body.append(h("p", { class: "v53-subtitle", text: d.subtitle ?? "" }), renderDetail(d, { adapter, ui, past: m.past }));
  }

  function render(force = false) {
    const s = ui.get(), sel = s.selection;
    el.dataset.open = String(s.panelOpen);
    const dom = domainById(s.domain) ?? domainById("world");
    const key = sel ? `sel:${sel.kind}:${sel.id}` : `dom:${dom.id}`;
    back.hidden = !sel;
    if (sel) {
      if (key !== cur.key) { disposeCur(); cur.key = key; }
      renderDetailBody(); return;
    }
    if (key === cur.key && !force) { cur.list?.refresh(); return; }
    disposeCur(); cur.key = key; clear(body);
    title.textContent = dom.label; tag.hidden = true; kicker.textContent = dom.tip ?? ""; foot.hidden = true;
    if (dom.view === "world") body.append(renderWorldView({ adapter, ui }));
    else if (dom.view === "settings") body.append(renderSettingsView({ ui }));
    else if (dom.view === "export") { cur.exp = createExportPanel({ adapter, ui, download }); body.append(cur.exp.el); }
    else if (dom.list) { cur.list = createEntityList({ adapter, ui, domain: dom }); body.append(cur.list.el); cur.list.mounted(); }
  }

  // 世界・戦争の変化は毎月来る。表示中の内容だけを軽く描き直す（一覧は表示範囲だけ・世界は小さな概要だけ）
  let pend = 0, lastView = adapter.meta().view;
  const onAdapter = () => {
    // 閲覧する月（過去/現在）が変わったときは、読み取り専用の表示・操作の無効化を遅らせず、すぐに描き直す
    const v = adapter.meta().view; if (v !== lastView) { lastView = v; clearTimeout(pend); pend = 0; render(true); return; }
    if (pend) return; pend = setTimeout(() => { pend = 0; const s = ui.get(); if (!s.selection && domainById(s.domain)?.view === "world") render(true); else if (!s.selection && domainById(s.domain)?.view) return; else render(); }, 250); };
  const u1 = ui.subscribe((s, prev) => { if (s.domain !== prev.domain || s.selection !== prev.selection || s.panelOpen !== prev.panelOpen) render(); });
  const u2 = adapter.subscribe(onAdapter);
  render();
  return { el, render, dispose() { u1(); u2(); clearTimeout(pend); disposeCur(); } };
}
