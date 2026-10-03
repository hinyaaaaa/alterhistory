// 画面の表示設定(view) → 描画オプションへの変換。UI と描画層の橋渡し。
import { activeFills, terrainMode, legendKindOf, isLayerOn } from "../app/layers.js";

export function viewToRenderOptions(view) {
  return {
    terrain: terrainMode(view),            // "biome" | "height" | "both" | "none"
    fills: activeFills(view),              // 色分けの種類（描く順）
    legendKind: legendKindOf(view),        // 凡例（書き出し画像）に出す種類
    borders: isLayerOn(view, "borders"),
    coast: isLayerOn(view, "coast"),
    rivers: isLayerOn(view, "rivers"),
    routes: isLayerOn(view, "routes") ? { roads: true, trails: true, searoutes: true } : false,
    burgs: isLayerOn(view, "burgs"),
    tradeLines: view.tradeLines ?? null,
    zones: isLayerOn(view, "zones"),
    zoneSelected: view.zoneSelected ?? null,
    journeys: isLayerOn(view, "journeys"),
    journeySelected: view.journeySelected ?? null,
    labels: isLayerOn(view, "labels")
      ? { states: true, burgs: view.burgLabels === "none" ? false : view.burgLabels === "capitals" ? "capitals" : view.burgLabels === "auto" ? "auto" : true }
      : false,
  };
}
