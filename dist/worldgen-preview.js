(() => {
  // js/core/world/sphere-mesh.js
  var MESH_VERSION = "sphere-ico-1";
  var cellCountForFrequency = (n) => 10 * n * n + 2;
  var frequencyForCells = (target) => Math.max(1, Math.round(Math.sqrt((target - 2) / 10)));
  var PHI = (1 + Math.sqrt(5)) / 2;
  function baseIcosahedron() {
    const raw = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
    const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const a = norm(raw[0]);
    let u = cross([0, 0, 1], a), s = Math.hypot(...u);
    const verts = raw.map(norm);
    if (s > 1e-12) {
      u = u.map((v) => v / s);
      const ang = Math.acos(Math.min(1, Math.max(-1, a[2]))), c = Math.cos(ang), sn = Math.sin(ang);
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i], k = cross(u, v), d = dot(u, v);
        verts[i] = [v[0] * c + k[0] * sn * -1 + u[0] * d * (1 - c), v[1] * c + k[1] * sn * -1 + u[1] * d * (1 - c), v[2] * c + k[2] * sn * -1 + u[2] * d * (1 - c)];
      }
    }
    const fixed = faces.map(([p, q, r]) => {
      const A = verts[p], B = verts[q], C = verts[r];
      return dot(cross(sub(B, A), sub(C, A)), A) >= 0 ? [p, q, r] : [p, r, q];
    });
    return { verts, faces: fixed };
  }
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  function buildSphereMesh(n) {
    if (!Number.isInteger(n) || n < 1) throw new Error("\u5468\u6CE2\u6570 n \u306F 1 \u4EE5\u4E0A\u306E\u6574\u6570");
    const { verts: bv, faces } = baseIcosahedron();
    const V = cellCountForFrequency(n), T = 20 * n * n;
    const centerXYZ = new Float32Array(3 * V);
    for (let i = 0; i < 12; i++) {
      centerXYZ[3 * i] = bv[i][0];
      centerXYZ[3 * i + 1] = bv[i][1];
      centerXYZ[3 * i + 2] = bv[i][2];
    }
    const edgeBase = /* @__PURE__ */ new Map();
    let nextEdge = 12;
    const interiorPerFace = (n - 1) * (n - 2) / 2, faceBase0 = 12 + 30 * (n - 1);
    const rowStart = new Int32Array(n + 1);
    for (let i = 1, acc = 0; i <= n - 2; i++) {
      rowStart[i] = acc;
      acc += n - 1 - i;
    }
    const tmp = [0, 0, 0];
    const place = (id, a, b, c, wa, wb, wc) => {
      tmp[0] = a[0] * wa + b[0] * wb + c[0] * wc;
      tmp[1] = a[1] * wa + b[1] * wb + c[1] * wc;
      tmp[2] = a[2] * wa + b[2] * wb + c[2] * wc;
      const l = Math.hypot(tmp[0], tmp[1], tmp[2]);
      centerXYZ[3 * id] = tmp[0] / l;
      centerXYZ[3 * id + 1] = tmp[1] / l;
      centerXYZ[3 * id + 2] = tmp[2] / l;
    };
    const tri = new Uint32Array(3 * T);
    let tp = 0;
    const gid = new Int32Array((n + 1) * (n + 1));
    for (let f = 0; f < 20; f++) {
      const [fa, fb, fc] = faces[f], A = bv[fa], B = bv[fb], C = bv[fc], ids = [fa, fb, fc];
      for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) {
        const k = n - i - j, w = [k, i, j];
        let id;
        const zeros = (k === 0 ? 1 : 0) + (i === 0 ? 1 : 0) + (j === 0 ? 1 : 0);
        if (zeros === 2) id = ids[k === n ? 0 : i === n ? 1 : 2];
        else if (zeros === 1) {
          const slots = [0, 1, 2].filter((s) => w[s] > 0), u = ids[slots[0]], v = ids[slots[1]];
          const lo = Math.min(u, v), hi = Math.max(u, v), key = lo * 12 + hi;
          let base = edgeBase.get(key);
          if (base === void 0) {
            base = nextEdge;
            nextEdge += n - 1;
            edgeBase.set(key, base);
          }
          const wLo = u === lo ? w[slots[0]] : w[slots[1]];
          id = base + (wLo - 1);
          if (!(centerXYZ[3 * id] || centerXYZ[3 * id + 1] || centerXYZ[3 * id + 2])) place(id, A, B, C, k, i, j);
        } else {
          id = faceBase0 + f * interiorPerFace + rowStart[i] + (j - 1);
          place(id, A, B, C, k, i, j);
        }
        gid[i * (n + 1) + j] = id;
      }
      for (let i = 0; i < n; i++) for (let j = 0; i + j < n; j++) {
        const p = gid[i * (n + 1) + j], q = gid[(i + 1) * (n + 1) + j], r = gid[i * (n + 1) + j + 1];
        tri[tp++] = p;
        tri[tp++] = q;
        tri[tp++] = r;
        if (i + j < n - 1) {
          const s = gid[(i + 1) * (n + 1) + j + 1];
          tri[tp++] = q;
          tri[tp++] = s;
          tri[tp++] = r;
        }
      }
    }
    if (tp !== 3 * T) throw new Error(`\u4E09\u89D2\u5F62\u306E\u6570\u304C\u5408\u308F\u306A\u3044: ${tp / 3} != ${T}`);
    {
      const a = tri[0] * 3, b = tri[1] * 3, c = tri[2] * 3, P = [centerXYZ[a], centerXYZ[a + 1], centerXYZ[a + 2]];
      const Q = [centerXYZ[b], centerXYZ[b + 1], centerXYZ[b + 2]], R = [centerXYZ[c], centerXYZ[c + 1], centerXYZ[c + 2]];
      if (dot(cross(sub(Q, P), sub(R, P)), P) < 0) for (let t = 0; t < T; t++) {
        const x = tri[3 * t + 1];
        tri[3 * t + 1] = tri[3 * t + 2];
        tri[3 * t + 2] = x;
      }
    }
    const deg = new Uint32Array(V + 1);
    for (let t = 0; t < 3 * T; t++) deg[tri[t] + 1]++;
    const offs = new Uint32Array(V + 1);
    for (let i = 0; i < V; i++) offs[i + 1] = offs[i] + deg[i + 1];
    const fill = new Uint32Array(V), sV = new Uint32Array(3 * T), sW = new Uint32Array(3 * T), sT = new Uint32Array(3 * T);
    for (let t = 0; t < T; t++) for (let r = 0; r < 3; r++) {
      const u = tri[3 * t + r], v = tri[3 * t + (r + 1) % 3], w = tri[3 * t + (r + 2) % 3], s = offs[u] + fill[u]++;
      sV[s] = v;
      sW[s] = w;
      sT[s] = t;
    }
    const neighborIds = new Uint32Array(3 * T), cellVertexIds = new Uint32Array(3 * T);
    for (let u = 0; u < V; u++) {
      const s0 = offs[u], e0 = offs[u + 1], d = e0 - s0;
      let cur = s0;
      for (let k = 0; k < d; k++) {
        neighborIds[s0 + k] = sV[cur];
        cellVertexIds[s0 + k] = sT[cur];
        const want = sW[cur];
        let nx = -1;
        for (let s = s0; s < e0; s++) if (sV[s] === want) {
          nx = s;
          break;
        }
        if (nx < 0) throw new Error(`\u9802\u70B9 ${u} \u306E\u5468\u308A\u304C\u9589\u3058\u3066\u3044\u306A\u3044`);
        cur = nx;
      }
    }
    const vertexXYZ = new Float32Array(3 * T);
    for (let t = 0; t < T; t++) {
      const a = tri[3 * t] * 3, b = tri[3 * t + 1] * 3, c = tri[3 * t + 2] * 3;
      const x = centerXYZ[a] + centerXYZ[b] + centerXYZ[c], y = centerXYZ[a + 1] + centerXYZ[b + 1] + centerXYZ[c + 1], z = centerXYZ[a + 2] + centerXYZ[b + 2] + centerXYZ[c + 2], l = Math.hypot(x, y, z);
      vertexXYZ[3 * t] = x / l;
      vertexXYZ[3 * t + 1] = y / l;
      vertexXYZ[3 * t + 2] = z / l;
    }
    return { meshVersion: MESH_VERSION, n, cellCount: V, triangleCount: T, centerXYZ, neighborOffsets: offs, neighborIds, vertexXYZ, cellVertexOffsets: offs, cellVertexIds };
  }
  function latLonToXYZ(lat, lon) {
    const c = Math.cos(lat);
    return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat)];
  }
  function unprojectViewToSphere(u, v) {
    return latLonToXYZ(Math.PI / 2 - v * Math.PI, u * 2 * Math.PI - Math.PI);
  }
  function greatCircleRad(ax, ay, az, bx, by, bz) {
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz);
  }
  function sphericalTriangleArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const triple = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    const den = 1 + (ax * bx + ay * by + az * bz) + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az);
    return 2 * Math.atan2(Math.abs(triple), den);
  }
  function cellArea(mesh, c) {
    const s = mesh.cellVertexOffsets[c], e = mesh.cellVertexOffsets[c + 1], cx = mesh.centerXYZ[3 * c], cy = mesh.centerXYZ[3 * c + 1], cz = mesh.centerXYZ[3 * c + 2];
    let a = 0;
    for (let k = s; k < e; k++) {
      const p = mesh.cellVertexIds[k], q = mesh.cellVertexIds[k + 1 < e ? k + 1 : s];
      a += sphericalTriangleArea(cx, cy, cz, mesh.vertexXYZ[3 * p], mesh.vertexXYZ[3 * p + 1], mesh.vertexXYZ[3 * p + 2], mesh.vertexXYZ[3 * q], mesh.vertexXYZ[3 * q + 1], mesh.vertexXYZ[3 * q + 2]);
    }
    return a;
  }
  function meshHash(mesh) {
    let h = 2166136261;
    const mix = (v) => {
      h ^= v & 255;
      h = Math.imul(h, 16777619);
      h ^= v >>> 8 & 255;
      h = Math.imul(h, 16777619);
      h ^= v >>> 16 & 255;
      h = Math.imul(h, 16777619);
      h ^= v >>> 24 & 255;
      h = Math.imul(h, 16777619);
    };
    for (let i = 0; i < mesh.centerXYZ.length; i++) mix(Math.round(mesh.centerXYZ[i] * 1e6) | 0);
    for (let i = 0; i < mesh.neighborIds.length; i++) mix(mesh.neighborIds[i]);
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  // js/core/world/spec.js
  var GENERATOR_VERSION = "4.0.0-alpha.1";
  var WORLD_SPEC_SCHEMA = 1;
  var ISLAND_MODES = Object.freeze({ few: 12, normal: 40, many: 90 });
  var DEFAULT_WORLD_SPEC = Object.freeze({
    schemaVersion: WORLD_SPEC_SCHEMA,
    generatorVersion: GENERATOR_VERSION,
    worldSeed: "",
    planet: Object.freeze({ radiusKm: 6371, displayProjection: "equirectangular" }),
    resolution: Object.freeze({ targetCells: 25e4 }),
    landFraction: 0.5,
    continentCountTarget: 6,
    islandMode: "many",
    plateCount: 14,
    initialGroups: 12,
    climateModel: Object.freeze({ fantasyAdjustment: "default", lapseRateCPerKm: 6.5, windMoistureLengthKm: 4500 })
  });
  var isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  function normalizeWorldSpec(input = {}) {
    const errors = [], d = DEFAULT_WORLD_SPEC, i = isObj(input) ? input : {};
    const num = (v, def, lo, hi, name, int = false) => {
      if (v === void 0) return def;
      if (typeof v !== "number" || !Number.isFinite(v) || int && !Number.isInteger(v) || v < lo || v > hi) {
        errors.push(`${name} \u306F ${lo}\u301C${hi}${int ? " \u306E\u6574\u6570" : ""}\uFF08\u53D7\u3051\u53D6\u3063\u305F\u5024: ${String(v)}\uFF09`);
        return def;
      }
      return v;
    };
    const spec = {
      schemaVersion: WORLD_SPEC_SCHEMA,
      generatorVersion: typeof i.generatorVersion === "string" ? i.generatorVersion : GENERATOR_VERSION,
      worldSeed: typeof i.worldSeed === "string" ? i.worldSeed : i.worldSeed === void 0 ? "" : String(i.worldSeed),
      planet: {
        radiusKm: num(i.planet?.radiusKm, d.planet.radiusKm, 500, 1e5, "planet.radiusKm"),
        displayProjection: i.planet?.displayProjection ?? d.planet.displayProjection
      },
      resolution: { targetCells: num(i.resolution?.targetCells, d.resolution.targetCells, 500, 1e6, "resolution.targetCells", true) },
      landFraction: num(i.landFraction, d.landFraction, 0.1, 0.9, "landFraction"),
      continentCountTarget: num(i.continentCountTarget, d.continentCountTarget, 1, 12, "continentCountTarget", true),
      islandMode: i.islandMode ?? d.islandMode,
      plateCount: num(i.plateCount, d.plateCount, 4, 40, "plateCount", true),
      initialGroups: num(i.initialGroups, d.initialGroups, 1, 64, "initialGroups", true),
      climateModel: {
        fantasyAdjustment: i.climateModel?.fantasyAdjustment ?? d.climateModel.fantasyAdjustment,
        lapseRateCPerKm: num(i.climateModel?.lapseRateCPerKm, d.climateModel.lapseRateCPerKm, 0, 15, "climateModel.lapseRateCPerKm"),
        windMoistureLengthKm: num(i.climateModel?.windMoistureLengthKm, d.climateModel.windMoistureLengthKm, 200, 1e4, "climateModel.windMoistureLengthKm")
      }
    };
    if (!spec.worldSeed) errors.push("worldSeed \u304C\u7A7A\uFF08\u30B7\u30FC\u30C9\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u751F\u6210\u3059\u308B\u5834\u5408\u306F makeWorldSeed \u3092\u4F7F\u3046\uFF09");
    if (!(spec.islandMode in ISLAND_MODES)) {
      errors.push(`islandMode \u306F ${Object.keys(ISLAND_MODES).join("/")} \u306E\u3044\u305A\u308C\u304B`);
      spec.islandMode = d.islandMode;
    }
    if (spec.planet.displayProjection !== "equirectangular") errors.push("displayProjection \u306F\u73FE\u5728 equirectangular \u306E\u307F");
    if (isObj(input) && input.schemaVersion !== void 0 && input.schemaVersion !== WORLD_SPEC_SCHEMA) errors.push(`schemaVersion ${input.schemaVersion} \u306F\u672A\u5BFE\u5FDC`);
    return { spec, errors };
  }
  function makeWorldSeed(now = Date.now()) {
    const s = Math.floor(now).toString(36), r = Math.floor((now * 9301 + 49297) % 233280).toString(36);
    return `W-${s}-${r}`.toUpperCase();
  }

  // js/core/world/noise.js
  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = h << 13 | h >>> 19;
    }
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return (h ^ h >>> 16) >>> 0;
  }
  function makeRng(seedStr, stage = "") {
    let a = hashString(`${seedStr}::${stage}`);
    const next = () => {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + (hi - lo) * next();
    next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
    next.unitVec = () => {
      const z = next.range(-1, 1), t = next.range(0, 2 * Math.PI), r = Math.sqrt(1 - z * z);
      return [r * Math.cos(t), r * Math.sin(t), z];
    };
    return next;
  }
  function hash3(seed, x, y, z) {
    let h = seed ^ Math.imul(x, 668265261) ^ Math.imul(y, 374761393) ^ Math.imul(z, 2654435761);
    h = Math.imul(h ^ h >>> 15, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  var fade = (t) => t * t * (3 - 2 * t);
  function valueNoise3(seed, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
    const c000 = hash3(seed, xi, yi, zi), c100 = hash3(seed, xi + 1, yi, zi), c010 = hash3(seed, xi, yi + 1, zi), c110 = hash3(seed, xi + 1, yi + 1, zi);
    const c001 = hash3(seed, xi, yi, zi + 1), c101 = hash3(seed, xi + 1, yi, zi + 1), c011 = hash3(seed, xi, yi + 1, zi + 1), c111 = hash3(seed, xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx, x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  }
  function fbm3(seed, x, y, z, octaves = 4, freq = 1, gain = 0.5) {
    let sum = 0, amp = 1, norm2 = 0, f = freq;
    for (let o = 0; o < octaves; o++) {
      sum += amp * valueNoise3(seed + o * 101, x * f, y * f, z * f);
      norm2 += amp;
      amp *= gain;
      f *= 2.03;
    }
    return sum / norm2;
  }

  // js/core/world/worldgen.js
  var LAND_WATER = Object.freeze({ OCEAN: 0, LAND: 1, LAKE: 2 });
  var BIOMES = Object.freeze({ OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, TEMPERATE_FOREST: 4, GRASSLAND: 5, HOT_DESERT: 6, COLD_DESERT: 7, SAVANNA: 8, TROPICAL_SEASONAL: 9, RAINFOREST: 10, ALPINE: 11, WETLAND: 12, LAKE: 13 });
  var BIOME_NAMES = Object.freeze(["\u6D77", "\u6C37\u96EA", "\u30C4\u30F3\u30C9\u30E9", "\u30BF\u30A4\u30AC", "\u6E29\u5E2F\u6797", "\u8349\u539F", "\u71B1\u5E2F\u7802\u6F20", "\u5BD2\u51B7\u7802\u6F20", "\u30B5\u30D0\u30F3\u30CA", "\u71B1\u5E2F\u5B63\u7BC0\u6797", "\u71B1\u5E2F\u96E8\u6797", "\u9AD8\u5C71", "\u6E7F\u5730", "\u6E56"]);
  var SOILS = Object.freeze({ NONE: 0, ROCK: 1, SAND: 2, LOAM: 3, CLAY: 4, VOLCANIC: 5, PERMAFROST: 6, ALLUVIAL: 7, PODZOL: 8, BLACK_EARTH: 9 });
  var RES = Object.freeze({ IRON: 1, COPPER: 2, TIN: 4, GOLD: 8, COAL: 16, SALT: 32, TIMBER: 64, FISH: 128, STONE: 256, CLAY: 512, GEMS: 1024 });
  var RES_NAMES = Object.freeze({ 1: "\u9244", 2: "\u9285", 4: "\u932B", 8: "\u91D1", 16: "\u77F3\u70AD", 32: "\u5869", 64: "\u6728\u6750", 128: "\u6F01\u5834", 256: "\u77F3\u6750", 512: "\u7C98\u571F", 1024: "\u5B9D\u77F3" });
  var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  var D2R = Math.PI / 180;
  var MinHeap = class {
    constructor(cap) {
      this.k = new Float64Array(cap);
      this.v = new Int32Array(cap);
      this.n = 0;
    }
    push(key, val) {
      let i = this.n++;
      const k = this.k, v = this.v;
      while (i > 0) {
        const p = i - 1 >> 1;
        if (k[p] <= key) break;
        k[i] = k[p];
        v[i] = v[p];
        i = p;
      }
      k[i] = key;
      v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v, top = v[0], key = k[--this.n], val = v[this.n];
      let i = 0;
      const n = this.n;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = key;
      v[i] = val;
      return top;
    }
  };
  var Cancelled = class extends Error {
  };
  var makeStager = (onProgress, signal, timings) => (name, label, fn) => {
    if (signal?.aborted) throw new Cancelled("\u30AD\u30E3\u30F3\u30BB\u30EB\u3055\u308C\u307E\u3057\u305F");
    onProgress?.({ stage: name, label, fraction: 0 });
    const t = performance.now(), r = fn();
    timings[name] = Math.round(performance.now() - t);
    onProgress?.({ stage: name, label, fraction: 1, ms: timings[name] });
    return r;
  };
  function generateWorld(specInput, options = {}) {
    const { spec, errors } = normalizeWorldSpec(specInput);
    if (errors.length) throw new Error("WorldSpec \u304C\u4E0D\u6B63: " + errors.join(" / "));
    const timings = {}, stage = makeStager(options.onProgress, options.signal, timings), seed = spec.worldSeed, tAll = performance.now();
    const n = frequencyForCells(spec.resolution.targetCells);
    const mesh = stage("G1_mesh", "\u7403\u9762\u30E1\u30C3\u30B7\u30E5", () => buildSphereMesh(n));
    const V = mesh.cellCount, X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds, R = spec.planet.radiusKm;
    const lat = new Float32Array(V), lon = new Float32Array(V), areaKm2 = new Float32Array(V);
    stage("G1_derive", "\u7DEF\u5EA6\u7D4C\u5EA6\u30FB\u9762\u7A4D", () => {
      for (let c = 0; c < V; c++) {
        lat[c] = Math.asin(clamp(X[3 * c + 2], -1, 1));
        lon[c] = Math.atan2(X[3 * c + 1], X[3 * c]);
        areaKm2[c] = cellArea(mesh, c) * R * R;
      }
    });
    const spacingKm = Math.sqrt(4 * Math.PI * R * R / V), spacingRad = spacingKm / R;
    const ang = (a, b) => greatCircleRad(X[3 * a], X[3 * a + 1], X[3 * a + 2], X[3 * b], X[3 * b + 1], X[3 * b + 2]);
    const nSeed = (name) => hashString(`${seed}::noise::${name}`);
    const plate = new Uint8Array(V), mountain = new Float32Array(V), rift = new Float32Array(V), continent = new Float32Array(V);
    const volcanic = new Float32Array(V);
    stage("G2_plates", "\u30D7\u30EC\u30FC\u30C8\u30FB\u5927\u9678\u306E\u6982\u5F62", () => {
      const warpSeed = [nSeed("warpx"), nSeed("warpy"), nSeed("warpz")];
      const wx = new Float32Array(V), wy = new Float32Array(V), wz = new Float32Array(V);
      for (let c = 0; c < V; c++) {
        const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2];
        const w = (i) => (fbm3(warpSeed[i], x, y, z, 3, 1.5) - 0.5) * 0.32 + (fbm3(warpSeed[i] + 7, x, y, z, 3, 5.5) - 0.5) * 0.3;
        const ax = w(0), ay = w(1), az = w(2);
        const px = x + ax, py = y + ay, pz = z + az, l = Math.hypot(px, py, pz);
        wx[c] = px / l;
        wy[c] = py / l;
        wz[c] = pz / l;
      }
      const rp = makeRng(seed, "plates"), P = spec.plateCount, seeds = [], omega = [];
      for (let p = 0; p < P; p++) {
        seeds.push(rp.unitVec());
        const w = rp.unitVec(), sp = rp.range(0.4, 1.6);
        omega.push([w[0] * sp, w[1] * sp, w[2] * sp]);
      }
      for (let c = 0; c < V; c++) {
        let best = -2, bp = 0;
        for (let p = 0; p < P; p++) {
          const d = wx[c] * seeds[p][0] + wy[c] * seeds[p][1] + wz[c] * seeds[p][2];
          if (d > best) {
            best = d;
            bp = p;
          }
        }
        plate[c] = bp;
      }
      const vel = (p, c) => {
        const w = omega[p], x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2];
        return [w[1] * z - w[2] * y, w[2] * x - w[0] * z, w[0] * y - w[1] * x];
      };
      const srcStrength = new Float32Array(V), isSrc = new Uint8Array(V);
      for (let c = 0; c < V; c++) {
        let best = 0, bestAbs = 0;
        const vc = vel(plate[c], c);
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (plate[j] === plate[c]) continue;
          const vj = vel(plate[j], c);
          let dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2];
          const dl = Math.hypot(dx, dy, dz) || 1;
          dx /= dl;
          dy /= dl;
          dz /= dl;
          const conv = (vc[0] - vj[0]) * dx + (vc[1] - vj[1]) * dy + (vc[2] - vj[2]) * dz;
          if (Math.abs(conv) > bestAbs) {
            bestAbs = Math.abs(conv);
            best = conv;
          }
        }
        if (bestAbs > 0) {
          isSrc[c] = 1;
          srcStrength[c] = best;
        }
      }
      const widthCells = Math.max(2, 5 * D2R / spacingRad), maxD = Math.ceil(widthCells * 3);
      const dist = new Int16Array(V).fill(-1), from = new Int32Array(V).fill(-1), q = new Int32Array(V);
      let qh = 0, qt = 0;
      for (let c = 0; c < V; c++) if (isSrc[c]) {
        dist[c] = 0;
        from[c] = c;
        q[qt++] = c;
      }
      while (qh < qt) {
        const c = q[qh++];
        if (dist[c] >= maxD) continue;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (dist[j] < 0) {
            dist[j] = dist[c] + 1;
            from[j] = from[c];
            q[qt++] = j;
          }
        }
      }
      const nm = nSeed("ridge");
      for (let c = 0; c < V; c++) {
        if (dist[c] < 0) continue;
        const s = srcStrength[from[c]], f = Math.exp(-((dist[c] / widthCells) ** 2));
        const mod = 0.55 + 0.9 * fbm3(nm, X[3 * c] * 3, X[3 * c + 1] * 3, X[3 * c + 2] * 3, 3, 1.4);
        if (s > 0) {
          mountain[c] = clamp(s / 1.2, 0, 1.3) * f * mod;
          volcanic[c] = mountain[c] > 0.7 ? 0.5 : 0;
        } else rift[c] = clamp(-s / 1.2, 0, 1) * f;
      }
      const rc = makeRng(seed, "continents"), K = spec.continentCountTarget;
      const thetaLand = Math.acos(clamp(1 - 2 * spec.landFraction / K, -1, 1));
      let bestSet = null, bestSep = -1;
      for (let trial = 0; trial < 3e3; trial++) {
        const pts = [];
        for (let i = 0; i < K; i++) pts.push(rc.unitVec());
        let sep = 9;
        for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) sep = Math.min(sep, Math.acos(clamp(pts[i][0] * pts[j][0] + pts[i][1] * pts[j][1] + pts[i][2] * pts[j][2], -1, 1)));
        if (sep > bestSep) {
          bestSep = sep;
          bestSet = pts;
        }
      }
      const cs = bestSet.map((v) => ({ v, r: thetaLand * rc.range(0.8, 0.95) }));
      const isl = [];
      const NI = ISLAND_MODES[spec.islandMode];
      for (let i = 0; i < NI; i++) isl.push({ v: rc.unitVec(), r: rc.range(1.2, 5.5) * D2R, w: rc.range(0.45, 0.95) });
      const dotp = (c, v) => wx[c] * v[0] + wy[c] * v[1] + wz[c] * v[2];
      for (let c = 0; c < V; c++) {
        let f = 0;
        for (const o of cs) {
          const d = Math.acos(clamp(dotp(c, o.v), -1, 1)), t = clamp((1 - d / (o.r * 1.1)) * 2.2, 0, 1);
          f = Math.max(f, t * t * (3 - 2 * t));
        }
        for (const o of isl) {
          const d = Math.acos(clamp(dotp(c, o.v), -1, 1));
          if (d < o.r * 1.5) {
            const t = clamp(1 - d / (o.r * 1.5), 0, 1);
            f = Math.max(f, o.w * t * t * (3 - 2 * t));
          }
        }
        continent[c] = f;
      }
      const rh = makeRng(seed, "hotspots");
      for (let h = 0; h < 6; h++) {
        const start = rh.unitVec(), dirv = rh.unitVec(), count = rh.int(6, 14), step = rh.range(1.2, 2.2) * D2R;
        const dot2 = start[0] * dirv[0] + start[1] * dirv[1] + start[2] * dirv[2];
        let t = [dirv[0] - dot2 * start[0], dirv[1] - dot2 * start[1], dirv[2] - dot2 * start[2]];
        const tl = Math.hypot(...t) || 1;
        t = t.map((x) => x / tl);
        for (let i = 0; i < count; i++) {
          const a = i * step, p = [start[0] * Math.cos(a) + t[0] * Math.sin(a), start[1] * Math.cos(a) + t[1] * Math.sin(a), start[2] * Math.cos(a) + t[2] * Math.sin(a)], rad = rh.range(0.7, 1.6) * D2R * (1 - i / (count * 1.6)), amp = 0.9 * (1 - i / (count * 1.4));
          for (let c = 0; c < V; c++) {
            const d = Math.acos(clamp(X[3 * c] * p[0] + X[3 * c + 1] * p[1] + X[3 * c + 2] * p[2], -1, 1));
            if (d < rad * 2) {
              const g = Math.exp(-((d / rad) ** 2));
              continent[c] = Math.max(continent[c], amp * g * 0.9);
              volcanic[c] = Math.max(volcanic[c], g);
            }
          }
        }
      }
    });
    const elevation = new Float32Array(V);
    let seaLevelRaw = 0;
    stage("G3_elevation", "\u6A19\u9AD8\u30FB\u6D77\u5CB8\u30FB\u5CF6", () => {
      const s1 = nSeed("hills"), s2 = nSeed("detail"), s3 = nSeed("micro"), raw = new Float32Array(V);
      for (let c = 0; c < V; c++) {
        const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], cf = continent[c];
        const land = smooth((cf - 0.25) / 0.45);
        raw[c] = cf * 0.8 + (fbm3(s1, x, y, z, 5, 2.2) - 0.5) * (0.12 + 0.6 * land) + (fbm3(s2, x, y, z, 4, 9) - 0.5) * (0.06 + 0.16 * land) + (fbm3(s3, x, y, z, 3, 38) - 0.5) * (0.02 + 0.07 * land) + mountain[c] * (0.03 + 0.97 * land) * 1.5 - rift[c] * 0.22;
      }
      const sorted = Float32Array.from(raw).sort();
      seaLevelRaw = sorted[Math.min(V - 1, Math.max(0, Math.floor(V * (1 - spec.landFraction))))];
      const hi = sorted[Math.min(V - 1, Math.floor(V * 0.998))], lo = sorted[0];
      for (let c = 0; c < V; c++) {
        const e = raw[c] - seaLevelRaw;
        elevation[c] = e >= 0 ? Math.pow(Math.min(1.35, e / Math.max(1e-6, hi - seaLevelRaw)), 1.2) * 6500 : e / Math.max(1e-6, seaLevelRaw - lo) * 5500;
      }
    });
    const isSea = new Uint8Array(V);
    for (let c = 0; c < V; c++) isSea[c] = elevation[c] <= 0 ? 1 : 0;
    const coastDist = new Uint16Array(V);
    stage("G3_coast", "\u6D77\u5CB8\u304B\u3089\u306E\u8DDD\u96E2", () => {
      const q = new Int32Array(V);
      let qh = 0, qt = 0;
      const seen = new Uint8Array(V);
      for (let c = 0; c < V; c++) if (isSea[c]) {
        seen[c] = 1;
        q[qt++] = c;
      }
      while (qh < qt) {
        const c = q[qh++];
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!seen[j]) {
            seen[j] = 1;
            coastDist[j] = Math.min(65535, coastDist[c] + 1);
            q[qt++] = j;
          }
        }
      }
    });
    const temp = new Float32Array(V), precip = new Float32Array(V), biome = new Uint8Array(V);
    stage("G4_climate", "\u6C17\u5019", () => {
      const lapse = spec.climateModel.lapseRateCPerKm, Lkm = spec.climateModel.windMoistureLengthKm;
      for (let c = 0; c < V; c++) {
        const a = Math.abs(lat[c]) / (Math.PI / 2), h = Math.max(0, elevation[c]) / 1e3;
        temp[c] = 27.5 - 45 * Math.pow(a, 1.6) - lapse * h;
      }
      const up = new Int32Array(V).fill(-1);
      for (let c = 0; c < V; c++) {
        const la = Math.abs(lat[c]) / D2R, east = la < 30 ? -1 : la < 60 ? 1 : -1;
        const ex = -Math.sin(lon[c]), ey = Math.cos(lon[c]);
        const wx = -east * ex, wy = -east * ey;
        let best = -2, bj = -1;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          let dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2];
          const dl = Math.hypot(dx, dy, dz) || 1;
          const s = (dx * wx + dy * wy) / dl;
          if (s > best) {
            best = s;
            bj = j;
          }
        }
        up[c] = bj;
      }
      const pn = nSeed("precip"), decay = Math.exp(-spacingKm / Lkm), m = new Float32Array(V).fill(0.5), lift = new Float32Array(V);
      for (let c = 0; c < V; c++) if (isSea[c]) m[c] = 1;
      const passes = Math.min(200, Math.ceil(4e3 / spacingKm) + 4);
      for (let it = 0; it < passes; it++) for (let c = 0; c < V; c++) {
        if (isSea[c]) continue;
        const u = up[c], l = Math.max(0, elevation[c] - Math.max(0, elevation[u])) / 1e3;
        lift[c] = l;
        m[c] = clamp(m[u] * decay - 0.3 * l, 0.42, 1);
      }
      for (let c = 0; c < V; c++) {
        const la = Math.abs(lat[c]) / D2R, zonal = 250 + 1900 * Math.exp(-((la / 9) ** 2)) + 800 * Math.exp(-(((la - 55) / 12) ** 2));
        let p = zonal * (0.35 + 0.85 * m[c]) * (0.7 + 0.6 * fbm3(pn, X[3 * c], X[3 * c + 1], X[3 * c + 2], 3, 2.5)) + 900 * lift[c] * m[c] * (isSea[c] ? 0 : 1);
        if (!isSea[c] && elevation[c] > 3500) p *= 0.6;
        precip[c] = clamp(p, 0, 6e3);
      }
    });
    stage("G4_biome", "\u30D0\u30A4\u30AA\u30FC\u30E0", () => {
      for (let c = 0; c < V; c++) biome[c] = isSea[c] ? BIOMES.OCEAN : biomeOf(temp[c], precip[c], elevation[c]);
    });
    const parent = new Int32Array(V).fill(-1), filled = new Float32Array(V), flow = new Float32Array(V), basin = new Int32Array(V).fill(-1), landWater = new Uint8Array(V);
    let lakeCount = 0;
    stage("G5_rivers", "\u6C34\u7CFB", () => {
      const heap = new MinHeap(V + 16), done = new Uint8Array(V), order = new Int32Array(V);
      let on = 0;
      const EPS = 0.05;
      for (let c = 0; c < V; c++) filled[c] = elevation[c];
      for (let c = 0; c < V; c++) {
        if (!isSea[c]) continue;
        done[c] = 1;
        for (let k = off[c]; k < off[c + 1]; k++) if (!isSea[nb[k]]) {
          heap.push(filled[c], c);
          break;
        }
      }
      while (heap.n > 0) {
        const c = heap.pop();
        order[on++] = c;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (done[j]) continue;
          done[j] = 1;
          parent[j] = c;
          filled[j] = Math.max(elevation[j], filled[c] + EPS);
          heap.push(filled[j], j);
        }
      }
      for (let c = 0; c < V; c++) flow[c] = isSea[c] ? 0 : precip[c] * areaKm2[c] * 95e-7;
      for (let i = on - 1; i >= 0; i--) {
        const c = order[i], p = parent[c];
        if (p >= 0 && !isSea[c]) flow[p] += isSea[p] ? 0 : flow[c];
      }
      for (let i = 0; i < on; i++) {
        const c = order[i];
        if (isSea[c]) continue;
        const p = parent[c];
        basin[c] = isSea[p] ? c : basin[p];
      }
      for (let c = 0; c < V; c++) {
        if (isSea[c]) landWater[c] = LAND_WATER.OCEAN;
        else if (filled[c] - elevation[c] >= 40) {
          landWater[c] = LAND_WATER.LAKE;
          lakeCount++;
        } else landWater[c] = LAND_WATER.LAND;
      }
      for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAKE) biome[c] = BIOMES.LAKE;
    });
    let riverThreshold = 0;
    const river = new Uint8Array(V);
    stage("G5_riverset", "\u6CB3\u5DDD\u306E\u9078\u5B9A", () => {
      const f = [];
      for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND) f.push(flow[c]);
      f.sort((a, b) => a - b);
      riverThreshold = f.length ? f[Math.floor(f.length * 0.93)] : 0;
      for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && flow[c] >= riverThreshold && flow[c] > 0) river[c] = 1;
    });
    const soil = new Uint8Array(V), fertility = new Float32Array(V), resource = new Uint16Array(V), capacity = new Float32Array(V);
    stage("G6_soil", "\u571F\u58CC\u30FB\u80A5\u6C83\u5EA6\u30FB\u8CC7\u6E90", () => {
      const rs = ["iron", "copper", "tin", "gold", "coal", "gems"].map(nSeed), sSalt = nSeed("salt");
      for (let c = 0; c < V; c++) {
        const sea = isSea[c], land = !sea && landWater[c] === LAND_WATER.LAND, b = biome[c], e = elevation[c];
        let relief = 0, kn = 0;
        for (let k = off[c]; k < off[c + 1]; k++) {
          relief += Math.abs(elevation[nb[k]] - e);
          kn++;
        }
        relief /= Math.max(1, kn);
        const nearRiver = river[c] === 1;
        let res = 0;
        if (sea) {
          if (e > -300 && coastDistSea(c) <= 6) res |= RES.FISH;
        } else {
          const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], q = (i, f) => fbm3(rs[i], x, y, z, 3, f);
          if (land) {
            if (q(0, 7) > 0.6 && e > 300) res |= RES.IRON;
            if (q(1, 8) > 0.66 && (e > 500 || volcanic[c] > 0.3)) res |= RES.COPPER;
            if (q(2, 9) > 0.72 && e > 800) res |= RES.TIN;
            if (q(3, 10) > 0.74 && (nearRiver || mountain[c] > 0.4)) res |= RES.GOLD;
            if (q(4, 6) > 0.62 && e < 1500 && (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.WETLAND || b === BIOMES.TROPICAL_SEASONAL)) res |= RES.COAL;
            if (q(5, 11) > 0.78 && mountain[c] > 0.5) res |= RES.GEMS;
            if (e > 200 && relief > 120) res |= RES.STONE;
            if ((b === BIOMES.HOT_DESERT || b === BIOMES.COLD_DESERT) && e < 600 && fbm3(sSalt, x, y, z, 3, 8) > 0.6) res |= RES.SALT;
            if (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.TROPICAL_SEASONAL || b === BIOMES.RAINFOREST) res |= RES.TIMBER;
            if (relief < 80 && (nearRiver || coastDist[c] <= 2) && b !== BIOMES.HOT_DESERT) res |= RES.CLAY;
            if (nearRiver) res |= RES.FISH;
          } else if (landWater[c] === LAND_WATER.LAKE) res |= RES.FISH;
        }
        resource[c] = res;
        let sl = SOILS.NONE;
        if (!sea) {
          if (landWater[c] === LAND_WATER.LAKE) sl = SOILS.NONE;
          else if (b === BIOMES.ICE || b === BIOMES.TUNDRA) sl = SOILS.PERMAFROST;
          else if (e > 3500 || b === BIOMES.ALPINE) sl = SOILS.ROCK;
          else if (volcanic[c] > 0.3) sl = SOILS.VOLCANIC;
          else if (b === BIOMES.HOT_DESERT) sl = SOILS.SAND;
          else if (nearRiver && relief < 150 && elevation[c] < 800) sl = SOILS.ALLUVIAL;
          else if (b === BIOMES.TAIGA) sl = SOILS.PODZOL;
          else if (b === BIOMES.GRASSLAND) sl = SOILS.BLACK_EARTH;
          else if (b === BIOMES.WETLAND) sl = SOILS.CLAY;
          else sl = SOILS.LOAM;
        }
        soil[c] = sl;
        if (!sea && landWater[c] === LAND_WATER.LAND) {
          const t = temp[c], p = precip[c];
          const tf = t < -2 ? 0 : t < 8 ? (t + 2) / 10 * 0.6 : t <= 26 ? 1 : clamp(1 - (t - 26) / 12, 0.2, 1);
          const pf = p < 150 ? p / 150 * 0.15 : p < 600 ? 0.15 + (p - 150) / 450 * 0.85 : p <= 2200 ? 1 : clamp(1 - (p - 2200) / 3500, 0.5, 1);
          const sf = { [SOILS.NONE]: 0, [SOILS.ROCK]: 0.05, [SOILS.SAND]: 0.1, [SOILS.LOAM]: 0.85, [SOILS.CLAY]: 0.55, [SOILS.VOLCANIC]: 1.05, [SOILS.PERMAFROST]: 0.1, [SOILS.ALLUVIAL]: 1.2, [SOILS.PODZOL]: 0.5, [SOILS.BLACK_EARTH]: 1.15 }[sl];
          const slope = 1 - clamp(relief / 700, 0, 0.9), alt = 1 - clamp(Math.max(0, e - 1500) / 3e3, 0, 1);
          fertility[c] = clamp(tf * pf * sf * slope * alt, 0, 1);
          const density = fertility[c] * 12 * (1 + (nearRiver ? 0.5 : 0) + (coastDist[c] <= 1 ? 0.3 : 0));
          capacity[c] = density * areaKm2[c];
        }
      }
      function coastDistSea(c) {
        let fr = [c], seen = /* @__PURE__ */ new Set([c]);
        for (let d = 0; d <= 6; d++) {
          const nx = [];
          for (const u of fr) for (let k = off[u]; k < off[u + 1]; k++) {
            const j = nb[k];
            if (!isSea[j]) return d + 1;
            if (!seen.has(j)) {
              seen.add(j);
              nx.push(j);
            }
          }
          fr = nx;
          if (!fr.length) break;
        }
        return 99;
      }
    });
    const populations = stage("G7_groups", "\u521D\u671F\u4EBA\u53E3\u96C6\u56E3", () => {
      const rg = makeRng(seed, "groups"), cand = [];
      for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && fertility[c] > 0.35 && temp[c] > 4 && temp[c] < 30) cand.push({ c, s: fertility[c] * (1 + (river[c] ? 0.3 : 0) + (coastDist[c] <= 2 ? 0.2 : 0)) * (0.7 + 0.6 * rg()) });
      cand.sort((a, b) => b.s - a.s || a.c - b.c);
      const out = [], minSep = Math.min(0.25 * Math.PI, 2e3 / R) * 1;
      for (const { c } of cand) {
        if (out.length >= spec.initialGroups) break;
        if (out.every((o) => ang(o.cell, c) >= minSep)) out.push({ id: out.length + 1, cell: c, lat: lat[c] / D2R, lon: lon[c] / D2R, size: Math.round(rg.range(150, 600)), subsistence: "forage", species: "human" });
      }
      return out;
    });
    const stats = stage("G8_stats", "\u7D71\u8A08", () => computeStats({ V, off, nb, landWater, isSea, elevation, temp, precip, biome, flow, riverThreshold, river, lakeCount, parent, lat, areaKm2, populations, spec }));
    const world2 = {
      spec: { ...spec, generatorVersion: GENERATOR_VERSION },
      mesh,
      cell: { elevation, landWater, plate, temp, precip, biome, soil, fertility, resource, riverTo: parent, riverFlow: flow, river, basin, coastDist, capacity, areaKm2, lat, lon, volcanic, filled, continent, mountain },
      entities: { populations },
      stats,
      timings
    };
    timings.total = Math.round(performance.now() - tAll);
    world2.hash = worldHash(world2);
    return world2;
  }
  function biomeOf(T, P, e) {
    if (e > 4500 || e > 3500 && T < 0) return BIOMES.ALPINE;
    if (T < -8) return BIOMES.ICE;
    if (T < 0) return BIOMES.TUNDRA;
    if (T < 5) return P > 300 ? BIOMES.TAIGA : BIOMES.COLD_DESERT;
    if (T < 18) return P < 200 ? BIOMES.COLD_DESERT : P < 600 ? BIOMES.GRASSLAND : P > 2600 ? BIOMES.WETLAND : BIOMES.TEMPERATE_FOREST;
    if (P < 250) return BIOMES.HOT_DESERT;
    if (P < 900) return BIOMES.SAVANNA;
    if (P < 1800) return BIOMES.TROPICAL_SEASONAL;
    return BIOMES.RAINFOREST;
  }
  function landmasses(V, off, nb, isSea) {
    const comp = new Int32Array(V).fill(-1), sizes = [];
    const q = new Int32Array(V);
    for (let s = 0; s < V; s++) {
      if (isSea[s] || comp[s] >= 0) continue;
      let qh = 0, qt = 0;
      q[qt++] = s;
      comp[s] = sizes.length;
      let cnt = 0;
      while (qh < qt) {
        const c = q[qh++];
        cnt++;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!isSea[j] && comp[j] < 0) {
            comp[j] = comp[s];
            q[qt++] = j;
          }
        }
      }
      sizes.push(cnt);
    }
    return { comp, sizes };
  }
  function computeStats(a) {
    const { V, off, nb, isSea, landWater, elevation, temp, biome, lat, riverThreshold, river, lakeCount, parent, populations } = a;
    let mouthCount = 0;
    for (let c = 0; c < V; c++) if (river[c] && parent[c] >= 0 && isSea[parent[c]]) mouthCount++;
    let sea = 0, lake = 0, mount = 0, rivers = 0, cold = 0;
    for (let c = 0; c < V; c++) {
      if (isSea[c]) sea++;
      else {
        if (landWater[c] === LAND_WATER.LAKE) lake++;
        if (elevation[c] > 2500) mount++;
        if (river[c]) rivers++;
      }
    }
    const landCells = V - sea, { sizes } = landmasses(V, off, nb, isSea), total = sizes.reduce((s, x) => s + x, 0);
    const continents = sizes.filter((s) => s >= total * 0.03), islands = sizes.filter((s) => s < total * 0.03);
    const biomeCounts = new Array(14).fill(0);
    for (let c = 0; c < V; c++) biomeCounts[biome[c]]++;
    let tl = 0, nl = 0, th = 0, nh = 0;
    for (let c = 0; c < V; c++) {
      if (isSea[c]) continue;
      const la = Math.abs(lat[c]) / D2R;
      if (la < 20) {
        tl += temp[c];
        nl++;
      } else if (la > 60) {
        th += temp[c];
        nh++;
      }
    }
    return {
      cells: V,
      landFraction: landCells / V,
      lakeFraction: lake / V,
      mountainFraction: mount / Math.max(1, landCells),
      riverCells: rivers,
      riverFlowThreshold: riverThreshold,
      riverMouths: mouthCount,
      lakeCells: lakeCount,
      continentCount: continents.length,
      continentShares: continents.map((s) => +(s / total).toFixed(3)).sort((x, y) => y - x),
      islandCount: islands.length,
      largestIslandCells: islands.length ? Math.max(...islands) : 0,
      meanTempLow: nl ? tl / nl : null,
      meanTempHigh: nh ? th / nh : null,
      biomeCounts,
      initialGroups: populations.length
    };
  }
  function validateWorld(world2) {
    const errs = [], { cell, mesh } = world2, V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds;
    for (const k of ["elevation", "temp", "precip", "riverFlow", "fertility", "capacity"]) for (let c = 0; c < V; c++) if (!Number.isFinite(cell[k][c])) {
      errs.push(`${k}[${c}] \u304C\u6709\u9650\u3067\u306A\u3044`);
      break;
    }
    const state = new Uint8Array(V);
    const stack = [];
    for (let s = 0; s < V; s++) {
      if (state[s]) continue;
      let c = s;
      stack.length = 0;
      while (true) {
        if (cell.landWater[c] === LAND_WATER.OCEAN) {
          state[c] = 2;
          break;
        }
        if (state[c] === 2) break;
        if (state[c] === 1) {
          errs.push(`\u6D41\u8DEF\u306B\u5FAA\u74B0: ${c}`);
          break;
        }
        state[c] = 1;
        stack.push(c);
        const p = cell.riverTo[c];
        if (p < 0) {
          errs.push(`\u884C\u304D\u6B62\u307E\u308A\u306E\u6D41\u8DEF: ${c}`);
          break;
        }
        let adj = false;
        for (let k = off[c]; k < off[c + 1]; k++) if (nb[k] === p) {
          adj = true;
          break;
        }
        if (!adj) {
          errs.push(`\u6D41\u8DEF\u304C\u96A3\u63A5\u3057\u3066\u3044\u306A\u3044: ${c}\u2192${p}`);
          break;
        }
        c = p;
      }
      const ok = state[c] === 2;
      for (const u of stack) state[u] = ok ? 2 : state[u];
      if (errs.length > 20) break;
    }
    for (let c = 0; c < V; c++) {
      if (cell.elevation[c] <= 0 !== (cell.landWater[c] === LAND_WATER.OCEAN)) {
        errs.push(`\u6D77\u9678\u3068\u6A19\u9AD8\u304C\u4E0D\u4E00\u81F4: ${c}`);
        break;
      }
    }
    for (const p of world2.entities.populations) {
      if (cell.landWater[p.cell] !== LAND_WATER.LAND) errs.push(`\u521D\u671F\u96C6\u56E3 ${p.id} \u304C\u9678\u306B\u3044\u306A\u3044`);
    }
    return errs;
  }
  function worldHash(world2) {
    let h = 2166136261;
    const { cell } = world2;
    const mix = (v) => {
      h ^= v & 255;
      h = Math.imul(h, 16777619);
      h ^= v >>> 8 & 255;
      h = Math.imul(h, 16777619);
      h ^= v >>> 16 & 255;
      h = Math.imul(h, 16777619);
      h ^= v >>> 24 & 255;
      h = Math.imul(h, 16777619);
    };
    for (let i = 0; i < cell.elevation.length; i++) mix(Math.round(cell.elevation[i]) | 0);
    for (let i = 0; i < cell.landWater.length; i++) mix(cell.landWater[i] | cell.biome[i] << 8 | cell.soil[i] << 16);
    for (let i = 0; i < cell.riverTo.length; i++) mix(cell.riverTo[i] | 0);
    for (let i = 0; i < cell.resource.length; i++) mix(cell.resource[i]);
    mix(meshHash(world2.mesh).length);
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  function statsProblems(st, spec) {
    const r = [];
    if (Math.abs(st.landFraction - spec.landFraction) > 0.04) r.push(`\u9678\u5730\u7387 ${st.landFraction.toFixed(3)} \u304C\u76EE\u6A19 ${spec.landFraction} \u304B\u3089\u5916\u308C\u3066\u3044\u308B`);
    const K = spec.continentCountTarget;
    if (st.continentCount < Math.max(1, K - 2) || st.continentCount > K + 3) r.push(`\u5927\u9678\u7D1A\u306E\u9678\u584A\u304C ${st.continentCount} \u500B\uFF08\u76EE\u6A19 ${K}\uFF09`);
    if (spec.islandMode === "many" && st.islandCount < 20) r.push(`\u5CF6\u304C\u5C11\u306A\u3044\uFF08${st.islandCount}\uFF09`);
    if (st.continentShares[0] > 0.45) r.push(`\u6700\u5927\u306E\u9678\u584A\u304C\u9678\u306E ${(st.continentShares[0] * 100).toFixed(0)}%\uFF08\u504F\u308A\u3059\u304E\uFF09`);
    if (st.meanTempLow != null && st.meanTempHigh != null && st.meanTempLow <= st.meanTempHigh + 10) r.push("\u4F4E\u7DEF\u5EA6\u304C\u9AD8\u7DEF\u5EA6\u3088\u308A\u5341\u5206\u306B\u6696\u304B\u304F\u306A\u3044");
    return r;
  }

  // js/tools/worldgen-preview.js
  var $ = (id) => document.getElementById(id);
  var BC = [[20, 50, 110], [235, 240, 245], [160, 175, 150], [60, 105, 80], [60, 140, 70], [150, 180, 80], [225, 195, 120], [190, 180, 160], [190, 175, 80], [90, 150, 50], [20, 100, 40], [130, 120, 120], [80, 130, 120], [70, 130, 200]];
  var world = null;
  var pixelCell = null;
  var PW = 0;
  var PH = 0;
  function buildPixelMap(w, W, H) {
    const m = w.mesh, X = m.centerXYZ, off = m.neighborOffsets, nb = m.neighborIds, map = new Int32Array(W * H);
    let cur = 0;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const [x, y, z] = unprojectViewToSphere((px + 0.5) / W, (py + 0.5) / H);
      let best = X[3 * cur] * x + X[3 * cur + 1] * y + X[3 * cur + 2] * z;
      for (; ; ) {
        let bj = -1;
        for (let k = off[cur]; k < off[cur + 1]; k++) {
          const j = nb[k], d = X[3 * j] * x + X[3 * j + 1] * y + X[3 * j + 2] * z;
          if (d > best) {
            best = d;
            bj = j;
          }
        }
        if (bj < 0) break;
        cur = bj;
      }
      map[py * W + px] = cur;
    }
    return map;
  }
  function colorOf(c, layer, cell) {
    const e = cell.elevation[c];
    if (layer === "elevation") return e <= 0 ? [20, 40 + 40 * (1 + e / 5500), 110 + 60 * (1 + e / 5500)] : [60 + 160 * (e / 7e3), 120 + 90 * (e / 7e3), 60 + 140 * (e / 7e3)];
    if (layer === "temp") {
      const t = Math.max(0, Math.min(1, (cell.temp[c] + 25) / 60));
      return [255 * t, 80, 255 * (1 - t)];
    }
    if (layer === "precip") {
      const t = Math.min(1, cell.precip[c] / 3e3);
      return [230 - 200 * t, 230 - 120 * t, 200 + 50 * t];
    }
    if (layer === "fertility") {
      const t = cell.fertility[c];
      return cell.landWater[c] === 0 ? [20, 50, 110] : [230 - 200 * t, 220 - 40 * t, 120 - 80 * t];
    }
    let col = BC[cell.biome[c]].slice();
    if (cell.biome[c] === 0) {
      const d = 0.55 + 0.45 * (1 + e / 5500);
      col = col.map((v) => v * d);
    } else if (cell.biome[c] !== 13) {
      const s = 0.75 + 0.25 * Math.min(1, e / 4e3);
      col = col.map((v) => v * s);
    }
    if (cell.river[c] && layer === "biome") col = [40, 90, 220];
    return col;
  }
  function draw() {
    if (!world) return;
    const cv = $("map"), g = cv.getContext("2d"), t0 = performance.now(), layer = $("layer").value, W = cv.width, H = cv.height;
    if (!pixelCell || PW !== W || PH !== H) {
      pixelCell = buildPixelMap(world, W, H);
      PW = W;
      PH = H;
    }
    const img = g.createImageData(W, H), cell = world.cell;
    for (let i = 0; i < W * H; i++) {
      const col = colorOf(pixelCell[i], layer, cell);
      img.data[4 * i] = col[0];
      img.data[4 * i + 1] = col[1];
      img.data[4 * i + 2] = col[2];
      img.data[4 * i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    $("redraw").textContent = `${(performance.now() - t0).toFixed(0)} ms\uFF08${W}\xD7${H} \u3092\u5168\u90E8\u63CF\u304D\u76F4\u3057\u305F\u6642\u9593\u3002\u672C\u7269\u306E\u30EC\u30F3\u30C0\u30E9\u30FC\u3067\u306F\u306A\u3044\uFF09`;
  }
  function run() {
    const seed = $("seed").value.trim() || makeWorldSeed(), cells = Number($("cells").value) || 25e4;
    $("seed").value = seed;
    $("status").textContent = "\u751F\u6210\u4E2D\u2026\uFF08\u3053\u306E\u9593\u3001\u753B\u9762\u306F\u6B62\u307E\u308A\u307E\u3059\uFF09";
    setTimeout(() => {
      try {
        const t0 = performance.now();
        world = generateWorld({ worldSeed: seed, resolution: { targetCells: cells } });
        const ms = performance.now() - t0;
        pixelCell = null;
        const errs = validateWorld(world), prob = statsProblems(world.stats, world.spec), st = world.stats;
        $("status").textContent = `\u5B8C\u4E86: ${world.mesh.cellCount.toLocaleString()} \u30BB\u30EB / \u751F\u6210 ${ms.toFixed(0)} ms / \u691C\u67FB ${errs.length ? "NG " + errs.slice(0, 3).join(", ") : "OK"}`;
        $("timings").textContent = Object.entries(world.timings).map(([k, v]) => `${k}: ${v} ms`).join("\n");
        $("stats").textContent = [`\u7AEF\u672B: ${navigator.userAgent}`, `\u9678\u5730\u7387 ${(st.landFraction * 100).toFixed(1)}%`, `\u5927\u9678\u7D1A ${st.continentCount}\uFF08${st.continentShares.join(", ")}\uFF09\uFF0F\u5CF6 ${st.islandCount}`, `\u6CB3\u5DDD\u30BB\u30EB ${st.riverCells}\uFF0F\u6CB3\u53E3 ${st.riverMouths}\uFF0F\u6E56 ${st.lakeCells}`, `\u521D\u671F\u96C6\u56E3 ${st.initialGroups}`, `\u30CF\u30C3\u30B7\u30E5 ${world.hash}`, prob.length ? "\u8A31\u5BB9\u5E2F\u306E\u5916: " + prob.join(" / ") : "\u7D71\u8A08\u306F\u8A31\u5BB9\u5E2F\u306E\u5185"].join("\n");
        draw();
      } catch (e) {
        $("status").textContent = "\u5931\u6557: " + e.message;
      }
    }, 30);
  }
  $("gen").addEventListener("click", run);
  $("layer").addEventListener("change", draw);
  $("rand").addEventListener("click", () => {
    $("seed").value = makeWorldSeed();
  });
  $("map").addEventListener("mousemove", (ev) => {
    if (!world || !pixelCell) return;
    const r = ev.target.getBoundingClientRect(), px = Math.floor((ev.clientX - r.left) / r.width * PW), py = Math.floor((ev.clientY - r.top) / r.height * PH), c = pixelCell[py * PW + px], cell = world.cell;
    const res = Object.entries(RES_NAMES).filter(([b]) => cell.resource[c] & Number(b)).map(([, n]) => n).join("\u30FB") || "\u306A\u3057";
    $("hover").textContent = `\u30BB\u30EB ${c}\uFF5C\u7DEF\u5EA6 ${(cell.lat[c] * 57.2958).toFixed(1)}\xB0 \u7D4C\u5EA6 ${(cell.lon[c] * 57.2958).toFixed(1)}\xB0\uFF5C\u6A19\u9AD8 ${cell.elevation[c].toFixed(0)} m\uFF5C${BIOME_NAMES[cell.biome[c]]}\uFF5C${cell.temp[c].toFixed(1)}\u2103\uFF5C\u964D\u6C34 ${cell.precip[c].toFixed(0)} mm\uFF5C\u80A5\u6C83\u5EA6 ${cell.fertility[c].toFixed(2)}\uFF5C\u8CC7\u6E90 ${res}`;
  });
})();
