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

  // OPEN, ANSWERED and DISMISSED are now ALL ruled sections in the
  // same record-detail language — OPEN no longer sits inside its own
  // bounded slab, so the editor belongs to the record rather than
  // reading as an inserted admin form.
  const ruled = source.match(/space-y-3 border-t border-divider pt-4/g);
  assert.ok(
    ruled !== null && ruled.length >= 3,
    "OPEN / ANSWERED / DISMISSED must share the ruled-section grammar",
  );
  assert.doesNotMatch(source, /rounded-sheet bg-sunken/);

  // The only bounded material left in OPEN is the textarea itself,
  // which is genuinely a place to type.
  const editor = readCode(
    "../../components/seller/unanswered/unanswered-answer-editor.tsx",
  );
  assert.match(editor, /<textarea/);
  assert.match(editor, /bg-control/);
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

/* ------------------------------------------------------------------ */
/* 7. Assistant Settings hub — index, not a feature-card grid          */
/* ------------------------------------------------------------------ */

const HUB = "../../components/seller/assistant-settings/assistant-settings-hub.tsx";
const SETTINGS_SECTION =
  "../../components/seller/assistant-settings/settings-section.tsx";
const ANSWER_EDITOR =
  "../../components/seller/unanswered/unanswered-answer-editor.tsx";

test("the settings hub is a contiguous register, not four feature cards", () => {
  const source = readCode(HUB);

  // One sheet, destinations divided by rules.
  assert.match(
    source,
    /divide-y divide-divider overflow-hidden rounded-sheet bg-raised/,
  );
  // The oversized equal-height card grid must not return.
  assert.doesNotMatch(source, /min-h-\[11rem\]/);
  assert.doesNotMatch(source, /sm:grid-cols-2/);
  assert.doesNotMatch(source, /<Surface/);
});

test("hub destinations keep their content, routes and whole-row target", () => {
  const source = readCode(HUB);
  // Every information layer survives.
  for (const token of [
    "card.title",
    "card.description",
    "{summary}",
    "card.href",
    "card.icon",
  ]) {
    assert.ok(source.includes(token), `hub rows must still render ${token}`);
  }
  // The LINK is the row, not a tiny arrow-only target.
  assert.match(source, /<Link[^>]*\n?\s*href=\{card\.href as Route\}/);
  assert.match(source, /className="group flex items-start/);
  // The chevron is decorative only.
  assert.match(source, /<ChevronRight\s*\n?\s*aria-hidden="true"/);
  // Keyboard focus is preserved on the row.
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/);
});

test("hub icons stay small neutral utility glyphs", () => {
  const source = readCode(HUB);
  assert.match(source, /size=\{18\}/);
  assert.match(source, /text-muted-foreground/);
  // No coloured discs, no per-destination colour, no big icon cards.
  assert.doesNotMatch(source, /rounded-full/);
  assert.doesNotMatch(source, /bg-(primary|success|attention|warning)/);
});

/* ------------------------------------------------------------------ */
/* 8. Settings sections — deliberate measure, no full-width slabs      */
/* ------------------------------------------------------------------ */

test("a settings section is a contained work sheet, not a full-width slab", () => {
  const source = readCode(SETTINGS_SECTION);

  // The shared full-width `Surface` primitive is still not used here.
  assert.doesNotMatch(source, /<Surface/);

  // The section owns a contained work sheet: quiet raised material at
  // the shared sheet measure, one sheet radius, and NO shadow.
  assert.match(source, /rounded-sheet bg-raised/);
  assert.match(source, /SETTINGS_SHEET_MEASURE/);
  assert.doesNotMatch(source, /shadow-/);

  // The form column inside the sheet keeps its own narrower measure.
  assert.match(source, /SETTINGS_FIELD_MEASURE/);
  assert.match(source, /SETTINGS_FIELD_MEASURE_WIDE/);
});

test("settings measures are nested: field column narrower than the sheet", () => {
  const source = readCode("../../components/seller/assistant-settings/settings-measure.ts");
  const rem = (name: string) => {
    const match = source.match(
      new RegExp(`${name} = "max-w-\\[([0-9.]+)rem\\]"`),
    );
    assert.ok(match, `${name} must be declared as a rem max-width`);
    return Number(match![1]);
  };
  const sheet = rem("SETTINGS_SHEET_MEASURE");
  const field = rem("SETTINGS_FIELD_MEASURE");
  const fieldWide = rem("SETTINGS_FIELD_MEASURE_WIDE");

  assert.ok(field < fieldWide, "the wide field measure must be wider");
  assert.ok(fieldWide < sheet, "the sheet must contain the widest field column");
  // The sheet must stay meaningfully narrower than the 1180px page
  // container, otherwise the register/forms stretch again.
  assert.ok(sheet <= 60, "the sheet must not approach full page width");
});

test("settings save ownership and feedback are unchanged", () => {
  const source = readCode(SETTINGS_SECTION);
  // Exactly one primary save, still anchored to its own section.
  assert.match(source, /border-t border-divider pt-3\.5/);
  assert.match(source, /disabled=\{!canSave \|\| isSaving\}/);
  assert.match(source, /aria-busy=\{isSaving\}/);
  assert.match(source, /onClick=\{onSave\}/);
  // Saving / saved / error / conflict feedback all survive.
  assert.match(source, /SETTINGS_SAVING_LABEL/);
  assert.match(source, /SETTINGS_SAVED_LABEL/);
  assert.match(source, /role="status"/);
  assert.match(source, /status\.kind === "conflict"/);
  // Mobile target discipline on the save control.
  assert.match(source, /min-h-11 sm:min-h-9/);
});

test("settings workspaces stack contained sheets, not full-width cards", () => {
  for (const relative of [
    "../../components/seller/assistant-settings/knowledge-workspace.tsx",
    "../../components/seller/assistant-settings/order-collection-workspace.tsx",
  ]) {
    const source = readCode(relative);
    // Sections are spaced; each one carries its own contained sheet.
    assert.match(
      source,
      /<div className="space-y-6">/,
      `${relative} must space its sections`,
    );
    // The old full-width raised slab must not return.
    assert.doesNotMatch(source, /<Surface/);
  }
});

test("segmented boolean controls stay neutral material, never cyan-filled", () => {
  const source = readCode(
    "../../components/seller/assistant-settings/settings-form-controls.tsx",
  );
  // Selected segment uses the neutral graphite selected material.
  assert.match(source, /selected\s*\n?\s*\? "bg-selected text-foreground"/);
  // No broad cyan wash on the control.
  assert.doesNotMatch(source, /bg-primary-muted/);
  // 44px touch target on mobile is preserved.
  assert.match(source, /min-h-11/);
});

/* ------------------------------------------------------------------ */
/* 9. Unanswered OPEN editor integration                               */
/* ------------------------------------------------------------------ */

test("the OPEN editor keeps its business explanation verbatim", () => {
  const source = readCode(ANSWER_EDITOR);
  // The three claims are rendered from the shared constants — never
  // paraphrased inline.
  assert.match(source, /UNANSWERED_FUTURE_ONLY_NOTE/);
  assert.match(source, /UNANSWERED_NOT_A_RULE_NOTE/);
  assert.match(source, /UNANSWERED_ANSWER_LABEL/);
});

test("the OPEN editor stays comfortably usable and bounded", () => {
  const source = readCode(ANSWER_EDITOR);
  // The textarea is the bounded work material...
  assert.match(source, /bg-control/);
  // ...and keeps a genuinely useful height (not shrunk to a one-liner).
  assert.match(source, /min-h-\[7\.5rem\]/);
  assert.match(source, /rows=\{4\}/);
  assert.match(source, /maxLength=\{UNANSWERED_ANSWER_MAX_LENGTH\}/);
});

test("save stays primary and dismiss stays secondary in OPEN", () => {
  const editor = readCode(ANSWER_EDITOR);
  assert.match(editor, /type="submit"\s*\n?\s*variant="primary"/);
  // Cancel (edit mode) is a ghost, never a second primary.
  assert.match(editor, /variant="ghost"/);

  const dismiss = readCode(
    "../../components/seller/unanswered/unanswered-dismiss-dialog.tsx",
  );
  // The dismiss trigger is quiet muted text, not a filled button.
  assert.match(dismiss, /text-muted-foreground/);
  assert.doesNotMatch(dismiss, /variant="primary"[^]{0,120}UNANSWERED_DISMISS_TRIGGER_LABEL/);
});

test("unanswered mutation lifecycle is untouched by the visual pass", () => {
  const editor = readCode(ANSWER_EDITOR);
  // Gate + expected_version + gate-owned refresh all survive.
  assert.match(editor, /gateModeForUnansweredSuccess\(onSuccess\(\)\)/);
  assert.match(editor, /gate\.finish\(token, \{ refresh: true \}\)/);
  // The payload still carries the seller-visible version as
  // expected_version (built by the shared helper).
  assert.match(editor, /buildSetAnswerPayload\(\{ version, answer \}\)/);
  // No component-owned router (refreshes stay gate-owned).
  assert.doesNotMatch(editor, /useRouter/);
});

/* ------------------------------------------------------------------ */
/* 10. Settings composition: contained hub + truthful order copy       */
/* ------------------------------------------------------------------ */

test("the hub register is contained, not stretched across the page", () => {
  const source = readCode(HUB);

  // Still one contiguous register (not a card grid)...
  assert.match(
    source,
    /divide-y divide-divider overflow-hidden rounded-sheet bg-raised/,
  );
  // ...now capped at the shared settings sheet measure, so the chevron
  // stays related to its row instead of sitting at the far page edge.
  assert.match(source, /SETTINGS_SHEET_MEASURE/);

  // The cap is a max-width, so the register stays fluid below it and
  // mobile never overflows.
  const measure = readCode(
    "../../components/seller/assistant-settings/settings-measure.ts",
  );
  assert.match(measure, /SETTINGS_SHEET_MEASURE = "max-w-\[/);

  // Full-row link behaviour and routes are unchanged.
  assert.match(source, /href=\{card\.href as Route\}/);
  assert.match(source, /className="group flex items-start/);
});

test("seller-facing order copy describes EXISTING orders only", () => {
  const hub = read("./assistant-settings-hub.ts");
  const format = read("./assistant-settings-format.ts");

  // The renamed, accurate seller-facing label.
  assert.match(hub, /HUB_ORDER_COLLECTION_TITLE = "Sipariş Bilgisi Toplama"/);
  assert.match(
    format,
    /ORDER_COLLECTION_PAGE_TITLE = "Sipariş Bilgisi Toplama"/,
  );

  // Descriptions frame the work as collecting information for an order
  // that already exists.
  assert.match(hub, /Mevcut siparişler için/);
  assert.match(format, /Mevcut siparişler için/);

  // No seller-facing string may imply the assistant creates/takes an
  // order. (Comments are stripped so the rationale text doesn't count.)
  for (const source of [readCode("./assistant-settings-hub.ts"), readCode("./assistant-settings-format.ts")]) {
    assert.doesNotMatch(source, /yeni siparişlerde müşteriden/i);
    assert.doesNotMatch(source, /sipariş al(ır|ma)\b/i);
    assert.doesNotMatch(source, /sipariş oluştur/i);
  }
});

test("the order-collection rename is presentation-only", () => {
  const hub = readCode("./assistant-settings-hub.ts");
  const format = readCode("./assistant-settings-format.ts");

  // Route, internal key and API-facing identifiers are untouched.
  assert.match(hub, /HUB_ORDER_COLLECTION_HREF = "\/seller\/order-collection"/);
  assert.match(hub, /key: "order"/);
  assert.match(format, /ORDER_KNOWLEDGE_HREF = "\/seller\/assistant-knowledge"/);
  assert.match(format, /ORDER_PRODUCTS_HREF = "\/seller\/products"/);

  // The field labels the page actually edits are unchanged.
  for (const label of [
    "ORDER_MIN_QUANTITY_LABEL",
    "ORDER_MAX_QUANTITY_LABEL",
    "ORDER_IMAGE_REQUIRED_LABEL",
    "ORDER_CUSTOM_TEXT_REQUIRED_LABEL",
  ]) {
    assert.ok(format.includes(label), `${label} must still exist`);
  }
});

test("usage density is a spacing concern only", () => {
  const section = readCode(SETTINGS_SECTION);
  // The density switch exists and only changes vertical rhythm.
  assert.match(section, /density === "compact" \? "space-y-3\.5" : "space-y-5"/);

  const knowledge = readCode(
    "../../components/seller/assistant-settings/knowledge-workspace.tsx",
  );
  assert.match(knowledge, /density="compact"/);
  // All four usage questions and their tri-state semantics survive.
  for (const label of [
    "KNOWLEDGE_MICROWAVE_LABEL",
    "KNOWLEDGE_DISHWASHER_LABEL",
    "KNOWLEDGE_HAND_WASH_LABEL",
    "KNOWLEDGE_FOOD_SAFE_LABEL",
  ]) {
    assert.ok(knowledge.includes(label), `${label} must survive`);
  }
  const usage = knowledge.match(/<TriStateControl/g);
  assert.ok(usage !== null && usage.length >= 4);
});

test("no settings surface introduces a broad cyan fill", () => {
  for (const relative of [
    HUB,
    SETTINGS_SECTION,
    "../../components/seller/assistant-settings/knowledge-workspace.tsx",
    "../../components/seller/assistant-settings/order-collection-workspace.tsx",
    "../../components/seller/assistant-settings/business-settings-workspace.tsx",
    "../../components/seller/assistant-settings/settings-form-controls.tsx",
  ]) {
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
