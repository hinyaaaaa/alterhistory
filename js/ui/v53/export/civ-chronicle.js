// v5.3 出力: Chronicle の「文明史」部分（国家・戦争・出来事・AI判断）。
//   既存の io/chronicle.js は旧エディタ側の年表だけで、文明史（map.civ）を含まない。指示書 5.5 に合わせ、ここで文明史の章を作る。
//   ・保存された名称・日付・参加者・原因をそのまま書く。現在の状態から過去を推定し直さない
//   ・巨大な歴史でも一度に文字列を作らない（チャンクの配列を返す。Blob はそのまま受け取れる）
//   ・出来事・AI判断は間引かない（期間指定のときだけ範囲で絞る）
const mi = (d) => d.year * 12 + (d.month - 1);
const ymd = (m) => `${Math.floor(m / 12)}年${((m % 12) + 12) % 12 + 1}月`;
const esc = (s) => String(s ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "／");
const VIA = { city_state: "都市国家", agri_union: "農耕集落の統合", nomad_confederation: "遊牧連合", religious_polity: "宗教共同体", defense_league: "防衛同盟" };

/** @returns {string[]} Markdown のチャンク */
export function civChronicleChunks(civ, { fromMonth = -Infinity, toMonth = Infinity, worldName = "" } = {}) {
  const out = [], inRange = (m) => m >= fromMonth && m <= toMonth;
  const nameOf = (id) => civ.states?.[id]?.name ?? civ.cultures?.[id]?.name ?? civ.religions?.[id]?.name ?? civ.languages?.[id]?.name ?? String(id);
  const events = civ.events ?? [], decisions = civ.decisions ?? [];
  out.push(`\n# 文明史${worldName ? `（${esc(worldName)}）` : ""}\n\n`);
  out.push(`- 範囲: ${Number.isFinite(fromMonth) ? ymd(fromMonth) : "最初"}〜${Number.isFinite(toMonth) ? ymd(toMonth) : "現在"}\n`);
  out.push(`- 国家 ${Object.keys(civ.states ?? {}).length} 件・戦争 ${Object.keys(civ.wars ?? {}).length} 件・出来事 ${events.length} 件・AI判断 ${decisions.length} 件（範囲外を含む総数）\n\n`);

  out.push("## 国家\n\n| 国家 | ID | 成立 | 経路 | 消滅 | プレイヤー |\n|---|---|---|---|---|---|\n");
  for (const s of Object.values(civ.states ?? {})) {
    if (!inRange(s.formedAt) && !(s.dissolvedAt != null && inRange(s.dissolvedAt)) && (Number.isFinite(fromMonth) || Number.isFinite(toMonth)) && !(s.formedAt <= fromMonth && (s.dissolvedAt == null || s.dissolvedAt >= fromMonth))) continue;
    out.push(`| ${esc(s.name)} | ${s.id} | ${ymd(s.formedAt)} | ${VIA[s.via] ?? esc(s.via)} | ${s.alive ? "存続" : ymd(s.dissolvedAt)} | ${s.player ? "はい" : ""} |\n`);
  }

  out.push("\n## 戦争\n\n");
  for (const w of Object.values(civ.wars ?? {})) {
    if (!inRange(w.startedAt) && !(w.endedAt != null && inRange(w.endedAt))) continue;
    const a = (w.sides?.a ?? []).map(nameOf).join("・"), d = (w.sides?.d ?? []).map(nameOf).join("・");
    out.push(`- **${esc(nameOf(w.aggressor))}対${esc(nameOf(w.defender))}**（${w.id}）: ${ymd(w.startedAt)}〜${w.endedAt != null ? ymd(w.endedAt) : "継続中"}　攻撃側: ${esc(a)}　防衛側: ${esc(d)}${w.outcome ? `　結果: ${esc(w.outcome)}` : ""}\n`);
  }

  out.push("\n## 出来事（古い順）\n\n");
  let n = 0;
  for (const e of events) {
    const m = mi(e.date); if (!inRange(m)) continue; n++;
    const who = (e.participants ?? []).map((p) => `${esc(nameOf(p.entityId))}（${esc(p.role)}）`).join("、");
    const causes = (e.causes ?? []).map((c) => `${c.relation}: ${c.targetId}（${c.basis}）`).join("；");
    out.push(`- ${ymd(m)} **${esc(e.title)}** \`${e.eventId}\` [${esc(e.kind)}]${who ? `　関与: ${who}` : ""}${causes ? `　原因: ${causes}` : "　原因: 記録された先行事象なし（環境・状態・確率的条件）"}\n`);
  }
  if (!n) out.push("（この範囲に出来事はありません）\n");

  out.push("\n## AI判断（古い順）\n\n");
  let k = 0;
  for (const d of decisions) {
    const m = mi(d.date); if (!inRange(m)) continue; k++;
    const ch = d.chosen ?? {};
    out.push(`- ${ymd(m)} ${esc(nameOf(d.actorId))}: ${esc(d.type)} → ${esc(ch.key ?? "")}${ch.target ? `（対象 ${esc(nameOf(ch.target))}）` : ""} \`${d.decisionId}\`${d.reason ? `　理由: ${esc(d.reason)}` : ""}\n`);
  }
  if (!k) out.push("（この範囲にAI判断はありません）\n");
  return out;
}

/** 件数だけ数える（書き出し前の説明用） */
export function civChronicleCounts(civ, { fromMonth = -Infinity, toMonth = Infinity } = {}) {
  let ev = 0, de = 0;
  for (const e of civ.events ?? []) { const m = mi(e.date); if (m >= fromMonth && m <= toMonth) ev++; }
  for (const d of civ.decisions ?? []) { const m = mi(d.date); if (m >= fromMonth && m <= toMonth) de++; }
  return { states: Object.keys(civ.states ?? {}).length, wars: Object.keys(civ.wars ?? {}).length, events: ev, decisions: de };
}
