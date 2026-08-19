import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/auth/", "/giris", "/preview/", "/seller/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
