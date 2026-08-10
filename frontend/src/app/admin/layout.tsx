import { AccessUnavailable } from "@/components/auth/access-unavailable";

import {
  applyAdminGuard,
  resolveServerAccess,
} from "@/lib/auth/server-access";

/**
 * Admin surface layout (async Server Component).
 *
 * Every request to /admin/* passes through this layout first. The
 * server-side `resolveServerAccess` is the single source of truth for
 * "is this user an active admin?". The matrix it enforces:
 *
 *   unauthenticated      -> redirect to /giris
 *   authorized admin      -> render the protected admin content
 *   authorized seller     -> redirect to /seller
 *   application_rejected  -> redirect to /giris
 *   unavailable           -> render the neutral AccessUnavailable UI
 *
 * The resolver never signs the user out and never reads role from
 * Supabase metadata.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await resolveServerAccess();
  const guard = applyAdminGuard(access);

  if (guard.kind === "show_unavailable") {
    return <AccessUnavailable contextLabel="Yönetim paneli" />;
  }

  return <div className="min-h-screen bg-background">{children}</div>;
}
