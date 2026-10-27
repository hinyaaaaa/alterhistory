// v5.3 UI: 大規模な歴史のための増分インデックス（DOM なし・純粋なデータ処理）。
//   「どんなに年・国・戦争が積もっても、画面の応答が件数に比例しない」ための土台（docs/UI_SCALE_DESIGN.md §1 原則 4「集計は先に作る」）。
//   ・正本は civ.events（追記専用の配列）。ここは索引だけで、保存しない。events の末尾に増えた分だけを取り込む（毎回の全走査をしない）
//   ・表示のための絞り込み・件数・ページ取得・年表の目印の集計だけを担当する。イベントの削除・要約・間引きは一切しない
//   ・civ が差し替わった／events が縮んだ／末尾の要素が変わった場合は、次の問い合わせで作り直す
import { evMonth, graphIndex } from "../../core/civ/graph.js";

/** 昇順の数値配列で、x 以上になる最初の添字（x 未満の件数）。arr は配列でも型付き配列でもよい */
export function lowerBound(arr, x, hi = arr.length) { let lo = 0; while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; } return lo; }

const YEAR = (m) => Math.floor(m / 12);

/**
 * @param classify (kind) => { id, tone }   出来事の種類 → 表示上の分類（categories.js の categoryOf）
 * @param isKey    (kind) => boolean         年表の目印にする種類
 * @param sliceMs  検索の 1 回あたりの走査時間の上限（ミリ秒）。超えたら pending を返し、続きは次の問い合わせで進める
 * @param maxQueries 検索結果の保持数（古いものから捨てる。再計算できる）
 */
export function createEventIndex({ classify, isKey, sliceMs = 8, maxQueries = 6, clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) }) {
  let civ = null, eventsRef = null, n = 0, last = null, monotone = true, lastMonth = -Infinity;
  let months = new Int32Array(4096);
  const byCat = new Map();       // 分類 id → 位置（昇順）
  let keyPos = [];               // 年表の目印にする出来事の位置（昇順）
  let dprefix = [0];             // 目印のうち「危険」な種類の累積件数（dprefix[k] = 先頭 k 件の目印の中の件数）。区間の危険の有無を O(1) で出す
  let queries = new Map();       // 検索の状態（LRU）

  function reset() {
    n = 0; last = null; monotone = true; lastMonth = -Infinity; months = new Int32Array(4096);
    byCat.clear(); keyPos = []; dprefix = [0]; queries = new Map();
  }

  /** civ.events の増えた分だけ取り込む。戻り値は現在の件数 */
  function sync(c) {
    const E = c?.events;
    if (!E) { civ = null; eventsRef = null; reset(); return 0; }
    if (c !== civ || E !== eventsRef || n > E.length || (n > 0 && E[n - 1] !== last)) { civ = c; eventsRef = E; reset(); }
    if (n === E.length) return n;
    if (E.length > months.length) { const m2 = new Int32Array(Math.max(Math.ceil(E.length * 1.25), months.length * 2)); m2.set(months.subarray(0, n)); months = m2; } // 余裕を持って確保（増分のたびに作り直さない）
    for (; n < E.length; n++) {
      const e = E[n], m = evMonth(e); months[n] = m;
      if (m < lastMonth) monotone = false; else lastMonth = m;
      const c2 = classify(e.kind); let arr = byCat.get(c2.id); if (!arr) byCat.set(c2.id, arr = []); arr.push(n);
      if (isKey(e.kind)) { keyPos.push(n); dprefix.push(dprefix[dprefix.length - 1] + (c2.tone === "danger" ? 1 : 0)); }
    }
    last = E[n - 1] ?? null;
    return n;
  }

  /** 月 m 以前の出来事の件数（先頭からの連続範囲）。月が単調でない（異常）ときは数えて求める */
  function countUpTo(m) {
    if (m == null) return n;
    if (monotone) return lowerBound(months, m + 1, n);
    let k = 0; for (let i = 0; i < n; i++) if (months[i] <= m) k = i + 1; return k;
  }
  const countFrom = (m) => (m == null ? 0 : monotone ? lowerBound(months, m, n) : 0);

  // 位置の配列 arr の、[lo, hi) の位置に入る範囲を [a, b) で返す（arr の添字）
  const rangeIn = (arr, lo, hi) => [lowerBound(arr, lo), lowerBound(arr, hi)];

  /** 検索（タイトルの部分一致）・分類・関与者を組み合わせた結果の位置（昇順）。時間を区切って走査し、続きは次の呼び出しで進める */
  function matcher(key, base, pred) {
    let st = queries.get(key);
    if (st) { queries.delete(key); queries.set(key, st); } else {
      st = { pos: [], k: 0 }; queries.set(key, st);
      if (queries.size > maxQueries) queries.delete(queries.keys().next().value);
    }
    const E = civ.events, len = base ? base.length : n, t0 = clock();
    while (st.k < len) {
      const lim = Math.min(len, st.k + 48); // 小刻みに時間を確かめる（非 ASCII の部分一致は 1 件あたりが重いことがある）
      for (; st.k < lim; st.k++) { const p = base ? base[st.k] : st.k; if (p < n && pred(E[p])) st.pos.push(p); }
      if (clock() - t0 > sliceMs) break;
    }
    return { st, pending: st.k < len };
  }

  /**
   * 出来事のページ（新しい順）。
   * @param opts { entityId, cat, query, view /*見ている月（null=現在）*\/, since /*この月以降*\/, offset, limit }
   * @returns { total, rows: Event[], pending }   pending=true のときは検索がまだ途中（total はそこまでの件数。続きは同じ呼び出しで進む）
   */
  function page(c, { entityId = null, cat = "", query = "", view = null, since = null, offset = 0, limit = 40 } = {}) {
    sync(c);
    const E = c.events, q = (query ?? "").trim();
    const hi = countUpTo(view), lo = Math.min(hi, countFrom(since));
    let base = null;
    if (entityId) base = graphIndex(c).byEntity.get(entityId) ?? [];
    else if (cat) base = byCat.get(cat) ?? [];
    const needScan = q || (entityId && cat);
    let arr = base, pending = false;
    if (needScan) {
      const pred = (e) => (!cat || classify(e.kind).id === cat) && (!q || e.title.includes(q));
      const r = matcher(`${entityId ?? ""}|${cat}|${q}`, base, pred); arr = r.st.pos; pending = r.pending;
    }
    let total, at;
    if (arr) { const [a, b] = rangeIn(arr, lo, hi); total = b - a; at = (i) => arr[b - 1 - i]; }
    else { total = hi - lo; at = (i) => hi - 1 - i; }
    const rows = []; for (let i = offset; i < Math.min(total, offset + limit); i++) rows.push(E[at(i)]);
    return { total, rows, pending };
  }

  /**
   * 年表の目印を、buckets 個以内の区間に束ねて返す（月 from〜to）。区間の境界ごとに二分探索で件数を数える（O(区間数 × log 件数)。範囲の広さ・件数に依らない）。
   * @returns [{ index, n, danger, month, pos }]  index は 0..buckets-1。month は区間の先頭の目印の月、pos はその出来事の位置
   */
  function bandBuckets(c, { from, to, buckets = 160 }) {
    sync(c);
    const span = Math.max(1, to - from), nb = Math.max(1, Math.min(buckets, span)), out = [];
    if (!monotone) { // 異常データの保険（月が単調でない）。全走査で束ねる
      const m = new Map();
      for (let i = 0; i < keyPos.length; i++) { const p = keyPos[i], mo = months[p]; if (mo < from || mo > to) continue; const k = Math.min(nb - 1, Math.floor(((mo - from) / span) * nb)), b = m.get(k) ?? { index: k, n: 0, danger: false, month: mo, pos: p }; b.n++; if (dprefix[i + 1] - dprefix[i] > 0) b.danger = true; if (mo < b.month) { b.month = mo; b.pos = p; } m.set(k, b); }
      return [...m.values()].sort((x, y) => x.index - y.index);
    }
    // 区間 i は、月が from + ceil(i·span/nb) 以上、次の区間の開始未満（最後の区間は to を含む）
    const edge = (i) => (i >= nb ? to + 1 : from + Math.ceil((i * span) / nb));
    let A = lowerBoundBy(keyPos, edge(0));
    for (let i = 0; i < nb; i++) {
      const B = lowerBoundBy(keyPos, edge(i + 1)); // 区間の外へ出る最初の添字
      if (B > A) out.push({ index: i, n: B - A, danger: dprefix[B] - dprefix[A] > 0, month: months[keyPos[A]], pos: keyPos[A] });
      A = B;
    }
    return out;
  }
  // keyPos（出来事の位置）の中で、その出来事の月が m 以上になる最初の添字
  function lowerBoundBy(posArr, m) { let lo = 0, hi = posArr.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (months[posArr[mid]] < m) lo = mid + 1; else hi = mid; } return lo; }

  /** 目印の出来事（古い順）を最大 limit 件。従来の adapter.band と同じ用途（範囲が狭いとき・小さな世界のとき） */
  function keyEvents(c, { from, to, limit = 200 }) {
    sync(c); const out = [], E = c.events;
    for (let i = lowerBoundBy(keyPos, from); i < keyPos.length && out.length < limit; i++) { const p = keyPos[i]; if (months[p] > to) break; out.push(E[p]); }
    return out;
  }

  return { sync, page, bandBuckets, keyEvents, total: () => n, isMonotone: () => monotone, counts: () => ({ events: n, categories: byCat.size, keyEvents: keyPos.length, queries: queries.size }), categoryTotal: (id) => byCat.get(id)?.length ?? 0 };
}
