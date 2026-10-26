// 描画コンテキストの縦方向の変換（v5.2）。レイヤーは「ワールド（sim）座標」で描き、ここで y を円筒図法の表示座標へ変える。
//   ctx.moveTo / lineTo / arc / fillRect / fillText などの y だけを、視点の投影（vp.warpY）で変換して本物の ctx へ渡す。
//   視点が球面世界でない（vp.proj が無い）ときは、何もせず ctx をそのまま返す。
//   rawCtx / warpY: 大量の線分を描くとき（edges.strokeSegments）に、1 本ごとの代理呼び出しを避けて直接描くための入口。
//   円や文字の大きさは変えない（中心だけを移す）ので、記号やラベルがつぶれない。線の太さも画面の見た目のまま。
export function warpContext(ctx, vp) {
  if (!vp?.proj) return ctx;
  const wy = (y) => vp.proj.warp(y);
  const ov = {
    moveTo: (x, y) => ctx.moveTo(x, wy(y)),
    lineTo: (x, y) => ctx.lineTo(x, wy(y)),
    arc: (x, y, ...r) => ctx.arc(x, wy(y), ...r),
    ellipse: (x, y, ...r) => ctx.ellipse(x, wy(y), ...r),
    rect: (x, y, w, h) => ctx.rect(x, wy(y), w, wy(y + h) - wy(y)),
    fillRect: (x, y, w, h) => ctx.fillRect(x, wy(y), w, wy(y + h) - wy(y)),
    strokeRect: (x, y, w, h) => ctx.strokeRect(x, wy(y), w, wy(y + h) - wy(y)),
    clearRect: (x, y, w, h) => ctx.clearRect(x, wy(y), w, wy(y + h) - wy(y)),
    fillText: (t, x, y, ...r) => ctx.fillText(t, x, wy(y), ...r),
    strokeText: (t, x, y, ...r) => ctx.strokeText(t, x, wy(y), ...r),
    quadraticCurveTo: (cx, cy, x, y) => ctx.quadraticCurveTo(cx, wy(cy), x, wy(y)),
    bezierCurveTo: (a, b, c, d, x, y) => ctx.bezierCurveTo(a, wy(b), c, wy(d), x, wy(y)),
  };
  return new Proxy(ctx, {
    get(t, prop) { if (prop === "rawCtx") return t; if (prop === "warpY") return wy; if (Object.hasOwn(ov, prop)) return ov[prop]; const v = t[prop]; return typeof v === "function" ? v.bind(t) : v; },
    set(t, prop, val) { t[prop] = val; return true; },
  });
}
