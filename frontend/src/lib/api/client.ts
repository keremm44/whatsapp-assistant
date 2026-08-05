export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(
  /\/$/,
  "",
);

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!apiBaseUrl) {
    throw new ApiUnavailableError("API adresi yapılandırılmamış.");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) throw new Error("İstek güvenli biçimde tamamlanamadı.");
  return response.json() as Promise<T>;
}
