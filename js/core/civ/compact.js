// v6.9.0: 世界の記録の整理（メモリの増大を抑える）。時代を進めるほど、条約・外交の提案・滅んだ国家の細部・人物が溜まって重くなっていた。
//   方針: 結果（誰が・いつ・何をしたか）は残し、「今の判断に要る細部」だけを落とす。年に 1 回（毎年 8 月）。WCDE の世界だけ。
//   ・失効した条約: 失効から 50 年を過ぎたものは件数だけ civ.stats.treatiesPruned に数えて消す（出来事の記録は歴史資料に残る）。
//   ・外交の提案の記録: 受諾された講和（講和条約の名前・リンクの元）と、直近 30 年以内のものだけ残す。
//   ・滅んだ国家: 滅亡から 50 年を過ぎたら、関係値・政治・経済・軍事・制裁など、再び動かない大きな項目を落とす（名前・年・首都・政体・指導者は残る）。
//   ・話し手のいない言語: 音素表（phon）を落とす（言語の名前・系統は残る。必要になれば系統から作り直す）。
//   ・没した人物: 没して 300 年を過ぎた人物のうち、国の指導者でも後継者でもなく、子もいない人物は消す（家系の骨格は残す）。
export const COMPACT = Object.freeze({ treatyKeepMonths: 600, proposalKeepMonths: 360, deadStateMonths: 600, figureMonths: 3600 });
const DEAD_STATE_HEAVY = ["relations", "politics", "econ", "military", "sanctions", "strategy", "campaign", "interp", "interpDirty", "offices", "magic", "tradeRoutes"];
export function stepCompact(ctx) {
  const { civ } = ctx; if (!civ.options?.wcde || civ.monthIndex % 12 !== 7) return;
  const mi = civ.monthIndex, stats = (civ.stats ??= {}); let tp = 0;
  for (const id in civ.treaties) { const t = civ.treaties[id]; if (!t.active && t.endedAt != null && mi - t.endedAt > COMPACT.treatyKeepMonths) { delete civ.treaties[id]; tp++; } }
  if (tp) stats.treatiesPruned = (stats.treatiesPruned ?? 0) + tp;
  const led = civ.wcde?.diplomacy; if (led?.proposals?.length > 200) { const before = led.proposals.length; led.proposals = led.proposals.filter((p) => (p.kind === "peace" && p.status === "accepted") || mi - p.at <= COMPACT.proposalKeepMonths); stats.proposalsPruned = (stats.proposalsPruned ?? 0) + (before - led.proposals.length); }
  for (const id in civ.states) { const s = civ.states[id]; if (s.alive || s.compacted || s.dissolvedAt == null || mi - s.dissolvedAt < COMPACT.deadStateMonths) continue; for (const k of DEAD_STATE_HEAVY) delete s[k]; s.compacted = true; }
  if (civ.languages) { // 話し手のいない言語の音素表（約 1.2KB/言語。年 5000 までに 6,000 言語・約 7MB）を落とす。必要になれば ensureProfile が系統から決定的に作り直す
    const live = new Set(); for (const id in civ.groups) for (const co of civ.groups[id].cohorts ?? []) if (co.languageId) live.add(co.languageId);
    let lp = 0; for (const id in civ.languages) { const l = civ.languages[id]; if (l.phon && !live.has(id)) { delete l.phon; l.phonDropped = true; lp++; } }
    if (lp) stats.languageProfilesPruned = (stats.languageProfilesPruned ?? 0) + lp; }
  if (civ.figures) { const keep = new Set(); for (const id in civ.states) { const s = civ.states[id]; if (s.leaderFigureId) keep.add(s.leaderFigureId); if (s.heirFigureId) keep.add(s.heirFigureId); } let fp = 0;
    for (const id in civ.figures) { const f = civ.figures[id]; if (f.diedAt != null && mi - f.diedAt > COMPACT.figureMonths && !keep.has(id) && !(f.children?.length) && !isParentOfLiving(civ, id)) { for (const pid of f.parents ?? []) { const par = civ.figures[pid]; if (par) par.children = par.children.filter((c) => c !== id); } /* 親の子の一覧から外す（整合性: 子は対になる） */ delete civ.figures[id]; fp++; } }
    if (fp) stats.figuresPruned = (stats.figuresPruned ?? 0) + fp; }
}
function isParentOfLiving(civ, id) { // 子が人物表に残っているか（骨格を切らない）
  const f = civ.figures[id]; for (const c of f.children ?? []) if (civ.figures[c]) return true; return false;
}
