// 地理生成の Worker（v4.0.0）。画面を止めずに球面世界を作る。メインスレッドとは、構造化複製と転送だけで受け渡す。
import { generateWorldChecked } from "../core/world/worldgen.js";

function collectBuffers(world) {
  const seen = new Set(), list = [];
  const add = (o) => { for (const v of Object.values(o)) if (ArrayBuffer.isView(v) && !seen.has(v.buffer)) { seen.add(v.buffer); list.push(v.buffer); } };
  add(world.mesh); add(world.cell); return list;
}
self.onmessage = (e) => {
  const m = e.data;
  if (!m || m.type !== "generate") return;
  try {
    const r = generateWorldChecked(m.spec, { onProgress: (p) => self.postMessage({ type: "progress", ...p }) }, m.maxAttempts ?? 4);
    r.world.generation = { seedUsed: r.seedUsed, attempts: r.attempts, rejected: r.rejected };
    self.postMessage({ type: "done", world: r.world }, collectBuffers(r.world));
  } catch (err) { self.postMessage({ type: "error", message: err && err.message ? err.message : String(err) }); }
};
