// 場所の層：都市の記号と、国名・都市名のラベル。

/** 都市の記号。画面上での大きさが一定になるよう、ズームで割る */
export function drawBurgs(ctx, map, vp, { minPopulation = 0 } = {}) {
  const vb = vp.visibleBounds(8);
  for (const b of map.pack.burgs) {
    if (!b || !b.i || b.removed) continue;
    if (b.x < vb.x0 || b.x > vb.x1 || b.y < vb.y0 || b.y > vb.y1) continue; // 画面外は描かない
    if (!b.capital && (b.population ?? 0) < minPopulation) continue;
    const r = (b.capital ? 3.6 : 2.2) / vp.k;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = b.capital ? "#7a1f1f" : "#f4efe4";
    ctx.fill();
    ctx.lineWidth = 1 / vp.k;
    ctx.strokeStyle = "#2b2118";
    ctx.stroke();
  }
}

const FONT_STACK = '"Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans CJK JP",sans-serif';

/**
 * ラベル。画面上で重なるラベルは、優先度の高いものだけを残す。
 * 優先度: 国名 > 首都 > 人口の多い都市
 */
export function drawLabels(ctx, map, vp, { states = true, burgs = true } = {}) {
  const placed = []; // 画面座標の矩形
  const k = vp.k;
  const vb = vp.visibleBounds(0);
  const inView = (x, y) => x >= vb.x0 && x <= vb.x1 && y >= vb.y0 && y <= vb.y1;

  const tryPlace = (text, wx, wy, sizePx, style) => {
    ctx.font = `${style.bold ? "bold " : ""}${sizePx / k}px ${FONT_STACK}`;
    const w = ctx.measureText(text).width * k; // 画面上の幅
    const [sx, sy] = vp.toScreen(wx, wy);
    const rect = [sx - w / 2 - 2, sy - sizePx / 2 - 1, sx + w / 2 + 2, sy + sizePx / 2 + 1];
    for (const r of placed) {
      if (rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1]) return false;
    }
    placed.push(rect);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = style.halo / k;
    ctx.strokeStyle = "rgba(255,252,240,0.9)";
    ctx.strokeText(text, wx, wy);
    ctx.fillStyle = style.color;
    ctx.fillText(text, wx, wy);
    return true;
  };

  if (states) {
    const list = map.pack.states
      .filter((s) => s && s.i && !s.removed && s.pole)
      .sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
    for (const s of list) {
      if (!inView(s.pole[0], s.pole[1])) continue;
      const size = Math.max(11, Math.min(20, 9 + Math.sqrt(s.area ?? 0) * 0.02 * k));
      tryPlace(s.name ?? "", s.pole[0], s.pole[1], size, { color: "#2b2118", halo: 3.2, bold: true });
    }
  }
  if (burgs) {
    const list = map.pack.burgs
      .filter((b) => b && b.i && !b.removed)
      .sort((a, b) => (b.capital ?? 0) - (a.capital ?? 0) || (b.population ?? 0) - (a.population ?? 0));
    for (const b of list) {
      if (!inView(b.x, b.y)) continue;
      // 座標は記号の少し下に置く
      const dy = (b.capital ? 6.5 : 5) / k;
      tryPlace(b.name ?? "", b.x, b.y + dy, b.capital ? 12 : 10, { color: "#1e1712", halo: 2.4, bold: !!b.capital });
    }
  }
}
