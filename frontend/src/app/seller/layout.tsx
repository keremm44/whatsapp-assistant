import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { SellerShell } from "@/components/seller/shell/seller-shell";

import {
  applySellerGuard,
  resolveServerAccess,
} from "@/lib/auth/server-access";
import { getAssistantStatusNotice } from "@/lib/seller/assistant-status";
import {
  pickSellerDisplayName,
  resolveSellerBootstrap,
} from "@/lib/seller/server-bootstrap";
import { resolveSellerEntitlements } from "@/lib/seller/server-entitlements";

/**
 * Seller panel layout (async Server Component).
 *
 * Auth, seller identity and product entitlements are resolved by the backend
 * before the shell renders. Navigation is therefore a projection of backend
 * package state rather than a client-side package guess. Transient bootstrap
 * or entitlement failures render the neutral retry surface and never destroy
 * the valid Supabase session.
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
  if (access.state !== "authorized") {
    return <AccessUnavailable contextLabel="Satıcı paneli" />;
  }

  const bootstrap = await resolveSellerBootstrap(access.accessToken);
  if (bootstrap.state !== "ready") {
    return <AccessUnavailable contextLabel="Mağaza profili" />;
  }

  const entitlementBootstrap = await resolveSellerEntitlements(
    access.accessToken,
  );
  if (entitlementBootstrap.state !== "ready") {
    return <AccessUnavailable contextLabel="Ürün paketleri" />;
  }

  const storeName = pickSellerDisplayName(bootstrap);
  const assistantNotice = getAssistantStatusNotice(
    bootstrap.identity.access,
  );

  return (
    <SellerShell
      storeName={storeName}
      activeProducts={entitlementBootstrap.entitlements.products}
      assistantNotice={assistantNotice}
    >
      {children}
    </SellerShell>
  );
}
