// セル形状の CSR 表現（v6.13.0）。球面世界から作った地図の形状を、型付き配列で持つ。
//
// なぜ: 旧形式（セルごと・頂点ごとの小さな JS 配列）は、10 万セルで約 130 MB、25 万セルで約 340 MB のヒープを使っていた。
//   同じ内容を型付き配列（CSR: 先頭位置の表 + 値の並び）にすると、10 万セルで約 12 MB になる（約 1/10）。
//   小さな配列を数十万個作らないので、世界を採用するときの時間と GC の負担も減る。
//
// 形（geometry.pack.csr）:
//   n                 セル数
//   cx, cy            セル中心（地図座標。Float64Array）
//   polyOff, polyIds  セルの多角形の頂点番号（CSR。反時計回り。継ぎ目の外へずらした複製頂点・極の追加点を含む）
//   altOff, altIds    継ぎ目をまたぐセルの、反対側の端に描く多角形（CSR。ほとんどのセルは空）
//   nbOff, nbIds      隣接セル（CSR。球面メッシュの隣接表をそのまま共有する。コピーしない）
//   border            極に近いセルの印（0/1）
//   vx, vy            頂点の座標（Float64Array）
//
// 旧形式（pack.p / cells.v・c・b・alt / vertices.p・v・c）は、**読まれたときに初めて**作って保持する（遅延ゲッター）。
//   描画・境界線・セル数の確認は CSR を直接読むので、旧形式は作られない。まだ移していない周辺コード（戦争・交易など）は、
//   これまでどおり cells.c[i] や pack.p[i] で読める。旧形式は、テストが小さな地図を手で組み立てる形でもある（CSR が無い地図は、
//   各関数が旧形式を読む）。

/** セル数。CSR があればそれから（旧形式を作らない）、無ければ pack.p の長さ */
export function cellCountOf(geometry) {
  const pk = geometry?.pack;
  return pk?.csr ? pk.csr.n : (pk?.p?.length ?? 0);
}

const centerCache = new WeakMap();
/**
 * 全セルの中心を { n, cx, cy }（型付き配列）で返す。CSR があればそれをそのまま、無ければ（手で組み立てた小さな地図）pack.p から作って使い回す。
 * 呼び出し側は cx[i], cy[i] で読む（セルごとに [x, y] を作らないので、描画の繰り返しでも軽い）。
 */
export function centersOf(geometry) {
  const pk = geometry.pack;
  if (pk.csr) return pk.csr;
  const p = pk.p; let hit = centerCache.get(pk);
  if (!hit || hit.src !== p || hit.n !== p.length) {
    const n = p.length, cx = new Float64Array(n), cy = new Float64Array(n);
    for (let i = 0; i < n; i++) { cx[i] = p[i][0]; cy[i] = p[i][1]; }
    hit = { src: p, n, cx, cy }; centerCache.set(pk, hit);
  }
  return hit;
}

/** セル i の中心 [x, y]。CSR があれば旧形式を作らずに読む */
export function centerOf(geometry, i) {
  const pk = geometry.pack, c = pk.csr;
  return c ? (i >= 0 && i < c.n ? [c.cx[i], c.cy[i]] : undefined) : pk.p[i];
}

/** セルの多角形の頂点数（描画の統計用） */
export function ringLength(cells, i) {
  const c = cells.csr;
  return c ? c.polyOff[i + 1] - c.polyOff[i] : cells.v[i].length;
}

/** 継ぎ目をまたぐセルの反対側の多角形を持つか */
export function hasAlt(cells, i) {
  const c = cells.csr;
  return c ? c.altOff[i + 1] > c.altOff[i] : !!cells.alt?.[i];
}

/** セル i の頂点番号の並び（CSR なら共有バッファの部分ビュー。旧形式ならその配列）。変更しないこと */
export function polygonIds(cells, i) {
  const c = cells.csr;
  return c ? c.polyIds.subarray(c.polyOff[i], c.polyOff[i + 1]) : cells.v[i];
}

/** 読まれたときに初めて作り、以後は値として保持するプロパティ（列挙しない。複製・JSON には出ない） */
export function lazyProp(obj, key, make) {
  const settle = (value) => Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: true });
  Object.defineProperty(obj, key, { configurable: true, enumerable: false, get() { const v = make(); settle(v); return v; }, set: settle });
}

const rows = (off, ids, n) => { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = Array.from(ids.subarray(off[i], off[i + 1])); return out; };

/**
 * pack に、旧形式の遅延ゲッターを取り付ける。pack.csr / pack.cells.csr / pack.vertices.csr は呼び出し側が先に置いておく。
 * 旧形式の中身は、CSR を作る前の buildGeometry の出力と同じ（頂点の隣接 vertices.v・c だけは、多角形の辺から作り直す。本番コードでは使われていない）。
 */
export function installLegacyViews(pack) {
  const csr = pack.csr, n = csr.n, nv = csr.vx.length, cells = pack.cells, vertices = pack.vertices;
  lazyProp(pack, "p", () => { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = [csr.cx[i], csr.cy[i]]; return out; });
  lazyProp(cells, "v", () => rows(csr.polyOff, csr.polyIds, n));
  lazyProp(cells, "c", () => rows(csr.nbOff, csr.nbIds, n));
  lazyProp(cells, "b", () => Array.from(csr.border));
  lazyProp(cells, "alt", () => { const out = new Array(n).fill(null); for (let i = 0; i < n; i++) if (csr.altOff[i + 1] > csr.altOff[i]) out[i] = Array.from(csr.altIds.subarray(csr.altOff[i], csr.altOff[i + 1])); return out; });
  lazyProp(vertices, "p", () => { const out = new Array(nv); for (let t = 0; t < nv; t++) out[t] = [csr.vx[t], csr.vy[t]]; return out; });
  const adjacency = () => { // 頂点どうしの隣（多角形の辺）と、頂点に接するセル
    const vv = Array.from({ length: nv }, () => []), vc = Array.from({ length: nv }, () => []);
    for (let c = 0; c < n; c++) {
      const s = csr.polyOff[c], e = csr.polyOff[c + 1], d = e - s;
      for (let k = 0; k < d; k++) {
        const a = csr.polyIds[s + k], b = csr.polyIds[s + (k + 1) % d];
        if (!vc[a].includes(c)) vc[a].push(c);
        if (a !== b) { if (!vv[a].includes(b)) vv[a].push(b); if (!vv[b].includes(a)) vv[b].push(a); }
      }
    }
    return { vv, vc };
  };
  let adj = null;
  lazyProp(vertices, "v", () => (adj ??= adjacency()).vv);
  lazyProp(vertices, "c", () => (adj ??= adjacency()).vc);
}
