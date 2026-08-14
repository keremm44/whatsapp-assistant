import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { SellerShell } from "@/components/seller/shell/seller-shell";

import {
  applySellerGuard,
  resolveServerAccess,
} from "@/lib/auth/server-access";
import { getAssistantStatusNotice } from "@/lib/seller/assistant-status";
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
 * identity (store name, etc.). The seller shell is rendered ONLY
 * when the bootstrap is `ready`:
 *
 *   ready              -> render <SellerShell> with the real store
 *                        name (or the approved "Mağaza" display
 *                        fallback when the real store name is null
 *                        or empty in the backend payload)
 *   unavailable        -> render <AccessUnavailable> with the
 *                        "Mağaza profili" context label. This
 *                        covers network failure, 5xx, malformed
 *                        contract, missing session token after the
 *                        auth guard, and any other transient
 *                        /seller/me failure.
 *   auth_rejected      -> same as `unavailable` (the auth foundation
 *                        has already validated the session for
 *                        /auth/me; a 401 on /seller/me is treated
 *                        as recoverable, not destructive)
 *
 * Crucially, a non-ready bootstrap does NOT render the seller shell
 * with a fake "Mağaza" label. Rendering the normal seller
 * experience when the business row is unknown would be a falsely
 * healthy shell. Instead the user sees a calm retry surface
 * consistent with the existing AccessUnavailable language.
 *
 * A transient bootstrap failure never destroys a valid Supabase
 * session: this module does not import the Supabase signOut API and
 * the auth foundation's `/auth/me` has already resolved the session
 * as `authorized`. The retry button re-runs the server layout,
 * which re-runs both the auth guard and the bootstrap resolver.
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
  // a token exists by the time we get here. We never render the
  // seller shell unless the bootstrap is `ready`. A non-ready
  // bootstrap surfaces the AccessUnavailable retry UI — same
  // language, same retry mechanics, no signOut, no redirect.
  const bootstrap = await resolveSellerBootstrapFromSession();
  if (bootstrap.state !== "ready") {
    return <AccessUnavailable contextLabel="Mağaza profili" />;
  }

  const storeName = pickSellerDisplayName(bootstrap);

  // Global assistant status: computed from the SAME /seller/me access
  // block the bootstrap just resolved (no duplicate fetch, no duplicate
  // model). Null in the normal operational state — the shell then
  // renders no status chrome at all.
  const assistantNotice = getAssistantStatusNotice(
    bootstrap.identity.access,
  );

  return (
    <SellerShell storeName={storeName} assistantNotice={assistantNotice}>
      {children}
    </SellerShell>
  );
}
