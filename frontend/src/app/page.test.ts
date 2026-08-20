import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(directory, name), "utf8");

test("root arrival renders the public product introduction", () => {
  const page = read("page.tsx");
  const landing = read("../components/marketing/landing-page.tsx");

  assert.match(page, /<LandingPage \/>/);
  assert.doesNotMatch(page, /redirect\(["']\/giris["']\)/);
  assert.match(landing, /Müşterileriniz yanıt bulurken, karar sizde kalsın/);
  assert.match(landing, /Bilmediği soruyu size bırakır/);
  assert.match(landing, /href="\/giris"/);
});

test("login page remains the unauthenticated entry", () => {
  const giris = read("(auth)/giris/page.tsx");

  assert.match(giris, /Hesabınıza giriş yapın/);
  assert.match(giris, /<LoginForm \/>/);
});

test("robots allows the public introduction but protects workspaces", () => {
  const robots = read("robots.ts");

  assert.match(robots, /allow: "\/"/);
  assert.match(robots, /"\/giris"/);
  assert.match(robots, /"\/seller"/);
  assert.match(robots, /"\/admin"/);
});

test("sitemap includes only the public introduction", () => {
  const sitemap = read("sitemap.ts");

  assert.match(sitemap, /url: siteConfig\.url/);
  assert.doesNotMatch(sitemap, /\/seller/);
  assert.doesNotMatch(sitemap, /\/giris/);
});
