// v6.20.0: 休眠した要素（共有する記録）が、月の途中で journal を通さずに書かれていないことの長期検証。
//   使い方: node --max-old-space-size=3500 tests/perf/v620-guard-soak.mjs [年=420] [検証する月数=48] [セル数=3000]
import { createNewWorld } from "../../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../../js/core/wcde/contract.js";
import { beginMonth, setTxGuard, takeCheckpoint } from "../../js/core/sim/month-transaction.js";
const years = +(process.argv[2] ?? 420), months = +(process.argv[3] ?? 48), cells = +(process.argv[4] ?? 3000);
const { w } = createNewWorld({ worldSeed: "long-1", spec: { resolution: { targetCells: cells } } }); dispatch(w, { type: "founding.delegate", authority: A.ADMIN });
const r = dispatch(w, { type: "time.advance", authority: A.ADMIN, months: (years - w.civ.date.year) * 12, commandId: "soak" }); if (!r.ok) { console.log("停止", JSON.stringify(r).slice(0, 200)); process.exit(1); }
const civ = w.civ, cp0 = takeCheckpoint(civ); console.log(`年 ${civ.date.year}: 休眠 ${cp0.stats.shared} / 動いている ${cp0.stats.cloned}（国家 ${Object.keys(civ.states).length}・人物 ${Object.keys(civ.figures).length}・戦争 ${Object.keys(civ.wars).length}・条約 ${Object.keys(civ.treaties).length}）`);
const J = (c) => JSON.stringify([c.states, c.figures, c.wars, c.treaties, c.groups, c.languages, c.events, c.archive, c.stats]);
setTxGuard(true); let bad = 0;
for (let i = 0; i < months; i++) { const before = J(civ), tx = beginMonth(w); let err = null; try { w.sim.advanceMonth(); tx.rollback(); } catch (e) { err = e; } if (err) { bad++; console.log(`月 ${i}: ${String(err.message).slice(0, 160)}`); } else if (J(civ) !== before) { bad++; console.log(`月 ${i}: 巻き戻しで世界が元に戻らない`); } w.sim.advanceMonth(); }
setTxGuard(false); console.log(bad ? `違反 ${bad} 件` : `違反なし（${months} か月・年 ${civ.date.year}）`); process.exit(bad ? 1 : 0);
