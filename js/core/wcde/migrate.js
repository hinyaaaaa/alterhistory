// v7.1.0: 旧い保存（v7.0 以前の技術ツリー・政体）を、新しい木へ移す。木に無い技術の記録を取り除くだけで、世界の歴史（年表・国・戦争）は変えない。
//   ・技術: 500 項目の木で、名前を変えた／統合された技術は、既存の id を引き継いでいるので記録はそのまま使える。木に無くなった技術（採鉱・天文など）は消す。
//   ・政体: 旧い政体 id は regimeOf() が 30 種へ読み替える（保存の中身は変えない）。
import { NODE } from "../civ/techtree.js";
const keep = (o) => { if (!o || typeof o !== "object") return 0; let n = 0; for (const k of Object.keys(o)) if (!NODE[k]) { delete o[k]; n++; } return n; };
export function migrateTechTree(civ) {
  let n = 0; n += keep(civ.techWorld);
  for (const g of Object.values(civ.groups ?? {})) { const t = g.tech; if (!t) continue; n += keep(t.known) + keep(t.prog) + keep(t.lost); if (Array.isArray(t.cand)) { const m = t.cand.length; t.cand = t.cand.filter((k) => NODE[k]); n += m - t.cand.length; } }
  for (const s of Object.values(civ.states ?? {})) n += keep(s.techAdopted);
  if (civ.adoptCache) for (const k of Object.keys(civ.adoptCache)) { const e = civ.adoptCache[k]; if (Array.isArray(e?.keys)) e.keys = e.keys.filter((x) => NODE[x]); }
  return n;
}
