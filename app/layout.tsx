import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "منصة المترجمين",
    template: "%s | منصة المترجمين",
  },
  description: "منصة تشغيل المترجمين التابعة لوكالة الشؤون الدعوية والإرشادية: الورديات والطلبات والإحصاءات والمتابعة.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/religious-affairs-logo.jpg",
    apple: "/religious-affairs-logo.jpg",
  },
  openGraph: {
    title: "منصة إدارة المترجمين",
    description: "إدارة الورديات والطلبات والإحصاءات في مكان واحد.",
    type: "website",
    locale: "ar_SA",
    images: ["/religious-affairs-logo.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "منصة إدارة المترجمين",
    description: "إدارة الورديات والطلبات والإحصاءات في مكان واحد.",
    images: ["/religious-affairs-logo.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
