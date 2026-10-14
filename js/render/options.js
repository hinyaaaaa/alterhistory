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
    // 名前はズーム連動だけ（v2.4.0）。国家のレイヤーがオンの間は、国名を自動で出す
    labels: { states: isLayerOn(view, "states"), burgs: "auto" },
  };
}
