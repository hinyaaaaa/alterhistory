// 内戦の決着と外国の支援（戦争ウィンドウの「作戦」欄）。入力は選択だけ。
//   鎮圧: 反乱側の国を解体し、属州を取り戻す／独立を承認: 反乱側は独立国のまま、戦争を終える／外国の支援: 国を選んで記録する
import { el } from "./kit.js";
import { confirmDialog } from "./dialogs.js";
import { activeWars } from "../core/edit/wars.js";

export function createCivilSection({ store, simActions }) {
  const box = el("section", "war-civil"); box.append(el("h4", "", "内戦の決着"));
  const body = el("div"); box.append(body);
  const nm = (m, id) => m.pack.states[id]?.fullName ?? m.pack.states[id]?.name ?? `#${id}`;
  function render() {
    body.replaceChildren();
    const map = store.getState().map; const wars = map ? activeWars(map).filter((w) => w.type === "civil") : [];
    if (!wars.length) { body.append(el("p", "hint", "進行中の内戦はありません（反乱・独立ウィンドウから始まる戦争です）。")); return; }
    for (const w of wars) {
      const rebel = w.attackers[0], parent = w.defenders[0];
      const card = el("div", "civil-card"); card.append(el("strong", "", w.name), el("p", "hint", `反乱側: ${nm(map, rebel)} ／ 元の国: ${nm(map, parent)}`));
      const sup = el("button", "", "鎮圧する（反乱側を解体）"); sup.type = "button";
      sup.addEventListener("click", async () => { if (await confirmDialog(`「${w.name}」を鎮圧します。\n${nm(map, rebel)}は解体され、属州は${nm(map, parent)}に戻ります。`, { danger: true, okLabel: "鎮圧する" })) { simActions.resolveCivilWar(w.id, "suppress"); render(); } });
      const ind = el("button", "", "独立を承認する"); ind.type = "button";
      ind.addEventListener("click", async () => { if (await confirmDialog(`${nm(map, parent)}は${nm(map, rebel)}の独立を承認し、「${w.name}」を終えます。`, { okLabel: "承認する" })) { simActions.resolveCivilWar(w.id, "independence"); render(); } });
      const row = el("div", "diplomacy-row"); row.append(sup, ind); card.append(row);
      // 外国の支援（国の選択だけ）
      const others = map.pack.states.filter((s) => s && s.i > 0 && !s.removed && s.i !== rebel && s.i !== parent);
      if (others.length) {
        const who = el("select"); for (const s of others) who.append(new Option(nm(map, s.i), String(s.i)));
        const side = el("select"); side.append(new Option("反乱側を支援", "rebel"), new Option("元の国側を支援", "parent"));
        const go = el("button", "", "支援を記録"); go.type = "button"; go.addEventListener("click", () => { simActions.recordCivilSupport(w.id, +who.value, side.value); render(); });
        const r2 = el("div", "diplomacy-row"); r2.append(el("span", "field-label", "外国の支援"), who, side, go); card.append(r2);
      }
      body.append(card);
    }
  }
  store.subscribe(() => { if (box.offsetParent !== null || box.isConnected) render(); });
  render();
  return { box, render };
}
