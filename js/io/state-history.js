// 国史（機能F）: ある国の歴史を Markdown に書き出す。窓は増やさず、年表の「国史として書き出し」から使う。
// 文章はすべてテンプレートからの自動生成（君主・国名の変遷と系譜・主な戦争/反乱/条約・原因の流れ）。
import { buildTimeline } from "./chronicle.js";
import { monarchRecord, lineageOf } from "../core/edit/lineage.js";
import { tagLabels } from "../core/edit/world-info.js";

const MAIN = /^(war-declared|war-ended|battle|independence|rebellion|breakaway|treaty-|alliance-|merge|rename-state|succession|plague|zone-start|nuclear|removed-state)/;
const ym = (d) => (d ? `${d.year}年${d.month}月` : "—");

export function buildStateHistory(map, stateId, { from = null, to = null } = {}) {
  const st = map.pack.states[stateId]; if (!st || st.removed) throw new Error("存在しない国家です");
  const name = st.fullName ?? st.name, inRange = (e) => (from == null || e.year >= from) && (to == null || e.year <= to);
  const L = []; const tags = tagLabels(st);
  L.push(`# ${name}の歴史`, "", `${tags.length ? `${tags.join("・")}の` : ""}${name}の歴史を、記録から自動でまとめたものです。${from != null || to != null ? `（${from ?? "…"}年〜${to ?? "…"}年）` : ""}`, "");
  const rec = monarchRecord(map, stateId); const all = [...rec.history, ...(rec.current ? [rec.current] : [])];
  L.push("## 君主", "");
  if (all.length) for (const m of all) L.push(`- ${m.title}${m.name}（${ym(m.since)}〜${m.until ? ym(m.until) : "現在"}）`);
  else L.push("- 記録なし");
  const lin = lineageOf(map, stateId);
  L.push("", "## 国名の変遷と系譜", "");
  const rows = [...lin.names.map((n) => `- ${n.year}年${n.month}月 ${n.from} → ${n.to}`), ...lin.predecessors.map((p) => `- 前身: ${p.name}（${p.how}）`), ...lin.successors.map((p) => `- 後継: ${p.name}（${p.how}）`)];
  L.push(...(rows.length ? rows : ["- 記録なし"]));
  const tl = buildTimeline(map).filter((e) => e.stateIds?.includes(stateId) && inRange(e));
  const main = tl.filter((e) => MAIN.test(e.type));
  L.push("", "## 主な出来事", "");
  if (!main.length) L.push("- 記録なし");
  for (const e of main) L.push(`- ${e.date} ${e.title}${e.causeText ? `（${e.causeText}）` : ""}`);
  const caused = tl.filter((e) => e.causeKey);
  L.push("", "## 原因の流れ", "");
  if (!caused.length) L.push("- 記録なし");
  for (const e of caused) L.push(`- ${e.causeTitle} → ${e.title}（${e.date}）`);
  return L.join("\n") + "\n";
}
