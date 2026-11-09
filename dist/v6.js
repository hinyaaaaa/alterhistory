(() => {
  // js/core/world/sphere-mesh.js
  var MESH_VERSION = "sphere-ico-1";
  var cellCountForFrequency = (n2) => 10 * n2 * n2 + 2;
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
    const fixed = faces.map(([p, q2, r]) => {
      const A2 = verts[p], B = verts[q2], C = verts[r];
      return dot(cross(sub(B, A2), sub(C, A2)), A2) >= 0 ? [p, q2, r] : [p, r, q2];
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
  function buildSphereMesh(n2) {
    if (!Number.isInteger(n2) || n2 < 1) throw new Error("\u5468\u6CE2\u6570 n \u306F 1 \u4EE5\u4E0A\u306E\u6574\u6570");
    const { verts: bv, faces } = baseIcosahedron();
    const V = cellCountForFrequency(n2), T3 = 20 * n2 * n2;
    const centerXYZ = new Float32Array(3 * V);
    for (let i = 0; i < 12; i++) {
      centerXYZ[3 * i] = bv[i][0];
      centerXYZ[3 * i + 1] = bv[i][1];
      centerXYZ[3 * i + 2] = bv[i][2];
    }
    const edgeBase = /* @__PURE__ */ new Map();
    let nextEdge = 12;
    const interiorPerFace = (n2 - 1) * (n2 - 2) / 2, faceBase0 = 12 + 30 * (n2 - 1);
    const rowStart = new Int32Array(n2 + 1);
    for (let i = 1, acc = 0; i <= n2 - 2; i++) {
      rowStart[i] = acc;
      acc += n2 - 1 - i;
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
    const tri2 = new Uint32Array(3 * T3);
    let tp = 0;
    const gid = new Int32Array((n2 + 1) * (n2 + 1));
    for (let f2 = 0; f2 < 20; f2++) {
      const [fa, fb, fc] = faces[f2], A2 = bv[fa], B = bv[fb], C = bv[fc], ids = [fa, fb, fc];
      for (let i = 0; i <= n2; i++) for (let j = 0; i + j <= n2; j++) {
        const k = n2 - i - j, w = [k, i, j];
        let id;
        const zeros = (k === 0 ? 1 : 0) + (i === 0 ? 1 : 0) + (j === 0 ? 1 : 0);
        if (zeros === 2) id = ids[k === n2 ? 0 : i === n2 ? 1 : 2];
        else if (zeros === 1) {
          const slots = [0, 1, 2].filter((s) => w[s] > 0), u = ids[slots[0]], v = ids[slots[1]];
          const lo = Math.min(u, v), hi = Math.max(u, v), key = lo * 12 + hi;
          let base = edgeBase.get(key);
          if (base === void 0) {
            base = nextEdge;
            nextEdge += n2 - 1;
            edgeBase.set(key, base);
          }
          const wLo = u === lo ? w[slots[0]] : w[slots[1]];
          id = base + (wLo - 1);
          if (!(centerXYZ[3 * id] || centerXYZ[3 * id + 1] || centerXYZ[3 * id + 2])) place(id, A2, B, C, k, i, j);
        } else {
          id = faceBase0 + f2 * interiorPerFace + rowStart[i] + (j - 1);
          place(id, A2, B, C, k, i, j);
        }
        gid[i * (n2 + 1) + j] = id;
      }
      for (let i = 0; i < n2; i++) for (let j = 0; i + j < n2; j++) {
        const p = gid[i * (n2 + 1) + j], q2 = gid[(i + 1) * (n2 + 1) + j], r = gid[i * (n2 + 1) + j + 1];
        tri2[tp++] = p;
        tri2[tp++] = q2;
        tri2[tp++] = r;
        if (i + j < n2 - 1) {
          const s = gid[(i + 1) * (n2 + 1) + j + 1];
          tri2[tp++] = q2;
          tri2[tp++] = s;
          tri2[tp++] = r;
        }
      }
    }
    if (tp !== 3 * T3) throw new Error(`\u4E09\u89D2\u5F62\u306E\u6570\u304C\u5408\u308F\u306A\u3044: ${tp / 3} != ${T3}`);
    {
      const a = tri2[0] * 3, b = tri2[1] * 3, c = tri2[2] * 3, P2 = [centerXYZ[a], centerXYZ[a + 1], centerXYZ[a + 2]];
      const Q = [centerXYZ[b], centerXYZ[b + 1], centerXYZ[b + 2]], R = [centerXYZ[c], centerXYZ[c + 1], centerXYZ[c + 2]];
      if (dot(cross(sub(Q, P2), sub(R, P2)), P2) < 0) for (let t = 0; t < T3; t++) {
        const x = tri2[3 * t + 1];
        tri2[3 * t + 1] = tri2[3 * t + 2];
        tri2[3 * t + 2] = x;
      }
    }
    const deg = new Uint32Array(V + 1);
    for (let t = 0; t < 3 * T3; t++) deg[tri2[t] + 1]++;
    const offs = new Uint32Array(V + 1);
    for (let i = 0; i < V; i++) offs[i + 1] = offs[i] + deg[i + 1];
    const fill = new Uint32Array(V), sV = new Uint32Array(3 * T3), sW = new Uint32Array(3 * T3), sT = new Uint32Array(3 * T3);
    for (let t = 0; t < T3; t++) for (let r = 0; r < 3; r++) {
      const u = tri2[3 * t + r], v = tri2[3 * t + (r + 1) % 3], w = tri2[3 * t + (r + 2) % 3], s = offs[u] + fill[u]++;
      sV[s] = v;
      sW[s] = w;
      sT[s] = t;
    }
    const neighborIds = new Uint32Array(3 * T3), cellVertexIds = new Uint32Array(3 * T3);
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
    const vertexXYZ = new Float32Array(3 * T3);
    for (let t = 0; t < T3; t++) {
      const a = tri2[3 * t] * 3, b = tri2[3 * t + 1] * 3, c = tri2[3 * t + 2] * 3;
      const x = centerXYZ[a] + centerXYZ[b] + centerXYZ[c], y = centerXYZ[a + 1] + centerXYZ[b + 1] + centerXYZ[c + 1], z = centerXYZ[a + 2] + centerXYZ[b + 2] + centerXYZ[c + 2], l = Math.hypot(x, y, z);
      vertexXYZ[3 * t] = x / l;
      vertexXYZ[3 * t + 1] = y / l;
      vertexXYZ[3 * t + 2] = z / l;
    }
    return { meshVersion: MESH_VERSION, n: n2, cellCount: V, triangleCount: T3, centerXYZ, neighborOffsets: offs, neighborIds, vertexXYZ, cellVertexOffsets: offs, cellVertexIds };
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
      const p = mesh.cellVertexIds[k], q2 = mesh.cellVertexIds[k + 1 < e ? k + 1 : s];
      a += sphericalTriangleArea(cx, cy, cz, mesh.vertexXYZ[3 * p], mesh.vertexXYZ[3 * p + 1], mesh.vertexXYZ[3 * p + 2], mesh.vertexXYZ[3 * q2], mesh.vertexXYZ[3 * q2 + 1], mesh.vertexXYZ[3 * q2 + 2]);
    }
    return a;
  }
  function meshHash(mesh) {
    let h2 = 2166136261;
    const mix = (v) => {
      h2 ^= v & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 8 & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 16 & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 24 & 255;
      h2 = Math.imul(h2, 16777619);
    };
    for (let i = 0; i < mesh.centerXYZ.length; i++) mix(Math.round(mesh.centerXYZ[i] * 1e6) | 0);
    for (let i = 0; i < mesh.neighborIds.length; i++) mix(mesh.neighborIds[i]);
    return (h2 >>> 0).toString(16).padStart(8, "0");
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
    landFraction: 0.3,
    // v6.1.0: 0.5 → 0.3（地球の陸地率は約 29%）。海を渡る拡散を直したので、地球並みでも人類は全大陸に広がる
    continentCountTarget: 6,
    islandMode: "many",
    plateCount: 14,
    initialGroups: 12,
    climateModel: Object.freeze({ fantasyAdjustment: "default", lapseRateCPerKm: 6.5, windMoistureLengthKm: 4500 })
  });
  var isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  function normalizeWorldSpec(input = {}) {
    const errors = [], d = DEFAULT_WORLD_SPEC, i = isObj(input) ? input : {};
    const num2 = (v, def, lo, hi, name, int = false) => {
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
        radiusKm: num2(i.planet?.radiusKm, d.planet.radiusKm, 500, 1e5, "planet.radiusKm"),
        displayProjection: i.planet?.displayProjection ?? d.planet.displayProjection
      },
      resolution: { targetCells: num2(i.resolution?.targetCells, d.resolution.targetCells, 500, 1e6, "resolution.targetCells", true) },
      landFraction: num2(i.landFraction, d.landFraction, 0.1, 0.9, "landFraction"),
      continentCountTarget: num2(i.continentCountTarget, d.continentCountTarget, 1, 12, "continentCountTarget", true),
      islandMode: i.islandMode ?? d.islandMode,
      plateCount: num2(i.plateCount, d.plateCount, 4, 40, "plateCount", true),
      initialGroups: num2(i.initialGroups, d.initialGroups, 1, 64, "initialGroups", true),
      climateModel: {
        fantasyAdjustment: i.climateModel?.fantasyAdjustment ?? d.climateModel.fantasyAdjustment,
        lapseRateCPerKm: num2(i.climateModel?.lapseRateCPerKm, d.climateModel.lapseRateCPerKm, 0, 15, "climateModel.lapseRateCPerKm"),
        windMoistureLengthKm: num2(i.climateModel?.windMoistureLengthKm, d.climateModel.windMoistureLengthKm, 200, 1e4, "climateModel.windMoistureLengthKm")
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

  // js/core/world/noise.js
  function hashString(str) {
    let h2 = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h2 = Math.imul(h2 ^ str.charCodeAt(i), 3432918353);
      h2 = h2 << 13 | h2 >>> 19;
    }
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507);
    h2 = Math.imul(h2 ^ h2 >>> 13, 3266489909);
    return (h2 ^ h2 >>> 16) >>> 0;
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
    let h2 = seed ^ Math.imul(x, 668265261) ^ Math.imul(y, 374761393) ^ Math.imul(z, 2654435761);
    h2 = Math.imul(h2 ^ h2 >>> 15, 2246822507);
    h2 = Math.imul(h2 ^ h2 >>> 13, 3266489909);
    return ((h2 ^ h2 >>> 16) >>> 0) / 4294967296;
  }
  var fade = (t) => t * t * (3 - 2 * t);
  function valueNoise3(seed, x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx3 = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
    const c000 = hash3(seed, xi, yi, zi), c100 = hash3(seed, xi + 1, yi, zi), c010 = hash3(seed, xi, yi + 1, zi), c110 = hash3(seed, xi + 1, yi + 1, zi);
    const c001 = hash3(seed, xi, yi, zi + 1), c101 = hash3(seed, xi + 1, yi, zi + 1), c011 = hash3(seed, xi, yi + 1, zi + 1), c111 = hash3(seed, xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * fx3, x10 = c010 + (c110 - c010) * fx3, x01 = c001 + (c101 - c001) * fx3, x11 = c011 + (c111 - c011) * fx3;
    const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
    return y0 + (y1 - y0) * fz;
  }
  function fbm3(seed, x, y, z, octaves = 4, freq = 1, gain = 0.5) {
    let sum = 0, amp = 1, norm2 = 0, f2 = freq;
    for (let o = 0; o < octaves; o++) {
      sum += amp * valueNoise3(seed + o * 101, x * f2, y * f2, z * f2);
      norm2 += amp;
      amp *= gain;
      f2 *= 2.03;
    }
    return sum / norm2;
  }
  function makeFbm3(seed, octaves = 4, freq = 1, gain = 0.5) {
    const O = octaves, kx = new Int32Array(O).fill(2147483647), ky = new Int32Array(O), kz = new Int32Array(O), cv = new Float64Array(O * 8), fs = new Float64Array(O), sd = new Int32Array(O);
    let f2 = freq, norm2 = 0, amp = 1;
    const amps = new Float64Array(O);
    for (let o = 0; o < O; o++) {
      fs[o] = f2;
      sd[o] = seed + o * 101;
      amps[o] = amp;
      norm2 += amp;
      amp *= gain;
      f2 *= 2.03;
    }
    return (x, y, z) => {
      let sum = 0;
      for (let o = 0; o < O; o++) {
        const X = x * fs[o], Y = y * fs[o], Z = z * fs[o], xi = Math.floor(X), yi = Math.floor(Y), zi = Math.floor(Z), b = o * 8;
        if (xi !== kx[o] || yi !== ky[o] || zi !== kz[o]) {
          const s0 = sd[o];
          kx[o] = xi;
          ky[o] = yi;
          kz[o] = zi;
          cv[b] = hash3(s0, xi, yi, zi);
          cv[b + 1] = hash3(s0, xi + 1, yi, zi);
          cv[b + 2] = hash3(s0, xi, yi + 1, zi);
          cv[b + 3] = hash3(s0, xi + 1, yi + 1, zi);
          cv[b + 4] = hash3(s0, xi, yi, zi + 1);
          cv[b + 5] = hash3(s0, xi + 1, yi, zi + 1);
          cv[b + 6] = hash3(s0, xi, yi + 1, zi + 1);
          cv[b + 7] = hash3(s0, xi + 1, yi + 1, zi + 1);
        }
        const fx3 = fade(X - xi), fy = fade(Y - yi), fz = fade(Z - zi);
        const x00 = cv[b] + (cv[b + 1] - cv[b]) * fx3, x10 = cv[b + 2] + (cv[b + 3] - cv[b + 2]) * fx3, x01 = cv[b + 4] + (cv[b + 5] - cv[b + 4]) * fx3, x11 = cv[b + 6] + (cv[b + 7] - cv[b + 6]) * fx3;
        const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
        sum += amps[o] * (y0 + (y1 - y0) * fz);
      }
      return sum / norm2;
    };
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
      const n2 = this.n;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n2) break;
        if (c + 1 < n2 && k[c + 1] < k[c]) c++;
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
    const n2 = frequencyForCells(spec.resolution.targetCells);
    const mesh = stage("G1_mesh", "\u7403\u9762\u30E1\u30C3\u30B7\u30E5", () => buildSphereMesh(n2));
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
      const wlo = warpSeed.map((sd) => makeFbm3(sd, 3, 1.5)), whi = warpSeed.map((sd) => makeFbm3(sd + 7, 3, 5.5));
      for (let c = 0; c < V; c++) {
        const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2];
        const ax = (wlo[0](x, y, z) - 0.5) * 0.32 + (whi[0](x, y, z) - 0.5) * 0.3, ay = (wlo[1](x, y, z) - 0.5) * 0.32 + (whi[1](x, y, z) - 0.5) * 0.3, az = (wlo[2](x, y, z) - 0.5) * 0.32 + (whi[2](x, y, z) - 0.5) * 0.3;
        const px = x + ax, py = y + ay, pz = z + az, l = Math.hypot(px, py, pz);
        wx[c] = px / l;
        wy[c] = py / l;
        wz[c] = pz / l;
      }
      const rp = makeRng(seed, "plates"), P2 = spec.plateCount, seeds = [], omega = [];
      for (let p = 0; p < P2; p++) {
        seeds.push(rp.unitVec());
        const w = rp.unitVec(), sp = rp.range(0.4, 1.6);
        omega.push([w[0] * sp, w[1] * sp, w[2] * sp]);
      }
      for (let c = 0; c < V; c++) {
        let best = -2, bp = 0;
        for (let p = 0; p < P2; p++) {
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
      const dist = new Int16Array(V).fill(-1), from = new Int32Array(V).fill(-1), q2 = new Int32Array(V);
      let qh = 0, qt = 0;
      for (let c = 0; c < V; c++) if (isSrc[c]) {
        dist[c] = 0;
        from[c] = c;
        q2[qt++] = c;
      }
      while (qh < qt) {
        const c = q2[qh++];
        if (dist[c] >= maxD) continue;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (dist[j] < 0) {
            dist[j] = dist[c] + 1;
            from[j] = from[c];
            q2[qt++] = j;
          }
        }
      }
      const ridgeF = makeFbm3(nSeed("ridge"), 3, 1.4);
      for (let c = 0; c < V; c++) {
        if (dist[c] < 0) continue;
        const s = srcStrength[from[c]], f2 = Math.exp(-((dist[c] / widthCells) ** 2));
        const mod = 0.55 + 0.9 * ridgeF(X[3 * c] * 3, X[3 * c + 1] * 3, X[3 * c + 2] * 3);
        if (s > 0) {
          mountain[c] = clamp(s / 1.2, 0, 1.3) * f2 * mod;
          volcanic[c] = mountain[c] > 0.7 ? 0.5 : 0;
        } else rift[c] = clamp(-s / 1.2, 0, 1) * f2;
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
      const cs = bestSet.map((v) => {
        const r = thetaLand * rc.range(0.8, 0.95);
        return { v, r, cosCut: Math.cos(Math.min(Math.PI, r * 1.1)) - 1e-9 };
      });
      const isl = [];
      const NI = ISLAND_MODES[spec.islandMode];
      for (let i = 0; i < NI; i++) {
        const v = rc.unitVec(), r = rc.range(1.2, 5.5) * D2R, w = rc.range(0.45, 0.95);
        isl.push({ v, r, w, cosCut: Math.cos(r * 1.5) - 1e-9 });
      }
      const dotp = (c, v) => wx[c] * v[0] + wy[c] * v[1] + wz[c] * v[2];
      for (let c = 0; c < V; c++) {
        let f2 = 0;
        for (const o of cs) {
          const dp = dotp(c, o.v);
          if (dp < o.cosCut) continue;
          const d = Math.acos(clamp(dp, -1, 1)), t = clamp((1 - d / (o.r * 1.1)) * 2.2, 0, 1);
          f2 = Math.max(f2, t * t * (3 - 2 * t));
        }
        for (const o of isl) {
          const dp = dotp(c, o.v);
          if (dp < o.cosCut) continue;
          const d = Math.acos(clamp(dp, -1, 1));
          if (d < o.r * 1.5) {
            const t = clamp(1 - d / (o.r * 1.5), 0, 1);
            f2 = Math.max(f2, o.w * t * t * (3 - 2 * t));
          }
        }
        continent[c] = f2;
      }
      const rh = makeRng(seed, "hotspots");
      for (let h2 = 0; h2 < 6; h2++) {
        const start2 = rh.unitVec(), dirv = rh.unitVec(), count = rh.int(6, 14), step = rh.range(1.2, 2.2) * D2R;
        const dot2 = start2[0] * dirv[0] + start2[1] * dirv[1] + start2[2] * dirv[2];
        let t = [dirv[0] - dot2 * start2[0], dirv[1] - dot2 * start2[1], dirv[2] - dot2 * start2[2]];
        const tl = Math.hypot(...t) || 1;
        t = t.map((x) => x / tl);
        for (let i = 0; i < count; i++) {
          const a = i * step, p = [start2[0] * Math.cos(a) + t[0] * Math.sin(a), start2[1] * Math.cos(a) + t[1] * Math.sin(a), start2[2] * Math.cos(a) + t[2] * Math.sin(a)], rad = rh.range(0.7, 1.6) * D2R * (1 - i / (count * 1.6)), amp = 0.9 * (1 - i / (count * 1.4));
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
    const isSea2 = new Uint8Array(V);
    for (let c = 0; c < V; c++) isSea2[c] = elevation[c] <= 0 ? 1 : 0;
    const coastDist = new Uint16Array(V);
    stage("G3_coast", "\u6D77\u5CB8\u304B\u3089\u306E\u8DDD\u96E2", () => {
      const q2 = new Int32Array(V);
      let qh = 0, qt = 0;
      const seen = new Uint8Array(V);
      for (let c = 0; c < V; c++) if (isSea2[c]) {
        seen[c] = 1;
        q2[qt++] = c;
      }
      while (qh < qt) {
        const c = q2[qh++];
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!seen[j]) {
            seen[j] = 1;
            coastDist[j] = Math.min(65535, coastDist[c] + 1);
            q2[qt++] = j;
          }
        }
      }
    });
    const temp = new Float32Array(V), precip = new Float32Array(V), biome = new Uint8Array(V), moisture = new Float32Array(V);
    const cx = { mesh, lat, lon, elevation, isSea: isSea2, moisture, precipNoise: nSeed("precip"), lapse: spec.climateModel.lapseRateCPerKm, decay: Math.exp(-spacingKm / spec.climateModel.windMoistureLengthKm) };
    stage("G4_climate", "\u6C17\u5019", () => {
      for (let c = 0; c < V; c++) temp[c] = tempAt(lat[c], elevation[c], cx.lapse);
      cx.up = new Int32Array(V);
      for (let c = 0; c < V; c++) cx.up[c] = upwindOf(mesh, lat, lon, c);
      for (let c = 0; c < V; c++) moisture[c] = isSea2[c] ? 1 : 0.5;
      const passes = Math.min(200, Math.ceil(4e3 / spacingKm) + 4);
      for (let it = 0; it < passes; it++) for (let c = 0; c < V; c++) {
        if (!isSea2[c]) moisture[c] = moistureStep(cx, c);
      }
      for (let c = 0; c < V; c++) precip[c] = precipAt(cx, c);
    });
    stage("G4_biome", "\u30D0\u30A4\u30AA\u30FC\u30E0", () => {
      for (let c = 0; c < V; c++) biome[c] = isSea2[c] ? BIOMES.OCEAN : biomeOf(temp[c], precip[c], elevation[c]);
    });
    const parent = new Int32Array(V).fill(-1), filled = new Float32Array(V), flow = new Float32Array(V), basin = new Int32Array(V).fill(-1), landWater = new Uint8Array(V);
    let lakeCount = 0;
    const hyd = { mesh, elevation, isSea: isSea2, precip, areaKm2, parent, filled, flow, basin, landWater, biome };
    stage("G5_rivers", "\u6C34\u7CFB", () => {
      lakeCount = computeHydrology(hyd, null).lakeCount;
    });
    let riverThreshold = 0;
    const river = new Uint8Array(V);
    stage("G5_riverset", "\u6CB3\u5DDD\u306E\u9078\u5B9A", () => {
      const f2 = [];
      for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND) f2.push(flow[c]);
      f2.sort((a, b) => a - b);
      riverThreshold = f2.length ? f2[Math.floor(f2.length * 0.93)] : 0;
      for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && flow[c] >= riverThreshold && flow[c] > 0) river[c] = 1;
    });
    const soil = new Uint8Array(V), fertility = new Float32Array(V), resource = new Uint16Array(V), capacity = new Float32Array(V);
    const lu = { mesh, isSea: isSea2, landWater, biome, elevation, river, volcanic, mountain, coastDist, temp, precip, areaKm2, resource, soil, fertility, capacity, ...landUseNoise(seed) };
    stage("G6_soil", "\u571F\u58CC\u30FB\u80A5\u6C83\u5EA6\u30FB\u8CC7\u6E90", () => {
      for (let c = 0; c < V; c++) landUseAt(lu, c);
    });
    const gctx = { mesh, landWater, fertility, temp, river, coastDist, lat, lon };
    const populations = stage("G7_groups", "\u521D\u671F\u4EBA\u53E3\u96C6\u56E3", () => placeInitialGroups(gctx, spec, 0));
    const stats = stage("G8_stats", "\u7D71\u8A08", () => computeStats({ V, off, nb, landWater, isSea: isSea2, elevation, temp, precip, biome, flow, riverThreshold, river, lakeCount, parent, lat, areaKm2, populations, spec }));
    const world = {
      spec: { ...spec, generatorVersion: GENERATOR_VERSION },
      mesh,
      cell: { elevation, landWater, plate, temp, precip, biome, soil, fertility, resource, riverTo: parent, riverFlow: flow, river, basin, coastDist, capacity, areaKm2, lat, lon, volcanic, filled, continent, mountain, moisture },
      entities: { populations },
      stats,
      timings
    };
    timings.total = Math.round(performance.now() - tAll);
    world.hash = worldHash(world);
    return world;
  }
  function tempAt(latRad, elevation, lapse) {
    const a = Math.abs(latRad) / (Math.PI / 2), h2 = Math.max(0, elevation) / 1e3;
    return 27.5 - 45 * Math.pow(a, 1.6) - lapse * h2;
  }
  function upwindOf(mesh, lat, lon, c) {
    const X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds;
    const la = Math.abs(lat[c]) / D2R, east = la < 30 ? -1 : la < 60 ? 1 : -1;
    const ex = -Math.sin(lon[c]), ey = Math.cos(lon[c]);
    const wx = -east * ex, wy = -east * ey;
    let best = -2, bj = -1;
    for (let k = off[c]; k < off[c + 1]; k++) {
      const j = nb[k], dx = X[3 * j] - X[3 * c], dy = X[3 * j + 1] - X[3 * c + 1], dz = X[3 * j + 2] - X[3 * c + 2], dl = Math.hypot(dx, dy, dz) || 1, s = (dx * wx + dy * wy) / dl;
      if (s > best) {
        best = s;
        bj = j;
      }
    }
    return bj;
  }
  var upOf = (cx, c) => cx.up ? cx.up[c] : upwindOf(cx.mesh, cx.lat, cx.lon, c);
  function liftRaw(cx, c) {
    const u = upOf(cx, c);
    return Math.max(0, cx.elevation[c] - Math.max(0, cx.elevation[u])) / 1e3;
  }
  function moistureStep(cx, c) {
    const u = upOf(cx, c);
    return clamp(cx.moisture[u] * cx.decay - 0.3 * (Math.max(0, cx.elevation[c] - Math.max(0, cx.elevation[u])) / 1e3), 0.42, 1);
  }
  function precipAt(cx, c) {
    const X = cx.mesh.centerXYZ, sea = cx.isSea[c], la = Math.abs(cx.lat[c]) / D2R, zonal = 250 + 1900 * Math.exp(-((la / 9) ** 2)) + 800 * Math.exp(-(((la - 55) / 12) ** 2));
    const lift = sea ? 0 : Math.fround(liftRaw(cx, c)), m = cx.moisture[c];
    let p = zonal * (0.35 + 0.85 * m) * (0.7 + 0.6 * fbm3(cx.precipNoise, X[3 * c], X[3 * c + 1], X[3 * c + 2], 3, 2.5)) + 900 * lift * m * (sea ? 0 : 1);
    if (!sea && cx.elevation[c] > 3500) p *= 0.6;
    return clamp(p, 0, 6e3);
  }
  function computeHydrology(h2, members2 = null) {
    const { mesh, elevation, isSea: isSea2, precip, areaKm2, parent, filled, flow, basin, landWater, biome } = h2;
    const V = mesh.cellCount, off = mesh.neighborOffsets, nb = mesh.neighborIds, EPS = 0.05;
    const heap = new MinHeap(V + 16), done2 = new Uint8Array(V), order = new Int32Array(V);
    let on = 0;
    for (let c = 0; c < V; c++) {
      if (members2 && !members2[c]) continue;
      filled[c] = elevation[c];
      parent[c] = -1;
      basin[c] = -1;
    }
    for (let c = 0; c < V; c++) {
      if (isSea2[c]) {
        done2[c] = 1;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!isSea2[j] && (!members2 || members2[j])) {
            heap.push(filled[c], c);
            break;
          }
        }
      } else if (members2 && !members2[c]) done2[c] = 1;
    }
    while (heap.n > 0) {
      const c = heap.pop();
      order[on++] = c;
      for (let k = off[c]; k < off[c + 1]; k++) {
        const j = nb[k];
        if (done2[j]) continue;
        done2[j] = 1;
        parent[j] = c;
        filled[j] = Math.max(elevation[j], filled[c] + EPS);
        heap.push(filled[j], j);
      }
    }
    for (let c = 0; c < V; c++) {
      if (members2 && !members2[c]) continue;
      flow[c] = isSea2[c] ? 0 : precip[c] * areaKm2[c] * 95e-7;
    }
    for (let i = on - 1; i >= 0; i--) {
      const c = order[i], p = parent[c];
      if (p >= 0 && !isSea2[c]) flow[p] += isSea2[p] ? 0 : flow[c];
    }
    for (let i = 0; i < on; i++) {
      const c = order[i];
      if (isSea2[c]) continue;
      const p = parent[c];
      basin[c] = isSea2[p] ? c : basin[p];
    }
    let lakeCount = 0, unreached = 0;
    for (let c = 0; c < V; c++) {
      if (members2 && !members2[c]) continue;
      if (isSea2[c]) landWater[c] = LAND_WATER.OCEAN;
      else {
        if (parent[c] < 0) unreached++;
        if (filled[c] - elevation[c] >= 40) {
          landWater[c] = LAND_WATER.LAKE;
          lakeCount++;
          biome[c] = BIOMES.LAKE;
        } else landWater[c] = LAND_WATER.LAND;
      }
    }
    return { lakeCount, unreached };
  }
  function landUseNoise(seed) {
    const ns = (name) => hashString(`${seed}::noise::${name}`);
    return { rs: ["iron", "copper", "tin", "gold", "coal", "gems"].map(ns), sSalt: ns("salt") };
  }
  var SOIL_FERT = { [SOILS.NONE]: 0, [SOILS.ROCK]: 0.05, [SOILS.SAND]: 0.1, [SOILS.LOAM]: 0.85, [SOILS.CLAY]: 0.55, [SOILS.VOLCANIC]: 1.05, [SOILS.PERMAFROST]: 0.1, [SOILS.ALLUVIAL]: 1.2, [SOILS.PODZOL]: 0.5, [SOILS.BLACK_EARTH]: 1.15 };
  function seaToLand(mesh, isSea2, c) {
    const off = mesh.neighborOffsets, nb = mesh.neighborIds;
    let fr = [c];
    const seen = /* @__PURE__ */ new Set([c]);
    for (let d = 0; d <= 6; d++) {
      const nx = [];
      for (const u of fr) for (let k = off[u]; k < off[u + 1]; k++) {
        const j = nb[k];
        if (!isSea2[j]) return d + 1;
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
  function landUseAt(g, c) {
    const { mesh, isSea: isSea2, landWater, biome, elevation, river, volcanic, mountain, coastDist, temp, precip, areaKm2, resource, soil, fertility, capacity, rs, sSalt } = g;
    const X = mesh.centerXYZ, off = mesh.neighborOffsets, nb = mesh.neighborIds;
    const sea = isSea2[c], land = !sea && landWater[c] === LAND_WATER.LAND, b = biome[c], e = elevation[c];
    let relief = 0, kn = 0;
    for (let k = off[c]; k < off[c + 1]; k++) {
      relief += Math.abs(elevation[nb[k]] - e);
      kn++;
    }
    relief /= Math.max(1, kn);
    const nearRiver = river[c] === 1;
    let res = 0;
    if (sea) {
      if (e > -300 && seaToLand(mesh, isSea2, c) <= 6) res |= RES.FISH;
    } else {
      const x = X[3 * c], y = X[3 * c + 1], z = X[3 * c + 2], q2 = (i, f2) => fbm3(rs[i], x, y, z, 3, f2);
      if (land) {
        if (q2(0, 7) > 0.6 && e > 300) res |= RES.IRON;
        if (q2(1, 8) > 0.66 && (e > 500 || volcanic[c] > 0.3)) res |= RES.COPPER;
        if (q2(2, 9) > 0.72 && e > 800) res |= RES.TIN;
        if (q2(3, 10) > 0.74 && (nearRiver || mountain[c] > 0.4)) res |= RES.GOLD;
        if (q2(4, 6) > 0.62 && e < 1500 && (b === BIOMES.TEMPERATE_FOREST || b === BIOMES.TAIGA || b === BIOMES.WETLAND || b === BIOMES.TROPICAL_SEASONAL)) res |= RES.COAL;
        if (q2(5, 11) > 0.78 && mountain[c] > 0.5) res |= RES.GEMS;
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
    if (land) {
      const t = temp[c], p = precip[c];
      const tf = t < -2 ? 0 : t < 8 ? (t + 2) / 10 * 0.6 : t <= 26 ? 1 : clamp(1 - (t - 26) / 12, 0.2, 1);
      const pf = p < 150 ? p / 150 * 0.15 : p < 600 ? 0.15 + (p - 150) / 450 * 0.85 : p <= 2200 ? 1 : clamp(1 - (p - 2200) / 3500, 0.5, 1);
      const slope = 1 - clamp(relief / 700, 0, 0.9), alt = 1 - clamp(Math.max(0, e - 1500) / 3e3, 0, 1);
      fertility[c] = clamp(tf * pf * SOIL_FERT[sl] * slope * alt, 0, 1);
      capacity[c] = fertility[c] * 12 * (1 + (nearRiver ? 0.5 : 0) + (coastDist[c] <= 1 ? 0.3 : 0)) * areaKm2[c];
    } else {
      fertility[c] = 0;
      capacity[c] = 0;
    }
  }
  function placeInitialGroups(g, spec, variant = 0) {
    const { mesh, landWater, fertility, temp, river, coastDist, lat, lon } = g, V = mesh.cellCount, X = mesh.centerXYZ, R = spec.planet.radiusKm;
    const rg = makeRng(spec.worldSeed, variant ? `groups#${variant}` : "groups"), cand3 = [];
    for (let c = 0; c < V; c++) if (landWater[c] === LAND_WATER.LAND && fertility[c] > 0.35 && temp[c] > 4 && temp[c] < 30) cand3.push({ c, s: fertility[c] * (1 + (river[c] ? 0.3 : 0) + (coastDist[c] <= 2 ? 0.2 : 0)) * (0.7 + 0.6 * rg()) });
    cand3.sort((a, b) => b.s - a.s || a.c - b.c);
    const out = [], minSep = Math.min(0.25 * Math.PI, 2e3 / R);
    const ang = (a, b) => greatCircleRad(X[3 * a], X[3 * a + 1], X[3 * a + 2], X[3 * b], X[3 * b + 1], X[3 * b + 2]);
    for (const { c } of cand3) {
      if (out.length >= spec.initialGroups) break;
      if (out.every((o) => ang(o.cell, c) >= minSep)) out.push({ id: out.length + 1, cell: c, lat: lat[c] / D2R, lon: lon[c] / D2R, size: Math.round(rg.range(150, 600)), subsistence: "forage", species: "human" });
    }
    return out;
  }
  function biomeOf(T3, P2, e) {
    if (e > 4500 || e > 3500 && T3 < 0) return BIOMES.ALPINE;
    if (T3 < -8) return BIOMES.ICE;
    if (T3 < 0) return BIOMES.TUNDRA;
    if (T3 < 5) return P2 > 300 ? BIOMES.TAIGA : BIOMES.COLD_DESERT;
    if (T3 < 18) return P2 < 200 ? BIOMES.COLD_DESERT : P2 < 600 ? BIOMES.GRASSLAND : P2 > 2600 ? BIOMES.WETLAND : BIOMES.TEMPERATE_FOREST;
    if (P2 < 250) return BIOMES.HOT_DESERT;
    if (P2 < 900) return BIOMES.SAVANNA;
    if (P2 < 1800) return BIOMES.TROPICAL_SEASONAL;
    return BIOMES.RAINFOREST;
  }
  function landmasses(V, off, nb, isSea2) {
    const comp = new Int32Array(V).fill(-1), sizes = [];
    const q2 = new Int32Array(V);
    for (let s = 0; s < V; s++) {
      if (isSea2[s] || comp[s] >= 0) continue;
      let qh = 0, qt = 0;
      q2[qt++] = s;
      comp[s] = sizes.length;
      let cnt = 0;
      while (qh < qt) {
        const c = q2[qh++];
        cnt++;
        for (let k = off[c]; k < off[c + 1]; k++) {
          const j = nb[k];
          if (!isSea2[j] && comp[j] < 0) {
            comp[j] = comp[s];
            q2[qt++] = j;
          }
        }
      }
      sizes.push(cnt);
    }
    return { comp, sizes };
  }
  function computeStats(a) {
    const { V, off, nb, isSea: isSea2, landWater, elevation, temp, biome, lat, riverThreshold, river, lakeCount, parent, populations } = a;
    let mouthCount = 0;
    for (let c = 0; c < V; c++) if (river[c] && parent[c] >= 0 && isSea2[parent[c]]) mouthCount++;
    let sea = 0, lake = 0, mount = 0, rivers = 0, cold = 0;
    for (let c = 0; c < V; c++) {
      if (isSea2[c]) sea++;
      else {
        if (landWater[c] === LAND_WATER.LAKE) lake++;
        if (elevation[c] > 2500) mount++;
        if (river[c]) rivers++;
      }
    }
    const landCells = V - sea, { sizes } = landmasses(V, off, nb, isSea2), total = sizes.reduce((s, x) => s + x, 0);
    const continents = sizes.filter((s) => s >= total * 0.03), islands = sizes.filter((s) => s < total * 0.03);
    const biomeCounts = new Array(14).fill(0);
    for (let c = 0; c < V; c++) biomeCounts[biome[c]]++;
    let tl = 0, nl = 0, th = 0, nh = 0;
    for (let c = 0; c < V; c++) {
      if (isSea2[c]) continue;
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
  function worldHash(world) {
    let h2 = 2166136261;
    const { cell } = world;
    const mix = (v) => {
      h2 ^= v & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 8 & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 16 & 255;
      h2 = Math.imul(h2, 16777619);
      h2 ^= v >>> 24 & 255;
      h2 = Math.imul(h2, 16777619);
    };
    for (let i = 0; i < cell.elevation.length; i++) mix(Math.round(cell.elevation[i]) | 0);
    for (let i = 0; i < cell.landWater.length; i++) mix(cell.landWater[i] | cell.biome[i] << 8 | cell.soil[i] << 16);
    for (let i = 0; i < cell.riverTo.length; i++) mix(cell.riverTo[i] | 0);
    for (let i = 0; i < cell.resource.length; i++) mix(cell.resource[i]);
    mix(meshHash(world.mesh).length);
    return (h2 >>> 0).toString(16).padStart(8, "0");
  }

  // js/core/wcde/calendar.js
  var DEFAULT_CALENDAR = Object.freeze({
    epochName: "",
    beforeName: "",
    yearOffset: 0,
    // v6.6.0: 既定は空白（「紀元」とは名づけない）。 // 表示年 = 内部の年 + yearOffset（内部の年が負なら beforeName の側で数える）
    format: "{era}{year}\u5E74{month}\u6708",
    monthNames: null,
    eras: Object.freeze([])
  });
  var isInt = (v) => Number.isInteger(v);
  function normalizeCalendar(input = {}) {
    const errors = [], c = { ...DEFAULT_CALENDAR, ...input ?? {} };
    for (const k of ["epochName", "beforeName"]) {
      if (typeof c[k] !== "string") errors.push(`calendar.${k} \u306F\u6587\u5B57\u5217\uFF08\u7A7A\u767D\u3067\u3082\u3088\u3044\uFF09`);
      else c[k] = c[k].trim();
    }
    if (typeof c.format !== "string" || !c.format.trim()) errors.push("calendar.format \u306F\u7A7A\u3067\u306A\u3044\u6587\u5B57\u5217");
    if (!isInt(c.yearOffset) || Math.abs(c.yearOffset) > 1e7) errors.push("calendar.yearOffset \u306F\u6574\u6570");
    if (typeof c.format === "string" && !c.format.includes("{year}")) errors.push("calendar.format \u306B\u306F {year} \u304C\u5FC5\u8981");
    const eras = [];
    if (!Array.isArray(c.eras)) errors.push("calendar.eras \u306F\u914D\u5217");
    else {
      let prev = -Infinity;
      for (const [i, e] of c.eras.entries()) {
        if (!e || typeof e.name !== "string" || !e.name.trim()) {
          errors.push(`calendar.eras[${i}].name \u306F\u7A7A\u3067\u306A\u3044\u6587\u5B57\u5217`);
          continue;
        }
        if (!isInt(e.startYear)) {
          errors.push(`calendar.eras[${i}].startYear \u306F\u6574\u6570\uFF08\u5185\u90E8\u306E\u5E74\uFF09`);
          continue;
        }
        if (e.startYear <= prev) errors.push(`calendar.eras[${i}] \u306E\u5883\u754C\u306F\u524D\u3088\u308A\u5F8C\uFF08${e.startYear} \u2264 ${prev}\uFF09`);
        prev = e.startYear;
        eras.push({ id: e.id ?? `era${i}`, name: e.name.trim(), startYear: e.startYear });
      }
    }
    if (c.monthNames != null && !(Array.isArray(c.monthNames) && c.monthNames.length === 12 && c.monthNames.every((x) => typeof x === "string" && x))) errors.push("calendar.monthNames \u306F12\u500B\u306E\u6587\u5B57\u5217");
    return { calendar: { epochName: c.epochName, beforeName: c.beforeName, yearOffset: c.yearOffset, format: c.format, monthNames: c.monthNames ?? null, eras }, errors };
  }
  var split = (mi) => {
    const year = Math.floor(mi / 12);
    return { year, month: mi - year * 12 + 1 };
  };
  function eraOf(cal, mi) {
    const { year } = split(mi);
    let hit = null;
    for (const e of cal.eras) {
      if (e.startYear <= year) hit = e;
      else break;
    }
    return hit;
  }
  function formatDate(cal, mi) {
    const { year, month } = split(mi), shown = year + cal.yearOffset, before = shown < 0, n2 = before ? -shown : shown;
    const era = before ? cal.beforeName || "\u524D" : cal.epochName, name = cal.monthNames ? cal.monthNames[month - 1] : String(month);
    return cal.format.replace("{era}", era).replace("{year}", String(n2)).replace("{month}", name).replace("{monthNum}", String(month));
  }
  var eraLabel = (cal, mi) => eraOf(cal, mi)?.name ?? "";
  function applyDisplayEdit(cal, edit) {
    const errors = [], next = { ...cal, eras: cal.eras.map((e) => ({ ...e })) };
    const allowed = /* @__PURE__ */ new Set(["epochName", "beforeName", "format", "monthNames", "eraNames"]);
    for (const k of Object.keys(edit)) if (!allowed.has(k)) errors.push(`${k} \u306F\u751F\u6210\u5F8C\u306B\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\uFF08\u8868\u793A\u7528\u306E\u8A2D\u5B9A\u3060\u3051\u5909\u3048\u3089\u308C\u307E\u3059\uFF09`);
    if (errors.length) return { calendar: cal, errors };
    for (const k of ["epochName", "beforeName", "format"]) if (edit[k] !== void 0) next[k] = edit[k];
    if (edit.monthNames !== void 0) next.monthNames = edit.monthNames;
    if (edit.eraNames) for (const [id, name] of Object.entries(edit.eraNames)) {
      const e = next.eras.find((x) => x.id === id);
      if (!e) errors.push(`\u6642\u4EE3\u533A\u5206 ${id} \u304C\u3042\u308A\u307E\u305B\u3093`);
      else e.name = name;
    }
    const v = normalizeCalendar(next);
    if (v.errors.length) return { calendar: cal, errors: v.errors };
    return { calendar: v.calendar, errors: [] };
  }

  // js/core/civ/world-consts.js
  var LAND_WATER2 = Object.freeze({ OCEAN: 0, LAND: 1, LAKE: 2 });
  var BIOMES2 = Object.freeze({ OCEAN: 0, ICE: 1, TUNDRA: 2, TAIGA: 3, TEMPERATE_FOREST: 4, GRASSLAND: 5, HOT_DESERT: 6, COLD_DESERT: 7, SAVANNA: 8, TROPICAL_SEASONAL: 9, RAINFOREST: 10, ALPINE: 11, WETLAND: 12, LAKE: 13 });
  var RES2 = Object.freeze({ IRON: 1, COPPER: 2, TIN: 4, GOLD: 8, COAL: 16, SALT: 32, TIMBER: 64, FISH: 128, STONE: 256, CLAY: 512, GEMS: 1024 });

  // js/core/civ/ids.js
  var ID_KINDS = Object.freeze(["state", "pop", "settle", "person", "event", "decision", "proposal", "tech", "culture", "lang", "religion", "species", "war", "treaty", "battle", "disaster", "work", "interp", "org", "house", "candidate", "unit", "intervention", "proposal", "catastrophe"]);
  var ALPHA = "0123456789abcdefghijklmnopqrstuvwxyz";
  var check = (kind, n2) => {
    let h2 = n2 * 2654435761 >>> 0;
    for (let i = 0; i < kind.length; i++) h2 = h2 * 31 + kind.charCodeAt(i) >>> 0;
    return ALPHA[h2 % 36];
  };
  function createIdGen(seq) {
    return {
      next(kind) {
        if (!ID_KINDS.includes(kind)) throw new Error(`\u672A\u77E5\u306EID\u7A2E\u5225: ${kind}`);
        const n2 = seq[kind] = (seq[kind] ?? 0) + 1;
        return `${kind}_${n2.toString(36).padStart(5, "0")}${check(kind, n2)}`;
      }
    };
  }

  // js/core/civ/tick.js
  var PHASES = Object.freeze([
    { key: "clock", name: "\u4E16\u754C\u6642\u8A08\u3092\u6B21\u306E\u6708\u3078" },
    { key: "interventions", name: "\u5275\u9020\u4E3B\u306E\u4ECB\u5165\u306E\u6E1B\u8870\uFF08\u5F53\u6708\u306E\u6709\u52B9\u5024\u3092\u78BA\u5B9A\uFF09" },
    { key: "climate", name: "\u5B63\u7BC0\u30FB\u5929\u5019\u30FB\u6C17\u5019\u306E\u6708\u6B21\u72B6\u614B" },
    { key: "disaster", name: "\u81EA\u7136\u707D\u5BB3\u30FB\u74B0\u5883\u30B7\u30E7\u30C3\u30AF" },
    { key: "ecosystem", name: "\u751F\u614B\u7CFB\uFF08\u8CC7\u6E90\u91CF\u30FB\u74B0\u5883\u5BB9\u91CF\u306E\u96C6\u7D04\u30E2\u30C7\u30EB\uFF09" },
    { key: "economy_pop", name: "\u751F\u696D\u30FB\u751F\u7523\u30FB\u98DF\u6599\u30FB\u4EBA\u53E3\u30FB\u79FB\u4F4F" },
    { key: "culture", name: "\u6587\u5316\u30FB\u8A00\u8A9E\u30FB\u5B97\u6559\u30FB\u601D\u60F3" },
    { key: "tech", name: "\u6280\u8853\u306E\u72EC\u7ACB\u767A\u751F\u30FB\u4F1D\u64AD\u30FB\u55AA\u5931\u30FB\u518D\u767A\u898B" },
    { key: "economy", name: "\u751F\u7523\u30FB\u9700\u8981\u30FB\u7523\u696D\u30FB\u4EA4\u6613\u30FB\u56FD\u5BB6\u8CA1\u653F" },
    { key: "politics", name: "\u56FD\u5185\u653F\u6CBB\u30FB\u652F\u6301\u52E2\u529B\u30FB\u6307\u5C0E\u8005\u30FB\u5236\u5EA6" },
    { key: "military", name: "\u8ECD\u4E8B\u7D44\u7E54\u30FB\u90E8\u968A\u30FB\u30C9\u30AF\u30C8\u30EA\u30F3\u30FB\u8ECD\u4E8B\u80FD\u529B" },
    { key: "ai_plan", name: "\u56FD\u5BB6AI\u306E\u8A08\u753B\uFF08\u5730\u56F3\u3092\u5909\u3048\u306A\u3044\u30FB\u5224\u65AD\u904E\u7A0B\u306F\u4FDD\u5B58\u3057\u306A\u3044\uFF09" },
    { key: "apply", name: "AI \u3068\u30D7\u30EC\u30A4\u30E4\u30FC\u306E\u884C\u52D5\u3092\u5171\u901A\u306E\u691C\u8A3C\u3067\u5B9F\u884C" },
    { key: "conflict", name: "\u5916\u4EA4\u30FB\u6226\u4E89\u30FB\u53CD\u4E71\u30FB\u56FD\u5BB6\u5F62\u6210\uFF0F\u5D29\u58CA" },
    { key: "people", name: "\u91CD\u8981\u4EBA\u7269\u30FB\u5BB6\u7CFB\u30FB\u6307\u5C0E\u8005\u7D99\u627F\u30FB\u90FD\u5E02" },
    { key: "archive", name: "\u7D50\u679C\u306E\u6B74\u53F2\u8CC7\u6599\u5316\uFF08\u4ECA\u6708\u8D77\u304D\u305F\u4E8B\u5B9F\u3060\u3051\uFF09" },
    { key: "integrity", name: "\u6574\u5408\u6027\u691C\u67FB\u30FB\u8A3A\u65AD\u30FB\u30CB\u30E5\u30FC\u30B9\u5224\u5B9A" },
    { key: "notify", name: "\u63CF\u753B\u30FB\u5E74\u8868\u30FB\u30D1\u30CD\u30EB\u3078\u306E\u5909\u66F4\u901A\u77E5" }
  ]);
  var PHASE_KEYS = PHASES.map((p) => p.key);
  function createTicker() {
    const handlers = new Map(PHASE_KEYS.map((k) => [k, []]));
    return {
      /** @param {string} phase PHASE_KEYS のいずれか @param {(ctx:object)=>void} fn @param {string} [label] @param {{every?:number, offset?:number}} [opt] */
      register(phase, fn, label = fn.name || "anonymous", { every = 1, offset = 0 } = {}) {
        if (!handlers.has(phase)) throw new Error(`\u672A\u77E5\u306E\u30D5\u30A7\u30FC\u30BA: ${phase}`);
        if (!(Number.isInteger(every) && every >= 1)) throw new Error(`every \u306F 1 \u4EE5\u4E0A\u306E\u6574\u6570: ${label}`);
        handlers.get(phase).push({ fn, label, every, offset });
      },
      runMonth(ctx) {
        ctx.trace = [];
        for (const key of PHASE_KEYS) for (const h2 of handlers.get(key)) {
          ctx.phase = key;
          if (h2.every > 1) {
            const mi = ctx.civ?.monthIndex ?? 0;
            if ((mi % h2.every + h2.every) % h2.every !== h2.offset) continue;
          }
          h2.fn(ctx);
          ctx.trace.push(`${key}:${h2.label}`);
        }
        ctx.phase = null;
        return ctx;
      },
      /** 登録済みの処理の一覧（台帳との突き合わせ・診断用）。月次の実行順そのまま */
      labels() {
        const out = [];
        for (const key of PHASE_KEYS) for (const h2 of handlers.get(key)) out.push({ phase: key, label: h2.label, every: h2.every });
        return out;
      }
    };
  }
  var monthIndex = (year, month) => year * 12 + (month - 1);
  var fromMonthIndex = (i) => {
    const year = Math.floor(i / 12);
    return { year, month: i - year * 12 + 1 };
  };

  // js/core/civ/archive.js
  var ARCHIVE_VERSION = 1;
  var LIVE_MONTHS = 36;
  var CHUNK_YEARS = 100;
  var COLD_AFTER_YEARS = 120;
  var P = (ty, im, store = true) => ({ ty, im, store });
  var KIND_POLICY = Object.freeze({
    state_formed: P("state", 3),
    state_dissolved: P("state", 3),
    regime_change: P("state", 2),
    leader_succession: P("state", 1),
    succession_by_heir: P("state", 1),
    dynasty_changed: P("state", 2),
    heir_named: P("state", 0, false),
    instability: P("state", 0, false),
    group_joined_state: P("state", 1),
    conquest: P("war", 3),
    territory_occupied: P("war", 2),
    campaign_abandoned: P("war", 0, false),
    war_declared: P("war", 3),
    war_epilogue: P("war", 2),
    ideology_emerged: P("culture", 2),
    war_ended: P("war", 3),
    battle_fought: P("war", 2),
    peace: P("war", 3),
    reparations: P("war", 2),
    ally_joined: P("war", 2),
    treaty_signed: P("treaty", 2),
    treaty_ended: P("treaty", 2),
    treaty: P("treaty", 2),
    diplomacy_failed: P("treaty", 1),
    tech_discovered: P("tech", 3),
    tech_institutionalized: P("tech", 1),
    tech_rediscovered: P("tech", 2),
    tech_lost: P("tech", 2),
    culture_diverged: P("culture", 2),
    language_diverged: P("culture", 1),
    religion_founded: P("culture", 3),
    religion_schism: P("culture", 2),
    religion_spread: P("culture", 0, false),
    culture_contact: P("culture", 0, false),
    cohort_formed: P("culture", 0, false),
    cohort_assimilated: P("culture", 0, false),
    settlement_founded: P("city", 1),
    settlement_stage: P("city", 1),
    disaster_struck: P("env", 2),
    catastrophe: P("env", 3),
    disaster_ended: P("env", 0, false),
    climate_shift: P("env", 2),
    famine: P("env", 1),
    ecosystem_shift: P("env", 1),
    group_split: P("pop", 0, false),
    group_moved: P("pop", 0, false),
    group_extinct: P("pop", 1),
    subsistence_changed: P("pop", 0, false),
    sea_crossed: P("pop", 3),
    species_emerged: P("pop", 3),
    prehistory_epoch: P("pop", 2),
    trade_route_opened: P("economy", 1),
    trade_cut: P("economy", 1),
    demand_raised: P("economy", 0, false),
    doctrine_adopted: P("military", 1),
    state_constituted: P("state", 2),
    uprising: P("state", 3),
    uprising_crushed: P("state", 2),
    office_reform: P("state", 1),
    state_action: P("state", 1),
    creator_edit: P("creator", 2),
    chronicle: P("other", 1),
    magic_backlash: P("other", 0, false),
    magic_power_struggle: P("other", 0, false),
    magic_org_founded: P("other", 0, false),
    magic_gifted_died: P("other", 0, false),
    magic_incident: P("other", 0, false),
    magic_discrimination: P("other", 0, false),
    magic_gifted_found: P("other", 0, false)
  });
  var policyOf = (kind) => KIND_POLICY[kind] ?? P("other", 1);
  var MEDIA = Object.freeze({ trace: { ja: "\u907A\u8DE1\u30FB\u75D5\u8DE1", tau: 25e4 }, oral: { ja: "\u53E3\u627F", tau: 120 }, tablet: { ja: "\u523B\u307E\u308C\u305F\u8A18\u9332", tau: 900 }, paper: { ja: "\u7D19\u306E\u8A18\u9332", tau: 2800 }, print: { ja: "\u5370\u5237\u7269", tau: 14e3 } });
  var IMP_TAU = [0.4, 1, 2.5, 8];
  var IMP_FLOOR = [3e-3, 0.01, 0.05, 0.12];
  var GRACE_YEARS = 20;
  function mediaOf(civ6, participants, kind) {
    if (kind === "prehistory_epoch" || kind === "species_emerged" || kind === "sea_crossed") return "trace";
    let best = 0;
    const rank = (k) => k.printing != null ? 4 : k.papermaking != null ? 3 : k.writing != null || k.record_keeping != null ? 2 : 1;
    for (let i = 0; i < participants.length && i < 4; i++) {
      const id = participants[i].entityId, st2 = civ6.states[id], g = st2 ? null : civ6.groups[id];
      const r = st2 ? rank(st2.techAdopted) : g ? rank(g.tech.known) : 1;
      if (r > best) best = r;
    }
    return best >= 4 ? "print" : best === 3 ? "paper" : best === 2 ? "tablet" : "oral";
  }
  function survivalP(rec, nowMonth) {
    const age = (nowMonth - rec.t) / 12;
    if (age <= GRACE_YEARS) return 1;
    const im = rec.im ?? 1, tau = (MEDIA[rec.m]?.tau ?? 120) * IMP_TAU[im], fl = IMP_FLOOR[im];
    return fl + (1 - fl) * Math.exp(-(age - GRACE_YEARS) / tau);
  }
  var survives = (civ6, rec, nowMonth = civ6.monthIndex) => hashSeed(civ6.historySeed, "archive", rec.eventId) / 4294967296 < survivalP(rec, nowMonth);
  var emptyArchive = () => ({ v: ARCHIVE_VERSION, chunks: {}, counts: {}, evBase: 0, total: 0, rev: 0 });
  var archiveOf = (civ6) => civ6.archive ?? (civ6.archive = emptyArchive());
  var monthOfEvent = (e) => e.date.year * 12 + (e.date.month - 1);
  var bucketOf = (m) => Math.floor(m / 12 / CHUNK_YEARS);
  function toRecord(civ6, e) {
    const pol = policyOf(e.kind), r = { eventId: e.eventId, date: e.date, t: monthOfEvent(e), kind: e.kind, ty: pol.ty, im: e.imp ?? pol.im, m: e.media ?? "oral", title: e.title, participants: e.participants, location: e.location ?? null, causes: e.causes?.length ? e.causes : [], effects: pol.im >= 2 ? e.effects ?? [] : [], provenance: e.provenance ?? "simulation" };
    if (e.facts) r.facts = e.facts;
    return r;
  }
  var hot = /* @__PURE__ */ new WeakMap();
  function chunkRecords(a, key) {
    const c = a.chunks[key];
    if (!c) return [];
    if (c.rec) return c.rec;
    let h2 = hot.get(a);
    if (!h2) hot.set(a, h2 = /* @__PURE__ */ new Map());
    let arr = h2.get(key);
    if (!arr) {
      arr = JSON.parse(c.cold);
      h2.set(key, arr);
      if (h2.size > 4) h2.delete(h2.keys().next().value);
    }
    return arr;
  }
  function commitArchive(ctx) {
    var _a, _b;
    const { civ: civ6 } = ctx, a = archiveOf(civ6), now = civ6.monthIndex, cutoff = now - LIVE_MONTHS;
    let idx = 0;
    const pinned = /* @__PURE__ */ new Set();
    for (const q2 of civ6.wcde?.news?.queue ?? []) if (q2.eventId) pinned.add(q2.eventId);
    while (idx < civ6.events.length && monthOfEvent(civ6.events[idx]) < cutoff) idx++;
    if (idx) {
      const moved = civ6.events.splice(0, idx), touched = /* @__PURE__ */ new Set();
      for (const e of moved) {
        const pol = policyOf(e.kind), key = String(bucketOf(monthOfEvent(e))), c = (_a = a.chunks)[key] ?? (_a[key] = { y0: Number(key) * CHUNK_YEARS, n: 0, lost: 0, rec: [] });
        if (!pol.store && !pinned.has(e.eventId)) {
          const k = (_b = a.counts)[key] ?? (_b[key] = {});
          k[e.kind] = (k[e.kind] ?? 0) + 1;
          continue;
        }
        if (c.cold) {
          c.rec = chunkRecords(a, key).slice();
          delete c.cold;
          hot.get(a)?.delete(key);
        }
        c.rec.push(toRecord(civ6, e));
        c.n++;
        a.total++;
        touched.add(key);
      }
      a.evBase += idx;
      a.rev++;
      for (const k of ["eventsChecked"]) if (ctx[k] != null) ctx[k] = Math.max(0, ctx[k] - idx);
      const N2 = civ6.wcde?.news;
      if (N2 && N2.scanned != null) N2.scanned = Math.max(0, N2.scanned - idx);
      if (civ6.interpCursor != null) civ6.interpCursor = Math.max(0, civ6.interpCursor - idx);
    }
    compact(civ6);
    return { moved: idx };
  }
  function compact(civ6) {
    const a = archiveOf(civ6), now = civ6.monthIndex;
    let dropped = 0;
    for (const key in a.chunks) {
      const c = a.chunks[key], old = now / 12 - (c.y0 + CHUNK_YEARS) > COLD_AFTER_YEARS - CHUNK_YEARS;
      if (c.cold && !old) continue;
      const recs = chunkRecords(a, key), keep = recs.filter((r) => survives(civ6, r, now)), lost = recs.length - keep.length;
      if (lost > 0 || old && !c.cold) {
        dropped += lost;
        c.lost += lost;
        c.n = keep.length;
        if (old && now / 12 >= c.y0 + CHUNK_YEARS) {
          c.cold = JSON.stringify(keep);
          delete c.rec;
          hot.get(a)?.delete(key);
        } else {
          c.rec = keep;
          delete c.cold;
        }
      }
    }
    if (dropped) {
      a.rev++;
      a.total -= dropped;
    }
    return dropped;
  }
  var evAsRecord = (civ6, e) => toRecord(civ6, { ...e, media: e.media ?? mediaOf(civ6, e.participants, e.kind) });
  function* iterRecords(civ6, { from = -Infinity, to = Infinity, kinds = null, types = null, includeLost = false } = {}) {
    const a = archiveOf(civ6), keys = Object.keys(a.chunks).map(Number).sort((x, y) => x - y), now = civ6.monthIndex;
    for (const k of keys) {
      const y0 = k * CHUNK_YEARS;
      if (y0 * 12 > to || (y0 + CHUNK_YEARS) * 12 < from) continue;
      for (const r of chunkRecords(a, String(k))) {
        if (r.t < from || r.t > to) continue;
        if (kinds && !kinds.includes(r.kind)) continue;
        if (types && !types.includes(r.ty)) continue;
        if (!includeLost && !survives(civ6, r, now)) continue;
        yield r;
      }
    }
    for (const e of civ6.events) {
      const t = monthOfEvent(e);
      if (t < from || t > to) continue;
      const pol = policyOf(e.kind);
      if (kinds && !kinds.includes(e.kind)) continue;
      if (types && !types.includes(pol.ty)) continue;
      if (!pol.store && !kinds) continue;
      yield evAsRecord(civ6, e);
    }
  }
  var idNum = (id) => Number(String(id).split("_").pop());
  function findRecord(civ6, id) {
    const live2 = civ6.events.find((e) => e.eventId === id);
    if (live2) return evAsRecord(civ6, live2);
    const a = archiveOf(civ6);
    for (const k in a.chunks) for (const r of chunkRecords(a, k)) if (r.eventId === id) return survives(civ6, r) ? r : null;
    return null;
  }
  var inLiveRange = (civ6, id) => !civ6.events.length || idNum(id) >= idNum(civ6.events[0].eventId);
  function recordsOf(civ6, entityId, { limit = 50 } = {}) {
    const out = [];
    for (const r of iterRecords(civ6)) if (r.participants.some((p) => p.entityId === entityId)) out.push(r);
    out.sort((x, y) => y.t - x.t);
    return out.slice(0, limit);
  }
  function pastView(civ6, month) {
    const states = /* @__PURE__ */ new Map(), cities = [], wars = /* @__PURE__ */ new Map();
    const ensure = (id) => states.get(id) ?? (states.set(id, { id, name: null, polity: null, capitalCell: null, cells: /* @__PURE__ */ new Set(), formedAt: null, endedAt: null, known: { formed: false, ended: false }, mentions: 0 }), states.get(id));
    for (const r of iterRecords(civ6, { to: month, types: ["state", "war", "treaty", "city", "tech"] })) {
      const f2 = r.facts ?? {}, sid = f2.stateId ?? r.participants.find((p) => p.role === "state" || p.role === "actor")?.entityId;
      if (r.kind === "state_formed") {
        const s = ensure(f2.stateId ?? sid);
        s.name = f2.name ?? s.name;
        s.polity = f2.polity ?? s.polity;
        s.capitalCell = f2.capitalCell ?? s.capitalCell;
        s.formedAt = r.t;
        s.known.formed = true;
        for (const c of f2.cells ?? []) s.cells.add(c);
        s.endedAt = null;
        s.known.ended = false;
      } else if (r.kind === "state_dissolved") {
        const s = ensure(sid);
        s.endedAt = r.t;
        s.known.ended = true;
        s.mentions++;
      } else if (r.kind === "regime_change" || r.kind === "state_action" && f2.polity) {
        const s = ensure(sid);
        if (f2.name) s.name = f2.name;
        if (f2.polity) s.polity = f2.polity;
        s.mentions++;
      } else if (r.kind === "group_joined_state" || r.kind === "conquest" || r.kind === "territory_occupied") {
        const s = ensure(f2.stateId ?? sid);
        for (const c of f2.cells ?? (f2.cell != null ? [f2.cell] : [])) s.cells.add(c);
        s.mentions++;
      } else if (r.kind === "war_declared") wars.set(f2.warId ?? r.eventId, { id: f2.warId ?? r.eventId, a: f2.aggressor ?? null, b: f2.defender ?? null, since: r.t, until: null });
      else if (r.kind === "war_ended") {
        const w = wars.get(f2.warId) ?? null;
        if (w) w.until = r.t;
        if (f2.stateId) {
          const s = ensure(f2.stateId);
          for (const c of f2.cells ?? []) s.cells.add(c);
          s.mentions++;
        }
      } else if (r.kind === "settlement_founded") cities.push({ id: r.eventId, cell: r.location?.cell ?? f2.cell ?? null, at: r.t });
    }
    const alive = [...states.values()].filter((s) => (s.formedAt != null || s.mentions > 0) && !s.known.ended);
    const owner = /* @__PURE__ */ new Map();
    for (const s of alive) for (const c of s.cells) owner.set(c, s.id);
    for (const s of alive) if (s.capitalCell != null) owner.set(s.capitalCell, s.id);
    return { month, states: alive.map((s) => ({ ...s, cells: [...s.cells], known: s.known, partial: !s.known.formed || s.name == null })), owner, cities, wars: [...wars.values()].filter((w) => w.until == null), note: "\u6B8B\u3063\u3066\u3044\u308B\u8CC7\u6599\u304B\u3089\u518D\u69CB\u6210\u3057\u305F\u59FF\u3067\u3059\u3002\u8CC7\u6599\u304C\u5931\u308F\u308C\u305F\u90E8\u5206\u306F\u4E0D\u660E\u3067\u3001\u305D\u3053\u306B\u4F55\u3082\u7121\u304B\u3063\u305F\u3068\u3044\u3046\u610F\u5473\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002" };
  }
  function checkArchive(civ6) {
    const errs = [], a = civ6.archive;
    if (!a) return errs;
    const seen = /* @__PURE__ */ new Set();
    for (const k in a.chunks) {
      const c = a.chunks[k];
      if (!c.rec && typeof c.cold !== "string") {
        errs.push(`\u8CC7\u6599\u30C1\u30E3\u30F3\u30AF ${k} \u304C\u7A7A`);
        continue;
      }
      for (const r of c.rec ?? []) {
        if (seen.has(r.eventId)) errs.push(`\u8CC7\u6599\u306E ID \u91CD\u8907 ${r.eventId}`);
        seen.add(r.eventId);
        for (const x of r.causes ?? []) if (x.basis !== "direct") errs.push(`\u8CC7\u6599 ${r.eventId} \u306B direct \u4EE5\u5916\u306E\u56E0\u679C\u30EA\u30F3\u30AF\u304C\u3042\u308B`);
        if ("decisionId" in r) errs.push(`\u8CC7\u6599 ${r.eventId} \u304C\u5224\u65AD\u306E ID \u3092\u6301\u3064`);
      }
    }
    if (civ6.decisions && civ6.decisions.length) errs.push("AI \u306E\u5224\u65AD\u8A18\u9332\u304C\u4FDD\u5B58\u3055\u308C\u3066\u3044\u308B\uFF08v6.1.0 \u306F\u4FDD\u5B58\u3057\u306A\u3044\uFF09");
    return errs;
  }

  // js/core/civ/events.js
  var RELATIONS = Object.freeze(["caused_by", "contributed_to", "reaction_to", "enabled_by", "part_of", "succeeded_by", "influenced_by", "related_to"]);
  var BASES = Object.freeze(["direct", "strong", "plausible", "contested", "unknown"]);
  function makeEvent(civ6, ids, { kind, title, participants = [], location = null, causes = [], effects = [], provenance = "simulation", facts = null, decisionId = null }) {
    void decisionId;
    for (const c of causes) {
      if (!RELATIONS.includes(c.relation)) throw new Error(`\u672A\u77E5\u306E\u95A2\u4FC2: ${c.relation}`);
      if (!BASES.includes(c.basis)) throw new Error(`\u672A\u77E5\u306E\u6839\u62E0: ${c.basis}`);
    }
    const direct = causes.filter((c) => c.basis === "direct");
    const ev = { eventId: ids.next("event"), date: { ...civ6.date }, kind, title, participants, location, causes: direct, effects, provenance, media: mediaOf(civ6, participants, kind) };
    if (facts) ev.facts = facts;
    civ6.events.push(ev);
    return ev;
  }

  // js/core/civ/history.js
  var HISTORY_VERSION = 1;
  var GROUP_DECADE = 120;
  var STR = /* @__PURE__ */ new Set(["name", "via", "polity", "cap", "leader", "goal", "camp", "wars", "st", "sub", "stage", "coh"]);
  var DYN = ["rel.", "tech.", "sanct."];
  var caches = /* @__PURE__ */ new WeakMap();
  var preC = /* @__PURE__ */ new Map();
  var pre = (p, k) => {
    let m = preC.get(p);
    if (!m) preC.set(p, m = /* @__PURE__ */ new Map());
    let v = m.get(k);
    if (v === void 0) m.set(k, v = p + k);
    return v;
  };
  var newHistory = () => ({ v: HISTORY_VERSION, dict: [""], states: {}, groups: {}, last: -1 });
  var cacheOf = (H) => {
    let c = caches.get(H);
    if (!c) {
      c = { dix: new Map(H.dict.map((s, i) => [s, i])), lastS: /* @__PURE__ */ new Map(), lastG: /* @__PURE__ */ new Map(), dyn: /* @__PURE__ */ new Map(), aliveG: null };
      caches.set(H, c);
    }
    return c;
  };
  var D = (H, c, s) => {
    let i = c.dix.get(s);
    if (i === void 0) {
      i = H.dict.length;
      H.dict.push(s);
      c.dix.set(s, i);
    }
    return i;
  };
  var enc = (H, c, k, v) => STR.has(k) ? D(H, c, v) : v;
  function put(f2, k, t, v) {
    const a = f2[k];
    if (!a) {
      f2[k] = [t, v];
      return;
    }
    const n2 = a.length;
    if (a[n2 - 2] === t) {
      if (n2 >= 4 && a[n2 - 3] === v) a.length = n2 - 2;
      else a[n2 - 1] = v;
      return;
    }
    if (a[n2 - 1] !== v) a.push(t, v);
  }
  function at(a, m) {
    if (!a || a[0] > m) return void 0;
    let lo = 0, hi = (a.length >> 1) - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (a[mid * 2] <= m) lo = mid;
      else hi = mid - 1;
    }
    return a[lo * 2 + 1];
  }
  var tail = (H, f2) => {
    const o = {};
    for (const k in f2) {
      const a = f2[k], v = a[a.length - 1];
      o[k] = STR.has(k) ? H.dict[v] : v;
    }
    return o;
  };
  function extractState(st2, groupCount) {
    const o = {
      alive: st2.alive ? 1 : 0,
      player: st2.player ? 1 : 0,
      name: st2.name,
      via: st2.via,
      polity: st2.polity,
      cap: st2.capitalGroupId ?? "",
      leader: st2.leader.name,
      heir: st2.leader.heir ? 1 : 0,
      pop: Math.round(st2.pop),
      tr: Math.round(st2.treasury * 100),
      stb: Math.round(st2.stability * 1e4),
      army: Math.round(st2.army),
      settle: st2.settlements,
      ng: groupCount,
      def: Math.round(st2.defense * 1e3),
      tax: Math.round(st2.policy.tax * 1e3),
      mob: Math.round(st2.policy.mobilization * 1e3),
      assim: Math.round(st2.policy.assimilation * 1e3),
      tol: Math.round(st2.policy.tolerance * 1e3),
      auto: Math.round(st2.policy.autonomy * 1e3),
      goal: st2.strategy?.goal ?? "",
      camp: st2.campaign ? `${st2.campaign.kind}:${st2.campaign.stage}:${st2.campaign.target}` : "",
      wars: st2.warIds.join(",")
    };
    for (const k in st2.techAdopted) o[pre("tech.", k)] = 1;
    for (const k in st2.relations) o[pre("rel.", k)] = Math.round(st2.relations[k] * 10);
    for (const k in st2.sanctions) o[pre("sanct.", k)] = st2.sanctions[k];
    o.res = Math.round((st2.resilience ?? 0) * 1e3);
    if (st2.magic) o.magic = Math.round((st2.magic.power ?? 0) * 1e3);
    if (st2.econ) {
      o.ind = Math.round((st2.econ.industry ?? 0) * 10);
      o.trinc = Math.round((st2.econ.tradeIncome ?? 0) * 100);
    }
    if (st2.politics) {
      o.leg = Math.round(st2.politics.legitimacy * 1e3);
      o.fat = Math.round(st2.politics.fatigue * 1e3);
    }
    if (st2.military) {
      o.milb = Math.round((st2.milBonus ?? 0) * 1e3);
      o.doct = Object.keys(st2.military.doctrine.taken).length;
    }
    return o;
  }
  function recordEntity(H, c, bag, lastMap, id, cur, t) {
    let ent = bag[id];
    if (!ent) {
      ent = bag[id] = { from: t, f: {} };
    }
    let last = lastMap.get(id);
    if (!last) {
      last = tail(H, ent.f);
      lastMap.set(id, last);
    }
    let dyn = c.dyn.get(id);
    if (!dyn) {
      dyn = /* @__PURE__ */ new Set();
      for (const k in last) if (DYN.some((p) => k.startsWith(p))) dyn.add(k);
      c.dyn.set(id, dyn);
    }
    for (const k in cur) {
      const v = cur[k];
      if (last[k] !== v) {
        put(ent.f, k, t, enc(H, c, k, v));
        if (!(k in last) && DYN.some((p) => k.startsWith(p))) dyn.add(k);
        last[k] = v;
      }
    }
    for (const k of dyn) if (!(k in cur) && last[k] !== 0) {
      put(ent.f, k, t, 0);
      last[k] = 0;
    }
  }
  function recordMonth(ctx, byStateMap) {
    const { civ: civ6 } = ctx, t = civ6.monthIndex, H = civ6.history ?? (civ6.history = newHistory()), c = cacheOf(H), counts = /* @__PURE__ */ new Map();
    if (!c.aliveG) {
      c.aliveG = /* @__PURE__ */ new Set();
      for (const id in H.groups) {
        const a = H.groups[id].f.alive;
        if (a && a[a.length - 1] === 1) c.aliveG.add(id);
      }
    }
    const dec2 = t % GROUP_DECADE === 0;
    for (const id in civ6.groups) {
      const g = civ6.groups[id];
      if (g.stateId) counts.set(g.stateId, (counts.get(g.stateId) ?? 0) + 1);
      const st2 = g.settlementId ? civ6.settlements[g.settlementId]?.stage ?? "" : "", L = c.lastG.get(id);
      if (!dec2 && L && L.alive === 1 && L.cell === g.cell && L.st === (g.stateId ?? "") && L.sub === g.subsistence && L.stage === st2) continue;
      const cur = { alive: 1, cell: g.cell, st: g.stateId ?? "", sub: g.subsistence, stage: st2 };
      if (dec2) {
        cur.pop = Math.round(g.pop);
        cur.coh = g.cohorts.map((x) => `${x.cultureId}|${x.religionId ?? ""}|${x.speciesId}|${Math.round(x.share * 1e3)}`).join(";");
      }
      recordEntity(H, c, H.groups, c.lastG, id, cur, t);
      c.aliveG.add(id);
    }
    for (const id of c.aliveG) if (!civ6.groups[id]) {
      recordEntity(H, c, H.groups, c.lastG, id, { alive: 0 }, t);
      c.aliveG.delete(id);
    }
    for (const id in civ6.states) {
      const st2 = civ6.states[id];
      if (!st2.alive && H.states[id] && c.lastS.get(id)?.alive === 0) continue;
      recordEntity(H, c, H.states, c.lastS, id, extractState(st2, counts.get(id) ?? 0), t);
    }
    H.last = t;
  }
  var dget = (H, f2, k, m) => {
    const v = at(f2[k], m);
    return v === void 0 ? void 0 : STR.has(k) ? H.dict[v] : v;
  };
  function stateAt(civ6, id, m) {
    const H = civ6.history, e = H?.states[id];
    if (!e || m < e.from) return null;
    const f2 = e.f, g = (k) => dget(H, f2, k, m), o = {
      id,
      alive: g("alive") === 1,
      player: g("player") === 1,
      name: g("name"),
      via: g("via"),
      polity: g("polity"),
      capitalGroupId: g("cap") || null,
      leader: { name: g("leader"), heir: g("heir") === 1 },
      pop: g("pop"),
      treasury: g("tr") / 100,
      stability: g("stb") / 1e4,
      army: g("army"),
      settlements: g("settle"),
      groupCount: g("ng"),
      defense: g("def") / 1e3,
      policy: { tax: g("tax") / 1e3, mobilization: g("mob") / 1e3, assimilation: g("assim") / 1e3, tolerance: g("tol") / 1e3, autonomy: g("auto") / 1e3 },
      strategy: g("goal") || null,
      campaign: g("camp") || null,
      warIds: (g("wars") || "").split(",").filter(Boolean),
      techAdopted: [],
      relations: {},
      sanctions: {}
    };
    for (const k in f2) {
      const v = at(f2[k], m);
      if (k.startsWith("tech.")) {
        if (v === 1) o.techAdopted.push(k.slice(5));
      } else if (k.startsWith("rel.")) {
        if (v) o.relations[k.slice(4)] = v / 10;
      } else if (k.startsWith("sanct.")) {
        if (v) o.sanctions[k.slice(6)] = v;
      }
    }
    o.resilience = g("res") / 1e3;
    o.techAdopted.sort();
    if (f2.ind) o.econ = { industry: g("ind") / 10, tradeIncome: g("trinc") / 100 };
    if (f2.leg) o.politics = { legitimacy: g("leg") / 1e3, fatigue: g("fat") / 1e3 };
    if (f2.milb) o.military = { bonus: g("milb") / 1e3, doctrines: g("doct") };
    if (f2.magic) o.magicPower = (at(f2.magic, m) ?? 0) / 1e3;
    return o;
  }
  function groupsAt(civ6, m) {
    const H = civ6.history, out = /* @__PURE__ */ new Map();
    for (const id in H?.groups ?? {}) {
      const e = H.groups[id];
      if (m < e.from) continue;
      const f2 = e.f;
      if (dget(H, f2, "alive", m) !== 1) continue;
      const dm = Math.floor(m / GROUP_DECADE) * GROUP_DECADE;
      let pop = at(f2.pop, m);
      out.set(id, { id, cell: at(f2.cell, m), stateId: dget(H, f2, "st", m) || null, subsistence: dget(H, f2, "sub", m), stage: dget(H, f2, "stage", m) || null, pop, popAsOf: dm });
    }
    return out;
  }
  function compositionAt(civ6, stateId, m) {
    const H = civ6.history, out = { culture: {}, religion: {}, species: {}, total: 0 }, dm = Math.floor(m / GROUP_DECADE) * GROUP_DECADE;
    for (const [id, g] of groupsAt(civ6, m)) {
      if (g.stateId !== stateId) continue;
      const coh = H.dict[at(H.groups[id].f.coh, dm) ?? 0] ?? "";
      const pop = at(H.groups[id].f.pop, dm) ?? g.pop ?? 0;
      for (const part of coh.split(";").filter(Boolean)) {
        const [cu, re, sp, sh] = part.split("|"), n2 = pop * (+sh / 1e3);
        out.total += n2;
        out.culture[cu] = (out.culture[cu] ?? 0) + n2;
        const r = re || "none";
        out.religion[r] = (out.religion[r] ?? 0) + n2;
        out.species[sp] = (out.species[sp] ?? 0) + n2;
      }
    }
    return out;
  }
  function ownerMapAt(civ6, territoryOf2, world, m) {
    const owner = /* @__PURE__ */ new Map();
    for (const g of groupsAt(civ6, m).values()) if (g.stateId) for (const c of territoryOf2(world, g.cell)) owner.set(c, g.stateId);
    return owner;
  }

  // js/core/civ/civ-chunks.js
  var enc2 = new TextEncoder();
  var dec = new TextDecoder();

  // js/core/civ/graph.js
  var evMonth = (ev) => ev.date.year * 12 + (ev.date.month - 1);
  var idxCache = /* @__PURE__ */ new WeakMap();
  var push = (m, k, v) => {
    const a = m.get(k);
    if (a) a.push(v);
    else m.set(k, [v]);
  };
  function graphIndex(civ6) {
    let ix = idxCache.get(civ6);
    if (!ix || ix.eventsRef !== civ6.events || ix.upto > civ6.events.length) ix = { eventsRef: civ6.events, upto: 0, pos: /* @__PURE__ */ new Map(), effects: /* @__PURE__ */ new Map(), byEntity: /* @__PURE__ */ new Map(), byDecision: /* @__PURE__ */ new Map(), decUpto: 0, decPos: /* @__PURE__ */ new Map(), decByActor: /* @__PURE__ */ new Map(), decByMonth: /* @__PURE__ */ new Map() }, idxCache.set(civ6, ix);
    const E = civ6.events;
    for (; ix.upto < E.length; ix.upto++) {
      const ev = E[ix.upto], i = ix.upto;
      ix.pos.set(ev.eventId, i);
      for (const c of ev.causes) push(ix.effects, c.targetId, { from: ev.eventId, relation: c.relation, basis: c.basis, userEdited: !!c.userEdited });
      const seen = /* @__PURE__ */ new Set();
      for (const p of ev.participants) if (!seen.has(p.entityId)) {
        seen.add(p.entityId);
        push(ix.byEntity, p.entityId, i);
      }
      if (ev.decisionId) push(ix.byDecision, ev.decisionId, i);
    }
    const D2 = civ6.decisions ?? [];
    for (; ix.decUpto < D2.length; ix.decUpto++) {
      const d = D2[ix.decUpto];
      ix.decPos.set(d.decisionId, ix.decUpto);
      push(ix.decByActor, d.actorId, ix.decUpto);
      push(ix.decByMonth, d.date.year * 12 + d.date.month - 1, ix.decUpto);
    }
    return ix;
  }
  var getEvent = (civ6, id) => {
    const ix = graphIndex(civ6), i = ix.pos.get(id);
    return i === void 0 ? civ6.archive ? findRecord(civ6, id) : null : civ6.events[i];
  };
  function consequencesOf(civ6, id) {
    const ix = graphIndex(civ6);
    return (ix.effects.get(id) ?? []).map((r) => ({ ...r, event: getEvent(civ6, r.from) }));
  }
  function recentEventsFor(civ6, entityIds, kinds, window2, limit = 2) {
    const ix = graphIndex(civ6), now = civ6.monthIndex, out = [], seen = /* @__PURE__ */ new Set();
    for (const e of entityIds) {
      const a = ix.byEntity.get(e);
      if (!a) continue;
      for (let i = a.length - 1; i >= 0; i--) {
        const ev = civ6.events[a[i]];
        if (now - evMonth(ev) > window2) break;
        if (kinds.includes(ev.kind) && !seen.has(ev.eventId)) {
          seen.add(ev.eventId);
          out.push(ev);
        }
      }
    }
    out.sort((x, y) => evMonth(y) - evMonth(x) || (x.eventId < y.eventId ? 1 : -1));
    return out.slice(0, limit);
  }
  var asCauses = (events, relation, basis) => events.map((e) => ({ targetId: e.eventId, relation, basis }));

  // js/core/civ/cohorts.js
  var INTERESTS = Object.freeze({ autonomy: "\u81EA\u6CBB", religious_freedom: "\u4FE1\u4EF0\u306E\u81EA\u7531", language_rights: "\u8A00\u8A9E\u306E\u6A29\u5229", tax_relief: "\u6E1B\u7A0E", land: "\u571F\u5730", security: "\u5B89\u5168" });
  var dominant = (g) => {
    let b = g.cohorts[0];
    for (const c of g.cohorts) if (c.share > b.share) b = c;
    return b;
  };
  var normalize = (g) => {
    let t = 0;
    for (const c of g.cohorts) t += c.share;
    for (const c of g.cohorts) c.share /= t || 1;
  };
  function addCohort(g, from, share) {
    let c = g.cohorts.find((x) => x.cultureId === from.cultureId && x.religionId === from.religionId && x.speciesId === from.speciesId);
    const made = !c;
    if (!c) {
      c = { cultureId: from.cultureId, languageId: from.languageId, religionId: from.religionId, speciesId: from.speciesId, share: 0, tension: 0.1, interest: null };
      g.cohorts.push(c);
    }
    const d = dominant(g);
    if (d === c) return made;
    const mv = Math.min(share, d.share * 0.5);
    d.share -= mv;
    c.share += mv;
    normalize(g);
    return made;
  }
  function tensionTarget(c, ref, state) {
    const parts = { religion: c.religionId !== ref.religionId && c.religionId ? 0.3 : 0, language: c.languageId !== ref.languageId ? 0.25 : 0, culture: c.cultureId !== ref.cultureId ? 0.15 : 0, tax: state ? Math.max(0, state.policy.tax - 0.12) * 1.5 : 0, species: c.speciesId !== ref.speciesId ? 0.2 : 0 };
    if (state) {
      parts.religion *= 1 - 0.6 * state.policy.tolerance;
      parts.language *= 1 - 0.5 * state.policy.autonomy;
    }
    let t = 0.05, best = null, bv = 0;
    for (const [k, v] of Object.entries(parts)) {
      t += v;
      if (v > bv) {
        bv = v;
        best = k;
      }
    }
    const interest = { religion: "religious_freedom", language: "language_rights", culture: "autonomy", tax: "tax_relief", species: "autonomy" }[best] ?? null;
    return { target: Math.min(1, t), interest };
  }
  function stepCohorts(ctx) {
    const { civ: civ6, ids } = ctx, mi = civ6.monthIndex;
    if (mi % 3 !== 0) return;
    for (const id in civ6.groups) {
      const g = civ6.groups[id];
      if (g.cohorts.length < 2) continue;
      const st2 = g.stateId ? civ6.states[g.stateId] : null, cap = st2 ? civ6.groups[st2.capitalGroupId] : null, ref = dominant(cap && cap.cohorts.length ? cap : g);
      const assim = st2 ? st2.policy.assimilation : 0;
      let changed = false;
      for (const c of g.cohorts) {
        if (!st2 && c === dominant(g)) continue;
        const { target, interest } = tensionTarget(c, ref, st2);
        const was = c.tension;
        c.tension += (target + assim * 0.2 - c.tension) * 0.14;
        c.interest = interest;
        if (c.tension < 0.5) c.demandSpent = false;
        if (was < 0.7 && c.tension >= 0.7 && !c.demandSpent && (c.demandSpent = true)) makeEvent(civ6, ids, { kind: "demand_raised", title: `\u5C11\u6570\u306E\u4EBA\u3005\u304C\u300C${INTERESTS[interest] ?? "\u6539\u5584"}\u300D\u3092\u6C42\u3081\u308B`, participants: [{ entityId: g.id, role: "group" }, ...st2 ? [{ entityId: st2.id, role: "state" }] : []], location: { cell: g.cell }, causes: [...asCauses(recentEventsFor(civ6, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible"), ...st2 ? asCauses(recentEventsFor(civ6, [st2.id], ["war_ended", "leader_succession"], 36, 1), "contributed_to", "plausible") : []], effects: [{ targetId: g.id, property: "cohort_tension", before: Math.round(was * 100) / 100, after: Math.round(c.tension * 100) / 100 }] });
        const d = dominant(g);
        if (c !== d && c.speciesId === d.speciesId) {
          const mv = c.share * 24e-4 * (1 + 3 * assim);
          c.share -= mv;
          d.share += mv;
          changed = true;
        }
      }
      if (changed) {
        const before = g.cohorts.length;
        g.cohorts = g.cohorts.filter((c) => c.share >= 0.01 || c === dominant(g));
        normalize(g);
        if (g.cohorts.length < before) makeEvent(civ6, ids, { kind: "cohort_assimilated", title: "\u5C11\u6570\u306E\u4EBA\u3005\u304C\u591A\u6570\u6D3E\u3078\u6EB6\u3051\u8FBC\u3093\u3060", participants: [{ entityId: g.id, role: "group" }], location: { cell: g.cell } });
      }
    }
  }

  // js/core/civ/spatial.js
  function spatialOf(ctx) {
    if (ctx._spatial && ctx._spatialMonth === ctx.civ.monthIndex) return ctx._spatial;
    const { world, civ: civ6 } = ctx, home = /* @__PURE__ */ new Map(), terr = /* @__PURE__ */ new Map();
    for (const id in civ6.groups) {
      const g = civ6.groups[id];
      home.set(g.cell, id);
      for (const c of g.cells ?? [g.cell]) {
        const a = terr.get(c);
        if (a) a.push(id);
        else terr.set(c, [id]);
      }
    }
    ctx._spatial = { home, terr };
    ctx._spatialMonth = civ6.monthIndex;
    return ctx._spatial;
  }
  function neighborGroups(ctx, g) {
    const { world } = ctx, m = world.mesh, { terr } = spatialOf(ctx), out = /* @__PURE__ */ new Set();
    for (const c of g.cells ?? [g.cell]) {
      for (const o of terr.get(c) ?? []) if (o !== g.id) out.add(o);
      for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) for (const o of terr.get(m.neighborIds[k]) ?? []) if (o !== g.id) out.add(o);
    }
    return out;
  }
  function byState(ctx) {
    if (ctx._byState && ctx._byStateMonth === ctx.civ.monthIndex) return ctx._byState;
    const m = /* @__PURE__ */ new Map();
    for (const id in ctx.civ.groups) {
      const g = ctx.civ.groups[id];
      if (g.stateId) {
        const a = m.get(g.stateId);
        if (a) a.push(g);
        else m.set(g.stateId, [g]);
      }
    }
    ctx._byState = m;
    ctx._byStateMonth = ctx.civ.monthIndex;
    return m;
  }
  var invalidateMonthCaches = (ctx) => {
    ctx._spatial = ctx._byState = null;
  };

  // js/core/wcde/domains/naming.js
  var KN = ["", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D"];
  var kanjiNum = (n2) => n2 < 10 ? KN[n2] : n2 < 20 ? "\u5341" + KN[n2 % 10] : n2 < 100 ? KN[Math.floor(n2 / 10)] + "\u5341" + KN[n2 % 10] : String(n2);
  var FORMS = ["\u9023\u90A6\u5171\u548C\u56FD", "\u795E\u8056\u738B\u56FD", "\u9023\u5408\u738B\u56FD", "\u90E8\u65CF\u9023\u5408", "\u5171\u548C\u56FD", "\u6559\u56E3\u56FD", "\u795E\u8056\u56FD", "\u9996\u9577\u56FD", "\u9023\u90A6", "\u9023\u5408", "\u540C\u76DF", "\u9023\u76DF", "\u5E1D\u56FD", "\u738B\u56FD", "\u516C\u56FD", "\u4FAF\u56FD", "\u6C57\u56FD", "\u6559\u56FD", "\u90E8\u65CF", "\u5E02\u56FD", "\u671D", "\u56FD"];
  var byBase = (base, arr) => arr[hashSeed(String(base), "form") % arr.length];
  function stateForm(polity, via = null, base = "") {
    switch (polity) {
      case "kingdom":
        return byBase(base, ["\u738B\u56FD", "\u738B\u56FD", "\u738B\u56FD", "\u671D"]);
      case "empire":
        return byBase(base, ["\u5E1D\u56FD", "\u5E1D\u56FD", "\u5E1D\u56FD", "\u671D"]);
      case "republic":
        return "\u5171\u548C\u56FD";
      case "federation":
        return "\u9023\u90A6";
      case "theocracy":
        return via === "religious_polity" ? "\u6559\u56FD" : byBase(base, ["\u795E\u8056\u738B\u56FD", "\u6559\u56FD"]);
      case "chiefdom":
        return via === "city_state" ? byBase(base, ["\u516C\u56FD", "\u738B\u56FD"]) : byBase(base, ["\u516C\u56FD", "\u4FAF\u56FD", "\u738B\u56FD"]);
      default:
        return via === "nomad_confederation" ? "\u6C57\u56FD" : via === "agri_union" ? byBase(base, ["\u738B\u56FD", "\u9023\u90A6"]) : via === "defense_league" ? "\u9023\u76DF" : byBase(base, ["\u738B\u56FD", "\u516C\u56FD"]);
    }
  }
  function baseOfState(st2) {
    if (st2.nameBase) return st2.nameBase;
    const n2 = String(st2.name ?? "");
    for (const f2 of FORMS) if (n2.length > f2.length && n2.endsWith(f2)) return n2.slice(0, -f2.length);
    return n2;
  }
  var composeStateName = (base, polity, via) => base + stateForm(polity, via, base);
  function retitle(st2, polity) {
    if (!st2.nameBase && !FORMS.some((f2) => String(st2.name).endsWith(f2))) return null;
    const base = baseOfState(st2), next = composeStateName(base, polity, st2.via);
    return next !== st2.name ? { base, name: next } : null;
  }
  var REGNAL = /* @__PURE__ */ new Set(["chiefdom", "kingdom", "empire", "theocracy"]);
  var stripOrd = (n2) => String(n2).replace(/[0-9０-９]+世$/, "");
  var baseOfLeader = stripOrd;
  function leaderName(st2, fresh, rnd) {
    const raw = stripOrd(fresh);
    if (!REGNAL.has(st2.polity)) return raw;
    const reg = st2.regnal ?? (st2.regnal = {}), keys = Object.keys(reg);
    const base = keys.length && rnd() < 0.4 ? keys[Math.floor(rnd() * keys.length)] : raw;
    reg[base] = (reg[base] ?? 0) + 1;
    return `${base}${reg[base]}\u4E16`;
  }
  var leaderRng = (civ6, st2, ...p) => rngOf(hashSeed(civ6.historySeed, "leader", st2.id, civ6.monthIndex, ...p));
  var DYN2 = { kingdom: "\u738B\u671D", empire: "\u738B\u671D", chiefdom: "\u9996\u9577\u5BB6", theocracy: "\u6559\u7D71", republic: "\u653F\u6A29" };
  var dynastyName = (polity, n2, founder = "") => polity === "tribal" ? `${stripOrd(founder)}\u6C0F` : `\u7B2C${kanjiNum(n2)}${DYN2[polity] ?? "\u653F\u6A29"}`;
  function warNameFor(ctx, w, placeOf) {
    const { civ: civ6 } = ctx, A2 = civ6.states[w.aggressor], D2 = civ6.states[w.defender];
    if (!A2 || !D2) return null;
    const a = baseOfState(A2), d = baseOfState(D2), r = rngOf(hashSeed(civ6.historySeed, "warname", w.id));
    const pats = [`${a}\u30FB${d}\u6226\u4E89`, `${d}\u5F81\u8A0E\u6226\u4E89`, `${d}\u6226\u4E89`];
    const p = placeOf?.();
    if (p) pats.push(`${p}\u6226\u4E89`);
    const base = pats[Math.floor(r() * pats.length)];
    const n2 = Object.values(civ6.wars).filter((x) => x.id !== w.id && x.name && x.startedAt >= w.startedAt - 1200 && (x.aggressor === w.aggressor && x.defender === w.defender || x.aggressor === w.defender && x.defender === w.aggressor)).length;
    let name = n2 ? `\u7B2C${kanjiNum(n2 + 1)}\u6B21${base}` : base, k = n2;
    while (Object.values(civ6.wars).some((x) => x.id !== w.id && x.name === name)) name = `\u7B2C${kanjiNum(++k + 1)}\u6B21${base}`;
    return name;
  }
  function siteDescriptors(f2) {
    const out = [];
    if (f2.river) out.push("\u6CB3\u7554", "\u6E21\u6CB3");
    if (f2.mountain) out.push("\u5CE0", "\u5C71\u9E93");
    if (f2.coast) out.push("\u6E7E", "\u6D77\u5CB8");
    if (f2.forest) out.push("\u68EE");
    if (f2.wet) out.push("\u6CBC\u6CA2");
    if (f2.dry) out.push("\u8352\u91CE");
    if (f2.plain) out.push("\u5E73\u539F", "\u91CE");
    return out.length ? out : ["\u91CE"];
  }
  function religionRoot(name) {
    const n2 = String(name ?? ""), i = n2.indexOf("\u6559");
    return i >= 0 ? n2.slice(0, i + 1) : n2;
  }
  var sectName = (parentName, sect) => `${religionRoot(parentName)}${sect}\u6D3E`;

  // js/core/civ/culture.js
  var SYL = ["\u30AB", "\u30ED", "\u30DF", "\u30BF", "\u30B9", "\u30CD", "\u30F4\u30A9", "\u30EA", "\u30A2\u30F3", "\u30CF", "\u30C9", "\u30EC", "\u30E6", "\u30B5", "\u30AD", "\u30CE", "\u30D9", "\u30B0", "\u30DE", "\u30B8", "\u30E9", "\u30AA", "\u30C8", "\u30B7\u30A7"];
  var makeNameJa = (rng) => {
    const n2 = 3 + (rng() < 0.5 ? 1 : 0);
    let s = "";
    for (let i = 0; i < n2; i++) s += SYL[Math.floor(rng() * SYL.length)];
    return s;
  };
  var RELIGION_KINDS = Object.freeze(["\u7CBE\u970A\u4FE1\u4EF0", "\u7956\u970A\u4FE1\u4EF0", "\u592A\u967D\u4FE1\u4EF0", "\u5927\u5730\u6BCD\u795E", "\u591A\u795E\u6559", "\u4E00\u795E\u6559"]);
  function createCulture(civ6, ids, rng, { parent = null, cell = null } = {}) {
    const id = ids.next("culture");
    civ6.cultures[id] = { id, name: makeNameJa(rng) + "\u4EBA", parent, bornAt: civ6.monthIndex, cell };
    return id;
  }
  function createLanguage(civ6, ids, rng, { parent = null, cultureId = null } = {}) {
    const id = ids.next("lang");
    civ6.languages[id] = { id, name: makeNameJa(rng) + "\u8A9E", parent, bornAt: civ6.monthIndex, cultureId };
    return id;
  }
  function createReligion(civ6, ids, rng, { parent = null, kind = null } = {}) {
    const id = ids.next("religion");
    civ6.religions[id] = { id, name: parent && civ6.religions[parent] ? sectName(civ6.religions[parent].name, makeNameJa(rng)) : makeNameJa(rng) + "\u6559", kind: kind ?? RELIGION_KINDS[Math.floor(rng() * RELIGION_KINDS.length)], parent, bornAt: civ6.monthIndex };
    return id;
  }
  var STAGE_OK = /* @__PURE__ */ new Set(["town", "city"]);
  function stepCulture(ctx) {
    const { world, civ: civ6, ids, rng } = ctx, mi = civ6.monthIndex;
    for (const id in civ6.groups) {
      const g = civ6.groups[id], d = dominant(g), age = mi - g.bornAt;
      if (age > 360 && rng() < 3e-4) {
        const old = d.languageId, nl = createLanguage(civ6, ids, rng, { parent: old, cultureId: d.cultureId });
        d.languageId = nl;
        makeEvent(civ6, ids, { kind: "language_diverged", title: `${civ6.languages[old].name}\u304B\u3089\u65B0\u3057\u3044\u8A00\u8A9E\u304C\u5206\u304B\u308C\u305F`, participants: [{ entityId: g.id, role: "speakers" }, { entityId: nl, role: "language" }, { entityId: old, role: "parent_language" }], location: { cell: g.cell } });
      }
      if (age > 360 && g.pop > 400 && rng() < 2e-4) {
        const old = d.cultureId, nc = createCulture(civ6, ids, rng, { parent: old, cell: g.cell });
        d.cultureId = nc;
        makeEvent(civ6, ids, { kind: "culture_diverged", title: `${civ6.cultures[old].name}\u304B\u3089\u65B0\u3057\u3044\u6587\u5316\u304C\u5206\u304B\u308C\u305F`, participants: [{ entityId: g.id, role: "bearers" }, { entityId: nc, role: "culture" }, { entityId: old, role: "parent_culture" }], location: { cell: g.cell } });
      }
      const st2 = g.settlementId ? civ6.settlements[g.settlementId] : null;
      if (!d.religionId && st2 && STAGE_OK.has(st2.stage) && rng() < 2e-3) {
        const r = createReligion(civ6, ids, rng);
        d.religionId = r;
        makeEvent(civ6, ids, { kind: "religion_founded", title: `${civ6.religions[r].name}\uFF08${civ6.religions[r].kind}\uFF09\u304C\u751F\u307E\u308C\u305F`, participants: [{ entityId: g.id, role: "origin" }, { entityId: r, role: "religion" }], location: { cell: g.cell } });
      }
      if (rng() < 0.03) {
        const ns = [...neighborGroups(ctx, g)];
        if (!ns.length) continue;
        const o = civ6.groups[ns[Math.floor(rng() * ns.length)]], od = dominant(o);
        if (od.cultureId !== d.cultureId) {
          const key = [d.cultureId, od.cultureId].sort().join("|");
          if (!civ6.contacts[key]) {
            civ6.contacts[key] = mi;
            makeEvent(civ6, ids, { kind: "culture_contact", title: `${civ6.cultures[d.cultureId].name}\u3068${civ6.cultures[od.cultureId].name}\u304C\u51FA\u4F1A\u3063\u305F`, participants: [{ entityId: d.cultureId, role: "culture_a" }, { entityId: od.cultureId, role: "culture_b" }, { entityId: g.id, role: "place_a" }, { entityId: o.id, role: "place_b" }], location: { cell: g.cell } });
          }
          if (mi - (g.lastMixAt ?? -999) >= 240 && rng() < 0.06 && (g.lastMixAt = mi, addCohort(g, od, 0.06))) makeEvent(civ6, ids, { kind: "cohort_formed", title: "\u7570\u306A\u308B\u6587\u5316\u306E\u4EBA\u3005\u304C\u6DF7\u3056\u308A\u5408\u3044\u59CB\u3081\u305F", participants: [{ entityId: g.id, role: "group" }, { entityId: od.cultureId, role: "culture" }], location: { cell: g.cell } });
        }
        if (d.religionId && od.religionId !== d.religionId && !od.religionId && rng() < 0.2) {
          od.religionId = d.religionId;
          makeEvent(civ6, ids, { kind: "religion_spread", title: `${civ6.religions[d.religionId].name}\u304C\u5E83\u307E\u3063\u305F`, participants: [{ entityId: d.religionId, role: "religion" }, { entityId: o.id, role: "adopter" }, { entityId: g.id, role: "source" }], location: { cell: o.cell } });
        }
      }
    }
  }

  // js/core/civ/species.js
  var SPECIES = Object.freeze({
    archaic: { id: "archaic", ja: "\u53E4\u4EE3\u578B\u4EBA\u985E", lifespan: 840, growth: 0.92, techRate: 0.72, martial: 1, magic: 0, env: [] },
    // v6.1.0: 人類の祖先系統（先史の初期。現生人類へ置き換わる・混血していく）
    human: { id: "human", ja: "\u4EBA\u9593", lifespan: 960, growth: 1, techRate: 1, martial: 1, magic: 2e-3, env: [] },
    elf: { id: "elf", ja: "\u30A8\u30EB\u30D5", lifespan: 4800, growth: 0.55, techRate: 1.1, martial: 0.95, magic: 0.02, env: [BIOMES2.TEMPERATE_FOREST, BIOMES2.TAIGA, BIOMES2.RAINFOREST] },
    dwarf: { id: "dwarf", ja: "\u30C9\u30EF\u30FC\u30D5", lifespan: 2400, growth: 0.8, techRate: 1.12, martial: 1.15, magic: 4e-3, env: [BIOMES2.ALPINE, BIOMES2.COLD_DESERT, BIOMES2.TAIGA] },
    beastfolk: { id: "beastfolk", ja: "\u7363\u4EBA", lifespan: 600, growth: 1.05, techRate: 0.9, martial: 1.2, magic: 3e-3, env: [BIOMES2.SAVANNA, BIOMES2.GRASSLAND, BIOMES2.TROPICAL_SEASONAL] }
  });
  var speciesOf = (id, civ6 = null) => civ6?.speciesDefs?.[id] ?? SPECIES[id] ?? SPECIES.human;
  var lifeScale = (civ6, st2) => {
    const g = civ6.groups[st2.capitalGroupId];
    const sp = g?.cohorts?.length ? speciesOf(g.cohorts.reduce((b, c) => c.share > b.share ? c : b).speciesId, civ6) : SPECIES.human;
    return sp.lifespan / SPECIES.human.lifespan;
  };

  // js/core/civ/civ-state.js
  var CIV_STATE_VERSION = 3;
  function hashSeed(...parts) {
    let h2 = 2166136261 >>> 0;
    for (const p of parts) {
      const s = String(p);
      for (let i = 0; i < s.length; i++) {
        h2 ^= s.charCodeAt(i);
        h2 = Math.imul(h2, 16777619) >>> 0;
      }
      h2 ^= 255;
      h2 = Math.imul(h2, 16777619) >>> 0;
    }
    return h2 >>> 0;
  }
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function emptyLayers() {
    return { states: {}, cultures: {}, languages: {}, religions: {}, contacts: {}, techWorld: {}, wars: {}, treaties: {}, activeWarIds: [], activeTreatyIds: [], archive: null, options: { aiInterval: 6 }, interpretations: [], works: [], interpCursor: 0, species: {}, persons: {}, magic: { orgs: {}, living: [] }, disasters: {}, climate: { index: 0, phase: "normal", since: 0 }, memory: {} };
  }
  function newGroup(id, { cell, pop, subsistence = "forage", species = "human", origin = null, bornAt = 0, knowledge = null, parent = null }) {
    return { id, speciesId: species, cell, pop, subsistence, player: false, origin, parent, bornAt, settledMonths: 0, lastBudAt: bornAt, famineAt: -999, stateId: null, pressure: 0, cohorts: [], tech: { known: {}, prog: {}, lost: {} }, knowledge: knowledge ? { ...knowledge } : { agriculture: 0, seafaring: 0, herding: 0 }, order: null, settlementId: null, cells: null };
  }
  var setDate = (civ6, mi) => {
    civ6.monthIndex = mi;
    civ6.date = fromMonthIndex(mi);
  };
  var sortedGroupIds = (civ6) => Object.keys(civ6.groups).sort();

  // js/core/wcde/config.js
  var WCDE_VERSION = "6.1.0";
  var CONFIG_SCHEMA = 2;
  var DEFAULT_LAWS = Object.freeze({ disasterRate: 1, climateVolatility: 1, fertilityScale: 1, faunaRichness: 1, ecoResilience: 1 });
  var PREHISTORY_YEARS = 5e5;
  var NEOLITHIC_YEARS = 1e4;
  var RESOLUTION = Object.freeze({ standard: 3e3, extra: 6e3, max: 2e4, choices: Object.freeze([3e3, 6e3]) });
  var isObj2 = (v) => v && typeof v === "object" && !Array.isArray(v);
  var num = (errors, name, v, def, lo, hi) => {
    if (v === void 0) return def;
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
      errors.push(`${name} \u306F ${lo}\u301C${hi}\uFF08\u53D7\u3051\u53D6\u3063\u305F\u5024: ${String(v)}\uFF09`);
      return def;
    }
    return v;
  };
  var BIOME_KEYS = Object.freeze(Object.keys(BIOMES2));
  function normalizeWorldConfig(input = {}) {
    const errors = [], i = isObj2(input) ? input : {};
    const name = typeof i.name === "string" && i.name.trim() ? i.name.trim() : "\u540D\u3082\u306A\u304D\u4E16\u754C";
    const given = i.spec?.resolution?.targetCells, cells = given ?? RESOLUTION.standard;
    if (given !== void 0 && !(typeof given === "number" && given <= RESOLUTION.max)) errors.push(`resolution.targetCells \u306F ${RESOLUTION.max} \u4EE5\u4E0B\uFF08\u53D7\u3051\u53D6\u3063\u305F\u5024: ${String(given)}\uFF09`);
    const sp = normalizeWorldSpec({ ...i.spec ?? {}, resolution: { ...i.spec?.resolution ?? {}, targetCells: Math.min(RESOLUTION.max, cells) }, worldSeed: i.worldSeed ?? i.spec?.worldSeed });
    errors.push(...sp.errors);
    const laws = { disasterRate: num(errors, "laws.disasterRate", i.laws?.disasterRate, DEFAULT_LAWS.disasterRate, 0, 3), climateVolatility: num(errors, "laws.climateVolatility", i.laws?.climateVolatility, DEFAULT_LAWS.climateVolatility, 0, 3), fertilityScale: num(errors, "laws.fertilityScale", i.laws?.fertilityScale, DEFAULT_LAWS.fertilityScale, 0.3, 2), faunaRichness: num(errors, "laws.faunaRichness", i.laws?.faunaRichness, DEFAULT_LAWS.faunaRichness, 0.2, 2), ecoResilience: num(errors, "laws.ecoResilience", i.laws?.ecoResilience, DEFAULT_LAWS.ecoResilience, 0.3, 2) };
    const cal = normalizeCalendar(i.calendar);
    errors.push(...cal.errors);
    const prehistoryYears = num(errors, "prehistory.years", i.prehistory?.years, PREHISTORY_YEARS, 2e4, 2e6);
    const neolithicYears = num(errors, "prehistory.neolithicYears", i.prehistory?.neolithicYears, NEOLITHIC_YEARS, 1e3, 6e4);
    const config = { schema: CONFIG_SCHEMA, name, worldSeed: sp.spec.worldSeed, spec: sp.spec, laws, calendar: cal.calendar, prehistory: { years: prehistoryYears, neolithicYears }, detail: i.detail === "light" || i.detail === "fine" ? i.detail : "standard" };
    return { config, errors };
  }
  function derivedSeeds(config) {
    return { geography: config.worldSeed, prehistory: hashSeed(config.worldSeed, "prehistory", config.schema, config.prehistory.years), lineage: hashSeed(config.worldSeed, "lineage"), ecosystem: hashSeed(config.worldSeed, "ecosystem") };
  }

  // js/core/civ/techtree.js
  var LANES = Object.freeze([
    { id: "mat", ja: "\u7D20\u6750\u30FB\u9053\u5177", glyph: "\u25C6" },
    { id: "agr", ja: "\u8FB2\u696D\u30FB\u7267\u755C", glyph: "\u2740" },
    { id: "bld", ja: "\u5EFA\u7BC9", glyph: "\u25A3" },
    { id: "trn", ja: "\u8F38\u9001\u30FB\u822A\u6D77", glyph: "\u27A4" },
    { id: "sci", ja: "\u6570\u5B66\u30FB\u6E2C\u91CF\u30FB\u5929\u6587", glyph: "\u2211" },
    { id: "rec", ja: "\u8A18\u9332\u30FB\u6587\u5B57\u30FB\u901A\u4FE1", glyph: "\u270E" },
    { id: "med", ja: "\u533B\u7642\u30FB\u885B\u751F", glyph: "\u271A" },
    { id: "gov", ja: "\u7D71\u6CBB\u30FB\u884C\u653F\u30FB\u6CD5", glyph: "\u2696" },
    { id: "eco", ja: "\u7D4C\u6E08\u30FB\u91D1\u878D", glyph: "\xA4" },
    { id: "mil", ja: "\u8ECD\u4E8B\u30FB\u5175\u7AD9", glyph: "\u2694" },
    { id: "ind", ja: "\u30A8\u30CD\u30EB\u30AE\u30FC\u30FB\u7523\u696D", glyph: "\u2699" }
  ]);
  var STAGES = Object.freeze(["\u539F\u521D", "\u5F8C\u671F\u65E7\u77F3\u5668", "\u65B0\u77F3\u5668", "\u9752\u9285\u5668", "\u9244\u5668\u30FB\u53E4\u5178", "\u53E4\u5178\u5F8C\u671F", "\u4E2D\u4E16", "\u8FD1\u4E16\u521D\u671F", "\u8FD1\u4E16", "\u7523\u696D\u9769\u547D", "\u8FD1\u4EE3", "\u73FE\u4EE3"]);
  var POOL = 6e3;
  var E_BY_STAGE = [4e5, 12e5, 45e5, ...[110, 150, 190, 230, 250, 260, 220, 200, 170].map((y) => y * POOL)];
  var nodes = [];
  var n = (id, ja, lane, stage, prereq, o = {}) => nodes.push({ id, ja, lane, stage, pre: stage <= 2, prereq, E: o.E ?? E_BY_STAGE[stage], pop: o.pop ?? 0, s: !!o.s, cond: o.cond ?? null, caps: o.caps ?? [], fx: o.fx ?? {}, desc: o.d ?? "", why: o.why ?? "" });
  n("stone_tools", "\u77F3\u5668", "mat", 0, [], { E: 0, d: "\u6253\u3061\u6B20\u3044\u305F\u77F3\u306E\u5203\u3002\u3059\u3079\u3066\u306E\u96C6\u56E3\u304C\u6700\u521D\u304B\u3089\u6301\u3064\u3002" });
  n("fire_control", "\u706B\u306E\u5229\u7528", "mat", 0, ["stone_tools"], { caps: ["pop:cold"], fx: { cap: 0.04 }, d: "\u706B\u3092\u4FDD\u3061\u3001\u8ABF\u7406\u3068\u6696\u3092\u3068\u308B\u3002\u5BD2\u51B7\u306A\u571F\u5730\u3078\u4F4F\u3081\u308B\u3002", why: "\u77F3\u5668\u306E\u4F7F\u7528\u304C\u5E83\u304C\u3063\u305F\u96C6\u56E3\u3067\u3001\u706B\u304C\u65E5\u5E38\u7684\u306B\u4F7F\u308F\u308C\u308B" });
  n("hafted_tools", "\u7D44\u307F\u5408\u308F\u305B\u9053\u5177", "mat", 1, ["stone_tools", "fire_control"], { fx: { cap: 0.04 }, d: "\u67C4\u3092\u3064\u3051\u305F\u65A7\u30FB\u69CD\u3002\u72E9\u731F\u3068\u52A0\u5DE5\u304C\u52B9\u7387\u5316\u3059\u308B\u3002", why: "\u706B\u3067\u6A39\u8102\u3084\u81A0\u3092\u6271\u3048\u308B" });
  n("cordage", "\u7E04\u30FB\u7DB2", "mat", 1, ["stone_tools"], { fx: { cap: 0.03 }, d: "\u690D\u7269\u7E4A\u7DAD\u306E\u7E04\u3068\u7DB2\u3002\u6F01\u6488\u30FB\u7F60\u30FB\u7B4F\u306E\u57FA\u790E\u3002" });
  n("hide_working", "\u76AE\u306A\u3081\u3057\u30FB\u8863\u670D", "mat", 1, ["fire_control"], { caps: ["pop:cold"], fx: { cap: 0.05 }, d: "\u76AE\u3092\u52A0\u5DE5\u3057\u8863\u670D\u306B\u3059\u308B\u3002\u9AD8\u7DEF\u5EA6\u306E\u6C37\u671F\u3092\u8010\u3048\u308B\u3002" });
  n("pottery", "\u571F\u5668", "mat", 2, ["fire_control"], { E: 8e6, cond: "clay", caps: ["storage:pottery"], fx: { cap: 0.04 }, d: "\u7C98\u571F\u3092\u713C\u3044\u305F\u5BB9\u5668\u3002\u716E\u708A\u304D\u3068\u8CAF\u8535\u3002", why: "\u7C98\u571F\u306E\u3042\u308B\u571F\u5730\u3067\u3001\u706B\u3092\u4F7F\u3044\u6163\u308C\u305F\u96C6\u56E3" });
  n("weaving", "\u7E54\u7269", "mat", 2, ["cordage"], { fx: { cap: 0.03 }, d: "\u7CF8\u3092\u649A\u308A\u5E03\u3092\u7E54\u308B\u3002", why: "\u7E04\u30FB\u7DB2\u306E\u6280\u8853\u304C\u7E4A\u7DAD\u306E\u52A0\u5DE5\u3078\u5E83\u304C\u308B" });
  n("copper_working", "\u9285\u52A0\u5DE5", "mat", 3, ["pottery", "fire_control"], { cond: "cu_sn", pop: 300, d: "\u81EA\u7136\u9285\u3084\u9285\u9271\u3092\u71B1\u3057\u3066\u53E9\u304D\u3001\u5668\u5177\u306B\u3059\u308B\u3002", why: "\u9285\u30FB\u932B\u306E\u3042\u308B\u571F\u5730\u3067\u3001\u713C\u6210\u306E\u7D4C\u9A13\u304C\u3042\u308B" });
  n("bronze", "\u9752\u9285", "mat", 3, ["copper_working", "pottery"], { pop: 400, cond: "cu_sn", caps: ["unit:ranged"], fx: { ind: 0.1 }, d: "\u9285\u3068\u932B\u306E\u5408\u91D1\u3002\u9053\u5177\u3068\u6B66\u5177\u304C\u786C\u304F\u306A\u308B\u3002" });
  n("iron", "\u9244", "mat", 4, ["bronze"], { pop: 800, cond: "iron", fx: { ind: 0.15, cap: 0.05 }, d: "\u9244\u9271\u304B\u3089\u9244\u3092\u5F97\u308B\u3002\u8FB2\u5177\u3068\u6B66\u5177\u304C\u5E83\u304F\u666E\u53CA\u3059\u308B\u3002", why: "\u9244\u9271\u304C\u3042\u308A\u3001\u9752\u9285\u306E\u7089\u306E\u6280\u8853\u304C\u3042\u308B" });
  n("bellows", "\u9001\u98A8\u30FB\u9AD8\u7089", "mat", 5, ["iron"], { pop: 1200, fx: { ind: 0.1 }, d: "\u3075\u3044\u3054\u3068\u7089\u306E\u6539\u826F\u3002\u9AD8\u6E29\u3092\u5B89\u5B9A\u3057\u3066\u5F97\u308B\u3002" });
  n("glassmaking", "\u30AC\u30E9\u30B9", "mat", 5, ["pottery", "bellows"], { d: "\u7802\u3092\u9AD8\u6E29\u3067\u6EB6\u304B\u3059\u3002\u5668\u30FB\u7A93\u30FB\u306E\u3061\u306E\u30EC\u30F3\u30BA\u306E\u57FA\u790E\u3002" });
  n("steel", "\u92FC", "mat", 6, ["iron", "bellows"], { pop: 2e3, fx: { ind: 0.15 }, d: "\u70AD\u7D20\u3092\u5236\u5FA1\u3057\u305F\u9244\u3002\u5203\u7269\u3068\u69CB\u9020\u6750\u304C\u98DB\u8E8D\u3059\u308B\u3002" });
  n("precision_tools", "\u7CBE\u5BC6\u5DE5\u4F5C", "mat", 7, ["steel", "mathematics"], { pop: 6e3, fx: { ind: 0.12 }, d: "\u65CB\u76E4\u30FB\u6E2C\u5B9A\u5177\u3002\u90E8\u54C1\u306E\u7CBE\u5EA6\u304C\u4E0A\u304C\u308B\u3002" });
  n("chemistry", "\u5316\u5B66", "mat", 8, ["glassmaking", "natural_philosophy"], { pop: 8e3, fx: { ind: 0.1, health: 0.03 }, d: "\u7269\u8CEA\u306E\u5909\u5316\u3092\u4F53\u7CFB\u7684\u306B\u6271\u3046\u3002" });
  n("foraging_arts", "\u63A1\u96C6\u306E\u77E5\u8B58", "agr", 1, ["stone_tools", "fire_control"], { fx: { cap: 0.04 }, d: "\u98DF\u3079\u3089\u308C\u308B\u690D\u7269\u306E\u898B\u5206\u3051\u3068\u52A0\u5DE5\u3002" });
  n("fishing", "\u6F01\u6488", "agr", 1, ["cordage"], { cond: "water", fx: { cap: 0.05 }, caps: ["subsist:fishing"], d: "\u7DB2\u30FB\u7C17\u30FB\u91E3\u91DD\u3067\u9B5A\u4ECB\u3092\u7372\u308B\u3002" });
  n("agriculture", "\u8FB2\u8015", "agr", 2, ["foraging_arts"], { E: 8e6, cond: "fertile", caps: ["subsist:agriculture", "action:found_city"], fx: { cap: 0.2 }, d: "\u4F5C\u7269\u3092\u690D\u3048\u3066\u80B2\u3066\u308B\u3002\u5B9A\u4F4F\u304C\u53EF\u80FD\u306B\u306A\u308B\u3002", why: "\u80A5\u6C83\u3067\u6C34\u306B\u8FD1\u3044\u571F\u5730\u3067\u3001\u4EBA\u53E3\u5727\u304C\u9AD8\u304F\u3001\u63A1\u96C6\u306E\u77E5\u8B58\u304C\u84C4\u7A4D\u3057\u3066\u3044\u308B" });
  n("pastoralism", "\u7267\u755C", "agr", 2, ["foraging_arts"], { E: 8e6, cond: "grass", caps: ["subsist:pastoral"], fx: { cap: 0.1 }, d: "\u5BB6\u755C\u3092\u98FC\u3044\u3001\u7FA4\u308C\u3068\u3068\u3082\u306B\u79FB\u52D5\u3059\u308B\u3002", why: "\u8349\u539F\u30FB\u30B5\u30D0\u30F3\u30CA\u3067\u3001\u72E9\u731F\u306E\u5BFE\u8C61\u3068\u306A\u308B\u7FA4\u308C\u304C\u3042\u308A\u3001\u4EBA\u53E3\u5727\u304C\u9AD8\u3044" });
  n("food_preservation", "\u4FDD\u5B58\u98DF", "agr", 2, ["fire_control", "foraging_arts"], { fx: { cap: 0.04 }, d: "\u71FB\u88FD\u30FB\u4E7E\u71E5\u30FB\u5869\u6F2C\u3051\u3002\u51AC\u3068\u822A\u6D77\u3092\u8D8A\u3048\u308B\u3002" });
  n("horse_riding", "\u9A0E\u4E57", "agr", 3, ["pastoralism"], { pop: 200, caps: ["unit:cavalry", "pop:steppe"], d: "\u99AC\u3092\u98FC\u3044\u306A\u3089\u3057\u3066\u4E57\u308B\u3002\u79FB\u52D5\u3068\u6226\u3044\u304C\u5909\u308F\u308B\u3002", why: "\u99AC\u306E\u3044\u308B\u8349\u539F\u3067\u7267\u755C\u304C\u55B6\u307E\u308C\u3066\u3044\u308B" });
  n("irrigation", "\u704C\u6F11", "agr", 3, ["agriculture", "construction"], { s: true, fx: { cap: 0.15 }, d: "\u6C34\u8DEF\u3068\u5830\u3067\u7551\u3078\u6C34\u3092\u5F15\u304F\u3002" });
  n("plow", "\u7282", "agr", 4, ["irrigation", "pastoralism"], { s: true, fx: { cap: 0.2 }, d: "\u5BB6\u755C\u306B\u5F15\u304B\u305B\u308B\u7282\u3002\u8015\u4F5C\u306E\u898F\u6A21\u304C\u5E83\u304C\u308B\u3002" });
  n("terracing", "\u6BB5\u3005\u7551", "agr", 5, ["plow", "masonry"], { fx: { cap: 0.08 }, d: "\u659C\u9762\u3092\u8015\u5730\u306B\u3059\u308B\u3002" });
  n("crop_rotation", "\u8F2A\u4F5C", "agr", 6, ["plow", "terracing"], { s: true, fx: { cap: 0.25 }, d: "\u4F11\u9591\u3068\u4F5C\u7269\u306E\u5165\u308C\u66FF\u3048\u3067\u5730\u529B\u3092\u4FDD\u3064\u3002" });
  n("selective_breeding", "\u54C1\u7A2E\u6539\u826F", "agr", 7, ["crop_rotation", "natural_philosophy"], { fx: { cap: 0.1 }, d: "\u9078\u629C\u3067\u4F5C\u7269\u3068\u5BB6\u755C\u3092\u6539\u826F\u3059\u308B\u3002" });
  n("seed_drill", "\u6761\u64AD\u6A5F", "agr", 8, ["crop_rotation", "precision_tools"], { fx: { cap: 0.1 }, d: "\u64AD\u7A2E\u3092\u6A5F\u68B0\u5316\u3059\u308B\u3002" });
  n("fertilizer", "\u5316\u5B66\u80A5\u6599", "agr", 9, ["selective_breeding", "chemistry"], { fx: { cap: 0.3 }, d: "\u7A92\u7D20\u30FB\u30EA\u30F3\u9178\u3092\u5DE5\u696D\u7684\u306B\u4F9B\u7D66\u3059\u308B\u3002" });
  n("agri_mechanization", "\u8FB2\u696D\u6A5F\u68B0\u5316", "agr", 10, ["seed_drill", "internal_combustion"], { fx: { cap: 0.25 }, d: "\u52D5\u529B\u306B\u3088\u308B\u8015\u4F5C\u30FB\u53CE\u7A6B\u3002" });
  n("shelter", "\u4F4F\u5C45", "bld", 1, ["hafted_tools", "hide_working"], { caps: ["pop:cold"], fx: { cap: 0.03 }, d: "\u5C0F\u5C4B\u30FB\u30C6\u30F3\u30C8\u30FB\u7AEA\u7A74\u4F4F\u5C45\u3002" });
  n("construction", "\u5EFA\u7BC9", "bld", 2, ["shelter"], { E: 9e6, pop: 300, caps: ["action:found_city"], d: "\u7D99\u7D9A\u3057\u3066\u4F4F\u3081\u308B\u5BB6\u5C4B\u3068\u516C\u5171\u306E\u5EFA\u7269\u3002", why: "\u5171\u540C\u3067\u8CC7\u6750\u3092\u904B\u3079\u308B\u898F\u6A21\u306E\u96C6\u56E3" });
  n("masonry", "\u77F3\u9020", "bld", 3, ["construction"], { cond: "stone", pop: 600, d: "\u77F3\u6750\u3092\u7A4D\u3080\u3002\u5927\u304D\u304F\u9577\u6301\u3061\u3059\u308B\u5EFA\u9020\u7269\u3002" });
  n("brick", "\u7149\u74E6", "bld", 3, ["pottery", "construction"], { cond: "clay", fx: { cap: 0.03 }, d: "\u713C\u6210\u7149\u74E6\u3002\u77F3\u306E\u4E4F\u3057\u3044\u571F\u5730\u3067\u3082\u5927\u5EFA\u7BC9\u304C\u3067\u304D\u308B\u3002" });
  n("fortification", "\u57CE\u58C1", "bld", 4, ["masonry"], { pop: 500, caps: ["action:build_fortification", "unit:garrison"], fx: { def: 0.1 }, d: "\u90FD\u5E02\u3092\u56F2\u3080\u58C1\u3002" });
  n("roads", "\u9053\u8DEF", "bld", 4, ["construction", "wheel"], { pop: 1e3, caps: ["trade:land_long"], fx: { trade: 0.08 }, d: "\u56FA\u3081\u305F\u9053\u3068\u6A4B\u3002\u9060\u65B9\u3068\u306E\u5F80\u6765\u3068\u88DC\u7D66\u3002" });
  n("aqueduct", "\u6C34\u9053\u6A4B", "bld", 5, ["masonry", "irrigation"], { pop: 4e3, fx: { cap: 0.06, health: 0.04 }, d: "\u6C34\u3092\u9060\u304F\u304B\u3089\u90FD\u5E02\u3078\u904B\u3076\u3002" });
  n("city_planning", "\u90FD\u5E02\u8A08\u753B", "bld", 6, ["roads", "administration"], { pop: 6e3, fx: { cap: 0.05, tax: 0.05 }, d: "\u533A\u753B\u30FB\u8857\u8DEF\u30FB\u5E02\u5834\u306E\u914D\u7F6E\u3092\u7D71\u6CBB\u304C\u6C7A\u3081\u308B\u3002" });
  n("concrete", "\u30B3\u30F3\u30AF\u30EA\u30FC\u30C8", "bld", 7, ["masonry", "chemistry"], { d: "\u6C34\u786C\u6027\u306E\u6750\u6599\u3067\u5927\u69CB\u9020\u7269\u3092\u4F5C\u308B\u3002" });
  n("structural_steel", "\u9244\u9AA8\u69CB\u9020", "bld", 9, ["steel", "concrete", "industry"], { fx: { cap: 0.08 }, d: "\u9AD8\u5C64\u30FB\u9577\u5927\u6A4B\u6881\u3002" });
  n("seafaring", "\u822A\u6D77", "trn", 2, ["cordage"], { E: 5e6, cond: "coast", pop: 300, caps: ["move:sea", "subsist:fishing"], d: "\u7B4F\u30FB\u4E38\u6728\u821F\u3067\u6D77\u30FB\u6E56\u3078\u51FA\u308B\u3002", why: "\u6D77\u5CB8\u306B\u8FD1\u304F\u3001\u7E04\u30FB\u7DB2\u3092\u4F7F\u3044\u3001\u4E00\u5B9A\u306E\u898F\u6A21\u306E\u96C6\u56E3" });
  n("wheel", "\u8ECA\u8F2A", "trn", 3, ["pottery", "construction"], { pop: 600, d: "\u8ECA\u8F2A\u3068\u8F46\u8F64\u3002\u904B\u642C\u304C\u697D\u306B\u306A\u308B\u3002" });
  n("cart", "\u8377\u8ECA", "trn", 4, ["wheel", "pastoralism"], { fx: { trade: 0.05 }, d: "\u5BB6\u755C\u304C\u5F15\u304F\u8377\u8ECA\u3002" });
  n("shipbuilding", "\u9020\u8239", "trn", 4, ["seafaring", "construction"], { cond: "coast", caps: ["unit:navy"], fx: { trade: 0.05 }, d: "\u7ADC\u9AA8\u3068\u677F\u5F35\u308A\u306E\u8239\u3002" });
  n("harbor", "\u6E2F\u6E7E", "trn", 5, ["shipbuilding", "masonry"], { cond: "coast", pop: 3e3, caps: ["trade:sea_long"], fx: { trade: 0.12 }, d: "\u6E2F\u30FB\u685F\u6A4B\u30FB\u5009\u5EAB\u3002\u6D77\u4E0A\u4EA4\u6613\u306E\u62E0\u70B9\u3002" });
  n("navigation", "\u822A\u6CD5", "trn", 6, ["astronomy", "shipbuilding"], { caps: ["move:ocean"], d: "\u661F\u3068\u7F85\u91DD\u3067\u5916\u6D0B\u3092\u6E21\u308B\u3002" });
  n("ocean_sailing", "\u5916\u6D0B\u5E06\u8239", "trn", 7, ["navigation", "harbor"], { fx: { trade: 0.12 }, d: "\u5927\u6D0B\u3092\u6E21\u308B\u5E06\u8239\u3002" });
  n("steamship", "\u84B8\u6C17\u8239", "trn", 9, ["steam_engine", "shipbuilding"], { fx: { trade: 0.15 }, d: "\u98A8\u306B\u4F9D\u3089\u306A\u3044\u5927\u578B\u8239\u3002" });
  n("railway", "\u9244\u9053", "trn", 9, ["steam_engine", "steel"], { caps: ["trade:rail"], fx: { trade: 0.2, cap: 0.05 }, d: "\u9244\u306E\u9053\u3092\u84B8\u6C17\u6A5F\u95A2\u8ECA\u304C\u8D70\u308B\u3002" });
  n("motor_vehicle", "\u81EA\u52D5\u8ECA", "trn", 10, ["internal_combustion", "roads"], { fx: { trade: 0.1 }, d: "\u5185\u71C3\u6A5F\u95A2\u306E\u8ECA\u3002" });
  n("aviation", "\u822A\u7A7A", "trn", 11, ["internal_combustion", "precision_tools", "motor_vehicle"], { caps: ["unit:air"], d: "\u52D5\u529B\u306B\u3088\u308B\u98DB\u884C\u3002" });
  n("counting", "\u8A08\u6570", "sci", 2, ["stone_tools"], { fx: { learn: 0.05 }, d: "\u6570\u3092\u523B\u307F\u3001\u6570\u3048\u308B\u3002" });
  n("calendar", "\u66A6", "sci", 3, ["record_keeping", "counting"], { s: true, d: "\u5B63\u7BC0\u3068\u5929\u4F53\u304B\u3089\u5E74\u3092\u6570\u3048\u308B\u3002", why: "\u8A18\u9332\u306E\u7FD2\u6163\u304C\u3042\u308A\u3001\u5B63\u7BC0\u304C\u8FB2\u8015\u30FB\u796D\u7940\u306B\u7D50\u3073\u3064\u304F" });
  n("mathematics", "\u6570\u5B66", "sci", 4, ["writing", "counting"], { fx: { learn: 0.05 }, d: "\u7B97\u8853\u30FB\u5E7E\u4F55\u3002" });
  n("surveying", "\u6E2C\u91CF", "sci", 4, ["mathematics", "construction"], { d: "\u571F\u5730\u3068\u8DDD\u96E2\u3092\u6E2C\u308B\u3002", caps: ["admin:land_survey"] });
  n("astronomy", "\u5929\u6587", "sci", 5, ["calendar", "mathematics"], { d: "\u5929\u4F53\u306E\u904B\u884C\u3092\u89B3\u6E2C\u3057\u4E88\u6E2C\u3059\u308B\u3002" });
  n("optics", "\u5149\u5B66", "sci", 7, ["glassmaking", "mathematics"], { d: "\u30EC\u30F3\u30BA\u306B\u3088\u308B\u89B3\u6E2C\u3002" });
  n("natural_philosophy", "\u81EA\u7136\u54F2\u5B66", "sci", 7, ["mathematics", "writing", "astronomy"], { pop: 5e3, fx: { learn: 0.05 }, d: "\u81EA\u7136\u3092\u7406\u7531\u3065\u3051\u3066\u7406\u89E3\u3057\u3088\u3046\u3068\u3059\u308B\u4F1D\u7D71\u3002" });
  n("scientific_method", "\u5B9F\u9A13\u79D1\u5B66", "sci", 8, ["natural_philosophy", "printing"], { fx: { learn: 0.15 }, d: "\u89B3\u5BDF\u30FB\u5B9F\u9A13\u30FB\u516C\u8868\u3067\u77E5\u8B58\u3092\u7A4D\u307F\u4E0A\u3052\u308B\u3002" });
  n("calculus", "\u5FAE\u7A4D\u5206", "sci", 8, ["mathematics", "natural_philosophy"], { d: "\u5909\u5316\u3092\u6570\u5F0F\u3067\u6271\u3046\u3002" });
  n("statistics", "\u7D71\u8A08", "sci", 9, ["mathematics", "bureaucracy", "scientific_method"], { fx: { tax: 0.04 }, d: "\u96C6\u8A08\u304B\u3089\u5168\u4F53\u3092\u77E5\u308B\u3002" });
  n("oral_tradition", "\u53E3\u627F", "rec", 1, ["stone_tools"], { fx: { learn: 0.06 }, d: "\u8A00\u8449\u3068\u6B4C\u3067\u77E5\u8B58\u3092\u4E16\u4EE3\u3078\u6E21\u3059\u3002" });
  n("symbol_marks", "\u8A18\u53F7", "rec", 2, ["oral_tradition", "counting"], { d: "\u523B\u307F\u76EE\u30FB\u7D75\u30FB\u5370\u3067\u6570\u3084\u6240\u6709\u3092\u6B8B\u3059\u3002" });
  n("record_keeping", "\u8A18\u9332", "rec", 3, ["pottery", "symbol_marks"], { pop: 800, s: true, caps: ["admin:records"], fx: { learn: 0.05 }, d: "\u7C98\u571F\u677F\u30FB\u7D50\u7E04\u3067\u5728\u5EAB\u3068\u53D6\u5F15\u3092\u6B8B\u3059\u3002", why: "\u8CAF\u8535\u3068\u53D6\u5F15\u304C\u5897\u3048\u3066\u3001\u8A18\u61B6\u3060\u3051\u3067\u306F\u8DB3\u308A\u306A\u304F\u306A\u308B" });
  n("writing", "\u6587\u5B57", "rec", 4, ["record_keeping"], { pop: 1e3, s: true, caps: ["action:covert_op"], fx: { learn: 0.12 }, d: "\u8A00\u8449\u3092\u5199\u3059\u4F53\u7CFB\u3002" });
  n("alphabet", "\u8868\u97F3\u6587\u5B57", "rec", 5, ["writing"], { fx: { learn: 0.1 }, d: "\u97F3\u3092\u5C11\u6570\u306E\u6587\u5B57\u3067\u8868\u3059\u3002\u8AAD\u307F\u66F8\u304D\u304C\u5E83\u304C\u308B\u3002" });
  n("papermaking", "\u7D19", "rec", 6, ["writing"], { pop: 3e3, fx: { learn: 0.1 }, d: "\u8EFD\u304F\u5B89\u3044\u8A18\u9332\u5A92\u4F53\u3002" });
  n("postal_system", "\u99C5\u4F1D\u30FB\u90F5\u4FBF", "rec", 6, ["roads", "writing", "administration"], { caps: ["admin:courier"], d: "\u516C\u306E\u901A\u4FE1\u7DB2\u3002" });
  n("printing", "\u5370\u5237", "rec", 7, ["papermaking"], { pop: 5e3, fx: { learn: 0.2 }, d: "\u8907\u88FD\u304C\u5B89\u304F\u306A\u308A\u3001\u77E5\u8B58\u304C\u901F\u304F\u5E83\u304C\u308B\u3002" });
  n("newspapers", "\u65B0\u805E", "rec", 8, ["printing", "alphabet"], { fx: { learn: 0.06 }, d: "\u5B9A\u671F\u520A\u884C\u306E\u60C5\u5831\u3002" });
  n("telegraph", "\u96FB\u4FE1", "rec", 9, ["electricity"], { d: "\u96FB\u6C17\u4FE1\u53F7\u3067\u5373\u6642\u306B\u901A\u4FE1\u3059\u308B\u3002" });
  n("radio", "\u7121\u7DDA\u901A\u4FE1", "rec", 10, ["telegraph", "electric_grid"], { fx: { learn: 0.1, trade: 0.04 }, d: "\u96FB\u6CE2\u3067\u901A\u4FE1\u30FB\u653E\u9001\u3059\u308B\u3002" });
  n("computing", "\u8A08\u7B97\u6A5F", "rec", 11, ["electricity", "calculus", "precision_tools"], { fx: { learn: 0.15, ind: 0.1 }, d: "\u96FB\u5B50\u8A08\u7B97\u3002" });
  n("herbalism", "\u85AC\u8349", "med", 1, ["foraging_arts"], { fx: { health: 0.03 }, d: "\u85AC\u306B\u306A\u308B\u690D\u7269\u306E\u7D4C\u9A13\u77E5\u3002" });
  n("bone_setting", "\u5916\u50B7\u306E\u624B\u5F53", "med", 2, ["herbalism", "hafted_tools"], { fx: { health: 0.03 }, d: "\u9AA8\u6298\u30FB\u5916\u50B7\u306E\u51E6\u7F6E\u3002" });
  n("medicine", "\u533B\u5B66", "med", 4, ["herbalism", "writing"], { fx: { health: 0.05 }, d: "\u75C7\u72B6\u3068\u6CBB\u7642\u3092\u8A18\u9332\u3057\u4F53\u7CFB\u5316\u3059\u308B\u3002" });
  n("hygiene_practice", "\u516C\u8846\u885B\u751F\u306E\u7FD2\u6163", "med", 5, ["medicine", "aqueduct"], { pop: 4e3, fx: { health: 0.06, cap: 0.03 }, d: "\u6C34\u30FB\u6392\u6CC4\u30FB\u57CB\u846C\u306E\u7BA1\u7406\u3002" });
  n("sanitation", "\u885B\u751F", "med", 6, ["medicine", "hygiene_practice"], { pop: 5e3, fx: { cap: 0.1, health: 0.08 }, d: "\u4E0A\u4E0B\u6C34\u9053\u30FB\u3054\u307F\u306E\u7BA1\u7406\u3002\u90FD\u5E02\u304C\u5927\u304D\u304F\u306A\u308C\u308B\u3002" });
  n("quarantine", "\u691C\u75AB", "med", 6, ["medicine", "harbor"], { d: "\u75AB\u75C5\u306E\u6D41\u5165\u3092\u9694\u96E2\u3067\u9632\u3050\u3002", fx: { health: 0.04 } });
  n("anatomy", "\u89E3\u5256\u5B66", "med", 7, ["medicine", "natural_philosophy"], { d: "\u8EAB\u4F53\u306E\u69CB\u9020\u3092\u89B3\u5BDF\u3059\u308B\u3002" });
  n("germ_theory", "\u75C5\u539F\u4F53\u8AAC", "med", 9, ["optics", "chemistry", "anatomy"], { fx: { health: 0.12 }, d: "\u5FAE\u751F\u7269\u304C\u75C5\u6C17\u3092\u8D77\u3053\u3059\u3068\u3044\u3046\u7406\u89E3\u3002" });
  n("vaccination", "\u4E88\u9632\u63A5\u7A2E", "med", 9, ["germ_theory"], { fx: { health: 0.1, cap: 0.05 }, d: "\u611F\u67D3\u75C7\u3092\u4E88\u9632\u3059\u308B\u3002" });
  n("antibiotics", "\u6297\u751F\u7269\u8CEA", "med", 10, ["germ_theory", "chemistry", "industry"], { fx: { health: 0.12, cap: 0.05 }, d: "\u7D30\u83CC\u611F\u67D3\u306E\u6CBB\u7642\u3002" });
  n("kin_council", "\u9577\u8001\u4F1A\u8B70", "gov", 1, ["oral_tradition"], { caps: ["polity:chiefdom"], d: "\u5E74\u9577\u8005\u30FB\u6709\u529B\u8005\u304C\u96C6\u307E\u308A\u6C7A\u3081\u308B\u3002" });
  n("administration", "\u884C\u653F", "gov", 4, ["writing", "kin_council"], { pop: 1500, caps: ["polity:kingdom", "admin:officials"], fx: { tax: 0.25 }, d: "\u5B98\u8077\u3068\u8A18\u9332\u306B\u3088\u308B\u7D71\u6CBB\u3002", why: "\u6587\u5B57\u304C\u3042\u308A\u3001\u6570\u5343\u4EBA\u898F\u6A21\u306E\u96C6\u4F4F" });
  n("law", "\u6CD5", "gov", 5, ["administration"], { caps: ["polity:republic"], fx: { tax: 0.05 }, d: "\u6210\u6587\u306E\u898F\u5247\u3068\u88C1\u304D\u3002" });
  n("census", "\u6238\u7C4D\u30FB\u4EBA\u53E3\u8ABF\u67FB", "gov", 5, ["administration", "counting"], { fx: { tax: 0.06 }, d: "\u4EBA\u3068\u571F\u5730\u3092\u6570\u3048\u308B\u3002" });
  n("diplomacy", "\u5916\u4EA4\u6163\u884C", "gov", 5, ["writing", "kin_council"], { caps: ["treaty:alliance"], d: "\u4F7F\u7BC0\u30FB\u8A93\u7D04\u30FB\u6761\u7D04\u306E\u66F8\u5F0F\u3002" });
  n("tax_system", "\u79DF\u7A0E\u5236\u5EA6", "gov", 5, ["administration", "record_keeping"], { caps: ["policy:tax_high"], fx: { tax: 0.1 }, d: "\u5B9A\u307E\u3063\u305F\u7A0E\u76EE\u3068\u5FB4\u53CE\u3002" });
  n("bureaucracy", "\u5B98\u50DA\u5236", "gov", 6, ["law", "census", "tax_system"], { pop: 8e3, caps: ["polity:empire"], fx: { tax: 0.3 }, d: "\u968E\u5C64\u5316\u3055\u308C\u305F\u5B98\u540F\u7D44\u7E54\u3002" });
  n("civil_service", "\u5B98\u540F\u767B\u7528", "gov", 7, ["bureaucracy", "papermaking"], { fx: { tax: 0.08, learn: 0.05 }, d: "\u8A66\u9A13\u30FB\u8CC7\u683C\u306B\u3088\u308B\u767B\u7528\u3002" });
  n("constitutionalism", "\u7ACB\u61B2\u4E3B\u7FA9", "gov", 8, ["law", "printing"], { d: "\u6A29\u529B\u3092\u6CD5\u3067\u7E1B\u308B\u3002" });
  n("parliament", "\u8B70\u4F1A\u5236", "gov", 9, ["constitutionalism"], { caps: ["policy:parliament"], fx: { tax: 0.04 }, d: "\u4EE3\u8868\u304C\u96C6\u307E\u308A\u6C7A\u3081\u308B\u3002" });
  n("public_education", "\u516C\u6559\u80B2", "gov", 9, ["printing", "bureaucracy"], { fx: { learn: 0.15 }, d: "\u5E83\u304F\u8AAD\u307F\u66F8\u304D\u3092\u6559\u3048\u308B\u3002" });
  n("barter_networks", "\u4EA4\u63DB\u7DB2", "eco", 2, ["cordage", "oral_tradition"], { caps: ["treaty:nonaggression"], d: "\u96C6\u56E3\u3069\u3046\u3057\u304C\u7523\u7269\u3092\u4EA4\u63DB\u3059\u308B\u3002" });
  n("trade_routes", "\u9577\u8DDD\u96E2\u4EA4\u6613", "eco", 3, ["barter_networks"], { caps: ["treaty:trade", "action:impose_sanctions"], fx: { trade: 0.1 }, d: "\u9060\u65B9\u3068\u306E\u5B9A\u671F\u7684\u306A\u4EA4\u6613\u8DEF\u3002" });
  n("markets", "\u5E02\u5834", "eco", 4, ["trade_routes", "record_keeping"], { pop: 1500, s: true, fx: { trade: 0.08, tax: 0.05 }, d: "\u5B9A\u671F\u30FB\u5E38\u8A2D\u306E\u5E02\u3002" });
  n("weights_measures", "\u5EA6\u91CF\u8861", "eco", 4, ["counting", "administration"], { fx: { trade: 0.04 }, d: "\u8A08\u91CF\u306E\u7D71\u4E00\u3002" });
  n("coinage", "\u8CA8\u5E63", "eco", 5, ["bronze", "weights_measures"], { pop: 2e3, caps: ["econ:coinage"], fx: { tax: 0.2, trade: 0.1 }, d: "\u4FA1\u5024\u3092\u4FDD\u8A3C\u3057\u305F\u91D1\u5C5E\u8CA8\u5E63\u3002" });
  n("banking", "\u91D1\u878D", "eco", 7, ["coinage", "mathematics"], { pop: 8e3, caps: ["econ:credit"], fx: { tax: 0.25, ind: 0.05 }, d: "\u9810\u304B\u308A\u30FB\u8CB8\u4ED8\u30FB\u70BA\u66FF\u3002" });
  n("credit_notes", "\u624B\u5F62\u30FB\u4FE1\u7528", "eco", 7, ["banking", "writing"], { fx: { trade: 0.08 }, d: "\u9060\u9694\u306E\u6C7A\u6E08\u3002" });
  n("joint_stock", "\u682A\u5F0F\u4F1A\u793E", "eco", 8, ["banking", "law"], { fx: { ind: 0.1 }, d: "\u51FA\u8CC7\u8005\u304C\u6709\u9650\u306E\u8CAC\u4EFB\u3067\u4E8B\u696D\u3092\u5171\u6709\u3059\u308B\u3002" });
  n("insurance", "\u4FDD\u967A", "eco", 9, ["banking", "statistics"], { fx: { trade: 0.05 }, d: "\u5371\u967A\u3092\u5E83\u304F\u5206\u6563\u3059\u308B\u3002" });
  n("central_bank", "\u4E2D\u592E\u9280\u884C", "eco", 10, ["banking", "bureaucracy", "statistics"], { fx: { tax: 0.05 }, d: "\u901A\u8CA8\u3068\u4FE1\u7528\u306E\u7BA1\u7406\u3002" });
  n("hunting_weapons", "\u72E9\u731F\u5177", "mil", 1, ["hafted_tools"], { fx: { off: 0.02 }, d: "\u6295\u69CD\u30FB\u7F60\u3002" });
  n("bow", "\u5F13", "mil", 2, ["hafted_tools", "cordage"], { caps: ["unit:ranged"], fx: { off: 0.03 }, d: "\u5F13\u77E2\u3002" });
  n("bronze_weapons", "\u9752\u9285\u6B66\u5668", "mil", 3, ["bronze"], { caps: ["unit:ranged"], fx: { off: 0.2 }, d: "\u9752\u9285\u306E\u5263\u30FB\u69CD\u30FB\u93C3\u3002" });
  n("chariot", "\u6226\u8ECA", "mil", 4, ["wheel", "horse_riding", "bronze_weapons"], { fx: { off: 0.1 }, d: "\u99AC\u306B\u5F15\u304B\u305B\u308B\u6226\u95D8\u7528\u306E\u8ECA\u3002" });
  n("cavalry", "\u9A0E\u5175", "mil", 4, ["horse_riding", "bronze_weapons"], { caps: ["unit:cavalry"], fx: { off: 0.3 }, d: "\u9A0E\u4E57\u6226\u95D8\u90E8\u968A\u3002" });
  n("iron_weapons", "\u9244\u6B66\u5668", "mil", 5, ["iron", "bronze_weapons"], { fx: { off: 0.35 }, d: "\u9244\u306E\u5263\u30FB\u69CD\u30FB\u93A7\u3002" });
  n("siege_engines", "\u653B\u57CE\u5175\u5668", "mil", 5, ["iron_weapons", "construction"], { fx: { off: 0.05 }, d: "\u7834\u57CE\u69CC\u30FB\u6295\u77F3\u6A5F\u3002" });
  n("standing_army", "\u5E38\u5099\u8ECD", "mil", 6, ["administration", "iron_weapons", "tax_system"], { fx: { off: 0.08, def: 0.04 }, d: "\u5E73\u6642\u306B\u3082\u7DAD\u6301\u3055\u308C\u308B\u8077\u696D\u8ECD\u3002" });
  n("military_logistics", "\u5175\u7AD9", "mil", 6, ["roads", "administration"], { d: "\u88DC\u7D66\u306E\u7D44\u7E54\u5316\u3002\u9060\u3044\u6226\u5834\u3078\u8ECD\u3092\u9001\u308C\u308B\u3002", caps: ["war:far"] });
  n("naval_warfare", "\u6D77\u6226\u8853", "mil", 6, ["shipbuilding", "iron_weapons"], { caps: ["war:naval"], fx: { off: 0.05 }, d: "\u8266\u968A\u306E\u7DE8\u6210\u3068\u885D\u89D2\u30FB\u63A5\u8237\u6226\u3002" });
  n("gunpowder", "\u706B\u85AC", "mil", 7, ["steel", "mathematics", "chemistry"], { pop: 8e3, caps: ["unit:firearms"], fx: { off: 0.8 }, d: "\u9ED2\u8272\u706B\u85AC\u3002" });
  n("firearms", "\u9283", "mil", 8, ["gunpowder", "precision_tools"], { fx: { off: 0.1 }, d: "\u706B\u7E04\u9283\u304B\u3089\u71E7\u767A\u9283\u3078\u3002" });
  n("artillery", "\u706B\u7832", "mil", 8, ["gunpowder", "bellows"], { fx: { off: 0.1, def: 0.03 }, d: "\u5927\u7832\u306B\u3088\u308B\u57CE\u653B\u3081\u3068\u91CE\u6226\u3002" });
  n("rifled_arms", "\u65BD\u6761\u9283", "mil", 9, ["firearms", "precision_tools"], { fx: { off: 0.1 }, d: "\u547D\u4E2D\u7CBE\u5EA6\u306E\u9AD8\u3044\u5C0F\u9283\u3002" });
  n("mechanized_warfare", "\u6A5F\u68B0\u5316\u6226", "mil", 11, ["motor_vehicle", "steel", "standing_army"], { caps: ["unit:armor"], fx: { off: 0.2 }, d: "\u8ECA\u4E21\u30FB\u7121\u7DDA\u3092\u7528\u3044\u308B\u8ECD\u3002" });
  n("mining", "\u63A1\u9271", "ind", 3, ["bronze", "construction"], { pop: 500, d: "\u5751\u9053\u3092\u6398\u308A\u9271\u77F3\u3092\u5F97\u308B\u3002", fx: { ind: 0.05 } });
  n("waterwheel", "\u6C34\u8ECA", "ind", 4, ["construction", "wheel"], { cond: "water", fx: { ind: 0.1 }, d: "\u6C34\u306E\u529B\u3067\u633D\u304F\u30FB\u53E9\u304F\u3002" });
  n("windmill", "\u98A8\u8ECA", "ind", 6, ["waterwheel"], { fx: { ind: 0.06 }, d: "\u98A8\u306E\u529B\u3002" });
  n("coal_mining", "\u77F3\u70AD\u63A1\u6398", "ind", 7, ["mining", "bellows"], { cond: "coal", pop: 6e3, fx: { ind: 0.1 }, d: "\u77F3\u70AD\u3092\u71C3\u6599\u3068\u3059\u308B\u3002" });
  n("steam_engine", "\u84B8\u6C17\u6A5F\u95A2", "ind", 8, ["coal_mining", "precision_tools"], { pop: 15e3, fx: { ind: 0.25 }, d: "\u71B1\u3092\u52D5\u529B\u306B\u5909\u3048\u308B\u3002" });
  n("industry", "\u6A5F\u68B0\u5DE5\u696D", "ind", 9, ["steel", "steam_engine", "banking"], { pop: 2e4, fx: { ind: 0.5 }, d: "\u5DE5\u5834\u3068\u6A5F\u68B0\u306B\u3088\u308B\u5927\u91CF\u751F\u7523\u3002" });
  n("electricity", "\u96FB\u6C17", "ind", 10, ["industry"], { pop: 4e4, fx: { ind: 0.3 }, d: "\u767A\u96FB\u3068\u96FB\u52D5\u6A5F\u3002" });
  n("internal_combustion", "\u5185\u71C3\u6A5F\u95A2", "ind", 10, ["industry", "chemistry"], { fx: { ind: 0.15 }, d: "\u77F3\u6CB9\u3092\u71C3\u6599\u3068\u3059\u308B\u5C0F\u578B\u306E\u52D5\u529B\u3002" });
  n("petroleum", "\u77F3\u6CB9", "ind", 10, ["chemistry", "mining"], { cond: "coal", d: "\u77F3\u6CB9\u306E\u63A1\u6398\u3068\u7CBE\u88FD\u3002", fx: { ind: 0.1 } });
  n("electric_grid", "\u9001\u96FB\u7DB2", "ind", 11, ["electricity", "industry"], { fx: { ind: 0.2 }, d: "\u96FB\u529B\u3092\u5E83\u57DF\u306B\u914D\u308B\u3002" });
  n("nuclear", "\u6838", "ind", 11, ["electricity", "calculus"], { pop: 1e5, caps: ["action:nuclear_program"], fx: { ind: 0.1 }, d: "\u539F\u5B50\u6838\u306E\u30A8\u30CD\u30EB\u30AE\u30FC\u3002" });
  {
    const by = new Map(nodes.map((x) => [x.id, x])), memo2 = /* @__PURE__ */ new Map(), colOf = (id, seen = /* @__PURE__ */ new Set()) => {
      if (memo2.has(id)) return memo2.get(id);
      if (seen.has(id)) throw new Error("\u6280\u8853\u30C4\u30EA\u30FC\u306B\u5FAA\u74B0\u304C\u3042\u308B: " + id);
      seen.add(id);
      const t = by.get(id);
      let c = t.stage;
      for (const p of t.prereq) c = Math.max(c, colOf(p, seen) + 1);
      memo2.set(id, c);
      return c;
    };
    for (const t of nodes) t.col = colOf(t.id);
  }
  var TREE = Object.freeze(nodes.map((x) => Object.freeze(x)));
  var COLS = Math.max(...nodes.map((x) => x.col)) + 1;
  var NODE = Object.freeze(Object.fromEntries(TREE.map((x) => [x.id, x])));
  var LANE = Object.freeze(Object.fromEntries(LANES.map((l) => [l.id, l])));
  function layoutGrid() {
    const slot = /* @__PURE__ */ new Map(), lanes = LANES.map((l) => l.id), count = /* @__PURE__ */ new Map(), pos = {};
    for (const t of TREE) {
      const k = t.lane + "|" + t.col, i = count.get(k) ?? 0;
      count.set(k, i + 1);
      slot.set(t.id, i);
    }
    const rows = {};
    for (const l of lanes) rows[l] = 1;
    for (const [k, c] of count) {
      const l = k.split("|")[0];
      rows[l] = Math.max(rows[l], c);
    }
    const y0 = {};
    let acc = 0;
    for (const l of lanes) {
      y0[l] = acc;
      acc += rows[l];
    }
    for (const t of TREE) pos[t.id] = { col: t.col, row: y0[t.lane] + slot.get(t.id), lane: t.lane };
    return { pos, rows, y0, totalRows: acc, cols: COLS };
  }

  // js/core/civ/tech.js
  var nearWater = (w, g) => w.cell.coastDist[g.cell] <= 2 || w.cell.river[g.cell];
  var maskCache = /* @__PURE__ */ new WeakMap();
  function resMaskOf(w, g) {
    const cells = g.cells ?? [g.cell], c = maskCache.get(g);
    if (c && c.n === cells.length && c.c0 === cells[0]) return c.m;
    let m = 0;
    for (const x of cells) m |= w.cell.resource[x];
    maskCache.set(g, { n: cells.length, c0: cells[0], m });
    return m;
  }
  var COND = Object.freeze({
    water: { ja: "\u6C34\u8FBA\uFF08\u6D77\u30FB\u5DDD\u30FB\u6E56\uFF09", f: (w, g) => nearWater(w, g) },
    coast: { ja: "\u6D77\u5CB8", f: (w, g) => w.cell.coastDist[g.cell] <= 1 },
    fertile: { ja: "\u80A5\u6C83\u3067\u6C34\u306B\u8FD1\u304F\u3001\u4EBA\u53E3\u5727\u304C\u9AD8\u3044\u571F\u5730", f: (w, g) => w.cell.fertility[g.cell] > 0.45 && nearWater(w, g) && g.pressure > 0.6 },
    grass: { ja: "\u8349\u539F\u30FB\u30B5\u30D0\u30F3\u30CA\u3067\u4EBA\u53E3\u5727\u304C\u9AD8\u3044\u571F\u5730", f: (w, g) => (w.cell.biome[g.cell] === BIOMES2.GRASSLAND || w.cell.biome[g.cell] === BIOMES2.SAVANNA) && g.pressure > 0.7 },
    clay: { ja: "\u7C98\u571F\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & RES2.CLAY) !== 0 },
    cu_sn: { ja: "\u9285\u307E\u305F\u306F\u932B\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & (RES2.COPPER | RES2.TIN)) !== 0 },
    iron: { ja: "\u9244\u9271\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & RES2.IRON) !== 0 },
    coal: { ja: "\u77F3\u70AD\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & RES2.COAL) !== 0 },
    stone: { ja: "\u77F3\u6750\u306E\u3042\u308B\u571F\u5730", f: (w, g) => (resMaskOf(w, g) & RES2.STONE) !== 0 }
  });
  var tierOf = (col) => 1 + Math.floor(col / 3);
  var TECHS = Object.freeze([...TREE].sort((a, b) => a.col - b.col).map((t) => Object.freeze({ key: t.id, name: t.ja, field: LANE[t.lane].ja, lane: t.lane, pre: t.pre, tier: tierOf(t.col), cost: t.id === "stone_tools" ? 0 : 1, prereq: t.prereq, minPop: t.pop, settled: t.s, condKey: t.cond, cond: t.cond ? COND[t.cond].f : null, E: t.E, caps: t.caps, fx: t.fx, col: t.col, desc: t.desc, why: t.why })));
  var TECH = Object.freeze(Object.fromEntries(TECHS.map((t) => [t.key, t])));
  var BASE_KNOWLEDGE = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" };
  var REDISCOVER = 3.3;
  var POP_REF = 6e5;
  var REF_GROUPS = 1300;
  var PERIOD = 3;
  var ovr = (civ6, key) => civ6?.techOverrides?.[key] ?? null;
  var prereqOf = (civ6, t) => ovr(civ6, t.key)?.prereq ?? t.prereq;
  var fxOf = (civ6, t) => ovr(civ6, t.key)?.fx ?? t.fx;
  var capsOfTech = (civ6, t) => ovr(civ6, t.key)?.caps ?? t.caps;
  var refreshCand = (g, civ6 = null) => g.tech.cand = TECHS.filter((t) => g.tech.known[t.key] == null && prereqOf(civ6, t).every((p) => g.tech.known[p] != null)).map((t) => t.key);
  var learn = (g, key, mi, civ6) => {
    g.tech.known[key] = mi;
    refreshCand(g, civ6);
    delete g.tech.prog[key];
    if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 1;
  };
  var forget = (g, key, civ6) => {
    delete g.tech.known[key];
    refreshCand(g, civ6);
    g.tech.lost[key] = true;
    if (BASE_KNOWLEDGE[key]) g.knowledge[BASE_KNOWLEDGE[key]] = 0;
  };
  var conditionsMet = (w, g, t) => g.pop >= t.minPop && (!t.settled || !!g.settlementId) && (!t.cond || t.cond(w, g));
  var worldDepth = (civ6) => Math.min(1, Object.keys(civ6.techWorld).length / 45);
  var accel = (civ6, worldPop) => Math.min(1.5, Math.max(0.2, worldPop / POP_REF)) * (0.35 + 1.65 * worldDepth(civ6));
  var memo = /* @__PURE__ */ new WeakMap();
  function knownStats(g, civ6 = null) {
    if (!g.tech.cand) refreshCand(g, civ6);
    const c = g.tech.cand;
    let m = memo.get(c);
    if (!m) {
      let n2 = 0, l = 0;
      for (const k in g.tech.known) {
        n2++;
        const t = TECH[k];
        if (t) l += fxOf(civ6, t).learn ?? 0;
      }
      m = { n: n2, l };
      memo.set(c, m);
    }
    return m;
  }
  var lbCache = /* @__PURE__ */ new WeakMap();
  var stateLearn = (civ6, st2) => {
    const c = lbCache.get(st2);
    if (c && civ6.monthIndex - c.mi < 6) return c.v;
    const v = learnBonus(civ6, st2);
    lbCache.set(st2, { mi: civ6.monthIndex, v });
    return v;
  };
  var learnFx = (g, civ6, st2) => knownStats(g, civ6).l + (st2 ? stateLearn(civ6, st2) * 0.5 : 0);
  var stageMult = { village: 1, town: 1.3, city: 1.8 };
  function emergenceRate(world, civ6, g, t, env) {
    if (!conditionsMet(world, g, t)) return 0;
    const st2 = g.stateId ? civ6.states[g.stateId] : null, base = 1 / (t.E * (g.tech.lost[t.key] ? 1 / REDISCOVER : 1));
    const popF = Math.min(2.5, Math.sqrt(g.pop / Math.max(60, t.minPop || 60))), known = knownStats(g, civ6).n;
    const knowF = 0.7 + 0.5 * Math.min(1, known / 30), contactF = 1 + 0.2 * Math.min(4, env.contact ?? 0);
    const urbanF = g.settlementId ? stageMult[civ6.settlements[g.settlementId]?.stage] ?? 1 : 0.85, econF = (st2 ? 1.2 : 1) * (1 + (st2?.econ?.techBoost ?? 0)), learnF = 1 + learnFx(g, civ6, st2);
    const compF = 1 + (st2?.warIds?.length ? 0.12 : 0) + 0.06 * Math.min(3, env.rivals ?? 0);
    return base * popF * knowF * contactF * urbanF * econF * learnF * compF * env.accel * (env.norm ?? 1);
  }
  var pEmerge = (rate, years) => 1 - Math.exp(-rate * years);
  var u01 = (civ6, ...parts) => hashSeed(civ6.historySeed, ...parts) / 4294967296;
  var resolve = (civ6, g, key, mi, how) => {
    var _a;
    const prior = civ6.techWorld[key], wasLost = !!g.tech.lost[key];
    learn(g, key, mi, civ6);
    delete g.tech.lost[key];
    const rec = (_a = civ6.techWorld)[key] ?? (_a[key] = { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {} });
    if (!prior || !prior.discoveries) {
      rec.discoveries = rec.discoveries ?? [];
      rec.first = rec.first ?? mi;
      rec.independent = rec.independent ?? 0;
      rec.spread = rec.spread ?? 0;
      rec.byChannel = rec.byChannel ?? {};
    }
    if (how === "independent") rec.independent++;
    else {
      rec.spread++;
      rec.byChannel[how] = (rec.byChannel[how] ?? 0) + 1;
    }
    return { first: !prior, wasLost };
  };
  function stepTech(ctx) {
    const { world, civ: civ6, ids } = ctx, mi = civ6.monthIndex, period = Math.floor(mi / PERIOD), yrs = PERIOD / 12;
    let worldPop = 0, nG = 0;
    for (const id in civ6.groups) {
      worldPop += civ6.groups[id].pop;
      nG++;
    }
    const A2 = accel(civ6, worldPop), norm2 = Math.min(6, REF_GROUPS / Math.max(150, nG));
    for (const id in civ6.groups) {
      const g = civ6.groups[id];
      if ((hashSeed(id) + mi) % PERIOD !== 0) continue;
      const k = g.tech.known, d = dominant(g), st2 = g.stateId ? civ6.states[g.stateId] : null;
      if (!g.tech.cand) refreshCand(g, civ6);
      const ns = [...neighborGroups(ctx, g)], env = { accel: A2, norm: norm2, contact: (() => {
        const mine = knownStats(g, civ6).n;
        let c = 0;
        for (const o of ns) {
          const og = civ6.groups[o];
          if (og?.tech.known && knownStats(og, civ6).n >= mine) c++;
        }
        return c;
      })(), rivals: st2 ? new Set(ns.map((o) => civ6.groups[o]?.stateId).filter((s) => s && s !== st2.id)).size : 0 };
      for (const key of [...g.tech.cand]) {
        const t = TECH[key], rate = emergenceRate(world, civ6, g, t, env);
        if (rate <= 0 || u01(civ6, "tech", period, id, key) >= pEmerge(rate, yrs)) continue;
        const r = resolve(civ6, g, key, mi, "independent");
        if (r.first || r.wasLost) makeEvent(civ6, ids, { kind: r.wasLost ? "tech_rediscovered" : "tech_discovered", title: `${t.name}\u3092${r.wasLost ? "\u518D\u767A\u898B" : "\u521D\u3081\u3066\u767A\u898B"}`, participants: [{ entityId: g.id, role: "discoverer" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: null, after: mi }] });
      }
      if (ns.length && u01(civ6, "contact", period, id) < 0.09) {
        const o = civ6.groups[ns[Math.floor(u01(civ6, "contactpick", period, id) * ns.length)]];
        if (o) {
          const cand3 = TECHS.filter((t) => o.tech.known[t.key] != null && k[t.key] == null && prereqOf(civ6, t).every((p) => k[p] != null) && conditionsMet(world, g, t));
          if (cand3.length) {
            const t = cand3[Math.floor(u01(civ6, "contacttech", period, id) * cand3.length)], same = (dominant(o).cultureId === d.cultureId ? 0.15 : 0) + (o.stateId && o.stateId === g.stateId ? 0.2 : 0);
            if (u01(civ6, "contactacc", period, id) < 0.25 + same) resolve(civ6, g, t.key, mi, "contact");
          }
        }
      }
      if (st2 && mi % 12 === hashSeed(id) % 12 && st2.capitalGroupId !== id) {
        const cap = civ6.groups[st2.capitalGroupId], boost = learnBonus(civ6, st2);
        if (cap && boost > 0) {
          const cand3 = TECHS.filter((t) => cap.tech.known[t.key] != null && k[t.key] == null && prereqOf(civ6, t).every((p) => k[p] != null) && conditionsMet(world, g, t));
          if (cand3.length && u01(civ6, "teach", mi, id) < Math.min(0.6, boost * 2)) resolve(civ6, g, cand3[Math.floor(u01(civ6, "teachpick", mi, id) * cand3.length)].key, mi, "teaching");
        }
      }
      if (u01(civ6, "loss", period, id) < 3e-3) {
        for (const t of TECHS) if (k[t.key] != null && t.minPop > 0 && g.pop < t.minPop * 0.5) {
          if (TECHS.some((u) => k[u.key] != null && prereqOf(civ6, u).includes(t.key) && u.col >= t.col)) continue;
          forget(g, t.key, civ6);
          if (g.id === st2?.capitalGroupId) makeEvent(civ6, ids, { kind: "tech_lost", title: `${t.name}\u306E\u77E5\u8B58\u304C\u5931\u308F\u308C\u305F`, participants: [{ entityId: g.id, role: "holder" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: `tech.${t.key}`, before: mi, after: null }] });
          break;
        }
      }
    }
    if (mi % 12 === 6) tradeTransfer(ctx);
  }
  var learnBonus = (civ6, st2) => {
    let s = 0;
    for (const k in st2.techAdopted) s += fxOf(civ6, TECH[k] ?? { key: k, fx: {} }).learn ?? 0;
    return s;
  };
  function tradeTransfer(ctx) {
    const { world, civ: civ6 } = ctx, mi = civ6.monthIndex;
    for (const tid of civ6.activeTreatyIds) {
      const tr = civ6.treaties[tid];
      if (!tr || tr.type !== "trade") continue;
      const a = civ6.states[tr.a], b = civ6.states[tr.b];
      if (!a?.alive || !b?.alive) continue;
      for (const [from, to, tag] of [[a, b, "ab"], [b, a, "ba"]]) {
        const gf = civ6.groups[from.capitalGroupId], gt = civ6.groups[to.capitalGroupId];
        if (!gf || !gt) continue;
        const cand3 = TECHS.filter((t) => gf.tech.known[t.key] != null && gt.tech.known[t.key] == null && prereqOf(civ6, t).every((p) => gt.tech.known[p] != null) && conditionsMet(world, gt, t));
        if (cand3.length && u01(civ6, "trade", mi, tid, tag) < 0.25) resolve(civ6, gt, cand3[Math.floor(u01(civ6, "tradepick", mi, tid, tag) * cand3.length)].key, mi, "trade");
      }
    }
  }
  function learnByAnnexation(ctx, state, group) {
    const { world, civ: civ6 } = ctx, cap = civ6.groups[state.capitalGroupId];
    if (!cap) return 0;
    let n2 = 0, mi = civ6.monthIndex;
    for (const t of TECHS) if (cap.tech.known[t.key] != null && group.tech.known[t.key] == null && prereqOf(civ6, t).every((p) => group.tech.known[p] != null) && conditionsMet(world, group, t) && u01(civ6, "annex", mi, group.id, t.key) < 0.35) {
      resolve(civ6, group, t.key, mi, "conquest");
      n2++;
    }
    return n2;
  }
  function techCoverage(groups, key) {
    let tot = 0, have = 0;
    for (const g of groups) {
      tot += g.pop;
      if (g.tech.known[key] != null) have += g.pop;
    }
    return tot ? have / tot : 0;
  }
  function adoptable(ctx, state, groups) {
    let total = 0;
    const have = {};
    for (const g of groups) {
      total += g.pop;
      for (const key in g.tech.known) have[key] = (have[key] ?? 0) + g.pop;
    }
    return TECHS.filter((t) => t.cost > 0 && state.techAdopted[t.key] == null && (have[t.key] ?? 0) >= total * 0.3).sort((a, b) => a.tier - b.tier || (a.key < b.key ? -1 : 1));
  }
  var capCache = /* @__PURE__ */ new WeakMap();
  function capsOf(civ6, st2) {
    const n2 = Object.keys(st2.techAdopted).length, c = capCache.get(st2);
    if (c && c.n === n2 && c.o === (civ6?.techOverrides ? 1 : 0)) return c.set;
    const set = /* @__PURE__ */ new Set();
    for (const k in st2.techAdopted) {
      const t = TECH[k];
      if (t) for (const x of capsOfTech(civ6, t)) set.add(x);
    }
    capCache.set(st2, { n: n2, o: civ6?.techOverrides ? 1 : 0, set });
    return set;
  }
  var stateCan = (civ6, st2, cap) => capsOf(civ6, st2).has(cap);
  function groupCaps(civ6, g) {
    const set = /* @__PURE__ */ new Set();
    for (const k in g.tech.known) {
      const t = TECH[k];
      if (t) for (const x of capsOfTech(civ6, t)) set.add(x);
    }
    return set;
  }
  var techsFor = (cap) => TECHS.filter((t) => t.caps.includes(cap));
  var ACTION_CAP = Object.freeze({ found_city: "action:found_city", build_fortification: "action:build_fortification", impose_sanctions: "action:impose_sanctions", covert_op: "action:covert_op", nuclear_program: "action:nuclear_program" });
  var TREATY_CAP = Object.freeze({ nonaggression: "treaty:nonaggression", alliance: "treaty:alliance", trade: "treaty:trade" });
  var POLITY_CAP = Object.freeze({ tribal: null, chiefdom: "polity:chiefdom", theocracy: "polity:chiefdom", kingdom: "polity:kingdom", republic: "polity:republic", empire: "polity:empire" });
  function gateReason(civ6, st2, cap) {
    if (!cap || stateCan(civ6, st2, cap)) return null;
    const ts = techsFor(cap);
    return `\u6280\u8853\u300C${ts.map((t) => t.name).join("\u30FB")}\u300D\u3092\u5236\u5EA6\u5316\u3057\u3066\u3044\u306A\u3044`;
  }
  function techFunction(civ6, st2, key, groups = null) {
    const t = TECH[key];
    if (!t || !t.prereq.length) return 1;
    let f2 = 1;
    for (const p of prereqOf(civ6, t)) {
      if (st2.techAdopted[p] != null) continue;
      const cov = groups ? techCoverage(groups, p) : 0.5;
      f2 = Math.min(f2, 0.35 + 0.65 * cov);
    }
    return f2;
  }
  function fxSum(civ6, st2, field, groups = null) {
    let s = 0;
    for (const k in st2.techAdopted) {
      const t = TECH[k];
      if (!t) continue;
      const v = fxOf(civ6, t)[field];
      if (v) s += v * (groups ? techFunction(civ6, st2, k, groups) : 1);
    }
    return s;
  }
  function impactOf(civ6, key) {
    const deps = TECHS.filter((t) => prereqOf(civ6, t).includes(key)).map((t) => t.key);
    let holders = 0, adopters = 0;
    for (const id in civ6.groups) if (civ6.groups[id].tech.known[key] != null) holders++;
    for (const id in civ6.states) if (civ6.states[id].alive && civ6.states[id].techAdopted[key] != null) adopters++;
    return { dependents: deps, holders, adopters };
  }

  // js/core/civ/techfx.js
  var dmMemo = /* @__PURE__ */ new WeakMap();
  var densityMult = (g) => {
    const c = g.tech.cand;
    let v = c ? dmMemo.get(c) : void 0;
    if (v === void 0) {
      let s = 0;
      for (const k in g.tech.known) {
        const t = TECH[k];
        if (t && t.col >= 3 && t.fx.cap) s += t.fx.cap;
      }
      v = 1 + 1.4 * (1 - Math.exp(-s / 1.4));
      if (c) dmMemo.set(c, v);
    }
    return v;
  };
  var milMult = (state, civ6 = null) => {
    let s = 0;
    for (const k in state.techAdopted) {
      const t = TECH[k];
      if (t) s += fxOf(civ6, t).off ?? 0;
    }
    return (state.martial ?? 1) * (1 + s) * (1 + (state.milBonus ?? 0));
  };
  var taxMult = (state, civ6 = null) => {
    let s = 0;
    for (const k in state.techAdopted) {
      const t = TECH[k];
      if (t) s += fxOf(civ6, t).tax ?? 0;
    }
    return 1 + s;
  };

  // js/core/civ/population.js
  var SUBSISTENCE = Object.freeze({ forage: "\u63A1\u96C6\u72E9\u731F", pastoral: "\u7267\u755C", agriculture: "\u8FB2\u8015", fishing: "\u6F01\u6488" });
  var POP = Object.freeze({
    growthPerMonth: 12e-4,
    minBudPop: 160,
    budShare: 0.35,
    budCooldown: 24,
    budPressure: 0.85,
    settleMinPop: 250,
    settleMinMonths: 24,
    villageMin: 100,
    townMin: 1500,
    cityMin: 1e4,
    settledShare: 0.7,
    moveRange: { forage: 9, pastoral: 14, agriculture: 7, fishing: 9 },
    waterCost: 6,
    famineRatio: 1.3,
    famineGap: 60,
    overshootDeath: 2e-3,
    noTargetBackoff: 60,
    territoryKm2: 14e3,
    agriTerritoryKm2: 6e3
    // 集団が使う領域の広さ（km²）。セルの大きさ（世界の解像度）に依存させない
  });
  var cacheOf2 = /* @__PURE__ */ new WeakMap();
  var terrain = (world) => {
    let t = cacheOf2.get(world);
    if (t) return t;
    const N2 = world.mesh.cellCount;
    t = { move: new Float32Array(N2).fill(-1) };
    cacheOf2.set(world, t);
    return t;
  };
  function stepCost(world, c, seafaring) {
    const w = world.cell.landWater[c];
    if (w !== LAND_WATER2.LAND) return seafaring >= 1 ? POP.waterCost : null;
    const t = terrain(world);
    if (t.move[c] >= 0) return t.move[c];
    const cell = world.cell, b = cell.biome[c];
    let k = 1;
    if (cell.mountain[c] > 0.5 || b === BIOMES2.ALPINE) k += 2.5;
    else if (cell.mountain[c] > 0.25) k += 1;
    if (b === BIOMES2.HOT_DESERT || b === BIOMES2.ICE) k += 2;
    else if (b === BIOMES2.COLD_DESERT || b === BIOMES2.TUNDRA || b === BIOMES2.RAINFOREST) k += 0.8;
    if (cell.river[c]) k += 0.3;
    t.move[c] = k;
    return k;
  }
  var budgetKm2 = (subsistence) => subsistence === "agriculture" ? POP.agriTerritoryKm2 : POP.territoryKm2;
  var COVER = 0.2;
  var cellBudgetKm2 = (world, c, subsistence) => Math.max(budgetKm2(subsistence), world.cell.areaKm2[c] * COVER);
  function cellDensity(world, c, subsistence, knowledge) {
    const cell = world.cell;
    if (cell.landWater[c] !== LAND_WATER2.LAND) return 0;
    const fert = cell.fertility[c], b = cell.biome[c], forage = 0.04 * (0.3 + fert);
    switch (subsistence) {
      case "agriculture":
        return Math.max(forage, (cell.capacity[c] ?? 0) / cell.areaKm2[c] * 0.6 * Math.min(1, 0.4 + 0.6 * (knowledge?.agriculture ?? 1)));
      case "fishing":
        return cell.coastDist[c] <= 1 || cell.river[c] ? 0.1 * (0.4 + 0.6 * fert) : forage * 0.5;
      case "pastoral":
        return b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.COLD_DESERT || b === BIOMES2.TUNDRA ? 0.1 * (0.5 + fert) : forage * 0.6;
      default:
        return forage;
    }
  }
  var cellCapacity = (world, c, subsistence, knowledge) => cellDensity(world, c, subsistence, knowledge) * Math.min(world.cell.areaKm2[c], cellBudgetKm2(world, c, subsistence));
  function territoryOf(world, c) {
    const m = world.mesh, out = [c];
    let area = world.cell.areaKm2[c];
    for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1] && area < POP.territoryKm2; k++) {
      const n2 = m.neighborIds[k];
      if (world.cell.landWater[n2] === LAND_WATER2.LAND) {
        out.push(n2);
        area += world.cell.areaKm2[n2];
      }
    }
    return out;
  }
  var ensureCells = (world, g) => g.cells ?? (g.cells = territoryOf(world, g.cell));
  function occupancy(world, civ6) {
    const occ = /* @__PURE__ */ new Map();
    for (const id in civ6.groups) for (const c of ensureCells(world, civ6.groups[id])) occ.set(c, (occ.get(c) ?? 0) + 1);
    return occ;
  }
  function groupCapacity(world, g, occ) {
    let k = 0, left = cellBudgetKm2(world, g.cell, g.subsistence);
    const tm = densityMult(g);
    for (const c of ensureCells(world, g)) {
      if (left <= 0) break;
      const a = Math.min(world.cell.areaKm2[c], left);
      k += cellDensity(world, c, g.subsistence, g.knowledge) * a / (occ.get(c) ?? 1);
      left -= a;
    }
    return k;
  }
  function reachable(world, from, budget, seafaring = 0) {
    const m = world.mesh, dist = /* @__PURE__ */ new Map([[from, 0]]), hd = [0], hc = [from];
    const push2 = (d, c) => {
      let i = hd.length;
      hd.push(d);
      hc.push(c);
      while (i > 0) {
        const p = i - 1 >> 1;
        if (hd[p] <= d) break;
        hd[i] = hd[p];
        hc[i] = hc[p];
        i = p;
      }
      hd[i] = d;
      hc[i] = c;
    };
    const pop = () => {
      const d0 = hd[0], c0 = hc[0], ld = hd.pop(), lc = hc.pop(), n2 = hd.length;
      if (n2) {
        let i = 0;
        for (; ; ) {
          let k = 2 * i + 1;
          if (k >= n2) break;
          if (k + 1 < n2 && hd[k + 1] < hd[k]) k++;
          if (hd[k] >= ld) break;
          hd[i] = hd[k];
          hc[i] = hc[k];
          i = k;
        }
        hd[i] = ld;
        hc[i] = lc;
      }
      return [d0, c0];
    };
    while (hd.length) {
      const [d, c] = pop();
      if (d > dist.get(c)) continue;
      for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) {
        const n2 = m.neighborIds[k], s = stepCost(world, n2, seafaring);
        if (s == null) continue;
        const nd = d + s;
        if (nd <= budget && nd < (dist.get(n2) ?? Infinity)) {
          dist.set(n2, nd);
          push2(nd, n2);
        }
      }
    }
    return dist;
  }
  function bestTargets(world, civ6, g, occ, limit = 3) {
    const dist = reachable(world, g.cell, POP.moveRange[g.subsistence] ?? 9, g.knowledge.seafaring), out = [];
    for (const [c, d] of dist) {
      if (c === g.cell || world.cell.landWater[c] !== LAND_WATER2.LAND || occ.has(c)) continue;
      const cap = cellCapacity(world, c, g.subsistence, g.knowledge);
      if (cap <= 0) continue;
      out.push({ cell: c, cost: d, score: cap / (1 + d * 0.35) });
    }
    out.sort((a, b) => b.score - a.score || a.cell - b.cell);
    return out.slice(0, limit);
  }
  var stageOf = (p) => p >= POP.cityMin ? "city" : p >= POP.townMin ? "town" : "village";
  var STAGE_JA = { village: "\u6751", town: "\u753A", city: "\u90FD\u5E02" };
  function inheritTech(known, pop) {
    const out = {};
    for (const t of TECHS) if (known[t.key] != null && t.minPop * 0.5 <= pop && t.prereq.every((p) => out[p] != null)) out[t.key] = known[t.key];
    return out;
  }
  function spawnGroup(civ6, ids, parent, cell, pop) {
    const id = ids.next("pop");
    const g = newGroup(id, { cell, pop, subsistence: parent.subsistence, species: parent.speciesId, bornAt: civ6.monthIndex, knowledge: parent.knowledge, parent: parent.id });
    g.stateId = parent.stateId;
    g.cohorts = parent.cohorts.map((c) => ({ ...c, tension: 0 }));
    g.tech = { known: inheritTech(parent.tech.known, pop), prog: {}, lost: {} };
    refreshCand(g);
    for (const [k, v] of Object.entries({ agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" })) g.knowledge[v] = g.tech.known[k] != null ? 1 : 0;
    civ6.groups[id] = g;
    return g;
  }
  function foundSettlement(world, civ6, ids, g, cause = null) {
    let best = g.cell, bs = -1;
    for (const c of ensureCells(world, g)) {
      const s2 = world.cell.fertility[c] + (world.cell.river[c] ? 0.4 : 0) + (world.cell.coastDist[c] <= 1 ? 0.2 : 0);
      if (s2 > bs) {
        bs = s2;
        best = c;
      }
    }
    const id = ids.next("settle"), s = { id, groupId: g.id, cell: best, foundedAt: civ6.monthIndex, pop: Math.round(g.pop * POP.settledShare), stage: "village" };
    civ6.settlements[id] = s;
    g.settlementId = id;
    makeEvent(civ6, ids, { kind: "settlement_founded", title: "\u96C6\u843D\u306E\u6210\u7ACB", participants: [{ entityId: g.id, role: "founder" }, { entityId: id, role: "settlement" }], location: { cell: best }, causes: cause ? [{ targetId: cause, relation: "caused_by", basis: "direct" }] : [] });
    return s;
  }
  function stepPopulation(ctx) {
    const { world, civ: civ6, ids, rng } = ctx, occ = occupancy(world, civ6), mi = civ6.monthIndex;
    for (const id of sortedGroupIds(civ6)) {
      const g = civ6.groups[id];
      if (!g) continue;
      const K = Math.max(1, groupCapacity(world, g, occ) * (g.capUntil > mi ? g.capMult : 1) * (ctx.ecoMult ? ctx.ecoMult(g) : 1)), pressure = g.pop / K, gm = (ctx.growthMult ? ctx.growthMult(g.cell) : 1) * (ctx.stateMult ? ctx.stateMult(g) : 1) * speciesOf(g.speciesId, civ6).growth * (civ6.options.growthScale ?? 1);
      const noise = 0.8 + 0.4 * rng();
      g.pop = Math.max(0, g.pop + g.pop * POP.growthPerMonth * (1 - pressure) * noise * gm - (pressure > 1 ? g.pop * POP.overshootDeath * (pressure - 1) : 0));
      if (pressure > POP.famineRatio && mi - g.famineAt >= POP.famineGap) {
        g.famineAt = mi;
        makeEvent(civ6, ids, { kind: "famine", title: "\u98E2\u3048", participants: [{ entityId: g.id, role: "sufferer" }], location: { cell: g.cell }, causes: asCauses(recentEventsFor(civ6, [g.id], ["disaster_struck"], 36, 1), "caused_by", "strong"), effects: [{ targetId: g.id, property: "pop", before: Math.round(g.pop), after: Math.round(g.pop) }] });
      }
      if (g.pop < 5) {
        delete civ6.groups[id];
        if (g.settlementId) delete civ6.settlements[g.settlementId];
        makeEvent(civ6, ids, { kind: "group_extinct", title: "\u96C6\u56E3\u306E\u6D88\u6EC5", participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell } });
        continue;
      }
      g.settledMonths = g.order ? 0 : g.settledMonths + 1;
      if (g.order?.type === "move" && mi >= g.order.arriveAt) {
        g.cell = g.order.to;
        g.cells = null;
        g.order = null;
        g.settledMonths = 0;
        g.settlementId = null;
        makeEvent(civ6, ids, { kind: "group_moved", title: "\u96C6\u56E3\u306E\u79FB\u52D5\u5B8C\u4E86", participants: [{ entityId: g.id, role: "mover" }], location: { cell: g.cell } });
      }
      g.pressure = pressure;
      const c = g.cell, ce = world.cell;
      const want = g.subsistence !== "agriculture" && g.knowledge.agriculture >= 1 ? "agriculture" : g.subsistence === "forage" && g.knowledge.herding >= 1 ? "pastoral" : null;
      if (want) {
        if (g.player) addProposal(civ6, ids, g, "change_subsistence", { subsistence: want });
        else {
          const before = g.subsistence;
          g.subsistence = want;
          makeEvent(civ6, ids, { kind: "subsistence_changed", title: `\u751F\u696D\u306E\u8EE2\u63DB\uFF08${SUBSISTENCE[before]}\u2192${SUBSISTENCE[want]}\uFF09`, participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: "subsistence", before, after: want }] });
        }
      }
      if (!g.settlementId && g.subsistence !== "forage" && g.subsistence !== "pastoral" && g.pop >= POP.settleMinPop && g.settledMonths >= POP.settleMinMonths) {
        if (g.player) addProposal(civ6, ids, g, "found_settlement", {});
        else foundSettlement(world, civ6, ids, g);
      }
      const st2 = g.settlementId ? civ6.settlements[g.settlementId] : null;
      if (st2) {
        st2.pop = Math.round(g.pop * POP.settledShare);
        const ns = stageOf(st2.pop);
        if (ns !== st2.stage) {
          const old = st2.stage;
          st2.stage = ns;
          makeEvent(civ6, ids, { kind: "settlement_stage", title: `${STAGE_JA[old]}\u304B\u3089${STAGE_JA[ns]}\u3078`, participants: [{ entityId: st2.id, role: "settlement" }], location: { cell: st2.cell }, causes: asCauses(recentEventsFor(civ6, [g.id], ["disaster_struck", "famine"], 24, 1), "contributed_to", "plausible") });
        }
      }
      if (pressure > POP.budPressure && g.pop >= POP.minBudPop * 2 && mi - g.lastBudAt >= POP.budCooldown && !g.order) {
        const targets = bestTargets(world, civ6, g, occ, 3);
        if (targets.length) {
          if (g.player) addProposal(civ6, ids, g, "split", { targets });
          else {
            const t = targets[0], moved = Math.round(g.pop * POP.budShare);
            g.pop -= moved;
            g.lastBudAt = mi;
            const child = spawnGroup(civ6, ids, g, t.cell, moved);
            occ.set(t.cell, 1);
            for (const x of ensureCells(world, child)) occ.set(x, (occ.get(x) ?? 0) + 1);
            makeEvent(civ6, ids, { kind: "group_split", title: "\u96C6\u56E3\u306E\u5206\u6D3E", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: t.cell }, causes: asCauses(recentEventsFor(civ6, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible") });
          }
        } else g.lastBudAt = mi - POP.budCooldown + POP.noTargetBackoff;
      }
    }
  }
  function addProposal(civ6, ids, g, kind, payload) {
    if (civ6.proposals.some((p) => p.groupId === g.id && p.kind === kind && !p.resolved)) return;
    civ6.proposals.push({ proposalId: ids.next("proposal"), date: { ...civ6.date }, groupId: g.id, kind, payload, resolved: false });
  }

  // js/core/wcde/domains/ecosystem.js
  var FAUNA_BIOME = { [BIOMES2.SAVANNA]: 1, [BIOMES2.GRASSLAND]: 0.9, [BIOMES2.TROPICAL_SEASONAL]: 0.85, [BIOMES2.TEMPERATE_FOREST]: 0.75, [BIOMES2.RAINFOREST]: 0.65, [BIOMES2.WETLAND]: 0.8, [BIOMES2.TAIGA]: 0.45, [BIOMES2.TUNDRA]: 0.4, [BIOMES2.ALPINE]: 0.3, [BIOMES2.COLD_DESERT]: 0.2, [BIOMES2.HOT_DESERT]: 0.12, [BIOMES2.ICE]: 0.05 };
  var FLORA_BIOME = { [BIOMES2.RAINFOREST]: 1, [BIOMES2.TROPICAL_SEASONAL]: 0.9, [BIOMES2.TEMPERATE_FOREST]: 0.85, [BIOMES2.SAVANNA]: 0.65, [BIOMES2.GRASSLAND]: 0.7, [BIOMES2.WETLAND]: 0.8, [BIOMES2.TAIGA]: 0.5, [BIOMES2.TUNDRA]: 0.25, [BIOMES2.ALPINE]: 0.2, [BIOMES2.COLD_DESERT]: 0.15, [BIOMES2.HOT_DESERT]: 0.08, [BIOMES2.ICE]: 0.02 };
  var TAU = { flora: 6, fauna: 30, deg: 400 };
  var q3 = (x) => Math.round(x * 1e3) / 1e3;
  var clamp2 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  function potentialAt(world, c, laws, ice = 0) {
    const ce = world.cell, b = ce.biome[c];
    if (ce.landWater[c] !== LAND_WATER2.LAND) return { flora: 0, fauna: 0 };
    const lat = Math.abs(ce.lat[c]) * 180 / Math.PI, ik = 1 - ice * 0.65 * clamp2((lat - 35) / 35), water = ce.river[c] || ce.coastDist[c] <= 2 ? 1.1 : 1, fert = 0.55 + 0.6 * ce.fertility[c];
    return { flora: clamp2((FLORA_BIOME[b] ?? 0.3) * fert * ik * (laws?.fertilityScale ?? 1)), fauna: clamp2((FAUNA_BIOME[b] ?? 0.3) * (0.6 + 0.5 * ce.fertility[c]) * water * ik * (laws?.faunaRichness ?? 1)) };
  }
  function initEco(world, laws, ice = 0) {
    const N2 = world.mesh.cellCount, flora = new Array(N2).fill(0), fauna = new Array(N2).fill(0), deg = new Array(N2).fill(0);
    for (let c = 0; c < N2; c++) {
      const p = potentialAt(world, c, laws, ice);
      flora[c] = q3(p.flora);
      fauna[c] = q3(p.fauna);
    }
    return { v: 1, flora, fauna, deg, last: null, stats: { hunted: 0, tilled: 0 } };
  }
  function stepEco(world, civ6, groups, dt, { ice = 0, laws = civ6.wcde.config.laws, cellsOf = (g) => g.cells ?? [g.cell] } = {}) {
    const eco = civ6.eco ?? (civ6.eco = initEco(world, laws, ice)), N2 = world.mesh.cellCount, res = laws.ecoResilience ?? 1;
    const hunt = new Float32Array(N2), till = new Float32Array(N2), graze = new Float32Array(N2);
    for (const g of groups) {
      const cells = cellsOf(g), n2 = Math.max(1, cells.length), p = clamp2(g.pressure ?? 0, 0, 2) / n2, k = g.knowledge ?? {};
      for (const c of cells) {
        if (g.subsistence === "agriculture" && (k.agriculture ?? 0) >= 1) till[c] += p;
        else if (g.subsistence === "pastoral" && (k.herding ?? 0) >= 1) graze[c] += p;
        else hunt[c] += p;
        if (g.subsistence !== "agriculture") hunt[c] += 0.25 * p;
      }
    }
    const kf = 1 - Math.exp(-dt * res / TAU.flora), kn = 1 - Math.exp(-dt * res / TAU.fauna), kd = 1 - Math.exp(-dt * res / TAU.deg);
    let hs = 0, ts = 0;
    for (let c = 0; c < N2; c++) {
      const pot = potentialAt(world, c, laws, ice);
      if (pot.flora === 0 && pot.fauna === 0) continue;
      let d = eco.deg[c];
      const dUp = (0.012 * till[c] + 0.02 * graze[c]) * dt;
      d = clamp2(d + dUp - kd * d * (till[c] + graze[c] > 0.05 ? 0.15 : 1));
      eco.deg[c] = q3(d);
      ts += till[c] + graze[c];
      const tf = pot.flora * (1 - 0.7 * d) * (1 - 0.35 * clamp2(graze[c])) * (1 - 0.15 * clamp2(till[c]));
      eco.flora[c] = q3(clamp2(eco.flora[c] + (tf - eco.flora[c]) * kf));
      const tn = pot.fauna * Math.pow(Math.max(0.05, eco.flora[c] / Math.max(0.05, pot.flora)), 0.6) * (1 - 0.8 * clamp2(hunt[c] * 1.4));
      eco.fauna[c] = q3(clamp2(eco.fauna[c] + (tn - eco.fauna[c]) * kn));
      hs += hunt[c];
    }
    eco.last = civ6.monthIndex;
    eco.stats.hunted = q3(hs);
    eco.stats.tilled = q3(ts);
    return eco;
  }
  function ecoHealth(world, civ6, g, cellsOf = (x) => x.cells ?? [x.cell]) {
    const eco = civ6.eco;
    if (!eco) return 1;
    const cells = cellsOf(g);
    let f2 = 0, a = 0, d = 0, n2 = 0;
    for (const c of cells) {
      const p = potentialAt(world, c, civ6.wcde?.config?.laws);
      if (p.flora === 0 && p.fauna === 0) continue;
      n2++;
      f2 += p.flora > 0 ? eco.flora[c] / p.flora : 1;
      a += p.fauna > 0 ? eco.fauna[c] / p.fauna : 1;
      d += eco.deg[c];
    }
    if (!n2) return 1;
    f2 = clamp2(f2 / n2);
    a = clamp2(a / n2);
    d /= n2;
    switch (g.subsistence) {
      case "agriculture":
        return clamp2(1 - d * 0.9);
      case "pastoral":
        return clamp2(0.2 + 0.8 * f2);
      case "fishing":
        return clamp2(0.3 + 0.7 * a);
      default:
        return clamp2(0.15 + 0.45 * f2 + 0.4 * a);
    }
  }
  var ecoMult = (world, civ6, g) => 0.55 + 0.6 * ecoHealth(world, civ6, g);
  function stepEcosystem(ctx) {
    const { world, civ: civ6 } = ctx;
    if (!civ6.options.wcde) return;
    const mi = civ6.monthIndex, laws = civ6.wcde.config.laws, cl = civ6.climate?.index ?? 0, ice = clamp2(-cl * 0.4);
    const groups = Object.values(civ6.groups), before = civ6.eco ? civ6.eco.stats.hunted : 0;
    stepEco(world, civ6, groups, 1, { ice, laws });
    void before;
  }
  function ecoSummary(world, civ6) {
    const eco = civ6.eco;
    if (!eco) return null;
    const N2 = world.mesh.cellCount;
    let n2 = 0, f2 = 0, a = 0, bad3 = 0;
    for (let c = 0; c < N2; c++) {
      if (world.cell.landWater[c] !== LAND_WATER2.LAND) continue;
      n2++;
      f2 += eco.flora[c];
      a += eco.fauna[c];
      if (eco.deg[c] > 0.4) bad3++;
    }
    return n2 ? { cells: n2, flora: q3(f2 / n2), fauna: q3(a / n2), degraded: q3(bad3 / n2) } : null;
  }
  function checkEco(world, civ6) {
    const errs = [], e = civ6.eco;
    if (!e) return errs;
    const N2 = world.mesh.cellCount;
    for (const k of ["flora", "fauna", "deg"]) {
      if (!Array.isArray(e[k]) || e[k].length !== N2) {
        errs.push(`eco.${k} \u306E\u9577\u3055\u304C\u30BB\u30EB\u6570\u3068\u5408\u308F\u306A\u3044`);
        continue;
      }
      for (let i = 0; i < N2; i++) {
        const v = e[k][i];
        if (!(v >= 0 && v <= 1)) {
          errs.push(`eco.${k}[${i}] \u304C 0\u301C1 \u3067\u306A\u3044: ${v}`);
          break;
        }
      }
    }
    return errs;
  }

  // js/core/wcde/prehistory.js
  var PREHISTORY_STEP_YEARS = 2500;
  var LEARN_EVERY = 4;
  var preBoost = (f2) => 0.6 + 6 * f2 ** 3 + 3e3 * Math.max(0, f2 - 0.85) ** 2;
  var isPrehistoricTech = (t) => t.pre;
  var RIPEN_YEARS = 400;
  var FAR_SCALES = [1, 2, 3.5];
  var gateYears = (neo) => ({ seafaring: 6e4, pottery: 2e4, agriculture: neo, pastoralism: neo - 500, construction: neo - 500 });
  var LOCAL_SCALE = 0.4;
  var SPREAD_P = 0.6;
  var SPREAD_HOPS = 12;
  var EPOCHS = 20;
  var DEG = Math.PI / 180;
  function createWcdeCiv(world, config, { historySeed = null } = {}) {
    const seeds = derivedSeeds(config), start2 = -Math.round(config.prehistory.years);
    const civ6 = { version: CIV_STATE_VERSION, historySeed: historySeed ?? hashSeed(config.worldSeed, "history"), seq: {}, date: fromMonthIndex(monthIndex(start2, 1)), monthIndex: monthIndex(start2, 1), groups: {}, settlements: {}, events: [], proposals: [], player: { groupId: null }, ...emptyLayers() };
    civ6.options = { aiInterval: 6, wcde: true, magic: false, growthScale: config.laws.fertilityScale, disasterRate: config.laws.disasterRate, climateVolatility: config.laws.climateVolatility };
    civ6.wcde = { v: 1, phase: "prehistory", config, seeds, startMonth: civ6.monthIndex, prehistory: null, candidates: [], control: { stateId: null }, cmdIds: [], diagnostics: [], edits: [] };
    return civ6;
  }
  var clamp3 = (v, a, b) => v < a ? a : v > b ? b : v;
  var glacialAt = (frac, years, phase, vol) => vol <= 0 ? 0 : clamp3(vol, 0, 3) / 3 * Math.max(0, Math.sin(frac * years / 1e5 * 2 * Math.PI + phase)) ** 2;
  var iceMult = (lat, ice) => 1 - ice * 0.65 * clamp3((Math.abs(lat) / DEG - 35) / 35, 0, 1);
  function landComponents(world, landCells) {
    const m = world.mesh, comp = new Int32Array(m.cellCount).fill(-1), sizes = [];
    for (const s of landCells) {
      if (comp[s] >= 0) continue;
      const id = sizes.length, q2 = [s];
      comp[s] = id;
      let n2 = 0;
      while (q2.length) {
        const c = q2.pop();
        n2++;
        for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) {
          const o = m.neighborIds[k];
          if (comp[o] < 0 && world.cell.landWater[o] === LAND_WATER2.LAND) {
            comp[o] = id;
            q2.push(o);
          }
        }
      }
      sizes.push(n2);
    }
    return { comp, sizes };
  }
  function targetsFor(world, g, occ, res, limit, scale = 1) {
    const dist = reachable(world, g.cell, (POP.moveRange[g.subsistence] ?? 9) * res * scale, g.knowledge.seafaring), out = [];
    for (const [c, d] of dist) {
      if (c === g.cell || world.cell.landWater[c] !== LAND_WATER2.LAND || occ.has(c)) continue;
      const cap = cellCapacity(world, c, g.subsistence, g.knowledge);
      if (cap <= 0) continue;
      out.push({ cell: c, cost: d, score: cap / (1 + d / res * 0.35) });
    }
    out.sort((a, b) => b.score - a.score || a.cell - b.cell);
    return out.slice(0, limit);
  }
  var stageOf2 = (p) => p >= POP.cityMin ? "city" : p >= POP.townMin ? "town" : "village";
  function runPrehistory(world, civ6, { stepYears = PREHISTORY_STEP_YEARS, onProgress = null } = {}) {
    const cfg = civ6.wcde.config, ids = createIdGen(civ6.seq), seed = civ6.wcde.seeds.prehistory, years = cfg.prehistory.years;
    const steps = Math.max(1, Math.round(years / stepYears)), stepMonths = years * 12 / steps, start2 = civ6.wcde.startMonth;
    const phase0 = hashSeed(seed, "ice") % 1e3 / 1e3 * Math.PI * 2, vol = cfg.laws.climateVolatility;
    const stats = { steps, stepYears: years / steps, species: {}, firstTech: {}, peakGroups: 0, glacialMax: 0, seaCrossings: 0, settlements: 0, budSearches: 0, farSearches: 0, extinct: 0 };
    const order = [], occ = /* @__PURE__ */ new Map(), home = /* @__PURE__ */ new Map(), addOcc = (g) => {
      for (const c of g.cells) {
        occ.set(c, (occ.get(c) ?? 0) + 1);
        home.set(c, g.id);
      }
    }, subOcc = (g) => {
      for (const c of g.cells) {
        const n2 = (occ.get(c) ?? 1) - 1;
        if (n2 <= 0) {
          occ.delete(c);
          home.delete(c);
        } else {
          occ.set(c, n2);
          if (home.get(c) === g.id) home.delete(c);
        }
      }
    };
    const ce = world.cell, N2 = world.mesh.cellCount;
    const envFit = (sp, b) => !sp.env?.length ? 1 : sp.env.includes(b) ? 1 : 0.3;
    const speciesIn = (id) => speciesOf(id, civ6);
    const note3 = (kind, title, parts, g, causes = []) => makeEvent(civ6, ids, { kind, title, participants: parts, location: g ? { cell: g.cell } : null, causes, provenance: "simulation" });
    const KB = { agriculture: "agriculture", pastoralism: "herding", seafaring: "seafaring" };
    let pending = [];
    const learn2 = (g, key, mi) => {
      var _a;
      const t = TECH[key];
      g.tech.known[key] = mi;
      delete g.tech.prog[key];
      refreshCand(g);
      if (KB[key]) g.knowledge[KB[key]] = 1;
      const prior = civ6.techWorld[key], rec = (_a = civ6.techWorld)[key] ?? (_a[key] = { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {}, firstGroupId: g.id });
      rec.independent++;
      if (!prior) {
        stats.firstTech[key] = mi;
        rec.firstEventId = note3("tech_discovered", `${t.name}\u3092\u521D\u3081\u3066\u767A\u898B`, [{ entityId: g.id, role: "discoverer" }], g).eventId;
      }
      pending.push({ g, key, d: 0 });
    };
    const neighborsOf = (g) => {
      const out = /* @__PURE__ */ new Set(), m = world.mesh;
      for (const c of g.cells) for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) {
        const o = home.get(m.neighborIds[k]);
        if (o && o !== g.id) out.add(o);
      }
      return [...out].sort();
    };
    const spread = (mi, rng) => {
      let q2 = pending;
      pending = [];
      for (let qi = 0; qi < q2.length; qi++) {
        const { g, key, d } = q2[qi], t = TECH[key];
        if (!civ6.groups[g.id]) continue;
        const dom = g.cohorts[0];
        for (const oid of neighborsOf(g)) {
          const o = civ6.groups[oid];
          if (!o || o.tech.known[key] != null || !t.prereq.every((p) => o.tech.known[p] != null) || o.pop < t.minPop || key === "seafaring" && ce.coastDist[o.cell] > 1) continue;
          if (rng() >= SPREAD_P + (o.cohorts[0].cultureId === dom.cultureId ? 0.15 : 0)) continue;
          o.tech.known[key] = mi;
          delete o.tech.prog[key];
          refreshCand(o);
          if (KB[key]) o.knowledge[KB[key]] = 1;
          stats.transfers = (stats.transfers ?? 0) + 1;
          {
            const rec = civ6.techWorld[key];
            if (rec) {
              rec.spread++;
              rec.byChannel.contact = (rec.byChannel.contact ?? 0) + 1;
            }
          }
          if (d + 1 < SPREAD_HOPS) q2.push({ g: o, key, d: d + 1 });
          else pending.push({ g: o, key, d: 0 });
        }
      }
    };
    const mk = (cell, pop, speciesId, parentCulture = null) => {
      const id = ids.next("pop"), g = newGroup(id, { cell, pop, subsistence: "forage", species: speciesId, bornAt: civ6.monthIndex });
      const rng = ctxRng;
      const cu = createCulture(civ6, ids, rng, { parent: parentCulture, cell }), lg = createLanguage(civ6, ids, rng, { cultureId: cu });
      g.cohorts = [{ cultureId: cu, languageId: lg, religionId: null, speciesId, share: 1, tension: 0, interest: null }];
      g.tech.known.stone_tools = civ6.monthIndex;
      refreshCand(g);
      g.cells = territoryOf(world, cell);
      g.gen = 0;
      civ6.groups[id] = g;
      order.push(id);
      addOcc(g);
      return g;
    };
    let ctxRng = rngOf(hashSeed(seed, "init"));
    const landCells = [];
    for (let c = 0; c < N2; c++) if (ce.landWater[c] === LAND_WATER2.LAND) landCells.push(c);
    if (!landCells.length) throw new Error("\u9678\u5730\u304C\u306A\u3044\u4E16\u754C\u3067\u306F\u5148\u53F2\u3092\u9032\u3081\u3089\u308C\u307E\u305B\u3093");
    const score = (c, sp) => {
      const b = ce.biome[c], base = ce.fertility[c] * 0.6 + (ce.coastDist[c] <= 3 || ce.river[c] ? 0.3 : 0) + Math.min(1, (ce.capacity[c] ?? 0) / (ce.areaKm2[c] || 1)) * 0.4;
      return base * envFit(sp, b);
    };
    const { comp, sizes } = landComponents(world, landCells), bigMin = Math.min(Math.max(...sizes), Math.max(20, landCells.length * 0.1));
    const archaic = SPECIES.archaic, hcands = landCells.filter((c) => sizes[comp[c]] >= bigMin && Math.abs(ce.lat[c]) < 35 * DEG && [BIOMES2.SAVANNA, BIOMES2.TROPICAL_SEASONAL, BIOMES2.GRASSLAND, BIOMES2.TEMPERATE_FOREST].includes(ce.biome[c])).sort((a, b) => score(b, archaic) - score(a, archaic) || a - b);
    const pool = (hcands.length ? hcands : landCells.filter((c) => sizes[comp[c]] >= bigMin).sort((a, b) => score(b, archaic) - score(a, archaic) || a - b)).slice(0, 10), origin = pool[Math.floor(ctxRng() * pool.length)];
    civ6.monthIndex = start2;
    civ6.date = fromMonthIndex(start2);
    const hg = mk(origin, 120, "archaic");
    civ6.species.archaic = { id: "archaic", name: "\u53E4\u4EE3\u578B\u4EBA\u985E", bornAt: start2 };
    note3("species_emerged", "\u53E4\u4EE3\u578B\u4EBA\u985E\u306E\u96C6\u56E3\u304C\u73FE\u308C\u305F", [{ entityId: "archaic", role: "species" }, { entityId: hg.id, role: "first_group" }], hg);
    stats.species.archaic = { at: start2, cell: origin };
    const modernAt = Math.floor(steps * (0.3 + 0.25 * (hashSeed(civ6.wcde.seeds.lineage, "modern") % 1e3) / 1e3));
    let modernDone = false;
    stats.assimilated = 0;
    let areaSum = 0;
    for (const c of landCells) areaSum += ce.areaKm2[c];
    const res = clamp3(Math.sqrt(POP.territoryKm2 * 1.5 / (areaSum / landCells.length)), 1, 6);
    stats.moveScale = Math.round(res * 100) / 100;
    const baseRate = POP.growthPerMonth * 12, gate = gateYears(cfg.prehistory.neolithicYears ?? 1e4);
    let Kworld = 0;
    for (const c of landCells) Kworld += 0.04 * (0.3 + ce.fertility[c]) * ce.areaKm2[c];
    civ6.eco = initEco(world, cfg.laws, 0);
    let worldPop = 120, lastEpoch = -1, epochs = 0;
    const cultRel = /* @__PURE__ */ new Map();
    stats.epochs = [];
    for (let step = 0; step < steps; step++) {
      const mi = start2 + Math.round(step * stepMonths);
      civ6.monthIndex = mi;
      civ6.date = fromMonthIndex(mi);
      const frac = step / steps, ice = glacialAt(frac, years, phase0, vol);
      if (ice > stats.glacialMax) stats.glacialMax = ice;
      const rng = ctxRng = rngOf(hashSeed(seed, "step", step));
      if (!modernDone && step >= modernAt) {
        const cand3 = order.map((i) => civ6.groups[i]).filter((g) => g && g.speciesId === "archaic").sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1))[0];
        if (cand3) {
          modernDone = true;
          cand3.speciesId = "human";
          for (const c of cand3.cohorts) c.speciesId = "human";
          civ6.species.human = { id: "human", name: "\u4EBA\u9593", bornAt: mi };
          stats.species.human = { at: mi, cell: cand3.cell };
          note3("species_emerged", "\u73FE\u751F\u4EBA\u985E\u304C\u73FE\u308C\u305F", [{ entityId: "human", role: "species" }, { entityId: cand3.id, role: "first_group" }], cand3);
        }
      }
      if (modernDone) for (const id of order) {
        const g = civ6.groups[id];
        if (!g || g.speciesId !== "archaic") continue;
        const nearModern = neighborsOf(g).some((o) => civ6.groups[o]?.speciesId === "human"), u = hashSeed(seed, "assim", step, id) % 1e4 / 1e4;
        if (u < (nearModern ? 0.3 : 0.01)) {
          g.speciesId = "human";
          for (const c of g.cohorts) c.speciesId = "human";
          stats.assimilated++;
        }
      }
      spread(mi, rng);
      let total = 0, n2 = 0;
      for (let oi = 0; oi < order.length; oi++) {
        const id = order[oi], g = civ6.groups[id];
        if (!g) continue;
        n2++;
        const sp = speciesIn(g.speciesId), fit = envFit(sp, ce.biome[g.cell]);
        const K = Math.max(0.5, groupCapacity(world, g, occ) * fit * iceMult(ce.lat[g.cell], ice) * (g.capMult ?? 1) * ecoMult(world, civ6, g));
        const r = baseRate * sp.growth * (civ6.options.growthScale ?? 1) * (0.85 + 0.3 * rng()), N0 = Math.max(1, g.pop);
        g.pop = K / (1 + (K / N0 - 1) * Math.exp(-r * (stepMonths / 12)));
        g.pressure = g.pop / K;
        total += g.pop;
        if (g.pop < 5) {
          subOcc(g);
          delete civ6.groups[id];
          stats.extinct++;
          n2--;
          continue;
        }
        g.settledMonths = g.subsistence === "forage" || g.subsistence === "pastoral" ? 0 : g.settledMonths + stepMonths;
        if ((step + oi % LEARN_EVERY) % LEARN_EVERY === 0) {
          if (!g.tech.cand) refreshCand(g);
          const dt = stepMonths / 12 * LEARN_EVERY, env = { accel: accel(civ6, worldPop) * sp.techRate * preBoost(frac), contact: neighborsOf(g).length, rivals: 0 };
          for (const key of [...g.tech.cand]) {
            const t = TECH[key];
            if (!isPrehistoricTech(t) || gate[key] != null && mi < -gate[key] * 12) continue;
            let rate = emergenceRate(world, civ6, g, t, env);
            if (gate[key] != null) rate *= 1 + (mi + gate[key] * 12) / 12 / RIPEN_YEARS;
            if (rate <= 0 || u01(civ6, "pretech", step, g.id, key) >= pEmerge(rate, dt)) continue;
            learn2(g, key, mi);
          }
        }
        if (g.subsistence !== "agriculture" && g.knowledge.agriculture >= 1 && (ce.fertility[g.cell] >= 0.25 || ce.river[g.cell] || ce.coastDist[g.cell] <= 2)) g.subsistence = "agriculture";
        else if (g.subsistence === "forage") {
          const b = ce.biome[g.cell];
          if (g.knowledge.herding >= 1 && (b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.COLD_DESERT || b === BIOMES2.TUNDRA)) g.subsistence = "pastoral";
          else if (g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1 && rng() < 0.4) g.subsistence = "fishing";
        }
        if (g.pressure > POP.budPressure && g.pop >= POP.minBudPop * 1.25 && (g.noTargetUntil ?? -1) <= step) {
          stats.budSearches++;
          const pick2 = (ts) => ts.find((x) => envFit(sp, ce.biome[x.cell]) >= 1) ?? ts[0];
          let t = pick2(targetsFor(world, g, occ, res, 6, Math.max(1 / res, LOCAL_SCALE)));
          if (!t && g.knowledge.seafaring >= 1 && ce.coastDist[g.cell] <= 1) {
            stats.farSearches++;
            for (const sc of FAR_SCALES) {
              t = pick2(targetsFor(world, g, occ, res, 6, sc));
              if (t) break;
            }
          }
          if (!t) g.noTargetUntil = step + 6 + hashSeed(id) % 6;
          else {
            const moved = Math.round(g.pop * POP.budShare);
            g.pop -= moved;
            const child = spawnGroup(civ6, ids, g, t.cell, moved);
            child.cells = territoryOf(world, t.cell);
            child.gen = (g.gen ?? 0) + 1;
            child.settledMonths = 0;
            child.stateId = null;
            order.push(child.id);
            addOcc(child);
            if (ce.landWater[g.cell] === LAND_WATER2.LAND && g.knowledge.seafaring >= 1 && t.cost >= POP.waterCost * res * 0.5) {
              stats.seaCrossings++;
              if (stats.seaCrossings === 1) note3("sea_crossed", "\u6D77\u3092\u6E21\u3063\u3066\u65B0\u3057\u3044\u571F\u5730\u3078\u4EBA\u3005\u304C\u79FB\u3063\u305F", [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "settlers" }], child);
            }
            const co = child.cohorts[0];
            if (child.gen >= 8 && rng() < 0.5) {
              const nl = createLanguage(civ6, ids, rng, { parent: co.languageId, cultureId: co.cultureId });
              co.languageId = nl;
              if (child.gen >= 14 || rng() < 0.25) {
                const nc = createCulture(civ6, ids, rng, { parent: co.cultureId, cell: child.cell });
                co.cultureId = nc;
                child.gen = 0;
                if (co.religionId && rng() < 0.4) co.religionId = createReligion(civ6, ids, rng, { parent: co.religionId });
              }
            }
          }
        }
        {
          const co = g.cohorts[0];
          if (!co.religionId && frac > 0.15 && g.pop > 300) {
            const known = cultRel.get(co.cultureId);
            if (known) co.religionId = known;
            else if (rng() < 0.01) {
              co.religionId = createReligion(civ6, ids, rng);
              cultRel.set(co.cultureId, co.religionId);
            }
          } else if (co.religionId && !cultRel.has(co.cultureId)) cultRel.set(co.cultureId, co.religionId);
        }
      }
      worldPop = total;
      stepEco(world, civ6, order.map((i) => civ6.groups[i]).filter(Boolean), stepMonths / 12, { ice, laws: cfg.laws });
      if (n2 > stats.peakGroups) stats.peakGroups = n2;
      const ep = Math.floor(frac * EPOCHS), epEnd = step === steps - 1 || Math.floor((step + 1) / steps * EPOCHS) !== ep;
      if (epEnd && ep !== lastEpoch) {
        lastEpoch = ep;
        epochs++;
        let popEnd = 0, nEnd = 0;
        {
          const sub2 = {};
          for (const id of order) {
            const g = civ6.groups[id];
            if (g) {
              sub2[g.subsistence] = (sub2[g.subsistence] ?? 0) + 1;
              popEnd += g.pop;
              nEnd++;
            }
          }
          stats.epochs.push({ ep, groups: nEnd, pop: Math.round(popEnd), x: Math.round(popEnd / Kworld * 100) / 100, ice: Math.round(ice * 100) / 100, sub: sub2 });
        }
        note3("prehistory_epoch", `\u5148\u53F2 \u7B2C${epochs}\u671F\u306E\u6982\u6CC1\uFF08\u7D42\u308F\u308A\u306E\u6642\u70B9\u3067 \u96C6\u56E3 ${nEnd}\u30FB\u4EBA\u53E3 \u7D04${Math.round(popEnd)}\uFF09`, [], null).effects.push({ targetId: "world", property: "prehistory.pop", before: null, after: Math.round(popEnd) });
      }
      if (onProgress && step % 20 === 0) onProgress(step, steps);
    }
    civ6.monthIndex = monthIndex(0, 1);
    civ6.date = fromMonthIndex(civ6.monthIndex);
    for (const id of order) {
      const g = civ6.groups[id];
      if (!g) continue;
      g.lastBudAt = civ6.monthIndex - POP.budCooldown;
      g.noTargetUntil = void 0;
      g.famineAt = -999;
      g.cells = g.cells ?? territoryOf(world, g.cell);
      delete g.gen;
      delete g.noTargetUntil;
      delete g.capMult;
      if (!g.settlementId && g.subsistence !== "forage" && g.subsistence !== "pastoral" && g.pop >= POP.settleMinPop) {
        const sid = ids.next("settle");
        let best = g.cell, bs = -1;
        for (const c of g.cells) {
          const s = ce.fertility[c] + (ce.river[c] ? 0.4 : 0) + (ce.coastDist[c] <= 1 ? 0.2 : 0);
          if (s > bs) {
            bs = s;
            best = c;
          }
        }
        civ6.settlements[sid] = { id: sid, groupId: g.id, cell: best, foundedAt: civ6.monthIndex - 60, pop: Math.round(g.pop * POP.settledShare), stage: stageOf2(Math.round(g.pop * POP.settledShare)) };
        g.settlementId = sid;
        g.settledMonths = POP.settleMinMonths;
        stats.settlements++;
      }
      g.bornAt = Math.min(g.bornAt, civ6.monthIndex);
    }
    for (const id of order) {
      const g = civ6.groups[id];
      if (g && g.parent && !civ6.groups[g.parent]) g.parent = null;
    }
    stats.groups = Object.keys(civ6.groups).length;
    stats.pop = Math.round(Object.values(civ6.groups).reduce((s, g) => s + g.pop, 0));
    civ6.wcde.prehistory = stats;
    civ6.wcde.phase = "founding";
    return stats;
  }

  // js/core/wcde/regimes.js
  var OFFICES = Object.freeze({
    chief: ["\u65CF\u9577", "ruler"],
    elder_council: ["\u9577\u8001\u4F1A\u8B70", "admin"],
    shaman: ["\u546A\u8853\u5E2B", "faith"],
    war_leader: ["\u6226\u58EB\u9577", "mil"],
    hunt_master: ["\u72E9\u731F\u9577", "econ"],
    chieftain: ["\u9996\u9577", "ruler"],
    steward: ["\u5BB6\u653F\u9577", "admin"],
    storyteller: ["\u8A9E\u308A\u90E8", "cult"],
    tribute_collector: ["\u8CA2\u7D0D\u53D6\u7ACB\u5F79", "econ"],
    high_priest: ["\u5927\u796D\u53F8", "ruler"],
    temple_steward: ["\u795E\u6BBF\u7BA1\u7406\u5B98", "admin"],
    oracle: ["\u795E\u8A17\u5B98", "faith"],
    inquisitor: ["\u5BE9\u554F\u5B98", "law"],
    temple_guard: ["\u795E\u6BBF\u5B88\u8B77\u9577", "mil"],
    despot: ["\u5C02\u5236\u541B\u4E3B", "ruler"],
    king: ["\u56FD\u738B", "ruler"],
    vizier: ["\u5BB0\u76F8", "admin"],
    chancellor: ["\u5927\u6CD5\u5B98", "law"],
    marshal: ["\u5143\u5E25", "mil"],
    treasurer: ["\u8CA1\u52D9\u9577\u5B98", "econ"],
    chamberlain: ["\u4F8D\u5F93\u9577", "admin"],
    court_historian: ["\u53F2\u5B98", "cult"],
    royal_envoy: ["\u738B\u5BA4\u4F7F\u7BC0", "dipl"],
    spymaster: ["\u5BC6\u5075\u982D", "intel"],
    court_physician: ["\u4F8D\u533B", "cult"],
    overlord: ["\u5B97\u4E3B\u738B", "ruler"],
    duke: ["\u5927\u8AF8\u4FAF", "admin"],
    constable: ["\u8ECD\u52D9\u9577\u5B98", "mil"],
    bishop: ["\u53F8\u6559", "faith"],
    emperor: ["\u7687\u5E1D", "ruler"],
    governor: ["\u7DCF\u7763", "admin"],
    censor: ["\u76E3\u5BDF\u5B98", "law"],
    grand_secretary: ["\u5927\u66F8\u8A18\u5B98\u9577", "admin"],
    legion_commander: ["\u8ECD\u56E3\u53F8\u4EE4\u5B98", "mil"],
    consul: ["\u57F7\u653F\u5B98", "ruler"],
    senate: ["\u5143\u8001\u9662\u8B70\u9577", "admin"],
    tribune: ["\u8B77\u6C11\u5B98", "law"],
    magistrate: ["\u53F8\u6CD5\u5B98", "law"],
    general: ["\u5C06\u8ECD", "mil"],
    trade_master: ["\u4EA4\u6613\u9577\u5B98", "econ"],
    convener: ["\u6C11\u4F1A\u8B70\u9577", "ruler"],
    strategos: ["\u5C06\u8ECD\u8077", "mil"],
    archon: ["\u884C\u653F\u5B98", "admin"],
    president: ["\u5927\u7D71\u9818", "ruler"],
    prime_minister: ["\u7DCF\u7406\u5927\u81E3", "ruler"],
    minister_finance: ["\u8CA1\u52D9\u5927\u81E3", "econ"],
    minister_defense: ["\u56FD\u9632\u5927\u81E3", "mil"],
    minister_interior: ["\u5185\u52D9\u5927\u81E3", "admin"],
    minister_foreign: ["\u5916\u52D9\u5927\u81E3", "dipl"],
    speaker: ["\u8B70\u9577", "admin"],
    chief_justice: ["\u6700\u9AD8\u88C1\u5224\u6240\u9577\u5B98", "law"],
    intel_director: ["\u60C5\u5831\u6A5F\u95A2\u9577\u5B98", "intel"],
    minister_culture: ["\u6587\u5316\u5927\u81E3", "cult"],
    figurehead: ["\u8C61\u5FB4\u306E\u541B\u4E3B", "ruler"],
    party_secretary: ["\u515A\u66F8\u8A18\u9577", "ruler"],
    politburo: ["\u653F\u6CBB\u5C40\u54E1", "admin"],
    commissar: ["\u4EBA\u6C11\u59D4\u54E1", "mil"],
    planner: ["\u8A08\u753B\u7D4C\u6E08\u5B98", "econ"],
    prosecutor: ["\u691C\u5BDF\u7DCF\u9577", "law"],
    propaganda: ["\u5BA3\u4F1D\u90E8\u9577", "cult"],
    junta_chair: ["\u8ECD\u4E8B\u8A55\u8B70\u4F1A\u8B70\u9577", "ruler"],
    security_chief: ["\u6CBB\u5B89\u9577\u5B98", "intel"],
    admiral: ["\u63D0\u7763", "mil"],
    federal_chair: ["\u9023\u90A6\u8B70\u9577", "ruler"],
    federal_envoy: ["\u9023\u90A6\u4F7F\u7BC0", "dipl"],
    federal_court: ["\u9023\u90A6\u88C1\u5224\u5B98", "law"]
  });
  var OFFICE_DOMAIN_JA = Object.freeze({ ruler: "\u5143\u9996", admin: "\u884C\u653F", mil: "\u8ECD\u4E8B", econ: "\u7D4C\u6E08", faith: "\u4FE1\u4EF0", law: "\u53F8\u6CD5", cult: "\u6587\u5316", dipl: "\u5916\u4EA4", intel: "\u60C5\u5831" });
  var REGIMES = Object.freeze({
    tribal: { ja: "\u90E8\u65CF\u5236", core: "tribal", needs: [], ruler: "chief", offices: ["chief", "elder_council", "shaman", "war_leader", "hunt_master"], heredity: false, blurb: "\u6C0F\u65CF\u306E\u9577\u8001\u3068\u6226\u58EB\u304C\u5408\u8B70\u3059\u308B\u3002" },
    chiefdom: { ja: "\u9996\u9577\u5236", core: "chiefdom", needs: ["cap:polity:chiefdom"], ruler: "chieftain", offices: ["chieftain", "elder_council", "steward", "war_leader", "shaman", "storyteller", "tribute_collector"], heredity: true, blurb: "\u9996\u9577\u304C\u8CA2\u7D0D\u3092\u96C6\u3081\u3001\u4E00\u65CF\u3067\u5730\u4F4D\u3092\u7D99\u3050\u3002" },
    theocracy: { ja: "\u795E\u6A29\u5236", core: "theocracy", needs: ["cap:polity:chiefdom"], ruler: "high_priest", offices: ["high_priest", "temple_steward", "oracle", "inquisitor", "temple_guard", "storyteller", "tribute_collector"], heredity: false, blurb: "\u795E\u306E\u540D\u306E\u3082\u3068\u306B\u796D\u53F8\u304C\u56FD\u3092\u6CBB\u3081\u308B\u3002" },
    despotism: { ja: "\u5C02\u5236\u541B\u4E3B\u5236", core: "kingdom", needs: ["cap:polity:kingdom"], ruler: "despot", offices: ["despot", "vizier", "chancellor", "marshal", "treasurer", "chamberlain", "spymaster", "court_historian"], heredity: true, blurb: "\u541B\u4E3B\u306E\u610F\u5FD7\u304C\u305D\u306E\u307E\u307E\u6CD5\u3068\u306A\u308B\u3002" },
    kingdom: { ja: "\u738B\u653F", core: "kingdom", needs: ["cap:polity:kingdom"], ruler: "king", offices: ["king", "vizier", "chancellor", "marshal", "treasurer", "chamberlain", "royal_envoy", "court_historian", "court_physician"], heredity: true, blurb: "\u56FD\u738B\u3068\u5BB0\u76F8\u304C\u5B98\u50DA\u3092\u7387\u3044\u308B\u3002" },
    feudal: { ja: "\u5C01\u5EFA\u5236", core: "kingdom", needs: ["cap:polity:kingdom", "tech:fortification"], ruler: "overlord", offices: ["overlord", "duke", "constable", "bishop", "chancellor", "treasurer", "royal_envoy"], heredity: true, blurb: "\u8AF8\u4FAF\u304C\u571F\u5730\u3068\u8ECD\u5F79\u3067\u7D50\u3070\u308C\u308B\u3002" },
    empire: { ja: "\u5E1D\u653F", core: "empire", needs: ["cap:polity:empire"], ruler: "emperor", offices: ["emperor", "grand_secretary", "governor", "censor", "legion_commander", "treasurer", "royal_envoy", "spymaster", "court_historian"], heredity: true, blurb: "\u7687\u5E1D\u306E\u3082\u3068\u3001\u7DCF\u7763\u304C\u8AF8\u5730\u57DF\u3092\u6CBB\u3081\u308B\u3002" },
    oligarchic_republic: { ja: "\u8CB4\u65CF\u5171\u548C\u5236", core: "republic", needs: ["cap:polity:republic"], ruler: "consul", offices: ["consul", "senate", "tribune", "magistrate", "general", "trade_master", "treasurer"], heredity: false, blurb: "\u6709\u529B\u306A\u5BB6\u9580\u304C\u5143\u8001\u9662\u3067\u56FD\u3092\u52D5\u304B\u3059\u3002" },
    direct_democracy: { ja: "\u76F4\u63A5\u6C11\u4E3B\u5236", core: "republic", needs: ["cap:polity:republic", "tech:alphabet"], ruler: "convener", offices: ["convener", "strategos", "archon", "magistrate", "trade_master", "royal_envoy"], heredity: false, blurb: "\u5E02\u6C11\u304C\u6C11\u4F1A\u3067\u76F4\u63A5\u306B\u6C7A\u3081\u308B\u3002" },
    constitutional_monarchy: { ja: "\u7ACB\u61B2\u541B\u4E3B\u5236", core: "kingdom", needs: ["cap:polity:kingdom", "tech:parliament"], ruler: "figurehead", offices: ["figurehead", "prime_minister", "minister_finance", "minister_defense", "minister_interior", "minister_foreign", "speaker", "chief_justice"], heredity: true, blurb: "\u541B\u4E3B\u306F\u8C61\u5FB4\u3068\u306A\u308A\u3001\u8B70\u4F1A\u3068\u5185\u95A3\u304C\u653F\u6CBB\u3092\u884C\u3046\u3002" },
    parliamentary: { ja: "\u8B70\u9662\u5185\u95A3\u5236", core: "republic", needs: ["tech:parliament"], ruler: "prime_minister", offices: ["prime_minister", "minister_finance", "minister_defense", "minister_interior", "minister_foreign", "speaker", "chief_justice", "minister_culture"], heredity: false, blurb: "\u8B70\u4F1A\u306E\u591A\u6570\u6D3E\u304C\u5185\u95A3\u3092\u7D44\u3080\u3002" },
    presidential: { ja: "\u5927\u7D71\u9818\u5236", core: "republic", needs: ["tech:constitutionalism"], ruler: "president", offices: ["president", "minister_finance", "minister_defense", "minister_interior", "minister_foreign", "speaker", "chief_justice", "intel_director"], heredity: false, blurb: "\u56FD\u6C11\u304C\u9078\u3093\u3060\u5927\u7D71\u9818\u304C\u884C\u653F\u3092\u7387\u3044\u308B\u3002" },
    socialist: { ja: "\u793E\u4F1A\u4E3B\u7FA9\u5171\u548C\u5236", core: "republic", needs: ["tech:industry", "tech:newspapers"], ruler: "party_secretary", offices: ["party_secretary", "politburo", "commissar", "planner", "prosecutor", "propaganda", "security_chief"], heredity: false, blurb: "\u4E00\u3064\u306E\u515A\u304C\u8A08\u753B\u7D4C\u6E08\u3068\u56FD\u5BB6\u3092\u5C0E\u304F\u3002" },
    junta: { ja: "\u8ECD\u4E8B\u653F\u6A29", core: "republic", needs: ["tech:standing_army"], ruler: "junta_chair", offices: ["junta_chair", "general", "admiral", "security_chief", "minister_finance", "minister_interior"], heredity: false, blurb: "\u8ECD\u306E\u8A55\u8B70\u4F1A\u304C\u975E\u5E38\u306E\u6A29\u9650\u3067\u7D71\u6CBB\u3059\u308B\u3002" },
    confederation: { ja: "\u9023\u90A6\u5236", core: "republic", needs: ["cap:polity:republic", "tech:diplomacy"], ruler: "federal_chair", offices: ["federal_chair", "federal_envoy", "federal_court", "minister_finance", "minister_defense", "speaker"], heredity: false, blurb: "\u81EA\u6CBB\u3059\u308B\u8AF8\u90A6\u304C\u5408\u8B70\u3067\u7D50\u3073\u3064\u304F\u3002" }
  });
  var REGIME_IDS = Object.freeze(Object.keys(REGIMES));
  var DEFAULT_REGIME = Object.freeze({ tribal: "tribal", chiefdom: "chiefdom", theocracy: "theocracy", kingdom: "kingdom", empire: "empire", republic: "oligarchic_republic" });
  var regimeOf = (st2) => st2.regime && REGIMES[st2.regime] && REGIMES[st2.regime].core === st2.polity ? st2.regime : DEFAULT_REGIME[st2.polity] ?? "tribal";
  var regimeJa = (st2) => REGIMES[regimeOf(st2)].ja;
  var officeJa = (id) => OFFICES[id]?.[0] ?? id;
  function regimeGate(civ6, group, id) {
    const r = REGIMES[id];
    if (!r) return "\u672A\u77E5\u306E\u653F\u4F53";
    const caps = groupCaps(civ6, group);
    for (const n2 of r.needs) {
      if (n2.startsWith("cap:")) {
        if (!caps.has(n2.slice(4))) return `\u6280\u8853\u306E\u89E3\u7981\u300C${n2.slice(4)}\u300D\u304C\u5FC5\u8981`;
      } else if (n2.startsWith("tech:")) {
        if (group.tech.known[n2.slice(5)] == null) return `\u6280\u8853\u300C${n2.slice(5)}\u300D\u3092\u77E5\u3089\u306A\u3044`;
      }
    }
    void POLITY_CAP;
    return null;
  }
  var MIN_OFFICES = 3;
  var MAX_OFFICES = 12;
  function checkOffices(regime, ids) {
    const r = REGIMES[regime];
    if (!r) return "\u672A\u77E5\u306E\u653F\u4F53";
    if (!Array.isArray(ids)) return "\u5F79\u8077\u306E\u4E00\u89A7\u304C\u5FC5\u8981\u3067\u3059";
    const set = new Set(ids);
    if (set.size !== ids.length) return "\u540C\u3058\u5F79\u8077\u304C\u91CD\u8907\u3057\u3066\u3044\u307E\u3059";
    for (const i of ids) if (!r.offices.includes(i)) return `\u300C${officeJa(i)}\u300D\u306F\u3053\u306E\u653F\u4F53\u3067\u306F\u7F6E\u3051\u307E\u305B\u3093`;
    if (!set.has(r.ruler)) return `\u5143\u9996\u306E\u5F79\u8077\u300C${officeJa(r.ruler)}\u300D\u306F\u5916\u305B\u307E\u305B\u3093`;
    if (ids.length < MIN_OFFICES) return `\u5F79\u8077\u306F ${MIN_OFFICES} \u4EE5\u4E0A`;
    if (ids.length > MAX_OFFICES) return `\u5F79\u8077\u306F ${MAX_OFFICES} \u307E\u3067`;
    return null;
  }
  var defaultOffices = (regime) => {
    const r = REGIMES[regime];
    return r.offices.slice(0, Math.min(r.offices.length, 5)).includes(r.ruler) ? r.offices.slice(0, Math.min(r.offices.length, 5)) : [r.ruler, ...r.offices.filter((x) => x !== r.ruler).slice(0, 4)];
  };
  function officeFx(st2) {
    const o = st2.offices;
    if (!o?.length) return { stability: 0, domains: 0 };
    const d = /* @__PURE__ */ new Set();
    for (const x of o) {
      const dom = OFFICES[x.id]?.[1];
      if (dom && dom !== "ruler") d.add(dom);
    }
    return { stability: Math.min(0.04, d.size * 7e-3), domains: d.size };
  }
  var OFFICE_STABILITY = (st2) => officeFx(st2).stability;

  // js/core/civ/states.js
  var gatedPolity = (civ6, cap, p) => !POLITY_CAP[p] || groupCaps(civ6, cap).has(POLITY_CAP[p]) ? p : "tribal";
  var OFFICE_RULER = (st2) => REGIMES[regimeOf(st2)].ruler;
  var POLITY = Object.freeze({ tribal: "\u90E8\u65CF", chiefdom: "\u9996\u9577\u5236", kingdom: "\u738B\u56FD", empire: "\u5E1D\u56FD", republic: "\u5171\u548C\u5236", theocracy: "\u795E\u6A29\u5236" });
  var VIA = Object.freeze({ city_state: { ja: "\u90FD\u5E02\u56FD\u5BB6", suffix: "\u516C\u56FD" }, agri_union: { ja: "\u8FB2\u8015\u96C6\u843D\u306E\u7D71\u5408", suffix: "\u9023\u90A6" }, nomad_confederation: { ja: "\u904A\u7267\u9023\u5408", suffix: "\u6C57\u56FD" }, religious_polity: { ja: "\u5B97\u6559\u5171\u540C\u4F53", suffix: "\u6559\u56FD" }, defense_league: { ja: "\u9632\u885B\u9023\u5408", suffix: "\u9023\u76DF" }, secession: { ja: "\u5206\u96E2", suffix: "\u516C\u56FD" } });
  var KM = 6371;
  var CLUSTER_BUDGET = 8;
  var CHECK_EVERY = 12;
  var distKm = (w, a, b) => {
    const c = w.cell;
    const x = Math.sin(c.lat[a]) * Math.sin(c.lat[b]) + Math.cos(c.lat[a]) * Math.cos(c.lat[b]) * Math.cos(c.lon[a] - c.lon[b]);
    return Math.acos(Math.max(-1, Math.min(1, x))) * KM;
  };
  function formState(ctx, { via, groupIds, predecessor = null, player = false, cause = null, threat = null, name = null, polity = null, capitalGroupId = null }) {
    const { world, civ: civ6, ids, rng } = ctx, gs = groupIds.map((i) => civ6.groups[i]).filter(Boolean);
    if (!gs.length) return null;
    const cap = capitalGroupId && gs.find((g) => g.id === capitalGroupId) || gs.reduce((a, b) => b.pop > a.pop ? b : a), id = ids.next("state"), h2 = hashSeed(id);
    const pol = gatedPolity(civ6, cap, polity ?? (via === "religious_polity" ? "theocracy" : via === "city_state" ? "chiefdom" : "tribal")), np = name ? null : ctx.nameGen?.stateParts?.(civ6, cap, via, rng, pol) ?? null;
    const st2 = {
      id,
      name: name ?? np?.name ?? ctx.nameGen?.state(civ6, cap, via, rng) ?? makeNameJa(rng) + VIA[via].suffix,
      nameBase: np?.base ?? null,
      via,
      formedAt: civ6.monthIndex,
      capitalGroupId: cap.id,
      nameLang: name ? null : ctx.nameLangOf?.(cap) ?? null,
      /* 国名の由来の言語（建国時。首都はのちに変わるので、現在の首都の言語とは別に残す） */
      alive: true,
      player,
      dissolvedAt: null,
      predecessor,
      polity: pol,
      stability: 0.7,
      pop: 0,
      settlements: 0,
      treasury: 50,
      army: 0,
      policy: { tax: 0.1, mobilization: 0, assimilation: 0, tolerance: 0.5, autonomy: 0 },
      techAdopted: {},
      strategy: null,
      campaign: null,
      defense: 0,
      boostUntil: -1,
      sanctions: {},
      relations: {},
      warIds: [],
      leader: { name: ctx.nameGen?.person(civ6, cap, rng) ?? makeNameJa(rng), bornAt: civ6.monthIndex - Math.round((300 + Math.floor(rng() * 200)) * lifeScale(civ6, { capitalGroupId: cap.id })), heir: false },
      lastCrisis: -999,
      personality: { security: 0.6 + h2 % 100 / 125, prosperity: 0.6 + (h2 >> 7) % 100 / 125, expansion: 0.6 + (h2 >> 14) % 100 / 125, stability: 0.6 + (h2 >> 21) % 100 / 125, culture: 0.6 + (h2 >> 4) % 100 / 125, tech: 0.6 + (h2 >> 11) % 100 / 125, prestige: 0.6 + (h2 >> 18) % 100 / 125 }
    };
    st2.leader.name = leaderName(st2, st2.leader.name, leaderRng(civ6, st2, "found"));
    civ6.states[id] = st2;
    for (const g of gs) g.stateId = id;
    if (gs.some((g) => g.player)) st2.player = true;
    const causes = [];
    if (cause) causes.push({ targetId: cause, relation: "caused_by", basis: "plausible" });
    if (threat) causes.push({ targetId: threat, relation: "reaction_to", basis: "strong" });
    if (predecessor) causes.push({ targetId: predecessor, relation: "succeeded_by", basis: "direct" });
    const ev = makeEvent(civ6, ids, { kind: "state_formed", title: `${st2.name}\u304C\u6210\u7ACB\uFF08${VIA[via].ja}\uFF09`, participants: [{ entityId: id, role: "state" }, ...gs.map((g) => ({ entityId: g.id, role: g.id === cap.id ? "capital_group" : "member" }))], location: { cell: cap.cell }, causes, facts: { stateId: id, name: st2.name, polity: st2.polity, capitalCell: cap.cell, cells: gs.slice(0, 24).map((g) => g.cell), nGroups: gs.length }, provenance: player ? "player" : "simulation" });
    st2.formedEvent = ev.eventId;
    return st2;
  }
  function evaluateFormation(ctx, seed) {
    const { world, civ: civ6 } = ctx, { home } = spatialOf(ctx), dist = reachable(world, seed.cell, CLUSTER_BUDGET, 0), free2 = [seed];
    for (const [c, d] of dist) {
      const gid = home.get(c);
      if (gid && gid !== seed.id) {
        const o = civ6.groups[gid];
        if (o && !o.stateId && !o.player) free2.push(o);
      }
    }
    const st2 = (g) => g.settlementId ? civ6.settlements[g.settlementId] : null, sum = (a) => a.reduce((s, g) => s + g.pop, 0);
    const s0 = st2(seed);
    if (s0 && (s0.stage === "town" || s0.stage === "city") && (world.cell.coastDist[seed.cell] <= 2 || world.cell.river[seed.cell])) return { via: "city_state", groupIds: free2.filter((g) => dist.get(g.cell) <= 5).map((g) => g.id) };
    const ag = free2.filter((g) => g.subsistence === "agriculture" && g.settlementId);
    if (ag.length >= 3 && sum(ag) >= 3e3) return { via: "agri_union", groupIds: ag.map((g) => g.id) };
    const byRel = /* @__PURE__ */ new Map();
    for (const g of free2) if (g.settlementId) {
      const r = dominant(g).religionId;
      if (r) (byRel.get(r) ?? byRel.set(r, []).get(r)).push(g);
    }
    for (const [r, a] of byRel) if (a.length >= 2 && sum(a) >= 1500 && a.some((g) => g.id === seed.id)) return { via: "religious_polity", groupIds: a.map((g) => g.id) };
    const no = free2.filter((g) => g.subsistence === "pastoral");
    if (no.length >= 3 && sum(no) >= 1500) return { via: "nomad_confederation", groupIds: no.map((g) => g.id) };
    const cult = new Set(free2.filter((g) => g.pop >= 300).map((g) => dominant(g).cultureId));
    if (cult.size >= 2 && free2.length >= 2) {
      for (const s of Object.values(civ6.states)) {
        if (!s.alive || s.pop < sum(free2) * 3) continue;
        const cg = civ6.groups[s.capitalGroupId];
        if (cg && dist.has(cg.cell)) return { via: "defense_league", groupIds: free2.filter((g) => g.pop >= 300).map((g) => g.id), threat: s.formedEvent ?? s.id };
      }
    }
    return null;
  }
  var dissolve = (ctx, st2, why2) => {
    const { civ: civ6, ids } = ctx;
    st2.alive = false;
    st2.dissolvedAt = civ6.monthIndex;
    for (const gid in civ6.groups) if (civ6.groups[gid].stateId === st2.id) civ6.groups[gid].stateId = null;
    for (const wid of [...st2.warIds]) ctx.endWarHook?.(ctx, civ6.wars[wid], "state_dissolved");
    makeEvent(civ6, ids, { kind: "state_dissolved", title: `${st2.name}\u304C${why2}`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: civ6.groups[st2.capitalGroupId]?.cell ?? null }, facts: { stateId: st2.id }, causes: [...st2.lastCrisisEvent ? [{ targetId: st2.lastCrisisEvent, relation: "caused_by", basis: "plausible" }] : [], ...asCauses(recentEventsFor(civ6, [st2.id], ["war_ended"], 24, 1), "contributed_to", "plausible")] });
  };
  function stepStates(ctx) {
    const { world, civ: civ6, ids, rng } = ctx, mi = civ6.monthIndex;
    if (mi % 3 !== 0) return;
    const groupsByState = byState(ctx);
    for (const id in civ6.states) {
      const st2 = civ6.states[id];
      if (!st2.alive) continue;
      const gs = groupsByState.get(id);
      if (!gs?.length) {
        dissolve(ctx, st2, "\u6D88\u6EC5\u3057\u305F");
        continue;
      }
      let pop = 0, tens = 0, settle2 = 0, big = gs[0], mar = 0;
      for (const g of gs) {
        pop += g.pop;
        mar += g.pop * speciesOf(g.speciesId, civ6).martial;
        if (g.settlementId) settle2++;
        if (g.pop > big.pop) big = g;
        let t = 0;
        for (const c of g.cohorts) if (c.tension > t) t = c.tension;
        tens += t * g.pop;
      }
      st2.pop = pop;
      st2.martial = pop ? Math.round(mar / pop * 1e3) / 1e3 : 1;
      st2.settlements = settle2;
      if (!civ6.groups[st2.capitalGroupId] || civ6.groups[st2.capitalGroupId].stateId !== id) st2.capitalGroupId = big.id;
      const cap = civ6.groups[st2.capitalGroupId];
      let far = 0, mx = 0;
      const dists = [];
      for (const g of gs) {
        const d = distKm(world, cap.cell, g.cell);
        dists.push([d, g]);
        if (d > mx) mx = d;
      }
      const adm = stateCan(civ6, st2, "polity:empire") ? 0.6 : stateCan(civ6, st2, "polity:kingdom") ? 0.35 : 0;
      const target = 0.8 - 0.5 * (tens / pop) - Math.min(1, mx / 15e3) * 0.3 * (1 - adm) - Math.max(0, st2.policy.tax - 0.15) * 0.6 - (st2.warIds.length ? 0.05 : 0) - st2.policy.mobilization * 0.3 + (st2.leader.heir ? 0.03 : 0) + (st2.magic?.kind === "temple" ? 0.04 * st2.magic.power : 0) + { chiefdom: 0.02, kingdom: 0.05, empire: 0.08, republic: 0.06, theocracy: 0.05, tribal: 0 }[st2.polity] + (st2.offices?.length ? OFFICE_STABILITY(st2) : 0);
      const before = st2.stability;
      st2.stability = Math.max(0, Math.min(1, st2.stability + (target - st2.stability) * 0.3));
      st2.treasury += pop * st2.policy.tax * 12e-4 * taxMult(st2) * (ctx.taxFactor?.(st2) ?? 1) * (1 - Math.min(0.5, Object.keys(st2.sanctions).filter((k) => st2.sanctions[k] > mi).length * 0.1));
      st2.army = pop * (5e-3 + 0.12 * st2.policy.mobilization) * (0.5 + st2.stability) * (1 - (st2.warLoss ?? 0));
      for (const k in st2.sanctions) if (st2.sanctions[k] <= mi) delete st2.sanctions[k];
      const ls = lifeScale(civ6, st2), age = mi - st2.leader.bornAt;
      if (age > 480 * ls && rng() < Math.min(0.2, (age - 480 * ls) / (4e3 * ls))) {
        const heir = st2.leader.heir;
        st2.interpDirty = true;
        st2.leader = { name: leaderName(st2, ctx.nameGen?.person(civ6, civ6.groups[st2.capitalGroupId], rng) ?? makeNameJa(rng), leaderRng(civ6, st2, "succ")), bornAt: mi - Math.round((300 + Math.floor(rng() * 100)) * ls), heir: false, ...st2.leader.title ? { title: st2.leader.title } : {} };
        if (st2.offices) {
          const ro = st2.offices.find((o) => o.id === OFFICE_RULER(st2));
          if (ro) ro.holder = { name: st2.leader.name, look: null };
        }
        st2.stability = Math.max(0, st2.stability - (heir ? 0.03 : 0.12));
        makeEvent(civ6, ids, { kind: "leader_succession", title: `${st2.name}\u306E\u6307\u5C0E\u8005\u304C\u4EE3\u308F\u3063\u305F${heir ? "\uFF08\u7D99\u627F\u8005\u304C\u6C7A\u307E\u3063\u3066\u3044\u305F\uFF09" : "\uFF08\u7D99\u627F\u306E\u6DF7\u4E71\uFF09"}`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: cap.cell } });
      }
      if (st2.stability < 0.08 && before < 0.2) {
        dissolve(ctx, st2, "\u5D29\u58CA\u3057\u305F");
        continue;
      }
      if (st2.stability < 0.3 && gs.length >= 3 && mi - st2.lastCrisis > 60) {
        dists.sort((a, b) => b[0] - a[0]);
        const part = dists.slice(0, Math.max(1, Math.floor(gs.length / 2))).map((x) => x[1]).filter((g) => !g.player || st2.player === false);
        if (part.length && part.length < gs.length) {
          st2.lastCrisis = mi;
          const ev = makeEvent(civ6, ids, { kind: "instability", title: `${st2.name}\u3067\u4E0D\u6E80\u304C\u9AD8\u307E\u308B`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: cap.cell }, causes: [...asCauses(recentEventsFor(civ6, [st2.id, ...gs.map((g) => g.id)], ["famine", "disaster_struck", "demand_raised"], 48, 2), "contributed_to", "plausible"), ...asCauses(recentEventsFor(civ6, [st2.id], ["war_declared", "war_ended", "leader_succession"], 36, 2), "contributed_to", "strong")] });
          st2.lastCrisisEvent = ev.eventId;
          const ns = formState(ctx, { via: "secession", groupIds: part.map((g) => g.id), predecessor: st2.id, cause: ev.eventId });
          if (ns) {
            ns.relations[st2.id] = -40;
            st2.relations[ns.id] = -40;
            st2.stability = Math.min(1, st2.stability + 0.1);
          }
        }
      }
    }
    for (const id in civ6.groups) {
      const g = civ6.groups[id];
      if (g.stateId) continue;
      if (!(g.nextStateCheck <= mi) && g.nextStateCheck !== void 0) continue;
      g.nextStateCheck = mi + CHECK_EVERY + hashSeed(id) % 6;
      if (g.pop < 300 || g.subsistence === "forage") continue;
      if (!g.player) {
        const ns = [...neighborGroups(ctx, g)].map((o) => civ6.groups[o]).filter((o) => o?.stateId && civ6.states[o.stateId].alive), best = ns.reduce((a, o) => !a || civ6.states[o.stateId].pop > civ6.states[a.stateId].pop ? o : a, null);
        if (best && civ6.states[best.stateId].pop >= g.pop * 2 && rng() < 0.4) {
          g.stateId = best.stateId;
          makeEvent(civ6, ids, { kind: "group_joined_state", title: `${civ6.states[best.stateId].name}\u306B\u52A0\u308F\u3063\u305F`, participants: [{ entityId: g.id, role: "group" }, { entityId: best.stateId, role: "state" }], location: { cell: g.cell }, facts: { stateId: best.stateId, cell: g.cell } });
          continue;
        }
      }
      const f2 = evaluateFormation(ctx, g);
      if (!f2) continue;
      if (g.player) addProposal(civ6, ids, g, "form_state", f2);
      else formState(ctx, f2);
    }
  }

  // js/core/wcde/domains/language.js
  var KANA = Object.freeze({ "": "\u30A2\u30A4\u30A6\u30A8\u30AA", k: "\u30AB\u30AD\u30AF\u30B1\u30B3", g: "\u30AC\u30AE\u30B0\u30B2\u30B4", s: "\u30B5\u30B7\u30B9\u30BB\u30BD", z: "\u30B6\u30B8\u30BA\u30BC\u30BE", t: "\u30BF\u30C1\u30C4\u30C6\u30C8", d: "\u30C0\u30C2\u30C5\u30C7\u30C9", n: "\u30CA\u30CB\u30CC\u30CD\u30CE", h: "\u30CF\u30D2\u30D5\u30D8\u30DB", b: "\u30D0\u30D3\u30D6\u30D9\u30DC", p: "\u30D1\u30D4\u30D7\u30DA\u30DD", m: "\u30DE\u30DF\u30E0\u30E1\u30E2", r: "\u30E9\u30EA\u30EB\u30EC\u30ED", y: "\u30E4\u30FB\u30E6\u30FB\u30E8", w: "\u30EF\xB7\xB7\xB7\xB7" });
  var VOWELS = ["a", "i", "u", "e", "o"];
  var CONS = ["k", "g", "s", "z", "t", "d", "n", "h", "b", "p", "m", "r", "w", "y"];
  var ok = (c, v) => {
    const k = KANA[c];
    if (!k) return false;
    const ch = k[VOWELS.indexOf(v)];
    return !!ch && ch !== "\u30FB" && ch !== "\xB7";
  };
  var kanaOf = (c, v) => KANA[c][VOWELS.indexOf(v)];
  var pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  var shuffle = (rng, a) => {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };
  function syllablesOf(phon) {
    const out = [];
    for (const v of phon.v) out.push({ c: "", v, kana: kanaOf("", v) });
    for (const c of phon.c) for (const v of phon.v) if (ok(c, v)) out.push({ c, v, kana: kanaOf(c, v) });
    return out;
  }
  var rootPhon = (id) => {
    const r = rngOf(hashSeed(id, "phon"));
    const c = shuffle(r, CONS).slice(0, 6 + Math.floor(r() * 5)), v = shuffle(r, VOWELS).slice(0, 3 + Math.floor(r() * 3));
    return { c, v, coda: r() < 0.5, geminate: r() < 0.3, endV: shuffle(r, v).slice(0, 1 + Math.floor(r() * 2)), vowelInitial: Math.round(r() * 25) / 100, changes: [] };
  };
  var childPhon = (id, parent) => {
    const r = rngOf(hashSeed(id, "change")), p = { ...parent, c: [...parent.c], v: [...parent.v], endV: [...parent.endV], changes: [...parent.changes] }, n2 = 1 + Math.floor(r() * 2);
    for (let i = 0; i < n2; i++) {
      const k = Math.floor(r() * 4);
      if (k === 0 && p.c.length > 4) {
        const from = pick(r, p.c), pool = CONS.filter((x) => !p.c.includes(x));
        if (pool.length) {
          const to = pick(r, pool);
          p.c[p.c.indexOf(from)] = to;
          p.changes.push({ kind: "shift", from, to });
        }
      } else if (k === 1 && p.v.length > 3) {
        const from = pick(r, p.v), to = pick(r, p.v.filter((x) => x !== from));
        p.v = p.v.filter((x) => x !== from);
        p.endV = p.endV.map((x) => x === from ? to : x);
        p.changes.push({ kind: "merge", from, to });
      } else if (k === 2) {
        p.coda = !p.coda;
        p.changes.push({ kind: "coda", to: p.coda });
      } else {
        const pool = VOWELS.filter((x) => !p.v.includes(x));
        if (pool.length) {
          const to = pick(r, pool);
          p.v.push(to);
          p.changes.push({ kind: "vowel_gain", to });
        }
      }
    }
    p.endV = [...new Set(p.endV.filter((x) => p.v.includes(x)))];
    if (!p.endV.length) p.endV = [p.v[0]];
    return p;
  };
  function ensureProfile(civ6, langId) {
    const L = civ6.languages[langId];
    if (!L) return null;
    if (L.phon) return L.phon;
    const chain = [];
    let cur = L;
    while (cur && !cur.phon) {
      chain.push(cur);
      cur = cur.parent ? civ6.languages[cur.parent] : null;
    }
    let base = cur?.phon ?? null;
    for (const l of chain.reverse()) {
      l.phon = base ? childPhon(l.id, base) : rootPhon(l.id);
      base = l.phon;
      l.name = word(rngOf(hashSeed(l.id, "name")), l.phon, 3 + hashSeed(l.id) % 2, 0) + "\u8A9E";
    }
    return L.phon;
  }
  function word(rng, phon, n2, endBias = 0.6) {
    const syl = syllablesOf(phon), parts = [];
    let prev = null;
    for (let i = 0; i < n2; i++) {
      let s, tries = 0;
      do {
        s = i === 0 && rng() >= phon.vowelInitial ? pick(rng, syl.filter((x) => x.c)) : rng() < (i === 0 ? phon.vowelInitial : 0.06) ? pick(rng, syl.filter((x) => !x.c)) : pick(rng, syl);
      } while (prev && s.kana === prev.kana && ++tries < 6);
      parts.push(s);
      prev = s;
    }
    if (rng() < endBias) {
      const last = parts[parts.length - 1], v = pick(rng, phon.endV), c = last.c;
      if (ok(c, v)) parts[parts.length - 1] = { c, v, kana: kanaOf(c, v) };
    }
    let w = parts.map((p) => p.kana).join("");
    if (phon.coda && rng() < 0.25) w += "\u30F3";
    if (phon.geminate && n2 >= 3 && rng() < 0.2) w = w.slice(0, 1) + "\u30C3" + w.slice(1);
    return w;
  }
  function nameFor(civ6, rng, langId, kind = "person") {
    const phon = ensureProfile(civ6, langId);
    if (!phon) return null;
    const n2 = 3 + (rng() < (kind === "person" ? 0.4 : 0.45) ? 1 : 0) + (rng() < 0.08 ? 1 : 0);
    return word(rng, phon, n2);
  }
  var languageOfGroup = (g) => g?.cohorts?.length ? g.cohorts.reduce((b, c) => c.share > b.share ? c : b).languageId : null;
  var nameLangOf = (g) => languageOfGroup(g);
  function landSuffix(civ6, langId) {
    const L = civ6.languages[langId];
    if (!L) return "";
    const h2 = hashSeed(L.id, "landsfx");
    if (h2 % 100 < 60) {
      const phon = ensureProfile(civ6, L.id);
      return phon ? word(rngOf(h2), phon, 1 + (h2 >>> 8) % 2, 0.7) : "";
    }
    return L.parent && civ6.languages[L.parent] ? landSuffix(civ6, L.parent) : "";
  }
  var nameGen = {
    /** 国号と語根。語根は言語の音から（＋系統の語尾）、称号は政体から（王国・帝国・共和国…） */
    stateParts: (civ6, cap, via, rng, polity = "tribal") => {
      const l = languageOfGroup(cap);
      if (!l) return null;
      const nm = nameFor(civ6, rng, l, "state"), sfx = landSuffix(civ6, l), base = nm.length + sfx.length <= 8 ? nm + sfx : nm;
      return { base, name: composeStateName(base, polity, via) };
    },
    state: (civ6, cap, via, rng) => {
      const l = languageOfGroup(cap);
      return l ? nameFor(civ6, rng, l, "state") + VIA[via].suffix : null;
    },
    person: (civ6, g, rng) => {
      const l = languageOfGroup(g);
      return l ? nameFor(civ6, rng, l, "person") : null;
    }
  };
  function stepLanguage(ctx) {
    const { civ: civ6 } = ctx;
    if (!civ6.options.wcde) return;
    let nl = 0, nc = 0;
    for (const _ in civ6.languages) nl++;
    for (const _ in civ6.cultures) nc++;
    if (ctx._langSig === nl + ":" + nc) return;
    ctx._langSig = nl + ":" + nc;
    for (const id in civ6.languages) if (!civ6.languages[id].phon) ensureProfile(civ6, id);
    const byCulture = /* @__PURE__ */ new Map();
    for (const id in civ6.languages) {
      const l = civ6.languages[id];
      if (l.cultureId && !byCulture.has(l.cultureId)) byCulture.set(l.cultureId, l);
    }
    for (const id in civ6.cultures) {
      const c = civ6.cultures[id];
      if (c.nameFixed) continue;
      const lang = byCulture.get(id);
      if (!lang?.phon) continue;
      {
        const taken = new Set(Object.values(civ6.cultures).map((x) => x.name));
        let nm = "", k = 0;
        do {
          nm = word(rngOf(hashSeed(id, "cname", k)), lang.phon, 3 + hashSeed(id, k) % 2) + "\u4EBA";
        } while (taken.has(nm) && ++k < 12);
        c.name = nm;
        c.nameFixed = true;
      }
    }
  }
  function finalizeLanguages(civ6) {
    const prev = civ6.options.wcde;
    civ6.options.wcde = true;
    stepLanguage({ civ: civ6 });
    civ6.options.wcde = prev;
  }

  // js/core/wcde/domains/religion.js
  var domRel = (g) => g.cohorts.reduce((b, c) => c.share > b.share ? c : b);
  function defineReligions(ctx) {
    const { civ: civ6 } = ctx, need = Object.values(civ6.religions).filter((r) => r.deity == null);
    if (!need.length) return;
    const byRel = /* @__PURE__ */ new Map();
    for (const g of Object.values(civ6.groups)) {
      const c = domRel(g);
      if (c.religionId) {
        const a = byRel.get(c.religionId) ?? [];
        a.push(g);
        byRel.set(c.religionId, a);
      }
    }
    for (const r of need) {
      const gs = (byRel.get(r.id) ?? []).slice().sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)), top = gs[0];
      const lang = top ? languageOfGroup(top) : null, rr = { next: /* @__PURE__ */ ((s) => () => (s = s * 1664525 + 1013904223 >>> 0) / 4294967296)(hashSeed(r.id, "deity")) };
      r.deity = lang && civ6.languages[lang] ? nameFor(civ6, rr.next, lang, "person") : null;
      r.holyCell = top?.cell ?? null;
      r.founderId = null;
      if (r.deity) {
        const taken = new Set(Object.values(civ6.religions).filter((x) => x !== r).map((x) => x.name));
        let nm = `${r.deity}\u6559`, k = 0;
        while (taken.has(nm) && lang && k++ < 8) nm = `${nameFor(civ6, rr.next, lang, "person")}\u6559`;
        r.name = nm;
      }
    }
  }
  function stepReligion(ctx) {
    const { civ: civ6, ids, world } = ctx, mi = civ6.monthIndex;
    if (!civ6.options.wcde) return;
    defineReligions(ctx);
    if (mi % 3 !== 0) return;
    const byRel = /* @__PURE__ */ new Map();
    for (const g of Object.values(civ6.groups)) {
      const c = domRel(g);
      if (c.religionId) {
        const a = byRel.get(c.religionId) ?? [];
        a.push(g);
        byRel.set(c.religionId, a);
      }
    }
    for (const [rid, gs] of [...byRel].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
      const r = civ6.religions[rid];
      if (!r || gs.length < 4 || mi - r.bornAt < 600) continue;
      if (hashSeed(rid, mi) % 1e5 / 1e5 >= 8e-4 * Math.min(3, gs.length / 4)) continue;
      const hc = r.holyCell ?? gs[0].cell, d = (g) => Math.hypot(world.cell.lat[g.cell] - world.cell.lat[hc], world.cell.lon[g.cell] - world.cell.lon[hc]), far = gs.slice().sort((a, b) => d(b) - d(a) || (a.id < b.id ? -1 : 1)).slice(0, Math.ceil(gs.length / 3));
      const nid2 = createReligion(civ6, ids, ctx.rng, { parent: rid, kind: r.kind }), nr = civ6.religions[nid2];
      nr.holyCell = far[0].cell;
      nr.founderId = null;
      nr.deity = r.deity;
      const lang = languageOfGroup(far[0]);
      if (lang && civ6.languages[lang]) {
        nr.name = sectName(r.name, nameFor(civ6, ctx.rng, lang, "person"));
      }
      for (const g of far) for (const c of g.cohorts) if (c.religionId === rid) c.religionId = nid2;
      makeEvent(civ6, ids, { kind: "religion_schism", title: `${r.name}\u304B\u3089${nr.name}\u304C\u5206\u304B\u308C\u305F\uFF08\u4FE1\u8005\u306E\u96C6\u56E3 ${far.length}\uFF09`, participants: [{ entityId: rid, role: "parent_religion" }, { entityId: nid2, role: "new_religion" }, ...far.slice(0, 3).map((g) => ({ entityId: g.id, role: "converted_group" }))], location: { cell: far[0].cell }, effects: [{ targetId: nid2, property: "religion.parent", before: null, after: rid }], provenance: "simulation" });
    }
  }

  // js/core/civ/diplomacy.js
  var TREATY = Object.freeze({ nonaggression: { ja: "\u4E0D\u53EF\u4FB5\u6761\u7D04", months: 240 }, alliance: { ja: "\u540C\u76DF", months: 480 }, trade: { ja: "\u901A\u5546\u5354\u5B9A", months: 240 } });
  var adjustRel = (a, b, d) => {
    const c = (v) => Math.max(-100, Math.min(100, v));
    a.relations[b.id] = c((a.relations[b.id] ?? 0) + d);
    b.relations[a.id] = c((b.relations[a.id] ?? 0) + d);
  };
  var treatyBetween = (civ6, a, b, type) => civ6.activeTreatyIds.map((i) => civ6.treaties[i]).find((t) => t.active && (!type || t.type === type) && (t.a === a.id && t.b === b.id || t.a === b.id && t.b === a.id));
  var atWarWith = (civ6, a, b) => a.warIds.map((i) => civ6.wars[i]).some((w) => w.sides.a.includes(b.id) || w.sides.d.includes(b.id));
  var strength = (civ6, st2) => st2.army * milMult(st2) * (1 + (st2.defense + (st2.milDef ?? 0)) * 0.5);
  function neighborStates(ctx, st2) {
    const cache = ctx._nbr && ctx._nbrMonth === ctx.civ.monthIndex ? ctx._nbr : (ctx._nbr = /* @__PURE__ */ new Map(), ctx._nbrMonth = ctx.civ.monthIndex, ctx._nbr);
    if (cache.has(st2.id)) return cache.get(st2.id);
    const out = /* @__PURE__ */ new Set();
    for (const g of byState(ctx).get(st2.id) ?? []) for (const o of neighborGroups(ctx, g)) {
      const s = ctx.civ.groups[o]?.stateId;
      if (s && s !== st2.id && ctx.civ.states[s].alive) out.add(s);
    }
    const r = [...out].sort();
    cache.set(st2.id, r);
    return r;
  }
  function signTreaty(ctx, type, a, b, { decisionId = null, provenance = "simulation" } = {}) {
    const { civ: civ6, ids } = ctx, id = ids.next("treaty"), t = { id, type, a: a.id, b: b.id, signedAt: civ6.monthIndex, expiresAt: civ6.monthIndex + TREATY[type].months, active: true };
    civ6.treaties[id] = t;
    civ6.activeTreatyIds.push(id);
    adjustRel(a, b, type === "alliance" ? 25 : 15);
    makeEvent(civ6, ids, { kind: "treaty_signed", title: `${a.name}\u3068${b.name}\u304C${TREATY[type].ja}\u3092\u7D50\u3093\u3060`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }, { entityId: id, role: "treaty" }], location: null, facts: { type, a: a.id, b: b.id }, provenance });
    return t;
  }
  function endTreaty(ctx, t, why2, byId2 = null) {
    const { civ: civ6, ids } = ctx;
    t.active = false;
    t.endedAt = civ6.monthIndex;
    civ6.activeTreatyIds = civ6.activeTreatyIds.filter((i) => i !== t.id);
    makeEvent(civ6, ids, { kind: "treaty_ended", title: `${TREATY[t.type].ja}\u304C${why2}`, participants: [{ entityId: t.id, role: "treaty" }, { entityId: t.a, role: byId2 === t.a ? "breaker" : "party" }, { entityId: t.b, role: byId2 === t.b ? "breaker" : "party" }], location: null, effects: byId2 ? [{ targetId: t.id, property: "broken_by", before: null, after: byId2 }] : [] });
  }
  function revengeCauses(civ6, atk, def) {
    const out = [];
    for (const ev of recentEventsFor(civ6, [atk.id], ["war_ended"], 1200, 6)) {
      if (!ev.participants.some((p) => p.entityId === def.id)) continue;
      const w = civ6.wars[ev.participants.find((p) => p.role === "war")?.entityId];
      const lost = w && (w.sides.a.includes(atk.id) && w.outcome === "defender_victory" || w.sides.d.includes(atk.id) && w.outcome === "aggressor_victory");
      out.push({ targetId: ev.eventId, relation: "reaction_to", basis: lost ? "strong" : "plausible" });
      if (out.length >= 2) break;
    }
    return out;
  }
  function declareWar(ctx, atk, def, { reason = "conquest", decisionId = null, provenance = "simulation" } = {}) {
    const { civ: civ6, ids, rng } = ctx, id = ids.next("war"), w = { id, aggressor: atk.id, defender: def.id, sides: { a: [atk.id], d: [def.id] }, startedAt: civ6.monthIndex, status: "active", reason, score: 0, occupied: [], outcome: null, endedAt: null, casualties: 0 };
    civ6.wars[id] = w;
    civ6.activeWarIds.push(id);
    atk.warIds.push(id);
    def.warIds.push(id);
    adjustRel(atk, def, -40);
    const ev = makeEvent(civ6, ids, { kind: "war_declared", title: `${atk.name}\u304C${def.name}\u306B\u5BA3\u6226\u3057\u305F`, participants: [{ entityId: atk.id, role: "aggressor" }, { entityId: def.id, role: "defender" }, { entityId: id, role: "war" }], location: civ6.groups[def.capitalGroupId] ? { cell: civ6.groups[def.capitalGroupId].cell } : null, causes: revengeCauses(civ6, atk, def), facts: { warId: id, aggressor: atk.id, defender: def.id }, provenance });
    w.declaredEvent = ev.eventId;
    for (const [side, host, foe] of [["a", atk, def], ["d", def, atk]]) for (const t of civ6.activeTreatyIds.map((i) => civ6.treaties[i])) {
      if (t.type !== "alliance" || t.a !== host.id && t.b !== host.id) continue;
      const ally = civ6.states[t.a === host.id ? t.b : t.a];
      if (!ally?.alive || ally.id === foe.id || w.sides.a.includes(ally.id) || w.sides.d.includes(ally.id)) continue;
      if (rng() < 0.6) {
        w.sides[side].push(ally.id);
        ally.warIds.push(id);
        adjustRel(ally, foe, -25);
        makeEvent(civ6, ids, { kind: "ally_joined", title: `${ally.name}\u304C${host.name}\u5074\u3067\u53C2\u6226\u3057\u305F`, participants: [{ entityId: ally.id, role: "ally" }, { entityId: id, role: "war" }], location: null, causes: [{ targetId: ev.eventId, relation: "reaction_to", basis: "strong" }] });
      }
    }
    ctx.warOps?.init(ctx, w);
    return w;
  }
  function endWar(ctx, w, outcome, terms = null) {
    const { civ: civ6, ids } = ctx;
    if (w.status !== "active") return;
    w.status = "ended";
    w.outcome = outcome;
    w.endedAt = civ6.monthIndex;
    civ6.activeWarIds = civ6.activeWarIds.filter((i) => i !== w.id);
    const all = [...w.sides.a, ...w.sides.d].map((i) => civ6.states[i]);
    for (const s of all) s.warIds = s.warIds.filter((i) => i !== w.id);
    const atk = civ6.states[w.aggressor], def = civ6.states[w.defender];
    const lead = outcome === "aggressor_victory" || outcome === "negotiated" && w.score > 0;
    const gained = [], moved = [];
    const settled = ctx.warOps?.settle ? ctx.warOps.settle(ctx, w, outcome, terms) : null;
    if (settled) for (const x of settled) {
      gained.push(x.gid);
      moved.push(x);
    }
    else if (lead && atk?.alive) for (const gid of w.occupied) {
      const g = civ6.groups[gid];
      if (g && g.stateId === w.defender) {
        g.stateId = atk.id;
        gained.push(gid);
      }
    }
    for (const s of all) {
      s.lastWarEnd = civ6.monthIndex;
      s.stability = Math.max(0, s.stability - 0.04);
      if (s.campaign?.warId === w.id) s.campaign = null;
    }
    if (atk && def) adjustRel(atk, def, -10);
    makeEvent(civ6, ids, { kind: "war_ended", title: `${atk?.name ?? "?"}\u3068${def?.name ?? "?"}\u306E\u6226\u4E89\u304C\u7D42\u308F\u3063\u305F\uFF08${{ aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", stalemate: "\u6C7A\u7740\u3064\u304B\u305A", negotiated: terms?.kind === "cession" ? "\u8B1B\u548C\uFF08\u5360\u9818\u5730\u306E\u5272\u8B72\uFF09" : "\u8B1B\u548C", state_dissolved: "\u56FD\u5BB6\u306E\u6D88\u6EC5" }[outcome] ?? outcome}\uFF09`, participants: [{ entityId: w.id, role: "war" }, ...all.map((s) => ({ entityId: s.id, role: "belligerent" }))], location: null, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: gained.map((gid) => {
      const m = moved.find((x) => x.gid === gid);
      return { targetId: gid, property: "stateId", before: m?.from ?? w.defender, after: m?.to ?? atk.id };
    }), facts: { warId: w.id, outcome, terms: terms?.kind ?? null, stateId: gained.length ? moved[0]?.to ?? atk?.id ?? null : null, cells: gained.slice(0, 24).map((gid) => civ6.groups[gid]?.cell).filter(Number.isFinite) } });
    ctx.warOps?.finalize(ctx, w, outcome);
  }
  function stepWars(ctx) {
    const { world, civ: civ6, ids, rng } = ctx, mi = civ6.monthIndex;
    if (mi % 12 === 0) {
      for (const i of [...civ6.activeTreatyIds]) {
        const t = civ6.treaties[i];
        if (t.expiresAt <= mi || !civ6.states[t.a]?.alive || !civ6.states[t.b]?.alive) endTreaty(ctx, t, "\u671F\u9650\u3092\u8FCE\u3048\u305F");
      }
      for (const id in civ6.states) {
        const s = civ6.states[id];
        if (s.alive) for (const k in s.relations) {
          s.relations[k] = Math.round(s.relations[k] * 0.9 * 10) / 10;
          if (Math.abs(s.relations[k]) < 1) delete s.relations[k];
        }
      }
    }
    const groups = byState(ctx);
    ctx.warOps?.monthly(ctx);
    for (const wid of [...civ6.activeWarIds]) {
      const w = civ6.wars[wid], A2 = w.sides.a.map((i) => civ6.states[i]).filter((s) => s.alive), D2 = w.sides.d.map((i) => civ6.states[i]).filter((s) => s.alive);
      if (!civ6.states[w.aggressor].alive || !civ6.states[w.defender].alive || !A2.length || !D2.length) {
        endWar(ctx, w, "state_dissolved");
        continue;
      }
      if (ctx.warOps) {
        ctx.warOps.step(ctx, w);
        continue;
      }
      const sA = A2.reduce((s, x) => s + strength(civ6, x), 0), sD = D2.reduce((s, x) => s + strength(civ6, x), 0);
      w.score = Math.max(-100, Math.min(100, w.score + (sA - sD) / (sA + sD + 1) * 6 + (rng() - 0.5) * 3));
      const lossA = 25e-4 * (sD / (sA + sD + 1)), lossD = 25e-4 * (sA / (sA + sD + 1));
      let dead = 0;
      for (const [side, loss] of [[A2, lossA], [D2, lossD]]) for (const s of side) {
        const gs = groups.get(s.id);
        if (!gs?.length) continue;
        const g = gs[Math.floor(rng() * gs.length)], l = g.pop * loss * 4;
        g.pop -= l;
        dead += l;
      }
      w.casualties += dead;
      if (mi % 3 === 0 && rng() < 0.4) makeEvent(civ6, ids, { kind: "battle_fought", title: `${civ6.states[w.aggressor].name}\u3068${civ6.states[w.defender].name}\u306E\u6226\u95D8`, participants: [{ entityId: w.id, role: "war" }, { entityId: w.aggressor, role: "aggressor" }, { entityId: w.defender, role: "defender" }], location: { cell: civ6.groups[civ6.states[w.defender].capitalGroupId]?.cell ?? null }, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }], effects: [{ targetId: w.id, property: "score", before: null, after: Math.round(w.score) }] });
      if (w.score >= 35 && w.occupied.length < 3 && rng() < 0.08) {
        const cap = civ6.groups[civ6.states[w.aggressor].capitalGroupId];
        const cand3 = D2.flatMap((s) => groups.get(s.id) ?? []).filter((g) => !w.occupied.includes(g.id));
        if (cap && cand3.length) {
          cand3.sort((a, b) => distKm(world, cap.cell, a.cell) - distKm(world, cap.cell, b.cell));
          const g = cand3[0];
          w.occupied.push(g.id);
          makeEvent(civ6, ids, { kind: "territory_occupied", title: "\u9818\u571F\u304C\u5360\u9818\u3055\u308C\u305F", participants: [{ entityId: g.id, role: "territory" }, { entityId: w.id, role: "war" }], location: { cell: g.cell }, causes: [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] });
        }
      }
      const age = mi - w.startedAt;
      if (w.score >= 80) endWar(ctx, w, "aggressor_victory");
      else if (w.score <= -80) endWar(ctx, w, "defender_victory");
      else if (age > 120) endWar(ctx, w, "stalemate");
    }
  }

  // js/core/civ/interpret.js
  var STANCE = Object.freeze({ victory: "\u52DD\u5229\u306E\u6804\u5149", humiliation: "\u5C48\u8FB1", lost_territory: "\u5931\u308F\u308C\u305F\u9818\u571F", betrayal: "\u88CF\u5207\u308A", reconciled: "\u548C\u89E3", founding: "\u5EFA\u56FD\u306E\u7269\u8A9E", inconclusive: "\u6C7A\u7740\u306E\u3064\u304B\u306A\u304B\u3063\u305F\u6226\u4E89" });
  var MAX_ACTIVE = 24;
  var clamp4 = (v, a, b) => Math.max(a, Math.min(b, v));
  var r2 = (x) => Math.round(x * 100) / 100;
  function addInterp(ctx, owner, ev, stance, valence, about, supersedes = null) {
    const { civ: civ6, ids } = ctx, id = ids.next("interp");
    civ6.interpretations.push({ interpId: id, ownerId: owner.id, eventId: ev.eventId, stance, valence: r2(valence), about, since: civ6.monthIndex, until: null, supersedes, basis: "rule" });
    (owner.interp ?? (owner.interp = [])).push(id);
    while (owner.interp.length > MAX_ACTIVE) {
      const old = getInterp(civ6, owner.interp.shift());
      if (old) old.until = civ6.monthIndex;
    }
    return id;
  }
  var interpPos = /* @__PURE__ */ new WeakMap();
  function getInterp(civ6, id) {
    let m = interpPos.get(civ6);
    if (!m || m.n > civ6.interpretations.length) {
      m = { n: 0, map: /* @__PURE__ */ new Map() };
      interpPos.set(civ6, m);
    }
    for (; m.n < civ6.interpretations.length; m.n++) m.map.set(civ6.interpretations[m.n].interpId, civ6.interpretations[m.n]);
    return m.map.get(id) ?? null;
  }
  function grievance(civ6, st2, targetId) {
    let s = 0;
    for (const id of st2.interp ?? []) {
      const x = getInterp(civ6, id);
      if (x && x.valence < 0 && x.about.includes(targetId)) s -= x.valence;
    }
    return Math.min(1, s);
  }
  var TEXT = {
    victory: (a, b, w) => `${a}\u306E\u5E74\u4EE3\u8A18\u306F\u3001${b}\u3068\u306E\u6226\u4E89\u3092\u6804\u5149\u306E\u52DD\u5229\u3068\u3057\u3066\u8A18\u3057\u305F\u3002`,
    humiliation: (a, b, w) => `${a}\u3067\u306F\u3001${b}\u3068\u306E\u6226\u4E89\u306F\u5C48\u8FB1\u306E\u8A18\u61B6\u3068\u3057\u3066\u8A9E\u3089\u308C\u305F\u3002`,
    inconclusive: (a, b, w) => `${a}\u306E\u8A18\u9332\u306F\u3001${b}\u3068\u306E\u6226\u4E89\u3092\u3001\u6C7A\u7740\u306E\u3064\u304B\u306A\u304B\u3063\u305F\u3082\u306E\u3068\u3057\u3066\u8A18\u3057\u305F\u3002`,
    founding: (a) => `${a}\u306E\u5EFA\u56FD\u306E\u7269\u8A9E\u304C\u7DE8\u307E\u308C\u305F\u3002`
  };
  function addWork(ctx, author, ev, stance, text, claims) {
    const { civ: civ6, ids } = ctx, id = ids.next("work");
    civ6.works.push({ workId: id, kind: "chronicle", authorId: author.id, date: { ...civ6.date }, targetEventId: ev.eventId, stance, text, claims, fidelity: claims.some((c) => c.claimed !== c.actual) ? "distorted" : "faithful" });
  }
  var factionOf = (w, id) => w.sides.a.includes(id) ? "a" : "d";
  function stepInterpretation(ctx) {
    const { civ: civ6 } = ctx;
    const E = civ6.events;
    for (; civ6.interpCursor < E.length; civ6.interpCursor++) {
      const ev = E[civ6.interpCursor];
      if (ev.kind === "war_ended") {
        const wid = ev.participants.find((p) => p.role === "war")?.entityId, w = civ6.wars[wid];
        if (!w) continue;
        for (const bp of ev.participants.filter((p) => p.role === "belligerent")) {
          const s = civ6.states[bp.entityId];
          if (!s) continue;
          const side = factionOf(w, s.id), foe = civ6.states[side === "a" ? w.defender : w.aggressor];
          if (!foe || foe.id === s.id) continue;
          const lead = w.outcome === "aggressor_victory" ? "a" : w.outcome === "defender_victory" ? "d" : Math.abs(w.score) >= 25 ? w.score > 0 ? "a" : "d" : null;
          const won = lead === side, lost = lead !== null && lead !== side;
          const stance = won ? "victory" : lost ? "humiliation" : "inconclusive";
          addInterp(ctx, s, ev, stance, won ? 0.6 : lost ? -0.7 : -0.1, [foe.id]);
          if (lost && ev.effects.some((e) => e.before === s.id)) addInterp(ctx, s, ev, "lost_territory", -0.8, [foe.id]);
          const k = won ? 0.7 : lost ? 1.6 : 1, tribal = s.polity === "tribal" ? 1 : 0;
          const f2 = tribal ? 1 : k;
          addWork(ctx, s, ev, stance, TEXT[stance](s.name, foe.name, w), [{ property: "war.casualties", claimed: Math.round(w.casualties * f2), actual: Math.round(w.casualties) }, { property: "war.outcome", claimed: lost && !tribal ? "stalemate" : stance === "inconclusive" && (s.polity === "kingdom" || s.polity === "empire") ? side === "a" ? "aggressor_victory" : "defender_victory" : w.outcome, actual: w.outcome }]);
        }
      } else if (ev.kind === "treaty_ended") {
        const br = ev.participants.find((p) => p.role === "breaker");
        if (!br) continue;
        for (const p of ev.participants.filter((x) => x.role === "party")) {
          const s = civ6.states[p.entityId];
          if (s?.alive) addInterp(ctx, s, ev, "betrayal", -0.6, [br.entityId]);
        }
      } else if (ev.kind === "state_formed") {
        const sp = ev.participants.find((p) => p.role === "state"), s = civ6.states[sp?.entityId];
        if (s) {
          addInterp(ctx, s, ev, "founding", 0.5, []);
          addWork(ctx, s, ev, "founding", TEXT.founding(s.name), []);
        }
      }
    }
    for (const id in civ6.states) {
      const st2 = civ6.states[id];
      if (!st2.alive || !st2.interpDirty) continue;
      st2.interpDirty = false;
      const k = st2.polity === "republic" ? 0.4 : st2.polity === "empire" || st2.polity === "kingdom" ? 1.1 : 0.6;
      for (const iid of [...st2.interp ?? []]) {
        const x = getInterp(civ6, iid);
        if (!x || x.until != null || x.valence >= 0) continue;
        const nv = clamp4(x.valence * k, -1, 0), ev = getEvent(civ6, x.eventId);
        x.until = civ6.monthIndex;
        st2.interp = st2.interp.filter((q2) => q2 !== iid);
        if (ev) addInterp(ctx, st2, ev, Math.abs(nv) < 0.15 ? "reconciled" : x.stance, Math.abs(nv) < 0.15 ? 0 : nv, x.about, iid);
      }
    }
  }

  // js/core/civ/magic.js
  var ABILITIES = Object.freeze({
    healing: { id: "healing", ja: "\u7652\u3057", cost: "\u8853\u8005\u306E\u4F53\u529B", risk: 0.01, weight: 3 },
    flame: { id: "flame", ja: "\u708E\u8853", cost: "\u8853\u8005\u306E\u5BFF\u547D", risk: 0.05, weight: 2 },
    ward: { id: "ward", ja: "\u7D50\u754C", cost: "\u8853\u8005\u306E\u96C6\u4E2D\uFF08\u9577\u6642\u9593\uFF09", risk: 0.015, weight: 2 },
    farsight: { id: "farsight", ja: "\u9060\u898B", cost: "\u8853\u8005\u306E\u6B63\u6C17", risk: 0.03, weight: 2 },
    beastbond: { id: "beastbond", ja: "\u7363\u4F7F\u3044", cost: "\u8853\u8005\u306E\u4F53\u529B", risk: 0.02, weight: 1.5 },
    storm: { id: "storm", ja: "\u5929\u5019\u306E\u64CD\u4F5C", cost: "\u8853\u8005\u306E\u5BFF\u547D", risk: 0.07, weight: 1 }
  });
  var INSTITUTIONS = Object.freeze({ academy: { ja: "\u9B54\u8853\u5B66\u9662", effect: "\u6280\u8853\u306E\u9032\u6357 \u6700\u5927+10%" }, military: { ja: "\u9B54\u5C0E\u5175\u56E3", effect: "\u8ECD\u4E8B\u529B \u6700\u5927+15%" }, temple: { ja: "\u795E\u6BBF", effect: "\u5B89\u5B9A\u5EA6\u306E\u76EE\u6A19 \u6700\u5927+0.04" } });
  var CAPS = Object.freeze({ mil: 0.15, tech: 0.1, stab: 0.04, supplyFull: 6, instCost: 60, minPersons: 2 });
  var BASE_RATE = 12e-10;
  var ORG_MIN = 3;
  var living = (civ6) => {
    var _a;
    return (_a = civ6.magic).living ?? (_a.living = Object.keys(civ6.persons).filter((i) => civ6.persons[i].diedAt == null));
  };
  var kill = (civ6, p, mi) => {
    p.diedAt = mi;
    civ6.magic.living = living(civ6).filter((i) => i !== p.id);
  };
  function supplyOf(civ6, st2, groups) {
    if (st2.policy.tolerance < 0.2) return { n: 0, power: 0, ids: [] };
    const gset = new Set(groups.map((g) => g.id)), ids = [];
    let sum = 0;
    for (const id of living(civ6)) {
      const p = civ6.persons[id];
      if (gset.has(p.groupId)) {
        ids.push(id);
        sum += p.power;
      }
    }
    return { n: ids.length, power: ids.length ? Math.min(1, ids.length / CAPS.supplyFull) * (sum / ids.length) : 0, ids };
  }
  var pickAbility = (rng) => {
    const l = Object.values(ABILITIES), t = l.reduce((s, a) => s + a.weight, 0);
    let r = rng() * t;
    for (const a of l) {
      r -= a.weight;
      if (r <= 0) return a;
    }
    return l[0];
  };
  function stepMagic(ctx) {
    const { civ: civ6, ids, rng } = ctx, mi = civ6.monthIndex;
    if (mi % 3 !== 0) return;
    if (civ6.options.magic === false) return;
    const rate = civ6.options.magicRate ?? 1;
    for (const gid in civ6.groups) {
      const g = civ6.groups[gid], d = dominant(g), sp = speciesOf(d.speciesId, civ6);
      if (rng() >= g.pop * 3 * BASE_RATE * (sp.magic / 2e-3) * rate) continue;
      const ab = pickAbility(rng), pid = ids.next("person"), age = (14 + Math.floor(rng() * 16)) * 12, p = { id: pid, name: ctx.nameGen?.person(civ6, g, rng) ?? makeNameJa(rng), speciesId: sp.id, groupId: gid, bornAt: mi - age, diedAt: null, ability: ab.id, power: Math.round(Math.pow(rng(), 1.5) * 100) / 100 + 0.05, emergedAt: mi, orgId: null };
      p.power = Math.min(1, p.power);
      civ6.persons[pid] = p;
      living(civ6).push(pid);
      const found = makeEvent(civ6, ids, { kind: "magic_gifted_found", title: `${ab.ja}\u306E\u7D20\u8CEA\u3092\u6301\u3064\u8005\u304C\u73FE\u308C\u305F`, participants: [{ entityId: pid, role: "gifted" }, { entityId: gid, role: "group" }], location: { cell: g.cell }, effects: [{ targetId: pid, property: "magic.power", before: null, after: p.power }] });
      const st2 = g.stateId ? civ6.states[g.stateId] : null;
      if (rng() < 0.5) incident(ctx, g, p, ab, found);
      if (st2 && st2.policy.tolerance < 0.35 && rng() < 0.4) {
        const was = d.tension;
        d.tension = Math.min(1, d.tension + 0.2);
        d.interest = "religious_freedom";
        makeEvent(civ6, ids, { kind: "magic_discrimination", title: `${ab.ja}\u306E\u7D20\u8CEA\u8005\u304C\u3001${st2.name}\u3067\u8FEB\u5BB3\u3055\u308C\u305F`, participants: [{ entityId: pid, role: "victim" }, { entityId: st2.id, role: "state" }, { entityId: gid, role: "group" }], location: { cell: g.cell }, causes: [{ targetId: found.eventId, relation: "caused_by", basis: "strong" }], effects: [{ targetId: gid, property: "cohort_tension", before: Math.round(was * 100) / 100, after: Math.round(d.tension * 100) / 100 }] });
      }
    }
    if (mi % 12 === 0) yearly(ctx);
    if (mi % 12 === 3) institutions(ctx);
  }
  function incident(ctx, g, p, ab, found) {
    const { civ: civ6, ids } = ctx, before = Math.round(g.pop);
    let delta = 0, title;
    if (ab.id === "healing") {
      delta = g.pop * 0.02;
      title = "\u7652\u3057\u624B\u304C\u75AB\u75C5\u3092\u93AE\u3081\u305F";
    } else if (ab.id === "flame") {
      delta = -g.pop * 0.01 * p.power;
      title = "\u708E\u8853\u304C\u66B4\u8D70\u3057\u3001\u96C6\u843D\u3092\u713C\u3044\u305F";
    } else if (ab.id === "storm") {
      delta = g.pop * 0.01;
      title = "\u96E8\u4E5E\u3044\u304C\u6210\u529F\u3057\u3001\u53CE\u7A6B\u304C\u6301\u3061\u76F4\u3057\u305F";
    } else if (ab.id === "farsight") {
      title = "\u9060\u898B\u306E\u8005\u304C\u707D\u3044\u3092\u4E88\u8A00\u3057\u305F";
    } else if (ab.id === "ward") {
      title = "\u7D50\u754C\u304C\u96C6\u843D\u3092\u5B88\u3063\u305F";
    } else {
      title = "\u7363\u4F7F\u3044\u304C\u91CE\u7363\u3092\u5F93\u3048\u305F";
    }
    g.pop = Math.max(5, g.pop + delta);
    makeEvent(civ6, ids, { kind: "magic_incident", title, participants: [{ entityId: p.id, role: "gifted" }, { entityId: g.id, role: "group" }], location: { cell: g.cell }, causes: [{ targetId: found.eventId, relation: "caused_by", basis: "direct" }], effects: delta ? [{ targetId: g.id, property: "pop", before, after: Math.round(g.pop) }] : [] });
  }
  function yearly(ctx) {
    const { civ: civ6, ids, rng } = ctx, mi = civ6.monthIndex, groups = byState(ctx);
    for (const id of [...living(civ6)]) {
      const p = civ6.persons[id];
      const life = speciesOf(p.speciesId, civ6).lifespan * (0.8 + 0.4 * (hashSeed(id) % 100 / 100));
      if (mi - p.bornAt > life) {
        kill(civ6, p, mi);
        if (p.power > 0.8) makeEvent(civ6, ids, { kind: "magic_gifted_died", title: `\u5F37\u5927\u306A${ABILITIES[p.ability].ja}\u306E\u4F7F\u3044\u624B\u304C\u4E16\u3092\u53BB\u3063\u305F`, participants: [{ entityId: id, role: "gifted" }], location: null });
      }
    }
    for (const sid in civ6.states) {
      const st2 = civ6.states[sid];
      if (!st2.alive) continue;
      const sup = supplyOf(civ6, st2, groups.get(sid) ?? []);
      let org = Object.values(civ6.magic.orgs).find((o) => o.stateId === sid && o.endedAt == null);
      if (!org && sup.n >= ORG_MIN) {
        const oid = ids.next("org"), kind = st2.policy.tolerance < 0.4 ? "\u79D8\u5BC6\u7D50\u793E" : st2.techAdopted.writing != null ? "\u5B66\u3073\u820E" : "\u8853\u8005\u306E\u96C6\u3044";
        org = civ6.magic.orgs[oid] = { id: oid, name: makeNameJa(rng) + (kind === "\u5B66\u3073\u820E" ? "\u306E\u5B66\u3073\u820E" : kind === "\u79D8\u5BC6\u7D50\u793E" ? "\u306E\u7D50\u793E" : "\u306E\u96C6\u3044"), kind, stateId: sid, foundedAt: mi, endedAt: null, members: sup.ids.slice() };
        for (const m of sup.ids) civ6.persons[m].orgId = oid;
        makeEvent(civ6, ids, { kind: "magic_org_founded", title: `${org.name}\uFF08${kind}\uFF09\u304C\u7D50\u3070\u308C\u305F`, participants: [{ entityId: oid, role: "organization" }, { entityId: sid, role: "state" }, ...sup.ids.slice(0, 3).map((m) => ({ entityId: m, role: "member" }))], location: null });
      } else if (org) {
        org.members = sup.ids.slice();
        for (const m of sup.ids) civ6.persons[m].orgId = org.id;
        if (!sup.n) org.endedAt = mi;
      }
      if (org && org.endedAt == null && st2.stability < 0.4 && !st2.magic && rng() < 0.15) {
        st2.stability = Math.max(0, st2.stability - 0.03);
        makeEvent(civ6, ids, { kind: "magic_power_struggle", title: `${org.name}\u304C\u653F\u6CBB\u3078\u306E\u767A\u8A00\u529B\u3092\u6C42\u3081\u305F`, participants: [{ entityId: org.id, role: "organization" }, { entityId: sid, role: "state" }], location: null, causes: asCauses(recentEventsFor(civ6, [sid], ["instability", "demand_raised"], 36, 1), "reaction_to", "plausible"), effects: [{ targetId: sid, property: "stability", before: null, after: Math.round(st2.stability * 1e3) / 1e3 }] });
      }
    }
  }
  function institutions(ctx) {
    const { civ: civ6, ids, rng } = ctx, groups = byState(ctx);
    for (const sid in civ6.states) {
      const st2 = civ6.states[sid];
      if (!st2.alive || !st2.magic) continue;
      const sup = supplyOf(civ6, st2, groups.get(sid) ?? []);
      st2.magic.power = Math.round(sup.power * 1e3) / 1e3;
      const risk = sup.ids.reduce((s, i) => s + ABILITIES[civ6.persons[i].ability].risk, 0) * 0.15 * (st2.magic.kind === "military" ? 1.5 : 1);
      if (sup.n && rng() < Math.min(0.2, risk)) {
        const b = st2.stability;
        st2.stability = Math.max(0, st2.stability - 0.05);
        const victim = civ6.persons[sup.ids[Math.floor(rng() * sup.ids.length)]];
        if (victim.power > 0.6) kill(civ6, victim, civ6.monthIndex);
        makeEvent(civ6, ids, { kind: "magic_backlash", title: `${st2.name}\u306E${INSTITUTIONS[st2.magic.kind].ja}\u3067\u9B54\u8853\u304C\u66B4\u767A\u3057\u305F`, participants: [{ entityId: sid, role: "state" }, { entityId: victim.id, role: "gifted" }], location: null, effects: [{ targetId: sid, property: "stability", before: Math.round(b * 1e3) / 1e3, after: Math.round(st2.stability * 1e3) / 1e3 }] });
      }
    }
  }
  function institutionCandidates(ctx, st2, e, cand3, bad3) {
    if (st2.magic) return [bad3("magic_institution", "\u3059\u3067\u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B")];
    const sup = supplyOf(ctx.civ, st2, e.gs);
    if (sup.n < CAPS.minPersons) return [bad3("magic_institution", `\u7D20\u8CEA\u8005\u304C\u8DB3\u308A\u306A\u3044\uFF08${CAPS.minPersons}\u4EBA\u4EE5\u4E0A\u3002\u73FE\u5728${sup.n}\u4EBA\uFF09`)];
    if (st2.techAdopted.writing == null && st2.techAdopted.administration == null) return [bad3("magic_institution", "\u6587\u5B57\u304B\u884C\u653F\u306E\u6280\u8853\u304C\u5FC5\u8981")];
    if (st2.treasury < CAPS.instCost) return [bad3("magic_institution", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
    return Object.keys(INSTITUTIONS).map((k) => cand3("magic_institution", k === "academy" ? { tech: 0.5, prestige: 0.2 } : k === "military" ? { security: 0.45, expansion: 0.25, stability: -0.1 } : { stability: 0.4, culture: 0.3 }, { opt: k, label: INSTITUTIONS[k].ja }));
  }
  function institutionExecute(ctx, st2, c) {
    const k = c.opt;
    if (!INSTITUTIONS[k]) return { ok: false, error: "\u672A\u77E5\u306E\u5236\u5EA6" };
    if (st2.magic) return { ok: false, error: "\u3059\u3067\u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B" };
    const sup = supplyOf(ctx.civ, st2, byState(ctx).get(st2.id) ?? []);
    if (sup.n < CAPS.minPersons) return { ok: false, error: "\u7D20\u8CEA\u8005\u304C\u8DB3\u308A\u306A\u3044" };
    if (st2.treasury < CAPS.instCost) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
    st2.treasury -= CAPS.instCost;
    const org = Object.values(ctx.civ.magic.orgs).find((o) => o.stateId === st2.id && o.endedAt == null);
    st2.magic = { kind: k, foundedAt: ctx.civ.monthIndex, orgId: org?.id ?? null, power: Math.round(sup.power * 1e3) / 1e3 };
    return { ok: true, effects: [{ targetId: st2.id, property: "magic.institution", before: null, after: k }], title: `${INSTITUTIONS[k].ja}\u3092\u5275\u8A2D`, targetId: org?.id ?? null };
  }

  // js/core/civ/disaster.js
  var KIND_JA = Object.freeze({ drought: "\u5E72\u3070\u3064", flood: "\u6D2A\u6C34", volcano: "\u5674\u706B" });
  var CLIMATE_JA = Object.freeze({ cool: "\u5BD2\u51B7\u671F", normal: "\u5E73\u5E38", warm: "\u6E29\u6696\u671F" });
  var HALF_LIFE = 1440;
  var RATE = 0.02;
  var clamp5 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var r3 = (x) => Math.round(x * 1e3) / 1e3;
  function climateIndex(civ6, mi) {
    const h2 = hashSeed(civ6.historySeed, "climate"), a = h2 % 1e3 / 1e3 * 2 * Math.PI;
    return 0.62 * Math.sin(2 * Math.PI * mi / 3600 + a) + 0.38 * Math.sin(2 * Math.PI * mi / 11e3 + 2 * a);
  }
  var phaseOf = (i) => i > 0.35 ? "warm" : i < -0.35 ? "cool" : "normal";
  var climateGrowth = (civ6) => civ6.climate.phase === "cool" ? 0.97 : civ6.climate.phase === "warm" ? 1.01 : 1;
  function stepClimate(ctx) {
    const { civ: civ6, ids } = ctx, mi = civ6.monthIndex, idx = climateIndex(civ6, mi), ph = phaseOf(idx);
    civ6.climate.index = r3(idx);
    if (ph !== civ6.climate.phase) {
      const old = civ6.climate.phase;
      civ6.climate.phase = ph;
      civ6.climate.since = mi;
      if (mi > 12) makeEvent(civ6, ids, { kind: "climate_shift", title: `\u6C17\u5019\u304C${CLIMATE_JA[old]}\u304B\u3089${CLIMATE_JA[ph]}\u3078\u79FB\u3063\u305F`, participants: [], location: null, effects: [{ targetId: "world", property: "climate.phase", before: old, after: ph }] });
    }
  }
  function disasterMemory(civ6, st2) {
    const m = st2.memory?.disaster;
    if (!m) return 0;
    let s = 0;
    for (const k in m) s += m[k].w * Math.pow(0.5, (civ6.monthIndex - m[k].at) / HALF_LIFE);
    return s;
  }
  function remember(civ6, st2, kind, sev) {
    var _a;
    const m = (_a = st2.memory ?? (st2.memory = {})).disaster ?? (_a.disaster = {}), cur = m[kind] ? m[kind].w * Math.pow(0.5, (civ6.monthIndex - m[kind].at) / HALF_LIFE) : 0;
    m[kind] = { w: r3(cur + sev), at: civ6.monthIndex };
  }
  var WEIGHT = {
    flood: (w, c) => w.cell.river[c] ? 2 : w.cell.coastDist[c] <= 1 ? 1 : 0.15,
    drought: (w, c, ph) => {
      const b = w.cell.biome[c];
      return (b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.TROPICAL_SEASONAL || b === BIOMES2.COLD_DESERT ? 2 : 0.7) * (ph === "warm" ? 1.5 : ph === "cool" ? 0.8 : 1);
    },
    volcano: (w, c) => {
      const m = w.mesh;
      let v = w.cell.volcanic[c] > 0.3 ? 3 : 0;
      if (!v) {
        for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) if (w.cell.volcanic[m.neighborIds[k]] > 0.3) {
          v = 1;
          break;
        }
      }
      return v;
    }
  };
  var pickKind = (w, c, ph, rng) => {
    const ws = Object.keys(WEIGHT).map((k) => [k, WEIGHT[k](w, c, ph)]), t = ws.reduce((s, x) => s + x[1], 0);
    if (t <= 0) return null;
    let r = rng() * t;
    for (const [k, x] of ws) {
      r -= x;
      if (r <= 0) return k;
    }
    return ws[0][0];
  };
  var resist = (civ6, g) => {
    const st2 = g.stateId ? civ6.states[g.stateId] : null;
    return 1 - 0.6 * (st2?.resilience ?? 0);
  };
  function stepDisaster(ctx) {
    const { world, civ: civ6, ids, rng } = ctx, mi = civ6.monthIndex, rate = (civ6.options.disasterRate ?? 1) * RATE;
    if (rng() < rate) {
      const gl = Object.keys(civ6.groups);
      if (gl.length) {
        const g = civ6.groups[gl[Math.floor(rng() * gl.length)]], kind = pickKind(world, g.cell, civ6.climate.phase, rng);
        if (kind) strike(ctx, g, kind);
      }
    }
    for (const id in civ6.disasters) {
      const d = civ6.disasters[id];
      if (d.ended) continue;
      if (d.kind === "drought" && mi > d.startedAt) for (const gid of d.groupIds) {
        const g = civ6.groups[gid];
        if (g) g.pop = Math.max(5, g.pop * (1 - 3e-3 * d.severity * resist(civ6, g)));
      }
      if (mi >= d.endsAt) {
        d.ended = true;
        makeEvent(civ6, ids, { kind: "disaster_ended", title: `${KIND_JA[d.kind]}\u304C\u53CE\u307E\u3063\u305F`, participants: [{ entityId: id, role: "disaster" }], location: { cell: d.center }, causes: [{ targetId: d.eventId, relation: "part_of", basis: "direct" }] });
      }
    }
    if (mi % 120 === 0) {
      for (const id in civ6.disasters) if (civ6.disasters[id].ended && mi - civ6.disasters[id].endsAt > 1200 && !civ6.disasters[id].archived) civ6.disasters[id].archived = true;
    }
  }
  function strike(ctx, g0, kind) {
    const { world, civ: civ6, ids, rng } = ctx, mi = civ6.monthIndex, sev = r3(0.3 + 0.7 * rng()), { terr } = spatialOf(ctx);
    const cells = new Set(territoryOf(world, g0.cell));
    if (kind === "drought") {
      const m = world.mesh;
      for (const c of [...cells]) for (let k = m.neighborOffsets[c]; k < m.neighborOffsets[c + 1]; k++) if (world.cell.landWater[m.neighborIds[k]] === LAND_WATER2.LAND) cells.add(m.neighborIds[k]);
    }
    const hit = /* @__PURE__ */ new Set();
    for (const c of cells) for (const gid of terr.get(c) ?? []) hit.add(gid);
    hit.add(g0.id);
    const months = kind === "drought" ? 12 + Math.floor(rng() * 36) : kind === "volcano" ? 12 + Math.floor(rng() * 24) : 1 + Math.floor(rng() * 2), id = ids.next("disaster");
    const d = civ6.disasters[id] = { id, kind, startedAt: mi, endsAt: mi + months, center: g0.cell, cells: [...cells].slice(0, 12), severity: sev, groupIds: [...hit].sort(), eventId: null, ended: false, deaths: 0 };
    const effects = [], states = /* @__PURE__ */ new Set();
    let dead = 0;
    for (const gid of d.groupIds) {
      const g = civ6.groups[gid];
      if (!g) continue;
      const res = resist(civ6, g), before = Math.round(g.pop);
      if (kind === "flood") g.pop = Math.max(5, g.pop * (1 - 0.08 * sev * res));
      else if (kind === "volcano") g.pop = Math.max(5, g.pop * (1 - 0.15 * sev * res));
      if (kind !== "flood") {
        g.capMult = r3(clamp5(1 - (kind === "drought" ? 0.45 : 0.35) * sev * res, 0.3, 1));
        g.capUntil = mi + months + (kind === "volcano" ? 12 : 6);
      }
      dead += Math.max(0, before - g.pop);
      {
        const dc = g.cohorts.reduce((b, c) => c.share > b.share ? c : b);
        dc.tension = clamp5(dc.tension + 0.05 * sev * res);
      }
      effects.push({ targetId: gid, property: "pop", before, after: Math.round(g.pop) });
      if (g.stateId) states.add(g.stateId);
    }
    d.deaths = Math.round(dead);
    for (const sid of states) {
      const st2 = civ6.states[sid];
      if (!st2?.alive) continue;
      const b = st2.stability;
      st2.stability = Math.max(0, st2.stability - 0.03 * sev * (1 - 0.6 * (st2.resilience ?? 0)));
      remember(civ6, st2, kind, sev);
      effects.push({ targetId: sid, property: "stability", before: r3(b), after: r3(st2.stability) });
    }
    const ev = makeEvent(civ6, ids, { kind: "disaster_struck", title: `${KIND_JA[kind]}\uFF08\u898F\u6A21 ${Math.round(sev * 100)}\uFF09\u304C\u8D77\u304D\u305F`, participants: [{ entityId: id, role: "disaster" }, ...d.groupIds.slice(0, 8).map((x) => ({ entityId: x, role: "affected" })), ...[...states].slice(0, 4).map((x) => ({ entityId: x, role: "state" }))], location: { cell: g0.cell }, causes: [{ targetId: "world", relation: "enabled_by", basis: "plausible" }].filter(() => false).concat(civ6.climate.phase !== "normal" ? [] : []), effects });
    d.eventId = ev.eventId;
    if (sev >= 0.6) {
      const occ = spatialOf(ctx).terr, g = d.groupIds.map((x) => civ6.groups[x]).filter((x) => x && !x.order && x.pop >= POP.minBudPop * 3).sort((a, b) => b.pop - a.pop)[0];
      if (g) {
        const t = bestTargets(world, civ6, g, occ, 3);
        if (t.length) {
          if (g.player) addProposal(civ6, ids, g, "split", { targets: t });
          else if (rng() < 0.3) {
            const moved = Math.round(g.pop * POP.budShare);
            g.pop -= moved;
            g.lastBudAt = mi;
            const child = spawnGroup(civ6, ids, g, t[0].cell, moved);
            occ.set(t[0].cell, [child.id]);
            makeEvent(civ6, ids, { kind: "group_split", title: "\u707D\u5BB3\u3092\u9003\u308C\u3066\u96C6\u56E3\u304C\u5206\u304B\u308C\u305F", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: t[0].cell }, causes: [{ targetId: ev.eventId, relation: "reaction_to", basis: "strong" }] });
          }
        }
      }
    }
    return d;
  }
  function recentDisasterLoad(civ6, st2, months = 24) {
    let s = 0;
    for (const id in civ6.disasters) {
      const d = civ6.disasters[id];
      if (civ6.monthIndex - d.endsAt > months) continue;
      for (const gid of d.groupIds) if (civ6.groups[gid]?.stateId === st2.id) {
        s += d.severity;
        break;
      }
    }
    return Math.min(1, s);
  }

  // js/core/civ/actions.js
  var clamp6 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var cand = (key, f2, o = {}) => ({ key, target: o.target ?? null, opt: o.opt ?? null, factors: f2, eligible: o.eligible ?? true, reason: o.reason ?? null, label: o.label ?? null });
  var bad = (key, reason, o = {}) => cand(key, {}, { ...o, eligible: false, reason });
  var r32 = (x) => Math.round(x * 1e3) / 1e3;
  var eff = (list, st2, property, before, after) => {
    list.push({ targetId: st2.id, property, before: typeof before === "number" ? Math.round(before * 1e3) / 1e3 : before, after: typeof after === "number" ? Math.round(after * 1e3) / 1e3 : after });
  };
  var spend = (st2, n2) => st2.treasury >= n2 ? (st2.treasury -= n2, true) : false;
  function observe(ctx, st2) {
    const { civ: civ6 } = ctx, gs = byState(ctx).get(st2.id) ?? [], nb = neighborStates(ctx, st2).map((i) => civ6.states[i]).filter(Boolean);
    let tens = 0;
    for (const g of gs) {
      let t = 0;
      for (const c of g.cohorts) if (c.tension > t) t = c.tension;
      tens += t * g.pop;
    }
    const my = strength(civ6, st2), nbs = nb.map((o) => ({ st: o, pop: o.pop, strength: strength(civ6, o), rel: st2.relations[o.id] ?? 0, atWar: atWarWith(civ6, st2, o), treaties: { na: !!treatyBetween(civ6, st2, o, "nonaggression"), al: !!treatyBetween(civ6, st2, o, "alliance"), tr: !!treatyBetween(civ6, st2, o, "trade") } }));
    const techs = Object.keys(st2.techAdopted).length, lag = nbs.length ? clamp6((nbs.reduce((s, n2) => s + Object.keys(n2.st.techAdopted).length, 0) / nbs.length - techs) / 6) : 0;
    const myBase = st2.pop * 5e-3 * (0.5 + st2.stability) * (my / (st2.army + 1e-9) || 1) * (1 + st2.defense * 0.5), maxThreat = nbs.reduce((m, n2) => Math.max(m, n2.strength / (myBase + 1)), 0);
    const seaNbs = ctx.warOps ? ctx.warOps.seaTargets(ctx, st2).map((o) => ({ st: o, pop: o.pop, strength: strength(civ6, o), rel: st2.relations[o.id] ?? 0, atWar: atWarWith(civ6, st2, o), sea: true, treaties: { na: !!treatyBetween(civ6, st2, o, "nonaggression"), al: !!treatyBetween(civ6, st2, o, "alliance"), tr: !!treatyBetween(civ6, st2, o, "trade") } })) : [];
    return { gs, nbs, seaNbs, pop: st2.pop, my, tension: st2.pop ? tens / st2.pop : 0, treasuryNeed: clamp6(1 - st2.treasury / (st2.pop * 0.02 + 50)), techLag: lag, threat: clamp6((maxThreat - 0.8) / 2), atWar: st2.warIds.length > 0, mi: civ6.monthIndex };
  }
  var free = (ctx, id) => ctx.civ.states[id];
  var ACTIONS = [
    {
      key: "set_tax",
      domain: "finance",
      label: "\u7A0E\u7387\u306E\u8ABF\u6574",
      enabled: true,
      candidates(ctx, st2, e) {
        const t = st2.policy.tax, out = [];
        if (t < Math.min(0.4, st2.politics?.taxCeiling ?? 0.4)) out.push(cand("set_tax", { prosperity: 0.9 * e.treasuryNeed, stability: -0.4 - e.tension }, { opt: "up", label: "\u5897\u7A0E" }));
        else out.push(bad("set_tax", "\u7A0E\u7387\u304C\u4E0A\u9650", { opt: "up" }));
        if (t > 0.03) out.push(cand("set_tax", { stability: 0.2 + 0.7 * e.tension, prosperity: -0.3 * e.treasuryNeed }, { opt: "down", label: "\u6E1B\u7A0E" }));
        else out.push(bad("set_tax", "\u7A0E\u7387\u304C\u4E0B\u9650", { opt: "down" }));
        return out;
      },
      execute(ctx, st2, c) {
        const ef = [], b = st2.policy.tax, a = r32(clamp6(b + (c.opt === "up" ? 0.05 : -0.05), 0.02, 0.4));
        st2.policy.tax = a;
        eff(ef, st2, "policy.tax", b, a);
        return { ok: true, effects: ef, title: c.opt === "up" ? "\u5897\u7A0E" : "\u6E1B\u7A0E" };
      }
    },
    {
      key: "adopt_tech",
      domain: "tech",
      label: "\u6280\u8853\u306E\u63A1\u7528",
      enabled: true,
      candidates(ctx, st2, e) {
        var _a;
        const cache = (_a = ctx.civ).adoptCache ?? (_a.adoptCache = {}), hit = cache[st2.id];
        const keys = hit && e.mi - hit.mi < 12 ? hit.keys : (cache[st2.id] = { mi: e.mi, keys: adoptable(ctx, st2, e.gs).map((t) => t.key) }, cache[st2.id].keys);
        const list = keys.map((k) => TECH[k]).filter(Boolean);
        return list.filter((t) => st2.techAdopted[t.key] == null).slice(0, 3).map((t) => {
          const cost = t.tier * 15;
          return st2.treasury >= cost ? cand("adopt_tech", { tech: 0.3 + 0.12 * t.tier + e.techLag * 0.4, prosperity: 0.15, prestige: 0.05 * t.tier }, { opt: t.key, label: `${t.name}\u3092\u5236\u5EA6\u5316` }) : bad("adopt_tech", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044", { opt: t.key });
        });
      },
      execute(ctx, st2, c) {
        const t = TECH[c.opt];
        if (!t || st2.techAdopted[t.key] != null) return { ok: false, error: "\u63A1\u7528\u3067\u304D\u306A\u3044\u6280\u8853" };
        if (!spend(st2, t.tier * 15)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st2.techAdopted[t.key] = ctx.civ.monthIndex;
        return { ok: true, kind: "tech_institutionalized", effects: [{ targetId: st2.id, property: `techAdopted.${t.key}`, before: null, after: ctx.civ.monthIndex }], title: `${t.name}\u3092\u5236\u5EA6\u5316` };
      }
    },
    {
      key: "change_polity",
      domain: "institution",
      label: "\u653F\u4F53\u306E\u5909\u66F4",
      enabled: true,
      candidates(ctx, st2) {
        const a = st2.techAdopted, out = [], p = st2.polity, n2 = st2.pop;
        if (p === "tribal") out.push(n2 >= 2e3 && stateCan(ctx.civ, st2, "polity:chiefdom") ? cand("change_polity", { stability: 0.3, prestige: 0.2 }, { opt: "chiefdom" }) : bad("change_polity", n2 < 2e3 ? "\u4EBA\u53E3\u304C\u8DB3\u308A\u306A\u3044" : gateReason(ctx.civ, st2, "polity:chiefdom"), { opt: "chiefdom" }));
        if (p === "chiefdom" || p === "theocracy") {
          out.push(stateCan(ctx.civ, st2, "polity:kingdom") && n2 >= 15e3 ? cand("change_polity", { stability: 0.3, prestige: 0.4 }, { opt: "kingdom" }) : bad("change_polity", n2 < 15e3 ? "\u4EBA\u53E3\u304C\u8DB3\u308A\u306A\u3044" : gateReason(ctx.civ, st2, "polity:kingdom"), { opt: "kingdom" }));
          if (p === "chiefdom") out.push(stateCan(ctx.civ, st2, "polity:republic") && n2 >= 15e3 && st2.policy.tolerance > 0.5 ? cand("change_polity", { stability: 0.25, culture: 0.2 }, { opt: "republic" }) : bad("change_polity", gateReason(ctx.civ, st2, "polity:republic") ?? "\u4EBA\u53E3\u3068\u5BDB\u5BB9\u304C\u8DB3\u308A\u306A\u3044", { opt: "republic" }));
        }
        if (p === "kingdom") out.push(stateCan(ctx.civ, st2, "polity:empire") && n2 >= 15e4 ? cand("change_polity", { stability: 0.2, prestige: 0.6, expansion: 0.2 }, { opt: "empire" }) : bad("change_polity", n2 < 15e4 ? "\u4EBA\u53E3\u304C\u8DB3\u308A\u306A\u3044" : gateReason(ctx.civ, st2, "polity:empire"), { opt: "empire" }));
        return out;
      },
      execute(ctx, st2, c) {
        const ok2 = POLITY[c.opt];
        if (!ok2) return { ok: false, error: "\u672A\u77E5\u306E\u653F\u4F53" };
        {
          const gr = gateReason(ctx.civ, st2, POLITY_CAP[c.opt]);
          if (gr) return { ok: false, error: gr };
        }
        const ef = [];
        eff(ef, st2, "polity", st2.polity, c.opt);
        st2.polity = c.opt;
        st2.interpDirty = true;
        const rt = retitle(st2, c.opt);
        if (rt) {
          eff(ef, st2, "name", st2.name, rt.name);
          st2.name = rt.name;
          st2.nameBase = rt.base;
        }
        return { ok: true, facts: { stateId: st2.id, polity: c.opt, ...rt ? { name: rt.name } : {} }, effects: ef, title: `\u653F\u4F53\u3092${POLITY[c.opt]}\u3078${rt ? `\uFF08\u56FD\u53F7\u306F${rt.name}\uFF09` : ""}` };
      }
    },
    {
      key: "designate_heir",
      domain: "leader",
      label: "\u7D99\u627F\u8005\u306E\u6307\u540D",
      enabled: true,
      candidates(ctx, st2) {
        return st2.leader.heir ? [bad("designate_heir", "\u3059\u3067\u306B\u6307\u540D\u6E08\u307F")] : [cand("designate_heir", { stability: 0.35 })];
      },
      execute(ctx, st2) {
        if (st2.leader.heir) return { ok: false, error: "\u3059\u3067\u306B\u6307\u540D\u6E08\u307F" };
        st2.leader.heir = true;
        return { ok: true, effects: [{ targetId: st2.id, property: "leader.heir", before: false, after: true }] };
      }
    },
    {
      key: "encourage_settlement",
      domain: "population",
      label: "\u5B9A\u4F4F\u30FB\u5165\u690D\u306E\u5968\u52B1",
      enabled: true,
      candidates(ctx, st2) {
        return st2.boostUntil > ctx.civ.monthIndex ? [bad("encourage_settlement", "\u5968\u52B1\u4E2D")] : st2.treasury >= 30 ? [cand("encourage_settlement", { prosperity: 0.3, expansion: 0.25 })] : [bad("encourage_settlement", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st2) {
        if (!spend(st2, 30)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st2.boostUntil = ctx.civ.monthIndex + 60;
        return { ok: true, effects: [{ targetId: st2.id, property: "boostUntil", before: null, after: st2.boostUntil }] };
      }
    },
    {
      key: "set_mobilization",
      domain: "mobilization",
      label: "\u52D5\u54E1",
      enabled: true,
      candidates(ctx, st2, e) {
        const want = e.atWar || e.threat > 0.7 ? 0.15 : e.threat > 0.4 ? 0.05 : 0;
        return [0, 0.05, 0.15].filter((v) => v !== st2.policy.mobilization).map((v) => cand("set_mobilization", v === want ? { security: 0.5, prosperity: v < st2.policy.mobilization ? 0.2 : -0.1 } : { security: -0.3 }, { opt: String(v), label: `\u52D5\u54E1\u7387${v}` }));
      },
      execute(ctx, st2, c) {
        const v = Number(c.opt);
        if (!(v >= 0 && v <= 0.15)) return { ok: false, error: "\u52D5\u54E1\u7387\u304C\u7BC4\u56F2\u5916" };
        const ef = [];
        eff(ef, st2, "policy.mobilization", st2.policy.mobilization, v);
        st2.policy.mobilization = v;
        return { ok: true, effects: ef };
      }
    },
    {
      key: "build_fortification",
      domain: "military",
      label: "\u8981\u585E\u306E\u6574\u5099",
      enabled: true,
      candidates(ctx, st2, e) {
        if (st2.techAdopted.fortification == null) return [bad("build_fortification", "\u57CE\u58C1\u306E\u6280\u8853\u3092\u63A1\u7528\u3057\u3066\u3044\u306A\u3044")];
        if (st2.defense >= 0.5) return [bad("build_fortification", "\u6574\u5099\u6E08\u307F")];
        return st2.treasury >= 40 ? [cand("build_fortification", { security: 0.3 + e.threat * 0.6 })] : [bad("build_fortification", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st2) {
        if (st2.techAdopted.fortification == null) return { ok: false, error: "\u57CE\u58C1\u306E\u6280\u8853\u304C\u306A\u3044" };
        if (!spend(st2, 40)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        eff(ef, st2, "defense", st2.defense, Math.min(0.5, st2.defense + 0.1));
        st2.defense = Math.min(0.5, st2.defense + 0.1);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "plan_conquest",
      domain: "war",
      label: "\u5F81\u670D\u306E\u8A08\u753B",
      enabled: true,
      candidates(ctx, st2, e) {
        if (st2.campaign) return [bad("plan_conquest", "\u5225\u306E\u8A08\u753B\u304C\u9032\u884C\u4E2D")];
        if (e.mi - (st2.lastWarEnd ?? -999) < 180) return [bad("plan_conquest", "\u6226\u4E89\u306E\u75B2\u5F0A\u304B\u3089\u56DE\u5FA9\u3057\u3066\u3044\u306A\u3044")];
        return [...e.nbs, ...e.seaNbs ?? []].filter((n2) => !n2.atWar && !n2.treaties.na && !n2.treaties.al).map((n2) => {
          const ratio = (e.my + 1) / (n2.strength + 1);
          const gr = grievance(ctx.civ, st2, n2.st.id);
          return ratio >= 1.3 ? cand("plan_conquest", { expansion: clamp6((ratio - 1) / 2) - 0.1 * st2.warIds.length + 0.35 * gr, prestige: 0.1 + 0.3 * gr, stability: -0.2, prosperity: -0.3 }, { target: n2.st.id, label: `${n2.st.name}\u306E\u5F81\u670D` }) : bad("plan_conquest", "\u6226\u529B\u304C\u8DB3\u308A\u306A\u3044", { target: n2.st.id });
        });
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (st2.campaign) return { ok: false, error: "\u5225\u306E\u8A08\u753B\u304C\u9032\u884C\u4E2D" };
        st2.campaign = { kind: "conquest", target: t.id, stage: "prepare", startedAt: ctx.civ.monthIndex, deadline: ctx.civ.monthIndex + 60, warId: null };
        return { ok: true, effects: [{ targetId: st2.id, property: "campaign", before: null, after: `conquest:${t.id}` }], title: `${t.name}\u306E\u5F81\u670D\u3092\u8A08\u753B`, targetId: t.id };
      }
    },
    {
      key: "declare_war",
      domain: "war",
      label: "\u5BA3\u6226",
      enabled: true,
      candidates() {
        return [];
      },
      // AI は「征服の計画」の手順として行う。プレイヤーは対象を指定して実行できる
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive || t.id === st2.id) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (atWarWith(ctx.civ, st2, t)) return { ok: false, error: "\u3059\u3067\u306B\u4EA4\u6226\u4E2D" };
        if (treatyBetween(ctx.civ, st2, t, "nonaggression") || treatyBetween(ctx.civ, st2, t, "alliance")) return { ok: false, error: "\u6761\u7D04\u304C\u3042\u308B\u305F\u3081\u5BA3\u6226\u3067\u304D\u306A\u3044\uFF08\u5148\u306B\u7834\u68C4\u3059\u308B\uFF09" };
        if (!(ctx.warOps ? ctx.warOps.canReach(ctx, st2, t) : neighborStates(ctx, st2).includes(t.id))) return { ok: false, error: ctx.warOps ? "\u9678\u3067\u63A5\u3057\u3066\u304A\u3089\u305A\u3001\u6D77\u304B\u3089\u3082\u5C4A\u304B\u306A\u3044" : "\u96A3\u63A5\u3057\u3066\u3044\u306A\u3044" };
        const w = declareWar(ctx, st2, t, { decisionId: c.decisionId, provenance: c.provenance });
        if (st2.campaign?.target === t.id) {
          st2.campaign.stage = "war";
          st2.campaign.warId = w.id;
        }
        return { ok: true, effects: [], warId: w.id, silent: true, targetId: t.id };
      }
    },
    {
      key: "sue_for_peace",
      domain: "war",
      label: "\u8B1B\u548C",
      enabled: true,
      candidates(ctx, st2) {
        return st2.warIds.map((i) => ctx.civ.wars[i]).map((w) => {
          const mine = w.sides.a.includes(st2.id) ? w.score : -w.score;
          return cand("sue_for_peace", { security: clamp6(-mine / 50) + 0.1, stability: 0.2 }, { target: w.id, label: "\u8B1B\u548C" });
        });
      },
      execute(ctx, st2, c) {
        const w = ctx.civ.wars[c.target];
        if (!w || w.status !== "active" || !st2.warIds.includes(w.id)) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u9032\u884C\u4E2D\u3067\u306F\u306A\u3044" };
        {
          const r = ctx.negotiate?.peace(ctx, st2, w, c);
          if (r) return r;
        }
        endWar(ctx, w, "negotiated");
        return { ok: true, effects: [], silent: true, targetId: w.id };
      }
    },
    {
      key: "sign_treaty",
      domain: "diplomacy",
      label: "\u6761\u7D04\u306E\u7DE0\u7D50",
      enabled: true,
      candidates(ctx, st2, e) {
        const out = [];
        for (const n2 of e.nbs) {
          if (n2.atWar) continue;
          for (const type of ["nonaggression", "alliance", "trade"]) {
            const have = type === "nonaggression" ? n2.treaties.na : type === "alliance" ? n2.treaties.al : n2.treaties.tr;
            if (have) continue;
            if (grievance(ctx.civ, st2, n2.st.id) > 0.5) {
              out.push(bad("sign_treaty", "\u6B74\u53F2\u7684\u306A\u6068\u307F\u304C\u6DF1\u3044", { target: n2.st.id, opt: type }));
              continue;
            }
            if (n2.rel < -20 || type === "alliance" && n2.rel < 10) {
              out.push(bad("sign_treaty", "\u95A2\u4FC2\u304C\u826F\u304F\u306A\u3044", { target: n2.st.id, opt: type }));
              continue;
            }
            const f2 = type === "trade" ? { prosperity: 0.35 } : type === "nonaggression" ? { security: 0.2 + clamp6(n2.strength / (e.my + 1) - 0.8) * 0.5 } : { security: 0.3 + e.threat * 0.5, prestige: 0.15 };
            out.push(cand("sign_treaty", f2, { target: n2.st.id, opt: type, label: `${n2.st.name}\u3068${TREATY[type].ja}` }));
          }
        }
        return out;
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive || !TREATY[c.opt]) return { ok: false, error: "\u76F8\u624B\u307E\u305F\u306F\u6761\u7D04\u306E\u7A2E\u985E\u304C\u4E0D\u6B63" };
        if (atWarWith(ctx.civ, st2, t)) return { ok: false, error: "\u4EA4\u6226\u4E2D\u306E\u76F8\u624B\u3068\u306F\u7D50\u3079\u306A\u3044" };
        if (treatyBetween(ctx.civ, st2, t, c.opt)) return { ok: false, error: "\u3059\u3067\u306B\u7D50\u3093\u3067\u3044\u308B" };
        {
          const r = ctx.negotiate?.treaty(ctx, st2, t, c.opt, c);
          if (r) return r;
        }
        const rel = st2.relations[t.id] ?? 0;
        if (rel < -20 || c.opt === "alliance" && rel < 10) return { ok: false, error: "\u76F8\u624B\u3068\u306E\u95A2\u4FC2\u304C\u5341\u5206\u3067\u306A\u304F\u3001\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", diplomacyFailure: true, targetId: t.id };
        signTreaty(ctx, c.opt, st2, t, { decisionId: c.decisionId, provenance: c.provenance });
        return { ok: true, effects: [], silent: true, targetId: t.id };
      }
    },
    {
      key: "break_treaty",
      domain: "diplomacy",
      label: "\u6761\u7D04\u306E\u7834\u68C4",
      enabled: true,
      candidates(ctx, st2) {
        if (st2.player) return ctx.civ.activeTreatyIds.map((i) => ctx.civ.treaties[i]).filter((x) => x.active && (x.a === st2.id || x.b === st2.id)).map((x) => cand("break_treaty", { expansion: 0, prestige: -0.5 }, { target: x.id }));
        const camp = st2.campaign;
        if (!camp || camp.stage !== "prepare") return [];
        const t = treatyBetween(ctx.civ, st2, free(ctx, camp.target), "nonaggression");
        return t ? [cand("break_treaty", { expansion: 0.3, prestige: -0.5 }, { target: t.id })] : [];
      },
      execute(ctx, st2, c) {
        const t = ctx.civ.treaties[c.target];
        if (!t?.active || t.a !== st2.id && t.b !== st2.id) return { ok: false, error: "\u305D\u306E\u6761\u7D04\u306F\u6709\u52B9\u3067\u306F\u306A\u3044" };
        endTreaty(ctx, t, "\u7834\u68C4\u3055\u308C\u305F", st2.id);
        adjustRel(st2, ctx.civ.states[t.a === st2.id ? t.b : t.a], -30);
        return { ok: true, effects: [], silent: true, targetId: t.id };
      }
    },
    {
      key: "impose_sanctions",
      domain: "sanctions",
      label: "\u7D4C\u6E08\u5236\u88C1",
      enabled: true,
      candidates(ctx, st2, e) {
        return e.nbs.filter((n2) => !n2.atWar && n2.rel < -10 && !(n2.st.sanctions[st2.id] > e.mi)).map((n2) => cand("impose_sanctions", { security: 0.15, prestige: 0.2, prosperity: -0.15 }, { target: n2.st.id, label: `${n2.st.name}\u3078\u5236\u88C1` }));
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        t.sanctions[st2.id] = ctx.civ.monthIndex + 36;
        adjustRel(st2, t, -15);
        return { ok: true, effects: [{ targetId: t.id, property: `sanctions.${st2.id}`, before: null, after: t.sanctions[st2.id] }], targetId: t.id };
      }
    },
    {
      key: "covert_op",
      domain: "covert",
      label: "\u79D8\u5BC6\u5DE5\u4F5C",
      enabled: true,
      candidates(ctx, st2, e) {
        return e.nbs.filter((n2) => !n2.atWar && n2.rel < 0 && st2.treasury >= 25).map((n2) => cand("covert_op", { expansion: 0.15, security: 0.15, prestige: -0.1 }, { target: n2.st.id, label: `${n2.st.name}\u3078\u306E\u5DE5\u4F5C` }));
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (!spend(st2, 25)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const p = 0.35 + (st2.techAdopted.writing != null ? 0.1 : 0) + (st2.techAdopted.administration != null ? 0.1 : 0);
        if (ctx.rng() < p) {
          const b = t.stability;
          t.stability = Math.max(0, t.stability - 0.08);
          return { ok: true, effects: [{ targetId: t.id, property: "stability", before: Math.round(b * 1e3) / 1e3, after: Math.round(t.stability * 1e3) / 1e3 }], targetId: t.id, title: "\u79D8\u5BC6\u5DE5\u4F5C\u304C\u6210\u529F" };
        }
        adjustRel(st2, t, -20);
        return { ok: false, error: "\u5DE5\u4F5C\u304C\u767A\u899A\u3057\u305F", diplomacyFailure: true, targetId: t.id };
      }
    },
    {
      key: "suppress_unrest",
      domain: "rebellion",
      label: "\u4E0D\u6E80\u306E\u93AE\u5727",
      enabled: true,
      candidates(ctx, st2, e) {
        return st2.treasury >= 20 ? [cand("suppress_unrest", { stability: 0.5 * e.tension + (st2.stability < 0.45 ? 0.4 : 0), culture: -0.1 })] : [bad("suppress_unrest", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st2, c) {
        if (!spend(st2, 20)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        for (const g of byState(ctx).get(st2.id) ?? []) for (const co of g.cohorts) co.tension *= 0.8;
        eff(ef, st2, "stability", st2.stability, Math.min(1, st2.stability + 0.06));
        st2.stability = Math.min(1, st2.stability + 0.06);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "grant_autonomy",
      domain: "rebellion",
      label: "\u81EA\u6CBB\u306E\u5BB9\u8A8D",
      enabled: true,
      candidates(ctx, st2, e) {
        return st2.policy.autonomy >= 1 ? [bad("grant_autonomy", "\u6700\u5927")] : [cand("grant_autonomy", { stability: 0.6 * e.tension, culture: 0.2, prestige: -0.1 })];
      },
      execute(ctx, st2) {
        const ef = [], b = st2.policy.autonomy;
        st2.policy.autonomy = r32(clamp6(b + 0.2));
        eff(ef, st2, "policy.autonomy", b, st2.policy.autonomy);
        for (const g of byState(ctx).get(st2.id) ?? []) for (const c of g.cohorts) c.tension *= 0.85;
        return { ok: true, effects: ef };
      }
    },
    {
      key: "promote_culture",
      domain: "culture",
      label: "\u540C\u5316\u653F\u7B56",
      enabled: true,
      candidates(ctx, st2, e) {
        return st2.policy.assimilation >= 1 ? [bad("promote_culture", "\u6700\u5927")] : [cand("promote_culture", { culture: 0.45, stability: -0.3 * e.tension })];
      },
      execute(ctx, st2) {
        const ef = [], b = st2.policy.assimilation;
        st2.policy.assimilation = r32(clamp6(b + 0.2));
        eff(ef, st2, "policy.assimilation", b, st2.policy.assimilation);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "set_tolerance",
      domain: "religion",
      label: "\u5B97\u6559\u653F\u7B56",
      enabled: true,
      candidates(ctx, st2, e) {
        const t = st2.policy.tolerance;
        return [t < 1 ? cand("set_tolerance", { stability: 0.4 * e.tension, culture: -0.1 }, { opt: "up", label: "\u5BDB\u5BB9" }) : bad("set_tolerance", "\u6700\u5927", { opt: "up" }), t > 0 ? cand("set_tolerance", { culture: 0.3, stability: -0.3 * e.tension }, { opt: "down", label: "\u56FD\u6559\u306E\u5F37\u5316" }) : bad("set_tolerance", "\u6700\u5C0F", { opt: "down" })];
      },
      execute(ctx, st2, c) {
        const ef = [], b = st2.policy.tolerance, a = r32(clamp6(b + (c.opt === "up" ? 0.2 : -0.2)));
        st2.policy.tolerance = a;
        eff(ef, st2, "policy.tolerance", b, a);
        return { ok: true, effects: ef };
      }
    },
    {
      key: "found_city",
      domain: "territory",
      label: "\u90FD\u5E02\u306E\u5EFA\u8A2D",
      enabled: true,
      candidates(ctx, st2, e) {
        return e.gs.filter((g) => !g.settlementId && (g.subsistence === "agriculture" || g.subsistence === "fishing") && g.pop >= 250).sort((a, b) => b.pop - a.pop).slice(0, 2).map((g) => cand("found_city", { prosperity: 0.3, expansion: 0.25 }, { target: g.id }));
      },
      execute(ctx, st2, c) {
        const g = ctx.civ.groups[c.target];
        if (!g || g.stateId !== st2.id || g.settlementId || g.pop < 250 || g.subsistence === "forage" || g.subsistence === "pastoral") return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u3067\u306F\u5EFA\u8A2D\u3067\u304D\u306A\u3044" };
        const s = foundSettlement(ctx.world, ctx.civ, ctx.ids, g), ev = ctx.civ.events.at(-1);
        ev.provenance = c.provenance ?? "simulation";
        ev.decisionId = c.decisionId ?? null;
        return { ok: true, effects: [], silent: true, targetId: s.id };
      }
    },
    {
      key: "annex_group",
      domain: "territory",
      label: "\u5468\u8FBA\u96C6\u56E3\u306E\u7DE8\u5165",
      enabled: true,
      candidates(ctx, st2, e) {
        const out = [];
        for (const g of e.gs) for (const o of neighborGroups(ctx, g)) {
          const t = ctx.civ.groups[o];
          if (t && !t.stateId && !t.player && t.pop < st2.pop) out.push(cand("annex_group", { expansion: 0.45, prosperity: 0.1 }, { target: o }));
        }
        const seen = /* @__PURE__ */ new Set();
        return out.filter((c) => !seen.has(c.target) && seen.add(c.target)).slice(0, 3);
      },
      execute(ctx, st2, c) {
        const t = ctx.civ.groups[c.target];
        if (!t || t.stateId || t.player) return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u306F\u7DE8\u5165\u3067\u304D\u306A\u3044" };
        if (!spend(st2, 20)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        t.stateId = st2.id;
        learnByAnnexation(ctx, st2, t);
        return { ok: true, facts: { stateId: st2.id, cell: t.cell }, effects: [{ targetId: t.id, property: "stateId", before: null, after: st2.id }], targetId: t.id, title: "\u5468\u8FBA\u306E\u96C6\u56E3\u3092\u7DE8\u5165" };
      }
    },
    {
      key: "move_capital",
      domain: "city",
      label: "\u9077\u90FD",
      enabled: true,
      candidates(ctx, st2, e) {
        const cap = ctx.civ.groups[st2.capitalGroupId], big = e.gs.reduce((a, b) => b.pop > (a?.pop ?? 0) ? b : a, null);
        return big && cap && big.id !== cap.id && big.pop > cap.pop * 2 ? [cand("move_capital", { stability: 0.2, prestige: 0.15 }, { target: big.id })] : [];
      },
      execute(ctx, st2, c) {
        const g = ctx.civ.groups[c.target];
        if (!g || g.stateId !== st2.id) return { ok: false, error: "\u305D\u306E\u96C6\u56E3\u306F\u56FD\u5185\u306B\u306A\u3044" };
        const ef = [];
        eff(ef, st2, "capitalGroupId", st2.capitalGroupId, g.id);
        st2.capitalGroupId = g.id;
        return { ok: true, effects: ef, targetId: g.id };
      }
    },
    {
      key: "reconcile",
      domain: "peace",
      label: "\u548C\u89E3",
      enabled: true,
      candidates(ctx, st2, e) {
        return e.nbs.filter((n2) => !n2.atWar && n2.rel < -20 && st2.treasury >= 15).map((n2) => cand("reconcile", { security: 0.3 + 0.3 * grievance(ctx.civ, st2, n2.st.id), prestige: 0.1 }, { target: n2.st.id }));
      },
      execute(ctx, st2, c) {
        const t = free(ctx, c.target);
        if (!t?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
        if (!spend(st2, 15)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        adjustRel(st2, t, 25);
        return { ok: true, effects: [], targetId: t.id, title: "\u548C\u89E3\u306E\u4F7F\u7BC0" };
      }
    },
    // 後続マイルストーンで有効にする行動（登録だけして、候補は出さない）
    {
      key: "disaster_relief",
      domain: "disaster",
      label: "\u707D\u5BB3\u6551\u6E08",
      enabled: true,
      candidates(ctx, st2, e) {
        const load = recentDisasterLoad(ctx.civ, st2, 18);
        if (load <= 0) return [];
        return st2.treasury >= 30 ? [cand("disaster_relief", { stability: 0.6 * load + 0.2, prosperity: 0.3 * load, culture: 0.1 }, {})] : [bad("disaster_relief", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
      },
      execute(ctx, st2) {
        if (!spend(st2, 30)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [];
        let n2 = 0;
        for (const g of byState(ctx).get(st2.id) ?? []) if (g.capUntil > ctx.civ.monthIndex && g.capMult < 1) {
          g.capMult = Math.min(1, Math.round((g.capMult + 0.2) * 1e3) / 1e3);
          for (const c of g.cohorts) c.tension *= 0.85;
          n2++;
        }
        eff(ef, st2, "stability", st2.stability, Math.min(1, st2.stability + 0.02 + 0.01 * Math.min(n2, 3)));
        st2.stability = Math.min(1, st2.stability + 0.02 + 0.01 * Math.min(n2, 3));
        return { ok: true, effects: ef, title: `\u707D\u5BB3\u306E\u6551\u6E08\uFF08${n2}\u96C6\u56E3\uFF09` };
      }
    },
    {
      key: "build_granary",
      domain: "disaster",
      label: "\u5099\u84C4\u30FB\u6CBB\u6C34\u306E\u6574\u5099",
      enabled: true,
      candidates(ctx, st2) {
        const mem = disasterMemory(ctx.civ, st2);
        if ((st2.resilience ?? 0) >= 0.5) return [bad("build_granary", "\u6574\u5099\u6E08\u307F")];
        if (st2.treasury < 40) return [bad("build_granary", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
        return [cand("build_granary", { stability: 0.9 * Math.min(1, mem), security: 0.4 * Math.min(1, mem), prosperity: 0.1 * Math.min(1, mem) }, {})];
      },
      // 過去の災害の記憶が強い国ほど備える
      execute(ctx, st2) {
        if ((st2.resilience ?? 0) >= 0.5) return { ok: false, error: "\u6574\u5099\u6E08\u307F" };
        if (!spend(st2, 40)) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        const ef = [], b = st2.resilience ?? 0;
        st2.resilience = Math.round(Math.min(0.5, b + 0.1) * 1e3) / 1e3;
        eff(ef, st2, "resilience", b, st2.resilience);
        return { ok: true, effects: ef, title: "\u5099\u84C4\u30FB\u6CBB\u6C34\u306E\u6574\u5099" };
      }
    },
    { key: "magic_institution", domain: "magic", label: "\u9B54\u6CD5\u5236\u5EA6", enabled: true, candidates: (ctx, st2, e) => ctx.civ.options.magic === false ? [] : institutionCandidates(ctx, st2, e, cand, bad), execute: (ctx, st2, c) => institutionExecute(ctx, st2, c) },
    { key: "nuclear_program", domain: "nuclear", label: "\u6838\u8A08\u753B", enabled: false, disabledReason: "\u6838\u306F\u6280\u8853\u300C\u6838\u300D\u306E\u63A1\u7528\u5F8C\uFF08\u5F8C\u7D9A\uFF09", candidates: () => [], execute: () => ({ ok: false, error: "\u672A\u5B9F\u88C5" }) }
  ];
  var ACTION = Object.fromEntries(ACTIONS.map((a) => [a.key, a]));
  function registerAction(def) {
    if (ACTION[def.key]) return;
    ACTIONS.push(def);
    ACTION[def.key] = def;
  }
  for (const a of ACTIONS) {
    const cap = ACTION_CAP[a.key];
    if (!cap || a.enabled === false) continue;
    const c0 = a.candidates, x0 = a.execute;
    a.requires = cap;
    a.candidates = (ctx, st2, e) => {
      const r = gateReason(ctx.civ, st2, cap);
      return r ? [bad(a.key, r)] : c0(ctx, st2, e);
    };
    a.execute = (ctx, st2, c) => {
      const r = gateReason(ctx.civ, st2, cap);
      return r ? { ok: false, error: r } : x0(ctx, st2, c);
    };
  }
  {
    const sg = ACTION.sign_treaty, c0 = sg.candidates, x0 = sg.execute;
    sg.candidates = (ctx, st2, e) => c0(ctx, st2, e).map((c) => {
      const r = gateReason(ctx.civ, st2, TREATY_CAP[c.opt]);
      return r && !c.blocked ? bad("sign_treaty", r, { target: c.target, opt: c.opt }) : c;
    });
    sg.execute = (ctx, st2, c) => {
      const r = gateReason(ctx.civ, st2, TREATY_CAP[c.opt]);
      return r ? { ok: false, error: r } : x0(ctx, st2, c);
    };
  }
  var actionGate = (civ6, st2, key) => {
    const a = ACTION[key];
    if (!a) return { ok: false, reason: "\u672A\u77E5\u306E\u884C\u52D5" };
    const cap = ACTION_CAP[a.key];
    const r = cap ? gateReason(civ6, st2, cap) : null;
    return r ? { ok: false, reason: r } : { ok: true, reason: null };
  };
  var RECORDED = /* @__PURE__ */ new Set(["adopt_tech", "change_polity", "build_fortification", "plan_conquest", "declare_war", "sue_for_peace", "sign_treaty", "break_treaty", "impose_sanctions", "covert_op", "found_city", "annex_group", "move_capital", "reconcile", "grant_autonomy", "nuclear_program"]);
  function runAction(ctx, st2, def, c, { decisionId = null, provenance = "ai" } = {}) {
    const cc = { ...c, decisionId, provenance }, r = def.execute(ctx, st2, cc), { civ: civ6, ids } = ctx;
    if (!r.ok) {
      if (r.diplomacyFailure) {
        const ev = makeEvent(civ6, ids, { kind: "diplomacy_failed", title: `${st2.name}\u306E\u300C${def.label}\u300D\u306F\u4E0D\u6210\u7ACB\uFF08${r.error}\uFF09`, participants: [{ entityId: st2.id, role: "actor" }, ...r.targetId ? [{ entityId: r.targetId, role: "target" }] : []], location: null, effects: [], decisionId, provenance });
        return { ok: false, error: r.error, eventIds: [ev.eventId] };
      }
      return { ok: false, error: r.error, eventIds: [] };
    }
    let eventId = civ6.events.length ? civ6.events[civ6.events.length - 1].eventId : null;
    if (!r.silent && RECORDED.has(def.key)) {
      const ev = makeEvent(civ6, ids, { kind: r.kind ?? "state_action", title: `${st2.name}: ${r.title ?? def.label}`, participants: [{ entityId: st2.id, role: "actor" }, ...r.targetId ? [{ entityId: r.targetId, role: "target" }] : []], location: civ6.groups[st2.capitalGroupId] ? { cell: civ6.groups[st2.capitalGroupId].cell } : null, effects: r.effects ?? [], facts: r.facts ?? null, provenance });
      eventId = ev.eventId;
    }
    return { ok: true, eventIds: [eventId], warId: r.warId ?? null };
  }
  function findCandidate(ctx, st2, def, { target = null, opt = null }) {
    const e = observe(ctx, st2), list = def.key === "declare_war" ? [cand("declare_war", {}, { target })] : def.candidates(ctx, st2, e);
    return list.find((c) => (c.target ?? null) === (target ?? null) && (c.opt ?? null) === (opt ?? null)) ?? null;
  }

  // js/core/civ/ai.js
  var GOALS = Object.freeze({ expand: "expansion", prosper: "prosperity", secure: "security", advance: "tech", consolidate: "stability" });
  var GOAL_JA = Object.freeze({ expand: "\u62E1\u5927", prosper: "\u7E41\u6804", secure: "\u5B89\u5168", advance: "\u6280\u8853\u306E\u9032\u6B69", consolidate: "\u5B89\u5B9A" });
  var BASELINE = 0.15;
  var STRATEGY_EVERY = 120;
  var FACTORS = Object.freeze(["security", "prosperity", "expansion", "stability", "culture", "tech", "prestige"]);
  var SHOWN = 6;
  var SHOWN_IDLE = 3;
  var expandDecision = (civ6, d) => ({ ...d, candidates: [] });
  var clamp7 = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  var round = (x) => Math.round(x * 1e3) / 1e3;
  function record(ctx, st2, d) {
    return { decisionId: null, actorId: st2.id, result: null };
  }
  var obsOf = (st2, e) => ({ pop: Math.round(st2.pop), treasury: Math.round(st2.treasury), stability: round(st2.stability), army: Math.round(st2.army), strength: Math.round(e.my), atWar: e.atWar, neighbors: e.nbs.length, tension: round(e.tension), threat: round(e.threat), campaign: st2.campaign ? `${st2.campaign.kind}:${st2.campaign.stage}` : null });
  function totalOf(st2, c, crisis) {
    const goalF = st2.strategy ? GOALS[st2.strategy.goal] : null;
    let t = 0;
    for (const [f2, v] of Object.entries(c.factors)) {
      let w = st2.personality[f2] ?? 1;
      if (f2 === goalF) w *= 1.5;
      if (crisis && (f2 === "stability" || f2 === "security")) w *= 2;
      t += w * v;
    }
    return round(t);
  }
  var view = (c, total) => [c, total];
  var AUTO_KEYS = /* @__PURE__ */ new Set(["adopt_tech", "adopt_doctrine"]);
  function chooseStrategy(ctx, st2, e) {
    const needs = { expand: 0.25 + 0.4 * clamp7((e.my + 1) / (e.nbs.reduce((s, n2) => s + n2.strength, 0) / Math.max(1, e.nbs.length) + 1) - 1, 0, 2) * 0.5, prosper: e.treasuryNeed, secure: e.threat, advance: e.techLag, consolidate: 1 - st2.stability };
    const list = Object.entries(needs).map(([goal, n2]) => ({ goal, total: round(n2 * st2.personality[GOALS[goal]]) })).sort((a, b) => b.total - a.total || (a.goal < b.goal ? -1 : 1));
    const d = record(ctx, st2, { layer: "strategy", type: "set_strategy", obs: obsOf(st2, e), candidates: list.map((x) => view({ key: x.goal, target: null, opt: null, eligible: true, reason: null, factors: {} }, x.total)), chosen: { key: list[0].goal, target: null, opt: null } });
    const changed = st2.strategy?.goal !== list[0].goal;
    st2.strategy = { goal: list[0].goal, since: ctx.civ.monthIndex };
    d.result = { ok: true, error: null, eventIds: [], changed };
  }
  function planCampaign(ctx, st2, e) {
    const { civ: civ6 } = ctx, c = st2.campaign, t = civ6.states[c.target];
    let key = "wait", why2 = null;
    if (!t?.alive) {
      key = "abandon";
      why2 = "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044";
    } else if (civ6.monthIndex > c.deadline && c.stage === "prepare") {
      key = "abandon";
      why2 = "\u671F\u9650\u5207\u308C";
    } else if (st2.stability < 0.3) {
      key = "abandon";
      why2 = "\u56FD\u5185\u304C\u4E0D\u5B89\u5B9A";
    } else if (c.stage === "prepare") {
      const fc = ctx.warForecast?.(st2, t), ratio = fc ? fc.ratio : (e.my + 1) / (strength(civ6, t) + 1);
      if (st2.policy.mobilization < 0.1) key = "mobilize";
      else if (ratio >= 1.2 || civ6.monthIndex - c.startedAt >= 12) {
        key = ratio >= 1 && (!fc || fc.pAWin >= 0.4) ? "declare_war" : "abandon";
        if (key === "abandon") why2 = "\u6226\u529B\u304C\u898B\u5408\u308F\u306A\u3044";
      }
    } else if (c.stage === "war" && !(c.warId && civ6.wars[c.warId]?.status === "active")) {
      key = "abandon";
      why2 = "\u6226\u4E89\u304C\u7D42\u308F\u3063\u305F";
    }
    const cands = ["declare_war", "mobilize", "wait", "abandon"].map((k) => view({ key: k, target: c.target, opt: null, eligible: true, reason: k === key ? why2 : null, factors: {} }, k === key ? 1 : 0));
    return { layer: "campaign", type: `campaign_${key}`, obs: obsOf(st2, e), candidates: cands, chosen: { key, target: c.target, opt: null }, reason: why2 };
  }
  function stepAIPlan(ctx) {
    const { civ: civ6 } = ctx, mi = civ6.monthIndex, every = civ6.options.aiInterval;
    ctx.plans = [];
    for (const id in civ6.states) {
      const st2 = civ6.states[id];
      if (!st2.alive) continue;
      if ((hashSeed(id) + mi) % every !== 0) continue;
      if (st2.player) {
        const e2 = observe(ctx, st2), all2 = [];
        for (const def of ACTIONS) if (def.enabled && AUTO_KEYS.has(def.key)) {
          for (const c of def.candidates(ctx, st2, e2)) if (c.eligible) all2.push({ def, c, total: totalOf(st2, c, false) });
        }
        all2.sort((a, b) => b.total - a.total || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : String(a.c.opt) < String(b.c.opt) ? -1 : 1));
        const best2 = all2.find((x) => x.total > BASELINE);
        if (best2) {
          const d2 = record(ctx, st2, { layer: "routine", provenance: "auto", type: best2.c.key, obs: obsOf(st2, e2), candidates: all2.slice(0, SHOWN).map((x) => view(x.c, x.total)), chosen: { key: best2.c.key, target: best2.c.target, opt: best2.c.opt } });
          ctx.plans.push({ st: st2, d: d2, def: best2.def, c: best2.c });
        }
        continue;
      }
      const e = observe(ctx, st2);
      if (!st2.strategy || mi - st2.strategy.since >= STRATEGY_EVERY) chooseStrategy(ctx, st2, e);
      if (st2.campaign) {
        const p = planCampaign(ctx, st2, e), d2 = record(ctx, st2, p);
        ctx.plans.push({ st: st2, d: d2, campaign: p.chosen.key, why: p.reason });
        continue;
      }
      const crisis = st2.stability < 0.35 || st2.warIds.some((w) => {
        const wr = civ6.wars[w];
        return (wr.sides.a.includes(st2.id) ? wr.score : -wr.score) < -40;
      }) || st2.treasury < 0;
      const all = [];
      for (const def of ACTIONS) if (def.enabled) for (const c of def.candidates(ctx, st2, e)) all.push({ def, c, total: c.eligible ? totalOf(st2, c, crisis) : -Infinity });
      all.sort((a, b) => b.total - a.total || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : String(a.c.target) < String(b.c.target) ? -1 : 1));
      const best = all.find((x) => x.total > BASELINE), shown = all.slice(0, best ? SHOWN : SHOWN_IDLE).map((x) => view(x.c, x.total === -Infinity ? null : x.total));
      if (!best) shown.push(view({ key: "do_nothing", target: null, opt: null, eligible: true, reason: "\u57FA\u6E96\u5024\uFF080.15\uFF09\u3092\u8D85\u3048\u308B\u5019\u88DC\u304C\u306A\u3044", factors: {} }, BASELINE));
      const d = record(ctx, st2, { layer: crisis ? "crisis" : "routine", type: best ? best.c.key : "do_nothing", obs: obsOf(st2, e), candidates: shown, chosen: best ? { key: best.c.key, target: best.c.target, opt: best.c.opt } : { key: "do_nothing", target: null, opt: null } });
      if (best) ctx.plans.push({ st: st2, d, def: best.def, c: best.c });
      else d.result = { ok: true, error: null, eventIds: [], idle: true };
    }
  }
  function stepAIApply(ctx) {
    const { civ: civ6 } = ctx;
    for (const p of ctx.plans ?? []) {
      const { st: st2, d } = p;
      if (!st2.alive) {
        d.result = { ok: false, error: "\u56FD\u5BB6\u304C\u5B58\u5728\u3057\u306A\u3044", eventIds: [] };
        continue;
      }
      if (p.campaign) {
        const c = st2.campaign;
        if (!c) {
          d.result = { ok: false, error: "\u8A08\u753B\u304C\u65E2\u306B\u7121\u3044", eventIds: [] };
          continue;
        }
        if (p.campaign === "mobilize") {
          const r4 = runAction(ctx, st2, ACTION.set_mobilization, { key: "set_mobilization", opt: "0.15", target: null, factors: {} }, { decisionId: d.decisionId });
          d.result = { ok: r4.ok, error: r4.error ?? null, eventIds: r4.eventIds };
        } else if (p.campaign === "declare_war") {
          const r4 = runAction(ctx, st2, ACTION.declare_war, { key: "declare_war", target: c.target, factors: {} }, { decisionId: d.decisionId });
          d.result = { ok: r4.ok, error: r4.error ?? null, eventIds: r4.eventIds };
          if (!r4.ok) st2.campaign = null;
        } else if (p.campaign === "abandon") {
          st2.campaign = null;
          const ev = makeEvent(civ6, ctx.ids, { kind: "campaign_abandoned", title: `${st2.name}\u304C\u5F81\u670D\u8A08\u753B\u3092\u65AD\u5FF5\u3057\u305F\uFF08${p.why}\uFF09`, participants: [{ entityId: st2.id, role: "state" }, { entityId: c.target, role: "target" }], location: null, decisionId: d.decisionId });
          d.result = { ok: true, error: null, eventIds: [ev.eventId] };
        } else d.result = { ok: true, error: null, eventIds: [], waited: true };
        continue;
      }
      const r = runAction(ctx, st2, p.def, p.c, { decisionId: d.decisionId });
      d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds };
    }
    ctx.plans = [];
  }
  function runPlayerAction(ctx, st2, def, c) {
    const e = observe(ctx, st2), d = record(ctx, st2, { layer: "player", provenance: "player", type: c.key, obs: obsOf(st2, e), candidates: [view(c, 0)], chosen: { key: c.key, target: c.target, opt: c.opt } });
    const r = runAction(ctx, st2, def, c, { decisionId: d.decisionId, provenance: "player" });
    d.result = { ok: r.ok, error: r.error ?? null, eventIds: r.eventIds };
    return r;
  }

  // js/core/civ/commands.js
  var fail = (error) => ({ ok: false, error });
  function playerGroup(civ6, groupId) {
    const g = civ6.groups[groupId];
    if (!g) return [null, "\u305D\u306E\u96C6\u56E3\u306F\u5B58\u5728\u3057\u307E\u305B\u3093"];
    if (!g.player) return [null, "\u30D7\u30EC\u30A4\u30E4\u30FC\u306E\u96C6\u56E3\u3067\u306F\u3042\u308A\u307E\u305B\u3093"];
    return [g, null];
  }
  function applyCommand(ctx, cmd) {
    const { world, civ: civ6, ids } = ctx;
    switch (cmd.type) {
      case "moveGroup": {
        const [g, e] = playerGroup(civ6, cmd.groupId);
        if (e) return fail(e);
        if (g.order) return fail("\u3059\u3067\u306B\u79FB\u52D5\u4E2D\u3067\u3059");
        if (world.cell.landWater[cmd.to] !== LAND_WATER2.LAND) return fail("\u79FB\u52D5\u5148\u306F\u9678\u5730\u3067\u306A\u3051\u308C\u3070\u306A\u308A\u307E\u305B\u3093");
        const dist = reachable(world, g.cell, POP.moveRange[g.subsistence] * 2, g.knowledge.seafaring), d = dist.get(cmd.to);
        if (d == null) return fail(g.knowledge.seafaring < 1 ? "\u5C4A\u304D\u307E\u305B\u3093\uFF08\u6D77\u3092\u6E21\u308B\u822A\u6D77\u306E\u77E5\u8B58\u304C\u306A\u3044\u304B\u3001\u9060\u3059\u304E\u307E\u3059\uFF09" : "\u9060\u3059\u304E\u3066\u5C4A\u304D\u307E\u305B\u3093");
        g.order = { type: "move", to: cmd.to, arriveAt: civ6.monthIndex + Math.max(1, Math.ceil(d / 2)) };
        g.pop = Math.round(g.pop * (1 - Math.min(0.2, d * 0.01)));
        return { ok: true, arriveAt: g.order.arriveAt };
      }
      case "setSubsistence": {
        const [g, e] = playerGroup(civ6, cmd.groupId);
        if (e) return fail(e);
        if (!SUBSISTENCE[cmd.subsistence]) return fail("\u672A\u77E5\u306E\u751F\u696D\u3067\u3059");
        if (cmd.subsistence === "agriculture" && g.knowledge.agriculture < 1) return fail("\u8FB2\u8015\u306E\u77E5\u8B58\u304C\u307E\u3060\u8DB3\u308A\u307E\u305B\u3093");
        if (cmd.subsistence === "pastoral" && g.knowledge.herding < 1) return fail("\u7267\u755C\u306E\u77E5\u8B58\u304C\u307E\u3060\u8DB3\u308A\u307E\u305B\u3093");
        if (cmd.subsistence === "fishing" && world.cell.coastDist[g.cell] > 2 && !world.cell.river[g.cell]) return fail("\u6C34\u8FBA\u3067\u306F\u306A\u3044\u306E\u3067\u6F01\u6488\u306F\u3067\u304D\u307E\u305B\u3093");
        const before = g.subsistence;
        if (before === cmd.subsistence) return fail("\u3059\u3067\u306B\u305D\u306E\u751F\u696D\u3067\u3059");
        g.subsistence = cmd.subsistence;
        makeEvent(civ6, ids, { kind: "subsistence_changed", title: `\u751F\u696D\u306E\u8EE2\u63DB\uFF08${SUBSISTENCE[before]}\u2192${SUBSISTENCE[cmd.subsistence]}\uFF09`, participants: [{ entityId: g.id, role: "subject" }], location: { cell: g.cell }, effects: [{ targetId: g.id, property: "subsistence", before, after: cmd.subsistence }], provenance: "player" });
        return { ok: true };
      }
      case "foundSettlement": {
        const [g, e] = playerGroup(civ6, cmd.groupId);
        if (e) return fail(e);
        if (g.settlementId) return fail("\u3059\u3067\u306B\u5B9A\u4F4F\u3057\u3066\u3044\u307E\u3059");
        if (g.subsistence === "forage" || g.subsistence === "pastoral") return fail("\u63A1\u96C6\u72E9\u731F\u30FB\u7267\u755C\u306E\u307E\u307E\u3067\u306F\u5B9A\u4F4F\u3067\u304D\u307E\u305B\u3093\uFF08\u8FB2\u8015\u304B\u6F01\u6488\u3078\uFF09");
        if (g.pop < POP.settleMinPop) return fail(`\u4EBA\u53E3\u304C\u8DB3\u308A\u307E\u305B\u3093\uFF08${POP.settleMinPop}\u4EBA\u4EE5\u4E0A\uFF09`);
        const s = foundSettlement(world, civ6, ids, g);
        civ6.events[civ6.events.length - 1].provenance = "player";
        return { ok: true, settlementId: s.id };
      }
      case "splitGroup": {
        const [g, e] = playerGroup(civ6, cmd.groupId);
        if (e) return fail(e);
        if (g.order) return fail("\u79FB\u52D5\u4E2D\u306F\u5206\u6D3E\u3067\u304D\u307E\u305B\u3093");
        if (g.pop < POP.minBudPop * 2) return fail("\u4EBA\u53E3\u304C\u8DB3\u308A\u307E\u305B\u3093");
        const dist = reachable(world, g.cell, POP.moveRange[g.subsistence], g.knowledge.seafaring);
        if (!dist.has(cmd.to) || world.cell.landWater[cmd.to] !== LAND_WATER2.LAND || cmd.to === g.cell) return fail("\u305D\u3053\u3078\u306F\u5206\u6D3E\u3067\u304D\u307E\u305B\u3093");
        for (const o of Object.values(civ6.groups)) if (territoryOf(world, o.cell).includes(cmd.to) || o.cell === cmd.to) return fail("\u305D\u3053\u306F\u307B\u304B\u306E\u96C6\u56E3\u306E\u9818\u57DF\u3067\u3059");
        const moved = Math.round(g.pop * POP.budShare);
        g.pop -= moved;
        g.lastBudAt = civ6.monthIndex;
        const child = spawnGroup(civ6, ids, g, cmd.to, moved);
        child.player = false;
        makeEvent(civ6, ids, { kind: "group_split", title: "\u96C6\u56E3\u306E\u5206\u6D3E", participants: [{ entityId: g.id, role: "origin" }, { entityId: child.id, role: "offshoot" }], location: { cell: cmd.to }, causes: asCauses(recentEventsFor(civ6, [g.id], ["famine", "disaster_struck"], 36, 1), "contributed_to", "plausible"), provenance: "player" });
        return { ok: true, childId: child.id };
      }
      case "formState": {
        const [g, e] = playerGroup(civ6, cmd.groupId);
        if (e) return fail(e);
        if (g.stateId) return fail("\u3059\u3067\u306B\u56FD\u5BB6\u306B\u5C5E\u3057\u3066\u3044\u307E\u3059");
        const f2 = evaluateFormation(ctx, g);
        if (!f2) return fail("\u56FD\u5BB6\u3092\u5F62\u6210\u3059\u308B\u6761\u4EF6\u304C\u307E\u3060\u6574\u3063\u3066\u3044\u307E\u305B\u3093");
        if (cmd.via && cmd.via !== f2.via) return fail(`\u305D\u306E\u7D4C\u8DEF\u3067\u306F\u6210\u7ACB\u3057\u307E\u305B\u3093\uFF08\u73FE\u5728\u306E\u6761\u4EF6\u306F\u300C${f2.via}\u300D\uFF09`);
        const st2 = formState(ctx, { ...f2, player: true });
        return st2 ? { ok: true, stateId: st2.id } : fail("\u5F62\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
      }
      case "stateAction": {
        const st2 = civ6.states[cmd.stateId];
        if (!st2?.alive) return fail("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
        if (!st2.player) return fail("\u30D7\u30EC\u30A4\u30E4\u30FC\u306E\u56FD\u5BB6\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
        const def = ACTION[cmd.action];
        if (!def) return fail("\u672A\u77E5\u306E\u884C\u52D5\u3067\u3059");
        if (!def.enabled) return fail(`\u3053\u306E\u884C\u52D5\u306F\u307E\u3060\u4F7F\u3048\u307E\u305B\u3093\uFF08${def.disabledReason}\uFF09`);
        const c = findCandidate(ctx, st2, def, { target: cmd.target ?? null, opt: cmd.opt ?? null });
        if (!c) return fail("\u305D\u306E\u5BFE\u8C61\u30FB\u5185\u5BB9\u3067\u306F\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093");
        if (!c.eligible) return fail(c.reason ?? "\u6761\u4EF6\u3092\u6E80\u305F\u3057\u3066\u3044\u307E\u305B\u3093");
        const r = runPlayerAction(ctx, st2, def, c);
        return r.ok ? { ok: true, eventIds: r.eventIds, warId: r.warId } : fail(r.error);
      }
      case "acceptProposal": {
        const p = civ6.proposals.find((x) => x.proposalId === cmd.proposalId && !x.resolved);
        if (!p) return fail("\u305D\u306E\u63D0\u6848\u306F\u3042\u308A\u307E\u305B\u3093");
        const map = { change_subsistence: () => ({ type: "setSubsistence", groupId: p.groupId, subsistence: p.payload.subsistence }), found_settlement: () => ({ type: "foundSettlement", groupId: p.groupId }), form_state: () => ({ type: "formState", groupId: p.groupId, via: p.payload.via }), split: () => ({ type: "splitGroup", groupId: p.groupId, to: cmd.to ?? p.payload.targets?.[0]?.cell }) };
        const r = applyCommand(ctx, map[p.kind]());
        if (r.ok) p.resolved = true;
        return r;
      }
      case "dismissProposal": {
        const p = civ6.proposals.find((x) => x.proposalId === cmd.proposalId && !x.resolved);
        if (!p) return fail("\u305D\u306E\u63D0\u6848\u306F\u3042\u308A\u307E\u305B\u3093");
        p.resolved = true;
        return { ok: true };
      }
      default:
        return fail(`\u672A\u77E5\u306E\u547D\u4EE4: ${cmd.type}`);
    }
  }

  // js/core/civ/civ-sim.js
  function createCivSim(world, civ6, { extensions = [] } = {}) {
    const ids = createIdGen(civ6.seq), ticker = createTicker();
    ticker.register("clock", (ctx2) => {
      setDate(ctx2.civ, ctx2.civ.monthIndex + 1);
      ctx2.rng = rngOf(hashSeed(ctx2.civ.historySeed, ctx2.civ.monthIndex));
    }, "advanceClock");
    ticker.register("climate", stepClimate, "stepClimate");
    ticker.register("disaster", stepDisaster, "stepDisaster");
    ticker.register("economy_pop", stepPopulation, "stepPopulation");
    ticker.register("culture", stepCulture, "stepCulture");
    ticker.register("culture", stepCohorts, "stepCohorts");
    if (!civ6.options?.wcde) ticker.register("culture", stepMagic, "stepMagic");
    ticker.register("tech", stepTech, "stepTech");
    ticker.register("ai_plan", stepAIPlan, "stepAIPlan");
    ticker.register("apply", stepAIApply, "stepAIApply");
    ticker.register("conflict", stepStates, "stepStates", { every: 3 });
    ticker.register("conflict", stepWars, "stepWars");
    ticker.register("conflict", stepInterpretation, "stepInterpretation");
    ticker.register("integrity", (ctx2) => {
      const full = ctx2.civ.monthIndex % 120 === 0, errs = checkCivIntegrity(ctx2.world, ctx2.civ, { sinceEvent: full ? 0 : ctx2.eventsChecked ?? 0, structure: full || ctx2.civ.monthIndex % 12 === 0 });
      ctx2.eventsChecked = ctx2.civ.events.length;
      if (errs.length) throw new Error("\u6587\u660E\u72B6\u614B\u306E\u6574\u5408\u6027\u9055\u53CD: " + errs.slice(0, 3).join(" / "));
    }, "checkIntegrity");
    ticker.register("archive", (ctx2) => {
      if (!ctx2.civ.options.wcde) recordMonth(ctx2);
    }, "recordMonth");
    const ctx = {
      world,
      civ: civ6,
      ids,
      rng: rngOf(hashSeed(civ6.historySeed, civ6.monthIndex)),
      growthMult: () => climateGrowth(civ6),
      trace: [],
      eventsChecked: civ6.events.length,
      plans: [],
      endWarHook: endWar,
      stateMult: (g) => {
        const st2 = g.stateId ? civ6.states[g.stateId] : null;
        return st2 ? (st2.boostUntil > civ6.monthIndex ? 1.2 : 1) * (1 - 0.4 * st2.policy.mobilization) : 1;
      }
    };
    for (const ext of extensions) ext(ticker, ctx);
    return {
      ctx,
      ticker,
      advanceMonth() {
        ticker.runMonth(ctx);
        return civ6.date;
      },
      advanceMonths(n2, onProgress) {
        for (let i = 0; i < n2; i++) {
          ticker.runMonth(ctx);
          if (onProgress && i % 120 === 119) onProgress(i + 1, n2);
        }
        if (civ6.options.wcde) commitArchive(ctx);
        return civ6.date;
      },
      /** 作業バッファの出来事を歴史資料へ移して整理する（明示的に呼ぶ場合） */
      commit() {
        return commitArchive(ctx);
      },
      command: (cmd) => {
        const r = applyCommand(ctx, cmd);
        if (r.ok) {
          ctx._byState = null;
          recordMonth(ctx);
        }
        return r;
      }
      // 命令で変わった状態は、同じ月の記録を上書きする
    };
  }
  function checkCivIntegrity(world, civ6, { sinceEvent = 0, structure = true } = {}) {
    const errs = [], N2 = world.mesh.cellCount;
    let players = 0;
    if (structure) for (const id of sortedGroupIds(civ6)) {
      const g = civ6.groups[id];
      if (g.id !== id) errs.push(`\u96C6\u56E3ID\u306E\u4E0D\u4E00\u81F4 ${id}`);
      if (!Number.isFinite(g.pop) || g.pop < 0) errs.push(`\u4EBA\u53E3\u304C\u4E0D\u6B63 ${id}`);
      if (!(g.cell >= 0 && g.cell < N2) || world.cell.landWater[g.cell] !== 1) errs.push(`\u96C6\u56E3 ${id} \u304C\u9678\u306B\u3044\u306A\u3044`);
      if (g.player) players++;
      if (g.settlementId && civ6.settlements[g.settlementId]?.groupId !== id) errs.push(`\u96C6\u843D\u306E\u76F8\u4E92\u53C2\u7167\u304C\u58CA\u308C\u3066\u3044\u308B ${id}`);
      for (const k in g.tech.known) {
        if (!TECH[k]) errs.push(`\u96C6\u56E3 ${id} \u304C\u672A\u77E5\u306E\u6280\u8853 ${k} \u3092\u6301\u3064`);
        else if (!Number.isFinite(g.tech.known[k])) errs.push(`\u96C6\u56E3 ${id} \u306E\u6280\u8853 ${k} \u306E\u6642\u70B9\u304C\u4E0D\u6B63`);
      }
    }
    if (players > 1) errs.push("\u30D7\u30EC\u30A4\u30E4\u30FC\u96C6\u56E3\u304C\u8907\u6570\u3042\u308B");
    let ps = 0;
    for (const id in civ6.states) {
      const st2 = civ6.states[id];
      if (!st2.alive) continue;
      if (st2.player) ps++;
      for (const k in st2.techAdopted) if (!TECH[k]) errs.push(`\u56FD\u5BB6 ${id} \u304C\u672A\u77E5\u306E\u6280\u8853 ${k} \u3092\u63A1\u7528\u3057\u3066\u3044\u308B`);
      if (!civ6.groups[st2.capitalGroupId] && civ6.monthIndex % 3 !== 1) errs.push(`\u56FD\u5BB6 ${id} \u306E\u9996\u90FD\u96C6\u56E3\u304C\u7121\u3044`);
      for (const w of st2.warIds) if (civ6.wars[w]?.status !== "active") errs.push(`\u56FD\u5BB6 ${id} \u306E\u6226\u4E89\u53C2\u7167\u304C\u4E0D\u6B63 ${w}`);
    }
    if (ps > 1) errs.push("\u30D7\u30EC\u30A4\u30E4\u30FC\u56FD\u5BB6\u304C\u8907\u6570\u3042\u308B");
    if (structure) for (const id of sortedGroupIds(civ6)) {
      const g = civ6.groups[id];
      if (g.stateId && !civ6.states[g.stateId]?.alive) errs.push(`\u96C6\u56E3 ${id} \u304C\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6 ${g.stateId} \u306B\u5C5E\u3057\u3066\u3044\u308B`);
      let sh = 0;
      for (const c of g.cohorts) sh += c.share;
      if (Math.abs(sh - 1) > 1e-6) errs.push(`\u96C6\u56E3 ${id} \u306E\u30B3\u30DB\u30FC\u30C8\u5272\u5408\u306E\u5408\u8A08\u304C1\u3067\u306A\u3044`);
    }
    for (const wid of civ6.activeWarIds) {
      const w = civ6.wars[wid];
      if (!w || w.status !== "active") errs.push(`\u9032\u884C\u4E2D\u306E\u6226\u4E89\u306E\u8A18\u9332\u304C\u4E0D\u6B63 ${wid}`);
    }
    for (const s of Object.values(civ6.settlements)) if (!civ6.groups[s.groupId]) errs.push(`\u96C6\u843D ${s.id} \u306E\u96C6\u56E3\u304C\u7121\u3044`);
    if (sinceEvent === 0) {
      const seen = /* @__PURE__ */ new Set(), known = /* @__PURE__ */ new Set();
      for (const e of civ6.events) {
        if (seen.has(e.eventId)) errs.push(`\u30A4\u30D9\u30F3\u30C8ID\u91CD\u8907 ${e.eventId}`);
        seen.add(e.eventId);
        for (const p of e.participants) known.add(p.entityId);
      }
    } else {
      const last = civ6.events.length > 0 ? civ6.events[civ6.events.length - 1].eventId : null;
      if (last && civ6.events.slice(sinceEvent).some((e, i, a) => a.findIndex((x) => x.eventId === e.eventId) !== i)) errs.push("\u4ECA\u6708\u306E\u30A4\u30D9\u30F3\u30C8ID\u91CD\u8907");
    }
    return errs;
  }

  // js/core/wcde/domains/effective.js
  var FIELDS = Object.freeze({
    industry: { ja: "\u7523\u696D\u529B", mode: "add", min: 0, max: 1e12, half: 36, eps: 1, nominal: (c, s) => s.econ?.industry },
    perCapita: { ja: "\u4E00\u4EBA\u3042\u305F\u308A\u7523\u696D\u529B", mode: "add", min: 0, max: 1e3, half: 36, eps: 2e-3, nominal: (c, s) => s.econ?.perCapita },
    tradeIncome: { ja: "\u4EA4\u6613\u53CE\u5165", mode: "add", min: 0, max: 1e9, half: 12, eps: 0.01, nominal: (c, s) => s.econ?.tradeIncome },
    foodBalance: { ja: "\u98DF\u6599\u306E\u9700\u7D66", mode: "add", min: 0, max: 1.5, half: 12, eps: 2e-3, nominal: (c, s) => s.econ?.foodBalance },
    taxRevenue: { ja: "\u8CA1\u653F\uFF08\u7A0E\u53CE\u306E\u500D\u7387\uFF09", mode: "add", min: 0, max: 3, half: 24, eps: 2e-3, nominal: () => 1 },
    equipLevel: { ja: "\u88C5\u5099\u6C34\u6E96", mode: "add", min: 0, max: 1, half: 24, eps: 2e-3, nominal: (c, s) => s.military?.equipLevel },
    readiness: { ja: "\u7DF4\u5EA6\u30FB\u5373\u5FDC", mode: "add", min: 0, max: 1, half: 12, eps: 2e-3, nominal: (c, s) => s.military?.readiness },
    legitimacy: { ja: "\u6B63\u7D71\u6027", mode: "add", min: 0, max: 1, half: 24, eps: 2e-3, nominal: (c, s) => s.politics?.legitimacy },
    fatigue: { ja: "\u75B2\u52B4\u5EA6", mode: "add", min: 0, max: 1, half: 12, eps: 2e-3, nominal: (c, s) => s.politics?.fatigue },
    // v6.1.0 M7: 複数ドメインへの拡張（国家・人口・外交）。domain は領域の台帳の ID
    stability: { ja: "\u5B89\u5B9A\u5EA6", mode: "add", min: 0, max: 1, half: 18, eps: 2e-3, domain: "states", nominal: (c, s) => s.stability },
    popCapacity: { ja: "\u4EBA\u53E3\u306E\u53CE\u5BB9\u529B\uFF08\u500D\u7387\uFF09", mode: "add", min: 0.2, max: 3, half: 24, eps: 2e-3, domain: "population", nominal: () => 1 },
    relation: { ja: "\u95A2\u4FC2\u5024\uFF08\u3053\u306E\u56FD\u304B\u3089\u76F8\u624B\u3078\u306E\uFF09", mode: "add", min: -100, max: 100, half: 18, eps: 0.5, domain: "war_diplomacy", pair: true, nominal: (c, s, o) => s.relations?.[o] ?? 0 }
  });
  var FIELD_KEYS = Object.freeze(Object.keys(FIELDS));
  var adjKey = (field, other2 = null) => other2 ? `${field}|${other2}` : field;
  var nominalOf = (civ6, st2, key, other2 = null) => {
    const f2 = FIELDS[key];
    return f2 ? f2.nominal(civ6, st2, other2) : void 0;
  };
  function effective(civ6, st2, key, other2 = null) {
    const f2 = FIELDS[key];
    if (!f2) return 0;
    const base = f2.nominal(civ6, st2, other2);
    if (base === void 0 || base === null) return 0;
    const A2 = civ6.wcde?.adjust?.[st2.id];
    let b = base, touched = false;
    if (key === "perCapita" && A2?.industry) {
      const ni = st2.econ?.industry;
      if (ni > 0) {
        b = base * (effective(civ6, st2, "industry") / ni);
        touched = true;
      }
    }
    const adj = A2?.[adjKey(key, f2.pair ? other2 : null)];
    if (adj == null && !touched) return base;
    const v = b * (1 + (adj?.mul ?? 0)) + (adj?.add ?? 0);
    return v < f2.min ? f2.min : v > f2.max ? f2.max : v;
  }

  // js/core/wcde/domains/economy.js
  var SUBS = { forage: 0.5, fishing: 0.85, pastoral: 0.8, agriculture: 1 };
  var STAGE = { village: 1, town: 1.4, city: 2 };
  var TRADE_K = 8e-5;
  var ECON_PERIOD = 3;
  var adopted = (st2, k) => st2.techAdopted?.[k] != null;
  function computeProduction(ctx, st2, groups) {
    const { world, civ: civ6 } = ctx, ce = world.cell;
    let pop = 0, output = 0, foodNum = 0, foodDen = 0;
    const techMult = 1 + fxSum(civ6, st2, "ind", groups) + 0.4 * fxSum(civ6, st2, "cap", groups), invest = 1 + (st2.econ?.investment ?? 0);
    for (const g of groups) {
      const stage = g.settlementId ? STAGE[civ6.settlements[g.settlementId]?.stage] ?? 1 : 1;
      let fert = 0;
      const cells = g.cells ?? [g.cell];
      for (const c of cells) fert += ce.fertility[c];
      fert /= cells.length;
      const nat = (ctx.ecoMult ? ctx.ecoMult(g) : 1) * (g.capUntil > civ6.monthIndex ? g.capMult ?? 1 : 1);
      const out = g.pop * (SUBS[g.subsistence] ?? 0.5) * stage * (0.7 + 0.6 * fert) * techMult * invest * (0.4 + 0.6 * nat);
      pop += g.pop;
      output += out;
      foodNum += Math.min(1.3, 1 / Math.max(0.5, g.pressure ?? 1)) * g.pop;
      foodDen += g.pop;
    }
    return { pop, output, foodBalance: foodDen ? foodNum / foodDen : 1 };
  }
  function stepEconomy(ctx) {
    var _a;
    const { civ: civ6, ids } = ctx, mi = civ6.monthIndex;
    if (!civ6.options.wcde || mi % ECON_PERIOD !== 0) return;
    const by = byState(ctx), alive = Object.values(civ6.states).filter((s) => s.alive);
    for (const st2 of alive) {
      const gs = by.get(st2.id) ?? [], p = computeProduction(ctx, st2, gs), e = st2.econ ?? (st2.econ = { investment: 0, routes: {}, trade: {}, tradeIncome: 0, techBoost: 0 });
      e.output = p.output;
      e.industry = p.output;
      e.perCapita = p.pop ? p.output / p.pop : 0;
      e.foodBalance = p.foodBalance;
      e.investment *= 0.985;
    }
    const gain = new Map(alive.map((s) => [s.id, 0]));
    const done2 = /* @__PURE__ */ new Set();
    for (const a of alive) {
      const prevTrade = a.econ.trade;
      a.econ.trade = {};
      for (const bid of neighborStates(ctx, a)) {
        const b = civ6.states[bid], key = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
        if (done2.has(key)) {
          a.econ.trade[bid] = b.econ?.trade?.[a.id] ?? 0;
          continue;
        }
        done2.add(key);
        const war = atWarWith(civ6, a, b), sanc = (a.sanctions[b.id] ?? 0) > mi || (b.sanctions[a.id] ?? 0) > mi;
        const treaty = !!treatyBetween(civ6, a, b, "trade");
        const blockaded = (a.blockade ?? 0) > mi || (b.blockade ?? 0) > mi, open = war || sanc ? 0 : blockaded ? 0.3 : 1 + (treaty ? 1 : 0) + 1.2 * Math.min(fxSum(civ6, a, "trade"), fxSum(civ6, b, "trade"));
        const v = open ? TRADE_K * Math.sqrt(Math.max(0, effective(civ6, a, "industry") * effective(civ6, b, "industry"))) * open : 0;
        a.econ.trade[bid] = v;
        (_a = b.econ).trade ?? (_a.trade = {});
        b.econ.trade[a.id] = v;
        gain.set(a.id, gain.get(a.id) + v);
        gain.set(b.id, gain.get(b.id) + v);
        const was = a.econ.routes[bid];
        if (v > 0.05 && !was) {
          a.econ.routes[bid] = { since: mi };
          b.econ.routes[a.id] = { since: mi };
          makeEvent(civ6, ids, { kind: "trade_route_opened", title: `${a.name}\u3068${b.name}\u306E\u9593\u3067\u4EA4\u6613\u304C\u76DB\u3093\u306B\u306A\u3063\u305F`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }], effects: [{ targetId: a.id, property: "econ.tradeIncome", before: null, after: Math.round(v * 100) / 100 }], provenance: "simulation" });
        } else if (v === 0 && was) {
          delete a.econ.routes[bid];
          delete b.econ.routes[a.id];
          const dep = Math.max(prevTrade?.[bid] ?? 0, 0);
          if (dep > 0.05) makeEvent(civ6, ids, { kind: "trade_cut", title: `${a.name}\u3068${b.name}\u306E\u4EA4\u6613\u304C\u9014\u7D76\u3048\u305F\uFF08${war ? "\u6226\u4E89" : "\u5236\u88C1"}\uFF09`, participants: [{ entityId: a.id, role: "party" }, { entityId: b.id, role: "party" }], provenance: "simulation" });
          else {
          }
        }
        if (v > 0) {
          const d = 0.4;
          a.relations[b.id] = Math.min(100, (a.relations[b.id] ?? 0) + d);
          b.relations[a.id] = Math.min(100, (b.relations[a.id] ?? 0) + d);
        }
      }
    }
    for (const st2 of alive) {
      const e = st2.econ, inc = gain.get(st2.id) ?? 0;
      e.tradeIncome = inc;
      st2.treasury += effective(civ6, st2, "tradeIncome");
      e.techBoost = Math.min(0.3, 0.05 * Math.log1p(effective(civ6, st2, "tradeIncome") * 4) + (adopted(st2, "record_keeping") ? 0.04 : 0) + (adopted(st2, "writing") ? 0.06 : 0) + (adopted(st2, "administration") ? 0.05 : 0));
      const tax = st2.pop * st2.policy.tax * 12e-4 * taxMult(st2) * (ctx.taxFactor?.(st2) ?? 1), upkeep = st2.army * 6e-4 * (1 + 0.6 * (st2.military?.equipLevel ?? 0.3)) * (st2.warIds.length ? 1.5 : 1);
      st2.treasury -= upkeep;
      e.fiscal = { tax: Math.round(tax * 100) / 100, trade: Math.round(effective(civ6, st2, "tradeIncome") * 100) / 100, upkeep: Math.round(upkeep * 100) / 100 };
      if (e.foodBalance < 0.8) {
        const al = civ6.activeTreatyIds.filter((i) => {
          const t = civ6.treaties[i];
          return t.type === "alliance" && (t.a === st2.id || t.b === st2.id);
        }).length;
        st2.stability = Math.max(0, st2.stability - (0.8 - e.foodBalance) * 0.05 * (1 - Math.min(0.6, 0.3 * al)));
      }
    }
  }

  // js/core/wcde/domains/politics.js
  var FACTIONS = Object.freeze({ nobility: "\u8CB4\u65CF\u30FB\u6709\u529B\u8005", clergy: "\u8056\u8077\u8005", merchants: "\u5546\u4EBA", military: "\u8ECD", commoners: "\u6C11\u8846", bureaucrats: "\u5B98\u50DA\u30FB\u66F8\u8A18", artisans: "\u8077\u4EBA\u30FB\u5DE5\u623F", clans: "\u904A\u7267\u6C0F\u65CF" });
  var CORE_FACTIONS = Object.freeze(["nobility", "military", "commoners"]);
  var POLITICS_PERIOD = 3;
  var INFLUENCE = Object.freeze({
    tribal: { nobility: 0.3, clergy: 0.15, merchants: 0.05, military: 0.3, commoners: 0.2, bureaucrats: 0.04, artisans: 0.04, clans: 0.25 },
    chiefdom: { nobility: 0.3, clergy: 0.15, merchants: 0.1, military: 0.3, commoners: 0.15, bureaucrats: 0.05, artisans: 0.05, clans: 0.2 },
    theocracy: { nobility: 0.15, clergy: 0.45, merchants: 0.1, military: 0.15, commoners: 0.15, bureaucrats: 0.1, artisans: 0.05, clans: 0.08 },
    kingdom: { nobility: 0.35, clergy: 0.15, merchants: 0.1, military: 0.25, commoners: 0.15, bureaucrats: 0.12, artisans: 0.05, clans: 0.08 },
    empire: { nobility: 0.3, clergy: 0.1, merchants: 0.1, military: 0.35, commoners: 0.15, bureaucrats: 0.2, artisans: 0.05, clans: 0.08 },
    republic: { nobility: 0.15, clergy: 0.1, merchants: 0.3, military: 0.1, commoners: 0.35, bureaucrats: 0.1, artisans: 0.1, clans: 0.05 }
  });
  var ASSEMBLY = Object.freeze({ tribal: "\u9577\u8001\u4F1A", chiefdom: null, theocracy: "\u8056\u8077\u8005\u4F1A\u8B70", kingdom: null, empire: null, republic: "\u5E02\u6C11\u8B70\u4F1A" });
  var infl = (polity) => INFLUENCE[polity] ?? INFLUENCE.tribal;
  var clamp8 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  var sat = (x, k = 1) => clamp8(x / k);
  var adopted2 = (st2, k) => st2.techAdopted?.[k] != null;
  function socialOf(ctx, st2) {
    const { civ: civ6 } = ctx, gs = byState(ctx).get(st2.id) ?? [];
    let tot = 0, city = 0, past = 0;
    for (const g of gs) {
      tot += g.pop;
      if (g.subsistence === "pastoral") past += g.pop;
      const sg = g.settlementId ? civ6.settlements[g.settlementId]?.stage : null;
      if (sg === "town" || sg === "city") city += g.pop;
    }
    return { city: tot ? city / tot : 0, pastoral: tot ? past / tot : 0 };
  }
  function factionKeys(ctx, st2) {
    const so = socialOf(ctx, st2), trade = Object.values(st2.econ?.trade ?? {}).reduce((a, b) => a + b, 0), keys = [...CORE_FACTIONS];
    if (st2.polity === "theocracy" || st2.pop >= 2500 || st2.magic) keys.push("clergy");
    if (trade > 0 || adopted2(st2, "coinage") || so.city > 0) keys.push("merchants");
    if (adopted2(st2, "record_keeping") || adopted2(st2, "writing") || adopted2(st2, "administration")) keys.push("bureaucrats");
    if (so.city > 0.05 && fxSum(ctx.civ, st2, "ind") >= 0.1) keys.push("artisans");
    if (so.pastoral >= 0.3) keys.push("clans");
    return { keys, so };
  }
  var weightsOf = (polity, keys) => {
    const w = infl(polity);
    let t = 0;
    for (const k of keys) t += w[k] ?? 0.05;
    const o = {};
    for (const k of keys) o[k] = (w[k] ?? 0.05) / t;
    return o;
  };
  function recomputeLegitimacy(P2) {
    let l = 0;
    for (const k of Object.keys(P2.factions)) l += (P2.factions[k].influence ?? 0) * P2.factions[k].support;
    P2.legitimacy = l;
    return l;
  }
  function initPolitics(st2) {
    const f2 = {};
    for (const k of ["nobility", "clergy", "merchants", "military", "commoners"]) f2[k] = { support: 0.55 };
    return { factions: f2, ideas: {}, assembly: ASSEMBLY[st2.polity] ?? (adopted2(st2, "administration") ? "\u8AEE\u554F\u4F1A\u8B70" : null), legitimacy: 0.55, fatigue: 0, taxCeiling: 0.4, lastRegimeChange: -999 };
  }
  var IDEAS = Object.freeze({
    mercantilism: { ja: "\u5546\u696D\u4E3B\u7FA9", pro: { merchants: 0.12, artisans: 0.06 }, con: { nobility: -0.04 } },
    martialism: { ja: "\u5C1A\u6B66\u306E\u6C17\u98A8", pro: { military: 0.12 }, con: { commoners: -0.05 } },
    egalitarianism: { ja: "\u5E73\u7B49\u4E3B\u7FA9", pro: { commoners: 0.12 }, con: { nobility: -0.08 } },
    piety: { ja: "\u656C\u8654\u4E3B\u7FA9", pro: { clergy: 0.12 }, con: { merchants: -0.04 } },
    legalism: { ja: "\u6CD5\u6CBB\u4E3B\u7FA9", pro: { bureaucrats: 0.12, merchants: 0.04 }, con: { clans: -0.05 } },
    traditionalism: { ja: "\u4F1D\u7D71\u4E3B\u7FA9", pro: { nobility: 0.12, clans: 0.05 }, con: { artisans: -0.04 } },
    reformism: { ja: "\u6539\u9769\u5FD7\u5411", pro: { artisans: 0.1, bureaucrats: 0.05 }, con: { nobility: -0.05 } }
  });
  function emergence(ctx, st2, id, inf, trade) {
    const P2 = st2.politics, x = st2.military?.exp ?? {}, tax = st2.policy.tax;
    switch (id) {
      case "mercantilism":
        return 0.9 * (inf.merchants ?? 0) + 0.4 * Math.min(1, trade) + (adopted2(st2, "coinage") ? 0.2 : 0);
      case "martialism":
        return 0.5 * sat(st2.warIds.length, 3) + 0.4 * sat((x.won ?? 0) + (x.sieges ?? 0), 10) + 0.3 * (inf.military ?? 0);
      case "egalitarianism":
        return (st2.polity === "republic" ? 0.55 : 0) + 0.4 * (1 - 2 * tax > 0 ? 1 - 2 * tax : 0) * effective(ctx.civ, st2, "stability") + 0.2 * (1 - (st2.policy.autonomy ?? 0));
      case "piety":
        return (st2.polity === "theocracy" ? 0.7 : 0) + 0.6 * (inf.clergy ?? 0);
      case "legalism":
        return (adopted2(st2, "administration") ? 0.5 : 0) + (adopted2(st2, "writing") ? 0.15 : 0) + 0.4 * (inf.bureaucrats ?? 0);
      case "traditionalism":
        return (st2.polity === "kingdom" ? 0.45 : 0) + 0.5 * (inf.nobility ?? 0) + 0.15 * (st2.leader?.heir ? 1 : 0);
      case "reformism":
        return 0.5 * (1 - effective(ctx.civ, st2, "stability")) * (1 - P2.legitimacy * 0.5) + 0.25 * Math.min(1, trade) + 0.2 * sat(Object.keys(st2.techAdopted ?? {}).length, 40);
    }
    return 0;
  }
  function stepIdeas(ctx, st2, wts, trade) {
    const { civ: civ6, ids } = ctx, P2 = st2.politics, W2 = civ6.wcde, inf = {};
    for (const k in P2.factions) inf[k] = wts[k] ?? 0;
    const ideas = P2.ideas ?? (P2.ideas = {}), accept = 0.5 + 0.5 * (st2.policy.tolerance ?? 0.5);
    const contacts = [.../* @__PURE__ */ new Set([...ctx.world?.mesh ? neighborStates(ctx, st2) : [], ...Object.keys(st2.econ?.trade ?? {})])].map((i) => civ6.states[i]).filter((o) => o?.alive && o.politics), ally = new Set(civ6.activeTreatyIds.map((i) => civ6.treaties[i]).filter((t) => t.type === "alliance" && (t.a === st2.id || t.b === st2.id)).map((t) => t.a === st2.id ? t.b : t.a));
    for (const id in IDEAS) {
      const cur = ideas[id] ?? 0, tgt = clamp8(emergence(ctx, st2, id, inf, trade));
      let net = 0;
      for (const o of contacts) net = Math.max(net, (o.politics.ideas?.[id] ?? 0) * (ally.has(o.id) ? 0.9 : o.econ?.trade?.[st2.id] ? 0.8 : 0.6));
      let nv = cur + 0.12 * (tgt - cur) + Math.max(0, net * accept - cur) * 0.2;
      if (tgt < cur) nv -= 0.015;
      nv = clamp8(nv);
      if (nv < 0.03) delete ideas[id];
      else ideas[id] = Math.round(nv * 1e3) / 1e3;
      const reg = W2.ideas ?? (W2.ideas = {});
      if (nv >= 0.35 && !reg[id]) {
        reg[id] = { at: civ6.monthIndex, stateId: st2.id };
        makeEvent(civ6, ids, { kind: "ideology_emerged", title: `${st2.name}\u3067\u300C${IDEAS[id].ja}\u300D\u304C\u5E83\u307E\u308A\u59CB\u3081\u305F`, participants: [{ entityId: st2.id, role: "state" }], facts: { idea: id, ja: IDEAS[id].ja, stateId: st2.id }, provenance: "simulation" });
      }
    }
  }
  var ideasOf = (st2) => Object.entries(st2.politics?.ideas ?? {}).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, ja: IDEAS[id]?.ja ?? id, v }));
  var treatiesOf = (civ6, st2) => {
    const o = { trade: 0, alliance: 0, nonaggression: 0 };
    for (const i of civ6.activeTreatyIds) {
      const t = civ6.treaties[i];
      if (t && (t.a === st2.id || t.b === st2.id) && t.type in o) o[t.type]++;
    }
    return o;
  };
  function supportTargets(ctx, st2) {
    const { civ: civ6 } = ctx, e = st2.econ ?? {}, p = st2.policy, war = st2.warIds.length > 0, trade = Object.values(e.trade ?? {}).reduce((a, b) => a + b, 0), perCap = e.perCapita ?? 0.6;
    const fat = effective(civ6, st2, "fatigue"), tr = treatiesOf(civ6, st2), mi = civ6.monthIndex, heir = st2.leader?.heir ? 1 : 0, hered = st2.polity === "kingdom" || st2.polity === "empire" || st2.polity === "chiefdom", blockaded = (st2.blockade ?? 0) > mi;
    const t = {
      commoners: clamp8(0.35 + 0.5 * effective(ctx.civ, st2, "stability") + 0.25 * (e.foodBalance ?? 1) - 0.8 * p.tax - 0.4 * fat - 0.25 * p.mobilization),
      merchants: clamp8(0.35 + 0.25 * Math.min(1, trade * 2) + 0.15 * (adopted2(st2, "coinage") ? 1 : 0) + 0.15 * (1 - p.tax * 2) - (war ? 0.15 : 0) + Math.min(0.12, 0.04 * tr.trade) - (blockaded ? 0.15 : 0) - (st2.sanctions?.length ? 0.08 : 0)),
      clergy: clamp8(0.3 + (st2.polity === "theocracy" ? 0.35 : 0) + 0.2 * (1 - p.assimilation) + 0.15 * p.tolerance + (st2.magic ? 0.1 : 0)),
      military: clamp8(0.35 + 0.4 * p.mobilization + (war ? 0.15 : 0) + 0.15 * (st2.treasury > 0 ? 1 : 0) - 0.3 * fat - Math.min(0.12, 0.04 * tr.nonaggression)),
      nobility: clamp8(0.4 + 0.25 * (1 - p.tax) + 0.2 * effective(ctx.civ, st2, "stability") + (adopted2(st2, "bureaucracy") ? -0.2 : 0) + 0.1 * p.autonomy + Math.min(0.09, 0.03 * tr.alliance) + (hered ? heir ? 0.06 : -0.04 : 0)),
      bureaucrats: clamp8(0.35 + 0.25 * (st2.treasury > 0 ? 1 : 0) + 0.3 * effective(ctx.civ, st2, "stability") + 0.2 * (adopted2(st2, "administration") ? 1 : 0) - 0.15 * (p.autonomy ?? 0)),
      artisans: clamp8(0.35 + 0.3 * Math.min(1, trade * 2) + 0.25 * (1 - p.tax * 2) + 0.2 * Math.min(1, perCap) - (war ? 0.08 : 0)),
      clans: clamp8(0.4 + 0.3 * (p.autonomy ?? 0) - 0.3 * (p.assimilation ?? 0) - 0.3 * p.tax + 0.1 * (war ? 1 : 0))
    };
    for (const id in st2.politics?.ideas ?? {}) {
      const s = st2.politics.ideas[id], d = IDEAS[id];
      if (!d) continue;
      for (const k in d.pro) if (k in t) t[k] = clamp8(t[k] + d.pro[k] * s);
      for (const k in d.con) if (k in t) t[k] = clamp8(t[k] + d.con[k] * s);
    }
    return t;
  }
  function stepPolitics(ctx) {
    var _a;
    const { civ: civ6, ids } = ctx, mi = civ6.monthIndex;
    if (!civ6.options.wcde || mi % POLITICS_PERIOD !== 0) return;
    for (const st2 of Object.values(civ6.states)) {
      if (!st2.alive) continue;
      const P2 = st2.politics ?? (st2.politics = initPolitics(st2));
      P2.fatigue = clamp8(P2.fatigue + (st2.warIds.length ? 0.025 * st2.warIds.length : -0.02));
      const { keys } = factionKeys(ctx, st2), w = weightsOf(st2.polity, keys);
      for (const k of keys) (_a = P2.factions)[k] ?? (_a[k] = { support: 0.5 });
      for (const k of Object.keys(P2.factions)) if (!keys.includes(k)) delete P2.factions[k];
      const trade = Object.values(st2.econ?.trade ?? {}).reduce((a, b) => a + b, 0);
      stepIdeas(ctx, st2, w, trade);
      const tgt = supportTargets(ctx, st2);
      let leg = 0;
      for (const k of keys) {
        const f2 = P2.factions[k];
        f2.support = clamp8(f2.support + (tgt[k] - f2.support) * 0.25);
        f2.influence = Math.round(w[k] * 1e3) / 1e3;
        leg += f2.influence * f2.support;
      }
      P2.legitimacy = leg;
      const legE = effective(civ6, st2, "legitimacy");
      P2.assembly = ASSEMBLY[st2.polity] ?? (adopted2(st2, "administration") ? "\u8AEE\u554F\u4F1A\u8B70" : null);
      P2.taxCeiling = Math.round((0.15 + 0.5 * legE) * 1e3) / 1e3;
      st2.stability = clamp8(st2.stability + (legE - 0.5) * 0.04);
      if (st2.policy.tax > P2.taxCeiling) st2.policy.tax = Math.round(P2.taxCeiling * 1e3) / 1e3;
      if (legE < 0.3 && mi - P2.lastRegimeChange > 120 && hashSeed(st2.id, mi) % 1e3 / 1e3 < 0.1 * (0.3 - legE) / 0.3 + 0.02) regimeChange(ctx, st2);
    }
  }
  function regimeChange(ctx, st2) {
    const { civ: civ6, ids } = ctx, P2 = st2.politics, mi = civ6.monthIndex, f2 = P2.factions, who = f2.commoners.support <= f2.military.support ? "commoners" : "military";
    const before = st2.polity, can2 = (pl) => pl === "tribal" || stateCan(civ6, st2, { chiefdom: "polity:chiefdom", theocracy: "polity:chiefdom", kingdom: "polity:kingdom", republic: "polity:republic", empire: "polity:empire" }[pl]);
    let to = st2.polity;
    if (who === "commoners" && (st2.polity === "kingdom" || st2.polity === "empire" || st2.polity === "chiefdom") && can2("republic")) to = "republic";
    else if (who === "military" && (st2.polity === "republic" || st2.polity === "theocracy")) to = can2("empire") && st2.pop > 2e4 ? "empire" : can2("kingdom") ? "kingdom" : st2.polity;
    const causes = [];
    const war = civ6.events.slice(-60).reverse().find((e) => (e.kind === "war_declared" || e.kind === "war_ended") && e.participants.some((p) => p.entityId === st2.id));
    if (war) causes.push({ targetId: war.id, relation: "caused_by", basis: "plausible" });
    st2.polity = to;
    P2.lastRegimeChange = mi;
    st2.stability = clamp8(st2.stability - 0.25);
    P2.fatigue = Math.max(0, P2.fatigue - 0.3);
    for (const k of Object.keys(f2)) f2[k].support = clamp8(f2[k].support + 0.15);
    if (who === "commoners" && f2.nobility) f2.nobility.support = clamp8(f2.nobility.support - 0.15);
    if (who === "military") f2.military.support = clamp8(f2.military.support + 0.1);
    const how = who === "commoners" ? before !== to ? "\u6C11\u8846\u306E\u8702\u8D77\u3067\u653F\u4F53\u304C\u5909\u308F\u3063\u305F" : "\u6C11\u8846\u306E\u8702\u8D77\u3067\u653F\u6A29\u304C\u5012\u308C\u305F" : before !== to ? "\u8ECD\u304C\u653F\u6A29\u3092\u63E1\u308A\u653F\u4F53\u304C\u5909\u308F\u3063\u305F" : "\u8ECD\u306B\u3088\u308B\u5BAE\u5EF7\u306E\u653F\u5909";
    const oldName = st2.name, rt = before !== to ? retitle(st2, to) : null;
    if (rt) {
      st2.name = rt.name;
      st2.nameBase = rt.base;
    }
    makeEvent(civ6, ids, { kind: "regime_change", title: `${oldName}\u3067\u653F\u5909\u304C\u8D77\u304D\u305F\uFF08${how}\uFF09${rt ? `\u3002\u56FD\u53F7\u306F${rt.name}\u3068\u6539\u307E\u3063\u305F` : ""}`, participants: [{ entityId: st2.id, role: "state" }], effects: [{ targetId: st2.id, property: "polity", before, after: to }, ...rt ? [{ targetId: st2.id, property: "name", before: oldName, after: rt.name }] : [], { targetId: st2.id, property: "stability", before: null, after: Math.round(st2.stability * 100) / 100 }], causes, facts: { stateId: st2.id, polity: to, name: st2.name, by: who }, provenance: "simulation" });
    st2.leader = { name: leaderName(st2, ctx.nameGen?.person(civ6, civ6.groups[st2.capitalGroupId], ctx.rng) ?? `${st2.name}\u306E\u65B0\u6307\u5C0E\u8005`, leaderRng(civ6, st2, "regime")), bornAt: mi - Math.round((300 + Math.floor(ctx.rng() * 200)) * lifeScale(civ6, { capitalGroupId: st2.capitalGroupId })), heir: false, deposed: true, origin: who };
  }

  // js/core/wcde/domains/doctrine.js
  var FX_KEYS = Object.freeze(["off", "def", "logi", "attr", "naval", "siege", "adapt", "coh", "landing"]);
  var CAP = Object.freeze({ off: 0.25, def: 0.4, logi: 0.3, attr: 0.25, naval: 0.35, siege: 0.3, adapt: 0.2, coh: 0.25, landing: 0.25 });
  var BRANCH_SHARE = 0.6;
  var FX_JA = Object.freeze({ off: "\u653B\u6483", def: "\u9632\u5FA1", logi: "\u88DC\u7D66", attr: "\u640D\u8017\u8EFD\u6E1B", naval: "\u6D77\u8ECD\u904B\u7528", siege: "\u653B\u57CE", adapt: "\u6226\u5834\u9069\u5FDC", coh: "\u58EB\u6C17\u306E\u7D50\u675F", landing: "\u4E0A\u9678" });
  var N = (id, ja, branch, tier, prereq, tech, cost, fx3) => ({ id, ja, branch, tier, prereq, tech, cost, fx: fx3, special: false });
  var COMMON_BRANCHES = Object.freeze([
    { id: "infantry", ja: "\u9678\u6226" },
    { id: "mobility", ja: "\u6A5F\u52D5" },
    { id: "defense", ja: "\u9632\u885B\u30FB\u7BC9\u57CE" },
    { id: "logistics", ja: "\u5175\u7AD9\u30FB\u7D44\u7E54" },
    { id: "sea", ja: "\u6D77\u6D0B" }
  ]);
  var COMMON_NODES = Object.freeze([
    N("levy_drill", "\u5FB4\u96C6\u5175\u306E\u8A13\u7DF4", "infantry", 1, [], [], 20, { off: 0.03, def: 0.02 }),
    N("spear_phalanx", "\u5BC6\u96C6\u69CD\u9663", "infantry", 2, ["levy_drill"], ["bronze_weapons"], 55, { off: 0.04, def: 0.05 }),
    N("heavy_infantry", "\u91CD\u88C5\u6B69\u5175", "infantry", 3, ["spear_phalanx"], ["iron_weapons"], 110, { off: 0.06, def: 0.04, coh: 0.04 }),
    N("gun_line", "\u7DDA\u5F62\u6226\u5217", "infantry", 4, ["heavy_infantry"], ["gunpowder"], 300, { off: 0.09, def: 0.03, coh: 0.03 }),
    N("open_order", "\u6563\u958B\u6226\u8853", "infantry", 5, ["gun_line"], ["rifled_arms"], 520, { off: 0.08, def: 0.05, attr: 0.04 }),
    N("scout_screen", "\u65A5\u5019\u7DB2", "mobility", 1, [], [], 20, { adapt: 0.03, logi: 0.02 }),
    N("mounted_charge", "\u9A0E\u5175\u7A81\u6483", "mobility", 2, ["scout_screen"], ["horse_riding"], 70, { off: 0.07, adapt: 0.02 }),
    N("horse_archery", "\u9A0E\u5C04", "mobility", 3, ["mounted_charge"], ["horse_riding", "bow"], 100, { off: 0.06, adapt: 0.04 }),
    N("combined_arms", "\u8AF8\u5175\u79D1\u9023\u5408", "mobility", 4, ["horse_archery", "heavy_infantry"], ["cavalry"], 180, { off: 0.07, def: 0.03, coh: 0.03 }),
    N("mobile_warfare", "\u6A5F\u52D5\u6226", "mobility", 5, ["combined_arms"], ["mechanized_warfare"], 600, { off: 0.1, adapt: 0.06, logi: 0.05 }),
    N("shield_wall", "\u76FE\u306E\u58C1", "defense", 1, [], [], 25, { def: 0.06 }),
    N("fortified_camp", "\u91CE\u55B6\u7BC9\u57CE", "defense", 2, ["shield_wall"], ["fortification"], 60, { def: 0.08, attr: 0.02 }),
    N("siege_craft", "\u653B\u57CE\u8853", "defense", 3, ["fortified_camp"], ["siege_engines"], 120, { off: 0.04, siege: 0.12 }),
    N("bastion_forts", "\u7A1C\u5821\u5F0F\u7BC9\u57CE", "defense", 4, ["siege_craft"], ["gunpowder"], 320, { def: 0.1, siege: 0.1 }),
    N("depth_defense", "\u7E26\u6DF1\u9632\u5FA1", "defense", 5, ["bastion_forts"], ["artillery"], 560, { def: 0.1, attr: 0.04, coh: 0.03 }),
    N("supply_train", "\u88DC\u7D66\u7DDA\u306E\u6574\u5099", "logistics", 1, [], [], 25, { logi: 0.05 }),
    N("standing_army", "\u5E38\u5099\u8ECD", "logistics", 2, ["supply_train"], ["administration"], 200, { off: 0.06, def: 0.04, logi: 0.03 }),
    N("officer_corps", "\u5C06\u6821\u56E3", "logistics", 3, ["standing_army"], ["writing"], 220, { off: 0.05, def: 0.03, coh: 0.05 }),
    N("general_staff", "\u53C2\u8B00\u7D44\u7E54", "logistics", 4, ["officer_corps"], ["mathematics"], 350, { off: 0.06, def: 0.04, coh: 0.04 }),
    N("rear_services", "\u5F8C\u65B9\u652F\u63F4", "logistics", 5, ["general_staff"], ["military_logistics"], 420, { logi: 0.12, attr: 0.08 }),
    N("river_craft", "\u821F\u904B\u3068\u6E21\u6CB3", "sea", 1, [], ["seafaring"], 30, { naval: 0.05, logi: 0.02 }),
    N("naval_marines", "\u6D77\u5175", "sea", 2, ["river_craft"], ["shipbuilding"], 110, { off: 0.04, naval: 0.08, landing: 0.06 }),
    N("coast_defense", "\u6CBF\u5CB8\u9632\u885B", "sea", 3, ["naval_marines"], ["shipbuilding"], 100, { def: 0.06, naval: 0.05 }),
    N("fleet_doctrine", "\u8266\u968A\u904B\u7528", "sea", 4, ["coast_defense"], ["naval_warfare"], 240, { off: 0.03, naval: 0.15 }),
    N("blue_water", "\u5916\u6D0B\u9060\u5F81", "sea", 5, ["fleet_doctrine"], ["navigation"], 380, { naval: 0.1, logi: 0.05, landing: 0.12 })
  ]);
  var COMMON_BY_ID = Object.freeze(Object.fromEntries(COMMON_NODES.map((d) => [d.id, d])));
  var S = (id, ja, score, tiers) => ({ id, ja, score, tiers });
  var T = (ja, tier, tech, cost, fx3) => ({ ja, tier, tech, cost, fx: fx3 });
  var sat2 = (x, k = 1) => Math.max(0, Math.min(1, x / k));
  var SPECIAL_TEMPLATES = Object.freeze([
    S("steppe_riders", "\u8349\u539F\u306E\u9A0E\u5C04", (i) => 0.9 * i.pastoral + 0.5 * i.steppe, [T("\u9A0E\u99AC\u306E\u6C0F\u65CF\u8ECD", 1, [], 30, { off: 0.04, adapt: 0.03 }), T("\u79FB\u52D5\u3059\u308B\u672C\u55B6", 2, ["horse_riding"], 70, { logi: 0.07, adapt: 0.04 }), T("\u5305\u56F2\u3068\u507D\u88C5\u9000\u5374", 3, ["horse_riding"], 130, { off: 0.07, attr: 0.04 })]),
    S("mountain_war", "\u5C71\u5CB3\u6226", (i) => 1.1 * i.mountain, [T("\u5CE0\u306E\u5B88\u308A", 1, [], 30, { def: 0.06 }), T("\u5C71\u306E\u9698\u8DEF", 2, [], 70, { def: 0.05, adapt: 0.05 }), T("\u5C71\u306E\u904A\u6483", 3, ["bow"], 120, { off: 0.04, attr: 0.06, adapt: 0.04 })]),
    S("river_war", "\u6CB3\u5DDD\u30FB\u6E7F\u5730\u6226", (i) => 1 * i.river + 0.3 * i.wet, [T("\u6E21\u6CB3\u306E\u5099\u3048", 1, [], 30, { adapt: 0.04, def: 0.02 }), T("\u6CB3\u5DDD\u306E\u821F\u5175", 2, ["seafaring"], 70, { naval: 0.06, logi: 0.04 }), T("\u6C34\u9678\u306E\u6A5F\u52D5", 3, ["shipbuilding"], 120, { off: 0.04, landing: 0.06, adapt: 0.03 })]),
    S("warband", "\u6226\u58EB\u56E3\u306E\u7D46", (i) => (i.polity === "tribal" ? 0.7 : i.polity === "chiefdom" ? 0.55 : 0) + 0.3 * i.inf.military, [T("\u8972\u6483\u306E\u4F5C\u6CD5", 1, [], 25, { off: 0.05 }), T("\u6226\u58EB\u56E3\u306E\u8A93\u3044", 2, [], 50, { off: 0.04, coh: 0.05 }), T("\u9996\u9577\u306E\u89AA\u885B", 3, ["bronze_weapons"], 100, { def: 0.05, coh: 0.06 })]),
    S("feudal_knights", "\u5C01\u5EFA\u306E\u8ECD\u5F79", (i) => (i.polity === "kingdom" ? 0.6 : 0) + 0.8 * i.inf.nobility, [T("\u9818\u4E3B\u306E\u8ECD\u5F79", 1, [], 50, { off: 0.04, def: 0.03 }), T("\u9A0E\u58EB\u56E3", 2, ["horse_riding"], 120, { off: 0.08, coh: 0.03 }), T("\u57CE\u585E\u3068\u5C01\u571F", 3, ["fortification"], 150, { def: 0.08, attr: 0.03 })]),
    S("temple_host", "\u8056\u6226\u3068\u795E\u6BBF", (i) => (i.polity === "theocracy" ? 0.8 : 0) + 0.9 * i.inf.clergy, [T("\u8056\u6226\u306E\u6559\u3048", 1, [], 60, { off: 0.06, coh: 0.04 }), T("\u795E\u6BBF\u5B88\u8B77", 2, ["construction"], 90, { def: 0.07, coh: 0.04 }), T("\u6B89\u6559\u306E\u899A\u609F", 3, [], 130, { attr: 0.07, coh: 0.06 })]),
    S("citizen_army", "\u5E02\u6C11\u306E\u8ECD", (i) => (i.polity === "republic" ? 0.7 : 0) + 0.7 * i.inf.commoners, [T("\u5E02\u6C11\u7686\u5175", 1, [], 55, { def: 0.06, coh: 0.03 }), T("\u5E02\u6C11\u306E\u6226\u5217", 2, ["iron_weapons"], 110, { off: 0.04, def: 0.05, coh: 0.04 }), T("\u5FD7\u9858\u306E\u5C06\u6821", 3, ["writing"], 160, { off: 0.05, coh: 0.06 })]),
    S("imperial_legions", "\u8ECD\u56E3\u3068\u5B98\u50DA", (i) => (i.polity === "empire" ? 0.8 : 0) + (i.admin ? 0.4 : 0) + 0.3 * i.inf.military, [T("\u8ECD\u56E3\u5236", 1, ["iron_weapons"], 130, { off: 0.06, def: 0.04 }), T("\u8857\u9053\u3068\u99D0\u5C6F", 2, ["construction"], 150, { logi: 0.1, def: 0.03 }), T("\u5B98\u50DA\u306E\u5175\u7AD9", 3, ["administration"], 220, { logi: 0.08, attr: 0.05 })]),
    S("maritime_league", "\u6D77\u4E0A\u306E\u8B77\u308A", (i) => 0.9 * i.coast + 0.6 * i.inf.merchants + 0.4 * sat2(i.trade, 1), [T("\u6CBF\u5CB8\u306E\u8B77\u885B\u8239", 1, ["seafaring"], 50, { naval: 0.06 }), T("\u5546\u8239\u306E\u6B66\u88C5", 2, ["shipbuilding"], 110, { naval: 0.08, logi: 0.04 }), T("\u901A\u5546\u8DEF\u306E\u5236\u6D77", 3, ["naval_warfare"], 200, { naval: 0.1, landing: 0.05 })]),
    S("fortress_towns", "\u57CE\u5E02\u306E\u5B88\u308A", (i) => 0.9 * i.city + 0.5 * sat2(i.expDef, 6), [T("\u57CE\u9580\u3068\u5E02\u58C1", 1, [], 40, { def: 0.06 }), T("\u5E02\u6C11\u306E\u5B88\u5099\u968A", 2, ["fortification"], 100, { def: 0.07, coh: 0.04 }), T("\u7C60\u57CE\u306E\u5099\u84C4", 3, ["fortification"], 150, { attr: 0.07, def: 0.05 })]),
    S("expedition", "\u9060\u5F81\u306E\u8ECD", (i) => 0.8 * sat2(i.expOff, 8) + (i.polity === "empire" || i.polity === "kingdom" ? 0.25 : 0), [T("\u9060\u5F81\u306E\u968A\u5217", 1, [], 60, { logi: 0.05, off: 0.03 }), T("\u73FE\u5730\u8ABF\u9054", 2, [], 110, { logi: 0.08, attr: 0.03 }), T("\u96FB\u6483\u306E\u9032\u8ECD", 3, ["military_logistics"], 200, { off: 0.07, adapt: 0.05 })]),
    S("irregular_war", "\u7FA9\u52C7\u3068\u904A\u6483", (i) => 0.7 * sat2(i.expLost, 6) + 0.4 * (1 - i.stability), [T("\u5728\u5730\u306E\u7FA9\u52C7", 1, [], 25, { def: 0.04, adapt: 0.04 }), T("\u904A\u6483\u3068\u64B9\u4E71", 2, [], 60, { attr: 0.05, adapt: 0.05 }), T("\u4F4F\u6C11\u306E\u652F\u3048", 3, [], 100, { coh: 0.07, def: 0.04 })]),
    // 下の 2 つは、どの条件にも当てはまらない国家の受け皿
    S("levy_tradition", "\u6C11\u5175\u306E\u4F1D\u7D71", () => 0.1, [T("\u6751\u306E\u6C11\u5175", 1, [], 20, { def: 0.04 }), T("\u5B63\u7BC0\u306E\u52D5\u54E1", 2, [], 50, { logi: 0.04, off: 0.03 }), T("\u5728\u90F7\u306E\u5C06", 3, [], 90, { coh: 0.05, off: 0.03 })]),
    S("border_guard", "\u8FBA\u5883\u306E\u5B88\u308A", () => 0.09, [T("\u70FD\u706B\u3068\u7826", 1, [], 25, { def: 0.04, adapt: 0.02 }), T("\u8FBA\u5883\u306E\u5C6F\u7530", 2, [], 60, { logi: 0.05 }), T("\u56FD\u5883\u306E\u6A5F\u52D5", 3, [], 100, { adapt: 0.05, off: 0.03 })])
  ]);
  var TPL = Object.freeze(Object.fromEntries(SPECIAL_TEMPLATES.map((t) => [t.id, t])));
  function doctrineInfo(ctx, st2) {
    const { world, civ: civ6 } = ctx, ce = world.cell, gs = byState(ctx).get(st2.id) ?? [], P2 = st2.politics, inf = { nobility: 0, clergy: 0, merchants: 0, military: 0, commoners: 0 };
    if (P2) for (const k of Object.keys(inf)) inf[k] = P2.factions[k]?.influence ?? 0;
    let tot = 0, past = 0, mtn = 0, riv = 0, coast = 0, steppe = 0, wet = 0, city = 0;
    for (const g of gs) {
      tot += g.pop;
      const c = g.cell;
      if (g.subsistence === "pastoral") past += g.pop;
      if ((ce.mountain?.[c] ?? 0) > 0 || ce.biome[c] === BIOMES2.ALPINE) mtn += g.pop;
      if (ce.river[c]) riv += g.pop;
      if (ce.coastDist[c] <= 1) coast += g.pop;
      const b = ce.biome[c];
      if (b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA || b === BIOMES2.COLD_DESERT) steppe += g.pop;
      if (b === BIOMES2.WETLAND) wet += g.pop;
      const s = g.settlementId ? civ6.settlements[g.settlementId]?.stage : null;
      if (s === "town" || s === "city") city += g.pop;
    }
    const f2 = (x2) => tot ? x2 / tot : 0, x = st2.military?.exp ?? {};
    return { polity: st2.polity, inf, pastoral: f2(past), mountain: f2(mtn), river: f2(riv), coast: f2(coast), steppe: f2(steppe), wet: f2(wet), city: f2(city), trade: Object.values(st2.econ?.trade ?? {}).reduce((a, b) => a + b, 0), admin: st2.techAdopted?.administration != null, stability: st2.stability, expOff: (x.won ?? 0) + (x.sieges ?? 0), expDef: x.defended ?? 0, expLost: x.lost ?? 0 };
  }
  function chooseSpecial(info, prev = []) {
    const keep = new Set(prev.map((b) => b.key)), list = SPECIAL_TEMPLATES.map((t) => ({ t, s: t.score(info) + (keep.has(t.id) ? 0.12 : 0) })).sort((a, b) => b.s - a.s || (a.t.id < b.t.id ? -1 : 1)).slice(0, 3);
    return list.map(({ t }, bi) => ({ key: t.id, ja: t.ja, lane: bi, nodes: t.tiers.map((x) => ({ id: `sp:${t.id}:${x.tier}`, ja: x.ja, branch: `sp:${t.id}`, tier: x.tier, prereq: x.tier > 1 ? [`sp:${t.id}:${x.tier - 1}`] : [], tech: x.tech, cost: x.cost, fx: x.fx, special: true })) }));
  }
  var nodesOf = (st2) => [...COMMON_NODES, ...(st2.military?.special ?? []).flatMap((b) => b.nodes)];
  var nodeOf = (st2, id) => COMMON_BY_ID[id] ?? (st2.military?.special ?? []).flatMap((b) => b.nodes).find((n2) => n2.id === id) ?? null;
  var branchesOf = (st2) => [...COMMON_BRANCHES.map((b) => ({ ...b, special: false })), ...(st2.military?.special ?? []).map((b) => ({ id: `sp:${b.key}`, ja: b.ja, special: true }))];
  function activeNodes(st2) {
    const taken = st2.military?.doctrine?.taken ?? {}, sp = new Set((st2.military?.special ?? []).map((b) => `sp:${b.key}`)), out = [];
    for (const id in taken) {
      const n2 = nodeOf(st2, id);
      if (n2 && (!n2.special || sp.has(n2.branch))) out.push(n2);
    }
    return out;
  }
  function doctrineFx(st2) {
    const by = /* @__PURE__ */ new Map();
    for (const n2 of activeNodes(st2)) {
      const m = by.get(n2.branch) ?? by.set(n2.branch, {}).get(n2.branch);
      for (const k in n2.fx) m[k] = (m[k] ?? 0) + n2.fx[k];
    }
    const out = Object.fromEntries(FX_KEYS.map((k) => [k, 0]));
    for (const m of by.values()) for (const k in m) out[k] += Math.min(m[k], CAP[k] * BRANCH_SHARE);
    for (const k of FX_KEYS) out[k] = Math.round(Math.min(out[k], CAP[k]) * 1e3) / 1e3;
    return out;
  }

  // js/core/wcde/domains/military.js
  var clamp9 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  var has = (st2, k) => st2.techAdopted?.[k] != null;
  var can = (ctx, st2, cap) => stateCan(ctx.civ, st2, cap);
  var UNIT_KINDS = Object.freeze({
    infantry: { ja: "\u6B69\u5175", need: () => true },
    ranged: { ja: "\u5F13\u30FB\u6295\u5C04\u5175", need: (st2, ctx) => can(ctx, st2, "unit:ranged") },
    cavalry: { ja: "\u9A0E\u5175", need: (st2, ctx) => can(ctx, st2, "unit:cavalry") },
    navy: { ja: "\u6C34\u8ECD", need: (st2, ctx) => can(ctx, st2, "unit:navy") && coastal(ctx, st2) },
    garrison: { ja: "\u5B88\u5099\u5175", need: (st2, ctx) => can(ctx, st2, "unit:garrison") },
    firearms: { ja: "\u9283\u5175", need: (st2, ctx) => can(ctx, st2, "unit:firearms") }
  });
  var TERMS = {
    infantry: [["gunpowder", "\u7DDA\u5217\u6B69\u5175\u56E3"], ["steel", "\u7CBE\u92ED\u6B69\u5175\u56E3"], ["iron_weapons", "\u91CD\u88C5\u6B69\u5175\u56E3"], ["bronze_weapons", "\u69CD\u5175\u56E3"], [null, "\u6226\u58EB\u56E3"]],
    ranged: [["steel", "\u5F29\u5175\u56E3"], ["bronze_weapons", "\u5F13\u5175\u56E3"], [null, "\u6295\u5C04\u5175\u56E3"]],
    cavalry: [["gunpowder", "\u80F8\u7532\u9A0E\u5175\u56E3"], ["iron_weapons", "\u91CD\u9A0E\u5175\u56E3"], [null, "\u9A0E\u99AC\u968A"]],
    navy: [["gunpowder", "\u5927\u8266\u968A"], ["war:naval", "\u8266\u968A"], [null, "\u821F\u8ECD"]],
    garrison: [["fortification", "\u57CE\u585E\u5B88\u5099\u8ECD"], [null, "\u5B88\u5099\u968A"]],
    firearms: [["steel", "\u8FD1\u885B\u9283\u5175\u56E3"], [null, "\u9283\u5175\u56E3"]]
  };
  function unitTerm(st2, kind) {
    for (const [k, t] of TERMS[kind] ?? []) if (k == null || has(st2, k) || k === "war:naval" && st2.techAdopted?.naval_warfare != null) return t;
    return UNIT_KINDS[kind]?.ja ?? kind;
  }
  function unitName(st2, kind) {
    const fx3 = st2.military?.fx ?? {}, tag = (fx3.off ?? 0) >= 0.06 && (fx3.off ?? 0) >= (fx3.def ?? 0) ? "\u7A81\u6483" : (fx3.def ?? 0) >= 0.08 ? "\u5805\u9663" : "";
    return `${tag}${unitTerm(st2, kind)}`;
  }
  function formationsOf(st2, u) {
    const per = has(st2, "gunpowder") ? 6e3 : has(st2, "iron_weapons") ? 3e3 : 1200, n2 = Math.max(1, Math.min(6, Math.round(u.size / per))), term = unitName(st2, u.kind), ORD = ["\u7B2C\u4E00", "\u7B2C\u4E8C", "\u7B2C\u4E09", "\u7B2C\u56DB", "\u7B2C\u4E94", "\u7B2C\u516D"];
    return Array.from({ length: n2 }, (_, i) => ({ name: n2 === 1 ? term : `${ORD[i]}${term}`, size: Math.round(u.size / n2 * 10) / 10 }));
  }
  var coastal = (ctx, st2) => (byState(ctx).get(st2.id) ?? []).some((g) => ctx.world.cell.coastDist[g.cell] <= 1);
  var shareOf = (ctx, st2) => {
    const gs = byState(ctx).get(st2.id) ?? [], pastoral = gs.length ? gs.filter((g) => g.subsistence === "pastoral").length / gs.length : 0, w = {};
    for (const [k, def] of Object.entries(UNIT_KINDS)) if (def.need(st2, ctx)) w[k] = k === "infantry" ? 1 : k === "ranged" ? 0.25 : k === "cavalry" ? 0.2 + 0.5 * pastoral : k === "navy" ? 0.15 : k === "garrison" ? 0.1 : 0.4;
    if (w.firearms) {
      delete w.ranged;
    }
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    for (const k in w) w[k] /= tot;
    return w;
  };
  var OFF_CAP = CAP.off;
  var DEF_CAP = CAP.def;
  var initMilitary = () => ({ units: [], equipLevel: 0.3, readiness: 0.5, doctrine: { taken: {} }, shares: null, special: [], fx: Object.fromEntries(FX_KEYS.map((k) => [k, 0])), exp: { won: 0, lost: 0, defended: 0, sieges: 0, sea: 0, wars: 0 } });
  function canAdopt(st2, id) {
    const d = nodeOf(st2, id);
    if (!d) return { ok: false, reason: "\u305D\u306E\u30C9\u30AF\u30C8\u30EA\u30F3\u306F\u3042\u308A\u307E\u305B\u3093" };
    const M = st2.military;
    if (M?.doctrine.taken[id] != null) return { ok: false, reason: "\u3059\u3067\u306B\u53D6\u5F97\u6E08\u307F" };
    if (d.special && !(M?.special ?? []).some((b) => `sp:${b.key}` === d.branch)) return { ok: false, reason: `${d.ja}\u306F\u3001\u4ECA\u306E\u3053\u306E\u56FD\u306E\u56FA\u6709\u306E\u7CFB\u7D71\u3067\u306F\u306A\u3044` };
    for (const p of d.prereq) if (M?.doctrine.taken[p] == null) return { ok: false, reason: `\u524D\u63D0\u306E\u30C9\u30AF\u30C8\u30EA\u30F3\u300C${nodeOf(st2, p)?.ja ?? p}\u300D\u304C\u672A\u53D6\u5F97` };
    for (const t of d.tech) if (!has(st2, t)) return { ok: false, reason: `\u6280\u8853\u300C${t}\u300D\u304C\u5FC5\u8981` };
    if (st2.treasury < d.cost) return { ok: false, reason: `\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044\uFF08${d.cost}\uFF09` };
    return { ok: true };
  }
  function adoptDoctrine(ctx, st2, id, { provenance = "simulation", decisionId = null } = {}) {
    const c = canAdopt(st2, id);
    if (!c.ok) return c;
    const { civ: civ6, ids } = ctx, d = nodeOf(st2, id);
    const M = st2.military ?? (st2.military = initMilitary());
    st2.treasury -= d.cost;
    M.doctrine.taken[id] = civ6.monthIndex;
    const ev = makeEvent(civ6, ids, { kind: "doctrine_adopted", title: `${st2.name}\u304C\u300C${d.ja}\u300D\u3092\u53D6\u308A\u5165\u308C\u305F`, participants: [{ entityId: st2.id, role: "state" }], effects: [{ targetId: st2.id, property: "military.doctrine", before: null, after: id }], provenance, decisionId });
    recompute(ctx, st2);
    return { ok: true, eventId: ev?.eventId ?? null };
  }
  function refreshSpecial(ctx, st2) {
    const M = st2.military, next = chooseSpecial(doctrineInfo(ctx, st2), M.special);
    const same = M.special.length === 3 && next.every((b, i) => M.special.some((o) => o.key === b.key));
    if (!same) M.special = next;
  }
  function recompute(ctx, st2) {
    const M = st2.military, ind = effective(ctx.civ, st2, "perCapita"), wTech = (has(st2, "bronze_weapons") ? 0.08 : 0) + (has(st2, "iron_weapons") ? 0.12 : 0) + (has(st2, "steel") ? 0.05 : 0) + (has(st2, "gunpowder") ? 0.1 : 0);
    M.equipLevel = clamp9(0.15 + 0.35 * clamp9(ind / 1.6) + wTech + (st2.treasury > 0 ? 0.1 : -0.1) + 0.1 * (st2.econ?.investment ?? 0), 0, 1);
    M.readiness = clamp9(0.5 * effective(ctx.civ, st2, "stability") + 0.3 * (st2.treasury >= 0 ? 1 : 0) + 0.2 * (1 - (st2.politics ? effective(ctx.civ, st2, "fatigue") : 0)), 0, 1);
    const fx3 = doctrineFx(st2), off = fx3.off, def = fx3.def;
    M.fx = fx3;
    const eqE = effective(ctx.civ, st2, "equipLevel"), rdE = effective(ctx.civ, st2, "readiness");
    st2.milBonus = Math.round(clamp9(0.35 * (eqE - 0.3) + 0.15 * (rdE - 0.5) + off, -0.6, 0.6) * 1e3) / 1e3;
    st2.milDef = Math.round(def * 1e3) / 1e3;
  }
  function stepMilitary(ctx) {
    const { civ: civ6, ids } = ctx, mi = civ6.monthIndex;
    if (!civ6.options.wcde || mi % 3 !== 0) return;
    for (const st2 of Object.values(civ6.states)) {
      if (!st2.alive) continue;
      const M = st2.military ?? (st2.military = initMilitary());
      if (!M.special?.length || mi % 12 === 0) refreshSpecial(ctx, st2);
      recompute(ctx, st2);
      const shares = M.shares && Object.keys(M.shares).every((k) => UNIT_KINDS[k]?.need(st2, ctx)) ? M.shares : shareOf(ctx, st2);
      if (M.shares && shares !== M.shares) M.shares = null;
      const old = new Map(M.units.map((u) => [u.kind, u])), next = [];
      for (const [k, sh] of Object.entries(shares)) {
        const u = old.get(k) ?? { id: ids.next("unit"), kind: k, name: unitName(st2, k), since: mi };
        u.name = unitName(st2, k);
        u.size = Math.round(st2.army * sh * 10) / 10;
        u.equip = Math.round(clamp9(effective(ctx.civ, st2, "equipLevel") + (k === "firearms" ? 0.1 : k === "cavalry" ? 0.03 : 0)) * 100) / 100;
        u.readiness = Math.round(effective(ctx.civ, st2, "readiness") * 100) / 100;
        next.push(u);
      }
      M.units = next;
      M.armyBasis = st2.army;
    }
  }
  function reorganize(ctx, st2, shares) {
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.01) return { ok: false, reason: "\u914D\u5206\u306E\u5408\u8A08\u306F 1" };
    for (const [k, v] of Object.entries(shares)) {
      if (!UNIT_KINDS[k]) return { ok: false, reason: `\u672A\u77E5\u306E\u90E8\u968A ${k}` };
      if (!(v >= 0)) return { ok: false, reason: "\u914D\u5206\u306F 0 \u4EE5\u4E0A" };
      if (v > 0 && !UNIT_KINDS[k].need(st2, ctx)) return { ok: false, reason: `${UNIT_KINDS[k].ja}\u306F\u4ECA\u306E\u6280\u8853\u30FB\u5730\u7406\u3067\u306F\u7DE8\u5236\u3067\u304D\u306A\u3044` };
    }
    const cost = Math.round(st2.army * 2e-3 * 10) / 10;
    if (st2.treasury < cost) return { ok: false, reason: `\u518D\u7DE8\u306E\u8CBB\u7528 ${cost} \u304C\u8DB3\u308A\u306A\u3044` };
    st2.treasury -= cost;
    (st2.military ?? (st2.military = initMilitary())).shares = Object.fromEntries(Object.entries(shares).filter(([, v]) => v > 0));
    stepMilitaryNow(ctx, st2);
    return { ok: true, cost };
  }
  function stepMilitaryNow(ctx, st2) {
    const mi = ctx.civ.monthIndex;
    const prev = ctx.civ.monthIndex;
    ctx.civ.monthIndex = mi - mi % 3;
    const only = (s) => s;
    try {
      const states = ctx.civ.states;
      const keep = Object.values(states).filter((s) => s !== st2).map((s) => [s, s.alive]);
      for (const [s] of keep) s.alive = false;
      stepMilitary(ctx);
      for (const [s, a] of keep) s.alive = a;
    } finally {
      ctx.civ.monthIndex = prev;
    }
  }

  // js/core/wcde/domains/people.js
  var AGE_MIN = 14 * 12;
  function createFigure(ctx, st2, { name, bornAt, houseId, parents = null, role = "leader", cause = null }) {
    const { civ: civ6, ids } = ctx, id = ids.next("person"), f2 = { id, name, bornAt, diedAt: null, role, stateId: st2.id, houseId, parents, children: [], speciesId: civ6.groups[st2.capitalGroupId]?.speciesId ?? "human", history: [{ at: civ6.monthIndex, kind: "appeared", stateId: st2.id }] };
    (civ6.figures ?? (civ6.figures = {}))[id] = f2;
    return f2;
  }
  var newHouse = (ctx, st2, founder) => {
    const { civ: civ6, ids } = ctx;
    const id = ids.next("house");
    (civ6.houses ?? (civ6.houses = {}))[id] = { id, name: dynastyName(st2.polity, Object.values(civ6.houses).filter((x) => x.stateId === st2.id).length + 1, founder.name), foundedAt: civ6.monthIndex, stateId: st2.id, founderId: founder.id };
    return id;
  };
  function stepPeople(ctx) {
    const { civ: civ6, ids } = ctx, mi = civ6.monthIndex;
    if (!civ6.options.wcde) return;
    civ6.figures ?? (civ6.figures = {});
    civ6.houses ?? (civ6.houses = {});
    compactFigures(ctx);
    for (const st2 of Object.values(civ6.states)) {
      if (!st2.alive) continue;
      const L = st2.leader;
      let cur = st2.leaderFigureId ? civ6.figures[st2.leaderFigureId] : null;
      const heirFig = st2.heirFigureId ? civ6.figures[st2.heirFigureId] : null;
      if (cur && L.renamedByCreator) {
        if (cur.name !== L.name) {
          cur.history.push({ at: mi, kind: "renamed_by_creator", from: cur.name });
          cur.name = L.name;
        }
        delete L.renamedByCreator;
      }
      if (cur && (cur.name !== L.name || cur.bornAt !== L.bornAt || L.deposed)) {
        const succeeded = heirFig && heirFig.diedAt == null && L.heirTaken !== false && !L.deposed && cur.diedAt == null;
        cur.diedAt = mi;
        cur.history.push({ at: mi, kind: L.deposed ? "deposed" : "left_office" });
        if (heirFig && heirFig.diedAt == null && !L.deposed) {
          heirFig.name = leaderName(st2, heirFig.name, leaderRng(civ6, st2, "enthrone"));
          L.name = heirFig.name;
          L.bornAt = heirFig.bornAt;
          cur = heirFig;
          st2.leaderFigureId = heirFig.id;
          cur.history.push({ at: mi, kind: "enthroned", stateId: st2.id });
          st2.heirFigureId = null;
          L.heir = false;
          makeEvent(civ6, ids, { kind: "succession_by_heir", title: `${st2.name}\u3067\u3001${cur.name}\u304C\u7236\u7956${civ6.figures[cur.parents?.[0]]?.name ?? ""}\u306E\u8DE1\u3092\u7D99\u3044\u3060`, participants: [{ entityId: st2.id, role: "state" }, { entityId: cur.id, role: "successor" }, ...cur.parents ? [{ entityId: cur.parents[0], role: "predecessor" }] : []], provenance: "simulation" });
          continue;
        }
        const old = cur;
        cur = null;
        L.deposed = false;
        const nf = createFigure(ctx, st2, { name: L.name, bornAt: L.bornAt, houseId: null });
        nf.houseId = newHouse(ctx, st2, nf);
        st2.leaderFigureId = nf.id;
        st2.heirFigureId = null;
        const ev = makeEvent(civ6, ids, { kind: "dynasty_changed", title: `${st2.name}\u3067${civ6.houses[nf.houseId]?.name ?? "\u65B0\u738B\u671D"}\u304C\u6210\u7ACB\u3057\u305F\uFF08${civ6.houses[old.houseId]?.name ?? "\u5148\u306E\u738B\u671D"}\u306E${old.name}\u304C\u9000\u3044\u305F\uFF09`, participants: [{ entityId: st2.id, role: "state" }, { entityId: old.id, role: "predecessor" }, { entityId: nf.id, role: "successor" }], effects: [{ targetId: st2.id, property: "leader.houseId", before: old.houseId, after: nf.houseId }], provenance: "simulation" });
        continue;
      }
      if (!cur) {
        const f2 = createFigure(ctx, st2, { name: L.name, bornAt: L.bornAt, houseId: null });
        f2.houseId = newHouse(ctx, st2, f2);
        st2.leaderFigureId = f2.id;
        cur = f2;
      }
      if (L.heir && !st2.heirFigureId && cur.diedAt == null) {
        const grp = civ6.groups[st2.capitalGroupId], lang = languageOfGroup(grp), r = ctx.rng, ageGap = Math.max(AGE_MIN, 20 * 12 + Math.floor(r() * 120)), born = Math.min(mi - 12, cur.bornAt + ageGap);
        const fresh = (lang && civ6.languages[lang] ? nameFor(civ6, r, lang, "person") : null) ?? `${baseOfLeader(L.name)}\u306E\u5B50`, kin = leaderRng(civ6, st2, "heirname"), anc = kin() < 0.35 ? baseOfLeader(L.name) : fresh;
        const child = createFigure(ctx, st2, { name: anc, bornAt: born, houseId: cur.houseId, parents: [cur.id], role: "heir" });
        cur.children.push(child.id);
        st2.heirFigureId = child.id;
        makeEvent(civ6, ids, { kind: "heir_named", title: `${st2.name}\u306E${cur.name}\u304C\u7D99\u627F\u8005${child.name}\u3092\u5B9A\u3081\u305F`, participants: [{ entityId: st2.id, role: "state" }, { entityId: cur.id, role: "parent" }, { entityId: child.id, role: "heir" }], provenance: "simulation" });
      }
    }
  }
  function stepCities(ctx) {
    const { civ: civ6 } = ctx;
    if (!civ6.options.wcde || civ6.monthIndex % 12 !== 0) return;
    for (const s of Object.values(civ6.settlements)) {
      if (s.name || s.stage === "village") continue;
      const g = civ6.groups[s.groupId];
      const lang = languageOfGroup(g);
      if (!lang) continue;
      s.name = nameFor(civ6, ctx.rng, lang, "place") ?? null;
    }
  }
  function compactFigures(ctx) {
    const { civ: civ6 } = ctx, mi = civ6.monthIndex;
    if (!civ6.options.wcde || mi % 12 !== 5) return;
    for (const f2 of Object.values(civ6.figures ?? {})) if (f2.diedAt != null && mi - f2.diedAt > 720 && f2.history.length > 2 && !f2.compacted) {
      f2.history = [f2.history[0], f2.history[f2.history.length - 1]];
      f2.compacted = true;
    }
  }

  // js/core/wcde/domains/actions.js
  var r33 = (x) => Math.round(x * 1e3) / 1e3;
  var clamp10 = (v, a, b) => Math.max(a, Math.min(b, v));
  var cand2 = (key, f2, o = {}) => ({ key, target: o.target ?? null, opt: o.opt ?? null, factors: f2, eligible: o.eligible ?? true, reason: o.reason ?? null, label: o.label ?? null });
  var bad2 = (key, reason, o = {}) => cand2(key, {}, { ...o, eligible: false, reason });
  var eff2 = (list, st2, property, before, after) => {
    list.push({ targetId: st2.id, property, before, after });
  };
  var INVEST_COST = 30;
  var INVEST_GAIN = 0.06;
  var INVEST_CAP = 0.4;
  var done = false;
  function registerWcdeActions() {
    if (done) return;
    done = true;
    registerAction({
      key: "adopt_doctrine",
      domain: "military",
      label: "\u30C9\u30AF\u30C8\u30EA\u30F3\u306E\u53D6\u5F97",
      enabled: true,
      candidates(ctx, st2, e) {
        if (!ctx.civ.options.wcde) return [];
        const out = [];
        const coastal2 = (byState(ctx).get(st2.id) ?? []).some((g) => ctx.world.cell.coastDist[g.cell] <= 1), at2 = st2.warIds.length > 0, f2 = (d) => d.fx;
        for (const d of nodesOf(st2)) {
          const c = canAdopt(st2, d.id);
          if (!c.ok) continue;
          const x = f2(d), sec = 0.15 + 2.2 * (x.def ?? 0) + 0.8 * (x.off ?? 0) + (at2 ? 0.2 : 0) + 1.2 * (x.attr ?? 0) + 0.8 * (x.coh ?? 0) + (coastal2 ? 1.5 * (x.naval ?? 0) : -0.5 * (x.naval ?? 0)) + 0.6 * (x.logi ?? 0);
          out.push(cand2("adopt_doctrine", { security: sec, expansion: 3 * (x.off ?? 0) + 1.2 * (x.siege ?? 0) + 0.8 * (x.landing ?? 0) - d.cost / 2e3 }, { opt: d.id, label: `${d.ja}\u3092\u53D6\u308A\u5165\u308C\u308B` }));
        }
        return out.sort((a, b) => b.factors.security + b.factors.expansion - (a.factors.security + a.factors.expansion) || (a.opt < b.opt ? -1 : 1)).slice(0, 3);
      },
      execute(ctx, st2, c) {
        const r = adoptDoctrine(ctx, st2, c.opt, { provenance: c.provenance ?? "ai", decisionId: c.decisionId ?? null });
        return r.ok ? { ok: true, silent: true, effects: [] } : { ok: false, error: r.reason };
      }
    });
    registerAction({
      key: "invest_industry",
      domain: "economy",
      label: "\u7523\u696D\u3078\u306E\u6295\u8CC7",
      enabled: true,
      candidates(ctx, st2, e) {
        if (!ctx.civ.options.wcde || !st2.econ) return [];
        const inv = st2.econ.investment ?? 0;
        if (st2.treasury < INVEST_COST * 2) return [bad2("invest_industry", "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044")];
        if (inv >= INVEST_CAP) return [bad2("invest_industry", "\u6295\u8CC7\u306E\u52B9\u679C\u304C\u4E0A\u9650")];
        return [cand2("invest_industry", { prosperity: 0.35 + 0.5 * (1 - clamp10(st2.econ.perCapita / 1.5, 0, 1)), tech: 0.1 }, { label: "\u7523\u696D\u3078\u6295\u8CC7\u3059\u308B" })];
      },
      execute(ctx, st2, c) {
        const ef = [], b = st2.econ.investment ?? 0, a = r33(Math.min(INVEST_CAP, b + INVEST_GAIN));
        if (st2.treasury < INVEST_COST) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st2.treasury -= INVEST_COST;
        st2.econ.investment = a;
        eff2(ef, st2, "econ.investment", b, a);
        return { ok: true, effects: ef, title: "\u7523\u696D\u3078\u306E\u6295\u8CC7" };
      }
    });
    registerAction({
      key: "appease_faction",
      domain: "politics",
      label: "\u652F\u6301\u52E2\u529B\u3078\u306E\u914D\u616E",
      enabled: true,
      candidates(ctx, st2, e) {
        if (!ctx.civ.options.wcde || !st2.politics) return [];
        const P2 = st2.politics, out = [];
        for (const [k, f2] of Object.entries(P2.factions)) {
          const weak = (f2.influence ?? 0) * (0.6 - f2.support);
          if (weak > 0.02) out.push(cand2("appease_faction", { stability: 0.5 + 4 * weak + (P2.legitimacy < 0.4 ? 0.3 : 0) }, { opt: k, label: `${FACTIONS[k]}\u306B\u914D\u616E\u3059\u308B` }));
        }
        return out.sort((a, b) => b.factors.stability - a.factors.stability || (a.opt < b.opt ? -1 : 1)).slice(0, 2);
      },
      execute(ctx, st2, c) {
        const f2 = st2.politics?.factions[c.opt];
        if (!f2) return { ok: false, error: "\u305D\u306E\u52E2\u529B\u306F\u306A\u3044" };
        const cost = 15;
        if (st2.treasury < cost) return { ok: false, error: "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" };
        st2.treasury -= cost;
        const b = f2.support, a = r33(clamp10(b + 0.15, 0, 1));
        f2.support = a;
        recomputeLegitimacy(st2.politics);
        const ef = [];
        eff2(ef, st2, `politics.${c.opt}.support`, r33(b), a);
        return { ok: true, effects: ef, title: `${FACTIONS[c.opt]}\u3078\u306E\u914D\u616E` };
      }
    });
  }

  // js/core/wcde/power.js
  var clamp11 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var navyShare = (st2) => {
    const u = (st2.military?.units ?? []).find((x) => x.kind === "navy");
    return u && st2.army > 0 ? clamp11(u.size / Math.max(1, st2.army)) : 0;
  };
  var landShare = (st2) => 1 - navyShare(st2);
  var fx = (st2) => st2.military?.fx ?? {};
  function armsMult(st2, defending = false) {
    const us = (st2.military?.units ?? []).filter((u) => u.kind !== "navy"), tot = us.reduce((a, u) => a + u.size, 0);
    if (!(tot > 0)) return 1;
    const sh = (k) => (us.find((u) => u.kind === k)?.size ?? 0) / tot, kinds = us.filter((u) => u.size / tot >= 0.1).length;
    return 1 + 0.04 * Math.min(3, Math.max(0, kinds - 1)) + 0.22 * Math.min(sh("cavalry"), 0.4) + 0.35 * Math.min(sh("firearms"), 0.5) + 0.1 * Math.min(sh("ranged"), 0.4) + sh("garrison") * (defending ? 0.45 : -0.1);
  }
  function landPower(civ6, st2, size = null, { defending = false } = {}) {
    const n2 = size ?? st2.army * landShare(st2);
    const attack = milMult(st2, civ6) * armsMult(st2, defending) * (0.85 + 0.3 * effective(civ6, st2, "readiness"));
    const guard = defending ? 1 + ((st2.defense ?? 0) + (st2.milDef ?? 0)) * 0.5 : 1;
    return n2 * attack * guard;
  }
  function navalPower(civ6, st2, size = null) {
    const n2 = size ?? st2.army * navyShare(st2);
    if (!(n2 > 0)) return 0;
    const tech = stateCan(civ6, st2, "war:naval") ? 1.3 : stateCan(civ6, st2, "unit:navy") ? 1 : 0.4;
    return n2 * milMult(st2, civ6) * (1 + 1.2 * (fx(st2).naval ?? 0)) * tech * (0.85 + 0.3 * effective(civ6, st2, "readiness"));
  }
  var supplyRange = (civ6, st2) => 650 * (1 + 2.2 * (fx(st2).logi ?? 0)) * (stateCan(civ6, st2, "war:far") ? 1.7 : 1) * (st2.polity === "empire" ? 1.15 : 1);
  var supplyAt = (civ6, st2, distKm2) => clamp11(1 - Math.max(0, distKm2 - supplyRange(civ6, st2)) / (supplyRange(civ6, st2) * 1.2));
  var totalPower = (civ6, st2) => landPower(civ6, st2) * 1 + navalPower(civ6, st2) * 0.35;

  // js/core/wcde/warfare.js
  var clamp12 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r34 = (x) => Math.round(x * 1e3) / 1e3;
  var POSTURES = Object.freeze({ offensive: "\u653B\u52E2", balanced: "\u5747\u8861", defensive: "\u5B88\u52E2" });
  var CAMPAIGN_KINDS = Object.freeze({ offensive: "\u9032\u653B", siege: "\u5305\u56F2", defense: "\u9632\u885B", naval_control: "\u5236\u6D77", blockade: "\u5C01\u9396", landing: "\u4E0A\u9678" });
  var initOps = () => ({ v: 1, theaters: {}, forces: {}, campaigns: {}, battles: [], stats: { battles: 0, big: 0, sieges: 0, naval: 0, landings: 0, dead: {}, won: {} }, direction: {}, occ: {}, occBy: {}, names: {}, seq: 0, broken: { a: 0, d: 0 } });
  var evBudget = (ops, mi) => {
    if (ops._evMonth !== mi) {
      ops._evMonth = mi;
      ops._evN = 0;
    }
    return ++ops._evN <= 2;
  };
  var nid = (ops, p) => `${p}${++ops.seq}`;
  var U = (civ6, ...p) => hashSeed(civ6.historySeed, "war", ...p) / 4294967296;
  var sideOf = (w, id) => w.sides.a.includes(id) ? "a" : w.sides.d.includes(id) ? "d" : null;
  var other = (s) => s === "a" ? "d" : "a";
  var members = (civ6, w, side) => w.sides[side].map((i) => civ6.states[i]).filter((s) => s?.alive);
  function placeName(ctx, g) {
    const { civ: civ6 } = ctx, s = g?.settlementId ? civ6.settlements[g.settlementId] : null;
    if (s?.name) return s.name;
    const lang = languageOfGroup(g);
    if (!lang || !civ6.languages?.[lang]) return "\u540D\u3082\u306A\u304D\u5730";
    return nameFor(civ6, rngOf(hashSeed(civ6.historySeed, "place", g.id)), lang, "place") ?? "\u540D\u3082\u306A\u304D\u5730";
  }
  function siteFeatures(ctx, g) {
    const ce = ctx.world.cell, c = g.cell, b = ce.biome[c];
    return { river: !!ce.river[c], mountain: (ce.mountain?.[c] ?? 0) > 0 || b === BIOMES2.ALPINE, coast: ce.coastDist[c] <= 1, forest: b === BIOMES2.TEMPERATE_FOREST || b === BIOMES2.RAINFOREST || b === BIOMES2.TAIGA, wet: b === BIOMES2.WETLAND, dry: b === BIOMES2.HOT_DESERT || b === BIOMES2.COLD_DESERT, plain: b === BIOMES2.GRASSLAND || b === BIOMES2.SAVANNA };
  }
  function battleName(ctx, w, kind, g) {
    const { civ: civ6 } = ctx, p = placeName(ctx, g), used = civ6.battleNames ?? (civ6.battleNames = {}), ds = siteDescriptors(siteFeatures(ctx, g));
    const cands = kind === "siege" ? [`${p}\u5305\u56F2\u6226`, `${p}\u653B\u57CE\u6226`, `${p}\u306E\u9665\u843D`] : kind === "naval" ? [`${p}\u6C96\u6D77\u6226`, `${p}\u6E7E\u306E\u6D77\u6226`, `${p}\u6D77\u5CE1\u306E\u6226\u3044`] : kind === "landing" ? [`${p}\u4E0A\u9678\u6226`, `${p}\u4E0A\u9678\u4F5C\u6226`] : [`${p}\u306E\u6226\u3044`, ...ds.map((d) => `${p}${d}\u306E\u6226\u3044`), `${p}\u4F1A\u6226`];
    const r = U(civ6, w.id, civ6.monthIndex, g.id, kind, "bn"), start2 = cands.length > 1 && r >= 0.6 ? 1 + Math.floor((r - 0.6) / 0.4 * (cands.length - 1)) : 0;
    for (let i = 0; i < cands.length; i++) {
      const nm = cands[(start2 + i) % cands.length];
      if (!used[nm]) {
        used[nm] = 1;
        return nm;
      }
    }
    const base = cands[0], n2 = used[base] = (used[base] ?? 1) + 1;
    return n2 <= 3 ? `\u7B2C${kanjiNum(n2)}\u6B21${base}` : `${civ6.date.year}\u5E74\u306E${base}`;
  }
  function fieldSite(ctx, w, camp, g) {
    const { civ: civ6 } = ctx, ops = w.ops, recent = ops.sites ?? (ops.sites = []), cs = [g, ...[...neighborGroups(ctx, g)].map((o) => civ6.groups[o]).filter(Boolean)].sort((x, y) => x.id < y.id ? -1 : 1);
    const fresh = cs.filter((x) => !recent.includes(x.cell)), pool = fresh.length ? fresh : cs, site = pool[Math.floor(U(civ6, w.id, civ6.monthIndex, camp.id, "site") * pool.length)];
    recent.push(site.cell);
    if (recent.length > 8) recent.shift();
    return site;
  }
  var terrainBonus = (world, cell) => {
    const ce = world.cell, b = ce.biome[cell];
    return ((ce.mountain?.[cell] ?? 0) > 0 || b === BIOMES2.ALPINE ? 0.25 : 0) + (ce.river[cell] ? 0.1 : 0) + (b === BIOMES2.WETLAND || b === BIOMES2.TEMPERATE_FOREST || b === BIOMES2.RAINFOREST ? 0.1 : 0);
  };
  var stageOf3 = (civ6, g) => g?.settlementId ? civ6.settlements[g.settlementId]?.stage ?? "village" : null;
  function initWar(ctx, w) {
    w.ops = initOps();
    syncForces(ctx, w);
    ensureTheaters(ctx, w);
    w.name ?? (w.name = warNameFor(ctx, w, () => {
      const g = ctx.civ.groups[ctx.civ.states[w.defender]?.capitalGroupId], p = g ? placeName(ctx, g) : null;
      return p && p !== "\u540D\u3082\u306A\u304D\u5730" ? p : null;
    }));
  }
  var capCell = (civ6, st2) => civ6.groups[st2.capitalGroupId]?.cell ?? null;
  var commitOf = (w, st2) => clamp12(w.ops.direction[st2.id]?.commit ?? 0.75, 0.3, 1);
  function syncForces(ctx, w) {
    const { civ: civ6 } = ctx, ops = w.ops, live2 = /* @__PURE__ */ new Set();
    for (const side of ["a", "d"]) for (const st2 of members(civ6, w, side)) {
      const c = commitOf(w, st2), ns = navyShare(st2);
      for (const kind of ["army", "fleet"]) {
        const size = kind === "army" ? st2.army * landShare(st2) * c : st2.army * ns * c;
        const key = `${st2.id}|${kind}`;
        let f2 = Object.values(ops.forces).find((x) => x.key === key);
        if (!(size > 0.5) || kind === "fleet" && ns < 0.02) {
          if (f2) {
            if (f2.campaignId) delete ops.campaigns[f2.campaignId];
            delete ops.forces[f2.id];
          }
          continue;
        }
        if (!f2) {
          f2 = { id: nid(ops, "f"), key, stateId: st2.id, kind, side, size: 0, morale: 0.8, supply: 1, cell: capCell(civ6, st2), campaignId: null, lastBattle: -99 };
          ops.forces[f2.id] = f2;
        }
        f2.size = Math.round(size * 10) / 10;
        f2.side = side;
        live2.add(f2.id);
      }
    }
    for (const id of Object.keys(ops.forces)) if (!live2.has(id)) {
      const f2 = ops.forces[id];
      if (f2.campaignId) delete ops.campaigns[f2.campaignId];
      delete ops.forces[id];
    }
  }
  var forcesOf = (w, side, kind = null) => Object.values(w.ops.forces).filter((f2) => f2.side === side && (!kind || f2.kind === kind)).sort((a, b) => a.id < b.id ? -1 : 1);
  function ensureTheaters(ctx, w) {
    const { civ: civ6 } = ctx, ops = w.ops, groups = byState(ctx);
    for (const a of members(civ6, w, "a")) for (const d of members(civ6, w, "d")) {
      const key = `L|${a.id}|${d.id}`;
      if (Object.values(ops.theaters).some((t) => t.key === key)) continue;
      if (!neighborStates(ctx, a).includes(d.id)) continue;
      const cap = civ6.groups[a.capitalGroupId], gs = groups.get(d.id) ?? [], g = cap && gs.length ? gs.reduce((b, x) => !b || distKm(ctx.world, cap.cell, x.cell) < distKm(ctx.world, cap.cell, b.cell) ? x : b, null) : null;
      if (!g) continue;
      const id = nid(ops, "t");
      ops.theaters[id] = { id, key, kind: "land", a: a.id, d: d.id, cell: g.cell, name: `${placeName(ctx, g)}\u65B9\u9762`, control: 0 };
    }
    const wantSea = Object.values(ops.theaters).length === 0 || forcesOf(w, "a", "fleet").length && forcesOf(w, "d", "fleet").length;
    if (wantSea && !Object.values(ops.theaters).some((t) => t.kind === "sea")) {
      const A2 = members(civ6, w, "a")[0], D2 = members(civ6, w, "d")[0];
      const gs = D2 ? groups.get(D2.id) ?? [] : [];
      const g = gs.find((x) => ctx.world.cell.coastDist[x.cell] <= 1) ?? gs[0];
      if (A2 && D2 && g) {
        const id = nid(ops, "t");
        ops.theaters[id] = { id, key: `S|${A2.id}|${D2.id}`, kind: "sea", a: A2.id, d: D2.id, cell: g.cell, name: `${placeName(ctx, g)}\u6D77\u57DF`, control: 0 };
      }
    }
  }
  var seaTheater = (w) => Object.values(w.ops.theaters).find((t) => t.kind === "sea") ?? null;
  var landTheaterFor = (w, a, d) => Object.values(w.ops.theaters).find((t) => t.kind === "land" && (t.a === a && t.d === d || t.a === d && t.d === a)) ?? null;
  function canReach(ctx, a, b) {
    if (neighborStates(ctx, a).includes(b.id)) return true;
    const { civ: civ6, world } = ctx;
    if (!stateCan(civ6, a, "unit:navy") || !stateCan(civ6, a, "war:naval") || navyShare(a) < 0.02) return false;
    const cs = (st2) => (byState(ctx).get(st2.id) ?? []).some((g) => world.cell.coastDist[g.cell] <= 1);
    if (!cs(a) || !cs(b)) return false;
    const ca = civ6.groups[a.capitalGroupId], cb = civ6.groups[b.capitalGroupId];
    return !!(ca && cb && distKm(world, ca.cell, cb.cell) <= 4500);
  }
  function seaTargets(ctx, st2) {
    const { civ: civ6, world } = ctx;
    if (!stateCan(civ6, st2, "war:naval") || navyShare(st2) < 0.02) return [];
    const land = new Set(neighborStates(ctx, st2)), ca = civ6.groups[st2.capitalGroupId];
    if (!ca) return [];
    return Object.values(civ6.states).filter((s) => s.alive && s.id !== st2.id && !land.has(s.id) && canReach(ctx, st2, s)).sort((x, y) => distKm(world, ca.cell, civ6.groups[x.capitalGroupId].cell) - distKm(world, ca.cell, civ6.groups[y.capitalGroupId].cell) || (x.id < y.id ? -1 : 1)).slice(0, 3);
  }
  function postureOf(ctx, w, st2) {
    const d = w.ops.direction[st2.id];
    if (d?.posture) return d.posture;
    const { civ: civ6 } = ctx, side = sideOf(w, st2.id), mine = side === "a" ? w.score : -w.score;
    const my = members(civ6, w, side).reduce((s, x) => s + landPower(civ6, x) + 0.35 * navalPower(civ6, x), 0), en = members(civ6, w, other(side)).reduce((s, x) => s + landPower(civ6, x) + 0.35 * navalPower(civ6, x), 0), ratio = (my + 1) / (en + 1);
    const fat = effective(civ6, st2, "fatigue");
    return ratio >= 1.15 && mine > -30 && fat < 0.7 ? "offensive" : ratio < 0.8 || mine < -40 ? "defensive" : "balanced";
  }
  function directWar(ctx, st2, w, { posture = null, commit = null, focus = null }) {
    var _a, _b;
    if (!w?.ops || w.status !== "active") return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u9032\u884C\u4E2D\u3067\u306F\u306A\u3044" };
    if (sideOf(w, st2.id) == null) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306E\u53C2\u6226\u56FD\u3067\u306F\u306A\u3044" };
    if (posture != null && !POSTURES[posture]) return { ok: false, error: "\u65B9\u91DD\u306F offensive / balanced / defensive" };
    if (commit != null && !(commit >= 0.3 && commit <= 1)) return { ok: false, error: "\u6295\u5165\u5272\u5408\u306F 0.3\u301C1" };
    if (focus != null && !w.ops.theaters[focus]) return { ok: false, error: "\u305D\u306E\u6226\u57DF\u306F\u306A\u3044" };
    const d = (_a = w.ops.direction)[_b = st2.id] ?? (_a[_b] = {});
    if (posture != null) d.posture = posture;
    if (commit != null) d.commit = r34(commit);
    if (focus !== void 0) d.focus = focus;
    d.since = ctx.civ.monthIndex;
    syncForces(ctx, w);
    return { ok: true };
  }
  var holderSide = (w, g, civ6) => w.ops.occ[g.id] ?? (g.stateId ? sideOf(w, g.stateId) : null);
  function frontierTargets(ctx, w, side) {
    const { civ: civ6 } = ctx, groups = byState(ctx), mine = [], seen = /* @__PURE__ */ new Set(), out = [];
    for (const st2 of members(civ6, w, side)) for (const g of groups.get(st2.id) ?? []) if (holderSide(w, g, civ6) === side) mine.push(g);
    for (const gid of w.occupied) {
      const g = civ6.groups[gid];
      if (g && w.ops.occ[gid] === side) mine.push(g);
    }
    mine.sort((x, y) => x.id < y.id ? -1 : 1);
    const foe = other(side);
    for (const g of mine.slice(0, 90)) for (const o of neighborGroups(ctx, g)) {
      if (seen.has(o)) continue;
      seen.add(o);
      const t = civ6.groups[o];
      if (t && holderSide(w, t, civ6) === foe && t.stateId && civ6.states[t.stateId]?.alive) out.push(t);
    }
    return out.sort((x, y) => x.id < y.id ? -1 : 1);
  }
  var valueOf = (ctx, w, g, from) => {
    const civ6 = ctx.civ, st2 = civ6.states[g.stateId], stage = stageOf3(civ6, g), cap = st2?.capitalGroupId === g.id;
    return Math.sqrt(g.pop + 1) * (cap ? 1.9 : stage === "city" ? 1.6 : stage === "town" ? 1.25 : 1) / (1 + distKm(ctx.world, from, g.cell) / 900);
  };
  function planFor(ctx, w, f2) {
    const { civ: civ6, world } = ctx, ops = w.ops, st2 = civ6.states[f2.stateId], side = f2.side, post = postureOf(ctx, w, st2), dir = ops.direction[st2.id] ?? {}, mi = civ6.monthIndex;
    const mk = (kind, o) => {
      const id = nid(ops, "c"), c = { id, kind, forceId: f2.id, stateId: st2.id, side, theaterId: null, targetGroupId: null, targetStateId: null, startedAt: mi, phase: "active", progress: 0, result: null, ...o };
      ops.campaigns[id] = c;
      f2.campaignId = id;
      return c;
    };
    const foeFleets = forcesOf(w, other(side), "fleet"), sea = seaTheater(w);
    if (f2.kind === "fleet") {
      if (!sea) return mk("defense", {});
      const ctl = side === "a" ? sea.control : -sea.control;
      if (foeFleets.length) return mk("naval_control", { theaterId: sea.id });
      return ctl > 0.3 && post !== "defensive" ? mk("blockade", { theaterId: sea.id }) : mk("naval_control", { theaterId: sea.id });
    }
    if (post === "defensive") return mk("defense", { theaterId: (dir.focus && ops.theaters[dir.focus] ? dir.focus : Object.values(ops.theaters).find((t) => t.kind === "land")?.id) ?? null });
    const from = capCell(civ6, st2) ?? 0, cands = frontierTargets(ctx, w, side).filter((g) => !dir.focus || ops.theaters[dir.focus]?.kind !== "land" || [ops.theaters[dir.focus].a, ops.theaters[dir.focus].d].includes(g.stateId));
    if (cands.length) {
      let best = null, bs = -1;
      for (const g of cands) {
        const s = valueOf(ctx, w, g, from) * (1 + 0.25 * U(civ6, w.id, st2.id, mi, "tg", g.id));
        if (s > bs) {
          bs = s;
          best = g;
        }
      }
      const stage = stageOf3(civ6, best), tst = civ6.states[best.stateId], cap = tst?.capitalGroupId === best.id, th = landTheaterFor(w, st2.id, best.stateId) ?? Object.values(ops.theaters).find((t) => t.kind === "land");
      return mk(stage === "city" || stage === "town" || cap ? "siege" : "offensive", { theaterId: th?.id ?? null, targetGroupId: best.id, targetStateId: best.stateId });
    }
    const landing = (fx2(st2).landing ?? 0) > 0 || stateCan(civ6, st2, "war:naval");
    const foeGs = members(civ6, w, other(side)).flatMap((s) => byState(ctx).get(s.id) ?? []).filter((g) => world.cell.coastDist[g.cell] <= 1 && holderSide(w, g, civ6) === other(side));
    if (landing && sea && foeGs.length && forcesOf(w, side, "fleet").length) {
      const best = foeGs.reduce((b, g) => !b || valueOf(ctx, w, g, from) > valueOf(ctx, w, b, from) ? g : b, null);
      return mk("landing", { theaterId: sea.id, targetGroupId: best.id, targetStateId: best.stateId });
    }
    return mk("defense", { theaterId: Object.values(ops.theaters).find((t) => t.kind === "land")?.id ?? null });
  }
  var fx2 = (st2) => st2.military?.fx ?? {};
  function moraleF(f2) {
    return 0.6 + 0.5 * f2.morale;
  }
  function fight(ctx, w, { kind, A: A2, D: D2, camp, g, garrison = 0 }) {
    const { civ: civ6, world } = ctx, ops = w.ops, mi = civ6.monthIndex, sA = civ6.states[A2.stateId], sD = D2 ? civ6.states[D2.stateId] : civ6.states[g.stateId];
    const naval = kind === "naval", terr = naval ? 0 : terrainBonus(world, g.cell), stage = stageOf3(civ6, g), fort = naval ? 1 : 1 + (kind === "siege" || stage ? (sD.defense ?? 0) + (stage === "city" ? 0.3 : stage === "town" ? 0.15 : 0.05) : 0);
    const pA = (naval ? navalPower(civ6, sA, A2.size) : landPower(civ6, sA, A2.size)) * moraleF(A2) * (0.5 + 0.5 * A2.supply), adaptA = fx2(sA).adapt ?? 0;
    let pD;
    if (D2) {
      const base = naval ? navalPower(civ6, sD, D2.size) : landPower(civ6, sD, D2.size, { defending: true }), prep = ops.campaigns[D2.campaignId]?.kind === "defense" ? 1.12 : ops.campaigns[D2.campaignId]?.kind === "offensive" ? 0.75 : 0.9;
      pD = base * moraleF(D2) * prep * (D2.lastBattle >= mi - 2 ? 0.88 : 1);
    } else pD = garrison;
    pD *= (1 + Math.max(0, terr - adaptA)) * fort;
    const rnd = 0.75 + 0.5 * U(civ6, w.id, mi, camp.id, "r"), atk = pA * rnd, win = atk > pD ? "A" : "D", q2 = Math.max(1, win === "A" ? atk / (pD + 1e-9) : pD / (atk + 1e-9)), engaged = 0.5 + 0.5 * U(civ6, w.id, mi, camp.id, "e");
    const loserLoss = clamp12(0.06 + 0.07 * Math.min(q2, 3), 0.05, 0.3) * engaged, winnerLoss = clamp12(loserLoss * (0.35 + 0.35 / q2), 0.01, 0.2);
    const apply = (F, st2, frac, lost) => {
      const arm = st2.army, dead = Math.min(arm, F.size * frac * (1 - (fx2(st2).attr ?? 0)));
      st2.army = Math.max(0, arm - dead);
      st2.warLoss = clamp12((st2.warLoss ?? 0) + (arm ? dead / arm * 0.6 : 0), 0, 0.7);
      F.size = Math.max(0, F.size - dead);
      F.lastBattle = mi;
      F.morale = clamp12(F.morale + (lost ? -(0.1 + 0.9 * frac) * (1 - 0.8 * (fx2(st2).coh ?? 0)) : 0.05));
      const grs = byState(ctx).get(st2.id) ?? [];
      if (grs.length && dead > 0) {
        const gg = grs[Math.floor(U(civ6, w.id, mi, camp.id, st2.id, "g") * grs.length)];
        gg.pop = Math.max(1, gg.pop - dead * 0.8);
      }
      w.casualties += dead;
      ops.stats.dead[st2.id] = (ops.stats.dead[st2.id] ?? 0) + dead;
      return dead;
    };
    const deadA = apply(A2, sA, win === "A" ? winnerLoss : loserLoss, win !== "A"), deadD = D2 ? apply(D2, sD, win === "A" ? loserLoss : winnerLoss, win === "A") : (sD.army = Math.max(0, sD.army - garrison * 0.03), garrison * 0.03);
    const mx = (s) => s.military?.exp ?? null;
    {
      const eA = mx(sA);
      if (eA) {
        if (win === "A") eA.won = (eA.won ?? 0) + 1;
        else eA.lost = (eA.lost ?? 0) + 1;
      }
      if (D2) {
        const eD = mx(sD);
        if (eD) {
          if (win === "D") eD.defended = (eD.defended ?? 0) + 1;
          else eD.lost = (eD.lost ?? 0) + 1;
        }
      }
    }
    const winSt = win === "A" ? sA : sD, loseSt = win === "A" ? sD : sA, name = battleName(ctx, w, kind, g), sign = (win === "A" ? A2.side : other(A2.side)) === "a" ? 1 : -1;
    w.score = clamp12(w.score + sign * (2 + 14 * loserLoss), -100, 100);
    const rec = { id: nid(ops, "b"), at: mi, kind, name, theater: camp.theaterId, cell: g.cell, a: A2.stateId, d: sD.id, winner: winSt.id, deadA: Math.round(deadA), deadD: Math.round(deadD), win };
    ops.battles.push(rec);
    if (ops.battles.length > 60) ops.battles.splice(0, ops.battles.length - 60);
    ops.stats.battles++;
    ops.stats.won[winSt.id] = (ops.stats.won[winSt.id] ?? 0) + 1;
    if (kind === "naval") ops.stats.naval++;
    const total = deadA + deadD, notable = total >= Math.max(300, 0.02 * (sA.army + sD.army + total)) || kind === "siege" && (stage === "city" || sD.capitalGroupId === g.id) || kind === "landing";
    rec.notable = notable;
    if (notable) ops.stats.big++;
    if (notable && evBudget(ops, mi)) makeEvent(civ6, ctx.ids, { kind: "battle_fought", title: `${name}\uFF08${sA.name}\u5BFE${sD.name}\u3001${winSt.name}\u304C\u5236\u3057\u305F\uFF09`, participants: [{ entityId: w.id, role: "war" }, { entityId: sA.id, role: "attacker" }, { entityId: sD.id, role: "defender" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], effects: [{ targetId: w.id, property: "score", before: null, after: Math.round(w.score) }], facts: { warId: w.id, name, kind, cell: g.cell, winnerStateId: winSt.id, loserStateId: loseSt.id, dead: Math.round(total) }, provenance: "simulation" });
    return { win, rec, loserLoss };
  }
  function occupy(ctx, w, g, side, camp) {
    const { civ: civ6 } = ctx, ops = w.ops;
    if (!w.occupied.includes(g.id)) w.occupied.push(g.id);
    ops.occ[g.id] = side;
    (ops.occBy ?? (ops.occBy = {}))[g.id] = camp.stateId;
    const owner = g.stateId ? civ6.states[g.stateId] : null, occ = civ6.states[camp.stateId];
    if (owner && owner.capitalGroupId === g.id) {
      w.score = clamp12(w.score + (side === "a" ? 1 : -1) * 35, -100, 100);
      for (const f2 of forcesOf(w, other(side))) if (f2.stateId === owner.id) f2.morale = clamp12(f2.morale - 0.3);
    }
    w.score = clamp12(w.score + (side === "a" ? 1 : -1) * (3 + Math.min(10, Math.sqrt(g.pop) / 8)), -100, 100);
    makeEvent(civ6, ctx.ids, { kind: "territory_occupied", title: `${placeName(ctx, g)}\u304C${occ.name}\u306B\u5360\u9818\u3055\u308C\u305F`, participants: [{ entityId: g.id, role: "territory" }, { entityId: w.id, role: "war" }, { entityId: camp.stateId, role: "occupier" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, cell: g.cell, stateId: camp.stateId }, provenance: "simulation" });
  }
  function liberate(w, g) {
    w.occupied = w.occupied.filter((x) => x !== g.id);
    delete w.ops.occ[g.id];
    if (w.ops.occBy) delete w.ops.occBy[g.id];
  }
  var defenderForce = (ctx, w, side, targetStateId) => {
    const fs = forcesOf(w, side, "army").filter((f2) => f2.size > 1);
    const own = fs.filter((f2) => f2.stateId === targetStateId);
    const pool = own.length ? own : fs;
    return pool.reduce((b, f2) => !b || f2.size > b.size ? f2 : b, null);
  };
  function advance(ctx, w, camp) {
    const { civ: civ6, world } = ctx, ops = w.ops, mi = civ6.monthIndex, F = ops.forces[camp.forceId];
    if (!F || camp.phase !== "active") return;
    const st2 = civ6.states[F.stateId], side = F.side, foe = other(side);
    const age = mi - camp.startedAt;
    if (camp.kind === "defense") {
      F.morale = clamp12(F.morale + 0.03);
      F.supply = 1;
      if (age >= 6) camp.phase = "done";
      return;
    }
    if (camp.kind === "naval_control" || camp.kind === "blockade") {
      const th = ops.theaters[camp.theaterId];
      if (!th) {
        camp.phase = "done";
        return;
      }
      F.supply = 0.9;
      const D2 = forcesOf(w, foe, "fleet").find((f2) => f2.size > 1);
      if (camp.kind === "naval_control") {
        const site = (byState(ctx).get(D2?.stateId) ?? []).find((x) => world.cell.coastDist[x.cell] <= 1) ?? (byState(ctx).get(D2?.stateId) ?? [])[0];
        if (D2 && site && U(civ6, w.id, mi, camp.id, "eng") < 0.45) {
          const coast = site;
          const r = fight(ctx, w, { kind: "naval", A: F, D: D2, camp, g: coast });
          th.control = clamp12(th.control + (r.win === "A" ? 1 : -1) * (side === "a" ? 1 : -1) * 0.3, -1, 1);
          if (F.morale < 0.2) {
            camp.phase = "done";
            camp.result = "failed";
          }
        } else if (!D2) th.control = clamp12(th.control + (side === "a" ? 1 : -1) * 0.08, -1, 1);
        if (age >= 12) camp.phase = "done";
        return;
      }
      const ctl = side === "a" ? th.control : -th.control;
      if (ctl < 0.2 || age >= 12) {
        camp.phase = "done";
        return;
      }
      for (const e of members(civ6, w, foe)) if ((byState(ctx).get(e.id) ?? []).some((g2) => world.cell.coastDist[g2.cell] <= 1)) {
        e.blockade = mi + 3;
        e.treasury -= Math.max(0, e.pop * 3e-5);
      }
      return;
    }
    const g = civ6.groups[camp.targetGroupId];
    if (!g || holderSide(w, g, civ6) !== foe) {
      camp.phase = "done";
      camp.result = "moot";
      return;
    }
    if (F.size < 1 || F.morale < 0.15) {
      camp.phase = "done";
      camp.result = "failed";
      return;
    }
    const capc = capCell(civ6, st2) ?? g.cell, dist = distKm(world, capc, g.cell), own = g.stateId && sideOf(w, g.stateId) === side;
    F.cell = g.cell;
    F.supply = camp.kind === "landing" ? 0.7 : own ? 1 : supplyAt(civ6, st2, dist);
    if (F.supply < 0.4) {
      const lost = F.size * 0.01 * (1 - (fx2(st2).attr ?? 0));
      st2.army = Math.max(0, st2.army - lost);
      F.size -= lost;
      F.morale = clamp12(F.morale - 0.03);
    }
    if (camp.kind === "landing") {
      const sea = seaTheater(w), ctl = sea ? side === "a" ? sea.control : -sea.control : 0;
      if (ctl < -0.3) {
        camp.phase = "done";
        camp.result = "failed";
        return;
      }
      camp.progress += 0.18 + 0.4 * (fx2(st2).landing ?? 0);
      if (camp.progress < 1) return;
    }
    const Dn = defenderForce(ctx, w, foe, g.stateId), tst = civ6.states[g.stateId], stage = stageOf3(civ6, g);
    const garrison = (g.pop * 0.02 + 20) * (1 + (tst?.defense ?? 0) * 2 + (tst?.milDef ?? 0)) * (stage === "city" ? 2 : stage === "town" ? 1.4 : 1);
    if (camp.kind === "landing") {
      const r = fight(ctx, w, { kind: "landing", A: F, D: Dn && Dn.stateId === g.stateId ? Dn : null, camp, g, garrison });
      if (r.win === "A") {
        occupy(ctx, w, g, side, camp);
        ops.stats.landings++;
        camp.phase = "done";
        camp.result = "success";
      } else {
        camp.phase = "done";
        camp.result = "failed";
      }
      return;
    }
    if (Dn && U(civ6, w.id, mi, camp.id, "eng") < (camp.kind === "siege" ? 0.25 : 0.45)) {
      const r = fight(ctx, w, { kind: "field", A: F, D: Dn, camp, g: fieldSite(ctx, w, camp, g) });
      camp.progress = clamp12(camp.progress + (r.win === "A" ? 0.3 : -0.25), 0, 1.2);
      if (r.win !== "A" && F.morale < 0.2) {
        camp.phase = "done";
        camp.result = "failed";
        return;
      }
    } else {
      const atkP = landPower(civ6, st2, F.size) * moraleF(F) * (0.5 + 0.5 * F.supply), ratio = atkP / (garrison * (1 + terrainBonus(world, g.cell)) + 1);
      const rate = camp.kind === "siege" ? clamp12(0.035 * ratio * (1 + 2 * (fx2(st2).siege ?? 0)), 0.01, 0.22) : clamp12(0.06 * ratio, 0.02, 0.3);
      camp.progress = clamp12(camp.progress + rate * (0.6 + 0.4 * F.supply), 0, 1.2);
      if (camp.kind === "siege") {
        const l = F.size * 4e-3 * (1 - (fx2(st2).attr ?? 0));
        st2.army = Math.max(0, st2.army - l);
        F.size -= l;
        w.casualties += l;
        ops.stats.dead[st2.id] = (ops.stats.dead[st2.id] ?? 0) + l;
      }
    }
    if (camp.progress >= 1) {
      if (camp.kind === "siege") {
        ops.stats.sieges++;
        const rec = { id: nid(ops, "b"), at: mi, kind: "siege", name: battleName(ctx, w, "siege", g), theater: camp.theaterId, cell: g.cell, a: F.stateId, d: g.stateId, winner: F.stateId, deadA: 0, deadD: 0, win: "A", notable: stage === "city" || tst?.capitalGroupId === g.id };
        ops.battles.push(rec);
        if (rec.notable) {
          ops.stats.big++;
          if (evBudget(ops, mi)) makeEvent(civ6, ctx.ids, { kind: "battle_fought", title: `${rec.name}\uFF08${st2.name}\u304C${placeName(ctx, g)}\u3092\u843D\u3068\u3057\u305F\uFF09`, participants: [{ entityId: w.id, role: "war" }, { entityId: st2.id, role: "attacker" }, { entityId: g.stateId, role: "defender" }], location: { cell: g.cell }, causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, name: rec.name, kind: "siege", cell: g.cell, winnerStateId: st2.id, loserStateId: g.stateId }, provenance: "simulation" });
        }
        ops.stats.battles++;
      }
      const wasOurs = g.stateId && sideOf(w, g.stateId) === side;
      if (wasOurs) {
        liberate(w, g);
        w.score = clamp12(w.score + (side === "a" ? 1 : -1) * 4, -100, 100);
      } else occupy(ctx, w, g, side, camp);
      camp.phase = "done";
      camp.result = "success";
      F.morale = clamp12(F.morale + 0.08);
    }
    if (age > 30) {
      camp.phase = "done";
      camp.result = "stalled";
    }
  }
  function monthly(ctx) {
    const { civ: civ6 } = ctx;
    for (const id in civ6.states) {
      const s = civ6.states[id];
      if (!s.alive) continue;
      if (s.warLoss > 0) {
        s.warLoss = s.warLoss < 4e-3 ? 0 : r34(s.warLoss * 0.97);
      }
      if (s.blockade != null && s.blockade <= civ6.monthIndex) delete s.blockade;
    }
  }
  function stepWar(ctx, w) {
    const { civ: civ6 } = ctx, mi = civ6.monthIndex;
    if (!w.ops) initWar(ctx, w);
    const ops = w.ops;
    syncForces(ctx, w);
    if (mi % 3 === 0 || !Object.keys(ops.theaters).length) ensureTheaters(ctx, w);
    for (const f2 of forcesOf(w, "a").concat(forcesOf(w, "d"))) {
      const c = f2.campaignId ? ops.campaigns[f2.campaignId] : null;
      if (!c || c.phase !== "active") {
        if (c) delete ops.campaigns[c.id];
        f2.campaignId = null;
        planFor(ctx, w, f2);
      }
    }
    for (const c of Object.values(ops.campaigns).sort((x, y) => x.id < y.id ? -1 : 1)) advance(ctx, w, c);
    for (const id of Object.keys(ops.campaigns)) if (ops.campaigns[id].phase === "done" && !ops.forces[ops.campaigns[id].forceId]) delete ops.campaigns[id];
    for (const f2 of Object.values(ops.forces)) {
      const st2 = civ6.states[f2.stateId];
      if (f2.lastBattle < mi - 1) f2.morale = clamp12(f2.morale + 0.015 + 0.02 * (fx2(st2).coh ?? 0) - 0.02 * (effective(civ6, st2, "fatigue") ?? 0));
    }
    const mor = (side) => {
      const fs = forcesOf(w, side);
      const tot = fs.reduce((s, f2) => s + f2.size, 0);
      return tot ? fs.reduce((s, f2) => s + f2.morale * f2.size, 0) / tot : 0;
    };
    const mA = mor("a"), mD = mor("d");
    w.score = clamp12(w.score + (mA - mD) * 2.5, -100, 100);
    ops.broken.a = mA < 0.15 ? ops.broken.a + 1 : 0;
    ops.broken.d = mD < 0.15 ? ops.broken.d + 1 : 0;
    const age = mi - w.startedAt;
    if (w.score >= 80 || ops.broken.d >= 6) endWar(ctx, w, "aggressor_victory");
    else if (w.score <= -80 || ops.broken.a >= 6) endWar(ctx, w, "defender_victory");
    else if (age > 120) endWar(ctx, w, "stalemate");
  }
  function finalize(ctx, w, outcome) {
    const { civ: civ6 } = ctx, ops = w.ops;
    if (!ops) return;
    const notable = ops.battles.filter((b) => b.notable).sort((x, y) => y.deadA + y.deadD - (x.deadA + x.deadD) || (x.id < y.id ? -1 : 1)).slice(0, 3).sort((x, y) => x.at - y.at);
    w.summary = { battles: ops.stats.battles, big: ops.stats.big, sieges: ops.stats.sieges, naval: ops.stats.naval, landings: ops.stats.landings, dead: Math.round(Object.values(ops.stats.dead).reduce((a, b) => a + b, 0)), notable: notable.map((b) => ({ name: b.name, at: b.at, kind: b.kind, winner: b.winner })) };
    if (notable.length) makeEvent(civ6, ctx.ids, { kind: "war_epilogue", title: `${civ6.states[w.aggressor]?.name ?? "?"}\u3068${civ6.states[w.defender]?.name ?? "?"}\u306E\u6226\u4E89\u306E\u4E3B\u306A\u6226\u3044: ${notable.map((b) => b.name).join("\u30FB")}`, participants: [{ entityId: w.id, role: "war" }], causes: w.declaredEvent ? [{ targetId: w.declaredEvent, relation: "part_of", basis: "direct" }] : [], facts: { warId: w.id, battles: w.summary.battles, dead: w.summary.dead, notable: w.summary.notable.map((b) => b.name) }, provenance: "simulation" });
    for (const id of [...w.sides.a, ...w.sides.d]) {
      const s = civ6.states[id];
      if (s) {
        const arm = s.military?.exp;
        if (arm) arm.wars = (arm.wars ?? 0) + 1;
      }
    }
    w.ops = { v: 1, ended: true, battles: notable.map((b) => ({ ...b })), stats: { battles: ops.stats.battles, big: ops.stats.big, sieges: ops.stats.sieges, naval: ops.stats.naval, landings: ops.stats.landings, dead: {}, won: ops.stats.won } };
    w.occupied = [];
  }
  function checkWars(civ6) {
    const errs = [];
    for (const wid of civ6.activeWarIds) {
      const w = civ6.wars[wid], ops = w?.ops;
      if (!ops || ops.ended) continue;
      const ids = /* @__PURE__ */ new Set([...w.sides.a, ...w.sides.d]);
      for (const f2 of Object.values(ops.forces)) {
        if (!ids.has(f2.stateId)) errs.push(`\u6226\u4E89 ${wid} \u306E\u90E8\u968A ${f2.id} \u306E\u56FD\u5BB6\u304C\u53C2\u6226\u3057\u3066\u3044\u306A\u3044`);
        if (!(f2.size >= 0) || !Number.isFinite(f2.size)) errs.push(`\u6226\u4E89 ${wid} \u306E\u90E8\u968A ${f2.id} \u306E\u898F\u6A21\u304C\u4E0D\u6B63`);
        if (!(f2.morale >= 0 && f2.morale <= 1)) errs.push(`\u6226\u4E89 ${wid} \u306E\u90E8\u968A ${f2.id} \u306E\u58EB\u6C17\u304C\u7BC4\u56F2\u5916`);
        if (f2.campaignId && !ops.campaigns[f2.campaignId]) errs.push(`\u6226\u4E89 ${wid} \u306E\u90E8\u968A ${f2.id} \u306E\u4F5C\u6226 ${f2.campaignId} \u304C\u7121\u3044`);
      }
      for (const c of Object.values(ops.campaigns)) {
        if (!ops.forces[c.forceId]) errs.push(`\u6226\u4E89 ${wid} \u306E\u4F5C\u6226 ${c.id} \u306E\u90E8\u968A\u304C\u7121\u3044`);
        if (c.theaterId && !ops.theaters[c.theaterId]) errs.push(`\u6226\u4E89 ${wid} \u306E\u4F5C\u6226 ${c.id} \u306E\u6226\u57DF\u304C\u7121\u3044`);
        if (c.phase !== "done" && c.targetGroupId && !civ6.groups[c.targetGroupId]) errs.push(`\u6226\u4E89 ${wid} \u306E\u4F5C\u6226 ${c.id} \u306E\u76EE\u6A19\u306E\u96C6\u56E3\u304C\u7121\u3044`);
      }
      for (const gid of Object.keys(ops.occ)) if (!w.occupied.includes(gid)) errs.push(`\u6226\u4E89 ${wid} \u306E\u5360\u9818\u306E\u8A18\u9332 ${gid} \u304C\u5360\u9818\u306E\u4E00\u89A7\u306B\u7121\u3044`);
    }
    for (const w of Object.values(civ6.wars)) if (w.status === "ended" && w.ops && (w.ops.forces || w.ops.campaigns || w.ops.theaters)) errs.push(`\u7D42\u7D50\u3057\u305F\u6226\u4E89 ${w.id} \u306B\u90E8\u968A\u30FB\u4F5C\u6226\u30FB\u6226\u57DF\u304C\u6B8B\u3063\u3066\u3044\u308B`);
    return errs;
  }
  function settle(ctx, w, outcome, terms = null) {
    const { civ: civ6 } = ctx, ops = w.ops;
    if (!ops || ops.ended) return null;
    const won = outcome === "aggressor_victory" ? "a" : outcome === "defender_victory" ? "d" : null, keep = outcome === "negotiated" && terms?.kind === "cession", out = [];
    if (won || keep) for (const gid of [...w.occupied].sort()) {
      const g = civ6.groups[gid];
      if (!g || !g.stateId) continue;
      const side = ops.occ[gid];
      if (!keep && side !== won) continue;
      const to = civ6.states[ops.occBy?.[gid]];
      if (!to?.alive || to.id === g.stateId) continue;
      if (sideOf(w, g.stateId) === side) continue;
      out.push({ gid, from: g.stateId, to: to.id });
      g.stateId = to.id;
    }
    return out;
  }
  function leaveWar(ctx, w, st2) {
    const { civ: civ6 } = ctx, ops = w.ops;
    if (!ops || ops.ended) return;
    for (const side of ["a", "d"]) w.sides[side] = w.sides[side].filter((i) => i !== st2.id);
    st2.warIds = st2.warIds.filter((i) => i !== w.id);
    if (st2.campaign?.warId === w.id) st2.campaign = null;
    if (ops.direction) delete ops.direction[st2.id];
    for (const gid of Object.keys(ops.occBy ?? {})) if (ops.occBy[gid] === st2.id) {
      const g = civ6.groups[gid];
      if (g) liberate(w, g);
      else {
        w.occupied = w.occupied.filter((x) => x !== gid);
        delete ops.occ[gid];
        delete ops.occBy[gid];
      }
    }
    syncForces(ctx, w);
  }
  var warSide = (w, id) => sideOf(w, id);

  // js/core/wcde/intervention.js
  var MAX_REASON = 200;
  var initInterventions = () => ({ records: [] });
  var ledger = (civ6) => {
    var _a;
    return (_a = civ6.wcde).interventions ?? (_a.interventions = initInterventions());
  };
  var interventionsOf = (civ6) => ledger(civ6).records;
  var fin = (x) => typeof x === "number" && Number.isFinite(x);
  var residualAt = (rec, monthIndex2) => rec.residual0 * Math.pow(0.5, Math.max(0, monthIndex2 - rec.startMonth) / rec.halfLife);
  function rebuildAdjust(civ6) {
    var _a, _b;
    const adj = (_a = civ6.wcde).adjust ?? (_a.adjust = {});
    for (const k of Object.keys(adj)) delete adj[k];
    for (const r of ledger(civ6).records) if (r.status === "active") (adj[_b = r.targetId] ?? (adj[_b] = {}))[adjKey(r.field, r.otherId)] = { add: r.residual };
  }
  function planIntervention(w, { stateId, field, value, reason = "", halfLifeMonths = null, otherId = null }) {
    const { civ: civ6 } = w, fail6 = (error) => ({ ok: false, error }), f2 = FIELDS[field];
    if (!f2) return fail6(`\u300C${field}\u300D\u306F\u4ECB\u5165\u3067\u304D\u308B\u9805\u76EE\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08${Object.keys(FIELDS).join("\u30FB")}\uFF09`);
    const st2 = civ6.states[stateId];
    if (!st2?.alive) return fail6("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (f2.pair) {
      if (!otherId || otherId === stateId || !civ6.states[otherId]?.alive) return fail6("\u95A2\u4FC2\u5024\u306E\u4ECB\u5165\u306B\u306F\u3001\u76F8\u624B\u306E\u56FD\u5BB6\uFF08\u5B58\u547D\uFF09\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
    } else if (otherId != null) return fail6(`${f2.ja}\u306B\u306F\u76F8\u624B\u306E\u6307\u5B9A\u306F\u4E0D\u8981\u3067\u3059`);
    if (!fin(value)) return fail6("\u5024\u304C\u6570\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08NaN\u30FBInfinity\u30FB\u578B\u306E\u4E0D\u4E00\u81F4\u306F\u4ECB\u5165\u3067\u304D\u307E\u305B\u3093\uFF09");
    if (value < f2.min || value > f2.max) return fail6(`${f2.ja}\u306F ${f2.min}\u301C${f2.max} \u306E\u7BC4\u56F2\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044`);
    if (typeof reason !== "string" || reason.length > MAX_REASON) return fail6(`\u7406\u7531\u306E\u6CE8\u91C8\u306F ${MAX_REASON} \u6587\u5B57\u307E\u3067\u306E\u6587\u5B57\u5217\u3067\u3059`);
    let half = f2.half;
    if (halfLifeMonths != null) {
      if (!fin(halfLifeMonths) || halfLifeMonths < 1 || halfLifeMonths > 1200) return fail6("\u6E1B\u8870\u306E\u534A\u6E1B\u671F\u306F 1\u301C1200 \u304B\u6708");
      half = halfLifeMonths;
    }
    const nominal = nominalOf(civ6, st2, field, otherId);
    if (!fin(nominal)) return fail6(`${f2.ja}\u306F\u307E\u3060\u7B97\u51FA\u3055\u308C\u3066\u3044\u307E\u305B\u3093\uFF08\u6B21\u306E\u6708\u6B21\u51E6\u7406\u306E\u3042\u3068\u3067\u4ECB\u5165\u3067\u304D\u307E\u3059\uFF09`);
    const residual0 = value - nominal;
    if (Math.abs(residual0) < f2.eps) return fail6(`\u6307\u5B9A\u5024\u304C\u901A\u5E38\u8A08\u7B97\u5024\uFF08${Math.round(nominal * 1e3) / 1e3}\uFF09\u3068\u307B\u307C\u540C\u3058\u3067\u3059`);
    return { ok: true, plan: { st: st2, f: f2, nominal, residual0, half, reason: reason.trim(), otherId: f2.pair ? otherId : null } };
  }
  function createIntervention(w, args, authority = "creator_intervention") {
    const p = planIntervention(w, args);
    if (!p.ok) return p;
    const { civ: civ6 } = w, { st: st2, nominal, residual0, half, reason, otherId } = p.plan, L = ledger(civ6), mi = civ6.monthIndex, id = w.sim.ctx.ids.next("intervention");
    let supersedes = null;
    for (const r of L.records) if (r.status === "active" && r.targetId === st2.id && r.field === args.field && (r.otherId ?? null) === (otherId ?? null)) {
      r.status = "superseded";
      r.endedAt = mi;
      r.supersededBy = id;
      supersedes = r.id;
    }
    L.records.push({ id, targetId: st2.id, field: args.field, otherId: otherId ?? null, domain: FIELDS[args.field].domain ?? null, nominalAtStart: nominal, target: args.value, residual0, residual: residual0, startMonth: mi, halfLife: half, mode: "add", status: "active", authority, reason, supersedes, endedAt: null, changes: [{ at: mi, target: args.value }] });
    rebuildAdjust(civ6);
    return { ok: true, id, nominal, residual0, supersedes };
  }
  function cancelIntervention(w, { id }) {
    const { civ: civ6 } = w, r = ledger(civ6).records.find((x) => x.id === id);
    if (!r) return { ok: false, error: "\u305D\u306E\u4ECB\u5165\u306F\u3042\u308A\u307E\u305B\u3093" };
    if (r.status !== "active") return { ok: false, error: `\u305D\u306E\u4ECB\u5165\u306F\u3059\u3067\u306B\u7D42\u308F\u3063\u3066\u3044\u307E\u3059\uFF08${r.status}\uFF09` };
    r.status = "cancelled";
    r.endedAt = civ6.monthIndex;
    rebuildAdjust(civ6);
    return { ok: true, id };
  }
  function stepInterventions(ctx) {
    const { civ: civ6 } = ctx;
    if (!civ6.options.wcde) return;
    const L = civ6.wcde.interventions;
    if (!L) return;
    let changed = false;
    const mi = civ6.monthIndex;
    for (const r of L.records) {
      if (r.status !== "active") continue;
      changed = true;
      if (!civ6.states[r.targetId]?.alive) {
        r.status = "target_gone";
        r.endedAt = mi;
        continue;
      }
      const res = residualAt(r, mi);
      if (Math.abs(res) < Math.max(FIELDS[r.field].eps, 1e-3 * Math.abs(r.residual0))) {
        r.status = "converged";
        r.endedAt = mi;
        r.residual = 0;
      } else r.residual = res;
    }
    if (changed) rebuildAdjust(civ6);
  }
  function checkInterventions(civ6) {
    const errs = [], L = civ6.wcde?.interventions;
    if (!L) return errs;
    const seen = /* @__PURE__ */ new Set(), ids = /* @__PURE__ */ new Set();
    for (const r of L.records) {
      if (ids.has(r.id)) errs.push(`\u4ECB\u5165 ${r.id} \u304C\u91CD\u8907`);
      ids.add(r.id);
      if (!FIELDS[r.field]) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u9805\u76EE ${r.field} \u304C\u672A\u77E5`);
      for (const k of ["nominalAtStart", "target", "residual0", "residual", "halfLife"]) if (!fin(r[k])) errs.push(`\u4ECB\u5165 ${r.id}.${k} \u304C\u6709\u9650\u3067\u306A\u3044`);
      if (!["active", "converged", "superseded", "cancelled", "target_gone"].includes(r.status)) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u72B6\u614B ${r.status} \u304C\u4E0D\u6B63`);
      if (!civ6.states[r.targetId]) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u5BFE\u8C61 ${r.targetId} \u304C\u7121\u3044`);
      if (r.status === "active") {
        const k = r.targetId + "|" + adjKey(r.field, r.otherId);
        if (seen.has(k)) errs.push(`\u540C\u3058\u9805\u76EE\u306B\u6709\u52B9\u306A\u4ECB\u5165\u304C\u8907\u6570\u3042\u308B\uFF08${k}\uFF09`);
        seen.add(k);
        const a = civ6.wcde.adjust?.[r.targetId]?.[adjKey(r.field, r.otherId)];
        if (!a || Math.abs(a.add - r.residual) > 1e-9) errs.push(`\u4ECB\u5165 ${r.id} \u306E\u88DC\u6B63\u306E\u8868\u304C\u8A18\u9332\u3068\u4E00\u81F4\u3057\u306A\u3044`);
      }
    }
    const adj = civ6.wcde.adjust ?? {};
    for (const sid of Object.keys(adj)) for (const f2 of Object.keys(adj[sid])) if (!seen.has(sid + "|" + f2)) errs.push(`\u88DC\u6B63\u306E\u8868 ${sid}.${f2} \u306B\u5BFE\u5FDC\u3059\u308B\u6709\u52B9\u306A\u4ECB\u5165\u304C\u7121\u3044`);
    return errs;
  }

  // js/core/wcde/clock.js
  var SPEEDS = Object.freeze([{ id: 0, label: "\u505C\u6B62", mps: 0 }, { id: 1, label: "\u6708", mps: 1 }, { id: 2, label: "3\u6708", mps: 3 }, { id: 3, label: "\u5E74", mps: 12 }, { id: 4, label: "5\u5E74", mps: 60 }]);
  var DEFAULT_SPEED = 1;
  var ACK_KEEP = 400;
  var MAX_RUN = 240;
  var COOLDOWN = 60;
  var timeOf = (civ6) => {
    var _a;
    return (_a = civ6.wcde).time ?? (_a.time = { speed: DEFAULT_SPEED, hold: false, resumeSpeed: null });
  };
  var newsOf = (civ6) => {
    var _a;
    return (_a = civ6.wcde).news ?? (_a.news = { queue: [], acked: [], scanned: civ6.events.length });
  };
  var isRunning = (civ6) => {
    const t = timeOf(civ6);
    return !t.hold && t.speed > 0;
  };
  var MAJOR_SCORE = 40;
  var OWN_CRITICAL = /* @__PURE__ */ new Set(["state_dissolved", "war_declared", "war_ended", "ally_joined", "conquest", "regime_change", "state_formed"]);
  var WORLD_WAR = Object.freeze({ minStates: 6, minPerSide: 2, minPopShare: 0.35 });
  var SAME_KIND_COOLDOWN_EXEMPT = /* @__PURE__ */ new Set(["state_dissolved", "war_declared", "war_ended", "ally_joined"]);
  function ownIds(civ6) {
    const out = /* @__PURE__ */ new Set(), id = civ6.wcde.control?.stateId;
    if (id) out.add(id);
    const log3 = civ6.wcde.log ?? [];
    for (let i = log3.length - 1; i >= 0 && log3[i].at >= civ6.monthIndex - 2; i--) if (log3[i].type === "control.lost" && log3[i].stateId) out.add(log3[i].stateId);
    return out;
  }
  function isWorldWar(civ6, war) {
    if (!war) return false;
    const alive = (ids) => ids.filter((i) => civ6.states[i]?.alive), a = alive(war.sides.a), d = alive(war.sides.d);
    if (a.length < WORLD_WAR.minPerSide || d.length < WORLD_WAR.minPerSide || a.length + d.length < WORLD_WAR.minStates) return false;
    let total = 0, inWar = 0;
    for (const s of Object.values(civ6.states)) if (s.alive) total += s.pop;
    for (const i of [...a, ...d]) inWar += civ6.states[i].pop;
    return total > 0 && inWar / total >= WORLD_WAR.minPopShare;
  }
  var warIdOf = (ev) => ev.facts?.warId ?? ev.participants.find((p) => p.role === "war")?.entityId ?? null;
  var worldWarTitle = (civ6, war) => {
    const n2 = (x) => civ6.states[x]?.name ?? "?";
    return `\u4E16\u754C\u5927\u6226: ${n2(war.aggressor)}\u3068${n2(war.defender)}\u306E\u6226\u4E89\u306B ${war.sides.a.length + war.sides.d.length} \u304B\u56FD\u304C\u53C2\u6226\u3057\u305F`;
  };
  function newsContext(civ6) {
    const alive = Object.values(civ6.states).filter((s) => s.alive), total = alive.reduce((a, s) => a + s.pop, 0) || 1, n2 = Math.max(1, alive.length), rel = {};
    for (const s of Object.values(civ6.states)) rel[s.id] = s.pop / total * n2;
    return { rel, own: ownIds(civ6) };
  }
  var KIND = { state_dissolved: 40, war_declared: 25, war_ended: 30, regime_change: 25, conquest: 35, state_formed: 20, religion_founded: 25, religion_schism: 20, famine: 15, disaster_struck: 15, climate_shift: 20, dynasty_changed: 15, culture_diverged: 10, language_diverged: 10, tech_lost: 20 };
  var SIZE_K = 15;
  function classifyEvent(civ6, ev, cx = newsContext(civ6)) {
    const lv = (score2, extra = {}) => ({ level: score2 >= MAJOR_SCORE ? "major" : "normal", score: score2, ...extra });
    {
      const wid = ev.kind === "war_declared" ? warIdOf(ev) : null, war = wid ? civ6.wars[wid] : null;
      if (war && civ6.wcde.news?.worldWars?.[wid] === ev.eventId) return { level: "critical", score: 200, title: worldWarTitle(civ6, war), reason: "world_war" };
    }
    if (ev.kind === "catastrophe") {
      const m = ev.facts?.mortality ?? 0;
      return lv(Math.round(70 + 40 * m + (ev.facts?.scope === "world" ? 20 : 0)));
    }
    const own = cx.own?.size && OWN_CRITICAL.has(ev.kind) && ev.participants.some((p) => cx.own.has(p.entityId));
    const base = KIND[ev.kind];
    if (base == null || base === 0) return own ? { level: "critical", score: 100, reason: "own" } : { level: "normal", score: 0 };
    const ids = ev.participants.map((p) => p.entityId).filter((i) => civ6.states[i]), sum = ids.reduce((a, i) => a + (cx.rel[i] ?? 0), 0), big = Math.max(0, ...ids.map((i) => cx.rel[i] ?? 0));
    let score = base + SIZE_K * Math.log2(1 + sum);
    if (ev.kind === "regime_change" || ev.kind === "dynasty_changed") score = base + SIZE_K * Math.log2(1 + big);
    if (ev.kind === "culture_diverged" || ev.kind === "language_diverged" || ev.kind === "famine" || ev.kind === "disaster_struck") score = Math.min(score, 69);
    score = Math.round(score);
    if (own) return { level: "critical", score: Math.max(score, 100), reason: "own" };
    return lv(score);
  }
  var newsItem = (civ6, ev, c) => ({ id: "news_" + ev.eventId, eventId: ev.eventId, date: ev.date, kind: ev.kind, title: c.title ?? ev.title, level: c.level, score: c.score, entityIds: [...new Set(ev.participants.map((p) => p.entityId))] });
  function scanNews(civ6) {
    const N2 = newsOf(civ6), T3 = timeOf(civ6);
    if (N2.scanned > civ6.events.length) N2.scanned = civ6.events.length;
    delete N2.settings;
    const cx = newsContext(civ6), fresh = [];
    for (let i = N2.scanned; i < civ6.events.length; i++) {
      const ev = civ6.events[i];
      if (ev.kind === "war_declared") {
        const wid = warIdOf(ev), war = wid ? civ6.wars[wid] : null, ww = N2.worldWars ?? (N2.worldWars = {});
        if (war && !ww[wid] && isWorldWar(civ6, war)) ww[wid] = ev.eventId;
      }
      const c = classifyEvent(civ6, ev, cx);
      if (c.level === "critical" && c.reason === "own" && !SAME_KIND_COOLDOWN_EXEMPT.has(ev.kind)) {
        const keys = ev.participants.filter((p) => cx.own.has(p.entityId)).map((p) => ev.kind + "|" + p.entityId), mi = civ6.monthIndex, last = N2.lastCrit ?? (N2.lastCrit = {});
        if (keys.some((k) => last[k] != null && mi - last[k] < COOLDOWN)) c.level = "major";
        else for (const k of keys) last[k] = mi;
      }
      if (c.level === "critical" && !N2.acked.includes(ev.eventId) && !N2.queue.some((q2) => q2.eventId === ev.eventId)) fresh.push(newsItem(civ6, ev, c));
    }
    N2.scanned = civ6.events.length;
    fresh.sort((a, b) => b.score - a.score || (a.eventId < b.eventId ? -1 : 1));
    N2.queue.push(...fresh);
    if (N2.queue.length && !T3.hold) {
      T3.hold = true;
      T3.resumeSpeed = T3.speed;
    }
    return fresh.length;
  }
  var skipNews = (civ6) => {
    newsOf(civ6).scanned = civ6.events.length;
  };
  function clockRun(w, months) {
    const { civ: civ6 } = w, T3 = timeOf(civ6);
    if (T3.hold) return { ok: false, code: "news_hold", error: "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u78BA\u8A8D\u5F85\u3061\u3067\u3059\uFF08OK \u3092\u62BC\u3059\u307E\u3067\u6642\u9593\u306F\u9032\u307F\u307E\u305B\u3093\uFF09" };
    const n2 = Math.max(1, Math.min(MAX_RUN, months | 0)), snap = checkpointFull(civ6);
    let done2 = 0, held = false;
    try {
      for (; done2 < n2; done2++) {
        w.sim.advanceMonth();
        if (scanNews(civ6) > 0 || timeOf(civ6).hold) {
          done2++;
          held = true;
          break;
        }
      }
    } catch (err) {
      restoreInto(w, snap);
      const msg = String(err?.message ?? err);
      for (let i = 0; i < done2; i++) w.sim.advanceMonth();
      const ok2 = done2;
      skipNews(civ6);
      timeOf(civ6).speed = 0;
      civ6.wcde.diagnostics.push({ at: civ6.monthIndex, failedMonth: civ6.monthIndex + 1, message: msg });
      if (civ6.wcde.diagnostics.length > 50) civ6.wcde.diagnostics.shift();
      return { ok: false, advanced: ok2, error: msg, haltedAt: { ...civ6.date } };
    }
    return { ok: true, advanced: done2, held, date: { ...civ6.date } };
  }
  function ackNews(w, { id = null } = {}) {
    const { civ: civ6 } = w, N2 = newsOf(civ6), T3 = timeOf(civ6), head2 = N2.queue[0];
    if (!head2) return { ok: false, error: "\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u306F\u3042\u308A\u307E\u305B\u3093" };
    if (id != null && id !== head2.id) return { ok: false, error: "\u6700\u521D\u306E\u30CB\u30E5\u30FC\u30B9\u304B\u3089\u9806\u306B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044" };
    N2.queue.shift();
    N2.acked.push(head2.eventId);
    if (N2.acked.length > ACK_KEEP) N2.acked.splice(0, N2.acked.length - ACK_KEEP);
    if (!N2.queue.length) {
      T3.hold = false;
      T3.speed = T3.resumeSpeed ?? DEFAULT_SPEED;
      T3.resumeSpeed = null;
      return { ok: true, resumed: true, speed: T3.speed, next: null };
    }
    return { ok: true, resumed: false, next: N2.queue[0] };
  }
  function setSpeed(w, { speed }) {
    const { civ: civ6 } = w, T3 = timeOf(civ6);
    if (!SPEEDS.some((s) => s.id === speed)) return { ok: false, error: "\u305D\u306E\u901F\u5EA6\u306F\u3042\u308A\u307E\u305B\u3093" };
    if (T3.hold) {
      T3.resumeSpeed = speed;
      return { ok: true, held: true, willResume: speed };
    }
    T3.speed = speed;
    return { ok: true, speed };
  }
  function newsFeed(civ6, { limit = 40, minLevel = "major", before = null } = {}) {
    const cx = newsContext(civ6), out = [], rank = { normal: 0, major: 1, critical: 2 };
    for (let i = (before ?? civ6.events.length) - 1; i >= 0 && out.length < limit; i--) {
      const ev = civ6.events[i], c = classifyEvent(civ6, ev, cx);
      if (rank[c.level] >= rank[minLevel]) out.push(newsItem(civ6, ev, c));
    }
    return out;
  }
  function checkClock(civ6) {
    const errs = [], T3 = civ6.wcde.time, N2 = civ6.wcde.news;
    if (!T3 && !N2) return errs;
    if (T3) {
      if (!SPEEDS.some((s) => s.id === T3.speed)) errs.push("\u6642\u9593\u306E\u901F\u5EA6\u304C\u4E0D\u6B63");
      if (T3.hold && !N2?.queue.length) errs.push("\u505C\u6B62\u4E2D\u306A\u306E\u306B\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u304C\u306A\u3044\uFF08\u6642\u9593\u304C\u6B62\u307E\u3063\u305F\u307E\u307E\u306B\u306A\u308B\uFF09");
      if (!T3.hold && N2?.queue.length) errs.push("\u78BA\u8A8D\u5F85\u3061\u306E\u30CB\u30E5\u30FC\u30B9\u304C\u3042\u308B\u306E\u306B\u6642\u9593\u304C\u6B62\u307E\u3063\u3066\u3044\u306A\u3044");
      if (T3.hold && T3.resumeSpeed != null && !SPEEDS.some((s) => s.id === T3.resumeSpeed)) errs.push("\u5FA9\u5E30\u6642\u306E\u901F\u5EA6\u304C\u4E0D\u6B63");
    }
    if (N2) {
      const seen = /* @__PURE__ */ new Set();
      for (const q2 of N2.queue) {
        if (seen.has(q2.id)) errs.push(`\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u304C\u91CD\u8907`);
        seen.add(q2.id);
        if (!civ6.events.some((e) => e.eventId === q2.eventId) && (inLiveRange(civ6, q2.eventId) || !findRecord(civ6, q2.eventId))) errs.push(`\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u306E\u5143\u306E\u4E8B\u5B9F\u30A4\u30D9\u30F3\u30C8\u304C\u306A\u3044`);
        if (N2.acked.includes(q2.eventId)) errs.push(`\u78BA\u8A8D\u6E08\u307F\u306E\u30CB\u30E5\u30FC\u30B9 ${q2.id} \u304C\u30AD\u30E5\u30FC\u306B\u3042\u308B`);
      }
      if (N2.scanned > civ6.events.length || !Number.isInteger(N2.scanned) || N2.scanned < 0) errs.push("\u30CB\u30E5\u30FC\u30B9\u306E\u8D70\u67FB\u4F4D\u7F6E\u304C\u4E0D\u6B63");
    }
    return errs;
  }

  // js/core/wcde/catastrophe.js
  var MAX_MORTALITY = 1;
  var MIN_MORTALITY = 0.01;
  var NAME_MAX = 40;
  var REASON_MAX = 200;
  var clamp13 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r35 = (x) => Math.round(x * 1e3) / 1e3;
  var fin2 = (x) => typeof x === "number" && Number.isFinite(x);
  var catastrophesOf = (civ6) => {
    var _a;
    return (_a = civ6.wcde).catastrophes ?? (_a.catastrophes = []);
  };
  var U2 = (civ6, ...p) => hashSeed(civ6.historySeed, "catastrophe", ...p) / 4294967296;
  function planCatastrophe(w, { name = "", reason = "", scope = "world", center = null, radiusKm = null, mortality, recoveryMonths = 60 }) {
    const fail6 = (error) => ({ ok: false, error }), { civ: civ6, world } = w;
    if (typeof name !== "string" || name.trim().length > NAME_MAX) return fail6(`\u707D\u5384\u306E\u540D\u524D\u306F ${NAME_MAX} \u6587\u5B57\u307E\u3067\u306E\u6587\u5B57\u5217\u3067\u3059`);
    if (typeof reason !== "string" || reason.length > REASON_MAX) return fail6(`\u7406\u7531\u306E\u6CE8\u91C8\u306F ${REASON_MAX} \u6587\u5B57\u307E\u3067\u306E\u6587\u5B57\u5217\u3067\u3059`);
    if (scope !== "world" && scope !== "region") return fail6("\u7BC4\u56F2\u306F world\uFF08\u4E16\u754C\u898F\u6A21\uFF09\u304B region\uFF08\u5730\u57DF\u898F\u6A21\uFF09");
    if (!fin2(mortality) || mortality < MIN_MORTALITY || mortality > MAX_MORTALITY) return fail6(`\u4EBA\u53E3\u306E\u640D\u5931\u306E\u5272\u5408\u306F ${MIN_MORTALITY * 100}\u301C${MAX_MORTALITY * 100}% \u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044`);
    if (!fin2(recoveryMonths) || recoveryMonths < 1) return fail6("\u56DE\u5FA9\u307E\u3067\u306E\u76EE\u5B89\u306F 1 \u304B\u6708\u4EE5\u4E0A\u306B\u3057\u3066\u304F\u3060\u3055\u3044");
    let cell = null, radius = null;
    if (scope === "region") {
      cell = center;
      if (!Number.isInteger(cell) || cell < 0 || cell >= world.mesh.cellCount) return fail6("\u5730\u57DF\u898F\u6A21\u306E\u707D\u5384\u306B\u306F\u3001\u4E2D\u5FC3\u306E\u533A\u753B\uFF080\u301C\u533A\u753B\u6570\u22121 \u306E\u6574\u6570\uFF09\u304C\u5FC5\u8981\u3067\u3059");
      radius = radiusKm ?? 1500;
      if (!fin2(radius) || radius < 100 || radius > 2e4) return fail6("\u534A\u5F84\u306F 100\u301C20000 km");
    }
    return { ok: true, plan: { name: name.trim(), reason: reason.trim(), scope, cell, radius, mortality: r35(mortality), recoveryMonths: Math.round(recoveryMonths) } };
  }
  function createCatastrophe(w, args) {
    const p = planCatastrophe(w, args);
    if (!p.ok) return p;
    const { civ: civ6, world } = w, pl = p.plan, ctx = w.sim.ctx, mi = civ6.monthIndex, id = ctx.ids.next("catastrophe"), name = pl.name || "\u540D\u3082\u306A\u304D\u707D\u5384";
    const hit = [], cs = pl.cell != null ? pl.cell : null;
    for (const gid of Object.keys(civ6.groups).sort()) {
      const g = civ6.groups[gid];
      let k = 1;
      if (pl.scope === "region") {
        const d = distKm(world, cs, g.cell);
        if (d > pl.radius) continue;
        k = 1 - 0.6 * (d / pl.radius);
      }
      hit.push([g, k]);
    }
    const before = Object.values(civ6.groups).reduce((a, g) => a + g.pop, 0);
    let dead = 0;
    const states = /* @__PURE__ */ new Map(), effects = [];
    for (const [g, k] of hit) {
      const jitter = 0.85 + 0.15 * U2(civ6, id, g.id, "j"), frac = clamp13(pl.mortality * k * jitter, 0, MAX_MORTALITY), b = g.pop, a = Math.max(Math.min(b, 5), b * (1 - frac));
      g.pop = a;
      dead += b - a;
      g.capMult = r35(Math.min(g.capUntil > mi ? g.capMult : 1, clamp13(1 - 0.7 * frac, 0.25, 1)));
      g.capUntil = Math.max(g.capUntil ?? 0, mi + pl.recoveryMonths);
      for (const c of g.cohorts ?? []) c.tension = clamp13((c.tension ?? 0) + 0.3 * frac);
      if (g.stateId) {
        const e = states.get(g.stateId) ?? { b: 0, a: 0, frac: 0, n: 0 };
        e.b += b;
        e.a += a;
        states.set(g.stateId, e);
      }
    }
    const touched = [];
    for (const [sid, e] of [...states].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
      const st2 = civ6.states[sid];
      if (!st2?.alive) continue;
      const f2 = e.b ? 1 - e.a / e.b : 0, sb = st2.stability;
      st2.pop = Math.max(0, st2.pop - (e.b - e.a));
      st2.army = Math.max(0, st2.army * (1 - f2));
      st2.stability = clamp13(st2.stability - 0.3 * f2);
      st2.treasury -= Math.max(0, st2.treasury) * 0.15 * f2;
      touched.push(sid);
      effects.push({ targetId: sid, property: "pop", before: Math.round(e.b), after: Math.round(e.a) }, { targetId: sid, property: "stability", before: r35(sb), after: r35(st2.stability) });
    }
    const total = before > 0 ? dead / before : 0;
    catastrophesOf(civ6).push({ id, at: mi, name, reason: pl.reason, scope: pl.scope, center: cs, radiusKm: pl.radius, mortality: pl.mortality, recoveryMonths: pl.recoveryMonths, authority: "creator_intervention", result: { dead: Math.round(dead), share: r35(total), groups: hit.length, states: touched.length } });
    const label = pl.scope === "world" ? "\u4E16\u754C\u3092" : "\u3042\u308B\u5730\u57DF\u3092";
    makeEvent(civ6, ctx.ids, { kind: "catastrophe", title: `\u5927\u707D\u5384\u300C${name}\u300D\u304C${label}\u8972\u3063\u305F\uFF08\u4EBA\u53E3\u306E\u7D04 ${Math.round(total * 100)}% \u304C\u5931\u308F\u308C\u305F\uFF09`, participants: touched.slice(0, 8).map((s) => ({ entityId: s, role: "affected" })), location: cs != null ? { cell: cs } : null, effects: effects.slice(0, 16), facts: { catastropheId: id, scope: pl.scope, mortality: r35(total), dead: Math.round(dead) }, provenance: "creator" });
    ctx._byState = null;
    return { ok: true, id, dead: Math.round(dead), share: r35(total), groups: hit.length, states: touched.length };
  }
  function checkCatastrophes(civ6) {
    const errs = [], L = civ6.wcde?.catastrophes;
    if (!L) return errs;
    const ids = /* @__PURE__ */ new Set();
    for (const r of L) {
      if (ids.has(r.id)) errs.push(`\u707D\u5384 ${r.id} \u304C\u91CD\u8907`);
      ids.add(r.id);
      if (!fin2(r.mortality) || r.mortality > MAX_MORTALITY || r.mortality < 0) errs.push(`\u707D\u5384 ${r.id} \u306E\u640D\u5931\u306E\u5272\u5408\u304C\u7BC4\u56F2\u5916`);
      if (!fin2(r.result?.share) || r.result.share > MAX_MORTALITY + 1e-9) errs.push(`\u707D\u5384 ${r.id} \u306E\u7D50\u679C\u304C\u7BC4\u56F2\u5916`);
    }
    return errs;
  }

  // js/core/wcde/integrity.js
  var fin3 = (x) => typeof x === "number" && Number.isFinite(x);
  function checkWcdeIntegrity(world, civ6) {
    const errs = [], W2 = civ6.wcde;
    if (!civ6.options?.wcde) return errs;
    if (civ6.monthIndex % 12 === 0) errs.push(...checkArchive(civ6));
    const players = Object.values(civ6.states).filter((s) => s.alive && s.player);
    if (players.length > 1) errs.push(`\u62C5\u5F53\u56FD\u5BB6\u304C\u8907\u6570\u3042\u308B\uFF08${players.map((s) => s.id).join(",")}\uFF09`);
    const cs = W2?.control?.stateId ?? null;
    if (cs && !(civ6.states[cs]?.alive && civ6.states[cs].player)) errs.push(`\u62C5\u5F53\u56FD\u5BB6 ${cs} \u304C\u5B58\u5728\u3057\u306A\u3044\u30FB\u62C5\u5F53\u306E\u5370\u304C\u7121\u3044`);
    if (!cs && players.length) errs.push("\u62C5\u5F53\u304C\u7121\u3044\u306E\u306B\u3001\u62C5\u5F53\u306E\u5370\u304C\u4ED8\u3044\u305F\u56FD\u5BB6\u304C\u3042\u308B");
    if (civ6.player?.groupId != null) errs.push("WCDE \u306E\u4E16\u754C\u3067\u306F\u3001\u62C5\u5F53\u306F\u96C6\u56E3\u3067\u306F\u306A\u304F\u56FD\u5BB6\uFF08civ.player.groupId \u306F\u7A7A\uFF09");
    if (civ6.options.magic === false) {
      if (Object.keys(civ6.persons ?? {}).length || Object.keys(civ6.magic?.orgs ?? {}).length) errs.push("\u9B54\u6CD5\u306E\u7121\u3044\u4E16\u754C\u306B\u3001\u9B54\u6CD5\u306E\u4EBA\u7269\u30FB\u7D44\u7E54\u304C\u3042\u308B");
      for (const s of Object.values(civ6.states)) if (s.magic) errs.push(`\u9B54\u6CD5\u306E\u7121\u3044\u4E16\u754C\u3067\u56FD\u5BB6 ${s.id} \u306B\u9B54\u6CD5\u5236\u5EA6\u304C\u3042\u308B`);
    }
    for (const st2 of Object.values(civ6.states)) {
      if (!st2.alive) continue;
      const e = st2.econ;
      if (e) {
        for (const k of ["output", "industry", "perCapita", "foodBalance", "tradeIncome"]) if (e[k] !== void 0 && !fin3(e[k])) errs.push(`${st2.id}.econ.${k} \u304C\u6709\u9650\u3067\u306A\u3044`);
      }
      const P2 = st2.politics;
      if (P2) {
        for (const k of Object.keys(P2.factions)) {
          const f2 = P2.factions[k], s = f2?.support;
          if (!FACTIONS[k]) errs.push(`${st2.id} \u306B\u672A\u77E5\u306E\u52E2\u529B ${k}`);
          if (!(s >= 0 && s <= 1)) errs.push(`${st2.id} \u306E${FACTIONS[k] ?? k}\u306E\u652F\u6301\u304C\u7BC4\u56F2\u5916 ${s}`);
          if (!(f2.influence == null || f2.influence >= 0 && f2.influence <= 1)) errs.push(`${st2.id} \u306E${FACTIONS[k] ?? k}\u306E\u5F71\u97FF\u529B\u304C\u7BC4\u56F2\u5916`);
        }
        for (const k of ["nobility", "military", "commoners"]) if (!P2.factions[k]) errs.push(`${st2.id} \u306B\u5E38\u306B\u5728\u308B\u306F\u305A\u306E\u52E2\u529B ${k} \u304C\u7121\u3044`);
        for (const [k, v] of Object.entries(P2.ideas ?? {})) if (!(v >= 0 && v <= 1)) errs.push(`${st2.id} \u306E\u601D\u60F3 ${k} \u304C\u7BC4\u56F2\u5916`);
        if (!(P2.legitimacy >= 0 && P2.legitimacy <= 1)) errs.push(`${st2.id} \u306E\u6B63\u7D71\u6027\u304C\u7BC4\u56F2\u5916`);
      }
      const M = st2.military;
      if (M) {
        for (const id of Object.keys(M.doctrine.taken)) {
          const d = nodeOf(st2, id);
          if (!d) {
            if (!id.startsWith("sp:")) errs.push(`${st2.id} \u306B\u672A\u77E5\u306E\u30C9\u30AF\u30C8\u30EA\u30F3 ${id}`);
          } else for (const p of d.prereq) if (M.doctrine.taken[p] == null) errs.push(`${st2.id} \u306E\u30C9\u30AF\u30C8\u30EA\u30F3 ${id} \u306E\u524D\u63D0 ${p} \u304C\u7121\u3044`);
        }
        if (!(st2.milBonus >= -0.6 - 1e-9 && st2.milBonus <= 0.6 + 1e-9)) errs.push(`${st2.id} \u306E milBonus \u304C\u7BC4\u56F2\u5916 ${st2.milBonus}`);
        if (!(st2.milDef >= 0 && st2.milDef <= 0.4 + 1e-9)) errs.push(`${st2.id} \u306E milDef \u304C\u7BC4\u56F2\u5916`);
      }
      if (st2.leaderFigureId) {
        const f2 = civ6.figures?.[st2.leaderFigureId];
        if (!f2) errs.push(`${st2.id} \u306E\u6307\u5C0E\u8005\u306E\u4EBA\u7269 ${st2.leaderFigureId} \u304C\u7121\u3044`);
        else if (f2.diedAt != null) errs.push(`${st2.id} \u306E\u6307\u5C0E\u8005\u306E\u4EBA\u7269\u304C\u6CA1\u3057\u3066\u3044\u308B`);
      }
    }
    errs.push(...checkInterventions(civ6));
    errs.push(...checkCatastrophes(civ6));
    errs.push(...checkClock(civ6));
    errs.push(...checkWars(civ6));
    for (const f2 of Object.values(civ6.figures ?? {})) {
      if (f2.diedAt != null && f2.diedAt < f2.bornAt) errs.push(`\u4EBA\u7269 ${f2.id} \u306E\u6CA1\u304C\u751F\u3088\u308A\u524D`);
      if (f2.parents) for (const pid of f2.parents) {
        const p = civ6.figures[pid];
        if (!p) errs.push(`\u4EBA\u7269 ${f2.id} \u306E\u89AA ${pid} \u304C\u7121\u3044`);
        else {
          if (p.bornAt >= f2.bornAt) errs.push(`\u4EBA\u7269 ${f2.id} \u304C\u89AA\u3088\u308A\u5148\u306B\u751F\u307E\u308C\u3066\u3044\u308B`);
          if (!p.children.includes(f2.id)) errs.push(`\u4EBA\u7269 ${f2.id} \u304C\u89AA ${pid} \u306E\u5B50\u306B\u8F09\u3063\u3066\u3044\u306A\u3044`);
        }
      }
      for (const cid of f2.children) if (!civ6.figures[cid]) errs.push(`\u4EBA\u7269 ${f2.id} \u306E\u5B50 ${cid} \u304C\u7121\u3044`);
      if (f2.houseId && !civ6.houses?.[f2.houseId]) errs.push(`\u4EBA\u7269 ${f2.id} \u306E\u5BB6 ${f2.houseId} \u304C\u7121\u3044`);
    }
    return errs;
  }

  // js/core/wcde/control.js
  var fail2 = (error) => ({ ok: false, error });
  var controlledState = (civ6) => {
    const id = civ6.wcde.control.stateId;
    return id ? civ6.states[id] ?? null : null;
  };
  function dropPlayerPlans(civ6, st2) {
    st2.strategy = null;
    st2.campaign = null;
    for (const id of civ6.activeWarIds) {
      const o = civ6.wars[id]?.ops;
      if (o?.direction) delete o.direction[st2.id];
    }
  }
  function takeControl(w, stateId) {
    const { civ: civ6 } = w, st2 = civ6.states[stateId];
    if (!st2?.alive) return fail2("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    for (const s of Object.values(civ6.states)) if (s.player && s.id !== stateId) {
      s.player = false;
      dropPlayerPlans(civ6, s);
    }
    dropPlayerPlans(civ6, st2);
    st2.player = true;
    civ6.wcde.control.stateId = stateId;
    civ6.wcde.control.since = civ6.monthIndex;
    w.sim.ctx._byState = null;
    return { ok: true, stateId };
  }
  function releaseControl(w) {
    const { civ: civ6 } = w;
    for (const s of Object.values(civ6.states)) {
      if (s.player) dropPlayerPlans(civ6, s);
      s.player = false;
    }
    civ6.wcde.control.stateId = null;
    civ6.wcde.control.since = null;
    return { ok: true };
  }
  function syncControl(civ6) {
    const id = civ6.wcde.control.stateId;
    if (id && !civ6.states[id]?.alive) {
      civ6.wcde.log = (civ6.wcde.log ?? []).concat([{ at: civ6.monthIndex, type: "control.lost", ok: true, stateId: id }]).slice(-500);
      civ6.wcde.control.stateId = null;
      civ6.wcde.control.since = null;
    }
  }
  var FIELDS2 = {
    name: { get: (s) => s.name, set: (s, v) => {
      s.name = v;
      s.nameBase = null;
    }, check: (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 30 ? v.trim() : null },
    polity: { get: (s) => s.polity, set: (s, v) => {
      s.polity = v;
    }, check: (v) => v in POLITY ? v : null },
    "policy.tax": { get: (s) => s.policy.tax, set: (s, v) => {
      s.policy.tax = v;
    }, check: (v) => typeof v === "number" && v >= 0.02 && v <= 0.4 ? v : null },
    "policy.mobilization": { get: (s) => s.policy.mobilization, set: (s, v) => {
      s.policy.mobilization = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    "policy.tolerance": { get: (s) => s.policy.tolerance, set: (s, v) => {
      s.policy.tolerance = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    "policy.assimilation": { get: (s) => s.policy.assimilation, set: (s, v) => {
      s.policy.assimilation = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    "policy.autonomy": { get: (s) => s.policy.autonomy, set: (s, v) => {
      s.policy.autonomy = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    treasury: { get: (s) => s.treasury, set: (s, v) => {
      s.treasury = v;
    }, check: (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7 ? v : null },
    stability: { get: (s) => s.stability, set: (s, v) => {
      s.stability = v;
    }, check: (v) => typeof v === "number" && v >= 0 && v <= 1 ? v : null },
    "leader.name": { get: (s) => s.leader.name, set: (s, v) => {
      s.leader.name = v;
    }, check: (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 30 ? v.trim() : null }
  };
  var EDITABLE_STATE_FIELDS = Object.freeze(Object.keys(FIELDS2));
  function creatorEditState(w, { stateId, changes }) {
    var _a;
    const { civ: civ6 } = w, st2 = civ6.states[stateId];
    if (!st2?.alive) return fail2("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (!changes || typeof changes !== "object" || !Object.keys(changes).length) return fail2("\u5909\u66F4\u304C\u3042\u308A\u307E\u305B\u3093");
    const plan = [];
    for (const [k, raw] of Object.entries(changes)) {
      const f2 = FIELDS2[k];
      if (!f2) return fail2(`\u300C${k}\u300D\u306F\u5275\u9020\u4E3B\u306E\u76F4\u63A5\u7DE8\u96C6\u306E\u5BFE\u8C61\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08\u7DE8\u96C6\u3067\u304D\u308B\u9805\u76EE: ${EDITABLE_STATE_FIELDS.join("\u30FB")}\uFF09`);
      const v = f2.check(raw);
      if (v == null) return fail2(`\u300C${k}\u300D\u306E\u5024\u304C\u4E0D\u6B63\u3067\u3059`);
      plan.push([k, f2, v]);
    }
    const done2 = [];
    for (const [k, f2, v] of plan) {
      const before = f2.get(st2);
      f2.set(st2, v);
      if (k === "leader.name") {
        st2.leader.name = v;
        st2.leader.renamedByCreator = true;
      }
      done2.push({ targetId: stateId, property: k, before, after: v });
    }
    ((_a = civ6.wcde).edits ?? (_a.edits = [])).push(...done2.map((d) => ({ at: civ6.monthIndex, authority: "creator_intervention", ...d })));
    if (civ6.wcde.edits.length > 2e3) civ6.wcde.edits.splice(0, civ6.wcde.edits.length - 2e3);
    w.sim.ctx._byState = null;
    return { ok: true, edited: done2.map((d) => d.property) };
  }
  function creatorRename(w, { kind, id, name }) {
    var _a;
    const { civ: civ6 } = w, table3 = { culture: civ6.cultures, language: civ6.languages, religion: civ6.religions }[kind];
    if (!table3) return fail2("\u5BFE\u8C61\u306F culture / language / religion");
    const e = table3[id];
    if (!e) return fail2("\u305D\u306E\u5B9A\u7FA9\u304C\u3042\u308A\u307E\u305B\u3093");
    const n2 = typeof name === "string" ? name.trim() : "";
    if (!n2 || n2.length > 30) return fail2("\u540D\u524D\u306F 1\u301C30 \u6587\u5B57");
    const before = e.name;
    e.name = n2;
    if (kind === "culture") e.nameFixed = true;
    ((_a = civ6.wcde).edits ?? (_a.edits = [])).push({ at: civ6.monthIndex, authority: "creator_intervention", targetId: id, property: "name", before, after: n2 });
    return { ok: true };
  }

  // js/core/wcde/warlab.js
  var WARLAB_MODEL = "warlab-2";
  var clamp14 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r36 = (x) => Math.round(x * 1e3) / 1e3;
  function warInputs(civ6, st2, role = "attack") {
    const equip = effective(civ6, st2, "equipLevel"), readiness = effective(civ6, st2, "readiness"), fatigue = effective(civ6, st2, "fatigue"), industry = effective(civ6, st2, "industry");
    const sustain = clamp14(st2.treasury / (st2.army * 0.05 + 10) / 24);
    const land = landPower(civ6, st2, null, { defending: role === "defend" }), naval = navalPower(civ6, st2), base = land + 0.35 * naval;
    return { army: st2.army, equip: r36(equip), readiness: r36(readiness), fatigue: r36(fatigue), industry: Math.round(industry), stability: r36(st2.stability), treasury: Math.round(st2.treasury), sustain: r36(sustain), base: Math.round(base), land: Math.round(land), naval: Math.round(naval), navyShare: r36(navyShare(st2)), supply: Math.round(supplyRange(civ6, st2)), power: Math.round(base * (1 - 0.3 * fatigue) * (0.85 + 0.15 * sustain)) };
  }
  var sig = (x) => [x.army, x.equip, x.readiness, x.fatigue, x.industry, x.stability, x.sustain, x.base, x.naval, x.supply].map((v) => Math.round(v * 100) / 100).join(",");
  var logistic = (x) => 1 / (1 + Math.exp(-x));
  function predictWar(civ6, aId, bId, cacheHost = null) {
    const a = civ6.states[aId], b = civ6.states[bId];
    if (!a?.alive || !b?.alive || a.id === b.id) return null;
    const ia = warInputs(civ6, a, "attack"), ib = warInputs(civ6, b, "defend"), key = `${WARLAB_MODEL}|${aId}|${bId}|${sig(ia)}|${sig(ib)}`, cache = cacheHost ? cacheHost._warlab ?? (cacheHost._warlab = /* @__PURE__ */ new Map()) : null;
    const hit = cache?.get(key);
    if (hit) return hit;
    const ratio = (ia.power + 1) / (ib.power + 1), lr = Math.log(ratio);
    const unc = clamp14(0.12 + 0.35 * (1 - (ia.readiness + ib.readiness) / 2) + 0.2 * (1 - (ia.stability + ib.stability) / 2) + 0.1 / (1 + Math.log10(1 + Math.min(ia.industry, ib.industry) / 1e3)), 0.05, 0.9);
    const win = (l) => {
      const raw = logistic(1.6 * l), stale = 0.35 * Math.exp(-(l * l) / 0.5);
      return { a: (1 - stale) * raw, b: (1 - stale) * (1 - raw), s: stale };
    };
    const mid = win(lr), lo = win(lr - unc), hi = win(lr + unc);
    const lossA = clamp14(0.08 + 0.25 / (1 + ratio) + 0.1 * mid.s, 0.02, 0.6), lossB = clamp14(0.08 + 0.25 * ratio / (1 + ratio) + 0.1 * mid.s, 0.02, 0.6);
    const months = Math.round(clamp14(6 + 30 * mid.s + 14 * (1 - Math.abs(mid.a - mid.b)), 4, 72));
    const factors = [["army", "\u5175\u529B"], ["equip", "\u88C5\u5099\u6C34\u6E96"], ["readiness", "\u7DF4\u5EA6\u30FB\u5373\u5FDC"], ["fatigue", "\u75B2\u52B4\u5EA6"], ["sustain", "\u56FD\u5EAB\u306E\u6301\u4E45\u529B"], ["naval", "\u6D77\u8ECD\u529B"], ["supply", "\u88DC\u7D66\u306E\u5C4A\u304F\u7BC4\u56F2\uFF08km\uFF09"], ["power", "\u7DCF\u5408\u6226\u529B"]].map(([k, ja]) => ({ key: k, ja, a: ia[k], b: ib[k] }));
    const out = { model: WARLAB_MODEL, month: civ6.monthIndex, aId, bId, inputs: { a: ia, b: ib }, ratio: r36(ratio), pAWin: r36(mid.a), pBWin: r36(mid.b), pStalemate: r36(mid.s), pAWinRange: [r36(lo.a), r36(hi.a)], lossA: r36(lossA), lossB: r36(lossB), months, uncertainty: r36(unc), factors };
    if (cache) {
      if (cache.size > 4e3) cache.clear();
      cache.set(key, out);
    }
    return out;
  }

  // js/core/wcde/negotiation.js
  var clamp15 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  var r22 = (x) => Math.round(x * 100) / 100;
  var initDiplomacy = () => ({ proposals: [] });
  var ledger2 = (civ6) => {
    var _a;
    return (_a = civ6.wcde).diplomacy ?? (_a.diplomacy = initDiplomacy());
  };
  var proposalsOf = (civ6) => ledger2(civ6).proposals;
  var TREATY_THRESHOLD = { nonaggression: -20, trade: -20, alliance: 10 };
  function treatyFeasible(civ6, from, to, type) {
    const mi = civ6.monthIndex;
    if (!from.alive || !to.alive) return "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044";
    if (atWarWith(civ6, from, to)) return "\u4EA4\u6226\u4E2D\u306E\u76F8\u624B\u3068\u306F\u7D50\u3079\u306A\u3044";
    if (type === "trade") {
      if ((from.blockade ?? 0) > mi || (to.blockade ?? 0) > mi) return "\u5C01\u9396\u4E2D\u306F\u901A\u5546\u5354\u5B9A\u3092\u7D50\u3079\u306A\u3044";
      if ((to.sanctions?.[from.id] ?? 0) > mi || (from.sanctions?.[to.id] ?? 0) > mi) return "\u5236\u88C1\u4E2D\u306F\u901A\u5546\u5354\u5B9A\u3092\u7D50\u3079\u306A\u3044";
      if (!(from.econ && to.econ)) return "\u7D4C\u6E08\u306E\u7B97\u51FA\u304C\u6E08\u3093\u3067\u3044\u306A\u3044";
    }
    if (type === "alliance" && (from.polity === "tribal" || to.polity === "tribal") && !(from.techAdopted?.record_keeping != null || from.techAdopted?.writing != null)) return "\u90E8\u65CF\u306E\u9023\u5408\u306B\u306F\u3001\u7D04\u675F\u3092\u8A18\u3059\u4ED5\u7D44\u307F\uFF08\u8A18\u9332\uFF09\u304C\u8981\u308B";
    return null;
  }
  function evaluateTreaty(civ6, from, to, type) {
    const f2 = [], add = (ja, v) => {
      f2.push({ ja, v: r22(v) });
      return v;
    };
    const T3 = TREATY[type];
    {
      const nf = T3 ? treatyFeasible(civ6, from, to, type) : null;
      if (nf) return { accept: false, score: -9, factors: [{ ja: nf, v: -9 }], hard: true, counter: null };
    }
    if (!T3) return { accept: false, score: -9, factors: [{ ja: "\u305D\u306E\u7A2E\u985E\u306E\u6761\u7D04\u306F\u306A\u3044", v: -9 }], hard: true, counter: null };
    const rel = effective(civ6, to, "relation", from.id);
    let s = add("\u76F8\u624B\u304B\u3089\u898B\u305F\u95A2\u4FC2", (rel - TREATY_THRESHOLD[type]) / 20);
    const gr = grievance(civ6, to, from.id);
    if (gr > 0.5) return { accept: false, score: -9, factors: [{ ja: "\u6B74\u53F2\u7684\u306A\u6068\u307F\u304C\u6DF1\u3044", v: -9 }], hard: true, counter: null };
    if (gr > 0) s += add("\u904E\u53BB\u306E\u6068\u307F", -3 * gr);
    const sf = strength(civ6, from), st2 = strength(civ6, to), rf = (sf + 1) / (st2 + 1);
    if (type === "nonaggression") s += add(rf > 1 ? "\u76F8\u624B\u304C\u5F37\u3044\u306E\u3067\u4E0D\u53EF\u4FB5\u3092\u53D7\u3051\u5165\u308C\u305F\u3044" : "\u3053\u3061\u3089\u304C\u5F37\u3044\u306E\u3067\u4E0D\u53EF\u4FB5\u3092\u53D7\u3051\u5165\u308C\u306B\u304F\u3044", clamp15(Math.log(rf), -1, 1) * 0.5);
    if (type === "alliance") {
      const hot2 = to.warIds.length > 0 ? 0.6 : 0;
      if (hot2) s += add("\u4EA4\u6226\u4E2D\u3067\u5473\u65B9\u304C\u307B\u3057\u3044", hot2);
      s += add("\u6226\u529B\u306E\u91E3\u308A\u5408\u3044", clamp15(Math.log(rf), -1, 1) * 0.3);
    }
    if (type === "trade") {
      const ratio = (from.econ?.industry ?? 1) / ((to.econ?.industry ?? 1) + 1);
      s += add("\u4EA4\u6613\u306E\u898B\u8FBC\u307F", clamp15(Math.log1p(Math.min(ratio, 1 / Math.max(ratio, 0.01))), 0, 1) * 0.5);
    }
    if (to.stability < 0.3) s += add("\u56FD\u5185\u304C\u4E0D\u5B89\u5B9A", -0.5);
    for (const t of civ6.activeTreatyIds.map((i) => civ6.treaties[i])) if (t.active && t.type === "alliance") {
      const ally = t.a === to.id ? t.b : t.b === to.id ? t.a : null;
      if (ally && civ6.states[ally]?.alive && atWarWith(civ6, from, civ6.states[ally])) return { accept: false, score: -9, factors: [{ ja: "\u76F8\u624B\u306E\u540C\u76DF\u56FD\u3068\u4EA4\u6226\u4E2D", v: -9 }], hard: true, counter: null };
    }
    const accept = s >= 0;
    let counter = null;
    if (!accept && type === "alliance" && s > -1) {
      const alt = evaluateTreaty(civ6, from, to, "nonaggression");
      if (alt.accept) counter = { type: "nonaggression", note: "\u540C\u76DF\u306F\u96E3\u3057\u3044\u304C\u3001\u4E0D\u53EF\u4FB5\u306A\u3089\u3070\u53D7\u3051\u5165\u308C\u308B" };
    }
    return { accept, score: r22(s), factors: f2, counter, hard: false };
  }
  function occupationShares(civ6, war, side) {
    const ops = war.ops;
    if (!ops || ops.ended) return { lost: 0, held: 0, capitalLost: false };
    const mine = new Set(war.sides[side]), foeIds = new Set(war.sides[side === "a" ? "d" : "a"]);
    let lost = 0, held = 0, tot = 0, totFoe = 0, capLost = false;
    for (const g of Object.values(civ6.groups)) {
      if (!g.stateId) continue;
      if (mine.has(g.stateId)) tot++;
      else if (foeIds.has(g.stateId)) totFoe++;
    }
    for (const gid of war.occupied) {
      const g = civ6.groups[gid];
      if (!g?.stateId) continue;
      const s = ops.occ[gid];
      if (mine.has(g.stateId) && s !== side) {
        lost++;
        if (civ6.states[g.stateId]?.capitalGroupId === gid) capLost = true;
      } else if (foeIds.has(g.stateId) && s === side) held++;
    }
    return { lost: lost / (tot + 1), held: held / (totFoe + 1), capitalLost: capLost, lostN: lost, heldN: held };
  }
  function evaluatePeace(civ6, war, proposer, other2, terms = { kind: "white" }) {
    const f2 = [], add = (ja, v) => {
      f2.push({ ja, v: r22(v) });
      return v;
    }, side = warSide(war, other2.id) ?? (war.aggressor === other2.id ? "a" : "d"), foe = side === "a" ? "d" : "a";
    const power = (ids) => ids.map((i) => civ6.states[i]).filter((s2) => s2?.alive).reduce((a, s2) => a + totalPower(civ6, s2), 0), adv = clamp15(Math.log((power(war.sides[side]) + 1) / (power(war.sides[foe]) + 1)), -2, 2);
    const lead = side === "a" ? war.score : -war.score, occ = occupationShares(civ6, war, side);
    let s = add("\u6226\u529B\u306E\u5DEE\uFF08\u52A3\u52E2\u306A\u3089\u8B1B\u548C\u3057\u305F\u3044\uFF09", -0.6 * adv);
    s += add("\u6226\u6CC1\uFF08\u52A3\u52E2\u306A\u3089\u8B1B\u548C\u3057\u305F\u3044\uFF09", -lead / 40);
    s += add("\u5360\u9818\u3055\u308C\u305F\u571F\u5730", 3 * occ.lost);
    if (occ.capitalLost) s += add("\u9996\u90FD\u306E\u9665\u843D", 1.2);
    s += add("\u5360\u9818\u3057\u3066\u3044\u308B\u571F\u5730\uFF08\u6709\u5229\u306A\u3046\u3061\u306F\u7D9A\u3051\u305F\u3044\uFF09", -2 * occ.held);
    if ((other2.blockade ?? 0) > civ6.monthIndex) s += add("\u6D77\u4E0A\u5C01\u9396", 0.4);
    s += add("\u75B2\u52B4", effective(civ6, other2, "fatigue") * 1);
    s += add("\u56FD\u5185\u306E\u4E0D\u5B89\u5B9A", (1 - effective(civ6, other2, "stability")) * 0.8);
    if (other2.treasury < 0) s += add("\u56FD\u5EAB\u306E\u67AF\u6E07", 0.5);
    s += add("\u6226\u4E89\u306E\u640D\u8017", (other2.warLoss ?? 0) * 1.5);
    s += add("\u6226\u4E89\u306E\u9577\u671F\u5316", clamp15(Math.max(0, civ6.monthIndex - war.startedAt) / 60, 0, 1.5));
    let need = 0.2;
    const otherPays = lead < 0 || lead === 0 && other2.treasury < proposer.treasury;
    if (terms.kind === "reparations") {
      const pay = clamp15((terms.amount ?? 0) / (Math.max(0, otherPays ? other2.treasury : proposer.treasury) + 1), 0, 2);
      need += otherPays ? add("\u8CE0\u511F\u306E\u91CD\u3055", 1.5 * pay) : -add("\u8CE0\u511F\u3092\u53D7\u3051\u53D6\u308C\u308B", 0.5 * pay);
    } else if (terms.kind === "cession") {
      need += add("\u571F\u5730\u3092\u5931\u3046\uFF08\u5272\u8B72\uFF09", 2.5 * occ.lost) - add("\u5360\u9818\u5730\u3092\u4FDD\u6301\u3067\u304D\u308B", 1.2 * occ.held);
    } else if (occ.held > 0) need += add("\u5360\u9818\u5730\u3092\u8FD4\u3059\uFF08\u767D\u7D19\u8B1B\u548C\uFF09", 1.5 * occ.held);
    s -= need;
    return { accept: s >= 0, score: r22(s), factors: f2 };
  }
  var record2 = (ctx, rec) => {
    const id = ctx.ids.next("proposal"), { factors, score, ...rest } = rec;
    ledger2(ctx.civ).proposals.push({ id, at: ctx.civ.monthIndex, ...rest });
    return id;
  };
  var failure = (error, extra = {}) => ({ ok: false, error, diplomacyFailure: true, ...extra });
  function negotiateTreaty(ctx, from, to, type, c = {}) {
    const civ6 = ctx.civ, ev = evaluateTreaty(civ6, from, to, type), base = { kind: "treaty", type, from: from.id, to: to.id, counter: ev.counter ? { type: ev.counter.type } : null };
    if (!ev.accept) {
      record2(ctx, { ...base, status: ev.counter ? "countered" : "rejected" });
      return failure(ev.counter ? `\u5225\u306E\u6761\u4EF6\u306A\u3089\u3070\u53D7\u3051\u5165\u308C\u308B\uFF08${TREATY[ev.counter.type].ja}\uFF09` : "\u76F8\u624B\u306B\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", { targetId: to.id, counter: ev.counter });
    }
    if (treatyFeasible(civ6, from, to, type) || treatyBetween(civ6, from, to, type)) {
      record2(ctx, { ...base, status: "failed_recheck" });
      return failure("\u6761\u4EF6\u304C\u5909\u308F\u308A\u3001\u7DE0\u7D50\u3067\u304D\u306A\u304B\u3063\u305F", { targetId: to.id });
    }
    signTreaty(ctx, type, from, to, { decisionId: c.decisionId, provenance: c.provenance });
    record2(ctx, { ...base, status: "accepted" });
    return { ok: true, effects: [], silent: true, targetId: to.id };
  }
  function defaultTerms(civ6, war, proposer) {
    const side = warSide(war, proposer.id) ?? "a", o = occupationShares(civ6, war, side);
    if (o.heldN > o.lostN) return { kind: "cession" };
    return { kind: "white" };
  }
  function negotiatePeace(ctx, proposer, war, c = {}) {
    const civ6 = ctx.civ;
    if (!war || war.status !== "active" || !proposer.warIds.includes(war.id)) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u9032\u884C\u4E2D\u3067\u306F\u306A\u3044" };
    const mySide = warSide(war, proposer.id);
    if (!mySide) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306E\u53C2\u6226\u56FD\u3067\u306F\u306A\u3044" };
    const foe = mySide === "a" ? "d" : "a", foePrincipal = foe === "a" ? war.aggressor : war.defender, principal = proposer.id === war.aggressor || proposer.id === war.defender;
    const otherId = c.withId && war.sides[foe].includes(c.withId) ? c.withId : foePrincipal, other2 = civ6.states[otherId];
    if (!other2?.alive) return { ok: false, error: "\u76F8\u624B\u304C\u5B58\u5728\u3057\u306A\u3044" };
    const k = c.terms?.kind, terms = k === "reparations" ? { kind: "reparations", amount: Math.max(0, Number(c.terms.amount) || 0) } : k === "cession" ? { kind: "cession" } : k === "white" ? { kind: "white" } : defaultTerms(civ6, war, proposer);
    if (!principal && terms.kind === "cession") terms.kind = "white";
    const ev = evaluatePeace(civ6, war, proposer, other2, terms), base = { kind: "peace", warId: war.id, from: proposer.id, to: otherId, terms, separate: !principal };
    if (!ev.accept) {
      record2(ctx, { ...base, status: "rejected" });
      return failure("\u8B1B\u548C\u306F\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F", { targetId: war.id });
    }
    if (war.status !== "active") {
      record2(ctx, { ...base, status: "failed_recheck" });
      return failure("\u6761\u4EF6\u304C\u5909\u308F\u308A\u3001\u8B1B\u548C\u3067\u304D\u306A\u304B\u3063\u305F", { targetId: war.id });
    }
    if (terms.kind === "reparations") {
      const ahead = war.score >= 0 ? "a" : "d", payerSide = ahead === "a" ? "d" : "a", payer = civ6.states[payerSide === mySide ? proposer.id : otherId], getter = civ6.states[payer.id === proposer.id ? otherId : proposer.id];
      const amt = Math.min(terms.amount, Math.max(0, payer.treasury));
      payer.treasury -= amt;
      getter.treasury += amt;
      base.terms = { ...terms, paid: Math.round(amt) };
    }
    {
      const loser = civ6.states[war.score >= 0 ? war.defender : war.aggressor], cap = civ6.groups[loser?.capitalGroupId] ?? civ6.groups[proposer.capitalGroupId];
      base.name = `${cap ? placeName(ctx, cap) : "\u540D\u3082\u306A\u304D\u5730"}${principal ? "\u6761\u7D04" : "\u5358\u72EC\u8B1B\u548C\u6761\u7D04"}`;
    }
    if (!principal) {
      leaveWar(ctx, war, proposer);
      proposer.lastWarEnd = civ6.monthIndex;
      record2(ctx, { ...base, status: "accepted" });
      return { ok: true, effects: [], silent: true, targetId: war.id, separate: true };
    }
    endWar(ctx, war, "negotiated", terms);
    record2(ctx, { ...base, status: "accepted" });
    return { ok: true, effects: [], silent: true, targetId: war.id };
  }

  // js/core/wcde/domains/index.js
  function wcdeExtension(ticker, ctx) {
    registerWcdeActions();
    ctx.nameGen = nameGen;
    ctx.nameLangOf = nameLangOf;
    ctx.warForecast = (a, b) => ctx.civ.options.wcde ? predictWar(ctx.civ, a.id, b.id, ctx) : null;
    ctx.negotiate = { treaty: (c, a, b, t, x) => c.civ.options.wcde ? negotiateTreaty(c, a, b, t, x) : null, peace: (c, a, w, x) => c.civ.options.wcde ? negotiatePeace(c, a, w, x) : null };
    ctx.warOps = ctx.civ.options.wcde ? { init: initWar, step: stepWar, finalize, monthly, canReach, seaTargets, settle } : null;
    ctx.taxFactor = (st2) => ctx.civ.options.wcde ? effective(ctx.civ, st2, "taxRevenue") : 1;
    if (ctx.civ.options.wcde) {
      const sm0 = ctx.stateMult;
      ctx.stateMult = (g) => {
        const st2 = g.stateId ? ctx.civ.states[g.stateId] : null;
        return (sm0 ? sm0(g) : 1) * (st2 && ctx.civ.wcde?.adjust?.[st2.id]?.popCapacity ? effective(ctx.civ, st2, "popCapacity") : 1);
      };
    }
    ctx.ecoMult = (g) => ctx.civ.options.wcde ? ecoMult(ctx.world, ctx.civ, g) : 1;
    ticker.register("ecosystem", stepEcosystem, "stepEcosystem", { every: 12, offset: 5 });
    ticker.register("interventions", stepInterventions, "stepInterventions");
    ticker.register("culture", stepLanguage, "stepLanguage");
    ticker.register("culture", stepReligion, "stepReligion");
    ticker.register("economy", stepEconomy, "stepEconomy", { every: 3 });
    ticker.register("politics", stepPolitics, "stepPolitics", { every: 3 });
    ticker.register("military", stepMilitary, "stepMilitary", { every: 3 });
    ticker.register("people", stepPeople, "stepPeople");
    ticker.register("people", stepCities, "stepCities");
    ticker.register("integrity", (c) => syncControl(c.civ), "syncControl");
    ticker.register("integrity", (c) => {
      const errs = [...checkWcdeIntegrity(c.world, c.civ), ...c.civ.monthIndex % 120 === 0 ? checkEco(c.world, c.civ) : []];
      if (errs.length) throw new Error("WCDE \u6574\u5408\u6027\u9055\u53CD: " + errs.slice(0, 3).join(" / "));
    }, "checkWcdeIntegrity");
  }

  // js/core/wcde/contract.js
  var AUTHORITY = Object.freeze({ PLAYER: "player_order", CREATOR: "creator_intervention", AI: "ai_action", SIM: "simulation_transition", ADMIN: "administrative" });
  var A = AUTHORITY;
  var SNAP_KEYS = ["techOverrides", "states", "groups", "settlements", "figures", "houses", "cultures", "languages", "religions", "treaties", "wars", "activeWarIds", "activeTreatyIds", "proposals", "persons", "orgs", "seq", "wcde", "options", "player", "techWorld", "species", "speciesDefs", "monthIndex", "date", "adoptCache"];
  var LOG_MAX = 500;
  var ID_MAX = 2e3;
  function createWcde(world, civ6) {
    const w = { world, civ: civ6, viewPast: null, sim: null };
    w.rebuild = () => {
      w.sim = createCivSim(world, civ6, { extensions: [wcdeExtension] });
      return w.sim;
    };
    w.rebuild();
    return w;
  }
  var COMMANDS = {};
  var COMMAND_DOMAIN = { founding: "states", control: "states", time: "clock", clock: "clock", news: "integrity", view: "integrity", state: "states", uprising: "states", diplomacy: "war_diplomacy", war: "war_diplomacy", creator: "interventions", calendar: "clock", tech: "tech" };
  var domainOfCommand = (type) => COMMAND_DOMAIN[String(type).split(".")[0]] ?? null;
  function defineCommand(type, spec) {
    COMMANDS[type] = { mutates: true, phases: ["running"], control: false, checkpoint: true, domain: domainOfCommand(type), ...spec, type };
  }
  var clonePart = (civ6) => {
    const o = {};
    for (const k of SNAP_KEYS) if (k in civ6) o[k] = structuredClone(civ6[k]);
    return o;
  };
  function checkpoint(civ6) {
    return { part: clonePart(civ6), ev: civ6.events.length };
  }
  function rollback(w, cp) {
    const { civ: civ6 } = w;
    for (const k of SNAP_KEYS) {
      if (!(k in cp.part)) {
        delete civ6[k];
        continue;
      }
      const src = structuredClone(cp.part[k]), cur = civ6[k];
      if (Array.isArray(cur) && Array.isArray(src)) {
        cur.length = 0;
        cur.push(...src);
      } else if (cur && src && typeof cur === "object" && typeof src === "object" && !Array.isArray(cur)) {
        for (const x of Object.keys(cur)) delete cur[x];
        Object.assign(cur, src);
      } else civ6[k] = src;
    }
    civ6.events.length = cp.ev;
    w.rebuild();
  }
  var APPEND_ONLY = ["events", "works"];
  var checkpointFull = (civ6) => {
    const part = {}, lens = {}, order = Object.keys(civ6);
    for (const k of order) if (APPEND_ONLY.includes(k) && Array.isArray(civ6[k])) lens[k] = civ6[k].length;
    else part[k] = structuredClone(civ6[k]);
    return { order, part, lens };
  };
  function restoreInto(w, snap) {
    const { civ: civ6 } = w, keep = {};
    for (const k of Object.keys(snap.lens)) {
      civ6[k].length = snap.lens[k];
      keep[k] = civ6[k];
    }
    for (const k of Object.keys(civ6)) delete civ6[k];
    for (const k of snap.order) civ6[k] = k in keep ? keep[k] : structuredClone(snap.part[k]);
    w.rebuild();
  }
  function log(civ6, entry) {
    var _a;
    const L = (_a = civ6.wcde).log ?? (_a.log = []);
    L.push(entry);
    if (L.length > LOG_MAX) L.splice(0, L.length - LOG_MAX);
  }
  function dispatch(w, cmd) {
    const { civ: civ6 } = w, W2 = civ6.wcde, spec = COMMANDS[cmd?.type];
    const fail6 = (error, code = "rejected") => {
      log(civ6, { at: civ6.monthIndex, type: cmd?.type, authority: cmd?.authority, ok: false, error, code });
      return { ok: false, error, code };
    };
    if (!spec) return fail6(`\u672A\u77E5\u306E\u547D\u4EE4: ${cmd?.type}`, "unknown");
    if (!Object.values(AUTHORITY).includes(cmd.authority)) return fail6(`\u672A\u77E5\u306E\u6A29\u9650: ${cmd.authority}`, "authority");
    if (!spec.authorities.includes(cmd.authority)) return fail6(`\u3053\u306E\u547D\u4EE4\u306F ${cmd.authority} \u3067\u306F\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\uFF08\u8A31\u53EF: ${spec.authorities.join("\u30FB")}\uFF09`, "authority");
    if (cmd.commandId != null && W2.cmdIds.includes(cmd.commandId)) return { ok: true, duplicate: true };
    if (spec.mutates && w.viewPast != null) return fail6("\u904E\u53BB\u306E\u95B2\u89A7\u4E2D\u306F\u3001\u4E16\u754C\u3092\u5909\u3048\u308B\u547D\u4EE4\u3092\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\uFF08\u73FE\u5728\u3078\u623B\u3057\u3066\u304F\u3060\u3055\u3044\uFF09", "past_view");
    if (!spec.phases.includes(W2.phase)) return fail6(`\u3053\u306E\u547D\u4EE4\u306F\u6BB5\u968E\u300C${spec.phases.join("\u30FB")}\u300D\u3067\u306E\u307F\u5B9F\u884C\u3067\u304D\u307E\u3059\uFF08\u73FE\u5728: ${W2.phase}\uFF09`, "phase");
    if (spec.control && cmd.authority === A.PLAYER) {
      const cs = W2.control.stateId;
      if (!cs) return fail6("\u62C5\u5F53\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u56FD\u5BB6\u3092\u62C5\u5F53\u3057\u3066\u304B\u3089\u547D\u4EE4\u3057\u3066\u304F\u3060\u3055\u3044\uFF09", "no_control");
      if (cmd.stateId == null) cmd = { ...cmd, stateId: cs };
      if (cmd.stateId !== cs) return fail6("\u62C5\u5F53\u56FD\u5BB6\u4EE5\u5916\u306B\u306F\u547D\u4EE4\u3067\u304D\u307E\u305B\u3093", "not_controlled");
    }
    const v = spec.validate?.(w, cmd);
    if (v && v.ok === false) return fail6(v.error);
    const cp = spec.mutates && spec.checkpoint !== false ? checkpoint(civ6) : null;
    let r;
    try {
      r = spec.apply(w, cmd);
    } catch (err) {
      if (cp) rollback(w, cp);
      log(civ6, { at: civ6.monthIndex, type: cmd.type, authority: cmd.authority, ok: false, error: String(err?.message ?? err), code: "exception" });
      return { ok: false, error: `\u547D\u4EE4\u306E\u9014\u4E2D\u3067\u5931\u6557\u3057\u305F\u305F\u3081\u3001\u3059\u3079\u3066\u53D6\u308A\u6D88\u3057\u307E\u3057\u305F: ${err?.message ?? err}`, code: "rolled_back" };
    }
    if (!r || r.ok === false) return fail6(r?.error ?? "\u5931\u6557", "rejected");
    if (cmd.commandId != null) {
      W2.cmdIds.push(cmd.commandId);
      if (W2.cmdIds.length > ID_MAX) W2.cmdIds.splice(0, W2.cmdIds.length - ID_MAX);
    }
    log(civ6, { at: civ6.monthIndex, type: cmd.type, authority: cmd.authority, ok: true, commandId: cmd.commandId ?? null });
    return { ok: true, result: r.result ?? r };
  }
  function safeAdvance(w, months, { chunk: chunk2 = 120, onProgress = null } = {}) {
    const { civ: civ6 } = w;
    let done2 = 0;
    while (done2 < months) {
      const n2 = Math.min(chunk2, months - done2), snap = checkpointFull(civ6);
      try {
        w.sim.advanceMonths(n2);
        done2 += n2;
        if (onProgress) onProgress(done2, months);
        continue;
      } catch (err) {
        restoreInto(w, snap);
        let ok2 = 0, msg = String(err?.message ?? err);
        try {
          for (; ok2 < n2; ok2++) w.sim.advanceMonth();
        } catch (e2) {
          msg = String(e2?.message ?? e2);
        }
        restoreInto(w, snap);
        if (ok2 > 0) w.sim.advanceMonths(ok2);
        civ6.wcde.diagnostics.push({ at: civ6.monthIndex, failedMonth: civ6.monthIndex + 1, message: msg });
        if (civ6.wcde.diagnostics.length > 50) civ6.wcde.diagnostics.shift();
        return { ok: false, advanced: done2 + ok2, error: msg, haltedAt: { ...civ6.date } };
      }
    }
    return { ok: true, advanced: done2, date: { ...civ6.date } };
  }

  // js/core/wcde/founding.js
  var POLITY_CHOICES = { city_state: ["chiefdom", "tribal"], religious_polity: ["theocracy", "tribal"], agri_union: ["tribal", "chiefdom"], nomad_confederation: ["tribal", "chiefdom"] };
  var dominant2 = (g) => g.cohorts.reduce((b, c) => c.share > b.share ? c : b);
  var MAX_SEEDS = 600;
  var REALM_REACH = 8;
  var REALM_MAX_GROUPS = 16;
  var LOOKS = 12;
  var NEW_CITY_REACH = 4;
  var fail3 = (error) => ({ ok: false, error });
  var isSea = (w, c) => w.cell.landWater[c] === 0 || w.cell.elevation[c] <= 0;
  var isLake = (w, c) => w.cell.landWater[c] === 2;
  function listCandidates(w) {
    const { civ: civ6, sim } = w, ctx = sim.ctx;
    ctx._spatial = null;
    spatialOf(ctx);
    const seeds = Object.values(civ6.groups).filter((g) => g.settlementId && !g.stateId).sort((a, b) => b.pop - a.pop || (a.id < b.id ? -1 : 1)).slice(0, MAX_SEEDS), used = /* @__PURE__ */ new Set(), out = [];
    for (const g of seeds) {
      if (used.has(g.id)) continue;
      const f2 = evaluateFormation(ctx, g);
      if (!f2 || f2.groupIds.some((i) => used.has(i))) continue;
      for (const i of f2.groupIds) used.add(i);
      const gs = f2.groupIds.map((i) => civ6.groups[i]), cap = gs.reduce((a, b) => b.pop > a.pop ? b : a), d = dominant2(cap);
      out.push({ via: f2.via, viaJa: VIA[f2.via].ja, groupIds: f2.groupIds, seedGroupId: g.id, capitalGroupId: cap.id, cell: cap.cell, pop: Math.round(gs.reduce((s, x) => s + x.pop, 0)), cultureId: d.cultureId, languageId: languageOfGroup(cap), religionId: d.religionId, speciesId: cap.speciesId, polityOptions: (() => {
        const caps = groupCaps(civ6, cap), o = (POLITY_CHOICES[f2.via] ?? ["tribal"]).filter((p) => p === "tribal" || caps.has("polity:chiefdom"));
        return o.length ? o : ["tribal"];
      })() });
    }
    return out;
  }
  function refreshCandidates(w) {
    const { civ: civ6, sim } = w, prev = new Map((civ6.wcde.candidates ?? []).map((c) => [c.seedGroupId + "|" + c.via, c.id])), list = listCandidates(w);
    civ6.wcde.candidates = list.map((c) => ({ id: prev.get(c.seedGroupId + "|" + c.via) ?? sim.ctx.ids.next("candidate"), ...c }));
    return civ6.wcde.candidates;
  }
  function capitalSites(w, regime = null, limit = 400) {
    const { civ: civ6 } = w;
    const out = [];
    for (const g of Object.values(civ6.groups)) {
      if (!g.settlementId || g.stateId || g.pop < 150) continue;
      const s = civ6.settlements[g.settlementId];
      if (!s) continue;
      const reason = regime ? regimeGate(civ6, g, regime) : null;
      out.push({ groupId: g.id, cell: s.cell ?? g.cell, pop: Math.round(g.pop), stage: s.stage ?? "village", name: s.name ?? null, ok: !reason, reason });
    }
    return out.sort((a, b) => b.pop - a.pop || (a.groupId < b.groupId ? -1 : 1)).slice(0, limit);
  }
  function planCapital(w, { groupId = null, cell = null }) {
    const { civ: civ6, sim } = w, ctx = sim.ctx, world = w.world;
    ctx._spatial = null;
    const { home } = spatialOf(ctx);
    let g = groupId ? civ6.groups[groupId] : null;
    if (!g && cell != null) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= world.cell.landWater.length) return fail3("\u305D\u306E\u5834\u6240\u306F\u5730\u56F3\u306B\u3042\u308A\u307E\u305B\u3093");
      if (isSea(world, cell) || isLake(world, cell)) return fail3("\u6D77\u3084\u6E56\u306B\u306F\u90FD\u5E02\u3092\u7BC9\u3051\u307E\u305B\u3093");
      const gid = home.get(cell) ?? Object.values(civ6.groups).find((x) => (x.cells ?? [x.cell]).includes(cell))?.id;
      g = gid ? civ6.groups[gid] : null;
      if (!g) {
        const near = reachable(world, cell, NEW_CITY_REACH, 0);
        let best = null, bd = 1e9;
        for (const [c, d] of near) {
          const gid2 = home.get(c);
          const o = gid2 && civ6.groups[gid2];
          if (!o || o.stateId || o.pop < 800) continue;
          if (d < bd || d === bd && o.pop > best.pop) {
            bd = d;
            best = o;
          }
        }
        if (!best) return fail3("\u305D\u306E\u5834\u6240\u306E\u8FD1\u304F\u306B\u306F\u3001\u90FD\u5E02\u3092\u7BC9\u3051\u308B\u3060\u3051\u306E\u4EBA\u304C\u3044\u307E\u305B\u3093\uFF08\u56FD\u5BB6\u306E\u306A\u3044\u96C6\u56E3\u304C\u5FC5\u8981\u3067\u3059\uFF09");
        return { ok: true, kind: "new", parentId: best.id, cell, pop: Math.round(Math.min(2e3, Math.max(300, best.pop * 0.25))), group: null };
      }
    }
    if (!g) return fail3("\u305D\u306E\u5834\u6240\u306E\u96C6\u56E3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
    if (g.stateId) return fail3("\u3059\u3067\u306B\u56FD\u5BB6\u306E\u9818\u571F\u3067\u3059\uFF08\u65E2\u5B58\u306E\u56FD\u5BB6\u306E\u90FD\u5E02\u306F\u9078\u3079\u307E\u305B\u3093\uFF09");
    if (g.pop < 150) return fail3("\u4EBA\u304C\u5C11\u306A\u3059\u304E\u307E\u3059");
    if (groupId == null && cell != null && g.pop >= 800) {
      const sCell = g.settlementId ? civ6.settlements[g.settlementId]?.cell ?? g.cell : g.cell;
      if (cell !== sCell) return { ok: true, kind: "new", parentId: g.id, cell, pop: Math.round(Math.min(2e3, Math.max(300, g.pop * 0.25))), group: null };
    }
    if (g.settlementId) return { ok: true, kind: "existing", groupId: g.id, cell: civ6.settlements[g.settlementId]?.cell ?? g.cell, pop: Math.round(g.pop), group: g };
    return { ok: true, kind: "settle", groupId: g.id, cell: g.cell, pop: Math.round(g.pop), group: g };
  }
  function commitCapital(ctx, plan) {
    const { world, civ: civ6, ids } = ctx;
    if (plan.kind === "existing") return plan.group;
    if (plan.kind === "settle") {
      foundSettlement(world, civ6, ids, plan.group);
      return plan.group;
    }
    const parent = civ6.groups[plan.parentId];
    parent.pop = Math.max(1, parent.pop - plan.pop);
    const g = spawnGroup(civ6, ids, parent, plan.cell, plan.pop);
    g.stateId = null;
    foundSettlement(world, civ6, ids, g);
    return g;
  }
  function planRealm(w, capGroupId) {
    const { civ: civ6, sim } = w, ctx = sim.ctx, world = w.world, cap = civ6.groups[capGroupId];
    if (!cap) return { groupIds: [], pop: 0, cells: 0 };
    ctx._spatial = null;
    const { home } = spatialOf(ctx), dist = reachable(world, cap.cell, REALM_REACH, 0), cand3 = [];
    for (const [c, d] of dist) {
      const gid = home.get(c);
      if (!gid || gid === cap.id) continue;
      const o = civ6.groups[gid];
      if (!o || o.stateId || o.player || o.pop < 30) continue;
      cand3.push([d, o]);
    }
    cand3.sort((a, b) => a[0] - b[0] || b[1].pop - a[1].pop || (a[1].id < b[1].id ? -1 : 1));
    const groups = [cap, ...cand3.slice(0, REALM_MAX_GROUPS - 1).map((x) => x[1])];
    return { groupIds: groups.map((g) => g.id), pop: Math.round(groups.reduce((s, g) => s + g.pop, 0)), cells: groups.reduce((s, g) => s + (g.cells?.length || 1), 0) };
  }
  var viaFallback = (civ6, cap) => {
    const s = cap.settlementId ? civ6.settlements[cap.settlementId] : null;
    if (s && (s.stage === "town" || s.stage === "city")) return "city_state";
    if (cap.subsistence === "pastoral") return "nomad_confederation";
    if (cap.subsistence === "agriculture") return "agri_union";
    return "city_state";
  };
  var MAX_START_TECH = 3;
  var TECH_TIER_MAX = 3;
  function techChoices(w, groupIds) {
    const { civ: civ6, sim } = w, gs = groupIds.map((i) => civ6.groups[i]).filter(Boolean);
    return adoptable(sim.ctx, { techAdopted: {} }, gs).filter((t) => t.tier <= TECH_TIER_MAX).slice(0, 60).map((t) => ({ key: t.key, name: t.name, field: t.field, tier: t.tier }));
  }
  function doctrineChoices(w, techKeys = []) {
    const stub = { id: "stub", techAdopted: Object.fromEntries(techKeys.map((k) => [k, 0])), military: initMilitary(), treasury: 1e9 };
    return nodesOf(stub).filter((d) => !d.special && canAdopt(stub, d.id).ok && !d.prereq?.length).map((d) => ({ id: d.id, ja: d.ja, branch: d.branch ?? null, cost: d.cost }));
  }
  var personName = (ctx, civ6, cap, rng) => ctx.nameGen?.person?.(civ6, cap, rng) ?? "\u540D\u3082\u306A\u304D\u4EBA";
  function assignOffices(ctx, st2, ids, { keep = null } = {}) {
    const { civ: civ6 } = ctx, cap = civ6.groups[st2.capitalGroupId] ?? Object.values(civ6.groups).find((g) => g.stateId === st2.id), r = REGIMES[regimeOf(st2)], old = new Map((keep ?? st2.offices ?? []).map((o) => [o.id, o]));
    st2.offices = ids.map((id) => {
      if (id === r.ruler) return { id, holder: { name: st2.leader.name, look: st2.leader.look ?? 0 }, since: old.get(id)?.since ?? civ6.monthIndex };
      const o = old.get(id);
      if (o) return o;
      const rng = leaderRng(civ6, st2, "office", id);
      return { id, holder: { name: personName(ctx, civ6, cap, rng), look: Math.floor(rng() * LOOKS) }, since: civ6.monthIndex };
    });
    st2.interpDirty = true;
    return st2.offices;
  }
  function checkSpec(w, s) {
    const { civ: civ6 } = w;
    const auto = !!s.auto, nm = String(s.name ?? "").trim();
    if (!nm && !auto || nm.length > 30) return fail3("\u56FD\u540D\u306F 1\u301C30 \u6587\u5B57\u3067\u6C7A\u3081\u3066\u304F\u3060\u3055\u3044");
    if (nm && Object.values(civ6.states).some((x) => x.alive && x.name === nm)) return fail3("\u540C\u3058\u540D\u524D\u306E\u56FD\u304C\u3059\u3067\u306B\u3042\u308A\u307E\u3059");
    if (!REGIMES[s.regime]) return fail3("\u653F\u4F53\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    const oe = checkOffices(s.regime, s.offices);
    if (oe) return fail3(oe);
    const ln = String(s.leader?.name ?? "").trim();
    if (!ln && !auto || ln.length > 30) return fail3("\u70BA\u653F\u8005\u306E\u540D\u524D\u306F 1\u301C30 \u6587\u5B57\u3067\u6C7A\u3081\u3066\u304F\u3060\u3055\u3044");
    if (s.leader?.look != null && !(Number.isInteger(s.leader.look) && s.leader.look >= 0 && s.leader.look < 1e3)) return fail3("\u9854\u306E\u6307\u5B9A\u304C\u4E0D\u6B63\u3067\u3059");
    return { ok: true, name: nm, leaderName: ln };
  }
  function foundNation(w, spec, { mode = "player", predecessor = null, cause = null, via: viaIn = null } = {}) {
    const { civ: civ6, sim } = w, ctx = sim.ctx, c = checkSpec(w, spec);
    if (!c.ok) return c;
    const plan = planCapital(w, spec.capital ?? {});
    if (!plan.ok) return plan;
    const capG = plan.group ?? civ6.groups[plan.parentId];
    const gate = regimeGate(civ6, capG, spec.regime);
    if (gate) return fail3(`\u3053\u306E\u9996\u90FD\u3067\u306F\u300C${REGIMES[spec.regime].ja}\u300D\u3092\u9078\u3079\u307E\u305B\u3093\uFF08${gate}\uFF09`);
    const techs = [...new Set(spec.techs ?? [])];
    if (techs.length > MAX_START_TECH) return fail3(`\u6700\u521D\u306B\u53D6\u308C\u308B\u6280\u8853\u306F ${MAX_START_TECH} \u3064\u307E\u3067`);
    const realm0 = spec.groupIds ?? planRealm(w, plan.groupId ?? plan.parentId).groupIds, allowed = new Set(techChoices(w, realm0).map((t) => t.key));
    for (const k of techs) if (!allowed.has(k)) return fail3(`\u6280\u8853\u300C${TECH[k]?.name ?? k}\u300D\u306F\u3001\u3053\u306E\u9818\u57DF\u3067\u306F\u307E\u3060\u9078\u3079\u307E\u305B\u3093`);
    if (spec.doctrine != null && !doctrineChoices(w, techs).some((d) => d.id === spec.doctrine)) return fail3("\u305D\u306E\u30C9\u30AF\u30C8\u30EA\u30F3\u306F\u3001\u9078\u3093\u3060\u6280\u8853\u3067\u306F\u53D6\u308C\u307E\u305B\u3093");
    const cap = commitCapital(ctx, plan);
    const realm = (spec.groupIds ?? planRealm(w, cap.id).groupIds).slice();
    if (!realm.includes(cap.id)) realm.unshift(cap.id);
    ctx._spatial = null;
    const f2 = evaluateFormation(ctx, cap), via = viaIn ?? (f2?.via ?? viaFallback(civ6, cap));
    const st2 = formState(ctx, { via, groupIds: realm, player: mode === "player", name: c.name || null, polity: REGIMES[spec.regime].core, predecessor, cause, capitalGroupId: cap.id });
    if (!st2) return fail3("\u56FD\u5BB6\u306E\u5F62\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
    st2.regime = spec.regime;
    if (c.leaderName) st2.leader.name = c.leaderName;
    st2.leader.look = spec.leader?.look ?? Math.floor(leaderRng(civ6, st2, "look")() * LOOKS);
    st2.leader.title = officeJa(REGIMES[spec.regime].ruler);
    assignOffices(ctx, st2, spec.offices);
    st2.techAdopted = st2.techAdopted ?? {};
    for (const k of techs) st2.techAdopted[k] = civ6.monthIndex;
    if (spec.doctrine != null) {
      const pay = nodesOf(st2).find((d) => d.id === spec.doctrine)?.cost ?? 0;
      st2.treasury += pay;
      const r = adoptDoctrine(ctx, st2, spec.doctrine, { provenance: mode === "creator" ? "creator" : "player" });
      if (!r.ok) st2.treasury -= pay;
    }
    makeEvent(civ6, ctx.ids, { kind: "state_constituted", title: `${st2.name}\u304C\u300C${REGIMES[spec.regime].ja}\u300D\u3068\u3057\u3066\u56FD\u306E\u5F62\u3092\u5B9A\u3081\u305F\uFF08${st2.leader.title} ${st2.leader.name}\uFF09`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: cap.cell }, facts: { stateId: st2.id, regime: spec.regime, offices: spec.offices.slice(), capitalCell: cap.cell, techs }, causes: st2.formedEvent ? [{ targetId: st2.formedEvent, relation: "caused_by", basis: "direct" }] : [], provenance: mode === "creator" ? "creator" : "player" });
    invalidateMonthCaches(ctx);
    ctx._byState = null;
    if (mode === "player") {
      const r = takeControl(w, st2.id);
      if (!r.ok) return r;
      civ6.wcde.phase = "running";
      civ6.wcde.foundedAt = civ6.monthIndex;
      civ6.wcde.candidates = [];
    }
    return { ok: true, stateId: st2.id, capitalKind: plan.kind, realmGroups: realm.length };
  }
  function foundAsPlayer(w, c) {
    const { civ: civ6 } = w;
    if (c.regime || c.capital) return foundNation(w, c, { mode: "player" });
    const cand3 = (civ6.wcde.candidates ?? []).find((x) => x.id === c.candidateId);
    if (!cand3) return fail3("\u305D\u306E\u5019\u88DC\u306F\u3042\u308A\u307E\u305B\u3093");
    const regime = c.polity && DEFAULT_REGIME[c.polity] ? DEFAULT_REGIME[c.polity] : DEFAULT_REGIME[cand3.polityOptions?.[0] ?? "tribal"];
    return foundNation(w, { auto: true, name: c.name ?? "", regime, offices: defaultOffices(regime), leader: { name: c.leaderName ?? "" }, capital: { groupId: cand3.capitalGroupId }, groupIds: cand3.groupIds }, { mode: "player", via: cand3.via });
  }
  function foundAsCreator(w, spec) {
    return foundNation(w, spec, { mode: "creator" });
  }
  function delegateToWorld(w) {
    const { civ: civ6 } = w;
    civ6.wcde.phase = "running";
    civ6.wcde.foundedAt = civ6.monthIndex;
    civ6.wcde.control.stateId = null;
    return { ok: true };
  }
  function foundingOptions(w, { regime = null, capital = null, techs = [] } = {}) {
    const { civ: civ6 } = w, out = { ok: true, regimes: [], sites: [], looks: LOOKS, maxTech: MAX_START_TECH };
    const anyG = Object.values(civ6.groups).filter((g) => g.settlementId && !g.stateId).sort((a, b) => b.pop - a.pop).slice(0, 80);
    out.regimes = Object.keys(REGIMES).map((id) => {
      const reasons = anyG.map((g) => regimeGate(civ6, g, id));
      const ok2 = reasons.some((r) => !r);
      return { id, ja: REGIMES[id].ja, blurb: REGIMES[id].blurb, ruler: officeJa(REGIMES[id].ruler), heredity: REGIMES[id].heredity, offices: REGIMES[id].offices.map((o) => ({ id: o, ja: officeJa(o), dom: OFFICES[o][1] })), defaultOffices: defaultOffices(id), ok: ok2, reason: ok2 ? null : reasons[0] ?? "\u3053\u306E\u4E16\u754C\u306E\u8AB0\u3082\u307E\u3060\u6761\u4EF6\u3092\u6E80\u305F\u3057\u3066\u3044\u306A\u3044" };
    });
    out.sites = regime ? capitalSites(w, regime) : [];
    if (capital) {
      const p = planCapital(w, capital);
      if (!p.ok) return { ...out, capitalError: p.error };
      const gid = p.groupId ?? p.parentId, realm = planRealm(w, gid), g = civ6.groups[gid];
      out.capital = { kind: p.kind, cell: p.cell, pop: p.pop, groupId: p.groupId ?? null };
      out.realm = realm;
      out.techChoices = techChoices(w, realm.groupIds);
      out.doctrineChoices = doctrineChoices(w, techs);
      out.capitalInfo = { cultureId: dominant2(g).cultureId, languageId: languageOfGroup(g), religionId: dominant2(g).religionId };
      if (regime) out.gate = regimeGate(civ6, g, regime);
    }
    return out;
  }

  // js/core/wcde/uprising.js
  var clamp16 = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  var fail4 = (error) => ({ ok: false, error });
  var UPRISING_KINDS = Object.freeze({
    revolution: { ja: "\u6C11\u8846\u8702\u8D77\uFF08\u9769\u547D\uFF09", faction: "commoners", state: false, blurb: "\u91CD\u3044\u8CA0\u62C5\u3068\u4E0D\u6E80\u3092\u62B1\u3048\u305F\u6C11\u8846\u304C\u7ACB\u3061\u4E0A\u304C\u308A\u3001\u4F53\u5236\u3092\u5012\u305D\u3046\u3068\u3059\u308B\u3002" },
    coup: { ja: "\u8ECD\u306E\u30AF\u30FC\u30C7\u30BF\u30FC", faction: "military", state: false, blurb: "\u8ECD\u304C\u6A29\u529B\u3092\u63E1\u308A\u3001\u70BA\u653F\u8005\u3092\u53D6\u308A\u66FF\u3048\u3088\u3046\u3068\u3059\u308B\u3002" },
    noble_revolt: { ja: "\u8AF8\u4FAF\u30FB\u8CB4\u65CF\u306E\u53CD\u4E71", faction: "nobility", state: "optional", blurb: "\u6709\u529B\u306A\u5BB6\u9580\u304C\u738B\u6A29\u306B\u9006\u3089\u3046\u3002\u72EC\u7ACB\u306E\u56FD\u3092\u7ACB\u3066\u308B\u3053\u3068\u3082\u3042\u308B\u3002" },
    religious_revolt: { ja: "\u5B97\u6559\u53CD\u4E71", faction: "clergy", state: "optional", blurb: "\u4FE1\u4EF0\u3092\u63B2\u3052\u305F\u53CD\u4E71\u3002\u65B0\u3057\u3044\u5B97\u6559\u56FD\u5BB6\u3092\u7ACB\u3066\u308B\u3053\u3068\u3082\u3042\u308B\u3002" },
    separatist: { ja: "\u5206\u96E2\u72EC\u7ACB\u904B\u52D5", faction: "clans", state: "required", blurb: "\u5730\u65B9\u304C\u56FD\u304B\u3089\u5206\u304B\u308C\u3066\u3001\u72EC\u7ACB\u306E\u56FD\u3092\u3064\u304F\u308D\u3046\u3068\u3059\u308B\u3002" }
  });
  var support = (st2, key) => {
    const f2 = st2.politics?.factions?.[key];
    return typeof f2?.support === "number" ? f2.support : 0.5;
  };
  function planUprising(w, { stateId, kind, cell }) {
    const { civ: civ6, sim } = w, ctx = sim.ctx, world = w.world, st2 = civ6.states[stateId], K = UPRISING_KINDS[kind];
    if (!st2?.alive) return fail4("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (!K) return fail4("\u53CD\u4E71\u306E\u578B\u306F " + Object.keys(UPRISING_KINDS).join("\u30FB") + " \u306E\u3069\u308C\u304B");
    if (!Number.isInteger(cell)) return fail4("\u4E2D\u5FC3\u5730\u3092\u5730\u56F3\u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    ctx._spatial = null;
    const { home } = spatialOf(ctx);
    const gid = home.get(cell) ?? Object.values(civ6.groups).find((x) => (x.cells ?? [x.cell]).includes(cell))?.id, center = gid ? civ6.groups[gid] : null;
    if (!center || center.stateId !== st2.id) return fail4("\u4E2D\u5FC3\u5730\u306F\u3001\u81EA\u56FD\u306E\u9818\u571F\u306E\u4E2D\u304B\u3089\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
    if (center.id === st2.capitalGroupId) return fail4("\u9996\u90FD\u3067\u306F\u53CD\u4E71\u3092\u8D77\u3053\u305B\u307E\u305B\u3093\uFF08\u9996\u90FD\u4EE5\u5916\u306E\u571F\u5730\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\uFF09");
    const gs = Object.values(civ6.groups).filter((g) => g.stateId === st2.id), cap = civ6.groups[st2.capitalGroupId];
    let tens = 0, tp = 0;
    for (const g of gs) {
      let t = 0;
      for (const c of g.cohorts ?? []) if (c.tension > t) t = c.tension;
      tens += t * g.pop;
      tp += g.pop;
    }
    const grievance2 = clamp16((1 - st2.stability) * 0.9 + (tp ? tens / tp * 0.6 : 0) + (st2.warIds.length ? 0.1 : 0) + Math.max(0, st2.policy.tax - 0.15) * 1.2 + st2.policy.mobilization * 0.2), disc = 1 - support(st2, K.faction);
    const far = cap ? Math.min(1, distKm(world, cap.cell, center.cell) / 6e3) : 0.3, scale = clamp16(0.12 + 0.55 * grievance2 + 0.3 * disc + 0.15 * far, 0.08, 0.95);
    const R = 1 + Math.round(scale * 7), dist = reachable(world, center.cell, R, 0), near = [];
    for (const [c, d] of dist) {
      const id2 = home.get(c);
      const g = id2 && civ6.groups[id2];
      if (!g || g.stateId !== st2.id || g.id === st2.capitalGroupId) continue;
      near.push([d, g]);
    }
    near.sort((a, b) => a[0] - b[0] || b[1].pop - a[1].pop || (a[1].id < b[1].id ? -1 : 1));
    const cap2 = Math.max(1, Math.floor((gs.length - 1) * 0.6)), region = [center, ...near.map((x) => x[1]).filter((g) => g.id !== center.id)].slice(0, cap2), rebelPop = Math.round(region.reduce((s, g) => s + g.pop, 0));
    const rebelPower = rebelPop * (0.5 + disc) * (0.6 + scale), statePower = st2.army * (0.5 + st2.stability) + Math.max(0, st2.pop - rebelPop) * 0.02, odds = clamp16(rebelPower / (rebelPower + statePower + 1e-9), 0.03, 0.97);
    const oddsLabel = odds >= 0.7 ? "\u53CD\u4E71\u5074\u304C\u512A\u52E2" : odds >= 0.45 ? "\u4E92\u89D2" : odds >= 0.25 ? "\u3084\u3084\u4E0D\u5229" : "\u304B\u306A\u308A\u4E0D\u5229";
    return { ok: true, kind, kindJa: K.ja, stateMode: K.state, center: { groupId: center.id, cell: center.cell }, scale: Math.round(scale * 100) / 100, scaleLabel: scale >= 0.7 ? "\u5927\u898F\u6A21" : scale >= 0.4 ? "\u4E2D\u898F\u6A21" : "\u5C0F\u898F\u6A21", regionGroupIds: region.map((g) => g.id), rebelPop, share: st2.pop ? Math.round(rebelPop / st2.pop * 100) / 100 : 0, odds: Math.round(odds * 100) / 100, oddsLabel, grievance: Math.round(grievance2 * 100) / 100 };
  }
  function applyReform(ctx, st2, reform) {
    const { civ: civ6 } = ctx, r = REGIMES[reform.regime], core = r.core, before = { polity: st2.polity, regime: regimeOf(st2) };
    st2.regime = reform.regime;
    st2.polity = core;
    st2.interpDirty = true;
    const rt = retitle(st2, core);
    if (rt) {
      st2.name = rt.name;
      st2.nameBase = rt.base;
    }
    st2.leader = { name: String(reform.leader.name).trim(), bornAt: civ6.monthIndex - Math.round(360 + leaderRng(civ6, st2, "reform")() * 120), heir: false, look: reform.leader.look ?? 0, title: officeJa(r.ruler) };
    st2.offices = null;
    assignOffices(ctx, st2, reform.offices);
    if (st2.politics) st2.politics.lastRegimeChange = civ6.monthIndex;
    return before;
  }
  function startUprising(w, { stateId, kind, cell, asState = null, found = null, reform = null }) {
    const { civ: civ6, sim } = w, ctx = sim.ctx, st2 = civ6.states[stateId], K = UPRISING_KINDS[kind];
    if (!st2?.alive) return fail4("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    if (controlledState(civ6)?.id !== stateId) return fail4("\u62C5\u5F53\u3057\u3066\u3044\u308B\u56FD\u306E\u4E2D\u3067\u3060\u3051\u3001\u53CD\u4E71\u3092\u8D77\u3053\u305B\u307E\u3059");
    const plan = planUprising(w, { stateId, kind, cell });
    if (!plan.ok) return plan;
    const makeState = K.state === "required" ? true : K.state === "optional" ? !!asState : false;
    const regionGs = plan.regionGroupIds.map((i) => civ6.groups[i]);
    if (makeState) {
      if (!found) return fail4("\u56FD\u5BB6\u3092\u3064\u304F\u308B\u53CD\u4E71\u3067\u306F\u3001\u56FD\u540D\u30FB\u653F\u4F53\u30FB\u5F79\u8077\u30FB\u70BA\u653F\u8005\u3092\u6C7A\u3081\u3066\u304F\u3060\u3055\u3044");
      const probe = Object.values(civ6.states).some((x) => x.alive && x.name === String(found.name ?? "").trim());
      if (probe) return fail4("\u540C\u3058\u540D\u524D\u306E\u56FD\u304C\u3059\u3067\u306B\u3042\u308A\u307E\u3059");
      const center = civ6.groups[plan.center.groupId], gate = regimeGate(civ6, center, found.regime);
      if (found.regime && gate) return fail4(`\u3053\u306E\u5730\u3067\u306F\u300C${REGIMES[found.regime]?.ja}\u300D\u3092\u9078\u3079\u307E\u305B\u3093\uFF08${gate}\uFF09`);
      const oe = found.regime ? checkOffices(found.regime, found.offices) : "\u653F\u4F53\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044";
      if (oe) return fail4(oe);
    } else {
      if (!reform) return fail4("\u6210\u529F\u3057\u305F\u3068\u304D\u306B\u6A39\u7ACB\u3059\u308B\u4F53\u5236\uFF08\u653F\u4F53\u30FB\u5F79\u8077\u30FB\u70BA\u653F\u8005\uFF09\u3092\u6C7A\u3081\u3066\u304F\u3060\u3055\u3044");
      if (!REGIMES[reform.regime]) return fail4("\u653F\u4F53\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044");
      const oe = checkOffices(reform.regime, reform.offices);
      if (oe) return fail4(oe);
      const ln = String(reform.leader?.name ?? "").trim();
      if (!ln || ln.length > 30) return fail4("\u65B0\u3057\u3044\u70BA\u653F\u8005\u306E\u540D\u524D\u306F 1\u301C30 \u6587\u5B57\u3067\u6C7A\u3081\u3066\u304F\u3060\u3055\u3044");
      const gate = regimeGate(civ6, civ6.groups[st2.capitalGroupId] ?? regionGs[0], reform.regime);
      if (gate) return fail4(`\u3053\u306E\u56FD\u3067\u306F\u300C${REGIMES[reform.regime].ja}\u300D\u306F\u307E\u3060\u9078\u3079\u307E\u305B\u3093\uFF08${gate}\uFF09`);
    }
    const ev = makeEvent(civ6, ctx.ids, { kind: "uprising", title: `${st2.name}\u3067${K.ja}\u304C\u8D77\u304D\u305F\uFF08${plan.scaleLabel}\uFF09`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: plan.center.cell }, facts: { stateId: st2.id, kind, scale: plan.scale, rebelPop: plan.rebelPop }, provenance: "player" });
    if (makeState) {
      const saved = regionGs.map((g) => [g, g.stateId]);
      for (const g of regionGs) g.stateId = null;
      invalidateMonthCaches(ctx);
      ctx._byState = null;
      const r = foundNation(w, { ...found, capital: { groupId: plan.center.groupId }, groupIds: regionGs.map((g) => g.id) }, { mode: "rebel", predecessor: st2.id, cause: ev.eventId, via: "secession" });
      if (!r.ok) {
        for (const [g, s] of saved) g.stateId = s;
        invalidateMonthCaches(ctx);
        ctx._byState = null;
        civ6.events.pop();
        return r;
      }
      const ns = civ6.states[r.stateId];
      ns.relations[st2.id] = -60;
      st2.relations[ns.id] = -60;
      st2.stability = clamp16(st2.stability - 0.06 - plan.scale * 0.1);
      const war = declareWar(ctx, ns, st2, { reason: kind === "separatist" ? "independence" : kind === "religious_revolt" ? "religion" : "civil_war", provenance: "simulation" });
      return { ok: true, outcome: "new_state", newStateId: ns.id, warId: war.id, plan };
    }
    const roll = leaderRng(civ6, st2, "uprising", kind, plan.center.cell)();
    if (roll < plan.odds) {
      const before = applyReform(ctx, st2, reform);
      st2.stability = clamp16(Math.min(st2.stability, 0.6) * 0.7 - plan.scale * 0.1 + 0.1, 0.12, 0.7);
      for (const g of regionGs) g.pop = Math.max(1, g.pop * (1 - 0.02 * (0.5 + plan.scale)));
      makeEvent(civ6, ctx.ids, { kind: "regime_change", title: `${st2.name}\u3067${K.ja}\u304C\u6210\u529F\u3057\u3001\u300C${REGIMES[reform.regime].ja}\u300D\u306E\u4F53\u5236\u306B\u306A\u3063\u305F\uFF08${st2.leader.title} ${st2.leader.name}\uFF09`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: plan.center.cell }, facts: { stateId: st2.id, polity: st2.polity, regime: reform.regime, name: st2.name, uprising: kind }, effects: [{ targetId: st2.id, property: "polity", before: before.polity, after: st2.polity }], causes: [{ targetId: ev.eventId, relation: "caused_by", basis: "direct" }], provenance: "player" });
      invalidateMonthCaches(ctx);
      return { ok: true, outcome: "success", plan };
    }
    const loss = 0.03 + 0.08 * plan.scale;
    for (const g of regionGs) g.pop = Math.max(1, g.pop * (1 - loss));
    st2.stability = clamp16(st2.stability - 0.03 - plan.scale * 0.05);
    makeEvent(civ6, ctx.ids, { kind: "uprising_crushed", title: `${st2.name}\u306E${K.ja}\u306F\u93AE\u5727\u3055\u308C\u305F`, participants: [{ entityId: st2.id, role: "state" }], location: { cell: plan.center.cell }, facts: { stateId: st2.id, kind }, causes: [{ targetId: ev.eventId, relation: "caused_by", basis: "direct" }], provenance: "player" });
    invalidateMonthCaches(ctx);
    return { ok: true, outcome: "crushed", plan };
  }
  function setOffices(w, { stateId, offices }) {
    const { civ: civ6, sim } = w, ctx = sim.ctx, st2 = civ6.states[stateId];
    if (!st2?.alive) return fail4("\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093");
    const rg = regimeOf(st2), err = checkOffices(rg, offices);
    if (err) return fail4(err);
    const before = (st2.offices ?? []).map((o) => o.id);
    if (before.length === offices.length && before.every((x) => offices.includes(x))) return { ok: true, changed: false };
    assignOffices(ctx, st2, offices);
    const added = offices.filter((x) => !before.includes(x)).map(officeJa), removed = before.filter((x) => !offices.includes(x)).map(officeJa);
    makeEvent(civ6, ctx.ids, { kind: "office_reform", title: `${st2.name}\u304C\u5B98\u5236\u3092\u6539\u3081\u305F${added.length ? `\uFF08\u7F6E\u304F: ${added.join("\u30FB")}\uFF09` : ""}${removed.length ? `\uFF08\u5EC3\u3059: ${removed.join("\u30FB")}\uFF09` : ""}`, participants: [{ entityId: st2.id, role: "state" }], location: civ6.groups[st2.capitalGroupId] ? { cell: civ6.groups[st2.capitalGroupId].cell } : null, facts: { stateId: st2.id, offices: offices.slice() }, provenance: "player" });
    return { ok: true, changed: true, added, removed };
  }

  // js/core/wcde/techedit.js
  var fail5 = (error, extra = {}) => ({ ok: false, error, ...extra });
  var log2 = (civ6, e) => {
    var _a;
    return ((_a = civ6.wcde).edits ?? (_a.edits = [])).push({ at: civ6.monthIndex, authority: "creator_intervention", ...e });
  };
  var refreshAll = (civ6) => {
    for (const id in civ6.groups) refreshCand(civ6.groups[id], civ6);
  };
  function planTechEdit(w, c) {
    const { civ: civ6 } = w, t = TECH[c.key];
    if (!t) return fail5("\u672A\u77E5\u306E\u6280\u8853");
    if (c.prereq !== void 0) {
      if (!Array.isArray(c.prereq) || c.prereq.some((p) => !TECH[p])) return fail5("\u524D\u63D0\u306B\u672A\u77E5\u306E\u6280\u8853\u304C\u3042\u308B");
      if (c.prereq.includes(c.key)) return fail5("\u81EA\u5206\u81EA\u8EAB\u3092\u524D\u63D0\u306B\u3067\u304D\u306A\u3044");
      const seen = /* @__PURE__ */ new Set(), stack = [...c.prereq];
      while (stack.length) {
        const k = stack.pop();
        if (k === c.key) return fail5("\u524D\u63D0\u304C\u5FAA\u74B0\u3059\u308B");
        if (seen.has(k)) continue;
        seen.add(k);
        stack.push(...prereqOf(civ6, TECH[k]));
      }
    }
    if (c.fx !== void 0 && (typeof c.fx !== "object" || Object.values(c.fx).some((v) => !Number.isFinite(v) || v < -1 || v > 3))) return fail5("\u52B9\u679C\u306F -1\u301C3 \u306E\u6570");
    if (c.caps !== void 0 && (!Array.isArray(c.caps) || c.caps.some((x) => typeof x !== "string"))) return fail5("\u89E3\u7981\u306F\u6587\u5B57\u5217\u306E\u914D\u5217");
    return { ok: true, impact: impactOf(civ6, c.key) };
  }
  function techEdit(w, c) {
    var _a, _b;
    const { civ: civ6 } = w, p = planTechEdit(w, c);
    if (!p.ok) return p;
    const i = p.impact;
    if ((i.holders || i.adopters || i.dependents.length) && !c.acknowledge) return fail5(`\u3053\u306E\u7DE8\u96C6\u306F\u3001\u4F9D\u5B58\u3059\u308B\u6280\u8853 ${i.dependents.length} \u4EF6\u30FB\u4FDD\u6709\u3059\u308B\u96C6\u56E3 ${i.holders}\u30FB\u63A1\u7528\u3059\u308B\u56FD\u5BB6 ${i.adopters} \u306B\u5F71\u97FF\u3057\u307E\u3059\u3002\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044`, { needsAck: true, impact: i });
    const o = (_a = civ6.techOverrides ?? (civ6.techOverrides = {}))[_b = c.key] ?? (_a[_b] = {});
    const before = { prereq: o.prereq ?? t0(c.key).prereq, fx: o.fx ?? t0(c.key).fx, caps: o.caps ?? t0(c.key).caps };
    if (c.prereq !== void 0) o.prereq = [...c.prereq];
    if (c.fx !== void 0) o.fx = { ...c.fx };
    if (c.caps !== void 0) o.caps = [...c.caps];
    refreshAll(civ6);
    log2(civ6, { targetId: c.key, property: "techtree", before, after: { prereq: o.prereq ?? before.prereq, fx: o.fx ?? before.fx, caps: o.caps ?? before.caps } });
    return { ok: true, impact: i };
  }
  var t0 = (k) => TECH[k];
  function techEditReset(w, { key }) {
    const { civ: civ6 } = w;
    if (!civ6.techOverrides?.[key]) return fail5("\u7DE8\u96C6\u3055\u308C\u3066\u3044\u306A\u3044");
    delete civ6.techOverrides[key];
    if (!Object.keys(civ6.techOverrides).length) delete civ6.techOverrides;
    refreshAll(civ6);
    log2(civ6, { targetId: key, property: "techtree", before: "edited", after: "default" });
    return { ok: true };
  }
  function techGrant(w, c) {
    var _a, _b, _c, _d;
    const { civ: civ6 } = w, t = TECH[c.key];
    if (!t) return fail5("\u672A\u77E5\u306E\u6280\u8853");
    const mode = c.mode === "revoke" ? "revoke" : "grant";
    const groups = c.stateId ? Object.values(civ6.groups).filter((g) => g.stateId === c.stateId) : (c.groupIds ?? []).map((id) => civ6.groups[id]).filter(Boolean);
    if (!groups.length) return fail5("\u5BFE\u8C61\u306E\u96C6\u56E3\u304C\u306A\u3044");
    const mi = civ6.monthIndex;
    let n2 = 0;
    if (mode === "grant") {
      for (const g of groups) if (g.tech.known[t.key] == null) {
        const miss = prereqOf(civ6, t).filter((p) => g.tech.known[p] == null);
        if (miss.length) return fail5(`\u524D\u63D0\u306E\u6280\u8853\u304C\u8DB3\u308A\u306A\u3044\u96C6\u56E3\u304C\u3042\u308B: ${miss.map((p) => TECH[p].name).join("\u30FB")}\uFF08\u524D\u63D0\u304B\u3089\u4ED8\u4E0E\u3057\u3066\u304F\u3060\u3055\u3044\uFF09`);
      }
    } else {
      const deps = TECHS.filter((u) => prereqOf(civ6, u).includes(t.key) && groups.some((g) => g.tech.known[u.key] != null));
      if (deps.length && !c.acknowledge) return fail5(`${deps.map((u) => u.name).join("\u30FB")}\u3092\u4FDD\u6709\u3059\u308B\u96C6\u56E3\u304C\u3042\u308B\u3002\u524D\u63D0\u3092\u5265\u596A\u3059\u308B\u3068\u3001\u305D\u308C\u3089\u306E\u6A5F\u80FD\u304C\u52A3\u5316\u3057\u307E\u3059\u3002\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044`, { needsAck: true, impact: { dependents: deps.map((u) => u.key) } });
    }
    for (const g of groups) {
      if (mode === "grant" && g.tech.known[t.key] == null) {
        g.tech.known[t.key] = mi;
        delete g.tech.lost[t.key];
        refreshCand(g, civ6);
        n2++;
      } else if (mode === "revoke" && g.tech.known[t.key] != null) {
        delete g.tech.known[t.key];
        g.tech.lost[t.key] = true;
        refreshCand(g, civ6);
        n2++;
      }
    }
    if (c.stateId && mode === "revoke") {
      const st2 = civ6.states[c.stateId];
      if (st2 && st2.techAdopted[t.key] != null) delete st2.techAdopted[t.key];
    }
    if (c.stateId && mode === "grant" && c.institutionalize) {
      const st2 = civ6.states[c.stateId];
      if (st2) (_a = st2.techAdopted)[_b = t.key] ?? (_a[_b] = mi);
    }
    const rec = (_c = civ6.techWorld)[_d = t.key] ?? (_c[_d] = { discoveries: [], first: mi, independent: 0, spread: 0, byChannel: {} });
    if (mode === "grant") {
      rec.spread += n2;
      rec.byChannel.creator = (rec.byChannel.creator ?? 0) + n2;
    }
    log2(civ6, { targetId: c.stateId ?? groups.map((g) => g.id).slice(0, 5).join(","), property: `tech.${t.key}`, before: mode === "grant" ? null : "known", after: mode === "grant" ? "known" : null, count: n2 });
    return { ok: true, changed: n2 };
  }

  // js/core/wcde/commands.js
  var ALL = ["prehistory", "founding", "running"];
  var registered = false;
  function registerCommands() {
    if (registered) return;
    registered = true;
    defineCommand("founding.found", { authorities: [AUTHORITY.PLAYER], phases: ["founding"], apply: (w, c) => foundAsPlayer(w, c) });
    defineCommand("founding.delegate", { authorities: [AUTHORITY.ADMIN], phases: ["founding"], apply: (w) => delegateToWorld(w) });
    defineCommand("founding.options", { authorities: [AUTHORITY.ADMIN], mutates: false, phases: ["founding", "running"], apply: (w, c) => foundingOptions(w, { regime: c.regime ?? null, capital: c.capital ?? null, techs: c.techs ?? [] }) });
    defineCommand("creator.found", { authorities: [AUTHORITY.CREATOR], phases: ["running"], apply: (w, c) => foundAsCreator(w, c) });
    defineCommand("founding.refresh", { authorities: [AUTHORITY.ADMIN], phases: ["founding"], apply: (w) => ({ ok: true, candidates: refreshCandidates(w) }) });
    defineCommand("uprising.plan", { authorities: [AUTHORITY.PLAYER], control: true, mutates: false, apply: (w, c) => planUprising(w, c) });
    defineCommand("uprising.start", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => startUprising(w, c) });
    defineCommand("state.setOffices", { authorities: [AUTHORITY.PLAYER, AUTHORITY.CREATOR], control: true, apply: (w, c) => setOffices(w, c) });
    defineCommand("control.take", { authorities: [AUTHORITY.ADMIN], apply: (w, c) => takeControl(w, c.stateId) });
    defineCommand("control.release", { authorities: [AUTHORITY.ADMIN], apply: (w) => releaseControl(w) });
    defineCommand("time.advance", { authorities: [AUTHORITY.ADMIN], checkpoint: false, validate: (w, c) => timeOf(w.civ).hold ? { ok: false, error: "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u78BA\u8A8D\u5F85\u3061\u3067\u3059\uFF08OK \u3092\u62BC\u3059\u307E\u3067\u6642\u9593\u306F\u9032\u307F\u307E\u305B\u3093\uFF09" } : Number.isInteger(c.months) && c.months >= 1 && c.months <= 12e4 ? null : { ok: false, error: "months \u306F 1\u301C120000 \u306E\u6574\u6570" }, apply: (w, c) => {
      const r = safeAdvance(w, c.months);
      skipNews(w.civ);
      return r.ok ? { ok: true, ...r } : { ok: false, error: `${r.error}\uFF08${r.haltedAt.year}\u5E74${r.haltedAt.month}\u6708\u3067\u505C\u6B62\uFF09`, ...r };
    } });
    defineCommand("clock.run", { authorities: [AUTHORITY.ADMIN], checkpoint: false, validate: (w, c) => Number.isInteger(c.months) && c.months >= 1 && c.months <= 240 ? null : { ok: false, error: "months \u306F 1\u301C240 \u306E\u6574\u6570" }, apply: (w, c) => {
      const r = clockRun(w, c.months);
      return r.ok ? r : { ...r, ok: false };
    } });
    defineCommand("clock.setSpeed", { authorities: [AUTHORITY.ADMIN], mutates: false, phases: ALL, apply: (w, c) => setSpeed(w, c) });
    defineCommand("news.ack", { authorities: [AUTHORITY.ADMIN], mutates: false, phases: ALL, apply: (w, c) => ackNews(w, c) });
    defineCommand("view.past", { authorities: [AUTHORITY.ADMIN], mutates: false, phases: ALL, validate: (w, c) => c.month == null || Number.isInteger(c.month) && c.month <= w.civ.monthIndex ? null : { ok: false, error: "month \u306F\u73FE\u5728\u4EE5\u524D\u306E\u6574\u6570\u3001\u307E\u305F\u306F null\uFF08\u73FE\u5728\u3078\u623B\u308B\uFF09" }, apply: (w, c) => {
      w.viewPast = c.month ?? null;
      return { ok: true };
    } });
    defineCommand("state.act", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const r = w.sim.command({ type: "stateAction", stateId: c.stateId, action: c.action, target: c.target ?? null, opt: c.opt ?? null });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.error };
    } });
    defineCommand("diplomacy.peace", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const st2 = w.civ.states[c.stateId], war = w.civ.wars[c.warId];
      if (!st2?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      const r = negotiatePeace(w.sim.ctx, st2, war, { terms: c.terms });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.error };
    } });
    defineCommand("war.direct", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const st2 = w.civ.states[c.stateId], war = w.civ.wars[c.warId];
      if (!st2?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      if (!war) return { ok: false, error: "\u305D\u306E\u6226\u4E89\u306F\u3042\u308A\u307E\u305B\u3093" };
      const r = directWar(w.sim.ctx, st2, war, { posture: c.posture ?? null, commit: c.commit ?? null, focus: c.focus });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.error };
    } });
    defineCommand("state.reorganize", { authorities: [AUTHORITY.PLAYER, AUTHORITY.CREATOR], control: true, apply: (w, c) => {
      const st2 = w.civ.states[c.stateId];
      if (!st2?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      return reorganize(w.sim.ctx, st2, c.shares);
    } });
    defineCommand("state.adoptDoctrine", { authorities: [AUTHORITY.PLAYER], control: true, apply: (w, c) => {
      const st2 = w.civ.states[c.stateId];
      if (!st2?.alive) return { ok: false, error: "\u305D\u306E\u56FD\u5BB6\u306F\u5B58\u5728\u3057\u307E\u305B\u3093" };
      const r = adoptDoctrine(w.sim.ctx, st2, c.doctrineId ?? c.id, { provenance: "player" });
      return r.ok ? { ok: true, result: r } : { ok: false, error: r.reason };
    } });
    defineCommand("creator.editState", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => creatorEditState(w, c) });
    defineCommand("creator.rename", { authorities: [AUTHORITY.CREATOR], phases: ["founding", "running"], apply: (w, c) => creatorRename(w, c) });
    defineCommand("creator.intervene", { authorities: [AUTHORITY.CREATOR], validate: (w, c) => {
      const p = planIntervention(w, c);
      return p.ok ? null : p;
    }, apply: (w, c) => createIntervention(w, c) });
    defineCommand("tech.preview", { authorities: [AUTHORITY.CREATOR], mutates: false, phases: ALL, apply: (w, c) => planTechEdit(w, c) });
    defineCommand("creator.techEdit", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => techEdit(w, c) });
    defineCommand("creator.techEditReset", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => techEditReset(w, c) });
    defineCommand("creator.techGrant", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => techGrant(w, c) });
    defineCommand("creator.catastrophe", { authorities: [AUTHORITY.CREATOR], validate: (w, c) => {
      const p = planCatastrophe(w, c);
      return p.ok ? null : p;
    }, apply: (w, c) => createCatastrophe(w, c) });
    defineCommand("creator.cancelIntervention", { authorities: [AUTHORITY.CREATOR], apply: (w, c) => cancelIntervention(w, c) });
    defineCommand("calendar.edit", { authorities: [AUTHORITY.ADMIN, AUTHORITY.CREATOR], phases: ALL, apply: (w, c) => {
      const r = applyDisplayEdit(w.civ.wcde.config.calendar, c.edit ?? {});
      if (r.errors.length) return { ok: false, error: r.errors.join(" / ") };
      w.civ.wcde.config.calendar = r.calendar;
      return { ok: true };
    } });
  }

  // js/core/wcde/world.js
  function createNewWorld(input, { generate = generateWorld, historySeed = null, stepYears, onProgress = null } = {}) {
    registerCommands();
    const { config, errors } = normalizeWorldConfig(input);
    if (errors.length) return { ok: false, errors };
    onProgress?.("\u5730\u7406", 0);
    const world = generate(config.spec);
    onProgress?.("\u5730\u7406", 1);
    const civ6 = createWcdeCiv(world, config, { historySeed: historySeed ?? hashSeed(config.worldSeed, "history", config.schema) });
    onProgress?.("\u5148\u53F2", 0);
    const stats = runPrehistory(world, civ6, { stepYears, onProgress: (s, n2) => onProgress?.("\u5148\u53F2", s / n2) });
    onProgress?.("\u5148\u53F2", 1);
    finalizeLanguages(civ6);
    defineReligions({ civ: civ6 });
    const w = createWcde(world, civ6);
    const candidates = refreshCandidates(w);
    return { ok: true, w, errors: [], report: { prehistory: stats, candidates: candidates.length } };
  }
  var ENTRY_MAX_YEARS = 50;
  function entryMonthsOf(config) {
    const u = hashSeed(config.worldSeed, "entry", config.schema) % 1e5 / 1e5;
    return Math.floor(ENTRY_MAX_YEARS * u * u) * 12 + hashSeed(config.worldSeed, "entry-m") % 12;
  }
  function advanceEntryStep(w, { chunk: chunk2 = 12 } = {}) {
    var _a;
    const { civ: civ6 } = w, total = entryMonthsOf(civ6.wcde.config), E = (_a = civ6.wcde).entryProgress ?? (_a.entryProgress = { done: 0, total });
    if (civ6.wcde.phase !== "founding" || civ6.wcde.entry) return { done: true, progress: 1 };
    const n2 = Math.min(chunk2, E.total - E.done);
    if (n2 > 0) {
      const r = safeAdvance(w, n2, { chunk: n2 });
      E.done += r.advanced;
      if (!r.ok) E.total = E.done;
    }
    if (E.done >= E.total) {
      skipNews(civ6);
      civ6.wcde.entry = { months: E.done, at: civ6.monthIndex };
      delete civ6.wcde.entryProgress;
      refreshCandidates(w);
      return { done: true, progress: 1 };
    }
    return { done: false, progress: E.done / Math.max(1, E.total) };
  }
  var defaultGenerate = generateWorld;
  var formatWorldDate = (w, mi = w.civ.monthIndex) => formatDate(w.civ.wcde.config.calendar, mi);

  // js/ui/v6/common.js
  var SVG = "http://www.w3.org/2000/svg";
  var h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  var sv = (tag, props = {}, ...kids) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) el.setAttribute(k, v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  var pct = (x) => Math.round(x * 100) + "%";
  var n0 = (x) => Math.round(x).toLocaleString("ja-JP");
  var r23 = (x) => Math.round(x * 100) / 100;
  var hash = (s) => {
    let x = 2166136261;
    for (const ch of String(s)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
    return x >>> 0;
  };
  var PALETTE = [[6, 64, 62], [176, 46, 48], [46, 78, 60], [268, 44, 66], [100, 42, 52], [212, 58, 62], [330, 52, 64], [28, 70, 58], [148, 40, 46], [240, 44, 70], [62, 56, 52], [290, 36, 60], [190, 52, 56], [14, 42, 48], [130, 34, 62], [52, 62, 70], [224, 40, 50], [350, 54, 54], [82, 50, 62], [258, 38, 56], [36, 46, 66], [168, 36, 62], [306, 44, 70], [200, 44, 40]];
  var REG = /* @__PURE__ */ new Map();
  var USE = new Array(PALETTE.length).fill(0);
  var pdist = (a, b) => {
    const A2 = PALETTE[a], B = PALETTE[b], dh = Math.abs(A2[0] - B[0]), h2 = Math.min(dh, 360 - dh) / 180;
    return h2 + 0.6 * Math.abs(A2[2] - B[2]) / 30 + 0.3 * Math.abs(A2[1] - B[1]) / 40;
  };
  var hasColor = (id) => REG.has(id);
  function resetColors() {
    REG.clear();
    USE.fill(0);
  }
  function assignColors(ids, adj) {
    for (const id of ids) {
      if (REG.has(id)) continue;
      const near = [...adj.get(id) ?? []].map((n2) => REG.get(n2)).filter((x) => x != null);
      let best = 0, bs = -1e9;
      for (let i = 0; i < PALETTE.length; i++) {
        const sep = near.length ? Math.min(...near.map((j) => pdist(i, j))) : 9, sc = Math.min(sep, 1.2) * 10 - USE[i] * 1.5;
        if (sc > bs + 1e-9) {
          bs = sc;
          best = i;
        }
      }
      REG.set(id, best);
      USE[best]++;
    }
  }
  var colorOf = (id, l) => {
    const i = REG.get(id);
    if (i != null) {
      const p = PALETTE[i];
      return `hsl(${p[0]} ${p[1]}% ${l ?? p[2]}%)`;
    }
    return `hsl(${hash(id) % 360} 48% ${l ?? 56}%)`;
  };
  var POLITY_JA = { tribal: "\u90E8\u65CF\u9023\u5408", chiefdom: "\u9996\u9577\u5236", city_state: "\u90FD\u5E02\u56FD\u5BB6", kingdom: "\u738B\u56FD", empire: "\u5E1D\u56FD", republic: "\u5171\u548C\u5236", theocracy: "\u795E\u6A29\u5236", federation: "\u9023\u90A6\u5236", confederation: "\u9023\u5408" };
  var polityJa = (p) => POLITY_JA[p] ?? p ?? "\u2014";
  var lb = (ja, en) => h("div", { class: "lb" }, ja, en ? h("em", {}, en) : null);
  var btn = (label, onclick, cls = "", props = {}) => h("button", { class: "b " + cls, onclick, ...props }, label);
  var table = (head2, rows, cls = "") => h("table", { class: "tb " + cls, style: "width:100%;border-collapse:collapse;font-size:12px" }, h("thead", {}, h("tr", {}, ...head2.map((x) => h("th", { style: "text-align:left;font-weight:400;color:var(--dim);border-bottom:1px solid var(--line);padding:3px 4px" }, x)))), h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c) => h("td", { style: "border-bottom:1px solid #262a31;padding:3px 4px" }, c))))));
  function face(name, stateId, look = null) {
    const k = look != null ? hash("look" + look) : hash(name + stateId), sk = ["#e0b79a", "#c99a76", "#a87654", "#f0cfb5"][k % 4], hr = ["#2a2420", "#6b4a2f", "#9a9a9a", "#4a3020"][(k >> 3) % 4], st2 = (k >> 6) % 4, c = colorOf(stateId, 45);
    let g = `<rect width="64" height="64" fill="#1b1f26"/><path d="M6 64Q8 46 32 44Q56 46 58 64Z" fill="${c}" fill-opacity=".8"/><rect x="28" y="38" width="8" height="8" fill="${sk}"/><ellipse cx="32" cy="27" rx="12" ry="14" fill="${sk}"/>`;
    if (st2 === 1) g += `<path d="M18 30Q14 10 32 10Q50 10 46 30L46 44L42 44L42 24Q32 14 22 24L22 44L18 44Z" fill="${hr}"/>`;
    else {
      g += `<path d="M19 26Q18 11 32 11Q46 11 45 26Q41 18 32 18Q23 18 19 26Z" fill="${hr}"/>`;
      if (st2 === 2) g += `<path d="M21 31Q32 48 43 31Q43 40 32 42Q21 40 21 31Z" fill="${hr}"/>`;
      if (st2 === 3) g += `<path d="M20 13L24 6L28 12L32 5L36 12L40 6L44 13Z" fill="#b59a74"/>`;
    }
    g += `<circle cx="27" cy="27" r="1.4" fill="#222"/><circle cx="37" cy="27" r="1.4" fill="#222"/><path d="M28 34Q32 36 36 34" stroke="#7a4a3a" fill="none"/>`;
    const e = sv("svg", { viewBox: "0 0 64 64", width: 64, height: 64 });
    e.innerHTML = g;
    return e;
  }
  function donut(items, cols) {
    const tot = items.reduce((a, x) => a + x[1], 0) || 1, r = 36, C = 2 * Math.PI * r;
    let o = 0;
    const e = sv("svg", { viewBox: "0 0 120 120", width: 116, height: 116 });
    items.forEach((v, i) => {
      const l = v[1] / tot * C;
      e.append(sv("circle", { cx: 60, cy: 60, r, fill: "none", stroke: cols[i % cols.length], "stroke-width": 20, "stroke-dasharray": `${l} ${C - l}`, "stroke-dashoffset": -o, transform: "rotate(-90 60 60)" }));
      o += l;
    });
    e.append(sv("text", { x: 60, y: 65, "text-anchor": "middle", "font-size": 14, fill: "#d9d6cc" }, n0(tot)));
    return e;
  }
  function hemi(factions, cols) {
    const rows = [8, 12, 16, 20, 24, 20], pts = [];
    rows.forEach((c, i) => {
      const r = 36 + i * 12;
      for (let k = 0; k < c; k++) {
        const a = Math.PI * (1 - (k + 0.5) / c);
        pts.push([a, 100 + r * Math.cos(a), 100 - r * Math.sin(a)]);
      }
    });
    pts.sort((a, b) => b[0] - a[0]);
    const tot = factions.reduce((a, f2) => a + f2[1], 0) || 1, e = sv("svg", { viewBox: "0 0 200 108", width: "100%" });
    let idx = 0;
    factions.forEach((f2, fi) => {
      const n2 = Math.round(f2[1] / tot * pts.length);
      for (let k = 0; k < n2 && idx < pts.length; k++) {
        const p = pts[idx++];
        e.append(sv("circle", { cx: p[1].toFixed(1), cy: p[2].toFixed(1), r: 3.6, fill: cols[fi % cols.length] }));
      }
    });
    return e;
  }
  var FACTION_JA = { nobility: "\u8CB4\u65CF", clergy: "\u8056\u8077\u8005", merchants: "\u5546\u4EBA", military: "\u8ECD", commoners: "\u6C11\u8846", bureaucrats: "\u5B98\u50DA", artisans: "\u8077\u4EBA", clans: "\u904A\u7267\u6C0F\u65CF" };
  var FACTION_COL = { nobility: "#a58bd0", clergy: "#d8b45a", merchants: "#6fa8c9", military: "#d0605a", commoners: "#9fbf8a", bureaucrats: "#8fb3b0", artisans: "#c99a6f", clans: "#b0a070" };
  function vlist(rows, rowH, renderRow) {
    const box = h("div", { class: "vlist" }), spacer = h("div", { style: `height:${rows.length * rowH}px` }), win = h("div", { style: "position:absolute;left:0;right:0;top:0" });
    box.append(spacer, win);
    const paint = () => {
      const a = Math.max(0, Math.floor(box.scrollTop / rowH) - 4), b = Math.min(rows.length, a + Math.ceil(box.clientHeight / rowH || 40) + 10);
      win.style.top = a * rowH + "px";
      win.replaceChildren(...rows.slice(a, b).map((r, i) => {
        const el = renderRow(r, a + i);
        el.style.height = rowH + "px";
        return el;
      }));
    };
    box.addEventListener("scroll", paint);
    setTimeout(paint, 0);
    box.__paint = paint;
    return box;
  }

  // js/ui/dom.js
  function byId(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`\u8981\u7D20 #${id} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\uFF08index.html \u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF09`);
    return el;
  }

  // js/ui/banner.js
  var AUTO_DISMISS_MS = 5e3;
  var LONG_ERROR = 120;
  function initBanner({ store, actions, persistLongError = false }) {
    const banner = byId("banner");
    const body = byId("banner-body");
    const loading = byId("loading");
    const loadingText = byId("loading-text");
    const empty = byId("empty-state");
    byId("banner-close").addEventListener("click", () => actions.dismissMessage());
    let dismissTimer = 0;
    let lastKey = null;
    store.subscribe((s) => {
      empty.hidden = !!s.map;
      loading.hidden = !s.busy;
      if (s.busy) loadingText.textContent = s.busy;
      banner.classList.remove("info");
      let key = null;
      if (s.error) {
        banner.hidden = false;
        banner.classList.remove("warn");
        body.textContent = s.error;
        key = `error:${s.error}`;
      } else if (s.warnings?.length) {
        banner.hidden = false;
        banner.classList.add("warn");
        const shown = s.warnings.slice(0, 5).map((w) => `\u30FB${w}`).join("\n");
        const more = s.warnings.length > 5 ? `
\u2026\u307B\u304B ${s.warnings.length - 5} \u4EF6` : "";
        body.textContent = `\u8AAD\u307F\u8FBC\u307F\u306F\u5B8C\u4E86\u3057\u307E\u3057\u305F\u304C\u3001\u6CE8\u610F\u304C\u3042\u308A\u307E\u3059\uFF08${s.warnings.length}\u4EF6\uFF09
${shown}${more}`;
        key = `warn:${s.warnings.length}`;
      } else if (s.notice) {
        banner.hidden = false;
        banner.classList.remove("warn");
        banner.classList.add("info");
        body.textContent = s.notice;
        key = `notice:${s.notice}`;
      } else {
        banner.hidden = true;
      }
      if (key !== lastKey) {
        lastKey = key;
        clearTimeout(dismissTimer);
        if (key && !(persistLongError && key.startsWith("error:") && key.length > LONG_ERROR)) dismissTimer = setTimeout(() => actions.dismissMessage(), AUTO_DISMISS_MS);
      }
    });
  }

  // js/ui/v6/notify.js
  var subs = [];
  var st = { error: null, warnings: [], notice: null, busy: null, map: true };
  var emit = () => subs.forEach((f2) => f2(st));
  var ready = false;
  function initNotify() {
    if (ready || typeof document === "undefined" || !document.getElementById("banner")) return;
    ready = true;
    initBanner({ store: { subscribe: (f2) => {
      subs.push(f2);
      f2(st);
    } }, actions: { dismissMessage: () => {
      st.error = null;
      st.warnings = [];
      st.notice = null;
      emit();
    } }, persistLongError: true });
  }
  function notify(kind, message) {
    st.error = null;
    st.warnings = [];
    st.notice = null;
    if (kind === "error") st.error = String(message);
    else st.notice = (kind === "warn" ? "\u6CE8\u610F: " : "") + String(message);
    emit();
  }

  // js/ui/v6/store.js
  var S2 = { w: null, hub: null, sel: null, tab: "politics", map: null, timer: null, notice: "", q: "", fileWarn: [], layerOpen: null, war: null, entity: { culture: null, language: null, religion: null }, tech: null, doc: null, fin: false, hooks: {} };
  var LABEL = { "state.act": "\u56FD\u5BB6\u306E\u884C\u52D5", "state.reorganize": "\u7DE8\u5236\u306E\u5909\u66F4", "state.adoptDoctrine": "\u30C9\u30AF\u30C8\u30EA\u30F3\u306E\u53D6\u5F97", "diplomacy.peace": "\u8B1B\u548C\u306E\u7533\u3057\u5165\u308C", "war.direct": "\u6226\u4E89\u306E\u65B9\u91DD\u306E\u6307\u793A", "creator.intervene": "\u4ECB\u5165", "creator.catastrophe": "\u707D\u5384", "creator.editState": "\u56FD\u5BB6\u306E\u7DE8\u96C6", "creator.rename": "\u540D\u524D\u306E\u7DE8\u96C6", "creator.cancelIntervention": "\u4ECB\u5165\u306E\u53D6\u308A\u6D88\u3057", "control.take": "\u56FD\u5BB6\u306E\u62C5\u5F53", "control.release": "\u62C5\u5F53\u306E\u89E3\u9664", "calendar.edit": "\u66A6\u306E\u8868\u793A\u540D\u306E\u5909\u66F4", "creator.techGrant": "\u6280\u8853\u306E\u4ED8\u4E0E" };
  var tell = (c, r, quiet) => {
    const n2 = LABEL[c.type] ?? c.type;
    if (!r.ok) notify("error", `${n2}\u306B\u5931\u6557: ${r.error ?? "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`);
    else if (!quiet && LABEL[c.type]) notify("ok", `${n2}\u3092\u5B9F\u884C\u3057\u307E\u3057\u305F`);
  };
  var run = (c) => {
    const r = dispatch(S2.w, { authority: AUTHORITY.ADMIN, ...c });
    S2.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    if (!r.ok && !["clock.run", "clock.setSpeed", "news.ack"].includes(c.type)) tell(c, r);
    else if (r.ok && LABEL[c.type]) tell(c, r);
    return r;
  };
  var act = (c) => {
    const r = dispatch(S2.w, { authority: AUTHORITY.PLAYER, ...c });
    S2.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    tell(c, r);
    S2.hooks.render?.();
    return r;
  };
  var creator = (c) => {
    const r = dispatch(S2.w, { authority: AUTHORITY.CREATOR, ...c });
    S2.notice = r.ok ? "" : r.error ?? "\u5931\u6557";
    tell(c, r);
    S2.hooks.render?.();
    return r;
  };
  var stateName = (id) => S2.w.civ.states[id]?.name ?? id;
  var aliveStates = () => Object.values(S2.w.civ.states).filter((s) => s.alive);
  var controlled = () => S2.w.civ.wcde.control.stateId;

  // js/ui/v6/terrain.js
  var TAU2 = Math.PI * 2;
  var clamp17 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  var css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  function ramp(stops) {
    const S3 = stops.map(([t, c]) => [t, hex(c)]);
    return (t) => {
      if (!(t > S3[0][0])) return css(S3[0][1]);
      for (let i = 1; i < S3.length; i++) if (t <= S3[i][0]) {
        const [t02, a] = S3[i - 1], [t1, b] = S3[i], f2 = (t - t02) / (t1 - t02 || 1);
        return css([a[0] + (b[0] - a[0]) * f2, a[1] + (b[1] - a[1]) * f2, a[2] + (b[2] - a[2]) * f2]);
      }
      return css(S3[S3.length - 1][1]);
    };
  }
  var RAMPS = {
    // 陸の標高（m）: 低地の緑 → 黄 → 茶 → 灰 → 雪
    land: ramp([[0, "#5a9a52"], [120, "#78a853"], [400, "#a9b95e"], [800, "#d3c46f"], [1400, "#cba867"], [2200, "#a98260"], [3300, "#8d7d72"], [4600, "#c7c4c0"], [6500, "#f7f6f3"]]),
    // 水深（m, 正の値）: 浅い青緑 → 深い藍
    sea: ramp([[0, "#6fbfd0"], [150, "#58a5c4"], [800, "#3f82b0"], [2200, "#2c5f93"], [4200, "#204878"], [6200, "#173560"]]),
    temp: ramp([[-30, "#6a4aa6"], [-15, "#4f7fcf"], [-3, "#86c9ea"], [7, "#93d6b0"], [15, "#d8e68e"], [22, "#f4d06c"], [28, "#ef9a4d"], [35, "#d4503d"]]),
    precip: ramp([[0, "#f4e8b8"], [250, "#e6d68c"], [700, "#a6d19b"], [1500, "#52a9a6"], [2500, "#3b82b8"], [4e3, "#2c509c"]]),
    pop: ramp([[0, "#fff1bf"], [0.22, "#ffd878"], [0.5, "#f7a84c"], [0.78, "#e2653b"], [1, "#a22f3b"]])
  };
  var BIOME_COLORS = ["#3f82b0", "#e9f2f5", "#aebb9f", "#4f7f5a", "#62ab5c", "#bcd67f", "#ebd291", "#c9c3a3", "#d6c670", "#8fc352", "#2f9c56", "#aaa69f", "#4ea594", "#5aa9c6"];
  var LAND_BASE = "#c9c3a6";
  var LAKE_COLOR = "#5aa9c6";
  function hash01(a, b = 0, c = 0) {
    let h2 = Math.imul(a ^ 2654435769, 2246822507) ^ Math.imul(b + 2135587861 | 0, 3266489909) ^ Math.imul(c + 374761393 | 0, 668265263);
    h2 ^= h2 >>> 15;
    h2 = Math.imul(h2, 739982445);
    h2 ^= h2 >>> 12;
    h2 = Math.imul(h2, 695872825);
    h2 ^= h2 >>> 15;
    return (h2 >>> 0) / 4294967296;
  }
  var LEVELS = 3;
  var JITTER = 0.17;
  var FRACT = 0.24;
  var Geo = class {
    constructor(mesh) {
      this.mesh = mesh;
      const N2 = mesh.cellCount, T3 = mesh.vertexXYZ.length / 3;
      this.N = N2;
      this.T = T3;
      const X = mesh.vertexXYZ, vlon = new Float32Array(T3), vlat = new Float32Array(T3);
      for (let v = 0; v < T3; v++) {
        vlon[v] = Math.atan2(X[3 * v + 1], X[3 * v]);
        vlat[v] = Math.asin(clamp17(X[3 * v + 2], -1, 1));
      }
      this.vlon = vlon;
      this.vlat = vlat;
      const C = mesh.centerXYZ, cen = new Float32Array(N2 * 2);
      for (let c = 0; c < N2; c++) {
        cen[2 * c] = Math.atan2(C[3 * c + 1], C[3 * c]);
        cen[2 * c + 1] = Math.asin(clamp17(C[3 * c + 2], -1, 1));
      }
      this.cen = cen;
      this.W = 0;
      this.H = 0;
      const off = mesh.neighborOffsets, nb = mesh.neighborIds, vo = mesh.cellVertexOffsets, vi = mesh.cellVertexIds, sv2 = new Int32Array(2 * nb.length).fill(-1);
      for (let c = 0; c < N2; c++) for (let k = off[c]; k < off[c + 1]; k++) {
        const n2 = nb[k];
        let f2 = 0;
        for (let a = vo[c]; a < vo[c + 1] && f2 < 2; a++) {
          const v = vi[a];
          for (let b = vo[n2]; b < vo[n2 + 1]; b++) if (vi[b] === v) {
            sv2[2 * k + f2++] = v;
            break;
          }
        }
      }
      this.slotVerts = sv2;
    }
    /** 幅 W（高さは W/2）の画面に合わせて、頂点の位置と辺・区画の形を作り直す */
    build(W2, H) {
      if (this.W === W2 && this.H === H) return;
      this.W = W2;
      this.H = H;
      this.ec = /* @__PURE__ */ new Map();
      this.cp = null;
      this.land = null;
      const T3 = this.T, VX = new Float32Array(T3), VY = new Float32Array(T3), cellPx = Math.sqrt(W2 * H / this.N);
      for (let v = 0; v < T3; v++) {
        const a = hash01(v, 1) * TAU2, r = JITTER * cellPx * (0.4 + 0.6 * hash01(v, 2));
        VX[v] = (this.vlon[v] + Math.PI) / TAU2 * W2 + Math.cos(a) * r;
        VY[v] = (Math.PI / 2 - this.vlat[v]) / Math.PI * H + Math.sin(a) * r;
      }
      this.VX = VX;
      this.VY = VY;
      this.cellPx = cellPx;
    }
    proj(lon, lat) {
      return [(lon + Math.PI) / TAU2 * this.W, (Math.PI / 2 - lat) / Math.PI * this.H];
    }
    /** 辺 a→b の折れ線 [x0,y0,x1,y1,…]。x は a の位置を基準に、b を ±W だけずらしてつなげたもの */
    edge(a, b) {
      const lo = a < b ? a : b, hi = a < b ? b : a, key = lo * this.T + hi;
      let p = this.ec.get(key);
      if (!p) {
        p = this._mk(lo, hi);
        this.ec.set(key, p);
      }
      if (a === lo) return p;
      const n2 = p.length / 2, q2 = new Float32Array(p.length);
      for (let i = 0; i < n2; i++) {
        q2[2 * i] = p[2 * (n2 - 1 - i)];
        q2[2 * i + 1] = p[2 * (n2 - 1 - i) + 1];
      }
      return q2;
    }
    _mk(lo, hi) {
      const W2 = this.W, n2 = 1 << LEVELS, pts = new Float32Array((n2 + 1) * 2), x1 = this.VX[lo], y1 = this.VY[lo];
      let x2 = this.VX[hi];
      const y2 = this.VY[hi];
      x2 += W2 * Math.round((x1 - x2) / W2);
      pts[0] = x1;
      pts[1] = y1;
      pts[2 * n2] = x2;
      pts[2 * n2 + 1] = y2;
      const sub2 = (i0, i1, lvl, node) => {
        if (lvl === LEVELS) return;
        const im = i0 + i1 >> 1, ax = pts[2 * i0], ay = pts[2 * i0 + 1], bx = pts[2 * i1], by = pts[2 * i1 + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, r = (hash01(lo, hi, node) - 0.5) * 2 * FRACT * len;
        pts[2 * im] = (ax + bx) / 2 - dy / len * r;
        pts[2 * im + 1] = (ay + by) / 2 + dx / len * r;
        sub2(i0, im, lvl + 1, node * 2);
        sub2(im, i1, lvl + 1, node * 2 + 1);
      };
      sub2(0, n2, 0, 1);
      return pts;
    }
    /** 折れ線 pts（x,y の並び）を path に加える。画面の左右端をまたぐものは ±W の写しも加える。close=true で閉じる */
    addPoly(path, pts, close) {
      const W2 = this.W, n2 = pts.length / 2;
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < n2; i++) {
        const x = pts[2 * i];
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
      for (const dx of [0, W2, -W2]) {
        if (hi + dx < 0 || lo + dx > W2) continue;
        path.moveTo(pts[0] + dx, pts[1]);
        for (let i = 1; i < n2; i++) path.lineTo(pts[2 * i] + dx, pts[2 * i + 1]);
        if (close) path.closePath();
      }
    }
    /** 区画 c の輪郭（共有する辺を使うので、隣と必ず一致する）。極を囲む区画は、画面の上端・下端まで伸ばして閉じる */
    ring(c) {
      const m = this.mesh, vo = m.cellVertexOffsets, vi = m.cellVertexIds, a0 = vo[c], cnt = vo[c + 1] - a0, W2 = this.W, H = this.H, out = [];
      let lastX = 0, lastY = 0, firstX = 0, latSum = 0;
      for (let i = 0; i < cnt; i++) {
        const va = vi[a0 + i], vb = vi[a0 + (i + 1) % cnt], e = this.edge(va, vb), n2 = e.length / 2;
        latSum += this.vlat[va];
        const shift = i === 0 ? 0 : Math.round((lastX - e[0]) / W2) * W2;
        for (let j = i === 0 ? 0 : 1; j < n2; j++) out.push(e[2 * j] + shift, e[2 * j + 1]);
        lastX = e[2 * (n2 - 1)] + shift;
        lastY = e[2 * (n2 - 1) + 1];
        if (i === 0) firstX = e[0];
      }
      const wraps = Math.round((lastX - firstX) / W2);
      if (wraps !== 0) {
        const yEdge = latSum > 0 ? -2 : H + 2;
        out.push(lastX, yEdge, firstX, yEdge);
      }
      return out;
    }
    /** 全区画の Path2D（初回に作り、W が変わるまで使い回す）と、陸（海でない区画）をまとめた Path2D */
    paths(isSea2) {
      if (this.cp && this.cpSea === isSea2) return this.cp;
      const N2 = this.N, cp = new Array(N2), land = new Path2D();
      for (let c = 0; c < N2; c++) {
        const p = new Path2D(), pts = this.ring(c);
        this.addPoly(p, pts, true);
        cp[c] = p;
        if (!isSea2[c]) this.addPoly(land, pts, true);
      }
      this.cp = cp;
      this.cpSea = isSea2;
      this.land = land;
      return cp;
    }
    /** 隣接スロット k の辺を path に加える（c 側から見た向き） */
    addSlot(path, k) {
      const v = this.slotVerts;
      if (v[2 * k] < 0 || v[2 * k + 1] < 0) return;
      this.addPoly(path, this.edge(v[2 * k], v[2 * k + 1]), false);
    }
    /** 条件 pred(c, n) を満たす隣接ペア（c の側から見る）の境界線を 1 つの Path2D にまとめる。cells: 見る区画（省略で全部） */
    edgesWhere(pred, cells) {
      const m = this.mesh, off = m.neighborOffsets, nb = m.neighborIds, p = new Path2D(), it = cells ?? { [Symbol.iterator]: function* () {
        for (let c = 0; c < m.cellCount; c++) yield c;
      } };
      for (const c of it) for (let k = off[c]; k < off[c + 1]; k++) if (pred(c, nb[k])) this.addSlot(p, k);
      return p;
    }
  };
  function hillshade(geo, elevation, isSea2) {
    const m = geo.mesh, N2 = geo.N, off = m.neighborOffsets, nb = m.neighborIds, cen = geo.cen, sh = new Float32Array(N2), spacing = Math.sqrt(4 * Math.PI / N2);
    const Lx = -0.52, Ly = 0.52, Lz = 0.68;
    for (let c = 0; c < N2; c++) {
      if (isSea2[c]) continue;
      const e = elevation[c], cl = Math.cos(cen[2 * c + 1]);
      let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
      for (let k = off[c]; k < off[c + 1]; k++) {
        const j = nb[k];
        let dl = cen[2 * j] - cen[2 * c];
        if (dl > Math.PI) dl -= TAU2;
        else if (dl < -Math.PI) dl += TAU2;
        const dx = dl * cl / spacing, dy = (cen[2 * j + 1] - cen[2 * c + 1]) / spacing, dz = ((isSea2[j] ? Math.min(0, elevation[j]) * 0.3 : elevation[j]) - e) / 1e3;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
        sxz += dx * dz;
        syz += dy * dz;
      }
      const det = sxx * syy - sxy * sxy || 1, gx = (sxz * syy - syz * sxy) / det, gy = (syz * sxx - sxz * sxy) / det, nx = -gx * 1.25, ny = -gy * 1.25, len = Math.hypot(nx, ny, 1);
      sh[c] = clamp17((nx * Lx + ny * Ly + Lz) / len - Lz, -1, 1);
    }
    const out = new Float32Array(N2);
    for (let c = 0; c < N2; c++) {
      if (isSea2[c]) continue;
      let s = sh[c] * 2, n2 = 2;
      for (let k = off[c]; k < off[c + 1]; k++) if (!isSea2[nb[k]]) {
        s += sh[nb[k]];
        n2++;
      }
      out[c] = s / n2;
    }
    return out;
  }
  function reliefMarks(geo, cell, isSea2) {
    const { elevation, landWater } = cell, N2 = geo.N, marks = [], cp = geo.cellPx;
    for (let c = 0; c < N2; c++) {
      if (isSea2[c] || landWater[c] === 2) continue;
      const e = elevation[c];
      if (e < 700) continue;
      const [px, py] = geo.proj(geo.cen[2 * c], geo.cen[2 * c + 1]), jx = (hash01(c, 7) - 0.5) * cp * 0.45, jy = (hash01(c, 8) - 0.5) * cp * 0.35;
      if (e >= 2200) marks.push([px + jx, py + jy, 1, cp * (0.5 + 0.28 * clamp17((e - 2200) / 3200, 0, 1))]);
      else marks.push([px + jx, py + jy, 0, cp * (0.3 + 0.16 * clamp17((e - 700) / 1500, 0, 1))]);
    }
    return marks.sort((a, b) => a[1] - b[1]);
  }
  function drawMarks(ctx, marks, k) {
    const s = 1 / Math.pow(k, 0.3);
    ctx.lineJoin = "round";
    for (const [x, y, kind, size] of marks) {
      const w = size * s;
      if (kind === 1) {
        const h2 = w * 0.95;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.55, y + h2 * 0.4);
        ctx.lineTo(x - w * 0.02, y - h2 * 0.6);
        ctx.lineTo(x + w * 0.1, y + h2 * 0.4);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,252,240,.62)";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - w * 0.02, y - h2 * 0.6);
        ctx.lineTo(x + w * 0.58, y + h2 * 0.4);
        ctx.lineTo(x + w * 0.1, y + h2 * 0.4);
        ctx.closePath();
        ctx.fillStyle = "rgba(40,34,30,.5)";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, y + w * 0.22);
        ctx.quadraticCurveTo(x, y - w * 0.46, x + w * 0.5, y + w * 0.22);
        ctx.lineWidth = Math.max(0.5, w * 0.12);
        ctx.strokeStyle = "rgba(70,56,40,.55)";
        ctx.stroke();
      }
    }
  }
  function riverPaths(geo, cell, isSea2) {
    const { riverTo, riverFlow, river, landWater } = cell;
    if (!riverTo) return [];
    const N2 = geo.N, W2 = geo.W, buckets = [new Path2D(), new Path2D(), new Path2D()], cen = geo.cen, fl = [];
    for (let c = 0; c < N2; c++) if (riverTo[c] >= 0 && landWater[c] === 1 && (river?.[c] > 0 || riverFlow?.[c] > 0)) fl.push(riverFlow?.[c] ?? 0);
    fl.sort((a, b) => a - b);
    const q2 = (p) => fl[Math.floor(fl.length * p)] ?? 0, t1 = q2(0.55), t2 = q2(0.88);
    for (let c = 0; c < N2; c++) {
      const to = riverTo[c];
      if (to < 0 || landWater[c] !== 1 || !(river?.[c] > 0 || riverFlow?.[c] > 0)) continue;
      const f2 = riverFlow?.[c] ?? 0, b = f2 >= t2 ? 2 : f2 >= t1 ? 1 : 0, [x1, y1] = geo.proj(cen[2 * c], cen[2 * c + 1]);
      let [x2, y2] = geo.proj(cen[2 * to], cen[2 * to + 1]);
      x2 += W2 * Math.round((x1 - x2) / W2);
      if (isSea2[to]) {
        x2 = (x1 + x2) / 2;
        y2 = (y1 + y2) / 2;
      }
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, r = (hash01(c, to, 3) - 0.5) * 0.7 * len, cx = mx - dy / len * r, cy = my + dx / len * r;
      for (const o of [0, W2, -W2]) {
        if (Math.max(x1, x2) + o < 0 || Math.min(x1, x2) + o > W2) continue;
        buckets[b].moveTo(x1 + o, y1);
        buckets[b].quadraticCurveTo(cx + o, cy, x2 + o, y2);
      }
    }
    return buckets;
  }
  function textureTile(createCanvas, size = 96) {
    const cv = createCanvas(size, size), ctx = cv.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = hash01(x, y, 11) * 0.6 + hash01(x >> 2, y >> 2, 12) * 0.4, i = 4 * (y * size + x), dark = v < 0.5;
      d[i] = dark ? 40 : 255;
      d[i + 1] = dark ? 34 : 250;
      d[i + 2] = dark ? 28 : 240;
      d[i + 3] = Math.round(Math.abs(v - 0.5) * 70);
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // js/ui/v6/map.js
  var TAU3 = Math.PI * 2;
  var LAYERS = [
    ["heightmap", "\u6A19\u9AD8", "ground"],
    ["biomes", "\u30D0\u30A4\u30AA\u30FC\u30E0", "ground"],
    ["temperature", "\u6C17\u6E29", "ground"],
    ["precipitation", "\u964D\u6C34", "ground"],
    ["population", "\u4EBA\u53E3", "social"],
    ["religions", "\u5B97\u6559", "social"],
    ["cultures", "\u6587\u5316", "social"],
    ["languages", "\u8A00\u8A9E", "social"],
    ["states", "\u56FD\u5BB6", "social"],
    ["relief", "\u9670\u5F71\u30FB\u5C71\u5CB3", "mark"],
    ["rivers", "\u6CB3\u5DDD", "line"],
    ["borders", "\u56FD\u5883\u7DDA", "line"],
    ["routes", "\u4EA4\u6613\u8DEF", "line"],
    ["war", "\u6226\u4E89\uFF08\u4EA4\u6226\u56FD\u306E\u7E01\uFF09", "line"],
    ["fronts", "\u6226\u7DDA\u30FB\u5360\u9818", "line"],
    ["cities", "\u90FD\u5E02", "mark"],
    ["labels", "\u56FD\u540D", "mark"],
    ["grid", "\u7D4C\u7DEF\u7DDA", "line"],
    ["cells", "\u533A\u753B\u7DDA", "line"]
  ];
  var GROUPS = [["ground", "\u5730\u5F62\u30FB\u6C17\u5019", "GROUND"], ["social", "\u793E\u4F1A", "SOCIETY"], ["mark", "\u8A18\u53F7\u30FB\u6587\u5B57", "MARK"], ["line", "\u7DDA", "LINE"]];
  var FILL_IDS = LAYERS.filter(([, , g]) => g === "ground" || g === "social").map(([id]) => id);
  var DEFAULT_LAYERS = ["states", "relief", "rivers", "borders", "cities", "labels"];
  var DEFAULT_ALPHA = { heightmap: 1, biomes: 1, temperature: 0.8, precipitation: 0.8, population: 0.85, religions: 0.66, cultures: 0.66, languages: 0.66, states: 0.66 };
  var SEA_DEEP = RAMPS.sea(5200);
  var mkCanvas = (w, h2) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h2;
    return c;
  };
  var dominant3 = (g, key) => g.cohorts?.reduce?.((b, x) => x.share > b.share ? x : b, { share: -1 })?.[key] ?? null;
  var idOf = { states: (g) => g.stateId ?? null, cultures: (g) => dominant3(g, "cultureId"), languages: (g) => dominant3(g, "languageId"), religions: (g) => dominant3(g, "religionId") };
  var MapView = class {
    constructor(canvas, w) {
      this.cv = canvas;
      this.w = w;
      this.geo = new Geo(w.world.mesh);
      this.layers = new Set(DEFAULT_LAYERS);
      this.alpha = { ...DEFAULT_ALPHA };
      this.onPick = null;
      this.sel = null;
      this.hl = null;
      this.pins = null;
      this.view = { x: 0, y: 0, k: 1 };
      this._own = null;
      this._ownAt = -1;
      this._idc = {};
      this.gc = null;
      this.rc = null;
      this.frame = null;
      this.frameView = null;
      this.T = null;
      this.wKey = 0;
      resetColors();
      canvas.addEventListener("click", (e) => {
        if (!this.moved) this.click(e);
      });
      this.pan();
      if (typeof ResizeObserver !== "undefined" && canvas.parentElement) new ResizeObserver(() => this.draw()).observe(canvas.parentElement);
    }
    /* ---------- レイヤーの操作 ---------- */
    isOn(id) {
      return this.layers.has(id);
    }
    toggle(id) {
      this.layers.has(id) ? this.layers.delete(id) : this.layers.add(id);
    }
    /** 凡例に出す層: 塗りのうち、いちばん上にあるもの（なければ陸地の凡例） */
    /* ---------- 操作（ドラッグ・ズーム）: 動かす間は画像を動かすだけ。止まったら描き直す ---------- */
    pan() {
      const cv = this.cv;
      let drag = null;
      this.moved = false;
      cv.addEventListener("pointerdown", (e) => {
        drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
        this.moved = false;
      });
      cv.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
        if (this.moved) {
          this.view.x = drag.vx + dx;
          this.view.y = drag.vy + dy;
          this.clamp();
          this.interact();
        }
      });
      const up = () => {
        drag = null;
        setTimeout(() => this.moved = false, 0);
      };
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointerleave", up);
      cv.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k0 = this.view.k, k1 = clamp17(k0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 16);
        this.view.x = mx - (mx - this.view.x) / k0 * k1;
        this.view.y = my - (my - this.view.y) / k0 * k1;
        this.view.k = k1;
        this.clamp();
        this.interact();
      }, { passive: false });
    }
    clamp() {
      const v = this.view, W2 = this.cv.width, H = this.cv.height;
      v.x = Math.min(0, Math.max(W2 - W2 * v.k, v.x));
      v.y = Math.min(0, Math.max(H - H * v.k, v.y));
    }
    interact() {
      if (!this.fastDraw()) {
        this.draw();
        return;
      }
      clearTimeout(this._it);
      this._it = setTimeout(() => this.draw(), 110);
    }
    fastDraw() {
      const ctx = this.cv.getContext("2d");
      if (!ctx || !this.frame || !this.frameView) return false;
      const v = this.view, f2 = this.frameView, r = v.k / f2.k, W2 = this.cv.width, H = this.cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = SEA_DEEP;
      ctx.fillRect(0, 0, W2, H);
      ctx.setTransform(r, 0, 0, r, v.x - f2.x * r, v.y - f2.y * r);
      ctx.drawImage(this.frame, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return true;
    }
    size() {
      const host = this.cv.parentElement, W2 = Math.max(480, Math.floor(host?.clientWidth || this.cv.getBoundingClientRect().width || 900)), H = Math.max(300, Math.floor(host?.clientHeight || W2 / 2));
      if (this.cv.width !== W2 || this.cv.height !== H) {
        this.cv.width = W2;
        this.cv.height = H;
        this.clamp();
      }
      return [W2, H];
    }
    proj(lon, lat, W2, H) {
      return [(lon + Math.PI) / TAU3 * W2, (Math.PI / 2 - lat) / Math.PI * H];
    }
    /* ---------- 世界の地形から 1 回だけ作るもの ---------- */
    terr() {
      if (this.T) return this.T;
      const ce = this.w.world.cell, N2 = this.geo.N, m = this.geo.mesh, off = m.neighborOffsets, nb = m.neighborIds, isSea2 = new Uint8Array(N2), el = ce.elevation;
      for (let c = 0; c < N2; c++) isSea2[c] = ce.landWater[c] === 0 || el[c] <= 0 ? 1 : 0;
      const smooth2 = (want) => {
        const o = new Float32Array(N2);
        for (let c = 0; c < N2; c++) {
          if (!!isSea2[c] !== want) continue;
          let s = el[c] * 2, n2 = 2;
          for (let k = off[c]; k < off[c + 1]; k++) if (!!isSea2[nb[k]] === want) {
            s += el[nb[k]];
            n2++;
          }
          o[c] = s / n2;
        }
        return o;
      };
      let seaS = smooth2(true);
      for (let i = 0; i < 3; i++) {
        const prev = seaS;
        seaS = new Float32Array(N2);
        for (let c = 0; c < N2; c++) {
          if (!isSea2[c]) continue;
          let s = prev[c] * 2, n2 = 2;
          for (let k = off[c]; k < off[c + 1]; k++) if (isSea2[nb[k]]) {
            s += prev[nb[k]];
            n2++;
          }
          seaS[c] = s / n2;
        }
      }
      this.T = { isSea: isSea2, elS: smooth2(false), seaS, shade: hillshade(this.geo, el, isSea2), col: {} };
      return this.T;
    }
    /** 画面の幅が変わったときだけ、形状まわりのキャッシュを作り直す */
    ensureGeo(W2, H) {
      const T3 = this.terr();
      if (this.wKey === W2) return;
      this.wKey = W2;
      this.geo.build(W2, H);
      this.cp = this.geo.paths(T3.isSea);
      T3.marks = reliefMarks(this.geo, this.w.world.cell, T3.isSea);
      const ce = this.w.world.cell, g = this.geo;
      T3.coast = g.edgesWhere((c, n2) => !T3.isSea[c] && T3.isSea[n2]);
      T3.lakeEdge = g.edgesWhere((c, n2) => ce.landWater[c] !== 2 && !T3.isSea[c] && ce.landWater[n2] === 2);
      T3.cellsP = null;
      T3.rivers = riverPaths(g, ce, T3.isSea);
      T3.grid = null;
      this.gc = this.rc = this.frame = null;
      this._labelsAt = -1;
      T3.tex = null;
      try {
        const t = textureTile(mkCanvas);
        T3.tex = t && this.cv.getContext("2d")?.createPattern(t, "repeat");
      } catch {
        T3.tex = null;
      }
    }
    cellColors(id) {
      const T3 = this.T, ce = this.w.world.cell, N2 = this.geo.N;
      if (T3.col[id]) return T3.col[id];
      const a = new Array(N2).fill(null);
      for (let c = 0; c < N2; c++) {
        if (T3.isSea[c]) continue;
        if (ce.landWater[c] === 2) {
          a[c] = LAKE_COLOR;
          continue;
        }
        if (id === "heightmap") a[c] = RAMPS.land(T3.elS[c]);
        else if (id === "biomes") a[c] = BIOME_COLORS[ce.biome[c]] ?? LAND_BASE;
        else if (id === "temperature") a[c] = RAMPS.temp(ce.temp[c]);
        else if (id === "precipitation") a[c] = RAMPS.precip(ce.precip[c]);
      }
      return T3.col[id] = a;
    }
    /* ---------- 所有・色 ---------- */
    owner() {
      const civ6 = this.w.civ, pv = this.w.viewPast, key = pv ?? civ6.monthIndex;
      if (this._own && this._ownAt === key) return this._own;
      const o = /* @__PURE__ */ new Map();
      if (pv != null) {
        for (const [cell, stateId] of pastView(civ6, pv).owner) o.set(cell, { cell, cells: [cell], stateId, pop: 1, cohorts: [] });
      } else for (const g of Object.values(civ6.groups)) {
        const cells = g.cells?.length ? g.cells : [g.cell];
        for (const c of cells) o.set(c, g);
      }
      this._own = o;
      this._ownAt = key;
      this._idc = {};
      this._labelsAt = -1;
      this.assign(o);
      return o;
    }
    /** id（国家・文化・言語・宗教）の色を、隣り合うものが似ないように割り当てる（決めた色は変えない） */
    assign(own) {
      const civ6 = this.w.civ, tabs2 = { states: civ6.states, cultures: civ6.cultures, languages: civ6.languages, religions: civ6.religions }, nb = this.geo.mesh;
      for (const [type, tab] of Object.entries(tabs2)) {
        const ids = Object.keys(tab ?? {}).filter((i) => !hasColor(i));
        if (!ids.length) continue;
        const adj = /* @__PURE__ */ new Map(), f2 = idOf[type], off = nb.neighborOffsets, ni = nb.neighborIds;
        for (const [c, g] of own) {
          const a = f2(g);
          if (!a) continue;
          for (let k = off[c]; k < off[c + 1]; k++) {
            const o = own.get(ni[k]), b = o && f2(o);
            if (b && b !== a) {
              let s = adj.get(a);
              if (!s) adj.set(a, s = /* @__PURE__ */ new Set());
              s.add(b);
            }
          }
        }
        assignColors(ids, adj);
      }
    }
    idColor(type, g, maxDen) {
      if (type === "population") {
        const n2 = g.cells?.length || 1, d = g.pop / n2, t = clamp17(Math.log1p(d) / Math.log1p(maxDen), 0, 1);
        return RAMPS.pop(t);
      }
      const id = idOf[type](g);
      return id ? colorOf(id) : null;
    }
    /* ---------- 描画 ---------- */
    /** layerPass: alpha が 1 未満の層は、別の紙に不透明で塗ってから重ねる（区画の継ぎ目が濃く出ないように） */
    pass(target, W2, H, alpha, paint) {
      const v = this.view;
      if (alpha >= 0.995) {
        target.lineWidth = 0.9 / v.k;
        paint(target);
        return;
      }
      this.tmp ?? (this.tmp = mkCanvas(W2, H));
      if (this.tmp.width !== W2 || this.tmp.height !== H) {
        this.tmp.width = W2;
        this.tmp.height = H;
      }
      const t = this.tmp.getContext("2d");
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(0, 0, W2, H);
      t.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      t.lineJoin = "round";
      t.lineWidth = 0.9 / v.k;
      paint(t);
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha = alpha;
      target.drawImage(this.tmp, 0, 0);
      target.restore();
    }
    paintCells(g, cells, colorAt) {
      const cp = this.cp;
      for (const c of cells) {
        const col = colorAt(c);
        if (!col) continue;
        g.fillStyle = col;
        g.strokeStyle = col;
        g.fill(cp[c]);
        g.stroke(cp[c]);
      }
    }
    /** 地形・気候（静的）: 海の深さ・海岸・陸・標高/バイオーム/気温/降水 */
    renderGround(g, W2, H) {
      const T3 = this.T, geo = this.geo, v = this.view, cp = this.cp, N2 = geo.N, cpx = geo.cellPx, seaIds = [], landIds = [];
      for (let c = 0; c < N2; c++) (T3.isSea[c] ? seaIds : landIds).push(c);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.fillStyle = SEA_DEEP;
      g.fillRect(0, 0, W2, H);
      g.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      g.lineJoin = "round";
      g.lineWidth = 0.9 / v.k;
      if (!T3.seaCol) T3.seaCol = Array.from({ length: N2 }, (_, c) => T3.isSea[c] ? RAMPS.sea(-T3.seaS[c]) : null);
      this.paintCells(g, seaIds, (c) => T3.seaCol[c]);
      g.lineCap = "round";
      for (const [w, a] of [[0.95, 0.09], [0.6, 0.12], [0.3, 0.17]]) {
        g.lineWidth = cpx * w;
        g.strokeStyle = `rgba(200,238,246,${a})`;
        g.stroke(T3.coast);
      }
      g.lineWidth = 0.9 / v.k;
      g.fillStyle = LAND_BASE;
      g.fill(geo.land);
      for (const id of ["heightmap", "biomes", "temperature", "precipitation"]) if (this.layers.has(id)) {
        const col = this.cellColors(id);
        this.pass(g, W2, H, this.alpha[id], (t) => this.paintCells(t, landIds, (c) => col[c]));
      }
      if (!T3.lakes) {
        const ce = this.w.world.cell;
        T3.lakes = landIds.filter((c) => ce.landWater[c] === 2);
      }
      this.paintCells(g, T3.lakes, () => LAKE_COLOR);
      g.strokeStyle = "rgba(24,38,52,.7)";
      g.lineWidth = Math.max(0.5, 1.1 / Math.sqrt(v.k));
      g.stroke(T3.coast);
      g.strokeStyle = "rgba(24,38,52,.45)";
      g.stroke(T3.lakeEdge);
    }
    /** 陰影・山岳・紙の模様（静的）。透明な紙に描き、塗りの上に重ねる */
    renderRelief(g, W2, H) {
      const T3 = this.T, v = this.view, cp = this.cp, N2 = this.geo.N;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W2, H);
      g.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      for (let c = 0; c < N2; c++) {
        if (T3.isSea[c]) continue;
        const s = T3.shade[c];
        if (s < -0.035) g.fillStyle = `rgba(22,18,40,${Math.min(0.28, -s * 0.8).toFixed(3)})`;
        else if (s > 0.035) g.fillStyle = `rgba(255,252,240,${Math.min(0.2, s * 0.65).toFixed(3)})`;
        else continue;
        g.fill(cp[c]);
      }
      if (T3.tex) {
        g.globalAlpha = 0.55;
        g.fillStyle = T3.tex;
        g.fill(this.geo.land);
        g.globalAlpha = 1;
      }
      drawMarks(g, T3.marks, v.k);
    }
    cached(slot, key, W2, H, fn) {
      const c = this[slot];
      if (c && c.key === key) return c.cv;
      const cv = c?.cv && c.cv.width === W2 && c.cv.height === H ? c.cv : mkCanvas(W2, H), g = cv.getContext("2d");
      fn(g, W2, H);
      this[slot] = { key, cv };
      return cv;
    }
    draw() {
      const ctx = this.cv.getContext("2d");
      if (!ctx) return;
      const [W2, H] = this.size();
      this.ensureGeo(W2, H);
      const T3 = this.T, geo = this.geo, v = this.view, civ6 = this.w.civ, own = this.owner(), cell = this.w.world.cell;
      const vk = `${W2}|${v.k.toFixed(4)}|${v.x.toFixed(1)}|${v.y.toFixed(1)}`, gsig = vk + FILL_IDS.slice(0, 4).map((i) => this.layers.has(i) ? i + this.alpha[i] : "").join(",");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W2, H);
      ctx.drawImage(this.cached("gc", gsig, W2, H, (g) => this.renderGround(g, W2, H)), 0, 0);
      ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      ctx.lineJoin = "round";
      let maxDen = 1;
      if (this.layers.has("population")) for (const g of own.values()) {
        const d = g.pop / (g.cells?.length || 1);
        if (d > maxDen) maxDen = d;
      }
      for (const [id, , grp] of LAYERS) if (grp === "social" && this.layers.has(id)) this.pass(ctx, W2, H, this.alpha[id], (t) => {
        const cp = this.cp;
        for (const [c, g] of own) {
          if (cell.landWater[c] === 2) continue;
          const col = this.idColor(id, g, maxDen);
          if (!col) continue;
          t.fillStyle = col;
          t.strokeStyle = col;
          t.fill(cp[c]);
          t.stroke(cp[c]);
        }
      });
      if (this.layers.has("relief")) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.cached("rc", vk, W2, H, (g) => this.renderRelief(g, W2, H)), 0, 0);
      }
      ctx.setTransform(v.k, 0, 0, v.k, v.x, v.y);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      this.lines(ctx, own, W2, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      this.frame ?? (this.frame = mkCanvas(W2, H));
      if (this.frame.width !== W2 || this.frame.height !== H) {
        this.frame.width = W2;
        this.frame.height = H;
      }
      const fx3 = this.frame.getContext("2d");
      fx3.setTransform(1, 0, 0, 1, 0, 0);
      fx3.clearRect(0, 0, W2, H);
      fx3.drawImage(this.cv, 0, 0);
      this.frameView = { x: v.x, y: v.y, k: v.k };
      void civ6;
      void geo;
    }
    /** 線・記号・文字（月ごとに変わるものを含む。毎回描く） */
    lines(ctx, own, W2, H) {
      const T3 = this.T, geo = this.geo, v = this.view, civ6 = this.w.civ, L = this.layers, k = v.k, sk = Math.sqrt(k), cen = geo.cen, ln = (a, b, p) => {
        const [x1, y1] = geo.proj(cen[2 * a], cen[2 * a + 1]);
        let [x2, y2] = geo.proj(cen[2 * b], cen[2 * b + 1]);
        x2 += W2 * Math.round((x1 - x2) / W2);
        p.moveTo(x1, y1);
        p.lineTo(x2, y2);
      };
      if (L.has("grid")) {
        if (!T3.grid) {
          const p = new Path2D();
          for (let lo = -150; lo <= 180; lo += 30) {
            const [x] = geo.proj(lo * Math.PI / 180, 0);
            p.moveTo(x, 0);
            p.lineTo(x, H);
          }
          for (let la = -60; la <= 60; la += 30) {
            const [, y] = geo.proj(0, la * Math.PI / 180);
            p.moveTo(0, y);
            p.lineTo(W2, y);
          }
          T3.grid = p;
        }
        ctx.strokeStyle = "rgba(255,255,255,.22)";
        ctx.lineWidth = 0.8 / k;
        ctx.setLineDash([4 / k, 4 / k]);
        ctx.stroke(T3.grid);
        ctx.setLineDash([]);
      }
      if (L.has("cells")) {
        T3.cellsP ?? (T3.cellsP = geo.edgesWhere((c, n2) => c < n2));
        ctx.strokeStyle = "rgba(20,24,30,.28)";
        ctx.lineWidth = 0.6 / k;
        ctx.stroke(T3.cellsP);
      }
      if (L.has("rivers") && T3.rivers.length) {
        ctx.strokeStyle = "#4f97d4";
        [[0, 0.5, 3], [1, 0.75, 1.4], [2, 1.15, 0]].forEach(([b, w, kmin]) => {
          if (k < kmin) return;
          ctx.lineWidth = w * geo.cellPx * 0.11 / Math.pow(k, 0.55);
          ctx.globalAlpha = 0.95;
          ctx.stroke(T3.rivers[b]);
        });
        ctx.globalAlpha = 1;
      }
      const stateOf = (c) => own.get(c)?.stateId ?? null;
      if (L.has("borders")) {
        const p = geo.edgesWhere((c, n2) => {
          const a = stateOf(c), b = stateOf(n2);
          return a && a !== b && !T3.isSea[n2] && (b ? c < n2 : true);
        }, own.keys());
        ctx.strokeStyle = "rgba(24,22,30,.45)";
        ctx.lineWidth = 3.2 / sk;
        ctx.stroke(p);
        ctx.strokeStyle = "#f6f1e2";
        ctx.lineWidth = 1.5 / sk;
        ctx.stroke(p);
      }
      if (L.has("war")) {
        const warring = /* @__PURE__ */ new Set();
        for (const id of civ6.activeWarIds) {
          const x = civ6.wars[id];
          for (const s of [...x.sides.a, ...x.sides.d]) warring.add(s);
        }
        const p = geo.edgesWhere((c, n2) => {
          const a = stateOf(c);
          return a && warring.has(a) && stateOf(n2) !== a && !T3.isSea[n2];
        }, own.keys());
        ctx.strokeStyle = "#e0463c";
        ctx.lineWidth = 2.4 / sk;
        ctx.setLineDash([5 / sk, 3 / sk]);
        ctx.stroke(p);
        ctx.setLineDash([]);
      }
      if (L.has("routes")) {
        ctx.strokeStyle = "#e8b64a";
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([6 / sk, 4 / sk]);
        const seen = /* @__PURE__ */ new Set();
        for (const s of Object.values(civ6.states)) {
          if (!s.alive) continue;
          const a = civ6.groups[s.capitalGroupId];
          for (const [oid, amt] of Object.entries(s.econ?.trade ?? {})) {
            const o = civ6.states[oid], key = s.id < oid ? s.id + oid : oid + s.id;
            if (!o?.alive || !(amt > 0) || seen.has(key)) continue;
            seen.add(key);
            const b = civ6.groups[o.capitalGroupId];
            if (!a || !b) continue;
            ctx.lineWidth = Math.min(3, 0.8 + amt * 0.02) / sk;
            const p = new Path2D();
            ln(a.cell, b.cell, p);
            ctx.stroke(p);
          }
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (L.has("fronts")) {
        ctx.strokeStyle = "#e0463c";
        for (const wid of civ6.activeWarIds ?? []) {
          const wr = civ6.wars[wid];
          for (const gid of wr?.occupied ?? []) {
            const g = civ6.groups[gid];
            if (!g) continue;
            const [x, y] = geo.proj(cen[2 * g.cell], cen[2 * g.cell + 1]), r = 3.4 / sk;
            ctx.lineWidth = 1.6 / sk;
            ctx.beginPath();
            ctx.moveTo(x - r, y - r);
            ctx.lineTo(x + r, y + r);
            ctx.moveTo(x + r, y - r);
            ctx.lineTo(x - r, y + r);
            ctx.stroke();
          }
          ctx.setLineDash([3 / sk, 3 / sk]);
          ctx.lineWidth = 1.4 / sk;
          for (const f2 of Object.values(wr?.ops?.forces ?? {})) {
            const tg = f2.target, g = civ6.groups[f2.groupId ?? f2.at];
            if (tg == null || !g || typeof tg !== "number") continue;
            const p = new Path2D();
            ln(g.cell, tg, p);
            ctx.stroke(p);
          }
          ctx.setLineDash([]);
        }
      }
      if (L.has("cities")) {
        ctx.lineWidth = 1.2 / sk;
        for (const s of Object.values(civ6.settlements)) {
          if (s.pop < 800) continue;
          const [x, y] = geo.proj(cen[2 * s.cell], cen[2 * s.cell + 1]), big = s.stage === "city", r = (big ? 3.4 : 2.1) / sk;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU3);
          ctx.fillStyle = "#fff4cf";
          ctx.fill();
          ctx.strokeStyle = "#2a2018";
          ctx.stroke();
          if (big) {
            ctx.beginPath();
            ctx.arc(x, y, r * 0.38, 0, TAU3);
            ctx.fillStyle = "#2a2018";
            ctx.fill();
          }
        }
      }
      if (this.sel) {
        const p = geo.edgesWhere((c, n2) => stateOf(n2) !== this.sel, [...own].filter(([, g]) => g.stateId === this.sel).map(([c]) => c));
        ctx.strokeStyle = "rgba(20,16,8,.6)";
        ctx.lineWidth = 4.2 / sk;
        ctx.stroke(p);
        ctx.strokeStyle = "#f0c14d";
        ctx.lineWidth = 2.4 / sk;
        ctx.stroke(p);
      }
      if (this.hl) {
        const h2 = this.hl, inSet = h2.type === "war" ? (() => {
          const x = civ6.wars[h2.id], ss = new Set(x ? [...x.sides.a, ...x.sides.d] : []);
          return (g) => ss.has(g.stateId);
        })() : (g) => idOf[h2.type]?.(g) === h2.id;
        const mine = [...own].filter(([, g]) => inSet(g)).map(([c]) => c), set = new Set(mine);
        if (mine.length) {
          const p = geo.edgesWhere((c, n2) => !set.has(n2), mine);
          ctx.strokeStyle = "rgba(60,0,0,.65)";
          ctx.lineWidth = 5 / sk;
          ctx.stroke(p);
          ctx.strokeStyle = "#ff3b30";
          ctx.lineWidth = 2.8 / sk;
          ctx.stroke(p);
        }
      }
      if (this.pins) for (const pin of this.pins) {
        const [x, y] = geo.proj(cen[2 * pin.cell], cen[2 * pin.cell + 1]), r = (pin.big ? 7 : 4.2) / sk;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU3);
        ctx.fillStyle = pin.color ?? "#f0c14d";
        ctx.globalAlpha = pin.big ? 1 : 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.4 / sk;
        ctx.strokeStyle = "#10141a";
        ctx.stroke();
        if (pin.big) {
          ctx.beginPath();
          ctx.arc(x, y, r * 1.9, 0, TAU3);
          ctx.strokeStyle = "#ff3b30";
          ctx.lineWidth = 2 / sk;
          ctx.stroke();
        }
      }
      if (L.has("labels")) this.drawLabels(ctx, own, W2);
    }
    drawLabels(ctx, own, W2) {
      const geo = this.geo, civ6 = this.w.civ, k = this.view.k;
      if (this._labelsAt !== this._ownAt || this._labelsW !== W2) {
        const m = /* @__PURE__ */ new Map();
        for (const [c, g] of own) {
          const id = g.stateId;
          if (!id) continue;
          const [x, y] = geo.proj(geo.cen[2 * c], geo.cen[2 * c + 1]);
          let e = m.get(id);
          if (!e) m.set(id, e = { x0: x, sx: 0, sy: 0, n: 0 });
          let dx = x - e.x0;
          dx -= W2 * Math.round(dx / W2);
          e.sx += dx;
          e.sy += y;
          e.n++;
        }
        this._labels = [...m].map(([id, e]) => {
          const st2 = civ6.states[id];
          return { id, x: e.x0 + e.sx / e.n, y: e.sy / e.n, n: e.n, power: (st2?.pop ?? 0) + 4 * (st2?.army ?? 0) };
        }).sort((a, b) => b.power - a.power || b.n - a.n);
        this._labelsAt = this._ownAt;
        this._labelsW = W2;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      let shown = 0, rank = 0;
      for (const e of this._labels) {
        const name = civ6.states[e.id]?.name, mineId = civ6.wcde?.control?.stateId;
        if (!name || e.id !== mineId && (rank >= Math.min(90, Math.round(7 * Math.pow(k, 1.7))) || e.n < 2 && k < 3)) {
          rank++;
          continue;
        }
        rank++;
        shown++;
        const big = Math.max(0.35, 1 - rank / 40), fs = clamp17((8 + 2.6 * Math.sqrt(e.n)) * (0.8 + 0.4 * big), 9, 30) / Math.pow(k, 0.55);
        ctx.font = `600 ${fs}px "Shippori Mincho","Noto Serif JP","Yu Mincho",serif`;
        ctx.lineWidth = fs * 0.24;
        ctx.strokeStyle = "rgba(16,18,24,.78)";
        ctx.fillStyle = "#f7f2e4";
        for (const o of [0, W2, -W2]) {
          if (e.x + o < -40 || e.x + o > W2 + 40) continue;
          ctx.strokeText(name, e.x + o, e.y);
          ctx.fillText(name, e.x + o, e.y);
        }
      }
    }
    click(e) {
      const r = this.cv.getBoundingClientRect(), v = this.view, x = ((e.clientX - r.left) * (this.cv.width / r.width) - v.x) / v.k, y = ((e.clientY - r.top) * (this.cv.height / r.height) - v.y) / v.k, W2 = this.cv.width, H = this.cv.height, lon = x / W2 * TAU3 - Math.PI, lat = Math.PI / 2 - y / H * Math.PI;
      let best = -1, bd = 9;
      for (let c = 0; c < this.geo.N; c++) {
        let dl = Math.abs(this.geo.cen[c * 2] - lon);
        if (dl > Math.PI) dl = TAU3 - dl;
        const d = dl * Math.cos(lat) + Math.abs(this.geo.cen[c * 2 + 1] - lat);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      const g = this.owner().get(best), st2 = Object.values(this.w.civ.settlements).find((s) => s.cell === best);
      this.onPick?.({ cell: best, stateId: g?.stateId ?? null, group: g ?? null, settlement: st2 ?? null, x: e.clientX - r.left, y: e.clientY - r.top });
    }
  };

  // js/ui/v6/wizard.js
  var STEPS = { player: ["name", "regime", "offices", "leader", "capital", "tech", "confirm"], creator: ["name", "regime", "offices", "leader", "capital", "tech", "confirm"], rebel: ["name", "regime", "offices", "leader", "tech", "confirm"], reform: ["regime", "offices", "leader", "confirm"] };
  var STEP_JA = { name: "\u56FD\u540D", regime: "\u653F\u4F53", offices: "\u5F79\u8077", leader: "\u70BA\u653F\u8005", capital: "\u9996\u90FD", tech: "\u6280\u8853\u30FB\u8ECD\u4E8B", confirm: "\u78BA\u8A8D" };
  var LOOKS2 = 12;
  function openWizard(opts) {
    const { mode } = opts, w = S2.w, civ6 = w.civ, steps = STEPS[mode], D2 = { name: "", regime: null, offices: [], leader: { name: "", look: 0 }, capital: null, techs: [], doctrine: null, asState: true };
    let i = 0, msg = "", map = null, capInfo = null;
    const root2 = h("div", { class: "wiz" }), body = h("div", { class: "wizbody" }), foot = h("div", { class: "wizfoot" }), head2 = h("div", { class: "wizhead" });
    root2.append(head2, body, foot);
    (opts.host ?? document.body).append(root2);
    const close = () => {
      try {
        map?.destroy?.();
      } catch {
      }
      root2.remove();
    };
    const rb = opts.rebel, rf = opts.reform, center = rb ? civ6.groups[rb.plan.center.groupId] : null;
    const gateGroup = () => rb ? center : rf ? civ6.groups[civ6.states[rf.stateId].capitalGroupId] : null;
    const sites = mode === "player" || mode === "creator" ? capitalSites(w, null, 400) : [];
    const worldGate = (id) => {
      const r = sites.slice(0, 80).map((s) => regimeGate(civ6, civ6.groups[s.groupId], id));
      return r.some((x) => !x) ? null : r[0] ?? "\u6761\u4EF6\u3092\u6E80\u305F\u3059\u90FD\u5E02\u304C\u306A\u3044";
    };
    const gate = (id) => gateGroup() ? regimeGate(civ6, gateGroup(), id) : worldGate(id);
    const nameGen2 = S2.w.sim.ctx.nameGen, sample = () => gateGroup() ?? civ6.groups[sites[Math.floor(Math.random() * Math.min(20, sites.length || 1))]?.groupId] ?? Object.values(civ6.groups)[0];
    const suggestState = () => {
      const g = sample(), r = () => Math.random(), out = [];
      for (let k = 0; k < 8; k++) {
        try {
          const p = nameGen2?.stateParts?.(civ6, g, "city_state", r, D2.regime ? REGIMES[D2.regime].core : "chiefdom");
          if (p?.name) out.push(p.name);
        } catch {
        }
      }
      return [...new Set(out)].slice(0, 6);
    };
    const suggestPerson = () => {
      const g = sample(), r = () => Math.random(), out = [];
      for (let k = 0; k < 8; k++) {
        try {
          const n2 = nameGen2?.person?.(civ6, g, r);
          if (n2) out.push(n2);
        } catch {
        }
      }
      return [...new Set(out)].slice(0, 6);
    };
    const chips = (arr, on) => h("div", { class: "wchips" }, ...arr.map((t) => h("button", { class: "b", onclick: () => on(t) }, t)));
    const stepName = () => {
      const inp = h("input", { id: "wz-name", value: D2.name, maxlength: 30, placeholder: "\u4F8B: \u30F4\u30A1\u30EB\u30C6\u30EA\u30A2\u738B\u56FD", oninput: (e) => {
        D2.name = e.target.value;
        renderFoot();
      } }), sug = h("div", {});
      return h("div", {}, h("p", { class: "n" }, "\u3053\u308C\u304B\u3089\u5EFA\u3066\u308B\u56FD\u306E\u540D\u524D\u3092\u6C7A\u3081\u307E\u3059\u3002"), inp, h("div", { class: "rowb" }, btn("\u540D\u524D\u306E\u5019\u88DC\u3092\u51FA\u3059", () => sug.replaceChildren(chips(suggestState(), (t) => {
        D2.name = t;
        inp.value = t;
        renderFoot();
      })), "", { id: "wz-sug" })), sug);
    };
    const stepRegime = () => h("div", {}, h("p", { class: "n" }, mode === "reform" ? "\u9769\u547D\u304C\u6210\u529F\u3057\u305F\u3042\u3068\u306E\u4F53\u5236\u3092\u9078\u3073\u307E\u3059\u3002" : "\u653F\u4F53\u3092\u9078\u3073\u307E\u3059\u3002\u6280\u8853\u304C\u8DB3\u308A\u306A\u3044\u653F\u4F53\u306F\u3001\u7406\u7531\u3064\u304D\u3067\u9078\u3079\u307E\u305B\u3093\u3002"), h("div", { class: "wgrid" }, ...REGIME_IDS.map((id) => {
      const r = REGIMES[id], why2 = gate(id), on = D2.regime === id;
      return h("button", { class: "wcard" + (on ? " on" : "") + (why2 ? " off" : ""), "data-regime": id, disabled: !!why2, title: why2 ?? "", onclick: () => {
        D2.regime = id;
        D2.offices = defaultOffices(id);
        render2();
      } }, h("b", {}, r.ja), h("small", {}, r.blurb), h("small", { class: "dim" }, `\u5143\u9996: ${officeJa(r.ruler)}${r.heredity ? "\u30FB\u4E16\u8972" : ""}`), why2 ? h("small", { class: "why" }, why2) : null);
    })));
    const stepOffices = () => {
      const r = REGIMES[D2.regime], set = new Set(D2.offices);
      return h("div", {}, h("p", { class: "n" }, `\u8A2D\u7F6E\u3059\u308B\u5F79\u8077\u3092\u9078\u3073\u307E\u3059\uFF08${MIN_OFFICES}\u301C${MAX_OFFICES}\u3002\u5143\u9996\u306F\u5916\u305B\u307E\u305B\u3093\uFF09\u3002\u3042\u3068\u304B\u3089\u3044\u3064\u3067\u3082\u5909\u3048\u3089\u308C\u307E\u3059\u3002`), h("div", { class: "wgrid o" }, ...r.offices.map((id) => {
        const dom = OFFICE_DOMAIN_JA[OFFICES[id]?.[1]] ?? "", ruler = id === r.ruler, on = set.has(id);
        return h("button", { class: "wcard" + (on ? " on" : ""), "data-office": id, disabled: ruler, onclick: () => {
          on ? set.delete(id) : set.add(id);
          D2.offices = r.offices.filter((x) => set.has(x));
          render2();
        } }, h("b", {}, officeJa(id) + (ruler ? "\uFF08\u5143\u9996\uFF09" : "")), h("small", { class: "dim" }, dom));
      })), h("p", { class: "n" }, `\u9078\u629E\u4E2D ${D2.offices.length} \u4EF6`));
    };
    const stepLeader = () => {
      const inp = h("input", { id: "wz-leader", value: D2.leader.name, maxlength: 30, placeholder: "\u70BA\u653F\u8005\u306E\u540D\u524D", oninput: (e) => {
        D2.leader.name = e.target.value;
        renderFoot();
      } }), sugL = h("div", {});
      return h("div", {}, h("p", { class: "n" }, `${officeJa(REGIMES[D2.regime].ruler)}\u3068\u306A\u308B\u4EBA\u7269\u306E\u540D\u524D\u3068\u9854\u3092\u6C7A\u3081\u307E\u3059\u3002`), inp, h("div", { class: "rowb" }, btn("\u540D\u524D\u306E\u5019\u88DC\u3092\u51FA\u3059", () => sugL.replaceChildren(chips(suggestPerson(), (t) => {
        D2.leader.name = t;
        inp.value = t;
        renderFoot();
      })), "", { id: "wz-lsug" })), sugL, h("div", { class: "wfaces" }, ...Array.from({ length: LOOKS2 }, (_, k) => h("button", { class: "wface" + (D2.leader.look === k ? " on" : ""), "data-look": k, onclick: () => {
        D2.leader.look = k;
        render2();
      } }, face(D2.leader.name || "\u2014", "new", k)))));
    };
    const refreshCap = () => {
      if (!D2.capital) {
        capInfo = null;
        return;
      }
      const p = planCapital(w, D2.capital);
      if (!p.ok) {
        capInfo = { error: p.error };
        return;
      }
      const gid = p.groupId ?? p.parentId, g = civ6.groups[gid], realm = planRealm(w, gid), why2 = D2.regime ? regimeGate(civ6, g, D2.regime) : null;
      const dom = g.cohorts.reduce((b, c) => c.share > b.share ? c : b);
      capInfo = { kind: p.kind, pop: p.pop, realm, gid, why: why2, culture: civ6.cultures[dom.cultureId]?.name, religion: civ6.religions[dom.religionId]?.name };
    };
    const stepCapital = () => {
      const host = h("div", { class: "wizmap" }), cv = h("canvas", { id: "wz-map" });
      host.append(cv);
      const info = h("div", { class: "wcap", id: "wz-cap" });
      const paint = () => {
        if (!capInfo) info.replaceChildren(h("p", { class: "n" }, "\u5730\u56F3\u306E\u9EC4\u8272\u3044\u70B9\uFF08\u56FD\u5BB6\u306E\u306A\u3044\u90FD\u5E02\uFF09\u304B\u3001\u307B\u304B\u306E\u9678\u5730\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u3001\u9996\u90FD\u3092\u9078\u3073\u307E\u3059\u3002\u56FD\u5BB6\u306E\u9818\u571F\u306F\u9078\u3079\u307E\u305B\u3093\u3002"));
        else if (capInfo.error) info.replaceChildren(h("p", { class: "n err" }, capInfo.error));
        else info.replaceChildren(h("b", {}, capInfo.kind === "existing" ? "\u56FD\u5BB6\u306E\u306A\u3044\u90FD\u5E02\u3092\u9996\u90FD\u306B\u3057\u307E\u3059" : capInfo.kind === "settle" ? "\u3053\u3053\u306B\u65B0\u3057\u304F\u90FD\u5E02\u3092\u7BC9\u3044\u3066\u9996\u90FD\u306B\u3057\u307E\u3059" : "\u4EBA\u304C\u79FB\u308A\u4F4F\u307F\u3001\u65B0\u3057\u3044\u90FD\u5E02\u3092\u5EFA\u3066\u3066\u9996\u90FD\u306B\u3057\u307E\u3059"), h("div", { class: "n" }, `\u9996\u90FD\u306E\u4EBA\u53E3 ${n0(capInfo.pop)}\u30FB\u9818\u57DF ${capInfo.realm.groupIds.length} \u304B\u6240\uFF08\u7D04 ${n0(capInfo.realm.pop)} \u4EBA\u3002WCDE \u304C\u6C7A\u3081\u307E\u3059\uFF09`), h("div", { class: "n" }, [capInfo.culture && `\u6587\u5316 ${capInfo.culture}`, capInfo.religion && `\u5B97\u6559 ${capInfo.religion}`].filter(Boolean).join("\u30FB")), capInfo.why ? h("p", { class: "n err" }, `\u3053\u306E\u9996\u90FD\u3067\u306F\u300C${REGIMES[D2.regime].ja}\u300D\u3092\u9078\u3079\u307E\u305B\u3093: ${capInfo.why}`) : null);
      };
      queueMicrotask(() => {
        map = new MapView(cv, w);
        map.layers = /* @__PURE__ */ new Set(["states", "relief", "rivers", "borders", "cities"]);
        const pins = () => {
          map.pins = [...sites.filter((s) => !D2.regime || !regimeGate(civ6, civ6.groups[s.groupId], D2.regime)).map((s) => ({ cell: s.cell, color: "#f0c14d" })), ...D2.capital && capInfo && !capInfo.error ? [{ cell: capCell2(), big: true, color: "#ff8a5c" }] : []];
        };
        const capCell2 = () => {
          const p = planCapital(w, D2.capital);
          return p.cell;
        };
        map.onPick = (p) => {
          const free2 = p.settlement && civ6.groups[p.settlement.groupId] && !civ6.groups[p.settlement.groupId].stateId;
          D2.capital = free2 ? { groupId: p.settlement.groupId } : { cell: p.cell };
          refreshCap();
          pins();
          paint();
          map.draw();
          renderFoot();
        };
        pins();
        map.draw();
        if (D2.capital) {
          refreshCap();
          pins();
          paint();
          map.draw();
        }
      });
      paint();
      return h("div", {}, h("p", { class: "n" }, "\u9996\u90FD\u3092\u9078\u3073\u307E\u3059\u3002\u9818\u57DF\u306F\u9996\u90FD\u306E\u5468\u308A\u304B\u3089 WCDE \u304C\u6C7A\u3081\u307E\u3059\u3002"), host, info);
    };
    const stepTech2 = () => {
      const gs = rb ? rb.plan.regionGroupIds : capInfo && !capInfo.error ? capInfo.realm.groupIds : [], tc = techChoices(w, gs), dc = doctrineChoices(w, D2.techs), set = new Set(D2.techs);
      return h(
        "div",
        {},
        h("p", { class: "n" }, "\u5EFA\u56FD\u306E\u3068\u304D\u3001\u9818\u57DF\u304C\u5341\u5206\u306B\u77E5\u3063\u3066\u3044\u308B\u6280\u8853\u304B\u3089\u6700\u5927 3 \u3064\u3068\u3001\u8ECD\u4E8B\u30C9\u30AF\u30C8\u30EA\u30F3\u3092 1 \u3064\u9078\u3079\u307E\u3059\uFF08\u9078\u3070\u306A\u304F\u3066\u3082\u69CB\u3044\u307E\u305B\u3093\uFF09\u3002"),
        h("div", { class: "wgrid o" }, ...tc.map((t) => h("button", { class: "wcard" + (set.has(t.key) ? " on" : ""), "data-tech": t.key, onclick: () => {
          set.has(t.key) ? set.delete(t.key) : set.size < 3 && set.add(t.key);
          D2.techs = [...set];
          if (D2.doctrine && !doctrineChoices(w, D2.techs).some((d) => d.id === D2.doctrine)) D2.doctrine = null;
          render2();
        } }, h("b", {}, t.name), h("small", { class: "dim" }, t.field)))),
        h("div", { class: "lb" }, "\u8ECD\u4E8B\u30C9\u30AF\u30C8\u30EA\u30F3"),
        h("div", { class: "wgrid o" }, h("button", { class: "wcard" + (D2.doctrine == null ? " on" : ""), onclick: () => {
          D2.doctrine = null;
          render2();
        } }, h("b", {}, "\u9078\u3070\u306A\u3044")), ...dc.map((d) => h("button", { class: "wcard" + (D2.doctrine === d.id ? " on" : ""), "data-doc": d.id, onclick: () => {
          D2.doctrine = d.id;
          render2();
        } }, h("b", {}, d.ja))))
      );
    };
    const spec = () => ({ name: D2.name.trim(), regime: D2.regime, offices: D2.offices, leader: { name: D2.leader.name.trim(), look: D2.leader.look }, techs: D2.techs, doctrine: D2.doctrine });
    const stepConfirm = () => {
      const r = REGIMES[D2.regime], tk = D2.techs.length ? D2.techs.join("\u30FB") : "\u306A\u3057";
      return h("div", {}, h("div", { class: "wsum" }, face(D2.leader.name, "new", D2.leader.look), h("div", {}, mode !== "reform" ? h("h2", {}, D2.name) : null, h("div", { class: "n" }, `${r.ja}\u30FB${officeJa(r.ruler)} ${D2.leader.name}`), h("div", { class: "n" }, `\u5F79\u8077: ${D2.offices.map(officeJa).join("\u30FB")}`), mode === "player" || mode === "creator" ? h("div", { class: "n" }, `\u9996\u90FD: ${capInfo?.kind === "existing" ? "\u56FD\u5BB6\u306E\u306A\u3044\u90FD\u5E02" : "\u65B0\u3057\u3044\u90FD\u5E02"}\u30FB\u9818\u57DF ${capInfo?.realm.groupIds.length} \u304B\u6240`) : null, mode === "rebel" ? h("div", { class: "n" }, `\u9996\u90FD: \u53CD\u4E71\u306E\u4E2D\u5FC3\u5730\u30FB\u9818\u57DF ${rb.plan.regionGroupIds.length} \u304B\u6240`) : null, mode !== "reform" ? h("div", { class: "n" }, `\u6280\u8853: ${tk}\u30FB\u30C9\u30AF\u30C8\u30EA\u30F3: ${D2.doctrine ?? "\u306A\u3057"}`) : null)), msg ? h("p", { class: "n err", id: "wz-err" }, msg) : null);
    };
    const body$ = { name: stepName, regime: stepRegime, offices: stepOffices, leader: stepLeader, capital: stepCapital, tech: stepTech2, confirm: stepConfirm };
    const valid = (k) => k === "name" ? D2.name.trim().length > 0 : k === "regime" ? !!D2.regime : k === "offices" ? D2.offices.length >= MIN_OFFICES : k === "leader" ? D2.leader.name.trim().length > 0 : k === "capital" ? !!capInfo && !capInfo.error && !capInfo.why : true;
    const submit = () => {
      let r;
      if (mode === "player") r = act({ type: "founding.found", ...spec(), capital: D2.capital });
      else if (mode === "creator") r = creator({ type: "creator.found", ...spec(), capital: D2.capital });
      else if (mode === "rebel") r = act({ type: "uprising.start", stateId: rb.stateId, kind: rb.kind, cell: rb.cell, asState: true, found: spec() });
      else r = act({ type: "uprising.start", stateId: rf.stateId, kind: rf.kind, cell: rf.cell, reform: { regime: D2.regime, offices: D2.offices, leader: spec().leader } });
      const res = r.result ?? r;
      if (!r.ok || res.ok === false) {
        msg = res.error ?? r.error ?? "\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F";
        render2();
        return;
      }
      close();
      opts.onDone?.(res);
    };
    function renderFoot() {
      const k = steps[i], last = i === steps.length - 1;
      foot.replaceChildren(btn("\u3084\u3081\u308B", () => {
        close();
        opts.onCancel?.();
      }, "", { id: "wz-cancel" }), h("span", { style: "flex:1" }), i > 0 ? btn("\u623B\u308B", () => {
        i--;
        msg = "";
        render2();
      }, "", { id: "wz-back" }) : null, last ? btn(mode === "player" || mode === "creator" ? "\u5EFA\u56FD\u3059\u308B" : mode === "reform" ? "\u6C7A\u884C\u3059\u308B" : "\u53CD\u4E71\u3092\u8D77\u3053\u3059", submit, "p", { id: "wz-go" }) : btn("\u6B21\u3078", () => {
        if (steps[i] === "capital") {
          refreshCap();
        }
        i++;
        msg = "";
        render2();
      }, "p", { id: "wz-next", disabled: !valid(k) }));
    }
    function render2() {
      const k = steps[i];
      try {
        map?.destroy?.();
      } catch {
      }
      if (k !== "capital") map = null;
      head2.replaceChildren(h("div", { class: "code" }, mode === "player" ? "FOUNDING" : mode === "creator" ? "CREATE A NATION" : mode === "rebel" ? "UPRISING" : "NEW ORDER"), h("h1", {}, mode === "player" ? "\u5EFA\u56FD" : mode === "creator" ? "\u56FD\u5BB6\u3092\u3064\u304F\u308B" : mode === "rebel" ? `${rb.plan.kindJa}\u3067\u56FD\u3092\u3064\u304F\u308B` : "\u9769\u547D\u5F8C\u306E\u4F53\u5236"), h("div", { class: "wsteps" }, ...steps.map((s, j) => h("span", { class: j === i ? "on" : j < i ? "done" : "" }, STEP_JA[s]))));
      body.replaceChildren(body$[k]());
      renderFoot();
    }
    root2._test = { pick: (p) => map?.onPick?.(p), D: D2 };
    render2();
    return { close };
  }

  // js/ui/v6/scenes.js
  var SCENE_COUNT = 1e3;
  var SCENE_KINDS = Object.freeze(["\u5C71\u306E\u591C\u660E\u3051", "\u68DA\u7530\u3068\u8FB2\u8015", "\u7802\u6F20\u306E\u968A\u5546", "\u6D77\u3068\u5E06\u8239", "\u6DF1\u3044\u68EE", "\u8349\u539F\u306E\u9A0E\u99AC", "\u57CE\u5E02\u306E\u9060\u666F", "\u6226\u91CE\u306E\u65D7", "\u96EA\u5DBA\u3068\u661F", "\u5927\u6CB3\u306E\u307B\u3068\u308A"]);
  var PALETTES = [
    { n: "\u6681", sky: ["#2b2f4a", "#e0905a"], sun: "#ffd89a", far: "#59486a", mid: "#38384f", near: "#1a1c28" },
    { n: "\u5915", sky: ["#3a2342", "#f06a4a"], sun: "#ffb27a", far: "#6a3a52", mid: "#3e2638", near: "#1b1220" },
    { n: "\u663C", sky: ["#4a86b8", "#cfe4ee"], sun: "#fff6d0", far: "#6f8fa8", mid: "#4d6b5e", near: "#27382f" },
    { n: "\u591C", sky: ["#070b1c", "#27345e"], sun: "#e8eaff", far: "#1d2848", mid: "#131b34", near: "#0a0e1c" },
    { n: "\u5D50", sky: ["#2a3038", "#6d7480"], sun: "#a9afb8", far: "#4a525d", mid: "#363c46", near: "#1a1e25" },
    { n: "\u79CB", sky: ["#5a3a2a", "#e8b060"], sun: "#ffe0a0", far: "#8a5a38", mid: "#5a3a26", near: "#2a1a12" },
    { n: "\u53E4", sky: ["#4a4030", "#d8c690"], sun: "#fff0c0", far: "#8a7a58", mid: "#5e5238", near: "#2a2418" },
    { n: "\u7FE0", sky: ["#12384a", "#9ad0b4"], sun: "#f0ffd8", far: "#3a7a6a", mid: "#245a4e", near: "#0f2a26" },
    { n: "\u7D05", sky: ["#3a1a2a", "#e0788a"], sun: "#ffd0d0", far: "#7a3a54", mid: "#4a2038", near: "#1e0e1a" },
    { n: "\u92FC", sky: ["#1c2634", "#8aa0b8"], sun: "#e8f0ff", far: "#4a6078", mid: "#2e3e52", near: "#141c28" }
  ];
  var rngOf2 = (seed) => {
    let a = seed * 2654435761 + 1013904223 >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  var f = (x) => Math.round(x * 10) / 10;
  function ridge(r, base, amp, steps = 14, smooth2 = true) {
    const pts = [];
    for (let i = 0; i <= steps; i++) pts.push([1600 / steps * i, base - r() * amp]);
    let d = `M0,900 L${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) {
      if (smooth2) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
        d += ` Q${f(x0 + 40)},${f(y0)} ${f(mx)},${f((y0 + y1) / 2)} T${f(x1)},${f(y1)}`;
      } else d += ` L${f(pts[i][0])},${f(pts[i][1])}`;
    }
    return d + " L1600,900 Z";
  }
  var tri = (x, y, w, h2) => `M${f(x - w / 2)},${f(y)} L${f(x)},${f(y - h2)} L${f(x + w / 2)},${f(y)} Z`;
  var person = (x, y, s, mounted) => mounted ? `M${f(x - 7 * s)},${f(y)} h${f(14 * s)} l${f(3 * s)},${f(-8 * s)} h${f(-20 * s)} Z M${f(x - 2 * s)},${f(y - 8 * s)} v${f(-9 * s)} h${f(4 * s)} v${f(9 * s)} Z M${f(x + 6 * s)},${f(y - 9 * s)} l${f(6 * s)},${f(-6 * s)} l${f(2 * s)},${f(2 * s)} l${f(-5 * s)},${f(7 * s)} Z` : `M${f(x - 2 * s)},${f(y)} v${f(-12 * s)} h${f(4 * s)} v${f(12 * s)} Z M${f(x)},${f(y - 15 * s)} m${f(-2.5 * s)},0 a${f(2.5 * s)},${f(2.5 * s)} 0 1 0 ${f(5 * s)},0 a${f(2.5 * s)},${f(2.5 * s)} 0 1 0 ${f(-5 * s)},0`;
  function sceneSvg(seed) {
    const s = (seed % SCENE_COUNT + SCENE_COUNT) % SCENE_COUNT, kind = s % 10, pal = PALETTES[Math.floor(s / 10) % 10], v = Math.floor(s / 100), r = rngOf2(s + 1);
    const sunX = 200 + r() * 1200, sunY = kind === 8 || pal.n === "\u591C" ? 150 + r() * 120 : 250 + r() * 150 + v * 8, sunR = 40 + r() * 50 + (kind === 2 ? 40 : 0);
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" data-scene="${s}"><defs><linearGradient id="g${s}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.sky[0]}"/><stop offset="1" stop-color="${pal.sky[1]}"/></linearGradient><radialGradient id="s${s}"><stop offset="0" stop-color="${pal.sun}" stop-opacity=".95"/><stop offset="1" stop-color="${pal.sun}" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g${s})"/>`;
    if (pal.n === "\u591C" || kind === 8) for (let i = 0; i < 70 + v * 6; i++) o += `<circle cx="${f(r() * 1600)}" cy="${f(r() * 480)}" r="${f(0.6 + r() * 1.4)}" fill="#fff" opacity="${f(0.3 + r() * 0.7)}"/>`;
    o += `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR * 3.4)}" fill="url(#s${s})"/><circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR)}" fill="${pal.sun}"/>`;
    for (let i = 0; i < 3 + v % 4; i++) {
      const cx = r() * 1600, cy = 90 + r() * 260, w = 120 + r() * 260;
      o += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(w)}" ry="${f(10 + r() * 16)}" fill="#fff" opacity="${f(0.05 + r() * 0.1)}"/>`;
    }
    const L = (d, col, op = 1) => `<path d="${d}" fill="${col}" opacity="${op}"/>`;
    switch (kind) {
      case 0:
        o += L(ridge(r, 560, 240, 9, false), pal.far, 0.9) + L(ridge(r, 640, 200, 11, false), pal.mid) + L(ridge(r, 760, 120, 13), pal.near);
        break;
      case 1: {
        o += L(ridge(r, 600, 140, 8), pal.far, 0.85);
        for (let i = 0; i < 7; i++) {
          const y = 600 + i * 46, amp = 18 + r() * 26, ph = r() * 6;
          let d = `M0,900 L0,${f(y)}`;
          for (let x = 0; x <= 1600; x += 80) d += ` L${x},${f(y + Math.sin(x / 190 + ph) * amp)}`;
          d += " L1600,900 Z";
          o += L(d, i % 2 ? pal.mid : pal.near, 0.95);
          o += `<path d="${d.replace(/ L1600,900 Z$/, "").replace(/^M0,900 L/, "M")}" fill="none" stroke="${pal.sun}" stroke-opacity=".18" stroke-width="2"/>`;
        }
        for (let i = 0; i < 2 + v % 3; i++) {
          const x = 150 + r() * 1300, y = 640 + r() * 140;
          o += `<path d="M${f(x - 22)},${f(y)} h44 v-18 l-22,-16 l-22,16 Z" fill="${pal.near}"/>`;
        }
        break;
      }
      case 2: {
        for (let k = 0; k < 4; k++) {
          const y = 560 + k * 70, a = 30 + r() * 36, ph = r() * 6;
          let d = `M0,900 L0,${f(y)}`;
          for (let x = 0; x <= 1600; x += 50) d += ` L${x},${f(y - Math.abs(Math.sin(x / (170 + k * 30) + ph)) * a)}`;
          d += " L1600,900 Z";
          o += L(d, [pal.far, pal.mid, pal.near, pal.near][k], 0.95);
        }
        const cy = 690 + r() * 40, n2 = 4 + v % 5;
        for (let i = 0; i < n2; i++) {
          const x = 300 + i * 70 + r() * 20;
          o += `<path d="M${f(x - 18)},${f(cy)} h36 l-4,-20 h-8 l-4,-18 l-4,18 h-12 Z M${f(x - 14)},${f(cy)} v20 M${f(x + 12)},${f(cy)} v20" fill="${pal.near}" stroke="${pal.near}" stroke-width="3"/>`;
        }
        break;
      }
      case 3: {
        const hz = 540 + v * 6;
        o += `<rect y="${hz}" width="1600" height="${900 - hz}" fill="${pal.mid}"/><rect y="${hz}" width="1600" height="${900 - hz}" fill="url(#g${s})" opacity=".35"/>`;
        for (let i = 0; i < 22; i++) {
          const y = hz + 12 + r() * (880 - hz), x = r() * 1600;
          o += `<path d="M${f(x)},${f(y)} h${f(40 + r() * 80)}" stroke="${pal.sun}" stroke-opacity="${f(0.1 + r() * 0.2)}" stroke-width="2"/>`;
        }
        const ships = 2 + v % 4;
        for (let i = 0; i < ships; i++) {
          const x = 200 + r() * 1200, y = hz + 40 + r() * 140, sc = 0.6 + r() * 0.8;
          o += `<path d="M${f(x - 40 * sc)},${f(y)} h${f(80 * sc)} l${f(-12 * sc)},${f(14 * sc)} h${f(-56 * sc)} Z" fill="${pal.near}"/><path d="M${f(x)},${f(y)} v${f(-70 * sc)} M${f(x)},${f(y - 68 * sc)} l${f(34 * sc)},${f(54 * sc)} h${f(-34 * sc)} Z M${f(x - 4)},${f(y - 60 * sc)} l${f(-28 * sc)},${f(46 * sc)} h${f(28 * sc)} Z" fill="${pal.near}" stroke="${pal.near}" stroke-width="2"/>`;
        }
        o += L(`M0,900 L0,${f(520 + r() * 60)} Q300,${f(560 + r() * 60)} 420,720 T${f(560 + r() * 80)},900 Z`, pal.near);
        break;
      }
      case 4: {
        o += L(ridge(r, 600, 150, 10), pal.far, 0.85);
        for (let row = 0; row < 3; row++) {
          const y = 620 + row * 90, n2 = 22 + row * 6, col = [pal.far, pal.mid, pal.near][row];
          let d = "";
          for (let i = 0; i < n2; i++) {
            const x = 1600 / n2 * i + r() * 40, h2 = 90 + r() * 120 + row * 30;
            d += tri(x, y + r() * 30, 50 + r() * 36 + row * 12, h2) + " ";
          }
          o += L(d, col);
          o += `<rect y="${y + 20}" width="1600" height="${900 - y - 20}" fill="${col}"/>`;
        }
        break;
      }
      case 5: {
        o += L(ridge(r, 640, 60, 9), pal.far, 0.8) + L(ridge(r, 720, 40, 12), pal.mid) + `<rect y="780" width="1600" height="120" fill="${pal.near}"/>`;
        const n2 = 5 + v % 7;
        for (let i = 0; i < n2; i++) {
          const x = 120 + r() * 1360, y = 730 + r() * 90;
          o += `<path d="${person(x, y, 1 + r() * 0.7, true)}" fill="${pal.near}"/>`;
        }
        for (let i = 0; i < 40; i++) {
          const x = r() * 1600, y = 760 + r() * 130;
          o += `<path d="M${f(x)},${f(y)} l${f(-3)},${f(-16 - r() * 12)} M${f(x)},${f(y)} l${f(4)},${f(-14 - r() * 10)}" stroke="${pal.mid}" stroke-width="2"/>`;
        }
        break;
      }
      case 6: {
        o += L(ridge(r, 650, 70, 8), pal.far, 0.7);
        let d = `M0,900 L0,760`, x = 0;
        while (x < 1600) {
          const w = 40 + r() * 80, h2 = 90 + r() * 230, y = 760 - h2;
          d += ` L${f(x)},${f(y)} L${f(x + w)},${f(y)}`;
          if (r() < 0.35) d += ` L${f(x + w)},${f(y - 40)} L${f(x + w * 0.5)},${f(y - 70)}`;
          x += w;
          d += ` L${f(x)},${f(760 - 60 - r() * 60)}`;
        }
        d += " L1600,760 L1600,900 Z";
        o += L(d, pal.mid) + `<rect y="800" width="1600" height="100" fill="${pal.near}"/>`;
        for (let i = 0; i < 40; i++) o += `<rect x="${f(r() * 1580)}" y="${f(540 + r() * 230)}" width="5" height="8" fill="${pal.sun}" opacity="${f(0.3 + r() * 0.6)}"/>`;
        break;
      }
      case 7: {
        o += L(ridge(r, 620, 90, 10), pal.far, 0.85) + L(ridge(r, 740, 70, 12), pal.mid) + `<rect y="800" width="1600" height="100" fill="${pal.near}"/>`;
        for (let i = 0; i < 3 + v % 3; i++) {
          const x = 100 + r() * 1400, w = 40 + r() * 30;
          o += `<path d="M${f(x)},760 Q${f(x + 40)},${f(560 - r() * 80)} ${f(x - 20)},420" stroke="${pal.far}" stroke-width="${f(w)}" fill="none" opacity=".35"/>`;
        }
        const n2 = 18 + v * 3;
        for (let i = 0; i < n2; i++) {
          const x = 60 + 1480 / n2 * i + r() * 30, y = 790 + r() * 40, sc = 0.8 + r() * 0.5;
          o += `<path d="${person(x, y, sc, false)}" fill="${pal.near}"/><path d="M${f(x + 6 * sc)},${f(y)} v${f(-46 - r() * 20)}" stroke="${pal.near}" stroke-width="2"/>`;
          if (i % 5 === 0) o += `<path d="M${f(x + 6 * sc)},${f(y - 60)} h${f(26 * sc)} v${f(-18 * sc)} h${f(-26 * sc)} Z" fill="${["#b03a3a", "#c9a23a", "#3a5ab0"][i % 3]}"/><path d="M${f(x + 6 * sc)},${f(y)} v-70" stroke="${pal.near}" stroke-width="2"/>`;
        }
        break;
      }
      case 8: {
        o += `<path d="M0,300 Q400,${f(120 + r() * 100)} 800,260 T1600,${f(180 + r() * 100)} L1600,360 Q1000,300 700,380 T0,380 Z" fill="#6ff0c0" opacity=".13"/>`;
        o += L(ridge(r, 560, 280, 8, false), pal.far) + L(ridge(r, 690, 200, 9, false), pal.mid) + L(ridge(r, 790, 80, 10), "#e8f0ff", 0.9) + L(ridge(r, 850, 50, 12), pal.near);
        break;
      }
      default: {
        o += L(ridge(r, 600, 130, 9), pal.far, 0.85) + L(ridge(r, 660, 90, 11), pal.mid);
        let d = `M${f(600 + r() * 300)},620`, x = 800, y = 620;
        for (let i = 0; i < 6; i++) {
          x += (r() - 0.5) * 360;
          y += 46;
          d += ` Q${f(x + 60)},${f(y - 20)} ${f(x)},${f(y)}`;
        }
        o += `<rect y="660" width="1600" height="240" fill="${pal.near}"/><path d="${d} L${f(x + 300)},900 L${f(x - 300)},900 Z" fill="${pal.sky[1]}" opacity=".55"/>`;
        for (let i = 0; i < 26; i++) {
          const rx = r() * 1600, ry = 800 + r() * 90;
          o += `<path d="M${f(rx)},${f(ry)} q${f(-4)},${f(-30)} ${f(-10)},${f(-44)} M${f(rx)},${f(ry)} q${f(5)},${f(-24)} ${f(11)},${f(-38)}" stroke="${pal.mid}" stroke-width="2" fill="none"/>`;
        }
        break;
      }
    }
    return o + `<rect width="1600" height="900" fill="#000" opacity=".16"/></svg>`;
  }
  var sceneName = (seed) => {
    const s = (seed % SCENE_COUNT + SCENE_COUNT) % SCENE_COUNT;
    return `${PALETTES[Math.floor(s / 10) % 10].n}\u306E${SCENE_KINDS[s % 10]}`;
  };
  function logoSvg({ withText = true } = {}) {
    const emblem = `<g fill="none" stroke="#d8b45a" stroke-linecap="round"><circle cx="100" cy="100" r="86" stroke-width="3"/><circle cx="100" cy="100" r="76" stroke-width="1" opacity=".6"/><ellipse cx="100" cy="100" rx="34" ry="76" stroke-width="1" opacity=".5"/><path d="M24 100H176" stroke-width="1" opacity=".5"/><path d="M100 168V118Q100 100 80 80Q64 62 64 36M100 118Q100 100 120 80Q136 62 136 36" stroke-width="5"/></g><circle cx="64" cy="34" r="6" fill="#d8b45a"/><circle cx="136" cy="34" r="6" fill="#6fa8c9"/><circle cx="100" cy="170" r="5" fill="#e8e2d0"/>`;
    return withText ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" role="img" aria-label="ALTERHISTORY"><g transform="translate(10,10)">${emblem}</g><text x="232" y="112" font-family="'Shippori Mincho','Yu Mincho','Hiragino Mincho ProN',serif" font-size="58" letter-spacing="9" fill="#e8e2d0">ALTER</text><text x="232" y="172" font-family="'Shippori Mincho','Yu Mincho','Hiragino Mincho ProN',serif" font-size="58" letter-spacing="9" fill="#d8b45a">HISTORY</text></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="ALTERHISTORY">${emblem}</svg>`;
  }

  // js/version.js
  var APP_VERSION = "6.7.0";
  var APP_VERSION_NAME = "\u547D\u540D\u306E\u898B\u76F4\u3057";
  var APP_VERSION_LABEL = `v${APP_VERSION} ${APP_VERSION_NAME}`;

  // js/ui/v6/title.js
  var SPLASH_MS = 5e3;
  var SLIDE_MS = 5e3;
  var reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rndScene = () => Math.floor(Math.random() * SCENE_COUNT);
  var html = (s) => {
    const d = document.createElement("div");
    d.innerHTML = s;
    return d.firstElementChild;
  };
  var TIPS = ["\u6700\u521D\u306E\u56FD\u306F\u3001\u3044\u3064\u3001\u3069\u3053\u306B\u751F\u307E\u308C\u308B\u306E\u3060\u308D\u3046\u3002", "\u56FD\u5BB6\u306F\u8208\u308A\u3001\u305D\u3057\u3066\u5FC5\u305A\u6EC5\u3073\u308B\u3002", "\u5B97\u6559\u306F\u56FD\u3092\u7D50\u3073\u3001\u3068\u304D\u306B\u56FD\u3092\u5272\u308B\u3002", "\u540C\u76DF\u306F\u3001\u6226\u4E89\u3092\u5927\u304D\u304F\u3059\u308B\u3002", "\u8A00\u8449\u304C\u5206\u304B\u308C\u3001\u6587\u5316\u304C\u5206\u304B\u308C\u3001\u56FD\u5883\u304C\u5F15\u304B\u308C\u308B\u3002", "\u9577\u304F\u7D9A\u304F\u738B\u671D\u306F\u3001\u601D\u3046\u3088\u308A\u305A\u3063\u3068\u5C11\u306A\u3044\u3002", "\u4EA4\u6613\u8DEF\u3092\u63E1\u308B\u8005\u304C\u3001\u3084\u304C\u3066\u6D77\u3092\u63E1\u308B\u3002", "\u3072\u3068\u3064\u306E\u6C7A\u65AD\u304C\u3001\u5343\u5E74\u5F8C\u306E\u5730\u56F3\u3092\u5909\u3048\u308B\u3002"];
  function slideshow(host, { interval = SLIDE_MS, first = rndScene() } = {}) {
    host.classList.add("slides");
    const a = h("div", { class: "slide on" }), b = h("div", { class: "slide" }), cap = h("div", { class: "slidecap" });
    host.append(a, b, cap);
    let cur = a, seed = first;
    const put2 = (el, sd) => {
      el.replaceChildren(html(sceneSvg(sd)));
      cap.textContent = sceneName(sd);
    };
    put2(a, seed);
    const tick3 = () => {
      const nxt = cur === a ? b : a;
      seed = (seed + 1 + Math.floor(Math.random() * (SCENE_COUNT - 2))) % SCENE_COUNT;
      put2(nxt, seed);
      nxt.classList.add("on");
      cur.classList.remove("on");
      cur = nxt;
    };
    const t = setInterval(tick3, interval);
    host.__stop = () => clearInterval(t);
    return () => clearInterval(t);
  }
  function runSplash(ms = SPLASH_MS) {
    const el = document.getElementById("splash");
    if (!el) return Promise.resolve();
    const skip = reduced();
    el.replaceChildren(h("div", { class: "splbg" }), h("div", { class: "spl" }, h("div", { class: "logo" }), h("div", { class: "splbar" }, h("i", { style: `animation-duration:${ms}ms` })), h("div", { class: "spltip" }, "\u4E16\u754C\u3092\u3001\u4F5C\u308B\u3002\u3000\u2014 \u62BC\u3059\u3068\u5148\u3078\u9032\u307F\u307E\u3059")));
    el.querySelector(".splbg").replaceChildren(html(sceneSvg(rndScene())));
    el.querySelector(".logo").replaceChildren(html(logoSvg()));
    return new Promise((done2) => {
      let fin5 = false;
      const end = () => {
        if (fin5) return;
        fin5 = true;
        clearTimeout(t);
        el.classList.add("out");
        window.removeEventListener("keydown", end);
        setTimeout(() => {
          el.remove();
          done2();
        }, skip ? 0 : 420);
      };
      const t = setTimeout(end, skip ? 0 : ms);
      el.addEventListener("click", end);
      window.addEventListener("keydown", end, { once: true });
    });
  }
  var SYL2 = ["\u30A2", "\u30EB", "\u30BB", "\u30EA", "\u30AA", "\u30F3", "\u30F4\u30A7", "\u30C7\u30A3", "\u30AB", "\u30E9", "\u30DF", "\u30CF", "\u30C8", "\u30A8", "\u30B5", "\u30F4\u30A1", "\u30CD", "\u30ED", "\u30BC", "\u30D5\u30A1", "\u30B7", "\u30D9"];
  var randomWorldName = () => {
    const n2 = 3 + Math.floor(Math.random() * 2);
    let s = "";
    for (let i = 0; i < n2; i++) s += SYL2[Math.floor(Math.random() * SYL2.length)];
    return s + ["", "", "\u5927\u9678", "\u4E16\u754C"][Math.floor(Math.random() * 4)];
  };
  function showTitle(root2, { onNew, loader }) {
    const bg = h("div", { class: "titlebg" });
    slideshow(bg);
    const screen = h("div", { class: "titlescreen" }, bg, h("div", { class: "vig" }), h("div", { class: "titlebox" }, h("div", { class: "logo big" }), h("div", { class: "menu" }, btn("\u65B0\u3057\u3044\u4E16\u754C", () => {
      bg.__stop?.();
      onNew();
    }, "p big", { id: "new" }), loader), h("div", { class: "ver" }, APP_VERSION_LABEL)));
    screen.querySelector(".logo").replaceChildren(html(logoSvg()));
    root2.replaceChildren(screen);
    return () => bg.__stop?.();
  }
  function showWorldConfig(root2, { onBack, onStart }) {
    const bg = h("div", { class: "titlebg dim" });
    slideshow(bg);
    const name = h("input", { id: "wname", value: randomWorldName(), maxlength: 24 }), seed = h("input", { id: "seed", value: "alter-" + Math.floor(Math.random() * 9999) }), cells = h("select", { id: "cells" }, ...[3e3, 6e3].map((n2) => h("option", { value: n2, selected: n2 === 3e3 }, n2 === 3e3 ? "3,000 \u30BB\u30EB\uFF08\u6A19\u6E96\uFF09" : "6,000 \u30BB\u30EB\uFF08\u7D30\u304B\u3044\u30FB\u9045\u3044\uFF09")));
    const epoch = h("input", { id: "epoch", placeholder: "\u7A7A\u767D\u306E\u307E\u307E\uFF08\u540D\u3065\u3051\u306A\u3044\uFF09", maxlength: 12 }), eras = [], list = h("div", { class: "erarows", id: "eras" }), msg = h("p", { class: "err", id: "setup-msg" });
    const paint = () => list.replaceChildren(...eras.map((e, i) => h("div", { class: "eraRow" }, h("span", {}, "\u7D00\u5E74"), h("input", { type: "number", class: "ey", value: e.year, onchange: (ev) => {
      e.year = +ev.target.value;
    } }), h("span", {}, "\u5E74\u304B\u3089"), h("input", { class: "en", value: e.name, placeholder: "\u3007\u3007\u6642\u4EE3", maxlength: 14, oninput: (ev) => {
      e.name = ev.target.value;
    } }), btn("\u524A\u9664", () => {
      eras.splice(i, 1);
      paint();
    }))));
    const add = () => {
      const last = eras.length ? Math.max(...eras.map((e) => e.year)) : -1;
      eras.push({ year: last + 100, name: "" });
      paint();
    };
    const calendarOf = () => {
      const list2 = eras.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), startYear: Math.round(e.year) })).sort((a, b) => a.startYear - b.startYear);
      return { epochName: epoch.value.trim(), eras: list2 };
    };
    const go = () => {
      const cfg = { name: name.value.trim() || "\u540D\u3082\u306A\u304D\u4E16\u754C", worldSeed: seed.value || "alter", spec: { resolution: { targetCells: +cells.value } }, calendar: calendarOf() };
      const chk = createCheck(cfg);
      if (chk) {
        msg.textContent = chk;
        return;
      }
      bg.__stop?.();
      onStart(cfg);
    };
    const form = h(
      "div",
      { class: "cfgbox" },
      h("div", { class: "code" }, "NEW WORLD"),
      h("h1", {}, "\u4E16\u754C\u3092\u4F5C\u308B"),
      h("label", { class: "fld" }, h("span", {}, "\u4E16\u754C\u306E\u540D\u524D"), h("div", { class: "rowb" }, name, btn("\u632F\u308A\u76F4\u3059", () => {
        name.value = randomWorldName();
      }))),
      h("label", { class: "fld" }, h("span", {}, "\u4E16\u754C\u306E\u7A2E"), seed),
      h("label", { class: "fld" }, h("span", {}, "\u89E3\u50CF\u5EA6"), cells),
      h("div", { class: "lb" }, "\u66A6"),
      h("label", { class: "fld" }, h("span", {}, "\u5E74\u53F7\u30FB\u7D00\u5143\u306E\u540D\u524D\uFF08\u7A7A\u767D\u306A\u3089\u3001\u5E74\u306E\u6570\u5B57\u3060\u3051\u3092\u8868\u793A\uFF09"), epoch),
      h("span", { class: "n" }, "\u6642\u4EE3\u533A\u5206\uFF08\u300C\u4F55\u5E74\u304B\u3089\u3007\u3007\u6642\u4EE3\u300D\uFF09\u3002\u3044\u304F\u3064\u3067\u3082\u3002\u306A\u304F\u3066\u3082\u3088\u3044"),
      list,
      h("div", { class: "rowb" }, btn("\u6642\u4EE3\u533A\u5206\u3092\u8DB3\u3059", add, "", { id: "addera" })),
      msg,
      h("div", { class: "rowb" }, btn("\u4E16\u754C\u3092\u751F\u6210", go, "p big", { id: "gen" }), btn("\u2190 \u623B\u308B", () => {
        bg.__stop?.();
        onBack();
      }, "", { id: "cfgback" }))
    );
    root2.replaceChildren(h("div", { class: "titlescreen" }, bg, h("div", { class: "vig" }), form));
    return calendarOf;
  }
  var createCheck = (cfg) => {
    const r = normalizeWorldConfig(cfg);
    return r.errors.length ? r.errors.join(" / ") : null;
  };
  function runLoading(root2, cfg, onDone, onFail) {
    const bg = h("div", { class: "titlebg dim" });
    slideshow(bg);
    const fill = h("i", { class: "ind" }), stat2 = h("div", { class: "lstat" }, "\u5730\u7406\u3068\u5148\u53F2\u3092\u751F\u6210\u3057\u3066\u3044\u307E\u3059\u2026"), tip = h("div", { class: "ltip" }, TIPS[Math.floor(Math.random() * TIPS.length)]);
    root2.replaceChildren(h("div", { class: "titlescreen" }, bg, h("div", { class: "vig" }), h("div", { class: "loadbox" }, h("div", { class: "logo" }), h("div", { class: "lname" }, cfg.name), h("div", { class: "lbar" }, fill), stat2, tip)));
    root2.querySelector(".logo").replaceChildren(html(logoSvg({ withText: false })));
    const tipT = setInterval(() => {
      tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    }, 4e3), done2 = (fn) => {
      clearInterval(tipT);
      bg.__stop?.();
      fn();
    };
    setTimeout(() => {
      const r = createNewWorld({ name: cfg.name, worldSeed: cfg.worldSeed, spec: cfg.spec, calendar: cfg.calendar });
      if (!r.ok) {
        done2(() => onFail(r.errors.join(" / ")));
        return;
      }
      const w = r.w;
      if (S2.fastStart) {
        done2(() => onDone(w));
        return;
      }
      fill.classList.remove("ind");
      fill.style.width = "0%";
      stat2.textContent = "\u4E16\u754C\u306E\u6642\u8A08\u304C\u9032\u3093\u3067\u3044\u307E\u3059\u2026";
      const step = () => {
        const p = advanceEntryStep(w, { chunk: 12 });
        fill.style.width = Math.round(p.progress * 100) + "%";
        const y = Math.floor((w.civ.wcde.entryProgress?.done ?? w.civ.wcde.entry?.months ?? 0) / 12);
        stat2.textContent = `\u4E16\u754C\u306E\u6642\u8A08\u304C\u9032\u3093\u3067\u3044\u307E\u3059\u2026 ${y} \u5E74`;
        if (p.done) done2(() => onDone(w));
        else setTimeout(step, 0);
      };
      setTimeout(step, 30);
    }, 80);
  }

  // js/ui/v6/trees.js
  var NODESTAGE = Object.fromEntries(TREE.map((t) => [t.id, t.stage]));
  function panZoom(svg, W2, H, { onChange = null } = {}) {
    let vb = { x: 0, y: 0, w: W2, h: H };
    const apply = () => {
      svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      onChange?.({ ...vb });
    };
    apply();
    let drag = null, moved = false;
    svg.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
      moved = false;
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect(), dx = (e.clientX - drag.x) * vb.w / r.width, dy = (e.clientY - drag.y) * vb.h / r.height;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      vb.x = drag.vx - dx;
      vb.y = drag.vy - dy;
      apply();
    });
    const up = () => {
      drag = null;
    };
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointerleave", up);
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect(), k = e.deltaY < 0 ? 0.85 : 1 / 0.85, mx = vb.x + (e.clientX - r.left) / r.width * vb.w, my = vb.y + (e.clientY - r.top) / r.height * vb.h;
      vb = { x: mx - (mx - vb.x) * k, y: my - (my - vb.y) * k, w: vb.w * k, h: vb.h * k };
      apply();
    }, { passive: false });
    return { set: (v) => {
      vb = { ...v };
      apply();
    }, reset: () => {
      vb = { x: 0, y: 0, w: W2, h: H };
      apply();
    }, get moved() {
      return moved;
    }, get vb() {
      return vb;
    } };
  }
  function techTree({ techs, status, onPick, selected, lane = null, hit = null, vb0 = null, onView = null }) {
    const g = layoutGrid(), NW = 128, NH = 24, CW = 196, RH = 34, X0 = 120, Y0 = 34, W2 = X0 + g.cols * CW + 20, H = Y0 + g.totalRows * RH + 20, byKey = new Map(techs.map((t) => [t.key, t]));
    const svg = sv("svg", { class: "tree techgrid", viewBox: `0 0 ${W2} ${H}`, style: "height:460px;touch-action:none" }), P2 = (t) => ({ x: X0 + g.pos[t.key].col * CW, y: Y0 + g.pos[t.key].row * RH });
    const COL = { adopted: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], known: ["#a58bd0", "#201a2e"], lost: ["#c97a6f", "#2a1614"], locked: ["#4a515c", "#14161a"] }, SYM = { adopted: "\u25A0", available: "\u25C6", known: "\u25C7", lost: "\u2715", locked: "\u25CB" };
    const eraOfCol = (c) => {
      const st2 = techs.filter((t) => t.col === c).map((t) => t.tier);
      return null;
      void st2;
    };
    const stageOf4 = /* @__PURE__ */ new Map();
    for (const t of techs) {
      const a = stageOf4.get(t.col) ?? [];
      a.push(NODESTAGE[t.key] ?? 0);
      stageOf4.set(t.col, a);
    }
    for (let c = 0; c < g.cols; c++) {
      const a = (stageOf4.get(c) ?? []).sort((x, y) => x - y), m = a.length ? a[a.length >> 1] : 0;
      svg.append(sv("text", { x: X0 + c * CW + NW / 2, y: 18, "text-anchor": "middle", "font-size": 11, fill: "#838995" }, STAGES[m] ?? ""));
    }
    LANES.forEach((l, i) => {
      const y = Y0 + g.y0[l.id] * RH - 6, hgt = g.rows[l.id] * RH;
      svg.append(sv("rect", { x: 0, y, width: W2, height: hgt, fill: i % 2 ? "#15181d" : "#12151a", opacity: lane && lane !== l.id ? 0.4 : 1 }), sv("text", { x: 8, y: y + hgt / 2 + 4, "font-size": 12, fill: lane === l.id ? "#d8b45a" : "#a1a6b0" }, `${l.glyph} ${l.ja}`.slice(0, 9)));
    });
    const ek = /* @__PURE__ */ new Map();
    for (const t of techs) {
      const q2 = P2(t);
      t.prereq.forEach((pk, i) => {
        const pt = byKey.get(pk);
        if (!pt) return;
        const a = P2(pt), dim = lane && t.lane !== lane && pt.lane !== lane || status(t) === "locked", lane2 = ek.get(t.col) ?? 0;
        ek.set(t.col, lane2 + 1);
        const bx = q2.x - 26 + i * 7 % 20 - 6, ay = a.y + NH / 2, by = q2.y + NH / 2;
        svg.append(sv("path", { d: `M${a.x + NW} ${ay}H${bx}V${by}H${q2.x}`, fill: "none", stroke: dim ? "#2b3038" : status(pt) === "locked" ? "#3a414b" : "#6fa8c9", "stroke-width": selected && (selected === t.key || selected === pk) ? 2.2 : 1, opacity: dim ? 0.5 : 0.85 }));
      });
    }
    const pz = panZoom(svg, W2, H, { onChange: onView });
    for (const t of techs) {
      const p = P2(t), s = status(t), [stroke, fill] = COL[s], dim = lane && t.lane !== lane || hit && !hit.has(t.key);
      svg.append(sv("g", { class: "tnode", opacity: dim ? 0.3 : 1, onclick: () => {
        if (!pz.moved) onPick(t);
      } }, sv("rect", { x: p.x, y: p.y, width: NW, height: NH, rx: 3, fill, stroke: selected === t.key ? "#fff" : stroke, "stroke-width": s === "adopted" ? 2.6 : selected === t.key ? 2.4 : 1.4, "stroke-dasharray": s === "locked" ? "4 3" : s === "lost" ? "2 2" : null }), sv("text", { x: p.x + 7, y: p.y + 16, "font-size": 12, fill: s === "locked" ? "#838995" : "#d9d6cc" }, `${SYM[s]} ${t.name}`.slice(0, 11))));
    }
    const frontier = Math.max(0, ...techs.filter((t) => status(t) === "adopted" || status(t) === "known" || status(t) === "available").map((t) => g.pos[t.key].col));
    const view2 = (col, w = 640) => pz.set({ x: Math.max(0, X0 + col * CW - 160), y: 0, w, h: Math.min(H, w * 460 / 380) });
    if (vb0) pz.set(vb0);
    else view2(Math.max(0, frontier - 3));
    const focus = (key) => {
      const t = byKey.get(key);
      if (!t) return;
      const p = P2(t), w = 560, h2 = Math.min(H, w * 460 / 380);
      pz.set({ x: Math.max(0, p.x - w / 2 + NW / 2), y: Math.max(0, Math.min(H - h2, p.y - h2 / 2)), w, h: h2 });
    };
    return { svg, COL, SYM, fit: () => pz.set({ x: 0, y: 0, w: W2, h: H }), left: () => view2(0), frontier: () => view2(Math.max(0, frontier - 3)), focus };
  }
  function doctrineTree({ nodes: nodes2, branches, status, onPick, selected, vb0 = null, onView = null }) {
    const CW = 136, NW = 124, NH = 28, RH = 46, GAP = 28, X0 = 14, ROOT_Y = 8, BUS_Y = 52, HEAD_Y = 66, HEAD_H = 22, Y1 = 108;
    const common = branches.filter((b) => !b.special), special = branches.filter((b) => b.special), order = [...common, ...special], tiers = Math.max(1, ...nodes2.map((d) => d.tier));
    const colX = /* @__PURE__ */ new Map();
    order.forEach((b, i) => colX.set(b.id, X0 + i * CW + (i >= common.length ? GAP : 0)));
    const W2 = X0 * 2 + order.length * CW + (special.length ? GAP : 0), H = Y1 + tiers * RH + 10, pos = /* @__PURE__ */ new Map(), cx = (b) => colX.get(b.id) + NW / 2;
    const svg = sv("svg", { class: "tree doctree", viewBox: `0 0 ${W2} ${H}`, style: "height:" + Math.min(480, H + 20) + "px;touch-action:none" });
    const midX = W2 / 2, line = (d, o = {}) => svg.append(sv("path", { d, fill: "none", stroke: "#4a515c", "stroke-width": 1.2, ...o }));
    svg.append(sv("rect", { x: midX - 70, y: ROOT_Y, width: 140, height: 28, rx: 3, fill: "#1a1d23", stroke: "#d8b45a", "stroke-width": 1.8 }), sv("text", { x: midX, y: ROOT_Y + 19, "text-anchor": "middle", "font-size": 12, fill: "#d9d6cc" }, "\u25C6 \u8ECD\u4E8B\u30C9\u30AF\u30C8\u30EA\u30F3"));
    if (order.length) {
      line(`M${midX} ${ROOT_Y + 28}V${BUS_Y}`);
      line(`M${cx(order[0])} ${BUS_Y}H${cx(order.at(-1))}`);
    }
    const grp = (list, label, col) => {
      if (!list.length) return;
      const a = colX.get(list[0].id), b = colX.get(list.at(-1).id) + NW;
      svg.append(sv("rect", { x: a - 6, y: BUS_Y + 4, width: b - a + 12, height: H - BUS_Y - 8, fill: col, opacity: 0.07 }), sv("text", { x: a, y: BUS_Y - 4, "font-size": 10, fill: "#838995" }, label));
    };
    grp(common, "\u5171\u901A 5 \u7CFB\u7D71", "#6fa8c9");
    grp(special, "\u56FD\u5BB6\u56FA\u6709 3 \u7CFB\u7D71 \u2605\uFF08\u653F\u4F53\u30FB\u652F\u6301\u52E2\u529B\u30FB\u5730\u5F62\u30FB\u6226\u4E89\u306E\u7D4C\u9A13\u3067\u6C7A\u307E\u308B\uFF09", "#a58bd0");
    for (const b of order) {
      line(`M${cx(b)} ${BUS_Y}V${HEAD_Y}`);
      svg.append(sv("rect", { x: colX.get(b.id), y: HEAD_Y, width: NW, height: HEAD_H, rx: 3, fill: "#14161a", stroke: b.special ? "#a58bd0" : "#6a7280", "stroke-width": 1.2 }), sv("text", { x: cx(b), y: HEAD_Y + 15, "text-anchor": "middle", "font-size": 11, fill: b.special ? "#c9b6e8" : "#c8c5bb" }, (b.special ? "\u2605 " : "") + b.ja.slice(0, 9)));
      line(`M${cx(b)} ${HEAD_Y + HEAD_H}V${Y1}`, { stroke: "#2f353e" });
    }
    for (const d of nodes2) {
      const x = colX.get(d.branch);
      if (x != null) pos.set(d.id, { x, y: Y1 + (d.tier - 1) * RH });
    }
    for (const d of nodes2) for (const p of d.prereq) {
      const a = pos.get(p), q2 = pos.get(d.id);
      if (!a || !q2) continue;
      const ax = a.x + NW / 2, qx = q2.x + NW / 2, my = q2.y - 10 - (d.tier + p.length) % 3 * 2;
      line(ax === qx ? `M${ax} ${a.y + NH}V${q2.y}` : `M${ax} ${a.y + NH}V${my}H${qx}V${q2.y}`, { stroke: "#5a626e" });
    }
    const pz = panZoom(svg, W2, H, { onChange: onView }), COL = { taken: ["#6fa8c9", "#0f2a3a"], available: ["#d8b45a", "#2a2412"], blocked: ["#4a515c", "#14161a"] }, SY = { taken: "\u25A0", available: "\u25C6", blocked: "\u25CB" };
    for (const d of nodes2) {
      const p = pos.get(d.id);
      if (!p) continue;
      const s = status(d), [stroke, fill] = COL[s];
      svg.append(sv("g", { class: "tnode", "data-doc": d.id, onclick: () => {
        if (!pz.moved) onPick(d);
      } }, sv("rect", { x: p.x, y: p.y, width: NW, height: NH, rx: 3, fill, stroke: selected === d.id ? "#fff" : stroke, "stroke-width": s === "taken" ? 2.6 : selected === d.id ? 2.4 : 1.4, "stroke-dasharray": s === "blocked" ? "4 3" : null }), sv("text", { x: p.x + 6, y: p.y + 18, "font-size": 11, fill: s === "blocked" ? "#838995" : "#d9d6cc" }, `${SY[s]} ${d.ja}`.slice(0, 11))));
    }
    if (vb0) pz.set(vb0);
    const focus = (id) => {
      const p = pos.get(id);
      if (!p) return;
      const w = Math.min(W2, 520), h2 = Math.min(H, w * 3 / 4);
      pz.set({ x: Math.max(0, Math.min(W2 - w, p.x + NW / 2 - w / 2)), y: Math.max(0, Math.min(H - h2, p.y - h2 / 3)), w, h: h2 });
    };
    return { svg, COL, SYM: SY, fit: () => pz.set({ x: 0, y: 0, w: W2, h: H }), focus, pos };
  }
  function nestedLineage(items, { selected = null, onPick, onHover = null, pop = () => 0 }) {
    const by = new Map(items.map((x) => [x.id, x])), kids = /* @__PURE__ */ new Map();
    for (const x of items) {
      const p = x.parent && by.has(x.parent) ? x.parent : null;
      (kids.get(p) ?? kids.set(p, []).get(p)).push(x);
    }
    const total = /* @__PURE__ */ new Map(), tot = (x) => {
      if (total.has(x.id)) return total.get(x.id);
      let s = pop(x.id);
      for (const k of kids.get(x.id) ?? []) s += tot(k);
      total.set(x.id, s);
      return s;
    };
    for (const l of kids.values()) l.sort((a, b) => tot(b) - tot(a) || a.bornAt - b.bornAt || (a.id < b.id ? -1 : 1));
    const open = /* @__PURE__ */ new Set();
    for (let x = by.get(selected); x; x = by.get(x.parent)) open.add(x.id);
    const row = (x, depth) => h("div", { class: "nrow" + (x.id === selected ? " sel" : "") + (pop(x.id) > 0.5 ? "" : " dead"), style: `padding-left:${depth * 14}px`, onmouseenter: () => onHover?.(x.id), onmouseleave: () => onHover?.(null), onclick: (e) => {
      e.preventDefault();
      onPick(x);
    } }, h("span", { class: "sw", style: `background:${colorOf(x.id)}` }), h("span", { class: "nm" }, x.name), h("small", {}, pop(x.id) > 0.5 ? n0(pop(x.id)) : "\u6D88\u6EC5"));
    const node = (x, depth) => {
      const ks = kids.get(x.id) ?? [];
      if (!ks.length) return row(x, depth);
      const d = h("details", { class: "ntree", open: open.has(x.id) || depth === 0 && ks.length <= 6 }, h("summary", {}, row(x, depth), h("small", { class: "cnt" }, `${ks.length}`)), ...ks.map((k) => node(k, depth + 1)));
      return d;
    };
    return h("div", { class: "nested" }, ...(kids.get(null) ?? []).map((r) => node(r, 0)));
  }
  function miniLineage(items, id, { onPick }) {
    const by = new Map(items.map((x) => [x.id, x])), cur = by.get(id);
    if (!cur) return sv("svg", {});
    const anc = [];
    for (let x = by.get(cur.parent); x && anc.length < 4; x = by.get(x.parent)) anc.unshift(x);
    const kids = items.filter((x) => x.parent === id).sort((a, b) => a.bornAt - b.bornAt).slice(0, 6), more = items.filter((x) => x.parent === id).length - kids.length;
    const NW = 92, NH = 20, GX = 22, cols = anc.length + 1 + (kids.length ? 1 : 0), W2 = cols * (NW + GX), H = Math.max(40, kids.length * 26 + 14), midY = H / 2, svg = sv("svg", { viewBox: `0 0 ${W2} ${H}`, width: "100%", class: "tree mini", style: `max-height:${H * 1.4}px` });
    const node = (x, cx2, cy, sel) => svg.append(sv("g", { class: "tnode", onclick: () => !sel && onPick(x) }, sv("rect", { x: cx2, y: cy - NH / 2, width: NW, height: NH, rx: 3, fill: "#1a1d23", stroke: sel ? "#d8b45a" : colorOf(x.id), "stroke-width": sel ? 2.2 : 1.3 }), sv("text", { x: cx2 + 5, y: cy + 4, "font-size": 11, fill: "#d9d6cc" }, x.name.slice(0, 7))));
    const link2 = (x1, y1, x2, y2) => svg.append(sv("path", { d: `M${x1} ${y1}C${x1 + 12} ${y1} ${x2 - 12} ${y2} ${x2} ${y2}`, fill: "none", stroke: "#4a515c", "stroke-width": 1.2 }));
    anc.forEach((x, i) => {
      node(x, i * (NW + GX), midY, false);
      link2(i * (NW + GX) + NW, midY, (i + 1) * (NW + GX), midY);
    });
    const cx = anc.length * (NW + GX);
    node(cur, cx, midY, true);
    kids.forEach((k, i) => {
      const y = 7 + 13 + i * 26 + (H - 14 - kids.length * 26) / 2;
      node(k, cx + NW + GX, y, false);
      link2(cx + NW, midY, cx + NW + GX, y);
    });
    if (more > 0) svg.append(sv("text", { x: cx + NW + GX, y: H - 1, "font-size": 10, fill: "#838995" }, `\u307B\u304B ${more}`));
    return svg;
  }

  // js/ui/v6/visual.js
  var ICON = {
    pop: "M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6",
    coin: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7v10M9.2 9.6c0-1 1.2-1.7 2.8-1.7s2.8.7 2.8 1.7-1.2 1.5-2.8 1.8-2.8.8-2.8 1.8 1.2 1.7 2.8 1.7 2.8-.7 2.8-1.7",
    shield: "M12 3.2 19 6v5.6c0 4.2-2.9 7.3-7 9.2-4.1-1.9-7-5-7-9.2V6l7-2.8Z",
    gear: "M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8ZM12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9",
    sword: "M5 19l9-9M14 10l5-5V3h-2l-5 5M4 20l2.4-.8-1.6-1.6L4 20ZM9 15l2 2",
    crown: "M4 17.5 3.2 8l4.6 3.6L12 5l4.2 6.6L20.8 8 20 17.5H4ZM4 20.5h16",
    hourglass: "M7 3.5h10M7 20.5h10M8 3.5c0 4 4 4.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 4.5-4 8.5s4 4.5 4 8.5",
    ship: "M3 15.5h18l-2.4 4H5.4L3 15.5ZM12 3.5v12M12 4.5 18 12h-6",
    horse: "M5 20v-6l3-5 3-1 1-3 3 2 3 4v9M9 20v-4M15 20v-4",
    gun: "M3 10h13l2 2h3v3h-3l-1.5 3H11l-1 -3H3v-5Z",
    bow: "M6 4c8 2 12 6 12 8s-4 6-12 8M6 12h13M16 9.5 19 12l-3 2.5",
    tower: "M6 20V9l2-1V5h2v2h4V5h2v3l2 1v11H6ZM10 20v-5h4v5",
    flag: "M6 21V4M6 5h11l-2 3.5 2 3.5H6",
    book: "M5 4.5h8a3 3 0 0 1 3 3V20a3 3 0 0 0-3-3H5V4.5ZM19 4.5h-3v13",
    scroll: "M7 4h11v13a3 3 0 0 1-3 3H6M7 4a2.5 2.5 0 0 0-2.5 2.5V7H7M10 9h5M10 12h5M10 15h3",
    globe: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM3.8 12h16.4M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5S14.4 18.1 12 20.5M12 3.5C9.6 5.9 8.6 8.7 8.6 12s1 6.1 3.4 8.5",
    handshake: "M3 12l4-4 4 2 3-2 4 3 3-1M3 12l5 6 3-1 2 2 3-2 4-5M9 13l2 2",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
  };
  var icon = (name, size = 16, color = "currentColor") => sv("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: color, "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round", class: "ico" }, sv("path", { d: ICON[name] ?? ICON.flag }));
  function flag(stateId, w = 66) {
    const k = hash("flag" + stateId), base = colorOf(stateId, 46), alt = colorOf(stateId, 78), dark = colorOf(stateId, 24), pale = "#efe7d2", type = k % 7, W2 = 66, H = 44;
    const el = sv("svg", { viewBox: `0 0 ${W2} ${H}`, width: w, height: Math.round(w * H / W2), class: "flag" });
    const r = (x, y, ww, hh, f2) => el.append(sv("rect", { x, y, width: ww, height: hh, fill: f2 }));
    if (type === 0) {
      r(0, 0, W2, H, base);
      r(0, H / 3, W2, H / 3, pale);
    } else if (type === 1) {
      r(0, 0, W2 / 3, H, base);
      r(W2 / 3, 0, W2 / 3, H, pale);
      r(2 * W2 / 3, 0, W2 / 3, H, alt);
    } else if (type === 2) {
      r(0, 0, W2, H, base);
      r(W2 * 0.3, 0, W2 * 0.14, H, pale);
      r(0, H * 0.43, W2, H * 0.14, pale);
    } else if (type === 3) {
      r(0, 0, W2, H, base);
      r(0, 0, W2 * 0.42, H * 0.55, dark);
      el.append(sv("circle", { cx: W2 * 0.21, cy: H * 0.27, r: 6, fill: pale }));
    } else if (type === 4) {
      r(0, 0, W2, H, base);
      el.append(sv("polygon", { points: `0,0 ${W2},0 0,${H}`, fill: dark }));
    } else if (type === 5) {
      r(0, 0, W2, H, pale);
      el.append(sv("circle", { cx: W2 / 2, cy: H / 2, r: H * 0.3, fill: base }));
    } else {
      r(0, 0, W2, H, dark);
      r(0, H * 0.18, W2, H * 0.12, alt);
      r(0, H * 0.7, W2, H * 0.12, alt);
      el.append(sv("circle", { cx: W2 / 2, cy: H / 2, r: 6, fill: pale }));
    }
    el.append(sv("rect", { x: 0.5, y: 0.5, width: W2 - 1, height: H - 1, fill: "none", stroke: "rgba(255,255,255,.28)" }));
    return el;
  }
  function metric(ic, label, value, { bar: bar2 = null, color = "var(--blue)", title = "" } = {}) {
    return h("div", { class: "metric", title: title || label }, icon(ic, 18), h("div", { class: "mt" }, h("small", {}, label), h("b", {}, value), bar2 != null ? h("span", { class: "barv" }, h("i", { style: `width:${Math.max(0, Math.min(1, bar2)) * 100}%;background:${color}` })) : null));
  }
  function ring(v, label, color = "var(--blue)", size = 62) {
    const r = 24, C = 2 * Math.PI * r, f2 = Math.max(0, Math.min(1, v)) * C, el = sv("svg", { viewBox: "0 0 64 64", width: size, height: size }, sv("circle", { cx: 32, cy: 32, r, fill: "none", stroke: "#2a2f38", "stroke-width": 7 }), sv("circle", { cx: 32, cy: 32, r, fill: "none", stroke: color, "stroke-width": 7, "stroke-dasharray": `${f2} ${C - f2}`, transform: "rotate(-90 32 32)", "stroke-linecap": "butt" }), sv("text", { x: 32, y: 36, "text-anchor": "middle", "font-size": 13, fill: "#e8e4d6" }, Math.round(v * 100)));
    return h("div", { class: "ringbox", title: `${label} ${pct(v)}` }, el, h("small", {}, label));
  }
  function pie(items, { size = 150, center = null, fmt = n0, onPick = null, max = 8, otherLabel = "\u305D\u306E\u4ED6" } = {}) {
    const sorted = [...items].filter((x) => x.value > 0).sort((a, b) => b.value - a.value), head2 = sorted.slice(0, max), rest = sorted.slice(max).reduce((a, x) => a + x.value, 0), all = rest > 0 ? [...head2, { label: otherLabel, value: rest, color: "#5b616c" }] : head2, tot = all.reduce((a, x) => a + x.value, 0) || 1;
    const R = 46, r = 26, svg = sv("svg", { viewBox: "0 0 120 120", width: size, height: size, class: "pie" });
    let a0 = -Math.PI / 2;
    const arcs = all.map((x) => {
      const frac = x.value / tot, a1 = a0 + frac * Math.PI * 2 - (all.length > 1 ? 0.012 : 0), big = frac > 0.5 ? 1 : 0, P2 = (rad, a) => `${60 + rad * Math.cos(a)} ${60 + rad * Math.sin(a)}`;
      const d = frac >= 0.9999 ? `M60 ${60 - R}A${R} ${R} 0 1 1 59.99 ${60 - R}ZM60 ${60 - r}A${r} ${r} 0 1 0 60.01 ${60 - r}Z` : `M${P2(R, a0)}A${R} ${R} 0 ${big} 1 ${P2(R, a1)}L${P2(r, a1)}A${r} ${r} 0 ${big} 0 ${P2(r, a0)}Z`;
      a0 += frac * Math.PI * 2;
      const p = sv("path", { d, fill: x.color, "fill-rule": "evenodd", class: "slice", onclick: () => x.id && onPick?.(x.id) }, sv("title", {}, `${x.label} ${fmt(x.value)}\uFF08${pct(x.value / tot)}\uFF09`));
      svg.append(p);
      return p;
    });
    if (center != null) svg.append(sv("text", { x: 60, y: 64, "text-anchor": "middle", "font-size": 12, fill: "#e8e4d6" }, center));
    const legend = h("div", { class: "pielg" }, ...all.map((x, i) => h("div", { class: "lgrow" + (x.id && onPick ? " pick" : ""), onmouseenter: () => arcs[i].classList.add("hot"), onmouseleave: () => arcs[i].classList.remove("hot"), onclick: () => x.id && onPick?.(x.id) }, h("i", { style: `background:${x.color}` }), h("span", { class: "nm" }, x.label), h("small", {}, pct(x.value / tot)))));
    return h("div", { class: "piebox" }, svg, legend);
  }
  function hbars(items, { fmt = n0, onPick = null, top = 8, onHover = null } = {}) {
    const list = [...items].sort((a, b) => b.value - a.value).slice(0, top), mx = Math.max(1e-9, ...list.map((x) => x.value));
    return h("div", { class: "hbars" }, ...list.map((x, i) => h("div", { class: "hb" + (x.mine ? " mine" : "") + (onPick ? " pick" : ""), onclick: () => x.id && onPick?.(x.id), onmouseenter: () => x.id && onHover?.(x.id), onmouseleave: () => onHover?.(null) }, h("small", { class: "rk" }, i + 1), h("span", { class: "nm" }, x.label), h("span", { class: "tr" }, h("i", { style: `width:${Math.max(2, x.value / mx * 100)}%;background:${x.color}` })), h("small", { class: "vl" }, fmt(x.value)))));
  }
  function treemap(items, { w = 300, hgt = 150, onPick = null, fmt = n0 } = {}) {
    const list = [...items].filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 18), el = sv("svg", { viewBox: `0 0 ${w} ${hgt}`, width: "100%", class: "treemap" });
    const lay = (arr, x, y, ww, hh) => {
      if (!arr.length) return;
      if (arr.length === 1) return put2(arr[0], x, y, ww, hh);
      const tot = arr.reduce((a, b) => a + b.value, 0);
      let acc = 0, i = 0;
      while (i < arr.length - 1 && acc + arr[i].value <= tot / 2) acc += arr[i++].value;
      if (i === 0) {
        acc = arr[0].value;
        i = 1;
      }
      const A2 = arr.slice(0, i), B = arr.slice(i), fa = acc / tot;
      if (ww >= hh) {
        lay(A2, x, y, ww * fa, hh);
        lay(B, x + ww * fa, y, ww * (1 - fa), hh);
      } else {
        lay(A2, x, y, ww, hh * fa);
        lay(B, x, y + hh * fa, ww, hh * (1 - fa));
      }
    };
    const put2 = (it, x, y, ww, hh) => {
      const g = sv("g", { class: "tm" + (onPick && it.id ? " pick" : ""), onclick: () => it.id && onPick?.(it.id) }, sv("rect", { x: x + 0.6, y: y + 0.6, width: Math.max(0, ww - 1.2), height: Math.max(0, hh - 1.2), fill: it.color }), sv("title", {}, `${it.label} ${fmt(it.value)}`));
      if (ww > 44 && hh > 16) g.append(sv("text", { x: x + 4, y: y + 12, "font-size": Math.min(11, Math.max(8, ww / 9)), fill: "#10131a", "font-weight": 600 }, it.label.slice(0, Math.max(2, Math.floor(ww / 11)))));
      el.append(g);
    };
    lay(list, 0, 0, w, hgt);
    return el;
  }
  function stackbar(items, { height = 12 } = {}) {
    const tot = items.reduce((a, x) => a + x.value, 0) || 1;
    return h("div", { class: "stackbar", style: `height:${height}px` }, ...items.filter((x) => x.value > 0).map((x) => h("i", { style: `width:${x.value / tot * 100}%;background:${x.color}`, title: `${x.label} ${pct(x.value / tot)}` })));
  }
  function timeband(segs, t02, t1, { height = 16 } = {}) {
    const span = Math.max(1, t1 - t02), el = h("div", { class: "timeband", style: `height:${height}px` });
    for (const s of segs) {
      const a = Math.max(0, (s.from - t02) / span), b = Math.min(1, ((s.to ?? t1) - t02) / span);
      if (b <= a) continue;
      el.append(h("i", { style: `left:${a * 100}%;width:${Math.max(0.8, (b - a) * 100)}%;background:${s.color}`, title: s.label ?? "" }));
    }
    return el;
  }

  // js/ui/v6/warconfirm.js
  var outlook = (p) => {
    if (!p) return ["\u898B\u901A\u3057\u306F\u7ACB\u305F\u306A\u3044", "mid"];
    const w = p.pAWin - p.pBWin;
    return w > 0.6 ? ["\u5727\u5012\u7684\u306B\u512A\u52E2", "good"] : w > 0.3 ? ["\u512A\u52E2", "good"] : w > 0.1 ? ["\u3084\u3084\u512A\u52E2", "good"] : w > -0.1 ? ["\u62EE\u6297", "mid"] : w > -0.3 ? ["\u3084\u3084\u52A3\u52E2", "bad"] : w > -0.6 ? ["\u52A3\u52E2", "bad"] : ["\u5727\u5012\u7684\u306B\u52A3\u52E2", "bad"];
  };
  function lightOutlook(a, b) {
    const c = S2.w.civ, A2 = c.states[a], B = c.states[b], p = predictWar(c, a, b, S2.w.sim.ctx), [word2, tone] = outlook(p), rows = [["\u6226\u529B", word2, tone]];
    if (p) {
      const ia = p.inputs.a, ib = p.inputs.b;
      rows.push(["\u88DC\u7D66", ia.supply >= ib.supply * 1.2 ? "\u3053\u3061\u3089\u304C\u5C4A\u304D\u3084\u3059\u3044" : ia.supply * 1.2 < ib.supply ? "\u9060\u5F81\u306F\u82E6\u3057\u3044" : "\u540C\u7A0B\u5EA6", ia.supply >= ib.supply * 1.2 ? "good" : ia.supply * 1.2 < ib.supply ? "bad" : "mid"]);
      rows.push(["\u56FD\u5185\u306E\u4E8B\u60C5", ia.fatigue > 0.5 ? "\u56FD\u6C11\u306F\u75B2\u308C\u3066\u3044\u308B" : ia.stability < 0.4 ? "\u56FD\u5185\u304C\u4E0D\u5B89\u5B9A" : "\u843D\u3061\u7740\u3044\u3066\u3044\u308B", ia.fatigue > 0.5 || ia.stability < 0.4 ? "bad" : "good"]);
      rows.push(["\u5730\u5F62\u30FB\u5B88\u308A", (B.defense ?? 0) >= 0.2 ? "\u76F8\u624B\u306F\u8981\u585E\u3092\u6574\u3048\u3066\u3044\u308B" : "\u76EE\u7ACB\u3063\u305F\u8981\u5BB3\u306F\u306A\u3044", (B.defense ?? 0) >= 0.2 ? "bad" : "mid"]);
    }
    const allies = (id) => c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.type === "alliance" && (t.a === id || t.b === id)).length, ab = allies(b), aa = allies(a);
    rows.push(["\u540C\u76DF\u306E\u52D5\u304D", ab > aa ? "\u76F8\u624B\u5074\u306B\u5473\u65B9\u304C\u4ED8\u304D\u305D\u3046" : ab > 0 ? "\u76F8\u624B\u306B\u3082\u540C\u76DF\u56FD\u304C\u3042\u308B" : aa > 0 ? "\u3053\u3061\u3089\u306B\u5473\u65B9\u304C\u4ED8\u304D\u305D\u3046" : "\u3069\u3061\u3089\u3082\u5358\u72EC", ab > aa ? "bad" : aa > ab ? "good" : "mid"]);
    void A2;
    return rows;
  }
  function confirmWar(stateId, targetId, onDone) {
    document.getElementById("warconfirm")?.remove();
    const c = S2.w.civ, rows = lightOutlook(stateId, targetId);
    const close = () => document.getElementById("warconfirm")?.remove();
    const box = h("div", { id: "warconfirm", class: "fullmodal" }, h(
      "div",
      { class: "modalbox wcbox" },
      h("div", { class: "code", style: "justify-content:center" }, "\u958B\u6226\u306E\u6700\u7D42\u78BA\u8A8D"),
      h("div", { class: "vs" }, h("div", { class: "side" }, flag(stateId, 72), h("b", {}, stateName(stateId))), h("div", { class: "x" }, icon("sword", 28)), h("div", { class: "side" }, flag(targetId, 72), h("b", {}, stateName(targetId)))),
      h("div", { class: "wcrows" }, ...rows.map(([k, v, tone]) => h("div", { class: "wcrow " + tone }, h("small", {}, k), h("b", {}, v)))),
      h("div", { class: "n", style: "text-align:center" }, c.states[targetId]?.alive ? "\u3044\u3063\u305F\u3093\u59CB\u307E\u3063\u305F\u6226\u4E89\u306F\u3001\u8B1B\u548C\u304C\u6210\u7ACB\u3059\u308B\u307E\u3067\u7D42\u308F\u308A\u307E\u305B\u3093\u3002" : ""),
      h("div", { class: "rowb", style: "justify-content:center;margin-top:12px" }, btn("\u958B\u6226\u3059\u308B", () => {
        close();
        const r = act({ type: "state.act", stateId, action: "declare_war", target: targetId });
        onDone?.(r);
      }, "p", { id: "war-confirm-go" }), btn("\u3084\u3081\u308B", close, "", { id: "war-confirm-no" }))
    ));
    document.body.append(box);
    void colorOf;
  }

  // js/ui/v6/nation.js
  var civ = () => S2.w.civ;
  var KIND_COL = { infantry: "#9fbf8a", ranged: "#d8b45a", cavalry: "#c99a6f", navy: "#6fa8c9", garrison: "#8fb3b0", firearms: "#d0605a" };
  var KIND_ICON = { infantry: "shield", ranged: "bow", cavalry: "horse", navy: "ship", garrison: "tower", firearms: "gun" };
  function nationHero(st2, mine) {
    const c = civ(), L = st2.leader, P2 = st2.politics, mil = st2.military, leg = P2 ? effective(c, st2, "legitimacy") : 0, fat = P2 ? effective(c, st2, "fatigue") : 0;
    const date5 = formatWorldDate(S2.w, st2.formedAt).split("\u6708")[0] + "\u6708";
    return h(
      "div",
      { class: "hero" },
      h(
        "div",
        { class: "hrow" },
        flag(st2.id, 78),
        h(
          "div",
          { class: "hname" },
          h("h3", {}, st2.name),
          h("div", { class: "sub" }, `${regimeJa(st2)}${st2.alive ? "" : "\u30FB\u6EC5\u4EA1"}\u30FB\u6210\u7ACB ${date5}`),
          h("div", { class: "rowb" }, mine ? btn("\u62C5\u5F53\u3092\u89E3\u9664", () => {
            run({ type: "control.release" });
            S2.hooks.render();
          }, "p", { id: "release" }) : btn("\u3053\u306E\u56FD\u3092\u62C5\u5F53\u3059\u308B", () => {
            run({ type: "control.take", stateId: st2.id });
            S2.hooks.render();
          }, "p", { id: "take", disabled: !st2.alive }), mine ? h("small", { style: "color:var(--purple)" }, "\u62C5\u5F53\u4E2D") : null)
        ),
        h("div", { class: "hface" }, face(L?.name ?? "\u2014", st2.id, L?.look ?? null), h("small", {}, L?.title ?? "\u70BA\u653F\u8005"), h("b", {}, L?.name ?? "\u2014"))
      ),
      h(
        "div",
        { class: "metrics" },
        metric("pop", "\u4EBA\u53E3", n0(st2.pop)),
        metric("coin", "\u56FD\u5EAB", n0(st2.treasury), { color: "#d8b45a" }),
        metric("gear", "\u7523\u696D\u529B", n0(effective(c, st2, "industry"))),
        metric("sword", "\u5175\u529B", n0(st2.army), { color: "#d0605a" }),
        metric("shield", "\u5B89\u5B9A\u5EA6", pct(st2.stability), { bar: st2.stability, color: st2.stability < 0.35 ? "#d0605a" : "#9fbf8a" }),
        metric("crown", "\u6B63\u7D71\u6027", pct(leg), { bar: leg, color: "#a58bd0" }),
        metric("hourglass", "\u75B2\u52B4", pct(fat), { bar: fat, color: fat > 0.5 ? "#d0605a" : "#6a6f78" }),
        mil ? metric("flag", "\u8ECD\u4E8B\u80FD\u529B", (st2.milBonus >= 0 ? "+" : "") + pct(st2.milBonus)) : null
      )
    );
  }
  function tPoliticsV(st2, mine) {
    const c = civ(), P2 = st2.politics, out = h("div", {});
    if (P2) {
      const rows = Object.entries(P2.factions ?? {});
      out.append(
        lb("\u652F\u6301\u52E2\u529B", "FACTIONS"),
        stackbar(rows.map(([k, v]) => ({ label: FACTION_JA[k] ?? k, value: v.influence, color: FACTION_COL[k] ?? "#6fa8c9" })), { height: 14 }),
        h("div", { class: "facs" }, ...rows.map(([k, v]) => h("div", { class: "fac", title: `\u5F71\u97FF\u529B ${pct(v.influence)}` }, h("i", { style: `background:${FACTION_COL[k] ?? "#6fa8c9"}` }), h("span", {}, FACTION_JA[k] ?? k), h("span", { class: "barv" }, h("i", { style: `width:${v.support * 100}%;background:${FACTION_COL[k] ?? "#6fa8c9"}` })), h("small", {}, pct(v.support))))),
        P2.assembly ? h("div", {}, hemi(rows.map(([k, v]) => [k, v.influence]), rows.map(([k]) => FACTION_COL[k] ?? "#6fa8c9"))) : null
      );
    }
    const tax = st2.pop * st2.policy.tax * 12e-4 * taxMult(st2), trade = effective(c, st2, "tradeIncome"), cols = ["#d8b45a", "#6fa8c9"];
    out.append(lb("\u8CA1\u653F", "FINANCE"), h(
      "div",
      { class: "row" },
      donut([["\u7A0E\u53CE", tax], ["\u4EA4\u6613", trade]], cols),
      h("span", { class: "g" }, h("div", {}, h("i", { class: "dotc", style: `background:${cols[0]}` }), `\u7A0E\u53CE ${n0(tax)}`), h("div", {}, h("i", { class: "dotc", style: `background:${cols[1]}` }), `\u4EA4\u6613 ${n0(trade)}`), h("div", { class: "n" }, `\u7A0E\u7387 ${pct(st2.policy.tax)}`)),
      h("div", { class: "rowb" }, btn("\u5897\u7A0E", () => act({ type: "state.act", stateId: st2.id, action: "set_tax", opt: "up" }), "", { id: "tax-up", disabled: !mine, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" }), btn("\u6E1B\u7A0E", () => act({ type: "state.act", stateId: st2.id, action: "set_tax", opt: "down" }), "", { id: "tax-down", disabled: !mine }))
    ));
    out.append(officesBox(st2, mine));
    const ideas = ideasOf(st2).slice(0, 6);
    if (ideas.length) out.append(lb("\u601D\u60F3", "IDEAS"), h("div", { class: "chips" }, ...ideas.map((x) => h("span", { class: "chip", title: pct(x.v) }, x.ja, h("i", { style: `width:${x.v * 100}%` })))));
    if (mine && st2.alive) out.append(uprisingBox(st2));
    out.append(h("details", { class: "dt cbox" }, h("summary", {}, "\u5275\u9020\u4E3B\u306E\u7DE8\u96C6\u30FB\u4ECB\u5165"), creatorBox(st2)));
    return out;
  }
  function tMilitaryV(st2, mine) {
    const c = civ(), M = st2.military;
    if (!M) return h("p", { class: "n" }, "\u8ECD\u4E8B\u306E\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
    const can2 = st2.alive && (mine || !controlled()), units = M.units ?? [], tot = units.reduce((a, u) => a + u.size, 0) || 1, out = h("div", {});
    out.append(h("div", { class: "rings" }, ring(effective(c, st2, "equipLevel"), "\u88C5\u5099", "#d8b45a"), ring(effective(c, st2, "readiness"), "\u7DF4\u5EA6", "#9fbf8a"), ring(Math.min(1, Math.max(0, 0.5 + st2.milBonus)), "\u8ECD\u4E8B\u80FD\u529B", "#d0605a"), ring(Math.min(1, st2.defense ?? 0), "\u8981\u585E", "#8fb3b0")));
    out.append(lb("\u7DE8\u6210", "ORGANIZATION"), stackbar(units.map((u) => ({ label: u.name, value: u.size, color: KIND_COL[u.kind] })), { height: 16 }));
    out.append(h("div", { class: "forms" }, ...units.flatMap((u) => [
      h("div", { class: "uhead" }, h("span", { style: `color:${KIND_COL[u.kind]}` }, icon(KIND_ICON[u.kind] ?? "flag", 16)), h("b", {}, u.name), h("small", {}, `${n0(u.size)}\uFF08${pct(u.size / tot)}\uFF09`), h("span", { class: "barv", title: `\u88C5\u5099 ${pct(u.equip)}` }, h("i", { style: `width:${u.equip * 100}%;background:#d8b45a` })), h("span", { class: "barv", title: `\u7DF4\u5EA6 ${pct(u.readiness)}` }, h("i", { style: `width:${u.readiness * 100}%;background:#9fbf8a` }))),
      h("div", { class: "fcards" }, ...formationsOf(st2, u).map((f2) => h("div", { class: "fcard", style: `border-color:${KIND_COL[u.kind]}` }, h("b", {}, f2.name), h("small", {}, n0(f2.size)))))
    ])));
    if (can2) {
      const avail = Object.entries(UNIT_KINDS).filter(([k, d]) => d.need(st2, S2.w.sim.ctx)), cur = Object.fromEntries(avail.map(([k]) => [k, Math.round((units.find((u) => u.kind === k)?.size ?? 0) / tot * 100)])), val = { ...cur }, sl = {};
      const sum = () => Object.values(val).reduce((a, b) => a + b, 0), info = h("small", {}), paint = () => {
        info.textContent = `\u5408\u8A08 ${sum()}%`;
        info.style.color = sum() === 100 ? "var(--dim)" : "#d0605a";
        for (const k in sl) {
          sl[k].lab.textContent = `${val[k]}%`;
          sl[k].inp.value = val[k];
        }
      };
      const rows = avail.map(([k, d]) => {
        const inp = h("input", { type: "range", min: 0, max: 100, step: 5, value: val[k], "data-kind": k, oninput: (e) => {
          val[k] = Number(e.target.value);
          paint();
        } }), lab = h("small", {}, `${val[k]}%`);
        sl[k] = { inp, lab };
        return h("div", { class: "slrow" }, h("span", { style: `color:${KIND_COL[k]}` }, icon(KIND_ICON[k] ?? "flag", 15)), h("span", { class: "nm" }, d.ja), inp, lab);
      });
      out.append(h("details", { class: "dt", id: "reorg-box" }, h("summary", {}, "\u7DE8\u6210\u3092\u7DE8\u96C6\u3059\u308B"), ...rows, h("div", { class: "rowb" }, info, btn("\u5747\u3059", () => {
        const n2 = avail.length;
        avail.forEach(([k], i) => val[k] = Math.floor(100 / n2) + (i < 100 % n2 ? 1 : 0));
        paint();
      }), btn("\u3053\u306E\u7DE8\u6210\u306B\u3059\u308B", () => {
        const s = {};
        for (const k in val) s[k] = val[k] / 100;
        (mine ? act : creator)({ type: "state.reorganize", stateId: st2.id, shares: s });
      }, "p", { id: "reorg" }))));
      setTimeout(paint, 0);
    }
    const foes = aliveStates().filter((x) => x.id !== st2.id).sort((a, b) => b.pop - a.pop).slice(0, 40), sel = h("select", { id: "wl-target" }, ...foes.map((x) => h("option", { value: x.id }, x.name)));
    out.append(lb("\u5BA3\u6226", "WAR"), h("div", { class: "rowb" }, sel, btn("\u5BA3\u6226\u3059\u308B", () => confirmWar(st2.id, sel.value, () => S2.hooks.render()), "", { id: "declare", disabled: !mine || !foes.length, title: mine ? "" : "\u62C5\u5F53\u56FD\u306E\u307F" })));
    void r23;
    void colorOf;
    return out;
  }
  function tDiplomacyV(st2, mine) {
    const c = civ(), tr = c.activeTreatyIds.map((i) => c.treaties[i]).filter((t) => t.a === st2.id || t.b === st2.id), other2 = (t) => t.a === st2.id ? t.b : t.a, TJ = { alliance: "\u540C\u76DF", nonaggression: "\u4E0D\u53EF\u4FB5", trade: "\u901A\u5546" };
    const wars = st2.warIds.map((i) => c.wars[i]).filter(Boolean), rel = aliveStates().filter((x) => x.id !== st2.id).map((x) => ({ x, v: Math.round(st2.relations[x.id] ?? 0) })).sort((a, b) => b.v - a.v);
    const chip = (id, txt) => h("span", { class: "fchip", onclick: () => S2.hooks.select(id), title: c.states[id]?.name }, flag(id, 28), h("small", {}, txt ?? c.states[id]?.name ?? id));
    const out = h(
      "div",
      {},
      lb("\u540C\u76DF", "ALLIES"),
      h("div", { class: "flagrow" }, ...tr.filter((t) => t.type === "alliance").map((t) => chip(other2(t))) || [], tr.some((t) => t.type === "alliance") ? null : h("small", { class: "n" }, "\u306A\u3057")),
      lb("\u4EA4\u6226\u4E2D", "AT WAR"),
      h("div", { class: "flagrow" }, ...wars.map((w) => h("span", { class: "fchip", onclick: () => {
        S2.war = w.id;
        S2.hub = "war";
        S2.hooks.render();
      } }, flag(w.aggressor === st2.id ? w.defender : w.aggressor, 28), h("small", {}, w.name ?? "\u6226\u4E89"))), wars.length ? null : h("small", { class: "n" }, "\u306A\u3057")),
      lb("\u95A2\u4FC2\u306E\u826F\u3044\u56FD", "FRIENDS"),
      ...rel.slice(0, 4).map(({ x, v }) => h("div", { class: "drow static" }, flag(x.id, 26), h("span", { class: "nm" }, x.name), h("span", { class: "relbar" }, h("i", { style: `left:${50 + v / 2}%;background:#6fa8c9` })))),
      lb("\u95A2\u4FC2\u306E\u60AA\u3044\u56FD", "RIVALS"),
      ...rel.slice(-3).reverse().map(({ x, v }) => h("div", { class: "drow static" }, flag(x.id, 26), h("span", { class: "nm" }, x.name), h("span", { class: "relbar" }, h("i", { style: `left:${50 + v / 2}%;background:#d0605a` })))),
      lb("\u6761\u7D04", "TREATIES"),
      ...tr.length ? tr.map((t) => h("div", { class: "drow static" }, flag(other2(t), 26), h("span", { class: "nm" }, `${TJ[t.type] ?? t.type}\u30FB${c.states[other2(t)]?.name}`), btn("\u7834\u68C4", () => act({ type: "state.act", stateId: st2.id, action: "break_treaty", target: t.id }), "", { disabled: !mine, title: mine ? "\u7834\u68C4\u3059\u308B\u3068\u76F8\u624B\u3068\u306E\u95A2\u4FC2\u304C\u60AA\u5316\u3059\u308B" : "\u62C5\u5F53\u56FD\u306E\u307F" }))) : [h("small", { class: "n" }, "\u306A\u3057")]
    );
    const me = controlled();
    if (me && me !== st2.id) out.append(h("div", { class: "rowb" }, btn("\u3053\u306E\u56FD\u3068\u306E\u5916\u4EA4\u3092\u884C\u3046", () => {
      S2.hub = "diplo";
      S2.dtab = "rel";
      S2.dip = { a: me, b: st2.id };
      S2.hooks.render();
    }, "p", { id: "to-diplo" })));
    return out;
  }

  // js/ui/v6/views-a.js
  var DOMAIN_JA = { economy: "\u7D4C\u6E08", military: "\u8ECD\u4E8B", politics: "\u653F\u6CBB", states: "\u56FD\u5BB6", population: "\u4EBA\u53E3", war_diplomacy: "\u5916\u4EA4" };
  var civ2 = () => S2.w.civ;
  var date = (mi) => formatWorldDate(S2.w, mi);
  var link = (id) => civ2().states[id] ? h("a", { class: "lk", href: "#", onclick: (e) => {
    e.preventDefault();
    S2.hooks.select(id);
  } }, stateName(id)) : String(id);
  var note = (t) => h("p", { class: "n" }, t);
  var why = (t) => h("p", { class: "n err", id: "why" }, t);
  function pGeo() {
    const M = S2.map, box = h("div", {}, h("div", { class: "code" }, "GEOGRAPHY"), h("h2", {}, "\u5730\u7406"), note("\u5404\u30EC\u30A4\u30E4\u30FC\u3092\u81EA\u7531\u306B\u91CD\u306D\u3089\u308C\u307E\u3059\u3002\u5857\u308A\u306E\u5C64\u306F\u4E0D\u900F\u660E\u5EA6\u3082\u5909\u3048\u3089\u308C\u307E\u3059\u3002"));
    const done2 = () => {
      S2.hooks.mapOnly();
      S2.hooks.panel();
    };
    for (const [gid, ja, en] of GROUPS) {
      box.append(lb(ja, en));
      for (const [id, name] of LAYERS.filter((l) => l[2] === gid).reverse()) {
        const fill = FILL_IDS.includes(id), on = M.isOn(id);
        box.append(h("div", {}, h("div", { class: "layrow" }, h("input", { type: "checkbox", id: "ly-" + id, checked: on, onchange: () => {
          M.toggle(id);
          done2();
        } }), h("span", { class: "g" }, name), fill && on ? h("input", { type: "range", class: "opa", min: 20, max: 100, value: Math.round(M.alpha[id] * 100), title: "\u4E0D\u900F\u660E\u5EA6", oninput: (e) => {
          M.alpha[id] = e.target.value / 100;
          M.interact();
        } }) : null)));
      }
    }
    return box.append(note("\u5730\u5F62\u30FB\u6C17\u5019\u30FB\u8CC7\u6E90\u3092\u751F\u6210\u5F8C\u306B\u624B\u3067\u7DE8\u96C6\u3059\u308B\u6A5F\u80FD\u306F\u8A2D\u3051\u3066\u3044\u307E\u305B\u3093\u3002"), h("div", { class: "rowb" }, btn("\u8868\u793A\u3092\u521D\u671F\u4F4D\u7F6E\u3078", () => {
      M.view = { x: 0, y: 0, k: 1 };
      M.draw();
    }))) || box;
  }
  function listRow(hl, kids, onclick, cls = "") {
    return h("div", { class: "lrow " + cls, onmouseenter: () => {
      if (S2.map && hl) {
        S2.map.hl = hl;
        S2.map.draw();
      }
    }, onmouseleave: () => {
      if (S2.map) {
        S2.map.hl = null;
        S2.map.draw();
      }
    }, onclick }, ...kids);
  }
  function sectioned(sections, rowH, renderRow) {
    const rows = [];
    for (const sec of sections) {
      if (!sec.rows.length) continue;
      rows.push({ hdr: `${sec.title}\uFF08${sec.rows.length}\uFF09` });
      if (!sec.fold || !S2.fold?.[sec.fold]) for (const r of sec.rows) rows.push(r);
    }
    return vlist(rows, rowH, (r) => r.hdr ? h("div", { class: "grp", style: "cursor:default" }, r.hdr) : renderRow(r));
  }
  var clearHl = () => {
    if (S2.map) {
      S2.map.hl = null;
    }
  };
  var back = (label, on) => h("div", { class: "back", onclick: () => {
    clearHl();
    on();
  } }, "\u2190 " + label);
  function pNations() {
    const c = civ2(), box = h("div", {}, h("div", { class: "code" }, "NATIONS"), h("h2", {}, "\u56FD\u5BB6"));
    if (S2.detail && S2.sel && c.states[S2.sel]) {
      box.append(back("\u56FD\u5BB6\u4E00\u89A7", () => {
        S2.detail = false;
        S2.hooks.panel();
      }), stateDetail(c.states[S2.sel]));
      return box;
    }
    const mine = controlled(), all = Object.values(c.states).sort((a, b) => b.formedAt - a.formedAt || (a.id < b.id ? -1 : 1)), me = all.filter((s) => s.id === mine), alive = all.filter((s) => s.alive && s.id !== mine), dead = all.filter((s) => !s.alive);
    box.append(h("p", { class: "n" }, `\u5B58\u7D9A\u4E2D ${alive.length + me.length}\u30FB\u6EC5\u4EA1 ${dead.length}`), sectioned([{ title: "\u3042\u306A\u305F\u306E\u56FD", rows: me }, { title: "\u5B58\u7D9A\u4E2D\u306E\u56FD\u5BB6", rows: alive }, { title: "\u6EC5\u4EA1\u3057\u305F\u56FD\u5BB6", rows: dead, fold: "deadStates" }], 34, (s) => listRow({ type: "states", id: s.id }, [h("span", { class: "sw", style: `background:${colorOf(s.id)}` }), s.name, h("small", {}, s.alive ? `\u4EBA\u53E3 ${n0(s.pop)}\u30FB${regimeJa(s)}` : `\u6EC5\u4EA1\u30FB\u6210\u7ACB ${date(s.formedAt).split("\u6708")[0]}\u6708`)], () => S2.hooks.select(s.id), (s.id === mine ? "mine " : "") + (s.alive ? "" : "dead"))));
    return box;
  }
  function stateDetail(st2) {
    const c = civ2(), mine = controlled() === st2.id, tabs2 = [["politics", "\u5185\u653F"], ["military", "\u8ECD\u4E8B"], ["diplomacy", "\u5916\u4EA4"], ["tech", "\u6280\u8853\u30C4\u30EA\u30FC"], ["doctrine", "\u8ECD\u4E8B\u30C9\u30AF\u30C8\u30EA\u30F3"]];
    const body = { politics: tPoliticsV, military: tMilitaryV, diplomacy: tDiplomacyV, tech: tTech, doctrine: tDoctrine }[S2.tab](st2, mine);
    return h(
      "div",
      { class: "rs" },
      nationHero(c.states[st2.id], mine),
      h("div", { class: "tabs" }, ...tabs2.map(([k, ja]) => h("b", { class: S2.tab === k ? "on" : "", "data-tab": k, onclick: () => {
        S2.tab = k;
        S2.hooks.panel();
      } }, ja))),
      S2.notice ? why(S2.notice) : null,
      body
    );
  }
  function officesBox(st2, mine) {
    const rg = regimeOf(st2), R = REGIMES[rg], offs = st2.offices ?? [], can2 = st2.alive && (mine || !controlled()), box = h("div", {}, lb("\u5B98\u5236\u30FB\u5F79\u8077", "OFFICES"), note(`${R.ja}\u30FB\u5143\u9996\u306F${officeJa(R.ruler)}`));
    box.append(offs.length ? h("div", { class: "offs" }, ...offs.map((o) => h("div", { class: "off" }, face(o.holder.name, st2.id, o.holder.look), h("div", {}, h("b", {}, officeJa(o.id)), h("small", {}, o.holder.name))))) : note("\u5F79\u8077\u306F\u307E\u3060\u5B9A\u3081\u3089\u308C\u3066\u3044\u307E\u305B\u3093\uFF08\u6A19\u6E96\u306E\u5F79\u8077\u3092\u7F6E\u3051\u307E\u3059\uFF09\u3002"));
    if (!can2) return box;
    const cur = new Set(offs.length ? offs.map((o) => o.id) : defaultOffices(rg)), set = S2.offEdit?.id === st2.id ? S2.offEdit.set : cur;
    S2.offEdit = { id: st2.id, set };
    box.append(h("details", { class: "dt", id: "off-edit" }, h("summary", {}, "\u5F79\u8077\u3092\u7D44\u307F\u66FF\u3048\u308B\uFF08\u3044\u3064\u3067\u3082\u30FB\u8CBB\u7528\u306A\u3057\uFF09"), h("div", { class: "wchips" }, ...R.offices.map((id) => h("label", { class: "b", style: "display:flex;gap:4px;align-items:center" }, h("input", { type: "checkbox", "data-office": id, checked: set.has(id), disabled: id === R.ruler, onchange: (e) => {
      e.target.checked ? set.add(id) : set.delete(id);
    } }), `${officeJa(id)}\uFF08${OFFICE_DOMAIN_JA[OFFICES[id][1]]}\uFF09`))), btn("\u3053\u306E\u5F79\u8077\u306B\u6539\u3081\u308B", () => {
      const list = R.offices.filter((x) => set.has(x));
      if (list.length < MIN_OFFICES || list.length > MAX_OFFICES) {
        S2.notice = `\u5F79\u8077\u306F ${MIN_OFFICES}\u301C${MAX_OFFICES} \u4EF6\u306B\u3057\u3066\u304F\u3060\u3055\u3044`;
        S2.hooks.panel();
        return;
      }
      if (mine) act({ type: "state.setOffices", offices: list });
      else creator({ type: "state.setOffices", stateId: st2.id, offices: list });
      S2.offEdit = null;
      S2.hooks.render();
    }, "p", { id: "off-apply" })));
    return box;
  }
  function uprisingBox(st2) {
    return h("div", {}, lb("\u53CD\u4E71\u30FB\u9769\u547D", "UPRISING"), h("div", { class: "rowb" }, btn("\u53CD\u4E71\u30FB\u9769\u547D\u3092\u8D77\u3053\u3059", () => {
      S2.upr = { stateId: st2.id, kind: S2.upr?.kind ?? Object.keys(UPRISING_KINDS)[0], open: true };
      S2.hooks.panel();
    }, "", { id: "upr-open" })));
  }
  function uprisingFull(st2) {
    const U3 = S2.upr, box = h("div", { class: "uprfull" }), sel = h("select", { id: "upr-kind", onchange: (e) => {
      U3.kind = e.target.value;
      U3.plan = null;
      S2.hooks.panel();
    } }, ...Object.entries(UPRISING_KINDS).map(([k, K]) => h("option", { value: k, selected: U3.kind === k }, K.ja)));
    box.append(h("div", { class: "kcards" }, ...Object.entries(UPRISING_KINDS).map(([k, K]) => h("div", { class: "kcard" + (U3.kind === k ? " on" : ""), onclick: () => {
      U3.kind = k;
      U3.plan = null;
      S2.hooks.panel();
    } }, h("b", {}, K.ja), h("small", {}, K.blurb)))), h("div", { class: "rowb" }, sel, btn("\u4E2D\u5FC3\u5730\u3092\u5730\u56F3\u304B\u3089\u9078\u3076", () => {
      U3.kind = sel.value;
      U3.picking = true;
      U3.open = false;
      S2.map.pins = null;
      notify("ok", "\u5730\u56F3\u3067\u3001\u53CD\u4E71\u306E\u4E2D\u5FC3\u5730\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u9996\u90FD\u4EE5\u5916\uFF09");
      S2.hooks.panel();
    }, "p", { id: "upr-pick" })));
    if (U3.plan) {
      const p = U3.plan, K = UPRISING_KINDS[p.kind], opt = K.state === "optional", st$ = K.state === "required" || opt && U3.asState;
      box.append(h(
        "div",
        { class: "card", id: "upr-plan" },
        h("b", {}, K.ja),
        h("div", { class: "pcols" }, h("div", {}, h("small", {}, "\u898F\u6A21"), h("b", {}, p.scaleLabel), h("small", {}, `\u53CD\u4E71\u5074 ${n0(p.rebelPop)}\uFF08\u56FD\u306E ${Math.round(p.share * 100)}%\uFF09`)), h("div", {}, h("small", {}, "\u898B\u901A\u3057"), h("b", {}, p.oddsLabel))),
        opt ? h("label", { class: "n" }, h("input", { type: "checkbox", id: "upr-state", checked: !!U3.asState, onchange: (e) => {
          U3.asState = e.target.checked;
          S2.hooks.panel();
        } }), " \u72EC\u7ACB\u3057\u305F\u56FD\u3092\u3064\u304F\u308B") : null,
        h("div", { class: "rowb" }, btn(st$ ? "\u56FD\u540D\u30FB\u653F\u4F53\u3092\u6C7A\u3081\u3066\u6C7A\u884C\u3059\u308B" : "\u65B0\u3057\u3044\u4F53\u5236\u3092\u6C7A\u3081\u3066\u6C7A\u884C\u3059\u308B", () => openWizard({ mode: st$ ? "rebel" : "reform", rebel: st$ ? { stateId: st2.id, kind: p.kind, cell: p.center.cell, plan: p } : null, reform: st$ ? null : { stateId: st2.id, kind: p.kind, cell: p.center.cell }, onDone: (r) => {
          S2.upr = null;
          if (S2.map) S2.map.pins = null;
          notify("ok", r.outcome === "new_state" ? "\u65B0\u3057\u3044\u56FD\u304C\u72EC\u7ACB\u3092\u5BA3\u8A00\u3057\u3001\u6226\u4E89\u306B\u306A\u308A\u307E\u3057\u305F" : r.outcome === "success" ? "\u9769\u547D\u304C\u6210\u529F\u3057\u3001\u65B0\u3057\u3044\u4F53\u5236\u306B\u306A\u308A\u307E\u3057\u305F" : "\u53CD\u4E71\u306F\u93AE\u5727\u3055\u308C\u307E\u3057\u305F");
          S2.hooks.render();
        } }), "p", { id: "upr-go" }))
      ));
    }
    return box;
  }
  function creatorBox(st2) {
    const c = civ2(), field = h("select", { id: "iv-field" }, ...Object.entries(FIELDS).map(([k, f2]) => h("option", { value: k }, `${DOMAIN_JA[f2.domain ?? { industry: "economy", perCapita: "economy", tradeIncome: "economy", foodBalance: "economy", taxRevenue: "economy", equipLevel: "military", readiness: "military", legitimacy: "politics", fatigue: "politics" }[k]] ?? ""}\u30FB${f2.ja}`))), other2 = h("select", { id: "iv-other", style: "display:none" }, ...aliveStates().filter((x) => x.id !== st2.id).sort((a, b) => b.pop - a.pop).slice(0, 60).map((x) => h("option", { value: x.id }, x.name))), val = h("input", { id: "iv-val", type: "number", step: "any", style: "width:90px" }), half = h("input", { id: "iv-half", type: "number", placeholder: "\u534A\u6E1B\u671F(\u6708)", style: "width:90px" }), rsn = h("input", { id: "iv-why", placeholder: "\u7406\u7531\u306E\u6CE8\u91C8" }), info = h("p", { class: "n", id: "iv-info" });
    const upd = () => {
      const k = field.value, pair = !!FIELDS[k].pair;
      other2.style.display = pair ? "" : "none";
      const o = pair ? other2.value : null, nm = nominalOf(c, st2, k, o);
      info.textContent = nm == null ? "\u307E\u3060\u7B97\u51FA\u3055\u308C\u3066\u3044\u307E\u305B\u3093" : `\u901A\u5E38\u8A08\u7B97\u5024 ${r23(nm)}\u30FB\u6709\u52B9\u5024 ${r23(effective(c, st2, k, o))}\u30FB\u7BC4\u56F2 ${FIELDS[k].min}\u301C${FIELDS[k].max}\u30FB\u65E2\u5B9A\u306E\u534A\u6E1B\u671F ${FIELDS[k].half}\u304B\u6708`;
    };
    field.addEventListener("change", upd);
    other2.addEventListener("change", upd);
    setTimeout(upd, 0);
    const mineIv = interventionsOf(c).filter((r) => r.targetId === st2.id).slice(-6).reverse();
    return h(
      "div",
      {},
      lb("\u5275\u9020\u4E3B\u306E\u4ECB\u5165", "INTERVENTION"),
      note("\u8A08\u7B97\u3055\u308C\u308B\u5024\u306B\u4E00\u6642\u7684\u306A\u88DC\u6B63\u3092\u5165\u308C\u307E\u3059\u3002\u88DC\u6B63\u306F\u6642\u9593\u3068\u3068\u3082\u306B\u901A\u5E38\u5024\u3078\u623B\u308A\u307E\u3059\u304C\u3001\u4ECB\u5165\u4E2D\u306B\u8D77\u304D\u305F\u7D50\u679C\u306F\u623B\u308A\u307E\u305B\u3093\u3002"),
      h("div", { class: "rowb" }, field, other2, val, half),
      rsn,
      h("div", { class: "rowb" }, btn("\u4ECB\u5165\u3059\u308B", () => creator({ type: "creator.intervene", stateId: st2.id, field: field.value, otherId: FIELDS[field.value].pair ? other2.value : null, value: Number(val.value), halfLifeMonths: half.value ? Number(half.value) : null, reason: rsn.value }), "p", { id: "iv-go" })),
      info,
      ...mineIv.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `${FIELDS[r.field]?.ja ?? r.field}${r.otherId ? "\uFF08\u2192" + stateName(r.otherId) + "\uFF09" : ""} \u2192 ${r23(r.target)}`, h("br"), h("small", {}, `${{ active: "\u6709\u52B9\uFF08\u6B8B\u308A " + r23(r.residual) + "\uFF09", converged: "\u53CE\u675F", superseded: "\u7F6E\u304D\u63DB\u3048", cancelled: "\u53D6\u308A\u6D88\u3057", target_gone: "\u5BFE\u8C61\u6D88\u6EC5" }[r.status]}\u30FB${date(r.startMonth)}${r.reason ? "\u30FB" + r.reason : ""}`)), r.status === "active" ? btn("\u53D6\u308A\u6D88\u3059", () => creator({ type: "creator.cancelIntervention", id: r.id })) : null))
    );
  }
  function techStatus(st2) {
    const c = civ2(), groups = Object.values(c.groups).filter((g) => g.stateId === st2.id), total = groups.reduce((a, g) => a + g.pop, 0) || 1, have = {}, lostHere = /* @__PURE__ */ new Set();
    for (const g of groups) {
      for (const k in g.tech?.known ?? {}) have[k] = (have[k] ?? 0) + g.pop;
      for (const k in g.tech?.lost ?? {}) lostHere.add(k);
    }
    const cov = (k) => (have[k] ?? 0) / total, f2 = (t) => st2.techAdopted?.[t.key] != null ? "adopted" : cov(t.key) >= 0.3 ? "available" : cov(t.key) > 0 ? "known" : lostHere.has(t.key) ? "lost" : "locked";
    f2.cov = cov;
    return f2;
  }
  var CAP_JA = { "polity:chiefdom": "\u9996\u9577\u5236\u3078", "polity:kingdom": "\u738B\u56FD\u3078", "polity:republic": "\u5171\u548C\u653F\u3078", "polity:empire": "\u5E1D\u56FD\u3078", "action:found_city": "\u90FD\u5E02\u3092\u5EFA\u8A2D\u3067\u304D\u308B", "action:build_fortification": "\u8981\u585E\u3092\u6574\u5099\u3067\u304D\u308B", "action:covert_op": "\u79D8\u5BC6\u5DE5\u4F5C", "action:impose_sanctions": "\u7D4C\u6E08\u5236\u88C1", "action:nuclear_program": "\u6838\u8A08\u753B", "treaty:nonaggression": "\u4E0D\u53EF\u4FB5\u6761\u7D04", "treaty:alliance": "\u540C\u76DF", "treaty:trade": "\u4EA4\u6613\u6761\u7D04", "unit:ranged": "\u5F13\u30FB\u6295\u5C04\u5175", "unit:cavalry": "\u9A0E\u5175", "unit:navy": "\u6C34\u8ECD", "unit:garrison": "\u5B88\u5099\u5175", "unit:firearms": "\u9283\u5175", "unit:armor": "\u6A5F\u7532", "unit:air": "\u822A\u7A7A", "econ:coinage": "\u8CA8\u5E63\u7D4C\u6E08", "econ:credit": "\u4FE1\u7528\u30FB\u91D1\u878D", "subsist:agriculture": "\u8FB2\u8015", "subsist:pastoral": "\u7267\u755C", "subsist:fishing": "\u6F01\u6488", "move:sea": "\u6D77\u3092\u6E21\u308B", "move:ocean": "\u5916\u6D0B\u822A\u6D77", "trade:land_long": "\u9678\u306E\u9060\u8DDD\u96E2\u4EA4\u6613", "trade:sea_long": "\u6D77\u306E\u9060\u8DDD\u96E2\u4EA4\u6613", "trade:rail": "\u9244\u9053\u8F38\u9001", "admin:records": "\u8A18\u9332", "admin:officials": "\u5B98\u8077", "admin:courier": "\u516C\u306E\u901A\u4FE1\u7DB2", "admin:land_survey": "\u571F\u5730\u306E\u6E2C\u91CF", "war:far": "\u9060\u5F81\u306E\u88DC\u7D66", "war:naval": "\u6D77\u6226", "pop:cold": "\u5BD2\u51B7\u5730\u306B\u4F4F\u3081\u308B", "pop:steppe": "\u8349\u539F\u3067\u751F\u304D\u308B", "storage:pottery": "\u8CAF\u8535", "policy:tax_high": "\u9AD8\u3044\u7A0E\u7387", "policy:parliament": "\u8B70\u4F1A\u5236" };
  var FX_JA2 = { cap: "\u53CE\u5BB9\u529B", tax: "\u7A0E\u53CE", trade: "\u4EA4\u6613", ind: "\u7523\u696D\u529B", off: "\u653B\u6483", def: "\u9632\u5FA1", health: "\u885B\u751F", learn: "\u5B66\u7FD2\u30FB\u4F1D\u64AD" };
  var TECH_LANE = null;
  var TECH_Q = "";
  var TECH_FULL = false;
  var TECH_VB = null;
  var DOC_VB = null;
  function tTech(st2, mine) {
    const c = civ2(), status = techStatus(st2), sel = TECH[S2.tech] ?? null, q2 = TECH_Q.trim(), hit = q2 ? new Set(TECHS.filter((t) => t.name.includes(q2) || t.key.includes(q2) || t.field.includes(q2)).map((t) => t.key)) : null;
    const tree = techTree({ techs: TECHS, status, selected: S2.tech, lane: TECH_LANE, hit, vb0: TECH_VB, onView: (v) => {
      TECH_VB = v;
    }, onPick: (t) => {
      S2.tech = t.key;
      S2.hooks.panel();
    } }), { svg, COL, SYM } = tree, s = sel && status(sel);
    const lab = { adopted: "\u5236\u5EA6\u5316\u6E08\u307F\uFF08\u3053\u306E\u56FD\u304C\u63A1\u7528\uFF09", available: "\u63A1\u7528\u3067\u304D\u308B\uFF08\u56FD\u5185\u306E\u4EBA\u53E3\u306E 3 \u5272\u4EE5\u4E0A\u304C\u77E5\u3063\u3066\u3044\u308B\uFF09", known: "\u4FDD\u6709\uFF08\u4E00\u90E8\u306E\u96C6\u56E3\u3060\u3051\u304C\u77E5\u308B\u3002\u56FD\u3068\u3057\u3066\u306F\u307E\u3060\u63A1\u7528\u3067\u304D\u306A\u3044\uFF09", lost: "\u5931\u308F\u308C\u305F\uFF08\u304B\u3064\u3066\u77E5\u3063\u3066\u3044\u305F\u304C\u3001\u4ECA\u306F\u8AB0\u3082\u77E5\u3089\u306A\u3044\uFF09", locked: "\u672A\u767A\u898B" };
    const laneBtns = [btn("\u3059\u3079\u3066", () => {
      TECH_LANE = null;
      S2.hooks.panel();
    }, TECH_LANE ? "" : "p"), ...LANES.map((l) => btn(l.ja.slice(0, 5), () => {
      TECH_LANE = l.id;
      S2.hooks.panel();
    }, TECH_LANE === l.id ? "p" : ""))];
    const search = h("input", { type: "search", placeholder: "\u6280\u8853\u540D\u30FB\u5206\u91CE\u3067\u63A2\u3059", value: TECH_Q, style: "width:100%", oninput: (e) => {
      TECH_Q = e.target.value;
      clearTimeout(search._t);
      search._t = setTimeout(() => {
        S2.hooks.panel();
        document.querySelector("#tech-q")?.focus();
      }, 250);
    }, id: "tech-q" });
    let detail = note("\u30CE\u30FC\u30C9\u3092\u9078\u3076\u3068\u3001\u524D\u63D0\u30FB\u6210\u7ACB\u306E\u6761\u4EF6\u30FB\u89E3\u7981\u3055\u308C\u308B\u3053\u3068\u30FB\u52B9\u679C\u30FB\u4E16\u754C\u3067\u306E\u5E83\u304C\u308A\u304C\u51FA\u307E\u3059\u3002");
    if (sel) {
      const gs = Object.values(c.groups).filter((g) => g.stateId === st2.id), cov = Math.round(status.cov(sel.key) * 100), w = c.techWorld[sel.key], deps = TECHS.filter((t) => t.prereq.includes(sel.key)), gate = actionGate(c, st2, "adopt_tech");
      const needs = sel.prereq.map((p) => {
        const t = TECH[p];
        return `${st2.techAdopted?.[p] != null ? "\u25A0" : status.cov(p) > 0 ? "\u25C7" : "\u25CB"} ${t?.name ?? p}`;
      }).join("\u3000");
      const unl = sel.caps.map((x) => CAP_JA[x] ?? x), fx3 = Object.entries(sel.fx).map(([k, v]) => `${FX_JA2[k] ?? k} +${Math.round(v * 100)}%`);
      detail = h(
        "div",
        { class: "dt" },
        h("b", {}, sel.name),
        `\u3000${sel.field}`,
        h("br"),
        `${SYM[s]} ${lab[s]}`,
        h("br"),
        `\u56FD\u5185\u306E\u666E\u53CA ${cov}%\uFF08\u63A1\u7528\u306B\u306F 30% \u4EE5\u4E0A\uFF09`,
        h("br"),
        `\u524D\u63D0: ${needs || "\u306A\u3057"}`,
        h("br"),
        sel.minPop || sel.settled || sel.condKey ? `\u6210\u7ACB\u306E\u6761\u4EF6: ${[sel.minPop ? `\u96C6\u56E3\u306E\u898F\u6A21 ${n0(sel.minPop)} \u4EBA\u4EE5\u4E0A` : null, sel.settled ? "\u5B9A\u4F4F" : null, sel.condKey ? COND_JA(sel.condKey) : null].filter(Boolean).join("\u30FB")}` : "\u6210\u7ACB\u306E\u6761\u4EF6: \u7279\u306B\u306A\u3057",
        h("br"),
        sel.why ? `\u80CC\u666F: ${sel.why}` : "",
        sel.why ? h("br") : "",
        unl.length ? `\u89E3\u7981: ${unl.join("\u30FB")}` : "",
        unl.length ? h("br") : "",
        fx3.length ? `\u52B9\u679C: ${fx3.join("\u30FB")}` : "",
        fx3.length ? h("br") : "",
        `\u8AAC\u660E: ${sel.desc}`,
        h("br"),
        w ? `\u4E16\u754C: ${w.first != null ? formatDate(civ2().wcde.config.calendar, w.first) + "\u306B\u521D\u51FA" : ""}\u30FB\u72EC\u7ACB\u306E\u767A\u898B ${w.independent ?? 0} \u56DE\u30FB\u4F1D\u64AD ${w.spread ?? 0} \u4EF6${Object.keys(w.byChannel ?? {}).length ? "\uFF08" + Object.entries(w.byChannel).map(([k, v]) => `${{ contact: "\u63A5\u89E6", trade: "\u4EA4\u6613", teaching: "\u6559\u80B2", conquest: "\u4F75\u5408" }[k] ?? k} ${v}`).join("\u30FB") + "\uFF09" : ""}` : "\u4E16\u754C: \u307E\u3060\u8AB0\u3082\u767A\u898B\u3057\u3066\u3044\u306A\u3044",
        h("br"),
        deps.length ? `\u3053\u306E\u6280\u8853\u3092\u524D\u63D0\u3068\u3059\u308B: ${deps.map((t) => t.name).join("\u30FB")}` : "\u5F8C\u7D9A\u306E\u6280\u8853\u306F\u306A\u3044",
        h("br"),
        h("small", { style: "color:var(--dim)" }, "\u6280\u8853\u306E\u63A1\u7528\u306F\u3001\u4E16\u754C\u306E\u4ED5\u7D44\u307F\u304C\u81EA\u52D5\u3067\u884C\u3044\u307E\u3059")
      );
    }
    document.querySelectorAll(".techwrap.full").forEach((e) => e.remove());
    const wrap = h("div", { class: "techwrap" + (TECH_FULL ? " full" : "") }), big = btn(TECH_FULL ? "\u9589\u3058\u308B" : "\u62E1\u5927\u8868\u793A", () => {
      TECH_FULL = !TECH_FULL;
      S2.hooks.panel();
    });
    wrap.append(svg, h("div", { class: "rowb" }, big, btn("\u5168\u4F53", tree.fit), btn("\u5DE6\u7AEF", tree.left), btn("\u6700\u524D\u7DDA", tree.frontier), btn("\u9078\u3093\u3060\u6280\u8853\u3078", () => S2.tech && tree.focus(S2.tech), "", { id: "tech-goto", disabled: !S2.tech }), q2 && hit?.size ? btn(`\u691C\u7D22\u7D50\u679C\u3078\uFF08${hit.size} \u4EF6\uFF09`, () => tree.focus([...hit][0]), "", { id: "tech-goto-hit" }) : null), detail);
    if (TECH_FULL) {
      document.body.append(wrap);
      tree.frontier();
    }
    return h(
      "div",
      {},
      search,
      h("div", { class: "rowb", style: "flex-wrap:wrap" }, ...laneBtns),
      TECH_FULL ? note("\u62E1\u5927\u8868\u793A\u4E2D\u3067\u3059\uFF08\u753B\u9762\u3044\u3063\u3071\u3044\uFF09\u3002\u53F3\u306E\u300C\u9589\u3058\u308B\u300D\u3067\u623B\u308C\u307E\u3059\u3002") : wrap,
      h("div", { class: "lg" }, ...Object.entries({ adopted: "\u5236\u5EA6\u5316", available: "\u63A1\u7528\u3067\u304D\u308B", known: "\u4FDD\u6709", lost: "\u5931\u308F\u308C\u305F", locked: "\u672A\u767A\u898B" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px ${k === "locked" ? "dashed" : "solid"} ${COL[k][0]}` }), `${SYM[k]} ${t}`)))
    );
  }
  var COND_JA = (k) => COND[k]?.ja ?? k;
  function tDoctrine(st2, mine) {
    const M = st2.military, taken = M?.doctrine?.taken ?? {}, nodes2 = nodesOf(st2), branches = branchesOf(st2), status = (d) => taken[d.id] != null ? "taken" : canAdopt(st2, d.id).ok ? "available" : "blocked", sel = nodeOf(st2, S2.doc) ?? null, dt = doctrineTree({ nodes: nodes2, branches, status, selected: S2.doc, vb0: DOC_VB, onView: (v) => {
      DOC_VB = v;
    }, onPick: (d) => {
      S2.doc = d.id;
      S2.hooks.panel();
    } }), { svg, COL } = dt;
    const fxText = (d) => Object.entries(d.fx).map(([k, v]) => `${FX_JA[k] ?? k} +${pct(v)}`).join("\u30FB");
    const fx3 = M?.fx ?? {}, now = Object.entries(fx3).filter(([, v]) => v > 0).map(([k, v]) => `${FX_JA[k] ?? k} +${pct(v)}`).join("\u30FB") || "\u306A\u3057";
    return h(
      "div",
      {},
      h("div", { class: "dt" }, `\u3044\u307E\u306E\u52B9\u679C: ${now}`),
      h("div", { class: "docwrap" }, svg, h("div", { class: "rowb" }, btn("\u5168\u4F53", dt.fit, "", { id: "doc-fit" }), btn("\u9078\u3093\u3060\u65B9\u91DD\u3078", () => S2.doc && dt.focus(S2.doc), "", { id: "doc-goto", disabled: !S2.doc }))),
      h("div", { class: "lg" }, ...Object.entries({ taken: "\u25A0 \u53D6\u5F97\u6E08\u307F", available: "\u25C6 \u53D6\u5F97\u3067\u304D\u308B", blocked: "\u25CB \u6761\u4EF6\u304C\u8DB3\u308A\u306A\u3044\uFF08\u70B9\u7DDA\uFF09" }).map(([k, t]) => h("span", {}, h("i", { style: `background:${COL[k][1]};border:1px ${k === "blocked" ? "dashed" : "solid"} ${COL[k][0]}` }), t))),
      sel ? (() => {
        const ca = canAdopt(st2, sel.id), br = branches.find((b) => b.id === sel.branch);
        return h("div", { class: "dt" }, h("b", {}, sel.ja), `\uFF08${br?.ja ?? ""}\u30FB\u6BB5\u968E ${sel.tier}${sel.special ? "\u30FB\u56FA\u6709" : "\u30FB\u5171\u901A"}\uFF09`, h("br"), `\u52B9\u679C: ${fxText(sel)}\u30FB\u8CBB\u7528 ${sel.cost}`, h("br"), `\u524D\u63D0: ${sel.prereq.length ? sel.prereq.map((p) => nodeOf(st2, p)?.ja ?? p).join("\u3001") : "\u306A\u3057"}${sel.tech.length ? "\u3000\u6280\u8853: " + sel.tech.map((t) => TECH[t]?.name ?? t).join("\u3001") : ""}`, h("br"), taken[sel.id] != null ? "\u53D6\u5F97\u6E08\u307F" : ca.ok ? "\u53D6\u5F97\u3067\u304D\u307E\u3059" : `\u53D6\u5F97\u3067\u304D\u306A\u3044\u7406\u7531: ${ca.reason}`, h("small", { style: "color:var(--dim)" }, "\u53D6\u5F97\u306F\u3001\u4E16\u754C\u306E\u4ED5\u7D44\u307F\u304C\u81EA\u52D5\u3067\u884C\u3044\u307E\u3059"));
      })() : note("\u6728\u306E\u30CE\u30FC\u30C9\u3092\u9078\u3076\u3068\u3001\u52B9\u679C\u3068\u524D\u63D0\u304C\u51FA\u307E\u3059\u3002")
    );
  }

  // js/ui/v6/alliance.js
  var W = 392;
  var PH = 24;
  var GAPX = 8;
  var ROWGAP = 30;
  var TOP = 18;
  var MAX_MEMBERS = 24;
  var MAX_BLOCS = 12;
  var textWidth = (s) => [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) < 256 ? 7 : 12.5), 0);
  function allianceBlocs(civ6) {
    const adj = /* @__PURE__ */ new Map(), edges = [];
    const link2 = (a, b) => {
      (adj.get(a) ?? adj.set(a, /* @__PURE__ */ new Set()).get(a)).add(b);
    };
    for (const i of civ6.activeTreatyIds) {
      const t = civ6.treaties[i];
      if (!t || t.type !== "alliance" || !civ6.states[t.a]?.alive || !civ6.states[t.b]?.alive) continue;
      edges.push([t.a, t.b]);
      link2(t.a, t.b);
      link2(t.b, t.a);
    }
    const seen = /* @__PURE__ */ new Set(), blocs = [];
    for (const id of [...adj.keys()].sort()) {
      if (seen.has(id)) continue;
      const members2 = [], q2 = [id];
      seen.add(id);
      while (q2.length) {
        const x = q2.shift();
        members2.push(x);
        for (const y of [...adj.get(x)].sort()) if (!seen.has(y)) {
          seen.add(y);
          q2.push(y);
        }
      }
      const deg = (x) => adj.get(x).size, pop = (x) => civ6.states[x].pop;
      members2.sort((a, b) => deg(b) - deg(a) || pop(b) - pop(a) || (a < b ? -1 : 1));
      blocs.push({ members: members2, leader: members2[0], pop: members2.reduce((a, x) => a + pop(x), 0), edges: edges.filter(([a, b]) => members2.includes(a)), deg });
    }
    blocs.sort((a, b) => b.members.length - a.members.length || b.pop - a.pop);
    const of = /* @__PURE__ */ new Map();
    blocs.forEach((b, k) => b.members.forEach((m) => of.set(m, k)));
    const hostile = blocs.map(() => /* @__PURE__ */ new Map());
    for (const wid of civ6.activeWarIds) {
      const w = civ6.wars[wid];
      if (!w) continue;
      const ka = new Set(w.sides.a.map((x) => of.get(x)).filter((k) => k != null)), kd = new Set(w.sides.d.map((x) => of.get(x)).filter((k) => k != null));
      for (const a of ka) for (const d of kd) if (a !== d) {
        hostile[a].set(d, (hostile[a].get(d) ?? 0) + 1);
        hostile[d].set(a, (hostile[d].get(a) ?? 0) + 1);
      }
    }
    blocs.forEach((b, k) => {
      b.hostile = [...hostile[k].entries()].map(([o, n2]) => ({ bloc: o, wars: n2 }));
    });
    return blocs;
  }
  var blocName = (civ6, bloc) => `${civ6.states[bloc.leader].name}\u570F`;
  function layoutBloc(civ6, bloc) {
    var _a;
    const shown = bloc.members.slice(0, MAX_MEMBERS), set = new Set(shown), adj = new Map(shown.map((m) => [m, /* @__PURE__ */ new Set()]));
    for (const [a, b] of bloc.edges) if (set.has(a) && set.has(b)) {
      adj.get(a).add(b);
      adj.get(b).add(a);
    }
    const depth = /* @__PURE__ */ new Map([[bloc.leader, 0]]), q2 = [bloc.leader];
    while (q2.length) {
      const x = q2.shift();
      for (const y of adj.get(x)) if (!depth.has(y)) {
        depth.set(y, depth.get(x) + 1);
        q2.push(y);
      }
    }
    for (const m of shown) if (!depth.has(m)) depth.set(m, 1 + Math.max(...depth.values()));
    const layers = [];
    for (const m of shown) (layers[_a = depth.get(m)] ?? (layers[_a] = [])).push(m);
    const wOf = (id) => Math.min(W - 8, 24 + textWidth(civ6.states[id].name) + (id === bloc.leader ? 14 : 0)), pos = /* @__PURE__ */ new Map();
    let row = 0;
    for (const layer of layers.filter(Boolean)) {
      layer.sort((a, b) => bloc.deg(b) - bloc.deg(a) || civ6.states[b].pop - civ6.states[a].pop || (a < b ? -1 : 1));
      const rows = [];
      let cur = [], cw = 0;
      for (const id of layer) {
        const w = wOf(id);
        if (cur.length && cw + GAPX + w > W - 8) {
          rows.push(cur);
          cur = [];
          cw = 0;
        }
        cw += (cur.length ? GAPX : 0) + w;
        cur.push(id);
      }
      if (cur.length) rows.push(cur);
      for (const r of rows) {
        const tot = r.reduce((a, id, i) => a + wOf(id) + (i ? GAPX : 0), 0);
        let x = (W - tot) / 2;
        for (const id of r) {
          const w = wOf(id);
          pos.set(id, { x, y: TOP + row * (PH + ROWGAP), w, row });
          x += w + GAPX;
        }
        row++;
      }
    }
    return { pos, rows: row, height: TOP + row * (PH + ROWGAP) - ROWGAP + 8, hidden: bloc.members.length - shown.length, shown: set };
  }
  function drawBloc(civ6, bloc, L, onPick) {
    const g = sv("svg", { viewBox: `0 0 ${W} ${L.height}`, width: "100%", class: "gr bloc", role: "img", "aria-label": `${blocName(civ6, bloc)}\u306E\u540C\u76DF\u95A2\u4FC2` });
    for (const [a, b] of bloc.edges) {
      const pa = L.pos.get(a), pb = L.pos.get(b);
      if (!pa || !pb) continue;
      const ax = pa.x + pa.w / 2, bx = pb.x + pb.w / 2;
      let d;
      if (pa.row === pb.row) d = `M${ax} ${pa.y} C${ax} ${pa.y - 20} ${bx} ${pb.y - 20} ${bx} ${pb.y}`;
      else {
        const [u, l] = pa.row < pb.row ? [pa, pb] : [pb, pa], ux = u.x + u.w / 2, lx = l.x + l.w / 2, y1 = u.y + PH, y2 = l.y;
        d = `M${ux} ${y1} C${ux} ${y1 + ROWGAP * 0.65} ${lx} ${y2 - ROWGAP * 0.65} ${lx} ${y2}`;
      }
      g.append(sv("path", { d, fill: "none", stroke: "#6fa8c9", "stroke-width": 1.7, "stroke-opacity": 0.85 }));
    }
    for (const id of L.shown) {
      const p = L.pos.get(id), s = civ6.states[id], lead = id === bloc.leader, war = (s.warIds?.length ?? 0) > 0;
      g.append(sv(
        "g",
        { class: "fn", onclick: () => onPick(id) },
        sv("title", {}, `${s.name}${lead ? "\uFF08\u76DF\u4E3B\uFF09" : ""}\u30FB\u540C\u76DF ${bloc.deg(id)} \u304B\u56FD\u30FB\u4EBA\u53E3 ${n0(s.pop)}${war ? "\u30FB\u4EA4\u6226\u4E2D" : ""}`),
        sv("rect", { x: p.x, y: p.y, width: p.w, height: PH, rx: 3, fill: "#161a1f", stroke: war ? "#d0605a" : colorOf(id), "stroke-width": lead ? 2.4 : 1.5, "stroke-dasharray": war ? "4 2" : null }),
        sv("circle", { cx: p.x + 11, cy: p.y + PH / 2, r: 4.5, fill: colorOf(id) }),
        sv("text", { x: p.x + 21, y: p.y + PH / 2 + 4.2, "font-size": 12, fill: "#d9d6cc" }, lead ? sv("tspan", { fill: "#d8b45a" }, "\u2605 ") : null, s.name)
      ));
    }
    return g;
  }
  function allianceDiagram(civ6, onPick) {
    const blocs = allianceBlocs(civ6), box = h("div", { class: "blocs" });
    if (!blocs.length) {
      box.append(h("p", { class: "n" }, "\u540C\u76DF\u306F\u3042\u308A\u307E\u305B\u3093"));
      return box;
    }
    const members2 = blocs.reduce((a, b) => a + b.members.length, 0), clashes = blocs.reduce((a, b) => a + b.hostile.length, 0) / 2;
    box.append(h("p", { class: "n" }, `\u540C\u76DF\u3067\u3064\u306A\u304C\u3063\u305F\u56FD\u3092 1 \u3064\u306E\u9663\u55B6\uFF08\u570F\uFF09\u3068\u3057\u3066\u307E\u3068\u3081\u3066\u3044\u307E\u3059\u3002\u9663\u55B6 ${blocs.length} \u3064\u30FB\u52A0\u76DF ${members2} \u304B\u56FD${clashes ? `\u30FB\u9663\u55B6\u3069\u3046\u3057\u306E\u5BFE\u7ACB ${clashes} \u7D44` : ""}\u3002\u4E0A\u306E\u6BB5\u307B\u3069\u76DF\u4E3B\uFF08\u2605\uFF09\u306B\u8FD1\u304F\u3001\u9752\u3044\u7DDA\u304C\u540C\u76DF\u3001\u8D64\u3044\u7834\u7DDA\u306E\u672D\u306F\u4EA4\u6226\u4E2D\u306E\u56FD\u3067\u3059\u3002`));
    for (const bloc of blocs.slice(0, MAX_BLOCS)) {
      const L = layoutBloc(civ6, bloc), foes = bloc.hostile.map((x) => `${blocName(civ6, blocs[x.bloc])}\uFF08${x.wars} \u4EF6\uFF09`);
      box.append(h(
        "div",
        { class: "card bloc-card" },
        h("div", { class: "bh" }, h("b", {}, blocName(civ6, bloc)), h("small", {}, ` ${bloc.members.length}\u304B\u56FD\u30FB\u4EBA\u53E3 ${n0(bloc.pop)}`)),
        foes.length ? h("div", { class: "bw" }, `\u4EA4\u6226\u4E2D: ${foes.join("\u30FB")}`) : null,
        drawBloc(civ6, bloc, L, onPick),
        L.hidden > 0 ? h("small", { style: "color:var(--dim)" }, `\u307B\u304B ${L.hidden} \u304B\u56FD\uFF08\u540C\u76DF\u306E\u5C11\u306A\u3044\u56FD\u306F\u7701\u7565\uFF09`) : null
      ));
    }
    if (blocs.length > MAX_BLOCS) box.append(h("p", { class: "n" }, `\u307B\u304B ${blocs.length - MAX_BLOCS} \u3064\u306E\u9663\u55B6\uFF08\u5C0F\u3055\u3044\u9806\u306B\u7701\u7565\uFF09`));
    return box;
  }

  // js/ui/v6/diplo.js
  var civ3 = () => S2.w.civ;
  var date2 = (mi) => formatWorldDate(S2.w, mi);
  var yr = (mi) => date2(mi).split("\u6708")[0] + "\u6708";
  var TCOL = { alliance: "#6fa8c9", nonaggression: "#9fbf8a", trade: "#d8b45a", war: "#d0605a", sanctions: "#a58bd0" };
  var TJA = { alliance: "\u540C\u76DF", nonaggression: "\u4E0D\u53EF\u4FB5", trade: "\u901A\u5546", war: "\u6226\u4E89", sanctions: "\u5236\u88C1" };
  var relCol = (v) => v >= 40 ? "#6fa8c9" : v >= 10 ? "#9fbf8a" : v > -10 ? "#6a6f78" : v > -40 ? "#d8b45a" : "#d0605a";
  var peaceKey = (p) => `${p.warId}|${p.at}|${p.from}`;
  var peacesOf = () => proposalsOf(civ3()).filter((p) => p.kind === "peace" && p.status === "accepted").sort((x, y) => y.at - x.at);
  var peaceName = (p) => p.name ?? "\u8B1B\u548C\u6761\u7D04";
  var tabs = () => [["rel", "\u95A2\u4FC2"], ["ally", "\u540C\u76DF"], ["peace", "\u8B1B\u548C\u6761\u7D04"]];
  function pDiplo() {
    const tab = S2.dtab ?? "rel", box = h("div", {}, h("div", { class: "code" }, "DIPLOMACY"), h("h2", {}, "\u5916\u4EA4"), h("div", { class: "tabs" }, ...tabs().map(([k, ja]) => h("b", { class: tab === k ? "on" : "", "data-dtab": k, onclick: () => {
      S2.dtab = k;
      S2.dip = null;
      S2.peaceSel = null;
      S2.hooks.panel();
    } }, ja))));
    box.append(tab === "ally" ? allyTab() : tab === "peace" ? peaceTab() : relTab());
    return box;
  }
  function relTab() {
    const c = civ3(), me = controlled(), pick2 = S2.dip?.b;
    if (pick2 && c.states[pick2]) return pairView(me ?? S2.dip.a ?? aliveStates().sort((a, b) => b.pop - a.pop)[0]?.id, pick2);
    const base = c.states[me] ?? aliveStates().sort((a, b) => b.pop - a.pop)[0];
    if (!base) return h("p", { class: "n" }, "\u56FD\u5BB6\u304C\u3042\u308A\u307E\u305B\u3093");
    const rows = aliveStates().filter((s) => s.id !== base.id).map((s) => ({ s, v: Math.round(base.relations[s.id] ?? 0), war: atWarWith(c, base, s), ally: !!treatyBetween(c, base, s, "alliance") })).sort((a, b) => b.war - a.war || b.ally - a.ally || b.s.pop - a.s.pop);
    return h(
      "div",
      {},
      h("div", { class: "pairhd" }, flag(base.id, 44), h("b", {}, base.name), h("small", {}, me ? "\u3042\u306A\u305F\u306E\u56FD" : "\uFF08\u898B\u5B88\u308A\u4E2D: \u56FD\u3092\u9078\u3076\u3068\u95A2\u4FC2\u304C\u898B\u3048\u308B\uFF09")),
      vlist(rows, 40, (r) => h(
        "div",
        { class: "drow", onmouseenter: () => {
          S2.map.hl = { type: "states", id: r.s.id };
          S2.map.draw();
        }, onmouseleave: () => {
          S2.map.hl = null;
          S2.map.draw();
        }, onclick: () => {
          S2.dip = { a: base.id, b: r.s.id };
          S2.hooks.panel();
        } },
        flag(r.s.id, 34),
        h("span", { class: "nm" }, r.s.name),
        r.war ? h("span", { class: "tag war", title: "\u4EA4\u6226\u4E2D" }, icon("sword", 13)) : null,
        r.ally ? h("span", { class: "tag ally", title: "\u540C\u76DF" }, icon("link", 13)) : null,
        h("span", { class: "relbar", title: `\u95A2\u4FC2 ${r.v}` }, h("i", { style: `left:${50 + r.v / 2}%;background:${relCol(r.v)}` }))
      ))
    );
  }
  function pairView(aId, bId) {
    const c = civ3(), A2 = c.states[aId], B = c.states[bId], me = controlled() === aId, v = Math.round(A2.relations[bId] ?? 0), war = atWarWith(c, A2, B), tr = (t) => treatyBetween(c, A2, B, t), mi = c.monthIndex;
    const out = h(
      "div",
      { class: "pair" },
      h("div", { class: "back", onclick: () => {
        S2.dip = null;
        S2.map.hl = null;
        S2.hooks.panel();
      } }, "\u2190 \u56FD\u306E\u4E00\u89A7"),
      h("div", { class: "vsrow" }, h("div", { class: "side" }, flag(A2.id, 56), h("b", {}, A2.name)), h("div", { class: "mid" }, h("span", { class: "relbar big" }, h("i", { style: `left:${50 + v / 2}%;background:${relCol(v)}` })), h("small", {}, `\u95A2\u4FC2 ${v}`)), h("div", { class: "side" }, flag(B.id, 56), h("b", { onclick: () => S2.hooks.select(B.id), style: "cursor:pointer" }, B.name))),
      h("div", { class: "chips" }, ...["alliance", "nonaggression", "trade"].filter((t) => tr(t)).map((t) => h("span", { class: "chip", style: `border-color:${TCOL[t]}` }, TJA[t])), war ? h("span", { class: "chip", style: `border-color:${TCOL.war}` }, "\u4EA4\u6226\u4E2D") : null, (B.sanctions?.[A2.id] ?? 0) > mi ? h("span", { class: "chip", style: `border-color:${TCOL.sanctions}` }, "\u5236\u88C1\u3092\u53D7\u3051\u3066\u3044\u308B") : null, (A2.sanctions?.[B.id] ?? 0) > mi ? h("span", { class: "chip", style: `border-color:${TCOL.sanctions}` }, "\u5236\u88C1\u4E2D") : null)
    );
    const mk = (key, label, ic, reason, go, id) => h("div", { class: "act" + (reason ? " off" : "") }, h("button", { class: "b abtn", id, disabled: !!reason, onclick: go }, icon(ic, 20), h("span", {}, label)), reason ? h("small", {}, reason) : null);
    const none = !me ? controlled() ? "\u62C5\u5F53\u56FD\u4EE5\u5916\u306B\u306F\u884C\u3048\u307E\u305B\u3093" : "\u62C5\u5F53\u56FD\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u898B\u5B88\u308A\u4E2D\uFF09" : null;
    const treat = (type, label, ic) => {
      const have = tr(type);
      const why2 = none ?? (have ? "\u3059\u3067\u306B\u7D50\u3093\u3067\u3044\u308B" : treatyFeasible(c, A2, B, type));
      let ev = null;
      if (!why2) ev = evaluateTreaty(c, A2, B, type);
      return mk(type, label + (ev ? ev.accept ? "\uFF08\u53D7\u3051\u5165\u308C\u305D\u3046\uFF09" : "\uFF08\u65AD\u3089\u308C\u305D\u3046\uFF09" : ""), ic, why2, () => act({ type: "state.act", stateId: A2.id, action: "sign_treaty", target: B.id, opt: type }), "dp-" + type);
    };
    const acts = h(
      "div",
      { class: "acts" },
      treat("alliance", "\u540C\u76DF\u3092\u7D50\u3076", "link"),
      treat("nonaggression", "\u4E0D\u53EF\u4FB5\u6761\u7D04\u3092\u7D50\u3076", "handshake"),
      treat("trade", "\u901A\u5546\u5354\u5B9A\u3092\u7D50\u3076", "coin"),
      mk("reconcile", "\u548C\u89E3\u306E\u4F7F\u7BC0\u3092\u9001\u308B", "handshake", none ?? (war ? "\u4EA4\u6226\u4E2D" : v >= -20 ? "\u95A2\u4FC2\u306F\u60AA\u304F\u306A\u3044\uFF08\u221220 \u672A\u6E80\u306E\u3068\u304D\uFF09" : A2.treasury < 15 ? "\u8CA1\u653F\u304C\u8DB3\u308A\u306A\u3044" : null), () => act({ type: "state.act", stateId: A2.id, action: "reconcile", target: B.id }), "dp-reconcile"),
      mk("sanction", "\u7D4C\u6E08\u5236\u88C1\u3092\u79D1\u3059", "shield", none ?? (war ? "\u4EA4\u6226\u4E2D" : (B.sanctions?.[A2.id] ?? 0) > mi ? "\u3059\u3067\u306B\u5236\u88C1\u4E2D" : v >= -10 ? "\u95A2\u4FC2\u304C\u60AA\u5316\u3057\u3066\u3044\u306A\u3044" : null), () => act({ type: "state.act", stateId: A2.id, action: "impose_sanctions", target: B.id }), "dp-sanction"),
      mk("war", "\u5BA3\u6226\u3059\u308B", "sword", none ?? (war ? "\u3059\u3067\u306B\u4EA4\u6226\u4E2D" : tr("nonaggression") ? "\u4E0D\u53EF\u4FB5\u6761\u7D04\u304C\u3042\u308B" : tr("alliance") ? "\u540C\u76DF\u56FD\u306B\u306F\u5BA3\u6226\u3067\u304D\u306A\u3044" : null), () => confirmWar(A2.id, B.id, () => S2.hooks.render()), "dp-war")
    );
    out.append(acts);
    const segs = [], ts = Object.values(c.treaties).filter((t) => t.a === A2.id && t.b === B.id || t.a === B.id && t.b === A2.id);
    for (const t of ts) segs.push({ from: t.signedAt, to: t.endedAt ?? mi, color: TCOL[t.type], label: `${TJA[t.type]} ${yr(t.signedAt)}\u301C${t.endedAt != null ? yr(t.endedAt) : "\u73FE\u5728"}` });
    const ws = Object.values(c.wars).filter((w) => w.sides.a.includes(A2.id) && w.sides.d.includes(B.id) || w.sides.a.includes(B.id) && w.sides.d.includes(A2.id));
    for (const w of ws) segs.push({ from: w.startedAt, to: w.endedAt ?? mi, color: TCOL.war, label: `${w.name ?? "\u6226\u4E89"} ${yr(w.startedAt)}\u301C${w.endedAt != null ? yr(w.endedAt) : "\u73FE\u5728"}` });
    if (segs.length) {
      const t02 = Math.min(...segs.map((s) => s.from));
      out.append(h("div", { class: "lb" }, "\u3053\u308C\u307E\u3067\u306E\u95A2\u4FC2"), timeband(segs, t02, mi, { height: 18 }), h("div", { class: "lg" }, ...Object.keys(TCOL).filter((k) => k !== "sanctions").map((k) => h("span", {}, h("i", { style: `background:${TCOL[k]}` }), TJA[k])), h("small", {}, `${yr(t02)} \u301C \u73FE\u5728`)));
    } else out.append(h("p", { class: "n" }, "\u3053\u308C\u307E\u3067\u3001\u6761\u7D04\u3082\u6226\u4E89\u3082\u3042\u308A\u307E\u305B\u3093\u3002"));
    const peaces = ws.map((w) => peacesOf().find((p) => p.warId === w.id)).filter(Boolean);
    if (peaces.length) out.append(h("div", { class: "lb" }, "\u7D50\u3070\u308C\u305F\u8B1B\u548C\u6761\u7D04"), ...peaces.map((p) => h("a", { class: "lk", href: "#", onclick: (e) => {
      e.preventDefault();
      S2.dtab = "peace";
      S2.dip = null;
      S2.peaceSel = peaceKey(p);
      S2.hooks.panel();
    } }, peaceName(p), " ")));
    return out;
  }
  function allyTab() {
    const c = civ3(), all = Object.values(c.treaties).filter((t) => t.type === "alliance"), live2 = all.filter((t) => t.active).sort((a, b) => b.signedAt - a.signedAt), dead = all.filter((t) => !t.active).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    const row = (t) => h("div", { class: "drow static" + (t.active ? "" : " dead") }, flag(t.a, 28), flag(t.b, 28), h("span", { class: "nm" }, `${stateName(t.a)}\u30FB${stateName(t.b)}`), h("small", {}, t.active ? `${yr(t.signedAt)}\u301C` : `${yr(t.signedAt)}\u301C${yr(t.endedAt ?? 0)}`));
    return h("div", {}, allianceDiagram(c, (id) => S2.hooks.select(id)), h("div", { class: "lb" }, `\u5B58\u5728\u3059\u308B\u540C\u76DF\uFF08${live2.length}\uFF09`), ...live2.slice(0, 40).map(row), h("div", { class: "lb" }, `\u7834\u68C4\u3055\u308C\u305F\u540C\u76DF\uFF08${dead.length}\uFF09`), ...dead.slice(0, 40).map(row));
  }
  function peaceTab() {
    const c = civ3(), list = peacesOf(), sel = list.find((p) => peaceKey(p) === S2.peaceSel);
    if (sel) {
      const w = c.wars[sel.warId], terms = sel.terms?.kind === "reparations" ? `\u8CE0\u511F\u91D1 ${n0(sel.terms.paid ?? sel.terms.amount)}` : sel.terms?.kind === "cession" ? "\u5360\u9818\u5730\u306E\u5272\u8B72" : "\u767D\u7D19\u8B1B\u548C\uFF08\u4E92\u3044\u306B\u9818\u571F\u306F\u52D5\u304B\u306A\u3044\uFF09";
      return h(
        "div",
        { class: "peace" },
        h("div", { class: "back", onclick: () => {
          S2.peaceSel = null;
          S2.hooks.panel();
        } }, "\u2190 \u8B1B\u548C\u6761\u7D04\u306E\u4E00\u89A7"),
        h("h3", {}, peaceName(sel)),
        h("div", { class: "sub" }, yr(sel.at)),
        h("div", { class: "vsrow" }, h("div", { class: "side" }, flag(sel.from, 52), h("b", {}, stateName(sel.from))), h("div", { class: "mid" }, icon("handshake", 26)), h("div", { class: "side" }, flag(sel.to, 52), h("b", {}, stateName(sel.to)))),
        h("div", { class: "kv" }, h("small", {}, "\u6226\u4E89"), w ? h("a", { class: "lk", href: "#", onclick: (e) => {
          e.preventDefault();
          S2.hub = "war";
          S2.war = w.id;
          S2.hooks.render();
        } }, w.name ?? "\u3053\u306E\u6226\u4E89") : "\u2014", h("small", {}, "\u6761\u4EF6"), h("b", {}, terms), h("small", {}, "\u7A2E\u985E"), h("b", {}, sel.separate ? "\u5358\u72EC\u8B1B\u548C" : "\u6226\u4E89\u5168\u4F53\u306E\u8B1B\u548C"))
      );
    }
    return h("div", {}, h("p", { class: "n" }, `${list.length} \u4EF6`), vlist(list, 42, (p) => h("div", { class: "drow", onclick: () => {
      S2.peaceSel = peaceKey(p);
      S2.hooks.panel();
    } }, icon("scroll", 18), h("span", { class: "nm" }, peaceName(p)), h("small", {}, yr(p.at)))));
  }

  // js/ui/v6/war.js
  var civ4 = () => S2.w.civ;
  var date3 = (mi) => formatWorldDate(S2.w, mi);
  var ym = (e) => `${e.date.year}\u5E74${e.date.month}\u6708`;
  var OUT = { aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", stalemate: "\u6C7A\u7740\u3064\u304B\u305A", negotiated: "\u8B1B\u548C", state_dissolved: "\u56FD\u5BB6\u306E\u6D88\u6EC5" };
  var KIND2 = { diplomacy: ["\u5916\u4EA4", "#a58bd0"], ally: ["\u540C\u76DF", "#6fa8c9"], battle: ["\u6226\u95D8", "#d0605a"], occupy: ["\u5360\u9818", "#d8b45a"], peace: ["\u8B1B\u548C", "#9fbf8a"] };
  var warTitle = (x) => {
    const s = `${stateName(x.aggressor)} \u5BFE ${stateName(x.defender)}`;
    return x.name ? `${x.name}\uFF08${s}\uFF09` : s;
  };
  function pWar() {
    const c = civ4(), mine = controlled(), all = Object.values(c.wars).sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : 1)), box = h("div", {}, h("div", { class: "code" }, "WAR"), h("h2", {}, "\u6226\u4E89"));
    const sel = c.wars[S2.war];
    if (sel) S2.full = { key: "war", title: sel.name ?? "\u6226\u4E89", build: () => warDetail(sel), onClose: () => {
      S2.war = null;
      clearHl();
    } };
    const inW = (x) => mine && [...x.sides.a, ...x.sides.d].includes(mine), live2 = all.filter((x) => x.status === "active");
    box.append(h("p", { class: "n" }, `\u9032\u884C\u4E2D ${live2.length}\u30FB\u5168\u4F53 ${all.length} \u4EF6`), sectioned([{ title: "\u3042\u306A\u305F\u306E\u56FD\u306E\u6226\u4E89", rows: live2.filter(inW) }, { title: "\u9032\u884C\u4E2D\u306E\u6226\u4E89", rows: live2.filter((x) => !inW(x)) }, { title: "\u7D42\u7D50\u3057\u305F\u6226\u4E89", rows: all.filter((x) => x.status !== "active"), fold: "endedWars" }], 40, (x) => listRow({ type: "war", id: x.id }, [flag(x.aggressor, 26), flag(x.defender, 26), h("span", { class: "g" }, x.name ?? `${stateName(x.aggressor)} \u5BFE ${stateName(x.defender)}`), h("small", {}, x.status === "active" ? `\u958B\u6226 ${date3(x.startedAt).split("\u6708")[0]}\u6708` : OUT[x.outcome] ?? x.outcome)], () => {
      S2.war = x.id;
      S2.hooks.render();
    }, inW(x) ? "mine" : x.status === "active" ? "" : "dead")));
    return box;
  }
  function miniMap(x) {
    const c = civ4(), M = S2.map, W2 = 320, H = 170, pts = [], side = (id) => x.sides.a.includes(id) ? "a" : x.sides.d.includes(id) ? "d" : null, occ = new Set(x.occupied ?? []);
    for (const g of Object.values(c.groups)) {
      const s = g.stateId && side(g.stateId);
      if (!s && !occ.has(g.id)) continue;
      const cells = g.cells?.length ? g.cells : [g.cell], step = Math.max(1, Math.ceil(cells.length / 30));
      for (let i = 0; i < cells.length; i += step) {
        const [px, py] = M.proj(M.geo.cen[cells[i] * 2], M.geo.cen[cells[i] * 2 + 1], M.cv.width, M.cv.height);
        pts.push([px, py, s, occ.has(g.id)]);
      }
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W2} ${H}`);
    svg.setAttribute("class", "minimap");
    svg.setAttribute("width", "100%");
    if (!pts.length) return svg;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = Math.min((W2 - 24) / Math.max(1, x1 - x0), (H - 24) / Math.max(1, y1 - y0), 6), ox = (W2 - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    svg.innerHTML = `<rect width="${W2}" height="${H}" fill="#12161c"/>` + pts.map(([px, py, s, o]) => `<circle cx="${(ox + (px - x0) * k).toFixed(1)}" cy="${(oy + (py - y0) * k).toFixed(1)}" r="${o ? 3.2 : 2.2}" fill="${o ? "#d8b45a" : s === "a" ? "#6fa8c9" : "#d0605a"}" fill-opacity="${o ? 0.95 : 0.7}"/>`).join("");
    return svg;
  }
  var tug = (score) => h("div", { class: "tug", title: `\u6226\u6CC1 ${Math.round(score)}` }, h("i", { class: "a", style: `width:${50 + score / 2}%` }), h("i", { class: "d", style: `width:${50 - score / 2}%` }), h("b", { style: `left:${50 + score / 2}%` }));
  function sideBox(x, s) {
    const c = civ4(), ids = x.sides[s], fs = Object.values(x.ops?.forces ?? {}).filter((f2) => f2.side === s), size = fs.reduce((a, f2) => a + f2.size, 0), mor = fs.length ? fs.reduce((a, f2) => a + f2.morale * f2.size, 0) / Math.max(1, size) : 0, sup = fs.length ? fs.reduce((a, f2) => a + f2.supply * f2.size, 0) / Math.max(1, size) : 0;
    return { size, el: h("div", { class: "wside " + s }, h("div", { class: "flags" }, ...ids.slice(0, 5).map((i) => h("span", { title: stateName(i) }, flag(i, 36)))), h("small", {}, ids.map(stateName).join("\u30FB")), h("div", { class: "wm" }, icon("sword", 14), h("b", { class: "sz" }, n0(size))), h("div", { class: "wm", title: `\u58EB\u6C17 ${pct(mor)}` }, h("small", {}, "\u58EB\u6C17"), h("span", { class: "barv" }, h("i", { style: `width:${mor * 100}%;background:#9fbf8a` }))), h("div", { class: "wm", title: `\u88DC\u7D66 ${pct(sup)}` }, h("small", {}, "\u88DC\u7D66"), h("span", { class: "barv" }, h("i", { style: `width:${sup * 100}%;background:#d8b45a` })))) };
    void c;
  }
  function flowOf(x) {
    const c = civ4(), items = [], ctx = S2.w.sim.ctx;
    for (const e of c.events) {
      if (!e.participants.some((p) => p.entityId === x.id)) continue;
      const k = e.kind, t = k === "war_declared" ? "diplomacy" : k === "ally_joined" ? "ally" : k === "territory_occupied" || k === "cession" ? "occupy" : k === "war_ended" ? "peace" : null;
      if (t) items.push({ at: e.date.year * 12 + e.date.month, label: ym(e), text: e.title, t });
    }
    for (const b of x.ops?.battles ?? []) if (b.notable || b.kind === "siege" || b.kind === "naval") items.push({ mi: b.at, text: `${b.name}\uFF08${stateName(b.winner)}\u304C\u5236\u3057\u305F\uFF09`, t: "battle" });
    const peaces = peacesOf().filter((p) => p.warId === x.id);
    for (const p of peaces) items.push({ mi: p.at, text: "", t: "peace", peace: p });
    for (const p of (S2.w.civ.wcde.diplomacy?.proposals ?? []).filter((q2) => q2.kind === "peace" && q2.warId === x.id && q2.status === "rejected").slice(-3)) items.push({ mi: p.at, text: `${stateName(p.from)}\u304C\u8B1B\u548C\u3092\u7533\u3057\u5165\u308C\u305F\u304C\u3001\u53D7\u3051\u5165\u308C\u3089\u308C\u306A\u304B\u3063\u305F`, t: "diplomacy" });
    const key = (mi) => c.date.year * 12 + c.date.month + (mi - c.monthIndex);
    for (const it of items) if (it.mi != null) {
      it.label = date3(it.mi).split("\u6708")[0] + "\u6708";
      it.at = key(it.mi);
    }
    items.sort((a, b) => a.at - b.at);
    const shown = items.length > 18 ? [...items.slice(0, 3), ...items.slice(-15)] : items;
    void ctx;
    return h("div", { class: "flow" }, ...shown.length ? shown.map((it) => h("div", { class: "fl", style: `border-color:${KIND2[it.t][1]}` }, h("small", { class: "ft", style: `color:${KIND2[it.t][1]}` }, KIND2[it.t][0]), h("time", {}, it.label), it.peace ? h("a", { class: "lk", href: "#", onclick: (e) => {
      e.preventDefault();
      S2.hub = "diplo";
      S2.dtab = "peace";
      S2.dip = null;
      S2.peaceSel = peaceKey(it.peace);
      S2.full = null;
      S2.war = null;
      S2.hooks.render();
    } }, peaceName(it.peace)) : h("span", {}, it.text))) : [h("p", { class: "n" }, "\u8A18\u9332\u3055\u308C\u305F\u51FA\u6765\u4E8B\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093")]);
  }
  function warDetail(x) {
    const c = civ4(), mine = controlled(), inWar = [...x.sides.a, ...x.sides.d].includes(mine), A2 = sideBox(x, "a"), D2 = sideBox(x, "d"), live2 = x.status === "active", th = Object.values(x.ops?.theaters ?? {});
    const out = h(
      "div",
      { class: "wardetail" },
      h("div", { class: "whead" }, h("h2", {}, x.name ?? warTitle(x)), h("div", { class: "sub" }, `${live2 ? "\u9032\u884C\u4E2D" : "\u7D42\u7D50\uFF08" + (OUT[x.outcome] ?? x.outcome) + "\uFF09"}\u30FB\u958B\u6226 ${date3(x.startedAt)}${x.endedAt != null ? "\u30FB\u7D42\u6226 " + date3(x.endedAt) : ""}`)),
      h("div", { class: "wgrid" }, A2.el, h("div", { class: "wmid" }, miniMap(x), tug(x.score), h("small", { class: "tugl" }, h("span", {}, "\u653B\u6483\u5074"), h("span", {}, x.score > 8 ? "\u653B\u6483\u5074\u304C\u512A\u52E2" : x.score < -8 ? "\u9632\u885B\u5074\u304C\u512A\u52E2" : "\u62EE\u6297"), h("span", {}, "\u9632\u885B\u5074")), h("div", { class: "lg" }, h("span", {}, h("i", { style: "background:#6fa8c9" }), "\u653B\u6483\u5074"), h("span", {}, h("i", { style: "background:#d0605a" }), "\u9632\u885B\u5074"), h("span", {}, h("i", { style: "background:#d8b45a" }), `\u5360\u9818 ${x.occupied?.length ?? 0}`))), D2.el)
    );
    const tot = A2.size + D2.size || 1;
    out.append(h("div", { class: "pwr", title: "\u5175\u529B\u306E\u6BD4" }, h("i", { class: "a", style: `width:${A2.size / tot * 100}%` }), h("i", { class: "d", style: `width:${D2.size / tot * 100}%` })));
    if (th.length) out.append(h("div", { class: "lb" }, "\u6226\u7DDA"), ...th.map((t) => h("div", { class: "front" }, h("span", { class: "nm" }, t.name), h("span", { class: "tug sm" }, h("i", { class: "a", style: `width:${50 + (t.control ?? 0) * 50}%` }), h("i", { class: "d", style: `width:${50 - (t.control ?? 0) * 50}%` })), h("small", {}, t.kind === "sea" ? "\u6D77" : "\u9678"))));
    out.append(h("div", { class: "lb" }, "\u4E3B\u8981\u306A\u6D41\u308C"), h("div", { class: "lg" }, ...Object.values(KIND2).map(([ja, col]) => h("span", {}, h("i", { style: `background:${col}` }), ja))), flowOf(x));
    if (live2 && inWar) {
      const o = x.ops, d = o?.direction?.[mine] ?? {}, cur = d.posture ?? postureOf(S2.w.sim.ctx, x, c.states[mine]), post = h("select", { id: "war-posture" }, ...Object.entries(POSTURES).map(([k, ja]) => h("option", { value: k, selected: k === cur }, ja))), com = h("input", { id: "war-commit", type: "range", min: 0.3, max: 1, step: 0.05, value: d.commit ?? 0.75 }), foc = h("select", { id: "war-focus" }, h("option", { value: "" }, "\u91CD\u70B9: \u81EA\u52D5"), ...th.map((t) => h("option", { value: t.id, selected: d.focus === t.id }, t.name)));
      out.append(h("div", { class: "lb" }, "\u65B9\u91DD"), h("div", { class: "rowb" }, post, foc, h("small", {}, "\u6295\u5165"), com, btn("\u4F1D\u3048\u308B", () => act({ type: "war.direct", stateId: mine, warId: x.id, posture: post.value, commit: Number(com.value), focus: foc.value || null }), "p", { id: "war-direct" })));
      const kind = h("select", { id: "peace-kind" }, h("option", { value: "white" }, "\u767D\u7D19\u8B1B\u548C"), h("option", { value: "reparations" }, "\u8CE0\u511F\u3064\u304D")), amt = h("input", { id: "peace-amt", type: "number", placeholder: "\u8CE0\u511F\u984D", style: "width:90px" });
      out.append(h("div", { class: "lb" }, "\u8B1B\u548C"), h("div", { class: "rowb" }, kind, amt, btn("\u8B1B\u548C\u3092\u7533\u3057\u5165\u308C\u308B", () => act({ type: "diplomacy.peace", stateId: mine, warId: x.id, terms: { kind: kind.value, amount: Number(amt.value) || 0 } }), "p", { id: "peace-go" })));
    }
    void colorOf;
    void placeName;
    return out;
  }

  // js/ui/v6/stats.js
  var card = (title, sub2, body) => h("div", { class: "scard" }, h("div", { class: "sct" }, h("b", {}, title), h("small", {}, sub2)), body);
  function pStats() {
    const c = S2.w.civ, A2 = aliveStates(), mine = controlled(), cs = c.states, hl = (id) => {
      if (S2.map) {
        S2.map.hl = id ? { type: "states", id } : null;
        S2.map.draw();
      }
    }, pick2 = (id) => S2.hooks.select(id);
    const area = /* @__PURE__ */ new Map();
    for (const g of Object.values(c.groups)) if (g.stateId) {
      let k = 0;
      for (const ce of g.cells?.length ? g.cells : [g.cell]) k += S2.w.world.cell.areaKm2[ce] ?? 0;
      area.set(g.stateId, (area.get(g.stateId) ?? 0) + k);
    }
    const totPop = A2.reduce((a, s) => a + s.pop, 0), totArmy = A2.reduce((a, s) => a + s.army, 0), wars = c.activeWarIds.length;
    const head2 = h("div", { class: "kpis" }, ...[["pop", "\u4E16\u754C\u306E\u4EBA\u53E3\uFF08\u56FD\u5BB6\uFF09", n0(totPop)], ["flag", "\u5B58\u7D9A\u3059\u308B\u56FD\u5BB6", n0(A2.length)], ["sword", "\u4E16\u754C\u306E\u5175\u529B", n0(totArmy)], ["globe", "\u9032\u884C\u4E2D\u306E\u6226\u4E89", n0(wars)]].map(([ic, l, v]) => h("div", { class: "kpi" }, icon(ic, 18), h("small", {}, l), h("b", {}, v))));
    const sItems = (f2) => A2.map((s) => ({ id: s.id, label: s.name, value: f2(s), color: colorOf(s.id), mine: s.id === mine }));
    const dist = (key, tab) => {
      const m = /* @__PURE__ */ new Map();
      for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) {
        const id = co[key];
        if (id) m.set(id, (m.get(id) ?? 0) + g.pop * co.share);
      }
      return [...m].map(([id, v]) => ({ label: tab[id]?.name ?? id, value: v, color: colorOf(id) }));
    };
    return h(
      "div",
      { class: "stats" },
      h("div", { class: "code" }, "STATISTICS"),
      h("h2", {}, "\u7D71\u8A08"),
      h("small", { class: "n" }, formatWorldDate(S2.w)),
      head2,
      card("\u4EBA\u53E3", "\u56FD\u5BB6\u3054\u3068\u306E\u5272\u5408", pie(sItems((s) => s.pop), { size: 140, center: n0(totPop), onPick: pick2 })),
      card("\u8ECD\u4E8B\u529B", "\u5175\u529B \xD7 \u8ECD\u4E8B\u80FD\u529B \xD7 \u9632\u5FA1", hbars(sItems((s) => strength(c, s)), { onPick: pick2, onHover: hl })),
      card("\u56FD\u571F", "\u9762\u7A4D\uFF08km\xB2\uFF09", treemap(sItems((s) => area.get(s.id) ?? 0), { onPick: pick2, fmt: (v) => n0(v) + " km\xB2" })),
      card("\u6587\u5316", "\u4E16\u754C\u306E\u4EBA\u53E3\u306E\u69CB\u6210", pie(dist("cultureId", c.cultures), { size: 120 })),
      card("\u5B97\u6559", "\u4E16\u754C\u306E\u4EBA\u53E3\u306E\u69CB\u6210", pie(dist("religionId", c.religions), { size: 120 })),
      card("\u8A00\u8A9E", "\u4E16\u754C\u306E\u4EBA\u53E3\u306E\u69CB\u6210", pie(dist("languageId", c.languages), { size: 120 }))
    );
    void cs;
  }

  // js/core/wcde/save-meta.js
  var APP_VERSION_FOR_SAVE = "6.7.0";

  // js/core/wcde/savefile.js
  var SAVE_FORMAT = "alterhistory-save";
  var SAVE_SCHEMA = 2;
  var MIN_SCHEMA = 2;
  function checksum(text) {
    let h1 = 3735928559, h2 = 1103547991;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  var fin4 = (x) => typeof x === "number" && Number.isFinite(x);
  function packSave(w, { appVersion = APP_VERSION_FOR_SAVE, name = null } = {}) {
    const { civ: civ6 } = w, civText = JSON.stringify(civ6), meta = { name: name ?? civ6.wcde.config.name ?? null, monthIndex: civ6.monthIndex, date: { ...civ6.date }, states: Object.values(civ6.states).filter((s) => s.alive).length, events: civ6.events.length, records: civ6.archive?.total ?? 0, cells: w.world.mesh?.cellCount ?? null, worldSeed: civ6.wcde.config.worldSeed };
    const head2 = JSON.stringify({ format: SAVE_FORMAT, schema: SAVE_SCHEMA, appVersion, wcdeVersion: WCDE_VERSION, meta, checksum: checksum(civText), civBytes: civText.length });
    const text = head2.slice(0, -1) + ',"civ":' + civText + "}";
    return { text, bytes: text.length, meta };
  }
  function unpackSave(text, { generate = defaultGenerate, allowChecksumMismatch = false } = {}) {
    const refuse = (...errors) => ({ ok: false, errors }), warnings = [], repairs = [];
    if (typeof text !== "string" || !text.length) return refuse("\u30D5\u30A1\u30A4\u30EB\u304C\u7A7A\u3001\u307E\u305F\u306F\u6587\u5B57\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      return refuse("\u30D5\u30A1\u30A4\u30EB\u304C\u58CA\u308C\u3066\u3044\u307E\u3059\uFF08JSON \u3068\u3057\u3066\u8AAD\u3081\u307E\u305B\u3093\uFF09: " + String(e.message).slice(0, 120));
    }
    if (!d || typeof d !== "object" || Array.isArray(d)) return refuse("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u306E\u5F62\u5F0F\u3067\u306F\u3042\u308A\u307E\u305B\u3093");
    if (d.format !== SAVE_FORMAT && (d.ahmap != null || d.format === "ahmap" || d.format === "alterhistory-map" || d.map != null || d.pack != null || d.info?.version != null || d.settings != null)) return refuse("v5 \u4EE5\u524D\u306E\u5730\u56F3\u30C7\u30FC\u30BF\uFF08.ahmap\uFF09\u3084 Azgaar \u306E\u5730\u56F3\u306F\u3001v6.1.0 \u3067\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002\u65B0\u3057\u3044\u4E16\u754C\u3092\u4F5C\u3063\u3066\u304F\u3060\u3055\u3044\uFF08\u5143\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u524A\u9664\u3055\u308C\u307E\u305B\u3093\uFF09");
    if (d.format !== SAVE_FORMAT) return refuse(d.format === "alterhistory-wcde" ? "\u3053\u308C\u306F\u958B\u767A\u4E2D\u306E\u65E7\u5F62\u5F0F\uFF08alterhistory-wcde\uFF09\u3067\u3059\u3002v6.1.0 \u306E\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044" : "AlterHistory \u306E\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF08\u65E7 .ahmap\u30FB\u4ED6\u30A2\u30D7\u30EA\u306E\u5730\u56F3\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\uFF09");
    if (!Number.isInteger(d.schema)) return refuse("\u4FDD\u5B58\u5F62\u5F0F\u306E\u7248\u304C\u3042\u308A\u307E\u305B\u3093");
    if (d.schema > SAVE_SCHEMA) return refuse(`\u3053\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u65B0\u3057\u3044\u4FDD\u5B58\u5F62\u5F0F\uFF08\u7248 ${d.schema}\uFF09\u3067\u3059\u3002\u30A2\u30D7\u30EA\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u3053\u306E\u30A2\u30D7\u30EA\u306F\u7248 ${SAVE_SCHEMA} \u307E\u3067\uFF09`);
    if (d.schema < MIN_SCHEMA) return refuse(d.schema === 1 ? "v6.0.0 \u306E\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\uFF08schema 1\uFF09\u306F\u3001v6.1.0 \u3067\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3002\u65B0\u3057\u3044\u4E16\u754C\u3092\u4F5C\u3063\u3066\u304F\u3060\u3055\u3044\uFF08\u5143\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u524A\u9664\u3055\u308C\u307E\u305B\u3093\uFF09" : `\u53E4\u3059\u304E\u308B\u4FDD\u5B58\u5F62\u5F0F\uFF08\u7248 ${d.schema}\uFF09\u3067\u3059`);
    const civ6 = d.civ;
    if (!civ6 || typeof civ6 !== "object") return refuse("\u4E16\u754C\u306E\u72B6\u614B\uFF08civ\uFF09\u304C\u3042\u308A\u307E\u305B\u3093");
    const sum = checksum(JSON.stringify(civ6));
    if (d.checksum !== sum) {
      if (!allowChecksumMismatch) return refuse("\u30C1\u30A7\u30C3\u30AF\u30B5\u30E0\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\uFF08\u4FDD\u5B58\u5F8C\u306B\u5185\u5BB9\u304C\u5909\u308F\u3063\u305F\u304B\u3001\u30D5\u30A1\u30A4\u30EB\u304C\u58CA\u308C\u3066\u3044\u307E\u3059\uFF09\u3002\u8AAD\u307F\u8FBC\u307F\u3092\u4E2D\u6B62\u3057\u307E\u3057\u305F");
      warnings.push("\u30C1\u30A7\u30C3\u30AF\u30B5\u30E0\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u304C\u3001\u5229\u7528\u8005\u306E\u6307\u793A\u3067\u3001\u691C\u8A3C\u3092\u901A\u308B\u5834\u5408\u306B\u9650\u3063\u3066\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F");
    }
    if (civ6.decisions != null && (!Array.isArray(civ6.decisions) || civ6.decisions.length)) return refuse("AI \u306E\u5224\u65AD\u8A18\u9332\u3092\u542B\u3080\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u306F\u3001v6.1.0 \u3067\u306F\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\uFF08\u5224\u65AD\u306F\u4FDD\u5B58\u3057\u306A\u3044\u4ED5\u69D8\u3067\u3059\uFF09");
    const need = [["monthIndex", fin4], ["date", (x) => x && typeof x === "object"], ["states", (x) => x && typeof x === "object" && !Array.isArray(x)], ["groups", (x) => x && typeof x === "object"], ["events", Array.isArray], ["wcde", (x) => x && typeof x === "object"], ["seq", (x) => x && typeof x === "object"], ["options", (x) => x && typeof x === "object"]];
    for (const [k, ok2] of need) if (!ok2(civ6[k])) return refuse(`\u5FC5\u9808\u9805\u76EE\u300C${k}\u300D\u304C\u306A\u3044\u304B\u3001\u578B\u304C\u9055\u3044\u307E\u3059`);
    if (!Number.isInteger(civ6.monthIndex) || civ6.monthIndex < 0) return refuse("\u6708\u306E\u756A\u53F7\uFF08monthIndex\uFF09\u304C\u4E0D\u6B63\u3067\u3059");
    if (!civ6.wcde.config?.spec || !civ6.wcde.config?.worldSeed) return refuse("\u4E16\u754C\u751F\u6210\u306E\u8A2D\u5B9A\uFF08config.spec / worldSeed\uFF09\u304C\u3042\u308A\u307E\u305B\u3093");
    if (!["founding", "running"].includes(civ6.wcde.phase)) return refuse("\u6BB5\u968E\uFF08phase\uFF09\u304C\u4E0D\u6B63\u3067\u3059");
    for (const [id, s] of Object.entries(civ6.states)) {
      if (s.id !== id) return refuse(`\u56FD\u5BB6 ${id} \u306E ID \u304C\u4E00\u81F4\u3057\u307E\u305B\u3093`);
      for (const k of ["pop", "treasury", "stability", "army"]) if (!fin4(s[k])) return refuse(`\u56FD\u5BB6 ${id}.${k} \u304C\u6709\u9650\u306E\u6570\u3067\u306F\u3042\u308A\u307E\u305B\u3093`);
    }
    for (const g of Object.values(civ6.groups)) if (g.stateId != null && !civ6.states[g.stateId]) return refuse(`\u96C6\u56E3 ${g.id} \u304C\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6 ${g.stateId} \u306B\u5C5E\u3057\u3066\u3044\u307E\u3059`);
    for (const t of Object.values(civ6.treaties ?? {})) for (const k of ["a", "b"]) if (!civ6.states[t[k]]) return refuse(`\u6761\u7D04 ${t.id} \u304C\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6 ${t[k]} \u3092\u6307\u3057\u3066\u3044\u307E\u3059`);
    for (const x of Object.values(civ6.wars ?? {})) for (const k of ["aggressor", "defender"]) if (!civ6.states[x[k]]) return refuse(`\u6226\u4E89 ${x.id} \u304C\u5B58\u5728\u3057\u306A\u3044\u56FD\u5BB6 ${x[k]} \u3092\u6307\u3057\u3066\u3044\u307E\u3059`);
    if (!Array.isArray(civ6.activeWarIds) || civ6.activeWarIds.some((i) => !civ6.wars[i])) return refuse("\u9032\u884C\u4E2D\u306E\u6226\u4E89\u306E\u4E00\u89A7\u304C\u6226\u4E89\u306E\u8A18\u9332\u3068\u5408\u3044\u307E\u305B\u3093");
    const fix = (kind, before, after, reason, apply) => {
      apply();
      repairs.push({ kind, before, after, reason });
      warnings.push(`\u4FEE\u5FA9: ${reason}`);
    };
    if (civ6.wcde.adjust == null) fix("adjust", null, {}, "\u4ECB\u5165\u88DC\u6B63\u306E\u8868\u304C\u7121\u304B\u3063\u305F\u305F\u3081\u3001\u4ECB\u5165\u8A18\u9332\u304B\u3089\u4F5C\u308A\u76F4\u3057\u307E\u3057\u305F", () => {
      civ6.wcde.adjust = {};
    });
    if (civ6.wcde.diagnostics == null) fix("diagnostics", null, [], "\u8A3A\u65AD\u8A18\u9332\u304C\u7121\u304B\u3063\u305F\u305F\u3081\u3001\u7A7A\u3067\u4F5C\u308A\u307E\u3057\u305F", () => {
      civ6.wcde.diagnostics = [];
    });
    if (civ6.adoptCache == null) civ6.adoptCache = {};
    let world;
    try {
      world = generate(civ6.wcde.config.spec);
    } catch (e) {
      return refuse("\u4E16\u754C\u306E\u5730\u7406\u3092\u518D\u751F\u6210\u3067\u304D\u307E\u305B\u3093: " + String(e.message).slice(0, 120));
    }
    const cells = world.mesh?.cellCount ?? null;
    if (d.meta?.cells != null && cells != null && d.meta.cells !== cells) return refuse(`\u5730\u56F3\u306E\u683C\u5B50\u306E\u6570\u304C\u4FDD\u5B58\u6642\uFF08${d.meta.cells}\uFF09\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093\uFF08${cells}\uFF09\u3002\u751F\u6210\u306E\u7248\u304C\u9055\u3046\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059`);
    registerCommands();
    let w;
    try {
      w = createWcde(world, civ6);
    } catch (e) {
      return refuse("\u4E16\u754C\u3092\u7D44\u307F\u7ACB\u3066\u3089\u308C\u307E\u305B\u3093: " + String(e.message).slice(0, 120));
    }
    try {
      const before = JSON.stringify(civ6.wcde.adjust);
      rebuildAdjust(civ6);
      if (JSON.stringify(civ6.wcde.adjust) !== before) fix("adjust", before.slice(0, 80), "\u518D\u69CB\u7BC9", "\u4ECB\u5165\u88DC\u6B63\u306E\u8868\u304C\u4ECB\u5165\u8A18\u9332\u3068\u98DF\u3044\u9055\u3063\u3066\u3044\u305F\u305F\u3081\u3001\u8A18\u9332\u304B\u3089\u4F5C\u308A\u76F4\u3057\u307E\u3057\u305F", () => {
      });
      timeOf(civ6);
      newsOf(civ6);
    } catch (e) {
      return refuse("\u6D3E\u751F\u30C7\u30FC\u30BF\u3092\u4F5C\u308A\u76F4\u305B\u307E\u305B\u3093: " + String(e.message).slice(0, 120));
    }
    const errs = checkWcdeIntegrity(world, civ6);
    if (errs.length) return refuse(`\u6574\u5408\u6027\u306E\u691C\u67FB\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08${errs.length} \u4EF6\uFF09`, ...errs.slice(0, 12));
    if (repairs.length) for (const r of repairs) civ6.wcde.diagnostics.push({ at: civ6.monthIndex, repair: r.kind, reason: r.reason });
    return { ok: true, w, warnings, repairs, meta: d.meta ?? null, schema: d.schema };
  }
  var pipe = async (input, stream) => {
    const w = stream.writable.getWriter(), wr = (async () => {
      await w.write(input);
      await w.close();
    })();
    wr.catch(() => {
    });
    const chunks = [], r = stream.readable.getReader();
    for (; ; ) {
      const { done: done2, value } = await r.read();
      if (done2) break;
      chunks.push(value);
    }
    await wr;
    let n2 = 0;
    for (const c of chunks) n2 += c.length;
    const out = new Uint8Array(n2);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  };
  var isGzip = (u8) => u8 instanceof Uint8Array && u8.length > 2 && u8[0] === 31 && u8[1] === 139;
  async function packSaveGz(w, opts) {
    const p = packSave(w, opts);
    return { bytes: await pipe(new TextEncoder().encode(p.text), new CompressionStream("gzip")), rawBytes: p.bytes, meta: p.meta };
  }
  async function unpackSaveAny(input, opts) {
    try {
      const text = typeof input === "string" ? input : isGzip(input) ? new TextDecoder().decode(await pipe(input, new DecompressionStream("gzip"))) : new TextDecoder().decode(input);
      return unpackSave(text, opts);
    } catch (e) {
      return { ok: false, errors: ["\u5727\u7E2E\u3092\u5C55\u958B\u3067\u304D\u307E\u305B\u3093\uFF08\u30D5\u30A1\u30A4\u30EB\u304C\u58CA\u308C\u3066\u3044\u307E\u3059\uFF09: " + String(e.message ?? e).slice(0, 100)] };
    }
  }

  // js/io/crc32.js
  var T2 = (() => {
    const t = new Uint32Array(256);
    for (let n2 = 0; n2 < 256; n2++) {
      let c = n2;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n2] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 4294967295;
    for (let i = 0; i < bytes.length; i++) c = T2[(c ^ bytes[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }

  // js/io/zip.js
  var enc3 = new TextEncoder();
  async function deflateRaw(bytes) {
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
    return new Uint8Array(out);
  }
  var u16 = (n2) => [n2 & 255, n2 >>> 8 & 255];
  var u32 = (n2) => [n2 & 255, n2 >>> 8 & 255, n2 >>> 16 & 255, n2 >>> 24 & 255];
  function dosTime(d) {
    return [(d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1) & 65535, (d.getFullYear() - 1980 << 9 | d.getMonth() + 1 << 5 | d.getDate()) & 65535];
  }
  async function zipFiles(files, { compress = true, date: date5 = /* @__PURE__ */ new Date(), onProgress = null } = {}) {
    const parts = [], central = [], [dt, dd] = dosTime(date5);
    let offset = 0, n2 = 0;
    const names = /* @__PURE__ */ new Set();
    for await (const f2 of files) {
      if (names.has(f2.path)) throw new Error(`ZIP \u306E\u30D1\u30B9\u304C\u91CD\u8907: ${f2.path}`);
      names.add(f2.path);
      const raw = typeof f2.data === "string" ? enc3.encode(f2.data) : f2.data, name = enc3.encode(f2.path), crc = crc32(raw);
      let method = 0, body = raw;
      if (compress && raw.length > 128) {
        const z = await deflateRaw(raw);
        if (z.length < raw.length) {
          method = 8;
          body = z;
        }
      }
      const head2 = Uint8Array.from([80, 75, 3, 4, ...u16(20), ...u16(2048), ...u16(method), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0)]);
      if (offset + head2.length + name.length + body.length > 4294967280) throw new Error("ZIP \u304C 4GB \u3092\u8D85\u3048\u307E\u3059\uFF08\u5206\u5272\u3057\u3066\u66F8\u304D\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\uFF09");
      central.push(Uint8Array.from([80, 75, 1, 2, ...u16(20), ...u16(20), ...u16(2048), ...u16(method), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      parts.push(head2, name, body);
      offset += head2.length + name.length + body.length;
      n2++;
      if (onProgress && n2 % 500 === 0) await onProgress(n2);
    }
    let csize = 0;
    for (const c of central) csize += c.length;
    const big = n2 > 65534, tail2 = [];
    if (big) {
      const u64 = (x) => [...u32(x >>> 0), ...u32(Math.floor(x / 4294967296))];
      tail2.push(Uint8Array.from([80, 75, 6, 6, ...u64(44), ...u16(45), ...u16(45), ...u32(0), ...u32(0), ...u64(n2), ...u64(n2), ...u64(csize), ...u64(offset)]), Uint8Array.from([80, 75, 6, 7, ...u32(0), ...u64(offset + csize), ...u32(1)]));
    }
    tail2.push(Uint8Array.from([80, 75, 5, 6, 0, 0, 0, 0, ...u16(big ? 65535 : n2), ...u16(big ? 65535 : n2), ...u32(csize), ...u32(offset), 0, 0]));
    let total = offset + csize;
    for (const t of tail2) total += t.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of [...parts, ...central, ...tail2]) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  // js/io/png.js
  var be32 = (n2) => [n2 >>> 24 & 255, n2 >>> 16 & 255, n2 >>> 8 & 255, n2 & 255];
  function chunk(type, data) {
    const t = new TextEncoder().encode(type), body = new Uint8Array(t.length + data.length);
    body.set(t);
    body.set(data, t.length);
    return [...be32(data.length), ...body, ...be32(crc32(body))];
  }
  async function encodePng(rgba, w, h2) {
    const raw = new Uint8Array(h2 * (w * 4 + 1));
    for (let y = 0; y < h2; y++) {
      raw[y * (w * 4 + 1)] = 0;
      raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    }
    const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", Uint8Array.from([...be32(w), ...be32(h2), 8, 6, 0, 0, 0])), ...chunk("IDAT", z), ...chunk("IEND", new Uint8Array(0))]);
  }

  // js/io/obsidian.js
  var evList = (civ6) => [...iterRecords(civ6)];
  var OBSIDIAN_VERSION = 1;
  var FOLDERS = Object.freeze({ timeline: "\u5E74\u8868", state: "\u56FD\u5BB6", person: "\u4EBA\u7269", war: "\u6226\u4E89", battle: "\u6226\u95D8", treaty: "\u6761\u7D04", event: "\u51FA\u6765\u4E8B", decision: "AI\u5224\u65AD", settlement: "\u90FD\u5E02\u30FB\u96C6\u843D", group: "\u96C6\u56E3", region: "\u5730\u57DF", culture: "\u6587\u5316", language: "\u8A00\u8A9E", religion: "\u5B97\u6559", tech: "\u6280\u8853", species: "\u7A2E\u65CF", ability: "\u9B54\u6CD5/\u80FD\u529B", org: "\u9B54\u6CD5/\u7D44\u7E54", disaster: "\u707D\u5BB3", interp: "\u6B74\u53F2\u8A8D\u8B58", work: "\u8868\u73FE\u7269", chronicle: "\u5E74\u4EE3\u8A18", graph: "\u95A2\u4FC2\u30B0\u30E9\u30D5", logState: "\u8A73\u7D30\u30ED\u30B0/\u56FD\u5BB6\u6708\u6B21\u72B6\u614B", logAi: "\u8A73\u7D30\u30ED\u30B0/AI\u5224\u65AD", map: "\u5730\u56F3" });
  var mi2s = (mi) => `${Math.floor(mi / 12)}\u5E74${(mi % 12 + 12) % 12 + 1}\u6708`;
  var d2s = (d) => `${d.year}\u5E74${d.month}\u6708`;
  var d2mi = (d) => d.year * 12 + d.month - 1;
  var safe = (s) => String(s ?? "").replace(/[\\/:*?"<>|#^\[\]\n\r\t]/g, "_").replace(/\.{2,}/g, "_").replace(/^\.+/, "_").replace(/\s+/g, " ").trim().slice(0, 48) || "\u7121\u984C";
  var q = (s) => JSON.stringify(String(s));
  var yamlVal = (v) => v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : Array.isArray(v) ? `[${v.map(yamlVal).join(", ")}]` : typeof v === "object" ? JSON.stringify(v) : q(v);
  var fm = (o) => `---
${Object.entries(o).map(([k, v]) => `${k}: ${yamlVal(v)}`).join("\n")}
---
`;
  var table2 = (head2, rows) => rows.length ? `| ${head2.join(" | ")} |
| ${head2.map(() => "---").join(" | ")} |
${rows.map((r) => `| ${r.map((x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`).join("\n")}
` : "\uFF08\u306A\u3057\uFF09\n";
  var r1 = (x) => Math.round(x * 10) / 10;
  var r37 = (x) => Math.round(x * 1e3) / 1e3;
  var colorOf2 = (id) => {
    let h2 = 2166136261;
    for (const ch of String(id)) h2 = Math.imul(h2 ^ ch.charCodeAt(0), 16777619);
    const hue = (h2 >>> 0) % 360, s = 0.55 + (h2 >>> 9) % 30 / 100, l = 0.5 + (h2 >>> 17) % 20 / 100;
    const f2 = (n2) => {
      const k = (n2 + hue / 30) % 12, a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f2(0), f2(8), f2(4)];
  };
  function planPaths(world, civ6, opts = {}) {
    const P2 = /* @__PURE__ */ new Map(), add = (id, folder, name) => P2.set(id, `${folder}/${safe(name)}__${id}`);
    for (const s of Object.values(civ6.states)) add(s.id, FOLDERS.state, s.name);
    for (const p of Object.values(civ6.persons)) add(p.id, FOLDERS.person, p.name);
    for (const f2 of Object.values(civ6.figures ?? {})) if (!P2.has(f2.id)) add(f2.id, FOLDERS.person, f2.name);
    for (const w of Object.values(civ6.wars)) add(w.id, FOLDERS.war, `${civ6.states[w.aggressor]?.name ?? "?"}\u5BFE${civ6.states[w.defender]?.name ?? "?"}\u306E\u6226\u4E89`);
    for (const t of Object.values(civ6.treaties)) add(t.id, FOLDERS.treaty, `${civ6.states[t.a]?.name ?? "?"}\u3068${civ6.states[t.b]?.name ?? "?"}\u306E${TREATY_JA[t.type] ?? t.type}`);
    const lo = opts.fromMonth ?? -Infinity, hi = opts.toMonth ?? Infinity;
    if (opts.eventNotes !== false) for (const e of evList(civ6)) {
      const m = evMonth(e);
      if (m >= lo && m <= hi) add(e.eventId, e.kind === "battle_fought" ? FOLDERS.battle : FOLDERS.event, e.title);
    }
    if (opts.decisionNotes !== false) for (const d of civ6.decisions ?? []) {
      const m = d2mi(d.date);
      if (m >= lo && m <= hi) add(d.decisionId, FOLDERS.decision, `${civ6.states[d.actorId]?.name ?? d.actorId}\u306E\u5224\u65AD`);
    }
    for (const s of Object.values(civ6.settlements)) add(s.id, FOLDERS.settlement, `\u96C6\u843D ${STAGE_JA2[s.stage] ?? s.stage}`);
    for (const g of Object.values(civ6.groups)) add(g.id, FOLDERS.group, `\u96C6\u56E3 ${g.subsistence}`);
    for (const c of Object.values(civ6.cultures)) add(c.id, FOLDERS.culture, c.name);
    for (const l of Object.values(civ6.languages)) add(l.id, FOLDERS.language, l.name);
    for (const r of Object.values(civ6.religions)) add(r.id, FOLDERS.religion, r.name);
    for (const t of TECHS) P2.set(`tech:${t.key}`, `${FOLDERS.tech}/${safe(t.name)}__${t.key}`);
    for (const s of Object.keys(civ6.species)) P2.set(s, `${FOLDERS.species}/${safe(SPECIES[s]?.ja ?? s)}__${s}`);
    for (const a of Object.values(ABILITIES)) P2.set(`ability:${a.id}`, `${FOLDERS.ability}/${safe(a.ja)}__${a.id}`);
    for (const o of Object.values(civ6.magic.orgs)) add(o.id, FOLDERS.org, o.name);
    for (const d of Object.values(civ6.disasters)) add(d.id, FOLDERS.disaster, `${KIND_JA[d.kind]}\uFF08${mi2s(d.startedAt)}\uFF09`);
    for (const x of civ6.interpretations) add(x.interpId, FOLDERS.interp, `${civ6.states[x.ownerId]?.name ?? "?"}\u306E\u8A8D\u8B58 ${STANCE[x.stance] ?? x.stance}`);
    for (const w of civ6.works) add(w.workId, FOLDERS.work, `${civ6.states[w.authorId]?.name ?? "?"}\u306E\u5E74\u4EE3\u8A18`);
    for (const c of regionsOf(world)) P2.set(`region:${c.id}`, `${FOLDERS.region}/${safe(c.name)}__region_${c.id}`);
    return P2;
  }
  var TREATY_JA = { nonaggression: "\u4E0D\u53EF\u4FB5\u6761\u7D04", alliance: "\u540C\u76DF", trade: "\u901A\u5546\u6761\u7D04", defense: "\u9632\u885B\u5354\u5B9A", vassal: "\u5F93\u5C5E\u95A2\u4FC2", tribute: "\u671D\u8CA2" };
  var STAGE_JA2 = { camp: "\u91CE\u55B6\u5730", village: "\u6751", town: "\u753A", city: "\u90FD\u5E02", metropolis: "\u5927\u90FD\u5E02" };
  var OUTCOME_JA = { aggressor_victory: "\u653B\u6483\u5074\u306E\u52DD\u5229", defender_victory: "\u9632\u885B\u5074\u306E\u52DD\u5229", negotiated: "\u8B1B\u548C", stalemate: "\u81A0\u7740" };
  var POLITY_JA2 = { tribal: "\u90E8\u65CF", chiefdom: "\u9996\u9577\u5236", kingdom: "\u738B\u56FD", empire: "\u5E1D\u56FD", republic: "\u5171\u548C\u5236", theocracy: "\u795E\u6A29\u5236", city_state: "\u90FD\u5E02\u56FD\u5BB6" };
  function regionsOf(world) {
    const c = world.cell, n2 = c.continent.length, m = /* @__PURE__ */ new Map();
    for (let i = 0; i < n2; i++) {
      if (c.landWater[i] !== LAND_WATER2.LAND) continue;
      const k = c.continent[i];
      let r = m.get(k);
      if (!r) m.set(k, r = { id: k, cells: 0, area: 0, sumLat: 0, sumLon: 0 });
      r.cells++;
      r.area += c.areaKm2[i];
      r.sumLat += c.lat[i];
      r.sumLon += c.lon[i];
    }
    return [...m.values()].sort((a, b) => b.area - a.area).map((r, i) => ({ ...r, name: `\u5927\u9678${i + 1}`, order: i }));
  }
  async function* obsidianFiles(world, civ6, worldName, opts = {}) {
    const root2 = safe(worldName || "\u4E16\u754C"), P2 = planPaths(world, civ6, opts), ix = graphIndex(civ6), stats = { files: 0, unresolved: 0, outOfScope: 0, missing: [] }, counts = {};
    const from = opts.fromMonth ?? -Infinity, to = opts.toMonth ?? Infinity, inRange = (mi) => mi >= from && mi <= to, scoped = Number.isFinite(from) || Number.isFinite(to) || opts.decisionNotes === false || opts.eventNotes === false;
    const link2 = (id, label) => {
      if (id === "world") return "\u4E16\u754C\u5168\u4F53";
      const p = P2.get(id);
      if (!p && scoped && /^(event|decision)_/.test(String(id))) {
        stats.outOfScope++;
        return String(label ?? id).replace(/[\]|\u0001\u0002]/g, " ");
      }
      if (!p && /^(pop|settle)_/.test(String(id))) return label == null || label === id ? "\u6D88\u6EC5\u3057\u305F\u96C6\u56E3\u30FB\u96C6\u843D" : String(label);
      if (!p) {
        stats.unresolved++;
        if (stats.missing.length < 10) stats.missing.push(String(id));
        return label ?? String(id);
      }
      return `${p}|${String(label ?? id).replace(/[\]|\u0001\u0002]/g, " ")}`;
    };
    const nameOf = (id) => civ6.states[id]?.name ?? civ6.persons[id]?.name ?? civ6.cultures[id]?.name ?? civ6.languages[id]?.name ?? civ6.religions[id]?.name ?? civ6.magic.orgs[id]?.name ?? id;
    const L = (id) => link2(id, nameOf(id)), cellLoc = (c) => c == null ? "\u4E0D\u660E" : `\u30BB\u30EB ${c}\uFF08\u7DEF\u5EA6 ${r1(world.cell.lat[c] * 180 / Math.PI)}\xB0\u30FB\u7D4C\u5EA6 ${r1(world.cell.lon[c] * 180 / Math.PI)}\xB0\uFF09`;
    const fin5 = (c) => c.replace(/\[\[/g, "\uFF3B\uFF3B").replace(/\]\]/g, "\uFF3D\uFF3D").replace(/\u0001/g, "[[").replace(/\u0002/g, "]]");
    const out = (kind, path, content) => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      stats.files++;
      return { path: `${root2}/${path}.md`, data: fin5(content), kind };
    };
    const outRaw = (kind, path, data) => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      stats.files++;
      return { path: `${root2}/${path}`, data, kind };
    };
    const W6 = civ6.wcde;
    if (W6) {
      const ivs = W6.interventions?.records ?? [], STATUS = { active: "\u6709\u52B9", converged: "\u53CE\u675F", superseded: "\u7F6E\u304D\u63DB\u3048", cancelled: "\u53D6\u308A\u6D88\u3057", target_gone: "\u5BFE\u8C61\u6D88\u6EC5" };
      if (ivs.length) yield out("creator", "\u5275\u9020\u4E3B\u306E\u4ECB\u5165/\u4ECB\u5165\u306E\u8A18\u9332", fm({ type: "\u5275\u9020\u4E3B\u306E\u4ECB\u5165", \u4EF6\u6570: ivs.length, tags: ["\u5275\u9020\u4E3B\u306E\u4ECB\u5165"] }) + `# \u5275\u9020\u4E3B\u306E\u4ECB\u5165\u306E\u8A18\u9332

\u8A08\u7B97\u3055\u308C\u308B\u5024\u3078\u306E\u4E00\u6642\u7684\u306A\u88DC\u6B63\u306E\u8A18\u9332\u3067\u3059\u3002\u4E16\u754C\u306E\u4E8B\u5B9F\uFF08\u51FA\u6765\u4E8B\uFF09\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u88DC\u6B63\u306F\u534A\u6E1B\u671F\u3067\u901A\u5E38\u5024\u3078\u623B\u308A\u3001\u4ECB\u5165\u4E2D\u306B\u8D77\u304D\u305F\u7D50\u679C\u306F\u623B\u308A\u307E\u305B\u3093\u3002

` + table2(["\u958B\u59CB", "\u5BFE\u8C61", "\u9805\u76EE", "\u958B\u59CB\u6642\u306E\u901A\u5E38\u5024", "\u6307\u5B9A\u5024", "\u534A\u6E1B\u671F\uFF08\u6708\uFF09", "\u72B6\u614B", "\u7406\u7531"], ivs.map((r) => [mi2s(r.startMonth), L(r.targetId), r.field, r37(r.nominalAtStart), r37(r.target), r.halfLife, STATUS[r.status] ?? r.status, r.reason || "\u2014"])));
      const eds = W6.edits ?? [];
      if (eds.length) yield out("creator", "\u5275\u9020\u4E3B\u306E\u4ECB\u5165/\u76F4\u63A5\u7DE8\u96C6\u306E\u8A18\u9332", fm({ type: "\u5275\u9020\u4E3B\u306E\u76F4\u63A5\u7DE8\u96C6", \u4EF6\u6570: eds.length, tags: ["\u5275\u9020\u4E3B\u306E\u4ECB\u5165"] }) + `# \u5275\u9020\u4E3B\u306E\u76F4\u63A5\u7DE8\u96C6\u306E\u8A18\u9332

` + table2(["\u6642\u671F", "\u5BFE\u8C61", "\u9805\u76EE", "\u5909\u66F4\u524D", "\u5909\u66F4\u5F8C"], eds.map((e) => [mi2s(e.at), L(e.targetId), e.property, String(e.before).slice(0, 40), String(e.after).slice(0, 40)])));
      const prs = W6.diplomacy?.proposals ?? [], lab = W6.diplomacy?.labels ?? [], TS = { accepted: "\u6210\u7ACB", rejected: "\u62D2\u5426", countered: "\u5225\u6761\u4EF6", failed_recheck: "\u518D\u691C\u8A3C\u3067\u4E0D\u6210\u7ACB" };
      for (let k = Math.floor((prs[0]?.at ?? 0) / 1200); prs.length && k <= Math.floor(civ6.monthIndex / 1200); k++) {
        const part = prs.filter((p) => Math.floor(p.at / 1200) === k);
        if (!part.length) continue;
        yield out("negotiation", `\u5916\u4EA4\u4EA4\u6E09/${k * 100}\u5E74\u4EE3\u306E\u4EA4\u6E09\u8A18\u9332`, fm({ type: "\u5916\u4EA4\u4EA4\u6E09\u306E\u8A18\u9332", \u4EF6\u6570: part.length, tags: ["\u5916\u4EA4\u4EA4\u6E09"] }) + `# ${k * 100}\u5E74\u4EE3\u306E\u5916\u4EA4\u4EA4\u6E09\u306E\u8A18\u9332

\u63D0\u6848 \u2192 \u76F8\u624B\u306E\u8A55\u4FA1 \u2192 \u518D\u691C\u8A3C \u2192 \u7DE0\u7D50\u306E\u8A18\u9332\u3067\u3059\uFF08\u62D2\u5426\u3082\u6B8B\u3057\u307E\u3059\uFF09\u3002

` + table2(["\u6642\u671F", "\u7A2E\u985E", "\u63D0\u6848", "\u76F8\u624B", "\u7D50\u679C", "\u8A55\u4FA1", "\u4E3B\u306A\u8981\u56E0"], part.map((p) => [mi2s(p.at), p.kind === "peace" ? `\u8B1B\u548C\uFF08${p.terms?.kind === "reparations" ? "\u8CE0\u511F" : "\u767D\u7D19"}\uFF09` : TREATY_JA[p.type] ?? p.type, L(p.from), L(p.to), TS[p.status] ?? p.status, p.score, (p.f ?? []).slice(0, 3).map(([i, v]) => `${lab[i] ?? i} ${v}`).join("\u30FB")])));
      }
      const N2 = W6.news;
      if (N2) yield out("news", "\u30CB\u30E5\u30FC\u30B9/\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u72B6\u6CC1", fm({ type: "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9", \u672A\u78BA\u8A8D: N2.queue.length, \u78BA\u8A8D\u6E08\u307F: N2.acked.length, tags: ["\u30CB\u30E5\u30FC\u30B9"] }) + `# \u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306E\u72B6\u6CC1

\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\u306F\u753B\u9762\u5411\u3051\u306E\u6295\u5F71\u3067\u3001\u4E16\u754C\u306E\u4E8B\u5B9F\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u6B63\u672C\u306F\u5404\u51FA\u6765\u4E8B\u306E\u30CE\u30FC\u30C8\u3067\u3059\u3002

## \u672A\u78BA\u8A8D\uFF08\u78BA\u8A8D\u5F85\u3061\uFF09
${N2.queue.map((q2) => `- ${link2(q2.eventId, q2.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u78BA\u8A8D\u6E08\u307F\uFF08\u76F4\u8FD1 ${N2.acked.length} \u4EF6\uFF09
${N2.acked.slice(-100).map((id) => `- ${link2(id, id)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    }
    for (const s of Object.values(civ6.states)) {
      const evs = recordsOf(civ6, s.id, { limit: 1e6 }).reverse().filter((e) => inRange(evMonth(e))), wars = Object.values(civ6.wars).filter((w) => w.sides.a.includes(s.id) || w.sides.d.includes(s.id)), trs = Object.values(civ6.treaties).filter((t) => t.a === s.id || t.b === s.id);
      const cap = civ6.groups[s.capitalGroupId], comp = s.alive ? compositionAt(civ6, s.id, civ6.monthIndex) : null;
      yield out("state", P2.get(s.id), fm({ id: s.id, type: "\u56FD\u5BB6", name: s.name, \u6210\u7ACB: mi2s(s.formedAt), \u6EC5\u4EA1: s.alive ? null : mi2s(s.dissolvedAt), \u5B58\u7D9A\u4E2D: s.alive, \u6210\u7ACB\u7D4C\u8DEF: s.via, \u653F\u4F53: POLITY_JA2[s.polity] ?? s.polity, \u30D7\u30EC\u30A4\u30E4\u30FC\u56FD\u5BB6: !!s.player, \u524D\u8EAB: s.predecessor ?? null, tags: ["\u56FD\u5BB6"] }) + `# ${s.name}

- \u6210\u7ACB: ${mi2s(s.formedAt)}\uFF08${s.via}\uFF09${s.predecessor ? `\uFF0F\u524D\u8EAB: ${L(s.predecessor)}` : ""}
- ${s.alive ? "\u5B58\u7D9A\u4E2D" : `\u6EC5\u4EA1: ${mi2s(s.dissolvedAt)}`}
- \u653F\u4F53: ${POLITY_JA2[s.polity] ?? s.polity}\uFF0F\u6307\u5C0E\u8005: ${s.leader.name}\uFF08${s.leader.heir ? "\u5F8C\u7D99\u8005\u3042\u308A" : "\u5F8C\u7D99\u8005\u672A\u5B9A"}\uFF09
- \u9996\u90FD\uFF08\u96C6\u56E3\uFF09: ${cap ? link2(cap.id, "\u9996\u90FD\u306E\u96C6\u56E3") : "\u306A\u3057"}
- \u4EBA\u53E3 ${Math.round(s.pop)}\u30FB\u8CA1\u653F ${r1(s.treasury)}\u30FB\u5B89\u5B9A\u5EA6 ${r37(s.stability)}\u30FB\u5175\u529B ${Math.round(s.army)}\u30FB\u96C6\u843D ${s.settlements}
- \u65B9\u91DD: ${s.strategy?.goal ?? "\u2014"}
- \u653F\u7B56: \u7A0E ${s.policy.tax}\u30FB\u52D5\u54E1 ${s.policy.mobilization}\u30FB\u540C\u5316 ${s.policy.assimilation}\u30FB\u5BDB\u5BB9 ${s.policy.tolerance}\u30FB\u81EA\u6CBB ${s.policy.autonomy}
${s.magic ? `- \u9B54\u6CD5\u5236\u5EA6: ${INSTITUTIONS[s.magic.kind].ja}\uFF08\u56FD\u529B ${s.magic.power}\uFF09${s.magic.orgId ? `\uFF0F${L(s.magic.orgId)}` : ""}
` : ""}${s.resilience ? `- \u5099\u84C4\u30FB\u6CBB\u6C34: ${s.resilience}
` : ""}
## \u63A1\u7528\u3057\u305F\u6280\u8853
${Object.entries(s.techAdopted).map(([k, mi]) => `- ${link2(`tech:${k}`, TECHS.find((t) => t.key === k)?.name ?? k)}\uFF08${mi2s(mi)}\uFF09`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u95A2\u4FC2
${table2(["\u76F8\u624B", "\u95A2\u4FC2\u5024"], Object.entries(s.relations).map(([k, v]) => [L(k), v]))}
## \u6226\u4E89
${wars.map((w) => `- ${link2(w.id, `${nameOf(w.aggressor)}\u5BFE${nameOf(w.defender)}`)}\uFF08${mi2s(w.startedAt)}\uFF09`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u6761\u7D04
${trs.slice(0, 200).map((t) => `- ${link2(t.id, TREATY_JA[t.type] ?? t.type)}\uFF08${nameOf(t.a === s.id ? t.b : t.a)}\u30FB${mi2s(t.signedAt)}\uFF09`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u4EBA\u53E3\u69CB\u6210\uFF08${mi2s(civ6.monthIndex)}\uFF09
${comp ? `\u6587\u5316: ${Object.entries(comp.culture).map(([k, v]) => `${link2(k, nameOf(k))} ${Math.round(v)}`).join("\u3001")}

\u7A2E\u65CF: ${Object.entries(comp.species).map(([k, v]) => `${link2(k, SPECIES[k]?.ja ?? k)} ${Math.round(v)}`).join("\u3001")}
` : "\uFF08\u6EC5\u4EA1\uFF09\n"}
## \u51FA\u6765\u4E8B\uFF08\u65B0\u3057\u3044\u9806\u306B\u6700\u5927200\u4EF6\uFF09
${evs.slice(-200).reverse().map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u6B74\u53F2\u8A8D\u8B58
${civ6.interpretations.filter((x) => x.ownerId === s.id).slice(-30).map((x) => `- ${link2(x.interpId, STANCE[x.stance] ?? x.stance)}\uFF08${mi2s(x.since)}${x.until != null ? `\u301C${mi2s(x.until)}` : ""}\uFF09`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

\u8A73\u7D30\u30ED\u30B0: ${logFiles(civ6, s).map((f2) => `${f2.p}|${f2.label}`).join("\u3001")}
`);
    }
    for (const p of Object.values(civ6.persons)) yield out("person", P2.get(p.id), fm({ id: p.id, type: "\u4EBA\u7269", name: p.name, \u7A2E\u65CF: p.speciesId, \u80FD\u529B: p.ability, \u5F37\u5EA6: p.power, \u51FA\u73FE: mi2s(p.emergedAt), \u6CA1: p.diedAt == null ? null : mi2s(p.diedAt), tags: ["\u4EBA\u7269", "\u9B54\u6CD5"] }) + `# ${p.name}

- \u7A2E\u65CF: ${link2(p.speciesId, SPECIES[p.speciesId]?.ja ?? p.speciesId)}
- \u80FD\u529B: ${link2(`ability:${p.ability}`, ABILITIES[p.ability].ja)}\uFF08\u5F37\u5EA6 ${p.power}\uFF09
- \u96C6\u56E3: ${civ6.groups[p.groupId] ? link2(p.groupId, "\u6240\u5C5E\u96C6\u56E3") : "\uFF08\u6D88\u6EC5\uFF09"}
- \u7D44\u7E54: ${p.orgId ? L(p.orgId) : "\u306A\u3057"}
- ${p.diedAt == null ? "\u5B58\u547D" : `\u6CA1: ${mi2s(p.diedAt)}`}

## \u95A2\u308F\u3063\u305F\u51FA\u6765\u4E8B
${(ix.byEntity.get(p.id) ?? []).map((i) => civ6.events[i]).slice(0, 50).map((e) => `- ${link2(e.eventId, e.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const f2 of Object.values(civ6.figures ?? {})) {
      const house = civ6.houses?.[f2.houseId], H = f2.history ?? [], KIND3 = { appeared: "\u767B\u5834", left_office: "\u9000\u4F4D", deposed: "\u9000\u3051\u3089\u308C\u305F", renamed_by_creator: "\u5275\u9020\u4E3B\u306B\u3088\u308B\u6539\u540D" };
      yield out("person", P2.get(f2.id), fm({ id: f2.id, type: "\u4EBA\u7269", name: f2.name, \u56FD\u5BB6: f2.stateId ?? null, \u5BB6\u7CFB: house?.name ?? null, \u5F79\u5272: f2.role ?? null, \u751F: mi2s(f2.bornAt), \u6CA1: f2.diedAt == null ? null : mi2s(f2.diedAt), tags: ["\u4EBA\u7269"] }) + `# ${f2.name}

- \u56FD\u5BB6: ${f2.stateId ? L(f2.stateId) : "\u306A\u3057"}\uFF0F\u5F79\u5272: ${f2.role ?? "\u2014"}${house ? `\uFF0F\u5BB6\u7CFB: ${house.name}` : ""}
- \u751F: ${mi2s(f2.bornAt)}\uFF0F${f2.diedAt == null ? "\u5B58\u547D" : `\u6CA1: ${mi2s(f2.diedAt)}`}
- \u89AA: ${f2.parents?.length ? f2.parents.map(L).join("\u3001") : "\u4E0D\u660E"}
- \u5B50: ${(f2.children ?? []).map(L).join("\u3001") || "\u306A\u3057"}

## \u7D4C\u6B74
${H.map((x) => `- ${mi2s(x.at)} ${KIND3[x.kind] ?? x.kind}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    }
    for (const a of Object.values(ABILITIES)) yield out("ability", P2.get(`ability:${a.id}`), fm({ id: a.id, type: "\u9B54\u6CD5\u306E\u80FD\u529B", name: a.ja, tags: ["\u9B54\u6CD5"] }) + `# ${a.ja}

- \u4EE3\u511F: ${a.cost}
- \u66B4\u767A\u306E\u5371\u967A: ${a.risk}
- \u7D20\u8CEA\u8005: ${Object.values(civ6.persons).filter((p) => p.ability === a.id).slice(0, 100).map((p) => L(p.id)).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const o of Object.values(civ6.magic.orgs)) yield out("org", P2.get(o.id), fm({ id: o.id, type: "\u9B54\u6CD5\u7D44\u7E54", name: o.name, \u7D50\u6210: mi2s(o.foundedAt), \u89E3\u6563: o.endedAt == null ? null : mi2s(o.endedAt), tags: ["\u9B54\u6CD5", "\u7D44\u7E54"] }) + `# ${o.name}

- \u7A2E\u5225: ${o.kind}
- \u56FD\u5BB6: ${L(o.stateId)}
- \u6210\u54E1: ${o.members.map((m) => L(m)).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const [k, sp] of Object.entries(civ6.species)) yield out("species", P2.get(k), fm({ id: k, type: "\u7A2E\u65CF", name: sp.name, tags: ["\u7A2E\u65CF"] }) + `# ${sp.name}

${SPECIES[k] ? `- \u5BFF\u547D ${Math.round(SPECIES[k].lifespan / 12)}\u5E74\uFF0F\u6210\u9577 \xD7${SPECIES[k].growth}\uFF0F\u6280\u8853 \xD7${SPECIES[k].techRate}\uFF0F\u8ECD\u4E8B \xD7${SPECIES[k].martial}\uFF0F\u9B54\u6CD5\u7D20\u8CEA \xD7${r1(SPECIES[k].magic / 2e-3)}
` : ""}- \u96C6\u56E3: ${Object.values(civ6.groups).filter((g) => g.speciesId === k).length}
`);
    for (const w of Object.values(civ6.wars)) yield out("war", P2.get(w.id), fm({ id: w.id, type: "\u6226\u4E89", \u958B\u6226: mi2s(w.startedAt), \u7D42\u7D50: w.endedAt == null ? null : mi2s(w.endedAt), \u7D50\u679C: OUTCOME_JA[w.outcome] ?? w.outcome ?? null, tags: ["\u6226\u4E89"] }) + `# ${nameOf(w.aggressor)}\u5BFE${nameOf(w.defender)}\u306E\u6226\u4E89

- \u653B\u6483\u5074: ${w.sides.a.map(L).join("\u3001")}
- \u9632\u885B\u5074: ${w.sides.d.map(L).join("\u3001")}
- \u7406\u7531: ${w.reason}
- \u958B\u6226: ${mi2s(w.startedAt)}\uFF0F${w.endedAt == null ? "\u7D99\u7D9A\u4E2D" : `\u7D42\u7D50: ${mi2s(w.endedAt)}\uFF08${OUTCOME_JA[w.outcome] ?? w.outcome}\uFF09`}
- \u6226\u6CC1\u70B9 ${r1(w.score)}\u30FB\u640D\u8017 ${Math.round(w.casualties)}
- \u5BA3\u6226: ${w.declaredEvent ? link2(w.declaredEvent, "\u5BA3\u6226\u306E\u30A4\u30D9\u30F3\u30C8") : "\u2014"}
- \u5360\u9818\u3055\u308C\u305F\u96C6\u56E3: ${w.occupied.map((g) => civ6.groups[g] ? link2(g, "\u96C6\u56E3") : g).join("\u3001") || "\u306A\u3057"}

## \u7D4C\u904E
${(ix.byEntity.get(w.id) ?? []).map((i) => civ6.events[i]).map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n")}
`);
    for (const t of Object.values(civ6.treaties)) yield out("treaty", P2.get(t.id), fm({ id: t.id, type: "\u6761\u7D04", \u7A2E\u5225: TREATY_JA[t.type] ?? t.type, \u7DE0\u7D50: mi2s(t.signedAt), \u7D42\u4E86: t.endedAt == null ? null : mi2s(t.endedAt), tags: ["\u6761\u7D04"] }) + `# ${nameOf(t.a)}\u3068${nameOf(t.b)}\u306E${TREATY_JA[t.type] ?? t.type}

- \u5F53\u4E8B\u56FD: ${L(t.a)}\u3001${L(t.b)}
- \u7DE0\u7D50: ${mi2s(t.signedAt)}\uFF0F${t.active ? `\u671F\u9650: ${mi2s(t.expiresAt)}` : `\u7D42\u4E86: ${mi2s(t.endedAt)}`}
`);
    if (opts.eventNotes !== false) for (const e of evList(civ6)) {
      const m = evMonth(e);
      if (!inRange(m)) continue;
      const cons = consequencesOf(civ6, e.eventId);
      yield out(e.kind === "battle_fought" ? "battle" : "event", P2.get(e.eventId), fm({ id: e.eventId, type: e.kind === "battle_fought" ? "\u6226\u95D8" : "\u51FA\u6765\u4E8B", kind: e.kind, \u65E5\u4ED8: d2s(e.date), \u767A\u751F\u6E90: e.provenance ?? "world", \u5224\u65AD: e.decisionId ?? null, tags: ["\u51FA\u6765\u4E8B", e.kind] }) + `# ${e.title}

- \u65E5\u4ED8: ${d2s(e.date)}\uFF0F\u7A2E\u985E: ${e.kind}\uFF0F\u5834\u6240: ${cellLoc(e.location?.cell)}
- \u95A2\u4E0E: ${e.participants.map((p) => `${p.role}: ${L(p.entityId)}`).join("\u3001") || "\u306A\u3057"}
${e.decisionId ? `- \u56FD\u5BB6AI\u30FB\u547D\u4EE4\u306E\u5224\u65AD: ${link2(e.decisionId, "\u5224\u65AD\u8A18\u9332")}
` : ""}
## \u539F\u56E0
${e.causes.map((c) => `- ${c.relation}\uFF08${c.basis}${c.userEdited ? "\u30FB\u624B\u52D5\u7DE8\u96C6" : ""}\uFF09: ${link2(c.targetId, nameOf(c.targetId) !== c.targetId ? nameOf(c.targetId) : getEvent(civ6, c.targetId)?.title ?? c.targetId)}`).join("\n") || "\uFF08\u8A18\u9332\u3055\u308C\u305F\u539F\u56E0\u306A\u3057\uFF09"}

## \u7D50\u679C\uFF08\u3053\u306E\u30A4\u30D9\u30F3\u30C8\u3092\u539F\u56E0\u306B\u6319\u3052\u305F\u3082\u306E\uFF09
${cons.slice(0, 100).map((c) => `- ${c.relation}\uFF08${c.basis}\uFF09: ${link2(c.from, c.event?.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}

## \u52B9\u679C
${table2(["\u5BFE\u8C61", "\u9805\u76EE", "\u5909\u66F4\u524D", "\u5909\u66F4\u5F8C"], e.effects.map((x) => [L(x.targetId), x.property, x.before, x.after]))}`);
    }
    if (opts.decisionNotes !== false) for (const d of civ6.decisions ?? []) {
      if (!inRange(d2mi(d.date))) continue;
      const x = expandDecision(civ6, d);
      yield out("decision", P2.get(d.decisionId), fm({ id: d.decisionId, type: "AI\u5224\u65AD", \u56FD\u5BB6: d.actorId, \u65E5\u4ED8: d2s(d.date), \u5C64: d.layer, \u884C\u52D5: d.chosen.key ?? null, \u6210\u5426: d.result?.ok ?? null, \u767A\u751F\u6E90: d.provenance, tags: ["\u5224\u65AD", d.layer] }) + `# ${nameOf(d.actorId)}\u306E\u5224\u65AD\uFF08${d2s(d.date)}\uFF09

- \u56FD\u5BB6: ${L(d.actorId)}\uFF0F\u5C64: ${d.layer}\uFF0F\u7A2E\u5225: ${d.type}\uFF0F\u767A\u751F\u6E90: ${d.provenance}
- \u9078\u629E: **${d.chosen.key ?? "\u4F55\u3082\u3057\u306A\u3044"}**${d.chosen.target ? `\uFF08\u5BFE\u8C61 ${L(d.chosen.target)}\uFF09` : ""}${d.chosen.opt ? `\uFF08${d.chosen.opt}\uFF09` : ""}
- \u7D50\u679C: ${d.result ? d.result.ok ? "\u6210\u529F" : `\u5931\u6557\uFF08${d.result.error}\uFF09` : "\u2014"}${(d.result?.eventIds ?? []).map((i) => ` ${link2(i, "\u7D50\u679C\u306E\u30A4\u30D9\u30F3\u30C8")}`).join("")}
- \u65B9\u91DD: ${d.strategy ?? "\u2014"}

## \u89B3\u6E2C
${Object.entries(d.observations).map(([k, v]) => `- ${k}: ${typeof v === "number" ? r37(v) : v}`).join("\n")}

## \u5019\u88DC
${table2(["\u884C\u52D5", "\u5BFE\u8C61", "\u9078\u629E\u80A2", "\u5F97\u70B9", "\u8CC7\u683C", "\u7406\u7531", "\u8981\u56E0"], x.candidates.map((c) => [c.key, c.target ? L(c.target) : "", c.opt ?? "", c.total, c.eligible ? "\u53EF" : "\u4E0D\u53EF", c.reason ?? "", Object.entries(c.factors ?? {}).map(([k, v]) => `${k} ${v}`).join("\u3001")]))}`);
    }
    for (const s of Object.values(civ6.settlements)) yield out("settlement", P2.get(s.id), fm({ id: s.id, type: "\u96C6\u843D", \u6BB5\u968E: s.stage, \u5275\u8A2D: mi2s(s.foundedAt), tags: ["\u96C6\u843D"] }) + `# \u96C6\u843D\uFF08${STAGE_JA2[s.stage] ?? s.stage}\uFF09

- \u96C6\u56E3: ${civ6.groups[s.groupId] ? link2(s.groupId, "\u96C6\u56E3") : "\uFF08\u6D88\u6EC5\uFF09"}
- \u5834\u6240: ${cellLoc(s.cell)}
- \u5275\u8A2D: ${mi2s(s.foundedAt)}\uFF0F\u4EBA\u53E3 ${Math.round(s.pop)}

## \u51FA\u6765\u4E8B
${(ix.byEntity.get(s.id) ?? []).map((i) => civ6.events[i]).slice(0, 50).map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const g of Object.values(civ6.groups)) yield out("group", P2.get(g.id), fm({ id: g.id, type: "\u4EBA\u53E3\u96C6\u56E3", \u7A2E\u65CF: g.speciesId, \u751F\u696D: g.subsistence, \u56FD\u5BB6: g.stateId ?? null, tags: ["\u96C6\u56E3"] }) + `# \u96C6\u56E3 ${g.id}

- \u5834\u6240: ${cellLoc(g.cell)}\uFF0F\u751F\u696D: ${g.subsistence}\uFF0F\u4EBA\u53E3 ${Math.round(g.pop)}\uFF0F\u56FD\u5BB6: ${g.stateId ? L(g.stateId) : "\u306A\u3057"}\uFF0F\u7A2E\u65CF: ${link2(g.speciesId, SPECIES[g.speciesId]?.ja ?? g.speciesId)}
- \u7531\u6765: ${g.parent ? link2(g.parent, "\u89AA\u306E\u96C6\u56E3") : "\u6700\u521D\u304B\u3089"}

## \u69CB\u6210\uFF08\u30B3\u30DB\u30FC\u30C8\uFF09
${table2(["\u6587\u5316", "\u8A00\u8A9E", "\u5B97\u6559", "\u7A2E\u65CF", "\u5272\u5408", "\u7DCA\u5F35"], g.cohorts.map((c) => [L(c.cultureId), L(c.languageId), c.religionId ? L(c.religionId) : "\u306A\u3057", SPECIES[c.speciesId]?.ja ?? c.speciesId, r37(c.share), r37(c.tension)]))}
## \u77E5\u3063\u3066\u3044\u308B\u6280\u8853
${Object.entries(g.tech.known).map(([k, mi]) => `${link2(`tech:${k}`, TECHS.find((t) => t.key === k)?.name ?? k)}\uFF08${mi2s(mi)}\uFF09`).join("\u3001") || "\uFF08\u306A\u3057\uFF09"}
`);
    for (const r of regionsOf(world)) {
      const inReg = Object.values(civ6.groups).filter((g) => world.cell.continent[g.cell] === r.id);
      yield out("region", P2.get(`region:${r.id}`), fm({ id: `region_${r.id}`, type: "\u5730\u57DF", \u9678\u5730\u30BB\u30EB: r.cells, \u9762\u7A4Dkm2: Math.round(r.area), tags: ["\u5730\u57DF"] }) + `# ${r.name}

- \u9678\u5730\u30BB\u30EB ${r.cells}\u30FB\u9762\u7A4D ${Math.round(r.area).toLocaleString("en-US")} km\xB2
- \u91CD\u5FC3: \u7DEF\u5EA6 ${r1(r.sumLat / r.cells * 180 / Math.PI)}\xB0\u30FB\u7D4C\u5EA6 ${r1(r.sumLon / r.cells * 180 / Math.PI)}\xB0
- \u73FE\u5728\u306E\u96C6\u56E3 ${inReg.length}\u30FB\u4EBA\u53E3 ${Math.round(inReg.reduce((a, g) => a + g.pop, 0))}
- \u56FD\u5BB6: ${[...new Set(inReg.map((g) => g.stateId).filter(Boolean))].map(L).join("\u3001") || "\u306A\u3057"}
`);
    }
    for (const c of Object.values(civ6.cultures)) yield out("culture", P2.get(c.id), fm({ id: c.id, type: "\u6587\u5316", name: c.name, \u8D77\u6E90: mi2s(c.bornAt), tags: ["\u6587\u5316"] }) + `# ${c.name}

- \u8D77\u6E90: ${mi2s(c.bornAt)}\uFF0F${cellLoc(c.cell)}
- \u89AA: ${c.parent ? L(c.parent) : "\u306A\u3057"}
- \u5B50: ${Object.values(civ6.cultures).filter((x) => x.parent === c.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
- \u8A00\u8A9E: ${Object.values(civ6.languages).filter((l) => l.cultureId === c.id).map((l) => L(l.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const l of Object.values(civ6.languages)) yield out("language", P2.get(l.id), fm({ id: l.id, type: "\u8A00\u8A9E", name: l.name, \u8D77\u6E90: mi2s(l.bornAt), tags: ["\u8A00\u8A9E"] }) + `# ${l.name}

- \u8D77\u6E90: ${mi2s(l.bornAt)}\uFF0F\u6587\u5316: ${civ6.cultures[l.cultureId] ? L(l.cultureId) : "\u2014"}
- \u89AA: ${l.parent ? L(l.parent) : "\u306A\u3057"}\uFF0F\u5B50: ${Object.values(civ6.languages).filter((x) => x.parent === l.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const r of Object.values(civ6.religions)) yield out("religion", P2.get(r.id), fm({ id: r.id, type: "\u5B97\u6559", name: r.name, \u7A2E\u985E: r.kind, \u8D77\u6E90: mi2s(r.bornAt), tags: ["\u5B97\u6559"] }) + `# ${r.name}

- \u7A2E\u985E: ${r.kind}\uFF0F\u8D77\u6E90: ${mi2s(r.bornAt)}
- \u89AA: ${r.parent ? L(r.parent) : "\u306A\u3057"}\uFF0F\u5B50: ${Object.values(civ6.religions).filter((x) => x.parent === r.id).map((x) => L(x.id)).join("\u3001") || "\u306A\u3057"}
`);
    for (const t of TECHS) {
      const w = civ6.techWorld[t.key];
      const adopters = Object.values(civ6.states).filter((s) => s.techAdopted[t.key] != null);
      yield out("tech", P2.get(`tech:${t.key}`), fm({ id: t.key, type: "\u6280\u8853", name: t.name, \u5206\u91CE: t.field, \u6BB5\u968E: t.tier, tags: ["\u6280\u8853"] }) + `# ${t.name}

- \u5206\u91CE: ${t.field}\uFF0F\u6BB5\u968E ${t.tier}\uFF0F\u524D\u63D0: ${t.prereq.map((p) => link2(`tech:${p}`, TECHS.find((x) => x.key === p)?.name ?? p)).join("\u3001") || "\u306A\u3057"}
- \u4E16\u754C\u3067\u6700\u521D\u306E\u767A\u898B: ${w?.discoveries?.[0] ? `${mi2s(w.discoveries[0].month)}\uFF08${link2(w.discoveries[0].eventId, "\u767A\u898B\u306E\u30A4\u30D9\u30F3\u30C8")}\uFF09` : "\u307E\u3060"}
- \u767A\u898B\u306E\u8A18\u9332 ${w?.discoveries?.length ?? 0} \u4EF6\uFF0F\u4FDD\u6709\u3059\u308B\u96C6\u56E3 ${Object.values(civ6.groups).filter((g) => g.tech.known[t.key] != null).length}
- \u63A1\u7528\u3057\u3066\u3044\u308B\u56FD\u5BB6: ${adopters.map((s) => L(s.id)).join("\u3001") || "\u306A\u3057"}
`);
    }
    for (const d of Object.values(civ6.disasters)) yield out("disaster", P2.get(d.id), fm({ id: d.id, type: "\u707D\u5BB3", \u7A2E\u985E: KIND_JA[d.kind], \u898F\u6A21: d.severity, \u958B\u59CB: mi2s(d.startedAt), \u7D42\u4E86: mi2s(d.endsAt), tags: ["\u707D\u5BB3"] }) + `# ${KIND_JA[d.kind]}\uFF08${mi2s(d.startedAt)}\uFF09

- \u898F\u6A21 ${d.severity}\u30FB${cellLoc(d.center)}\u30FB\u671F\u9593 ${mi2s(d.startedAt)}\u301C${mi2s(d.endsAt)}\u30FB${d.deaths} \u4EBA\u304C\u4EA1\u304F\u306A\u3063\u305F
- \u767A\u751F: ${link2(d.eventId, "\u707D\u5BB3\u306E\u30A4\u30D9\u30F3\u30C8")}
- \u5F71\u97FF\u3092\u53D7\u3051\u305F\u96C6\u56E3: ${d.groupIds.slice(0, 30).map((g) => civ6.groups[g] ? link2(g, "\u96C6\u56E3") : g).join("\u3001")}
`);
    for (const x of civ6.interpretations) yield out("interp", P2.get(x.interpId), fm({ id: x.interpId, type: "\u6B74\u53F2\u8A8D\u8B58", \u56FD\u5BB6: x.ownerId, \u7ACB\u5834: STANCE[x.stance] ?? x.stance, \u8A55\u4FA1: x.valence, \u958B\u59CB: mi2s(x.since), \u7D42\u4E86: x.until == null ? null : mi2s(x.until), \u7F6E\u304D\u63DB\u3048\u5143: x.supersedes ?? null, tags: ["\u6B74\u53F2\u8A8D\u8B58"] }) + `# ${nameOf(x.ownerId)}\u306E\u8A8D\u8B58: ${STANCE[x.stance] ?? x.stance}

- \u4E8B\u4EF6: ${link2(x.eventId, getEvent(civ6, x.eventId)?.title)}\uFF08\u4E8B\u5B9F\u306E\u30A4\u30D9\u30F3\u30C8\u306F\u5909\u308F\u3089\u306A\u3044\u3002\u5909\u308F\u308B\u306E\u306F\u56FD\u5BB6\u306E\u53D7\u3051\u6B62\u3081\u65B9\uFF09
- \u8A55\u4FA1 ${x.valence}\uFF08\u22121 \u5426\u5B9A\u301C+1 \u80AF\u5B9A\uFF09\uFF0F\u76F8\u624B: ${x.about.map(L).join("\u3001") || "\u306A\u3057"}
- ${mi2s(x.since)}\u301C${x.until == null ? "\u73FE\u5728" : mi2s(x.until)}${x.supersedes ? `\uFF0F\u524D\u306E\u8A8D\u8B58: ${link2(x.supersedes, "\u7F6E\u304D\u63DB\u3048\u5143")}` : ""}
`);
    for (const w of civ6.works) yield out("work", P2.get(w.workId), fm({ id: w.workId, type: "\u8868\u73FE\u7269", \u7A2E\u985E: w.kind, \u8457\u8005: w.authorId, \u4E8B\u5B9F\u3068\u306E\u4E00\u81F4: w.fidelity === "faithful", tags: ["\u8868\u73FE\u7269"] }) + `# ${nameOf(w.authorId)}\u306E\u5E74\u4EE3\u8A18

${w.text}

- \u5BFE\u8C61\u306E\u4E8B\u4EF6: ${link2(w.targetEventId, getEvent(civ6, w.targetEventId)?.title)}\uFF0F\u7ACB\u5834: ${STANCE[w.stance] ?? w.stance}\uFF0F${w.fidelity === "faithful" ? "\u4E8B\u5B9F\u306B\u5FE0\u5B9F" : "\u4E8B\u5B9F\u3068\u7570\u306A\u308B\u8A18\u8FF0\u3092\u542B\u3080"}

## \u4E8B\u5B9F\u3068\u306E\u5DEE
${table2(["\u9805\u76EE", "\u8A18\u8FF0", "\u4E8B\u5B9F"], w.claims.map((c) => [c.property, c.claimed, c.actual]))}`);
    if (opts.eventNotes === false) {
      const byDecade = /* @__PURE__ */ new Map();
      for (const e of evList(civ6)) {
        const m = evMonth(e);
        if (!inRange(m)) continue;
        const k = Math.floor(e.date.year / 10);
        (byDecade.get(k) ?? byDecade.set(k, []).get(k)).push(e);
      }
      const KIND_LABEL = (e) => e.kind;
      for (const [k, es] of [...byDecade].sort((a, b) => a[0] - b[0])) {
        es.sort((a, b) => evMonth(a) - evMonth(b) || (a.eventId < b.eventId ? -1 : 1));
        const y0 = k * 10, c0 = Math.floor(y0 / 100) * 100;
        yield out("timeline", `${FOLDERS.timeline}/${c0}\u5E74\u4EE3/${y0}\u301C${y0 + 9}\u5E74`, fm({ type: "\u5E74\u8868", \u671F\u9593: `${y0}\u5E74\u301C${y0 + 9}\u5E74`, \u4EF6\u6570: es.length, tags: ["\u5E74\u8868"] }) + `# ${y0}\u301C${y0 + 9}\u5E74\u306E\u5E74\u8868

\u5168\u3066\u306E\u51FA\u6765\u4E8B\u3092\u6642\u7CFB\u5217\u3067\u8A18\u9332\u3059\u308B\uFF08\u7701\u7565\u306A\u3057\uFF09\u3002

` + es.map((e) => `- **${d2s(e.date)}** \u3014${KIND_LABEL(e)}\u3015 ${String(e.title ?? "").replace(/\n/g, " ")}${e.participants?.length ? `\uFF08${e.participants.map((p) => L(p.entityId)).join("\u3001")}\uFF09` : ""}${e.location?.cell != null ? ` @${cellLoc(e.location.cell).replace(/（.*$/, "")}` : ""}`).join("\n") + "\n");
      }
    }
    const byCentury = /* @__PURE__ */ new Map();
    for (const e of evList(civ6)) {
      if (!inRange(evMonth(e)) || ["tech_transferred", "demand_raised", "cohort_formed", "cohort_assimilated", "culture_contact", "settlement_stage", "settlement_founded", "state_action", "group_split", "language_diverged"].includes(e.kind)) continue;
      const k = Math.floor(e.date.year / 100);
      (byCentury.get(k) ?? byCentury.set(k, []).get(k)).push(e);
    }
    for (const [k, es] of [...byCentury].sort((a, b) => a[0] - b[0])) yield out("chronicle", `${FOLDERS.chronicle}/${k * 100}\u5E74\u4EE3`, fm({ type: "\u5E74\u4EE3\u8A18", \u671F\u9593: `${k * 100}\u5E74\u301C${k * 100 + 99}\u5E74`, tags: ["\u5E74\u4EE3\u8A18"] }) + `# ${k * 100}\u5E74\u4EE3\u306E\u5E74\u4EE3\u8A18

\uFF08\u65E5\u5E38\u7684\u306A\u51FA\u6765\u4E8B \u2014 \u6280\u8853\u306E\u4F1D\u64AD\u30FB\u4E0D\u6E80\u30FB\u6587\u5316\u306E\u63A5\u89E6\u306A\u3069 \u2014 \u306F\u9664\u3044\u305F\u4E3B\u8981\u306A\u4E8B\u4EF6\u3002\u5168\u4EF6\u306F\u5404\u30CE\u30FC\u30C8\u3068\u51FA\u6765\u4E8B\u30D5\u30A9\u30EB\u30C0\u306B\u3042\u308B\uFF09

${es.map((e) => `- ${d2s(e.date)} ${link2(e.eventId, e.title)}`).join("\n")}
`);
    for (const s of Object.values(civ6.states)) {
      for (const f2 of logFiles(civ6, s)) {
        if (f2.kind === "state") yield out("logState", f2.path, stateLog(civ6, s, f2, link2));
        else yield out("logAi", f2.path, aiLog(civ6, s, f2, link2, d2mi));
      }
    }
    yield out("graph", `${FOLDERS.graph}/\u56FD\u5BB6\u306E\u7CFB\u8B5C`, graphNote("\u56FD\u5BB6\u306E\u7CFB\u8B5C", "\u524D\u8EAB\u306E\u56FD\u5BB6\u304B\u3089\u5206\u96E2\u30FB\u7D99\u627F\u3057\u305F\u95A2\u4FC2", Object.values(civ6.states).filter((s) => s.predecessor && civ6.states[s.predecessor]).map((s) => [s.predecessor, s.id]), (id) => civ6.states[id].name));
    yield out("graph", `${FOLDERS.graph}/\u6587\u5316\u306E\u7CFB\u7D71`, graphNote("\u6587\u5316\u306E\u7CFB\u7D71", "\u89AA\u306E\u6587\u5316\u304B\u3089\u5206\u304B\u308C\u305F\u95A2\u4FC2", Object.values(civ6.cultures).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ6.cultures[id].name));
    yield out("graph", `${FOLDERS.graph}/\u8A00\u8A9E\u306E\u7CFB\u7D71`, graphNote("\u8A00\u8A9E\u306E\u7CFB\u7D71", "\u89AA\u306E\u8A00\u8A9E\u304B\u3089\u5206\u304B\u308C\u305F\u95A2\u4FC2", Object.values(civ6.languages).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ6.languages[id].name));
    yield out("graph", `${FOLDERS.graph}/\u5B97\u6559\u306E\u7CFB\u7D71`, graphNote("\u5B97\u6559\u306E\u7CFB\u7D71", "\u89AA\u306E\u5B97\u6559\u304B\u3089\u5206\u304B\u308C\u305F\u95A2\u4FC2", Object.values(civ6.religions).filter((c) => c.parent).map((c) => [c.parent, c.id]), (id) => civ6.religions[id].name));
    yield out("graph", `${FOLDERS.graph}/\u6226\u4E89\u306E\u95A2\u4FC2`, graphNote("\u6226\u4E89\u306E\u95A2\u4FC2", "\u653B\u6483\u5074 \u2192 \u9632\u885B\u5074", Object.values(civ6.wars).map((w) => [w.aggressor, w.defender]), (id) => civ6.states[id]?.name ?? id));
    if (opts.maps !== false && opts.cellRaster) for (const f2 of await mapImages(world, civ6, opts)) yield outRaw("map", `${FOLDERS.map}/${f2.name}`, f2.png);
    yield out("readme", "README", readme(root2, world, civ6, counts, stats, opts));
    yield { path: `${root2}/manifest.json`, data: JSON.stringify({ format: "alterhistory-obsidian", version: OBSIDIAN_VERSION, world: worldName, month: civ6.monthIndex, date: civ6.date, counts, unresolvedLinks: stats.unresolved, outOfScopeLinks: stats.outOfScope, unresolvedSamples: stats.missing, scope: { fromMonth: Number.isFinite(from) ? from : null, toMonth: Number.isFinite(to) ? to : null, decisionNotes: opts.decisionNotes !== false, maps: opts.maps !== false && !!opts.cellRaster } }, null, 1), kind: "manifest" };
  }
  function logFiles(civ6, s) {
    const a = s.formedAt, b = s.alive ? civ6.monthIndex : s.dissolvedAt, out = [];
    for (let k = Math.floor(a / 1200); k <= Math.floor(b / 1200); k++) {
      out.push({ kind: "state", k, path: `${FOLDERS.logState}/${safe(s.name)}__${s.id}__${k * 100}\u5E74\u4EE3`, p: `${FOLDERS.logState}/${safe(s.name)}__${s.id}__${k * 100}\u5E74\u4EE3`, label: `\u6708\u6B21\u72B6\u614B ${k * 100}\u5E74\u4EE3` });
    }
    for (let k = Math.floor(a / 1200); k <= Math.floor(b / 1200); k++) out.push({ kind: "ai", k, path: `${FOLDERS.logAi}/${safe(s.name)}__${s.id}__${k * 100}\u5E74\u4EE3`, p: `${FOLDERS.logAi}/${safe(s.name)}__${s.id}__${k * 100}\u5E74\u4EE3`, label: `AI\u5224\u65AD ${k * 100}\u5E74\u4EE3` });
    return out;
  }
  function stateLog(civ6, s, f2, link2) {
    const lo = Math.max(s.formedAt, f2.k * 1200), hi = Math.min(s.alive ? civ6.monthIndex : s.dissolvedAt, f2.k * 1200 + 1199), H = civ6.history, e = H?.states[s.id], times = /* @__PURE__ */ new Set([lo]);
    if (e) for (const k in e.f) {
      const a = e.f[k];
      for (let i = 0; i < a.length; i += 2) if (a[i] >= lo && a[i] <= hi) times.add(a[i]);
    }
    const rows = [...times].sort((a, b) => a - b).map((t) => {
      const x = stateAt(civ6, s.id, t);
      return x ? [mi2s(t), x.alive ? "\u5B58\u7D9A" : "\u6EC5\u4EA1", POLITY_JA2[x.polity] ?? x.polity, x.leader.name, Math.round(x.pop), x.treasury.toFixed(2), x.stability.toFixed(4), Math.round(x.army), x.settlements, x.groupCount, x.strategy ?? "", x.campaign ?? "", x.warIds.length, x.techAdopted.length] : null;
    }).filter(Boolean);
    return fm({ type: "\u56FD\u5BB6\u306E\u6708\u6B21\u72B6\u614B", \u56FD\u5BB6: s.id, \u671F\u9593: `${mi2s(lo)}\u301C${mi2s(hi)}`, tags: ["\u8A73\u7D30\u30ED\u30B0"] }) + `# ${s.name} \u6708\u6B21\u72B6\u614B\uFF08${mi2s(lo)}\u301C${mi2s(hi)}\uFF09

\u72B6\u614B\u304C\u5909\u308F\u3063\u305F\u6708\u3060\u3051\u3092\u884C\u306B\u3059\u308B\u3002\u5909\u5316\u306E\u306A\u3044\u6708\u306F\u3001\u76F4\u524D\u306E\u884C\u304C\u305D\u306E\u307E\u307E\u7D9A\u304F\uFF08\u6B20\u843D\u3067\u306F\u306A\u3044\uFF09\u3002\u5024\u306F\u5F53\u6642\u306E\u89B3\u6E2C\u5024\uFF08\u4EBA\u53E3\u30FB\u5175\u529B\u306F\u4EBA\u3001\u8CA1\u653F\u306F 0.01\u3001\u5B89\u5B9A\u5EA6\u306F 0.0001 \u5358\u4F4D\uFF09\u3002

${(() => {
      const t = "| \u6708 | \u5B58\u7D9A | \u653F\u4F53 | \u6307\u5C0E\u8005 | \u4EBA\u53E3 | \u8CA1\u653F | \u5B89\u5B9A\u5EA6 | \u5175\u529B | \u96C6\u843D | \u96C6\u56E3 | \u65B9\u91DD | \u4F5C\u6226 | \u6226\u4E89\u6570 | \u6280\u8853\u6570 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n";
      return t + rows.map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n";
    })()}
${link2(s.id, "\u2190 " + s.name)}
`;
  }
  function aiLog(civ6, s, f2, link2, d2mi2) {
    const lo = f2.k * 1200, hi = lo + 1199, ds = [];
    const ix = graphIndex(civ6);
    for (const i of ix.decByActor.get(s.id) ?? []) {
      const d = civ6.decisions[i], m = d2mi2(d.date);
      if (m >= lo && m <= hi) ds.push(d);
    }
    return fm({ type: "AI\u5224\u65AD\u306E\u4E00\u89A7", \u56FD\u5BB6: s.id, \u4EF6\u6570: ds.length, tags: ["\u8A73\u7D30\u30ED\u30B0"] }) + `# ${s.name} AI\u5224\u65AD\uFF08${f2.k * 100}\u5E74\u4EE3\uFF09

| \u65E5\u4ED8 | \u5C64 | \u9078\u629E | \u6210\u5426 | \u30CE\u30FC\u30C8 |
| --- | --- | --- | --- | --- |
${ds.map((d) => `| ${d2s(d.date)} | ${d.layer} | ${d.chosen.key ?? "\u4F55\u3082\u3057\u306A\u3044"} | ${d.result ? d.result.ok ? "\u6210\u529F" : `\u5931\u6557 ${d.result.error ?? ""}` : "\u2014"} | ${link2(d.decisionId, "\u8A73\u7D30")} |`).join("\n")}

${link2(s.id, "\u2190 " + s.name)}
`;
  }
  function graphNote(title, sub2, edges, label) {
    const ids = [...new Set(edges.flat())].slice(0, 200), set = new Set(ids), n2 = new Map(ids.map((id, i) => [id, `n${i}`])), es = edges.filter(([a, b]) => set.has(a) && set.has(b)).slice(0, 400);
    return fm({ type: "\u95A2\u4FC2\u30B0\u30E9\u30D5", tags: ["\u30B0\u30E9\u30D5"] }) + `# ${title}

${sub2}\u3002Mermaid \u3067\u63CF\u753B\u3055\u308C\u308B\uFF08\u30CE\u30FC\u30C9 ${ids.length}\u30FB\u8FBA ${es.length}${edges.length > es.length ? `\u3002\u4E0A\u9650\u306E\u305F\u3081 ${edges.length - es.length} \u672C\u3092\u7701\u7565` : ""}\uFF09\u3002

\`\`\`mermaid
graph LR
${ids.map((id) => `  ${n2.get(id)}["${String(label(id)).replace(/"/g, "'")}"]`).join("\n")}
${es.map(([a, b]) => `  ${n2.get(a)} --> ${n2.get(b)}`).join("\n")}
\`\`\`
`;
  }
  async function mapImages(world, civ6, opts) {
    const W2 = 1024, H = 512, c = world.cell, cellAt = opts.cellRaster(world, W2, H);
    const BC = [[20, 50, 110], [235, 240, 245], [160, 175, 150], [60, 105, 80], [60, 140, 70], [150, 180, 80], [225, 195, 120], [190, 180, 160], [190, 175, 80], [90, 150, 50], [20, 100, 40], [130, 120, 120], [80, 130, 120], [70, 130, 200]];
    const base = (ci) => {
      const b = c.biome[ci], e = c.elevation[ci];
      let col = (BC[b] ?? BC[0]).slice();
      if (b === 0) {
        const d = 0.55 + 0.45 * (1 + e / 5500);
        col = col.map((v) => v * d);
      } else if (b !== 13) {
        const s = 0.75 + 0.25 * Math.min(1, e / 4e3);
        col = col.map((v) => v * s);
      }
      return col;
    };
    const files = [], render2 = async (name, ownerMap) => {
      const px = new Uint8Array(W2 * H * 4);
      for (let i = 0; i < W2 * H; i++) {
        const ci = cellAt[i];
        let col = base(ci);
        const o = ownerMap?.get(ci);
        if (o) {
          const oc = colorOf2(o);
          col = col.map((v, k) => v * 0.45 + oc[k] * 0.55);
        }
        px[4 * i] = col[0];
        px[4 * i + 1] = col[1];
        px[4 * i + 2] = col[2];
        px[4 * i + 3] = 255;
      }
      files.push({ name, png: await encodePng(px, W2, H) });
    };
    await render2("\u5730\u5F62.png", null);
    if (civ6.history && Object.keys(civ6.history.states).length) {
      const mi = civ6.monthIndex, marks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f2) => Math.floor(mi * f2 / 120) * 120))].filter((x) => x <= mi && x >= 0);
      for (const t of marks) await render2(`\u56FD\u5BB6\u9818\u57DF_${Math.floor(t / 12)}\u5E74.png`, ownerMapAt(civ6, territoryOf, world, t));
    }
    return files;
  }
  function readme(root2, world, civ6, counts, stats, opts) {
    const ja = { timeline: "\u5E74\u8868\uFF0810\u5E74\u3054\u3068\u30FB\u5168\u4EF6\uFF09", creator: "\u5275\u9020\u4E3B\u306E\u4ECB\u5165\u306E\u8A18\u9332", negotiation: "\u5916\u4EA4\u4EA4\u6E09\u306E\u8A18\u9332", news: "\u91CD\u5927\u30CB\u30E5\u30FC\u30B9", state: "\u56FD\u5BB6", person: "\u4EBA\u7269\uFF08\u9B54\u6CD5\u306E\u7D20\u8CEA\u8005\uFF09", war: "\u6226\u4E89", battle: "\u6226\u95D8", treaty: "\u6761\u7D04", event: "\u51FA\u6765\u4E8B", decision: "AI\u5224\u65AD", settlement: "\u90FD\u5E02\u30FB\u96C6\u843D", group: "\u4EBA\u53E3\u96C6\u56E3", region: "\u5730\u57DF", culture: "\u6587\u5316", language: "\u8A00\u8A9E", religion: "\u5B97\u6559", tech: "\u6280\u8853", species: "\u7A2E\u65CF", ability: "\u9B54\u6CD5\u306E\u80FD\u529B", org: "\u9B54\u6CD5\u7D44\u7E54", disaster: "\u707D\u5BB3", interp: "\u6B74\u53F2\u8A8D\u8B58", work: "\u8868\u73FE\u7269\uFF08\u5E74\u4EE3\u8A18\uFF09", chronicle: "\u5E74\u4EE3\u8A18\uFF08100\u5E74\u3054\u3068\uFF09", logState: "\u8A73\u7D30\u30ED\u30B0\u30FB\u56FD\u5BB6\u306E\u6708\u6B21\u72B6\u614B", logAi: "\u8A73\u7D30\u30ED\u30B0\u30FBAI\u5224\u65AD\u306E\u4E00\u89A7", graph: "\u95A2\u4FC2\u30B0\u30E9\u30D5", map: "\u5730\u56F3" };
    return fm({ type: "README", tags: ["README"] }) + `# ${root2} \u2014 AlterHistory \u306E\u66F8\u304D\u51FA\u3057

\u3053\u306E\u30D5\u30A9\u30EB\u30C0\u3092 Obsidian \u306E vault \u3068\u3057\u3066\u958B\u3044\u3066\u304F\u3060\u3055\u3044\uFF08\u89AA\u30D5\u30A9\u30EB\u30C0\u304B\u3089\u958B\u3044\u3066\u3082\u3001\u30EA\u30F3\u30AF\u306F\u89E3\u6C7A\u3057\u307E\u3059\uFF09\u3002

- \u66F8\u304D\u51FA\u3057\u305F\u6642\u70B9: ${mi2s(civ6.monthIndex)}\uFF08\u6B74\u53F2\u306E\u73FE\u5728\uFF09
- \u4E16\u754C: ${world.spec.worldSeed}\uFF08${world.mesh.cellCount ?? world.cell.biome.length} \u30BB\u30EB\uFF09
- \u30EA\u30F3\u30AF\u5207\u308C: ${stats.unresolved} \u4EF6\uFF080 \u304C\u6B63\u5E38\uFF09

## \u4E2D\u8EAB
${table2(["\u30D5\u30A9\u30EB\u30C0\u30FB\u7A2E\u985E", "\u30CE\u30FC\u30C8\u6570"], Object.entries(counts).filter(([k]) => ja[k]).map(([k, n2]) => [ja[k], n2]))}
## \u66F8\u304D\u51FA\u3057\u306E\u7BC4\u56F2
- ${opts.decisionNotes === false ? "AI\u5224\u65AD\u306E\u500B\u5225\u30CE\u30FC\u30C8\u306F\u51FA\u3057\u3066\u3044\u307E\u305B\u3093\uFF08\u4E00\u89A7\u3068\u8A73\u7D30\u30ED\u30B0\u306E\u307F\uFF09" : "\u5168\u3066\u306EAI\u5224\u65AD\u3092\u500B\u5225\u30CE\u30FC\u30C8\u306B\u3057\u3066\u3044\u307E\u3059"}
- ${Number.isFinite(opts.fromMonth ?? -Infinity) || Number.isFinite(opts.toMonth ?? Infinity) ? `\u30A4\u30D9\u30F3\u30C8\u30FBAI\u5224\u65AD\u306F ${opts.fromMonth != null ? mi2s(opts.fromMonth) : "\u6700\u521D"}\u301C${opts.toMonth != null ? mi2s(opts.toMonth) : "\u73FE\u5728"} \u306B\u7D5E\u3063\u3066\u3044\u307E\u3059` : "\u5168\u671F\u9593\u306E\u30A4\u30D9\u30F3\u30C8\u3092\u500B\u5225\u30CE\u30FC\u30C8\u306B\u3057\u3066\u3044\u307E\u3059"}
- \u300C\u601D\u60F3\u300D\u306E\u30AB\u30C6\u30B4\u30EA\u306F\u3001v5.0.0 \u306E\u6587\u660E\u30B7\u30DF\u30E5\u30EC\u30FC\u30B7\u30E7\u30F3\u306B\u8A72\u5F53\u3059\u308B\u30C7\u30FC\u30BF\u304C\u7121\u3044\u305F\u3081\u4F5C\u3063\u3066\u3044\u307E\u305B\u3093
- \u6708\u6B21\u72B6\u614B\u306F\u300E\u72B6\u614B\u304C\u5909\u308F\u3063\u305F\u6708\u300F\u3060\u3051\u3092\u884C\u306B\u3057\u3066\u3044\u307E\u3059\uFF08\u5909\u5316\u306E\u306A\u3044\u6708\u306F\u76F4\u524D\u306E\u884C\u304C\u7D9A\u304D\u307E\u3059\u3002\u6B20\u843D\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF09

## \u518D\u51FA\u529B\u30FB\u4E0A\u66F8\u304D
- \u51FA\u529B\u306F \`${root2}/\` \u306E\u4E2D\u3060\u3051\u3067\u3059\u3002\u518D\u51FA\u529B\u3059\u308B\u3068\u3001\u540C\u3058\u30D1\u30B9\u306E\u30D5\u30A1\u30A4\u30EB\u306F\u4E0A\u66F8\u304D\u3055\u308C\u3001vault \u5185\u306E\u7121\u95A2\u4FC2\u306A\u30D5\u30A1\u30A4\u30EB\u306B\u306F\u89E6\u308C\u307E\u305B\u3093\u3002
- \u30CE\u30FC\u30C8\u540D\u306F \`\u540D\u524D__ID\` \u3067\u3059\u3002\u540D\u524D\u304C\u5909\u308F\u308B\u3068\u5225\u30D5\u30A1\u30A4\u30EB\u306B\u306A\u308B\u305F\u3081\u3001\u4E0D\u8981\u306B\u306A\u3063\u305F\u53E4\u3044\u30CE\u30FC\u30C8\u306F manifest.json \u3068\u898B\u6BD4\u3079\u3066\u624B\u3067\u6D88\u3057\u3066\u304F\u3060\u3055\u3044\u3002
- \u81EA\u5206\u3067\u66F8\u304D\u8DB3\u3057\u305F\u30CE\u30FC\u30C8\u306F\u3001\u5225\u306E\u30D5\u30A9\u30EB\u30C0\u306B\u7F6E\u304F\u3068\u4E0A\u66F8\u304D\u3055\u308C\u307E\u305B\u3093\u3002
`;
  }

  // js/io/vault-writer.js
  var LIGHT = Object.freeze({ eventNotes: false, decisionNotes: false, maps: false });
  var PART_BYTES = 12 * 1024 * 1024;
  var PART_FILES = 3e3;
  var enc4 = new TextEncoder();
  var rawOf = (d) => typeof d === "string" ? enc4.encode(d) : d;
  var tick = () => new Promise((r) => setTimeout(r, 0));
  function splitPath(path) {
    const parts = String(path).split("/");
    if (!parts.length || parts.some((p) => !p || p === "." || p === ".." || p.includes("\\"))) throw new Error(`\u66F8\u304D\u51FA\u305B\u306A\u3044\u30D1\u30B9: ${path}`);
    return { dirs: parts.slice(0, -1), name: parts.at(-1) };
  }
  async function writeToDirectory(dirHandle, files, { onProgress = null, yieldEvery = 50, signal = null } = {}) {
    const cache = /* @__PURE__ */ new Map([["", dirHandle]]);
    let n2 = 0, bytes = 0;
    const dirOf = async (dirs) => {
      let key = "", h2 = dirHandle;
      for (const d of dirs) {
        key += "/" + d;
        if (!cache.has(key)) cache.set(key, await h2.getDirectoryHandle(d, { create: true }));
        h2 = cache.get(key);
      }
      return h2;
    };
    for await (const f2 of files) {
      if (signal?.aborted) {
        const e = new Error("\u4E2D\u65AD\u3057\u307E\u3057\u305F");
        e.name = "AbortError";
        throw e;
      }
      const { dirs, name } = splitPath(f2.path), dir = await dirOf(dirs), fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable(), raw = rawOf(f2.data);
      await w.write(raw);
      await w.close();
      n2++;
      bytes += raw.length;
      if (n2 % yieldEvery === 0) {
        onProgress?.({ files: n2, bytes });
        await tick();
      }
    }
    onProgress?.({ files: n2, bytes });
    return { files: n2, bytes };
  }
  async function* zipParts(files, { root: root2 = "\u4E16\u754C", maxBytes = PART_BYTES, maxFiles = PART_FILES, compress = true, onProgress = null, signal = null } = {}) {
    let cur = [], curBytes = 0, index = 0, total = 0, totalBytes = 0;
    const pad = (n2) => String(n2).padStart(3, "0");
    const flush = async (final) => {
      index++;
      const bytes = await zipFiles(cur, { compress });
      const part = { index, name: `${root2}_${pad(index)}.zip`, bytes, fileCount: cur.length, final };
      cur = [];
      curBytes = 0;
      return part;
    };
    let held = null;
    for await (const f2 of files) {
      if (signal?.aborted) {
        const e = new Error("\u4E2D\u65AD\u3057\u307E\u3057\u305F");
        e.name = "AbortError";
        throw e;
      }
      const raw = rawOf(f2.data);
      if (cur.length && (curBytes + raw.length > maxBytes || cur.length >= maxFiles)) {
        if (held) yield held;
        held = await flush(false);
        await tick();
      }
      cur.push({ path: f2.path, data: raw });
      curBytes += raw.length;
      total++;
      totalBytes += raw.length;
      if (total % 200 === 0) {
        onProgress?.({ files: total, bytes: totalBytes, parts: index });
        await tick();
      }
    }
    if (held) yield held;
    yield await flush(true);
    onProgress?.({ files: total, bytes: totalBytes, parts: index });
  }
  function vaultFiles(world, civ6, name, opts = {}) {
    return obsidianFiles(world, civ6, name, { ...LIGHT, ...opts });
  }

  // js/ui/v6/views-b.js
  var back2 = (label, on) => h("div", { class: "back", onclick: () => {
    clearHl();
    on();
  } }, "\u2190 " + label);
  var civ5 = () => S2.w.civ;
  var date4 = (mi) => formatWorldDate(S2.w, mi);
  var note2 = (t) => h("p", { class: "n" }, t);
  var head = (code, ja) => [h("div", { class: "code" }, code), h("h2", {}, ja)];
  var KINDS = { culture: ["cultures", "\u6587\u5316", "CULTURE"], language: ["languages", "\u8A00\u8A9E", "LANGUAGE"], religion: ["religions", "\u5B97\u6559", "RELIGION"] };
  function pEntity(kind) {
    var _a;
    const [key, ja, code] = KINDS[kind], c = civ5(), items = Object.values(c[key]), cur = c[key][S2.entity[kind]], box = h("div", {}, ...head(code, ja));
    const use = /* @__PURE__ */ new Map(), fk = kind === "culture" ? "cultureId" : kind === "language" ? "languageId" : "religionId";
    for (const g of Object.values(c.groups)) for (const co of g.cohorts ?? []) if (co[fk]) use.set(co[fk], (use.get(co[fk]) ?? 0) + g.pop * co.share);
    if (cur) {
      box.append(back2(`${ja}\u4E00\u89A7`, () => {
        S2.entity[kind] = null;
        S2.hooks.panel();
      }), miniLineage(items, cur.id, { onPick: (x) => {
        S2.entity[kind] = x.id;
        S2.hooks.panel();
      } }), entityDetail(kind, cur, use));
      return box;
    }
    const mine = controlled(), ms = mine ? c.states[mine] : null, mset = /* @__PURE__ */ new Set();
    if (ms) {
      for (const g of Object.values(c.groups)) if (g.stateId === ms.id) {
        for (const co of g.cohorts ?? []) if (co[fk] && co.share >= 0.2) mset.add(co[fk]);
      }
    }
    const type = { culture: "cultures", language: "languages", religion: "religions" }[kind], byPop = [...items].sort((a, b) => (use.get(b.id) ?? 0) - (use.get(a.id) ?? 0)), alive = byPop.filter((x) => (use.get(x.id) ?? 0) > 0.5);
    const view2 = ((_a = S2).entView ?? (_a.entView = {}))[kind] ?? "list", setView = (v) => {
      S2.entView[kind] = v;
      S2.hooks.panel();
    };
    box.append(h("div", { class: "tabs" }, h("b", { class: view2 === "list" ? "on" : "", "data-view": "list", onclick: () => setView("list") }, "\u4E00\u89A7"), h("b", { class: view2 === "tree" ? "on" : "", "data-view": "tree", onclick: () => setView("tree") }, "\u7CFB\u7D71")), h("p", { class: "n" }, `${items.length} \u4EF6\uFF08\u5B58\u7D9A ${alive.length}\uFF09`));
    if (view2 === "tree") return box.append(nestedLineage(items, { selected: null, pop: (id) => use.get(id) ?? 0, onHover: (id) => {
      if (S2.map) {
        S2.map.hl = id ? { type, id } : null;
        S2.map.draw();
      }
    }, onPick: (x) => {
      S2.entity[kind] = x.id;
      S2.hooks.panel();
    } })) || box;
    box.append(sectioned([{ title: `\u3042\u306A\u305F\u306E\u56FD\u306E${ja}`, rows: byPop.filter((x) => mset.has(x.id)) }, { title: `\u5B58\u7D9A\u3057\u3066\u3044\u308B${ja}`, rows: alive.filter((x) => !mset.has(x.id)) }, { title: `\u6D88\u6EC5\u3057\u305F${ja}`, rows: byPop.filter((x) => (use.get(x.id) ?? 0) <= 0.5), fold: "dead_" + kind }], 34, (x) => listRow({ type, id: x.id }, [h("span", { class: "sw", style: `background:${colorOf(x.id)}` }), x.name, h("small", {}, (use.get(x.id) ?? 0) > 0.5 ? `\u4EBA\u53E3 ${n0(use.get(x.id))}` : "\u6D88\u6EC5")], () => {
      S2.entity[kind] = x.id;
      S2.hooks.panel();
    }, (mset.has(x.id) ? "mine " : "") + ((use.get(x.id) ?? 0) > 0.5 ? "" : "dead"))));
    return box;
  }
  function entityDetail(kind, x, use) {
    const c = civ5(), nm = h("input", { id: "ent-name", value: x.name }), par = x.parent ? c[KINDS[kind][0]][x.parent]?.name : "\uFF08\u8D77\u6E90\uFF09", kids = Object.values(c[KINDS[kind][0]]).filter((y) => y.parent === x.id), rows = [["\u540D\u524D", x.name], ["\u7CFB\u7D71\uFF08\u89AA\uFF09", par], ["\u6D3E\u751F\u3057\u305F\u5148", kids.length ? kids.map((k) => k.name).join("\u30FB") : "\u306A\u3057"], ["\u6210\u7ACB", date4(Math.max(0, x.bornAt))], ["\u73FE\u5728\u306E\u4EBA\u53E3", n0(use.get(x.id) ?? 0)]];
    if (kind === "religion") rows.push(["\u6700\u9AD8\u795E", x.deity ?? "\u2014"], ["\u4FE1\u4EF0\u5F62\u614B", x.kind ?? "\u2014"], ["\u8056\u5730", x.holyCell != null ? `\u533A\u753B ${x.holyCell}` : "\u2014"], ["\u5275\u59CB\u8005", x.founderId ? c.figures?.[x.founderId]?.name ?? x.founderId : "\u2014"]);
    if (kind === "language" && x.phon) rows.push(["\u5B50\u97F3", x.phon.c.join(" ")], ["\u6BCD\u97F3", x.phon.v.join(" ")], ["\u97F3\u7BC0\u672B\u306E\u5B50\u97F3", x.phon.coda ? "\u3042\u308A" : "\u306A\u3057"], ["\u4FC3\u97F3", x.phon.geminate ? "\u3042\u308A" : "\u306A\u3057"], ["\u97F3\u306E\u5909\u5316", `${x.phon.changes.length} \u4EF6`]);
    if (kind === "culture") rows.push(["\u767A\u7965\u306E\u533A\u753B", x.cell != null ? `\u533A\u753B ${x.cell}` : "\u2014"], ["\u540D\u524D\u306E\u56FA\u5B9A", x.nameFixed ? "\u56FA\u5B9A\uFF08\u5275\u9020\u4E3B\u306E\u7DE8\u96C6\uFF09" : "\u81EA\u52D5"]);
    return h("div", { class: "dt rs" }, h("b", {}, x.name), table(["\u9805\u76EE", "\u5185\u5BB9"], rows), h("div", { class: "rowb" }, nm, btn("\u540D\u524D\u3092\u7DE8\u96C6\uFF08\u5275\u9020\u4E3B\uFF09", () => creator({ type: "creator.rename", kind, id: x.id, name: nm.value }), "", { id: "ent-rename" })), note2("\u5B9A\u7FA9\u306E\u7DE8\u96C6\u306F\u5275\u9020\u4E3B\u306E\u4ECB\u5165\u3068\u3057\u3066\u8A18\u9332\u3055\u308C\u3001\u904E\u53BB\u306E\u5BA2\u89B3\u30A4\u30D9\u30F3\u30C8\u306F\u66F8\u304D\u63DB\u3048\u307E\u305B\u3093\u3002\u5B9A\u7FA9\u3068\u3001\u96C6\u56E3\u3067\u5B9F\u969B\u306B\u4F7F\u308F\u308C\u3066\u3044\u308B\u72B6\u614B\u306F\u5225\u3067\u3059\u3002"));
  }
  function pCreator() {
    const on = !controlled();
    const box = h("div", {}, ...head("CREATOR", "\u5275\u9020\u4E3B"));
    if (!on) return box.append(note2(`\u3044\u307E ${stateName(controlled())} \u3092\u62C5\u5F53\u3057\u3066\u3044\u307E\u3059\u3002\u5275\u9020\u4E3B\u306E\u64CD\u4F5C\u306F\u3001\u62C5\u5F53\u3092\u89E3\u9664\u3059\u308B\u3068\u4F7F\u3048\u307E\u3059\u3002`), btn("\u62C5\u5F53\u3092\u89E3\u9664\u3057\u3066\u5275\u9020\u4E3B\u306B\u623B\u308B", () => {
      run({ type: "control.release" });
      S2.hooks.render();
    }, "p", { id: "release" })) || box;
    const names = aliveStates().sort((a, b) => b.pop - a.pop);
    const pick2 = h("select", { id: "cr-state" }, ...names.slice(0, 120).map((s) => h("option", { value: s.id }, s.name)));
    box.append(
      note2("\u4E16\u754C\u3092\u898B\u5B88\u308B\u7ACB\u5834\u3067\u3067\u304D\u308B\u3053\u3068\u3092\u3001\u3053\u3053\u306B\u307E\u3068\u3081\u3066\u3044\u307E\u3059\u3002"),
      lb("\u56FD\u5BB6\u3078\u306E\u4ECB\u5165\u30FB\u7DE8\u96C6", "INTERVENE"),
      note2("\u56FD\u5BB6\u3092\u9078\u3093\u3067\u3001\u8A73\u7D30\u30DA\u30FC\u30B8\u306E\u300C\u4ECB\u5165\u300D\u300C\u540D\u524D\u306E\u7DE8\u96C6\u300D\u304B\u3089\u884C\u3044\u307E\u3059\u3002"),
      h("div", { class: "rowb" }, pick2, btn("\u305D\u306E\u56FD\u3092\u958B\u304F", () => {
        if (pick2.value) S2.hooks.select(pick2.value);
      })),
      lb("\u56FD\u5BB6\u3092\u3064\u304F\u308B", "CREATE A NATION"),
      note2("\u56FD\u540D\u30FB\u653F\u4F53\u30FB\u5F79\u8077\u30FB\u70BA\u653F\u8005\u30FB\u9996\u90FD\u30FB\u6280\u8853\u3092\u6C7A\u3081\u3066\u3001\u65B0\u3057\u3044\u56FD\u3092\u4E16\u754C\u306B\u751F\u307F\u307E\u3059\uFF08\u62C5\u5F53\u306F\u3057\u307E\u305B\u3093\uFF09\u3002"),
      h("div", { class: "rowb" }, btn("\u56FD\u5BB6\u3092\u3064\u304F\u308B", () => openWizard({ mode: "creator", onDone: (r) => {
        S2.sel = r.stateId;
        notify("ok", "\u65B0\u3057\u3044\u56FD\u304C\u751F\u307E\u308C\u307E\u3057\u305F");
        S2.hooks.render();
      } }), "p", { id: "cr-found" })),
      lb("\u56FD\u5BB6\u3092\u62C5\u5F53\u3059\u308B", "TAKE CONTROL"),
      h("div", { class: "rowb" }, btn("\u3053\u306E\u56FD\u3092\u62C5\u5F53\u3059\u308B", () => {
        if (pick2.value) {
          run({ type: "control.take", stateId: pick2.value });
          S2.sel = pick2.value;
          S2.hooks.render();
        }
      })),
      catastropheBox()
    );
    return box;
  }
  function catastropheBox() {
    const c = civ5(), nm = h("input", { id: "cat-name", placeholder: "\u707D\u5384\u306E\u540D\u524D\uFF08\u4EFB\u610F\uFF09", style: "width:100%" }), why2 = h("input", { id: "cat-why", placeholder: "\u7406\u7531\u306E\u6CE8\u91C8\uFF08\u4EFB\u610F\u30FB\u539F\u56E0\u3092\u8AAC\u660E\u3057\u306A\u304F\u3066\u3088\u3044\uFF09", style: "width:100%" });
    const scope = h("select", { id: "cat-scope" }, h("option", { value: "world" }, "\u4E16\u754C\u898F\u6A21"), h("option", { value: "region" }, "\u5730\u57DF\u898F\u6A21\uFF08\u56FD\u306E\u9996\u90FD\u3092\u4E2D\u5FC3\u306B\uFF09")), at2 = h("select", { id: "cat-at", style: "display:none" }, ...aliveStates().sort((a, b) => b.pop - a.pop).slice(0, 80).map((s) => h("option", { value: s.id }, s.name)));
    const rad = h("input", { id: "cat-radius", type: "number", value: 1500, min: 1, style: "width:80px;display:none" }), mor = h("input", { id: "cat-mort", type: "number", value: 30, min: 0, step: 1, style: "width:70px" }), rec = h("input", { id: "cat-rec", type: "number", value: 60, min: 1, style: "width:70px" }), ok2 = h("input", { type: "checkbox", id: "cat-ok" });
    scope.addEventListener("change", () => {
      const r = scope.value === "region";
      at2.style.display = rad.style.display = r ? "" : "none";
    });
    const go = () => {
      if (!ok2.checked) {
        S2.notice = "\u53D6\u308A\u6D88\u305B\u306A\u3044\u64CD\u4F5C\u3067\u3059\u3002\u78BA\u8A8D\u306E\u6B04\u306B\u30C1\u30A7\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044";
        S2.hooks.render();
        return;
      }
      const cell = scope.value === "region" ? c.groups[c.states[at2.value]?.capitalGroupId]?.cell : null;
      creator({ type: "creator.catastrophe", name: nm.value, reason: why2.value, scope: scope.value, center: cell ?? null, radiusKm: Number(rad.value), mortality: Number(mor.value) / 100, recoveryMonths: Number(rec.value) });
    };
    const log3 = (c.wcde.catastrophes ?? []).slice(-4).reverse();
    return h("div", {}, lb("\u5275\u9020\u4E3B\u306E\u707D\u5384", "CATASTROPHE"), note2("\u5927\u304D\u306A\u707D\u5384\u3092\u8D77\u3053\u3057\u307E\u3059\u3002\u4EBA\u53E3\u30FB\u8ECD\u30FB\u5B89\u5B9A\u306B\u3059\u3050\u53CD\u6620\u3055\u308C\u3001\u767A\u751F\u524D\u3078\u306F\u623B\u308A\u307E\u305B\u3093\u3002"), nm, why2, h("div", { class: "rowb" }, scope, at2), h("div", { class: "rowb" }, h("small", {}, "\u534A\u5F84(km)"), rad, h("small", {}, "\u4EBA\u53E3\u306E\u640D\u5931 %"), mor, h("small", {}, "\u56DE\u5FA9\u306E\u76EE\u5B89(\u6708)"), rec), h("div", { class: "rowb" }, h("label", {}, ok2, " \u53D6\u308A\u6D88\u305B\u306A\u3044\u3053\u3068\u3092\u7406\u89E3\u3057\u305F"), btn("\u707D\u5384\u3092\u8D77\u3053\u3059", go, "p", { id: "cat-go" })), ...log3.map((r) => h("div", { class: "row" }, h("span", { class: "g" }, `\u300C${r.name}\u300D${r.scope === "world" ? "\u4E16\u754C\u898F\u6A21" : "\u5730\u57DF\u898F\u6A21"}`, h("br"), h("small", {}, `${date4(r.at)}\u30FB\u5B9F\u969B\u306E\u640D\u5931 ${Math.round(r.result.share * 100)}%\uFF08\u7D04 ${n0(r.result.dead)} \u4EBA\uFF09`)))));
  }
  function pSettings() {
    const c = civ5(), cf = c.wcde.config, T3 = timeOf(c), errs = checkWcdeIntegrity(S2.w.world, c), msg = h("p", { class: "n", id: "exp-msg" }), cal = cf.calendar;
    const dl = (blob, name) => {
      const a = h("a", { href: URL.createObjectURL(blob), download: name });
      document.body.append(a);
      a.click();
      a.remove();
    };
    const save = async () => {
      msg.textContent = "\u5727\u7E2E\u3057\u3066\u66F8\u304D\u51FA\u3057\u3066\u3044\u307E\u3059\u2026";
      const p = await packSaveGz(S2.w);
      dl(new Blob([p.bytes], { type: "application/gzip" }), `alterhistory-${cf.worldSeed}-${c.date.year}.ahw`);
      msg.textContent = `\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F\uFF08\u5727\u7E2E ${(p.bytes.length / 1048576).toFixed(1)} MB\uFF0F\u5143 ${(p.rawBytes / 1048576).toFixed(1)} MB\uFF09`;
    };
    const obs = async () => {
      const nm = String(cf.name || cf.worldSeed), root2 = nm.replace(/[\\/:*?"<>|#^\[\]\n\r\t]/g, "_").trim().slice(0, 48) || "\u4E16\u754C", mb = (b) => (b / 1048576).toFixed(1);
      let dir = null;
      if (typeof window.showDirectoryPicker === "function") {
        try {
          dir = await window.showDirectoryPicker({ mode: "readwrite" });
        } catch (e) {
          if (e?.name === "AbortError") {
            msg.textContent = "\u30D5\u30A9\u30EB\u30C0\u306E\u9078\u629E\u3092\u53D6\u308A\u6D88\u3057\u307E\u3057\u305F";
            return;
          }
          dir = null;
        }
      }
      const prog = (p) => {
        msg.textContent = `\u66F8\u304D\u51FA\u3057\u4E2D\u2026 ${p.files} \u30D5\u30A1\u30A4\u30EB\uFF08${mb(p.bytes)} MB\uFF09`;
      };
      msg.textContent = dir ? "\u9078\u3093\u3060\u30D5\u30A9\u30EB\u30C0\u3078\u66F8\u304D\u51FA\u3057\u3066\u3044\u307E\u3059\u2026" : "\u8907\u6570\u306E ZIP \u306B\u5206\u3051\u3066\u4F5C\u3063\u3066\u3044\u307E\u3059\u2026";
      try {
        if (dir) {
          const r = await writeToDirectory(dir, vaultFiles(S2.w.world, c, nm), { onProgress: prog });
          msg.textContent = `\u66F8\u304D\u51FA\u3057\u307E\u3057\u305F: ${r.files} \u30D5\u30A1\u30A4\u30EB\uFF08${mb(r.bytes)} MB\uFF09\u3002\u9078\u3093\u3060\u30D5\u30A9\u30EB\u30C0\u306E\u4E2D\u306E\u300C${root2}\u300D\u30D5\u30A9\u30EB\u30C0\u3092\u3001Obsidian \u306E vault \u3068\u3057\u3066\u958B\u3044\u3066\u304F\u3060\u3055\u3044`;
        } else {
          let n2 = 0;
          for await (const part of zipParts(vaultFiles(S2.w.world, c, nm), { root: root2, onProgress: prog })) {
            dl(new Blob([part.bytes], { type: "application/zip" }), part.name);
            n2++;
            msg.textContent = `${n2} \u500B\u76EE\u306E ZIP \u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\uFF08${part.fileCount} \u30D5\u30A1\u30A4\u30EB\uFF09\u2026`;
            await new Promise((r) => setTimeout(r, 800));
          }
          msg.textContent = `${n2} \u500B\u306E ZIP \u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u3059\u3079\u3066\u540C\u3058\u30D5\u30A9\u30EB\u30C0\u3078\u5C55\u958B\u3059\u308B\u3068\u30011 \u3064\u306E vault \u306B\u306A\u308A\u307E\u3059`;
        }
      } catch (e) {
        msg.textContent = "\u66F8\u304D\u51FA\u305B\u307E\u305B\u3093\u3067\u3057\u305F: " + e.message;
      }
    };
    const en = h("input", { id: "epoch-name", value: cal.epochName ?? "", style: "width:120px" });
    return h(
      "div",
      {},
      ...head("SETTINGS", "\u4E16\u754C\u8A2D\u5B9A\u30FB\u51FA\u529B"),
      table(["\u9805\u76EE", "\u5024"], [["\u4E16\u754C\u306E\u540D\u524D", cf.name ?? "\u2014"], ["\u4E16\u754C\u306E\u7A2E", cf.worldSeed], ["\u89E3\u50CF\u5EA6\uFF08\u30BB\u30EB\uFF09", S2.w.world.mesh.cellCount], ["\u7A2E\u65CF", (cf.species ?? []).map((s) => s.name ?? s.id ?? s).join("\u30FB") || "\u2014"], ["\u5148\u53F2\u306E\u9577\u3055", `${n0(cf.prehistory?.years ?? 0)} \u5E74`], ["\u73FE\u5728", formatWorldDate(S2.w)], ["\u66A6\u306E\u8D77\u70B9\u540D", cal.epochName || "\uFF08\u306A\u3057\uFF09"], ["\u6642\u4EE3\u533A\u5206", (cal.eras ?? []).map((e) => `${e.startYear}\u5E74\u301C ${e.name}`).join(" \u2192 ") || "\uFF08\u306A\u3057\uFF09"]]),
      lb("\u66A6\u306E\u8868\u793A\u540D\uFF08\u8868\u793A\u7528\u306E\u307F\uFF09", "CALENDAR"),
      h("div", { class: "rowb" }, en, btn("\u5909\u66F4", () => {
        const r = run({ type: "calendar.edit", edit: { epochName: en.value } });
        S2.hooks.render();
      })),
      ...(cal.eras ?? []).map((e) => {
        const inp = h("input", { value: e.name, style: "width:140px", class: "eranm" });
        return h("div", { class: "rowb" }, h("small", {}, `${e.startYear}\u5E74\u301C`), inp, btn("\u6539\u540D", () => {
          run({ type: "calendar.edit", edit: { eraNames: { [e.id]: inp.value } } });
          S2.hooks.render();
        }));
      }),
      lb("\u4FDD\u5B58\u30FB\u8AAD\u307F\u8FBC\u307F\u30FB\u51FA\u529B", "SAVE / EXPORT"),
      h("div", { class: "rowb" }, btn("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3059", save, "p", { id: "save" }), fileLoader(), btn("Obsidian \u7528 Markdown \u3092\u66F8\u304D\u51FA\u3059", obs, "", { id: "obs" })),
      msg,
      ...S2.fileWarn.map((x) => h("p", { class: "warn" }, x)),
      lb("\u30D0\u30FC\u30B8\u30E7\u30F3\u60C5\u5831", "VERSION"),
      table(["\u9805\u76EE", "\u5024"], [["\u30A2\u30D7\u30EA\u306E\u7248", APP_VERSION_LABEL], ["\u4FDD\u5B58\u5F62\u5F0F\u306E\u7248\uFF08\u30A2\u30D7\u30EA\u306E\u7248\u3068\u306F\u5225\uFF09", SAVE_SCHEMA], ["\u6574\u5408\u6027\u306E\u691C\u67FB", errs.length ? `${errs.length} \u4EF6\u306E\u554F\u984C` : "\u554F\u984C\u306A\u3057"], ["\u6642\u9593\u306E\u901F\u5EA6", SPEEDS.find((s) => s.id === T3.speed)?.label]])
    );
  }
  function fileLoader(done2) {
    const inp = h("input", { type: "file", accept: ".ahw", id: "loadfile", hidden: true, onchange: async (e) => {
      const f2 = e.target.files[0];
      if (!f2) return;
      const r = await unpackSaveAny(new Uint8Array(await f2.arrayBuffer()));
      if (!r.ok) {
        alert("\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093:\n" + r.errors.join("\n"));
        return;
      }
      (done2 ?? S2.hooks.loaded)(r.w, r.warnings);
    } });
    return h("span", {}, inp, btn("\u4FDD\u5B58\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u307F\u8FBC\u3080", () => inp.click(), "", { id: "load" }));
  }

  // js/ui/v6/main.js
  var $ = (s) => document.querySelector(s);
  var root = () => $("#v6-root");
  var HUB = [["geo", "\u5730\u7406", "GEO"], ["nations", "\u56FD\u5BB6", "NATION"], ["war", "\u6226\u4E89", "WAR"], ["diplo", "\u5916\u4EA4", "DIPLO"], ["culture", "\u6587\u5316", "CULT"], ["language", "\u8A00\u8A9E", "LANG"], ["religion", "\u5B97\u6559", "RELIG"], ["stats", "\u7D71\u8A08", "STATS"], ["creator", "\u5275\u9020\u4E3B", "CREATOR"], ["settings", "\u4E16\u754C\u8A2D\u5B9A", "CONFIG"]];
  var PANELS = { geo: pGeo, nations: pNations, war: pWar, diplo: pDiplo, culture: () => pEntity("culture"), language: () => pEntity("language"), religion: () => pEntity("religion"), stats: pStats, creator: pCreator, settings: pSettings };
  function setup() {
    const loader = fileLoader((w, warn) => {
      S2.w = w;
      S2.fileWarn = warn;
      start();
    });
    showTitle(root(), { loader, onNew: () => showWorldConfig(root(), { onBack: setup, onStart: (cfg) => runLoading(root(), cfg, (w) => {
      S2.w = w;
      founding();
    }, (err) => {
      setup();
      notify("error", err);
    }) }) });
  }
  function founding() {
    const c = run({ type: "founding.refresh" }).candidates ?? S2.w.civ.wcde.candidates ?? [], civ6 = S2.w.civ, pre2 = civ6.wcde.prehistory ?? {}, ce = S2.w.world.cell, ja = new Proxy({}, { get: (_, k) => polityJa(k) });
    const nowTxt = formatWorldDate(S2.w), era = eraLabel(civ6.wcde.config.calendar, civ6.monthIndex), msg = h("div", {}, h("p", { class: "n" }, `${civ6.wcde.config.name}\u3000\u73FE\u5728 ${nowTxt}${era ? "\uFF08" + era + "\uFF09" : ""}\u3000\u2014 \u4E16\u754C\u306E\u6642\u8A08\u306F\u3001\u3042\u306A\u305F\u304C\u5165\u308B\u524D\u304B\u3089\u9032\u3093\u3067\u3044\u307E\u3059\u3002`), h("p", { class: "n" }, "\u56FD\u3092\u5EFA\u3066\u3066\u62C5\u5F53\u3059\u308B\u304B\u3001\u4E16\u754C\u306B\u4EFB\u305B\u3066\u898B\u5B88\u308A\u307E\u3059\u3002\u56FD\u540D\u30FB\u653F\u4F53\u30FB\u5F79\u8077\u30FB\u70BA\u653F\u8005\u30FB\u9996\u90FD\u30FB\u6280\u8853\u3092\u3001\u9806\u306B\u6C7A\u3081\u307E\u3059\u3002")), list = h("div", {});
    void list;
    void c;
    const yrsAgo = (m) => Math.round(((civ6.wcde.foundedAt ?? civ6.monthIndex) - m) / 12);
    const fmtYears = (y) => y >= 1e4 ? `\u7D04 ${Math.round(y / 1e3) / 10} \u4E07\u5E74\u524D` : `\u7D04 ${n0(y)} \u5E74\u524D`;
    const techTl = Object.entries(pre2.firstTech ?? {}).sort((x, y) => x[1] - y[1]).map(([k, m]) => `${fmtYears(yrsAgo(m))}\u3000${TECH[k]?.name ?? k}`);
    const ep = pre2.epochs ?? [], mx = Math.max(1, ...ep.map((e) => Math.log10(Math.max(10, e.pop)))), spark = sv("svg", { viewBox: "0 0 300 60", style: "width:100%;height:60px" }, sv("polyline", { points: ep.map((e, i) => `${i / Math.max(1, ep.length - 1) * 300},${58 - Math.log10(Math.max(10, e.pop)) / mx * 54}`).join(" "), fill: "none", stroke: "#6fa8c9", "stroke-width": 1.6 }), sv("polyline", { points: ep.map((e, i) => `${i / Math.max(1, ep.length - 1) * 300},${58 - (e.ice ?? 0) * 54}`).join(" "), fill: "none", stroke: "#c97a6f", "stroke-width": 1, "stroke-dasharray": "3 3" }));
    const eco = ecoSummary(S2.w.world, civ6), sp = pre2.species ?? {};
    const obs = h(
      "details",
      { class: "dt" },
      h("summary", {}, "\u5148\u53F2\u306E\u89B3\u5BDF\uFF08\u8AAD\u307F\u53D6\u308A\u5C02\u7528\uFF09"),
      sp.archaic ? `\u53E4\u4EE3\u578B\u4EBA\u985E\u306E\u96C6\u56E3\u304C\u73FE\u308C\u308B: ${fmtYears(yrsAgo(sp.archaic.at))}` : "",
      h("br"),
      sp.human ? `\u73FE\u751F\u4EBA\u985E\u304C\u73FE\u308C\u308B: ${fmtYears(yrsAgo(sp.human.at))}\uFF08\u7F6E\u304D\u63DB\u308F\u308A\u30FB\u6DF7\u8840: ${n0(pre2.assimilated ?? 0)} \u96C6\u56E3\uFF09` : "",
      h("br"),
      `\u96C6\u56E3 ${n0(pre2.groups ?? Object.keys(civ6.groups).length)}\u30FB\u4EBA\u53E3 ${n0(Math.round(Object.values(civ6.groups).reduce((a, g) => a + g.pop, 0)))}\u30FB\u5B9A\u4F4F ${n0(pre2.settlements ?? 0)}\u30FB\u6C37\u671F\u306E\u6700\u5927 ${Math.round((pre2.glacialMax ?? 0) * 100)}%\u30FB\u6D77\u3092\u6E21\u3063\u305F ${n0(pre2.seaCrossings ?? 0)} \u56DE`,
      h("br"),
      eco ? `\u751F\u614B\u7CFB: \u690D\u7269 ${Math.round(eco.flora * 100)}%\u30FB\u52D5\u7269 ${Math.round(eco.fauna * 100)}%\u30FB\u8352\u5EC3\u3057\u305F\u571F\u5730 ${Math.round(eco.degraded * 100)}%` : "",
      h("br"),
      "\u4EBA\u53E3\uFF08\u9752\u30FB\u5BFE\u6570\uFF09\u3068\u6C37\u671F\uFF08\u8D64\u306E\u7834\u7DDA\uFF09\u306E\u63A8\u79FB",
      spark,
      h("b", {}, "\u6280\u8853\u306E\u51FA\u73FE"),
      h("br"),
      ...techTl.flatMap((t) => [t, h("br")])
    );
    const found = btn("\u5EFA\u56FD\u3057\u3066\u3001\u305D\u306E\u56FD\u3092\u62C5\u5F53\u3059\u308B", () => openWizard({ mode: "player", onDone: () => start(), onCancel: () => {
    } }), "p", { id: "found" });
    root().replaceChildren(h("div", { class: "center", style: "max-width:760px" }, h("div", { class: "code" }, "FOUNDING"), h("h1", {}, "\u5EFA\u56FD"), msg, h("div", { class: "rowb" }, found, btn("\u4E16\u754C\u306B\u4EFB\u305B\u3066\u59CB\u3081\u308B\uFF08\u62C5\u5F53\u56FD\u306A\u3057\u30FB\u5275\u9020\u4E3B\uFF09", () => {
      run({ type: "founding.delegate" });
      start();
    }, "", { id: "delegate" })), obs));
  }
  function start() {
    S2.newsSeen = null;
    S2.hub = null;
    S2.sel = controlled() ?? null;
    S2.hooks = { render, panel: renderPanel, mapOnly: () => {
      S2.map.draw();
    }, select, focusCell, loaded: (w, warn) => {
      S2.w = w;
      S2.fileWarn = warn;
      start();
    } };
    shell();
    render();
    clearInterval(S2.timer);
    S2.timer = setInterval(tick2, 250);
  }
  function shell() {
    const cv = h("canvas", { id: "map", "aria-label": "\u4E16\u754C\u5730\u56F3" });
    root().replaceChildren(h("div", { id: "app" }, h("nav", { id: "hub" }), h("aside", { id: "panel" }, h("button", { id: "prefresh", title: "\u4E16\u754C\u304C\u9032\u3093\u3060\u306E\u3067\u3001\u3053\u306E\u30DA\u30FC\u30B8\u306E\u5185\u5BB9\u306F\u53E4\u304F\u306A\u3063\u3066\u3044\u307E\u3059", onclick: () => renderPanel() }, "\u21BB \u6700\u65B0\u306E\u72B6\u614B\u306B\u66F4\u65B0"), h("div", { id: "pin" })), h("main", { id: "mapwrap" }, cv, h("div", { id: "clock" }), h("div", { id: "callout" }), h("div", { id: "newscall" }), h("div", { id: "pops" }))), h("div", { id: "newsmodal", hidden: true }));
    S2.map = new MapView(cv, S2.w);
    S2.map.sel = S2.sel;
    S2.map.onPick = callout;
    requestAnimationFrame(() => {
      S2.map.draw();
    });
    window.addEventListener("resize", () => S2.map?.draw());
  }
  function render() {
    if (!$("#hub")) return;
    renderHub();
    renderPanel();
    renderRight();
    renderNews();
    S2.map.sel = S2.sel;
    S2.map.draw();
  }
  function renderHub() {
    $("#hub").replaceChildren(...HUB.map(([k, ja, code]) => h("button", { class: S2.hub === k ? "on" : "", "data-hub": k, onclick: () => {
      S2.hub = S2.hub === k ? null : k;
      S2.detail = false;
      S2.war = null;
      S2.upr = null;
      S2.dip = null;
      S2.entity = { culture: null, language: null, religion: null };
      if (S2.map) S2.map.hl = null;
      render();
      setTimeout(() => S2.map?.draw(), 220);
    } }, ja, h("small", {}, code))));
  }
  function renderPanel() {
    S2.full = null;
    const p = $("#panel");
    S2.paintedMonth = S2.w?.civ.monthIndex ?? null;
    $("#prefresh")?.classList.remove("stale");
    if (!S2.hub) {
      p.classList.remove("open");
      return;
    }
    p.classList.add("open");
    const wide = S2.hub === "nations" && (S2.tab === "tech" || S2.tab === "doctrine") && S2.sel;
    p.style.setProperty("--pw", wide ? "min(760px, 62vw)" : "");
    const keep = $("#pin").scrollTop;
    $("#pin").replaceChildren(PANELS[S2.hub]());
    $("#pin").scrollTop = keep;
    if (S2.upr?.open && S2.upr.stateId && S2.w.civ.states[S2.upr.stateId]) S2.full = { key: "upr", title: "\u53CD\u4E71\u30FB\u9769\u547D\u3092\u8D77\u3053\u3059", build: () => uprisingFull(S2.w.civ.states[S2.upr.stateId]), onClose: () => {
      S2.upr = null;
    } };
    renderFull();
  }
  function renderFull() {
    document.querySelector("#fulltab")?.remove();
    const f2 = S2.full;
    if (!f2 || S2.upr?.picking) return;
    const el = h("div", { id: "fulltab" }, h("div", { class: "fthead" }, btn("\u2190 \u9589\u3058\u308B", () => {
      f2.onClose?.();
      S2.full = null;
      render();
    }, "", { id: "full-close" }), h("b", {}, f2.title)), h("div", { class: "ftbody" }, f2.build()));
    $("#app")?.append(el);
  }
  function select(id) {
    S2.sel = id;
    S2.detail = true;
    S2.hub = "nations";
    if (!S2.tab) S2.tab = "politics";
    render();
    $("#callout").classList.remove("on");
  }
  function focusCell(cell) {
    const M = S2.map, g = M.geo, W2 = M.cv.width, H = M.cv.height, [x, y] = M.proj(g.cen[cell * 2], g.cen[cell * 2 + 1], W2, H);
    M.view.k = 4;
    M.view.x = W2 / 2 - x * 4;
    M.view.y = H / 2 - y * 4;
    M.clamp();
    M.draw();
  }
  function callout(p) {
    if (S2.upr?.picking) {
      const r = run({ type: "uprising.plan", authority: "player_order", stateId: S2.upr.stateId, kind: S2.upr.kind, cell: p.cell }), res = r.result ?? r;
      if (!r.ok || res.ok === false) {
        notify("error", res.error ?? r.error ?? "\u305D\u306E\u5834\u6240\u306F\u9078\u3079\u307E\u305B\u3093");
        return;
      }
      S2.upr.plan = res;
      S2.upr.picking = false;
      S2.upr.open = true;
      S2.map.pins = [{ cell: res.center.cell, big: true, color: "#ff8a5c" }];
      S2.map.draw();
      renderPanel();
      return;
    }
    const c = $("#callout"), civ6 = S2.w.civ, st2 = p.stateId ? civ6.states[p.stateId] : null, ce = S2.w.world.cell, mine = st2 && controlled() === st2.id;
    const body = st2 ? [h("h3", {}, h("span", { class: "sw", style: `background:${colorOf(st2.id)};display:inline-block;margin-right:6px` }), st2.name), h("div", { class: "sub" }, `${polityJa(st2.polity)}\u30FB\u4EBA\u53E3 ${n0(st2.pop)}\u30FB\u5B89\u5B9A\u5EA6 ${pct(st2.stability)}`), h("div", { class: "sub" }, `\u70BA\u653F\u8005: ${st2.leader?.name ?? "\u2014"}`), p.settlement ? h("div", { class: "sub" }, `\u90FD\u5E02: ${p.settlement.name ?? "\u2014"}\uFF08\u4EBA\u53E3 ${n0(p.settlement.pop)}\uFF09`) : null, h("div", { class: "bt" }, btn("\u8A73\u7D30", () => select(st2.id)), btn("\u5916\u4EA4", () => {
      S2.tab = "diplomacy";
      select(st2.id);
    }), mine ? null : btn("\u62C5\u5F53\u3059\u308B", () => {
      run({ type: "control.take", stateId: st2.id });
      S2.sel = st2.id;
      render();
    }, "p"))] : [h("h3", {}, p.settlement?.name ?? "\u672A\u6240\u5C5E\u306E\u5730"), h("div", { class: "sub" }, `\u533A\u753B ${p.cell}\u30FB\u6A19\u9AD8 ${Math.round(ce.elevation[p.cell] * 100) / 100}\u30FB\u6C17\u6E29 ${Math.round(ce.temp[p.cell])}`), p.settlement ? h("div", { class: "sub" }, `\u4EBA\u53E3 ${n0(p.settlement.pop)}`) : h("div", { class: "sub" }, "\u56FD\u5BB6\u306B\u5C5E\u3057\u3066\u3044\u307E\u305B\u3093")];
    c.replaceChildren(...body);
    const W2 = $("#mapwrap").clientWidth;
    c.style.left = Math.min(Math.max(8, p.x + 10), W2 - 280) + "px";
    c.style.top = Math.max(8, p.y + 10) + "px";
    c.classList.add("on");
    if (st2) {
      S2.sel = st2.id;
      S2.map.sel = st2.id;
      S2.map.draw();
    }
  }
  function renderRight() {
    const w = S2.w, T3 = timeOf(w.civ), cs = controlled();
    const eraNow = eraLabel(w.civ.wcde.config.calendar, w.civ.monthIndex);
    $("#clock").replaceChildren(h("div", { class: "wn" }, w.civ.wcde.config.name ?? ""), h("div", { class: "d", id: "date" }, formatWorldDate(w)), eraNow ? h("div", { class: "era", id: "era" }, eraNow) : null, h("div", { class: "c" }, ...SPEEDS.map((s) => h("button", { class: (T3.hold ? T3.resumeSpeed : T3.speed) === s.id ? "on" : "", "data-speed": s.id, title: s.id ? `${s.mps} \u304B\u6708\uFF0F\u79D2` : "\u505C\u6B62", onclick: () => {
      run({ type: "clock.setSpeed", speed: s.id });
      renderRight();
    } }, s.label))), h("div", { class: "n", id: "runstate" }, cs ? `\u62C5\u5F53: ${stateName(cs)}` : "\u62C5\u5F53\u56FD\u306A\u3057\uFF08\u898B\u5B88\u308A\uFF09", T3.hold ? "\u30FB\u30CB\u30E5\u30FC\u30B9\u306E\u78BA\u8A8D\u5F85\u3061" : T3.speed ? "" : "\u30FB\u505C\u6B62\u4E2D"));
    announce();
  }
  function announce() {
    const c = S2.w.civ, key = (n2) => n2.eventId ?? n2.id, feed = newsFeed(c, { limit: 16, minLevel: "major" });
    if (!S2.newsSeen) {
      S2.newsSeen = new Set(feed.map(key));
      return;
    }
    const fresh = feed.filter((n2) => n2.level !== "critical" && !S2.newsSeen.has(key(n2))).reverse();
    feed.forEach((n2) => S2.newsSeen.add(key(n2)));
    if (!fresh.length) return;
    const shown = fresh.slice(-3);
    for (const n2 of shown) notify("ok", `${n2.date.year}\u5E74${n2.date.month}\u6708\u3000${n2.title}`);
    const last = shown[shown.length - 1], sid = (last.entityIds ?? []).find((i) => c.states[i]), g = sid ? c.groups[c.states[sid].capitalGroupId] : null, el = $("#newscall"), M = S2.map;
    if (!g || !el || !M) return;
    const [x, y] = M.proj(M.geo.cen[g.cell * 2], M.geo.cen[g.cell * 2 + 1], M.cv.width, M.cv.height), r = M.cv.clientWidth / (M.cv.width || 1), px = (x * M.view.k + M.view.x) * r, py = (y * M.view.k + M.view.y) * r;
    el.replaceChildren(h("b", {}, c.states[sid].name), h("div", {}, last.title));
    el.style.left = Math.min(Math.max(8, px + 12), M.cv.clientWidth - 260) + "px";
    el.style.top = Math.min(Math.max(48, py + 12), M.cv.clientHeight - 80) + "px";
    el.classList.add("on");
    clearTimeout(S2.newsT);
    S2.newsT = setTimeout(() => el.classList.remove("on"), 6e3);
  }
  function renderNews() {
    const m = $("#newsmodal"), q2 = newsOf(S2.w.civ).queue;
    if (!q2.length) {
      m.hidden = true;
      m.replaceChildren();
      return;
    }
    const n2 = q2[0];
    m.hidden = false;
    m.replaceChildren(h("div", { class: "modalbox" }, h("div", { class: "code", style: "justify-content:center" }, `\u91CD\u5927\u30CB\u30E5\u30FC\u30B9\uFF08\u6B8B\u308A ${q2.length} \u4EF6\uFF09`), h("div", { class: "n" }, `${n2.date.year}\u5E74${n2.date.month}\u6708`), h("h2", {}, n2.title), h("div", {}, ...n2.entityIds.filter((i) => S2.w.civ.states[i]).map((i) => [link(i), " "])), h("div", { class: "rowb", style: "justify-content:center;margin-top:16px" }, btn("OK", () => {
      run({ type: "news.ack", id: n2.id });
      renderRight();
      renderNews();
      S2.map.draw();
    }, "p", { id: "ack" }))));
  }
  function tick2() {
    const w = S2.w;
    if (!w || w.viewPast != null || !isRunning(w.civ)) return;
    const T3 = timeOf(w.civ), mps = SPEEDS.find((s) => s.id === T3.speed)?.mps ?? 0, r = run({ type: "clock.run", months: Math.max(1, Math.round(mps / 4)) });
    if (!r.ok && r.code !== "news_hold") run({ type: "clock.setSpeed", speed: 0 });
    live();
  }
  function live() {
    if (!$("#hub")) return;
    renderRight();
    renderNews();
    S2.map.draw();
    if (S2.hub && S2.w.civ.monthIndex !== S2.paintedMonth) $("#prefresh")?.classList.add("stale");
  }
  function boot() {
    if (!document.getElementById("v6-root")) return;
    initNotify();
    setup();
    runSplash();
  }
  if (typeof window !== "undefined") {
    window.__v6 = { S: S2, run, act, render: () => S2.hooks.render?.(), start };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
