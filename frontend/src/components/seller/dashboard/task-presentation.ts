import {
  MessagesSquare,
  Package,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import type { DashboardTaskType } from "@/lib/seller/dashboard-tasks";

/**
 * One canonical presentation map for the three backend task types.
 *
 * Previously each dashboard row component carried its own copy of the
 * labels, icons and — critically — its own colour "rail" keyed to the
 * task TYPE. That violated the pilot's colour semantics: colour must
 * describe STATE, not content type. Type is now communicated by ICON +
 * LABEL only, and the single colour signal on the dashboard is oxide
 * seller attention.
 *
 * `sellerReview` is not a new fabricated field. It restates a fixed,
 * documented property of the backend read model
 * (`get_seller_dashboard_tasks`): the `return_review` and
 * `order_review` branches exist precisely because the underlying
 * record is in a seller-review state, and the SQL maps exactly those
 * two to `priority = "high"`. `unanswered_question` is a normal-
 * priority queue item, not an intervention request, so it never
 * carries the attention flag.
 */
export type DashboardTaskPresentation = {
  /** Type label — sentence case, shown next to the type icon. */
  label: string;
  icon: LucideIcon;
  /** Destination verb for the row's single clear action. */
  cta: string;
  /**
   * True when the backend type genuinely means "the seller must
   * review / intervene". Only these rows may show oxide.
   */
  sellerReview: boolean;
  /** Short oxide flag text; null when the type is not a review type. */
  attentionLabel: string | null;
};

export const DASHBOARD_TASK_PRESENTATION: Record<
  DashboardTaskType,
  DashboardTaskPresentation
> = {
  return_review: {
    label: "İade incelemesi",
    icon: Undo2,
    cta: "İade listesine git",
    sellerReview: true,
    attentionLabel: "İncelemeniz gerekiyor",
  },
  order_review: {
    label: "Sipariş incelemesi",
    icon: Package,
    cta: "Sipariş listesine git",
    sellerReview: true,
    attentionLabel: "İncelemeniz gerekiyor",
  },
  unanswered_question: {
    label: "Yanıt bekleyen soru",
    icon: MessagesSquare,
    cta: "Sorulara git",
    sellerReview: false,
    attentionLabel: null,
  },
};
