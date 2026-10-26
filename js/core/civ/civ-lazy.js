// v5.2: 文明履歴の遅延読み込み（読み取り専用）。保存されたチャンク（civ-chunks.js の形式）から、必要な期間・対象だけを取り出す。
//   - イベント・判断記録: 100 年ごとの期間チャンクを、要求された月の範囲にかかるものだけ JSON.parse する（LRU で最近のものだけ保持）。
//   - 月次履歴: 索引（JSON）だけを読み、系列は Float64 の領域への「見え方」（コピーしない TypedArray）にする。
//       stateAt / groupsAt などの復元関数は、そのまま使える（at() は添字と length だけを使う）。
//   履歴を削除・要約しない（正本は保存データのまま）。ここは「全件を JS オブジェクトに展開して常駐させる」ことを避けるための読み方。
//   書き込みはできない（過去閲覧中は読み取り専用という仕様と同じ）。現在進行中の記録は、従来の civ.history（可変の配列）が行う。
import { PERIOD_MONTHS, PREFIX } from "./civ-chunks.js";
import { migrateCiv, CIV_STATE_VERSION } from "./civ-state.js";

const dec = new TextDecoder();
const keyNum = (s) => (s[0] === "n" ? -1 : 1) * Number(s.slice(1));
const evMi = (e) => e.date.year * 12 + e.date.month - 1;

/** 履歴の索引＋データ領域から、コピーなしの読み取り専用の履歴（H）を作る。H.states[id].f[k] は Float64Array の部分領域 */
export function historyView(indexBytes, dataBytes) {
  const ix = JSON.parse(dec.decode(indexBytes));
  const buf = dataBytes.byteOffset % 8 === 0 ? dataBytes : dataBytes.slice();
  const data = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8), H = { v: ix.v, dict: ix.dict, states: {}, groups: {}, last: ix.last, readOnly: true };
  let o = 0;
  for (const [kind, id, from, fields] of ix.ents) { const f = {}; for (const [k, n] of fields) { f[k] = data.subarray(o, o + n); o += n; } (kind === "s" ? H.states : H.groups)[id] = { from, f }; }
  if (o !== data.length) throw new Error("履歴データの長さが合いません");
  return H;
}

/**
 * @param {(name:string)=>Uint8Array|undefined} get  拡張チャンクの取得
 * @param {string[]} names  拡張チャンク名の一覧
 * @param {{cachePeriods?:number}} [opts]
 */
export function openCivChunks(get, names, { cachePeriods = 4 } = {}) {
  const raw = get("civ.state"); if (!raw) throw new Error("文明状態が見つかりません");
  const core = JSON.parse(dec.decode(raw)); if (!core || typeof core.version !== "number") throw new Error("文明状態が壊れています");
  if (core.version > CIV_STATE_VERSION) throw new Error(`新しすぎる文明状態の版です（${core.version}）`);
  if (!core.chunked) throw new Error("旧形式（チャンクなし）の文明状態は遅延読み込みできません（decodeCivChunks で読んでください）");
  const periodNames = (kind) => names.filter((n) => n.startsWith(`${PREFIX}${kind}.`)).sort((a, b) => keyNum(a.split(".").pop()) - keyNum(b.split(".").pop()));
  const periodOf = (n) => keyNum(n.split(".").pop());
  const cache = new Map(), stats = { parsedChunks: 0, cacheHits: 0 };
  const load = (name) => { // LRU
    if (cache.has(name)) { const v = cache.get(name); cache.delete(name); cache.set(name, v); stats.cacheHits++; return v; }
    const arr = JSON.parse(dec.decode(get(name))); stats.parsedChunks++; cache.set(name, arr);
    while (cache.size > cachePeriods) cache.delete(cache.keys().next().value);
    return arr;
  };
  const between = (kind, m0, m1) => {
    const k0 = Math.floor(m0 / PERIOD_MONTHS), k1 = Math.floor(m1 / PERIOD_MONTHS), out = [];
    for (const n of periodNames(kind)) { const k = periodOf(n); if (k < k0 || k > k1) continue; for (const x of load(n)) { const m = evMi(x); if (m >= m0 && m <= m1) out.push(x); } }
    return out;
  };
  const counts = { events: core.chunked.events, decisions: core.chunked.decisions };
  let hist = null;
  return {
    /** 核（civ.state）。events / decisions / history は含まない */
    core: (() => { const { chunked, ...rest } = core; return migrateCiv({ ...rest, events: [], decisions: [] }); })(),
    counts,
    /** 月 m0〜m1（両端を含む）のイベント・判断記録。かかる期間のチャンクだけを読む */
    eventsBetween: (m0, m1) => between("events", m0, m1),
    decisionsBetween: (m0, m1) => between("decisions", m0, m1),
    /** 月次履歴の読み取り専用の見え方（初回に索引だけ読む） */
    history() { if (!hist && core.chunked.history) { const i = get("civ.history.index"), d = get("civ.history.data"); if (!i || !d) throw new Error("月次履歴のチャンクが見つかりません"); hist = historyView(i, d); } return hist; },
    /** 期間チャンクの一覧（月の範囲・バイト数）。UI の遅延読み込みや容量の見積もりに使う */
    periods: () => ["events", "decisions"].flatMap((kind) => periodNames(kind).map((n) => ({ kind, name: n, fromMonth: periodOf(n) * PERIOD_MONTHS, toMonth: (periodOf(n) + 1) * PERIOD_MONTHS - 1, bytes: get(n).length }))),
    /** 全件を数える（件数の整合検査。全期間を 1 つずつ読み、すぐ捨てる） */
    verifyCounts() { let e = 0, d = 0; for (const n of periodNames("events")) e += JSON.parse(dec.decode(get(n))).length; for (const n of periodNames("decisions")) d += JSON.parse(dec.decode(get(n))).length; return { events: e, decisions: d, ok: e === counts.events && d === counts.decisions }; },
    stats: () => ({ ...stats, cachedPeriods: cache.size }),
    evict: () => cache.clear(),
  };
}
