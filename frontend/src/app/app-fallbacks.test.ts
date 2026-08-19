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
