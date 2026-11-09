// v6.6.0: 暦の既定（空白）・時代区分・建国前に進む世界の時計・背景の絵 1000 通り・ロゴ。
import assert from "node:assert/strict";
import { normalizeCalendar, formatDate, eraLabel, DEFAULT_CALENDAR } from "../js/core/wcde/calendar.js";
import { createNewWorld, entryMonthsOf, advanceEntryStep, formatWorldDate, ENTRY_MAX_YEARS } from "../js/core/wcde/world.js";
import { capitalSites } from "../js/core/wcde/founding.js";
import { sceneSvg, logoSvg, SCENE_COUNT } from "../js/ui/v6/scenes.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 4).join(" | ")); } };

await check("暦の既定は空白（紀元と名づけない）。年は数字だけ", () => {
  assert.equal(DEFAULT_CALENDAR.epochName, ""); const { calendar, errors } = normalizeCalendar({}); assert.deepEqual(errors, []);
  assert.equal(formatDate(calendar, 12 * 5 + 3), "5年4月"); assert.ok(!/紀元/.test(formatDate(calendar, 0)) && !/紀元/.test(formatDate(calendar, -24)));
  assert.equal(formatDate(calendar, -24), "前2年1月"); assert.equal(eraLabel(calendar, 100), "");
});
await check("時代区分を複数。何年から〇〇時代。最初の区分より前は空白", () => {
  const { calendar, errors } = normalizeCalendar({ epochName: "暦", eras: [{ name: "黎明時代", startYear: 0 }, { name: "鉄の時代", startYear: 120 }] }); assert.deepEqual(errors, []);
  assert.equal(formatDate(calendar, 12 * 7), "暦7年1月"); assert.equal(eraLabel(calendar, 12 * 50), "黎明時代"); assert.equal(eraLabel(calendar, 12 * 120), "鉄の時代"); assert.equal(eraLabel(calendar, -12), "");
  assert.ok(normalizeCalendar({ eras: [{ name: "a", startYear: 10 }, { name: "b", startYear: 5 }] }).errors.length, "境界は昇順");
});
await check("世界名と暦を決めて生成できる。世界は建国の前に進んでいる（0〜50 年・同じ設定は同じ値）", () => {
  const cfg = { name: "アルセリオン", worldSeed: "t660", spec: { resolution: { targetCells: 3000 } }, calendar: { eras: [{ name: "古代", startYear: 0 }] } };
  const r = createNewWorld(cfg); assert.ok(r.ok, String(r.errors)); const w = r.w, c = w.civ; assert.equal(c.wcde.config.name, "アルセリオン"); assert.equal(c.wcde.config.calendar.epochName, "");
  const months = entryMonthsOf(c.wcde.config); assert.ok(months >= 0 && months < (ENTRY_MAX_YEARS + 1) * 12); assert.equal(months, entryMonthsOf(c.wcde.config));
  assert.equal(c.monthIndex, 0); const short = Math.min(months, 24); c.wcde.entryProgress = { done: 0, total: short }; let p; for (let i = 0; i < 20; i++) { p = advanceEntryStep(w, { chunk: 12 }); if (p.done) break; }
  assert.ok(p.done && c.wcde.entry.months === short && c.monthIndex === short && c.wcde.phase === "founding", "進んでも建国の段階のまま");
  assert.ok(capitalSites(w).length > 0, "首都にできる場所（国家のない都市）が残っている"); assert.equal(c.wcde.news.scanned, c.events.length, "過去のニュースで時間は止まらない"); assert.ok(!/紀元/.test(formatWorldDate(w)));
});
await check("背景の絵は 1000 通り（すべて異なり、正しい SVG）", () => {
  assert.equal(SCENE_COUNT, 1000); const set = new Set(); for (let i = 0; i < 1000; i++) { const s = sceneSvg(i); assert.ok(s.startsWith("<svg") && s.endsWith("</svg>") && !/NaN|undefined/.test(s), "seed " + i); set.add(s); } assert.equal(set.size, 1000); assert.equal(sceneSvg(5), sceneSvg(5)); assert.equal(sceneSvg(1005), sceneSvg(5));
  assert.ok(logoSvg().includes("ALTER") && logoSvg({ withText: false }).startsWith("<svg"));
});
console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
