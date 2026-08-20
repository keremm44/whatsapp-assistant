import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(path.join(directory, name), "utf8");

test("hero stays server-visible and uses one readable conversation close-up", () => {
  const hero = read("hero.tsx");

  assert.match(hero, /<h1\b/);
  assert.match(hero, /Tekrar eden WhatsApp konuşmalarını sizden önce karşılar/);
  assert.match(hero, /function HeroConversation/);
  assert.match(
    hero,
    /lg:grid-cols-\[minmax\(0,1\.08fr\)_minmax\(380px,0\.92fr\)\]/,
  );
  assert.doesNotMatch(hero, /OwnershipLedgerRow/);
  assert.doesNotMatch(hero, /MarketingReveal/);
});

test("public flow separates daily load and critical boundaries around the wide demo", () => {
  const page = read("../../app/(public)/page.tsx");

  assert.match(page, /<DailyLoadSection \/>/);
  assert.match(page, /<CriticalStatesSection \/>/);
  assert.doesNotMatch(page, /DayContrast/);

  const order = [
    "<Hero />",
    "<DailyLoadSection />",
    "<ControlSection />",
    "<DemoSection />",
    "<CriticalStatesSection />",
    "<PanelSection />",
    "<OnboardingSection />",
    "<SupportSection />",
  ].map((marker) => page.indexOf(marker));

  order.forEach((index) => assert.ok(index >= 0));
  for (let index = 1; index < order.length; index += 1) {
    assert.ok(order[index] > order[index - 1]);
  }
});

test("full-site width hierarchy makes demo wide, critical narrow, and panel widest", () => {
  const hero = read("hero.tsx");
  const daily = read("daily-load-section.tsx");
  const control = read("control-section.tsx");
  const demo = read("demo-section.tsx");
  const critical = read("critical-states-section.tsx");
  const panel = read("panel-section.tsx");
  const onboarding = read("onboarding-section.tsx");
  const support = read("support-section.tsx");

  assert.match(hero, /max-w-\[1180px\]/);
  assert.match(daily, /max-w-\[860px\]/);
  assert.match(control, /max-w-\[1180px\]/);
  assert.match(demo, /max-w-\[1380px\]/);
  assert.match(critical, /max-w-\[820px\]/);
  assert.match(panel, /max-w-\[1560px\]/);
  assert.match(panel, /lg:min-h-\[720px\]/);
  assert.match(onboarding, /max-w-\[920px\]/);
  assert.match(support, /max-w-\[1100px\]/);
});

test("daily load is a quiet ruled fragment list rather than a hero ledger or card gallery", () => {
  const daily = read("daily-load-section.tsx");

  assert.match(daily, /ledger\.known/);
  assert.match(daily, /ledger\.routine/);
  assert.match(daily, /ledger\.returnReview/);
  assert.match(daily, /function WorkdayFragment/);
  assert.match(daily, /border-y border-divider/);
  assert.doesNotMatch(daily, /rounded-sheet/);
  assert.doesNotMatch(daily, /shadow-surface/);
});

test("seller dashboard proof follows the canonical seller presentation language", () => {
  const panel = read("panel-section.tsx");

  assert.match(panel, /DASHBOARD_TASK_PRESENTATION/);
  assert.match(panel, /Bugün ilgilenmeniz gerekenler/);
  assert.match(panel, /Önce bunlar/);
  assert.match(panel, /Bugün bakılabilecekler/);
  assert.match(panel, /Önce bakılacaklar/);
  assert.match(panel, /Vakit varsa/);
  assert.match(panel, /Toplam/);
  assert.match(panel, /İade \/ sorun talebi inceleme bekliyor/);
  assert.match(panel, /Cevaplanamayan müşteri sorusu/);
  assert.match(panel, /rounded-sheet border border-boundary\/60 bg-raised shadow-surface/);
  assert.doesNotMatch(panel, /href=["']#dene["']/);
});

test("conversation control remains a real pressed-button ownership interaction", () => {
  const control = read("control-section.tsx");

  assert.match(control, /role="group"/);
  assert.match(control, /aria-pressed=\{selected\}/);
  assert.match(control, /Ben ilgileneceğim/);
  assert.match(control, /Asistana bırak/);
  assert.match(control, /grid-rows-3/);
  assert.match(control, /h-1\/3 bg-chrome-hover/);
  assert.match(control, /translate-y-\[200%\]/);
  assert.match(control, /sm:translate-x-\[200%\]/);
  assert.doesNotMatch(control, /role="tablist"/);
  assert.doesNotMatch(control, /role="tab"/);
});

test("return and unknown boundaries live in the deliberate narrow critical section", () => {
  const critical = read("critical-states-section.tsx");

  assert.match(critical, /MARKETING_STORY\.unknownQuestion/);
  assert.match(critical, /MARKETING_STORY\.unknownAnswer/);
  assert.match(critical, /MARKETING_STORY\.returnQuestion/);
  assert.match(critical, /MARKETING_STORY\.returnSystemOutcome/);
  assert.match(critical, /<SystemNote tone="attention" label="Otomatik yanıt durur">/);
  assert.match(critical, /<StatusChip tone="attention">İade incelemesi<\/StatusChip>/);
});

test("return review stays seller-attention and never masquerades as assistant-paused", () => {
  const control = read("control-section.tsx");
  const demo = read("demo-section.tsx");
  const critical = read("critical-states-section.tsx");
  const panel = read("panel-section.tsx");

  assert.match(demo, /returnOutcome:[\s\S]*?tone: "attention"/);
  assert.doesNotMatch(demo, /tone\?: "attention" \| "paused"/);
  assert.match(critical, /tone="attention"/);
  assert.match(panel, /StatusChip tone="attention"/);
  assert.doesNotMatch(control, /Yanıtlar durduruldu/);
  assert.match(control, /Asistan bekler; bu konuşmanın yanıtlarını siz yönetirsiniz\./);
  assert.match(control, /Asistan yeni mesajlarda yeniden devreye girer\./);
});

test("marketing attention notes use the canonical attention surface", () => {
  const systemNote = read("system-note.tsx");

  assert.match(systemNote, /bg-attention-soft/);
  assert.doesNotMatch(systemNote, /bg-accent-muted/);
});

test("demo keeps controlled behaviour while becoming the first wide product moment", () => {
  const demo = read("demo-section.tsx");

  assert.match(demo, /const REPLY_STAGGER_MS = 140/);
  assert.match(demo, /MarketingMessageArrival/);
  assert.match(demo, /key=\{`\$\{stepId\}-\$\{index\}`\}/);
  assert.match(demo, /sm:min-h-\[560px\]/);
  assert.match(demo, /MARKETING_STORY\.customerQuestion/);
  assert.match(demo, /MARKETING_STORY\.unknownAnswer/);
  assert.match(demo, /MARKETING_STORY\.returnSystemOutcome/);
  assert.match(demo, /canlı yapay zeka bağlantısı değil/);
});

test("one 11:03 return record continues from daily context through critical state into seller work", () => {
  const story = read("marketing-story.ts");
  const daily = read("daily-load-section.tsx");
  const critical = read("critical-states-section.tsx");
  const panel = read("panel-section.tsx");

  assert.match(story, /returnReview:[\s\S]*?time: "11:03"/);
  assert.match(daily, /ledger\.returnReview/);
  assert.match(critical, /MARKETING_STORY\.ledger\.returnReview/);
  assert.match(panel, /MARKETING_STORY\.ledger\.returnReview/);
  assert.match(panel, /MARKETING_STORY\.returnQuestion/);
});

test("reveal motion is progressive enhancement and fails open", () => {
  const motion = read("marketing-motion.tsx");

  assert.match(motion, /useState\(true\)/);
  assert.match(motion, /alreadyInViewport/);
  assert.match(motion, /motionReady && styles\.reveal/);
  assert.match(motion, /\(!motionReady \|\| visible\) && styles\.revealVisible/);
  assert.match(
    motion,
    /media\.matches \|\| typeof IntersectionObserver === ['"]undefined['"]\) return;/,
  );
  assert.match(
    motion,
    /if \(typeof IntersectionObserver === ['"]undefined['"]\) \{\s*setVisible\(true\);\s*return;/,
  );
});

test("marketing reveal grammar still distinguishes editorial, product, and state roles", () => {
  const motion = read("marketing-motion.tsx");
  const motionCss = read("marketing-motion.module.css");
  const daily = read("daily-load-section.tsx");
  const demo = read("demo-section.tsx");
  const critical = read("critical-states-section.tsx");
  const panel = read("panel-section.tsx");
  const onboarding = read("onboarding-section.tsx");

  assert.match(motion, /'editorial' \| 'product' \| 'state'/);
  assert.match(motionCss, /\.revealEditorial/);
  assert.match(motionCss, /\.revealProduct/);
  assert.match(motionCss, /\.revealState/);
  assert.match(daily, /variant="state"/);
  assert.match(demo, /variant="product"/);
  assert.match(critical, /variant="state"/);
  assert.match(panel, /variant="product"/);
  assert.match(onboarding, /variant="product"/);
});

test("demo message arrival remains reduced-motion safe", () => {
  const motion = read("marketing-motion.tsx");
  const motionCss = read("marketing-motion.module.css");

  assert.match(motion, /export function MarketingMessageArrival/);
  assert.match(motionCss, /translateY\(4px\)/);
  assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.messageArrival/);
});

test("desktop dock visibility and active state are derived rather than fabricated", () => {
  const motion = read("marketing-motion.tsx");
  const motionCss = read("marketing-motion.module.css");

  assert.match(motion, /styles\.dock, ['"]hidden lg:flex['"]/);
  assert.match(motion, /useState<string \| null>\(null\)/);
  assert.match(motion, /intersectionRatios/);
  assert.doesNotMatch(motionCss, /\.dock\s*\{[^}]*\bdisplay\s*:/s);
});

test("public loading mirrors the readable split hero instead of the retired ledger", () => {
  const loading = read("../../app/(public)/loading.tsx");

  assert.match(loading, /max-w-\[1180px\]/);
  assert.match(
    loading,
    /lg:grid-cols-\[minmax\(0,1\.08fr\)_minmax\(380px,0\.92fr\)\]/,
  );
  assert.match(loading, /lg:row-span-2/);
  assert.doesNotMatch(loading, /\["08:42", "09:17", "10:21", "11:03"\]/);
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
  const support = read("support-section.tsx");
  const footer = read("marketing-footer.tsx");

  assert.match(header, /min-h-11/);
  assert.match(hero, /min-h-11/);
  assert.match(control, /min-h-11/);
  assert.match(demo, /min-h-11/);
  assert.match(support, /min-h-11/);
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

test("chat bubbles expose the customer speaker to assistive technology", () => {
  const bubbles = read("chat-bubbles.tsx");

  assert.match(bubbles, /Müşteri: /);
});

test("final closes with typography instead of another giant product card", () => {
  const support = read("support-section.tsx");

  assert.match(support, /Rutin konuşmalar asistanda\. Karar gerekenler sizde\./);
  assert.match(support, /Konuşmasını deneyin/);
  assert.doesNotMatch(support, /rounded-sheet/);
  assert.doesNotMatch(support, /min-h-\[360px\]/);
});
