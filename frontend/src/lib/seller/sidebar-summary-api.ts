import { apiFetchWithAccessToken } from "@/lib/api/authenticated";
import {
  parseSellerSidebarSummary,
  type SellerSidebarSummary,
} from "@/lib/seller/sidebar-summary";

export const fetchSellerSidebarSummary = async (
  accessToken: string,
  signal?: AbortSignal,
): Promise<SellerSidebarSummary> => {
  const raw = await apiFetchWithAccessToken<unknown>(
    "/seller/sidebar-summary",
    accessToken,
    { cache: "no-store", signal },
  );
  return parseSellerSidebarSummary(raw);
};
