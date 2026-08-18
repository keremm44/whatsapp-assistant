import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearWorkbenchNavigationNamespace,
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
