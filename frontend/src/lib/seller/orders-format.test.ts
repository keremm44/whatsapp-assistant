/**
 * Presentation-logic tests for the Orders worklist (`orders-format.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/orders-format.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { OrderSummary } from "./orders.ts";
import {
  DEFAULT_ORDER_VIEW,
  getOrderConversationHref,
  getOrderFieldValueDisplay,
  getPrintContentEmptyLabel,
  getProductNameDisplay,
  normalizeOrderProductParam,
  normalizeOrderSelectionParam,
  ORDER_NUMBER_PENDING_LABEL,
  ORDER_OPEN_CONVERSATION_LABEL,
  ORDER_SEARCH_PLACEHOLDER,
  hasAnotherOrdersPage,
  mergeOrdersPage,
  ORDER_PAGE_SIZE,
  getOrderNumberDisplay,
  getPhoneDisplay,
  getPrintContent,
  getReviewNoteDisplay,
  normalizeOrderSearchParam,
  normalizeOrderViewParam,
  ORDER_VIEW_TABS,
  orderImagePreviewInitial,
  orderListEmptyCopy,
  ordersListHref,
  PRINT_IMAGE_ACTION_LABEL,
  reduceOrderImagePreview,
  resolveOrderImagePreview,
} from "./orders-format.ts";

/* ------------------------------------------------------------------ */
/* Baskı içeriği — the four locked presentations                       */
/* ------------------------------------------------------------------ */

test("print content: image only yields the Görsel action", () => {
  const content = getPrintContent({
    hasImage: true,
    imageMessageId: 104,
    customText: null,
  });
  assert.deepEqual(content, { kind: "image", imageMessageId: 104 });
  assert.equal(PRINT_IMAGE_ACTION_LABEL, "Görsel");
});

test("print content: text only yields the exact stored text", () => {
  const text = "İyi ki doğdun Elif 🎂";
  const content = getPrintContent({
    hasImage: false,
    imageMessageId: null,
    customText: text,
  });
  assert.deepEqual(content, { kind: "text", text });
});

test("print content: image + text combines both in one area", () => {
  const content = getPrintContent({
    hasImage: true,
    imageMessageId: 9,
    customText: "Kerem",
  });
  assert.deepEqual(content, { kind: "image_text", imageMessageId: 9, text: "Kerem" });
});

test("print content: neither collected yields the none fallback", () => {
  for (const customText of [null, "   ", ""]) {
    const content = getPrintContent({
      hasImage: false,
      imageMessageId: null,
      customText,
    });
    assert.equal(content.kind, "none", `customText=${String(customText)}`);
  }
});

test("print content: whitespace-only custom text never hides an image", () => {
  const content = getPrintContent({
    hasImage: true,
    imageMessageId: 11,
    customText: "   ",
  });
  assert.deepEqual(content, { kind: "image", imageMessageId: 11 });
});

test("print content: hasImage without a usable message id degrades safely", () => {
  const content = getPrintContent({
    hasImage: true,
    imageMessageId: null,
    customText: "Ali",
  });
  assert.deepEqual(content, { kind: "text", text: "Ali" });
});

test("print content: business status is never consulted", () => {
  // A review-flagged, COMPLETE-stamped order still renders only from the
  // three print-content fields.
  const content = getPrintContent({
    hasImage: false,
    imageMessageId: null,
    customText: "Zeynep ♥",
  });
  assert.equal(content.kind, "text");
});

/* ------------------------------------------------------------------ */
/* Telefon / Sipariş No / review note                                  */
/* ------------------------------------------------------------------ */

test("order number: present value renders verbatim", () => {
  assert.deepEqual(
    getOrderNumberDisplay({
      externalOrderNumber: "TR123456",
      status: "COMPLETE",
    }),
    {
      text: "TR123456",
      isPending: false,
    },
  );
});

test("order number: waiting phrase only while truthfully collecting", () => {
  for (const externalOrderNumber of [null, "", "   "]) {
    const display = getOrderNumberDisplay({
      externalOrderNumber,
      status: "COLLECTING",
    });
    assert.equal(display.text, "Sipariş numarası bekleniyor");
    assert.equal(display.isPending, true);
    // The internal order id is never substituted.
    assert.equal(display.text.includes("7"), false);
  }
  // Any other status with a missing number: neutral dash, no claim
  // that more information is on its way.
  for (const status of ["COMPLETE", "SELLER_REVIEW_REQUIRED"] as const) {
    const display = getOrderNumberDisplay({
      externalOrderNumber: null,
      status,
    });
    assert.equal(display.text, "—");
    assert.equal(display.isPending, true);
  }
});

test("print-content empty label is contextual, single-phrase", () => {
  assert.equal(
    getPrintContentEmptyLabel("COLLECTING"),
    "Baskı bilgisi bekleniyor",
  );
  assert.equal(getPrintContentEmptyLabel("COMPLETE"), "—");
  assert.equal(getPrintContentEmptyLabel("SELLER_REVIEW_REQUIRED"), "—");
  // The number phrase and the print phrase never repeat each other.
  assert.notEqual(
    getPrintContentEmptyLabel("COLLECTING"),
    ORDER_NUMBER_PENDING_LABEL,
  );
});

test("phone: present value renders verbatim; missing falls back to dash", () => {
  assert.equal(
    getPhoneDisplay({ customerPhoneSnapshot: "+905321112233" }),
    "+905321112233",
  );
  assert.equal(getPhoneDisplay({ customerPhoneSnapshot: null }), "—");
  assert.equal(getPhoneDisplay({ customerPhoneSnapshot: "  " }), "—");
});

test("review note: present -> trimmed render; absent/blank -> nothing", () => {
  assert.equal(
    getReviewNoteDisplay({ reviewReasonNote: "  Baskı tipi değişti. " }),
    "Baskı tipi değişti.",
  );
  assert.equal(getReviewNoteDisplay({ reviewReasonNote: null }), null);
  assert.equal(getReviewNoteDisplay({ reviewReasonNote: "   " }), null);
});

/* ------------------------------------------------------------------ */
/* Tab → backend view mapping & URL stability                          */
/* ------------------------------------------------------------------ */

test("tabs map exactly onto the approved backend views in order", () => {
  assert.deepEqual(
    ORDER_VIEW_TABS.map((tab) => [tab.label, tab.view]),
    [
      ["Tümü", "all"],
      ["Bilgi Toplanıyor", "collecting"],
      ["İncelenecekler", "action_required"],
    ],
  );
});

test("view param normalization: unknown/missing degrades to Tümü", () => {
  assert.equal(normalizeOrderViewParam(undefined), DEFAULT_ORDER_VIEW);
  assert.equal(normalizeOrderViewParam("all"), "all");
  assert.equal(normalizeOrderViewParam("collecting"), "collecting");
  assert.equal(normalizeOrderViewParam("action_required"), "action_required");
  assert.equal(normalizeOrderViewParam("hazir"), "all");
  assert.equal(normalizeOrderViewParam(["collecting"]), "collecting");
  assert.equal(normalizeOrderViewParam("COMPLETE"), "all");
});

test("search param normalization: trim, cap at 100, empty becomes no search", () => {
  assert.equal(normalizeOrderSearchParam("  TR123456  "), "TR123456");
  assert.equal(normalizeOrderSearchParam(""), null);
  assert.equal(normalizeOrderSearchParam("   "), null);
  assert.equal(normalizeOrderSearchParam(undefined), null);
  assert.equal(normalizeOrderSearchParam("x".repeat(140))?.length, 100);
});

test("hrefs: default view omits the param; search is preserved", () => {
  assert.equal(ordersListHref({ view: "all", query: null }), "/seller/orders");
  assert.equal(
    ordersListHref({ view: "collecting", query: null }),
    "/seller/orders?view=collecting",
  );
  assert.equal(
    ordersListHref({ view: "action_required", query: "TR9" }),
    "/seller/orders?view=action_required&q=TR9",
  );
  assert.equal(
    ordersListHref({ view: "all", query: "TR123456" }),
    "/seller/orders?q=TR123456",
  );
});

test("pagination reset: view/search switches never carry an offset", () => {
  // The URL surface has no offset parameter at all, so switching tab or
  // search deterministically restarts from the first page.
  for (const view of ["all", "collecting", "action_required"] as const) {
    for (const query of [null, "TR1"]) {
      assert.equal(
        ordersListHref({ view, query }).includes("offset"),
        false,
        `${view}/${query}`,
      );
    }
  }
});

/* ------------------------------------------------------------------ */
/* Pagination — page-length rule (`toplam` is never a global total)    */
/* ------------------------------------------------------------------ */

const orderSummary = (id: number): OrderSummary => ({
  id,
  externalOrderNumber: `TR${id}`,
  productId: null,
  productNameSnapshot: null,
  customerId: 22,
  customerPhoneSnapshot: "+905321112233",
  status: "COLLECTING",
  displayStatus: "Bilgi toplanıyor",
  imageMessageId: null,
  hasImage: false,
  customText: null,
  reviewReasonCode: null,
  reviewReasonNote: null,
  version: 1,
  createdAt: "2026-08-10T12:00:00+00:00",
  updatedAt: "2026-08-10T12:05:00+00:00",
  completedAt: null,
  sellerActionRequired: false,
});

test("a full returned page may continue; a short or empty page ends the queue", () => {
  assert.equal(ORDER_PAGE_SIZE, 20);
  assert.equal(hasAnotherOrdersPage(0), false);
  assert.equal(hasAnotherOrdersPage(1), false);
  assert.equal(hasAnotherOrdersPage(19), false);
  assert.equal(hasAnotherOrdersPage(20), true);
  assert.equal(hasAnotherOrdersPage(21), true);
});

test("exactly 20 / 40 items must not be treated as a finished global total", () => {
  // The previous bug: rows.length === toplam (page length) hid later pages.
  assert.equal(hasAnotherOrdersPage(20), true);
  assert.equal(hasAnotherOrdersPage(20, 20), true);
  assert.equal(hasAnotherOrdersPage(19, 20), false);
});

test("page merges dedupe by order id and keep backend ordering verbatim", () => {
  const merged = mergeOrdersPage(
    [orderSummary(1), orderSummary(2)],
    [orderSummary(2), orderSummary(3)],
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    [1, 2, 3],
  );
});

/* ------------------------------------------------------------------ */
/* Empty states (context-aware)                                        */
/* ------------------------------------------------------------------ */

test("empty states match the approved copy per context", () => {
  const noFilters = { search: false, product: false };
  assert.equal(
    orderListEmptyCopy("all", noFilters).title,
    "Henüz sipariş bilgisi yok.",
  );
  assert.ok(orderListEmptyCopy("all", noFilters).description !== null);
  assert.equal(
    orderListEmptyCopy("collecting", noFilters).title,
    "Şu anda bilgisi toplanan sipariş yok.",
  );
  assert.equal(
    orderListEmptyCopy("action_required", noFilters).title,
    "Şu anda incelemeniz gereken sipariş yok.",
  );
  // Search empty state wins over view copy in every view.
  for (const view of ["all", "collecting", "action_required"] as const) {
    assert.equal(
      orderListEmptyCopy(view, { search: true, product: false }).title,
      "Bu sipariş numarasıyla eşleşen kayıt bulunamadı.",
    );
  }
});

test("product-filtered empty is distinct from true empty and mentions clearing", () => {
  for (const view of ["all", "collecting", "action_required"] as const) {
    const copy = orderListEmptyCopy(view, { search: false, product: true });
    assert.equal(
      copy.title,
      "Bu ürün filtresiyle eşleşen sipariş bulunamadı.",
    );
    assert.match(copy.description ?? "", /Filtreyi kaldır/);
    assert.notEqual(copy.title, orderListEmptyCopy(view, { search: false, product: false }).title);
  }
  // Exact search stays the most specific message when both are active.
  assert.equal(
    orderListEmptyCopy("all", { search: true, product: true }).title,
    "Bu sipariş numarasıyla eşleşen kayıt bulunamadı.",
  );
});

/* ------------------------------------------------------------------ */
/* Image preview: media success / failure                              */
/* ------------------------------------------------------------------ */

test("media preview reducer: open → loading → ready → close", () => {
  let state = orderImagePreviewInitial;
  assert.equal(state.phase, "idle");
  state = reduceOrderImagePreview(state, { type: "open" });
  assert.equal(state.phase, "loading");
  state = reduceOrderImagePreview(state, {
    type: "loaded",
    objectUrl: "blob:local/1",
    contentType: "image/jpeg",
  });
  assert.deepEqual(state, {
    phase: "ready",
    objectUrl: "blob:local/1",
    contentType: "image/jpeg",
  });
  state = reduceOrderImagePreview(state, { type: "close" });
  assert.equal(state.phase, "idle");
});

test("media preview reducer: failure lands on error and recovers", () => {
  let state = reduceOrderImagePreview(orderImagePreviewInitial, { type: "open" });
  state = reduceOrderImagePreview(state, { type: "failed" });
  assert.equal(state.phase, "error");
  // Retry from error re-enters loading; close returns to idle.
  state = reduceOrderImagePreview(state, { type: "open" });
  assert.equal(state.phase, "loading");
  state = reduceOrderImagePreview(state, { type: "close" });
  assert.equal(state.phase, "idle");
});

test("media success: fetcher resolves into an object URL exactly once", async () => {
  const created: string[] = [];
  const result = await resolveOrderImagePreview(
    async () => ({
      blob: new Blob(["fake-bytes"], { type: "image/png" }),
      contentType: "image/png",
    }),
    () => {
      const url = `blob:local/${created.length + 1}`;
      created.push(url);
      return url;
    },
  );
  assert.deepEqual(result, {
    ok: true,
    objectUrl: "blob:local/1",
    contentType: "image/png",
  });
  assert.equal(created.length, 1);
});

test("media failure collapses to a calm failure result (list unaffected)", async () => {
  // Any upstream failure (proxy closed, network, token, 422 allowlist
  // rejection) surfaces as a simple failure — no throw, no internals.
  const failures = [
    new Error("network down"),
    Object.assign(new Error("unauthorized"), { status: 401 }),
    "weird failure",
  ];
  for (const failure of failures) {
    const result = await resolveOrderImagePreview(
      async () => {
        throw failure;
      },
      () => {
        throw new Error("createObjectUrl must not be called on failure");
      },
    );
    assert.deepEqual(result, { ok: false });
  }
});

/* ------------------------------------------------------------------ */
/* Product line + conversation link (worklist hierarchy)               */
/* ------------------------------------------------------------------ */

test("product name: stored snapshot renders trimmed; internal ids never leak", () => {
  assert.equal(
    getProductNameDisplay({ productNameSnapshot: "Kişiye Özel Kupa" }),
    "Kişiye Özel Kupa",
  );
  assert.equal(
    getProductNameDisplay({ productNameSnapshot: "  Termos 500ml " }),
    "Termos 500ml",
  );
});

test("product name: absent/blank snapshot omits the line — no fake fallback", () => {
  for (const productNameSnapshot of [null, "", "   "]) {
    assert.equal(getProductNameDisplay({ productNameSnapshot }), null);
  }
});

test("a valid customer id builds the canonical conversation route", () => {
  assert.equal(getOrderConversationHref(31), "/seller/conversations/31");
  assert.equal(ORDER_OPEN_CONVERSATION_LABEL, "Konuşmayı aç");
});

test("absent or invalid customer id yields no conversation link", () => {
  assert.equal(getOrderConversationHref(null), null);
  assert.equal(getOrderConversationHref(undefined), null);
  assert.equal(getOrderConversationHref(0), null);
  assert.equal(getOrderConversationHref(-1), null);
  assert.equal(getOrderConversationHref(2.5), null);
});

/* ------------------------------------------------------------------ */
/* Neutral search copy (no fabricated marketplace format)              */
/* ------------------------------------------------------------------ */

test("search copy is neutral and teaches no fabricated number format", () => {
  assert.equal(ORDER_SEARCH_PLACEHOLDER, "Sipariş numarasıyla ara");
  assert.doesNotMatch(ORDER_SEARCH_PLACEHOLDER, /Örn\.|TR\d/);
});

/* ------------------------------------------------------------------ */
/* Product filter + selected order (URL params, hrefs)                 */
/* ------------------------------------------------------------------ */

test("product param admits real positive ids only", () => {
  assert.equal(normalizeOrderProductParam("12"), 12);
  assert.equal(normalizeOrderProductParam(" 3 "), 3);
  for (const junk of ["0", "-4", "1.5", "abc", "", undefined]) {
    assert.equal(normalizeOrderProductParam(junk), null, String(junk));
  }
  assert.equal(normalizeOrderProductParam(["7", "9"]), 7);
});

test("order selection param is a positive integer or nothing", () => {
  assert.equal(normalizeOrderSelectionParam("41"), 41);
  for (const junk of ["0", "-1", "2.5", "id", "", undefined]) {
    assert.equal(normalizeOrderSelectionParam(junk), null, String(junk));
  }
});

test("href carries product and selection; filter hrefs drop the selection", () => {
  assert.equal(
    ordersListHref({ view: "all", query: null, productId: 12 }),
    "/seller/orders?product=12",
  );
  assert.equal(
    ordersListHref({
      view: "collecting",
      query: "TR1",
      productId: 12,
      orderId: 41,
    }),
    "/seller/orders?view=collecting&q=TR1&product=12&order=41",
  );
  // Filter navigations simply do not pass orderId: the selection is
  // dropped by construction, never carried into a new filter state.
  assert.equal(
    ordersListHref({ view: "collecting", query: null, productId: 12 }).includes(
      "order=",
    ),
    false,
  );
  // Invalid ids never appear in the URL.
  assert.equal(
    ordersListHref({ view: "all", query: null, productId: 0, orderId: -1 }),
    "/seller/orders",
  );
});

/* ------------------------------------------------------------------ */
/* Dynamic-field snapshot value display                                */
/* ------------------------------------------------------------------ */

test("field values render per backend-normalized shape", () => {
  assert.deepEqual(
    getOrderFieldValueDisplay({
      options: [],
      value: { kind: "text", text: "Deniz" },
    }),
    { kind: "text", text: "Deniz" },
  );
  assert.deepEqual(
    getOrderFieldValueDisplay({
      options: [],
      value: { kind: "number", value: 2 },
    }),
    { kind: "text", text: "2" },
  );
  assert.deepEqual(
    getOrderFieldValueDisplay({
      options: [],
      value: { kind: "boolean", value: true },
    }),
    { kind: "text", text: "Evet" },
  );
  assert.deepEqual(
    getOrderFieldValueDisplay({
      options: [],
      value: { kind: "boolean", value: false },
    }),
    { kind: "text", text: "Hayır" },
  );
  assert.deepEqual(
    getOrderFieldValueDisplay({
      options: [],
      value: { kind: "image", messageId: 104 },
    }),
    { kind: "image", messageId: 104 },
  );
});

test("choice values resolve to the snapshot's option label when present", () => {
  const options = [
    { value: "white", label: "Beyaz" },
    { value: "black", label: null },
  ];
  assert.deepEqual(
    getOrderFieldValueDisplay({
      options,
      value: { kind: "single_choice", value: "white" },
    }),
    { kind: "text", text: "Beyaz" },
  );
  // No label in the snapshot → the canonical value itself, verbatim.
  assert.deepEqual(
    getOrderFieldValueDisplay({
      options,
      value: { kind: "single_choice", value: "black" },
    }),
    { kind: "text", text: "black" },
  );
  assert.deepEqual(
    getOrderFieldValueDisplay({
      options,
      value: { kind: "multi_choice", values: ["white", "black"] },
    }),
    { kind: "text", text: "Beyaz, black" },
  );
});

test("a not-yet-collected field value is pending — nothing is invented", () => {
  assert.deepEqual(
    getOrderFieldValueDisplay({ options: [], value: null }),
    { kind: "pending" },
  );
});
