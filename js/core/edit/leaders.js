// 指導者（旧「君主」を統合）。国ごとに現在の指導者と歴代の記録を持つ。
//   map.ext.data.leaders[国ID] = { current: Leader|null, history: Leader[] }
//   Leader = { id, name, gender: "m"|"f", birthYear, since:{year,month}, until?, title, reason, stability, gen }
//   顔は id と世代から決まる（face.js）。ユーザーが顔を直接変える操作は無い。性別と名前・称号は整合させる。
//   交代は、在任年数・死去などから自動で起こる（rollSuccession）。ユーザーは候補から選べる（leaderCandidates）。
// 純粋ロジック層：DOM に依存しない。
import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";
import { withEvent } from "./history-log.js";
import { epithet } from "./world-info.js";
import { REGIMES, regimeOf } from "./regimes.js";
import { generatePersonName } from "../names/person.js";
import { faceSpec } from "./face.js";
import { createRandom } from "../random.js";

const nm = (s) => s?.fullName ?? s?.name ?? "?";
const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;

export const TITLES = Object.freeze([...new Set([...REGIMES.flatMap((r) => r.titles), "大公", "首長", "摂政"])]);
export const FEMALE_TITLES = Object.freeze(new Set(REGIMES.map((r) => r.titles[1]).concat(["女大公", "女首長", "女摂政"])));
export const genderOfTitle = (title) => (FEMALE_TITLES.has(title) || /^女|女性|母$/.test(title) ? "f" : "m");
export const titleFor = (state, gender) => regimeOf(state).titles[gender === "f" ? 1 : 0];

export const REASONS = Object.freeze([
  { key: "founding", label: "建国", verb: "退き" }, { key: "death", label: "死去", verb: "死去し" }, { key: "abdication", label: "退位", verb: "退位し" }, { key: "deposition", label: "廃位", verb: "廃位され" },
  { key: "usurpation", label: "簒奪", verb: "倒され" }, { key: "election", label: "選出", verb: "任期を終え" }, { key: "conquest", label: "征服", verb: "征服され" },
]);
export const STABILITY = Object.freeze([{ key: "stable", label: "安定" }, { key: "dispute", label: "争いあり" }, { key: "chaos", label: "大きな混乱" }]);

export const leaderRecord = (map, id) => map.ext?.data?.leaders?.[id] ?? { current: null, history: [] };
const write = (m, all) => { ensureExt(m).data.leaders = all; };
const seqOf = (map) => map.ext?.data?.leaderSeq ?? 0;
const setSeq = (m, n) => { ensureExt(m).data.leaderSeq = n; };

export const leaderAge = (l, date) => Math.max(0, (date?.year ?? 1) - (l?.birthYear ?? 0));
/** 顔の設計図（id・世代・性別・年齢から決まる） */
export const faceOf = (l, date) => faceSpec({ id: l?.id ?? 0, gen: l?.gen ?? 1, gender: l?.gender ?? "m", age: leaderAge(l, date) });

/** 後継者の候補（まだ何も保存しない）。ユーザーはここから選ぶ */
export function leaderCandidates(map, stateId, { n = 3, seed = null, date = null } = {}) {
  const st = map.pack.states[stateId]; if (!isLive(st)) throw new Error("存在しない国家です");
  const now = date ?? map.worldTime ?? { year: 1, month: 1 };
  const rnd = createRandom(seed ?? (stateId * 977 + now.year * 13 + now.month + seqOf(map) * 31));
  const hereditary = regimeOf(st).succession === "hereditary";
  const out = [];
  for (let i = 0; i < n; i++) {
    const gender = rnd.chance(hereditary ? 0.3 : 0.45) ? "f" : "m";
    const p = generatePersonName(rnd, gender);
    out.push({ name: p.full, gender, title: titleFor(st, gender), age: rnd.int(hereditary ? 22 : 38, hereditary ? 45 : 64) });
  }
  return out;
}

/** 指導者の交代（確定まで何も残さない・Undo 1回）。name 省略で自動生成。title は性別と整合させる */
export function planChangeLeader(map, stateId, { reason, title, name = "", gender, age, stability = "stable", date = null, rnd = null } = {}) {
  const st = map.pack.states[stateId]; if (!isLive(st)) throw new Error("存在しない国家です");
  const r = REASONS.find((x) => x.key === reason); if (!r) throw new Error("交代の理由を選んでください");
  const stab = STABILITY.find((x) => x.key === stability); if (!stab) throw new Error("継承の安定度を選んでください");
  if (title != null && !TITLES.includes(title)) throw new Error("称号を選んでください");
  const when = date ?? map.worldTime ?? { year: 1, month: 1 };
  const g = gender ?? (title ? genderOfTitle(title) : "m");
  if (title && gender && genderOfTitle(title) !== gender) throw new Error("称号と性別が合っていません");
  const t = title ?? titleFor(st, g);
  const before = map.ext?.data?.leaders ?? {}, rec = leaderRecord(map, stateId), seq0 = seqOf(map);
  const rr = rnd ?? createRandom(stateId * 31 + seq0 * 7 + when.year);
  const nameFull = name.trim() || generatePersonName(rr, g).full;
  const gen = rec.history.length + (rec.current ? 1 : 0) + 1;
  const next = { id: seq0 + 1, name: nameFull, gender: g, birthYear: when.year - (age ?? rr.int(24, 55)), since: { ...when }, title: t, reason: r.key, stability: stab.key, gen };
  const hist = rec.current ? [...rec.history, { ...rec.current, until: { ...when } }] : rec.history;
  const after = { ...before, [stateId]: { current: next, history: hist } };
  const cmd = makeCommand(`指導者の交代（${nm(st)}）`, [], [{
    apply: (m) => { write(m, after); setSeq(m, seq0 + 1); },
    revert: (m) => { const x = ensureExt(m); if (Object.keys(before).length) x.data.leaders = before; else delete x.data.leaders; if (seq0) x.data.leaderSeq = seq0; else delete x.data.leaderSeq; },
  }]);
  const prev = rec.current ? `${rec.current.title}${rec.current.name}が${r.verb}、` : "";
  return withEvent(map, cmd, { type: "succession", title: `${epithet(st)}${nm(st)}で${prev}${next.title}${next.name}が即位`, detail: `理由: ${r.label} / 継承: ${stab.label}`, date: when, states: [stateId] });
}

/** 指導者のいない国に、初代の指導者を置く（保存済みの記録として直接書く。年表には残さない） */
export function ensureLeaders(map, date = null) {
  const now = date ?? map.worldTime ?? { year: 1, month: 1 };
  const data = ensureExt(map).data; data.leaders = data.leaders ?? {}; let n = data.leaderSeq ?? 0, added = 0;
  for (const st of map.pack.states) {
    if (!isLive(st) || data.leaders[st.i]?.current) continue;
    const rnd = createRandom(st.i * 1291 + 7), g = rnd.chance(0.2) ? "f" : "m";
    const rec = data.leaders[st.i] ?? { current: null, history: [] };
    rec.current = { id: ++n, name: generatePersonName(rnd, g).full, gender: g, birthYear: now.year - rnd.int(30, 60), since: { year: Math.max(1, now.year - rnd.int(0, 12)), month: 1 }, title: titleFor(st, g), reason: "death", stability: "stable", gen: rec.history.length + 1 };
    data.leaders[st.i] = rec; added++;
  }
  data.leaderSeq = n;
  return added;
}

/** 旧データ（data.monarchs）を指導者に移す。性別は称号から、生年は即位年から推定する */
export function migrateMonarchs(map) {
  const data = map.ext?.data; if (!data?.monarchs) return 0;
  let n = data.leaderSeq ?? 0; const leaders = data.leaders ?? {};
  const conv = (m, count) => ({ id: ++n, name: m.name, gender: genderOfTitle(m.title ?? "王"), birthYear: (m.since?.year ?? 1) - 28, since: m.since, ...(m.until ? { until: m.until } : {}), title: m.title ?? "王", reason: m.reason ?? "death", stability: m.stability ?? "stable", gen: count });
  let moved = 0;
  for (const [sid, rec] of Object.entries(data.monarchs)) {
    const hist = (rec.history ?? []).map((m, i) => conv(m, i + 1));
    leaders[sid] = { current: rec.current ? conv(rec.current, hist.length + 1) : null, history: hist }; moved++;
  }
  data.leaders = leaders; data.leaderSeq = n; delete data.monarchs;
  return moved;
}

/** その月に指導者が交代するか（在任年数・年齢・政体から）。起こるなら {reason, stability}、起こらなければ null */
export function rollSuccession(map, stateId, date, rnd) {
  const st = map.pack.states[stateId]; const l = leaderRecord(map, stateId).current;
  if (!isLive(st) || !l) return null;
  const reg = regimeOf(st), age = leaderAge(l, date), tenure = date.year - l.since.year;
  const death = 0.0002 + Math.max(0, age - 55) * 0.00022;
  if (rnd.chance(death)) return { reason: "death", stability: reg.succession === "hereditary" ? rnd.weighted(["stable", "dispute", "chaos"], [85, 12, 3]) : "stable" };
  if (reg.succession === "hereditary" || reg.succession === "life") {
    if (age > 68 && rnd.chance(0.002)) return { reason: "abdication", stability: "stable" };
    if (rnd.chance(l.stability === "chaos" ? 0.002 : 0.0003)) return { reason: "deposition", stability: "dispute" };
    return null;
  }
  const [lo, hi] = reg.term ?? [4, 8], term = lo + ((l.id * 7) % (hi - lo + 1));
  if (tenure >= term && date.month === (l.since.month ?? 1)) {
    if (reg.succession === "elected") return { reason: "election", stability: "stable" };
    return rnd.chance(reg.key === "junta" ? 0.5 : 0.15) ? { reason: "usurpation", stability: "dispute" } : { reason: "abdication", stability: "stable" };
  }
  return null;
}
