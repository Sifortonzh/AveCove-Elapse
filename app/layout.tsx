import type { Metadata, Viewport } from "next";
import "./globals.css";

// The application shell changes frequently while the product is evolving.
// Render it dynamically so returning devices always revalidate the current
// HTML instead of keeping an old shell that points at retired asset hashes.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "红豆生南国——练你所念，思你所想",
  description: "无广告的现代医学刷题工具，支持 Word、PDF、OCR 导入，以及 AI 驱动的总结、易错提示和伴随式答疑。",
  icons: {
    icon: "/hongdou-logo.png",
    shortcut: "/hongdou-logo.png",
  },
  openGraph: {
    title: "红豆生南国——练你所念，思你所想",
    description: "无广告 · 私有题库 · AI 伴学",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/hongdou-share.png", width: 1731, height: 909, alt: "红豆生南国医学题库" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "红豆生南国——练你所念，思你所想",
    description: "无广告 · 私有题库 · AI 伴学",
    images: ["/hongdou-share.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1e9" },
    { media: "(prefers-color-scheme: dark)", color: "#111917" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
