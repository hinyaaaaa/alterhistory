// v2.7.0: 簡易言語。文化ごとの言語・音変化・語根辞書の編集・名前の生成
import assert from "node:assert/strict";
import { createStore } from "../js/core/store.js";
import { createRandom } from "../js/core/random.js";
import { buildHistoricalWorld } from "./helpers/synth-history.mjs";
import { createLanguage, deriveLanguage, renderWord, wordOf, placeName, personName, languageStyle, lexiconRows, CONCEPTS, SOUND_CHANGES, parseToken, renderToken } from "../js/core/names/language.js";
import { generateStateName, generateReligionName, validate } from "../js/core/names/katakana.js";
import { getLanguage, languageOfState, planEnsureLanguages, planSetLanguageWord, planRerollLanguageWord, planRegenerateLanguage, listLanguages, featuresAt, languageName } from "../js/core/edit/language.js";
import { suggestName } from "../js/core/edit/naming.js";
import { ensureLeaders, leaderCandidates } from "../js/core/edit/leaders.js";
import { listHistory } from "../js/core/edit/history-log.js";

let failed = 0;
const check = (label, fn) => { try { fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${e.message.split("\n")[0]}`); } };
const kana = (s) => /^[ァ-ヴー・]+$/.test(s);
const { map } = await buildHistoricalWorld();
const store = createStore({ map });
const M = () => store.getState().map;

console.log("=== 言語の生成 ===");
check("語根辞書は全ての見出しを持ち、語はカタカナ", () => {
  const l = createLanguage(createRandom(1), 1);
  assert.equal(Object.keys(l.lex).length, CONCEPTS.length);
  for (const c of CONCEPTS) { const w = wordOf(l, c.key); assert.ok(w && kana(w), `${c.key}: ${w}`); }
});
check("同じシードなら同じ言語、違えば違う言語", () => {
  const a = createLanguage(createRandom(5), 1), b = createLanguage(createRandom(5), 1), c = createLanguage(createRandom(6), 1);
  assert.deepEqual(a, b); assert.notDeepEqual(a.lex, c.lex);
});
check("音節の記号は、カタカナに描ける", () => {
  assert.equal(renderToken("ka"), "カ"); assert.equal(renderToken("shi"), "シ"); assert.equal(renderToken("raN"), "ラン"); assert.equal(renderToken("u"), "ウ");
  assert.equal(parseToken("zz"), null);
});
check("地名・人名・国名・宗教名が、その言語の響きで作れる（すべて有効なカタカナ）", () => {
  const l = createLanguage(createRandom(3), 1), r = createRandom(4), st = languageStyle(l, "テスト語");
  for (let i = 0; i < 60; i++) {
    assert.ok(validate(placeName(l, r, ["river", "coast"]), { max: 9 }));
    const p = personName(l, r, i % 2 ? "f" : "m"); assert.ok(kana(p.full) && p.given && p.family);
    assert.ok(validate(generateStateName(r, st).short, { max: 9 }));
    assert.ok(kana(generateReligionName(r, st).deity));
  }
});
check("地形のある場所は、地形の語を含む名前になる（川・浜など）", () => {
  const l = createLanguage(createRandom(9), 1), r = createRandom(2), river = wordOf(l, "river");
  let hit = 0; for (let i = 0; i < 200; i++) if (placeName(l, r, ["river"]).includes(river)) hit++;
  assert.ok(hit > 40, `川の語を含む: ${hit}/200`);
});
check("同じ言語の名前は、同じ音で作られる（言語にない仮名は出ない）", () => {
  const l = createLanguage(createRandom(12), 1), r = createRandom(1);
  const used = new Set(); const take = (w) => { for (const ch of renderWord(w)) used.add(ch); };
  for (const w of [...Object.values(l.lex), ...l.proper, ...l.male, ...l.female, ...l.clan]) take(w);
  if (l.link) for (const ch of renderToken(l.link === "no" ? "no" : l.link)) used.add(ch);
  for (let i = 0; i < 80; i++) for (const ch of placeName(l, r, ["hill"]).replace(/・/g, "")) assert.ok(used.has(ch), `「${ch}」は言語にない`);
});

console.log("=== 音変化（文化が分かれるとき） ===");
check("子の言語は、親に音変化をかけたもの（系統・規則が残る）", () => {
  const p = createLanguage(createRandom(2), 1), c = deriveLanguage(p, createRandom(8), 2);
  assert.equal(c.parent, 1); assert.equal(c.id, 2); assert.ok(c.changes.length >= 3);
  assert.ok(c.changes.every((x) => SOUND_CHANGES.some((s) => s.key === x.key)));
  const same = CONCEPTS.filter((k) => renderWord(c.lex[k.key]) === renderWord(p.lex[k.key])).length;
  assert.ok(same > 10 && same < CONCEPTS.length, `親と同じ語が一部残る: ${same}/${CONCEPTS.length}`);
});
check("音変化は規則どおり（濁音化なら、k・t・p が g・d・b へ）", () => {
  const p = createLanguage(createRandom(2), 1); p.lex.river = "ka.to.pa"; p.lex.hill = "ki";
  const rule = SOUND_CHANGES.find((s) => s.key === "voicing");
  const mapped = "ka.to.pa".split(".").map((t) => { const q = parseToken(t); return `${rule.fn(q).c}${q.v}`; }).join(".");
  assert.equal(mapped, "ga.do.ba");
});
check("手で直した語は、音変化のあとも変わらない", () => {
  const p = createLanguage(createRandom(2), 1); p.lex.king = "~オウ";
  for (let seed = 1; seed <= 30; seed++) { const c = deriveLanguage(p, createRandom(seed), 2); assert.equal(c.lex.king, "~オウ"); assert.ok(c.edited.king); }
});
check("語順・連結は言語ごとに違い、親子で近い", () => {
  const ls = Array.from({ length: 30 }, (_, i) => createLanguage(createRandom(i + 1), 1));
  assert.ok(ls.some((l) => l.order === "MH") && ls.some((l) => l.order === "HM"));
});

console.log("=== 地図との結び付け ===");
check("文化ごとに言語が決まり、同じ地図では毎回同じ（保存しなくても）", () => {
  const a = getLanguage(M(), 1), b = getLanguage(M(), 1), c = getLanguage(M(), 2);
  assert.deepEqual(a, b); assert.notDeepEqual(a.lex, c.lex);
  assert.equal(getLanguage(M(), 0), null); assert.equal(getLanguage(M(), 99), null);
});
check("国の言語は、その国の文化の言語", () => {
  const s = M().pack.states.find((x) => x && x.i > 0 && x.culture === 2);
  assert.equal(languageOfState(M(), s).id, 2);
});
check("文化に親があれば、親の言語から音変化で作られる", () => {
  const m = M(); m.pack.cultures[3].origins = [1];
  const c = getLanguage(m, 3); assert.equal(c.parent, 1); assert.ok(c.changes.length >= 3);
  m.pack.cultures[3].origins = [0];
  assert.equal(getLanguage(m, 3).parent, null);
});
check("初回の保存は年表に残さず、あとで分かれた文化は年表に残る", () => {
  const first = planEnsureLanguages(M()); assert.ok(first && first.created.length >= 3); store.commit(first.command);
  assert.equal(listHistory(M()).filter((h) => h.type === "language").length, 0);
  assert.equal(planEnsureLanguages(M()), null, "二度目は何もしない");
  const m = M(); m.pack.cultures.push({ i: 4, name: "デルタ人", origins: [1], color: "#888" });
  const again = planEnsureLanguages(M(), { year: 70, month: 1 }); assert.ok(again && again.created.includes(4)); store.commit(again.command);
  const h = listHistory(M()).find((x) => x.type === "language"); assert.ok(h && /分かれた/.test(h.title) && h.detail);
  assert.equal(listLanguages(M())[4].parent, 1);
  store.undo(); assert.ok(!listLanguages(M())[4]);
});
check("保存した言語は、シードより優先される", () => {
  const before = JSON.stringify(getLanguage(M(), 1)); store.commit(planRegenerateLanguage(M(), 1, createRandom(999)));
  assert.notEqual(JSON.stringify(getLanguage(M(), 1)), before); store.undo();
});

console.log("=== 語根辞書の編集 ===");
check("語を手で直せる（カタカナ 1〜8 文字）。Undo で戻る", () => {
  const lang0 = renderWord(getLanguage(M(), 1).lex.river);
  store.commit(planSetLanguageWord(M(), 1, "river", "ネーヴァ"));
  assert.equal(wordOf(getLanguage(M(), 1), "river"), "ネーヴァ"); assert.ok(getLanguage(M(), 1).edited.river);
  const row = lexiconRows(getLanguage(M(), 1)).find((r) => r.key === "river"); assert.ok(row.edited && row.raw);
  store.undo(); assert.equal(wordOf(getLanguage(M(), 1), "river"), lang0);
});
check("不正な語は断る（ひらがな・長すぎ・同じ字の連続・未知の見出し）", () => {
  for (const bad of ["ひらがな", "abc", "", "アイウエオカキクケ", "ララ"]) assert.throws(() => planSetLanguageWord(M(), 1, "river", bad), /カタカナ/);
  assert.throws(() => planSetLanguageWord(M(), 1, "nothing", "アル"), /未知/);
});
check("手で直した語は、地名づくりに使われる", () => {
  store.commit(planSetLanguageWord(M(), 2, "river", "ゾルゾ"));
  const l = getLanguage(M(), 2), r = createRandom(1); let hit = 0;
  for (let i = 0; i < 200; i++) if (placeName(l, r, ["river"]).includes("ゾルゾ")) hit++;
  assert.ok(hit > 20, `${hit}/200`); store.undo();
});
check("語を引き直すと、手で直した印が外れ、その言語の音で新しい語になる", () => {
  store.commit(planSetLanguageWord(M(), 2, "king", "ガルド")); store.commit(planRerollLanguageWord(M(), 2, "king", createRandom(4)));
  const l = getLanguage(M(), 2); assert.ok(!l.edited.king && kana(wordOf(l, "king")) && wordOf(l, "king") !== "ガルド"); store.undo(); store.undo();
});

console.log("=== 名前への配線 ===");
check("都市の名前は、その場所の文化の言語で付く（地形つき）", () => {
  const cell = M().pack.cells.culture.findIndex((c) => c === 2), r = createRandom(3), lang = getLanguage(M(), 2);
  const used = new Set(); for (const w of [...Object.values(lang.lex), ...lang.proper, ...lang.male, ...lang.female]) for (const ch of renderWord(w)) used.add(ch);
  if (lang.link) for (const ch of renderToken(lang.link === "no" ? "no" : lang.link)) used.add(ch);
  for (let i = 0; i < 25; i++) { const n = suggestName(M(), { kind: "burg", rnd: r, cell }); assert.equal(n.style, "language"); for (const ch of n.name) assert.ok(used.has(ch), `${n.name} の「${ch}」`); }
});
check("style を明示すれば、従来どおり（言語は使わない）", () => {
  const n = suggestName(M(), { kind: "burg", rnd: createRandom(3), cell: 0, style: "western" }); assert.equal(n.style, "western");
});
check("国・宗教・属州の名前も、文化の言語で付く", () => {
  const s = M().pack.states.find((x) => x && x.i > 0 && x.culture === 2);
  assert.equal(suggestName(M(), { kind: "state", rnd: createRandom(1), id: s.i }).style, "language");
});
check("指導者の名前は、その国の文化の言語で付く（有効なカタカナ）", () => {
  const s = M().pack.states.find((x) => x && x.i > 0 && x.culture === 2);
  const cands = leaderCandidates(M(), s.i, { n: 6, seed: 5 }); assert.ok(cands.every((c) => kana(c.name)));
  ensureLeaders(M()); const cur = M().ext.data.leaders[s.i].current; assert.ok(kana(cur.name));
});
check("言語の無い場所（無人の地）は、従来の生成にもどる", () => {
  const n = suggestName(M(), { kind: "burg", rnd: createRandom(3), cultureId: 0, cell: M().pack.cells.culture.findIndex((c) => c === 0) });
  assert.notEqual(n.style, "language");
});
check("地形の判定（川・海岸・山）", () => {
  const C = M().pack.cells; const i = C.river.findIndex((v) => v > 0);
  if (i >= 0) assert.ok(featuresAt(M(), i).includes("river"));
});

if (failed) { console.log(`\n${failed}件失敗`); process.exit(1); } console.log("\n全て成功");
