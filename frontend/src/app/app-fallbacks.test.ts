import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(directory, name), "utf8");

test("root fallback actions keep mobile touch targets", () => {
  const error = read("error.tsx");
  const notFound = read("not-found.tsx");

  assert.match(error, /inline-flex min-h-11 items-center/);
  assert.match(notFound, /inline-flex min-h-11 items-center/);
});

test("auth and first-paint fallbacks keep the Instrument palette", () => {
  const authLayout = read("(auth)/layout.tsx");
  const loading = read("loading.tsx");
  const error = read("error.tsx");
  const notFound = read("not-found.tsx");

  assert.match(authLayout, /marketing-theme auth-canvas/);
  assert.match(authLayout, /bg-raised\/95/);
  assert.match(loading, /marketing-theme marketing-field/);
  assert.match(loading, /Çalışma alanı hazırlanıyor/);
  assert.match(error, /marketing-theme marketing-field/);
  assert.match(notFound, /marketing-theme marketing-field/);
});
