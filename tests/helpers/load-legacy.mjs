// 旧形式（Azgaar）の固定データを、画面のアプリへ「開いた地図」として入れるテスト用の道具。
// 本番は .ahmap v2 しか開けないため、国家・戦争・経済などの既存テストは、この入口で固定データを採用する。
import { createRequire } from "node:module";
import { loadFromBytes } from "./legacy/loader.js";
const Delaunator = createRequire(import.meta.url)("../../js/vendor/delaunator.min.js");

export async function loadLegacyInto(window, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { map, warnings } = await loadFromBytes(bytes, Delaunator);
  const a = window.alterhistory.actions;
  a.adoptMap(map, file.name, warnings);
  a.katakanaBurgs(file.name);
}
