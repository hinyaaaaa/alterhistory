import assert from "node:assert/strict";
import { createRandom } from "../js/core/random.js";
import { pickAutoTerritory } from "../js/core/edit/territory.js";

// 20x20 の格子の地図。山(高さ90)の帯を x=12 に置く。国家1は左上の 3x3 を持つ。
const W = 20, N = W * W;
const idx = (x, y) => y * W + x;
const c = Array.from({ length: N }, (_, i) => { const x = i % W, y = (i / W) | 0, out = []; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < W) out.push(idx(nx, ny)); } return out; });
const map = {
  pack: { cells: { biome: new Uint8Array(N).fill(1), state: new Uint16Array(N) } },
  geometry: { pack: { cells: { c }, p: Array.from({ length: N }, (_, i) => [i % W, (i / W) | 0]), h: Uint8Array.from({ length: N }, (_, i) => (i % W === 12 ? 90 : 30)) } },
};
const own = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { map.pack.cells.state[idx(x, y)] = 1; own.push(idx(x, y)); }

for (let seed = 1; seed <= 30; seed++) {
  const r = pickAutoTerritory(map, { kind: "state", size: "m", rnd: createRandom(seed), ownCells: own });
  assert.ok(r.cells.length >= 6, "足す量が小さすぎない");
  // 1) すべての追加セルが、既存領土から連結している（飛び地を作らない）
  const have = new Set([...own, ...r.cells]); const seen = new Set([own[0]]); const st = [own[0]];
  while (st.length) { const k = st.pop(); for (const j of c[k]) if (have.has(j) && !seen.has(j)) { seen.add(j); st.push(j); } }
  assert.equal(seen.size, have.size, `seed ${seed}: 領土が1つにつながっている`);
  // 2) 山の帯(x=12)より向こうへは、手前を埋め尽くす前に越えない
  const beyond = r.cells.filter((i) => i % W > 12).length;
  assert.equal(beyond, 0, `seed ${seed}: 山を越えて先に飛ばない`);
  // 3) 重複なし・空き地のみ
  assert.equal(new Set(r.cells).size, r.cells.length);
  assert.ok(r.cells.every((i) => map.pack.cells.state[i] === 0));
}
// 空き地に接していない領土 → 理由つきで失敗（離れた所に飛ばない）
const m2 = JSON.parse(JSON.stringify({ x: 1 })); void m2;
const full = { ...map, pack: { cells: { biome: map.pack.cells.biome, state: new Uint16Array(N).fill(1) } } };
const none = pickAutoTerritory(full, { kind: "state", rnd: createRandom(1), ownCells: [0] });
assert.equal(none.reason, "no-free-land");
// 新規（ownCells なし）は従来どおり
const fresh = pickAutoTerritory(map, { kind: "state", size: "m", rnd: createRandom(2) });
assert.ok(fresh.cells.length >= 6);
console.log("territory-grow OK");
