// 世界の生成サービス。Worker で作る（画面が止まらない・中断できる）。Worker が使えない環境（file:// の制限・テスト）では、同じ処理をその場で行う。
import { generateWorldChecked } from "../core/world/worldgen.js";

/**
 * @param deps.createWorker  () => Worker | null   null なら（または作成に失敗したら）その場で生成する
 */
export function createWorldService({ createWorker = null } = {}) {
  let worker = null, abort = null, current = null, lastMode = "none";
  const stopWorker = () => { if (worker) { worker.terminate(); worker = null; } };
  function generateInline(spec, onProgress, signal) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const r = generateWorldChecked(spec, { onProgress, signal }, 4);
          r.world.generation = { seedUsed: r.seedUsed, attempts: r.attempts, rejected: r.rejected }; resolve(r.world);
        } catch (e) { reject(e); }
      }, 20);
    });
  }
  return {
    /** 生成する。戻り値: Promise<world>。中断されたら reject（name: "Cancelled"）。onProgress({stage,label,fraction,ms}) */
    generate(spec, { onProgress } = {}) {
      this.cancel();
      const token = {}; current = token;
      const cancelled = () => Object.assign(new Error("生成を中断しました"), { name: "Cancelled" });
      let w = null; try { w = createWorker ? createWorker() : null; } catch { w = null; }
      if (!w) {
        lastMode = "inline";
        abort = typeof AbortController !== "undefined" ? new AbortController() : null;
        return generateInline(spec, onProgress, abort?.signal).catch((e) => { throw current !== token ? cancelled() : /キャンセル/.test(e.message) ? cancelled() : e; }).then((world) => { if (current !== token) throw cancelled(); return world; });
      }
      worker = w; lastMode = "worker";
      return new Promise((resolve, reject) => {
        let gotMessage = false;
        w.onmessage = (ev) => {
          gotMessage = true; const m = ev.data;
          if (m.type === "progress") onProgress?.(m);
          else if (m.type === "done") { if (worker === w) worker = null; w.terminate(); resolve(m.world); }
          else if (m.type === "error") { if (worker === w) worker = null; w.terminate(); reject(new Error(m.message)); }
        };
        w.onerror = (ev) => { // Worker を起動できなかった（環境の制限）→ その場で生成にもどす
          if (worker === w) worker = null; w.terminate();
          if (gotMessage) { reject(new Error(ev.message || "Worker でエラーが起きました")); return; }
          lastMode = "inline"; onProgress?.({ stage: "fallback", label: "Worker を使えないため、この画面で生成します（途中は画面が止まります）", fraction: 0 });
          generateInline(spec, onProgress, null).then(resolve, reject);
        };
        w.postMessage({ type: "generate", spec, maxAttempts: 4 });
        token.reject = reject; token.cancelled = cancelled;
      });
    },
    cancel() {
      if (current?.reject) current.reject(current.cancelled());
      current = null; stopWorker(); abort?.abort(); abort = null;
    },
    get busy() { return !!current; },
    /** 直近の生成に使った方法: "worker" / "inline" */
    get lastMode() { return lastMode; },
  };
}
