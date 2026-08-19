/**
 * Public seller application — frontend mirror of the backend
 * `POST /applications` contract.
 *
 * The backend (`backend/seller_application_service.py`,
 * `PublicSellerApplication`) is authoritative: it normalizes the phone
 * to E.164, applies its own length rules and rejects duplicates
 * silently. This module only mirrors the documented field shapes for
 * calm, immediate client-side feedback and builds the request body
 * with the exact snake_case field names the backend expects.
 *
 * Field contract (mirrored, never re-invented):
 *   full_name         required  2..120
 *   store_name        required  2..120
 *   phone             required  7..32   (backend normalizes to +90…)
 *   email             optional  ≤254
 *   product_category  optional  ≤160
 *   notes             optional  ≤800
 *   store_link        optional  ≤2048  (http/https only)
 */

export const SELLER_APPLICATION_LIMITS = {
  fullNameMin: 2,
  fullNameMax: 120,
  storeNameMin: 2,
  storeNameMax: 120,
  phoneMinDigits: 7,
  phoneMaxDigits: 15,
  emailMax: 254,
  categoryMax: 160,
  notesMax: 800,
  storeLinkMax: 2048,
} as const;

export type SellerApplicationInput = {
  fullName: string;
  storeName: string;
  phone: string;
  email?: string;
  productCategory?: string;
  storeLink?: string;
  notes?: string;
};

export type SellerApplicationFieldErrors = Partial<
  Record<keyof SellerApplicationInput, string>
>;

/** Backend snake_case request body. Optional fields are omitted when empty. */
export type SellerApplicationPayload = {
  full_name: string;
  store_name: string;
  phone: string;
  email?: string;
  product_category?: string;
  notes?: string;
  store_link?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const trimToNull = (value: string | undefined): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Phone normalization mirrors the backend's documented behavior: strip
 * non-digits, fold the common Turkish 05xx / 5xx entries into +90, and
 * keep any other already-international entry as-is. The backend applies
 * the same rule, so this only exists to give the seller a preview of
 * the number that will actually be stored.
 */
export const normalizeApplicationPhone = (raw: string): string => {
  const digits = raw.replace(/\D+/g, "");
  let normalized = digits;
  if (digits.length === 11 && digits.startsWith("0")) {
    normalized = `90${digits.slice(1)}`;
  } else if (digits.length === 10) {
    normalized = `90${digits}`;
  }
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
};

export const validateSellerApplication = (
  input: SellerApplicationInput,
): { errors: SellerApplicationFieldErrors; normalized: SellerApplicationInput } => {
  const errors: SellerApplicationFieldErrors = {};
  const normalized: SellerApplicationInput = {
    fullName: input.fullName.trim(),
    storeName: input.storeName.trim(),
    phone: normalizeApplicationPhone(input.phone),
    email: trimToNull(input.email) ?? undefined,
    productCategory: trimToNull(input.productCategory) ?? undefined,
    storeLink: trimToNull(input.storeLink) ?? undefined,
    notes: trimToNull(input.notes) ?? undefined,
  };

  if (normalized.fullName.length < SELLER_APPLICATION_LIMITS.fullNameMin) {
    errors.fullName = "Ad soyad zorunludur.";
  } else if (normalized.fullName.length > SELLER_APPLICATION_LIMITS.fullNameMax) {
    errors.fullName = `Ad soyad en fazla ${SELLER_APPLICATION_LIMITS.fullNameMax} karakter olabilir.`;
  }

  if (normalized.storeName.length < SELLER_APPLICATION_LIMITS.storeNameMin) {
    errors.storeName = "Mağaza adı zorunludur.";
  } else if (normalized.storeName.length > SELLER_APPLICATION_LIMITS.storeNameMax) {
    errors.storeName = `Mağaza adı en fazla ${SELLER_APPLICATION_LIMITS.storeNameMax} karakter olabilir.`;
  }

  const phoneDigits = normalized.phone.replace(/\D+/g, "");
  if (
    phoneDigits.length < SELLER_APPLICATION_LIMITS.phoneMinDigits ||
    phoneDigits.length > SELLER_APPLICATION_LIMITS.phoneMaxDigits
  ) {
    errors.phone = "Geçerli bir telefon numarası girilmelidir.";
  }

  if (normalized.email !== undefined) {
    if (normalized.email.length > SELLER_APPLICATION_LIMITS.emailMax) {
      errors.email = `E-posta en fazla ${SELLER_APPLICATION_LIMITS.emailMax} karakter olabilir.`;
    } else if (!EMAIL_RE.test(normalized.email)) {
      errors.email = "Geçerli bir e-posta adresi girin.";
    }
  }

  if (
    normalized.productCategory !== undefined &&
    normalized.productCategory.length > SELLER_APPLICATION_LIMITS.categoryMax
  ) {
    errors.productCategory = `Ürün kategorisi en fazla ${SELLER_APPLICATION_LIMITS.categoryMax} karakter olabilir.`;
  }

  if (
    normalized.storeLink !== undefined &&
    normalized.storeLink.length > SELLER_APPLICATION_LIMITS.storeLinkMax
  ) {
    errors.storeLink = `Mağaza bağlantısı en fazla ${SELLER_APPLICATION_LIMITS.storeLinkMax} karakter olabilir.`;
  } else if (normalized.storeLink !== undefined) {
    try {
      const parsed = new URL(normalized.storeLink);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.storeLink = "Geçerli bir http veya https bağlantısı girilmelidir.";
      }
    } catch {
      errors.storeLink = "Geçerli bir http veya https bağlantısı girilmelidir.";
    }
  }

  if (
    normalized.notes !== undefined &&
    normalized.notes.length > SELLER_APPLICATION_LIMITS.notesMax
  ) {
    errors.notes = `Not en fazla ${SELLER_APPLICATION_LIMITS.notesMax} karakter olabilir.`;
  }

  return { errors, normalized };
};

/** Build the snake_case request body, omitting empty optional fields. */
export const buildSellerApplicationPayload = (
  input: SellerApplicationInput,
): SellerApplicationPayload => {
  const payload: SellerApplicationPayload = {
    full_name: input.fullName,
    store_name: input.storeName,
    phone: input.phone,
  };
  if (input.email) payload.email = input.email;
  if (input.productCategory) payload.product_category = input.productCategory;
  if (input.notes) payload.notes = input.notes;
  if (input.storeLink) payload.store_link = input.storeLink;
  return payload;
};

export type SellerApplicationResult = {
  received: boolean;
  message: string;
};

/**
 * Parse the backend success shape `{ received: true, message: "…" }`.
 * Anything malformed is treated as a contract error so a broken backend
 * response is never shown to the seller as a real confirmation.
 */
export const parseSellerApplicationResponse = (
  raw: unknown,
): SellerApplicationResult => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("seller_application_invalid_response");
  }
  const record = raw as Record<string, unknown>;
  if (record.received !== true) {
    throw new Error("seller_application_invalid_response");
  }
  if (typeof record.message !== "string" || record.message.length === 0) {
    throw new Error("seller_application_invalid_response");
  }
  return { received: true, message: record.message };
};


