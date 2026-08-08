/**
 * Conceptual information architecture for the seller panel.
 *
 * This file represents the intended product navigation structure. The actual
 * route pages under /seller/* are introduced incrementally in later steps;
 * `implemented` is set to false for routes that are not yet built so the
 * sidebar can be safely rendered today without faking a destination.
 */

export type NavigationItem = {
  label: string;
  /** Logical destination. Use a Next.js href shape: "/seller/conversations". */
  href: string;
  /** Optional lucide-react icon name. Resolved at render time. */
  icon?: string;
  /** Whether the page route exists in this step of the build. */
  implemented: boolean;
};

export type NavigationSection = {
  title: string;
  items: NavigationItem[];
};

export const sellerNavigation: NavigationSection[] = [
  {
    title: "İşler",
    items: [
      {
        label: "Genel Bakış",
        href: "/seller",
        icon: "LayoutDashboard",
        implemented: true,
      },
      {
        label: "Konuşmalar",
        href: "/seller/conversations",
        icon: "MessagesSquare",
        implemented: false,
      },
      {
        label: "Sipariş Bilgileri",
        href: "/seller/orders",
        icon: "Package",
        implemented: false,
      },
      {
        label: "İade ve Sorunlar",
        href: "/seller/returns",
        icon: "Undo2",
        implemented: false,
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
        implemented: false,
      },
      {
        label: "Cevaplanamayan Sorular",
        href: "/seller/unanswered",
        icon: "HelpCircle",
        implemented: false,
      },
      {
        label: "Asistan Ayarları",
        href: "/seller/assistant",
        icon: "Settings2",
        implemented: false,
      },
    ],
  },
  {
    title: "Sistem",
    items: [
      {
        label: "Ayarlar",
        href: "/seller/system",
        icon: "Settings",
        implemented: false,
      },
    ],
  },
];

/** Outside the main navigation — header/footer utility destinations. */
export const utilityNavigation = {
  help: { label: "Yardım", href: "/yardim" },
  feedback: { label: "Geri bildirim", href: "/geri-bildirim" },
  profile: { label: "Profil", href: "/profil" },
  logout: { label: "Çıkış", href: "/cikis" },
} as const;
