/**
 * Presentation-logic tests for the İade ve Sorunlar workspace
 * (`returns-format.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/returns-format.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReturnRequestSummary } from "./returns.ts";
import {
  buildMarkHandledPayload,
  buildReturnSettingUpdatePayload,
  canMarkReturnHandled,
  classifyReturnMutationFailure,
  DEFAULT_RETURN_VIEW,
  formatReturnTimestamp,
  getReturnConversationHref,
  getReturnEvidenceSection,
  getReturnOrderNumberDisplay,
  getReturnPhoneDisplay,
  getReturnReasonExcerpt,
  getReturnRelatedOrderHref,
  hasAnotherReturnsPage,
  mergeReturnsPage,
  normalizeReturnIssueTypeParam,
  normalizeReturnRequestIdParam,
  normalizeReturnSearchParam,
  normalizeReturnViewParam,
  reduceReturnEvidencePreview,
  resolveReturnEvidencePreview,
  resolveReturnSettingsConflictNotice,
  RETURN_ACTION_LABEL,
  RETURN_ACTION_NOTE_LABEL,
  RETURN_ACTION_NOTE_MAX_LENGTH,
  RETURN_IMAGE_REQUIREMENT_OPTIONS,
  RETURN_ISSUE_TYPE_OPTIONS,
  RETURN_MISSING_FIELD_LABELS,
  RETURN_OPEN_CONVERSATION_LABEL,
  RETURN_ORDER_NUMBER_PENDING_LABEL,
  RETURN_PAGE_SIZE,
  RETURN_PHONE_MISSING_LABEL,
  RETURN_PHOTO_PENDING_LABEL,
  RETURN_REASON_PENDING_LABEL,
  RETURN_RELATED_ORDER_LABEL,
  RETURN_SEARCH_MAX_LENGTH,
  RETURN_SEARCH_PLACEHOLDER,
  RETURN_SETTINGS_CONFLICT_NOTICE,
  RETURN_STATUS_DISPLAY,
  RETURN_VIEW_TABS,
  returnEvidencePreviewInitial,
  returnListEmptyCopy,
  returnsWorkspaceHref,
} from "./returns-format.ts";

/* ------------------------------------------------------------------ */
/* Typed fixtures                                                      */
/* ------------------------------------------------------------------ */

const summary = (
  overrides: Partial<ReturnRequestSummary> = {},
): ReturnRequestSummary => ({
  id: 41,
  customerId: 22,
  orderId: 18,
  issueType: "RETURN_REQUEST",
  externalOrderNumberSnapshot: "TR123456",
  productNameSnapshot: "Kişiye Özel Kupa",
  reasonText: "Ürün kırık geldi, iade etmek istiyorum.",
  requestedQuantity: null,
  minQuantitySnapshot: null,
  maxQuantitySnapshot: null,
  quantityLimitDirection: null,
  imageRequirementSnapshot: "REQUIRED",
  status: "SELLER_REVIEW_REQUIRED",
  reviewReasonCode: "COLLECTION_COMPLETE",
  reviewNote: null,
  version: 3,
  createdAt: "2026-08-10T12:00:00+00:00",
  updatedAt: "2026-08-10T12:05:00+00:00",
  reviewRequiredAt: "2026-08-10T12:05:00+00:00",
  handledAt: null,
  sellerNote: null,
  displayIssueType: "İade talebi",
  customerPhone: "+905321112233",
  sellerActionRequired: true,
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* View tabs + view param                                              */
/* ------------------------------------------------------------------ */

test("the four approved views in attention-first order with locked labels", () => {
  assert.deepEqual(RETURN_VIEW_TABS, [
    { view: "action_required", label: "İncelenecekler" },
    { view: "collecting", label: "Bilgi Toplanıyor" },
    { view: "handled", label: "İlgilenilenler" },
    { view: "all", label: "Tümü" },
  ]);
  assert.equal(DEFAULT_RETURN_VIEW, "action_required");
});

test("canonical view params parse; anything else normalizes to the default", () => {
  assert.equal(normalizeReturnViewParam("collecting"), "collecting");
  assert.equal(normalizeReturnViewParam("handled"), "handled");
  assert.equal(normalizeReturnViewParam("all"), "all");
  assert.equal(normalizeReturnViewParam("action_required"), "action_required");
  assert.equal(normalizeReturnViewParam(undefined), "action_required");
  assert.equal(normalizeReturnViewParam("open"), "action_required");
  assert.equal(normalizeReturnViewParam("ALL"), "action_required");
});

test("search normalization trims and caps at the backend max length", () => {
  assert.equal(normalizeReturnSearchParam("  TR123456  "), "TR123456");
  assert.equal(normalizeReturnSearchParam("   "), null);
  assert.equal(normalizeReturnSearchParam(undefined), null);
  assert.equal(
    normalizeReturnSearchParam("x".repeat(RETURN_SEARCH_MAX_LENGTH + 20)),
    "x".repeat(RETURN_SEARCH_MAX_LENGTH),
  );
});

test("issue-type filter admits canonical values only — never labels", () => {
  for (const option of RETURN_ISSUE_TYPE_OPTIONS) {
    assert.equal(normalizeReturnIssueTypeParam(option.value), option.value);
  }
  assert.equal(normalizeReturnIssueTypeParam("İade talebi"), null);
  assert.equal(normalizeReturnIssueTypeParam("REFUND"), null);
  assert.equal(normalizeReturnIssueTypeParam(undefined), null);
});

test("request selection is a positive integer or nothing", () => {
  assert.equal(normalizeReturnRequestIdParam("41"), 41);
  assert.equal(normalizeReturnRequestIdParam(" 41 "), 41);
  assert.equal(normalizeReturnRequestIdParam("0"), null);
  assert.equal(normalizeReturnRequestIdParam("-1"), null);
  assert.equal(normalizeReturnRequestIdParam("1.5"), null);
  assert.equal(normalizeReturnRequestIdParam("request-41"), null);
  assert.equal(normalizeReturnRequestIdParam(undefined), null);
});

test("href omits defaults and never carries an offset", () => {
  assert.equal(
    returnsWorkspaceHref({
      view: "action_required",
      query: null,
      issueType: null,
    }),
    "/seller/returns",
  );
  assert.equal(
    returnsWorkspaceHref({
      view: "handled",
      query: "TR123456",
      issueType: "DAMAGED_ITEM",
    }),
    "/seller/returns?view=handled&q=TR123456&type=DAMAGED_ITEM",
  );
});

test("href drops the selection unless a valid id is passed", () => {
  assert.equal(
    returnsWorkspaceHref({
      view: "all",
      query: null,
      issueType: null,
      requestId: 41,
    }),
    "/seller/returns?view=all&request=41",
  );
  assert.equal(
    returnsWorkspaceHref({
      view: "all",
      query: null,
      issueType: null,
      requestId: 0,
    }),
    "/seller/returns?view=all",
  );
});

test("one locked state line per canonical status; terracotta only for action", () => {
  assert.deepEqual(RETURN_STATUS_DISPLAY, {
    SELLER_REVIEW_REQUIRED: { label: "Sizden bekleniyor", tone: "accent" },
    COLLECTING: { label: "Asistan bilgi topluyor", tone: "muted" },
    HANDLED: { label: "İlgilenildi", tone: "success" },
  });
});

test("phone renders verbatim; only a true absence gets the fallback", () => {
  assert.deepEqual(
    getReturnPhoneDisplay(summary({ customerPhone: "+90 532 111 22 33" })),
    { text: "+90 532 111 22 33", isMissing: false },
  );
  assert.deepEqual(getReturnPhoneDisplay(summary({ customerPhone: null })), {
    text: RETURN_PHONE_MISSING_LABEL,
    isMissing: true,
  });
});

test("order number: pending phrase only while the request is collecting", () => {
  assert.deepEqual(
    getReturnOrderNumberDisplay(
      summary({ externalOrderNumberSnapshot: "TR123456" }),
    ),
    { text: "TR123456", isPending: false },
  );
  assert.deepEqual(
    getReturnOrderNumberDisplay(
      summary({ externalOrderNumberSnapshot: null, status: "COLLECTING" }),
    ),
    { text: RETURN_ORDER_NUMBER_PENDING_LABEL, isPending: true },
  );
  assert.deepEqual(
    getReturnOrderNumberDisplay(
      summary({
        externalOrderNumberSnapshot: null,
        status: "SELLER_REVIEW_REQUIRED",
      }),
    ),
    { text: "—", isPending: true },
  );
});

test("reason excerpt is the exact customer text, trimmed of edges only", () => {
  assert.equal(
    getReturnReasonExcerpt(
      summary({ reasonText: "  Satır 1\nSatır 2  " }),
    ),
    "Satır 1\nSatır 2",
  );
  assert.equal(getReturnReasonExcerpt(summary({ reasonText: null })), null);
});

test("timestamps localize normally and unparseable input omits the line", () => {
  assert.equal(formatReturnTimestamp("not-a-date"), null);
  const formatted = formatReturnTimestamp("2026-08-10T12:05:00+00:00");
  assert.equal(typeof formatted, "string");
  assert.ok(formatted && formatted.length > 0);
});

test("each view has its own calm empty copy", () => {
  assert.deepEqual(returnListEmptyCopy("action_required", false), {
    title: "Şu anda sizden beklenen bir iade veya sorun yok.",
    description: null,
  });
  assert.deepEqual(returnListEmptyCopy("collecting", false), {
    title: "Asistanın bilgi topladığı aktif bir talep yok.",
    description: null,
  });
  assert.deepEqual(returnListEmptyCopy("handled", false), {
    title: "Henüz ilgilenildi olarak işaretlenen bir kayıt yok.",
    description: null,
  });
  assert.deepEqual(returnListEmptyCopy("all", false), {
    title: "Henüz iade veya sorun kaydı yok.",
    description:
      "Asistanın müşterilerden topladığı iade ve sorun bilgileri burada listelenir.",
  });
});

test("an active filter replaces the empty copy with a no-match message", () => {
  for (const view of ["action_required", "collecting", "handled", "all"] as const) {
    assert.deepEqual(returnListEmptyCopy(view, true), {
      title: "Bu arama veya filtreyle eşleşen kayıt bulunamadı.",
      description: null,
    });
  }
});

test("a full returned page may continue; a short or empty page ends the queue", () => {
  assert.equal(hasAnotherReturnsPage(0), false);
  assert.equal(hasAnotherReturnsPage(1), false);
  assert.equal(hasAnotherReturnsPage(RETURN_PAGE_SIZE - 1), false);
  assert.equal(hasAnotherReturnsPage(RETURN_PAGE_SIZE), true);
});

test("page merges dedupe by request id and keep backend ordering verbatim", () => {
  const existing = [summary({ id: 1 }), summary({ id: 2 })];
  const incoming = [summary({ id: 2 }), summary({ id: 3 })];
  assert.deepEqual(
    mergeReturnsPage(existing, incoming).map((row) => row.id),
    [1, 2, 3],
  );
});

test("missing-field labels match the backend-owned pending language", () => {
  assert.deepEqual(RETURN_MISSING_FIELD_LABELS, {
    order_number: "Sipariş numarası bekleniyor",
    reason: "Sorun açıklaması bekleniyor",
    image: "Fotoğraf bekleniyor",
  });
});

test("REQUIRED + image still missing surfaces the single quiet pending line", () => {
  assert.deepEqual(
    getReturnEvidenceSection({
      request: summary({ imageRequirementSnapshot: "REQUIRED" }),
      evidence: [],
      missingFields: ["image"],
    }),
    { kind: "photo_pending" },
  );
  assert.equal(RETURN_PHOTO_PENDING_LABEL, "Fotoğraf bekleniyor");
});

test("OPTIONAL / NOT_REQUESTED evidence absence stays silent — no fake warning", () => {
  for (const requirement of ["OPTIONAL", "NOT_REQUESTED"] as const) {
    assert.deepEqual(
      getReturnEvidenceSection({
        request: summary({ imageRequirementSnapshot: requirement }),
        evidence: [],
        missingFields: [],
      }),
      { kind: "none" },
    );
  }
});

test("present evidence always wins over pending language", () => {
  assert.deepEqual(
    getReturnEvidenceSection({
      request: summary({ imageRequirementSnapshot: "REQUIRED" }),
      evidence: [{ id: 1, messageId: 5, createdAt: "2026-08-10T12:00:00Z" }],
      missingFields: ["image"],
    }),
    { kind: "items" },
  );
});

test("the action payload carries the rendered version verbatim", () => {
  assert.deepEqual(buildMarkHandledPayload({ version: 7, note: "not" }), {
    action: "mark_handled",
    expected_version: 7,
    note: "not",
  });
});

test("an empty note is omitted; a long note is capped at the backend limit", () => {
  assert.deepEqual(buildMarkHandledPayload({ version: 3, note: "   " }), {
    action: "mark_handled",
    expected_version: 3,
  });
  const payload = buildMarkHandledPayload({
    version: 3,
    note: "x".repeat(RETURN_ACTION_NOTE_MAX_LENGTH + 10),
  });
  assert.equal(payload.note?.length, RETURN_ACTION_NOTE_MAX_LENGTH);
});

test("the only seller-facing action language", () => {
  assert.equal(RETURN_ACTION_LABEL, "İlgilenildi olarak işaretle");
  assert.equal(RETURN_ACTION_NOTE_LABEL, "Not (isteğe bağlı)");
});

test("the action is offered only on the backend's own capability signal", () => {
  assert.equal(canMarkReturnHandled(summary()), true);
  assert.equal(
    canMarkReturnHandled(summary({ sellerActionRequired: false })),
    false,
  );
  assert.equal(canMarkReturnHandled(summary({ status: "HANDLED" })), false);
  assert.equal(canMarkReturnHandled(summary({ status: "COLLECTING" })), false);
});

test("the three canonical photo options with locked meaning copy", () => {
  assert.equal(RETURN_IMAGE_REQUIREMENT_OPTIONS.length, 3);
  assert.deepEqual(
    RETURN_IMAGE_REQUIREMENT_OPTIONS.map((option) => option.value),
    ["REQUIRED", "OPTIONAL", "NOT_REQUESTED"],
  );
});

test("the settings payload carries the row's current expected_version", () => {
  assert.deepEqual(
    buildReturnSettingUpdatePayload({
      version: 4,
      imageRequirement: "OPTIONAL",
    }),
    { expected_version: 4, image_requirement: "OPTIONAL" },
  );
});

test("409 means refetch-and-explain; anything else is a calm retry", () => {
  assert.equal(classifyReturnMutationFailure(409), "conflict");
  assert.equal(classifyReturnMutationFailure(500), "retryable");
  assert.equal(classifyReturnMutationFailure(null), "retryable");
});

test("a 409-triggered settings refetch must KEEP its own conflict notice", () => {
  assert.equal(
    resolveReturnSettingsConflictNotice("conflict_refetch"),
    RETURN_SETTINGS_CONFLICT_NOTICE,
  );
});

test("a normal settings reload (dialog open / manual retry) clears stale notices", () => {
  assert.equal(resolveReturnSettingsConflictNotice("normal"), null);
});

test("the preview state machine walks open → ready/error → close", () => {
  const loading = reduceReturnEvidencePreview(returnEvidencePreviewInitial, {
    type: "open",
  });
  assert.deepEqual(loading, { phase: "loading" });
  assert.deepEqual(
    reduceReturnEvidencePreview(loading, {
      type: "loaded",
      objectUrl: "blob:abc",
      contentType: "image/jpeg",
    }),
    { phase: "ready", objectUrl: "blob:abc", contentType: "image/jpeg" },
  );
  assert.deepEqual(reduceReturnEvidencePreview(loading, { type: "failed" }), {
    phase: "error",
  });
  assert.deepEqual(reduceReturnEvidencePreview(loading, { type: "close" }), {
    phase: "idle",
  });
});

test("the preview loader converts bytes to an object URL and fails closed", async () => {
  const blob = new Blob(["x"], { type: "image/jpeg" });
  const success = await resolveReturnEvidencePreview(
    async () => ({ blob, contentType: "image/jpeg" }),
    () => "blob:abc",
  );
  assert.deepEqual(success, {
    ok: true,
    objectUrl: "blob:abc",
    contentType: "image/jpeg",
  });

  const failure = await resolveReturnEvidencePreview(
    async () => {
      throw new Error("network");
    },
    () => "blob:never",
  );
  assert.deepEqual(failure, { ok: false });
});

test("search copy is neutral and teaches no fabricated number format", () => {
  assert.equal(RETURN_SEARCH_PLACEHOLDER, "Sipariş numarasıyla ara");
  assert.equal(RETURN_SEARCH_PLACEHOLDER.includes("TR"), false);
});

test("a valid detail customer id builds the canonical conversation route", () => {
  assert.equal(getReturnConversationHref(22), "/seller/conversations/22");
});

test("absent or invalid customer id yields no conversation link", () => {
  assert.equal(getReturnConversationHref(null), null);
  assert.equal(getReturnConversationHref(0), null);
  assert.equal(getReturnConversationHref(-1), null);
});

test("a related order with an external number opens the existing Orders search", () => {
  assert.equal(
    getReturnRelatedOrderHref({ externalOrderNumber: " TR123456 " }),
    "/seller/orders?q=TR123456",
  );
  assert.equal(RETURN_RELATED_ORDER_LABEL, "İlgili siparişi aç");
  assert.equal(RETURN_OPEN_CONVERSATION_LABEL, "Konuşmayı aç");
});

test("a missing order or missing external number never fabricates a link", () => {
  assert.equal(getReturnRelatedOrderHref(null), null);
  assert.equal(getReturnRelatedOrderHref({ externalOrderNumber: null }), null);
  assert.equal(getReturnRelatedOrderHref({ externalOrderNumber: "   " }), null);
});
