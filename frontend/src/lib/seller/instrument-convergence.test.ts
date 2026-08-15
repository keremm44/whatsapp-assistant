/**
 * Instrument convergence invariants — Rules, Products, Unanswered.
 *
 * These three workspaces were the last surfaces still carrying the
 * previous generic card-based grammar (filled segmented tabs, per-record
 * `rounded-md border bg-surface` cards, nested answer boxes). This file
 * locks the converged grammar so it cannot silently regress:
 *
 *   - open underline navigation, never a filled/cyan active tab
 *   - contiguous ruled ledgers, never a per-record card stack
 *   - business state expressed with success/paused, never interaction cyan
 *   - the field reorder/mutation lifecycle left untouched
 *
 * Assertions are semantic/structural rather than full class snapshots,
 * so ordinary visual refinement stays possible.
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/instrument-convergence.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { getRuleStatusLabel, getRuleStatusTone } from "./rules-format.ts";
import {
  getFieldStatusLabel,
  getProductStatusLabel,
  getProductStatusTone,
} from "./products-format.ts";
import { UNANSWERED_STATUS_DISPLAY } from "./unanswered-format.ts";
import { RETURN_STATUS_DISPLAY } from "./returns-format.ts";
import { getOrderStatusTone } from "./orders-format.ts";

const read = (relative: string): string => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(dir, relative), "utf8");
};

/** Source with comments stripped: assertions target real code only. */
const readCode = (relative: string): string =>
  read(relative)
    .replace(/\/\*[^]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const RULES = "../../components/seller/rules/rules-workspace.tsx";
const PRODUCT_LIST = "../../components/seller/products/products-list-panel.tsx";
const PRODUCT_DETAIL =
  "../../components/seller/products/product-detail-panel.tsx";
const UNANSWERED_DETAIL =
  "../../components/seller/unanswered/unanswered-question-detail.tsx";

/* ------------------------------------------------------------------ */
/* 1. Rules — tabs                                                     */
/* ------------------------------------------------------------------ */

test("rules tabs use the open underline grammar, not a filled control", () => {
  const source = readCode(RULES);

  // Same grammar as Orders / Returns / Unanswered.
  assert.match(source, /border-b border-boundary/);
  assert.match(source, /border-b-2 border-transparent/);
  assert.match(source, /border-primary font-semibold/);
  assert.match(source, /aria-current=\{tab\.view === activeView \? "page" : undefined\}/);

  // The old filled segmented control must not return.
  assert.doesNotMatch(source, /bg-selected text-foreground/);
  assert.doesNotMatch(source, /rounded-md border border-border bg-control/);
});

test("rules tabs keep their existing labels, routes and view behaviour", () => {
  const source = readCode(RULES);
  // Routing helper and the canonical tab source are unchanged.
  assert.match(source, /RULE_VIEW_TABS\.map/);
  assert.match(source, /rulesWorkspaceHref\(tab\.view\)/);
  assert.match(source, /\{tab\.label\}/);
  // Still real links (middle-click / copy address keep working).
  assert.match(source, /<Link/);
});

/* ------------------------------------------------------------------ */
/* 2. Rules — record grammar                                           */
/* ------------------------------------------------------------------ */

test("rules render as one contiguous register, not a card stack", () => {
  const source = readCode(RULES);

  // One sheet, rows divided by rules.
  assert.match(
    source,
    /divide-y divide-divider overflow-hidden rounded-sheet bg-raised/,
  );
  // The per-rule card must not return.
  assert.doesNotMatch(source, /rounded-md border border-border bg-surface/);
  assert.doesNotMatch(source, /<ul className="space-y-3">/);
});

test("rule rows preserve every existing data point and action", () => {
  const source = readCode(RULES);
  for (const token of [
    "RULE_TRIGGER_HEADING",
    "RULE_RESPONSE_HEADING",
    "rule.triggerText",
    "rule.responseText",
    "getRuleStatusLabel(rule.isActive)",
    "getRuleHitCountLabel(rule.hitCount)",
    "RuleRowActions",
  ]) {
    assert.ok(source.includes(token), `rule rows must still render ${token}`);
  }
  // Response text is never visually truncated (production content).
  assert.match(source, /whitespace-pre-wrap break-words[^"]*type-body/);
  // The shared per-record mutation gate is untouched.
  assert.match(source, /useRecordMutationGate\(\)/);
  assert.match(source, /<RuleEditDialog rule=\{rule\} gate=\{gate\} \/>/);
  assert.match(source, /<RuleStatusDialog rule=\{rule\} gate=\{gate\} \/>/);
});

/* ------------------------------------------------------------------ */
/* 3. ACTIVE is normal (neutral); only INACTIVE is tinted              */
/* ------------------------------------------------------------------ */

test("active/enabled is the normal state and maps to neutral, not success", () => {
  // ACTIVE is the ordinary operating state, NOT an achievement, so it
  // must never claim the success role. Green is reserved for truthful
  // terminal completion (COMPLETE / ANSWERED / HANDLED).
  assert.equal(getRuleStatusTone(true), "neutral");
  assert.equal(getProductStatusTone(true), "neutral");

  // INACTIVE is deliberately disabled -> paused slate.
  assert.equal(getRuleStatusTone(false), "paused");
  assert.equal(getProductStatusTone(false), "paused");

  // Neither helper may emit success for an enabled record.
  for (const tone of [
    getRuleStatusTone(true),
    getRuleStatusTone(false),
    getProductStatusTone(true),
    getProductStatusTone(false),
  ]) {
    assert.notEqual(tone, "success");
  }

  // Labels are unchanged business language.
  assert.equal(getRuleStatusLabel(true), "Aktif");
  assert.equal(getRuleStatusLabel(false), "Devre dışı");
  assert.equal(getProductStatusLabel(true), "Aktif");
  assert.equal(getProductStatusLabel(false), "Devre dışı");
  assert.equal(getFieldStatusLabel(true), "Aktif");
  assert.equal(getFieldStatusLabel(false), "Devre dışı");
});

test("no Rules/Products surface paints an enabled record green", () => {
  // Success green must not appear anywhere in these workspaces: none
  // of them expresses a completed outcome.
  for (const relative of [RULES, PRODUCT_LIST, PRODUCT_DETAIL]) {
    const source = readCode(relative);
    assert.doesNotMatch(
      source,
      /text-success/,
      `${relative} must not use success green for an enabled state`,
    );
    assert.doesNotMatch(
      source,
      /isActive \? "text-success/,
      `${relative} must not tint an active record as completed`,
    );
  }

  // The field ledger specifically: enabled -> neutral, disabled -> paused.
  const detail = readCode(PRODUCT_DETAIL);
  assert.match(
    detail,
    /field\.isActive \? "text-foreground" : "text-paused"/,
  );
});

test("no touched surface expresses status with interaction cyan", () => {
  for (const relative of [RULES, PRODUCT_LIST, PRODUCT_DETAIL]) {
    const source = readCode(relative);
    // `text-primary-text` / `text-primary` must not carry a status.
    assert.doesNotMatch(
      source,
      /isActive \? "text-primary/,
      `${relative} must not use cyan for an active state`,
    );
    assert.doesNotMatch(source, /text-primary-text/);
  }

  // The status colour always ships with its label, so state is never
  // communicated by colour alone — and the disabled tint is present.
  const list = readCode(PRODUCT_LIST);
  assert.match(list, /getProductStatusLabel\(product\.isActive\)/);
  assert.match(list, /text-foreground/);
  assert.match(list, /text-paused/);
});

test("success green still marks the genuinely completed states", () => {
  // This correction must NOT drain green from real completions.
  assert.equal(RETURN_STATUS_DISPLAY.HANDLED.tone, "success");
  assert.equal(UNANSWERED_STATUS_DISPLAY.ANSWERED.tone, "success");
  assert.equal(
    getOrderStatusTone({ status: "COMPLETE", sellerActionRequired: false }),
    "success",
  );

  // ...and the in-progress / attention states stay distinct from it.
  assert.equal(RETURN_STATUS_DISPLAY.COLLECTING.tone, "muted");
  assert.equal(UNANSWERED_STATUS_DISPLAY.DISMISSED.tone, "paused");
  assert.equal(
    getOrderStatusTone({ status: "COLLECTING", sellerActionRequired: false }),
    "muted",
  );
  assert.equal(
    getOrderStatusTone({
      status: "SELLER_REVIEW_REQUIRED",
      sellerActionRequired: true,
    }),
    "attention",
  );
});

/* ------------------------------------------------------------------ */
/* 4. Products — field ledger                                          */
/* ------------------------------------------------------------------ */

test("custom fields render as one specification ledger, not cards", () => {
  const source = readCode(PRODUCT_DETAIL);

  assert.match(
    source,
    /divide-y divide-divider overflow-hidden rounded-sheet bg-raised/,
  );
  // The repeated per-field card must not return.
  assert.doesNotMatch(source, /rounded-md border border-border bg-surface/);
  assert.doesNotMatch(source, /<ul className="space-y-3" aria-busy/);
  // Every spec fact is still rendered.
  for (const token of [
    "field.label",
    "getFieldTypeLabel(field.fieldType)",
    "getFieldRequiredLabel(field.isRequired)",
    "getFieldStatusLabel(field.isActive)",
    "isChoiceFieldType(field.fieldType)",
  ]) {
    assert.ok(source.includes(token), `field rows must still render ${token}`);
  }
});

test("field reorder and mutation lifecycle is completely unchanged", () => {
  const source = readCode(PRODUCT_DETAIL);

  // Ordering algorithm + adjacency source.
  assert.match(source, /planFieldMove/);
  assert.match(source, /nextFieldSortOrder/);
  // Optimistic/rollback + authoritative refresh ownership.
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /startTransition/);
  assert.match(source, /isFieldMutationLocked/);
  assert.match(source, /shouldReleaseFieldMutationGate/);
  // Version handling on the PATCH payload.
  assert.match(source, /buildUpdateFieldPayload/);
  assert.match(source, /updateProductField/);
  // Conflict/error classification is still surfaced.
  assert.match(source, /classifyProductsMutationFailure/);
  assert.match(source, /FIELD_REORDER_CONFLICT_MESSAGE/);
  assert.match(source, /FIELD_REORDER_ERROR_MESSAGE/);

  // The lock still reaches BOTH the arrows and the row dialogs, and the
  // busy state is still announced on the list.
  assert.match(source, /disabled=\{!canMoveUp \|\| mutationLocked\}/);
  assert.match(source, /disabled=\{!canMoveDown \|\| mutationLocked\}/);
  assert.match(source, /<FieldEditDialog field=\{field\} disabled=\{mutationLocked\} \/>/);
  assert.match(source, /<FieldStatusDialog field=\{field\} disabled=\{mutationLocked\} \/>/);
  assert.match(source, /aria-busy=\{mutationLocked\}/);
});

test("ordering controls stay quiet utilities with accessible names", () => {
  const source = readCode(PRODUCT_DETAIL);
  // Direction is carried by the accessible name, never the icon alone.
  assert.match(source, /fieldMoveUpLabel\(field\.label\)/);
  assert.match(source, /fieldMoveDownLabel\(field\.label\)/);
  // They must not become primary-weight actions.
  assert.doesNotMatch(source, /FieldMoveButton[^>]*variant="primary"/);
});

/* ------------------------------------------------------------------ */
/* 5. Unanswered                                                       */
/* ------------------------------------------------------------------ */

test("unanswered keeps its three-part information architecture", () => {
  const source = readCode(UNANSWERED_DETAIL);
  for (const id of [
    "unanswered-detail-question",
    "unanswered-detail-occurrences",
    "unanswered-detail-answer",
    "unanswered-detail-saved",
    "unanswered-detail-dismissed",
  ]) {
    assert.ok(source.includes(id), `section ${id} must survive`);
  }
  // Occurrences keep their divided-row treatment and real links.
  assert.match(source, /divide-y divide-divider border-t border-divider/);
  assert.match(source, /getUnansweredConversationHref/);
});

test("answer states drop the generic card / nested box grammar", () => {
  const source = readCode(UNANSWERED_DETAIL);

  // The old repeated card treatment must not return.
  assert.doesNotMatch(source, /rounded-md border border-divider bg-surface-2/);
  // ...nor the saved answer nested in a second box inside its section.
  assert.doesNotMatch(source, /rounded-sm bg-surface px-3 py-2\.5/);

  // ANSWERED and DISMISSED are ruled sections.
  assert.match(source, /space-y-3 border-t border-divider pt-4/);
  // OPEN keeps a bounded work region because it hosts a real editor,
  // but as a neutral well rather than a card.
  assert.match(source, /rounded-sheet bg-sunken p-4/);
});

test("unanswered status semantics stay truthful", () => {
  // Locked mappings from the previous semantic pass.
  assert.equal(UNANSWERED_STATUS_DISPLAY.ANSWERED.tone, "success");
  assert.equal(UNANSWERED_STATUS_DISPLAY.DISMISSED.tone, "paused");
  assert.equal(UNANSWERED_STATUS_DISPLAY.OPEN.tone, "accent");

  const source = readCode(UNANSWERED_DETAIL);
  // Cyan is never a resolved state on this surface.
  assert.doesNotMatch(source, /tone === "success" && "text-primary/);
  assert.match(source, /statusDisplay\.tone === "success" && "text-success"/);
  assert.match(source, /statusDisplay\.tone === "paused" && "text-paused"/);
  // The dismissed heading carries the paused role, with its label.
  assert.match(source, /type-row-primary text-paused/);
  assert.match(source, /UNANSWERED_STATUS_DISPLAY\.DISMISSED\.label/);
});

/* ------------------------------------------------------------------ */
/* 6. Cross-cutting discipline                                         */
/* ------------------------------------------------------------------ */

test("no broad cyan fill is introduced in the converged surfaces", () => {
  for (const relative of [RULES, PRODUCT_LIST, PRODUCT_DETAIL, UNANSWERED_DETAIL]) {
    const source = readCode(relative);
    for (const hit of source.match(/"[^"\n]*bg-primary[^"\n]*"/g) ?? []) {
      const thinRail = /w-\[[123]px\]|h-\[[123]px\]/.test(hit);
      assert.ok(
        thinRail,
        `${relative} must not fill a region with cyan: ${hit.slice(0, 60)}`,
      );
    }
  }
});

test("mobile touch targets survive the convergence", () => {
  // Tabs and row-level interactive controls keep a 44px mobile target.
  assert.match(readCode(RULES), /min-h-11/);
  assert.match(readCode(PRODUCT_LIST), /min-h-11/);
  assert.match(readCode(UNANSWERED_DETAIL), /min-h-11/);
});
