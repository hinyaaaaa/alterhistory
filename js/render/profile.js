// 描画の所要時間の集計（v5.3.1）。通常は合計だけを持ち、セルごとの出力はしない。
//
// 使い方: drawScene の options.profile に createRenderProfile() を渡すと、層・コピー・地形の内訳が集まる。
//   - sync を true にすると、各区間の終わりでキャンバスを読み出して、描画命令の実行（ラスタライズ）の終わりまで待つ。
//     Chromium の Canvas 2D は、命令を記録するだけで、実際の描画は後でまとめて行う。待たずに測ると、
//     「命令を並べた時間」だけが出て、肝心の塗りつぶしの時間が別の場所に紛れ込む（v5.3.0 の調査で fill() が 33 ms に見えた理由）。
//     sync は計測専用（遅くなる）。通常の描画は sync なしで、命令を並べた時間（js）だけを集める。
//   - 計測中にブレークポイントで止めない。結果は snapshot() で最後に1回だけ取り出す。
export function createRenderProfile({ sync = false } = {}) {
  const ms = new Map(), counts = new Map();
  const flush = (ctx) => { if (sync && ctx?.getImageData) ctx.getImageData(0, 0, 1, 1); };
  const bump = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
  return {
    sync,
    /** fn を実行して label に時間を足す。例外のときも時間は足す（失敗を隠さない: 例外はそのまま投げ直す） */
    run(label, ctx, fn) {
      const a = performance.now();
      try { return fn(); } finally { flush(ctx); bump(ms, label, performance.now() - a); bump(counts, `${label}#`, 1); }
    },
    count(label, n = 1) { bump(counts, label, n); },
    snapshot() {
      const r = (x) => Math.round(x * 10) / 10;
      return { sync, ms: Object.fromEntries([...ms].map(([k, v]) => [k, r(v)])), counts: Object.fromEntries(counts) };
    },
  };
}

/** profile が無いとき（通常の描画）は、計測なしで fn を実行する */
export const timed = (prof, label, ctx, fn) => (prof ? prof.run(label, ctx, fn) : fn());
