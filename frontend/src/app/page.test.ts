import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(directory, name), "utf8");

test("root arrival redirects to login", () => {
  const page = read("page.tsx");

  assert.match(page, /redirect\(["']\/giris["']\)/);
  assert.doesNotMatch(page, /Hero/);
});

test("login page remains the unauthenticated entry", () => {
  const giris = read("(auth)/giris/page.tsx");

  assert.match(giris, /Hesabınıza giriş yapın/);
  assert.match(giris, /<LoginForm \/>/);
});

test("robots does not advertise a public marketing site", () => {
  const robots = read("robots.ts");

  assert.match(robots, /disallow:/);
  assert.match(robots, /"\/giris"/);
  assert.match(robots, /"\/seller"/);
  assert.match(robots, /"\/admin"/);
  assert.doesNotMatch(robots, /allow: "\/"/);
});

test("sitemap lists no public pages", () => {
  const sitemap = read("sitemap.ts");

  assert.match(sitemap, /return \[\]/);
  assert.doesNotMatch(sitemap, /siteConfig\.url/);
});
