/**
 * Presentation helpers for seller assistant settings.
 *
 * Pure, environment-neutral, zero-runtime-import so Node's built-in
 * test runner can verify copy, null labels, and mutation classification.
 */

/* ------------------------------------------------------------------ */
/* Shared copy                                                         */
/* ------------------------------------------------------------------ */

export const SETTINGS_BACK_LABEL = "← Asistan Ayarları";
export const SETTINGS_BACK_HREF = "/seller/assistant-settings";

export const SETTINGS_SAVE_LABEL = "Kaydet";
export const SETTINGS_SAVE_CHANGES_LABEL = "Değişiklikleri kaydet";
export const SETTINGS_SAVING_LABEL = "Kaydediliyor…";
export const SETTINGS_SAVED_LABEL = "Kaydedildi";
export const SETTINGS_RETRY_LABEL = "Tekrar dene";

export const SETTINGS_UNSPECIFIED_LABEL = "Henüz belirtilmedi";
export const SETTINGS_CLEARABLE_UNSPECIFIED_LABEL = "Belirtilmedi";

export const SETTINGS_YES_LABEL = "Evet";
export const SETTINGS_NO_LABEL = "Hayır";

export const SETTINGS_CONFLICT_MESSAGE =
  "Ayarlar başka bir işlemde değişmiş. Güncel bilgileri kontrol edip tekrar deneyin.";

export const SETTINGS_UNAVAILABLE_TITLE = "Ayarlar şu anda yüklenemedi.";
export const SETTINGS_UNAVAILABLE_DESCRIPTION =
  "Bağlantı kurulamadı. Kayıtlı bilgiler kaybolmadı; lütfen tekrar deneyin.";

export const SETTINGS_AUTH_TITLE = "Oturum doğrulanamadı.";
export const SETTINGS_AUTH_DESCRIPTION =
  "Ayarlar açılamadı. Sayfayı yenileyip tekrar deneyin.";

export const SETTINGS_RETRYABLE_MESSAGE =
  "İşlem şu anda tamamlanamadı. Girdiğiniz bilgiler korundu; lütfen tekrar deneyin.";

export const SETTINGS_SESSION_MESSAGE =
  "Oturum bilgisi şu anda alınamadı. Lütfen tekrar deneyin.";

export const SETTINGS_VALIDATION_FALLBACK =
  "Girdiğiniz bilgiler kaydedilemedi. Lütfen alanları kontrol edin.";

/* ------------------------------------------------------------------ */
/* Asistanın Bildikleri                                                */
/* ------------------------------------------------------------------ */

export const KNOWLEDGE_PAGE_CAPTION = "Asistan Ayarları";
export const KNOWLEDGE_PAGE_TITLE = "Asistanın Bildikleri";
export const KNOWLEDGE_PAGE_DESCRIPTION =
  "Asistanın müşterilere ürün, kullanım, kargo ve iade hakkında verebileceği doğru bilgileri yönetin.";

export const KNOWLEDGE_PRODUCT_TITLE = "Ürün Bilgileri";
export const KNOWLEDGE_PRODUCT_DESCRIPTION =
  "Asistanın ürününüz hakkında söyleyebileceği ortak bilgileri yönetin.";
export const KNOWLEDGE_PRODUCT_SHARED_NOTE =
  "Bu bilgiler şu anda tüm ürünler için ortak kullanılır.";

export const KNOWLEDGE_MATERIAL_LABEL = "Malzeme";
export const KNOWLEDGE_SIZE_ML_LABEL = "Hacim";
export const KNOWLEDGE_SIZE_ML_UNIT = "ml";
export const KNOWLEDGE_PRINT_METHOD_LABEL = "Baskı yöntemi";
export const KNOWLEDGE_CUSTOM_TEXT_MAX_LABEL =
  "Özel yazı için maksimum karakter";

export const KNOWLEDGE_USAGE_TITLE = "Kullanım";
export const KNOWLEDGE_USAGE_DESCRIPTION =
  "Asistanın kullanım hakkında verebileceği bilgileri yönetin. Bilinmeyen bir değer için Belirtilmedi seçin.";

export const KNOWLEDGE_MICROWAVE_LABEL = "Mikrodalgaya uygun";
export const KNOWLEDGE_DISHWASHER_LABEL = "Bulaşık makinesine uygun";
export const KNOWLEDGE_HAND_WASH_LABEL = "Elde yıkama öneriliyor";
export const KNOWLEDGE_FOOD_SAFE_LABEL = "Gıda ile temasa uygun";

export const KNOWLEDGE_SHIPPING_TITLE = "Kargo";
export const KNOWLEDGE_SHIPPING_DESCRIPTION =
  "Hazırlık süresi ve gönderim bilgilerini yönetin.";

export const KNOWLEDGE_PROCESSING_MIN_LABEL = "Minimum hazırlık süresi";
export const KNOWLEDGE_PROCESSING_MAX_LABEL = "Maksimum hazırlık süresi";
export const KNOWLEDGE_PROCESSING_UNIT = "gün";
export const KNOWLEDGE_SAME_DAY_LABEL = "Aynı gün gönderim";
export const KNOWLEDGE_COMPANY_LABEL = "Kargo firması";
export const KNOWLEDGE_INTERNATIONAL_LABEL = "Yurt dışı gönderim";

export const KNOWLEDGE_RETURNS_TITLE = "İade Politikası";
export const KNOWLEDGE_RETURNS_DESCRIPTION =
  "Asistanın iade ve değişim hakkında söyleyebileceği bilgileri yönetin.";

export const KNOWLEDGE_ACCEPTS_RETURNS_LABEL = "İade kabul ediliyor";
export const KNOWLEDGE_RETURN_PERIOD_LABEL = "İade süresi";
export const KNOWLEDGE_RETURN_PERIOD_UNIT = "gün";
export const KNOWLEDGE_DAMAGE_REPLACEMENT_LABEL = "Hasarlı ürün değişimi";
export const KNOWLEDGE_WRONG_PRINT_REPLACEMENT_LABEL = "Yanlış baskı değişimi";

export const KNOWLEDGE_RETURNS_DISABLED_NOTE =
  "İade kabul edilmediği için iade süresi artık uygulanmaz.";

export const KNOWLEDGE_ORDER_COLLECTION_LINK_LABEL =
  "Sipariş Toplama bölümüne git";
export const KNOWLEDGE_ORDER_COLLECTION_HREF = "/seller/order-collection";

/* ------------------------------------------------------------------ */
/* Sipariş Toplama                                                     */
/* ------------------------------------------------------------------ */

export const ORDER_COLLECTION_PAGE_CAPTION = "Asistan Ayarları";
export const ORDER_COLLECTION_PAGE_TITLE = "Sipariş Toplama";
export const ORDER_COLLECTION_PAGE_DESCRIPTION =
  "Asistanın yeni siparişlerde müşteriden hangi temel bilgileri istemesi gerektiğini yönetin.";

export const ORDER_COLLECTION_QUANTITY_TITLE = "Sipariş adedi";
export const ORDER_COLLECTION_QUANTITY_DESCRIPTION =
  "Asistanın sipariş sırasında kullanacağı adet sınırlarını ve temel istekleri yönetin.";

export const ORDER_MIN_QUANTITY_LABEL = "Minimum sipariş adedi";
export const ORDER_MAX_QUANTITY_LABEL = "Maksimum sipariş adedi";

export const ORDER_IMAGE_REQUIRED_LABEL = "Siparişte görsel iste";
export const ORDER_IMAGE_REQUIRED_HELP =
  "Açık olduğunda asistan siparişi tamamlarken müşteriden görsel ister.";

export const ORDER_CUSTOM_TEXT_REQUIRED_LABEL = "Özel yazı iste";
export const ORDER_CUSTOM_TEXT_REQUIRED_HELP =
  "Açık olduğunda asistan siparişi tamamlarken müşteriden özel yazı ister.";

export const ORDER_KNOWLEDGE_LINK_LABEL = "Asistanın Bildikleri bölümüne git";
export const ORDER_KNOWLEDGE_HREF = "/seller/assistant-knowledge";

export const ORDER_PRODUCT_FIELDS_TITLE = "Ürüne özel bilgiler";
export const ORDER_PRODUCT_FIELDS_DESCRIPTION =
  "Renk, isim, görsel veya başka kişiselleştirme bilgilerini ürün bazında Ürünler bölümünden yönetebilirsiniz.";
export const ORDER_PRODUCTS_LINK_LABEL = "Ürünlere git";
export const ORDER_PRODUCTS_HREF = "/seller/products";

/* ------------------------------------------------------------------ */
/* Hub entries                                                         */
/* ------------------------------------------------------------------ */

export const HUB_KNOWLEDGE_DESCRIPTION =
  "Asistanın müşterilere ürün, kullanım, kargo ve iade hakkında verebileceği doğru bilgileri yönetin.";

export const HUB_ORDER_COLLECTION_DESCRIPTION =
  "Asistanın yeni siparişlerde müşteriden hangi temel bilgileri istemesi gerektiğini yönetin.";

export const HUB_PRODUCTS_DESCRIPTION =
  "Satışını yaptığınız ürünleri ve ürün bazlı toplanacak bilgileri yönetin.";

export const HUB_RULES_DESCRIPTION =
  "Müşteri mesajlarında belirli ifadeler için kullanılacak satıcı tanımlı cevapları yönetin.";

export const assistantHubDescription = (label: string): string => {
  if (label === "Asistanın Bildikleri") return HUB_KNOWLEDGE_DESCRIPTION;
  if (label === "Sipariş Toplama") return HUB_ORDER_COLLECTION_DESCRIPTION;
  if (label === "Ürünler") return HUB_PRODUCTS_DESCRIPTION;
  if (label === "Kurallar") return HUB_RULES_DESCRIPTION;
  return "";
};

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export const formatUnspecifiedValue = (value: string | number | null): string => {
  if (value === null) return SETTINGS_UNSPECIFIED_LABEL;
  return String(value);
};

export const formatTriStateLabel = (value: boolean | null): string => {
  if (value === true) return SETTINGS_YES_LABEL;
  if (value === false) return SETTINGS_NO_LABEL;
  return SETTINGS_CLEARABLE_UNSPECIFIED_LABEL;
};

export const formatBinaryChoiceLabel = (value: boolean | null): string => {
  if (value === true) return SETTINGS_YES_LABEL;
  if (value === false) return SETTINGS_NO_LABEL;
  return SETTINGS_UNSPECIFIED_LABEL;
};

export type TriStateValue = boolean | null;

export const triStateFromChoice = (
  choice: "yes" | "no" | "unspecified",
): TriStateValue => {
  if (choice === "yes") return true;
  if (choice === "no") return false;
  return null;
};

export const choiceFromTriState = (
  value: TriStateValue,
): "yes" | "no" | "unspecified" => {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unspecified";
};

/* ------------------------------------------------------------------ */
/* Input parsing                                                       */
/* ------------------------------------------------------------------ */

export type ParsedIntegerInput =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "value"; value: number };

export const parseIntegerInput = (raw: string): ParsedIntegerInput => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { status: "empty" };
  if (!/^-?\d+$/.test(trimmed)) return { status: "invalid" };
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value)) return { status: "invalid" };
  return { status: "value", value };
};

export const integerInputFromValue = (value: number | null): string =>
  value === null ? "" : String(value);

export const textInputFromValue = (value: string | null): string =>
  value ?? "";

export const parseRequiredTextInput = (
  raw: string,
): { status: "empty" } | { status: "value"; value: string } => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { status: "empty" };
  return { status: "value", value: trimmed };
};

/* ------------------------------------------------------------------ */
/* Mutation classification                                             */
/* ------------------------------------------------------------------ */

export const classifySettingsMutationFailure = (
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

export const readNestedErrorMessage = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  const detail = record.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (typeof detail === "object" && detail !== null) {
    const nested = (detail as Record<string, unknown>).message;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return null;
};

export const isSettingsConflict = (body: unknown): boolean =>
  readNestedErrorCode(body) === "seller_settings_conflict";

export const SETTINGS_FORBIDDEN_COPY = [
  "knowledge base",
  "eğitim",
  "öğrenir",
  "güven skoru",
  "hazırlık yüzdesi",
] as const;

/* ------------------------------------------------------------------ */
/* General Settings / Business                                         */
/* ------------------------------------------------------------------ */

export const GENERAL_SETTINGS_CAPTION = "Sistem";
export const GENERAL_SETTINGS_TITLE = "Ayarlar";
export const GENERAL_SETTINGS_DESCRIPTION =
  "İşletme bilgilerinizi ve bu cihazdaki oturumunuzu yönetin.";

export const BUSINESS_SECTION_TITLE = "İşletme Bilgileri";
export const BUSINESS_SECTION_DESCRIPTION =
  "Asistanın ve sistemin işletmeniz için kullandığı temel iletişim bilgileri.";

export const BUSINESS_NAME_LABEL = "Yetkili / işletme adı";
export const BUSINESS_STORE_NAME_LABEL = "Mağaza adı";
export const BUSINESS_PHONE_LABEL = "Telefon";
export const BUSINESS_STORE_LINK_LABEL = "Mağaza bağlantısı";

export const BUSINESS_CLEAR_LABEL = "Belirtilmedi";
export const BUSINESS_PHONE_CLEAR_HELP =
  "Boş bırakırsanız telefon belirtilmedi olarak kaydedilir.";
export const BUSINESS_STORE_LINK_CLEAR_HELP =
  "Boş bırakırsanız mağaza bağlantısı belirtilmedi olarak kaydedilir.";

export const SESSION_SECTION_TITLE = "Oturum";
export const SESSION_SECTION_DESCRIPTION =
  "Bu cihazdaki oturumunuzu güvenli şekilde kapatabilirsiniz.";
