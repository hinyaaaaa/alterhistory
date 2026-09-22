// 問い合わせ：セルや実体（国家・文化…）について、表示用の情報を取り出す。
// 純粋関数のみ。UI からも、将来の編集ツールからも使う。

const nameOf = (list, id) => {
  const e = list?.[id];
  if (!e || e.removed) return null;
  return e.fullName ?? e.name ?? null;
};

/** セルの情報（ホバー表示用）。該当なしは null */
export function describeCell(map, i) {
  const c = map.pack.cells;
  if (!map.geometry || i < 0 || i >= c.biome.length) return null;
  const isWater = c.biome[i] === 0;
  const burgId = c.burg[i];
  return {
    cell: i,
    water: isWater,
    height: map.geometry.pack.h[i],
    biome: map.biomesData[c.biome[i]]?.name ?? null,
    state: isWater ? null : nameOf(map.pack.states, c.state[i]),
    culture: isWater ? null : nameOf(map.pack.cultures, c.culture[i]),
    religion: isWater ? null : nameOf(map.pack.religions, c.religion[i]),
    province: isWater ? null : nameOf(map.pack.provinces, c.province[i]),
    burg: burgId ? map.pack.burgs[burgId]?.name ?? null : null,
    hasRiver: c.river[i] > 0,
  };
}

/** 色分けの種類ごとの、実体一覧・セル配列・中心セルの取り出し方 */
export const ENTITY_KINDS = Object.freeze({
  state:    { label: "国家", entities: (m) => m.pack.states,    cells: (m) => m.pack.cells.state },
  culture:  { label: "文化", entities: (m) => m.pack.cultures,  cells: (m) => m.pack.cells.culture },
  religion: { label: "宗教", entities: (m) => m.pack.religions, cells: (m) => m.pack.cells.religion },
  province: { label: "属州", entities: (m) => m.pack.provinces, cells: (m) => m.pack.cells.province },
});

/** 凡例用: 実在する実体を、セル数の多い順に。セル数はセル配列から数え直す */
export function listEntities(map, kind) {
  const def = ENTITY_KINDS[kind];
  if (!def) return [];
  const ids = def.cells(map);
  const counts = new Map();
  for (let i = 0; i < ids.length; i++) {
    if (map.pack.cells.biome[i] === 0) continue; // 水域は数えない
    counts.set(ids[i], (counts.get(ids[i]) ?? 0) + 1);
  }
  return def.entities(map)
    .filter((e) => e && e.i && !e.removed && counts.has(e.i))
    .map((e) => ({
      id: e.i, name: e.fullName ?? e.name ?? `#${e.i}`, color: e.color ?? "#ccc",
      cells: counts.get(e.i), center: e.center ?? null, pole: e.pole ?? null,
    }))
    .sort((a, b) => b.cells - a.cells);
}

/** 実体の位置（ワールド座標）。国家は pole、無ければ中心セル */
export function entityPosition(map, entity) {
  if (entity.pole) return [entity.pole[0], entity.pole[1]];
  const p = entity.center != null ? map.geometry?.pack.p[entity.center] : null;
  return p ? [p[0], p[1]] : null;
}
