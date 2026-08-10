import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { SellerShell } from "@/components/seller/shell/seller-shell";

import {
  applySellerGuard,
  resolveServerAccess,
} from "@/lib/auth/server-access";
import {
  pickSellerDisplayName,
  resolveSellerBootstrapFromSession,
} from "@/lib/seller/server-bootstrap";

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
 * After the auth guard resolves with `allow`, the layout performs a
 * second server-side fetch: `resolveSellerBootstrapFromSession()`,
 * which calls `GET /seller/me` to obtain the seller's business
 * identity (store name, etc.). This is the seller-side analogue of
 * the auth resolver and is intentionally separate so that:
 *
 *   - the auth foundation remains the only authority on role/status
 *   - a transient failure of `/seller/me` (network, 5xx, contract
 *     mismatch) does NOT destroy a valid Supabase session
 *   - the shell can still render with a generic fallback label
 *     instead of failing closed
 *
 * The bootstrap state is mapped to a single `storeName` string for
 * the topbar. On any non-ready state the layout falls back to the
 * approved generic label (`FALLBACK_SELLER_LABEL`) so the shell
 * always reads as intentional rather than a half-rendered skeleton.
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

  // The guard only returns `allow` for an active seller session, so
  // a token exists by the time we get here. If the bootstrap fetch
  // fails for any reason, the layout still renders the shell with
  // a generic label — never with a fake business name.
  const bootstrap = await resolveSellerBootstrapFromSession();
  const storeName = pickSellerDisplayName(bootstrap);

  return <SellerShell storeName={storeName}>{children}</SellerShell>;
}
