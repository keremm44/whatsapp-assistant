import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { siteUrl } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${brand.brandName} | WhatsApp Mesaj Yükünüzü Hafifletin`,
    template: `%s | ${brand.brandName}`,
  },
  description:
    "Mağazanıza göre hazırlanan WhatsApp asistanıyla sık sorulan soruları yanıtlayın, önemli konuşmaları kontrolünüzde tutun.",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: brand.brandName,
    title: `${brand.brandName} | WhatsApp Mesaj Yükünüzü Hafifletin`,
    description: brand.brandDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <a href="#main-content" className="skip-link">
          Ana içeriğe geç
        </a>
        {children}
      </body>
    </html>
  );
}
