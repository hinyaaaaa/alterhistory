// 初期集団を選ぶパネル。世界ができて、まだ開始集団が決まっていない間だけ、地図の下に出る。
// 「地図を作る → 初期集団を選ぶ → 歴史が始まる」の流れの 2 段目で、別の画面ではなく、メインの地図の上で行う。
import { el, btn } from "./kit.js";
import { byId } from "./dom.js";
import { alertDialog } from "./dialogs.js";
import { needsStartGroup } from "../app/group-actions.js";
import { describeCell } from "../app/describe-cell.js";

const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("ja-JP", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");

export function initGroupsPanel({ store, actions, viewport, renderer, editMode }) {
  const panel = el("section", "groups-panel"); panel.id = "groups-panel"; panel.hidden = true; panel.setAttribute("aria-label", "初期集団を選ぶ");
  byId("stage").append(panel);
  let placing = false, lastKey = "";

  function render(s) {
    const show = needsStartGroup(s) && !s.busy;
    panel.hidden = !show; if (!show) { lastKey = ""; return; }
    const w = s.map.world, sel = s.groups?.selected ?? null, pops = w.entities.populations;
    const key = `${s.map.rev.places}:${sel}:${pops.length}:${placing}`; if (key === lastKey) return; lastKey = key;
    panel.replaceChildren(el("h4", null, "初期集団を選ぶ"), el("p", "hint", "ここから歴史が始まります。候補は、肥沃で、海・川に近く、互いに離れた場所に置かれています。地図の丸印の番号か、下の一覧で選びます。"));
    const list = el("div", "world-groups");
    for (const p of pops) {
      const d = describeCell(w, p.cell), row = el("button", "world-group" + (p.id === sel ? " on" : ""), ""); row.type = "button"; row.dataset.group = String(p.id);
      row.append(el("b", null, `#${p.id}`), el("span", null, `${fmt(d.lat, 1)}°, ${fmt(d.lon, 1)}° ・ 人口 ${p.size}`), el("span", null, `${d.biome}・${fmt(d.temp, 0)}℃・肥沃 ${fmt(d.fertility, 2)}`), el("span", null, [d.river ? "川" : "", d.coastDist <= 2 ? "海辺" : "", ...d.resources.slice(0, 3)].filter(Boolean).join("・") || "—"));
      row.addEventListener("click", () => { actions.selectGroup(p.id); const pt = s.map.geometry.pack.p[p.cell]; viewport.centerOn(pt[0], pt[1], Math.max(viewport.k, viewport.fitK * 3)); renderer.requestRender(); });
      list.append(row);
    }
    const acts = el("div", "world-acts");
    acts.append(btn("", "別の候補を提案", "同じ世界のまま、候補を置き直す", () => actions.proposeGroups()),
      btn(placing ? "primary" : "", placing ? "地図をクリック…（Esc で中止）" : "手動で置く", "地図の好きな場所に集団を置く（居住できる場所だけ）", () => {
        if (placing) { editMode.cancelPick(); return; }
        placing = true; lastKey = ""; render(store.getState());
        editMode.pickCell((cell) => { placing = false; if (cell != null) { const r = actions.placeGroup(cell); if (!r.ok) alertDialog(r.reason); } lastKey = ""; render(store.getState()); });
      }));
    const ok = btn("primary", "この集団で始める", "選んだ集団を、歴史の起点として決める", () => { const r = actions.confirmStart(); if (!r.ok) alertDialog(r.reason); }); ok.disabled = sel == null; acts.append(ok);
    if (sel != null) acts.append(btn("", "候補から外す", "選んだ集団を一覧から取り除く", () => actions.removeGroup(sel)));
    panel.append(list, acts);
  }
  store.subscribe(render); render(store.getState());
}
