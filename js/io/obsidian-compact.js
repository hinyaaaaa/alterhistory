// v7.0.0 (担当B): Obsidian 出力の統合レイアウト（lean の既定）。「歴史の流れを理解する」ためのページ構成。
//   以前は 1 実体 1 ノート（人物・文化・言語・宗教・条約・歴史認識・災害…）で、ページが多すぎて使いづらかった。
//   ・国家: 1 国 1 ページ。首都（都市ページへのリンク）・都市の表・宗教/文化・戦争・同盟/条約・人物・歴史（年表）をまとめる。
//   ・都市: 序列が大・中・小（rank 1〜3）と首都だけ。名前の履歴つき。村は国家ページの表に数だけ載せる。
//   ・戦争: 章立て（一 開戦の経緯と同盟の発動／二 主な戦い／三 講和・結末／四 経過）。
//   ・同盟（盟約・同盟条約）: 1 同盟 1 ページ。そのほかの条約は「条約一覧」1 ページ。
//   ・宗教: 同じ系統（祖先が同じ）を 1 ページにまとめ、宗派を比べる表にする。文化・言語は各 1 ページの表。
//   ・戦争・条約・同盟の未知のフィールド（goals・peace.terms など、今後増えるもの）は、「その他の項目」として汎用に出す。落とさない。
//   ・出来事は 10 年ごとの年表（1 行に「なぜ」を添える）。個別ノートにしない。
import { getEvent } from "../core/civ/graph.js";
import { compositionAt } from "../core/civ/history.js";
import { pactsOf } from "../core/wcde/pacts.js";

export const COMPACT_FOLDERS = Object.freeze({ city: "都市", alliance: "同盟", treatyIndex: "条約", religion: "宗教", culture: "文化と言語", people: "人物", disaster: "災害" });
const safeName = (s) => String(s ?? "").replace(/[\\/:*?"<>|#^\[\]\n\r\t]/g, "_").replace(/\.{2,}/g, "_").replace(/^\.+/, "_").replace(/\s+/g, " ").trim().slice(0, 48) || "無題";
const dominant = (g) => (g?.cohorts?.length ? g.cohorts.reduce((b, c) => ((c.share ?? 0) > (b.share ?? 0) ? c : b)) : null);
/** 宗教の系統の根（親をたどる） */
export const religionRoot = (civ, id) => { let x = id, n = 0; while (civ.religions[x]?.parent && civ.religions[civ.religions[x].parent] && n++ < 1000) x = civ.religions[x].parent; return x; };
/** 都市ページを作る集落（大都市・首都・改称された都市）。それ以外の都市・町・村はページにせず、国家ページの表に載せる */
export const hasCityPage = (civ, s) => !!s && ((s.rank ?? 4) <= 1 || !!s.capitalOf || (s.nameHistory ?? []).length > 1);
const isAllianceTreaty = (t) => t.type === "alliance" || t.type === "defense";

/** planPaths の lean・compact 版: ID → ページのパス。複数の ID が同じページを指してよい（リンクは同じページへ張られる） */
export function compactPlan(civ, P, drop, keep) {
  const F = COMPACT_FOLDERS;
  for (const id of [...P.keys()]) { const s = civ.settlements[id]; if (s && !hasCityPage(civ, s)) P.delete(id); } // 念のため
  for (const s of Object.values(civ.settlements)) { if (hasCityPage(civ, s)) { P.set(s.id, `${F.city}/${safeName(s.name ?? `集落${s.id}`)}__${s.id}`); drop.delete(s.id); } else drop.add(s.id); }
  for (const t of Object.values(civ.treaties)) P.set(t.id, isAllianceTreaty(t) ? `${F.alliance}/${safeName(`${civ.states[t.a]?.name ?? "?"}と${civ.states[t.b]?.name ?? "?"}の${t.type === "alliance" ? "同盟" : "防衛協定"}`)}__${t.id}` : `${F.treatyIndex}/条約一覧`);
  for (const p of Object.values(pactsOf(civ).items)) P.set(p.id, `${F.alliance}/${safeName(p.name ?? "盟約")}__${p.id}`);
  const fam = new Map(); for (const r of Object.values(civ.religions)) { if (!keep.religions.has(r.id)) continue; const root = religionRoot(civ, r.id); P.set(r.id, `${F.religion}/${safeName(civ.religions[root]?.name ?? "宗教")}の系統__${root}`); fam.set(root, 1); }
  for (const c of Object.values(civ.cultures)) if (keep.cultures.has(c.id)) P.set(c.id, `${F.culture}/文化`); for (const l of Object.values(civ.languages)) if (keep.languages.has(l.id)) P.set(l.id, `${F.culture}/言語`);
  for (const p of Object.values(civ.persons)) P.set(p.id, `${F.people}/魔法の素質者`);
  for (const f of Object.values(civ.figures ?? {})) { const sp = f.stateId ? P.get(f.stateId) : null; if (sp) P.set(f.id, sp); else drop.add(f.id); }
  for (const x of civ.interpretations) { const sp = P.get(x.ownerId); if (sp) P.set(x.interpId, sp); }
  for (const w of civ.works) { const sp = P.get(w.authorId); if (sp) P.set(w.workId, sp); }
  for (const d of Object.values(civ.disasters)) P.set(d.id, `${F.disaster}/災害一覧`);
}

/** 汎用の出力: 既知のキーを除いた残りを、落とさずに出す（今後増えるフィールド用） */
export function extras(obj, known, nameOf) {
  const rows = []; for (const [k, v] of Object.entries(obj ?? {})) { if (known.has(k) || v === undefined) continue; rows.push(`- ${k}: ${fmtVal(v, nameOf)}`); }
  return rows.length ? rows.join("\n") : "（なし）";
}
const fmtVal = (v, nameOf) => (v == null ? "—" : typeof v === "object" ? "`" + JSON.stringify(v).replace(/`/g, "'") + "`" : typeof v === "string" && nameOf && /^[a-z]+_[0-9a-z]+$/.test(v) && nameOf(v) !== v ? `${nameOf(v)}（${v}）` : String(v));

export function* compactNotes(c) {
  const { civ, world, P, link, out, fm, table, mi2s, d2s, evMonth, recsOf, inRange, MINOR_SET, ix, cellLoc, TREATY_JA, OUTCOME_JA, POLITY_JA, STAGE_JA, keep, byEnt } = c, F = COMPACT_FOLDERS;
  const nameOf = (id) => civ.states[id]?.name ?? civ.settlements[id]?.name ?? civ.figures?.[id]?.name ?? civ.persons[id]?.name ?? civ.cultures[id]?.name ?? civ.languages[id]?.name ?? civ.religions[id]?.name ?? String(id), L = (id) => link(id, nameOf(id));
  const because = (e) => { const parts = []; if (e.why) parts.push(e.why); for (const cz of (e.causes ?? []).slice(0, 2)) { const t = getEvent(civ, cz.targetId); if (t) parts.push(`先行: ${d2s(t.date)} ${t.title}`); } return parts.join("／"); };
  const evTable = (es, cap = 400) => { const rows = es.slice(-cap).map((e) => [d2s(e.date), String(e.title ?? "").replace(/\n/g, " "), because(e)]); return (es.length > cap ? `（古い ${es.length - cap} 件は年表を参照）\n\n` : "") + (table(["年月", "出来事", "なぜ"], rows) || "（なし）\n"); };
  const major = (id) => recsOf(id).filter((e) => inRange(evMonth(e)) && !MINOR_SET.has(e.kind) && e.kind !== "battle_fought" ? true : inRange(evMonth(e)) && !MINOR_SET.has(e.kind));
  const stateCities = new Map(); for (const s of Object.values(civ.settlements)) { const g = civ.groups[s.groupId], sid = g?.stateId; if (!sid) continue; (stateCities.get(sid) ?? stateCities.set(sid, []).get(sid)).push(s); }
  const religionPop = (sid) => { const m = new Map(); for (const g of Object.values(civ.groups)) if (g.stateId === sid) { const r = dominant(g)?.religionId; if (r) m.set(r, (m.get(r) ?? 0) + (g.pop ?? 0)); } return [...m].sort((a, b) => b[1] - a[1]); };
  const wars = Object.values(civ.wars), treaties = Object.values(civ.treaties), pacts = Object.values(pactsOf(civ).items);

  // ---- 国家（1 国 1 ページ）----
  for (const s of Object.values(civ.states)) {
    const cities = (stateCities.get(s.id) ?? []).sort((a, b) => (a.rank ?? 4) - (b.rank ?? 4) || b.pop - a.pop), big = cities.filter((x) => (x.rank ?? 4) <= 3 || hasCityPage(civ, x)), villages = cities.length - big.length;
    const cap = civ.settlements[s.capitalSettlementId], comp = s.alive ? compositionAt(civ, s.id, civ.monthIndex) : null, mw = wars.filter((w) => w.sides.a.includes(s.id) || w.sides.d.includes(s.id)), mt = treaties.filter((t) => t.a === s.id || t.b === s.id), mp = pacts.filter((p) => (p.members ?? p.parties ?? []).includes(s.id));
    const figs = Object.values(civ.figures ?? {}).filter((f) => f.stateId === s.id).sort((a, b) => (a.bornAt ?? 0) - (b.bornAt ?? 0)), rel = religionPop(s.id).slice(0, 5);
    const body = `# ${s.name}\n\n` +
      `- 成立: ${mi2s(s.formedAt)}（${s.via}）${s.predecessor ? `／前身: ${L(s.predecessor)}` : ""}\n- ${s.alive ? "存続中" : `滅亡: ${mi2s(s.dissolvedAt)}`}\n- 政体: ${POLITY_JA[s.polity] ?? s.polity}／指導者: ${s.leader?.name ?? "—"}\n- 首都: ${cap ? `${link(cap.id, cap.name ?? "首都")}（${(c.RANK_JA ?? {})[cap.rank] ?? "集落"}・人口 ${Math.round(cap.pop)}）` : "なし"}\n- 人口 ${Math.round(s.pop)}・財政 ${Math.round((s.treasury ?? 0) * 10) / 10}・安定度 ${Math.round((s.stability ?? 0) * 1000) / 1000}・兵力 ${Math.round(s.army ?? 0)}\n\n` +
      `## 都市（大都市・首都・改称された都市はページあり。ほかは表のみ）\n${table(["都市", "序列", "人口", "名前の変遷"], big.map((x) => [P.has(x.id) ? link(x.id, x.name ?? "集落") : (x.name ?? "名もなき集落"), (c.RANK_JA ?? {})[x.rank] ?? x.rank, Math.round(x.pop), (x.nameHistory ?? []).length > 1 ? x.nameHistory.map((h) => `${h.name}（${mi2s(h.at)}）`).join(" → ") : "—"])) || "（なし）\n"}${villages ? `\n村・小さな集落: ${villages} か所（ページなし）\n` : ""}\n` +
      `## 宗教・文化\n${rel.length ? `宗教: ${rel.map(([id, p]) => `${link(id, nameOf(id))} ${Math.round(p)}`).join("、")}\n\n` : ""}${comp ? `文化: ${Object.entries(comp.culture).map(([k, v]) => `${link(k, nameOf(k))} ${Math.round(v)}`).join("、")}\n` : "（滅亡）\n"}\n` +
      `## 戦争\n${table(["戦争", "開戦", "結果", "立場"], mw.map((w) => [link(w.id, `${nameOf(w.aggressor)}対${nameOf(w.defender)}`), mi2s(w.startedAt), w.endedAt == null ? "継続中" : OUTCOME_JA[w.outcome] ?? w.outcome ?? "終結", w.sides.a.includes(s.id) ? "攻撃側" : "防衛側"])) || "（なし）\n"}\n` +
      `## 同盟・条約\n${table(["種別", "相手", "締結", "状態"], [...mt.map((t) => [link(t.id, TREATY_JA[t.type] ?? t.type), L(t.a === s.id ? t.b : t.a), mi2s(t.signedAt), t.active ? "有効" : "終了"]), ...mp.map((p) => [link(p.id, p.name ?? "盟約"), (p.members ?? p.parties ?? []).filter((x) => x !== s.id).map(L).join("、"), mi2s(p.formedAt ?? p.at ?? 0), p.active === false ? "解消" : "有効"])]) || "（なし）\n"}\n` +
      `## 関係\n${table(["相手", "関係値"], Object.entries(s.relations ?? {}).map(([k, v]) => [L(k), v])) || "（なし）\n"}\n` +
      `## 人物\n${table(["名前", "役割", "生", "没"], figs.map((f) => [f.name, f.role ?? "—", mi2s(f.bornAt), f.diedAt == null ? "存命" : mi2s(f.diedAt)])) || "（なし）\n"}\n` +
      `## 採用した技術\n${Object.entries(s.techAdopted ?? {}).map(([k, mi]) => `${k}（${mi2s(mi)}）`).join("、") || "（なし）"}\n\n` +
      `## 歴史（年表）\n${evTable(major(s.id))}\n`;
    yield out("state", P.get(s.id), fm({ id: s.id, type: "国家", name: s.name, 成立: mi2s(s.formedAt), 滅亡: s.alive ? null : mi2s(s.dissolvedAt), 存続中: s.alive, 成立経路: s.via, 政体: POLITY_JA[s.polity] ?? s.polity, プレイヤー国家: !!s.player, 前身: s.predecessor ?? null, 首都: cap?.name ?? null, tags: ["国家"] }) + body);
  }

  // ---- 都市（大・中・小と首都）----
  for (const s of Object.values(civ.settlements)) {
    if (!hasCityPage(civ, s) || !P.has(s.id)) continue;
    const g = civ.groups[s.groupId], st = g?.stateId ? civ.states[g.stateId] : null, evs = (byEnt.get(s.id) ?? []).filter((e) => !MINOR_SET.has(e.kind) || e.kind === "settlement_renamed" || e.kind === "settlement_stage").sort((a, b) => evMonth(a) - evMonth(b));
    const roads = (civ.roads ?? []).filter((r) => r.a === s.id || r.b === s.id).map((r) => { const o = r.a === s.id ? r.b : r.a; return [r.kind === "sea" ? "航路" : "街道", civ.settlements[o] ? link(o, civ.settlements[o].name ?? "集落") : o, Math.round(r.cost)]; });
    yield out("city", P.get(s.id), fm({ id: s.id, type: "都市", name: s.name ?? null, 序列: (c.RANK_JA ?? {})[s.rank] ?? s.rank, 人口: Math.round(s.pop), 国家: st?.name ?? null, 首都: st?.capitalSettlementId === s.id, 創設: mi2s(s.foundedAt), tags: ["都市"] }) +
      `# ${s.name ?? "名もなき集落"}\n\n- 序列: ${(c.RANK_JA ?? {})[s.rank] ?? s.rank}（${STAGE_JA[s.stage] ?? s.stage}）／人口 ${Math.round(s.pop)}\n- 国家: ${st ? L(st.id) : "なし"}${st?.capitalSettlementId === s.id ? "（首都）" : ""}\n- 場所: ${cellLoc(s.cell)}\n- 創設: ${mi2s(s.foundedAt)}\n\n## 名前の履歴\n${table(["年月", "名前", "きっかけ"], (s.nameHistory ?? []).map((h) => [mi2s(h.at), h.name, h.cause])) || "（記録なし）\n"}\n## 街道・航路\n${table(["種類", "つながる先", "費用"], roads) || "（なし）\n"}\n## 出来事\n${evTable(evs, 200)}\n`);
  }

  // ---- 戦争（章立て）----
  const WAR_KNOWN = new Set(["id", "aggressor", "defender", "sides", "reason", "startedAt", "endedAt", "outcome", "score", "casualties", "declaredEvent", "occupied"]);
  for (const w of wars) {
    const es = (ix.byEntity.get(w.id) ?? []).map((i) => civ.events[i]).filter(Boolean).sort((a, b) => evMonth(a) - evMonth(b)), battles = es.filter((e) => e.kind === "battle_fought"), decl = w.declaredEvent ? getEvent(civ, w.declaredEvent) : null;
    const opsB = Array.isArray(w.ops?.battles) ? w.ops.battles : [], rest = w.ops && opsB.length ? { ...w, ops: { ...w.ops, battles: `（${opsB.length} 件。「二 主な戦い」の表に載せた）` } } : w; // 戦いの表は ops から。ops のそれ以外の項目は、その他の項目に残す
    const joined = [...w.sides.a, ...w.sides.d].filter((x) => x !== w.aggressor && x !== w.defender), peaceEv = es.filter((e) => /peace|armistice|surrender|war_ended|treaty/.test(e.kind));
    yield out("war", P.get(w.id), fm({ id: w.id, type: "戦争", 開戦: mi2s(w.startedAt), 終結: w.endedAt == null ? null : mi2s(w.endedAt), 結果: OUTCOME_JA[w.outcome] ?? w.outcome ?? null, tags: ["戦争"] }) +
      `# ${nameOf(w.aggressor)}対${nameOf(w.defender)}の戦争\n\n- 攻撃側: ${w.sides.a.map(L).join("、")}\n- 防衛側: ${w.sides.d.map(L).join("、")}\n- ${w.endedAt == null ? "継続中" : `終結: ${mi2s(w.endedAt)}（${OUTCOME_JA[w.outcome] ?? w.outcome}）`}\n\n` +
      `## 一 開戦の経緯と同盟の発動\n- 開戦: ${mi2s(w.startedAt)}／理由: ${w.reason ?? "—"}\n${decl ? `- 宣戦: ${decl.title}${because(decl) ? `（${because(decl)}）` : ""}\n` : ""}- 途中から加わった国: ${joined.map(L).join("、") || "なし"}\n${es.filter((e) => /join|alliance|call|pact/.test(e.kind)).map((e) => `- ${d2s(e.date)} ${e.title}${because(e) ? `（${because(e)}）` : ""}`).join("\n")}\n\n` +
      `## 二 主な戦い\n${table(["年月", "戦い", "種類", "場所", "勝者", "死者（攻/防）"], [...opsB.map((b) => [mi2s(b.at), b.name ?? b.id, b.kind ?? "—", b.cell != null ? cellLoc(b.cell).replace(/（.*$/, "") : "—", b.winner ? nameOf(b.winner) : "—", `${Math.round(b.deadA ?? 0)} / ${Math.round(b.deadD ?? 0)}`]), ...(opsB.length ? [] : battles.map((e) => [d2s(e.date), e.title, "—", e.location?.cell != null ? cellLoc(e.location.cell).replace(/（.*$/, "") : "—", because(e) || "—", "—"]))]) || "（記録された戦闘なし）\n"}\n` +
      `## 三 講和・結末\n- 結果: ${w.endedAt == null ? "継続中" : OUTCOME_JA[w.outcome] ?? w.outcome ?? "—"}／戦況点 ${Math.round((w.score ?? 0) * 10) / 10}・損耗 ${Math.round(w.casualties ?? 0)}\n- 占領された集団: ${(w.occupied ?? []).length} か所\n${peaceEv.map((e) => `- ${d2s(e.date)} ${e.title}${because(e) ? `（${because(e)}）` : ""}`).join("\n")}\n\n` +
      `## 四 経過\n${evTable(es.filter((e) => e.kind !== "battle_fought"), 300)}\n## その他の項目\n${extras(rest, WAR_KNOWN, nameOf)}\n`);
  }

  // ---- 同盟（二国間の同盟条約・盟約）と条約一覧 ----
  const T_KNOWN = new Set(["id", "type", "a", "b", "signedAt", "expiresAt", "endedAt", "active"]);
  for (const t of treaties.filter(isAllianceTreaty)) yield out("alliance", P.get(t.id), fm({ id: t.id, type: "同盟", 種別: TREATY_JA[t.type] ?? t.type, 締結: mi2s(t.signedAt), 終了: t.endedAt == null ? null : mi2s(t.endedAt), tags: ["同盟"] }) + `# ${nameOf(t.a)}と${nameOf(t.b)}の${TREATY_JA[t.type] ?? t.type}\n\n- 当事国: ${L(t.a)}、${L(t.b)}\n- 締結: ${mi2s(t.signedAt)}／${t.active ? `期限: ${t.expiresAt != null ? mi2s(t.expiresAt) : "—"}` : `終了: ${t.endedAt != null ? mi2s(t.endedAt) : "—"}`}\n\n## 結ばれた戦争\n${table(["戦争", "開戦", "結果"], wars.filter((w) => [...w.sides.a, ...w.sides.d].includes(t.a) && [...w.sides.a, ...w.sides.d].includes(t.b) && (w.sides.a.includes(t.a) === w.sides.a.includes(t.b))).map((w) => [link(w.id, `${nameOf(w.aggressor)}対${nameOf(w.defender)}`), mi2s(w.startedAt), w.endedAt == null ? "継続中" : OUTCOME_JA[w.outcome] ?? "終結"])) || "（共に戦った戦争なし）\n"}\n## その他の項目\n${extras(t, T_KNOWN, nameOf)}\n`);
  const P_KNOWN = new Set(["id", "name", "members", "parties", "formedAt", "at", "active"]);
  for (const p of pacts) yield out("alliance", P.get(p.id), fm({ id: p.id, type: "盟約", name: p.name ?? null, tags: ["同盟"] }) + `# ${p.name ?? "盟約"}\n\n- 加盟国: ${(p.members ?? p.parties ?? []).map(L).join("、") || "—"}\n- 成立: ${mi2s(p.formedAt ?? p.at ?? 0)}／${p.active === false ? "解消" : "有効"}\n\n## その他の項目\n${extras(p, P_KNOWN, nameOf)}\n`);
  const others = treaties.filter((t) => !isAllianceTreaty(t)); if (others.length) yield out("treaty", `${F.treatyIndex}/条約一覧`, fm({ type: "条約一覧", 件数: others.length, tags: ["条約"] }) + `# 条約一覧（同盟・防衛協定を除く）\n\n${table(["種別", "当事国", "締結", "状態", "その他の項目"], others.map((t) => [TREATY_JA[t.type] ?? t.type, `${L(t.a)}・${L(t.b)}`, mi2s(t.signedAt), t.active ? "有効" : "終了", extras(t, T_KNOWN, nameOf).replace(/\n/g, "；")]))}\n`);

  // ---- 宗教（系統ごとに 1 ページ。宗派を比べる）----
  const fam = new Map(); for (const r of Object.values(civ.religions)) { if (!keep.religions.has(r.id)) continue; const root = religionRoot(civ, r.id); (fam.get(root) ?? fam.set(root, []).get(root)).push(r); }
  const R_KNOWN = new Set(["id", "name", "kind", "parent", "bornAt", "deity", "holyCell", "founderId"]);
  for (const [root, members] of fam) {
    const pop = new Map(), topState = new Map(); for (const g of Object.values(civ.groups)) { const r = dominant(g)?.religionId; if (r && g.stateId) { pop.set(r, (pop.get(r) ?? 0) + (g.pop ?? 0)); const m = topState.get(r) ?? topState.set(r, new Map()).get(r); m.set(g.stateId, (m.get(g.stateId) ?? 0) + (g.pop ?? 0)); } }
    members.sort((a, b) => (a.bornAt ?? 0) - (b.bornAt ?? 0) || (a.id < b.id ? -1 : 1)); const xkeys = [...new Set(members.flatMap((r) => Object.keys(r).filter((k) => !R_KNOWN.has(k))))];
    const tree = (id, d) => `${"  ".repeat(d)}- ${civ.religions[id].name}（${mi2s(civ.religions[id].bornAt)}）\n${members.filter((x) => x.parent === id).map((x) => tree(x.id, d + 1)).join("")}`;
    yield out("religion", P.get(members[0].id), fm({ id: root, type: "宗教の系統", name: civ.religions[root]?.name ?? null, 宗派数: members.length, tags: ["宗教"] }) +
      `# ${civ.religions[root]?.name ?? "宗教"}の系統\n\n同じ系統の宗派を並べて比べる。信者数は、いま各集団の主な信仰である人口の合計。\n\n## 系統の木\n${tree(root, 0)}\n## 宗派の比較\n${table(["宗派", "種類", "起源", "親", "神格", "聖地", "創始者", "信者", "主な国", ...xkeys], members.map((r) => [r.name, r.kind ?? "—", mi2s(r.bornAt), r.parent ? nameOf(r.parent) : "（始祖）", r.deity ?? "—", r.holyCell != null ? cellLoc(r.holyCell).replace(/（.*$/, "") : "—", r.founderId ? nameOf(r.founderId) : "—", Math.round(pop.get(r.id) ?? 0), [...(topState.get(r.id) ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sid]) => L(sid)).join("、") || "—", ...xkeys.map((k) => fmtVal(r[k], nameOf))]))}\n`);
  }

  // ---- 文化・言語（各 1 ページの表）----
  const cp = new Map(), lp = new Map(); for (const g of Object.values(civ.groups)) for (const co of g.cohorts ?? []) { const v = (g.pop ?? 0) * (co.share ?? 0); if (co.cultureId) cp.set(co.cultureId, (cp.get(co.cultureId) ?? 0) + v); if (co.languageId) lp.set(co.languageId, (lp.get(co.languageId) ?? 0) + v); }
  const cu = Object.values(civ.cultures).filter((x) => keep.cultures.has(x.id)).sort((a, b) => (cp.get(b.id) ?? 0) - (cp.get(a.id) ?? 0)); if (cu.length) yield out("culture", `${F.culture}/文化`, fm({ type: "文化の一覧", 件数: cu.length, tags: ["文化"] }) + `# 文化\n\n${table(["文化", "起源", "親", "人口", "言語"], cu.map((x) => [x.name, mi2s(x.bornAt), x.parent ? nameOf(x.parent) : "（始祖）", Math.round(cp.get(x.id) ?? 0), x.languageId ? nameOf(x.languageId) : "—"]))}\n`);
  const lg = Object.values(civ.languages).filter((x) => keep.languages.has(x.id)).sort((a, b) => (lp.get(b.id) ?? 0) - (lp.get(a.id) ?? 0)); if (lg.length) yield out("language", `${F.culture}/言語`, fm({ type: "言語の一覧", 件数: lg.length, tags: ["言語"] }) + `# 言語\n\n${table(["言語", "起源", "親", "話者"], lg.map((x) => [x.name ?? x.id, mi2s(x.bornAt), x.parent ? nameOf(x.parent) : "（始祖）", Math.round(lp.get(x.id) ?? 0)]))}\n`);

  // ---- 魔法の素質者・災害（それぞれ 1 ページの表）----
  const pe = Object.values(civ.persons); if (pe.length) yield out("person", `${F.people}/魔法の素質者`, fm({ type: "人物の一覧", 件数: pe.length, tags: ["人物"] }) + `# 魔法の素質者\n\n${table(["名前", "種族", "能力", "強度", "出現"], pe.map((p) => [p.name, p.speciesId, p.ability, p.power, mi2s(p.bornAt ?? p.appearedAt ?? 0)]))}\n`);
  const ds = Object.values(civ.disasters); if (ds.length) yield out("disaster", `${F.disaster}/災害一覧`, fm({ type: "災害の一覧", 件数: ds.length, tags: ["災害"] }) + `# 災害\n\n${table(["種類", "規模", "開始", "場所"], ds.map((d) => [d.kind, d.severity, mi2s(d.startedAt), d.cell != null ? cellLoc(d.cell).replace(/（.*$/, "") : "—"]))}\n`);
}
