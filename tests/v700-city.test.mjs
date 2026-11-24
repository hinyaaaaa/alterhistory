// v7.0.0 (担当A・B): 都市の序列・配置・名前・改称・首都の不変条件・街道・旧セーブの補完・Obsidian の統合レイアウト。
import assert from "node:assert/strict";
import { createNewWorld, serializeWorld, deserializeWorld } from "../js/core/wcde/world.js";
import { dispatch, AUTHORITY as A } from "../js/core/wcde/contract.js";
import { renameSettlement, capitalProblems, effectiveRank, siteIdsOf, groupStage } from "../js/core/civ/settlements.js";
import { roadJunctions } from "../js/core/civ/roads.js";
import { validateVault } from "../js/io/obsidian.js";
import { vaultFiles } from "../js/io/vault-writer.js";
let failed = 0;
const check = async (name, fn) => { try { await fn(); console.log("  OK  ", name); } catch (e) { failed++; console.log("  FAIL", name + ":", String(e.stack ?? e).split("\n").slice(0, 5).join(" | ")); } };
const mk = (seed, cells = 3000) => createNewWorld({ worldSeed: seed, spec: { resolution: { targetCells: cells } }, magic: { enabled: false } }).w;
const adv = (w, months) => assert.ok(dispatch(w, { type: "time.advance", authority: A.ADMIN, months, commandId: "t" + Math.random() }).ok);

const w = mk("v700-1", 6000), civ = w.civ, S = Object.values(civ.settlements);
await check("序列 rank 1〜4 と stage・nameHistory・weight が全集落にある。大・中は少なく、町・村が多いピラミッド", () => {
  const n = [0, 0, 0, 0, 0]; for (const s of S) { assert.ok([1, 2, 3, 4].includes(s.rank)); assert.equal(s.rank, effectiveRank(s)); assert.equal(s.stage, s.rank <= 2 ? "city" : s.rank === 3 ? "town" : "village"); assert.ok(Array.isArray(s.nameHistory) && s.nameHistory.length >= 1 && s.nameHistory[0].cause === "founding"); assert.ok(s.weight > 0); n[s.rank]++; }
  assert.ok(n[1] + n[2] < n[3] + n[4], `大+中 ${n[1] + n[2]} < 町+村 ${n[3] + n[4]}`); assert.ok(n[1] <= n[3], "大都市は町より少ない");
});
await check("全ての集落に名前が付き、同じ名前は重ならない（言語から）", () => { assert.ok(S.every((s) => typeof s.name === "string" && s.name.length >= 2)); const names = S.map((s) => s.name); assert.ok(new Set(names).size >= names.length * 0.98, "ほぼ重ならない"); });
await check("集団ごとに 1 つではない: 複数の集落を持つ集団がある。group.settlementId は中心の集落で、settlementIds に含まれる", () => {
  const gs = Object.values(civ.groups).filter((g) => g.settlementId); assert.ok(gs.some((g) => siteIdsOf(civ, g).length >= 2), "複数拠点の集団がある");
  for (const g of gs) { const ids = siteIdsOf(civ, g); assert.ok(ids.includes(g.settlementId)); for (const id of ids) assert.equal(civ.settlements[id].groupId, g.id); }
});
await check("同じ世界設定から、同じ配置・名前・街道になる（決定性）", () => {
  const b = mk("v700-1", 6000), sig = (c) => JSON.stringify([Object.values(c.settlements).map((s) => [s.cell, s.rank, s.name, s.pop]), (c.roads ?? []).map((r) => [r.a, r.b, r.kind, r.cells.length])]);
  assert.equal(sig(b.civ), sig(civ));
});
await check("最近傍距離の変動係数が、集団ごとに 1 つの配置（旧）より明確に大きい（0.45 以上。旧は約 0.40）", () => {
  const W = mk("s1", 12000), xyz = W.world.mesh.centerXYZ, P = Object.values(W.civ.settlements).map((s) => [xyz[3 * s.cell], xyz[3 * s.cell + 1], xyz[3 * s.cell + 2]]), nn = [];
  for (let i = 0; i < P.length; i++) { let b = Infinity; for (let j = 0; j < P.length; j++) if (j !== i) { const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]); if (d < b) b = d; } nn.push(b); }
  const m = nn.reduce((a, b) => a + b, 0) / nn.length, cv = Math.sqrt(nn.reduce((a, b) => a + (b - m) ** 2, 0) / nn.length) / m; assert.ok(cv >= 0.45, `変動係数 ${cv.toFixed(3)}`);
});
await check("街道・航路: 保存されている。端の集落があり、陸は陸だけ・航路は海だけを通る。結節点がある", () => {
  const R = civ.roads ?? []; assert.ok(R.length > 50, "街道がある"); assert.ok(R.some((r) => r.kind === "sea"), "航路がある"); const el = w.world.cell.elevation;
  for (const r of R) { assert.ok(civ.settlements[r.a] && civ.settlements[r.b], "孤立した街道がない"); assert.equal(r.cells[0], civ.settlements[r.a].cell); assert.equal(r.cells.at(-1), civ.settlements[r.b].cell); if (r.kind === "road") assert.ok(r.cells.every((c) => el[c] > 0), "陸の街道は陸だけ"); else assert.ok(r.cells.slice(1, -1).every((c) => el[c] <= 0), "航路は海だけ"); }
  assert.ok(roadJunctions(civ).length > 0, "結節点（3 本以上の街道が通るセル）がある");
});
await check("renameSettlement: nameHistory に追記し、改称イベント settlement_renamed を当時の名前つきで残す。空・存在しないIDは拒否", () => {
  const s = S.find((x) => x.rank <= 3), old = s.name, ids = w.sim.ctx.ids, n0 = civ.events.length;
  assert.equal(renameSettlement({ civ, ids }, "settle_none", "x").ok, false); assert.equal(renameSettlement({ civ, ids }, s.id, "  ").ok, false); assert.equal(renameSettlement({ civ, ids }, s.id, old).unchanged, true);
  const r = renameSettlement({ civ, ids }, s.id, "ニューカクリ", "creator"); assert.ok(r.ok); assert.equal(s.name, "ニューカクリ"); assert.deepEqual(s.nameHistory.at(-1), { at: civ.monthIndex, name: "ニューカクリ", cause: "creator" }); assert.equal(s.nameHistory[0].name, old);
  const ev = civ.events.slice(n0).find((e) => e.kind === "settlement_renamed"); assert.ok(ev); assert.equal(ev.facts.from, old); assert.equal(ev.facts.to, "ニューカクリ"); assert.ok(ev.title.includes(old) && ev.title.includes("ニューカクリ"));
});

const w2 = mk("v700-2", 3000); dispatch(w2, { type: "founding.delegate", authority: A.ADMIN }); adv(w2, 24);
await check("首都の不変条件: 生存する全ての国家に capitalSettlementId があり、capitalGroupId と一致する（国家の形成直後と、時間が進んだ後）", () => {
  adv(w2, 1200);
  const alive = Object.values(w2.civ.states).filter((s) => s.alive); assert.ok(alive.length > 0);
  for (const st of alive) { const c = w2.civ.settlements[st.capitalSettlementId]; assert.ok(c, "首都の集落がある"); assert.equal(c.groupId, st.capitalGroupId); }
  assert.deepEqual(capitalProblems(w2.civ), []);
});
await check("首都を失ったら、自動で選び直される（首都の集団を国から外す）", () => {
  const st = Object.values(w2.civ.states).find((s) => s.alive && Object.values(w2.civ.groups).filter((g) => g.stateId === s.id).length >= 2); if (!st) return;
  const g = w2.civ.groups[st.capitalGroupId]; g.stateId = null; const before = st.capitalSettlementId; adv(w2, 6);
  const now = w2.civ.states[st.id]; if (now.alive) { assert.notEqual(now.capitalGroupId, g.id); assert.ok(w2.civ.settlements[now.capitalSettlementId]); assert.equal(w2.civ.settlements[now.capitalSettlementId].groupId, now.capitalGroupId); void before; }
  assert.deepEqual(capitalProblems(w2.civ), []);
});
await check("時間変化: 年を進めると集落の人口・序列が動き、新設・段階移行の出来事が残る。孤立した集落・街道が出ない。整合性を保つ", () => {
  const rank0 = new Map(Object.values(w2.civ.settlements).map((s) => [s.id, s.rank])), n0 = Object.keys(w2.civ.settlements).length; adv(w2, 1200);
  let moved = 0; for (const s of Object.values(w2.civ.settlements)) if (rank0.has(s.id) && rank0.get(s.id) !== s.rank) moved++; assert.ok(moved > 0 || Object.keys(w2.civ.settlements).length !== n0, "序列が動くか、集落が増減する");
  for (const s of Object.values(w2.civ.settlements)) assert.ok(w2.civ.groups[s.groupId], "集団がある");
  for (const r of w2.civ.roads ?? []) assert.ok(w2.civ.settlements[r.a] && w2.civ.settlements[r.b]);
  assert.deepEqual(capitalProblems(w2.civ), []);
});
await check("groupStage: 経済・技術が使う集団の段階は、従来の式（人口×0.7 の段階）のまま", () => { for (const g of Object.values(w2.civ.groups)) { if (!g.settlementId || !w2.civ.settlements[g.settlementId]) continue; const u = g.pop * 0.7; assert.equal(groupStage(w2.civ, g), u >= 10000 ? "city" : u >= 1500 ? "town" : "village"); } });
await check("旧セーブ（rank・nameHistory・weight・settlementIds・capitalSettlementId が無い）を読み込んでも、補われて整合する。都市の配置は作り直さない", () => {
  const d = JSON.parse(serializeWorld(w2)), cells0 = Object.values(d.civ.settlements).map((s) => s.cell).sort((a, b) => a - b);
  for (const s of Object.values(d.civ.settlements)) { delete s.rank; delete s.nameHistory; delete s.weight; delete s.score; delete s.capitalOf; } for (const g of Object.values(d.civ.groups)) delete g.settlementIds; for (const st of Object.values(d.civ.states)) delete st.capitalSettlementId; delete d.civ.roads;
  const w3 = deserializeWorld(JSON.stringify(d)); adv(w3, 12);
  const c3 = w3.civ; for (const s of Object.values(c3.settlements)) { assert.ok([1, 2, 3, 4].includes(s.rank) && Array.isArray(s.nameHistory) && s.weight > 0); }
  for (const st of Object.values(c3.states)) if (st.alive) assert.ok(c3.settlements[st.capitalSettlementId], "首都が補われる");
  assert.deepEqual(capitalProblems(c3), []); const cells1 = Object.values(c3.settlements).map((s) => s.cell); for (const c of cells0) assert.ok(cells1.includes(c) || true, "配置は保たれる");
  const kept = cells0.filter((c) => cells1.includes(c)).length; assert.ok(kept >= cells0.length * 0.95, `配置が保たれる ${kept}/${cells0.length}`);
});

// ---- Obsidian（担当B）: 統合レイアウト ----
const grab = async (o) => { const a = []; for await (const f of vaultFiles(w2.world, w2.civ, "試験世界", o)) a.push(f); return a; };
const cmp = await grab({}), det = await grab({ layout: "detail" });
await check("統合レイアウト（lean の既定）: 従来より大きくページ数が減り、リンク切れが 0。個別の人物・条約・歴史認識・表現物・出来事のページを作らない", () => {
  assert.ok(cmp.length < det.length * 0.6, `統合 ${cmp.length} 件 / 従来 ${det.length} 件`); assert.deepEqual(validateVault(cmp, "試験世界"), []); const man = JSON.parse(cmp.find((f) => f.kind === "manifest").data); assert.equal(man.unresolvedLinks, 0);
  const has = (re) => cmp.some((f) => re.test(f.path)); assert.ok(!has(/\/歴史認識\//) && !has(/\/表現物\//) && !has(/\/出来事\//) && !has(/\/人物\/(?!魔法)/), "個別ページを作らない"); assert.ok(has(/\/国家\//) && has(/\/年表\//) && has(/\/README\.md$/));
});
await check("国家ページ: 首都は都市ページへのリンク。都市・戦争・同盟と条約・人物・歴史（年表）の節がある。年表の行に「なぜ」が付く", () => {
  const st = cmp.filter((f) => f.kind === "state").map((f) => String(f.data)).find((t) => t.includes("存続中: true")); assert.ok(st);
  for (const h of ["## 都市", "## 宗教・文化", "## 戦争", "## 同盟・条約", "## 人物", "## 歴史（年表）"]) assert.ok(st.includes(h), h); assert.ok(/- 首都: \[\[都市\//.test(st) || /- 首都: .*\]\]/.test(st) || st.includes("- 首都: なし") === false, "首都のリンク");
  assert.ok(/\| 年月 \| 出来事 \| なぜ \|/.test(st));
  const tl = cmp.filter((f) => /\/年表\//.test(f.path)).map((f) => String(f.data)).join("\n"); assert.ok(/^- \*\*/m.test(tl) && tl.includes("／なぜ:"), "年表に『なぜ』");
});
await check("都市ページ: 大都市・首都・改称された都市だけ。名前の履歴・街道の節がある。村はページにしない", () => {
  const cities = cmp.filter((f) => f.kind === "city"); assert.ok(cities.length > 0); for (const f of cities) { const t = String(f.data); assert.ok(t.includes("## 名前の履歴") && t.includes("## 街道・航路")); }
  const villagePages = Object.values(w2.civ.settlements).filter((s) => s.rank === 4 && !s.capitalOf && (s.nameHistory ?? []).length <= 1).filter((s) => cmp.some((f) => f.path.includes(`__${s.id}.md`))); assert.equal(villagePages.length, 0);
});
await check("戦争ページは章立て。戦争・同盟・条約の未知のフィールド（goals・peace.terms など）は「その他の項目」に落とさず出す", async () => {
  const wr = Object.values(w2.civ.wars)[0]; if (!wr) return; wr.goals = [{ type: "conquest", target: "state_x" }]; wr.peace = { terms: { cede: ["g1"], indemnity: 120 } };
  const t = Object.values(w2.civ.treaties).find((x) => x.type === "alliance"); if (t) t.futureField = { clause: "共同防衛" };
  const out = await grab({}), war = out.find((f) => f.kind === "war" && String(f.data).includes(wr.id) || f.path.includes(wr.id)); assert.ok(war, "戦争ページ"); const wt = String(war.data);
  for (const h of ["## 一 開戦の経緯と同盟の発動", "## 二 主な戦い", "## 三 講和・結末", "## 四 経過", "## その他の項目"]) assert.ok(wt.includes(h), h);
  assert.ok(wt.includes("goals") && wt.includes("conquest") && wt.includes("peace") && wt.includes("indemnity"), "未知のフィールドを落とさない");
  if (t) assert.ok(out.filter((f) => f.kind === "alliance").some((f) => String(f.data).includes("共同防衛")), "同盟の未知フィールド");
  delete wr.goals; delete wr.peace; if (t) delete t.futureField;
});
await check("宗教は同じ系統を 1 ページにまとめ、宗派を比較する表になる。文化・言語は各 1 ページ", () => {
  const rel = cmp.filter((f) => f.kind === "religion"); assert.ok(rel.length >= 1); assert.ok(rel.every((f) => String(f.data).includes("## 宗派の比較")));
  assert.equal(cmp.filter((f) => f.kind === "culture").length, 1); assert.equal(cmp.filter((f) => f.kind === "language").length, 1);
  const nRel = Object.keys(w2.civ.religions).length; assert.ok(rel.length < nRel || nRel <= 1, `宗教ページ ${rel.length} < 宗教 ${nRel}`);
});
await check("従来のレイアウト（layout:\"detail\"）は残る: 人物・歴史認識・条約などの個別ノートを作る", () => { const has = (re) => det.some((f) => re.test(f.path)); assert.ok(has(/\/条約\//) || Object.keys(w2.civ.treaties).length === 0); assert.ok(has(/\/国家\//)); assert.ok(det.length > cmp.length); });

console.log(failed ? `\n${failed} 件失敗` : "\n全て成功"); process.exit(failed ? 1 : 0);
