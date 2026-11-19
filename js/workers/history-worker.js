// v6.20.0 M2: 履歴の圧縮・展開を、画面のスレッドの外で行う Worker。メッセージ: { id, op: "encode"|"decode", data }。
//   JSON の文字列化・解析と gzip は CPU を使うので、数百〜数千件のチャンクでも画面を止めない。
async function pipe(input, stream) { const w = stream.writable.getWriter(), wr = (async () => { await w.write(input); await w.close(); })(); wr.catch(() => {}); const parts = [], r = stream.readable.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); } await wr; let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
const enc = new TextEncoder(), dec = new TextDecoder();
self.onmessage = async (e) => {
  const { id, op, data } = e.data;
  try {
    if (op === "encode") { const raw = enc.encode(JSON.stringify(data)), out = typeof CompressionStream === "function" ? await pipe(raw, new CompressionStream("gzip")) : raw; self.postMessage({ id, ok: true, data: out }, [out.buffer]); }
    else if (op === "decode") { const raw = data[0] === 0x1f && data[1] === 0x8b && typeof DecompressionStream === "function" ? await pipe(data, new DecompressionStream("gzip")) : data; self.postMessage({ id, ok: true, data: JSON.parse(dec.decode(raw)) }); }
    else throw new Error("unknown op " + op);
  } catch (err) { self.postMessage({ id, ok: false, error: String(err?.message ?? err) }); }
};
