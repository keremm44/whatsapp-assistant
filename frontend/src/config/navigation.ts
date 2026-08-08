/**
 * Conceptual information architecture for the seller panel.
 *
 * The route architecture is wider than the sidebar information architecture:
 * /seller/products and /seller/rules live under the "Asistan Ayarları" parent
 * in the sidebar. See `childOf` on the relevant items.
 *
 * Every entry below is implemented as a route in this step; deeper detail
 * pages (e.g. a single order, a single conversation, a single rule editor)
 * are introduced in later steps.
 */

export type NavigationItem = {
  label: string;
  href: string;
  /** Resolved at render time via the controlled icon map in SellerSidebar. */
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
    | "Settings";
  /**
   * Sidebar parent for routes that are not promoted to a top-level item.
   * When set, the parent's destination is treated as the active destination
   * for the purposes of the sidebar highlight.
   */
  childOf?: string;
};

export type NavigationSection = {
  title: string;
  items: NavigationItem[];
};

/**
 * Canonical desktop sidebar destinations, in display order.
 * The `childOf` field is used by the sidebar to keep "Asistan Ayarları"
 * highlighted on /seller/products and /seller/rules without adding extra
 * entries to the visible navigation.
 */
export const sellerNavigation: NavigationSection[] = [
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
        label: "Ayarlar",
        href: "/seller/settings",
        icon: "Settings",
      },
    ],
  },
];

/**
 * Sub-routes that are NOT sidebar items but should be linked from
 * "Asistan Ayarları" and should keep the parent highlighted.
 */
export const assistantSubRoutes: NavigationItem[] = [
  {
    label: "Ürünler",
    href: "/seller/products",
    icon: "Box",
    childOf: "/seller/assistant-settings",
  },
  {
    label: "Kurallar",
    href: "/seller/rules",
    icon: "ScrollText",
    childOf: "/seller/assistant-settings",
  },
];

/**
 * Mobile bottom-nav destinations. The "İşler" and "Diğer" entries open a
 * Sheet rather than navigating to a single URL.
 */
export type MobileNavItem = {
  label: string;
  icon: NavigationItem["icon"];
  href?: string;
  /** When set, the item opens a sheet with the listed destinations. */
  sheet?: NavigationItem[];
};

export const mobileBottomNav: MobileNavItem[] = [
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
        label: "Ayarlar",
        href: "/seller/settings",
        icon: "Settings",
      },
    ],
  },
];
