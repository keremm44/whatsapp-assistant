import assert from "node:assert/strict";
import test from "node:test";

import {
  ORDER_NUMBER_REQUIRED_HELP,
  ORDER_NUMBER_REQUIRED_LABEL,
} from "./order-collection-copy.ts";

test("order number setting copy describes existing-order matching", () => {
  assert.equal(ORDER_NUMBER_REQUIRED_LABEL, "Sipariş numarası iste");
  assert.match(ORDER_NUMBER_REQUIRED_HELP, /mevcut siparişi eşlemek/i);
  assert.doesNotMatch(ORDER_NUMBER_REQUIRED_HELP, /sipariş oluştur/i);
});
