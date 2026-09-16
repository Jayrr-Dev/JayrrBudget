const AVATAR_PX = 256;
const WEBP_QUALITY = 0.82;

function loadHtmlImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read image"));
    image.src = src;
  });
}

async function bitmapFromFile(file: File) {
  try {
    return await createImageBitmap(file);
  } catch {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadHtmlImage(objectUrl);
      return await createImageBitmap(image);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/** Crop-cover to a square avatar and encode WebP. */
export async function optimizeImageToWebpAvatar(file: File) {
  const bitmap = await bitmapFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not process image");
  }
  const scale = Math.max(AVATAR_PX / bitmap.width, AVATAR_PX / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  ctx.drawImage(
    bitmap,
    (AVATAR_PX - width) / 2,
    (AVATAR_PX - height) / 2,
    width,
    height,
  );
  bitmap.close();

  const webp = await encodeCanvas(canvas, "image/webp", WEBP_QUALITY);
  const blob = webp ?? (await encodeCanvas(canvas, "image/png", 1));
  if (!blob) {
    throw new Error("Could not convert image");
  }
  const stem = file.name.replace(/\.[^.]+$/, "") || "logo";
  const ext = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], `${stem}.${ext}`, { type: blob.type });
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image"));
    };
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}
