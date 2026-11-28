// 長期実走: 世界を作って N 年進め、100 年ごとに「時間・メモリ・国・政体・出来事」を JSONL に書く。
// 注意: civ.events は直近 36 か月だけの作業バッファ（古い分は archive へ退避され、一部は失われる）。取りこぼさないよう 12 か月ごとに進めて数える。
// 使い方: node --expose-gc --max-old-space-size=3500 tools/long-run.mjs <年数> <シード> <セル数> <出力.jsonl> [resume]
// 500 年ごとに <出力>.ckpt へ世界と集計を保存する。プロセスが止まっても、resume を付けて同じ引数で起動すれば続きから走る。
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { regimeOf } from "../js/core/wcde/regimes.js";
import { appendFileSync, writeFileSync, existsSync, readFileSync, renameSync } from "node:fs";
const [years = 10000, seed = "run-1", cells = 3000, out = "/tmp/run.jsonl", mode = ""] = process.argv.slice(2), CK = out + ".ckpt", resuming = mode === "resume" && existsSync(CK); if (!resuming) writeFileSync(out, "");
const t0 = Date.now(), log = (o) => appendFileSync(out, JSON.stringify(o) + "\n"), mb = (x) => Math.round(x / 1048576);
let w, saved = null;
if (resuming) { saved = JSON.parse(readFileSync(CK, "utf8")); w = deserializeWorld(saved.worldIsString ? saved.world : saved.world); } else { ({ w } = createNewWorld({ worldSeed: seed, spec: { resolution: { targetCells: +cells } } })); dispatch(w, { type: "founding.delegate", authority: A.ADMIN }); }
const civ = w.civ, mem = () => { global.gc?.(); const m = process.memoryUsage(); return { rss: mb(m.rss), heap: mb(m.heapUsed) }; };
log({ t: resuming ? "resume" : "start", seed, cells: +cells, year: civ.date.year, ...mem() });
const KEEP = new Set(["regime_change", "regime_omen", "regime_arc_result", "election_held", "uprising", "uprising_crushed", "war_declared", "war_ended", "state_formed", "state_dissolved", "state_merged", "conquest", "leader_succession", "dynasty_changed", "tech_discovered", "religion_founded", "religion_schism", "culture_diverged", "treaty_signed", "alliance_formed", "annexed", "vassalized", "liberated", "capitulated", "event_occurred", "disaster_struck", "famine"]);
let seen = new Set(saved?.meta.seen ?? []), tally = saved?.meta.tally ?? {}, chunkTally = {}, rc = saved?.meta.rc ?? [], eventIds = saved?.meta.eventIds ?? {}, born = saved?.meta.born ?? {}, died = saved?.meta.died ?? {}, lastT = Date.now();
const yearNow = () => Math.floor(civ.date.year);
const poll = () => {
  const now = new Set(); for (const e of civ.events) { now.add(e.eventId); if (seen.has(e.eventId)) continue; const k = e.kind; tally[k] = (tally[k] ?? 0) + 1; chunkTally[k] = (chunkTally[k] ?? 0) + 1;
    if (k === "regime_change") rc.push({ y: yearNow(), from: e.facts?.from, to: e.facts?.regime, by: e.facts?.by, cause: !!e.causes?.length });
    if (k === "event_occurred") { const id = e.facts?.eventId; eventIds[id] = (eventIds[id] ?? 0) + 1; } }
  seen = now;
  for (const s of Object.values(civ.states)) { born[s.id] ??= yearNow(); if (!s.alive) died[s.id] ??= yearNow(); }
};
for (let y = Math.floor(civ.date.year); y < +years; y += 100) {
  chunkTally = {}; let bad = null;
  for (let m = 0; m < 1200; m += 12) { const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: 12, commandId: `r${y}-${m}-${resuming ? "b" : "a"}` }); if (!r.ok) { bad = r; break; } poll(); }
  if (bad) { log({ t: "stop", year: civ.date.year, err: JSON.stringify(bad).slice(0, 300) }); break; }
  const dt = (Date.now() - lastT) / 1000; lastT = Date.now(); const al = Object.values(civ.states).filter((s) => s.alive), reg = {}; for (const s of al) { const k = regimeOf(s); reg[k] = (reg[k] ?? 0) + 1; }
  const ideo = {}; for (const s of al) if (s.stateIdeology) ideo[s.stateIdeology] = (ideo[s.stateIdeology] ?? 0) + 1;
  log({ t: "chunk", year: civ.date.year, sec: +dt.toFixed(1), total: +((Date.now() - t0) / 1000).toFixed(0), ...mem(), states: al.length, ever: Object.keys(civ.states).length, pop: Math.round(al.reduce((a, s) => a + s.pop, 0)), groups: Object.keys(civ.groups).length, techAvg: al.length ? +(al.reduce((a, s) => a + Object.keys(s.techAdopted ?? {}).length, 0) / al.length).toFixed(0) : 0, regimes: reg, ideo, kinds: Object.fromEntries(Object.entries(chunkTally).filter(([k]) => KEEP.has(k))) });
  if (Math.floor(civ.date.year) % 500 === 0) { const sw = serializeWorld(w); writeFileSync(CK + ".tmp", JSON.stringify({ world: sw, meta: { seen: [...seen], tally, rc, eventIds, born, died } })); renameSync(CK + ".tmp", CK); log({ t: "ckpt", year: civ.date.year }); }
}
const life = []; for (const id in born) if (died[id] != null) life.push(died[id] - born[id]);
log({ t: "final", year: civ.date.year, mem: mem(), tally, regimeChanges: rc, lifespans: life, eventIds, alive: Object.values(civ.states).filter((s) => s.alive).map((s) => ({ r: regimeOf(s), pop: Math.round(s.pop), ideo: s.stateIdeology ?? null })) });
