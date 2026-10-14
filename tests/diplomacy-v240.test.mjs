// v2.4.0 の外交: 条約4種・参加国を後から変える・中立条約が同盟の参戦招集を止める・同盟の拘束力。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createRequire } from "node:module";
import { planConcludeTreaty, planSetTreatyParties, planAmendTreaty, planBreakTreaty, listTreaties, partyIds, neutralStates, SIGNABLE_KINDS } from "../js/core/edit/treaties.js";
import { listAlliances } from "../js/core/edit/alliances.js";
import { expandWithAllies } from "../js/core/sim/war-flow.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const Delaunator = createRequire(import.meta.url)(await import("node:module").then(() => "../js/vendor/delaunator.min.js"));
const map = (await loadFromBytes(new TextEncoder().encode(buildSyntheticMapText({ seed: 7 }).text), Delaunator)).map;
const state = { map }; const run = (c) => c.apply(state), undo = (c) => c.revert(state);
const ids = map.pack.states.filter((s) => s && s.i > 0 && !s.removed).map((s) => s.i);
const [A, B, C, D] = ids;

console.log("=== 条約は4種 ===");
check("締結できるのは 安全保障・経済協力・共同宣言・不可侵・中立", SIGNABLE_KINDS.join() === "alliance,economic,declaration,nonaggression");

console.log("=== 参加国を後から変える ===");
const al = planConcludeTreaty(map, { kind: "alliance", parties: [{ state: A }, { state: B }], terms: { bind: "strong" } }); run(al.command);
const T = al.id;
check("同盟が結ばれ、拘束力は強", listTreaties(map).find((t) => t.id === T).terms.bind === "strong" && listAlliances(map).length === 1);
const add = planSetTreatyParties(map, T, [A, B, C]); run(add);
check("参加国を足せる（条約と同盟の加盟国が揃う）", partyIds(listTreaties(map).find((t) => t.id === T)).length === 3 && listAlliances(map)[0].members.length === 3);
check("足した旨が年表に残る", map.ext.data.historyLog.at(-1).type === "treaty-parties");
const rem = planSetTreatyParties(map, T, [A, C]); run(rem);
check("参加国を外せる（盟主が抜けても盟主は残った国に移る）", (() => { const t = listTreaties(map).find((x) => x.id === T); return partyIds(t).join() === [A, C].join() && t.parties.filter((p) => p.role === "盟主").length === 1; })());
let err = ""; try { planSetTreatyParties(map, T, [A]); } catch (e) { err = e.message; }
check("2か国未満には減らせない", !!err);
check("変化が無ければ何もしない", planSetTreatyParties(map, T, [C, A]) === null);
undo(rem); undo(add);
check("Undo で元に戻る", partyIds(listTreaties(map).find((t) => t.id === T)).join() === [A, B].join() && listAlliances(map)[0].members.join() === [A, B].join());

console.log("=== 同盟の拘束力（弱・中・強） ===");
const c1 = planAmendTreaty(map, T, { terms: { bind: "weak" } }); run(c1);
check("弱にすると同盟に反映され、戦争に巻き込まれない", listAlliances(map)[0].bond === "loose" && !expandWithAllies(map, [C], [A]).joined.some((j) => j.id === B));
run(planAmendTreaty(map, T, { terms: { bind: "medium" } }));
check("中は、攻められた側の同盟国が参戦する", expandWithAllies(map, [C], [A]).joined.some((j) => j.id === B && j.side === "defender"));
check("中は、攻める側の同盟国は参戦しない", !expandWithAllies(map, [A], [C]).joined.some((j) => j.id === B));
run(planAmendTreaty(map, T, { terms: { bind: "strong" } }));
check("強は、攻める側の同盟国も参戦する", expandWithAllies(map, [A], [C]).joined.some((j) => j.id === B && j.side === "attacker"));

console.log("=== 中立条約は、同盟の参戦招集を止める ===");
const ne = planConcludeTreaty(map, { kind: "nonaggression", parties: [{ state: B }, { state: D }], terms: { mode: "neutral" } }); run(ne.command);
check("中立条約の当事国が数えられ、条約名も中立になる", neutralStates(map).has(B) && ne.treaty.name.includes("中立"));
check("Bは同盟国でも、中立のため参戦しない", !expandWithAllies(map, [C], [A]).joined.some((j) => j.id === B));
run(planBreakTreaty(map, ne.id, {}));
check("中立条約を破棄すると、また参戦する", expandWithAllies(map, [C], [A]).joined.some((j) => j.id === B));
const na = planConcludeTreaty(map, { kind: "nonaggression", parties: [{ state: C }, { state: D }] });
check("不可侵（既定）は中立にならない", na.treaty.terms.mode === "nonaggression" && !neutralStates(map).has(C));
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
