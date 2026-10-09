import jpeg from "jpeg-js";

/** Where a square avatar lands at the top edge of a cover-cropped hero: rows 10–25%. */
const TOP = [0.1, 0.25] as const;
/** Max luminance, so white status-bar text stays readable on the colour. */
const MAX_LUMINANCE = 0.35;

/** Average colour of the part of the photo the hero fades into, as #rrggbb. Null if it can't be decoded. */
export function avatarColor(data: ArrayBuffer): string | null {
  try {
    const { width, height, data: pixels } = jpeg.decode(new Uint8Array(data), { useTArray: true });
    const sum = [0, 0, 0];
    let count = 0;
    for (let y = Math.floor(height * TOP[0]); y < Math.ceil(height * TOP[1]); y++) {
      for (let x = 0; x < width; x++, count++) for (let c = 0; c < 3; c++) sum[c] += pixels[(y * width + x) * 4 + c];
    }
    const rgb = sum.map((total) => total / count);
    const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    const scale = luminance > MAX_LUMINANCE ? MAX_LUMINANCE / luminance : 1;
    return "#" + rgb.map((value) => Math.round(value * scale).toString(16).padStart(2, "0")).join("");
  } catch { return null; }
}
