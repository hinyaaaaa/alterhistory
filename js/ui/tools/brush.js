// ブラシツール：マウスでなぞったセルを、選んだ種類・対象に塗る共通処理。
// state（データ）は持たず、コールバックを受け取って動く。UI層のイベント処理のみ。

export function createBrushController({ getRadius, onStroke }) {
  let painting = false;
  let painted = new Set();

  return {
    get isPainting() { return painting; },
    begin(cell, radiusCells) {
      painting = true;
      painted = new Set();
      this.continue(cell, radiusCells);
    },
    continue(cell, radiusCells) {
      if (!painting) return;
      onStroke(cell, radiusCells ?? getRadius(), painted);
    },
    end() {
      painting = false;
      const had = painted.size > 0;
      painted = new Set();
      return had;
    },
  };
}
