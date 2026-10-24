// V5-M9: Obsidian ZIP。1実体=1ノート・全イベント/全AI判断・リンク整合・詳細ログ・関係グラフ・地図・出力先の安全・再出力・範囲指定。
import assert from "node:assert/strict";
import { generateWorld } from "../js/core/world/worldgen.js";
import { createCivState } from "../js/core/civ/civ-state.js";
import { createCivSim } from "../js/core/civ/civ-sim.js";
import { exportObsidianZip, obsidianFiles, validateVault, estimateVault, FOLDERS } from "../js/io/obsidian.js";
import { cellRaster } from "../js/core/world/cell-raster.js";
import { unzipFiles, zipFiles } from "../js/io/zip.js";
import { TECHS } from "../js/core/civ/tech.js";
import { stateAt } from "../js/core/civ/history.js";

let failed = 0;
const check = async (label, fn) => { try { await fn(); console.log(`  OK   ${label}`); } catch (e) { failed++; console.log(`  FAIL ${label}: ${String(e.message).split("\n")[0]}`); } };
const W = generateWorld({ worldSeed: "civ-m1", resolution: { targetCells: 6000 } });
const civ = createCivState(W, { startGroupId: 1, historySeed: 99 }); civ.options.magicRate = 25; const sim = createCivSim(W, civ); sim.advanceMonths(900 * 12);
// 危険な名前（出力先の外へ出ようとする・禁止文字）を持つ国家を1つ混ぜる
const bad = Object.values(civ.states)[0]; bad.name = "../悪い:名前?<x>|[[リンク]]";
const NAME = "テスト世界/../x";
let t0 = Date.now(); const R = await exportObsidianZip(W, civ, NAME, { cellRaster }), z = await unzipFiles(R.bytes), ms = Date.now() - t0;
const dec = new TextDecoder(), txt = (p) => dec.decode(z.get(p)), root = R.root;
console.log(`  (900年: ${R.files} ファイル・ZIP ${(R.bytes.length / 1e6).toFixed(1)}MB・${(ms / 1000).toFixed(1)}秒。内訳 ${JSON.stringify(R.counts)})`);

console.log("=== M9: 構造と整合 ===");
await check("出力先は <世界名>/ の内側だけ。世界名と実体名の禁止文字・'..' は無害化される", () => {
  assert.ok(!root.includes("/") && !root.includes("..")); const files = [...z.keys()].map((p) => ({ path: p, data: z.get(p) })); assert.deepEqual(validateVault(files, root), []);
  for (const p of z.keys()) { assert.ok(p.startsWith(root + "/"), p); assert.ok(!p.split("/").some((s) => s === ".." || s === "."), p); assert.ok(!/[\\:*?"<>|]/.test(p.slice(root.length + 1)), p); }
  assert.ok([...z.keys()].some((p) => p.includes("悪い")), "危険な名前の国家のノートが出ていない");
});
await check("リンク切れが0（全ての [[…]] の行き先が実在するノート）。実体のIDは全て解決される", () => { assert.equal(R.unresolvedLinks, 0); const files = [...z.keys()].map((p) => ({ path: p, data: z.get(p) })); assert.deepEqual(validateVault(files, root).filter((e) => e.startsWith("リンク切れ")), []); });
await check("全てのイベントと全てのAI判断が、1件1ノート（戦闘は戦闘フォルダ）", () => {
  const ev = [...z.keys()].filter((p) => p.startsWith(`${root}/${FOLDERS.event}/`) || p.startsWith(`${root}/${FOLDERS.battle}/`)).length, dc = [...z.keys()].filter((p) => p.startsWith(`${root}/${FOLDERS.decision}/`)).length;
  assert.equal(ev, civ.events.length); assert.equal(dc, civ.decisions.length); assert.ok(ev > 1000 && dc > 1000);
});
await check("主要なカテゴリが揃う（国家・戦争・条約・都市・集団・地域・文化・言語・宗教・技術・種族・魔法・災害・歴史認識・表現物・年代記・グラフ・詳細ログ・地図）", () => {
  const has = (f) => [...z.keys()].some((p) => p.startsWith(`${root}/${f}/`)); for (const k of ["state", "war", "treaty", "settlement", "group", "region", "culture", "language", "religion", "tech", "species", "ability", "org", "disaster", "interp", "work", "chronicle", "graph", "logState", "logAi", "map", "person"]) assert.ok(has(FOLDERS[k]), k);
  assert.equal([...z.keys()].filter((p) => p.startsWith(`${root}/${FOLDERS.tech}/`)).length, TECHS.length); assert.ok(z.has(`${root}/README.md`) && z.has(`${root}/manifest.json`));
  assert.ok(![...z.keys()].some((p) => p.includes("/思想/")), "データの無い『思想』フォルダがある");
});
await check("frontmatter が正しく、ID・種類・タグを持つ。イベントノートに原因（関係と根拠）と結果が載り、相互にリンクする", () => {
  const e = civ.events.find((x) => x.causes.some((c) => /^event_/.test(c.targetId))), p = [...z.keys()].find((k) => k.includes(`__${e.eventId}.md`)); const s = txt(p);
  assert.match(s, /^---\nid: "event_/); assert.ok(s.split("\n---\n")[0].split("\n").slice(1).every((l) => /^[^\s:]+: .+$/.test(l)), "frontmatter の行が不正"); assert.match(s, /## 原因\n- \S+（\w+）: \[\[/); assert.match(s, /## 結果/);
  const c = e.causes.find((x) => /^event_/.test(x.targetId)), cp = [...z.keys()].find((k) => k.includes(`__${c.targetId}.md`)); assert.ok(txt(cp).includes(`__${e.eventId}|`), "原因側のノートに結果としてリンクされていない");
});
await check("AI判断のノートに、観測・全候補（得点・資格・理由・要因）・選択・結果イベントへのリンクが載る", () => {
  const d = civ.decisions.find((x) => x.result?.eventIds?.length && x.chosen.key), s = txt([...z.keys()].find((k) => k.includes(`__${d.decisionId}.md`))); assert.match(s, /## 観測/); assert.match(s, /## 候補\n\| 行動 \| 対象 \| 選択肢 \| 得点 \| 資格 \| 理由 \| 要因 \|/); assert.ok(s.includes(`**${d.chosen.key}**`)); assert.match(s, /結果のイベント/);
});
await check("詳細ログ: 国家の月次状態（状態が変わった月の行・履歴から復元した値）と、AI判断の一覧が、100年ごとに出る", () => {
  const s0 = Object.values(civ.states).find((s) => s.alive && s.formedAt < 300 * 12) ?? Object.values(civ.states).find((s) => s.alive), logs = [...z.keys()].filter((p) => p.startsWith(`${root}/${FOLDERS.logState}/`) && p.includes(`__${s0.id}__`)); assert.ok(logs.length >= 1);
  const body = txt(logs[logs.length - 1]), row = body.split("\n").find((l) => /^\| \d+年\d+月 \|/.test(l)); assert.ok(row); const cells = row.split(" | "), m = cells[0].match(/(\d+)年(\d+)月/), mi = Number(m[1]) * 12 + Number(m[2]) - 1; assert.equal(Number(cells[4]), stateAt(civ, s0.id, mi).pop);
  assert.ok([...z.keys()].some((p) => p.startsWith(`${root}/${FOLDERS.logAi}/`) && p.includes(`__${s0.id}__`)));
});
await check("関係グラフは Mermaid（国家の系譜・文化/言語/宗教の系統・戦争の関係）。上限で切った場合は省略数を書く", () => { for (const n of ["国家の系譜", "文化の系統", "言語の系統", "宗教の系統", "戦争の関係"]) { const s = txt(`${root}/${FOLDERS.graph}/${n}.md`); assert.match(s, /```mermaid\ngraph LR/); } });
await check("地図: PNG（地形・現在・過去の国家領域）。過去と現在で国家領域の画像が違う（月次履歴からの復元）", () => {
  const pngs = [...z.keys()].filter((p) => p.startsWith(`${root}/${FOLDERS.map}/`)); assert.ok(pngs.length >= 3); for (const p of pngs) assert.deepEqual([...z.get(p).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const st = pngs.filter((p) => p.includes("国家領域")).sort((a, b) => a.length - b.length || a.localeCompare(b)), a = z.get(st[1]), b = z.get(st[st.length - 1]); assert.ok(a.length !== b.length || a.some((v, i) => v !== b[i]), "過去と現在が同じ画像");
});
await check("書き出す前の見積もり（ファイル数）が実際と一致する（UI が何が出るかを先に見せる）", () => { const e = estimateVault(W, civ, { cellRaster }); const actual = R.files; assert.ok(Math.abs(e.files + e.maps - actual) <= Math.max(5, actual * 0.01), `${e.files}+${e.maps} vs ${actual}`); assert.equal(e.events, civ.events.length); assert.equal(e.decisions, civ.decisions.length); });
console.log("=== M9: manifest・再出力・範囲 ===");
await check("manifest.json: 全ファイルのパス・サイズ・SHA-256。件数が ZIP と一致し、内容のハッシュが合う", async () => {
  const man = JSON.parse(txt(`${root}/manifest.json`)); assert.equal(man.format, "alterhistory-obsidian"); assert.equal(man.files.length + 1, z.size); assert.equal(man.unresolvedLinks, 0);
  for (const [p, size, h] of man.files.slice(0, 200)) { const raw = z.get(`${root}/${p}`); assert.equal(raw.length, size); const d = new Uint8Array(await crypto.subtle.digest("SHA-256", raw)); assert.equal([...d].map((b) => b.toString(16).padStart(2, "0")).join(""), h); }
});
await check("同じ歴史を再出力すると、同じパス・同じ内容（上書きしても vault は変わらない）。README に上書きの方針が書いてある", async () => {
  const R2 = await exportObsidianZip(W, civ, NAME, { maps: false }), z2 = await unzipFiles(R2.bytes), a = [...z.keys()].filter((p) => !p.startsWith(`${root}/${FOLDERS.map}/`) && p !== `${root}/README.md` && p !== `${root}/manifest.json`).sort(), b = [...z2.keys()].filter((p) => p !== `${root}/README.md` && p !== `${root}/manifest.json`).sort(); assert.deepEqual(a, b);
  for (const p of a.slice(0, 300)) assert.deepEqual(z.get(p), z2.get(p)); assert.match(txt(`${root}/README.md`), /再出力・上書き/);
});
await check("範囲指定（AI判断を出さない・期間を絞る）が効き、README と manifest に絞った範囲が残る", async () => {
  const R3 = await exportObsidianZip(W, civ, "範囲", { maps: false, decisionNotes: false, fromMonth: 500 * 12, toMonth: 600 * 12 }), z3 = await unzipFiles(R3.bytes);
  assert.ok(![...z3.keys()].some((p) => p.startsWith(`範囲/${FOLDERS.decision}/`))); const n = [...z3.keys()].filter((p) => p.startsWith(`範囲/${FOLDERS.event}/`)).length; assert.ok(n > 0 && n < civ.events.length / 2);
  const man = JSON.parse(dec.decode(z3.get("範囲/manifest.json"))); assert.equal(man.scope.decisionNotes, false); assert.equal(man.scope.fromMonth, 6000); assert.match(dec.decode(z3.get("範囲/README.md")), /に絞っています/); assert.equal(man.unresolvedLinks, 0, "範囲を絞ったときも、リンク切れは0（範囲外は名前だけにする）"); assert.ok(man.outOfScopeLinks > 0); const files3 = [...z3.keys()].map((p) => ({ path: p, data: z3.get(p) })); assert.deepEqual(validateVault(files3, "範囲"), []);
});
await check("ZIP: 65,535 件を超えても壊れない（ZIP64 の終端）／CRC を検査して読める", async () => {
  async function* many() { for (let i = 0; i < 70000; i++) yield { path: `r/${i}.md`, data: `n${i}` }; } const b = await zipFiles(many(), { compress: false }), m = await unzipFiles(b); assert.equal(m.size, 70000); assert.equal(dec.decode(m.get("r/69999.md")), "n69999");
});
if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); } else console.log("\n全て成功");
