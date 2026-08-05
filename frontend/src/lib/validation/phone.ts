export type PhoneValidationResult =
  { success: true; value: string } | { success: false; error: string };

const phoneError = "Geçerli bir WhatsApp numarası yazın.";

export function normalizePhone(value: string): PhoneValidationResult {
  const trimmed = value.trim();

  if (!trimmed || !/^\+?[\d\s()-]+$/.test(trimmed)) {
    return { success: false, error: phoneError };
  }

  const hasInternationalPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/[\s()-]/g, "").replace(/^\+/, "");

  if (!/^\d+$/.test(digits) || digits.length < 7 || digits.length > 15) {
    return { success: false, error: phoneError };
  }

  return {
    success: true,
    value: `${hasInternationalPrefix ? "+" : ""}${digits}`,
  };
}
