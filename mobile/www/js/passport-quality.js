// Passport photo checks on the customer's own device (nothing is sent
// anywhere for analysis). Layered, and honest about what a heuristic can
// know:
//   1. hard checks — the file type, size and that the image really decodes.
//      These alone refuse a file (with Arabic advice to retake/choose again);
//   2. soft checks — resolution, darkness, overexposure/glare, blur, crop
//      (aspect ratio) and a "looks like the data page" hint (the machine-
//      readable zone at the bottom of a passport page is a band of dense,
//      high-contrast text). These only WARN: an uncertain result never
//      rejects a passport; the customer may send it and staff review it.
// The numbers are computed on a downscaled greyscale copy. Pure functions
// take plain pixel arrays and are unit-tested without a browser.

export const QUALITY_MESSAGES = Object.freeze({
  LOW_RESOLUTION: "الصورة صغيرة؛ قرّب الكاميرا من الجواز أو استخدم صورة أوضح.",
  TOO_DARK: "الصورة مظلمة؛ صوّر في مكان مضاء.",
  TOO_BRIGHT: "الصورة شديدة الإضاءة؛ ابتعد عن الضوء المباشر.",
  GLARE: "يوجد انعكاس ضوء على الجواز؛ غيّر زاوية التصوير.",
  BLURRY: "الصورة غير واضحة؛ ثبّت الهاتف وأعد التصوير.",
  CROPPED: "قد تكون أطراف صفحة الجواز مقصوصة؛ أظهر الصفحة كاملة.",
  NOT_PASSPORT_PAGE: "قد لا تكون هذه صفحة بيانات الجواز (الصفحة التي فيها صورتك وأسطر الرموز في أسفلها).",
});

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Thresholds on a 0–255 greyscale, measured on a ≤ 800px copy.
export const THRESHOLDS = Object.freeze({
  minLongSide: 1000,
  darkMean: 60,
  brightMean: 225,
  glareShare: 0.06,
  blurVariance: 60,
  // Passport data page (ID-3): 125 × 88 mm ≈ 1.42; a page photographed with
  // some margin stays well within this range in either orientation.
  minAspect: 1.15,
  maxAspect: 1.85,
});

// Mean brightness and share of near-white pixels (glare).
export function brightnessStats(gray) {
  let sum = 0;
  let white = 0;
  for (let i = 0; i < gray.length; i += 1) {
    sum += gray[i];
    if (gray[i] >= 250) white += 1;
  }
  return { mean: gray.length ? sum / gray.length : 0, whiteShare: gray.length ? white / gray.length : 0 };
}

// Variance of the Laplacian: low means few sharp edges (blur).
export function laplacianVariance(gray, width, height) {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += value;
      sumSq += value * value;
      n += 1;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

// Edge density of the bottom fifth of the page compared with the page: the
// two MRZ text lines make that band markedly busier. Returns the ratio.
export function bottomBandTextRatio(gray, width, height) {
  const edges = (fromRow, toRow) => {
    let count = 0;
    let total = 0;
    for (let y = Math.max(1, fromRow); y < Math.min(height - 1, toRow); y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        if (Math.abs(gray[i] - gray[i + 1]) > 40) count += 1;
        total += 1;
      }
    }
    return total ? count / total : 0;
  };
  const whole = edges(0, height);
  if (!whole) return 0;
  return edges(Math.floor(height * 0.8), height) / whole;
}

// The soft verdict from measured numbers. `page` is the bottom-band ratio
// (null when not measured).
export function assessMeasurements({ width, height, mean, whiteShare, sharpness, page = null }) {
  const warnings = [];
  const longSide = Math.max(width, height);
  const aspect = longSide / Math.max(1, Math.min(width, height));
  if (longSide < THRESHOLDS.minLongSide) warnings.push("LOW_RESOLUTION");
  if (mean < THRESHOLDS.darkMean) warnings.push("TOO_DARK");
  else if (mean > THRESHOLDS.brightMean) warnings.push("TOO_BRIGHT");
  if (whiteShare > THRESHOLDS.glareShare && mean <= THRESHOLDS.brightMean) warnings.push("GLARE");
  if (sharpness < THRESHOLDS.blurVariance) warnings.push("BLURRY");
  if (aspect < THRESHOLDS.minAspect || aspect > THRESHOLDS.maxAspect) warnings.push("CROPPED");
  // Only a clear absence of a text band is reported, and only as a hint.
  if (page !== null && page < 0.9 && width > height) warnings.push("NOT_PASSPORT_PAGE");
  return {
    warnings,
    checks: { width, height, brightness: Math.round(mean), glare: Math.round(whiteShare * 1000) / 1000, sharpness: Math.round(sharpness), aspect: Math.round(aspect * 100) / 100 },
  };
}

// Hard checks before decoding.
export function fileProblem(file) {
  if (!file) return "اختر صورة الجواز.";
  if (file.size > MAX_BYTES) return "حجم الملف أكبر من 10 ميغابايت.";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")) return null;
  if (!IMAGE_TYPES.includes(file.type)) return "نوع الملف غير مدعوم. استخدم صورة JPG أو PNG أو ملف PDF.";
  return null;
}

async function pdfLooksValid(file) {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head).startsWith("%PDF");
}

// Browser only: decode, downscale, measure. Returns
// { ok, error?, warnings, checks, previewUrl? }.
export async function analyzePassportFile(file) {
  const problem = fileProblem(file);
  if (problem) return { ok: false, error: problem, warnings: [] };
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")) {
    return (await pdfLooksValid(file))
      ? { ok: true, warnings: [], checks: {}, pdf: true }
      : { ok: false, error: "ملف PDF تالف أو غير مكتمل. اختر الملف من جديد.", warnings: [] };
  }
  let bitmap;
  try {
    bitmap = typeof createImageBitmap === "function" ? await createImageBitmap(file) : await loadImage(file);
  } catch {
    return { ok: false, error: "تعذّر فتح الصورة؛ قد تكون تالفة. صوّر الجواز من جديد.", warnings: [] };
  }
  const width = bitmap.width;
  const height = bitmap.height;
  if (!width || !height) return { ok: false, error: "تعذّر فتح الصورة؛ صوّر الجواز من جديد.", warnings: [] };
  try {
    const scale = Math.min(1, 800 / Math.max(width, height));
    const w = Math.max(3, Math.round(width * scale));
    const h = Math.max(3, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const { mean, whiteShare } = brightnessStats(gray);
    const result = assessMeasurements({ width, height, mean, whiteShare, sharpness: laplacianVariance(gray, w, h), page: bottomBandTextRatio(gray, w, h) });
    return { ok: true, ...result };
  } catch {
    // Measuring is a convenience: if the browser cannot, staff review it.
    return { ok: true, warnings: [], checks: { width, height }, unmeasured: true };
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}
