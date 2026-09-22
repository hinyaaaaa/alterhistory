// シード付き乱数（Mulberry32）。同じシードなら同じマップを再現できる。
// 純粋ロジック層：DOM・ファイルI/Oに依存しない。

export function createRandom(seed) {
  let s = normalizeSeed(seed);

  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** [0, 1) の実数 */
    next,
    /** [min, max] の整数 */
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    /** [min, max) の実数 */
    float: (min, max) => next() * (max - min) + min,
    /** 確率 p で true */
    chance: (p) => next() < p,
    /** 配列から1つ選ぶ */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** 重み付き選択。weights は arr と同じ長さ */
    weighted(arr, weights) {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= weights[i];
        if (r <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    },
    /** 新しい配列を返すシャッフル（入力は変更しない） */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  // 文字列シードはハッシュ化（Azgaarのseedは数字文字列）
  const str = String(seed ?? Date.now());
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
