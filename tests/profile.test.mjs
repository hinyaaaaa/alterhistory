// 政治・文化の深さ（種類・政体・起源・都市の設備）の検査。合成マップ。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createRequire } from "node:module";
import { planSetEntityProfile, planSetOrigin, planSetBurgProfile, originTree, descendantsOf, CULTURE_TYPES } from "../js/core/edit/profile.js";
import { serializeAzgaar } from "../js/io/azgaar-writer.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
const load = async () => (await loadFromBytes(new TextEncoder().encode(buildSyntheticMapText({ seed: 7 }).text), Delaunator)).map;
const map = await load();
const state = { map };
const run = (c) => c.apply(state), undo = (c) => c.revert(state);

console.log("=== 国・文化・宗教の属性 ===");
const st = map.pack.states[1];
let c = planSetEntityProfile(map, "state", 1, { form: "Republic", formName: "共和国", type: "Naval" }); run(c);
check("国の政体・政体名・種類を変えられる", st.form === "Republic" && st.formName === "共和国" && st.type === "Naval");
undo(c);
check("Undo で戻る", st.form === "Monarchy" && st.formName === "Monarchy" && st.type === "Generic");
check("同じ値なら変更なし", planSetEntityProfile(map, "state", 1, { form: "Monarchy" }) === null);
check("未知の政体は拒否", !!throws(() => planSetEntityProfile(map, "state", 1, { form: "Empire" })));
check("文化の種類を変えられる", (() => { const k = planSetEntityProfile(map, "culture", 1, { type: "Nomadic" }); run(k); const ok = map.pack.cultures[1].type === "Nomadic"; undo(k); return ok; })());
check("宗教は種類・神を変えられる", (() => { const k = planSetEntityProfile(map, "religion", 1, { type: "Organized", deity: "ソル" }); run(k); const r = map.pack.religions[1]; const ok = r.type === "Organized" && r.deity === "ソル"; undo(k); return ok; })());
check("宗教に国の項目(政体)は指定できない", !!throws(() => planSetEntityProfile(map, "culture", 1, { form: "Republic" })));
check("空の政体名は拒否", !!throws(() => planSetEntityProfile(map, "state", 1, { formName: "  " })));
check("存在しない対象は拒否", !!throws(() => planSetEntityProfile(map, "state", 999, { type: "Naval" })));
check("文化の種類は7つ", CULTURE_TYPES.length === 7);

console.log("=== 起源（系統） ===");
const ct = originTree(map, "culture");
check("合成マップの文化はすべて祖(0)の子", [1, 2, 3].every((i) => ct.parent.get(i) === 0));
let o = planSetOrigin(map, "culture", 2, 1); run(o);
check("起源を指定できる", map.pack.cultures[2].origins[0] === 1 && descendantsOf(map, "culture", 1).includes(2));
check("同じ起源なら変更なし", planSetOrigin(map, "culture", 2, 1) === null);
check("自分自身は起源にできない", !!throws(() => planSetOrigin(map, "culture", 2, 2)));
check("子孫を起源にすると輪になるので拒否", !!throws(() => planSetOrigin(map, "culture", 1, 2)));
const o2 = planSetOrigin(map, "culture", 3, 2); run(o2);
check("孫まで子孫に数えられる", descendantsOf(map, "culture", 1).sort().join() === "2,3");
check("孫を祖父の起源にするのも拒否", !!throws(() => planSetOrigin(map, "culture", 1, 3)));
check("0（共通の祖）に戻せる", (() => { const r = planSetOrigin(map, "culture", 3, 0); run(r); const ok = map.pack.cultures[3].origins[0] === 0; undo(r); return ok; })());
check("国家には起源が無い", !!throws(() => planSetOrigin(map, "state", 1, 0)));
check("存在しない起源は拒否", !!throws(() => planSetOrigin(map, "culture", 2, 99)));
undo(o2); undo(o);
check("Undo で元の系統に戻る", [1, 2, 3].every((i) => originTree(map, "culture").parent.get(i) === 0));

console.log("=== 都市 ===");
const burgs = map.pack.burgs.filter((b) => b && b.i && !b.removed);
const cap = burgs.find((b) => b.capital), town = burgs.find((b) => !b.capital);
const urbanBefore = map.pack.states[town.state].urban, popBefore = town.population;
let b1 = planSetBurgProfile(map, town.i, { citadel: true, walls: 1, temple: true, group: "city", type: "Naval" }); run(b1);
check("設備・区分・種類を変えられる", town.citadel === 1 && town.walls === 1 && town.temple === 1 && town.group === "city" && town.type === "Naval");
check("設備を外すと 0", (() => { const k = planSetBurgProfile(map, town.i, { citadel: false }); run(k); const ok = town.citadel === 0; undo(k); return ok; })());
undo(b1);
check("Undo で設備のキーも消える", !("citadel" in town) && !("walls" in town));
check("既定の0と同じ指定は変更なし", planSetBurgProfile(map, town.i, { shanty: false }) === null);
const pc = planSetBurgProfile(map, town.i, { population: popBefore + 10 }); run(pc);
check("人口を変えると国の都市人口も同じだけ動く", Math.abs(map.pack.states[town.state].urban - (urbanBefore + 10)) < 1e-6, `${urbanBefore} → ${map.pack.states[town.state].urban}`);
undo(pc);
check("Undo で国の都市人口も戻る", Math.abs(map.pack.states[town.state].urban - urbanBefore) < 1e-9 && town.population === popBefore);
check("人口は 0 以上", !!throws(() => planSetBurgProfile(map, town.i, { population: -1 })) && !!throws(() => planSetBurgProfile(map, town.i, { population: "x" })));
check("首都の区分は変えられない", !!throws(() => planSetBurgProfile(map, cap.i, { group: "town" })));
check("首都以外を「首都」区分にもできない", !!throws(() => planSetBurgProfile(map, town.i, { group: "capital" })));
check("未知の区分・項目は拒否", !!throws(() => planSetBurgProfile(map, town.i, { group: "castle" })) && !!throws(() => planSetBurgProfile(map, town.i, { port: 1 })));
check("存在しない都市は拒否", !!throws(() => planSetBurgProfile(map, 999, { walls: 1 })));

console.log("=== 書き出し（Azgaar 互換の項目名） ===");
{
  const m = await load(); const s2 = { map: m };
  planSetBurgProfile(m, 2, { citadel: true, group: "fort" }).apply(s2);
  planSetEntityProfile(m, "state", 1, { type: "Highland" }).apply(s2);
  planSetOrigin(m, "culture", 2, 1).apply(s2);
  const out = serializeAzgaar(m, { native: false, exportedAt: "2026-1-1" });
  const re = await loadFromBytes(new TextEncoder().encode(out), Delaunator);
  check("書き出して読み直しても、都市の設備・区分が残る", re.map.pack.burgs[2].citadel === 1 && re.map.pack.burgs[2].group === "fort");
  check("国の種類・文化の起源も残る", re.map.pack.states[1].type === "Highland" && re.map.pack.cultures[2].origins[0] === 1);
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
