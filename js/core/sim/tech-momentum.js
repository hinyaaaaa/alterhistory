// 技術の機運（v2.6.0 B3）。技術水準は自動では進まない（v2.4.0 の決定）。そのうえで、史実らしさを出すために、
// 「時代の流れ」を通知する。条件を満たした国・分野に、月ごとに確率で「機運」が出る（隣国の段・世界の年）。
//   ・出たら年表（新聞）に載り、「採用する」を押すと、その国のその分野が +1 段になる（Undo 可）。押さなければ何も変わらない。
//   ・保存先: ext.data.techMomentum = { [国ID]: { [分野]: { target, via } } }（まだ採用していない機運）
// 純粋ロジック層：DOM に依存しない。
import { makeCommand } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { withEvent } from "../edit/history-log.js";
import { TECH_TRACKS, TECH_MAX, getTechDoctrine, planSetTechDoctrine } from "../edit/doctrines.js";
import { BALANCE } from "./balance.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const nm = (s) => s?.fullName ?? s?.name ?? "?";
/** 世界の年が、この段の機運を出してよい年か（目安。隣国が先に進んでいれば、年に関係なく出る） */
export const YEAR_GATE = (target) => (target - 1) * 60;
const trackOf = (key) => TECH_TRACKS.find((t) => t.key === key);

export const momentumTable = (map) => map?.ext?.data?.techMomentum ?? {};

/** 国ごとの隣国（国境を接する国）。保存された neighbors があればそれ、なければセルから求める */
export function neighborsOfStates(map) {
  const P = map.pack, C = P.cells, out = new Map();
  const add = (a, b) => { if (!a || !b || a === b) return; (out.get(a) ?? out.set(a, new Set()).get(a)).add(b); };
  if (C?.c && C.state) for (let i = 0; i < C.state.length; i++) { const a = C.state[i]; if (!a) continue; for (const j of C.c[i] ?? []) add(a, C.state[j]); }
  for (const s of P.states) if (isLive(s) && Array.isArray(s.neighbors)) for (const n of s.neighbors) if (n > 0) { add(s.i, n); add(n, s.i); }
  return out;
}

/** いま採用できる機運（まだ採用しておらず、次の段がその目標のもの）。国家タブの印と「採用する」に使う */
export function pendingFields(map, stateId) {
  const s = map.pack.states[stateId]; if (!isLive(s)) return [];
  const lv = getTechDoctrine(s), mine = momentumTable(map)[stateId] ?? {}, out = [];
  for (const t of TECH_TRACKS) { const m = mine[t.key]; if (m && m.target === lv[t.key] + 1 && m.target <= TECH_MAX) out.push({ field: t.key, label: t.label, target: m.target, step: t.steps[m.target - 1], via: m.via }); }
  return out;
}

export const momentumText = (field, target, via) => {
  const step = trackOf(field).steps[target - 1];
  return via === "neighbor" ? `隣国に「${step}」が広まり、${trackOf(field).label}の分野で取り入れる機運が高まっている` : `「${step}」の実用化が近いと言われている（${trackOf(field).label}）`;
};

/** この月に機運が出る国・分野を決める（地図は変更しない）。1国につき月に1件まで */
export function rollTechMomentum(map, rnd) {
  const year = map.worldTime?.year ?? 1, rate = BALANCE.momentumRate ?? 0.03, out = [];
  if (!(rate > 0)) return out;
  const nb = neighborsOfStates(map), lvs = new Map();
  const lvOf = (id) => lvs.get(id) ?? lvs.set(id, getTechDoctrine(map.pack.states[id])).get(id);
  for (const s of map.pack.states) {
    if (!isLive(s)) continue;
    const mine = lvOf(s.i), pend = momentumTable(map)[s.i] ?? {}, cands = [];
    for (const t of TECH_TRACKS) {
      const target = mine[t.key] + 1; if (target > TECH_MAX || pend[t.key]?.target === target) continue;
      const ahead = [...(nb.get(s.i) ?? [])].some((n) => isLive(map.pack.states[n]) && lvOf(n)[t.key] >= target);
      const via = ahead ? "neighbor" : year >= YEAR_GATE(target) ? "year" : null;
      if (via) cands.push({ field: t.key, target, via, p: via === "neighbor" ? rate : rate * 0.5 });
    }
    for (const c of cands) if (rnd.chance(c.p)) { out.push({ stateId: s.i, field: c.field, target: c.target, via: c.via }); break; }
  }
  return out;
}

const writeTable = (m, t) => { const x = ensureExt(m); if (Object.keys(t).length) x.data.techMomentum = t; else delete x.data.techMomentum; };
const withEntry = (table, stateId, field, val) => {
  const next = { ...table }, mine = { ...(next[stateId] ?? {}) };
  if (val) mine[field] = val; else delete mine[field];
  if (Object.keys(mine).length) next[stateId] = mine; else delete next[stateId];
  return next;
};

/** 機運を出す（年表に残る）。国・分野が不正なら null */
export function planTechMomentum(map, { stateId, field, target, via }, date) {
  const s = map.pack.states[stateId], t = trackOf(field);
  if (!isLive(s) || !t || !(target >= 2 && target <= TECH_MAX)) return null;
  const before = momentumTable(map), after = withEntry(before, stateId, field, { target, via });
  const cmd = makeCommand(`技術の機運（${nm(s)}）`, [], [{ apply: (m) => writeTable(m, after), revert: (m) => writeTable(m, before) }]);
  return withEvent(map, cmd, { type: "tech-momentum", title: `${nm(s)}: ${momentumText(field, target, via)}`, detail: `${t.label} ${target}段「${t.steps[target - 1]}」を採用できる`, date, states: [stateId], data: { field, target } });
}

/** 機運を採用する（その国の該当分野が +1 段。Undo 可）。採用できる機運が無ければ null */
export function planAdoptMomentum(map, stateId, field, date) {
  const s = map.pack.states[stateId], p = pendingFields(map, stateId).find((x) => x.field === field);
  if (!isLive(s) || !p) return null;
  const before = momentumTable(map), after = withEntry(before, stateId, field, null);
  const tech = planSetTechDoctrine(map, stateId, { [field]: p.target }); if (!tech) return null;
  const lvBefore = getTechDoctrine(s)[field];
  const cmd = makeCommand(`技術の機運を採用（${nm(s)}）`, tech.layers, [...tech.parts, { apply: (m) => writeTable(m, after), revert: (m) => writeTable(m, before) }]);
  return withEvent(map, cmd, { type: "tech", title: `${nm(s)}が${p.label}の「${p.step}」を採用した`, detail: `${p.label} ${lvBefore}段 → ${p.target}段（機運の採用）`, date, states: [stateId] });
}
