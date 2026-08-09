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
 *
 * Redirects are built as same-origin URLs derived from the incoming
 * request, NOT from any environment variable. This keeps the callback
 * safe even if `NEXT_PUBLIC_SITE_URL` is missing, and avoids any
 * dependency on env at this boundary.
 */

const INVITE_COMPLETE_PATH = "/davet/tamamla";

const buildRedirect = (
  request: NextRequest,
  path: string,
): NextResponse => {
  // `new URL(path, request.url)` resolves the path against the
  // incoming request's origin. This always yields a same-origin URL
  // and never reads from process.env, so the callback is safe in
  // every environment configuration.
  return NextResponse.redirect(new URL(path, request.url));
};

export const GET = async (request: NextRequest) => {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash || type !== "invite") {
    return buildRedirect(request, `${INVITE_COMPLETE_PATH}?status=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error) {
    return buildRedirect(request, `${INVITE_COMPLETE_PATH}?status=invalid`);
  }

  return buildRedirect(request, INVITE_COMPLETE_PATH);
};
