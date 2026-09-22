// SVG 記録コンテキスト：Canvas 2D と同じ命令を受け取り、SVG として記録する。
//
// 目的: 描画ロジック（render/layers/*）を Canvas 用と SVG 用で二重に持たないこと。
//       scene.js の drawScene に、このコンテキストを渡すだけで SVG が得られる。
//
// 対応する命令は、描画層が実際に使うものだけ:
//   状態: fillStyle strokeStyle lineWidth lineCap lineJoin globalAlpha font textAlign textBaseline
//   命令: save restore setTransform fillRect beginPath moveTo lineTo closePath arc(円のみ)
//         fill stroke setLineDash fillText strokeText measureText
// 未対応の命令・引数は、黙って無視せず例外にする（SVG が静かに欠けるのを防ぐため）。
//
// 制限: measureText は実際のフォントを測れないため近似（全角=1em、半角=0.55em）。
//       ラベルの重なり回避の判定が、画面表示と SVG とで僅かに異なる場合がある。
//
// 純粋ロジック（DOM 非依存）。

const num = (v) => (Math.round(v * 100) / 100).toString();
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "#rrggbb" / "#rgb" / "rgba(r,g,b,a)" → { color: "#rrggbb", alpha } */
export function parseColor(input) {
  const s = String(input).trim();
  let m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) {
    const h = (x) => Math.round(Number(x)).toString(16).padStart(2, "0");
    return { color: `#${h(m[1])}${h(m[2])}${h(m[3])}`, alpha: m[4] === undefined ? 1 : Number(m[4]) };
  }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return { color: "#" + m[1].split("").map((c) => c + c).join(""), alpha: 1 };
  if (/^#[0-9a-f]{6}$/i.test(s)) return { color: s.toLowerCase(), alpha: 1 };
  throw new Error(`SVG 出力: 未対応の色指定です: ${input}`);
}

/** 文字の幅の近似（1em 単位）。かな・漢字・全角は 1、その他は 0.55 */
const charEm = (ch) => (ch.charCodeAt(0) >= 0x2e80 ? 1 : 0.55);

function parseFont(font) {
  const m = /^(bold\s+)?([\d.]+)px\s+(.+)$/.exec(font);
  if (!m) throw new Error(`SVG 出力: 未対応の font 指定です: ${font}`);
  return { bold: !!m[1], size: Number(m[2]), family: m[3] };
}

export function createSvgContext(width, height) {
  const body = [];          // 出力済みの要素
  let open = false;         // <g> を開いているか
  const stack = [];
  let path = [];            // 現在のパスのコマンド

  const st = {
    fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
    globalAlpha: 1, font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", dash: [],
  };

  const closeGroup = () => { if (open) { body.push("</g>"); open = false; } };
  const emit = (s) => { if (!open) { body.push("<g>"); open = true; } body.push(s); };

  const fillAttrs = () => {
    const { color, alpha } = parseColor(st.fillStyle);
    const a = alpha * st.globalAlpha;
    return `fill="${color}"${a < 1 ? ` fill-opacity="${num(a * 1000) / 1000}"` : ""}`;
  };
  const strokeAttrs = () => {
    const { color, alpha } = parseColor(st.strokeStyle);
    const a = alpha * st.globalAlpha;
    let s = `stroke="${color}" stroke-width="${num(st.lineWidth * 1000) / 1000}"`;
    if (a < 1) s += ` stroke-opacity="${num(a * 1000) / 1000}"`;
    if (st.lineCap !== "butt") s += ` stroke-linecap="${st.lineCap}"`;
    if (st.lineJoin !== "miter") s += ` stroke-linejoin="${st.lineJoin}"`;
    if (st.dash.length) s += ` stroke-dasharray="${st.dash.map((d) => num(d * 1000) / 1000).join(" ")}"`;
    return s;
  };

  const textAttrs = (x, y) => {
    const f = parseFont(st.font);
    const anchor = st.textAlign === "center" ? "middle" : st.textAlign === "right" || st.textAlign === "end" ? "end" : "start";
    const base = st.textBaseline === "middle" ? ` dominant-baseline="central"` : "";
    return `x="${num(x)}" y="${num(y)}" font-size="${num(f.size * 1000) / 1000}" font-family="${esc(f.family)}"` +
      `${f.bold ? ` font-weight="bold"` : ""} text-anchor="${anchor}"${base}`;
  };

  const ctx = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get lineCap() { return st.lineCap; }, set lineCap(v) { st.lineCap = v; },
    get lineJoin() { return st.lineJoin; }, set lineJoin(v) { st.lineJoin = v; },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
    get textBaseline() { return st.textBaseline; }, set textBaseline(v) { st.textBaseline = v; },

    save() { stack.push({ ...st, dash: st.dash.slice() }); },
    restore() { const s = stack.pop(); if (s) Object.assign(st, s); },

    // 変換が変わるたびに新しい <g> を始める（描画層は変換を入れ子にしない）
    setTransform(a, b, c, d, e, f) {
      closeGroup();
      body.push(`<g transform="matrix(${num(a * 1e4) / 1e4} ${b} ${c} ${num(d * 1e4) / 1e4} ${num(e)} ${num(f)})">`);
      open = true;
    },

    fillRect(x, y, w, h) {
      emit(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${fillAttrs()}/>`);
    },

    beginPath() { path = []; },
    moveTo(x, y) { path.push(`M${num(x)} ${num(y)}`); },
    lineTo(x, y) { path.push(`L${num(x)} ${num(y)}`); },
    closePath() { path.push("Z"); },
    arc(x, y, r, a0, a1) {
      if (Math.abs(a1 - a0) < Math.PI * 2 - 1e-6) throw new Error("SVG 出力: 円弧（円以外）は未対応です");
      // 円は、直径の両端を結ぶ2つの半円で表す
      path.push(`M${num(x - r)} ${num(y)}A${num(r)} ${num(r)} 0 1 0 ${num(x + r)} ${num(y)}A${num(r)} ${num(r)} 0 1 0 ${num(x - r)} ${num(y)}Z`);
    },
    setLineDash(d) { st.dash = Array.from(d); },

    fill() { if (path.length) emit(`<path d="${path.join("")}" ${fillAttrs()}/>`); },
    stroke() { if (path.length) emit(`<path d="${path.join("")}" fill="none" ${strokeAttrs()}/>`); },

    fillText(text, x, y) { emit(`<text ${textAttrs(x, y)} ${fillAttrs()}>${esc(text)}</text>`); },
    strokeText(text, x, y) {
      emit(`<text ${textAttrs(x, y)} fill="none" ${strokeAttrs()}>${esc(text)}</text>`);
    },
    measureText(text) {
      const { size } = parseFont(st.font);
      let em = 0;
      for (const ch of String(text)) em += charEm(ch);
      return { width: em * size };
    },

    drawImage() { throw new Error("SVG 出力: drawImage は未対応です"); },

    /** 完成した SVG 文書 */
    toString() {
      closeGroup();
      return `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
        body.join("\n") + `\n</svg>\n`;
    },
  };
  return ctx;
}
