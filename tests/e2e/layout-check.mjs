// 画面の崩れを機械で見つける検査（v2.4.1 A4）。実機で見られない代わりに、撮影のたびに呼ぶ。
//   しきい値は緩めない。戻り値は「問題の説明」の配列（空なら合格）。
export async function checkLayout(page, { touch = false } = {}) {
  return page.evaluate(({ touch }) => {
    const out = [];
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !e.closest("[hidden]"); };
    const name = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}${e.textContent ? `「${e.textContent.trim().replace(/\s+/g, " ").slice(0, 14)}」` : ""}`;
    const W = innerWidth, H = innerHeight;
    // 1. ページ全体の横スクロール
    if (document.documentElement.scrollWidth > W + 1) out.push(`横スクロール: ページ全体 ${document.documentElement.scrollWidth} > ${W}`);
    const wins = [...document.querySelectorAll(".float-win")].filter(vis);
    for (const w of wins) {
      const wr = w.getBoundingClientRect(), id = w.dataset.win ?? "?";
      // 2. 窓が画面の外に出ない
      if (wr.left < -1 || wr.top < -1 || wr.right > W + 1 || wr.bottom > H + 1) out.push(`窓がはみ出し: ${id} (${Math.round(wr.left)},${Math.round(wr.top)} - ${Math.round(wr.right)},${Math.round(wr.bottom)})`);
      const bodyEl = w.querySelector(".float-win-body") ?? w;
      for (const e of w.querySelectorAll("*")) {
        if (!vis(e) || e === bodyEl || e === w || e.classList.contains("rs-handle")) continue; // リサイズ用のつまみは、枠をまたぐのが仕様
        const cs = getComputedStyle(e);
        // 3. 窓の本体の内側で、中身が横にあふれている要素（自前で横スクロールする枠は除く）
        if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && cs.overflowX === "visible" && !["svg", "path", "circle", "input", "select", "textarea"].includes(e.tagName.toLowerCase()) && !(e instanceof SVGElement) && e.children.length) out.push(`横にあふれ: ${id}/${name(e)} (${e.scrollWidth} > ${e.clientWidth})`);
        // 4. 要素が窓の枠から出ている・切れている（横スクロールする枠の中は除く）
        const r = e.getBoundingClientRect();
        let clipped = false;
        for (let p = e.parentElement; p && p !== w; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") { clipped = true; break; } }
        if (!clipped && (r.right > wr.right + 1 || r.left < wr.left - 1)) out.push(`窓の外にはみ出し: ${id}/${name(e)} (${Math.round(r.left)}..${Math.round(r.right)} / 窓 ${Math.round(wr.left)}..${Math.round(wr.right)})`);
        // 5. 文字が、自分の枠から出ている（省略記号なしで切れている）
        if (cs.overflow === "hidden" && cs.textOverflow !== "ellipsis" && e.scrollWidth > e.clientWidth + 1 && e.children.length === 0 && e.textContent.trim()) out.push(`文字が切れている: ${id}/${name(e)}`);
        // 6. 押せる要素の大きさ（タッチのとき）
        if (touch && /^(button|summary)$/i.test(e.tagName) && !e.disabled && r.height < 34 && !e.closest(".float-win-resize")) out.push(`押せる要素が小さい(${Math.round(r.height)}px): ${id}/${name(e)}`);
      }
    }
    // 7. 右下の通知（エラー等）と戦争状況の重なり、およびニュース・時計との重なり
    const box = (s) => { const e = document.querySelector(s); if (!e || !vis(e)) return null; return e.getBoundingClientRect(); };
    const hit = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    const fixed = ["#banner", "#war-status", "#news", "#clock", "#hub"].map((s) => [s, box(s)]).filter(([, r]) => r);
    for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) if (hit(fixed[i][1], fixed[j][1])) out.push(`重なり: ${fixed[i][0]} と ${fixed[j][0]}`);
    for (const [s, r] of fixed) if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`画面外: ${s}`);
    // 8. 主要操作の大きさ（34px / 再生ボタンは40px）
    const play = document.querySelector("#btn-time-toggle");
    if (play && vis(play) && touch && play.getBoundingClientRect().height < 40) out.push(`再生ボタンが小さい: ${Math.round(play.getBoundingClientRect().height)}px`);
    for (const e of document.querySelectorAll("#hub .hub-item, #clock button")) { if (touch && vis(e) && e.getBoundingClientRect().height < 34) out.push(`押せる要素が小さい: ${name(e)}`); }
    return out;
  }, { touch });
}
