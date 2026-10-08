// クロニクル年表の品質：日付・戦力・条約・当時の国名・省略なし
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { buildChronicle, chronicleToMarkdown } from "../js/io/chronicle.js";
import { createEditActions } from "../js/app/edit-actions.js";
import { listHistory } from "../js/core/edit/history-log.js";

let failed = 0;
const check = (label, ok, extra = "") => { console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

const { map, store } = await buildHistoricalWorld();
const wars = map.ext.data.wars ?? [];
const battles = wars.reduce((a, w) => a + (w.battles ?? []).length, 0);

console.log("=== 年表：戦闘・条約・書式 ===");
let ch = buildChronicle(map, { fileName: "t.map", includeCells: false });
let md = chronicleToMarkdown(ch);
check("undefined / NaN / null が文章に混ざらない", !/undefined|NaN|\bnull\b/.test(md));
check("すべての戦闘が年表に載る（1件も省略しない）", ch.timeline.filter((t) => t.type === "battle").length === battles, `${battles}件`);
check("戦闘はすべて日付つきで、「日付不明」に落ちない", ch.timeline.filter((t) => t.type === "battle").every((t) => t.year != null) && !md.includes("日付不明"));
check("戦闘に「戦力 undefined」が出ない（記録が無い戦力は書かない）", !md.includes("戦力 undefined"));
const sorted = ch.timeline.filter((t) => t.year != null).every((t, i, a) => i === 0 || a[i - 1].year * 12 + a[i - 1].month <= t.year * 12 + t.month);
check("年表は年月順に並ぶ", sorted);
const withStory = wars.flatMap((w) => w.battles ?? []).filter((b) => b.text);
check("戦闘の経緯（物語の文）が年表に入る", withStory.length === 0 || withStory.every((b) => md.includes(b.text.slice(0, 12))));

console.log("=== 条約は省略せず全部書く ===");
const ended = wars.filter((w) => w.endedAt && w.terms);
const tt = ch.timeline.filter((t) => t.type === "war-ended");
check("終結した戦争はすべて講和が年表に載る", tt.length === wars.filter((w) => w.endedAt).length);
for (const w of ended) {
  const t = w.terms, line = tt.find((x) => x.title.includes(`「${w.name}」`))?.detail ?? "";
  const n = (t.cessions ?? []).length, r = (Array.isArray(t.reparations) ? t.reparations : []).length;
  check(`「${w.name}」割譲${n}件・賠償${r}件がすべて並ぶ（「ほか○か所」で省略しない）`, (line.match(/割譲 /g) ?? []).length === n && (line.match(/賠償 /g) ?? []).length === r && !line.includes("ほか"), line.slice(0, 80));
}
// 従属化・全面降伏・旧形式も書ける
{
  const w = ended[0], [a, b] = [map.pack.states.filter((s) => s && s.i && !s.removed)[0].i, map.pack.states.filter((s) => s && s.i && !s.removed)[1].i];
  const saved = w.terms;
  w.terms = { kind: "vassal", treatyName: "テスト従属条約", vassalize: [{ fromStateId: a, toStateId: b, kind: "vassal" }], notes: "条件の\n全文" };
  md = chronicleToMarkdown(buildChronicle(map, { includeCells: false }));
  check("従属化の条約は「従属化」「属国」と書かれ、undefined にならない", md.includes("テスト従属条約（従属化") && md.includes("の属国") && !/\(undefined\)|（undefined）/.test(md));
  check("条件の全文が入る", md.includes("条件: 条件の 全文"));
  w.terms = { provinceIds: [], regionCells: [], toStateId: a, reparations: 0 };
  md = chronicleToMarkdown(buildChronicle(map, { includeCells: false }));
  check("旧形式で何も割譲しないときは「属州なし」と書かず、条約名だけにする", !md.includes("属州なし"));
  w.terms = saved;
}

console.log("=== 当時の国名で書く（改名・消滅） ===");
const ea = createEditActions({ store, renderer: { requestRender() {} } });
const M = () => store.getState().map;
const st = M().pack.states.filter((s) => s && s.i && !s.removed);
const target = st.find((s) => wars.some((w) => [...w.attackers, ...w.defenders].includes(s.i)));
const old = target.fullName ?? target.name;
const w0 = wars.find((w) => [...w.attackers, ...w.defenders].includes(target.i));
// 世界の時刻を、開戦の10年後にして改名する
store.update((s) => { s.map.worldTime = { year: w0.startedAt.year + 10, month: 1 }; });
ea.renameEntity("state", target.i, "改名後の新王国");
ch = buildChronicle(M(), { includeCells: false });
const declared = ch.timeline.find((t) => t.type === "war-declared" && t.title.includes(`「${w0.name}」`));
check("改名より前の開戦は、当時の名前で書かれる", declared.detail.includes(old) && !declared.detail.includes("改名後の新王国"), declared.detail);
const ren = listHistory(M()).find((h) => h.type === "rename-state");
check("改名の記録は年月と旧名・新名つき", ren.year === w0.startedAt.year + 10 && ren.ref.from === old && ren.ref.to === "改名後の新王国");
const state = ch.states.find((x) => x.id === target.i);
check("現在の姿の章では新しい名前", state.name === "改名後の新王国");
const merged = (M().ext.data.sovereigntyLog ?? []).find((x) => x.type === "merge");
if (merged) {
  const before = ch.timeline.find((t) => t.type === "war-declared" && (t.involvedStates ?? []).some((r) => r.id === merged.fromState));
  const after = ch.timeline.filter((t) => t.type === "war-ended").find((t) => t.year != null && (t.year * 12 + t.month) > (merged.year * 12 + merged.month - 1) && (t.involvedStates ?? []).some((r) => r.id === merged.fromState));
  check("滅ぶ前の出来事には「（消滅）」を付けない", !before || !before.detail.includes(`${merged.fromName}（消滅）`));
  check("滅んだ後の出来事には「（消滅）」を付ける", !after || after.detail.includes("（消滅）"));
}

console.log("=== 歴史ログは削らない ===");
{
  const n = 25000;
  const log = Array.from({ length: n }, (_, i) => ({ year: 1 + (i % 500), month: 1, type: "note", title: `出来事${i}` }));
  const m2 = M();
  m2.ext.data.historyLog = log;
  ea.renameEntity("state", target.i, "もう一度");
  check("2万件を超えても古い記録を捨てない", listHistory(M()).length === n + 1 && listHistory(M())[0].title === "出来事0", `${listHistory(M()).length}件`);
  md = chronicleToMarkdown(buildChronicle(M(), { includeCells: false }));
  check("年表にすべて載る（要約・省略なし）", md.includes("出来事0") && md.includes(`出来事${n - 1}`));
}

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功");
process.exit(failed ? 1 : 0);
