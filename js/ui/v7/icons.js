// v7 アイコン（線画。24×24。stroke は currentColor）。レールと上部バーで使う。追加するときはここだけに足す（docs/UI_RULES.md §3）
import { sv } from "../v6/common.js";
const P = {
  status: '<path d="M3 5h18M3 12h12M3 19h18"/><circle cx="19" cy="12" r="2"/>',
  domestic: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>',
  war: '<path d="M12 3l8 4v6c0 4-4 7-8 8-4-1-8-4-8-8V7z"/><path d="M12 8v8M9 11h6"/>',
  diplo: '<circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="20" r="2"/><path d="M7 7l3.5 3.5M17 7l-3.5 3.5M12 14.5V18"/>',
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  nations: '<path d="M4 20h16M6 20V10M10 20V6M14 20v-8M18 20V4"/>',
  chron: '<path d="M12 3v18"/><circle cx="12" cy="7" r="2"/><circle cx="12" cy="14" r="2"/><path d="M14 7h6M4 14h6"/>',
  intervene: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 3L3 10l6 7"/>',
};
export const iconSvg = (name, size = 22) => {
  const s = sv("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 1.4 });
  s.innerHTML = P[name] ?? "";
  return s;
};
/** 速度の記号。0=一時停止、1..4=三角の数 */
export const speedSvg = (n) => {
  const s = sv("svg", { viewBox: n ? `0 0 ${n * 7 + 2} 12` : "0 0 12 12", style: `width:${n ? n * 7 + 2 : 12}px` });
  s.innerHTML = n ? Array.from({ length: n }, (_, i) => `<path d="M${1 + i * 7} 1.5L${7 + i * 7} 6L${1 + i * 7} 10.5Z"/>`).join("") : '<rect x="2" y="1.5" width="2.8" height="9"/><rect x="7.2" y="1.5" width="2.8" height="9"/>';
  return s;
};
/** ロゴ: 頂点で右脚が少しずれた「A」。ずれが「改変」を表す */
export const logoSvg = () => {
  const s = sv("svg", { viewBox: "0 0 40 40", fill: "none" });
  s.innerHTML =
    '<path d="M2 0H31L40 9V38H9L0 29V2Z" stroke="#b8a06a" stroke-width="1.1"/><path d="M11 30.5L19.5 9.5L25 21.5" stroke="#e8eef0" stroke-width="2.4" stroke-linecap="square"/><path d="M27.5 25.5L30 31" stroke="#b8a06a" stroke-width="2.4" stroke-linecap="square"/><path d="M15 25.5H22" stroke="#b8a06a" stroke-width="1.6"/><path d="M19.5 4V9.5" stroke="#b8a06a" stroke-width="1.2"/>';
  return s;
};
