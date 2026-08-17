import heic2any from 'heic2any';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const SMALL_IMAGE_BYTES = 300 * 1024;

const isHeic = (file: File) =>
  /\.heic$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

const isRasterImage = (file: File) => {
  if (/^image\/(jpeg|png|gif|webp|bmp|x-icon)/.test(file.type)) return true;
  return /\.(jpe?g|png|gif|webp|bmp|ico)$/i.test(file.name);
};

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = src;
  });

/**
 * Reads a file as a base64 data URL.
 *
 * Raster images (jpeg/png/gif/webp/bmp/heic/heif) are automatically
 * downscaled to at most MAX_DIMENSION on the longest edge and re-encoded
 * (JPEG for photos, PNG kept for transparency) so they don't bloat the
 * board/goal/habit/note snapshots that are re-uploaded and re-downloaded
 * in full on every change. Small images and non-image files are kept as-is.
 */
export const fileToDataUrl = async (file: File): Promise<string> => {
  if (!isHeic(file) && !isRasterImage(file)) return readAsDataUrl(file);

  let blob: Blob = file;
  let sourceWasHeic = false;
  if (isHeic(file)) {
    try {
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
      blob = Array.isArray(converted) ? converted[0] : converted;
      sourceWasHeic = true;
    } catch {
      return readAsDataUrl(file);
    }
  }

  if (!sourceWasHeic && file.size <= SMALL_IMAGE_BYTES) return readAsDataUrl(file);

  const raw = await readAsDataUrl(blob);
  try {
    const img = await loadImage(raw);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(1, MAX_DIMENSION / longest);
    if (scale >= 1) return raw;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const keepPng = blob.type === 'image/png' || file.type === 'image/png' || /\.png$/i.test(file.name);
    const out = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return out.length < raw.length ? out : raw;
  } catch {
    return raw;
  }
};
