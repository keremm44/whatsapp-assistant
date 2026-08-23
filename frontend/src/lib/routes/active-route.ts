/**
 * Single source of truth for seller route activation.
 *
 * Used by:
 *   - the desktop sidebar (seller-sidebar.tsx)
 *   - the tablet Sheet nav list (seller-topbar.tsx)
 *   - the mobile bottom navigation (seller-mobile-nav.tsx)
 *
 * The rules below match the approved information architecture:
 *   - /seller  lights up ONLY on the exact /seller path
 *   - /seller/products, /seller/rules, /seller/assistant-knowledge and
 *     /seller/order-collection light up /seller/assistant-settings
 *     because they are children of "Asistan Ayarları" in the sidebar IA
 *   - /seller/assistant-settings and its child routes plus
 *     /seller/onboarding and /seller/settings all count as the "Diğer" mobile parent
 *   - the "İşler" mobile parent covers orders / returns / paused / unanswered
 *   - the "Konuşmalar" mobile parent covers /seller/conversations
 */

export type MobileParent = "Genel" | "Konuşmalar" | "İşler" | "Diğer";

const EXACT_GENEL = "/seller";

const isPathnameActive = (pathname: string, href: string): boolean => {
  if (href === EXACT_GENEL) {
    return pathname === EXACT_GENEL;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};

const ASSISTANT_PARENT = "/seller/assistant-settings";

const DIĞER_HREFS: readonly string[] = [
  "/seller/assistant-settings",
  "/seller/assistant-knowledge",
  "/seller/order-collection",
  "/seller/products",
  "/seller/rules",
  "/seller/onboarding",
  "/seller/settings",
];
const İŞLER_HREFS: readonly string[] = [
  "/seller/orders",
  "/seller/returns",
  "/seller/paused",
  "/seller/unanswered",
];
const KONUŞMALAR_HREFS: readonly string[] = ["/seller/conversations"];

const belongsToPrefix = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * Whether a given sidebar href should be the active sidebar destination
 * for the current pathname. Used by the desktop sidebar and the tablet
 * Sheet nav list. The `/seller/assistant-settings` entry stays active
 * for assistant child routes.
 */
export const isSellerItemActive = (
  pathname: string | null,
  href: string,
): boolean => {
  if (!pathname) return false;
  if (isPathnameActive(pathname, href)) return true;

  if (href === ASSISTANT_PARENT) {
    return (
      belongsToPrefix(pathname, "/seller/products") ||
      belongsToPrefix(pathname, "/seller/rules") ||
      belongsToPrefix(pathname, "/seller/assistant-knowledge") ||
      belongsToPrefix(pathname, "/seller/order-collection")
    );
  }

  return false;
};

/**
 * Which mobile bottom-nav parent (if any) should be active for the
 * current pathname.
 */
export const activeMobileParent = (
  pathname: string | null,
): MobileParent | null => {
  if (!pathname) return null;
  if (pathname === EXACT_GENEL) return "Genel";

  if (KONUŞMALAR_HREFS.some((href) => belongsToPrefix(pathname, href))) {
    return "Konuşmalar";
  }
  if (İŞLER_HREFS.some((href) => belongsToPrefix(pathname, href))) {
    return "İşler";
  }
  if (DIĞER_HREFS.some((href) => belongsToPrefix(pathname, href))) {
    return "Diğer";
  }
  return null;
};