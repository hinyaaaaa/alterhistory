// 月ごとの自動の出来事（豊作・飢饉・災害・好況・ストライキ・選挙・婚礼・クーデター未遂など）。
//   v2.4.0: 年に1回だった自動の出来事を、月ごとの判定にして頻度を上げ、種類を増やした。
//   ・技術ドクトリンに合わない出来事は出さない（例: 鉄道開通は交通が一定の段に達した国だけ。ストライキは工業が進んだ国だけ）
//   ・政体に合う出来事（君主制の婚礼・民主制の選挙・軍事政権のクーデター未遂など）が出る
//   ・効果は、民意・国庫・産業・士気の増減だけ（人口・領土は変えないので、集計の整合性を崩さない）
//   ・起きたことは必ず年表に載る。オン／オフと頻度（まれ・ふつう・多い）は、既存の自然発生イベントの設定と共通
// 純粋ロジック層：DOM に依存しない。乱数は注入する（再現できる）。
import { makeCommand, setProps } from "../edit/commands.js";
import { withEvent } from "../edit/history-log.js";
import { getTechDoctrine } from "../edit/doctrines.js";
import { regimeOf } from "../edit/regimes.js";
import { FREQUENCIES, getNaturalSettings } from "./natural-events.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** 国1つあたり、1か月に何かが起きる基本確率（頻度「ふつう」）。5か国なら、およそ半年に1件 */
export const MINOR_RATE = 0.035;

const MON = (r) => r.key === "absolute" || r.key === "constitutional" || r.key === "empire" || r.key === "elective";
const DEM = (r) => ["democracy", "presidential", "aristocratic", "federation"].includes(r.key);
const AUTH = (r) => ["junta", "nationalist", "party", "anarchy"].includes(r.key);
const sup = (s) => (typeof s.support === "number" ? s.support : 70);

/**
 * 出来事の一覧。cond: その国で起こりうるか / w: 重み / fx: 効果（support・treasury は比率ではなく増減、industryF・treasuryF は倍率）
 *   t: 技術ドクトリンの分野と段の範囲（時代に合わない出来事を出さない）
 */
export const MINOR_EVENTS = Object.freeze([
  { key: "harvest", title: "豊作", w: 5, t: { agri: [1, 10] }, text: (n) => `${n}で豊作となり、国庫と民心が潤った`, fx: { support: 4, treasuryF: 1.03 } },
  { key: "famine", title: "飢饉", w: 4, t: { agri: [1, 6] }, text: (n) => `${n}を飢饉が襲い、民心が荒れた`, fx: { support: -7, treasuryF: 0.97 } },
  { key: "flood", title: "洪水", w: 3, text: (n) => `${n}の大河が氾濫し、復旧の出費がかさんだ`, fx: { support: -3, treasuryF: 0.96, industryF: 0.995 } },
  { key: "earthquake", title: "地震", w: 2, text: (n) => `${n}を大きな地震が襲い、建物と蔵に被害が出た`, fx: { support: -3, treasuryF: 0.95 } },
  { key: "drought", title: "干ばつ", w: 3, t: { agri: [1, 7] }, text: (n) => `${n}で雨が降らず、作物が枯れた`, fx: { support: -4, treasuryF: 0.98 } },
  { key: "festival", title: "文化の隆盛", w: 3, cond: (s) => sup(s) >= 45, text: (n) => `${n}で祭礼と芸術が栄え、国の誇りが高まった`, fx: { support: 3 } },
  { key: "tradeboom", title: "商業の活況", w: 3, t: { transport: [2, 10] }, text: (n) => `${n}の市場が活気づき、国庫が増えた`, fx: { treasuryF: 1.05, industryF: 1.01 } },
  { key: "railway", title: "鉄道の開通", w: 2, t: { transport: [5, 8] }, text: (n) => `${n}で鉄道が開通し、物流が一変した`, fx: { support: 2, industryF: 1.03, treasuryF: 1.02 } },
  { key: "strike", title: "ストライキ", w: 3, t: { ind: [5, 10] }, text: (n) => `${n}の工場でストライキが広がり、生産が滞った`, fx: { support: -4, industryF: 0.98 } },
  { key: "newspaper", title: "新聞の創刊", w: 2, t: { comms: [4, 7] }, text: (n) => `${n}で新聞が創刊され、世論が動き出した`, fx: { support: -1, treasuryF: 1.01 } },
  { key: "broadcast", title: "放送の開始", w: 2, t: { comms: [7, 10] }, text: (n) => `${n}で放送が始まり、政府の声が各地に届いた`, fx: { support: 2 } },
  { key: "epidemic", title: "流行病", w: 3, t: { medicine: [1, 7] }, text: (n) => `${n}で流行病が広がり、民心が揺れた`, fx: { support: -3, treasuryF: 0.98 } },
  { key: "vaccine", title: "予防の普及", w: 2, t: { medicine: [4, 10] }, text: (n) => `${n}で予防接種が広まり、人々の暮らしが安定した`, fx: { support: 3 } },
  { key: "powergrid", title: "電力網の整備", w: 2, t: { energy: [6, 9] }, text: (n) => `${n}で電力網が整い、産業が伸びた`, fx: { industryF: 1.03 } },
  { key: "taxrevolt", title: "重税への抗議", w: 3, cond: (s) => sup(s) < 60, text: (n) => `${n}の各地で、重税への抗議が起きた`, fx: { support: -4 } },
  { key: "border", title: "国境での小競り合い", w: 3, cond: (s, c) => c.hasNeighbor, text: (n) => `${n}の国境で、小さな衝突が起きた`, fx: { morale: -2, support: -1 } },
  // 政体に合う出来事
  { key: "wedding", title: "王家の婚礼", w: 3, reg: MON, text: (n) => `${n}の王家で盛大な婚礼が行われ、国じゅうが祝った`, fx: { support: 3 } },
  { key: "intrigue", title: "宮廷の陰謀", w: 3, reg: MON, text: (n) => `${n}の宮廷で陰謀が発覚し、貴族の間に不信が広がった`, fx: { support: -3 } },
  { key: "election", title: "選挙", w: 4, reg: DEM, text: (n, s, sw) => (sw >= 0 ? `${n}の選挙で、政府が信任を得た` : `${n}の選挙で、政府が苦戦した`), fx: { support: 0 }, swing: true },
  { key: "coup", title: "クーデター未遂", w: 3, reg: AUTH, text: (n) => `${n}で、軍の一部がクーデターを企てて鎮圧された`, fx: { support: -5, morale: -3 } },
  { key: "revival", title: "宗教の復興", w: 3, reg: (r) => r.key === "theocracy", text: (n) => `${n}で信仰の復興が起こり、民が教えに集まった`, fx: { support: 4 } },
  { key: "congress", title: "党大会", w: 3, reg: (r) => r.key === "party", text: (n) => `${n}で党大会が開かれ、新しい方針が示された`, fx: { support: 2 } },
  // ---- 連鎖の後続（follow: 単独では起きない。先立つ出来事から event-chains.js が予約する） ----
  { key: "pricespike", title: "物価の高騰", w: 0, follow: true, text: (n) => `${n}で穀物が不足し、物価が高騰した`, fx: { support: -3, treasuryF: 0.98 } },
  { key: "refugees", title: "難民の流入", w: 0, follow: true, text: (n) => `${n}の各地に、飢えた人々が流れ込んだ`, fx: { support: -2, treasuryF: 0.985 } },
  { key: "riot", title: "暴動", w: 0, follow: true, text: (n) => `${n}の都市で、物価高に怒る民衆が暴動を起こした`, fx: { support: -4, morale: -1 } },
  { key: "recovery", title: "復興", w: 0, follow: true, text: (n) => `${n}で復興が進み、暮らしが立ち直ってきた`, fx: { support: 4, treasuryF: 1.01 } },
  { key: "purge", title: "粛清", w: 0, follow: true, text: (n) => `${n}で、クーデターに関わった者への粛清が行われた`, fx: { support: -3, morale: 2 } },
  { key: "turnover", title: "政権交代", w: 0, follow: true, leaderChange: true, text: (n) => `${n}で、選挙の敗北を受けて政権が交代した`, fx: { support: 2 } },
  { key: "council", title: "長老会議", w: 3, reg: (r) => r.key === "tribal", text: (n) => `${n}で長老たちの大きな会議が開かれ、争いが収まった`, fx: { support: 3 } },
]);

/** その国で、この出来事が時代・政体に合うか */
export function eventFits(ev, state, ctx = {}) {
  const tech = getTechDoctrine(state);
  for (const [track, [lo, hi]] of Object.entries(ev.t ?? {})) if (tech[track] < lo || tech[track] > hi) return false;
  if (ev.reg && !ev.reg(regimeOf(state))) return false;
  if (ev.cond && !ev.cond(state, ctx)) return false;
  return true;
}

/** この月に起きる出来事を決める。地図は変更しない。@returns {{key:string, stateId:number}[]} */
export function rollMinorEvents(map, rnd, settings = null) {
  const cfg = settings ?? getNaturalSettings(map);
  if (!cfg.enabled) return [];
  const f = FREQUENCIES[cfg.frequency]?.factor ?? 1;
  const out = [];
  for (const s of map.pack.states.filter(isLive)) {
    if (rnd.next() >= MINOR_RATE * f) continue;
    const ctx = { hasNeighbor: (s.neighbors ?? []).some((n) => isLive(map.pack.states[n])) };
    const pool = MINOR_EVENTS.filter((e) => !e.follow && eventFits(e, s, ctx));
    if (!pool.length) continue;
    const ev = rnd.weighted(pool, pool.map((e) => e.w));
    out.push({ key: ev.key, stateId: s.i, ...(ev.swing ? { swing: rnd.int(-6, 6) } : {}) });
  }
  return out;
}

/** 出来事を反映する（Undo 1回）。民意・国庫・産業・士気だけを動かす */
export function planMinorEvent(map, { key, stateId, swing = 0 }, date) {
  const ev = MINOR_EVENTS.find((e) => e.key === key), s = map.pack.states[stateId];
  if (!ev || !isLive(s)) return null;
  const n = s.fullName ?? s.name, fx = ev.fx ?? {}, patch = {};
  const d = (fx.support ?? 0) + (ev.swing ? (swing || 0) : 0);
  if (d) patch.support = clamp(Math.round(sup(s) + d), 0, 100);
  if (fx.morale) patch.morale = clamp((s.morale ?? 70) + fx.morale, 0, 100);
  if (fx.treasuryF && typeof s.treasury === "number") patch.treasury = Math.round(s.treasury * fx.treasuryF * 100) / 100;
  if (fx.industryF && typeof s.industry === "number") patch.industry = Math.round(s.industry * fx.industryF * 10) / 10;
  const cmd = makeCommand(`出来事（${ev.title}）`, [], [setProps(s, patch)]);
  return withEvent(map, cmd, { type: `natural-${ev.key}`, title: ev.text(n, s, swing), detail: ev.title, date, states: [stateId] });
}
