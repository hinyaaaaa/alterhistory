// ビューポート：地図座標（ワールド）と画面座標の変換。ズーム・パンの状態を持つ。
// 純粋ロジック（DOM 非依存）。
//
// 座標の約束（v5.2）:
//   ワールド座標 = 地図座標（sim。x は経度に比例、y は緯度に比例する等距円筒。シミュレーションと保存データが使う）。
//   球面世界（幅 : 高さ = 2 : 1 の地図）では、画面への変換だけが円筒図法（core/world/projection.js）を通る:
//     画面 x = ワールド x × k + x0（経度は線形）／画面 y = warp(ワールド y) × k + y0（緯度は円筒図法。±80°の外は極域バンド）
//   経度は継ぎ目で折り返してスクロールする（toWorld は x を [0, W) に収めて返す）。
//   拡大率に応じて a（0.8 → 1）が変わる。変わるたびに proj が新しい値になる（描画のキャッシュは proj.a を鍵にする）。
//   球面世界でない地図（幅 : 高さ ≠ 2 : 1。テスト用の合成地図など）は、従来どおり一様な平面として扱う（proj = null）。

import { createProjection, aForZoom, wrapX, A_WORLD } from "../core/world/projection.js";

const isSphereSize = (w, h) => Math.abs(h * 2 - w) < 1e-6;

export function createViewport(mapWidth, mapHeight) {
  const vp = {
    mapWidth, mapHeight,
    screenWidth: 0, screenHeight: 0,
    x: 0, y: 0, k: 1,     // 画面座標 = 表示座標 * k + (x, y)（表示座標は、球面世界なら円筒図法の y、そうでなければワールド座標）
    fitK: 1,              // 「全体表示」時の倍率（ズーム表示の基準）
    minK: 0.2, maxK: 60,
    proj: null,           // 球面世界のときだけ。createProjection の戻り値
    projected: false,
  };

  const setProj = (a) => { vp.proj = createProjection({ a, mapWidth: vp.mapWidth }); };
  function configure() {
    vp.projected = isSphereSize(vp.mapWidth, vp.mapHeight);
    vp.proj = vp.projected ? createProjection({ a: A_WORLD, mapWidth: vp.mapWidth }) : null;
  }
  configure();

  vp.setMapSize = (w, h) => { vp.mapWidth = w; vp.mapHeight = h; configure(); };

  // ---- ワールド（sim）⇄ 表示 ----
  vp.warpY = function warpY(y) { return this.proj ? this.proj.warp(y) : y; };
  vp.unwarpY = function unwarpY(yd) { return this.proj ? this.proj.displayToSimY(yd) : yd; };
  /** 表示の縦の範囲（球面世界は極域バンドを含む） */
  vp.displayTop = function () { return this.proj ? this.proj.top : 0; };
  vp.displayHeight = function () { return this.proj ? this.proj.totalHeight : this.mapHeight; };

  /** 拡大率に合わせて a を更新する。変えたときは true（呼び出し側が、動かしたくない点の y を取り直す） */
  function syncProjection() {
    if (!vp.projected) return false;
    const a = aForZoom(vp.k / (vp.fitK || 1));
    if (a === vp.proj.a) return false;
    setProj(a); return true;
  }

  /** 画面の中心の経度が [0, W) に入るよう、x を W×k の整数倍ずらす（見た目は変わらない） */
  vp.normalize = () => {
    if (!vp.projected) return;
    const cx = (vp.screenWidth / 2 - vp.x) / vp.k;
    vp.x = vp.screenWidth / 2 - wrapX(cx, vp.mapWidth) * vp.k;
  };
  /** 縦は、画面の中心が地図（極域バンドを含む）の外へ出ないようにする */
  const clampY = () => {
    if (!vp.projected) return;
    const yc = (vp.screenHeight / 2 - vp.y) / vp.k, lo = vp.displayTop(), hi = lo + vp.displayHeight();
    if (yc < lo) vp.y = vp.screenHeight / 2 - lo * vp.k; else if (yc > hi) vp.y = vp.screenHeight / 2 - hi * vp.k;
  };

  /** 地図全体が画面に収まるように合わせる（余白 margin px） */
  vp.fit = (margin = 16) => {
    if (vp.projected) setProj(A_WORLD);
    const kx = (vp.screenWidth - margin * 2) / vp.mapWidth;
    const ky = (vp.screenHeight - margin * 2) / vp.displayHeight();
    vp.k = Math.max(0.01, Math.min(kx, ky));
    vp.fitK = vp.k;
    vp.minK = Math.min(vp.minK, vp.k * 0.5);
    vp.x = (vp.screenWidth - vp.mapWidth * vp.k) / 2;
    vp.y = (vp.screenHeight - vp.displayHeight() * vp.k) / 2 - vp.displayTop() * vp.k;
  };

  /** ワールド座標 (wx, wy) が画面中央に来るように、倍率 k で表示する */
  vp.centerOn = (wx, wy, k = vp.k) => {
    vp.k = Math.max(vp.minK, Math.min(vp.maxK, k));
    syncProjection();
    vp.x = vp.screenWidth / 2 - wx * vp.k;
    vp.y = vp.screenHeight / 2 - vp.warpY(wy) * vp.k;
    clampY(); vp.normalize();
  };

  vp.resize = (w, h) => { vp.screenWidth = w; vp.screenHeight = h; };

  /** 画面 → ワールド。球面世界では x を [0, W) に折り返し、地図（極域バンドを含む）の外の y は範囲外（−1 / mapHeight+1）にする */
  vp.toWorld = function (sx, sy) {
    const wx = (sx - this.x) / this.k, yd = (sy - this.y) / this.k;
    if (!this.proj) return [wx, yd];
    const lo = this.proj.top, hi = lo + this.proj.totalHeight;
    return [wrapX(wx, this.mapWidth), yd < lo ? -1 : yd > hi ? this.mapHeight + 1 : this.proj.displayToSimY(yd)];
  };
  /** ワールド → 画面。nearest=true のときは、画面の中心にいちばん近い繰り返し（経度の継ぎ目の反対側を含む）を返す */
  vp.toScreen = function (wx, wy, nearest = false) {
    let sx = wx * this.k + this.x;
    if (nearest && this.proj) { const span = this.mapWidth * this.k; sx -= Math.round((sx - this.screenWidth / 2) / span) * span; }
    return [sx, this.warpY(wy) * this.k + this.y];
  };

  /** (sx, sy) の下にある地図上の点を動かさずに拡大縮小 */
  vp.zoomAt = (sx, sy, factor) => {
    const k = Math.max(vp.minK, Math.min(vp.maxK, vp.k * factor));
    const wx = (sx - vp.x) / vp.k, yd0 = (sy - vp.y) / vp.k;
    const wy = vp.proj ? vp.proj.displayToSimY(Math.max(vp.proj.top, Math.min(vp.proj.top + vp.proj.totalHeight, yd0))) : yd0;
    vp.k = k;
    syncProjection();
    vp.x = sx - wx * k;
    vp.y = sy - vp.warpY(wy) * k;
    clampY(); vp.normalize();
  };

  vp.pan = (dx, dy) => { vp.x += dx; vp.y += dy; clampY(); vp.normalize(); };

  /** 画面に見えているワールド座標の範囲（描画の間引きに使う）。球面世界では x が [0, W) をはみ出すことがある（継ぎ目をまたぐとき） */
  vp.visibleBounds = function (pad = 0) {
    const x0 = (-pad - this.x) / this.k, x1 = (this.screenWidth + pad - this.x) / this.k;
    const yd0 = (-pad - this.y) / this.k, yd1 = (this.screenHeight + pad - this.y) / this.k;
    if (!this.proj) return { x0, y0: yd0, x1, y1: yd1 };
    return { x0, x1, y0: this.proj.displayToSimY(Math.max(this.proj.top, yd0)), y1: this.proj.displayToSimY(Math.min(this.proj.top + this.proj.totalHeight, yd1)) };
  };

  /** 世界のうち、画面にかかっている面積の割合（0〜1。球面世界のみ。経度は [0, W) との重なり、緯度は表示の縦の長さ）。小さいほど「見える所だけ描く」方式が得になる */
  vp.visibleFraction = function () {
    if (!this.proj) return 1;
    const W = this.mapWidth, x0 = -this.x / this.k, x1 = (this.screenWidth - this.x) / this.k, fx = Math.max(0, Math.min(W, x1) - Math.max(0, x0)) / W;
    const lo = this.proj.top, hi = lo + this.proj.totalHeight, y0 = Math.max(lo, -this.y / this.k), y1 = Math.min(hi, (this.screenHeight - this.y) / this.k), fy = Math.max(0, y1 - y0) / this.proj.totalHeight;
    return fx * fy;
  };
  /** 見える所だけを描くべきか（拡大して見ている、または継ぎ目の外側の細い繰り返しなど、世界の一部しか画面にかからないとき） */
  vp.cullable = function () { return this.projected ? this.visibleFraction() < 0.5 : this.fitK > 0 && this.k / this.fitK > 4; };

  /** 経度の継ぎ目の外側の繰り返し。見えている範囲にかかる [n×W, (n+1)×W) の n の一覧（球面世界のみ。それ以外は [0]） */
  vp.copyOffsets = function () {
    if (!this.proj) return [0];
    const W = this.mapWidth, left = -this.x / this.k, right = (this.screenWidth - this.x) / this.k, out = [];
    for (let n = Math.floor((left + 1e-9) / W); n <= Math.floor((right - 1e-9) / W); n++) out.push(n);
    return out.length ? out : [0];
  };
  /** 繰り返し n 番目の分だけ x をずらした視点（描画の各回に渡す）。n = 0 なら自分自身 */
  vp.shifted = function (n) { if (!n) return this; const s = Object.create(this); s.x = this.x + n * this.mapWidth * this.k; return s; };

  /** 描画のための ctx の変換（表示座標 → 画面）。ワールドの y を円筒図法へ変えるのは render/warp-ctx.js */
  vp.apply = function (ctx, dpr = 1) { ctx.setTransform(this.k * dpr, 0, 0, this.k * dpr, this.x * dpr, this.y * dpr); };

  /** 同じ地図・同じ視点で、画面の大きさだけ違う視点（余白つきタイルの描画に使う）。tileX/tileY は元の画面から見たタイルの左上のずれ */
  vp.cloneFor = (w, h, tileX = 0, tileY = 0) => {
    const c = createViewport(vp.mapWidth, vp.mapHeight);
    c.resize(w, h); c.k = vp.k; c.fitK = vp.fitK; c.minK = vp.minK; c.maxK = vp.maxK;
    c.x = vp.x + tileX; c.y = vp.y + tileY;
    if (vp.projected) c.proj = vp.proj; // 同じ投影の実体を共有する（キャッシュの鍵が一致する）
    return c;
  };
  return vp;
}
