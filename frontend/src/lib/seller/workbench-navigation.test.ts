import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearWorkbenchNavigationNamespace,
  isSelectionOnlyWorkbenchNavigation,
  readWorkbenchNavigationMemory,
  workbenchNavigationStorageKey,
  writeWorkbenchNavigationMemory,
} from "./workbench-navigation.ts";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
}

test("workbench navigation memory round-trips scroll positions", () => {
  const storage = new MemoryStorage();
  const key = workbenchNavigationStorageKey("conversations", "all");

  writeWorkbenchNavigationMemory(storage, key, {
    scrollTop: 420,
    viewportY: 780,
  });

  assert.deepEqual(readWorkbenchNavigationMemory(storage, key), {
    scrollTop: 420,
    viewportY: 780,
  });
});

test("invalid stored navigation memory is ignored", () => {
  const storage = new MemoryStorage();
  const key = workbenchNavigationStorageKey("conversations", "all");

  storage.setItem(key, JSON.stringify({ scrollTop: -1, viewportY: 10 }));
  assert.equal(readWorkbenchNavigationMemory(storage, key), null);

  storage.setItem(key, "not-json");
  assert.equal(readWorkbenchNavigationMemory(storage, key), null);
});

test("clearing a namespace does not remove another workbench memory", () => {
  const storage = new MemoryStorage();
  const allKey = workbenchNavigationStorageKey("conversations", "all");
  const attentionKey = workbenchNavigationStorageKey(
    "conversations",
    "attention",
  );
  const ordersKey = workbenchNavigationStorageKey("orders", "all");

  storage.setItem(allKey, "one");
  storage.setItem(attentionKey, "two");
  storage.setItem(ordersKey, "three");

  clearWorkbenchNavigationNamespace(storage, "conversations");

  assert.equal(storage.getItem(allKey), null);
  assert.equal(storage.getItem(attentionKey), null);
  assert.equal(storage.getItem(ordersKey), "three");
});

test("selection-only navigation preserves an identical returns list context", () => {
  assert.equal(
    isSelectionOnlyWorkbenchNavigation(
      "https://example.test/seller/returns?view=handled&q=TR9&type=OTHER",
      "https://example.test/seller/returns?view=handled&q=TR9&type=OTHER&request=42",
      "request",
    ),
    true,
  );

  assert.equal(
    isSelectionOnlyWorkbenchNavigation(
      "https://example.test/seller/returns?view=handled&q=TR9&type=OTHER&request=42",
      "https://example.test/seller/returns?type=OTHER&q=TR9&view=handled",
      "request",
    ),
    true,
  );
});

test("filter changes are not treated as selection-only navigation", () => {
  assert.equal(
    isSelectionOnlyWorkbenchNavigation(
      "https://example.test/seller/returns?view=handled&request=42",
      "https://example.test/seller/returns?view=action_required",
      "request",
    ),
    false,
  );

  assert.equal(
    isSelectionOnlyWorkbenchNavigation(
      "https://example.test/seller/returns?view=handled",
      "https://example.test/seller/orders?view=handled&request=42",
      "request",
    ),
    false,
  );
});
