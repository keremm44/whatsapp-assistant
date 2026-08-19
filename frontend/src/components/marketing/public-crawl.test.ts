import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const appFile = (name: string) =>
  readFileSync(path.join(directory, "../../app", name), "utf8");

test("robots indexes the public site without exposing workspace routes", () => {
  const robots = appFile("robots.ts");

  assert.match(robots, /allow: "\/"/);
  assert.match(robots, /"\/admin\/"/);
  assert.match(robots, /"\/auth\/"/);
  assert.match(robots, /"\/giris"/);
  assert.match(robots, /"\/preview\/"/);
  assert.match(robots, /"\/seller\/"/);
  assert.match(robots, /siteConfig\.url/);
});

test("sitemap contains only the current public landing page", () => {
  const sitemap = appFile("sitemap.ts");

  assert.match(sitemap, /url: siteConfig\.url/);
  assert.doesNotMatch(sitemap, /\/seller|\/admin|\/giris|\/preview/);
});
