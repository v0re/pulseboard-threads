import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getAppUrl } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: { default: "Pulseboard — Threads 數據分析", template: "%s | Pulseboard" },
  description: "透過官方 Threads API 分析自己的貼文瀏覽、互動與成長趨勢。",
  openGraph: { title: "Pulseboard — Threads 數據分析", description: "透過官方 Threads API 分析自己的貼文瀏覽、互動與成長趨勢。", images: [{ url: "/og.png", width: 1731, height: 909, alt: "Pulseboard Threads 數據分析" }], type: "website" },
  twitter: { card: "summary_large_image", title: "Pulseboard — Threads 數據分析", description: "透過官方 Threads API 分析自己的貼文瀏覽、互動與成長趨勢。", images: ["/og.png"] },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#171619" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable}`}><body>{children}</body></html>;
}
