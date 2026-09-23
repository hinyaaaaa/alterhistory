// 時間バー：開始/停止・速度・現在の年月表示。
import { formatWorldTime } from "../core/sim/time.js";
import { byId } from "./dom.js";

export function initTimeBar({ store, timeActions }) {
  const toggleBtn = byId("btn-time-toggle");
  const stepBtn = byId("btn-time-step");
  const dateEl = byId("world-date");
  const speedSel = byId("sel-time-speed");

  toggleBtn.addEventListener("click", () => { if (timeActions.isRunning()) timeActions.stop(); else timeActions.start(); });
  stepBtn.addEventListener("click", () => timeActions.stepMonth());
  speedSel.addEventListener("change", () => timeActions.setSpeedPerYear(Number(speedSel.value)));

  function sync() {
    const state = store.getState();
    const hasMap = !!state.map;
    toggleBtn.disabled = !hasMap;
    stepBtn.disabled = !hasMap;
    speedSel.disabled = !hasMap;
    const running = !!state.timeRunning;
    toggleBtn.textContent = running ? "⏸ 停止" : "▶ 開始";
    toggleBtn.classList.toggle("running", running);
    dateEl.textContent = hasMap ? formatWorldTime(state.map.worldTime) : "—";
  }
  store.subscribe(sync);
  sync();
}
