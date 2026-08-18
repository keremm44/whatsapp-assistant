import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  parseOrderDetailResponse,
  parseOrdersListResponse,
} from "./orders.ts";
import {
  parseReturnDetailResponse,
  parseReturnListResponse,
} from "./returns.ts";


type SharedContract = {
  schema_version: number;
  orders: {
    list_response: unknown;
    detail_response: unknown;
  };
  returns: {
    list_response: unknown;
    detail_response: unknown;
  };
};

const contractUrl = new URL(
  "../../../../contracts/seller-orders-returns-v1.json",
  import.meta.url,
);
const contract = JSON.parse(
  readFileSync(contractUrl, "utf8"),
) as SharedContract;


test("shared Orders backend fixtures parse through the frontend contract", () => {
  assert.equal(contract.schema_version, 1);

  const list = parseOrdersListResponse(contract.orders.list_response);
  assert.equal(list.view, "all");
  assert.equal(list.orders.length, 1);
  assert.equal(list.orders[0]?.id, 41);
  assert.equal(list.orders[0]?.displayStatus, "Bilgi toplanıyor");
  assert.equal(list.orders[0]?.imageMessageId, 104);
  assert.equal(list.orders[0]?.hasImage, true);
  assert.equal(list.orders[0]?.customText, "İyi ki doğdun Deniz");

  const detail = parseOrderDetailResponse(contract.orders.detail_response);
  assert.equal(detail.order.id, 41);
  assert.equal(detail.order.customerNote, "Hediye paketi olsun lütfen");
  assert.equal(detail.order.sellerActionRequired, false);
  assert.equal(detail.fields.length, 1);
  assert.deepEqual(detail.fields[0]?.value, {
    kind: "single_choice",
    value: "white",
  });
});


test("shared Returns quantity-review fixtures parse through the frontend contract", () => {
  assert.equal(contract.schema_version, 1);

  const list = parseReturnListResponse(contract.returns.list_response);
  assert.equal(list.view, "action_required");
  assert.equal(list.requests.length, 1);

  const request = list.requests[0];
  assert.equal(request?.issueType, "QUANTITY_LIMIT_REQUEST");
  assert.equal(request?.requestedQuantity, 50);
  assert.equal(request?.minQuantitySnapshot, 100);
  assert.equal(request?.maxQuantitySnapshot, 500);
  assert.equal(request?.quantityLimitDirection, "below_min");
  assert.equal(request?.imageRequirementSnapshot, "NOT_REQUESTED");
  assert.equal(request?.status, "SELLER_REVIEW_REQUIRED");
  assert.equal(request?.displayIssueType, "Adet sınırı talebi");
  assert.equal(request?.sellerActionRequired, true);

  const detail = parseReturnDetailResponse(contract.returns.detail_response);
  assert.equal(detail.request.id, 51);
  assert.equal(detail.request.issueType, "QUANTITY_LIMIT_REQUEST");
  assert.equal(detail.request.requestedQuantity, 50);
  assert.equal(detail.request.quantityLimitDirection, "below_min");
  assert.deepEqual(detail.missingFields, []);
  assert.deepEqual(detail.evidence, []);
});
