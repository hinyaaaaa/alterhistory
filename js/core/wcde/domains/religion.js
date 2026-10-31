// v6 M3: 宗教。宗教ごとに 最高神（その文化の言語で命名）・聖地・分派の系譜を持つ。分派は、広がった宗教が地理的に離れて起こる（事実として記録）。
//   創始者は「分かっているときだけ」持つ（先史に生まれた宗教の創始者は未知 = null）。捏造しない。
import { hashSeed } from "../../civ/civ-state.js";
import { createReligion } from "../../civ/culture.js";
import { makeEvent } from "../../civ/events.js";
import { nameFor, languageOfGroup } from "./language.js";

const domRel = (g) => g.cohorts.reduce((b, c) => (c.share > b.share ? c : b));
/** 定義の補完（最高神・聖地）。最初の月次で一度だけ。名前は、その宗教の信者が多い集団の言語から */
export function defineReligions(ctx) {
  const { civ } = ctx, need = Object.values(civ.religions).filter((r) => r.deity == null); if (!need.length) return;
  const byRel = new Map(); for (const g of Object.values(civ.groups)) { const c = domRel(g); if (c.religionId) { const a = byRel.get(c.religionId) ?? []; a.push(g); byRel.set(c.religionId, a); } }
  for (const r of need) {
    const gs = (byRel.get(r.id) ?? []).slice().sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)), top = gs[0];
    const lang = top ? languageOfGroup(top) : null, rr = { next: ((s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296))(hashSeed(r.id, "deity")) };
    r.deity = lang && civ.languages[lang] ? nameFor(civ, rr.next, lang, "person") : null; r.holyCell = top?.cell ?? null; r.founderId = null; // 創始者は未知
    if (r.deity) r.name = `${r.deity}信仰`;
  }
}
/** 分派（3か月ごとに評価）。信者の集団が多く、離れていて、古い宗教は分かれることがある */
export function stepReligion(ctx) {
  const { civ, ids, world } = ctx, mi = civ.monthIndex; if (!civ.options.wcde) return; defineReligions(ctx); if (mi % 3 !== 0) return;
  const byRel = new Map(); for (const g of Object.values(civ.groups)) { const c = domRel(g); if (c.religionId) { const a = byRel.get(c.religionId) ?? []; a.push(g); byRel.set(c.religionId, a); } }
  for (const [rid, gs] of [...byRel].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const r = civ.religions[rid]; if (!r || gs.length < 4 || mi - r.bornAt < 600) continue; if (((hashSeed(rid, mi) % 100000) / 100000) >= 0.0008 * Math.min(3, gs.length / 4)) continue;
    // 聖地から遠い側の集団が、新しい宗派へ
    const hc = r.holyCell ?? gs[0].cell, d = (g) => Math.hypot(world.cell.lat[g.cell] - world.cell.lat[hc], world.cell.lon[g.cell] - world.cell.lon[hc]), far = gs.slice().sort((a, b) => d(b) - d(a) || (a.id < b.id ? -1 : 1)).slice(0, Math.ceil(gs.length / 3));
    const nid = createReligion(civ, ids, ctx.rng, { parent: rid, kind: r.kind }), nr = civ.religions[nid]; nr.holyCell = far[0].cell; nr.founderId = null; nr.deity = r.deity;
    const lang = languageOfGroup(far[0]); if (lang && civ.languages[lang]) { nr.name = `${nameFor(civ, ctx.rng, lang, "person")}派`; }
    for (const g of far) for (const c of g.cohorts) if (c.religionId === rid) c.religionId = nid;
    makeEvent(civ, ids, { kind: "religion_schism", title: `${r.name}から${nr.name}が分かれた（信者の集団 ${far.length}）`, participants: [{ entityId: rid, role: "parent_religion" }, { entityId: nid, role: "new_religion" }, ...far.slice(0, 3).map((g) => ({ entityId: g.id, role: "converted_group" }))], location: { cell: far[0].cell }, effects: [{ targetId: nid, property: "religion.parent", before: null, after: rid }], provenance: "simulation" });
  }
}
