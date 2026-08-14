/**
 * Record-mutation gate ownership tests (`record-mutation-gate.ts`).
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/record-mutation-gate.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  acquireRecordMutation,
  createRecordMutationGate,
  isRecordMutationLocked,
  ownsRecordMutation,
  shouldDisengageRecordMutationGate,
} from "./record-mutation-gate.ts";

test("rendered lock covers mutation AND refresh, unlocked only when idle", () => {
  // mutation running → locked
  assert.equal(
    isRecordMutationLocked({ mutationInFlight: true, refreshPending: false }),
    true,
  );
  // authoritative refresh pending (versions not fresh yet) → locked
  assert.equal(
    isRecordMutationLocked({ mutationInFlight: false, refreshPending: true }),
    true,
  );
  assert.equal(
    isRecordMutationLocked({ mutationInFlight: true, refreshPending: true }),
    true,
  );
  // neither owns work → unlocked
  assert.equal(
    isRecordMutationLocked({ mutationInFlight: false, refreshPending: false }),
    false,
  );
});

test("the synchronous core disengages only when neither owns work", () => {
  assert.equal(
    shouldDisengageRecordMutationGate({
      mutationInFlight: true,
      refreshPending: false,
    }),
    false,
  );
  assert.equal(
    shouldDisengageRecordMutationGate({
      mutationInFlight: false,
      refreshPending: true,
    }),
    false,
  );
  assert.equal(
    shouldDisengageRecordMutationGate({
      mutationInFlight: false,
      refreshPending: false,
    }),
    true,
  );
});

test("sibling acquisition fails closed while the gate is engaged", () => {
  const gate = createRecordMutationGate();
  const first = acquireRecordMutation(gate);
  assert.equal(first, 1);
  // Rename holds the record → Status (or a rapid double click) gets
  // null and must produce no side effects.
  assert.equal(acquireRecordMutation(gate), null);
  assert.equal(acquireRecordMutation(gate), null);
  assert.equal(ownsRecordMutation(gate, first!), true);
});

test("a stale owner cannot release a newer owner", () => {
  const gate = createRecordMutationGate();
  const first = acquireRecordMutation(gate)!;

  // First operation fully finishes; the core disengages.
  gate.engaged = false;

  // A new operation acquires: it becomes the sole owner.
  const second = acquireRecordMutation(gate)!;
  assert.notEqual(second, first);
  assert.equal(ownsRecordMutation(gate, second), true);

  // The old operation's late finalizer no longer owns anything: its
  // finish call must be a strict no-op against the newer lifecycle.
  assert.equal(ownsRecordMutation(gate, first), false);
});

test("a new acquisition is possible after a full release", () => {
  const gate = createRecordMutationGate();
  const first = acquireRecordMutation(gate)!;
  assert.equal(gate.engaged, true);

  // Release (mirrors the hook effect once mutation + refresh are idle).
  gate.engaged = false;
  const second = acquireRecordMutation(gate);
  assert.equal(second, first + 1);
  assert.equal(gate.engaged, true);
});
