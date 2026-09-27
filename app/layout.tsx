import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import { PhoneFrame } from "@/components/phone-frame";
import { SessionSync } from "@/components/session-sync";
import { ClusterCacheProvider } from "@/components/cluster-cache-provider";
import "./globals.css";

const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Nova — Someone out there feels it too",
  description: "Nova connects people through the emotions and personal stories behind their favorite music.",
};

export const viewport: Viewport = {
  themeColor: "#15142a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${newsreader.variable} antialiased`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Suspense>
          <SessionSync />
        </Suspense>
        <ClusterCacheProvider>
          <PhoneFrame>{children}</PhoneFrame>
        </ClusterCacheProvider>
      </body>
    </html>
  );
}
