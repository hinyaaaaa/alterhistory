// v6.20.0 M1: 月次トランザクション（差分型の取り消し点）。
//   葉のモジュール（他の core を import しない）。clock.js と contract.js の両方から使う（v6.19.0 まで clock.js → contract.js の循環 import があり、
//   バンドルの評価順によっては registerDecision が未初期化で起動に失敗した。この葉に切り出して循環を断った）。
//
//   旧方式（checkpointFull）は、取り消し点のたびに civ の events・works 以外をすべて structuredClone していた。archive・figures・languages・wars など、
//   歴史が増えるほど大きくなる記録まで複製するため、取り消し点のコストが年代に比例して増えていた（基準測定 docs/V6_20_0_BASELINE.md）。
//
//   新方式は 3 つの層を使い分ける。
//     ① 追記専用（events・works）: 長さだけを覚える（従来どおり）。
//     ② 休眠した要素（COLD）: 国家・人物・戦争・条約のうち「月の途中では書かれない」要素は、複製せず参照を共有する。複製するのは「動いている要素」だけ。
//     ③ 外部化の対象（SHARED = archive）: 参照を共有する。書き換わるのは安全な境界（commitArchive）だけで、その書き込みは WriteJournal 経由（原子的）。
//   COLD の書き込みが「月の途中」で起きないことは、約束だけでなく検証する（guard モード: 取り消し点と取り消しのときに休眠要素の指紋を比べ、書き込まれていたら例外）。
//   月の途中で休眠要素へ書く正当な処理（コンパクション）は、WriteJournal（tx.set / tx.delete）を通す。journal は、書く直前の値を最初の 1 回だけ記録し、逆順に戻す。
//
//   完成条件（仕様 §2）: 失敗した月の途中状態が一切残らない。tests/v620-transaction.test.mjs が、途中で失敗させて、全体の指紋が元に戻ることを確かめる。

import { perf } from "../perf/perf-monitor.js";
const ABSENT = Symbol("absent");
const isObj = (v) => v !== null && typeof v === "object";
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** 書き込み記録（Write Journal）。変更前の値は、同じ (オブジェクト, キー) につき最初の 1 回だけ記録する */
export class WriteJournal {
  constructor() { this.props = new Map(); this.orders = new Map(); this.arrays = new Map(); this.writes = 0; }
  get size() { return this.writes; }
  _order(o) { if (!this.orders.has(o)) this.orders.set(o, Object.keys(o)); }
  _rec(o, k) { let m = this.props.get(o); if (!m) this.props.set(o, (m = new Map())); if (!m.has(k)) { const had = hasOwn(o, k); if (!had) this._order(o); m.set(k, had ? o[k] : ABSENT); } }
  _arr(a, mutating) {
    let r = this.arrays.get(a); if (!r) this.arrays.set(a, (r = { len: a.length, copy: null }));
    if (mutating && !r.copy) r.copy = a.slice(0, r.len); // 途中の追記を除いた元の内容
  }
  /** obj[key] = value（配列の添字への代入も可） */
  set(o, k, v) { this.writes++; if (Array.isArray(o)) { this._arr(o, true); o[k] = v; return v; } this._rec(o, k); o[k] = v; return v; }
  delete(o, k) { if (!hasOwn(o, k)) return false; this.writes++; this._order(o); this._rec(o, k); return delete o[k]; }
  push(a, ...v) { this.writes++; this._arr(a, false); return a.push(...v); }
  splice(a, ...args) { this.writes++; this._arr(a, true); return a.splice(...args); }
  assign(o, patch) { for (const k of Object.keys(patch)) this.set(o, k, patch[k]); return o; }
  /** 逆順に戻す（ここでは、キーごとに最初の値だけを持っているので、順序によらず元の状態へ戻る） */
  rollback() {
    for (const [a, r] of this.arrays) { if (r.copy) { a.length = 0; for (const x of r.copy) a.push(x); } else a.length = r.len; }
    for (const [o, m] of this.props) for (const [k, old] of m) { if (old === ABSENT) delete o[k]; else o[k] = old; }
    for (const [o, keys] of this.orders) { const cur = Object.keys(o); let same = cur.length === keys.length; if (same) for (let i = 0; i < keys.length; i++) if (cur[i] !== keys[i]) { same = false; break; } if (same) continue; const vals = keys.map((k) => o[k]); for (const k of cur) delete o[k]; keys.forEach((k, i) => { o[k] = vals[i]; }); } // キーの順序も戻す（Object.keys の順序に決定性が依存する）
    this.clear();
  }
  /** 確定: 記録を捨てる */
  commit() { this.clear(); }
  clear() { this.props.clear(); this.orders.clear(); this.arrays.clear(); this.writes = 0; }
}
/** journal を持たない（記録しない）書き込み。tx が無いとき（試験・直接の進行）の同じ形の API */
export const DIRECT = Object.freeze({
  set(o, k, v) { o[k] = v; return v; }, delete(o, k) { return delete o[k]; }, push(a, ...v) { return a.push(...v); }, splice(a, ...x) { return a.splice(...x); }, assign(o, p) { return Object.assign(o, p); },
});
/** ctx から書き込み API を得る（月次トランザクション中なら journal、そうでなければ直接） */
export const writerOf = (ctx) => ctx?.tx?.journal ?? DIRECT;

// ---- 差分型の取り消し点
export const APPEND_ONLY = Object.freeze(["events", "works"]);
export const SHARED = Object.freeze(["archive"]);
/** 休眠した要素の判定。true なら、月の途中では書かれない（複製せず参照を共有する）。引数 c は取り消し点ごとに 1 回だけ作る補助情報 */
export const COLD = {
  states: (s) => s.alive === false && s.compacted === true,
  figures: (f, c) => f.diedAt != null && !c.pinnedFigures.has(f.id) && f.compacted === true,
  wars: (w) => w.status === "ended" && w.ops == null,
  treaties: (t) => t.active === false,
};
const aux = (civ) => { const pinned = new Set(); for (const id in civ.states) { const s = civ.states[id]; if (s.alive) { if (s.leaderFigureId) pinned.add(s.leaderFigureId); if (s.heirFigureId) pinned.add(s.heirFigureId); } } return { pinnedFigures: pinned }; };

let GUARD = false;
/** guard モード（試験用）: 休眠要素の書き込みを、指紋の比較で検出する。本番では false（指紋の計算が重い） */
export const setTxGuard = (on) => { GUARD = !!on; };
export const txGuard = () => GUARD;
const fp = (x) => { const s = JSON.stringify(x); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) + ":" + s.length; };

/** 取り消し点を作る。keys を渡すと、そのキーだけ（命令用の軽い取り消し点） */
export function takeCheckpoint(civ, { keys = null } = {}) {
  const order = Object.keys(civ), cp = { order, lens: {}, whole: {}, shared: {}, coll: {}, keysOnly: !!keys, absent: keys ? keys.filter((k) => !(k in civ)) : [], stats: { cloned: 0, shared: 0 } }, c = aux(civ);
  for (const k of order) {
    if (keys && !keys.includes(k)) continue;
    const v = civ[k];
    if (APPEND_ONLY.includes(k) && Array.isArray(v)) cp.lens[k] = v.length;
    else if (SHARED.includes(k)) cp.shared[k] = v;
    else if (COLD[k] && isObj(v) && !Array.isArray(v)) {
      const ks = Object.keys(v), hot = {}, cold = {}; let nc = 0;
      for (const id of ks) { const e = v[id]; if (isObj(e) && COLD[k](e, c)) { cold[id] = e; nc++; } else hot[id] = e; }
      cp.coll[k] = { keys: ks, cold, hot: structuredClone(hot) }; cp.stats.shared += nc; cp.stats.cloned += ks.length - nc;
      if (GUARD) cp.coll[k].sig = Object.fromEntries(Object.entries(cold).map(([id, e]) => [id, fp(e)]));
    } else { cp.whole[k] = structuredClone(v); cp.stats.cloned++; }
  }
  return cp;
}
/** 休眠要素への書き込みを検出する（guard モードのみ）。journal を戻したあとに呼ぶ: 戻したのに指紋が違えば、journal を通さない書き込みがあった */
export function verifyCold(civ, cp) {
  if (!GUARD) return; for (const k in cp.coll) { const sig = cp.coll[k].sig; if (!sig) continue; for (const id in sig) { const e = cp.coll[k].cold[id]; if (fp(e) !== sig[id]) throw new Error(`休眠した要素 ${k}.${id} が月の途中で書き換えられた（journal を通していない）`); } }
}
/** 取り消し点へ戻す。civ の最上位の入れ物（states・groups など）は同じオブジェクトのまま中身を戻す（外から持っている参照が切れない）。キーの順序も元どおり */
export function restoreCheckpoint(civ, cp) {
  for (const k of Object.keys(cp.lens)) if (Array.isArray(civ[k])) civ[k].length = cp.lens[k];
  const keep = {}; for (const k of Object.keys(cp.lens)) keep[k] = civ[k];
  const full = !cp.keysOnly; for (const k of cp.absent ?? []) delete civ[k];
  if (full) for (const k of Object.keys(civ)) if (!(k in cp.lens) && !(k in cp.shared) && !(k in cp.whole) && !(k in cp.coll)) { /* 取り消し点より後に増えたキー */ delete civ[k]; }
  for (const k of cp.order) {
    if (k in cp.lens) { civ[k] = keep[k]; continue; }
    if (k in cp.shared) { civ[k] = cp.shared[k]; continue; }
    if (k in cp.coll) {
      const c = cp.coll[k], cur = civ[k], hot = structuredClone(c.hot); let target = cur;
      if (!isObj(target) || Array.isArray(target)) { target = {}; civ[k] = target; } else for (const x of Object.keys(target)) delete target[x];
      for (const id of c.keys) target[id] = id in c.cold ? c.cold[id] : hot[id]; continue;
    }
    if (!(k in cp.whole)) continue; // keys を絞った取り消し点で、対象外のキー
    const src = structuredClone(cp.whole[k]), cur = civ[k];
    if (Array.isArray(cur) && Array.isArray(src)) { cur.length = 0; for (const x of src) cur.push(x); } else if (isObj(cur) && isObj(src) && !Array.isArray(cur)) { for (const x of Object.keys(cur)) delete cur[x]; Object.assign(cur, src); } else civ[k] = src;
  }
  if (full) { /* キーの順序: civ の最上位のキーの並びも、取り消し点のとおりに戻す */ const cur = Object.keys(civ); let same = cur.length === cp.order.length; if (same) for (let i = 0; i < cur.length; i++) if (cur[i] !== cp.order[i]) { same = false; break; } if (!same) { const vals = {}; for (const k of cp.order) if (k in civ) vals[k] = civ[k]; for (const k of Object.keys(civ)) delete civ[k]; for (const k of cp.order) if (k in vals) civ[k] = vals[k]; } }
}

/** 月次トランザクション。begin → （月の処理）→ commit か rollback。rollback は w を取り消し点へ戻し、sim を作り直す */
export class MonthTransaction {
  constructor(w, { keys = null } = {}) {
    this.w = w; this.journal = new WriteJournal(); this.t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    this.cp = takeCheckpoint(w.civ, { keys }); this.ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - this.t0; this.open = true; perf.add("取り消し点の生成", this.ms);
    if (w.sim?.ctx) w.sim.ctx.tx = this;
  }
  /** 確定: 取り消し点と journal を捨てる（成功した月のために、文明全体の複製を持ち続けない） */
  commit() { if (!this.open) return; const t0 = perf.mark("tx.commit"); this.journal.commit(); this.release(); perf.measure("tx.commit", t0); }
  /** 巻き戻し: journal を戻し、複製した動いている要素を戻す。休眠要素は触らない */
  rollback() {
    if (!this.open) return; const t0 = perf.mark("tx.rollback"); this.journal.rollback(); try { verifyCold(this.w.civ, this.cp); } finally { restoreCheckpoint(this.w.civ, this.cp); this.release(true); this.w.rebuild?.(); perf.measure("tx.rollback", t0); }
  }
  release(rebuilt = false) { this.open = false; if (!rebuilt && this.w.sim?.ctx?.tx === this) this.w.sim.ctx.tx = null; this.cp = null; }
  /** 取り消し点を保ったまま、もう一度同じ状態へ戻す（決定的な再現: 失敗した月を探すために同じ点から何度か進める） */
  restoreAgain() { this.journal.rollback(); verifyCold(this.w.civ, this.cp); restoreCheckpoint(this.w.civ, this.cp); this.w.rebuild?.(); if (this.w.sim?.ctx) this.w.sim.ctx.tx = this; }
}
export const beginMonth = (w, opts) => new MonthTransaction(w, opts);

/** 互換 API（v6.19.0 の checkpointFull / restoreInto）。取り消し点を作る・戻す。戻したあとも同じ点へ何度でも戻せる */
export const checkpointFull = (civ) => takeCheckpoint(civ);
export function restoreInto(w, snap) { restoreCheckpoint(w.civ, snap); w.rebuild?.(); }
