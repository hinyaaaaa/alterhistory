// v6.15.0: 国旗の表示（core/names/flag.js の SVG を DOM に）
import { flagSvg, flagOfState } from "../../core/names/flag.js";
export function flagEl(spec, w = 96) { const s = document.createElement("span"); s.className = "flag"; s.style.width = w + "px"; s.innerHTML = flagSvg(spec, { w }); return s; }
export const stateFlagEl = (st, w = 96) => flagEl(flagOfState(st), w);
