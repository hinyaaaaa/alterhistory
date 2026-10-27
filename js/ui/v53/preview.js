// v5.3 UI の単体プレビュー（本体につながらない）。preview/v53.html から読み込む。
//   ?phase=empty  … 世界がない状態から（開始フローを確認）
//   ?seed=3&years=300 … 模擬世界の条件
import { mountV53 } from "./index.js";
import { createMockAdapter } from "./adapters/mock-adapter.js";
import { createMockMap } from "./adapters/mock-map.js";

const q = new URLSearchParams(location.search);
const adapter = createMockAdapter({ seed: Number(q.get("seed") ?? 7), years: Number(q.get("years") ?? 400), phase: q.get("phase") ?? "playing" });
const map = createMockMap({ adapter });
const app = mountV53({ root: document.getElementById("v53-root"), adapter, map });
window.__v53 = { app, adapter, map }; // 確認用（E2E・コンソール）
