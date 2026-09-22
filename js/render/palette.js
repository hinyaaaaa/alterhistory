// 配色。描画層から色の決定ロジックを切り離す。

export const NEUTRAL_COLOR = "#d8d2c0";

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

export function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  const u = clamp01(t);
  const c = (x, y) => Math.round(x + (y - x) * u).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** 水域の色。h は 0(深い)〜19(浅い) */
export function waterColor(h) {
  return mix("#3d5f92", "#9cc0dc", h / 19);
}

/** 陸の高さ(20〜100)による色分け。低地=緑 → 丘=黄褐色 → 山=灰 → 高山=白 */
export function landHeightColor(h) {
  const t = clamp01((h - 20) / 80);
  if (t < 0.25) return mix("#8fbf7a", "#d9d27a", t / 0.25);
  if (t < 0.6) return mix("#d9d27a", "#b58a5c", (t - 0.25) / 0.35);
  return mix("#b58a5c", "#f4f1ec", (t - 0.6) / 0.4);
}
