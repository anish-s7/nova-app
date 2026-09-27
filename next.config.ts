import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spotify only redirects to loopback IPs (SPOTIFY_REDIRECT_URI is 127.0.0.1), and the dev server
  // otherwise blocks its scripts for any host but localhost, leaving pages blank there. Dev-only.
  allowedDevOrigins: ["127.0.0.1"],
  // Hide the "N" dev indicator in the corner (dev only; it never shows in production). Compile and
  // runtime errors still pop up as usual.
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "coverartarchive.org" },
      { protocol: "https", hostname: "*.archive.org" },
      { protocol: "https", hostname: "*.mzstatic.com" },
      { protocol: "https", hostname: "cdn-images.dzcdn.net" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
