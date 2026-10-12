// v2.1.0 因果と人物: 出来事の原因リンク（A）・君主と継承（B）・国の連続性（C）。DOM に依存しない純粋ロジック。
import { makeCommand } from "./commands.js";
import { ensureExt } from "./ext.js";
import { withEvent } from "./history-log.js";
import { epithet } from "./world-info.js";

const nm = (s) => s?.fullName ?? s?.name ?? "?";
const mk = (e) => (e.year ?? 0) * 12 + ((e.month ?? 1) - 1);

// ---- A: 原因リンク ----
export const eventKey = (e) => `${e.type}|${e.year}-${e.month}|${e.title}`;
// 結果の種類 → きっかけになりうる種類（同じ国・近い時期のもの）。文章は書かせず、規則で自動に付ける
const AUTO = {
  rebellion: ["plague", "zone-start", "succession", "treaty-breach"],
  independence: ["rebellion", "succession", "plague", "zone-start"],
  "war-declared": ["rebellion", "treaty-breach"],
  "war-ended": ["war-declared"],
  "treaty-breach": [],
  succession: ["war-ended", "plague"],
};
const WINDOW = 48; // ヶ月
/** 年表（古い順）に、きっかけを付ける（cause を保存している記録はそれを優先）。causeKey / causeTitle を足す */
export function attachCauses(tl) {
  const byKey = new Map(); for (const e of tl) byKey.set(eventKey(e), e);
  for (let i = 0; i < tl.length; i++) {
    const e = tl[i];
    let c = e.cause ? byKey.get(e.cause) : null;
    const kinds = AUTO[e.type];
    if (!c && kinds?.length && e.stateIds?.length) {
      for (let j = i - 1; j >= 0 && !c; j--) {
        const p = tl[j]; if (mk(e) - mk(p) > WINDOW) break;
        if (kinds.includes(p.type) && p.stateIds?.some((s) => e.stateIds.includes(s)) && (p.type !== "succession" || /混乱|争い/.test(p.detail ?? ""))) c = p;
      }
    }
    if (c && c !== e) { e.causeKey = eventKey(c); e.causeTitle = c.title; e.causeText = `${c.title}を受けて`; }
  }
  return tl;
}
/** 経緯（原因をさかのぼる）。古い順 */
export function causeChain(tl, entry) {
  const byKey = new Map(tl.map((e) => [eventKey(e), e])); const out = []; let cur = entry, guard = 0;
  while (cur?.causeKey && guard++ < 20) { const p = byKey.get(cur.causeKey); if (!p || out.includes(p)) break; out.unshift(p); cur = p; }
  return out;
}
/** その後（この出来事を原因とするもの） */
export const consequences = (tl, entry) => tl.filter((e) => e.causeKey === eventKey(entry));

// ---- B: 君主と継承 ----
export const TITLES = Object.freeze(["王", "女王", "皇帝", "女帝", "大公", "首長", "大統領", "摂政"]);
export const REASONS = Object.freeze([
  { key: "death", label: "死去", verb: "死去し" }, { key: "abdication", label: "退位", verb: "退位し" }, { key: "deposition", label: "廃位", verb: "廃位され" },
  { key: "usurpation", label: "簒奪", verb: "倒され" }, { key: "election", label: "選出", verb: "任期を終え" }, { key: "conquest", label: "征服", verb: "征服され" },
]);
export const STABILITY = Object.freeze([{ key: "stable", label: "安定" }, { key: "dispute", label: "争いあり" }, { key: "chaos", label: "大きな混乱" }]);
export const monarchRecord = (map, id) => map.ext?.data?.monarchs?.[id] ?? { current: null, history: [] };
const writeMonarchs = (m, all) => { ensureExt(m).data.monarchs = all; };

/** 君主交代。name 省略で自動（「第N代○○」）。確定まで何も残さない・Undo 1回。 */
export function planChangeMonarch(map, stateId, { reason, title = "王", name = "", stability = "stable", date = null } = {}) {
  const st = map.pack.states[stateId]; if (!st || st.removed || !(st.i > 0)) throw new Error("存在しない国家です");
  const r = REASONS.find((x) => x.key === reason); if (!r) throw new Error("交代の理由を選んでください");
  if (!TITLES.includes(title)) throw new Error("称号を選んでください");
  const stab = STABILITY.find((x) => x.key === stability); if (!stab) throw new Error("継承の安定度を選んでください");
  const when = date ?? map.worldTime ?? { year: 1, month: 1 };
  const before = map.ext?.data?.monarchs ?? {}; const rec = monarchRecord(map, stateId);
  const n = rec.history.length + (rec.current ? 1 : 0) + 1;
  const next = { name: name.trim() || `第${n}代${title}`, title, since: { ...when }, reason: r.key, stability: stab.key };
  const hist = rec.current ? [...rec.history, { ...rec.current, until: { ...when } }] : rec.history;
  const after = { ...before, [stateId]: { current: next, history: hist } };
  const cmd = makeCommand(`君主交代（${nm(st)}）`, [], [{ apply: (m) => writeMonarchs(m, after), revert: (m) => { const x = ensureExt(m); if (Object.keys(before).length) x.data.monarchs = before; else delete x.data.monarchs; } }]);
  const prev = rec.current ? `${rec.current.title}${rec.current.name}が${r.verb}、` : "";
  return withEvent(map, cmd, { type: "succession", title: `${epithet(st)}${nm(st)}で${prev}${next.title}${next.name}が即位`, detail: `理由: ${r.label} / 継承: ${stab.label}`, date: when, states: [stateId] });
}

// ---- C: 国の連続性（前身・後継・国名の変遷）。保存はせず、既存の記録から導く ----
export function lineageOf(map, id) {
  const st = map.pack.states[id]; const P = (i) => map.pack.states[i]; const log = map.ext?.data?.historyLog ?? [];
  const pred = [], succ = [], names = [];
  if (st?.parentState > 0 && P(st.parentState)) pred.push({ id: st.parentState, name: nm(P(st.parentState)), how: "分離" });
  for (const s of map.pack.states) if (s && !s.removed && s.parentState === id) succ.push({ id: s.i, name: nm(s), how: "分離" });
  for (const h of log) {
    if (h.type === "merge") {
      if (h.toState === id) pred.push({ id: h.fromState, name: h.fromName, how: "統合" });
      if (h.fromState === id) succ.push({ id: h.toState, name: h.toName, how: "統合" });
    }
    if (h.type === "rename-state" && h.ref?.id === id) names.push({ year: h.year, month: h.month, from: h.ref.from, to: h.ref.to });
  }
  return { predecessors: pred, successors: succ, names };
}
