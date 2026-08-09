import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side invite callback.
 *
 * Flow:
 *   1. Read `token_hash` and `type` from the query string.
 *   2. Reject anything other than `type=invite` (we do not generalize
 *      to signup / recovery / magiclink / email_change in this step).
 *   3. Server-side `supabase.auth.verifyOtp({ token_hash, type: "invite" })`
 *      using the Supabase SSR server client. This sets the session
 *      cookies that the rest of the app reads.
 *   4. On success: redirect to the fixed internal destination
 *      `/davet/tamamla`. We do NOT honor any `next` query parameter to
 *      avoid open-redirect risk.
 *   5. On any failure: redirect to `/davet/tamamla?status=invalid`. The
 *      query is UI state only; the real authorization check happens
 *      server-side on the completion page.
 *
 * The route handler runs only on the server. The Supabase server client
 * is the only session/token source — no browser Supabase client is
 * used here.
 */

const INVITE_COMPLETE_PATH = "/davet/tamamla";

const buildRedirect = (path: string): NextResponse => {
  // The completion page lives at /(auth)/davet/tamamla, which is a
  // real route; redirecting from /auth/confirm (outside the (auth)
  // group) is safe.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const target = `${origin}${path}`;
  return NextResponse.redirect(target);
};

export const GET = async (request: NextRequest) => {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash || type !== "invite") {
    return buildRedirect(`${INVITE_COMPLETE_PATH}?status=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error) {
    return buildRedirect(`${INVITE_COMPLETE_PATH}?status=invalid`);
  }

  return buildRedirect(INVITE_COMPLETE_PATH);
};
