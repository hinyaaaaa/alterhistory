import { centersOf } from "../../core/geometry-csr.js";
// 線の層：河川と道路・航路。

/** 河川。流量に応じて太くする */
export function drawRivers(ctx, map, vp) {
  const ctr = centersOf(map.geometry), nC = ctr.n;
  ctx.strokeStyle = "#5f8fbf";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const r of map.pack.rivers) {
    if (!r || !r.cells || r.cells.length < 2) continue;
    // 川幅: 流量の平方根に比例（下限あり）。単位はワールド座標
    ctx.lineWidth = Math.max(0.35, 0.25 + Math.sqrt(r.discharge ?? 1) * 0.045);
    ctx.beginPath();
    let started = false;
    for (const c of r.cells) {
      if (!(c >= 0 && c < nC)) continue; // 範囲外(-1 など)は飛ばす
      if (!started) { ctx.moveTo(ctr.cx[c], ctr.cy[c]); started = true; } else ctx.lineTo(ctr.cx[c], ctr.cy[c]);
    }
    ctx.stroke();
  }
}

const ROUTE_STYLE = {
  roads:     { color: "#7a4b25", width: 1.0, dash: null },
  trails:    { color: "#8a6a45", width: 0.7, dash: [2, 1.5] },
  searoutes: { color: "#3f5f8f", width: 0.8, dash: [0.8, 2.2] },
};

/** 道路・小道・航路 */
export function drawRoutes(ctx, map, vp, groups = { roads: true, trails: true, searoutes: true }) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const r of map.routes) {
    if (!r || !groups[r.group] || !r.points || r.points.length < 2) continue;
    const st = ROUTE_STYLE[r.group] ?? ROUTE_STYLE.roads;
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = st.width;
    ctx.setLineDash(st.dash ?? []);
    ctx.beginPath();
    ctx.moveTo(r.points[0][0], r.points[0][1]);
    for (let i = 1; i < r.points.length; i++) ctx.lineTo(r.points[i][0], r.points[i][1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
