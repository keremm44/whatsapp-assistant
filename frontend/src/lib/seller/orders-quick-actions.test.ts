/**
 * Orders list quick-action invariants (copy order number + inline image
 * thumbnail + image preview).
 *
 * Two layers are covered:
 *
 *   1. PURE LOGIC — what may be copied, what may render an image
 *      trigger, and that the copy path degrades calmly. These run
 *      against the real helpers in `orders-format.ts`.
 *
 *   2. SOURCE-LEVEL STRUCTURE — the interaction/network guarantees that
 *      have no dependency-free runtime surface to unit-test: no nested
 *      interactive HTML, no row navigation from a quick action, no
 *      per-row detail fetch, and reuse of the existing media proxy.
 *      These are deliberately written against SEMANTIC signals rather
 *      than full class snapshots.
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/orders-quick-actions.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { OrderSummary } from "./orders.ts";
import {
  getCopyableOrderNumber,
  getOrderNumberDisplay,
  getRowImageActionLabel,
  getRowImageMessageId,
  ORDER_NUMBER_COPIED_LABEL,
  ORDER_NUMBER_PENDING_LABEL,
  runOrderNumberCopy,
} from "./orders-format.ts";

const read = (relative: string): string => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(dir, relative), "utf8").replace(/\r\n?/g, "\n");
};

/** Source with comments stripped: assertions target real code only. */
const readCode = (relative: string): string =>
  read(relative)
    .replace(/\/\*[^]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const summary = (overrides: Partial<OrderSummary> = {}): OrderSummary => ({
  id: 4242,
  externalOrderNumber: "TR-2026-0088",
  productId: null,
  productNameSnapshot: "Seramik kupa",
  customerId: 22,
  customerPhoneSnapshot: "+905321112233",
  status: "COMPLETE",
  displayStatus: "Tamamlandı",
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
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* 1. Copy action — existence                                          */
/* ------------------------------------------------------------------ */

test("copy target exists only when a real order number exists", () => {
  assert.equal(
    getCopyableOrderNumber(summary({ externalOrderNumber: "TR-2026-0088" })),
    "TR-2026-0088",
  );

  for (const value of [null, "", "   ", "\n\t "]) {
    assert.equal(
      getCopyableOrderNumber(summary({ externalOrderNumber: value })),
      null,
      `"${String(value)}" must not be copyable`,
    );
  }
});

test("the exact stored order number is copied, never a normalized form", () => {
  const awkward = [
    " TR-2026-0088 ",
    "tr-2026-0088",
    "TR 2026 0088",
    "#TR/2026-0088",
    "TR‑2026‑0088",
  ];
  for (const value of awkward) {
    assert.equal(
      getCopyableOrderNumber(summary({ externalOrderNumber: value })),
      value,
      "the stored value must be returned verbatim",
    );
  }
});

test("the internal id is never used as a copy fallback", () => {
  const order = summary({ id: 987654, externalOrderNumber: null });
  const copyable = getCopyableOrderNumber(order);
  assert.equal(copyable, null);
  const withNumber = summary({ id: 987654, externalOrderNumber: "TR-1" });
  assert.equal(getCopyableOrderNumber(withNumber), "TR-1");
  assert.ok(!String(getCopyableOrderNumber(withNumber)).includes("987654"));
});

test("pending rows keep their truthful presentation and gain no action", () => {
  const pending = summary({
    externalOrderNumber: null,
    status: "COLLECTING",
  });
  assert.deepEqual(getOrderNumberDisplay(pending), {
    text: ORDER_NUMBER_PENDING_LABEL,
    isPending: true,
  });
  assert.equal(getCopyableOrderNumber(pending), null);

  const dashed = summary({ externalOrderNumber: null, status: "COMPLETE" });
  assert.equal(getOrderNumberDisplay(dashed).text, "—");
  assert.equal(getCopyableOrderNumber(dashed), null);
});

/* ------------------------------------------------------------------ */
/* 2. Copy action — behaviour                                          */
/* ------------------------------------------------------------------ */

test("a successful copy writes the exact value and confirms", async () => {
  const written: string[] = [];
  const state = await runOrderNumberCopy(" TR-2026-0088 ", async (text) => {
    written.push(text);
  });
  assert.equal(state, "copied");
  assert.deepEqual(written, [" TR-2026-0088 "]);
  assert.equal(ORDER_NUMBER_COPIED_LABEL, "Kopyalandı");
});

test("a blocked or unavailable clipboard degrades calmly, never throws", async () => {
  const state = await runOrderNumberCopy("TR-1", async () => {
    throw new Error("NotAllowedError");
  });
  assert.equal(state, "error");
});

/* ------------------------------------------------------------------ */
/* 3. Image trigger — existence                                        */
/* ------------------------------------------------------------------ */

test("image trigger requires hasImage AND a usable message id", () => {
  assert.equal(
    getRowImageMessageId(summary({ hasImage: true, imageMessageId: 55 })),
    55,
  );

  const refused: Partial<OrderSummary>[] = [
    { hasImage: false, imageMessageId: null },
    { hasImage: false, imageMessageId: 55 },
    { hasImage: true, imageMessageId: null },
    { hasImage: true, imageMessageId: 0 },
    { hasImage: true, imageMessageId: -3 },
    { hasImage: true, imageMessageId: 1.5 },
  ];
  for (const overrides of refused) {
    assert.equal(
      getRowImageMessageId(summary(overrides)),
      null,
      `${JSON.stringify(overrides)} must not render an image trigger`,
    );
  }
});

test("the image action is labelled by order number, never by message id", () => {
  const label = getRowImageActionLabel(
    summary({ externalOrderNumber: "TR-2026-0088" }),
  );
  assert.match(label, /TR-2026-0088/);
  assert.ok(!label.includes("55"), "internal message id must not be exposed");

  const pending = getRowImageActionLabel(
    summary({ externalOrderNumber: null }),
  );
  assert.equal(pending, "Sipariş görselini büyüt");
});

/* ------------------------------------------------------------------ */
/* 4. Row structure — valid nested interactive elements                */
/* ------------------------------------------------------------------ */

test("quick actions are siblings of the row link, not nested inside it", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");

  const anchorClose = row.indexOf("</a>");
  assert.ok(anchorClose > -1, "the row link must exist");
  assert.ok(
    row.indexOf("<CopyOrderNumberAction") > anchorClose,
    "the copy action must render after the anchor closes",
  );
  const anchorOpen = row.indexOf("<a\n");
  assert.ok(anchorOpen > -1, "the row link opening tag must exist");
  assert.ok(
    row.indexOf("<OrderImageAction") < anchorOpen,
    "the image action must render outside the anchor",
  );

  const anchorRegion = row.slice(
    row.indexOf(">", anchorOpen) + 1,
    anchorClose,
  );
  assert.doesNotMatch(
    anchorRegion,
    /<button/,
    "a button must never be nested inside the row anchor",
  );
  assert.doesNotMatch(
    anchorRegion,
    /<a\s/,
    "an anchor must never be nested inside the row anchor",
  );

  assert.match(row, /after:absolute after:inset-0/);
  assert.match(row, /relative z-10/);
});

test("quick actions use real buttons and stop propagation", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");

  assert.match(row, /<button\s+type="button"/);
  assert.doesNotMatch(row, /<(div|span)[^>]*\sonClick=/);

  const stops = row.match(/event\.stopPropagation\(\)/g);
  assert.ok(
    stops !== null && stops.length >= 2,
    "copy and image actions must both stop propagation",
  );

  const copyBlock = row.slice(row.indexOf("function CopyOrderNumberAction"));
  assert.doesNotMatch(copyBlock, /onSelect|href=/);
  const imageBlock = row.slice(
    row.indexOf("function OrderImageAction"),
    row.indexOf("function CopyOrderNumberAction"),
  );
  assert.doesNotMatch(imageBlock, /onSelect|href=/);
});

test("row navigation and selection semantics are preserved", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");

  assert.match(row, /href=\{href\}/);
  assert.match(row, /ordersListHref\(/);
  assert.match(row, /event\.metaKey/);
  assert.match(row, /event\.ctrlKey/);
  assert.match(row, /onSelect\(order\.id\)/);
  assert.match(row, /aria-current=\{isSelected \? "true" : undefined\}/);
});

/* ------------------------------------------------------------------ */
/* 5. Network behaviour — no N+1, existing proxy only                  */
/* ------------------------------------------------------------------ */

test("no list-row component fetches order detail", () => {
  for (const relative of [
    "../../components/seller/orders/order-row.tsx",
    "../../components/seller/orders/order-row-thumbnail.tsx",
  ]) {
    const source = readCode(relative);
    assert.doesNotMatch(
      source,
      /fetchOrderDetail/,
      `${relative} must not fetch order detail per row`,
    );
    assert.doesNotMatch(
      source,
      /fetchOrderList/,
      `${relative} must not refetch the list`,
    );
  }
});

test("row media goes through the existing authenticated proxy helper", () => {
  const thumb = readCode(
    "../../components/seller/orders/order-row-thumbnail.tsx",
  );

  assert.match(thumb, /fetchOrderImageMedia/);
  assert.match(thumb, /resolveOrderImagePreview/);
  assert.match(thumb, /getBrowserAccessToken/);

  assert.doesNotMatch(thumb, /https?:\/\//);
  assert.doesNotMatch(thumb, /\/seller\/messages\//);
  assert.doesNotMatch(thumb, /src=\{`/);

  assert.match(thumb, /createObjectURL/);
  assert.match(thumb, /revokeObjectURL/);

  const api = readCode("./orders-api.ts");
  assert.match(api, /\/seller\/messages\/\$\{messageId\}\/media/);
});

test("thumbnails are deferred, so a long queue does not fan out requests", () => {
  const thumb = readCode(
    "../../components/seller/orders/order-row-thumbnail.tsx",
  );
  assert.match(thumb, /IntersectionObserver/);
  assert.match(thumb, /AbortController/);
  assert.match(thumb, /controller\.abort\(\)/);
});

/* ------------------------------------------------------------------ */
/* 6. Preview + accessibility                                          */
/* ------------------------------------------------------------------ */

test("the row reuses the shared media preview dialog primitive", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");
  assert.match(row, /OrderImagePreview/);
  assert.match(row, /imageMessageId !== null \? \(/);

  const preview = readCode(
    "../../components/seller/orders/order-image-preview.tsx",
  );
  assert.match(preview, /DialogContent/);
  assert.match(preview, /DialogTitle/);
  const dialog = readCode("../../components/ui/dialog.tsx");
  assert.match(dialog, /DialogPrimitive\.Close/);
  assert.match(dialog, /aria-label="Kapat"/);
  assert.match(dialog, /@radix-ui\/react-dialog/);
});

test("quick actions are labelled, announced, and touch-sized", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");

  assert.match(row, /aria-label=\{label\}/);
  assert.match(row, /aria-label=\{`\$\{ORDER_NUMBER_COPY_LABEL\}/);
  assert.match(row, /aria-haspopup="dialog"/);

  assert.match(row, /role="status"/);
  assert.match(row, /aria-live="polite"/);
  assert.match(row, /ORDER_NUMBER_COPIED_LABEL/);

  assert.match(row, /setState\("idle"\)/);
  assert.match(row, /clearTimeout/);

  assert.match(row, /h-11 w-11 items-center justify-center/);
  const thumb = readCode(
    "../../components/seller/orders/order-row-thumbnail.tsx",
  );
  assert.match(thumb, /h-12 w-12/);

  const focusRings = row.match(/focus-visible:ring-2/g);
  assert.ok(focusRings !== null && focusRings.length >= 2);
});

test("a failed thumbnail still says an image exists and keeps the row", () => {
  const thumb = readCode(
    "../../components/seller/orders/order-row-thumbnail.tsx",
  );
  assert.match(thumb, /state\.phase === "error"/);
  assert.match(thumb, /ImageOff/);
  assert.match(thumb, /aria-hidden="true"/);
  assert.match(thumb, /alt=""/);
});

/* ------------------------------------------------------------------ */
/* 7. Untouched semantics                                              */
/* ------------------------------------------------------------------ */

test("list ordering and pagination are untouched by this feature", () => {
  const panel = readCode(
    "../../components/seller/orders/orders-list-panel.tsx",
  );
  assert.doesNotMatch(panel, /\.sort\(/);
  assert.match(panel, /rows\.map\(\(order\) => \(/);
});
