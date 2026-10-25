// v5.3 UI 単体確認用の地図の代役。本体の描画基盤（v5.2 で改修予定）には依存しない。
//   地図ポート: { el, onPick(fn), highlight(sel|null), refresh(), dispose() }
//   国家を色つきの塊として描き、クリックで国家を選べる。実際の地図は、本体の #map-canvas を同じポートで包む（live-adapter の createLiveMapPort）。
import { h } from "../dom.js";

const hash = (s) => { let x = 2166136261; for (const c of String(s)) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
const colorOf = (id) => { const k = hash(id); return `hsl(${k % 360} ${40 + ((k >>> 9) % 25)}% ${42 + ((k >>> 17) % 14)}%)`; };

export function createMockMap({ adapter, width = 1000, height = 640 }) {
  const canvas = h("canvas", { class: "v53-map-canvas", width, height, tabindex: 0, "aria-label": "世界地図（模擬）" });
  const el = h("div", { class: "v53-map" }, canvas);
  let pickFn = null, sel = null, blobs = [];

  function draw() {
    const g = canvas.getContext?.("2d"); if (!g) return;
    const m = adapter.meta(), layers = Object.fromEntries(adapter.layers().map((l) => [l.key, l.on]));
    g.fillStyle = "#17323b"; g.fillRect(0, 0, width, height);
    if (layers.terrain) { g.fillStyle = "#5f7a52"; g.beginPath(); g.ellipse(width * 0.45, height * 0.5, width * 0.36, height * 0.34, 0, 0, Math.PI * 2); g.fill(); }
    const rows = m.hasCiv ? adapter.list("state", { limit: 60 }).rows : [];
    blobs = rows.map((r) => { const k = hash(r.id); return { id: r.id, name: r.title, x: width * (0.14 + ((k % 1000) / 1000) * 0.62), y: height * (0.18 + (((k >>> 10) % 1000) / 1000) * 0.62), r: 34 + Math.min(52, Math.sqrt(r.pop ?? 1000) / 5) }; });
    for (const b of blobs) {
      if (layers.states) { g.fillStyle = colorOf(b.id); g.globalAlpha = 0.55; g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      if (layers.borders || sel?.id === b.id) { g.lineWidth = sel?.id === b.id ? 3 : 1; g.strokeStyle = sel?.id === b.id ? "#c7d6df" : "#0d121480"; g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.stroke(); }
      if (layers.labels) { g.font = '600 14px "Zen Old Mincho", "Shippori Mincho", serif'; g.textAlign = "center"; g.lineWidth = 3; g.strokeStyle = "#0d1214"; g.fillStyle = "#f1e9d2"; g.strokeText(b.name, b.x, b.y); g.fillText(b.name, b.x, b.y); }
    }
    if (m.past) { g.fillStyle = "#b8a06a22"; g.fillRect(0, 0, width, height); }
  }
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect(), x = ((e.clientX - r.left) / (r.width || width)) * width, y = ((e.clientY - r.top) / (r.height || height)) * height;
    const hit = blobs.map((b) => ({ b, d: Math.hypot(b.x - x, b.y - y) })).filter((o) => o.d <= o.b.r).sort((a, b) => a.d - b.d)[0];
    if (hit) pickFn?.({ kind: "state", id: hit.b.id });
  });
  const u = adapter.subscribe(() => { clearTimeout(t); t = setTimeout(draw, 80); }); let t = 0;
  draw();
  return {
    el, canvas,
    onPick(fn) { pickFn = fn; },
    highlight(s) { sel = s && s.kind === "state" ? s : null; draw(); },
    refresh: draw,
    /** テスト用: 国家の位置を返す（クリックの再現に使う） */
    _blobs: () => blobs,
    dispose() { u(); clearTimeout(t); },
  };
}
