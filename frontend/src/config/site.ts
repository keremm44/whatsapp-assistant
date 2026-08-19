/**
 * Public-facing site configuration. Marketing copy is intentionally minimal
 * during the foundation step; product copy will be added by the team in
 * later steps and must not be invented here.
 */

import { env } from "@/config/env";

export const siteConfig = {
  name: "WhatsApp Asistan",
  shortName: "Asistan",
  description:
    "Sakin Ustalık — satıcılar için kontrollü WhatsApp asistanı. İşletmenizin bilgileriyle konuşur, bilmediğinde uydurmaz, karar gerektiğinde size bırakır.",
  locale: "tr-TR",
  url: env.siteUrl,
} as const;

export type SiteConfig = typeof siteConfig;
