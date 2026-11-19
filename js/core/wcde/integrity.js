// v6: WCDE の不変条件（国家・人物・領域の整合）。tick の integrity フェーズ、保存前、テストから呼ぶ。違反を文字列の配列で返す。
import { checkArchive, checkArchiveChunk } from "../civ/archive.js";
import { perf } from "../perf/perf-monitor.js";
import { nodeOf } from "./domains/doctrine.js";
import { checkWarsActive, checkEndedWar } from "./warfare.js";
import { FACTIONS } from "./domains/politics.js";
import { checkInterventions } from "./intervention.js";
import { checkClock } from "./clock.js";
import { checkDecisions } from "./decisions.js";
import { checkCatastrophes } from "./catastrophe.js";

const fin = (x) => typeof x === "number" && Number.isFinite(x);
/** v6.20.0 M4: 検査を 3 段階に分ける（IntegrityScheduler）。検査そのものは省略せず、実行の時期を分散する。
 *   レベル1（毎月）: 現役のもの — 担当国家・魔法・生きている国家・進行中の戦争・介入・災厄・時計・決断・指導者。
 *   レベル2（毎月・少しずつ）: 過去のもの — 人物・終結した戦争・資料チャンクを、保存できるカーソルで一定件数ずつ。1 周は人物で約 1 年。
 *   レベル3（全体検査）: 世界全体。保存前・読み込み後・手動（checkWcdeIntegrity）と、100 年ごと。人物 10 万人でも、毎月の処理に全件の走査が集中しない。 */
export const SLICE = Object.freeze({ figures: 400, endedWars: 60, archiveChunks: 1, fullEveryMonths: 1200 });
function core(world, civ) {
  const errs = [], W = civ.wcde; if (!civ.options?.wcde) return errs;
  // 担当国家: 高々1つで、civ.wcde.control と国家の player が一致する
  const players = Object.values(civ.states).filter((s) => s.alive && s.player);
  if (players.length > 1) errs.push(`担当国家が複数ある（${players.map((s) => s.id).join(",")}）`);
  const cs = W?.control?.stateId ?? null;
  if (cs && !(civ.states[cs]?.alive && civ.states[cs].player)) errs.push(`担当国家 ${cs} が存在しない・担当の印が無い`);
  if (!cs && players.length) errs.push("担当が無いのに、担当の印が付いた国家がある");
  if (civ.player?.groupId != null) errs.push("WCDE の世界では、担当は集団ではなく国家（civ.player.groupId は空）");
  // 魔法の無い世界: 魔法に関わる実体が無い
  if (civ.options.magic === false) { if (Object.keys(civ.persons ?? {}).length || Object.keys(civ.magic?.orgs ?? {}).length) errs.push("魔法の無い世界に、魔法の人物・組織がある"); for (const s of Object.values(civ.states)) if (s.magic) errs.push(`魔法の無い世界で国家 ${s.id} に魔法制度がある`); }
  // 国家の領域
  for (const st of Object.values(civ.states)) {
    if (!st.alive) continue; const e = st.econ;
    if (e) for (const k of ["output", "industry", "perCapita", "foodBalance", "tradeIncome"]) if (e[k] !== undefined && !fin(e[k])) errs.push(`${st.id}.econ.${k} が有限でない`);
    const P = st.politics; if (P) { for (const k of Object.keys(P.factions)) { const f = P.factions[k], s = f?.support; if (!FACTIONS[k]) errs.push(`${st.id} に未知の勢力 ${k}`); if (!(s >= 0 && s <= 1)) errs.push(`${st.id} の${FACTIONS[k] ?? k}の支持が範囲外 ${s}`); if (!(f.influence == null || (f.influence >= 0 && f.influence <= 1))) errs.push(`${st.id} の${FACTIONS[k] ?? k}の影響力が範囲外`); } for (const k of ["nobility", "military", "commoners"]) if (!P.factions[k]) errs.push(`${st.id} に常に在るはずの勢力 ${k} が無い`); for (const [k, v] of Object.entries(P.ideas ?? {})) if (!(v >= 0 && v <= 1)) errs.push(`${st.id} の思想 ${k} が範囲外`); if (!(P.legitimacy >= 0 && P.legitimacy <= 1)) errs.push(`${st.id} の正統性が範囲外`); }
    const M = st.military; if (M) {
      for (const id of Object.keys(M.doctrine.taken)) { const d = nodeOf(st, id); if (!d) { if (!id.startsWith("sp:") && M.v6180 != null) errs.push(`${st.id} に未知のドクトリン ${id}`); /* 固有の系統が入れ替わった休眠ノードは、定義が国家に無くてもよい */ } else for (const p of d.prereq) if (M.doctrine.taken[p] == null) errs.push(`${st.id} のドクトリン ${id} の前提 ${p} が無い`); }
      if (!(st.milBonus >= -0.6 - 1e-9 && st.milBonus <= 0.6 + 1e-9)) errs.push(`${st.id} の milBonus が範囲外 ${st.milBonus}`); if (!(st.milDef >= 0 && st.milDef <= 0.4 + 1e-9)) errs.push(`${st.id} の milDef が範囲外`);
    }
    if (st.leaderFigureId) { const f = civ.figures?.[st.leaderFigureId]; if (!f) errs.push(`${st.id} の指導者の人物 ${st.leaderFigureId} が無い`); else if (f.diedAt != null) errs.push(`${st.id} の指導者の人物が没している`); }
  }
  errs.push(...checkInterventions(civ)); errs.push(...checkCatastrophes(civ)); errs.push(...checkClock(civ)); errs.push(...checkWarsActive(civ)); errs.push(...checkDecisions(civ));
  return errs;
}
/** 人物 1 人の検査: 親は先に生まれている・子は対になる・没は生より後 */
function checkFigure(civ, f, errs) {
  {
    if (f.diedAt != null && f.diedAt < f.bornAt) errs.push(`人物 ${f.id} の没が生より前`);
    if (f.parents) for (const pid of f.parents) { const p = civ.figures[pid]; if (!p) errs.push(`人物 ${f.id} の親 ${pid} が無い`); else { if (p.bornAt >= f.bornAt) errs.push(`人物 ${f.id} が親より先に生まれている`); if (!p.children.includes(f.id)) errs.push(`人物 ${f.id} が親 ${pid} の子に載っていない`); } }
    for (const cid of f.children) if (!civ.figures[cid]) errs.push(`人物 ${f.id} の子 ${cid} が無い`);
    if (f.houseId && !civ.houses?.[f.houseId]) errs.push(`人物 ${f.id} の家 ${f.houseId} が無い`);
  }
}
/** 全体検査（レベル3）。保存前・読み込み後・手動・テスト用。従来の checkWcdeIntegrity と同じ範囲 */
export function checkWcdeIntegrity(world, civ) {
  const errs = core(world, civ); if (!civ.options?.wcde) return errs;
  errs.push(...checkArchive(civ)); // 歴史資料: ID 重複・直接以外の因果リンク・判断記録が無いこと
  for (const w of Object.values(civ.wars ?? {})) errs.push(...checkEndedWar(w));
  for (const f of Object.values(civ.figures ?? {})) checkFigure(civ, f, errs);
  return errs;
}
const KEYS = new WeakMap();
const sliceOf = (civ, name, list, budget, cur) => { // 保存できるカーソル（civ.wcde.integrity）で、list の budget 件ずつ。1 周したら先頭へ
  let c = KEYS.get(civ); if (!c) KEYS.set(civ, (c = {})); if (!c[name] || cur[name] === 0) c[name] = list(); const keys = c[name], from = cur[name] ?? 0, to = Math.min(keys.length, from + budget); cur[name] = to >= keys.length ? 0 : to; return keys.slice(from, to);
};
/** 毎月の検査（レベル1＋レベル2）。100 年ごとに全体検査（レベル3） */
export function integrityStep(world, civ) {
  const t0 = perf.mark("integrity"); const errs = core(world, civ); if (!civ.options?.wcde) return errs;
  if (civ.monthIndex % SLICE.fullEveryMonths === 0) { errs.push(...checkWcdeIntegrity(world, civ).filter((e) => !errs.includes(e))); perf.measure("integrity", t0); return errs; }
  const cur = (civ.wcde.integrity ??= { figures: 0, wars: 0, arc: 0 });
  for (const id of sliceOf(civ, "figures", () => Object.keys(civ.figures ?? {}), SLICE.figures, cur)) { const f = civ.figures[id]; if (f) checkFigure(civ, f, errs); }
  for (const id of sliceOf(civ, "wars", () => Object.keys(civ.wars ?? {}), SLICE.endedWars, { get wars() { return cur.wars; }, set wars(v) { cur.wars = v; } })) { const w = civ.wars[id]; if (w) errs.push(...checkEndedWar(w)); }
  for (const k of sliceOf(civ, "arc", () => Object.keys(civ.archive?.chunks ?? {}), SLICE.archiveChunks, cur)) errs.push(...checkArchiveChunk(civ.archive.chunks[k], k));
  perf.measure("integrity", t0); return errs;
}
