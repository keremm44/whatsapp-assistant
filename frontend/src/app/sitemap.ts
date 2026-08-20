import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

/** The public introduction is the only indexable product surface. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
