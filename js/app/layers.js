// レイヤー（Azgaar 方式）：地図に重ねるものを、1つずつ独立にオン/オフする。
//
// これまでは「色分け」を国家・文化・宗教・属州から1つだけ選ぶ方式だった。Azgaar と同じく、
// 地形・標高・国家・文化・宗教・属州・国境・海岸線・河川・道路・都市・ゾーン・旅・名前を
// それぞれ独立のスイッチにして、好きな組み合わせで同時に重ねられるようにする。
// ほかに、よく使う組み合わせを一度に切り替えるプリセット（政治・文化・宗教・属州・地形・標高）がある。
//
// 純粋ロジック（DOM 非依存）。表示設定 view のキーと、描画・凡例の橋渡しをする。

/** 色で塗り分ける層。配列の順が描く順（後ろほど上に重なる。国家が一番上） */
export const FILL_KINDS = Object.freeze(["culture", "religion", "province", "state"]);
/** 種類 → view のキー */
export const FILL_KEY = Object.freeze({ state: "states", culture: "cultures", religion: "religions", province: "provinces" });
export const FILL_LABEL = Object.freeze({ state: "国家", culture: "文化", religion: "宗教", province: "属州" });

/**
 * レイヤーの一覧（表示の順）。view[key] が true のとき表示する。
 * 値がまだ無い（undefined）ときの既定は `on`。
 */
export const LAYERS = Object.freeze([
  { key: "biomes",    label: "地形・植生", group: "base", on: true,  title: "バイオーム（森・砂漠など）で陸を塗る" },
  { key: "heights",   label: "標高",       group: "base", on: false, title: "標高で陸を塗る（地形・植生と重ねると半透明で重なる）" },
  { key: "states",    label: "国家",       group: "fill", on: true,  title: "国家の色分け" },
  { key: "cultures",  label: "文化",       group: "fill", on: false, title: "文化の色分け" },
  { key: "religions", label: "宗教",       group: "fill", on: false, title: "宗教の色分け" },
  { key: "provinces", label: "属州",       group: "fill", on: false, title: "属州の色分け" },
  { key: "borders",   label: "国境",       group: "line", on: true,  title: "国家の境界線（国家の色分けを消していても引く）" },
  { key: "coast",     label: "海岸線",     group: "line", on: true },
  { key: "rivers",    label: "河川",       group: "line", on: true },
  { key: "routes",    label: "道路",       group: "line", on: true },
  { key: "burgs",     label: "都市",       group: "mark", on: true,  title: "都市の記号" },
  { key: "zones",     label: "ゾーン",     group: "mark", on: true },
  { key: "journeys",  label: "旅の線",     group: "mark", on: true },
  { key: "labels",    label: "名前",       group: "mark", on: true,  title: "国・属州・都市の名前" },
]);
const DEFAULT_ON = new Map(LAYERS.map((l) => [l.key, l.on]));

/** そのレイヤーが今オンか（未設定なら既定値） */
export const isLayerOn = (view, key) => view?.[key] ?? DEFAULT_ON.get(key) ?? false;

/** 今オンの色分けの種類を、描く順で返す */
export const activeFills = (view) => FILL_KINDS.filter((k) => isLayerOn(view, FILL_KEY[k]));

/** 地形の下地の描き方: "biome" | "height" | "both" | "none"（どちらも切ると、陸は無地になる） */
export function terrainMode(view) {
  const b = isLayerOn(view, "biomes"), h = isLayerOn(view, "heights");
  return b && h ? "both" : b ? "biome" : h ? "height" : "none";
}

/**
 * 凡例に出す種類。オンの色分けの中から、ユーザーが最後に選んだもの（view.legendKind）を優先し、
 * 無ければ描く順で一番上のもの。色分けが1つもオフなら null。
 */
export function legendKindOf(view) {
  const on = activeFills(view);
  if (!on.length) return null;
  return on.includes(view?.legendKind) ? view.legendKind : on[on.length - 1];
}

const ALL_FILLS_OFF = { states: false, cultures: false, religions: false, provinces: false };
const fillsOnly = (kind) => ({ ...ALL_FILLS_OFF, [FILL_KEY[kind]]: true });

/**
 * プリセット（Azgaar の「政治・文化・宗教…」に相当）。選ぶと、ここに書いたキーを一度に切り替える。
 * 書いていないキー（河川・道路など）は触らない。
 */
export const PRESETS = Object.freeze([
  { id: "politics", label: "政治", title: "国家の色分けと国境。道路・川・名前も表示", set: { biomes: true, heights: false, ...fillsOnly("state"), borders: true, coast: true, rivers: true, routes: true, burgs: true, labels: true, burgLabels: "auto", legendKind: "state" } },
  { id: "culture",  label: "文化", title: "文化の色分け", set: { biomes: true, heights: false, ...fillsOnly("culture"), borders: true, coast: true, rivers: true, routes: false, burgs: true, labels: true, legendKind: "culture" } },
  { id: "religion", label: "宗教", title: "宗教の色分け", set: { biomes: true, heights: false, ...fillsOnly("religion"), borders: true, coast: true, rivers: true, routes: false, burgs: true, labels: true, legendKind: "religion" } },
  { id: "province", label: "属州", title: "属州の色分け", set: { biomes: true, heights: false, ...fillsOnly("province"), borders: true, coast: true, rivers: true, routes: false, burgs: true, labels: true, legendKind: "province" } },
  { id: "terrain",  label: "地形", title: "色分けなしの地形図。首都だけ名前を表示", set: { biomes: true, heights: false, ...ALL_FILLS_OFF, borders: false, coast: true, rivers: true, routes: false, burgs: true, labels: true, burgLabels: "capitals" } },
  { id: "height",   label: "標高", title: "標高だけを見る（記号・文字は消す）", set: { biomes: false, heights: true, ...ALL_FILLS_OFF, borders: false, coast: true, rivers: true, routes: false, burgs: false, labels: false } },
]);

/** そのプリセットが、今の表示と完全に一致しているか（ボタンの「選択中」表示用） */
export const presetMatches = (view, preset) => Object.entries(preset.set).every(([k, v]) => (k === "legendKind" || k === "burgLabels" ? true : isLayerOn(view, k) === v));

/** ID またはキーから、色分けを1種類だけ表示する patch（絵を塗る間などに使う） */
export const exclusiveFillPatch = (kind) => (kind && FILL_KEY[kind] ? { ...fillsOnly(kind), legendKind: kind } : { ...ALL_FILLS_OFF });

/** 今の色分けの on/off だけを取り出す（あとで元に戻すため） */
export const snapshotFills = (view) => ({ ...Object.fromEntries(FILL_KINDS.map((k) => [FILL_KEY[k], isLayerOn(view, FILL_KEY[k])])), legendKind: view?.legendKind });
