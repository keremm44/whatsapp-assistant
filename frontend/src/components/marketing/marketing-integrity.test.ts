import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(directory, name), "utf8");

test("hero is server-visible and no longer uses the classic split mockup composition", () => {
  const hero = read("hero.tsx");

  assert.match(hero, /<h1\b/);
  assert.match(hero, /Her mesaj dikkatinizi istememeli/);
  assert.match(hero, /OwnershipLedgerRow/);
  assert.doesNotMatch(hero, /MarketingReveal/);
  assert.doesNotMatch(hero, /lg:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(480px,1\.1fr\)\]/);
});

test("daily value contrast is folded into the hero instead of a standalone section", () => {
  const page = read("../../app/(public)/page.tsx");
  const hero = read("hero.tsx");

  assert.doesNotMatch(page, /DayContrast/);
  assert.match(hero, /id="nasil-calisir"/);
  assert.match(hero, /Rutin konuşmalar/);
  assert.match(hero, /Karar gerekenler/);
});

test("seller dashboard proof uses canonical presentation copy without fake marketing links", () => {
  const panel = read("panel-section.tsx");

  assert.match(panel, /DASHBOARD_TASK_PRESENTATION/);
  assert.match(panel, /Bugün bakılabilecekler/);
  assert.match(panel, /İade \/ sorun talebi inceleme bekliyor/);
  assert.match(panel, /Cevaplanamayan müşteri sorusu/);
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

test("return review stays seller-attention and never masquerades as assistant-paused", () => {
  const control = read("control-section.tsx");
  const demo = read("demo-section.tsx");
  const panel = read("panel-section.tsx");

  assert.match(demo, /returnOutcome:[\s\S]*?tone: "attention"/);
  assert.doesNotMatch(demo, /tone\?: "attention" \| "paused"/);
  assert.match(control, /tone="attention"/);
  assert.match(control, /StatusChip tone="attention"/);
  assert.match(panel, /tone="attention"/);
  assert.doesNotMatch(control, /Yanıtlar durduruldu/);
  assert.match(control, /Asistan bekler; bu konuşmanın yanıtlarını siz yönetirsiniz\./);
  assert.match(control, /Asistan yeni mesajlarda yeniden devreye girer\./);
});

test("reveal motion is progressive enhancement and does not flicker visible content", () => {
  const motion = read("marketing-motion.tsx");
  const control = read("control-section.tsx");

  assert.match(motion, /useState\(true\)/);
  assert.match(motion, /alreadyInViewport/);
  assert.match(motion, /motionReady && styles\.reveal/);
  assert.match(motion, /\(!motionReady \|\| visible\) && styles\.revealVisible/);
  assert.match(control, /useState\(4\)/);
  assert.match(control, /if \(alreadyInViewport\) return;/);
});

test("marketing motion fails open when IntersectionObserver is unavailable", () => {
  const motion = read("marketing-motion.tsx");
  const control = read("control-section.tsx");

  assert.match(
    motion,
    /media\.matches \|\| typeof IntersectionObserver === ['"]undefined['"]\) return;/,
  );
  assert.match(
    motion,
    /if \(typeof IntersectionObserver === ['"]undefined['"]\) \{\s*setVisible\(true\);\s*return;/,
  );
  assert.match(
    motion,
    /sections\.length === 0 \|\| typeof IntersectionObserver === ['"]undefined['"]\) return;/,
  );
  assert.match(
    control,
    /media\.matches \|\| typeof IntersectionObserver === "undefined"\) return;/,
  );
});

test("desktop dock visibility and active state are derived rather than fabricated", () => {
  const motion = read("marketing-motion.tsx");
  const motionCss = read("marketing-motion.module.css");

  assert.match(motion, /styles\.dock, ['"]hidden lg:flex['"]/);
  assert.match(motion, /useState<string \| null>\(null\)/);
  assert.match(motion, /intersectionRatios/);
  assert.doesNotMatch(motionCss, /\.dock\s*\{[^}]*\bdisplay\s*:/s);
});

test("public loading mirrors the full-width ownership ledger instead of the retired split hero", () => {
  const loading = read("../../app/(public)/loading.tsx");

  assert.match(loading, /max-w-\[1180px\]/);
  assert.match(loading, /\["08:42", "09:17", "10:21", "11:03"\]/);
  assert.match(loading, /md:grid-cols-\[72px_minmax\(0,1fr\)_220px\]/);
  assert.doesNotMatch(loading, /minmax\(0,0\.9fr\)_minmax\(480px,1\.1fr\)/);
});

test("public layout offers a focus-only skip link to a focusable main landmark", () => {
  const layout = read("../../app/(public)/layout.tsx");

  assert.match(layout, /href="#main-content"/);
  assert.match(layout, /Ana içeriğe geç/);
  assert.match(layout, /<main id="main-content" tabIndex=\{-1\}/);
});

test("primary marketing controls keep real mobile touch targets", () => {
  const header = read("marketing-header.tsx");
  const hero = read("hero.tsx");
  const control = read("control-section.tsx");
  const demo = read("demo-section.tsx");
  const footer = read("marketing-footer.tsx");

  assert.match(header, /min-h-11/);
  assert.match(hero, /min-h-11/);
  assert.match(control, /min-h-11/);
  assert.match(demo, /min-h-11/);
  assert.match(footer, /min-h-11/);
});

test("marketing header can shrink safely on narrow mobile widths", () => {
  const header = read("marketing-header.tsx");

  assert.match(header, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(header, /lg:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(header, /min-h-11 min-w-0 w-fit max-w-full/);
  assert.match(header, /className="min-w-0 \[&>span:last-child\]:hidden/);
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

test("one 11:03 return record continues from the hero through control into seller work", () => {
  const story = read("marketing-story.ts");
  const hero = read("hero.tsx");
  const control = read("control-section.tsx");
  const panel = read("panel-section.tsx");

  assert.match(story, /returnReview:[\s\S]*?time: "11:03"/);
  assert.match(hero, /ledger\.returnReview/);
  assert.match(control, /MARKETING_STORY\.ledger\.returnReview/);
  assert.match(panel, /MARKETING_STORY\.ledger\.returnReview/);
  assert.match(panel, /MARKETING_STORY\.returnQuestion/);
});

test("ownership ledger is a ruled workday grammar, not another rounded feature-card primitive", () => {
  const thread = read("story-thread.tsx");

  assert.match(thread, /export function OwnershipLedgerRow/);
  assert.match(thread, /md:grid-cols-\[72px_minmax\(0,1fr\)_220px\]/);
  assert.match(thread, /border-t border-divider/);
  assert.match(thread, /border-attention bg-attention/);
  assert.doesNotMatch(thread, /OwnershipLedgerRow[\s\S]*?rounded-sheet/);
});

test("ownership selector uses one moving material plate instead of three selected fills", () => {
  const control = read("control-section.tsx");

  assert.match(control, /grid-rows-3/);
  assert.match(control, /h-1\/3 bg-chrome-hover/);
  assert.match(control, /translate-y-\[200%\]/);
  assert.match(control, /sm:translate-x-\[200%\]/);
  assert.doesNotMatch(control, /selected\s*\?\s*"bg-chrome-hover/);
});

test("marketing reveal grammar still distinguishes editorial, product, and state roles", () => {
  const motion = read("marketing-motion.tsx");
  const motionCss = read("marketing-motion.module.css");
  const demo = read("demo-section.tsx");
  const panel = read("panel-section.tsx");
  const onboarding = read("onboarding-section.tsx");

  assert.match(motion, /'editorial' \| 'product' \| 'state'/);
  assert.match(motionCss, /\.revealEditorial/);
  assert.match(motionCss, /\.revealProduct/);
  assert.match(motionCss, /\.revealState/);
  assert.match(demo, /variant="product"/);
  assert.match(panel, /variant="product"/);
  assert.match(onboarding, /variant="product"/);
});

test("demo message rhythm delays the response and animates only mounted additions", () => {
  const demo = read("demo-section.tsx");
  const motion = read("marketing-motion.tsx");
  const motionCss = read("marketing-motion.module.css");

  assert.match(demo, /const REPLY_STAGGER_MS = 140/);
  assert.match(demo, /MarketingMessageArrival/);
  assert.match(demo, /key=\{`\$\{stepId\}-\$\{index\}`\}/);
  assert.match(motion, /export function MarketingMessageArrival/);
  assert.match(motionCss, /translateY\(4px\)/);
  assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.messageArrival/);
});

test("final resolves ownership without returning to a giant CTA card", () => {
  const support = read("support-section.tsx");

  assert.match(support, /Ownership sonucu/);
  assert.match(support, />\s*Asistanda\s*</);
  assert.match(support, />\s*Sizde\s*</);
  assert.match(support, /WhatsApp işinizi böyle bölüştürün/);
  assert.doesNotMatch(support, /rounded-sheet/);
  assert.doesNotMatch(support, /min-h-\[360px\]/);
});
