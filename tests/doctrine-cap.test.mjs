// v2.4.1 A7: ドクトリンの効果の上限（兵科は基本の±60%、攻め・守りは合計±25%）。上限に達した効果は capped に残る。
import assert from "node:assert/strict";
import { TREE_NODES, UNIQUE_NODES, normalizeNodes, effectiveDoctrineKey, doctrineCapped, DOCTRINE_CAPS, fxDimension } from "../js/core/edit/doctrines.js";
import { DOCTRINE_BY_KEY } from "../js/core/sim/units.js";
import { REGIMES } from "../js/core/edit/regimes.js";

assert.deepEqual({ ...DOCTRINE_CAPS }, { unit: 0.6, war: 0.25 }, "上限の値（ユーザー回答で確定）");
const bases = Object.keys(DOCTRINE_BY_KEY).filter((k) => !k.includes("|"));
let sawCap = false;
for (const reg of REGIMES) for (const baseKey of bases) {
  const st = { regime: reg.key, doctrine: baseKey };
  st.doctrineNodes = normalizeNodes(st, [...TREE_NODES.map((n) => n.key), ...UNIQUE_NODES.filter((n) => n.regime === reg.key).map((n) => n.key)]); // 選べる節を全部
  const d = DOCTRINE_BY_KEY[effectiveDoctrineKey(st)], b = DOCTRINE_BY_KEY[baseKey];
  for (const [u, v] of Object.entries(d.mult)) {
    const b0 = b.mult[u] ?? 1;
    assert.ok(v <= b0 * 1.6 + 1e-9 && v >= b0 * 0.4 - 1e-9, `${reg.key}/${baseKey}/${u}: 倍率 ${v} が基本 ${b0} の±60%を超えている`);
  }
  assert.ok(Math.abs(d.war?.attack ?? 0) <= 0.25 + 1e-9, `${reg.key}/${baseKey}: 攻め ${d.war?.attack}`);
  assert.ok(Math.abs(d.war?.defense ?? 0) <= 0.25 + 1e-9 && Math.abs(d.defenseBonus ?? 0) <= 0.25 + 1e-9, `${reg.key}/${baseKey}: 守り ${d.war?.defense}/${d.defenseBonus}`);
  const caps = doctrineCapped(st); if (caps.length) sawCap = true;
  for (const c of caps) { assert.ok(Math.abs(c.raw) > Math.abs(c.cap), "上限前の値は、上限より大きい"); assert.ok(c.dim && Number.isFinite(c.raw) && Number.isFinite(c.cap)); }
}
assert.ok(sawCap, "全部の節を選ぶと、どこかで上限に達する（上限が実際に効いている）");

// 少し選ぶだけなら、上限に触れず、従来の合成と同じ値になる
const small = { regime: "absolute_monarchy", doctrine: "balanced", doctrineNodes: normalizeNodes({ regime: "absolute_monarchy" }, [TREE_NODES[0].key]) };
assert.deepEqual(doctrineCapped(small), [], "1つだけなら、上限に達しない");
const fx = TREE_NODES[0].fx, dm = DOCTRINE_BY_KEY[effectiveDoctrineKey(small)], bm = DOCTRINE_BY_KEY.balanced;
for (const [k, v] of Object.entries(fx)) { const dim = fxDimension(k); if (dim && bm.mult[dim] !== undefined || (dim && !["attack", "defense"].includes(dim))) assert.ok(Math.abs(dm.mult[dim] - Math.round((bm.mult[dim] ?? 1) * (1 + v) * 1000) / 1000) < 1e-9, `従来どおりの合成（${dim}）`); }

// 守りの上限: 守りの節だけを選べるだけ選んでも、+25%で止まる
const defNodes = [...TREE_NODES, ...UNIQUE_NODES].filter((n) => (n.fx.def ?? 0) > 0);
const dst = { regime: "federation", doctrine: "balanced", doctrineNodes: normalizeNodes({ regime: "federation" }, defNodes.map((n) => n.key)) };
const dd = DOCTRINE_BY_KEY[effectiveDoctrineKey(dst)];
assert.ok(dd.war.defense <= 0.25 + 1e-9, "守りは+25%まで");
console.log("ドクトリンの効果の上限: OK");
