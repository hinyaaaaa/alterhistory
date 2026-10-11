import { el } from "./kit.js";
// 経済・貿易：ハブから開く独立ウィンドウ。
// （以前は「歴史をつくる」パネルのタブだった。ボタンを増やさず、ほかの設定ウィンドウと同じ開き方にそろえた）
// 中身は economy-view.js が、渡された入れ物に描く。地図が変わったら描き直す。


export function initWorkWindows({ store, wins, views, extras = {} }) {
  const hosts = {};
  const defs = { economy: ["経済", 640] };
  function render(key) {
    const host = hosts[key];
    host.replaceChildren();
    if (!store.getState().map) { host.append(el("p", "muted", "地図を開いてください")); return; }
    views[key].render(host);
    // 経済の窓に統合した節（通貨・為替）。窓を増やさず、縦に並べた節として下に置く
    for (const x of extras[key] ?? []) { const sec = el("section", "work-extra"); sec.append(el("h4", "", x.title), x.body); host.append(sec); x.render?.(); }
  }
  for (const [key, [title, width]] of Object.entries(defs)) {
    if (!views[key]) continue;
    hosts[key] = el("div", `work-host b-modebody work-${key}`);
    wins.register(key, { title, width, body: hosts[key], onOpen: () => render(key), onClose: () => { views[key].leave?.(); hosts[key].replaceChildren(); } });
  }
  let scheduled = false;
  store.subscribe((_s, change) => {
    if (change.type === "replace") for (const key of Object.keys(hosts)) { views[key].leave?.(); if (wins.isOpen(key)) render(key); }
    if (!["commit", "undo", "redo"].includes(change.type)) return; // ブラシ中(batch)や表示だけの更新では描き直さない（入力中の欄を壊さない）
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; for (const key of Object.keys(hosts)) if (wins.isOpen(key)) render(key); });
  });
}
