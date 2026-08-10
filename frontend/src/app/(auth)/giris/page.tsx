import type { Route } from "next";
import { redirect } from "next/navigation";

import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { LoginForm } from "./_login-form";
import {
  PROTECTED_ROUTES,
  resolveServerAccess,
} from "@/lib/auth/server-access";

/**
 * Login page (async Server Component).
 *
 * Step 3A.3.2: this page now also acts as the existing-session
 * redirector. On every request we run the shared
 * `resolveServerAccess()` and route the result as follows:
 *
 *   unauthenticated
 *     -> render the existing login form normally. This is the
 *        anonymous / not-signed-in path.
 *
 *   authorized seller (active, sellerId !== null)
 *     -> redirect("/seller"). The seller layout's own guard will
 *        re-validate on the next request.
 *
 *   authorized admin (active)
 *     -> redirect("/admin").
 *
 *   application_rejected
 *     -> render the existing login form, with a calm, non-destructive
 *        notice rendered directly above it. The notice is a fixed
 *        copy string; we never pass role / status / sellerId / token
 *        data into the client form, and we never put the rejection
 *        state into a query parameter.
 *
 *   unavailable
 *     -> render the existing `AccessUnavailable` retry surface.
 *        We do NOT render the login form, do NOT redirect, and do
 *        NOT sign the user out. The retry button re-runs the
 *        server layout (and therefore this resolver).
 *
 * Any "authorized" response that does not meet the seller/admin
 * active condition (e.g. a seller with status=invited who somehow
 * got a 200 from /auth/me, or a seller with a null sellerId) is
 * treated as the default render-the-form case. The resolver never
 * invents a more specific account status; it only knows the four
 * states above. This is the same conservatism used by the seller
 * and admin layout guards.
 */
export default async function GirisPage() {
  const access = await resolveServerAccess();

  if (access.state === "authorized") {
    const { me } = access;
    if (me.role === "admin" && me.status === "active") {
      redirect(PROTECTED_ROUTES.admin as Route);
    }
    if (
      me.role === "seller" &&
      me.status === "active" &&
      me.sellerId !== null
    ) {
      redirect(PROTECTED_ROUTES.seller as Route);
    }
    // authorized but not in a role we know how to route: fall
    // through to render the form. This is intentionally not
    // treated as application_rejected — application_rejected
    // is reserved for the explicit 403/404 backend response.
  }

  if (access.state === "unavailable") {
    return (
      <AccessUnavailable compact contextLabel="Giriş sayfası" />
    );
  }

  // unauthenticated  -> form
  // application_rejected -> form + calm notice
  const showRejectionNotice = access.state === "application_rejected";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="block h-[20px] w-[2px] rounded-full bg-primary"
        />
        <p className="font-heading text-[15px] font-semibold text-primary">
          WhatsApp Asistan
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-medium leading-tight text-foreground">
          Hesabınıza giriş yapın
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          WhatsApp Asistan paneline devam etmek için bilgilerinizi girin.
        </p>
      </div>

      {showRejectionNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-primary/20 bg-primary-muted px-3 py-2.5 text-sm leading-relaxed text-foreground"
        >
          Bu hesap henüz kullanıma hazır değil.
        </div>
      ) : null}

      <LoginForm />
    </div>
  );
}
