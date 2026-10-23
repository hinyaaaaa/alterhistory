// V5-M2: 文化・言語・宗教の発生・分化・接触（世界のレジストリ `civ.cultures/languages/religions`）。
// 系統（parent）を持ち、分化は親からの派生として残る。接触は最初の1回だけ記録する（文化の組ごと）。
import { makeEvent } from "./events.js";
import { dominant, addCohort } from "./cohorts.js";
import { neighborGroups } from "./spatial.js";

const SYL = ["カ", "ロ", "ミ", "タ", "ス", "ネ", "ヴォ", "リ", "アン", "ハ", "ド", "レ", "ユ", "サ", "キ", "ノ", "ベ", "グ", "マ", "ジ", "ラ", "オ", "ト", "シェ"];
export const makeNameJa = (rng) => { const n = 2 + (rng() < 0.45 ? 1 : 0); let s = ""; for (let i = 0; i < n; i++) s += SYL[Math.floor(rng() * SYL.length)]; return s; };
export const RELIGION_KINDS = Object.freeze(["精霊信仰", "祖霊信仰", "太陽信仰", "大地母神", "多神教", "一神教"]);

export function createCulture(civ, ids, rng, { parent = null, cell = null } = {}) {
  const id = ids.next("culture"); civ.cultures[id] = { id, name: makeNameJa(rng) + (parent ? "系" : "の人々"), parent, bornAt: civ.monthIndex, cell }; return id;
}
export function createLanguage(civ, ids, rng, { parent = null, cultureId = null } = {}) {
  const id = ids.next("lang"); civ.languages[id] = { id, name: makeNameJa(rng) + "語", parent, bornAt: civ.monthIndex, cultureId }; return id;
}
export function createReligion(civ, ids, rng, { parent = null, kind = null } = {}) {
  const id = ids.next("religion"); civ.religions[id] = { id, name: makeNameJa(rng) + "教", kind: kind ?? RELIGION_KINDS[Math.floor(rng() * RELIGION_KINDS.length)], parent, bornAt: civ.monthIndex }; return id;
}
const STAGE_OK = new Set(["town", "city"]);
/** 月次（culture フェーズ）: 言語・文化の分化、宗教の発生と伝播、文化の接触と混合 */
export function stepCulture(ctx) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex;
  for (const id in civ.groups) {
    const g = civ.groups[id], d = dominant(g), age = mi - g.bornAt;
    // 言語の分化（孤立が長いほど起こりやすい）
    if (age > 360 && rng() < 0.0003) { const old = d.languageId, nl = createLanguage(civ, ids, rng, { parent: old, cultureId: d.cultureId }); d.languageId = nl; makeEvent(civ, ids, { kind: "language_diverged", title: `${civ.languages[old].name}から新しい言語が分かれた`, participants: [{ entityId: g.id, role: "speakers" }, { entityId: nl, role: "language" }, { entityId: old, role: "parent_language" }], location: { cell: g.cell } }); }
    // 文化の分化
    if (age > 360 && g.pop > 400 && rng() < 0.0002) { const old = d.cultureId, nc = createCulture(civ, ids, rng, { parent: old, cell: g.cell }); d.cultureId = nc; makeEvent(civ, ids, { kind: "culture_diverged", title: `${civ.cultures[old].name}から新しい文化が分かれた`, participants: [{ entityId: g.id, role: "bearers" }, { entityId: nc, role: "culture" }, { entityId: old, role: "parent_culture" }], location: { cell: g.cell } }); }
    // 宗教の発生（町以上の集落で）
    const st = g.settlementId ? civ.settlements[g.settlementId] : null;
    if (!d.religionId && st && STAGE_OK.has(st.stage) && rng() < 0.002) { const r = createReligion(civ, ids, rng); d.religionId = r; makeEvent(civ, ids, { kind: "religion_founded", title: `${civ.religions[r].name}（${civ.religions[r].kind}）が生まれた`, participants: [{ entityId: g.id, role: "origin" }, { entityId: r, role: "religion" }], location: { cell: g.cell } }); }
    // 接触・伝播・混合（近隣のうち1つを、ときどき調べる）
    if (rng() < 0.03) {
      const ns = [...neighborGroups(ctx, g)]; if (!ns.length) continue; const o = civ.groups[ns[Math.floor(rng() * ns.length)]], od = dominant(o);
      if (od.cultureId !== d.cultureId) {
        const key = [d.cultureId, od.cultureId].sort().join("|");
        if (!civ.contacts[key]) { civ.contacts[key] = mi; makeEvent(civ, ids, { kind: "culture_contact", title: `${civ.cultures[d.cultureId].name}と${civ.cultures[od.cultureId].name}が出会った`, participants: [{ entityId: d.cultureId, role: "culture_a" }, { entityId: od.cultureId, role: "culture_b" }, { entityId: g.id, role: "place_a" }, { entityId: o.id, role: "place_b" }], location: { cell: g.cell } }); }
        if (mi - (g.lastMixAt ?? -999) >= 240 && rng() < 0.06 && (g.lastMixAt = mi, addCohort(g, od, 0.06))) makeEvent(civ, ids, { kind: "cohort_formed", title: "異なる文化の人々が混ざり合い始めた", participants: [{ entityId: g.id, role: "group" }, { entityId: od.cultureId, role: "culture" }], location: { cell: g.cell } });
      }
      if (d.religionId && od.religionId !== d.religionId && !od.religionId && rng() < 0.2) { od.religionId = d.religionId; makeEvent(civ, ids, { kind: "religion_spread", title: `${civ.religions[d.religionId].name}が広まった`, participants: [{ entityId: d.religionId, role: "religion" }, { entityId: o.id, role: "adopter" }, { entityId: g.id, role: "source" }], location: { cell: o.cell } }); }
    }
  }
}
