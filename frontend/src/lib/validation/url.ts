export type UrlValidationResult =
  | { success: true; value: string | undefined }
  | { success: false; error: string };

const urlError = "Geçerli bir mağaza bağlantısı yazın.";
const schemePattern = /^[a-z][a-z\d+.-]*:/i;

export function normalizeOptionalUrl(value: string): UrlValidationResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return { success: true, value: undefined };
  }

  const candidate = schemePattern.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname
    ) {
      return { success: false, error: urlError };
    }

    return { success: true, value: url.toString() };
  } catch {
    return { success: false, error: urlError };
  }
}
