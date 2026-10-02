// 貿易の線：選んだ国と、その貿易相手の国を結ぶ。画面表示用（書き出し画像にも、表示中なら入る）。
// lines: [{ x0,y0,x1,y1, w, kind: "export"|"import" }]（世界座標）。輸出超過は金、輸入超過は青緑。
// 中点を少し持ち上げた曲線にして、重なる線を見分けやすくする。

export function drawTradeLines(ctx, vp, lines) {
  if (!lines?.length) return;
  const k = vp.k;
  ctx.save();
  ctx.lineCap = "round";
  for (const l of lines) {
    const mx = (l.x0 + l.x1) / 2, my = (l.y0 + l.y1) / 2;
    const dx = l.x1 - l.x0, dy = l.y1 - l.y0;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx - (dy / len) * len * 0.12, cy = my + (dx / len) * len * 0.12;
    const color = l.kind === "export" ? "#f2c14e" : "#4fd1c5";
    // 縁取り（暗い下地）→ 本線
    for (const [style, width] of [["rgba(10,12,16,0.65)", l.w + 2.5], [color, l.w]]) {
      ctx.strokeStyle = style; ctx.lineWidth = width / k;
      ctx.beginPath();
      ctx.moveTo(l.x0, l.y0);
      // 2次ベジェを折れ線で近似（SVG記録コンテキストが quadraticCurveTo を持たないため）
      for (let t = 1; t <= 16; t++) {
        const u = t / 16, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        ctx.lineTo(a * l.x0 + b * cx + c * l.x1, a * l.y0 + b * cy + c * l.y1);
      }
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(l.x1, l.y1, (l.w + 2) / k, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
