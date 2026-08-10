import * as React from "react";
import {
  Box,
  HelpCircle,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Package,
  PauseCircle,
  ScrollText,
  Settings,
  Settings2,
  Store,
  Undo2,
  type LucideIcon,
} from "lucide-react";

/**
 * Controlled, explicit icon mapping. We deliberately do NOT dynamically
 * import from the lucide-react package based on arbitrary strings — that
 * pattern has caused bundle bloat in the past and is harder to audit.
 *
 * `Menu` is reserved for the tablet navigation trigger and is intentionally
 * NOT used as a sidebar destination icon.
 *
 * `Store` is the brand mark glyph used in the sidebar's product identity
 * area. It is intentionally NOT used as a sidebar destination icon.
 */
export const SELLER_ICON_MAP = {
  LayoutDashboard,
  MessagesSquare,
  Package,
  Undo2,
  PauseCircle,
  HelpCircle,
  Settings2,
  Box,
  ScrollText,
  Settings,
  Menu,
  Store,
} as const satisfies Record<string, LucideIcon>;

export type SellerIconName = keyof typeof SELLER_ICON_MAP;

export const SellerIcon = ({
  name,
  className,
  size = 20,
  strokeWidth = 1.75,
}: {
  name: SellerIconName;
  className?: string;
  size?: 14 | 16 | 18 | 20 | 22 | 24;
  strokeWidth?: number;
}) => {
  const Icon = SELLER_ICON_MAP[name];
  return <Icon className={className} size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
};
