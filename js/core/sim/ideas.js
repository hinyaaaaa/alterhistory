// 思想の攪拌（v2.7.0）。制度（税率・徴兵率・政体）は自動では動かさない。そのかわり、国ごとの「思潮」が、
// 国内の事情（都市化・通信・戦争・飢え）で育ち、隣国どうしで混ざり合い、出来事の起きやすさと技術の進みに効く。
//   ・思潮 6つ（0〜1）: 啓蒙・自由主義・民族主義・平等・保守・信仰の復興
//   ・毎月: 国内の事情へ少しずつ寄る ＋ 隣国と混ざる（接触が多いほど速い）＋ ゆらぎ
//   ・ある思潮が高い水準を越えたとき、年表に「広まった」と載る（税率・徴兵率・政体は変えない）
//   ・保存先: ext.data.ideas = { [国ID]: { enlight, liberal, nation, equal, tradition, faith } }
// 純粋ロジック層：DOM に依存しない。乱数は注入する。
import { makeCommand } from "../edit/commands.js";
import { ensureExt } from "../edit/ext.js";
import { withEvent } from "../edit/history-log.js";
import { regimeOf } from "../edit/regimes.js";
import { neighborsOfStates } from "./tech-momentum.js";
import { getIndicators } from "./pressure.js";
import { BALANCE } from "./balance.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const nm = (s) => s?.fullName ?? s?.name ?? "?";

export const IDEAS = Object.freeze([
  { key: "enlight", label: "啓蒙・合理主義", desc: "学問と印刷が広まり、迷信より理性を重んじる。技術の進みを助ける", rise: "啓蒙の思想が広まり、学問と議論が盛んになった" },
  { key: "liberal", label: "自由主義・立憲", desc: "権利と議会を求める。選挙・政権交代が起きやすくなる", rise: "自由と権利を求める思想が広まった" },
  { key: "nation", label: "民族主義", desc: "国と民族の一体感。国境の小競り合いが起きやすくなる", rise: "民族の一体感を求める思想が広まった" },
  { key: "equal", label: "平等・社会主義", desc: "貧しさへの怒り。ストライキ・暴動が起きやすくなる", rise: "平等を求める思想が労働者や貧しい人々に広まった" },
  { key: "tradition", label: "保守・伝統", desc: "古い秩序を守る。技術の進みをやや遅らせ、治安は保たれやすい", rise: "古い秩序と伝統を重んじる声が強まった" },
  { key: "faith", label: "信仰の復興", desc: "苦難のあとに信仰が高まる。信仰の復興の出来事が起きやすくなる", rise: "苦難のなかで信仰が見直され、信徒が増えた" },
]);
export const IDEA_KEYS = IDEAS.map((i) => i.key);
export const IDEA_BY_KEY = Object.fromEntries(IDEAS.map((i) => [i.key, i]));
/** 年表に載せる水準（上へ越えたとき） */
export const IDEA_NOTABLE = 0.6;

export const ideaTable = (map) => map?.ext?.data?.ideas ?? {};
const writeTable = (m, t, n = null) => { const x = ensureExt(m); if (Object.keys(t).length) x.data.ideas = t; else delete x.data.ideas; if (n) { if (Object.keys(n).length) x.data.ideaNotified = n; else delete x.data.ideaNotified; } };
/** 年表に載せ済みの思潮（国ごと）。水準が下がる（0.5 未満）まで、同じ思潮は載せない（閾値のまわりで何度も載るのを避ける） */
export const ideaNotified = (map) => map?.ext?.data?.ideaNotified ?? {};

/** 国の事情から決まる「寄っていく先」。ind は pressure.js の指標 */
export function ideaTargets(state, ind) {
  const urb = ind?.urbanShare ?? 0.2, comms = (ind?.lv?.comms ?? 3), med = (ind?.lv?.medicine ?? 3), indL = (ind?.lv?.ind ?? 3);
  const st = ind?.stress ?? { food: 0, health: 0, order: 0, fiscal: 0 }, war = ind?.war ?? 0;
  const reg = state ? regimeOf(state).key : "absolute";
  const auth = ["junta", "nationalist", "party", "anarchy"].includes(reg), theo = reg === "theocracy";
  const enlight = clamp(0.05 + 0.05 * comms + 0.35 * urb + 0.02 * med, 0, 1);
  const liberal = clamp(0.05 + 0.3 * urb + 0.03 * comms - 0.3 * war - (auth ? 0.15 : 0) + (["democracy", "presidential", "constitutional"].includes(reg) ? 0.15 : 0), 0, 1);
  const nation = clamp(0.12 + 0.5 * war + 0.03 * comms + (reg === "nationalist" ? 0.3 : 0), 0, 1);
  const equal = clamp(0.08 + 0.45 * clamp(st.food + st.order, 0, 1.2) + 0.3 * urb * (indL >= 4 ? 1 : 0.3) + (reg === "party" ? 0.2 : 0), 0, 1);
  const tradition = clamp(0.78 - 0.5 * (enlight + liberal) / 2 - 0.3 * urb + (reg === "absolute" || theo || reg === "tribal" ? 0.1 : 0), 0, 1);
  const faith = clamp(0.25 + (theo ? 0.4 : 0) + 0.35 * clamp((st.health + st.food) / 2, 0, 1) - 0.3 * enlight, 0, 1);
  return { enlight, liberal, nation, equal, tradition, faith };
}

/** 国の思潮。まだ保存されていなければ、国の事情から決めた初期値 */
export function ideasOf(map, stateId, ind = null) {
  const saved = ideaTable(map)[stateId]; if (saved) return { ...Object.fromEntries(IDEA_KEYS.map((k) => [k, 0.2])), ...saved };
  const s = map.pack.states[stateId];
  return Object.fromEntries(Object.entries(ideaTargets(s, ind ?? getIndicators(map).get(stateId))).map(([k, v]) => [k, r3(v)]));
}

/** 技術の進みへの効き（掛け合わせの項に足す）。啓蒙は促し、保守は遅らせる */
export const ideaTechBonus = (ideas) => 0.3 * (ideas?.enlight ?? 0.2) - 0.15 * (ideas?.tradition ?? 0.5) + 0.075;

/** 思潮の一番強いもの（表示用） */
export const dominantIdea = (ideas) => IDEAS.map((i) => ({ ...i, v: ideas?.[i.key] ?? 0 })).sort((a, b) => b.v - a.v)[0];

/**
 * 1か月ぶんの思潮の更新を作る。変化が無ければ null。
 * @returns {{command:object, notable:{stateId:number,key:string}[]}|null}
 */
export function planIdeasMonth(map, date, rnd) {
  const inds = getIndicators(map, date), nb = neighborsOfStates(map), live = map.pack.states.filter(isLive);
  if (!live.length) return null;
  const before = ideaTable(map), nBefore = ideaNotified(map), nAfter = {}, cur = new Map(live.map((s) => [s.i, ideasOf(map, s.i, inds.get(s.i))]));
  const mix = (BALANCE.ideasMix ?? 1), next = {}, notable = [];
  for (const s of live) {
    const mine = cur.get(s.i), tgt = ideaTargets(s, inds.get(s.i)), out = {};
    const neigh = [...(nb.get(s.i) ?? [])].filter((n) => cur.has(n));
    const atWar = new Set(); // 交戦中の相手とは、民族主義以外は混ざらない
    for (const w of map.ext?.data?.wars ?? []) { if (!w || w.endedAt || w.ended || w.status === "ended") continue; const A = w.attackers ?? [], D = w.defenders ?? []; if (A.includes(s.i)) D.forEach((x) => atWar.add(x)); if (D.includes(s.i)) A.forEach((x) => atWar.add(x)); }
    for (const k of IDEA_KEYS) {
      let v = mine[k] + (tgt[k] - mine[k]) * 0.02;
      if (neigh.length && mix > 0) {
        let pull = 0, n = 0;
        for (const o of neigh) {
          if (atWar.has(o) && k !== "nation") continue;
          const same = map.pack.states[o]?.culture != null && map.pack.states[o]?.culture === s.culture ? 1.5 : 1;
          pull += (cur.get(o)[k] - mine[k]) * same; n += same;
        }
        if (n) v += (pull / n) * 0.012 * mix;
      }
      v += (rnd.next() - 0.5) * 0.012;
      out[k] = r3(clamp(v, 0, 1));
      const had = (nBefore[s.i] ?? []).includes(k) || (!before[s.i] && mine[k] >= IDEA_NOTABLE); // 初めて求めた国で、すでに高いものは「載せ済み」とみなす（最初の月に一斉に載らない）
      if (out[k] >= IDEA_NOTABLE && !had) { notable.push({ stateId: s.i, key: k }); (nAfter[s.i] = nAfter[s.i] ?? []).push(k); }
      else if (had && out[k] >= 0.5) (nAfter[s.i] = nAfter[s.i] ?? []).push(k);
    }
    next[s.i] = out;
  }
  for (const id of Object.keys(before)) if (!next[id] && isLive(map.pack.states[id])) { next[id] = before[id]; if (nBefore[id]) nAfter[id] = nBefore[id]; }
  const cmd = makeCommand("思潮の更新", [], [{ apply: (m) => writeTable(m, next, nAfter), revert: (m) => writeTable(m, before, nBefore) }]);
  return { command: cmd, notable };
}

/** 思潮が高い水準を越えたことを年表に残す（変化は無い。記録だけ） */
export function planIdeaNotable(map, { stateId, key }, date) {
  const s = map.pack.states[stateId], d = IDEA_BY_KEY[key]; if (!isLive(s) || !d) return null;
  const cmd = makeCommand(`思潮（${d.label}）`, [], []);
  return withEvent(map, cmd, { type: "ideas", title: `${nm(s)}で、${d.rise}`, detail: `${d.label}が高まった`, date, states: [stateId], data: { idea: key } });
}
