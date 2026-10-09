// 時間バー：開始/停止・速度・現在の年月表示。クリックで年月の直接指定・時代区分の設定を開く。
import { formatWorldTime } from "../core/sim/time.js";
import { byId } from "./dom.js";
import { openTimeSettingsDialog } from "./time-settings-dialog.js";

export function initTimeBar({ store, timeActions, editActions, simActions = null }) {
  const toggleBtn = byId("btn-time-toggle");
  const stepBtn = byId("btn-time-step");
  const dateEl = byId("world-date");
  const speedSel = byId("sel-time-speed");

  toggleBtn.addEventListener("click", () => { if (timeActions.isRunning()) timeActions.stop(); else timeActions.start(); });
  stepBtn.addEventListener("click", () => timeActions.stepMonth());
  speedSel.addEventListener("change", () => timeActions.setSpeedPerYear(Number(speedSel.value)));
  dateEl.addEventListener("click", () => { if (store.getState().map) openTimeSettingsDialog({ store, timeActions, editActions, simActions }); });

  function sync() {
    const state = store.getState();
    const hasMap = !!state.map;
    toggleBtn.disabled = !hasMap;
    stepBtn.disabled = !hasMap;
    speedSel.disabled = !hasMap;
    dateEl.disabled = !hasMap;
    const running = !!state.timeRunning;
    toggleBtn.textContent = running ? "⏸" : "▶";
    toggleBtn.title = running ? "停止 (Space)" : "開始 (Space)";
    toggleBtn.classList.toggle("running", running);
    dateEl.replaceChildren();
    if (hasMap) {
      dateEl.append(document.createTextNode(formatWorldTime(state.map.worldTime)));
      const era = editActions?.eraAt ? editActions.eraAt(state.map.worldTime.year) : null;
      if (era) {
        const span = document.createElement("span");
        span.className = "era-name";
        span.textContent = era.name;
        dateEl.append(span);
      }
    } else {
      dateEl.append(document.createTextNode("—"));
    }
  }
  store.subscribe(sync);
  sync();
}
