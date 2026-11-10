// v6.3.2: Obsidian 出力の軽量化（年表ファイル・フォルダ直書き・複数 ZIP）と、先史の人口記録（終了時点にそろえる）。
import assert from "node:assert/strict";
import { createNewWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { obsidianFiles, validateVault } from "../js/io/obsidian.js";
import { vaultFiles, writeToDirectory, zipParts, splitPath } from "../js/io/vault-writer.js";
import { unzipFiles } from "../js/io/zip.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 5).join(" | ")); } };
const R = createNewWorld({ worldSeed: "v632-1", spec: { resolution: { targetCells: 3000 } }, magic: { enabled: false } }), w = R.w;
await check("先史の最後の時代区分の人口が、先史終了時の人口とそろう（始まりの値でなく終わりの値）", () => {
  const pre = w.civ.wcde.prehistory, last = pre.epochs.at(-1); assert.equal(pre.epochs.length, 20);
  assert.equal(last.pop, pre.pop, `最後の時代 ${last.pop} と最終 ${pre.pop}`);
  for (let i = 1; i < pre.epochs.length; i++) assert.ok(pre.epochs[i].pop >= pre.epochs[i - 1].pop * 0.5, "時代ごとの人口が急に 1/2 未満へ落ちない");
  const ev = w.civ.events.filter((e) => e.kind === "prehistory_epoch"); assert.equal(ev.length, 20);
  assert.equal(ev.at(-1).effects.find((x) => x.property === "prehistory.pop").after, pre.pop);
});
dispatch(w, { type: "founding.delegate", authority: A.ADMIN }); assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 3600, commandId: "a" }).ok);
const light = [], heavy = []; for await (const f of vaultFiles(w.world, w.civ, "試験世界")) light.push(f); for await (const f of obsidianFiles(w.world, w.civ, "試験世界", { decisionNotes: false })) heavy.push(f);
await check("軽量モードは、出来事を 1 件 1 ノートにせず、10 年ごとの年表ファイルにまとめる（件数が大きく減る）", () => {
  const tl = light.filter((f) => /\/年表\//.test(f.path)); assert.ok(tl.length >= 1, "年表ファイルがある"); assert.ok(!light.some((f) => /\/出来事\//.test(f.path)), "出来事のノートは作らない");
  assert.ok(light.length < heavy.length * 0.7 || heavy.length < 200, `軽量 ${light.length} 件 / 全件 ${heavy.length} 件`);
  const nEv = [...w.civ.events].length; const lines = tl.reduce((a, f) => a + (String(f.data).match(/^- \*\*/gm) ?? []).length, 0); assert.ok(lines > 0 && lines <= nEv + 100000, "年表に出来事が載る: " + lines);
});
await check("軽量モードの vault もリンク切れが 0（出来事へのリンクは名前だけの表記になる）", () => { const v = validateVault(light, "試験世界"); assert.deepEqual(v, [], JSON.stringify(v).slice(0, 300)); const man = JSON.parse(light.find((f) => f.kind === "manifest").data); assert.equal(man.unresolvedLinks, 0); });
await check("フォルダへ直接書く: 入れ子のフォルダに全ファイルを 1 つずつ書く（メモリ上の偽のフォルダで検証）", async () => {
  const tree = new Map(), mk = (path) => ({ async getDirectoryHandle(n) { const p = path + "/" + n; if (!tree.has(p)) tree.set(p, { dir: true }); return mk(p); }, async getFileHandle(n) { const p = path + "/" + n; return { async createWritable() { const chunks = []; return { async write(d) { chunks.push(d); }, async close() { tree.set(p, { data: chunks }); } }; } }; } });
  async function* gen() { for (const f of light) yield f; }
  const r = await writeToDirectory(mk(""), gen()); assert.equal(r.files, light.length); const written = [...tree].filter(([, v]) => v.data).length; assert.equal(written, light.length);
  assert.ok([...tree.keys()].some((k) => /\/年表\//.test(k)) || [...tree.keys()].some((k) => k.includes("/年表")));
});
await check("複数の ZIP: 上限ごとに分かれ、全部を足すと全ファイルがそろう（重複・欠落なし）", async () => {
  const parts = []; async function* gen() { for (const f of light) yield f; }
  for await (const p of zipParts(gen(), { root: "試験世界", maxBytes: 60000, maxFiles: 150 })) parts.push(p);
  assert.ok(parts.length >= 2, "2 つ以上に分かれる: " + parts.length); assert.equal(parts.at(-1).final, true); assert.ok(parts.slice(0, -1).every((p) => !p.final));
  assert.deepEqual(parts.map((p) => p.index), parts.map((_, i) => i + 1)); assert.ok(parts.every((p) => p.fileCount <= 150));
  const seen = new Set(); for (const p of parts) for (const [path] of await unzipFiles(p.bytes)) { assert.ok(!seen.has(path), "重複 " + path); seen.add(path); }
  assert.equal(seen.size, light.length); assert.equal(light.length, new Set(light.map((f) => f.path)).size);
});
await check("パスの検査: 出力先の外（..）や空の部分は書かない", () => { assert.throws(() => splitPath("a/../b")); assert.throws(() => splitPath("a//b")); assert.deepEqual(splitPath("世界/年表/0〜9年.md"), { dirs: ["世界", "年表"], name: "0〜9年.md" }); });
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
