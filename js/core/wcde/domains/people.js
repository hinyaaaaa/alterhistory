// v6 M4: 人物・家系・都市。重要な人物（指導者）に 経歴・家系・所属を持たせ、継承は家系の事実として残す。
//   ・実際に起きたことだけを持つ: 親族は、シミュレーションが「継承者を立てた」ときに生まれた子だけ（誰かの子だったと後から作らない）。
//   ・知られていない系統は parents=null（未知）。出自は捏造しない。
//   ・出来事と結びつく: 指導者の交代・王朝の交代・政変は、イベントとして残り、人物から辿れる。
import { hashSeed } from "../../civ/civ-state.js";
import { makeEvent } from "../../civ/events.js";
import { ensureProfile, nameFor, languageOfGroup } from "./language.js";

const AGE_MIN = 14 * 12;
/** 人物を作る（civ.figures）。parents は既知の親の人物ID（なければ null＝未知） */
export function createFigure(ctx, st, { name, bornAt, houseId, parents = null, role = "leader", cause = null }) {
  const { civ, ids } = ctx, id = ids.next("person"), f = { id, name, bornAt, diedAt: null, role, stateId: st.id, houseId, parents, children: [], speciesId: civ.groups[st.capitalGroupId]?.speciesId ?? "human", history: [{ at: civ.monthIndex, kind: "appeared", stateId: st.id }] };
  (civ.figures ??= {})[id] = f; return f;
}
const newHouse = (ctx, st, founder) => { const { civ, ids } = ctx; const id = ids.next("house"); (civ.houses ??= {})[id] = { id, name: `${founder.name}家`, foundedAt: civ.monthIndex, stateId: st.id, founderId: founder.id }; return id; };

/** 国家の現在の指導者に人物を結びつける。後継の手順（継承者の誕生・登位・簒奪）をここで事実として残す */
export function stepPeople(ctx) {
  const { civ, ids } = ctx, mi = civ.monthIndex; if (!civ.options.wcde) return; civ.figures ??= {}; civ.houses ??= {};
  for (const st of Object.values(civ.states)) {
    if (!st.alive) continue; const L = st.leader; let cur = st.leaderFigureId ? civ.figures[st.leaderFigureId] : null;
    const heirFig = st.heirFigureId ? civ.figures[st.heirFigureId] : null;
    // 指導者が代わった（名前・生年が合わない、または政変で退けられた）
    if (cur && (cur.name !== L.name || cur.bornAt !== L.bornAt || L.deposed)) {
      const succeeded = heirFig && heirFig.diedAt == null && L.heirTaken !== false && !L.deposed && cur.diedAt == null;
      cur.diedAt = mi; cur.history.push({ at: mi, kind: L.deposed ? "deposed" : "left_office" });
      if (heirFig && heirFig.diedAt == null && !L.deposed) { // 継承者が登位する: 指導者の名前・生年を継承者に合わせる（実際に生まれていた人物）
        L.name = heirFig.name; L.bornAt = heirFig.bornAt; cur = heirFig; st.leaderFigureId = heirFig.id; cur.history.push({ at: mi, kind: "enthroned", stateId: st.id }); st.heirFigureId = null; L.heir = false;
        makeEvent(civ, ids, { kind: "succession_by_heir", title: `${st.name}で、${cur.name}が父祖${civ.figures[cur.parents?.[0]]?.name ?? ""}の跡を継いだ`, participants: [{ entityId: st.id, role: "state" }, { entityId: cur.id, role: "successor" }, ...(cur.parents ? [{ entityId: cur.parents[0], role: "predecessor" }] : [])], provenance: "simulation" });
        continue;
      }
      const old = cur; cur = null; L.deposed = false; // 新しい指導者（別の家系）
      const nf = createFigure(ctx, st, { name: L.name, bornAt: L.bornAt, houseId: null }); nf.houseId = newHouse(ctx, st, nf); st.leaderFigureId = nf.id; st.heirFigureId = null;
      const ev = makeEvent(civ, ids, { kind: "dynasty_changed", title: `${st.name}で王朝（家系）が代わった（${old.name}家から${nf.name}家へ）`, participants: [{ entityId: st.id, role: "state" }, { entityId: old.id, role: "predecessor" }, { entityId: nf.id, role: "successor" }], effects: [{ targetId: st.id, property: "leader.houseId", before: old.houseId, after: nf.houseId }], provenance: "simulation" });
      continue;
    }
    if (!cur) { const f = createFigure(ctx, st, { name: L.name, bornAt: L.bornAt, houseId: null }); f.houseId = newHouse(ctx, st, f); st.leaderFigureId = f.id; cur = f; }
    // 継承者の指名（v5 の heir フラグ）: 指導者に実際の子が生まれる。出生は継承者として指名された時点の事実
    if (L.heir && !st.heirFigureId && cur.diedAt == null) {
      const grp = civ.groups[st.capitalGroupId], lang = languageOfGroup(grp), r = ctx.rng, ageGap = Math.max(AGE_MIN, 20 * 12 + Math.floor(r() * 120)), born = Math.min(mi - 12, cur.bornAt + ageGap);
      const child = createFigure(ctx, st, { name: (lang && civ.languages[lang] ? nameFor(civ, r, lang, "person") : null) ?? `${L.name}の子`, bornAt: born, houseId: cur.houseId, parents: [cur.id], role: "heir" });
      cur.children.push(child.id); st.heirFigureId = child.id;
      makeEvent(civ, ids, { kind: "heir_named", title: `${st.name}の${cur.name}が継承者${child.name}を定めた`, participants: [{ entityId: st.id, role: "state" }, { entityId: cur.id, role: "parent" }, { entityId: child.id, role: "heir" }], provenance: "simulation" });
    }
  }
}
/** 過去の時点の人物（生没で判定）。history の過去復元と同じ考え方 */
export const figuresAt = (civ, month) => Object.values(civ.figures ?? {}).filter((f) => f.history[0].at <= month && (f.diedAt == null || f.diedAt > month));
/** 家系を辿る（祖先）。知られている親だけ */
export function ancestorsOf(civ, id) { const out = []; let cur = civ.figures?.[id]; while (cur?.parents) { const p = civ.figures[cur.parents[0]]; if (!p) break; out.push(p.id); cur = p; } return out; }

/** 都市の一覧（集落の段階が町・都市のもの）と、その属性（国家・交易・資源）。名前は言語から */
export function listCities(ctx) {
  const { world, civ } = ctx, ce = world.cell, out = [];
  for (const s of Object.values(civ.settlements)) {
    if (s.stage === "village") continue; const g = civ.groups[s.groupId]; if (!g) continue;
    const st = g.stateId ? civ.states[g.stateId] : null;
    out.push({ id: s.id, name: s.name ?? null, stage: s.stage, pop: s.pop, cell: s.cell, stateId: st?.id ?? null, coastal: ce.coastDist[s.cell] <= 1, river: !!ce.river[s.cell], resource: ce.resource ? ce.resource[s.cell] : 0, trade: st ? Object.values(st.econ?.trade ?? {}).reduce((a, b) => a + b, 0) : 0 });
  }
  return out.sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1));
}
/** 月次: 町以上になった集落に、その土地の言語で名前を付ける（一度だけ。付いた名前は変わらない） */
export function stepCities(ctx) {
  const { civ } = ctx; if (!civ.options.wcde || civ.monthIndex % 12 !== 0) return;
  for (const s of Object.values(civ.settlements)) {
    if (s.name || s.stage === "village") continue; const g = civ.groups[s.groupId]; const lang = languageOfGroup(g); if (!lang) continue;
    s.name = nameFor(civ, ctx.rng, lang, "place") ?? null;
  }
}
