/**
 * Public-facing site configuration. Marketing copy is intentionally minimal
 * during the foundation step; product copy will be added by the team in
 * later steps and must not be invented here.
 */

export const siteConfig = {
  name: "WhatsApp Asistan",
  shortName: "Asistan",
  description:
    "Sakın Ustalık — küçük işletmeler için WhatsApp asistanı. Tekrar eden işleri toplar, karar gerektiğinde satıcıya bırakır.",
  locale: "tr-TR",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

export type SiteConfig = typeof siteConfig;
