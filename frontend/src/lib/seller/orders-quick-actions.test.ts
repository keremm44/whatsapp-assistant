import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  getCopyableOrderNumber,
  getRowImageActionLabel,
  getRowImageMessageId,
  runOrderNumberCopy,
} from "./orders-format.ts";
import type { OrderSummary } from "./orders.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readCode = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");

const summary = (overrides: Partial<OrderSummary> = {}): OrderSummary => ({
  id: 7,
  externalOrderNumber: "TR-2026-0007",
  customerId: 42,
  customerName: "Ayşe",
  customerPhone: "+905551112233",
  productId: 9,
  productName: "Kupa",
  status: "COLLECTING",
  displayStatus: "Bilgi toplanıyor",
  sellerActionRequired: false,
  sellerReviewReason: null,
  customText: null,
  hasImage: true,
  imageMessageId: 55,
  version: 3,
  updatedAt: "2026-08-18T12:00:00+00:00",
  ...overrides,
});

test("copy target exists only when a real order number exists", () => {
  assert.equal(getCopyableOrderNumber(summary()), "TR-2026-0007");
  assert.equal(
    getCopyableOrderNumber(summary({ externalOrderNumber: null })),
    null,
  );
});

test("the exact stored order number is copied, never a normalized form", () => {
  assert.equal(
    getCopyableOrderNumber(
      summary({ externalOrderNumber: "  TR-2026-0007 / A  " }),
    ),
    "  TR-2026-0007 / A  ",
  );
});

test("the internal id is never used as a copy fallback", () => {
  assert.equal(
    getCopyableOrderNumber(summary({ externalOrderNumber: null, id: 999 })),
    null,
  );
});

test("pending rows keep their truthful presentation and gain no action", () => {
  const row = summary({ externalOrderNumber: null });
  assert.equal(getCopyableOrderNumber(row), null);
});

test("a successful copy writes the exact value and confirms", async () => {
  const writes: string[] = [];
  const result = await runOrderNumberCopy("  TR-1 / A  ", async (value) => {
    writes.push(value);
  });

  assert.deepEqual(writes, ["  TR-1 / A  "]);
  assert.equal(result, "copied");
});

test("a blocked or unavailable clipboard degrades calmly, never throws", async () => {
  const result = await runOrderNumberCopy("TR-1", async () => {
    throw new Error("clipboard blocked");
  });
  assert.equal(result, "error");
});

test("image trigger requires hasImage AND a usable message id", () => {
  assert.equal(getRowImageMessageId(summary()), 55);
  assert.equal(
    getRowImageMessageId(summary({ hasImage: false, imageMessageId: null })),
    null,
  );
  assert.equal(
    getRowImageMessageId(summary({ hasImage: true, imageMessageId: null })),
    null,
  );
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

  // The anchor must close BEFORE the copy action is rendered, so no
  // button can ever be a descendant of an anchor.
  const anchorClose = row.indexOf("</a>");
  assert.ok(anchorClose > -1, "the row link must exist");
  assert.ok(
    row.indexOf("<CopyOrderNumberAction") > anchorClose,
    "the copy action must render after the anchor closes",
  );
  // The image action renders before the anchor opens (leading edge).
  // Search only for the tag itself so this assertion is agnostic to LF/CRLF
  // checkout style on macOS/Linux/Windows.
  const anchorOpen = row.indexOf("<a");
  assert.ok(anchorOpen > -1, "the row link opening tag must exist");
  assert.ok(
    row.indexOf("<OrderImageAction") < anchorOpen,
    "the image action must render outside the anchor",
  );

  // No invalid nesting: inspect the anchor's OWN element region
  // (from the opening tag to its matching close) rather than the whole
  // file, so a sibling button later in the module is not a false hit.
  // Slice from just AFTER the anchor's own opening tag so that tag is
  // not mistaken for a nested anchor.
  const anchorRegion = row.slice(
    row.indexOf(">", anchorOpen) + 1,
    anchorClose,
  );
  assert.doesNotMatch(
    anchorRegion,
    /<button\b/,
    "the row anchor must not contain a button",
  );
});

test("quick actions use real buttons and stop propagation", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");
  assert.match(row, /<button\s+type="button"/);
  assert.match(row, /event\.stopPropagation\(\)/);
});

test("row navigation and selection semantics are preserved", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");
  assert.match(row, /aria-current=/);
  assert.match(row, /event\.preventDefault\(\)/);
  assert.match(row, /onSelect\(order\.id\)/);
});

test("no list-row component fetches order detail", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");
  assert.doesNotMatch(row, /fetchSellerOrderDetail/);
});

test("row media goes through the existing authenticated proxy helper", () => {
  const thumbnail = readCode("../../components/seller/orders/order-row-thumbnail.tsx");
  assert.match(thumbnail, /fetchSellerMedia/);
});

test("thumbnails are deferred, so a long queue does not fan out requests", () => {
  const thumbnail = readCode("../../components/seller/orders/order-row-thumbnail.tsx");
  assert.match(thumbnail, /IntersectionObserver/);
});

test("the row reuses the shared media preview dialog primitive", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");
  assert.match(row, /OrderImagePreview/);
});

test("quick actions are labelled, announced, and touch-sized", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");
  assert.match(row, /aria-label=/);
  assert.match(row, /role="status"/);
  assert.match(row, /h-11 w-11/);
});

test("a failed thumbnail still says an image exists and keeps the row", () => {
  const thumbnail = readCode("../../components/seller/orders/order-row-thumbnail.tsx");
  assert.match(thumbnail, /Görsel yüklenemedi/);
});

test("list ordering and pagination are untouched by this feature", () => {
  const row = readCode("../../components/seller/orders/order-row.tsx");
  assert.doesNotMatch(row, /sort\(/);
  assert.doesNotMatch(row, /offset/);
});
