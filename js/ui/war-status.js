// 右下: 進行中の戦争の状況。戦争ごとに、戦争名・経過月・両陣営・戦力比（2色バー）・士気を出す。
//   クリックで、戦争ウィンドウのその戦争を開く。内戦（civil）も同じ形。戦争が0件のときは出さない。
import { activeWars } from "../core/edit/wars.js";
import { sideStrength } from "../core/sim/war-engine.js";

const monthsBetween = (from, to) => Math.max(0, (to.year - from.year) * 12 + (to.month - from.month));
const total = (s) => s.land + s.sea + s.air;
const names = (map, ids) => ids.map((id) => map.pack.states[id]?.name ?? "?").join("・");

export function initWarStatus({ store, wins, panels }) {
  const root = document.getElementById("war-status");
  if (!root) throw new Error("#war-status が見つかりません（index.html を確認してください）");
  function render(state) {
    const map = state?.map;
    const wars = map ? activeWars(map) : [];
    root.hidden = wars.length === 0;
    if (!wars.length) { root.replaceChildren(); return; }
    const head = document.createElement("div"); head.className = "wars-head";
    head.innerHTML = "<b>進行中の戦争</b>"; const n = document.createElement("span"); n.textContent = String(wars.length); head.append(n);
    const list = [head];
    for (const w of wars) {
      const a = sideStrength(map, w.attackers, w.muster ?? null), d = sideStrength(map, w.defenders, w.muster ?? null);
      const ta = total(a), td = total(d), share = ta + td <= 0 ? 0.5 : ta / (ta + td);
      const pa = Math.round(share * 100);
      const item = document.createElement("button"); item.type = "button"; item.className = "war"; item.title = "戦争ウィンドウでこの戦争を開く";
      const months = monthsBetween(w.startedAt ?? map.worldTime, map.worldTime ?? w.startedAt);
      item.innerHTML = `<h6><span></span><small>${months}か月</small></h6><div class="sides"><span></span><span></span></div><div class="bar"><i style="flex:${pa}"></i><i style="flex:${100 - pa}"></i></div><div class="nums"><span>戦力 ${pa} : ${100 - pa}</span><span>士気 ${Math.round(a.morale)} / ${Math.round(d.morale)}</span></div>`;
      item.querySelector("h6 span").textContent = w.name;
      const sides = item.querySelectorAll(".sides span");
      sides[0].textContent = names(map, w.attackers); sides[1].textContent = names(map, w.defenders);
      item.addEventListener("click", () => { wins.open("war"); panels.wars?.select?.(w.id); });
      list.push(item);
    }
    root.replaceChildren(...list);
  }
  store.subscribe(render); render(store.getState());
  return { render: () => render(store.getState()) };
}
