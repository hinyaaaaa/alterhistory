// 投影の境界（v5.2）。地理の正本は球面（緯度経度）のままで、画面への変換はこのファイルだけに置く。
//   - 地図座標（"sim 座標"）: 球面から導いた等距円筒。x = (経度+π)/2π × W、y = (π/2−緯度)/π × (W/2)。
//       シミュレーションの距離・近傍・セル索引が使う。ズームしても変わらない（一様な縮尺）。
//   - 表示座標（"display 座標"）: 円筒図法。x は経度に比例。y = ln(tan(π/4 + aφ/2)) / a（a=1 が Mercator）。
//       世界全体では a=0.8、深く拡大すると a=1 へ滑らかに近づく。緯度 ±80°を超える所は「極域バンド」に線形に押し込む。
//   描画・ヒットテスト・ラベル・部隊・選択は、すべてここの順変換・逆変換を通す（式を他所に埋め込まない）。
// 純粋ロジック（DOM 非依存）。

export const POLAR_LAT_DEG = 80;
export const POLAR_LAT = (POLAR_LAT_DEG * Math.PI) / 180;
export const A_WORLD = 0.8;           // 世界全体の表示
export const A_DEEP = 1;              // 深く拡大したとき（Mercator 型）
export const A_STEP = 0.025;          // a を量子化する刻み（変わるたびに表示座標の作り直しが要るため）
export const ZOOM_A_FROM = 3;         // この拡大率（全体表示に対する倍率）までは a = 0.8
export const ZOOM_A_TO = 24;          // この拡大率以上で a = 1
export const BAND_RATIO = 0.09;       // 極域バンド 1 つの高さ（緯度 ±80° の表示高さに対する割合）

const HALF_PI = Math.PI / 2, TAU = 2 * Math.PI;

/** 円筒図法の y（半径 1 の単位）。lat はラジアン。a は 0 より大きい値（1 = Mercator）。±90°では a=1 のとき無限大になるので呼び出し側で丸める */
export function projectY(lat, a = A_WORLD) { return Math.log(Math.tan(Math.PI / 4 + (a * lat) / 2)) / a; }
/** projectY の逆 */
export function unprojectY(y, a = A_WORLD) { return (2 * (Math.atan(Math.exp(a * y)) - Math.PI / 4)) / a; }
export const clampLat = (lat, lim = HALF_PI) => Math.max(-lim, Math.min(lim, lat));
export function wrapLon(lon) { while (lon > Math.PI) lon -= TAU; while (lon < -Math.PI) lon += TAU; return lon; }

/** 拡大率（全体表示に対する倍率）から a を決める。対数軸で滑らかに 0.8 → 1。A_STEP に量子化する */
export function aForZoom(zoomRatio) {
  const z = Number.isFinite(zoomRatio) && zoomRatio > 0 ? zoomRatio : 1;
  const t = Math.max(0, Math.min(1, (Math.log(z) - Math.log(ZOOM_A_FROM)) / (Math.log(ZOOM_A_TO) - Math.log(ZOOM_A_FROM))));
  const s = t * t * (3 - 2 * t); // smoothstep
  const a = A_WORLD + (A_DEEP - A_WORLD) * s;
  return Math.round(a / A_STEP) * A_STEP;
}

/** 地図座標（sim）の定義。W×(W/2) の等距円筒 */
export function simFrame(W) {
  const H = W / 2;
  return {
    W, H,
    /** 球面 → sim（lat, lon はラジアン） */
    toSim(lat, lon) { return [((lon + Math.PI) / TAU) * W, ((HALF_PI - lat) / Math.PI) * H]; },
    /** sim → 球面 */
    fromSim(x, y) { return { lat: HALF_PI - (y / H) * Math.PI, lon: (x / W) * TAU - Math.PI }; },
  };
}

/**
 * 表示投影。W は地図の幅（sim と display で共通。x は変換しない）。
 * @returns {{a:number, W:number, simH:number, R:number, height:number, band:number, top:number, bottom:number, totalHeight:number,
 *   latToY:(lat:number)=>number, yToLat:(y:number)=>number, simYToDisplay:(ySim:number)=>number, displayToSimY:(yd:number)=>number,
 *   toDisplay:(x:number,y:number)=>number[], toSim:(x:number,y:number)=>number[], lonToX:(lon:number)=>number, xToLon:(x:number)=>number, warp:(ySim:number)=>number}}
 */
export function createProjection({ a = A_WORLD, mapWidth = 2048 } = {}) {
  if (!(a > 0) || !(a <= 1.0001)) throw new Error(`投影の a は 0 より大きく 1 以下（受け取った値: ${a}）`);
  const W = mapWidth, simH = W / 2, R = W / TAU, yLim = projectY(POLAR_LAT, a), height = 2 * R * yLim, band = Math.round(BAND_RATIO * height), PH = HALF_PI - POLAR_LAT;
  const top = -band, bottom = height + band;
  // 緯度（ラジアン）→ 表示 y。±80° の内側は円筒図法、外側は極域バンドへ線形（極で band 分）
  const latToY = (lat) => {
    if (lat > POLAR_LAT) return -band * Math.min(1, (lat - POLAR_LAT) / PH);
    if (lat < -POLAR_LAT) return height + band * Math.min(1, (-lat - POLAR_LAT) / PH);
    return R * (yLim - projectY(lat, a));
  };
  const yToLat = (y) => {
    if (y < 0) return POLAR_LAT + Math.min(1, -y / band) * PH;
    if (y > height) return -(POLAR_LAT + Math.min(1, (y - height) / band) * PH);
    return unprojectY(yLim - y / R, a);
  };
  // sim の y（緯度に線形）→ 表示 y。毎頂点で三角関数を呼ばないよう、表を引く（8192 区間の線形補間。誤差は 1/100 px 未満）
  const N = 8192, lut = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) lut[i] = latToY(HALF_PI - (i / N) * Math.PI);
  const warp = (ySim) => {
    const f = (ySim / simH) * N; if (f <= 0) return lut[0]; if (f >= N) return lut[N];
    const i = f | 0, t = f - i; return lut[i] + (lut[i + 1] - lut[i]) * t;
  };
  const simYToLat = (ySim) => HALF_PI - (ySim / simH) * Math.PI;
  return {
    a, W, simH, R, height, band, top, bottom, totalHeight: height + 2 * band,
    latToY, yToLat,
    simYToDisplay: warp, warp,
    displayToSimY: (yd) => ((HALF_PI - yToLat(yd)) / Math.PI) * simH,
    toDisplay: (x, y) => [x, warp(y)],
    toSim: (x, yd) => [x, ((HALF_PI - yToLat(yd)) / Math.PI) * simH],
    lonToX: (lon) => ((lon + Math.PI) / TAU) * W,
    xToLon: (x) => (x / W) * TAU - Math.PI,
    simYToLat,
  };
}

/** 世界の端（経度の継ぎ目）で x を [0, W) に折り返す */
export function wrapX(x, W) { const r = x % W; return r < 0 ? r + W : r; }
