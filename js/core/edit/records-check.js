// v2.3.0 整合性検査の拡張（機能I）: 君主・参照・原因リンク・系譜・条約の矛盾を検出する。DOM に依存しない。
const key = (y, m) => y * 12 + (m - 1);
const stateName = (map, id) => map.pack.states[id]?.name ?? `国家#${id}`;
const exists = (map, id) => Number.isInteger(id) && id > 0 && !!map.pack.states[id];
const live = (map, id) => exists(map, id) && !map.pack.states[id].removed;

export function checkRecords(map) {
  const out = [], data = map.ext?.data ?? {}, now = map.worldTime ?? null;
  // 指導者の在位期間の重なり・すき間
  for (const [sid, rec] of Object.entries(data.leaders ?? {})) {
    if (!exists(map, +sid)) { out.push(`指導者の記録が、存在しない国家#${sid}を指しています`); continue; }
    const seq = [...(rec.history ?? []), ...(rec.current ? [rec.current] : [])];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = seq[i], b = seq[i + 1]; if (!a.until || !b.since) continue;
      const u = key(a.until.year, a.until.month), s = key(b.since.year, b.since.month);
      if (u > s) out.push(`${stateName(map, +sid)}の指導者「${a.name}」と「${b.name}」の在位が重なっています`);
      else if (u < s) out.push(`${stateName(map, +sid)}の指導者「${a.name}」と「${b.name}」の在位にすき間があります`);
    }
  }
  // 存在しない国への参照（戦争・条約・歴史ログ・分離元）
  for (const w of data.wars ?? []) for (const id of [...(w.attackers ?? []), ...(w.defenders ?? [])]) if (!exists(map, id)) out.push(`戦争「${w.name}」が、存在しない国家#${id}を指しています`);
  for (const t of data.treaties ?? []) for (const p of t.parties ?? []) if (!exists(map, p.state)) out.push(`条約「${t.name}」が、存在しない国家#${p.state}を指しています`);
  for (const h of data.historyLog ?? []) for (const id of h.states ?? []) if (!exists(map, id)) { out.push(`年表の出来事「${h.title}」が、存在しない国家#${id}を指しています`); break; }
  for (const s of map.pack.states) if (s && s.i > 0 && s.parentState > 0 && !exists(map, s.parentState)) out.push(`${s.name}の分離元が、存在しない国家#${s.parentState}です`);
  // 年代が逆転した原因リンク（保存した cause は「type|年-月|title」）
  for (const h of data.historyLog ?? []) {
    if (!h.cause) continue; const m = /^[^|]*\|(-?\d+)-(\d+)\|/.exec(h.cause); if (!m) { out.push(`年表の出来事「${h.title}」の原因リンクの形が正しくありません`); continue; }
    if (key(+m[1], +m[2]) > key(h.year, h.month)) out.push(`年表の出来事「${h.title}」の原因が、結果より後の出来事になっています`);
  }
  // 前身・後継の循環
  for (const s of map.pack.states) {
    if (!s || !(s.i > 0)) continue; const seen = new Set([s.i]); let cur = s.parentState, guard = 0;
    while (cur > 0 && guard++ < 1000) { if (seen.has(cur)) { out.push(`${s.name}の前身・後継が循環しています`); break; } seen.add(cur); cur = map.pack.states[cur]?.parentState; }
  }
  // 条約: 当事国が消えた・期限切れなのに有効のまま
  for (const t of data.treaties ?? []) {
    if (t.status !== "active") continue;
    if (t.kind !== "peace" && (t.parties ?? []).some((p) => exists(map, p.state) && !live(map, p.state))) out.push(`条約「${t.name}」は有効ですが、当事国が消えています`);
    if (t.expiresAt && now && key(now.year, now.month) >= key(t.expiresAt.year, t.expiresAt.month)) out.push(`条約「${t.name}」は期限切れなのに、有効のままです`);
  }
  return out;
}
