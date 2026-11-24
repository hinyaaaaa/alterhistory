// v6.7.0: 命名の全面見直し。国号は史実風（市国・部族をやめる）／宗教は〇〇教（〇〇派）／文化は〇〇人／名前は長め／仏教のない世界で「寺院」を使わない。
import assert from "node:assert/strict";
import { stateForm, composeStateName, baseOfState, retitle, religionRoot, sectName } from "../js/core/wcde/domains/naming.js";
import { createNewWorld } from "../js/core/wcde/world.js";
import { safeAdvance } from "../js/core/wcde/contract.js";
import { createReligion, makeNameJa } from "../js/core/civ/culture.js";
import { VIA } from "../js/core/civ/states.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 4).join(" | ")); } };

await check("宗教は〇〇教、分派は〇〇教〇〇派（分派がさらに分かれても元の教に付く）", () => {
  assert.equal(religionRoot("ルーナ教アスト派"), "ルーナ教"); assert.equal(sectName("ルーナ教", "アスト"), "ルーナ教アスト派"); assert.equal(sectName("ルーナ教アスト派", "ベル"), "ルーナ教ベル派");
  const civ = { religions: {}, monthIndex: 0 }, ids = { next: (k) => k + (Object.keys(civ.religions).length + 1) }, rng = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  const a = createReligion(civ, ids, rng, {}), b = createReligion(civ, ids, rng, { parent: a }); assert.ok(/教$/.test(civ.religions[a].name), civ.religions[a].name); assert.ok(/教.+派$/.test(civ.religions[b].name), civ.religions[b].name);
  let short = 0; for (let i = 0; i < 200; i++) if (makeNameJa(rng).length <= 2) short++; assert.equal(short, 0, "2 文字以下の名前は作らない");
});
await check("世界の中の名前: 文化は〇〇人（重ならない）、宗教は〇〇教、国号に市国・部族がなく、名前は長い", () => {
  const w = createNewWorld({ worldSeed: "n670", spec: { resolution: { targetCells: 3000 } } }).w, civ = w.civ; safeAdvance(w, 36, { chunk: 12 });
  const cu = Object.values(civ.cultures).map((c) => c.name); assert.ok(cu.length > 3 && cu.every((n) => /人$/.test(n) && !/の人々|系$/.test(n)), cu.slice(0, 5).join(","));
  assert.equal(new Set(cu).size, cu.length, "文化名は重ならない"); const rl = Object.values(civ.religions).map((r) => r.name); assert.ok(rl.length > 0 && rl.every((n) => /教/.test(n) && !/信仰/.test(n)), rl.slice(0, 5).join(","));
  assert.equal(new Set(rl).size, rl.length, "宗教名は重ならない"); const sts = Object.values(civ.states); assert.ok(sts.length > 0 && sts.every((s) => !/市国|部族/.test(s.name)), sts.slice(0, 5).map((s) => s.name).join(","));
  const lens = sts.map((s) => (s.nameBase ?? s.name).length), avg = lens.reduce((a, b) => a + b, 0) / lens.length; assert.ok(avg >= 4.2 && Math.min(...lens) >= 3, `語根の平均 ${avg}・最小 ${Math.min(...lens)}`);
  assert.ok(Object.values(civ.languages).every((l) => !l.name || /語$/.test(l.name)));
});
await check("仏教のない世界で、「寺院」「寺」という語を、画面・名前・出来事に使っていない", () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "generated" || e.name === "node_modules" ? [] : walk(join(d, e.name))) : e.name.endsWith(".js") ? [join(d, e.name)] : []));
  const hits = []; for (const f of walk(new URL("../js", import.meta.url).pathname)) { const t = readFileSync(f, "utf8"); if (/寺院|仏教|仏像/.test(t)) hits.push(f); } assert.deepEqual(hits, []);
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
