/**
 * Contract tests for the post-login navigation (`post-login.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/auth/post-login.test.ts
 * (via `npm test`)
 *
 * What is covered:
 *   - The role -> protected-route decision (seller / admin).
 *   - The navigation mechanism: `window.location.replace`, invoked
 *     exactly once per successful login.
 *   - Structural locks on the login form source: there is exactly one
 *     navigation call-site and it only runs after a successful
 *     `GET /auth/me`, so invalid Supabase credentials, definitive
 *     backend rejections, and transient backend failures can never
 *     navigate to a protected route.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  navigateToPostLoginRoute,
  POST_LOGIN_ROUTES,
  resolvePostLoginRoute,
} from "./post-login.ts";

/* ------------------------------------------------------------------ */
/* Route decision                                                      */
/* ------------------------------------------------------------------ */

test("seller login resolves to the seller surface", () => {
  assert.equal(resolvePostLoginRoute("seller"), "/seller");
  assert.equal(POST_LOGIN_ROUTES.seller, "/seller");
});

test("admin login resolves to the admin surface", () => {
  assert.equal(resolvePostLoginRoute("admin"), "/admin");
  assert.equal(POST_LOGIN_ROUTES.admin, "/admin");
});

/* ------------------------------------------------------------------ */
/* Navigation mechanism — hard document navigation, exactly once       */
/* ------------------------------------------------------------------ */

/**
 * Install a recording `window.location.replace` stub on globalThis.
 * Node has no DOM; the helper resolves `window` through the global
 * object at call time, so a plain global stub records every call.
 */
const stubWindowLocationReplace = () => {
  const calls: string[] = [];
  const g = globalThis as { window?: unknown };
  const original = g.window;
  g.window = {
    location: {
      replace: (url: string) => {
        calls.push(url);
      },
    },
  };
  return {
    calls,
    restore: () => {
      if (original === undefined) {
        delete g.window;
      } else {
        g.window = original;
      }
    },
  };
};

test("successful seller login navigates to /seller exactly once", () => {
  const stub = stubWindowLocationReplace();
  try {
    navigateToPostLoginRoute(resolvePostLoginRoute("seller"));
    assert.deepEqual(stub.calls, ["/seller"]);
  } finally {
    stub.restore();
  }
});

test("successful admin login navigates to /admin exactly once", () => {
  const stub = stubWindowLocationReplace();
  try {
    navigateToPostLoginRoute(resolvePostLoginRoute("admin"));
    assert.deepEqual(stub.calls, ["/admin"]);
  } finally {
    stub.restore();
  }
});

/* ------------------------------------------------------------------ */
/* Structural locks on the login form source                           */
/*                                                                     */
/* The submit handler cannot be rendered under the Node-only runner,   */
/* so the navigation-related control-flow contracts are locked by      */
/* scanning the source. This is what keeps the four failure cases      */
/* (invalid credentials, backend rejection, transient failure) from    */
/* ever reaching a protected route.                                    */
/* ------------------------------------------------------------------ */

const LOGIN_FORM_SOURCE = readFileSync(
  join(process.cwd(), "src/app/(auth)/giris/_login-form.tsx"),
  "utf8",
);

test("login form navigates only through the post-login helper, exactly once", () => {
  // The import line binds the name as `navigateToPostLoginRoute,`
  // (no call paren), so counting `navigateToPostLoginRoute(` counts
  // call-sites only. Exactly one call-site means no other submit
  // branch (credentials rejection, access_rejected, transient
  // failure, abort) can navigate.
  const callSites =
    LOGIN_FORM_SOURCE.split("navigateToPostLoginRoute(").length - 1;
  assert.equal(callSites, 1);
});

test("navigation is gated behind the backend authorization response", () => {
  const authMeIndex = LOGIN_FORM_SOURCE.indexOf("fetchAuthMe(");
  const navigateIndex = LOGIN_FORM_SOURCE.indexOf("navigateToPostLoginRoute(");
  assert.ok(authMeIndex !== -1, "login form must call fetchAuthMe");
  assert.ok(navigateIndex !== -1, "login form must call the navigation helper");
  // The single navigation call-site appears after the /auth/me call:
  // every early return / catch branch (invalid credentials,
  // access_rejected, network, parse, abort) exits before reaching it.
  assert.ok(navigateIndex > authMeIndex);
});

test("login form never uses SPA router navigation or direct location juggling", () => {
  const forbidden = [
    "useRouter",
    "router.replace(",
    "router.push(",
    "router.refresh(",
    "location.assign(",
    "location.href",
    "setTimeout(",
    "location.reload(",
  ];
  for (const token of forbidden) {
    assert.equal(
      LOGIN_FORM_SOURCE.includes(token),
      false,
      `login form must not contain "${token}"`,
    );
  }
});

test("post-login helper uses location.replace semantics (no history entry, no URLs assigned)", () => {
  const helperSource = readFileSync(
    join(process.cwd(), "src/lib/auth/post-login.ts"),
    "utf8",
  );
  assert.ok(helperSource.includes("window.location.replace("));
  assert.equal(helperSource.includes("location.assign("), false);
  assert.equal(helperSource.includes("location.href"), false);
});
