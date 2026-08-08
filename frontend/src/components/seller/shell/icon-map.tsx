import * as React from "react";
import {
  Box,
  HelpCircle,
  LayoutDashboard,
  MessagesSquare,
  Package,
  PauseCircle,
  ScrollText,
  Settings,
  Settings2,
  Undo2,
  type LucideIcon,
} from "lucide-react";

/**
 * Controlled, explicit icon mapping. We deliberately do NOT dynamically
 * import from the lucide-react package based on arbitrary strings — that
 * pattern has caused bundle bloat in the past and is harder to audit.
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
} as const satisfies Record<string, LucideIcon>;

export type SellerIconName = keyof typeof SELLER_ICON_MAP;

export const SellerIcon = ({
  name,
  className,
  size = 20,
}: {
  name: SellerIconName;
  className?: string;
  size?: 16 | 18 | 20 | 24;
}) => {
  const Icon = SELLER_ICON_MAP[name];
  return <Icon className={className} size={size} strokeWidth={1.75} aria-hidden="true" />;
};
