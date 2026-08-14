/**
 * Global assistant status tests (`assistant-status.ts`).
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/assistant-status.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SellerSystemStatus } from "./me.ts";
import {
  ASSISTANT_NOTICE_DESCRIPTIONS,
  ASSISTANT_NOTICE_TITLE,
  getAssistantStatusNotice,
  OPERATIONAL_SYSTEM_STATUSES,
} from "./assistant-status.ts";

const access = (
  overrides: Partial<{
    aiEnabled: boolean;
    onboardingCompleted: boolean;
    systemStatus: SellerSystemStatus;
  }> = {},
) => ({
  aiEnabled: true,
  onboardingCompleted: true,
  systemStatus: "active" as SellerSystemStatus,
  ...overrides,
});

test("normal operational state renders NO status surface at all", () => {
  // active and beta_active are the backend's own operational statuses
  // (chat_service.ACTIVE_SELLER_STATUSES) — no badge, no health chrome.
  assert.equal(getAssistantStatusNotice(access()), null);
  assert.equal(
    getAssistantStatusNotice(access({ systemStatus: "beta_active" })),
    null,
  );
  assert.deepEqual(OPERATIONAL_SYSTEM_STATUSES, ["active", "beta_active"]);
});

test("aiEnabled=false surfaces the calm not-replying notice", () => {
  const notice = getAssistantStatusNotice(access({ aiEnabled: false }));
  assert.ok(notice);
  assert.equal(notice.kind, "ai_disabled");
  assert.equal(notice.title, ASSISTANT_NOTICE_TITLE);
  assert.equal(notice.description, ASSISTANT_NOTICE_DESCRIPTIONS.ai_disabled);
});

test("incomplete onboarding surfaces its own truthful explanation", () => {
  const notice = getAssistantStatusNotice(
    access({ onboardingCompleted: false, systemStatus: "onboarding" }),
  );
  assert.ok(notice);
  assert.equal(notice.kind, "onboarding_incomplete");
  assert.match(notice.description, /kurulumu henüz tamamlanmadı/i);
});

test("every non-operational system_status surfaces the generic safe notice", () => {
  const nonOperational: SellerSystemStatus[] = [
    "onboarding",
    "admin_review_pending",
    "automatic_validation",
    "suspended",
    "cancelled",
  ];
  for (const systemStatus of nonOperational) {
    const notice = getAssistantStatusNotice(access({ systemStatus }));
    assert.ok(notice, systemStatus);
    assert.equal(notice.kind, "inactive_status", systemStatus);
    assert.equal(
      notice.description,
      ASSISTANT_NOTICE_DESCRIPTIONS.inactive_status,
      systemStatus,
    );
    // Raw enum values never leak into seller copy.
    assert.equal(notice.description.includes(systemStatus), false);
    assert.equal(notice.title.includes(systemStatus), false);
  }
});

test("precedence follows the backend gate's order for the exposed fields", () => {
  // For the three fields /seller/me exposes, the backend gate checks
  // ai_enabled first, then onboarding, then system_status — the
  // notice names the same first blocking condition among them.
  // (emergency_paused is not exposed on /seller/me, so it has no
  // frontend notice kind by design.)
  assert.equal(
    getAssistantStatusNotice(
      access({
        aiEnabled: false,
        onboardingCompleted: false,
        systemStatus: "suspended",
      }),
    )?.kind,
    "ai_disabled",
  );
  assert.equal(
    getAssistantStatusNotice(
      access({ onboardingCompleted: false, systemStatus: "suspended" }),
    )?.kind,
    "onboarding_incomplete",
  );
});

test("copy is calm and truthful — messages recorded, no invented CTA", () => {
  for (const description of Object.values(ASSISTANT_NOTICE_DESCRIPTIONS)) {
    assert.match(description, /kaydedilir/);
    assert.match(description, /otomatik yanıt gönderilmez/);
    // No invented urgency or actions the backend does not support.
    assert.doesNotMatch(
      description,
      /hemen|acil|tıklayın|etkinleştir|yeniden başlat|destek ekibi/i,
    );
  }
});
