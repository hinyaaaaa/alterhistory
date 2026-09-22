// 地形層：セルの多角形を、高さまたはバイオームで塗る。
//
// 同じ色のセルを1本の複合パスにまとめて1回だけ塗る。
//   - 隣接セルの継ぎ目に隙間や二重塗りが出ない（半透明の重ね塗りでも安全）
//   - 塗り命令の回数が色数まで減り、速い
import { landHeightColor } from "../palette.js";

const OCEAN_NEAR = "#86aed0";  // 海岸に隣接する水域
const OCEAN_MID = "#6f97c0";   // その外側
const OCEAN_FAR = "#5a82ad";
const LAKE = "#8bbbe0";

/** セルの多角形をパスに追加する */
export function addCellPath(ctx, cells, vertices, i) {
  const poly = cells.v[i];
  for (let k = 0; k < poly.length; k++) {
    const p = vertices.p[poly[k]];
    if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
}

/** 水域セルの色。海岸からの距離(grid.t)で決める。湖は別の色 */
function waterColorOf(map, i) {
  const gi = map.geometry.pack.g[i];
  if (map.grid.features[map.grid.f[gi]]?.type === "lake") return LAKE;
  const t = map.grid.t[gi];
  return t === -1 ? OCEAN_NEAR : t === -2 ? OCEAN_MID : OCEAN_FAR;
}

/**
 * @param {"biome"|"height"} mode
 */
export function drawTerrain(ctx, map, vp, mode = "biome") {
  const { cells, vertices, h } = map.geometry.pack;
  const biome = map.pack.cells.biome;
  const biomeColor = map.biomesData.map((b) => b?.color ?? "#999");

  // 色ごとにセルを分類
  const groups = new Map();
  for (let i = 0; i < cells.v.length; i++) {
    const hi = h[i];
    let color;
    if (hi < 20) color = waterColorOf(map, i);
    else if (mode === "height") color = landHeightColor(Math.round(hi / 4) * 4); // 4刻みに量子化して色数を抑える
    else color = biomeColor[biome[i]] ?? "#999";
    let list = groups.get(color);
    if (!list) { list = []; groups.set(color, list); }
    list.push(i);
  }

  for (const [color, list] of groups) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const i of list) addCellPath(ctx, cells, vertices, i);
    ctx.fill();
  }
}
