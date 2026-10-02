// 検証用の合成 Azgaar マップ生成器。
//
// なぜ必要か: リポジトリには実サンプル(.map)が含まれておらず、テストは実ファイルが無いと動かない。
// AI 向けセーブデータとUIの検証には「本物と同じ読み込み経路を通る地図」が要るので、
// 公式仕様(docs/MAP_FORMAT_SPEC.md)どおりの .map を合成する。
//
// 限界: これは実マップではない。地形は単純な大陸+湖+島で、河川・道路は簡略。
//       ただし grid → pack 再構築(geometry.js)は実コードをそのまま通るので、
//       セル数の整合検査・形状構築・書き出しの往復は実物と同じ経路で検証できる。
import { createRequire } from "node:module";
const Delaunator = createRequire(import.meta.url)("../../js/vendor/delaunator.min.js");
import { buildVoronoi, rebuildPack } from "../../js/core/geometry.js";

// 乱数(決定論)
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildSyntheticMapText({ seed = 7, width = 1280, height = 774, spacing = 24 } = {}) {
  const r = rng(seed);
  const cellsX = Math.floor(width / spacing), cellsY = Math.floor(height / spacing);
  const points = [];
  for (let y = 0; y < cellsY; y++) for (let x = 0; x < cellsX; x++) {
    points.push([Math.round((x * spacing + spacing / 2 + (r() - 0.5) * spacing * 0.6) * 10) / 10, Math.round((y * spacing + spacing / 2 + (r() - 0.5) * spacing * 0.6) * 10) / 10]);
  }
  const boundary = [];
  const bs = spacing * 2;
  for (let x = -bs; x <= width + bs; x += bs) { boundary.push([x, -bs], [x, height + bs]); }
  for (let y = 0; y <= height; y += bs) { boundary.push([-bs, y], [width + bs, y]); }

  // 高さ: 大陸(楕円) + 島 + 湖
  const h = points.map(([x, y]) => {
    const cx = width * 0.5, cy = height * 0.5;
    const d = Math.hypot((x - cx) / (width * 0.42), (y - cy) / (height * 0.42));
    let v = 60 - d * 55 + (r() - 0.5) * 8;
    const d2 = Math.hypot((x - width * 0.85) / 60, (y - height * 0.25) / 45);
    v = Math.max(v, 45 - d2 * 30);
    const dl = Math.hypot((x - width * 0.45) / 55, (y - height * 0.5) / 40); // 内陸の湖
    if (dl < 1) v = 12;
    return Math.max(0, Math.min(100, Math.round(v)));
  });
  // t: 海岸距離 (1=陸の海岸, -1=水の海岸, 2以上=陸の内側, -2以下=水の内側)
  const n = points.length;
  const water = h.map((v) => v < 20);
  const neigh = (i) => { const x = i % cellsX, y = (i / cellsX) | 0; const o = []; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < cellsX && ny < cellsY) o.push(ny * cellsX + nx); } return o; };
  const t = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { const coast = neigh(i).some((j) => water[j] !== water[i]); t[i] = coast ? (water[i] ? -1 : 1) : 0; }
  for (let pass = 2; pass < 6; pass++) for (let i = 0; i < n; i++) { if (t[i] !== 0) continue; const nb = neigh(i).map((j) => t[j]); const wantLand = !water[i]; const hit = nb.some((v) => (wantLand ? v === pass - 1 : v === -(pass - 1))); if (hit) t[i] = wantLand ? pass : -pass; }
  for (let i = 0; i < n; i++) if (t[i] === 0) t[i] = water[i] ? -6 : 6;
  // 湖(内陸の水): f で識別
  const f = new Array(n).fill(0);
  const features = [0, { i: 1, type: "ocean", land: false, border: true }, { i: 2, type: "island", land: true }, { i: 3, type: "lake", land: false, border: false }];
  for (let i = 0; i < n; i++) {
    if (!water[i]) f[i] = 2;
    else { const isLake = points[i][0] > width * 0.3 && points[i][0] < width * 0.6 && points[i][1] > height * 0.35 && points[i][1] < height * 0.65; f[i] = isLake ? 3 : 1; if (isLake) t[i] = t[i] === -1 ? -1 : -2; }
  }
  const prec = h.map(() => 20 + Math.round(r() * 40));
  const temp = h.map((v, i) => 26 - Math.round(points[i][1] / height * 40));

  const gridVoronoi = buildVoronoi(points, boundary, Delaunator);
  const pack = rebuildPack({ points, boundary, spacing, features, h, f, t }, gridVoronoi, Delaunator);
  const N = pack.p.length;

  // pack 属性
  const biome = new Array(N).fill(0), state = new Array(N).fill(0), culture = new Array(N).fill(0);
  const religion = new Array(N).fill(0), province = new Array(N).fill(0), popArr = new Array(N).fill(0);
  const burgArr = new Array(N).fill(0), river = new Array(N).fill(0);
  const cx0 = width * 0.5;
  for (let i = 0; i < N; i++) {
    const [x, y] = pack.p[i]; const hh = pack.h[i];
    if (hh < 20) { biome[i] = 0; continue; }
    biome[i] = hh > 70 ? 11 : hh > 55 ? 6 : y < height * 0.3 ? 10 : 3 + ((i * 7) % 4);
    // 国家: 大陸を6つに分割 (経度3 × 緯度2)
    const col = x < cx0 - 150 ? 0 : x < cx0 + 150 ? 1 : 2, row = y < height * 0.5 ? 0 : 1;
    state[i] = x > width * 0.75 && y < height * 0.4 ? 6 : 1 + col + row * 3;
    culture[i] = 1 + (state[i] % 3);
    religion[i] = 1 + ((state[i] + (x > cx0 ? 1 : 0)) % 3);
    popArr[i] = Math.round((0.3 + r() * 4) * 100) / 100;
  }
  // 属州: 各国を東西2分割
  const provOf = new Map(); const provinces = [0];
  for (let i = 0; i < N; i++) if (state[i] > 0 && r() < 0.85) {
    const key = state[i] + (pack.p[i][0] > width * 0.5 ? "E" : "W");
    if (!provOf.has(key)) { provOf.set(key, provinces.length); provinces.push({ i: provinces.length, state: state[i], center: i, burg: 0, name: "", formCollection: [], fullName: "", color: "#" + Math.floor(r() * 0xffffff).toString(16).padStart(6, "0"), coa: {}, }); }
    province[i] = provOf.get(key);
  }
  const provNames = ["北陽", "南陽", "白峰", "黒森", "紅河", "青海", "金原", "銀嶺", "翠丘", "紫野", "朱雀", "玄武"];
  provinces.forEach((p, k) => { if (k) { p.name = provNames[k % provNames.length] + (k > provNames.length ? k : ""); p.fullName = p.name + "州"; } });

  // 都市: 各国の重心付近に首都、他に数都市
  const burgs = [0];
  const cityNames = ["アルカディア", "ベルンハルト", "カスティーリャ", "ドラグノフ", "エルドラド", "フォルトゥナ", "ギルガメシュ", "ハイデルベルク", "イシュタル", "ジェノヴァ", "ケルン", "ラグナロク", "ミラノ", "ノルドハイム", "オリエント", "パルミラ", "クレタ", "ロードス", "サルディス", "テーベ"];
  let nameIdx = 0;
  const stateIds = [1, 2, 3, 4, 5, 6];
  const stateCells = Object.fromEntries(stateIds.map((s) => [s, []]));
  for (let i = 0; i < N; i++) if (state[i] > 0 && biome[i] !== 0) stateCells[state[i]].push(i);
  for (const s of stateIds) {
    const cells = stateCells[s]; if (!cells.length) continue;
    const mx = cells.reduce((a, i) => a + pack.p[i][0], 0) / cells.length, my = cells.reduce((a, i) => a + pack.p[i][1], 0) / cells.length;
    const sorted = cells.slice().sort((a, b) => Math.hypot(pack.p[a][0] - mx, pack.p[a][1] - my) - Math.hypot(pack.p[b][0] - mx, pack.p[b][1] - my));
    const picks = [sorted[0]]; for (let k = 1; k < sorted.length && picks.length < 5; k += Math.max(6, (sorted.length / 5) | 0)) if (!picks.includes(sorted[k])) picks.push(sorted[k]);
    picks.forEach((cell, k) => {
      const id = burgs.length; const nm = cityNames[nameIdx++ % cityNames.length];
      burgs.push({ cell, x: pack.p[cell][0], y: pack.p[cell][1], i: id, state: s, culture: culture[cell], name: nm, feature: 2, capital: k === 0 ? 1 : 0, port: 0, population: Math.round((k === 0 ? 30 : 6 + r() * 10) * 100) / 100, type: "Generic", coa: {}, MFCG: 1, group: k === 0 ? "capital" : "town" });
      burgArr[cell] = id;
    });
  }
  // 属州の中心都市
  for (const p of provinces) if (p && p.i) { const cand = burgs.filter((b) => b && b.i && province[b.cell] === p.i); if (cand.length) { p.burg = cand[0].i; p.center = cand[0].cell; } }

  const stateNames = ["アルビオン王国", "ベルガ公国", "カスタ帝国", "ドラン連邦", "エルム共和国", "フロスト辺境伯領"];
  const forms = ["Monarchy", "Duchy", "Empire", "Federation", "Republic", "March"];
  const colors = ["#e06666", "#6fa8dc", "#93c47d", "#f6b26b", "#8e7cc3", "#c27ba0"];
  const cultures = [{ name: "Wildlands", i: 0 }, { i: 1, name: "アルビオン人", base: 0, origins: [0], shield: "heater", center: 1, color: "#ffd966", type: "Generic", expansionism: 1, code: "AL" }, { i: 2, name: "ベルガ人", base: 0, origins: [0], shield: "round", center: 2, color: "#a4c2f4", type: "Generic", expansionism: 1, code: "BE" }, { i: 3, name: "カスタ人", base: 0, origins: [0], shield: "kite", center: 3, color: "#b6d7a8", type: "Naval", expansionism: 1, code: "CA" }];
  const religions = [{ name: "No religion", i: 0 }, { i: 1, name: "太陽教", color: "#fce5cd", type: "Folk", form: "Cult", culture: 1, center: 1, deity: "アマル", origins: [0], code: "TA" }, { i: 2, name: "月光教", color: "#d9d2e9", type: "Organized", form: "Church", culture: 2, center: 2, deity: "ルナ", origins: [0], code: "GE" }, { i: 3, name: "大樹教", color: "#d9ead3", type: "Folk", form: "Cult", culture: 3, center: 3, deity: "ユグ", origins: [0], code: "TA" }];
  const states = [{ i: 0, name: "Neutrals" }];
  stateIds.forEach((s, k) => {
    const cells = stateCells[s]; const cap = burgs.find((b) => b && b.state === s && b.capital);
    let rural = 0, urban = 0; for (const i of cells) rural += popArr[i]; for (const b of burgs) if (b && b.state === s) urban += b.population;
    const diplomacy = stateIds.map(() => "Neutral"); diplomacy.unshift("x"); diplomacy[s] = "x";
    states.push({ i: s, name: stateNames[k].replace(/(王国|公国|帝国|連邦|共和国|辺境伯領)$/, ""), fullName: stateNames[k], form: forms[k], formName: forms[k], color: colors[k], center: cap?.cell ?? cells[0], capital: cap?.i ?? 0, type: "Generic", expansionism: 1.5, cells: cells.length, area: cells.length * 90, rural: Math.round(rural * 100) / 100, urban: Math.round(urban * 100) / 100, burgs: burgs.filter((b) => b && b.state === s).length, culture: k % 3 + 1, pole: cap ? [cap.x, cap.y] : [0, 0], neighbors: [], diplomacy, provinces: provinces.filter((p) => p && p.state === s).map((p) => p.i), military: [], campaigns: [], coa: {}, alert: 1 });
  });
  states[0].diplomacy = [["Neutrals", "Independent"]];
  const biomesData = [
    { i: 0, name: "Marine", color: "#466eab", habitability: 0 }, { i: 1, name: "Hot desert", color: "#fbe79f", habitability: 4 }, { i: 2, name: "Cold desert", color: "#b5b887", habitability: 10 },
    { i: 3, name: "Savanna", color: "#d2d082", habitability: 60 }, { i: 4, name: "Grassland", color: "#c8d68f", habitability: 50 }, { i: 5, name: "Tropical seasonal forest", color: "#b6d95d", habitability: 70 },
    { i: 6, name: "Temperate deciduous forest", color: "#29bc56", habitability: 70 }, { i: 7, name: "Tropical rainforest", color: "#7dcb35", habitability: 80 }, { i: 8, name: "Temperate rainforest", color: "#409c43", habitability: 90 },
    { i: 9, name: "Taiga", color: "#4b6b32", habitability: 12 }, { i: 10, name: "Tundra", color: "#96784b", habitability: 4 }, { i: 11, name: "Glacier", color: "#d5e7eb", habitability: 0 }, { i: 12, name: "Wetland", color: "#0b9131", habitability: 12 },
  ];
  const markers = [{ i: 0, type: "ruins", icon: "🏛️", x: pack.p[stateCells[1][10]][0], y: pack.p[stateCells[1][10]][1], cell: stateCells[1][10], name: "古代神殿跡", note: "<p>千年前の王朝の神殿。<br>祭壇の下に地下墓所があるという。</p>" }, { i: 1, type: "battlefields", icon: "⚔️", x: pack.p[stateCells[2][5]][0], y: pack.p[stateCells[2][5]][1], cell: stateCells[2][5], name: "赤の平原の戦場" }];
  // 一部の実体にノート
  states[1].note = "<p>大陸西部を治める古い王国。<br>建国は神話時代に遡る。</p>";
  burgs[1].note = "<p>王都。白い城壁で知られる。</p>";

  const settings = { seed: String(seed), graph: { width, height }, geography: { mapSize: 100, latitude: 50, longitude: 50, coordinates: { latT: 30, latN: 60, latS: 30, lonT: 30, lonW: -15, lonE: 15 } }, climate: { temperature: { equator: 27, northPole: -30, southPole: -15 }, precipitation: 100, winds: [225, 45, 225, 315, 135, 315] }, lore: { name: "合成テスト世界" }, units: { distance: { unit: "km", scale: 3 }, area: { unit: "square" }, height: { unit: "m", exponent: 2 }, temperature: { unit: "°C" }, population: { scale: 1000, urbanization: { rate: 1, density: 10 } } } };

  const grid = { spacing, cellsX, cellsY, boundary, points, features };
  const packFeatures = [0, { i: 1, type: "ocean", land: false, border: true, cells: 100, firstCell: 0, vertices: [], area: 0 }, { i: 2, type: "island", land: true, border: false, cells: 100, firstCell: 0, vertices: [], area: 0 }];
  const lines = new Array(53).fill("");
  const csv = (a) => a.join(",");
  lines[0] = ["1.153.1", "synthetic", "2026-9-28", String(seed), width, height, "1234567890"].join("|");
  lines[1] = JSON.stringify(settings);
  lines[3] = JSON.stringify(biomesData);
  lines[5] = "<svg></svg>";
  lines[6] = JSON.stringify(grid);
  lines[7] = csv(h); lines[8] = csv(prec); lines[9] = csv(f); lines[10] = csv(t); lines[11] = csv(temp);
  lines[12] = JSON.stringify(packFeatures);
  lines[13] = JSON.stringify(cultures);
  lines[14] = JSON.stringify(states);
  lines[15] = JSON.stringify(burgs);
  lines[16] = csv(biome); lines[17] = csv(burgArr); lines[19] = csv(culture); lines[21] = csv(popArr); lines[22] = csv(river);
  lines[25] = csv(state); lines[26] = csv(religion); lines[27] = csv(province);
  lines[29] = JSON.stringify(religions); lines[30] = JSON.stringify(provinces);
  lines[31] = ""; lines[32] = "[]"; lines[35] = JSON.stringify(markers); lines[36] = "{}"; lines[37] = "[]"; lines[38] = "[]"; lines[39] = "[]";
  lines[41] = "[]"; lines[42] = "[]"; lines[43] = "[]"; lines[46] = "[]"; lines[49] = "[]"; lines[51] = "{}";
  return { text: lines.join("\r\n"), cellCount: N, stateCount: stateIds.length };
}
