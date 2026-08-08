import { NextResponse, type NextRequest } from "next/server";

import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * Root middleware. Refreshes the Supabase session cookies on every request
 * so server components always see a valid access token. Route-level
 * authorization (redirecting unauthenticated users away from /seller/*) is
 * handled by the auth foundation in a later step.
 */
export const middleware = async (request: NextRequest) => {
  return updateSupabaseSession(request);
};

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     *   - _next/static (static files)
     *   - _next/image  (image optimization files)
     *   - favicon.ico  (favicon file)
     *   - api          (backend proxy routes, if any are added later)
     *   - public files in /public
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

export { NextResponse };
