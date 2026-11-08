// Ler um código QR de uma fotografia (fatura): a imagem reduzida a vários tamanhos, até o jsQR o encontrar.
// O jsQR só se carrega quando é preciso.

async function bitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) { try { return await createImageBitmap(file); } catch { /* HEIC no Chrome, etc. */ } }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** O texto do primeiro QR encontrado na fotografia, ou null. */
export async function readQr(file: Blob): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  const img = await bitmap(file);
  const W = 'naturalWidth' in img ? img.naturalWidth : img.width, H = 'naturalHeight' in img ? img.naturalHeight : img.height;
  for (const max of [1400, 2200, 900, 3000]) {
    const k = Math.min(1, max / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
    if (r?.data) return r.data;
    if (k === 1) break; // já foi no tamanho original
  }
  return null;
}
