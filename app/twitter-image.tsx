import { ImageResponse } from "next/og";
import { OG_SIZE, renderOgImage } from "@/lib/og-image";

// Next requires each image route's config exported literally (not re-exported from a sibling
// file), so this mirrors opengraph-image.tsx instead of importing it.
export const runtime = "nodejs";
export const alt = "Nova";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(renderOgImage(), size);
}
