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
  getReturnEvidenceSection,
  getReturnOrderNumberDisplay,
  getReturnPhoneDisplay,
  getReturnReasonExcerpt,
  hasAnotherReturnsPage,
  mergeReturnsPage,
  normalizeReturnIssueTypeParam,
  normalizeReturnRequestIdParam,
  normalizeReturnSearchParam,
  normalizeReturnViewParam,
  reduceReturnEvidencePreview,
  resolveReturnEvidencePreview,
  RETURN_ACTION_LABEL,
  RETURN_ACTION_NOTE_LABEL,
  RETURN_ACTION_NOTE_MAX_LENGTH,
  RETURN_IMAGE_REQUIREMENT_OPTIONS,
  RETURN_ISSUE_TYPE_OPTIONS,
  RETURN_MISSING_FIELD_LABELS,
  RETURN_ORDER_NUMBER_PENDING_LABEL,
  RETURN_PAGE_SIZE,
  RETURN_PHONE_MISSING_LABEL,
  RETURN_PHOTO_PENDING_LABEL,
  RETURN_REASON_PENDING_LABEL,
  RETURN_SEARCH_MAX_LENGTH,
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
  assert.equal(normalizeReturnViewParam(["handled", "all"]), "handled");
});

/* ------------------------------------------------------------------ */
/* Search / type / selection params                                    */
/* ------------------------------------------------------------------ */

test("search normalization trims and caps at the backend max length", () => {
  assert.equal(normalizeReturnSearchParam("  TR123456  "), "TR123456");
  assert.equal(normalizeReturnSearchParam(undefined), null);
  assert.equal(normalizeReturnSearchParam(""), null);
  assert.equal(normalizeReturnSearchParam("   "), null);
  assert.equal(normalizeReturnSearchParam(["TR1", "TR2"]), "TR1");
  const long = normalizeReturnSearchParam(`  ${"x".repeat(150)}  `);
  assert.equal(long?.length, RETURN_SEARCH_MAX_LENGTH);
  assert.equal(RETURN_SEARCH_MAX_LENGTH, 100);
});

test("issue-type filter admits canonical values only — never labels", () => {
  for (const option of RETURN_ISSUE_TYPE_OPTIONS) {
    assert.equal(normalizeReturnIssueTypeParam(option.value), option.value);
  }
  assert.equal(RETURN_ISSUE_TYPE_OPTIONS.length, 6);
  assert.equal(normalizeReturnIssueTypeParam("wrong_item"), null);
  assert.equal(normalizeReturnIssueTypeParam("İade talebi"), null);
  assert.equal(normalizeReturnIssueTypeParam(""), null);
  assert.equal(normalizeReturnIssueTypeParam(undefined), null);
  assert.equal(normalizeReturnIssueTypeParam(["DAMAGED_ITEM"]), "DAMAGED_ITEM");
});

test("request selection is a positive integer or nothing", () => {
  assert.equal(normalizeReturnRequestIdParam("42"), 42);
  assert.equal(normalizeReturnRequestIdParam(" 42 "), 42);
  assert.equal(normalizeReturnRequestIdParam(["17", "18"]), 17);
  assert.equal(normalizeReturnRequestIdParam("0"), null);
  assert.equal(normalizeReturnRequestIdParam("-3"), null);
  assert.equal(normalizeReturnRequestIdParam("1.5"), null);
  assert.equal(normalizeReturnRequestIdParam("abc"), null);
  assert.equal(normalizeReturnRequestIdParam(""), null);
  assert.equal(normalizeReturnRequestIdParam(undefined), null);
});

/* ------------------------------------------------------------------ */
/* URL builder (URL is the source of truth; offset never appears)      */
/* ------------------------------------------------------------------ */

test("href omits defaults and never carries an offset", () => {
  assert.equal(
    returnsWorkspaceHref({ view: "action_required", query: null, issueType: null }),
    "/seller/returns",
  );
  assert.equal(
    returnsWorkspaceHref({ view: "handled", query: null, issueType: null }),
    "/seller/returns?view=handled",
  );
  assert.equal(
    returnsWorkspaceHref({
      view: "action_required",
      query: "TR123456",
      issueType: null,
    }),
    "/seller/returns?q=TR123456",
  );
  assert.equal(
    returnsWorkspaceHref({
      view: "handled",
      query: "TR1",
      issueType: "DAMAGED_ITEM",
    }),
    "/seller/returns?view=handled&q=TR1&type=DAMAGED_ITEM",
  );
  assert.equal(
    returnsWorkspaceHref({
      view: "action_required",
      query: "TR 123",
      issueType: null,
    }),
    "/seller/returns?q=TR+123",
  );
});

test("href drops the selection unless a valid id is passed", () => {
  // Tab/search/type navigation calls omit requestId — the selection
  // must not linger across a filter change.
  assert.equal(
    returnsWorkspaceHref({
      view: "collecting",
      query: null,
      issueType: null,
    }).includes("request"),
    false,
  );
  assert.equal(
    returnsWorkspaceHref({
      view: "all",
      query: null,
      issueType: null,
      requestId: 42,
    }),
    "/seller/returns?view=all&request=42",
  );
  for (const bad of [null, 0, -1, 2.5]) {
    assert.equal(
      returnsWorkspaceHref({
        view: "all",
        query: null,
        issueType: null,
        requestId: bad,
      }),
      "/seller/returns?view=all",
    );
  }
});

/* ------------------------------------------------------------------ */
/* Status + identity language                                          */
/* ------------------------------------------------------------------ */

test("one locked state line per canonical status; terracotta only for action", () => {
  assert.deepEqual(RETURN_STATUS_DISPLAY.SELLER_REVIEW_REQUIRED, {
    label: "Sizden bekleniyor",
    tone: "accent",
  });
  assert.deepEqual(RETURN_STATUS_DISPLAY.COLLECTING, {
    label: "Asistan bilgi topluyor",
    tone: "muted",
  });
  assert.deepEqual(RETURN_STATUS_DISPLAY.HANDLED, {
    label: "İlgilenildi",
    tone: "muted",
  });
});

test("phone renders verbatim; only a true absence gets the fallback", () => {
  assert.deepEqual(getReturnPhoneDisplay(summary({ customerPhone: "+90 532 111 22 33" })), {
    text: "+90 532 111 22 33",
    isMissing: false,
  });
  const missing = getReturnPhoneDisplay(summary({ customerPhone: null }));
  assert.equal(missing.text, "Telefon bilgisi yok");
  assert.equal(missing.text, RETURN_PHONE_MISSING_LABEL);
  assert.equal(missing.isMissing, true);
});

test("order number: pending phrase only while the request is collecting", () => {
  assert.deepEqual(
    getReturnOrderNumberDisplay(summary()),
    { text: "TR123456", isPending: false },
  );
  const collecting = getReturnOrderNumberDisplay(
    summary({ externalOrderNumberSnapshot: null, status: "COLLECTING" }),
  );
  assert.equal(collecting.text, "Sipariş numarası bekleniyor");
  assert.equal(collecting.text, RETURN_ORDER_NUMBER_PENDING_LABEL);
  assert.equal(collecting.isPending, true);
  // A handled/review-ready row without a snapshot is a neutral dash —
  // never an invented number.
  assert.deepEqual(
    getReturnOrderNumberDisplay(
      summary({ externalOrderNumberSnapshot: null, status: "HANDLED" }),
    ),
    { text: "—", isPending: true },
  );
});

test("reason excerpt is the exact customer text, trimmed of edges only", () => {
  const reason = "  Kargo şubesi yanlış ürünü teslim etti.\nİade istiyorum.  ";
  assert.equal(
    getReturnReasonExcerpt(summary({ reasonText: reason })),
    reason.trim(),
  );
  assert.equal(getReturnReasonExcerpt(summary({ reasonText: null })), null);
  assert.equal(getReturnReasonExcerpt(summary({ reasonText: "   " })), null);
  assert.equal(RETURN_REASON_PENDING_LABEL, "Sorun açıklaması bekleniyor");
});

test("timestamps localize normally and unparseable input omits the line", () => {
  const label = formatReturnTimestamp("2026-08-10T12:00:00+00:00");
  assert.equal(typeof label, "string");
  assert.match(label ?? "", /2026/);
  assert.equal(formatReturnTimestamp("not-a-date"), null);
});

/* ------------------------------------------------------------------ */
/* Empty-state copy (locked)                                           */
/* ------------------------------------------------------------------ */

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
  const all = returnListEmptyCopy("all", false);
  assert.equal(all.title, "Henüz iade veya sorun kaydı yok.");
  assert.equal(typeof all.description, "string");
});

test("an active filter replaces the empty copy with a no-match message", () => {
  for (const view of ["action_required", "collecting", "handled", "all"] as const) {
    assert.deepEqual(returnListEmptyCopy(view, true), {
      title: "Bu arama veya filtreyle eşleşen kayıt bulunamadı.",
      description: null,
    });
  }
});

/* ------------------------------------------------------------------ */
/* Pagination — the page-length rule (toplam is never a total)         */
/* ------------------------------------------------------------------ */

test("a full returned page may continue; a short or empty page ends the queue", () => {
  assert.equal(RETURN_PAGE_SIZE, 20);
  assert.equal(hasAnotherReturnsPage(20), true);
  assert.equal(hasAnotherReturnsPage(19), false);
  assert.equal(hasAnotherReturnsPage(1), false);
  assert.equal(hasAnotherReturnsPage(0), false);
});

test("page merges dedupe by request id and keep backend ordering verbatim", () => {
  const merged = mergeReturnsPage(
    [summary({ id: 1 }), summary({ id: 2 })],
    [summary({ id: 2, reasonText: "yenilendi" }), summary({ id: 3 })],
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    [1, 2, 3],
  );
  // The first occurrence wins; an updated duplicate is not re-appended.
  assert.equal(merged[1]?.reasonText, summary().reasonText);
});

/* ------------------------------------------------------------------ */
/* Missing fields + evidence section (§16/§17)                         */
/* ------------------------------------------------------------------ */

test("missing-field labels match the backend-owned pending language", () => {
  assert.deepEqual(RETURN_MISSING_FIELD_LABELS, {
    order_number: "Sipariş numarası bekleniyor",
    reason: "Sorun açıklaması bekleniyor",
    image: "Fotoğraf bekleniyor",
  });
});

test("REQUIRED + image still missing surfaces the single quiet pending line", () => {
  const section = getReturnEvidenceSection({
    request: { imageRequirementSnapshot: "REQUIRED" },
    evidence: [],
    missingFields: ["image"],
  });
  assert.deepEqual(section, { kind: "photo_pending" });
  assert.equal(RETURN_PHOTO_PENDING_LABEL, "Fotoğraf bekleniyor");
});

test("OPTIONAL / NOT_REQUESTED evidence absence stays silent — no fake warning", () => {
  for (const requirement of ["OPTIONAL", "NOT_REQUESTED"] as const) {
    assert.deepEqual(
      getReturnEvidenceSection({
        request: { imageRequirementSnapshot: requirement },
        evidence: [],
        missingFields: [],
      }),
      { kind: "none" },
    );
  }
  // Even a REQUIRED snapshot with no pending image field stays quiet —
  // the seller never sees “Görsel yok”.
  assert.deepEqual(
    getReturnEvidenceSection({
      request: { imageRequirementSnapshot: "REQUIRED" },
      evidence: [],
      missingFields: ["reason"],
    }),
    { kind: "none" },
  );
});

test("present evidence always wins over pending language", () => {
  const section = getReturnEvidenceSection({
    request: { imageRequirementSnapshot: "REQUIRED" },
    evidence: [
      { id: 9, messageId: 980, createdAt: "2026-08-10T12:04:00+00:00" },
    ],
    missingFields: ["image"],
  });
  assert.deepEqual(section, { kind: "items" });
});

/* ------------------------------------------------------------------ */
/* mark_handled payload + capability                                   */
/* ------------------------------------------------------------------ */

test("the action payload carries the rendered version verbatim", () => {
  assert.deepEqual(
    buildMarkHandledPayload({ version: 7, note: "  Müşteri arandı.  " }),
    { action: "mark_handled", expected_version: 7, note: "Müşteri arandı." },
  );
});

test("an empty note is omitted; a long note is capped at the backend limit", () => {
  const withoutNote = buildMarkHandledPayload({ version: 2, note: "   " });
  assert.equal("note" in withoutNote, false);
  assert.deepEqual(withoutNote, { action: "mark_handled", expected_version: 2 });

  const long = buildMarkHandledPayload({ version: 2, note: "x".repeat(2500) });
  assert.equal(long.note?.length, RETURN_ACTION_NOTE_MAX_LENGTH);
  assert.equal(RETURN_ACTION_NOTE_MAX_LENGTH, 2000);
});

test("the only seller-facing action language", () => {
  assert.equal(RETURN_ACTION_LABEL, "İlgilenildi olarak işaretle");
  assert.equal(RETURN_ACTION_NOTE_LABEL, "Not (isteğe bağlı)");
});

test("the action is offered only on the backend's own capability signal", () => {
  assert.equal(
    canMarkReturnHandled({
      status: "SELLER_REVIEW_REQUIRED",
      sellerActionRequired: true,
    }),
    true,
  );
  assert.equal(
    canMarkReturnHandled({
      status: "SELLER_REVIEW_REQUIRED",
      sellerActionRequired: false,
    }),
    false,
  );
  assert.equal(
    canMarkReturnHandled({
      status: "COLLECTING",
      sellerActionRequired: true,
    }),
    false,
  );
  assert.equal(
    canMarkReturnHandled({ status: "HANDLED", sellerActionRequired: false }),
    false,
  );
});

/* ------------------------------------------------------------------ */
/* Photo preferences                                                   */
/* ------------------------------------------------------------------ */

test("the three canonical photo options with locked meaning copy", () => {
  assert.deepEqual(
    RETURN_IMAGE_REQUIREMENT_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description,
    })),
    [
      {
        value: "REQUIRED",
        label: "Fotoğraf iste",
        description:
          "Asistan bu sorun türünde müşteriden fotoğraf ister ve fotoğraf gelmeden incelemeye hazır saymaz.",
      },
      {
        value: "OPTIONAL",
        label: "Zorunlu değil",
        description:
          "Asistan fotoğrafı zorunlu tutmaz; müşteri gönderirse kanıt olarak saklanabilir.",
      },
      {
        value: "NOT_REQUESTED",
        label: "Fotoğraf isteme",
        description:
          "Asistan bu sorun türünde fotoğraf istemez; müşteri kendiliğinden gönderirse kanıt yine saklanabilir.",
      },
    ],
  );
});

test("the settings payload carries the row's current expected_version", () => {
  assert.deepEqual(
    buildReturnSettingUpdatePayload({
      version: 5,
      imageRequirement: "NOT_REQUESTED",
    }),
    { expected_version: 5, image_requirement: "NOT_REQUESTED" },
  );
});

test("409 means refetch-and-explain; anything else is a calm retry", () => {
  assert.equal(classifyReturnMutationFailure(409), "conflict");
  assert.equal(classifyReturnMutationFailure(500), "retryable");
  assert.equal(classifyReturnMutationFailure(0), "retryable");
  assert.equal(classifyReturnMutationFailure(null), "retryable");
});

/* ------------------------------------------------------------------ */
/* Evidence preview lifecycle                                          */
/* ------------------------------------------------------------------ */

test("the preview state machine walks open → ready/error → close", () => {
  const loading = reduceReturnEvidencePreview(
    returnEvidencePreviewInitial,
    { type: "open" },
  );
  assert.deepEqual(loading, { phase: "loading" });

  const ready = reduceReturnEvidencePreview(loading, {
    type: "loaded",
    objectUrl: "blob:preview/1",
    contentType: "image/jpeg",
  });
  assert.deepEqual(ready, {
    phase: "ready",
    objectUrl: "blob:preview/1",
    contentType: "image/jpeg",
  });

  const failed = reduceReturnEvidencePreview(loading, { type: "failed" });
  assert.deepEqual(failed, { phase: "error" });

  assert.deepEqual(reduceReturnEvidencePreview(ready, { type: "close" }), {
    phase: "idle",
  });
  assert.deepEqual(returnEvidencePreviewInitial, { phase: "idle" });
});

test("the preview loader converts bytes to an object URL and fails closed", async () => {
  const ok = await resolveReturnEvidencePreview(
    async () => ({
      blob: new Blob(["bytes"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
    }),
    () => "blob:preview/9",
  );
  assert.deepEqual(ok, {
    ok: true,
    objectUrl: "blob:preview/9",
    contentType: "image/jpeg",
  });

  const failed = await resolveReturnEvidencePreview(
    async () => {
      throw new Error("network down");
    },
    () => "blob:never",
  );
  // Any failure collapses to a calm dialog error — no status codes,
  // host names or provider details can leak from here.
  assert.deepEqual(failed, { ok: false });
});
