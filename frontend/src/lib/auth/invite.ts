/**
 * Backend invite completion helper.
 *
 * Calls `POST /auth/complete-invite` with the Supabase access token
 * carried in `Authorization: Bearer <token>`. No request body.
 *
 * The backend derives the invited seller identity exclusively from the
 * verified Supabase access token. The frontend never sends seller_id,
 * profile_id, role, application_id, or any other identity field.
 *
 * This helper is intentionally a thin wrapper over the existing
 * `apiFetchWithAccessToken`; it does not introduce a parallel
 * fetch/session/auth layer.
 */

import { apiFetchWithAccessToken } from "@/lib/api/authenticated";

export const completeInvite = async (
  accessToken: string,
  options?: { signal?: AbortSignal },
): Promise<unknown> => {
  return apiFetchWithAccessToken<unknown>(
    "/auth/complete-invite",
    accessToken,
    {
      method: "POST",
      signal: options?.signal,
    },
  );
};
