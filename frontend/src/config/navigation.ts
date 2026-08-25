/**
 * Seller navigation is product-owned. The shell composes only products the
 * backend says are active for the current seller. Unknown/future product keys
 * are ignored until this frontend actually has routes for them.
 */

export type NavigationItem = {
  label: string;
  href: string;
  icon:
    | "LayoutDashboard"
    | "MessagesSquare"
    | "Package"
    | "Undo2"
    | "PauseCircle"
    | "HelpCircle"
    | "Settings2"
    | "Box"
    | "ScrollText"
    | "BookOpen"
    | "ClipboardList"
    | "Settings";
  childOf?: string;
};

export type NavigationSection = {
  title: string;
  items: NavigationItem[];
};

export type MobileNavItem = {
  label: string;
  icon: NavigationItem["icon"];
  href?: string;
  sheet?: NavigationItem[];
};

export type SellerProductNavigation = {
  productKey: string;
  label: string;
  sections: NavigationSection[];
  mobile: MobileNavItem[];
};

/** Current WhatsApp-owned seller routes. */
export const whatsappNavigation: NavigationSection[] = [
  {
    title: "İşler",
    items: [
      {
        label: "Genel Bakış",
        href: "/seller",
        icon: "LayoutDashboard",
      },
      {
        label: "Konuşmalar",
        href: "/seller/conversations",
        icon: "MessagesSquare",
      },
      {
        label: "Sipariş Bilgileri",
        href: "/seller/orders",
        icon: "Package",
      },
      {
        label: "İade ve Sorunlar",
        href: "/seller/returns",
        icon: "Undo2",
      },
    ],
  },
  {
    title: "Asistan",
    items: [
      {
        label: "Yanıtı Durdurulanlar",
        href: "/seller/paused",
        icon: "PauseCircle",
      },
      {
        label: "Cevaplanamayan Sorular",
        href: "/seller/unanswered",
        icon: "HelpCircle",
      },
      {
        label: "Asistan Ayarları",
        href: "/seller/assistant-settings",
        icon: "Settings2",
      },
    ],
  },
  {
    title: "Sistem",
    items: [
      {
        label: "Kurulum",
        href: "/seller/onboarding",
        icon: "ClipboardList",
      },
      {
        label: "Ayarlar",
        href: "/seller/settings",
        icon: "Settings",
      },
    ],
  },
];

/**
 * Compatibility export for non-shell consumers. The canonical ownership name
 * is now `whatsappNavigation`; this alias can be retired after all consumers
 * become product-aware.
 */
export const sellerNavigation = whatsappNavigation;

export const assistantSubRoutes: NavigationItem[] = [
  {
    label: "Ürünler",
    href: "/seller/products",
    icon: "Box",
    childOf: "/seller/assistant-settings",
  },
  {
    label: "Mesaja Göre Cevaplar",
    href: "/seller/rules",
    icon: "ScrollText",
    childOf: "/seller/assistant-settings",
  },
  {
    label: "Asistanın Bildikleri",
    href: "/seller/assistant-knowledge",
    icon: "BookOpen",
    childOf: "/seller/assistant-settings",
  },
  {
    label: "Sipariş Toplama",
    href: "/seller/order-collection",
    icon: "ClipboardList",
    childOf: "/seller/assistant-settings",
  },
];

export const whatsappMobileBottomNav: MobileNavItem[] = [
  {
    label: "Genel",
    icon: "LayoutDashboard",
    href: "/seller",
  },
  {
    label: "Konuşmalar",
    icon: "MessagesSquare",
    href: "/seller/conversations",
  },
  {
    label: "İşler",
    icon: "Package",
    sheet: [
      {
        label: "Sipariş Bilgileri",
        href: "/seller/orders",
        icon: "Package",
      },
      {
        label: "İade ve Sorunlar",
        href: "/seller/returns",
        icon: "Undo2",
      },
      {
        label: "Yanıtı Durdurulanlar",
        href: "/seller/paused",
        icon: "PauseCircle",
      },
      {
        label: "Cevaplanamayan Sorular",
        href: "/seller/unanswered",
        icon: "HelpCircle",
      },
    ],
  },
  {
    label: "Diğer",
    icon: "Settings2",
    sheet: [
      {
        label: "Asistan Ayarları",
        href: "/seller/assistant-settings",
        icon: "Settings2",
      },
      {
        label: "Kurulum",
        href: "/seller/onboarding",
        icon: "ClipboardList",
      },
      {
        label: "Ayarlar",
        href: "/seller/settings",
        icon: "Settings",
      },
    ],
  },
];

export const mobileBottomNav = whatsappMobileBottomNav;

/**
 * Registry of product navigation that is actually implemented in this build.
 * Trendyol is intentionally not registered until its routes exist; an active
 * but unknown entitlement must never create dead links.
 */
export const sellerProductNavigationRegistry: SellerProductNavigation[] = [
  {
    productKey: "whatsapp",
    label: "WhatsApp",
    sections: whatsappNavigation,
    mobile: whatsappMobileBottomNav,
  },
];

export const getSellerProductNavigation = (
  activeProducts: readonly string[],
): SellerProductNavigation[] => {
  const active = new Set(activeProducts);
  return sellerProductNavigationRegistry.filter((product) =>
    active.has(product.productKey),
  );
};

export const getMobileBottomNav = (
  activeProducts: readonly string[],
): MobileNavItem[] => {
  const productNavigation = getSellerProductNavigation(activeProducts);
  if (productNavigation.length !== 1) return [];
  return productNavigation[0]?.mobile ?? [];
};
