// 時間進行アクション：スタート/ストップと、月ごとの自動進行。
//
// 設計方針:
//   ・worldTime（年月）自体は store.update（履歴に残らない軽い変更）で進める。
//     「1ヶ月進んだ」を毎回Undoの対象にすると、通常の編集Undoと混ざって使い勝手を損なうため。
//   ・年が変わったタイミングでのみ、人口・産業・徴兵の年次更新を store.commit（Undo可能）で適用する。
//     つまり「時間そのもの」は巻き戻せないが、「時間経過に伴うデータの変化」は巻き戻せる。
//   ・進行間隔は既定 2分/年 = 10秒/月（ユーザー要件どおり調整可能）。

import { advanceMonth, createWorldTime } from "../core/sim/time.js";
import { planAnnualUpdate } from "../core/sim/world.js";

const DEFAULT_MS_PER_MONTH = (2 * 60 * 1000) / 12; // 既定: 1年=2分 → 1ヶ月=10秒

export function createTimeActions({ store, renderer }) {
  let timer = null;
  let msPerMonth = DEFAULT_MS_PER_MONTH;

  function tick() {
    const map = store.getState().map;
    if (!map) return;
    const { time, yearChanged } = advanceMonth(map.worldTime);
    store.update((s) => { s.map.worldTime = time; });
    if (yearChanged) {
      const cmd = planAnnualUpdate(map);
      if (cmd) store.commit(cmd);
    }
    renderer.requestRender();
  }

  return {
    isRunning: () => timer !== null,
    getSpeed: () => msPerMonth,
    /** 1年あたりのミリ秒で速度を設定する */
    setSpeedPerYear(msPerYear) {
      msPerMonth = Math.max(200, msPerYear / 12);
      if (timer) { this.stop(); this.start(); } // 動作中なら間隔を反映し直す
      store.update((s) => { s.timeSpeed = msPerMonth; });
    },
    start() {
      if (timer || !store.getState().map) return;
      timer = setInterval(tick, msPerMonth);
      store.update((s) => { s.timeRunning = true; });
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      store.update((s) => { s.timeRunning = false; });
    },
    /** 手動で1ヶ月分だけ進める（停止中でも使える） */
    stepMonth() { tick(); },
    /** 新しい地図を読み込んだときに時計をリセットし、進行中なら止める */
    resetForNewMap() {
      this.stop();
      store.update((s) => { if (s.map) s.map.worldTime = createWorldTime(); });
    },
  };
}
