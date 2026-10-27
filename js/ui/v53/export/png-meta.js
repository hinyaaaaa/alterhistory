// v5.3 出力: PNG が「どの状態を表す画像か」を、画像の中と、書き出しの前の説明の両方に示すための共通部品。
//   kind: "current"（現在の地図: 表示中のレイヤーのまま）/ "territory"（選択年月の文明の領土図）
import { fmtMonth } from "../format.js";

export const PNG_KINDS = Object.freeze([
  { id: "current", label: "現在の地図", desc: "今画面に出ているレイヤーのまま書き出します" },
  { id: "territory", label: "選択年月の領土図", desc: "時間軸で選んだ年月の、各国の領土を色分けして書き出します" },
]);

/** 画像に添える情報。表示用の文と、画像の下部に描く行（captionLines）を作る */
export function describePng({ kind, month, worldName = "", layers = [], projection = "円筒図法（表示用の投影。データは球面上に保持）", legendCount = 0 }) {
  const k = PNG_KINDS.find((x) => x.id === kind) ?? PNG_KINDS[0];
  const on = layers.filter((l) => l.on).map((l) => l.label);
  const lines = [
    `${worldName || "無題の世界"} — ${k.label}${kind === "territory" ? `（${fmtMonth(month)}）` : ""}`,
    kind === "territory" ? `年月: ${fmtMonth(month)}　凡例: 領土を持つ ${legendCount} 国` : `年月: ${fmtMonth(month)}　表示レイヤー: ${on.length ? on.join("・") : "なし"}`,
    `投影: ${projection}`,
  ];
  return { kind: k.id, label: k.label, month, layers: on, projection, captionLines: lines, summary: lines.slice(1).join(" ／ ") };
}

/** 画像の下に、説明の帯を足す（canvas 2D）。本体の書き出し済み canvas にも、領土図の canvas にも使える */
export function withCaption(srcCanvas, lines, { createCanvas, fontPx = 15, pad = 10 } = {}) {
  const lh = Math.round(fontPx * 1.5), bar = lines.length * lh + pad * 2;
  const out = createCanvas(srcCanvas.width, srcCanvas.height + bar), g = out.getContext("2d");
  g.drawImage(srcCanvas, 0, 0);
  g.fillStyle = "#0e1112"; g.fillRect(0, srcCanvas.height, out.width, bar);
  g.fillStyle = "#e6e4dc"; g.font = `${fontPx}px "Noto Sans JP", "Yu Gothic UI", sans-serif`; g.textBaseline = "top";
  lines.forEach((t, i) => g.fillText(t, pad, srcCanvas.height + pad + i * lh));
  return out;
}
