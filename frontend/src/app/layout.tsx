import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
};

/**
 * The canonical font families (Manrope for headings, Source Sans 3 for body)
 * are declared as CSS variables in src/app/globals.css. To self-host the real
 * font files, drop the WOFF2 files into frontend/public/fonts/ and uncomment
 * the `@font-face` rules in globals.css. Until then, the system font stack
 * preserves the calm, humanist character of the design.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-background font-body text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
