// 画面の表示設定(view) → 描画オプションへの変換。UI と描画層の橋渡し。
export function viewToRenderOptions(view) {
  return {
    base: view.base,
    overlay: view.overlay,
    coast: view.coast,
    rivers: view.rivers,
    routes: view.routes ? { roads: true, trails: true, searoutes: true } : false,
    burgs: view.burgs,
    tradeLines: view.tradeLines ?? null,
    zones: view.zones ?? true,
    zoneSelected: view.zoneSelected ?? null,
    journeys: view.journeys ?? true,
    journeySelected: view.journeySelected ?? null,
    labels: view.labels
      ? { states: true, burgs: view.burgLabels === "none" ? false : view.burgLabels === "capitals" ? "capitals" : true }
      : false,
  };
}
