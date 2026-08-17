import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

import { discoverTestFiles } from "./run-tests.mjs";

test("discovers nested .test.ts files deterministically and ignores other files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wa-test-discovery-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "nested"));
  await writeFile(join(root, "z.test.ts"), "");
  await writeFile(join(root, "nested", "a.test.ts"), "");
  await writeFile(join(root, "nested", "ignored.ts"), "");
  await writeFile(join(root, "ignored.test.tsx"), "");

  const discovered = await discoverTestFiles(root);
  const normalized = discovered.map((file) =>
    relative(root, file).split(sep).join("/"),
  );

  assert.deepEqual(normalized, ["nested/a.test.ts", "z.test.ts"]);
});
