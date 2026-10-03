// 通貨と為替。各国が自国通貨を持ち、為替レートは経済力から求めた基準値のまわりで現実の相場のように変動する。
//
// ユーザーが決めるのは「固定相場か変動相場か」だけ。レートの値はシステムが決める。
//   ・変動相場(floating): 年次更新ごとに、経済力の基準値へ緩やかに引き戻されつつランダムに揺れる
//   ・固定相場(pegged)  : 基準になる国(pegTo)の通貨に対して一定。基準国のレートに連動する
//
// 保存場所: 国家の currency = { name, code, regime:"floating"|"pegged", pegTo:stateId|null, rate }
//   rate は「共通の価値尺度（1単位 = 世界通貨ユニット）あたり、この国の通貨が何単位か」ではなく、
//   「この通貨1単位の価値（共通尺度）」。A→B の換算は rate(A)/rate(B)。
//
// 純粋ロジック層：DOM に依存しない。

import { makeCommand, setProps } from "../edit/commands.js";

const isLive = (s) => !!s && typeof s === "object" && !s.removed && s.i > 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function defaultCurrency(state) {
  return { name: `${state.name}通貨`, code: String(state.name ?? "XXX").slice(0, 3).toUpperCase(), regime: "floating", pegTo: null, rate: 1 };
}

/** 経済力から求めた「あるべき」価値。産業と人口が大きく、技術が高いほど強い通貨 */
export function fundamentalValue(state) {
  const pop = (state.rural ?? 0) + (state.urban ?? 0);
  const ind = state.industry ?? 0;
  const tech = clamp(state.techLevel ?? 3, 1, 10);
  return Math.max(0.01, Math.log10(10 + ind) * (0.6 + tech * 0.08) * (1 + Math.log10(10 + pop) / 20));
}

export function getCurrency(state) {
  return state.currency ?? defaultCurrency(state);
}

/** 換算: from 国の通貨 amount を to 国の通貨にした額 */
export function convert(map, fromId, toId, amount) {
  const f = getCurrency(map.pack.states[fromId]), t = getCurrency(map.pack.states[toId]);
  return amount * f.rate / Math.max(1e-9, t.rate);
}
/** 1 from 通貨 = ? to 通貨 */
export function exchangeRate(map, fromId, toId) { return convert(map, fromId, toId, 1); }

/** 通貨の名前・記号・体制を設定する。体制の変更では、固定相場にするとき基準国を必ず指定する */
export function planSetCurrency(map, stateId, patch) {
  const st = map.pack.states[stateId];
  if (!isLive(st)) throw new Error("その国家は存在しません");
  const cur = { ...getCurrency(st), ...patch };
  if (!["floating", "pegged"].includes(cur.regime)) throw new Error("相場制は floating か pegged です");
  if (cur.regime === "pegged") {
    if (cur.pegTo == null || cur.pegTo === stateId || !isLive(map.pack.states[cur.pegTo])) throw new Error("固定相場にするには、基準にする別の国を選んでください");
    if (getCurrency(map.pack.states[cur.pegTo]).pegTo === stateId) throw new Error("お互いを基準にすることはできません");
    cur.rate = getCurrency(map.pack.states[cur.pegTo]).rate;
  } else cur.pegTo = null;
  return makeCommand(`通貨の設定（${st.name}）`, [], [setProps(st, { currency: cur })]);
}

/** 年次の為替更新。変動相場は基準値へ引き戻されつつ揺れ、固定相場は基準国に連動する */
export function ratesParts(map, rnd) {
  const parts = [];
  const live = map.pack.states.filter(isLive);
  const fund = new Map(live.map((s) => [s.i, fundamentalValue(s)]));
  const mean = [...fund.values()].reduce((a, b) => a + b, 0) / Math.max(1, fund.size);
  const next = new Map();
  for (const s of live) {
    const c = getCurrency(s);
    if (c.regime === "floating") {
      const target = fund.get(s.i) / mean;
      const pull = (target - c.rate) * 0.25;
      const shock = c.rate * rnd.float(-0.06, 0.06); // 年に±6%程度の相場の揺れ
      next.set(s.i, Math.max(0.01, Math.round((c.rate + pull + shock) * 10000) / 10000));
    }
  }
  for (const s of live) {
    const c = getCurrency(s);
    let rate = next.get(s.i);
    if (c.regime === "pegged") rate = next.get(c.pegTo) ?? getCurrency(map.pack.states[c.pegTo] ?? s).rate;
    if (rate != null && rate !== c.rate) parts.push(setProps(s, { currency: { ...c, rate } }));
  }
  return parts;
}
export function planUpdateRates(map, rnd) {
  const parts = ratesParts(map, rnd);
  return parts.length ? makeCommand("為替レートの更新", [], parts) : null;
}
