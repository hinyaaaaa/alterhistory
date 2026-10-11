// 旧形式（保存形式の版 1）の同盟・従属・過去の講和が、読み込み時に条約へ変換され、保存し直すと新形式（版 2）になる。
import { buildSyntheticMapText } from "./helpers/synth-map.mjs";
import { loadFromBytes } from "../js/io/loader.js";
import { createRequire } from "node:module";
import { parseNativeJson, serializeNativeJson } from "../js/io/native-map.js";
import { migrateLegacyToTreaties, listTreaties, planConcludeTreaty, planBreakTreaty, planAmendTreaty, findWarViolations, planWarBreach, treatyStatus, treatyText, pairBoost, tradeBoost, SAVE_FORMAT, SIGNABLE_KINDS, TREATY_KINDS } from "../js/core/edit/treaties.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };
const Delaunator = createRequire(import.meta.url)("../js/vendor/delaunator.min.js");
const load = async () => (await loadFromBytes(new TextEncoder().encode(buildSyntheticMapText({ seed: 7 }).text), Delaunator)).map;
const map = await load();
const state = { map }; const run = (c) => c.apply(state), undo = (c) => c.revert(state);
const ids = map.pack.states.filter((s) => s && s.i > 0 && !s.removed).map((s) => s.i);
const [A, B, C] = ids;

console.log("=== 旧形式（版 1）を作る: 同盟・従属・講和済みの戦争 ===");
const ext = (map.ext ??= { data: {} });
ext.data = {
  alliances: [{ id: 1, name: "北方同盟", members: [A, B, C], leader: B, bond: "strict", formedAt: { year: 3, month: 1 } }, { id: 2, name: "旧い同盟", members: [A, C], bond: "loose", formedAt: { year: 1, month: 1 }, dissolvedAt: { year: 2, month: 1 } }],
  wars: [{ id: 1, name: "昔の戦争", attackers: [A], defenders: [B], startedAt: { year: 4, month: 1 }, endedAt: { year: 5, month: 1 }, terms: { kind: "standard", treatyName: "昔の講和条約", notes: "賠償金", signedAt: { year: 5, month: 1 } } }],
};
map.pack.states[C].vassal = { overlord: A, kind: "protectorate", since: { year: 6, month: 1 } };
const json = JSON.stringify({ ...JSON.parse(serializeNativeJson(map)), data: ext.data }); // saveFormat なし＝版 1 のファイルを模す
const old = parseNativeJson(json).map;
const ts = listTreaties(old);
check("旧形式のファイルが開ける", !!old && old.pack.states.length === map.pack.states.length);
check("同盟が条約（種類=同盟）に変換される（拘束力・盟主・解消済みも）", ts.filter((t) => t.kind === "alliance").length === 2 && ts.find((t) => t.name === "北方同盟").terms.bind === "strong" && ts.find((t) => t.name === "北方同盟").parties.find((p) => p.role === "盟主").state === B && ts.find((t) => t.name === "旧い同盟").status === "broken");
check("従属関係が条約（種類=従属）に変換される", ts.some((t) => t.kind === "vassal" && t.terms.kind === "protectorate" && t.ref.vassalState === C && t.parties[0].role === "宗主国"));
check("過去の講和が条約（種類=講和・由来の戦争つき）に変換される", ts.some((t) => t.kind === "peace" && t.name === "昔の講和条約" && t.originWar === 1));
check("変換後の保存形式の版は 2", old.ext.data.saveFormat === SAVE_FORMAT && SAVE_FORMAT === 2);
check("変換は冪等（もう一度かけても増えない）", (() => { const n = listTreaties(old).length; migrateLegacyToTreaties(old); return listTreaties(old).length === n; })());
check("元の同盟・従属のデータは壊れない（既存の仕組みがそのまま動く）", old.ext.data.alliances.length === 2 && old.pack.states[C].vassal.overlord === A);
const resaved = JSON.parse(serializeNativeJson(old));
check("保存し直すと新形式（保存形式の版 2）になる", resaved.data.saveFormat === 2 && resaved.data.treaties.length === ts.length);
const again = parseNativeJson(JSON.stringify(resaved)).map;
check("新形式を開き直しても、条約は増えも減りもしない", listTreaties(again).length === ts.length);
check("版 1 のファイル（saveFormat なし）でも、版 2 の判定で壊れない", parseNativeJson(json).map.ext.data.saveFormat === 2);

console.log("=== 条約の種類と条項 ===");
check("条約の種類は7つ（同盟・不可侵・協力・従属・国境・共同宣言・講和）", TREATY_KINDS.length === 7 && SIGNABLE_KINDS.length === 6 && !SIGNABLE_KINDS.includes("peace"));
const map2 = await load(); const st2 = { map: map2 };
const r1 = planConcludeTreaty(map2, { kind: "nonaggression", parties: [{ state: A }, { state: B }], months: 60, date: { year: 10, month: 1 } });
check("確定するまで、何も残らない", listTreaties(map2).length === 0);
r1.command.apply(st2);
const t1 = listTreaties(map2)[0];
check("期限つきで結べる（5年）", t1.expiresAt.year === 15 && t1.expiresAt.month === 1 && treatyStatus(t1, { year: 14, month: 12 }) === "active" && treatyStatus(t1, { year: 15, month: 1 }) === "expired");
check("期限が過ぎたら、宣戦しても違約にならない", findWarViolations(map2, [A], [B], { year: 14, month: 12 }).length === 1 && findWarViolations(map2, [A], [B], { year: 16, month: 1 }).length === 0);
check("違約の実行は条約を破棄し、攻めた国の信用が下がる", (() => { const c = planWarBreach(map2, [A], [B], { year: 12, month: 1 }); c.apply(st2); const ok = listTreaties(map2)[0].status === "broken" && map2.pack.states[A].credibility < 70; c.revert(st2); return ok && listTreaties(map2)[0].status === "active"; })());
check("文面は自動生成（書き換えは任意）", treatyText(map2, t1).includes("宣戦しない") && treatyText(map2, { ...t1, text: "独自の文面" }) === "独自の文面");
let err = ""; try { planConcludeTreaty(map2, { kind: "alliance", parties: [{ state: A }] }); } catch (e) { err = e.message; }
check("当事国が足りないと失敗する", /2か国以上/.test(err));
let err2 = ""; try { planConcludeTreaty(map2, { kind: "vassal", parties: [{ state: A }, { state: B }, { state: C }] }); } catch (e) { err2 = e.message; }
check("従属は2か国まで", /2か国まで/.test(err2));
const am = planAmendTreaty(map2, t1.id, { name: "改め条約", months: 120 }); am.apply(st2);
check("改定で名前と期限が変わり、Undo で戻る", listTreaties(map2)[0].name === "改め条約" && listTreaties(map2)[0].expiresAt.year === (map2.worldTime?.year ?? 1) + 10);
am.revert(st2);
check("改定を戻すと元の名前", listTreaties(map2)[0].name === t1.name);
const br = planBreakTreaty(map2, t1.id, { by: A, date: { year: 11, month: 1 } }); br.apply(st2);
check("一方的な破棄は違約（民意が下がる）", listTreaties(map2)[0].status === "broken" && map2.pack.states[A].support < 70);
br.revert(st2);
check("破棄を Undo すると有効に戻り、民意も戻る", listTreaties(map2)[0].status === "active" && (map2.pack.states[A].support ?? 70) === 70);
check("名前が重複しない", planConcludeTreaty(map2, { kind: "nonaggression", parties: [{ state: A }, { state: B }] }).treaty.name !== t1.name);
r1.command.revert(st2);
const e1 = planConcludeTreaty(map2, { kind: "economic", parties: [{ state: A }, { state: B }], terms: { tariff: "low" } }); e1.command.apply(st2);
check("経済協力は、当事国どうしにだけ効く", pairBoost(map2, A, B) > 1 && pairBoost(map2, A, C) === 1 && tradeBoost(map2, A) > 1 && tradeBoost(map2, C) === 1);

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
