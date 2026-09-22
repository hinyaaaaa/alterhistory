// 選択ツール：クリックした場所にある都市・マーカー・セルを、優先順位つきで返す。
// UI層：座標からセル/実体を求め、パネルに表示する情報を作る。

/** @returns {{type:"marker"|"burg"|"cell", id:number}|null} */
export function pickAt(map, cell, worldX, worldY, pixelRadius) {
  if (cell < 0) return null;
  const nearMarker = map.markers.find((m) => Math.hypot(m.x - worldX, m.y - worldY) <= pixelRadius);
  if (nearMarker) return { type: "marker", id: nearMarker.i };
  const burgId = map.pack.cells.burg[cell];
  if (burgId) return { type: "burg", id: burgId };
  return { type: "cell", id: cell };
}
