export const ADMIN_SELLER_SYSTEM_STATUSES = ["onboarding","admin_review_pending","automatic_validation","beta_active","active","suspended","cancelled"] as const;
export type AdminSellerSystemStatus = typeof ADMIN_SELLER_SYSTEM_STATUSES[number];
export type AdminSellerStatusPresentation = { label: string; tone: "muted" | "attention" | "success" | "paused" };
export const ADMIN_SELLER_STATUS_PRESENTATION: Record<AdminSellerSystemStatus, AdminSellerStatusPresentation> = {
  onboarding: { label: "Kurulumda", tone: "muted" },
  admin_review_pending: { label: "Yönetim onayı bekliyor", tone: "attention" },
  automatic_validation: { label: "Doğrulama sürüyor", tone: "muted" },
  beta_active: { label: "Beta kullanımda", tone: "success" },
  active: { label: "Aktif", tone: "success" },
  suspended: { label: "Durduruldu", tone: "paused" },
  cancelled: { label: "Kapalı", tone: "muted" },
};
