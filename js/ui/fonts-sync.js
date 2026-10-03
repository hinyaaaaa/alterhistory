// 地図の名前に使う文字を Web フォントとして読み込み、読み込めたら描き直す。
// 名前が変わったとき（名前の生成・編集・Undo）にも、新しい文字を読み込み直す。
import { loadMapFonts } from "../render/fonts.js";

export function initFontsSync({ store, renderer }) {
  let lastMap = null, lastSig = "", timer = 0, loadedChars = new Set();
  const namesOf = (map) => {
    let t = "";
    for (const key of ["burgs", "states", "provinces"]) for (const e of map.pack[key] ?? []) if (e && !e.removed && e.name) t += e.name;
    return t;
  };
  function check(state) {
    const map = state.map;
    if (!map) return;
    const sig = `${map.rev?.places ?? 0}:${map.rev?.politics ?? 0}`;
    if (map === lastMap && sig === lastSig) return;
    lastMap = map; lastSig = sig;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const fresh = [...new Set(namesOf(map))].filter((c) => !loadedChars.has(c));
      if (!fresh.length) return;
      fresh.forEach((c) => loadedChars.add(c));
      loadMapFonts(fresh.join(""), () => renderer.requestRender());
    }, 250);
  }
  store.subscribe(check);
  check(store.getState());
}
