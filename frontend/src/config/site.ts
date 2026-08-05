const localSiteUrl = "http://localhost:3000";

function resolveSiteUrl(value: string | undefined): string {
  if (value) {
    try {
      const url = new URL(value);

      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString().replace(/\/$/, "");
      }
    } catch {
      // Geçersiz değer uygulamanın metadata üretimini durdurmamalı.
    }
  }

  // Yerel geliştirme bozulmasın diye fallback korunur. Production ortamında
  // canonical URL'lerin localhost olmaması için NEXT_PUBLIC_SITE_URL ayarlanmalıdır.
  return localSiteUrl;
}

export const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL?.trim());
