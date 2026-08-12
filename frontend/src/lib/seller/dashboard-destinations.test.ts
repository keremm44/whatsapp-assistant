/**
 * Dashboard task destination tests (`dashboard-destinations.ts`).
 *
 * Runs with Node's built-in test runner (no new test framework):
 *   node --test src/lib/seller/dashboard-destinations.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { dashboardTaskHref } from "./dashboard-destinations.ts";
import type { DashboardTask } from "./dashboard-tasks.ts";

const returnTask = (id: number): DashboardTask => ({
  id: `return_review:${id}`,
  type: "return_review",
  priority: "high",
  title: "İade incelemesi",
  summary: "Müşteri iade talebi",
  relatedEntityId: id,
  entityVersion: 2,
  createdAt: "2026-08-10T12:00:00+00:00",
  updatedAt: "2026-08-10T12:05:00+00:00",
  actionTarget: {
    kind: "return_issue_request",
    id,
    customerId: 22,
  },
  customer: {
    id: 22,
    name: "Elif",
    whatsappNumber: "+905321112233",
  },
});

const unansweredTask = (id: number): DashboardTask => ({
  id: `unanswered_question:${id}`,
  type: "unanswered_question",
  priority: "normal",
  title: "Cevaplanamayan soru",
  summary: "Bulaşık makinesinde yıkanır mı?",
  relatedEntityId: id,
  entityVersion: 1,
  createdAt: "2026-08-10T12:00:00+00:00",
  updatedAt: "2026-08-10T12:05:00+00:00",
  actionTarget: {
    kind: "unanswered_question_group",
    id,
    customerId: null,
  },
  customer: null,
});

const orderTask = (id: number): DashboardTask => ({
  id: `order_review:${id}`,
  type: "order_review",
  priority: "high",
  title: "Sipariş incelemesi",
  summary: "Ürün baskı tipi değişti.",
  relatedEntityId: id,
  entityVersion: 4,
  createdAt: "2026-08-10T12:00:00+00:00",
  updatedAt: "2026-08-10T12:05:00+00:00",
  actionTarget: {
    kind: "order",
    id,
    customerId: 22,
  },
  customer: {
    id: 22,
    name: "Elif",
    whatsappNumber: "+905321112233",
  },
});

test("return task opens the existing Returns workspace on the exact request", () => {
  assert.equal(
    dashboardTaskHref(returnTask(41)),
    "/seller/returns?request=41",
  );
});

test("unanswered task opens the existing Unanswered workspace on the exact question", () => {
  assert.equal(
    dashboardTaskHref(unansweredTask(17)),
    "/seller/unanswered?question=17",
  );
});

test("order task stays on the Orders list and never invents a detail route", () => {
  const href = dashboardTaskHref(orderTask(9));
  assert.equal(href, "/seller/orders");
  assert.equal(href.includes("/seller/orders/"), false);
});
