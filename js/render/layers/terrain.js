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
export function addCellPath(ctx, cells, vertices, i, wy = null) {
  // wy: 球面世界の表示用に y を円筒図法へ変える関数（本物の Path2D に直接足すときに使う。warpContext 経由なら不要）
  const ring = (poly) => {
    for (let k = 0; k < poly.length; k++) {
      const p = vertices.p[poly[k]], y = wy ? wy(p[1]) : p[1];
      if (k === 0) ctx.moveTo(p[0], y); else ctx.lineTo(p[0], y);
    }
    ctx.closePath();
  };
  ring(cells.v[i]);
  if (cells.alt?.[i]) ring(cells.alt[i]); // 世界の継ぎ目をまたぐセルは反対側の端にも描く（球面世界の経度の継ぎ目）
}

/** 水域セルの色。海岸からの距離(grid.t)で決める。湖は別の色 */
function waterColorOf(map, i) {
  const gi = map.geometry.pack.g[i];
  if (map.grid.features[map.grid.f[gi]]?.type === "lake") return LAKE;
  const t = map.grid.t[gi];
  return t === -1 ? OCEAN_NEAR : t === -2 ? OCEAN_MID : OCEAN_FAR;
}

const pathCache = new WeakMap(); // geometry → { stamp, byKey }
const PLAIN_LAND = "#d8d2b4";  // 地形・標高のどちらも切ったときの陸（無地）

/**
 * @param {"biome"|"height"|"both"|"none"} mode
 *   both: 地形・植生を塗ったあと、標高を半透明で重ねる / none: 陸は無地
 */
export function drawTerrain(ctx, map, vp, mode = "biome") {
  const { cells, vertices, h } = map.geometry.pack;
  const biome = map.pack.cells.biome;
  const biomeColor = map.biomesData.map((b) => b?.color ?? "#999");

  /** 色ごとにセルを分類して、同じ色を1本のパスで塗る。landColor が null の陸は塗らない */
  // 地形は編集しない限り変わらないので、色ごとのパスを作って使い回す（再描画のたびに作り直さない）
  let cache = pathCache.get(map.geometry);
  const stamp = `${map.rev?.terrain ?? 0}:${vp.proj ? vp.proj.a : 0}`; // 投影の a が変わると表示座標が変わるので作り直す
  const wyFn = vp.proj ? vp.proj.warp : null;
  if (!cache || cache.stamp !== stamp) { cache = { stamp, byKey: new Map() }; pathCache.set(map.geometry, cache); }
  const hasPath2D = typeof Path2D !== "undefined";
  // 近景（世界の半分より狭くしか見えない: 拡大している・継ぎ目の外側の細い繰り返し など）: 世界全体のパスは作らず、画面にかかるセルだけを毎回まとめて塗る（見えないセルを描かない）
  const near = vp.cullable?.() ?? (vp.fitK > 0 && vp.k / vp.fitK > 4), P = map.geometry.pack.p;
  let vb = null, margin = 0;
  if (near) { vb = vp.visibleBounds(40); margin = (map.grid?.spacing || 8) * 3; }
  const alt = cells.alt, visible = (i) => { if (alt?.[i]) return true; /* 継ぎ目をまたぐセルは反対側の端にも描くので、常に候補にする（数が少ない） */ const p = P[i]; return p[0] >= vb.x0 - margin && p[0] <= vb.x1 + margin && p[1] >= vb.y0 - margin && p[1] <= vb.y1 + margin; };
  function paint(landColor, { water = true, alpha = 1, key = "" } = {}) {
    if (near) return paintNear(landColor, water, alpha);
    let entries = cache.byKey.get(key);
    if (!entries) {
      const groups = new Map();
      for (let i = 0; i < cells.v.length; i++) {
        const hi = h[i];
        let color;
        if (hi < 20) color = water ? waterColorOf(map, i) : null;
        else color = landColor(i, hi);
        if (color == null) continue;
        let list = groups.get(color);
        if (!list) { list = []; groups.set(color, list); }
        list.push(i);
      }
      entries = [];
      for (const [color, list] of groups) {
        if (hasPath2D) { const path = new Path2D(); for (const i of list) addCellPath(path, cells, vertices, i, wyFn); entries.push({ color, path }); }
        else entries.push({ color, list });
      }
      cache.byKey.set(key, entries);
    }
    ctx.globalAlpha = alpha;
    for (const e of entries) {
      ctx.fillStyle = e.color;
      if (e.path) ctx.fill(e.path);
      else { ctx.beginPath(); for (const i of e.list) addCellPath(ctx, cells, vertices, i); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function paintNear(landColor, water, alpha) {
    const groups = new Map();
    for (let i = 0; i < cells.v.length; i++) {
      if (!visible(i)) continue;
      const hi = h[i]; let color;
      if (hi < 20) color = water ? waterColorOf(map, i) : null; else color = landColor(i, hi);
      if (color == null) continue;
      let list = groups.get(color); if (!list) groups.set(color, (list = [])); list.push(i);
    }
    ctx.globalAlpha = alpha;
    for (const [color, list] of groups) { ctx.fillStyle = color; ctx.beginPath(); for (const i of list) addCellPath(ctx, cells, vertices, i); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  const byHeight = (_i, hi) => landHeightColor(Math.round(hi / 4) * 4); // 4刻みに量子化して色数を抑える
  const byBiome = (i) => biomeColor[biome[i]] ?? "#999";

  if (mode === "none") paint(() => PLAIN_LAND, { key: "none" });
  else if (mode === "height") paint(byHeight, { key: "height" });
  else if (mode === "both") { paint(byBiome, { key: "biome" }); paint(byHeight, { water: false, alpha: 0.5, key: "height-land" }); }
  else paint(byBiome, { key: "biome" });
}
