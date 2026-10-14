// 講和の区画: 敗者の領土を、飛び地のない区画に分ける。首都の区画は出さない。国境側から並ぶ。依存（needs）の整合。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createRequire } from "node:module";
import { partitionParcels } from "../js/core/edit/parcels.js";
import { suggestCessionChunks } from "../js/core/edit/wars.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
let baseRough = 0, baseN = 0;
let total = 0, parcelsN = 0, disconnected = 0, capIn = 0, overlap = 0, needsBad = 0, notMine = 0, rough = 0, roughBase = 0;
for (const seed of [3, 7, 11, 19, 23]) {
  const map = (await loadFromBytes(new TextEncoder().encode(buildSyntheticMapText({ seed }).text), Delaunator)).map;
  const states = map.pack.states.filter((s) => s && s.i > 0 && !s.removed);
  const nb = map.geometry.pack.cells.c, st = map.pack.cells.state;
  for (const loser of states) for (const win of states) {
    if (win.i === loser.i) continue;
    const cap = map.pack.burgs[loser.capital]?.cell ?? -1;
    for (const size of ["s", "m", "l"]) {
      const ps = partitionParcels(map, loser.i, [win.i], { size, capCell: cap }); total++;
      // 比較用: 従来の方式（国境のセルから幅優先でふくらませるだけ）の外周
      { const used = new Set(), target = Math.max(2, Math.round(ps.reduce((a, p) => a + p.cells.length, 0) / Math.max(1, ps.length)));
        for (let i = 0; i < st.length && baseN < 1e9; i++) { if (st[i] !== loser.i || used.has(i) || i === cap || !nb[i].some((j) => st[j] === win.i)) continue; const cells = [i], sn = new Set([i]); for (let h = 0; h < cells.length && cells.length < target; h++) for (const j of nb[cells[h]]) if (!sn.has(j) && st[j] === loser.i && j !== cap && !used.has(j) && cells.length < target) { sn.add(j); cells.push(j); } cells.forEach((x) => used.add(x)); let per = 0; for (const x of cells) for (const j of nb[x]) if (!sn.has(j)) per++; baseRough += per / Math.max(1, Math.sqrt(cells.length)); baseN++; } }
      const seen = new Set();
      ps.forEach((p, k) => {
        parcelsN++;
        if (p.cells.some((i) => st[i] !== loser.i)) notMine++;
        if (p.cells.includes(cap)) capIn++;
        for (const i of p.cells) { if (seen.has(i)) overlap++; seen.add(i); }
        const set = new Set(p.cells), q = [p.cells[0]], vis = new Set(q);
        for (let h = 0; h < q.length; h++) for (const j of nb[q[h]]) if (set.has(j) && !vis.has(j)) { vis.add(j); q.push(j); }
        if (vis.size !== set.size) disconnected++;
        if (p.needs.some((n) => n >= ps.length || n === k)) needsBad++;
        // 境界の滑らかさ: 区画の外周の長さ（他の区画・他国と接するセル辺の数）を、同じ面積の円に近いほど小さい値として測る
        let perim = 0; for (const i of p.cells) for (const j of nb[i]) if (!set.has(j)) perim++;
        rough += perim / Math.max(1, Math.sqrt(p.cells.length)); roughBase++;
      });
    }
  }
}
check(`区画が作られる（${total}通りの組合せで合計${parcelsN}区画）`, parcelsN > 50);
check("どの区画も、敗者の領土の中にある", notMine === 0);
check("どの区画も連結している（飛び地なし）", disconnected === 0, `飛び地${disconnected}`);
check("首都のセルは、どの区画にも入らない（割譲できない）", capIn === 0);
check("区画どうしは重ならない", overlap === 0);
check("先の区画の依存（needs）は、返した配列の添字として正しい", needsBad === 0);
check(`外周が従来の「ふくらませるだけ」の区画より短い（${Math.round((rough / roughBase) * 10) / 10} 対 ${Math.round((baseRough / baseN) * 10) / 10}）`, rough / roughBase <= baseRough / baseN);
const m2 = (await loadFromBytes(new TextEncoder().encode(buildSyntheticMapText({ seed: 7 }).text), Delaunator)).map;
const ss = m2.pack.states.filter((s) => s && s.i > 0 && !s.removed);
const ch = suggestCessionChunks(m2, [ss[0].i], ss[1].i, { size: "m" });
check("割譲の候補（chunk）に、名前・セル数・都市・依存が付く", ch.length > 0 && ch.every((c) => c.name && c.cells === c.regionCells.length && Array.isArray(c.needs) && c.type === "region"));
check("前線に近い区画から並ぶ（depth が昇順）", ch.every((c, i) => i === 0 || ch[i - 1].depth <= c.depth));
const big = suggestCessionChunks(m2, [ss[0].i], ss[1].i, { size: "l" }), small = suggestCessionChunks(m2, [ss[0].i], ss[1].i, { size: "s" });
check("大きさを選べる（大きい区画ほど1つが大きく、数が少ない）", (big[0]?.cells ?? 0) >= (small[0]?.cells ?? 0) && big.length <= small.length);
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
