"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  acquireRecordMutation,
  createRecordMutationGate,
  isRecordMutationLocked,
  ownsRecordMutation,
  shouldDisengageRecordMutationGate,
} from "@/lib/seller/record-mutation-gate";

export type RecordMutationGate = {
  /**
   * Rendered lock for the record's sibling actions: native `disabled`
   * on the triggers/submits that are NOT performing the work. Only
   * the active operation may be `aria-busy`.
   */
  locked: boolean;
  /**
   * Synchronous acquisition — call BEFORE any side effect in a
   * mutation handler. Returns the ownership token, or null when a
   * sibling already owns the record (fail closed, no side effects).
   */
  acquire: () => number | null;
  /**
   * Terminal call for the operation that owns `token`.
   *   refresh: true  → starts router.refresh() inside a tracked
   *                    transition; the gate stays locked until the
   *                    authoritative state has landed (success and
   *                    conflict paths).
   *   refresh: false → transient failure (or the authoritative
   *                    transition is already owned elsewhere); the
   *                    gate releases once nothing is active.
   * A stale token (no longer the owner) is a strict no-op.
   */
  finish: (token: number, options: { refresh: boolean }) => void;
};

/**
 * One shared mutation lifecycle for sibling actions on the SAME
 * optimistic-lock record (Product Rename/Status, Rule Edit/Status,
 * Unanswered Answer/Dismiss). See lib/seller/record-mutation-gate.ts
 * for the pure ownership rules; this hook adds the React state and
 * the refresh-transition tracking.
 *
 * Instantiate it at the narrowest owner of the record (the detail
 * panel / row action group), never globally.
 */
export function useRecordMutationGate(): RecordMutationGate {
  const router = useRouter();
  const coreRef = React.useRef(createRecordMutationGate());
  const [mutationInFlight, setMutationInFlight] = React.useState(false);
  const [refreshPending, startTransition] = React.useTransition();

  // The synchronous core disengages only when neither the mutation
  // nor its authoritative refresh is active — never inside a
  // request's finally, which would open a window between the promise
  // settling and the refreshed versions landing.
  React.useEffect(() => {
    if (
      shouldDisengageRecordMutationGate({ mutationInFlight, refreshPending })
    ) {
      coreRef.current.engaged = false;
    }
  }, [mutationInFlight, refreshPending]);

  const acquire = React.useCallback((): number | null => {
    const token = acquireRecordMutation(coreRef.current);
    if (token !== null) {
      setMutationInFlight(true);
    }
    return token;
  }, []);

  const finish = React.useCallback(
    (token: number, options: { refresh: boolean }) => {
      // Ownership check: a stale finalizer must never release (or
      // refresh on behalf of) a newer owner's lifecycle.
      if (!ownsRecordMutation(coreRef.current, token)) return;
      if (options.refresh) {
        startTransition(() => {
          router.refresh();
        });
      }
      setMutationInFlight(false);
    },
    [router],
  );

  return {
    locked: isRecordMutationLocked({ mutationInFlight, refreshPending }),
    acquire,
    finish,
  };
}
