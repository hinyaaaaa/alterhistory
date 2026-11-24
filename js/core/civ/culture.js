// V5-M2: 文化・言語・宗教の発生・分化・接触（世界のレジストリ `civ.cultures/languages/religions`）。
// 系統（parent）を持ち、分化は親からの派生として残る。接触は最初の1回だけ記録する（文化の組ごと）。
import { makeEvent } from "./events.js";
import { dominant, addCohort } from "./cohorts.js";
import { neighborGroups } from "./spatial.js";
import { sectName } from "../wcde/domains/naming.js";
import { groupStage } from "./settlements.js"; // v7.0.0

const SYL = ["カ", "ロ", "ミ", "タ", "ス", "ネ", "ヴォ", "リ", "アン", "ハ", "ド", "レ", "ユ", "サ", "キ", "ノ", "ベ", "グ", "マ", "ジ", "ラ", "オ", "ト", "シェ"];
export const makeNameJa = (rng) => { const n = 3 + (rng() < 0.5 ? 1 : 0); /* v6.7.0: 長めの名前（3〜4 音節） */ let s = ""; for (let i = 0; i < n; i++) s += SYL[Math.floor(rng() * SYL.length)]; return s; };
export const RELIGION_KINDS = Object.freeze(["精霊信仰", "祖霊信仰", "太陽信仰", "大地母神", "多神教", "一神教"]);

export function createCulture(civ, ids, rng, { parent = null, cell = null } = {}) {
  const id = ids.next("culture"); civ.cultures[id] = { id, name: makeNameJa(rng) + "人", parent, bornAt: civ.monthIndex, cell }; return id;
}
export function createLanguage(civ, ids, rng, { parent = null, cultureId = null } = {}) {
  const id = ids.next("lang"); civ.languages[id] = { id, name: makeNameJa(rng) + "語", parent, bornAt: civ.monthIndex, cultureId }; return id;
}
export function createReligion(civ, ids, rng, { parent = null, kind = null } = {}) {
  const id = ids.next("religion"); civ.religions[id] = { id, name: parent && civ.religions[parent] ? sectName(civ.religions[parent].name, makeNameJa(rng)) : makeNameJa(rng) + "教", kind: kind ?? RELIGION_KINDS[Math.floor(rng() * RELIGION_KINDS.length)], parent, bornAt: civ.monthIndex }; return id;
}
const STAGE_OK = new Set(["town", "city"]);
// v6.20.1: 月ごと・集団ごとの確率。文化 0.00007（v6.20.0 は 0.0002）／言語は文化とともに 0.5／言語だけは孤立したときに 0.00002（v6.20.0 は 0.0003 で、文化の分化の 1.5 倍だった）
const CULTURE_SPLIT = 0.00007, LANG_WITH_CULTURE = 0.5, LANG_DRIFT = 0.00002;
const isolated = (ctx, g, lang) => { for (const o of neighborGroups(ctx, g)) { const og = ctx.civ.groups[o]; if (og && dominant(og).languageId === lang) return false; } return true; };
/** 月次（culture フェーズ）: 言語・文化の分化、宗教の発生と伝播、文化の接触と混合 */
export function stepCulture(ctx) {
  const { world, civ, ids, rng } = ctx, mi = civ.monthIndex;
  for (const id in civ.groups) {
    const g = civ.groups[id], d = dominant(g), age = mi - g.bornAt;
    // v6.20.1: 言語は文化より変わりにくい。文化が分かれるときに言葉も分かれることが多く、文化と関係なく言葉だけが分かれるのは、ほかの集団と離れて長く孤立したときだけ
    // 文化の分化
    if (age > 360 && g.pop > 400 && rng() < CULTURE_SPLIT) {
      const old = d.cultureId, nc = createCulture(civ, ids, rng, { parent: old, cell: g.cell }); d.cultureId = nc;
      const ce = makeEvent(civ, ids, { kind: "culture_diverged", title: `${civ.cultures[old].name}から新しい文化が分かれた`, participants: [{ entityId: g.id, role: "bearers" }, { entityId: nc, role: "culture" }, { entityId: old, role: "parent_culture" }], location: { cell: g.cell }, why: `集団ができて${Math.floor(age / 12)}年、人口${Math.round(g.pop)}人になり、土地の暮らしに合わせた独自の習わしが定まった` });
      if (rng() < LANG_WITH_CULTURE) { const ol = d.languageId, nl = createLanguage(civ, ids, rng, { parent: ol, cultureId: nc }); d.languageId = nl; makeEvent(civ, ids, { kind: "language_diverged", title: `${civ.languages[ol].name}から新しい言語が分かれた`, participants: [{ entityId: g.id, role: "speakers" }, { entityId: nl, role: "language" }, { entityId: ol, role: "parent_language" }], location: { cell: g.cell }, causes: [{ targetId: ce.eventId, relation: "part_of", basis: "direct" }], why: "文化が分かれるとき、言葉も分かれた" }); }
    }
    // 言語だけの分化（孤立が長いとき）
    else if (age > 360 && rng() < LANG_DRIFT && isolated(ctx, g, d.languageId)) { const old = d.languageId, nl = createLanguage(civ, ids, rng, { parent: old, cultureId: d.cultureId }); d.languageId = nl; makeEvent(civ, ids, { kind: "language_diverged", title: `${civ.languages[old].name}から新しい言語が分かれた`, participants: [{ entityId: g.id, role: "speakers" }, { entityId: nl, role: "language" }, { entityId: old, role: "parent_language" }], location: { cell: g.cell }, why: `同じ言葉を話す近隣がなく、${Math.floor(age / 12)}年のあいだ孤立して言葉が変わった` }); }
    // 宗教の発生（町以上の集落で）
    const st = g.settlementId ? civ.settlements[g.settlementId] : null;
    if (!d.religionId && st && STAGE_OK.has(groupStage(civ, g)) && rng() < 0.002) { const r = createReligion(civ, ids, rng); d.religionId = r; makeEvent(civ, ids, { kind: "religion_founded", title: `${civ.religions[r].name}（${civ.religions[r].kind}）が生まれた`, participants: [{ entityId: g.id, role: "origin" }, { entityId: r, role: "religion" }], location: { cell: g.cell }, why: "町以上の集落ができ、信仰が形を取った" }); }
    // 接触・伝播・混合（近隣のうち1つを、ときどき調べる）
    if (rng() < 0.03) {
      const ns = [...neighborGroups(ctx, g)]; if (!ns.length) continue; const o = civ.groups[ns[Math.floor(rng() * ns.length)]]; if (!o) continue; /* v6.11.0: 近隣の一覧に、すでに無い集団が残ることがある */ const od = dominant(o);
      if (od.cultureId !== d.cultureId) {
        const key = [d.cultureId, od.cultureId].sort().join("|");
        if (!civ.contacts[key]) { civ.contacts[key] = mi; makeEvent(civ, ids, { kind: "culture_contact", title: `${civ.cultures[d.cultureId].name}と${civ.cultures[od.cultureId].name}が出会った`, participants: [{ entityId: d.cultureId, role: "culture_a" }, { entityId: od.cultureId, role: "culture_b" }, { entityId: g.id, role: "place_a" }, { entityId: o.id, role: "place_b" }], location: { cell: g.cell }, why: "二つの文化の集団の領域が、はじめて接した" }); }
        if (mi - (g.lastMixAt ?? -999) >= 240 && rng() < 0.06 && (g.lastMixAt = mi, addCohort(g, od, 0.06))) makeEvent(civ, ids, { kind: "cohort_formed", title: "異なる文化の人々が混ざり合い始めた", participants: [{ entityId: g.id, role: "group" }, { entityId: od.cultureId, role: "culture" }], location: { cell: g.cell }, why: "領域が接した別の文化の人々と、行き来や婚姻が続いた" });
      }
      if (d.religionId && od.religionId !== d.religionId && !od.religionId && rng() < 0.2) { od.religionId = d.religionId; makeEvent(civ, ids, { kind: "religion_spread", title: `${civ.religions[d.religionId].name}が広まった`, participants: [{ entityId: d.religionId, role: "religion" }, { entityId: o.id, role: "adopter" }, { entityId: g.id, role: "source" }], location: { cell: o.cell }, why: "近隣の集団の信仰が、宗教を持たない集団に伝わった" }); }
    }
  }
}
