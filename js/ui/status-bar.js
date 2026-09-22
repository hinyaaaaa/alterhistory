// ステータスバー：読み込み中の地図・ホバー中のセル情報・ズーム倍率。
import { byId } from "./dom.js";

export function formatCell(info) {
  if (!info) return "";
  if (info.water) return `水域 ｜ 標高 ${info.height}`;
  const parts = [`国家: ${info.state ?? "なし"}`];
  if (info.province) parts.push(`属州: ${info.province}`);
  if (info.culture) parts.push(`文化: ${info.culture}`);
  if (info.religion) parts.push(`宗教: ${info.religion}`);
  if (info.burg) parts.push(`都市: ${info.burg}`);
  if (info.biome) parts.push(`地形: ${info.biome}`);
  parts.push(`標高 ${info.height}`);
  return parts.join(" ｜ ");
}

export function initStatusBar({ store, viewport, renderer }) {
  const mapEl = byId("status-map");
  const hoverEl = byId("status-hover");
  const zoomEl = byId("status-zoom");

  const update = (state) => {
    mapEl.textContent = state.map
      ? `${state.map.meta.name || state.fileName} ｜ ${state.map.geometry.pack.p.length}セル`
      : "未読み込み";
    hoverEl.textContent = formatCell(state.hover);
  };
  store.subscribe(update);
  update(store.getState());

  const updateZoom = () => {
    zoomEl.textContent = store.getState().map ? `拡大率 ${Math.round((viewport.k / viewport.fitK) * 100)}%` : "";
  };
  renderer.onFrame(updateZoom);
}
