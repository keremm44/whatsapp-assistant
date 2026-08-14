/**
 * Presentation helpers for Seller Products + product-specific fields.
 *
 * Pure, environment-neutral, zero-runtime-import so Node's built-in
 * test runner can verify copy, selection, and href rules.
 */

import type {
  Product,
  ProductFieldType,
} from "./products.ts";

/* ------------------------------------------------------------------ */
/* Page copy (locked)                                                  */
/* ------------------------------------------------------------------ */

export const PRODUCTS_PAGE_CAPTION = "Asistan Ayarları";
export const PRODUCTS_PAGE_TITLE = "Ürünler";
export const PRODUCTS_PAGE_DESCRIPTION =
  "Satışını yaptığınız ürünleri ve her ürün için asistana toplatmak istediğiniz bilgileri yönetin.";

export const PRODUCTS_BACK_LABEL = "← Asistan Ayarları";
export const PRODUCTS_BACK_HREF = "/seller/assistant-settings";

export const PRODUCTS_CREATE_LABEL = "Ürün ekle";
export const PRODUCTS_RENAME_LABEL = "Adını düzenle";
export const PRODUCTS_DEACTIVATE_LABEL = "Devre dışı bırak";
export const PRODUCTS_REACTIVATE_LABEL = "Yeniden etkinleştir";

export const PRODUCTS_EMPTY_TITLE = "Henüz ürün eklenmemiş";
export const PRODUCTS_EMPTY_DESCRIPTION =
  "Satışını yaptığınız ilk ürünü ekleyerek asistanın sipariş sırasında hangi ürün için bilgi topladığını belirleyebilirsiniz.";

export const PRODUCTS_UNAVAILABLE_TITLE = "Ürünler şu anda yüklenemedi.";
export const PRODUCTS_UNAVAILABLE_DESCRIPTION =
  "Bağlantı kurulamadı. Liste boş değil; lütfen tekrar deneyin.";

export const PRODUCT_DEACTIVATE_EXPLANATION =
  "Bu ürün yeni siparişlerde seçilmeyecek. Geçmiş siparişler ve kayıtlı alanlar korunur.";

export const PRODUCT_REACTIVATE_EXPLANATION =
  "Bu ürün yeniden etkinleştirildiğinde yeni siparişlerde tekrar seçilebilir.";

export const PRODUCT_CONFLICT_MESSAGE =
  "Bu ürün başka bir işlemde değişmiş. Güncel halini kontrol edip tekrar deneyin.";

export const PRODUCT_DUPLICATE_MESSAGE = "Bu isimde bir ürün zaten bulunuyor.";

export const FIELD_CREATE_LABEL = "Bilgi alanı ekle";
export const FIELD_EMPTY_TITLE = "Bu ürün için ek bilgi alanı yok";
export const FIELD_EMPTY_DESCRIPTION =
  "Asistanın bu ürün için sipariş sırasında ayrıca toplamasını istediğiniz bir bilgi varsa alan ekleyebilirsiniz.";

export const FIELD_REQUIRED_HELP =
  "Asistan siparişi tamamlarken bu bilgiyi ister.";
export const FIELD_OPTIONAL_HELP =
  "Opsiyonel alanlar mevcut akışta asistanca kendiliğinden sorulmaz.";

export const FIELD_IMMUTABLE_NOTE =
  "Alan türü ve seçenekler oluşturulduktan sonra değiştirilemez. Değiştirmek için bu alanı devre dışı bırakıp yeni bir alan oluşturun.";

export const FIELD_DEACTIVATE_EXPLANATION =
  "Yeni siparişler bu alanı artık kopyalamaz. Geçmiş siparişlerdeki kayıtlar değişmez.";

export const FIELD_DUPLICATE_MESSAGE =
  "Bu ürün için aynı isimde etkin bir bilgi alanı zaten var.";

export const FIELD_CONFLICT_MESSAGE =
  "Bu alan başka bir işlemde değişmiş. Güncel halini kontrol edip tekrar deneyin.";

export const FIELD_UNAVAILABLE_TITLE = "Bilgi alanları şu anda yüklenemedi.";
export const FIELD_UNAVAILABLE_DESCRIPTION =
  "Ürün listesi duruyor; alanlar için tekrar deneyebilirsiniz.";

export const PRODUCT_NAME_LABEL = "Ürün adı";
export const FIELD_LABEL_LABEL = "Alan adı / müşteriden istenecek bilgi";
export const FIELD_TYPE_LABEL = "Bilgi türü";
export const FIELD_REQUIRED_LABEL = "Zorunlu mu?";
export const FIELD_OPTIONS_LABEL = "Seçenekler";

/* ------------------------------------------------------------------ */
/* Field type presentation                                             */
/* ------------------------------------------------------------------ */

export const PRODUCT_FIELD_TYPE_LABELS: Record<ProductFieldType, string> = {
  short_text: "Kısa metin",
  long_text: "Uzun metin",
  number: "Sayı",
  single_choice: "Tek seçim",
  multi_choice: "Birden fazla seçim",
  boolean: "Evet / Hayır",
  image: "Görsel",
};

export const getFieldTypeLabel = (fieldType: ProductFieldType): string =>
  PRODUCT_FIELD_TYPE_LABELS[fieldType];

export const getFieldRequiredLabel = (isRequired: boolean): string =>
  isRequired ? "Zorunlu" : "Opsiyonel";

export const getProductStatusLabel = (isActive: boolean): string =>
  isActive ? "Aktif" : "Devre dışı";

export const getFieldStatusLabel = (isActive: boolean): string =>
  isActive ? "Aktif" : "Devre dışı";

/* ------------------------------------------------------------------ */
/* Selection / URL                                                     */
/* ------------------------------------------------------------------ */

export const normalizeProductIdParam = (
  value: string | string[] | undefined,
): number | null => {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string") return null;
  const trimmed = single.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/**
 * Selected product must exist in the authoritative list. An arbitrary
 * query id that is not in the list is ignored. Empty list → null.
 */
export const resolveSelectedProduct = (
  products: readonly Product[],
  requestedId: number | null,
): Product | null => {
  if (products.length === 0) return null;
  if (requestedId !== null) {
    const found = products.find((product) => product.id === requestedId);
    if (found) return found;
  }
  const firstActive = products.find((product) => product.isActive);
  return firstActive ?? products[0] ?? null;
};

export const productsWorkspaceHref = (productId?: number | null): string => {
  if (
    typeof productId === "number" &&
    Number.isInteger(productId) &&
    productId > 0
  ) {
    return `/seller/products?product=${productId}`;
  }
  return "/seller/products";
};

/* ------------------------------------------------------------------ */
/* Mutation error classification                                       */
/* ------------------------------------------------------------------ */

export const classifyProductsMutationFailure = (
  status: number | null,
): "conflict" | "validation" | "not_found" | "auth" | "retryable" => {
  if (status === 401) return "auth";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  return "retryable";
};

export const readNestedErrorCode = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.code === "string" && record.code) return record.code;
  const detail = record.detail;
  if (typeof detail === "object" && detail !== null) {
    const nested = (detail as Record<string, unknown>).code;
    if (typeof nested === "string" && nested) return nested;
  }
  return null;
};

export const isProductDuplicateConflict = (body: unknown): boolean =>
  readNestedErrorCode(body) === "seller_product_duplicate_name";

/* Hard-delete wording that must never appear in Products V1 copy. */
export const PRODUCTS_FORBIDDEN_DELETE_WORDS = ["Sil", "silindi", "Delete"];

/* ------------------------------------------------------------------ */
/* Field ordering (quiet utility copy)                                 */
/* ------------------------------------------------------------------ */

/** Accessible names for the icon-only ordering controls. */
export const fieldMoveUpLabel = (label: string): string =>
  `${label} alanını yukarı taşı`;
export const fieldMoveDownLabel = (label: string): string =>
  `${label} alanını aşağı taşı`;

/**
 * Calm inline feedback near the field list. Raw HTTP codes,
 * sort_order and expected_version never surface to the seller.
 */
export const FIELD_REORDER_ERROR_MESSAGE =
  "Alan sırası güncellenemedi. Güncel sıra yeniden getirildi.";
export const FIELD_REORDER_CONFLICT_MESSAGE =
  "Alanlar başka bir işlemde değişmiş. Güncel sıra getirildi; tekrar deneyin.";
