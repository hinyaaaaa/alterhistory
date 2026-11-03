// v6.1.0: 領域の台帳（wcde/domains/registry.js）・tick の順序（civ/tick.js）・技術ツリーから、設計文書を生成する（正本はコード。文書は派生）。
import { writeFileSync } from "node:fs";
import { DOMAINS, ENTRY_PATHS, validateRegistry } from "../js/core/wcde/domains/registry.js";
import { PHASES, PHASE_KEYS } from "../js/core/civ/tick.js";
import { TREE, LANES, COLS, validateTree } from "../js/core/civ/techtree.js";
const errs = [...validateRegistry(PHASE_KEYS), ...validateTree()]; if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
let md = `# v6.1.0 M1: 領域の所有権・tick の順序・命令の入口（自動生成）\n\n正本は \`js/core/wcde/domains/registry.js\`・\`js/core/civ/tick.js\`・\`js/core/wcde/contract.js\`。この文書は \`node scripts/gen-v61-docs.mjs\` で作り直す。\n\n## 命令の入口（4 経路）\n\n| 経路 | 入口 | 権限 | 内容 |\n|---|---|---|---|\n${ENTRY_PATHS.map((e) => `| ${e.ja} | \`${e.entry}\` | ${e.authorities.join(", ")} | ${e.note} |`).join("\n")}\n\n## 月次 tick の順序（PHASES）\n\n${PHASES.map((p, i) => `${i + 1}. \`${p.key}\` — ${p.name}`).join("\n")}\n\n## 領域の台帳\n\n`;
for (const d of DOMAINS) md += `### ${d.ja}（\`${d.id}\`）\n- 担当: ${d.owner}／位置: \`${d.phase}\`／頻度: ${d.cadence}（every ${d.every}）\n- 処理: ${d.steps.map((s) => `\`${s}\``).join(", ")}\n- 所有（正本）: ${d.owns.map((s) => `\`${s}\``).join(", ") || "なし"}\n- 読む: ${d.reads.join(", ") || "なし"}／書き換える（所有しない）: ${d.updates.map((s) => `\`${s}\``).join(", ") || "なし"}\n- 残す結果（emits）: ${d.emits.join(", ") || "なし"}\n- 不変条件: ${d.invariants.join(" / ")}\n\n`;
writeFileSync(new URL("../docs/V6_1_M1_CONTRACT_TICK.md", import.meta.url), md);
let t = `# v6.1.0 M3: 統合技術ツリー（自動生成）\n\nノード ${TREE.length}・レーン ${LANES.length}・列 ${COLS}。正本は \`js/core/civ/techtree.js\`。\n\n`;
for (const l of LANES) { t += `## ${l.glyph} ${l.ja}\n\n| 技術 | 列 | 前提 | 成立の条件 | 解禁 | 効果 |\n|---|---|---|---|---|---|\n`; for (const n of TREE.filter((x) => x.lane === l.id).sort((a, b) => a.col - b.col)) t += `| ${n.ja}（\`${n.id}\`） | ${n.col} | ${n.prereq.join(", ") || "—"} | ${[n.pop ? `規模${n.pop}` : "", n.s ? "定住" : "", n.cond ?? ""].filter(Boolean).join("・") || "—"} | ${n.caps.join(", ") || "—"} | ${Object.entries(n.fx).map(([k, v]) => `${k}+${v}`).join(" ") || "—"} |\n`; t += "\n"; }
writeFileSync(new URL("../docs/V6_1_M3_TECH_TREE.md", import.meta.url), t);
console.log("docs generated", DOMAINS.length, "domains,", TREE.length, "techs");
