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
 * Inter is the canonical display/body family. The variable latin and
 * latin-ext WOFF2 subsets are self-hosted from `public/fonts/` through the
 * `@font-face` declarations in globals.css, with system grotesques as the
 * fallback stack. No remote font request or framework font-loader dependency
 * is needed.
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
