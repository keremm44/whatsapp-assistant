import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(directory, name), "utf8");

test("hero promise and product proof are visible without hydration-gated reveal primitives", () => {
  const hero = read("hero.tsx");

  assert.match(hero, /<h1\b/);
  assert.doesNotMatch(hero, /BlurHeadline/);
  assert.doesNotMatch(hero, /MarketingReveal/);
});

test("seller dashboard proof uses canonical presentation copy without fake marketing links", () => {
  const panel = read("panel-section.tsx");

  assert.match(panel, /DASHBOARD_TASK_PRESENTATION/);
  assert.match(panel, /Bugün bakılabilecekler/);
  assert.doesNotMatch(panel, /href=["']#dene["']/);
});

test("conversation control selector is a pressed button group, not an incomplete tab pattern", () => {
  const control = read("control-section.tsx");

  assert.match(control, /role="group"/);
  assert.match(control, /aria-pressed=\{selected\}/);
  assert.doesNotMatch(control, /role="tablist"/);
  assert.doesNotMatch(control, /role="tab"/);
});

test("marketing attention notes use the canonical attention surface", () => {
  const systemNote = read("system-note.tsx");

  assert.match(systemNote, /bg-attention-soft/);
  assert.doesNotMatch(systemNote, /bg-accent-muted/);
});

test("application entry remains honest and non-interactive while the flow is unavailable", () => {
  const header = read("marketing-header.tsx");

  assert.match(header, /role="note"/);
  assert.match(header, /Başvuru yap/);
  assert.doesNotMatch(header, /<button[^>]*disabled/);
});

test("all public hash anchors can arm the direction-aware header suppression", () => {
  const header = read("marketing-header.tsx");

  assert.match(header, /a\[href\^="#"\]/);
  assert.match(header, /suppressHideUntil/);
});

test("demo reuses the shared proof story and chat bubbles expose the customer speaker", () => {
  const demo = read("demo-section.tsx");
  const bubbles = read("chat-bubbles.tsx");

  assert.match(demo, /MARKETING_STORY\.customerQuestion/);
  assert.match(demo, /MARKETING_STORY\.unknownAnswer/);
  assert.match(demo, /MARKETING_STORY\.returnSystemOutcome/);
  assert.match(bubbles, /Müşteri: /);
});
