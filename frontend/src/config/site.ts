import { env } from "@/config/env";

/** Public-facing product metadata shared by the app metadata surfaces. */
export const siteConfig = {
  name: "WhatsApp Asistan",
  shortName: "Asistan",
  description:
    "Sakin Ustalık — satıcılar için kontrollü WhatsApp asistanı. İşletmenizin bilgileriyle konuşur, bilmediğinde uydurmaz, karar gerektiğinde size bırakır.",
  locale: "tr-TR",
  url: env.siteUrl,
} as const;

export type SiteConfig = typeof siteConfig;
