import Link from "next/link";

import { BrandMark } from "@/components/shared/brand-mark";
import { InviteCompletionForm } from "./_invite-completion-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Invite completion page.
 *
 * Server Component. The real authorization check is "does the request
 * have a valid Supabase session for the invited user?". We deliberately
 * do NOT call `/auth/me` here because the invited profile is still in
 * `status=invited` and the backend treats that as not-yet-authorized.
 *
 * The invited email is read directly from the authenticated Supabase
 * user — never from the URL, never from localStorage, never from
 * Supabase user_metadata in a way the page would trust for auth
 * decisions. The form receives it as a read-only prop.
 */
export default async function DavetTamamlaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const params = await searchParams;
  const statusParam = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const forceInvalidView = statusParam === "invalid";

  if (forceInvalidView) {
    return <InvalidInviteView />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    // No authenticated Supabase session / user, or the session exists
    // but the email is missing. The completion form must never appear
    // without a known invited identity.
    return <InvalidInviteView />;
  }

  return (
    <div className="space-y-6">
      <BrandMark subtitle="Sakin Ustalık" />

      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-medium leading-tight text-foreground">
          Hesabınızı tamamlayın
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Davetiniz doğrulandı. Hesabınız için bir şifre oluşturun.
        </p>
      </div>

      <InviteCompletionForm invitedEmail={user.email} />
    </div>
  );
}

function InvalidInviteView() {
  return (
    <div className="space-y-6">
      <BrandMark subtitle="Sakin Ustalık" />

      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-medium leading-tight text-foreground">
          Davet bağlantısı geçerli değil
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Bu davet bağlantısı artık geçerli görünmüyor. Yeni bir davet
          için yöneticinizle iletişime geçebilirsiniz.
        </p>
      </div>

      <div className="pt-1">
        <Link
          href="/giris"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Giriş sayfasına dön
        </Link>
      </div>
    </div>
  );
}
