// v6.13.0: 地形・都市プラグインの登録所。別のエージェントが書いた「地形生成・都市生成を自然にするプログラム」は、ここで登録するだけで差し込める。
//   1) 渡されたファイルを js/plugins/ に置く（例: js/plugins/natural-terrain.js）。
//   2) 下の「登録」に 1 行足す。契約と例は docs/PLUGINS.md。
//   3) npm run build → npm test。保存した世界を読み込むときは、同じ version のプラグインが登録されている必要がある。
// 何も登録しなければ、これまでと同じ世界ができる。
import { registerTerrainPlugin, registerCityPlugin } from "../core/wcde/world.js";

// ---- 登録（例。渡されたら、コメントを外して名前を合わせる）
// import terrain from "./natural-terrain.js";   // { refine(world, spec, options) } か { generate(spec, options) }
// import city from "./natural-city.js";         // { initialGroups?, siteScore?, settlementCell? }
// registerTerrainPlugin({ id: "natural-terrain", version: "1.0.0", ...terrain });
// registerCityPlugin({ id: "natural-city", version: "1.0.0", ...city });

export const PLUGIN_REGISTRARS = Object.freeze({ registerTerrainPlugin, registerCityPlugin });
