// 軍事・外交ダイアログ：開閉、タブ切り替え、地図クリックでの部隊配置/移動の橋渡し。
import { byId } from "./dom.js";

export function initMilitaryDialog({ store, editActions, panels }) {
  const dialog = byId("military-dialog");
  const openBtn = byId("btn-open-military");
  const closeBtn = byId("military-close");
  const tabs = [...document.querySelectorAll(".tab-btn")];
  const panelsEl = { regiments: byId("tab-regiments"), wars: byId("tab-wars"), alliances: byId("tab-alliances") };

  /** 「地図をクリックして配置/移動」の待ち受け状態 */
  let pending = null; // { type: "place"|"move", stateId, regId? }

  function open(tabName) {
    if (!store.getState().map) return;
    dialog.showModal();
    if (tabName) setTab(tabName);
    panels.military.render(); panels.wars.render(); panels.alliances.render();
  }
  function close() { dialog.close(); }
  openBtn.addEventListener("click", () => open());
  closeBtn.addEventListener("click", close);
  dialog.addEventListener("cancel", () => { pending = null; });

  function setTab(name) {
    for (const t of tabs) t.classList.toggle("active", t.dataset.tab === name);
    for (const [k, el] of Object.entries(panelsEl)) el.hidden = k !== name;
  }
  for (const t of tabs) t.addEventListener("click", () => setTab(t.dataset.tab));

  byId("tab-regiments").addEventListener("request-place-regiment", (e) => {
    pending = { type: "place", stateId: e.detail.stateId };
    close();
    store.update((s) => { s.hint = "地図をクリックして部隊を配置する場所を選んでください"; });
  });
  byId("tab-regiments").addEventListener("request-move-regiment", (e) => {
    pending = { type: "move", stateId: e.detail.stateId, regId: e.detail.regId };
    close();
    store.update((s) => { s.hint = "地図をクリックして移動先を選んでください"; });
  });

  return {
    get pending() { return pending; },
    /** map-view から呼ばれる: クリックされたセルを、待ち受け中の配置/移動に使う */
    consumeMapClick(cell) {
      if (!pending) return false;
      if (pending.type === "place") {
        const simActions = panels.simActions;
        const id = simActions.createRegiment(pending.stateId, cell, {});
        if (id != null) { pending = null; store.update((s) => { s.hint = null; }); open("regiments"); }
      } else if (pending.type === "move") {
        panels.simActions.moveRegiment(pending.stateId, pending.regId, cell);
        pending = null; store.update((s) => { s.hint = null; }); open("regiments");
      }
      return true;
    },
    cancelPending() { pending = null; store.update((s) => { s.hint = null; }); },
    open, close, setTab,
  };
}
