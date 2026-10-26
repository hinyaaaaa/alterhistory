// 空間索引：座標から最も近いセルを高速に探す（マウスホバー用）。
// 純粋ロジック（DOM 非依存）。

/**
 * @param {Array<[number,number]>} points  セルの点（添字がセルID）
 * @param {number} bucket  格子の1辺（ワールド座標）
 */
export function createCellIndex(points, bucket = 16, wrapW = 0) {
  // wrapW > 0: 経度の継ぎ目で折り返す世界（幅 wrapW）。継ぎ目をまたぐ検索（ホバー・ブラシ）が反対側のセルも拾う
  let maxX = 0, maxY = 0;
  for (const [x, y] of points) { if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  const cols = Math.floor(maxX / bucket) + 1;
  const rows = Math.floor(maxY / bucket) + 1;
  const buckets = Array.from({ length: cols * rows }, () => []);
  points.forEach(([x, y], id) => buckets[Math.floor(y / bucket) * cols + Math.floor(x / bucket)].push(id));

  const index = {
    /** 中心が (x, y) から半径 r 以内にあるセルの ID の配列（ブラシ用） */
    _within(x, y, r) {
      const out = [];
      const r2 = r * r;
      const gx0 = Math.max(0, Math.floor((x - r) / bucket)), gx1 = Math.min(cols - 1, Math.floor((x + r) / bucket));
      const gy0 = Math.max(0, Math.floor((y - r) / bucket)), gy1 = Math.min(rows - 1, Math.floor((y + r) / bucket));
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          for (const id of buckets[gy * cols + gx]) {
            const dx = points[id][0] - x, dy = points[id][1] - y;
            if (dx * dx + dy * dy <= r2) out.push(id);
          }
        }
      }
      return out;
    },

    /** 最も近いセルの ID。点が1つも無ければ -1 */
    _find(x, y) {
      if (!points.length) return -1;
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / bucket)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / bucket)));
      let best = -1, bestD = Infinity;
      const maxR = Math.max(cols, rows);
      for (let r = 0; r <= maxR; r++) {
        // 外側のリングに進んでも、これ以上近い点は無い、という条件で打ち切る
        if (best !== -1 && (r - 1) * bucket > Math.sqrt(bestD)) break;
        for (let gy = cy - r; gy <= cy + r; gy++) {
          for (let gx = cx - r; gx <= cx + r; gx++) {
            if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue; // リング上のみ
            if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
            for (const id of buckets[gy * cols + gx]) {
              const dx = points[id][0] - x, dy = points[id][1] - y;
              const d = dx * dx + dy * dy;
              if (d < bestD) { bestD = d; best = id; }
            }
          }
        }
      }
      return best;
    },
  };
  const wd = (a, b) => { let d = Math.abs(a - b); if (wrapW && d > wrapW / 2) d = wrapW - d; return d; };
  return {
    findWithin(x, y, r) {
      const out = index._within(x, y, r);
      if (!wrapW) return out;
      const seen = new Set(out);
      if (x - r < 0) for (const id of index._within(x + wrapW, y, r)) if (!seen.has(id)) { seen.add(id); out.push(id); }
      if (x + r > wrapW) for (const id of index._within(x - wrapW, y, r)) if (!seen.has(id)) { seen.add(id); out.push(id); }
      return out;
    },
    find(x, y) {
      let best = index._find(x, y);
      if (!wrapW || best < 0) return best;
      let bd = Math.hypot(wd(points[best][0], x), points[best][1] - y);
      for (const xx of [x + wrapW, x - wrapW]) {
        if (xx < -bucket * 4 || xx > wrapW + bucket * 4) continue;
        const c = index._find(xx, y); if (c < 0) continue;
        const d = Math.hypot(wd(points[c][0], x), points[c][1] - y); if (d < bd) { bd = d; best = c; }
      }
      return best;
    },
  };
}

const indexCache = new WeakMap(); // geometry → 索引
/** 地図のセル索引（形状ごとに1つだけ作って使い回す） */
export function cellIndexOf(map) {
  let idx = indexCache.get(map.geometry);
  if (!idx) { idx = createCellIndex(map.geometry.pack.p, 16, map.meta?.height * 2 === map.meta?.width ? map.meta.width : 0); indexCache.set(map.geometry, idx); }
  return idx;
}
