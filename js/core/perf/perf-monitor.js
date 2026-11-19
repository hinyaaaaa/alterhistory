// v6.20.0 M5: パフォーマンス監視。仕様 §8。
//   どの機能が重くなったか・メモリがどう増えているかを、アプリの内部で測る。修正の前後の比較・5000 年に着く前の悪化の検知が目的。
//   葉のモジュール（他の core を import しない）。診断データ自体が増え続けないよう、すべてリングバッファ（直近 300〜500 サンプル）。
//   メモリ測定の優先順位: ① performance.measureUserAgentSpecificMemory()（使えるとき。cross-origin isolation が必要）② performance.memory（Chromium・Edge。非標準で粗い補助）。
//   どちらも、単独で合否を判定しない（傾向と警告にだけ使う）。DevTools のヒープスナップショットで保持オブジェクトを確認する、は人の作業として docs に書いた。
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
export class Ring {
  constructor(cap = 400) { this.cap = cap; this.a = []; this.i = 0; }
  push(v) { if (this.a.length < this.cap) this.a.push(v); else { this.a[this.i] = v; this.i = (this.i + 1) % this.cap; } }
  toArray() { return this.a.length < this.cap ? this.a.slice() : this.a.slice(this.i).concat(this.a.slice(0, this.i)); }
  get length() { return this.a.length; }
  clear() { this.a = []; this.i = 0; }
}
export const DOMAIN_OF = Object.freeze({ economy_pop: "人口", culture: "文化", tech: "技術", economy: "経済", politics: "政治", military: "軍事", conflict: "外交・戦争", people: "人物", archive: "アーカイブ", integrity: "整合性検査", climate: "気候", disaster: "災害", ecosystem: "生態系", ai_plan: "国家の計画", apply: "行動の実行", clock: "時計", interventions: "介入", notify: "通知" });
export function createPerfMonitor({ cap = 400 } = {}) {
  const dom = new Map(), samples = new Ring(cap), month = new Ring(cap), alerts = []; let enabled = true, pending = null;
  const d = (k) => { let x = dom.get(k); if (!x) dom.set(k, (x = { n: 0, sum: 0, max: 0, last: 0, ring: new Ring(cap) })); return x; };
  const api = {
    get enabled() { return enabled; }, set enabled(v) { enabled = !!v; },
    /** 区間の測定。performance.mark / measure を使い、すぐ消す（タイムラインに溜めない）。使えなければ now() の差 */
    time(name, fn) { if (!enabled) return fn(); const t0 = now(); try { return fn(); } finally { api.add(name, now() - t0); } },
    mark(name) { if (!enabled) return null; try { performance.mark(`ah:${name}`); } catch { /* 無い環境 */ } return now(); },
    measure(name, t0) { if (!enabled || t0 == null) return 0; let ms = now() - t0; try { const m = performance.measure(`ah:${name}`, `ah:${name}`); ms = m.duration || ms; performance.clearMarks(`ah:${name}`); performance.clearMeasures(`ah:${name}`); } catch { /* 無い環境 */ } api.add(name, ms); return ms; },
    add(name, ms) { if (!enabled) return; const x = d(name); x.n++; x.sum += ms; x.last = ms; if (ms > x.max) x.max = ms; x.ring.push(ms); if (pending) pending[name] = (pending[name] ?? 0) + ms; },
    /** 月の処理の区切り。その月の領域別の合計時間を 1 サンプルとして残す */
    beginMonth() { if (enabled) pending = {}; }, endMonth(monthIndex) { if (!enabled || !pending) return; let total = 0; for (const k in pending) total += pending[k]; month.push({ m: monthIndex, total, ...pending }); pending = null; },
    /** 状態のサンプル（年代・件数・メモリ）。呼ぶ側が間隔を決める（例: 12 か月ごと） */
    async sample(info = {}) { const mem = await api.memory(); const s = { at: Date.now(), ...info, heapMB: mem?.mb ?? null, memSource: mem?.source ?? null }; samples.push(s); api.detect(); return s; },
    async memory() {
      try { if (typeof performance?.measureUserAgentSpecificMemory === "function" && globalThis.crossOriginIsolated) { const r = await performance.measureUserAgentSpecificMemory(); return { mb: r.bytes / 1048576, source: "measureUserAgentSpecificMemory" }; } } catch { /* 次へ */ }
      try { const m = performance?.memory; if (m?.usedJSHeapSize) return { mb: m.usedJSHeapSize / 1048576, source: "performance.memory（粗い補助値）" }; } catch { /* 次へ */ }
      try { if (typeof process !== "undefined" && process.memoryUsage) return { mb: process.memoryUsage().heapUsed / 1048576, source: "process.memoryUsage" }; } catch { /* 次へ */ }
      return null;
    },
    /** 悪化の検知: ① 年代あたりのメモリの増加（直近サンプルの回帰）② 月の処理時間の増加（前半と後半の中央値）。警告は 50 件まで */
    detect() {
      const s = samples.toArray().filter((x) => x.heapMB != null && x.year != null); if (s.length >= 12) { const t = s.slice(-60), n = t.length, mx = t.reduce((a, x) => a + x.year, 0) / n, my = t.reduce((a, x) => a + x.heapMB, 0) / n; let num = 0, den = 0; for (const x of t) { num += (x.year - mx) * (x.heapMB - my); den += (x.year - mx) ** 2; } const slope = den ? (num / den) * 100 : 0; api.slopeMBPerCentury = slope; if (slope > 60 && !api._warnMem) { api._warnMem = true; api.alert("メモリが 100 年あたり約 " + Math.round(slope) + " MB の速さで増えています"); } if (slope <= 60) api._warnMem = false; }
      const m = month.toArray(); if (m.length >= 40) { const med = (a) => { const b = a.map((x) => x.total).sort((p, q) => p - q); return b[b.length >> 1]; }, h = m.length >> 1, a = med(m.slice(0, h)), b = med(m.slice(h)); api.slowdown = a > 0 ? b / a : 1; if (api.slowdown > 2 && !api._warnT) { api._warnT = true; api.alert(`月の処理時間が ${api.slowdown.toFixed(1)} 倍に増えています`); } if (api.slowdown <= 2) api._warnT = false; }
    },
    alert(msg) { alerts.push({ at: Date.now(), msg }); if (alerts.length > 50) alerts.shift(); },
    report() { const out = {}; for (const [k, x] of dom) out[k] = { n: x.n, avg: x.n ? x.sum / x.n : 0, max: x.max, last: x.last, recent: avgOf(x.ring.toArray()) }; return { domains: out, samples: samples.toArray(), months: month.toArray(), alerts: alerts.slice(), slopeMBPerCentury: api.slopeMBPerCentury ?? null, slowdown: api.slowdown ?? null }; },
    reset() { dom.clear(); samples.clear(); month.clear(); alerts.length = 0; pending = null; api._warnMem = api._warnT = false; api.slopeMBPerCentury = api.slowdown = null; },
  };
  return api;
}
const avgOf = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const perf = createPerfMonitor();
