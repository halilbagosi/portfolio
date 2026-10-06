/** Below this width/height a screenshot is a phone screenshot (same threshold as the card corners). */
export const PHONE_ASPECT = 0.75;

/**
 * Output size for an uploaded photo. Desktop shots fit within 2400px, phone shots within 1290px
 * wide: sharp on a 3x phone in the viewer, without shipping camera-sized files. Never upscales.
 */
export function targetSize(w: number, h: number) {
  const phone = w / h < PHONE_ASPECT;
  const k = phone ? Math.min(1, 1290 / w) : Math.min(1, 2400 / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k), phone };
}

/** A warning when a photo is too small to look sharp on a phone, else null. */
export function sizeWarning(w: number, h: number): string | null {
  const phone = w / h < PHONE_ASPECT;
  const small = phone ? w < 900 : Math.max(w, h) < 1200;
  if (!small) return null;
  return `Only ${w}×${h}px — may look soft on phones (aim for ${phone ? '900px wide' : '1200px'} or more).`;
}

/** Decode any image the browser can read, downscale it, and encode it as JPEG. */
export async function processPhoto(file: File) {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This browser cannot read that image (try JPEG or PNG).');
  });
  const { w, h } = targetSize(bitmap.width, bitmap.height);
  const warning = sizeWarning(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', 0.88),
  );
  return { blob, w, h, warning };
}
