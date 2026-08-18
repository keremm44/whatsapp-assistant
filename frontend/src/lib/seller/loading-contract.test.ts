import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (relative: string): string => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(dir, relative), "utf8").replace(/\r\n?/g, "\n");
};

test("paused route keeps the destination heading visible while data loads", () => {
  const source = read("../../app/seller/paused/loading.tsx");
  assert.match(source, /title="Yanıtı Durdurulanlar"/);
  assert.match(source, /aria-label="Yanıtı durdurulan konuşmalar yükleniyor"/);
});

test("paused loading uses one restrained activity signal and static skeletons", () => {
  const source = read("../../app/seller/paused/loading.tsx");
  assert.equal((source.match(/<LoadingSignal\b/g) ?? []).length, 1);
  assert.match(source, /skeleton animate-none/);
  assert.equal(source.includes("<Spinner"), false);
  assert.equal(source.includes("animate-pulse"), false);
});
