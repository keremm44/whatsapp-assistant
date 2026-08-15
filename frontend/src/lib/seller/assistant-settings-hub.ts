/**
 * Assistant Settings hub — presentation summaries.
 *
 * Counts and completeness come from real backend payloads.
 * There is no readiness score, completion percentage, or AI health.
 *
 * Dependency-free so Node's built-in test runner can verify it.
 */

import type { SellerSettings } from "./assistant-settings.ts";

export const HUB_PAGE_CAPTION = "Asistan";
export const HUB_PAGE_TITLE = "Asistan Ayarları";
export const HUB_PAGE_DESCRIPTION =
  "Asistanın müşterilere yardımcı olurken kullanabileceği bilgileri yönetin.";

export const HUB_UNAVAILABLE_SUMMARY = "Bilgi şu anda alınamıyor";

export const HUB_PRODUCTS_TITLE = "Ürünler";
export const HUB_PRODUCTS_HREF = "/seller/products";
export const HUB_PRODUCTS_DESCRIPTION =
  "Satışını yaptığınız ürünleri ve ürün bazlı toplanacak bilgileri yönetin.";

export const HUB_RULES_TITLE = "Mesaja Göre Cevaplar";
export const HUB_RULES_HREF = "/seller/rules";
export const HUB_RULES_DESCRIPTION =
  "Müşteri mesajlarında belirli ifadeler geçtiğinde kullanılacak cevapları yönetin.";

export const HUB_KNOWLEDGE_TITLE = "Asistanın Bildikleri";
export const HUB_KNOWLEDGE_HREF = "/seller/assistant-knowledge";
export const HUB_KNOWLEDGE_DESCRIPTION =
  "Asistanın müşterilere ürün, kullanım, kargo ve iade hakkında verebileceği doğru bilgileri yönetin.";

/**
 * Seller-facing label. Renamed from "Sipariş Toplama", which implied
 * the assistant takes orders; it only collects the information for an
 * order that already exists. The href and internal key are unchanged.
 */
export const HUB_ORDER_COLLECTION_TITLE = "Sipariş Bilgisi Toplama";
export const HUB_ORDER_COLLECTION_HREF = "/seller/order-collection";
export const HUB_ORDER_COLLECTION_DESCRIPTION =
  "Mevcut siparişler için müşteriden hangi temel bilgilerin toplanacağını yönetin.";

export type HubCardKey = "products" | "rules" | "knowledge" | "order";

export type HubCardDefinition = {
  key: HubCardKey;
  href: string;
  title: string;
  description: string;
  icon: "Box" | "ScrollText" | "BookOpen" | "ClipboardList";
};

export const HUB_CARDS: readonly HubCardDefinition[] = [
  {
    key: "products",
    href: HUB_PRODUCTS_HREF,
    title: HUB_PRODUCTS_TITLE,
    description: HUB_PRODUCTS_DESCRIPTION,
    icon: "Box",
  },
  {
    key: "rules",
    href: HUB_RULES_HREF,
    title: HUB_RULES_TITLE,
    description: HUB_RULES_DESCRIPTION,
    icon: "ScrollText",
  },
  {
    key: "knowledge",
    href: HUB_KNOWLEDGE_HREF,
    title: HUB_KNOWLEDGE_TITLE,
    description: HUB_KNOWLEDGE_DESCRIPTION,
    icon: "BookOpen",
  },
  {
    key: "order",
    href: HUB_ORDER_COLLECTION_HREF,
    title: HUB_ORDER_COLLECTION_TITLE,
    description: HUB_ORDER_COLLECTION_DESCRIPTION,
    icon: "ClipboardList",
  },
];

export const summarizeActiveProducts = (count: number): string => {
  if (count === 0) return "Henüz aktif ürün yok";
  if (count === 1) return "1 aktif ürün";
  return `${count} aktif ürün`;
};

export const summarizeActiveRules = (count: number): string => {
  if (count === 0) return "Henüz etkin cevap yok";
  if (count === 1) return "1 etkin cevap";
  return `${count} etkin cevap`;
};

const isSet = (value: unknown): boolean => value !== null && value !== undefined;

const hasAnyKnowledgeValue = (settings: SellerSettings): boolean => {
  const { product, usage, shipping, returnPolicy } = settings;
  return [
    product.material,
    product.sizeMl,
    product.printMethod,
    product.customTextMaxLength,
    usage.microwaveSafe,
    usage.dishwasherSafe,
    usage.handWashRecommended,
    usage.foodSafe,
    shipping.processingDaysMin,
    shipping.processingDaysMax,
    shipping.sameDayAvailable,
    shipping.company,
    shipping.international,
    returnPolicy.acceptsReturns,
    returnPolicy.returnPeriodDays,
    returnPolicy.damageReplacement,
    returnPolicy.wrongPrintReplacement,
  ].some(isSet);
};

const isShippingComplete = (settings: SellerSettings): boolean => {
  const shipping = settings.shipping;
  return (
    shipping.processingDaysMin !== null &&
    shipping.processingDaysMax !== null &&
    shipping.sameDayAvailable !== null &&
    shipping.company !== null &&
    shipping.international !== null
  );
};

const isProductCoreComplete = (settings: SellerSettings): boolean => {
  const { product, order } = settings;
  if (
    product.material === null ||
    product.sizeMl === null ||
    product.printMethod === null
  ) {
    return false;
  }
  if (order.customTextRequired === true && product.customTextMaxLength === null) {
    return false;
  }
  return true;
};

const hasUsageOrReturnUnknowns = (settings: SellerSettings): boolean => {
  const { usage, returnPolicy } = settings;
  if (
    usage.microwaveSafe === null ||
    usage.dishwasherSafe === null ||
    usage.handWashRecommended === null ||
    usage.foodSafe === null
  ) {
    return true;
  }
  if (
    returnPolicy.acceptsReturns === null ||
    returnPolicy.damageReplacement === null ||
    returnPolicy.wrongPrintReplacement === null
  ) {
    return true;
  }
  if (
    returnPolicy.acceptsReturns === true &&
    (returnPolicy.returnPeriodDays === null || returnPolicy.returnPeriodDays < 1)
  ) {
    return true;
  }
  return false;
};

/**
 * Deterministic knowledge summary. Priority is fixed and descriptive —
 * never a score or certification.
 */
export const summarizeAssistantKnowledge = (settings: SellerSettings): string => {
  if (!hasAnyKnowledgeValue(settings)) return "Henüz bilgi eklenmemiş";
  if (!isShippingComplete(settings)) return "Kargo bilgileri eksik";
  if (!isProductCoreComplete(settings)) return "Ürün bilgileri eksik";
  if (hasUsageOrReturnUnknowns(settings)) return "Bazı bilgiler henüz belirtilmedi";
  return "Temel bilgiler tanımlı";
};

/**
 * One strongest order-collection line. Image requirement is the most
 * decision-relevant when known; quantity and custom text follow.
 */
export const summarizeOrderCollection = (settings: SellerSettings): string => {
  const { order, product } = settings;
  if (
    order.minQuantity === null &&
    order.imageRequired === null &&
    order.customTextRequired === null
  ) {
    return "Sipariş toplama ayarları henüz belirtilmedi";
  }
  if (order.imageRequired === true) return "Sipariş görseli zorunlu";
  if (order.imageRequired === false) return "Sipariş görseli isteğe bağlı";
  if (order.minQuantity !== null) return `Minimum sipariş: ${order.minQuantity}`;
  if (order.customTextRequired === true && product.customTextMaxLength !== null) {
    return "Özel yazı zorunlu";
  }
  if (order.customTextRequired === true) return "Özel yazı zorunlu";
  if (order.customTextRequired === false) return "Özel yazı isteğe bağlı";
  return "Sipariş toplama ayarları henüz belirtilmedi";
};

export const HUB_FORBIDDEN_COPY = [
  "hazır",
  "%100",
  "tamamlandı",
  "AI sağlığı",
  "güven skoru",
  "katalog hazır",
  "öğrenilen",
] as const;
