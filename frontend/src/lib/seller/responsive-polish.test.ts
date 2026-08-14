/**
 * Responsive / accessibility polish invariants (source-level).
 *
 * These are deliberate regression locks for structural/CSS decisions
 * that have no dependency-free runtime logic to unit-test:
 *   - Sheet/Dialog share the fixed dark scrim principle;
 *   - shared primitives keep 44px mobile touch targets with compact
 *     desktop heights;
 *   - close controls keep real hit areas + accessible names;
 *   - Unanswered idle detail stays quiet and start-aligned;
 *   - Products mobile follows the list-OR-detail model;
 *   - Dashboard PriorityCard stacks its CTA below content on mobile.
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/responsive-polish.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (relative: string): string => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(dir, relative), "utf8");
};

/* ------------------------------------------------------------------ */
/* 1. Sheet overlay                                                    */
/* ------------------------------------------------------------------ */

test("sheet overlay uses the fixed dark scrim, never theme foreground", () => {
  // The negative checks target actual overlay class strings (a doc
  // comment may legitimately mention the old value).
  const sheet = read("../../components/ui/sheet.tsx");
  assert.match(sheet, /fixed inset-0[^"]*bg-black\/60/);
  assert.doesNotMatch(sheet, /fixed inset-0[^"]*bg-foreground\//);
  // Dialog and Sheet share the same backdrop principle.
  const dialog = read("../../components/ui/dialog.tsx");
  assert.match(dialog, /fixed inset-0[^"]*bg-black\/60/);
  assert.doesNotMatch(dialog, /fixed inset-0[^"]*bg-foreground\//);
});

/* ------------------------------------------------------------------ */
/* 2. Shared mobile primitives                                         */
/* ------------------------------------------------------------------ */

test("shared Input is 44px on mobile and compact from sm up", () => {
  const input = read("../../components/ui/input.tsx");
  assert.match(input, /h-11 w-full[^"]*sm:h-10/);
});

test("Button sm/md/icon keep 44px mobile targets with compact desktop", () => {
  const button = read("../../components/ui/button.tsx");
  assert.match(button, /sm: "h-11 px-3 sm:h-9"/);
  assert.match(button, /md: "h-11 px-4 sm:h-10"/);
  assert.match(button, /icon: "h-11 w-11 sm:h-10 sm:w-10"/);
  // lg already meets the target and stays unchanged.
  assert.match(button, /lg: "h-11 px-6 text-base"/);
});

/* ------------------------------------------------------------------ */
/* 3. Dialog / Sheet close controls                                    */
/* ------------------------------------------------------------------ */

test("dialog and sheet close controls have real mobile hit areas", () => {
  for (const relative of [
    "../../components/ui/dialog.tsx",
    "../../components/ui/sheet.tsx",
  ]) {
    const source = read(relative);
    // 44px mobile box, compact from sm up; label preserved.
    assert.match(
      source,
      /inline-flex h-11 w-11 items-center justify-center[^"]*sm:h-9 sm:w-9/,
    );
    assert.match(source, /aria-label="Kapat"/);
  }
});

/* ------------------------------------------------------------------ */
/* 4. Unanswered idle detail                                           */
/* ------------------------------------------------------------------ */

test("unanswered no-selection detail is quiet and start-aligned", () => {
  const source = read(
    "../../components/seller/unanswered/unanswered-workspace.tsx",
  );
  // The old large centered empty-canvas treatment must not return.
  assert.doesNotMatch(source, /min-h-64 items-center justify-center/);
  // The approved copy constant is still the guidance content.
  assert.match(source, /UNANSWERED_DETAIL_EMPTY_GUIDANCE/);
});

/* ------------------------------------------------------------------ */
/* 5. Products mobile master/detail                                    */
/* ------------------------------------------------------------------ */

test("products detail is hidden on mobile without an explicit selection", () => {
  const source = read(
    "../../components/seller/products/products-workspace.tsx",
  );
  // No explicit ?product → the phone shows the list only; the default
  // detail remains a desktop (lg+) convenience.
  assert.match(
    source,
    /requestedProductId === null && "hidden lg:block"/,
  );
  // Explicit selection hides the list on mobile (existing rule kept).
  assert.match(
    source,
    /requestedProductId !== null && "hidden lg:block"/,
  );
});

test("products mobile back uses Next Link, not a raw anchor", () => {
  const source = read(
    "../../components/seller/products/products-workspace.tsx",
  );
  assert.match(source, /import Link from "next\/link";/);
  assert.doesNotMatch(source, /<a\s[^>]*href=\{productsWorkspaceHref/);
  assert.match(source, /<Link\s*\n\s*href=\{productsWorkspaceHref\(\) as Route\}/);
});

/* ------------------------------------------------------------------ */
/* 6. Dashboard PriorityCard                                           */
/* ------------------------------------------------------------------ */

test("priority card stacks the CTA below content on narrow mobile", () => {
  const source = read(
    "../../components/seller/dashboard/priority-card.tsx",
  );
  // Mobile column layout; the compact side arrangement returns at sm+.
  assert.match(source, /flex flex-col gap-3 p-4 pl-5 sm:flex-row/);
  // Content wrapper owns the row width from sm up.
  assert.match(source, /flex min-w-0 items-start gap-4 sm:flex-1/);
  // CTA keeps the 44px mobile / compact desktop height and its text.
  assert.match(source, /h-11 shrink-0 items-center[^"]*sm:h-9/);
  assert.match(source, /\{meta\.cta\}/);
});

/* ------------------------------------------------------------------ */
/* 7. Dark-surface depth (visual refinement pass)                      */
/* ------------------------------------------------------------------ */

test("seller surfaces lift with a soft shadow, not a second border ring", () => {
  const css = read("../../app/globals.css");
  const sellerBlock = css.slice(css.indexOf(".seller-theme {"));
  // Cards draw ONE border; the surface shadow must never reintroduce
  // the border-colored 1px ring that double-stroked every Surface
  // into an outlined box.
  assert.match(sellerBlock, /--shadow-surface: 0 1px 2px/);
  assert.doesNotMatch(sellerBlock, /--shadow-surface: 0 0 0 1px/);
  // The three deliberate text roles stay distinct tokens.
  assert.match(sellerBlock, /--color-muted-rgb: 179 189 184/);
  assert.match(sellerBlock, /--color-muted-foreground-rgb: 141 153 148/);
});
