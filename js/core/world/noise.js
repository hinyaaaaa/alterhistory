// 決定的な乱数と、球面上の 3 次元ノイズ（v4.0.0）。Math.random を使わない。
/** 文字列 → 32bit 整数（xmur3） */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
/** 種から作る乱数列（mulberry32）。段階ごとに別の名前で作り、段階どうしが影響しないようにする */
export function makeRng(seedStr, stage = "") {
  let a = hashString(`${seedStr}::${stage}`);
  const next = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
  next.unitVec = () => { const z = next.range(-1, 1), t = next.range(0, 2 * Math.PI), r = Math.sqrt(1 - z * z); return [r * Math.cos(t), r * Math.sin(t), z]; };
  return next;
}
function hash3(seed, x, y, z) {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
/** 3 次元の値ノイズ 0〜1 */
export function valueNoise3(seed, x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
  const c000 = hash3(seed, xi, yi, zi), c100 = hash3(seed, xi + 1, yi, zi), c010 = hash3(seed, xi, yi + 1, zi), c110 = hash3(seed, xi + 1, yi + 1, zi);
  const c001 = hash3(seed, xi, yi, zi + 1), c101 = hash3(seed, xi + 1, yi, zi + 1), c011 = hash3(seed, xi, yi + 1, zi + 1), c111 = hash3(seed, xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx, x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}
/** フラクタルノイズ 0〜1（概ね 0.5 中心） */
export function fbm3(seed, x, y, z, octaves = 4, freq = 1, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = freq;
  for (let o = 0; o < octaves; o++) { sum += amp * valueNoise3(seed + o * 101, x * f, y * f, z * f); norm += amp; amp *= gain; f *= 2.03; }
  return sum / norm;
}

/** fbm3 と同じ値を返す、格子点ハッシュのキャッシュつき版。隣り合うセルは同じ格子の立方体に入ることが多いので、直前の 8 隅を再利用する */
export function makeFbm3(seed, octaves = 4, freq = 1, gain = 0.5) {
  const O = octaves, kx = new Int32Array(O).fill(2147483647), ky = new Int32Array(O), kz = new Int32Array(O), cv = new Float64Array(O * 8), fs = new Float64Array(O), sd = new Int32Array(O);
  let f = freq, norm = 0, amp = 1; const amps = new Float64Array(O);
  for (let o = 0; o < O; o++) { fs[o] = f; sd[o] = seed + o * 101; amps[o] = amp; norm += amp; amp *= gain; f *= 2.03; }
  return (x, y, z) => {
    let sum = 0;
    for (let o = 0; o < O; o++) {
      const X = x * fs[o], Y = y * fs[o], Z = z * fs[o], xi = Math.floor(X), yi = Math.floor(Y), zi = Math.floor(Z), b = o * 8;
      if (xi !== kx[o] || yi !== ky[o] || zi !== kz[o]) {
        const s0 = sd[o]; kx[o] = xi; ky[o] = yi; kz[o] = zi;
        cv[b] = hash3(s0, xi, yi, zi); cv[b + 1] = hash3(s0, xi + 1, yi, zi); cv[b + 2] = hash3(s0, xi, yi + 1, zi); cv[b + 3] = hash3(s0, xi + 1, yi + 1, zi);
        cv[b + 4] = hash3(s0, xi, yi, zi + 1); cv[b + 5] = hash3(s0, xi + 1, yi, zi + 1); cv[b + 6] = hash3(s0, xi, yi + 1, zi + 1); cv[b + 7] = hash3(s0, xi + 1, yi + 1, zi + 1);
      }
      const fx = fade(X - xi), fy = fade(Y - yi), fz = fade(Z - zi);
      const x00 = cv[b] + (cv[b + 1] - cv[b]) * fx, x10 = cv[b + 2] + (cv[b + 3] - cv[b + 2]) * fx, x01 = cv[b + 4] + (cv[b + 5] - cv[b + 4]) * fx, x11 = cv[b + 6] + (cv[b + 7] - cv[b + 6]) * fx;
      const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
      sum += amps[o] * (y0 + (y1 - y0) * fz);
    }
    return sum / norm;
  };
}
