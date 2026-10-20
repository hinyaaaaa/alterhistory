// V4-M0 の計測。使い方: node tests/helpers/bench-sphere-mesh.mjs [n=158]
// 出力は端末・Node・セル数つきで記録する（Surface Go 4 での測定値の代わりにはならない）。
import os from "node:os";
import * as M from "../../js/core/world/sphere-mesh.js";
const n = Number(process.argv[2] ?? 158), runs = 3, ms = (a) => a.map((x) => x.toFixed(0)).join(" / ");
const build = [], poly = [], area = [];
let mesh;
for (let r = 0; r < runs; r++) {
  let t = performance.now(); mesh = M.buildSphereMesh(n); build.push(performance.now() - t);
  t = performance.now(); let k = 0; for (let c = 0; c < mesh.cellCount; c++) k += M.cellViewPolygon(mesh, c).lon.length; poly.push(performance.now() - t);
  t = performance.now(); let a = 0; for (let c = 0; c < mesh.cellCount; c++) a += M.cellArea(mesh, c); area.push(performance.now() - t);
}
const bytes = mesh.centerXYZ.byteLength + mesh.vertexXYZ.byteLength + mesh.neighborOffsets.byteLength + mesh.neighborIds.byteLength + mesh.cellVertexIds.byteLength;
console.log(JSON.stringify({ device: `${os.cpus()[0]?.model} x${os.cpus().length}`, node: process.version, n, cells: mesh.cellCount, triangles: mesh.triangleCount, meshVersion: M.MESH_VERSION, hash: M.meshHash(mesh), buildMs: ms(build), viewPolygonsAllCellsMs: ms(poly), areaAllCellsMs: ms(area), geometryBytes: bytes, rssMB: Math.round(process.memoryUsage().rss / 1e6) }, null, 1));
