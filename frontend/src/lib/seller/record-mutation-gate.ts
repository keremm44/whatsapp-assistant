/**
 * Record-level mutation gate — the shared ownership rule for sibling
 * actions that PATCH the same optimistic-lock version (Product
 * Rename/Status, Rule Edit/Status, Unanswered Answer/Dismiss).
 *
 * The backend's expected_version already protects data integrity;
 * this gate prevents the frontend from MANUFACTURING avoidable 409s
 * by letting two sibling mutations start against the same soon-stale
 * version.
 *
 * Design (mirrors the product-field mutation-lock principles):
 *
 *   - one synchronous core object (held in a React ref by the hook)
 *     is the first-line re-entry gate: rapid double clicks or sibling
 *     submits cannot both pass before React renders disabled state;
 *   - acquisition hands out an ownership token; ONLY the current
 *     owner may finish the gate — a stale owner's finalizer is a
 *     no-op and can never release lifecycle state belonging to a
 *     newer owner;
 *   - the rendered lock covers the mutation lifecycle AND any
 *     authoritative refresh transition, so the gate does not reopen
 *     merely because the request promise settled while fresh
 *     versions are still being fetched.
 *
 * Pure and dependency-free so Node's built-in test runner can verify
 * the ownership rules; the React wiring lives in
 * components/shared/use-record-mutation-gate.ts.
 */

/** Synchronous gate core. Mutated in place (lives in a React ref). */
export type RecordMutationGateCore = {
  /** True while some owner holds the gate (mutation or its refresh). */
  engaged: boolean;
  /** Monotonic ownership token; only the latest owner may finish. */
  owner: number;
};

export const createRecordMutationGate = (): RecordMutationGateCore => ({
  engaged: false,
  owner: 0,
});

/**
 * Try to acquire the gate synchronously. Returns the ownership token,
 * or null when a sibling mutation (or its pending refresh) already
 * holds the record — the caller must fail closed without side
 * effects.
 */
export const acquireRecordMutation = (
  gate: RecordMutationGateCore,
): number | null => {
  if (gate.engaged) return null;
  gate.engaged = true;
  gate.owner += 1;
  return gate.owner;
};

/**
 * Whether `token` still owns the gate. A finalizer whose token no
 * longer matches (a newer owner acquired after a full release) must
 * not touch any shared lifecycle state.
 */
export const ownsRecordMutation = (
  gate: RecordMutationGateCore,
  token: number,
): boolean => gate.engaged && gate.owner === token;

/**
 * Whether the rendered lock is active: the sibling triggers/submits
 * stay natively disabled while a mutation runs OR while the
 * authoritative refresh it started is still pending.
 */
export const isRecordMutationLocked = (input: {
  mutationInFlight: boolean;
  refreshPending: boolean;
}): boolean => input.mutationInFlight || input.refreshPending;

/**
 * When the synchronous core may disengage: only once NOTHING is
 * active anymore. Transient failures (no refresh needed) reach this
 * immediately after the request finished; success/conflict paths
 * reach it only after their refresh transition completed.
 */
export const shouldDisengageRecordMutationGate = (input: {
  mutationInFlight: boolean;
  refreshPending: boolean;
}): boolean => !input.mutationInFlight && !input.refreshPending;
