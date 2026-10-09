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
import { planNextCollapse } from "../core/sim/collapse.js";
import { planTribute } from "../core/edit/vassals.js";
import { convert } from "../core/sim/currency.js";
import { getFinance } from "../core/sim/trade.js";
import { createRandom } from "../core/random.js";

const DEFAULT_MS_PER_MONTH = (2 * 60 * 1000) / 12; // 既定: 1年=2分 → 1ヶ月=10秒

export function createTimeActions({ store, renderer, simActions = null }) {
  const rates = createRandom(Date.now() ^ 0x5eed);
  let timer = null;
  let msPerMonth = DEFAULT_MS_PER_MONTH;

  function tick() {
    const map = store.getState().map;
    if (!map) return;
    const { time, yearChanged } = advanceMonth(map.worldTime);
    store.update((s) => { s.map.worldTime = time; });
    simActions?.advanceWars?.(time); // 戦争中の損害を、月ごとに自動で展開する
    if (yearChanged) {
      const cmd = planAnnualUpdate(map, rates);
      if (cmd) store.commit(cmd);
      simActions?.applyNaturalEvents?.(time, rates); // 独立・疫病・反乱・宗教の分派（オフにもできる）
      { const tc = planTribute(store.getState().map, (st) => getFinance(st).treasury, convert); if (tc) store.commit(tc); } // 従属国の貢納
      // 人口の大部分を失った国は崩壊する（無くなるまで繰り返す）
      for (let guard = 0; guard < 8; guard++) {
        const m = store.getState().map; const c = planNextCollapse(m, time);
        if (!c) break;
        try { store.commit(c.command); } catch { break; }
      }
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
    /** 現在の年月を直接指定し、そこから始める（進行の巻き戻し・早送りではなく「上書き」）。
     *  年次更新（人口・産業など）は行わない＝単に時計の針をその年月に合わせるだけ。
     *  「江戸時代の1800年から始めたい」のような、シナリオの起点を決める用途を想定。 */
    setWorldTime(year, month = 1) {
      const map = store.getState().map;
      if (!map) return;
      const y = Math.max(1, Math.round(Number(year) || 1));
      const m = Math.min(12, Math.max(1, Math.round(Number(month) || 1)));
      store.update((s) => { s.map.worldTime = { year: y, month: m }; });
      renderer.requestRender();
    },
    /** 新しい地図を読み込んだときに時計をリセットし、進行中なら止める */
    resetForNewMap() {
      this.stop();
      store.update((s) => { if (s.map) s.map.worldTime = createWorldTime(); });
    },
  };
}
