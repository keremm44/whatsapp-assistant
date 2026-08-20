import type { MetadataRoute } from "next";

/** No public marketing URLs. Login and workspaces stay out of the sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
