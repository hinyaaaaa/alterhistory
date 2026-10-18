// v2.6.0 B1: クロニクルが指導者・政体・ドクトリン・従属・戦争形態・月ごとの出来事を省略せず書く
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { createSimActions } from "../js/app/sim-actions.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { buildChronicle, chronicleToMarkdown } from "../js/io/chronicle.js";
import { ensureLeaders } from "../js/core/edit/leaders.js";
import { MINOR_EVENTS } from "../js/core/sim/minor-events.js";
import { listHistory } from "../js/core/edit/history-log.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const sim = createSimActions({ store, renderer: { requestRender() {} } });
const M = () => store.getState().map;
const live = () => M().pack.states.filter((s) => s && s.i > 0 && !s.removed);
ensureLeaders(M());

console.log("=== 従属・政体の記録 ===");
const [A, B] = live();
sim.setVassal(B.i, A.i, "protectorate");
check("従属が年表に残る", () => assert.ok(listHistory(M()).some((h) => h.type === "vassal" && h.states.includes(B.i))));
sim.releaseVassal(B.i);
check("独立が年表に残る", () => assert.ok(listHistory(M()).some((h) => h.type === "vassal-released")));
sim.setVassal(B.i, A.i, "puppet");

console.log("=== 月送りを数年回す ===");
let y = M().worldTime.year;
for (let i = 0; i < 12 * 60; i++) { const m = (i % 12) + 1; if (m === 1 && i) y++; sim.advanceMonthly({ year: y, month: m }, createRandom(1000 + i)); }
const seen = new Set(listHistory(M()).map((h) => h.type).filter((t) => t.startsWith("natural-") || ["succession", "rebellion", "plague"].includes(t)));
check("月ごとの出来事が複数種類、記録されている", () => assert.ok(seen.size >= 6, `${seen.size}種`));

const ch = buildChronicle(M(), { includeCells: false });
const md = chronicleToMarkdown(ch);
check("undefined / NaN が出ない", () => assert.ok(!/undefined|NaN/.test(md)));
check("年表に、記録した種類がすべて載る（省略なし）", () => { for (const t of seen) assert.ok(ch.timeline.some((x) => x.type === t), t); });
check("種類名が日本語（英語のキーのまま出ない）", () => assert.ok(!/\*\*\[(natural-|succession|regime|vassal)/.test(md)));
check("全ての natural-* に日本語名がある", () => { for (const e of MINOR_EVENTS) assert.ok(md.includes(`[${e.title}]`) || !seen.has(`natural-${e.key}`), e.key); });
const st = ch.states.find((s) => s.id === B.id) ?? ch.states.find((s) => s.id === B.i);
check("国の章に歴代の指導者（在任・性別・称号・理由）", () => assert.ok(st.leaders.length >= 1 && st.leaders.every((l) => l.title && l.gender && l.from)));
check("技術ドクトリン6分野と変遷", () => assert.equal(st.techDoctrine.levels.length, 6));
check("傀儡の関係が書かれる", () => assert.ok(md.includes("従属:") && md.includes("傀儡")));
check("Markdown に各見出しが出る", () => { for (const k of ["政体の変遷", "歴代の指導者", "技術ドクトリン", "軍事ドクトリン", "戦争形態"]) assert.ok(md.includes(k), k); });

if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); }
console.log("\n全て成功");
