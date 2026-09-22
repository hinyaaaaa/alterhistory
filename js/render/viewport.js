// ビューポート：地図座標(ワールド)と画面座標の変換。ズーム・パンの状態を持つ。
// 純粋ロジック（DOM 非依存）。

export function createViewport(mapWidth, mapHeight) {
  const vp = {
    mapWidth, mapHeight,
    screenWidth: 0, screenHeight: 0,
    x: 0, y: 0, k: 1,     // 画面座標 = ワールド座標 * k + (x, y)
    fitK: 1,              // 「全体表示」時の倍率（ズーム表示の基準）
    minK: 0.2, maxK: 60,
  };

  vp.setMapSize = (w, h) => { vp.mapWidth = w; vp.mapHeight = h; };

  /** 地図全体が画面に収まるように合わせる（余白 margin px） */
  vp.fit = (margin = 16) => {
    const kx = (vp.screenWidth - margin * 2) / vp.mapWidth;
    const ky = (vp.screenHeight - margin * 2) / vp.mapHeight;
    vp.k = Math.max(0.01, Math.min(kx, ky));
    vp.fitK = vp.k;
    vp.minK = Math.min(vp.minK, vp.k * 0.5);
    vp.x = (vp.screenWidth - vp.mapWidth * vp.k) / 2;
    vp.y = (vp.screenHeight - vp.mapHeight * vp.k) / 2;
  };

  /** ワールド座標 (wx, wy) が画面中央に来るように、倍率 k で表示する */
  vp.centerOn = (wx, wy, k = vp.k) => {
    vp.k = Math.max(vp.minK, Math.min(vp.maxK, k));
    vp.x = vp.screenWidth / 2 - wx * vp.k;
    vp.y = vp.screenHeight / 2 - wy * vp.k;
  };

  vp.resize = (w, h) => { vp.screenWidth = w; vp.screenHeight = h; };
  vp.toWorld = (sx, sy) => [(sx - vp.x) / vp.k, (sy - vp.y) / vp.k];
  vp.toScreen = (wx, wy) => [wx * vp.k + vp.x, wy * vp.k + vp.y];

  /** (sx, sy) の下にある地図上の点を動かさずに拡大縮小 */
  vp.zoomAt = (sx, sy, factor) => {
    const k = Math.max(vp.minK, Math.min(vp.maxK, vp.k * factor));
    const [wx, wy] = vp.toWorld(sx, sy);
    vp.k = k;
    vp.x = sx - wx * k;
    vp.y = sy - wy * k;
  };

  vp.pan = (dx, dy) => { vp.x += dx; vp.y += dy; };

  /** 画面に見えているワールド座標の範囲（描画の間引きに使う） */
  vp.visibleBounds = (pad = 0) => {
    const [x0, y0] = vp.toWorld(-pad, -pad);
    const [x1, y1] = vp.toWorld(vp.screenWidth + pad, vp.screenHeight + pad);
    return { x0, y0, x1, y1 };
  };

  vp.apply = (ctx, dpr = 1) => ctx.setTransform(vp.k * dpr, 0, 0, vp.k * dpr, vp.x * dpr, vp.y * dpr);
  return vp;
}
