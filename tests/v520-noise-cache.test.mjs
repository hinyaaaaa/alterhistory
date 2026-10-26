// v5.2: ノイズの格子点キャッシュ版（makeFbm3）が、従来の fbm3 と完全に同じ値を返すこと。世界生成の出力（ハッシュ）が変わらないための検査。
import assert from "node:assert/strict";
import { fbm3, makeFbm3 } from "../js/core/world/noise.js";
import { generateWorld } from "../js/core/world/worldgen.js";
let failed = 0; const check = (l, fn) => { try { fn(); console.log(`  OK   ${l}`); } catch (e) { failed++; console.log(`  FAIL ${l}: ${String(e.message).split("\n")[0]}`); } };
check("makeFbm3 は fbm3 と、乱雑な点・隣り合う点・格子をまたぐ点のすべてで同じ値（ビット一致）", () => {
  for (const [seed, oct, freq] of [[12345, 3, 1.5], [99, 3, 5.5], [7, 4, 1], [-5, 2, 3.3]]) {
    const f = makeFbm3(seed, oct, freq); let s = 1;
    for (let i = 0; i < 20000; i++) { s = (s * 1664525 + 1013904223) >>> 0; const a = (s / 4294967296) * 2 - 1; s = (s * 1664525 + 1013904223) >>> 0; const b = (s / 4294967296) * 2 - 1; s = (s * 1664525 + 1013904223) >>> 0; const c = (s / 4294967296) * 2 - 1;
      const n = Math.hypot(a, b, c) || 1, x = a / n, y = b / n, z = c / n; assert.equal(f(x, y, z), fbm3(seed, x, y, z, oct, freq)); if (i % 3 === 0) assert.equal(f(x + 1e-4, y, z), fbm3(seed, x + 1e-4, y, z, oct, freq)); }
  }
});
check("同じシード・同じ設定なら、2 回作っても世界のハッシュが同じ（キャッシュの状態が出力に漏れない）", () => {
  const a = generateWorld({ worldSeed: "cache-1", resolution: { targetCells: 8000 } }), b = generateWorld({ worldSeed: "cache-1", resolution: { targetCells: 8000 } }); assert.equal(a.hash, b.hash);
});
check("v5.1.0 で作った世界と同じ出力（v5.1.0 で記録したハッシュ）: a/20000 セル・x/20000 セル", () => {
  assert.equal(generateWorld({ worldSeed: "a", resolution: { targetCells: 20000 } }).hash, "9def65fa");
  assert.equal(generateWorld({ worldSeed: "x", resolution: { targetCells: 20000 } }).hash, "a03bc326");
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
