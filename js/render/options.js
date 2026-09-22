// 画面の表示設定(view) → 描画オプションへの変換。UI と描画層の橋渡し。
export function viewToRenderOptions(view) {
  return {
    base: view.base,
    overlay: view.overlay,
    coast: view.coast,
    rivers: view.rivers,
    routes: view.routes ? { roads: true, trails: true, searoutes: true } : false,
    burgs: view.burgs,
    labels: view.labels ? { states: true, burgs: true } : false,
  };
}
