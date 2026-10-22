// 初期集団の印。歴史が始まる前の候補（丸）と、選んだ集団（太い丸）を地図に重ねる。
export function drawGroups(ctx, map, vp, groups) {
  if (!groups?.length) return;
  const { p } = map.geometry.pack;
  ctx.lineJoin = "round";
  for (const g of groups) {
    const pt = p[g.cell]; if (!pt) continue;
    const r = (g.selected ? 9 : 7) / vp.k;
    ctx.beginPath(); ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
    ctx.fillStyle = g.selected ? "rgba(255,196,60,0.95)" : "rgba(255,255,255,0.85)"; ctx.fill();
    ctx.lineWidth = (g.selected ? 2.4 : 1.4) / vp.k; ctx.strokeStyle = g.selected ? "#7a4b00" : "#2a3f5f"; ctx.stroke();
    ctx.font = `${11 / vp.k}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#1c2a3f"; ctx.fillText(String(g.id), pt[0], pt[1]);
  }
}
