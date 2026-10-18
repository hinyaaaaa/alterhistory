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
  { key: "majority", label: "成人（親政の開始）", verb: "摂政を退き" },
]);
export const STABILITY = Object.freeze([{ key: "stable", label: "安定" }, { key: "dispute", label: "争いあり" }, { key: "chaos", label: "大きな混乱" }]);

export const leaderRecord = (map, id) => map.ext?.data?.leaders?.[id] ?? { current: null, history: [] };
const write = (m, all) => { ensureExt(m).data.leaders = all; };
const seqOf = (map) => map.ext?.data?.leaderSeq ?? 0;
const setSeq = (m, n) => { ensureExt(m).data.leaderSeq = n; };

export const leaderAge = (l, date) => Math.max(0, (date?.year ?? 1) - (l?.birthYear ?? 0));
/** 顔の設計図（id・世代・性別・年齢から決まる） */
export const faceOf = (l, date) => faceSpec({ id: l?.id ?? 0, gen: l?.gen ?? 1, gender: l?.gender ?? "m", age: leaderAge(l, date) });

// ---- v2.6.0 B5: 後継者・王朝名・摂政 ----
//   map.ext.data.heirs[国ID] = { name, gender, birthYear, family }（世襲の政体だけが持つ。継承のたびに、後継者がそのまま即位する）
//   世襲では姓（王朝名）を受け継ぐ。簒奪・征服で王朝が替わると、姓も替わる。
//   後継者が幼い（MAJORITY 歳未満）ときは、摂政が指導者を務める（Leader.regentFor に幼い君主を持つ）。成人すると親政に移る。
export const MAJORITY = 16;
const hereditaryOf = (st) => regimeOf(st).succession === "hereditary";
/** 姓（王朝名）。保存された family を優先し、無ければ「名・姓」の姓の部分 */
export const familyOf = (l) => l?.family ?? (String(l?.name ?? "").includes("・") ? String(l.name).split("・").slice(1).join("・") : "");
export const heirOf = (map, id) => map?.ext?.data?.heirs?.[id] ?? null;
const writeHeirs = (m, h) => { const x = ensureExt(m); if (h && Object.keys(h).length) x.data.heirs = h; else delete x.data.heirs; };
const personOf = (rnd, g, family) => { const p = generatePersonName(rnd, g); const f = family || p.family; return { given: p.given, family: f, full: `${p.given}・${f}` }; };
const newFamily = (rnd, g, avoid) => { let f = generatePersonName(rnd, g).family; for (let i = 0; i < 20 && f === avoid; i++) f = generatePersonName(rnd, g).family; return f; };
/** 現在の君主の後継者（世襲・君主が成人・摂政でないときだけ）。年は date */
function makeHeir(st, leader, when, rnd) {
  if (!hereditaryOf(st) || !leader || leader.regentFor) return null;
  const age = leaderAge(leader, when); if (age < 18) return null;
  const g = rnd.chance(0.3) ? "f" : "m", a = rnd.int(0, Math.max(0, Math.min(30, age - 18))), p = personOf(rnd, g, familyOf(leader));
  return { name: p.full, gender: g, birthYear: when.year - a, family: p.family };
}
/** 世襲の国に、後継者がいなければ置く（保存済みの記録として直接書く。年表には残さない）。置いた数を返す */
export function ensureHeirs(map, date = null) {
  const now = date ?? map.worldTime ?? { year: 1, month: 1 }, data = ensureExt(map).data; let n = 0;
  for (const st of map.pack.states) {
    if (!isLive(st) || !hereditaryOf(st)) continue;
    const l = data.leaders?.[st.i]?.current; if (!l || l.regentFor || data.heirs?.[st.i]) continue;
    const h = makeHeir(st, l, now, createRandom(st.i * 733 + now.year * 3 + 11)); if (!h) continue;
    data.heirs = data.heirs ?? {}; data.heirs[st.i] = h; n++;
  }
  return n;
}

/** 後継者の候補（まだ何も保存しない）。世襲では、後継者が先頭に来て、ほかは同じ王朝の人物。ユーザーはここから選ぶ */
export function leaderCandidates(map, stateId, { n = 3, seed = null, date = null } = {}) {
  const st = map.pack.states[stateId]; if (!isLive(st)) throw new Error("存在しない国家です");
  const now = date ?? map.worldTime ?? { year: 1, month: 1 };
  const rnd = createRandom(seed ?? (stateId * 977 + now.year * 13 + now.month + seqOf(map) * 31));
  const hereditary = hereditaryOf(st), fam = familyOf(leaderRecord(map, stateId).current), heir = hereditary ? heirOf(map, stateId) : null;
  const out = [];
  if (heir) out.push({ name: heir.name, gender: heir.gender, title: titleFor(st, heir.gender), age: leaderAge(heir, now), heir: true });
  while (out.length < n) {
    const gender = rnd.chance(hereditary ? 0.3 : 0.45) ? "f" : "m";
    const p = hereditary && fam ? personOf(rnd, gender, fam) : generatePersonName(rnd, gender);
    out.push({ name: p.full, gender, title: titleFor(st, gender), age: rnd.int(hereditary ? 22 : 38, hereditary ? 45 : 64) });
  }
  return out;
}

/** 摂政の終わり（幼い君主が成人する）か。成人する年の1月に、親政へ移す。移すなら {name, gender, title, age}、そうでなければ null */
export function rollRegencyEnd(map, stateId, date) {
  const l = leaderRecord(map, stateId).current, r = l?.regentFor; if (!r || date.month !== 1) return null;
  const age = date.year - r.birthYear; if (age < MAJORITY) return null;
  return { name: r.name, gender: r.gender, title: r.title, age };
}

/** 指導者の交代（確定まで何も残さない・Undo 1回）。name 省略で自動生成。title は性別と整合させる。
 *  世襲では、(1) 後継者がそのまま即位する（継承が安定のとき。争いがあれば、後継者以外が即位することもある）
 *  (2) 姓（王朝名）を受け継ぐ（簒奪・征服では新しい王朝） (3) 後継者が幼ければ、摂政が政務をとる */
export function planChangeLeader(map, stateId, { reason, title, name = "", gender, age, stability = "stable", date = null, rnd = null } = {}) {
  const st = map.pack.states[stateId]; if (!isLive(st)) throw new Error("存在しない国家です");
  const r = REASONS.find((x) => x.key === reason); if (!r) throw new Error("交代の理由を選んでください");
  const stab = STABILITY.find((x) => x.key === stability); if (!stab) throw new Error("継承の安定度を選んでください");
  if (title != null && !TITLES.includes(title)) throw new Error("称号を選んでください");
  const when = date ?? map.worldTime ?? { year: 1, month: 1 };
  const before = map.ext?.data?.leaders ?? {}, rec = leaderRecord(map, stateId), seq0 = seqOf(map);
  const heirsBefore = map.ext?.data?.heirs ?? {};
  const rr = rnd ?? createRandom(stateId * 31 + seq0 * 7 + when.year);
  const hereditary = hereditaryOf(st), heir = hereditary ? heirsBefore[stateId] ?? null : null;
  const prevFam = familyOf(rec.current), dynastyEnds = reason === "usurpation" || reason === "conquest", keepDyn = hereditary && !dynastyEnds && !!prevFam;
  const given = name.trim();
  // 摂政が退く・倒れたとき、幼い君主がまだ成人していなければ、新しい摂政が引き継ぐ
  const carry = rec.current?.regentFor && reason !== "majority" && !dynastyEnds && when.year - rec.current.regentFor.birthYear < MAJORITY ? rec.current.regentFor : null;
  const useHeir = !carry && !!heir && !dynastyEnds && reason !== "majority" && (given ? given === heir.name : stab.key === "stable" ? true : rr.chance(0.55));
  const child = carry ?? (useHeir && when.year - heir.birthYear < MAJORITY ? { name: heir.name, gender: heir.gender, birthYear: heir.birthYear, family: heir.family, title: titleFor(st, heir.gender) } : null);
  let g = gender ?? (title ? genderOfTitle(title) : "m"), t, nameFull, birthYear, family;
  if (title && gender && genderOfTitle(title) !== gender) throw new Error("称号と性別が合っていません");
  if (child && hereditary) { // 摂政
    g = rr.chance(0.5) ? "f" : "m"; family = keepDyn ? prevFam : newFamily(rr, g, prevFam);
    const p = personOf(rr, g, family); nameFull = p.full; t = g === "f" ? "女摂政" : "摂政"; birthYear = when.year - rr.int(28, 50);
  } else if (useHeir) { g = heir.gender; family = heir.family; nameFull = heir.name; birthYear = heir.birthYear; t = title ?? titleFor(st, g); }
  else {
    t = title ?? titleFor(st, g);
    if (given) { nameFull = given; family = familyOf({ name: given }); }
    else { family = keepDyn ? prevFam : hereditary && dynastyEnds ? newFamily(rr, g, prevFam) : null; const p = personOf(rr, g, family); nameFull = p.full; family = p.family; }
    birthYear = when.year - (age ?? rr.int(24, 55));
  }
  const gen = rec.history.length + (rec.current ? 1 : 0) + 1;
  const next = { id: seq0 + 1, name: nameFull, gender: g, birthYear, since: { ...when }, title: t, reason: r.key, stability: stab.key, gen, ...(family ? { family } : {}), ...(child && hereditary ? { regentFor: { name: child.name, gender: child.gender, birthYear: child.birthYear, family: child.family ?? familyOf({ name: child.name }), title: child.title ?? titleFor(st, child.gender) } } : {}) };
  const hist = rec.current ? [...rec.history, { ...rec.current, until: { ...when } }] : rec.history;
  const after = { ...before, [stateId]: { current: next, history: hist } };
  const heirsAfter = { ...heirsBefore };
  if (!hereditary || next.regentFor) delete heirsAfter[stateId];
  else { const h = makeHeir(st, next, when, createRandom(seq0 * 101 + stateId * 17 + when.year)); if (h) heirsAfter[stateId] = h; else delete heirsAfter[stateId]; }
  const cmd = makeCommand(`指導者の交代（${nm(st)}）`, [], [{
    apply: (m) => { write(m, after); setSeq(m, seq0 + 1); writeHeirs(m, heirsAfter); },
    revert: (m) => { const x = ensureExt(m); if (Object.keys(before).length) x.data.leaders = before; else delete x.data.leaders; if (seq0) x.data.leaderSeq = seq0; else delete x.data.leaderSeq; writeHeirs(m, heirsBefore); },
  }]);
  const prev = rec.current ? `${rec.current.title}${rec.current.name}が${r.verb}、` : "";
  const head = `${epithet(st)}${nm(st)}で${prev}`;
  const evTitle = next.regentFor ? `${head}${next.title}${next.name}が、幼い${next.regentFor.title}${next.regentFor.name}に代わって政務をとる`
    : reason === "majority" ? `${head}${next.title}${next.name}が成人し、親政を始めた` : `${head}${next.title}${next.name}が即位`;
  const detail = `理由: ${r.label} / 継承: ${stab.label}${next.regentFor ? ` / 摂政（${next.regentFor.birthYear + MAJORITY}年まで）` : ""}${useHeir && !next.regentFor ? " / 後継者が即位" : ""}${family && hereditary ? ` / 王朝: ${family}` : ""}`;
  return withEvent(map, cmd, { type: "succession", title: evTitle, detail, date: when, states: [stateId] });
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
  ensureHeirs(map, now);
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
