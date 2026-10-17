// v2.4.1 A7: 戦争バランスの検証ツール（単体テストではなく、数字を出すスクリプト）。
//   使い方: node tests/balance/war-stats.mjs [--n=400] [--seed=123] [--md]
//   合成マップで、ランダムな対戦を数百回ずつ回し、次を表にして出す。
//     1) 戦力比ごとの勝率（強い側／弱い側／膠着）   2) 決着までの月数（形態別）
//     3) ドクトリン別の勝率（総合方針・節を全部選んだ場合）   4) 勝利の種類の割合（全面降伏に至る割合）
//     5) 民意が尽きた側の降伏
//   最後に、判定（強い側が有意に勝つか／弱い側が勝つ不具合が無いか／上限が効いているか）を出し、不合格なら終了コード 1。
//   乱数は固定しない（--seed を省くと毎回違う。使った種は表の先頭に出す）。
import { createRandom } from "../../js/core/random.js";
import { planDeclareAndResolveWar } from "../../js/core/edit/wars.js";
import { previewWar, EXHAUST_SUPPORT } from "../../js/core/sim/war-engine.js";
import { DOCTRINE_BY_KEY } from "../../js/core/sim/units.js";
import { TREE_NODES, normalizeNodes, effectiveDoctrineKey } from "../../js/core/edit/doctrines.js";

const arg = (k, d) => { const m = process.argv.find((x) => x.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const TRIALS = Number(arg("n", 400)), SEED = Number(arg("seed", Date.now() % 1e9)), MD = process.argv.includes("--md");
const rnd = createRandom(SEED);
const reg = (id, i, inf) => ({ i, name: `軍${i}`, state: id, cell: 0, u: { infantry: inf, cavalry: 0, archers: 0, artillery: Math.round(inf / 40), armor: 0, air: 0, navy: 0, special: 0, advanced: 0, nuclear: 0 } });
const st = (i, full, inf, o = {}) => ({ i, name: full.slice(0, 3), fullName: full, techLevel: 5, industry: 300, rural: 3000, urban: 500, cells: 8, capital: 1, morale: 70, support: 70, doctrine: "balanced", military: [reg(i, 0, inf), reg(i, 1, inf / 2)], diplomacy: [], treasury: 1000, ...o });
const N = 40;
const mk = (techs = [5, 5, 5, 5, 5]) => { const m = {
  worldTime: { year: 1, month: 1 }, rev: {}, meta: {}, markers: [], notes: [],
  pack: { states: [{ i: 0, name: "N", diplomacy: [] }, ...[6000, 5000, 4000, 4000, 4000].map((inf, k) => st(k + 1, `国${k + 1}王国`, inf, { techLevel: techs[k] }))],
    burgs: [null, ...[1, 2, 3, 4, 5].flatMap((sid) => [0, 4].map((o) => ({ i: 0, name: `都${sid}${o ? "b" : "a"}`, cell: (sid - 1) * 8 + o, state: sid })))].map((b, k) => (b ? { ...b, i: k } : b)),
    provinces: [0], cultures: [null], religions: [null], cells: { state: Uint16Array.from({ length: N }, (_, i) => Math.floor(i / 8) + 1), province: new Uint16Array(N), biome: new Uint8Array(N).fill(1) } },
  geometry: { pack: { h: new Uint8Array(N).fill(30), cells: { c: Array.from({ length: N }, (_, i) => [i - 1, i + 1].filter((x) => x >= 0 && x < N)) }, p: Array.from({ length: N }, () => [0, 0]) } }, ext: { data: {} } };
  for (const s of m.pack.states.slice(1)) s.capital = m.pack.burgs.find((b) => b && b.state === s.i).i; return m; };
const d0 = { year: 1, month: 1 };
const nowMonths = (d) => d.year * 12 + d.month;

/** 1回の対戦。tweak(map) で国1（攻撃側）・国2（防衛側）を整える。戻り値は判定の要約 */
function trial({ type = "conventional", ratio = 1, tweak = null, defenderStrong = false }) {
  const m = mk();
  const weak = m.pack.states[defenderStrong ? 1 : 2], strong = m.pack.states[defenderStrong ? 2 : 1];
  const baseInf = 4000;
  for (const [s, f] of [[weak, 1], [strong, ratio]]) { s.military = [reg(s.i, 0, baseInf * f), reg(s.i, 1, baseInf * f / 2)]; }
  if (tweak) tweak(m);
  const pv = previewWar(m, [1], [2], null), A = pv.aStrength.land, D = pv.dStrength.land;
  const r = planDeclareAndResolveWar(m, { attackers: [1], defenders: [2], date: d0, rnd, type });
  const res = r.result, strongIsAttacker = A >= D;
  const side = res.winner === "stalemate" ? "stalemate" : (res.winner === "attacker") === strongIsAttacker ? "strong" : "weak";
  return { ratio: Math.max(A, D) / Math.max(1, Math.min(A, D)), side, winner: res.winner, victory: res.victory.type, months: nowMonths(r.endsAt) - nowMonths(d0), aWins: res.winner === "attacker", dWins: res.winner === "defender" };
}
const wilson = (k, n) => { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), s = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n); return [(c - s) / d, (c + s) / d]; };
const pct = (k, n) => `${(100 * k / Math.max(1, n)).toFixed(1).padStart(5)}%`;
const pad = (s, w) => String(s).padEnd(w);
const out = [];
const P = (s = "") => { out.push(s); console.log(s); };
const T = (title, head, rows) => {
  P(MD ? `\n#### ${title}\n` : `\n== ${title} ==`);
  if (MD) { P(`| ${head.join(" | ")} |`); P(`| ${head.map(() => "---").join(" | ")} |`); for (const r of rows) P(`| ${r.join(" | ")} |`); }
  else { P(head.map((h, i) => pad(h, i ? 12 : 22)).join("")); for (const r of rows) P(r.map((c, i) => pad(c, i ? 12 : 22)).join("")); }
};
const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { mean: a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), med: s[Math.floor(s.length / 2)] ?? 0, p90: s[Math.floor(s.length * 0.9)] ?? 0 }; };
P(`戦争バランスの検証（1条件あたり ${TRIALS} 回、乱数の種 ${SEED}）`);

// 1) 戦力比ごとの勝率（通常戦。強い側が攻撃側／防衛側の両方を回す）
const checks = []; const byRatio = [];
for (const target of [1, 1.25, 1.5, 2, 3, 5]) {
  const rs = []; for (let i = 0; i < TRIALS; i++) rs.push(trial({ ratio: target, defenderStrong: i % 2 === 1 }));
  const c = { strong: 0, weak: 0, stalemate: 0 }; for (const r of rs) c[r.side]++;
  byRatio.push({ target, c, ratioMeasured: stat(rs.map((r) => r.ratio)).mean, n: rs.length });
}
T("1) 戦力比ごとの勝率（通常戦。実測の戦力比＝強い側÷弱い側の陸戦力）", ["戦力比(設定)", "実測の比", "強い側が勝つ", "弱い側が勝つ", "膠着"], byRatio.map((b) => [`${b.target}倍`, b.ratioMeasured.toFixed(2), pct(b.c.strong, b.n), pct(b.c.weak, b.n), pct(b.c.stalemate, b.n)]));

// 2) 決着までの月数（形態別。戦力比1.5倍）
const monthsRows = []; const typeStats = {};
for (const type of ["limited", "conventional", "total", "asymmetric"]) {
  const rs = []; for (let i = 0; i < TRIALS; i++) rs.push(trial({ type, ratio: 1.5, defenderStrong: i % 2 === 1 }));
  const ms = stat(rs.map((r) => r.months)); typeStats[type] = { rs, ms };
  monthsRows.push([type, ms.mean.toFixed(1), String(ms.med), String(ms.p90), pct(rs.filter((r) => r.side === "strong").length, rs.length), pct(rs.filter((r) => r.side === "weak").length, rs.length)]);
}
T("2) 目安の期間（月）と勝率（戦力比1.5倍）", ["形態", "平均", "中央値", "上位10%", "強い側勝ち", "弱い側勝ち"], monthsRows);

// 3) ドクトリン別の勝率（同じ戦力・同じ技術で、総合方針ごとに「均衡」と戦う。攻撃側・防衛側を半々）
const bases = Object.keys(DOCTRINE_BY_KEY).filter((k) => !k.includes("|"));
const docRows = [];
for (const k of bases) {
  let win = 0, tot = 0;
  for (let i = 0; i < TRIALS; i++) { const atk = i % 2 === 0; const r = trial({ ratio: 1, tweak: (m) => { m.pack.states[atk ? 1 : 2].doctrine = k; m.pack.states[atk ? 2 : 1].doctrine = "balanced"; } }); if (r.winner !== "stalemate") { tot++; if (atk ? r.aWins : r.dWins) win++; } }
  docRows.push([k, pct(win, tot), `${tot}戦中`]);
}
const allNodes = (m, id) => { const s = m.pack.states[id]; s.regime = "absolute_monarchy"; s.doctrineNodes = normalizeNodes(s, TREE_NODES.map((n) => n.key)); };
{ let win = 0, tot = 0; for (let i = 0; i < TRIALS; i++) { const atk = i % 2 === 0; const r = trial({ ratio: 1, tweak: (m) => { allNodes(m, atk ? 1 : 2); } }); if (r.winner !== "stalemate") { tot++; if (atk ? r.aWins : r.dWins) win++; } } docRows.push(["均衡＋全ての節", pct(win, tot), `${tot}戦中`]); }
T("3) ドクトリン別の勝率（同戦力・同技術で、「均衡・節なし」と戦う。膠着は除く。50%に近いほど釣り合っている）", ["ドクトリン", "勝率", "試合数"], docRows);

// 4) 勝利の種類の割合（戦力比別）
const vics = ["superiority", "capital", "attrition", "exhaustion", "stalemate"];
const vicRows = [];
for (const target of [1, 1.5, 2, 3]) {
  const rs = []; for (let i = 0; i < TRIALS; i++) rs.push(trial({ ratio: target, defenderStrong: i % 2 === 1 }));
  vicRows.push([`${target}倍`, ...vics.map((v) => pct(rs.filter((r) => r.victory === v).length, rs.length))]);
}
T("4) 決着の種類（superiority=優位 / capital=首都陥落 / attrition=兵力の壊滅 / exhaustion=民意の崩壊 / stalemate=膠着）", ["戦力比", ...vics], vicRows);
const fullRate = (rows) => rows;

// 5) 民意が尽きた側の降伏（互角の戦力。攻撃側の民意だけを下げる）
const supRows = [];
for (const [label, sup] of [["民意 70（通常）", 70], [`民意 ${EXHAUST_SUPPORT + 15}`, EXHAUST_SUPPORT + 15], [`民意 ${EXHAUST_SUPPORT}（尽きる）`, EXHAUST_SUPPORT], ["民意 5", 5]]) {
  const rs = []; for (let i = 0; i < TRIALS; i++) rs.push(trial({ ratio: 1, tweak: (m) => { m.pack.states[1].support = sup; } }));
  const ex = rs.filter((r) => r.victory === "exhaustion"), exLoser = ex.filter((r) => r.winner === "defender");
  supRows.push([label, pct(ex.length, rs.length), pct(exLoser.length, ex.length || 1), pct(rs.filter((r) => r.winner === "defender").length, rs.length)]);
}
T("5) 民意の崩壊による降伏（互角の戦力で、攻撃側の民意だけを下げる）", ["攻撃側の民意", "崩壊で決着", "うち攻撃側が降伏", "防衛側の勝ち"], supRows);

// ---- 判定 ----
const get = (t) => byRatio.find((b) => b.target === t);
const r2 = get(2), r3 = get(3), r5 = get(5), r1 = get(1);
const lo2 = wilson(r2.c.strong, r2.n)[0];
checks.push([`戦力比2倍で、強い側が8割以上勝つ（実測 ${pct(r2.c.strong, r2.n).trim()}、95%下限 ${(100 * lo2).toFixed(1)}%）`, r2.c.strong / r2.n >= 0.8]);
checks.push([`戦力比3倍で、強い側が9割近く以上勝つ（実測 ${pct(r3.c.strong, r3.n).trim()}）`, r3.c.strong / r3.n >= 0.85]);
checks.push([`勝率が戦力比に応じて単調に上がる（1→1.5→2→3倍）`, [1, 1.5, 2, 3].map((t) => get(t).c.strong / get(t).n).every((v, i, a) => i === 0 || v >= a[i - 1] - 0.03)]);
checks.push([`戦力比3倍・5倍で、弱い側が勝つ割合が5%以下（3倍 ${pct(r3.c.weak, r3.n).trim()}、5倍 ${pct(r5.c.weak, r5.n).trim()}）＝弱い側が勝つ判定の不具合は無い`, r3.c.weak / r3.n <= 0.05 && r5.c.weak / r5.n <= 0.05]);
const nodeRow = docRows.find((r) => r[0] === "均衡＋全ての節"), nodeWin = parseFloat(nodeRow[1]);
checks.push([`全ての節を選んでも、同戦力で勝率が75%を超えない（${nodeRow[1].trim()}）＝上限が効いている`, nodeWin <= 75]);
const docMax = Math.max(...docRows.filter((r) => bases.includes(r[0])).map((r) => parseFloat(r[1]))), docMin = Math.min(...docRows.filter((r) => bases.includes(r[0])).map((r) => parseFloat(r[1])));
checks.push([`総合方針どうしの勝率の開きが、25%〜75%に収まる（最小 ${docMin.toFixed(1)}%、最大 ${docMax.toFixed(1)}%）`, docMin >= 25 && docMax <= 75]);
const sup0 = supRows[0], supLow = supRows[2];
checks.push([`民意が尽きた攻撃側は、通常より降伏しやすい（崩壊で決着: ${sup0[1].trim()} → ${supLow[1].trim()}）`, parseFloat(supLow[1]) > parseFloat(sup0[1])]);
P(MD ? "\n#### 判定\n" : "\n== 判定 ==");
let bad = 0; for (const [t, ok] of checks) { P(`${MD ? "- " : ""}${ok ? "合格" : "不合格"}  ${t}`); if (!ok) bad++; }
P(bad ? `\n${bad} 件が基準に届いていません（数字を示して相談する）` : "\n全て基準内");
process.exit(bad ? 1 : 0);
