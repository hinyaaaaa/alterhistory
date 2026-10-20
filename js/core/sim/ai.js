// 国家の自律的行動（v3.0.0）。プレイヤー国以外の国が、ルールで「判断」して、ユーザーと同じ操作（宣戦・条約・講和・技術の採用）を行う。
//   ・判断は純粋ロジック: planAutonomy は地図を変えず、「誰が・何を・なぜ」の一覧（決定）を返す。実行は app/sim-actions.js が、既存の操作で行う
//     （だから年表への記録・検証・Undo は、ユーザーが操作したときと同じ）。
//   ・国の性格（目標の重み）は、政体・思潮・食料・戦争から決まる: 安全・繁栄・拡張・威信。
//   ・判断の速さは tempo で決まる: 1か国が考えるのは数か月に1回（国ごとにずらす）。1回の判断で大きな行動は1つまで。
//     時計の速さには依存しない（ゲーム内の月で数える）ので、倍速にしても1年あたりの行動数は変わらない。
//   ・発展のペース（ai-pace.js）: プレイヤー国より進みすぎた国は宣戦に慎重になり、遅れた国は積極になる。
//   ・どの行動にも「理由」が付く。余波（v2.7.0）が理由なら、その元の出来事が、年表の原因として残る。
// 純粋ロジック層：DOM に依存しない。乱数は注入する。
import { makeCommand } from "../edit/commands.js";
import { withEvent } from "../edit/history-log.js";
import { regimeOf } from "../edit/regimes.js";
import { activeTreaties, expiringTreaties, partyIds } from "../edit/treaties.js";
import { vassalInfo } from "../edit/vassals.js";
import { listWars, warOngoing, suggestTerms, peaceSides } from "../edit/wars.js";
import { previewWar } from "./war-engine.js";
import { neighborsOfStates, pendingFields } from "./tech-momentum.js";
import { getIndicators, activeShocks } from "./pressure.js";
import { ideasOf } from "./ideas.js";
import { getAi, isAutonomous, TEMPOS } from "./ai-settings.js";
import { paceOf } from "./ai-pace.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mkOf = (d) => d.year * 12 + (d.month - 1);
const nm = (s) => s?.fullName ?? s?.name ?? "?";
const pk = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
/** 次の宣戦までの最短の間隔（月）の基準。tempo の war で割る */
export const WAR_COOLDOWN_MONTHS = 180;
/** 同じ相手との再戦までの最短の間隔（月） */
export const PAIR_COOLDOWN_MONTHS = 360;
export const KIND_LABEL = Object.freeze({ war: "宣戦", peace: "講和", tech: "技術の採用", renew: "条約の更新", nonaggression: "不可侵条約", alliance: "同盟", economic: "経済協力" });

/** 判断の材料を、1回の判断のぶんだけまとめて求める（地図は変更しない） */
export function makeContext(map, date) {
  const ai = getAi(map), nb = neighborsOfStates(map), inds = getIndicators(map, date), pace = paceOf(map, date), mk = mkOf(date);
  const allied = new Set(), nonagg = new Set(), atWar = new Set(), grudge = new Set();
  for (const t of activeTreaties(map, date, "alliance")) { const ids = partyIds(t); for (const a of ids) for (const b of ids) if (a < b) allied.add(pk(a, b)); }
  for (const t of activeTreaties(map, date, "nonaggression")) { const ids = partyIds(t); for (const a of ids) for (const b of ids) if (a < b) nonagg.add(pk(a, b)); }
  for (const w of listWars(map)) {
    const recent = w.endedAt && mk - mkOf(w.endedAt) <= 480; // 40年以内に戦った相手には、遺恨が残る
    for (const a of w.attackers ?? []) for (const d of w.defenders ?? []) { if (!w.endedAt) atWar.add(pk(a, d)); else if (recent) grudge.add(pk(a, d)); }
  }
  const cache = new Map();
  const share = (a, b) => { const k = `${a}>${b}`; if (!cache.has(k)) { let v = 0.5; try { v = previewWar(map, [a], [b]).compare?.land ?? 0.5; } catch { v = 0.5; } cache.set(k, v); } return cache.get(k); };
  return { map, date, ai, tempo: TEMPOS[ai.tempo], nb, inds, pace, mk, allied, nonagg, atWar, grudge, share };
}

/** 国の性格（目標の重み 0〜1）。threat は、強い隣国から感じる脅威（0〜1） */
export function characterOf(map, s, ind, ideas, threat = 0) {
  const reg = regimeOf(s).key, warlike = ["empire", "junta", "nationalist", "tribal"].includes(reg) ? 0.2 : 0, peaceful = ["democracy", "constitutional", "federation", "presidential"].includes(reg) ? 0.15 : 0;
  return {
    expansion: clamp(0.2 + 0.35 * ideas.nation + warlike - peaceful - 0.15 * ideas.liberal + 0.3 * Math.max(0, 1 - ind.food), 0, 1),
    security: clamp(0.3 + 0.4 * threat + 0.3 * ind.war, 0, 1),
    prosperity: clamp(0.3 + 0.3 * ideas.enlight + peaceful, 0, 1),
    prestige: clamp(0.2 + 0.3 * ideas.nation + (["absolute", "empire"].includes(reg) ? 0.2 : 0), 0, 1),
  };
}
export const CHARACTER_LABELS = Object.freeze({ expansion: "拡張", security: "安全", prosperity: "繁栄", prestige: "威信" });

/** 余波が理由のとき、その元の出来事のキー（年表の原因にする） */
export function shockCause(map, stateId, date, kinds) {
  const sh = activeShocks(map, stateId, date).find((x) => x.from && kinds.includes(x.k) && x.now > 0.15);
  return sh?.from ?? null;
}

const live = (map, id) => isLive(map.pack.states[id]);
const hasWarNow = (map, id) => listWars(map).some((w) => !w.endedAt && ((w.attackers ?? []).includes(id) || (w.defenders ?? []).includes(id)));
const lastWarStart = (map, id) => listWars(map).filter((w) => (w.attackers ?? [])[0] === id).reduce((m, w) => Math.max(m, mkOf(w.startedAt)), -1e9);
const lastWarBetween = (map, a, b) => listWars(map).filter((w) => ((w.attackers ?? []).includes(a) && (w.defenders ?? []).includes(b)) || ((w.attackers ?? []).includes(b) && (w.defenders ?? []).includes(a))).reduce((m, w) => Math.max(m, mkOf(w.startedAt)), -1e9);
const treatyCount = (map, date, id, kinds) => activeTreaties(map, date).filter((t) => kinds.includes(t.kind) && partyIds(t).includes(id)).length;
const vassalPair = (map, a, b) => vassalInfo(map, a)?.overlord === b || vassalInfo(map, b)?.overlord === a;

/** 1つの国の、いまの判断の候補。{ major: 大きな行動の候補[], tech: 技術の採用の候補|null, character } */
export function candidatesOf(ctx, s, budget) {
  const { map, date, ai, inds, tempo } = ctx, ind = inds.get(s.i), out = { major: [], tech: null, character: null };
  if (!ind) return out;
  const ideas = ideasOf(map, s.i, ind), neigh = [...(ctx.nb.get(s.i) ?? [])].filter((n) => live(map, n));
  let threat = 0;
  for (const n of neigh) if (!ctx.allied.has(pk(s.i, n))) threat = Math.max(threat, clamp((1 - ctx.share(s.i, n) - 0.5) * 2, 0, 1));
  const ch = characterOf(map, s, ind, ideas, threat); out.character = ch;
  const auto = (id) => isAutonomous(map, id, ai);
  const pace = ctx.pace.get(s.i);

  // 技術の採用: 研究が実った（機運が出ている）分野を、財政に余裕があれば採用する
  if (ai.verbs.tech) {
    const p = pendingFields(map, s.i)[0];
    if (p) { const u = clamp(0.6 * (0.5 + ch.prosperity) * clamp(ind.fiscalSlack, 0.2, 1), 0, 1); out.tech = { kind: "tech", stateId: s.i, field: p.field, u, reason: `${nm(s)}は、${p.label}の研究が実り、「${p.step}」の採用に踏み切った` }; }
  }

  if (ai.verbs.treaty) {
    // 条約の更新: 当事国がすべてアルゴリズム国家で、自分が筆頭のときだけ（二重に更新しない）
    for (const { treaty: t } of expiringTreaties(map, date)) {
      const ids = partyIds(t); if (ids[0] !== s.i || !ids.every(auto) || ctx.atWar.has(pk(ids[0], ids[1] ?? ids[0]))) continue;
      out.major.push({ kind: "renew", stateId: s.i, treatyId: t.id, u: 1.2, reason: `${nm(s)}は、「${t.name}」の期限が近づき、関係が良好なため、条約を更新した` });
    }
    const pacts = treatyCount(map, date, s.i, ["alliance", "nonaggression"]);
    for (const n of neigh) {
      if (!auto(n) || ctx.atWar.has(pk(s.i, n)) || ctx.grudge.has(pk(s.i, n)) || vassalPair(map, s.i, n)) continue;
      const sn = map.pack.states[n], theirs = 1 - ctx.share(s.i, n), bound = ctx.allied.has(pk(s.i, n)) || ctx.nonagg.has(pk(s.i, n));
      if (!bound && pacts < 2 && theirs > 0.55) out.major.push({ kind: "nonaggression", stateId: s.i, targetId: n, u: ch.security * (theirs - 0.5) * 4, reason: `${nm(s)}は、強大な隣国${nm(sn)}への備えとして、不可侵条約を結んだ` });
      // 同盟: 釣り合った隣国どうしで、ともに脅威になる第三国があるとき
      if (!bound && treatyCount(map, date, s.i, ["alliance"]) < 1 && treatyCount(map, date, n, ["alliance"]) < 1 && Math.abs(ctx.share(s.i, n) - 0.5) < 0.25) {
        const common = [...new Set([...neigh, ...(ctx.nb.get(n) ?? [])])].find((m) => m !== s.i && m !== n && live(map, m) && !ctx.allied.has(pk(s.i, m)) && !ctx.allied.has(pk(n, m)) && 1 - ctx.share(s.i, m) > 0.55);
        if (common != null) out.major.push({ kind: "alliance", stateId: s.i, targetId: n, u: ch.security * 0.8, reason: `${nm(s)}は、共通の脅威である${nm(map.pack.states[common])}に備え、${nm(sn)}と同盟を結んだ` });
      }
      if (!ctx.atWar.has(pk(s.i, n)) && !activeTreaties(map, date, "economic").some((t) => partyIds(t).includes(s.i) && partyIds(t).includes(n)) && !ctx.grudge.has(pk(s.i, n)))
        out.major.push({ kind: "economic", stateId: s.i, targetId: n, u: 0.5 * ch.prosperity, reason: `${nm(s)}は、通商を広げるため、${nm(sn)}と経済協力を結んだ` });
    }
  }

  // 宣戦: 拡張の意欲が高く、国内が安定していて、優位に立てる相手がいるときだけ。間隔・同時進行・年間の数に上限がある
  const support = typeof s.support === "number" ? s.support : 70, cool = WAR_COOLDOWN_MONTHS / tempo.war;
  if (ai.verbs.war && budget.warsLeft > 0 && budget.ongoing < budget.maxOngoing && !hasWarNow(map, s.i) && support >= 45 && ind.fiscalSlack >= 0.4 && ctx.mk - lastWarStart(map, s.i) >= cool) {
    const paceFactor = pace ? (pace.index > 1.3 ? 0.5 : pace.index < 0.7 ? 1.3 : 1) : 1; // 進みすぎは慎重に、遅れは積極に
    let best = null;
    for (const n of neigh) {
      const k = pk(s.i, n);
      if (ctx.allied.has(k) || ctx.nonagg.has(k) || ctx.atWar.has(k) || vassalPair(map, s.i, n)) continue;
      const mine = ctx.share(s.i, n); if (mine < 0.57) continue;
      if (!auto(n) && !ai.targetPlayers) continue; // プレイヤー国には宣戦しない設定
      if (ctx.mk - lastWarBetween(map, s.i, n) < PAIR_COOLDOWN_MONTHS) continue; // 同じ相手とは、すぐには戦わない
      const need = Math.max(0, 1 - ind.food), grudge = ctx.grudge.has(k) ? 1 : 0, targetIsPlayer = !auto(n);
      const u = (ch.expansion * (mine - 0.5) * 4 + 0.15 * grudge + 0.25 * need + 0.2 * ideas.nation) * tempo.war * paceFactor * (targetIsPlayer ? 0.6 : 1);
      if (u > 0 && (!best || u > best.u)) best = { n, u, mine, need, grudge };
    }
    if (best) {
      const t = map.pack.states[best.n], why = [];
      if (best.need > 0.2) why.push("食料の不足から新しい土地を求め");
      if (ideas.nation > 0.5) why.push("民族主義の高まりを背景に");
      if (best.grudge) why.push("かつての敵への遺恨から");
      why.push(`${nm(t)}に対して戦力で優位に立ったと見て`);
      out.major.push({ kind: "war", stateId: s.i, targetId: best.n, u: best.u, reason: `${nm(s)}は、${why.join("、")}、${nm(t)}に宣戦した`, cause: best.need > 0.2 ? shockCause(map, s.i, date, ["food"]) : null });
    }
  }
  return out;
}

/** 重み付きで1つ選ぶ。何もしない重み（idle）がある */
export function pickDecision(cands, rnd, idle = 0.8) {
  const list = cands.filter((c) => c.u > 0);
  if (!list.length) return null;
  const total = list.reduce((n, c) => n + c.u, 0);
  let x = rnd.next() * (total + idle);
  if (x >= total) return null;
  for (const c of list) { x -= c.u; if (x < 0) return c; }
  return list.at(-1);
}

/** 講和の判断: 参戦国がすべてアルゴリズム国家の戦争が、目安の期間をすぎたら、講和条約を結ぶ */
function peaceDecisions(ctx, rnd) {
  const { map, ai } = ctx, out = [];
  if (!ai.verbs.peace) return out;
  for (const w of listWars(map)) {
    if (!warOngoing(w)) continue;
    const all = [...(w.attackers ?? []), ...(w.defenders ?? [])];
    if (!all.every((id) => isAutonomous(map, id, ai))) continue; // プレイヤー国が加わる戦争は、ユーザーが講和する
    const progress = w.progress ?? 0, { winners, losers, stalemate } = peaceSides(w);
    const lowest = Math.min(...losers.map((id) => map.pack.states[id]?.support ?? 70));
    const p = progress >= 2 ? 1 : progress >= 1 ? 0.4 : progress >= 0.6 && lowest < 30 ? 0.2 : 0;
    if (!(p > 0) || !rnd.chance(p)) continue;
    const lead = map.pack.states[winners[0]];
    out.push({ kind: "peace", stateId: winners[0], warId: w.id, reason: stalemate ? `${w.name}は膠着し、双方が消耗したため、白紙和平が結ばれた` : `${w.name}は戦局が決し、${nm(lead)}が優位な条件で講和した`, u: 1 });
  }
  return out;
}

/**
 * 今月のアルゴリズム国家の行動の決定を求める。地図は変えない。
 * @returns {{kind:string, stateId:number, targetId?:number, treatyId?:number, warId?:number, field?:string, reason:string, cause?:string|null}[]}
 */
export function planAutonomy(map, date, rnd) {
  const ai = getAi(map);
  if (!ai.enabled || !ai.players.length) return [];
  const ctx = makeContext(map, date), tempo = ctx.tempo, out = [...peaceDecisions(ctx, rnd)];
  const liveStates = map.pack.states.filter(isLive);
  // 世界全体で、新しい戦争を始める間隔の下限（アルゴリズム国家が多いほど短い）。1回の判断で、戦争は多くて1つ
  const nAuto = liveStates.filter((s) => isAutonomous(map, s.i, ai)).length, gap = 12 / Math.max(0.01, (nAuto * tempo.warRate) / 100);
  const lastAiWar = listWars(map).filter((w) => isAutonomous(map, (w.attackers ?? [])[0], ai)).reduce((m, w) => Math.max(m, mkOf(w.startedAt)), -1e9);
  const budget = { warsLeft: ctx.mk - lastAiWar >= gap ? 1 : 0, ongoing: listWars(map).filter((w) => !w.endedAt && [...(w.attackers ?? []), ...(w.defenders ?? [])].every((id) => isAutonomous(map, id, ai))).length, // プレイヤー国が加わる戦争は、ユーザーの講和を待つので、上限に数えない
    maxOngoing: Math.max(1, Math.ceil(liveStates.length / 4)) };
  for (const s of liveStates) {
    if (!isAutonomous(map, s.i, ai) || (ctx.mk + s.i) % tempo.think !== 0) continue; // 国ごとに、数か月に1回だけ考える（国ごとにずらす）
    const c = candidatesOf(ctx, s, budget);
    const pick = pickDecision(c.major, rnd);
    if (pick) { out.push(pick); if (pick.kind === "war") { budget.warsLeft--; budget.ongoing++; } }
    if (c.tech && rnd.chance(c.tech.u)) out.push(c.tech);
  }
  return out;
}

/** 決定を、年表に残す（理由つき。地図の状態は変えない）。実行する直前に、同じ操作のなかで commit する */
export function planAiNote(map, d, date) {
  const cmd = makeCommand("国家の判断", [], []);
  return withEvent(map, cmd, { type: "ai", title: d.reason, detail: KIND_LABEL[d.kind] ?? d.kind, date, states: [d.stateId, ...(d.targetId != null ? [d.targetId] : [])], data: { ai: true, kind: d.kind }, ...(d.cause ? { cause: d.cause } : {}) });
}

/** 講和の条件（アルゴリズム国家どうしの戦争）。UI の「条約を結ぶ」と同じ形。提案が作れなければ白紙和平 */
export function peaceTermsFor(map, war, venue = null) {
  let t = null; try { t = suggestTerms(map, war, { size: "m" }); } catch { t = null; }
  const base = t ? { kind: t.kind, cessions: (t.cessions ?? []).filter((c) => c.on).map((c) => ({ cells: c.regionCells, fromStateId: c.fromStateId, toStateId: c.toStateId, name: c.name, burgs: c.burgNames })), reparations: t.reparations ?? [], annex: [] } : { kind: "white", cessions: [], reparations: [], annex: [] };
  return { ...base, treatyName: venue?.treatyName ?? "", notes: "", venue: venue ? { place: venue.place, stateId: venue.stateId } : null };
}

/** 国家タブの「アルゴリズム国家の行動」用。地図は変えない */
export function aiView(map, stateId, date = map.worldTime ?? { year: 1, month: 1 }) {
  const ai = getAi(map), s = map.pack.states[stateId]; if (!isLive(s)) return null;
  const view = { enabled: ai.enabled, hasPlayers: ai.players.length > 0, player: ai.players.includes(stateId), autonomous: isAutonomous(map, stateId, ai), tempo: TEMPOS[ai.tempo].label, recent: [] };
  const log = map.ext?.data?.historyLog ?? [];
  view.recent = log.filter((h) => h.type === "ai" && (h.states ?? []).includes(stateId)).slice(-6).reverse().map((h) => ({ year: h.year, month: h.month, text: h.title, kind: h.detail }));
  if (!view.autonomous) return view;
  const ctx = makeContext(map, date), ind = ctx.inds.get(stateId); if (!ind) return view;
  const ideas = ideasOf(map, stateId, ind), neigh = [...(ctx.nb.get(stateId) ?? [])].filter((n) => live(map, n));
  let threat = 0; for (const n of neigh) if (!ctx.allied.has(pk(stateId, n))) threat = Math.max(threat, clamp((1 - ctx.share(stateId, n) - 0.5) * 2, 0, 1));
  view.character = characterOf(map, s, ind, ideas, threat);
  const p = ctx.pace.get(stateId); view.pace = p ? { index: p.index, mult: p.mult } : null;
  const t = ctx.tempo.think, wait = (t - ((ctx.mk + stateId) % t)) % t; view.nextThinkMonths = wait === 0 ? t : wait;
  return view;
}
