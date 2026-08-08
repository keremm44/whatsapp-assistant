/**
 * Auth foundation — server-only session inspection.
 *
 * This module only exposes a *read* of the current Supabase session. It does
 * not implement login, logout, signup, or invite completion flows; those
 * will be added in the auth step once the public marketing form and the
 * seller panel are wired to the backend's /auth/* and /seller/me endpoints.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppSession = {
  authUserId: string;
  email: string | null;
} | null;

export const getServerSession = async (): Promise<AppSession> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    authUserId: user.id,
    email: user.email ?? null,
  };
};
