/**
 * Post-login navigation into the protected surfaces.
 *
 * After a successful Supabase `signInWithPassword` the browser-side
 * auth cookies are written synchronously, and after a successful
 * backend `GET /auth/me` the application role/status is known. The
 * ONLY remaining step is moving the browser from `/giris` to the
 * role's protected surface.
 *
 * Why a hard document navigation (and not `router.replace`):
 *
 *   The previous implementation ended the submit handler with
 *   Next.js `router.replace(target)`. Under Next.js 15 / React 19
 *   that SPA transition is not deterministic: the `/giris` submit
 *   handler completes its async work, the client router starts an
 *   RSC navigation for the protected route, and server logs show
 *   that render completing with 200 — yet the client transition
 *   intermittently never commits. The URL stays on `/giris` and the
 *   login UI can be left partially suspended. A full browser
 *   refresh always recovered because a fresh document request
 *   carries the session cookies cleanly and the server access
 *   resolver authorizes the protected render.
 *
 *   `window.location.replace(target)` makes that recovery path the
 *   primary path: one plain document request from a clean boundary.
 *   The current auth cookies are included, middleware refreshes the
 *   Supabase session normally, the shared server access resolver
 *   validates the session, the protected layout guard validates the
 *   application access, and any stale `/giris` React/RSC router
 *   state is discarded wholesale.
 *
 * What this module deliberately does NOT change:
 *
 *   - Supabase authentication still happens first.
 *   - The backend `GET /auth/me` is still the source of truth for the
 *     role/status and still gates this navigation: the caller must
 *     only invoke it after a successful `/auth/me` response.
 *   - No custom cookies, no token storage, no delays, no polling,
 *     no second auth mechanism.
 */

/**
 * The two protected entry routes, keyed by backend role.
 *
 * Mirrors `PROTECTED_ROUTES` in `lib/auth/server-access.ts`, which is
 * server-only and cannot be imported from a Client Component. Keep
 * these two literals in sync with that module.
 */
export const POST_LOGIN_ROUTES = {
  seller: "/seller",
  admin: "/admin",
} as const;

export type PostLoginRole = keyof typeof POST_LOGIN_ROUTES;
export type PostLoginRoute = (typeof POST_LOGIN_ROUTES)[PostLoginRole];

/**
 * Map the backend-authorized role to its protected entry route.
 *
 * `role` comes from the parsed `GET /auth/me` contract
 * (`AuthMeRole` in `lib/auth/me.ts`), which only produces the two
 * values keyed above — the mapping is therefore total and needs no
 * fallback branch.
 */
export const resolvePostLoginRoute = (role: PostLoginRole): PostLoginRoute =>
  POST_LOGIN_ROUTES[role];

/**
 * Initiate the hard document navigation to the authorized surface.
 *
 * Uses `location.replace` (not `assign`) so the transient `/giris`
 * entry in the history stack is replaced — the browser Back button
 * from the protected surface cannot land the seller back on the
 * login form, matching the previous `router.replace` semantics.
 *
 * This is a fire-and-forget document teardown: the caller keeps its
 * submitting/busy state until the browser unloads the document, and
 * must not schedule further React state updates afterwards.
 */
export const navigateToPostLoginRoute = (route: PostLoginRoute): void => {
  window.location.replace(route);
};
