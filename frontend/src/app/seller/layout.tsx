import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { SellerShell } from "@/components/seller/shell/seller-shell";

import {
  applySellerGuard,
  resolveServerAccess,
} from "@/lib/auth/server-access";

/**
 * Seller panel layout (async Server Component).
 *
 * Every request to /seller/* passes through this layout first. The
 * server-side `resolveServerAccess` is the single source of truth for
 * "is this user an active seller with a valid sellerId?". The matrix
 * it enforces:
 *
 *   unauthenticated      -> redirect to /giris
 *   authorized seller     -> render <SellerShell> with the children
 *   authorized admin      -> redirect to /admin
 *   application_rejected  -> redirect to /giris
 *   unavailable           -> render the neutral AccessUnavailable UI
 *
 * The resolver never signs the user out and never reads role from
 * Supabase metadata. Role / status come exclusively from the backend
 * `GET /auth/me` response.
 */
export default async function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await resolveServerAccess();
  const guard = applySellerGuard(access);

  if (guard.kind === "show_unavailable") {
    return <AccessUnavailable contextLabel="Satıcı paneli" />;
  }

  return <SellerShell>{children}</SellerShell>;
}
