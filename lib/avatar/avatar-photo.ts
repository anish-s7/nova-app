"use client";

const SIZE = 256;

/**
 * A chosen photo as a square, center-cropped 256px JPEG, ready for POST /api/avatar/photo. Redrawing
 * it also drops the original's metadata (camera location and the like) and keeps uploads ~20-60 KB.
 */
export async function squarePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    console.error("squarePhoto: couldn't read the image", err);
    throw new Error("That file isn't a photo we can read. Try a JPG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the photo.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("This browser can't prepare the photo.");
  return blob;
}
