/**
 * "The Working Ledger / İş Defteri" pilot invariants.
 *
 * These are deliberate regression locks for the pilot's art-direction
 * decisions that have no dependency-free runtime logic to unit-test.
 * They are intentionally written against SEMANTIC signals (token
 * names, role classes, structural attributes) rather than full class
 * snapshots, so ordinary visual refinement stays possible while the
 * product rules below cannot silently regress:
 *
 *   1. the seller theme is a light mineral canvas (not a dark
 *      workspace) and dark chrome stays seller-only;
 *   2. interaction (blue) and seller attention (oxide) are separate
 *      semantic roles;
 *   3. the Dashboard does not regress to a card-stack grammar;
 *   4. the Conversations selected row keeps aria-current plus a
 *      non-colour cue, and can coexist with an attention flag;
 *   5. `Asistan yanıtı` stays evidence-gated and no `Satıcı`
 *      authorship is fabricated;
 *   6. mobile touch-target discipline is intact;
 *   7. the typography role architecture exists and no unsafe font
 *      integration (remote import / unvendored @font-face) shipped.
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/working-ledger.test.ts
 * (via `npm test`)
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (relative: string): string => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(dir, relative), "utf8");
};

const globals = () => read("../../app/globals.css");

/**
 * Source with comments stripped. Several invariants below are about
 * what the component RENDERS, and a doc comment may legitimately
 * discuss the very thing the rule forbids (e.g. explaining why
 * "Satıcı" is never claimed). Assertions target real code only.
 */
const readCode = (relative: string): string =>
  read(relative)
    .replace(/\/\*[^]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** The `.seller-theme` override block only. */
const sellerThemeBlock = (): string => {
  const css = globals();
  const start = css.indexOf(".seller-theme {");
  assert.ok(start > -1, "the .seller-theme override block must exist");
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
};

/* ------------------------------------------------------------------ */
/* 1. Light mineral workspace                                          */
/* ------------------------------------------------------------------ */

test("seller theme is a light mineral canvas, not a dark workspace", () => {
  const block = sellerThemeBlock();

  // Canvas / paper / recessed are the approved light ledger materials.
  assert.match(block, /--color-canvas:\s*#ecece7/i);
  assert.match(block, /--color-background:\s*#ecece7/i);
  assert.match(block, /--color-paper:\s*#f8f7f3/i);
  assert.match(block, /--color-surface:\s*#f8f7f3/i);
  assert.match(block, /--color-recessed:\s*#e4e6e4/i);
  assert.match(block, /--color-floating:\s*#ffffff/i);

  // Ink is dark ON light material (the inverse of the previous pass).
  assert.match(block, /--color-foreground:\s*#20272d/i);

  // The previous Carbon Plum / dark workspace values must not return.
  for (const dead of ["#211a20", "#151416", "#2a262a", "#353035", "#f2eee6"]) {
    assert.ok(
      !block.toLowerCase().includes(dead),
      `the Carbon Plum value ${dead} must not return to the seller theme`,
    );
  }

  // Luminance check, so a future edit cannot quietly darken the field:
  // every core work material must be a LIGHT value.
  const channelSum = (hex: string) =>
    [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
  for (const role of ["canvas", "paper", "recessed", "floating"]) {
    const match = block.match(
      new RegExp(`--color-${role}:\\s*(#[0-9a-f]{6})`, "i"),
    );
    assert.ok(match, `--color-${role} must be declared`);
    assert.ok(
      channelSum(match![1]!) > 600,
      `--color-${role} must be a light material`,
    );
  }
});

test("dark ink chrome is scoped to the seller workspace only", () => {
  const css = globals();
  const block = sellerThemeBlock();

  // The dark spine belongs to the seller theme...
  assert.match(block, /--color-chrome:\s*#202830/i);
  assert.match(block, /--color-chrome-hover:\s*#2a3540/i);
  assert.match(block, /--color-chrome-foreground:\s*#f4f1ea/i);

  // ...and the ROOT theme's chrome stays light, so admin / auth /
  // public surfaces never inherit the seller spine.
  const root = css.slice(css.indexOf(":root {"), css.indexOf(".seller-theme {"));
  const rootChrome = root.match(/--color-chrome:\s*(#[0-9a-f]{6})/i);
  assert.ok(rootChrome, "root --color-chrome must be declared");
  const sum = [1, 3, 5].reduce(
    (acc, i) => acc + parseInt(rootChrome![1]!.slice(i, i + 2), 16),
    0,
  );
  assert.ok(sum > 600, "root chrome must remain a light value");

  // The dark material is applied through the theme class, never by a
  // global element selector.
  assert.doesNotMatch(css, /^html\s*\{[^}]*#202830/im);
});

/* ------------------------------------------------------------------ */
/* 2. Interaction vs seller attention are separate semantic roles      */
/* ------------------------------------------------------------------ */

test("interaction blue and oxide attention are distinct declared roles", () => {
  const block = sellerThemeBlock();

  assert.match(block, /--color-primary:\s*#285b82/i);
  assert.match(block, /--color-selected:\s*#d9e7f1/i);
  assert.match(block, /--color-attention:\s*#a9432c/i);
  assert.match(block, /--color-attention-soft:\s*#f3e1da/i);

  const interaction = block.match(/--color-primary:\s*(#[0-9a-f]{6})/i)![1]!;
  const attention = block.match(/--color-attention:\s*(#[0-9a-f]{6})/i)![1]!;
  assert.notEqual(
    interaction.toLowerCase(),
    attention.toLowerCase(),
    "interaction and attention must never collapse into one value",
  );

  // They must also be far apart in hue, not two neighbouring tones.
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ir, , ib] = channels(interaction);
  const [ar, , ab] = channels(attention);
  assert.ok(ib! > ir!, "interaction must read as blue (B > R)");
  assert.ok(ar! > ab!, "attention must read as oxide (R > B)");
});

test("attention roles are exposed as tokens, not raw hex in components", () => {
  const tailwind = read("../../../tailwind.config.ts");
  assert.match(tailwind, /attention:\s*\{/);
  assert.match(tailwind, /--color-attention-rgb/);
  assert.match(tailwind, /--color-attention-soft-rgb/);
  // Material roles are canonical Tailwind colors too.
  for (const role of ["canvas", "paper", "recessed", "floating", "boundary"]) {
    assert.match(tailwind, new RegExp(`${role}:\\s*"rgb\\(var\\(--color-`));
  }

  // Pilot components address roles, never raw hex.
  for (const relative of [
    "../../components/seller/shell/seller-sidebar.tsx",
    "../../components/seller/shell/seller-topbar.tsx",
    "../../components/seller/shell/seller-mobile-nav.tsx",
    "../../components/seller/dashboard/priority-card.tsx",
    "../../components/seller/dashboard/compact-task-card.tsx",
    "../../components/seller/dashboard/secondary-row.tsx",
    "../../components/seller/conversations/conversation-row.tsx",
    "../../components/seller/conversations/message-timeline.tsx",
    "../../components/seller/conversations/conversations-workbench.tsx",
  ]) {
    assert.doesNotMatch(
      readCode(relative),
      /#[0-9a-fA-F]{6}\b/,
      `${relative} must not hard-code hex colours`,
    );
  }
});

test("oxide is reserved for backend-supported seller review", () => {
  const presentation = read(
    "../../components/seller/dashboard/task-presentation.ts",
  );
  // Only the two backend review types carry the attention flag.
  assert.match(presentation, /return_review:[^}]*sellerReview:\s*true/s);
  assert.match(presentation, /order_review:[^}]*sellerReview:\s*true/s);
  assert.match(
    presentation,
    /unanswered_question:[^}]*sellerReview:\s*false/s,
  );
  assert.match(
    presentation,
    /unanswered_question:[^}]*attentionLabel:\s*null/s,
  );

  // Every dashboard row gates oxide on that flag rather than on type.
  for (const relative of [
    "../../components/seller/dashboard/priority-card.tsx",
    "../../components/seller/dashboard/compact-task-card.tsx",
    "../../components/seller/dashboard/secondary-row.tsx",
  ]) {
    const source = readCode(relative);
    assert.match(source, /meta\.sellerReview && meta\.attentionLabel/);
    // No per-type colour rails: colour must not encode content type.
    assert.doesNotMatch(source, /RAIL_CLASS/);
  }

  // The conversation queue spends oxide on exactly the review reasons.
  const format = read("./conversations-format.ts");
  const meta = format.slice(
    format.indexOf("export const ATTENTION_REASON_META"),
    format.indexOf("/* Control chip presentation"),
  );
  assert.match(meta, /return_review:[^}]*text-attention/s);
  assert.match(meta, /order_review:[^}]*text-attention/s);
  // Ownership and queue-only reasons stay neutral, and specifically
  // never borrow the interaction-blue selection language.
  for (const reason of ["seller_taken_over", "unanswered_question"]) {
    const entry = meta.slice(meta.indexOf(`${reason}:`));
    const body = entry.slice(0, entry.indexOf("},"));
    assert.doesNotMatch(body, /attention/);
    assert.doesNotMatch(body, /text-primary|bg-primary/);
  }
});

/* ------------------------------------------------------------------ */
/* 3. Dashboard reads as a work docket, not a card gallery             */
/* ------------------------------------------------------------------ */

test("dashboard groups tasks into one work sheet, not individual cards", () => {
  const page = read("../../app/seller/page.tsx");

  // Each region is ONE paper sheet whose entries are divided by rules.
  const sheets = page.match(
    /divide-y divide-divider overflow-hidden rounded-sheet bg-paper/g,
  );
  assert.ok(
    sheets && sheets.length >= 2,
    "high and normal regions must each render one contiguous work sheet",
  );

  // Row components must not reintroduce per-task card chrome.
  for (const relative of [
    "../../components/seller/dashboard/priority-card.tsx",
    "../../components/seller/dashboard/compact-task-card.tsx",
  ]) {
    const source = readCode(relative);
    assert.doesNotMatch(source, /rounded-(md|lg|sheet|floating)/);
    assert.doesNotMatch(source, /shadow-(1|2|surface)/);
    assert.doesNotMatch(source, /border border-(border|boundary)/);
    assert.doesNotMatch(source, /bg-(paper|surface|floating)\b/);
  }
});

test("dashboard header states the count typographically, not as a badge", () => {
  const header = read("../../components/seller/dashboard/dashboard-header.tsx");
  assert.match(header, /type-page-title/);
  assert.match(header, /tabular-nums/);
  // The accessible phrase for the backend aggregate is preserved.
  assert.match(header, /aria-label=\{`İlgilenmeniz gereken \$\{total\} konu`\}/);
  // Zero still hides the statement rather than showing an empty badge.
  assert.match(header, /total > 0 \? <WorkloadCount/);
  // No decorative badge fill or state-free colour hairline.
  assert.doesNotMatch(header, /bg-primary-muted|rounded-pill/);
  assert.doesNotMatch(header, /bg-primary["\s]/);
});

test("dashboard empty state is an open region, not a bordered card", () => {
  const empty = readCode(
    "../../components/seller/dashboard/empty-attention.tsx",
  );
  assert.doesNotMatch(empty, /rounded-(sheet|md|lg)/);
  assert.doesNotMatch(empty, /bg-(paper|surface|floating)/);
  assert.doesNotMatch(empty, /shadow-/);
  // The approved copy and the polite live region are unchanged.
  assert.match(empty, /Şu anda ilgilenmeniz gereken bir konu yok\./);
  assert.match(empty, /aria-live="polite"/);
});

test("section headings drop decorative state-free colour rails", () => {
  const heading = readCode(
    "../../components/seller/dashboard/section-heading.tsx",
  );
  assert.doesNotMatch(heading, /railTone|RAIL_CLASS|motif/);
  assert.doesNotMatch(heading, /bg-accent|bg-primary\b/);
  assert.match(heading, /type-section/);
});

/* ------------------------------------------------------------------ */
/* 4. Conversations: selection, attention, and the desk composition    */
/* ------------------------------------------------------------------ */

test("selected conversation keeps aria-current plus non-colour cues", () => {
  const row = read(
    "../../components/seller/conversations/conversation-row.tsx",
  );

  // Announced to assistive tech.
  assert.match(row, /aria-current=\{isSelected \? "page" : undefined\}/);
  // Structural interaction-blue edge (shape, not just hue).
  assert.match(row, /isSelected \? \(\s*<span[^>]*bg-primary/s);
  assert.match(row, /w-\[3px\]/);
  // Interaction-soft fill.
  assert.match(row, /isSelected\s*\?\s*"bg-selected"/);
});

test("selection and attention are independent, coexisting signals", () => {
  const row = read(
    "../../components/seller/conversations/conversation-row.tsx",
  );
  // The attention flag is NOT nested in an `else` of the selection
  // branch, so a selected row that needs attention shows both.
  assert.doesNotMatch(row, /isSelected \? \([^]*?\) : attentionMeta \? \(/);
  assert.match(row, /\{attentionMeta \? \(/);
  // The attention presentation comes from the backend reason map.
  assert.match(row, /ATTENTION_REASON_META\[attention\]/);
});

test("conversations workbench is edge-aligned regions, not one big card", () => {
  const workbench = readCode(
    "../../components/seller/conversations/conversations-workbench.tsx",
  );
  // The old rounded outer-card treatment must not return.
  assert.doesNotMatch(workbench, /md:rounded-(md|lg|sheet|floating)/);
  assert.doesNotMatch(workbench, /md:shadow-/);
  // Honest per-region materials separated by structural rules.
  assert.match(workbench, /bg-recessed/);
  assert.match(workbench, /bg-paper/);
  assert.match(workbench, /md:border-r md:border-boundary/);
  // Height containment and the conditional rail behaviour are intact.
  assert.match(workbench, /md:h-\[calc\(100dvh-/);
  assert.match(workbench, /hasContextRail \? \(/);
  assert.match(workbench, /xl:grid-cols-\[300px_minmax\(0,1fr\)_320px\]/);
});

test("queue filters use open tab language, not pills", () => {
  const queue = readCode(
    "../../components/seller/conversations/conversation-list-panel.tsx",
  );
  assert.doesNotMatch(queue, /rounded-pill/);
  assert.match(queue, /border-b-2 border-transparent/);
  assert.match(queue, /border-primary font-semibold/);
  assert.match(queue, /aria-current=\{isActive \? "page" : undefined\}/);
});

test("timeline is a flat correspondence transcript, not a WhatsApp clone", () => {
  const timeline = readCode(
    "../../components/seller/conversations/message-timeline.tsx",
  );
  // Modest radius; no bubble tail, wallpaper, avatar or receipts.
  assert.match(timeline, /rounded-\[5px\]/);
  assert.doesNotMatch(timeline, /rounded-(full|floating|lg)/);
  // (word-bounded: "detail" legitimately appears in the data layer)
  assert.doesNotMatch(
    timeline,
    /\bavatar\b|\btails?\b|\bwallpaper\b|\bcheckmark\b|CheckCheck/i,
  );
  // Incoming = neutral block with a structural cue; outgoing =
  // interaction-blue-soft.
  assert.match(timeline, /isIncoming\s*\?\s*"border-l-2 border-boundary bg-recessed"/);
  assert.match(timeline, /:\s*"bg-selected"/);
  // Left/right direction distinction preserved.
  assert.match(timeline, /isIncoming \? "justify-start" : "justify-end"/);
});

test("WhatsApp channel identity is retained in the queue and header", () => {
  const queue = read(
    "../../components/seller/conversations/conversation-list-panel.tsx",
  );
  const detail = read(
    "../../components/seller/conversations/conversation-detail-panel.tsx",
  );
  assert.match(queue, /aria-label="Kanal: WhatsApp"/);
  assert.match(detail, />WhatsApp<\/span>/);
  assert.match(detail, /detail\.customer\.whatsappNumber\?\.trim\(\)/);
  assert.doesNotMatch(detail, /WhatsApp<\/span>[^]*md:hidden/);
});

test("context rail is a ruled dossier, not a stack of mini-cards", () => {
  const rail = readCode(
    "../../components/seller/conversations/context-rail.tsx",
  );
  assert.match(rail, /divide-y divide-divider/);
  // Sections carry no card chrome of their own.
  assert.doesNotMatch(rail, /rounded-(sheet|md|lg)/);
  assert.doesNotMatch(rail, /shadow-/);
  assert.doesNotMatch(rail, /bg-(surface|paper|floating)\b/);
  // Business context still renders before the conversation history.
  assert.ok(
    rail.indexOf("<OrderContextBlock") < rail.indexOf("<ControlHistorySection"),
    "business context must stay above conversation history",
  );
});

/* ------------------------------------------------------------------ */
/* 5. Authorship honesty                                               */
/* ------------------------------------------------------------------ */

test("assistant authorship remains evidence-gated and no Satıcı is invented", () => {
  const timeline = readCode(
    "../../components/seller/conversations/message-timeline.tsx",
  );
  // The overline is gated on the backend's proof, and on nothing else.
  assert.match(timeline, /!isIncoming && message\.wasAutoReplied \? \(/);
  assert.match(timeline, /Asistan yanıtı/);
  // No fabricated seller authorship anywhere in the transcript.
  assert.doesNotMatch(timeline, />\s*Satıcı\s*</);
  assert.doesNotMatch(timeline, /"Satıcı"/);
  // No fabricated delivery / read / presence claims.
  assert.doesNotMatch(
    timeline,
    /okundu|iletildi|görüldü|çevrimiçi|yazıyor\.\.\./i,
  );
});

/* ------------------------------------------------------------------ */
/* 6. Mobile touch-target discipline                                   */
/* ------------------------------------------------------------------ */

test("mobile navigation keeps 44px targets, paper material and a rule", () => {
  const nav = readCode("../../components/seller/shell/seller-mobile-nav.tsx");

  // Paper bar with a strong top divider — not a dark bar, not a wash.
  assert.match(nav, /border-t border-boundary bg-paper/);
  // Active state: blue top rule + weight + aria-current, no fill wash.
  assert.match(nav, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(nav, /inset-x-0 top-0 h-\[2px\] bg-primary/);
  assert.match(nav, /font-semibold text-foreground/);
  assert.doesNotMatch(nav, /isActive\s*\n?\s*\?\s*"bg-selected/);
  // Touch targets and safe area preserved.
  const targets = nav.match(/min-h-\[44px\]/g);
  assert.ok(targets && targets.length >= 3, "nav targets stay >= 44px");
  assert.match(nav, /env\(safe-area-inset-bottom\)/);
});

test("shared controls keep 44px mobile targets with compact desktop", () => {
  const button = read("../../components/ui/button.tsx");
  assert.match(button, /sm: "h-11 px-3 sm:h-9"/);
  assert.match(button, /md: "h-11 px-4 sm:h-10"/);
  assert.match(button, /icon: "h-11 w-11 sm:h-10 sm:w-10"/);
  const input = read("../../components/ui/input.tsx");
  assert.match(input, /h-11 w-full[^"]*sm:h-10/);

  // Pilot row actions keep the 44px mobile / compact desktop rhythm.
  for (const relative of [
    "../../components/seller/dashboard/priority-card.tsx",
    "../../components/seller/dashboard/compact-task-card.tsx",
  ]) {
    assert.match(read(relative), /h-11 shrink-0 items-center[^"]*sm:h-9/);
  }
  // The queue row and secondary row keep generous full-row targets.
  assert.match(
    read("../../components/seller/dashboard/secondary-row.tsx"),
    /min-h-\[60px\]/,
  );
});

test("priority row still stacks its action below content on narrow mobile", () => {
  const source = read("../../components/seller/dashboard/priority-card.tsx");
  assert.match(source, /flex flex-col gap-3 p-4 pl-5 sm:flex-row/);
  assert.match(source, /flex min-w-0 items-start gap-4 sm:flex-1/);
  assert.match(source, /\{meta\.cta\}/);
});

/* ------------------------------------------------------------------ */
/* 7. Typography architecture and safe font loading                    */
/* ------------------------------------------------------------------ */

test("typography roles exist as a scale, not ad-hoc sizes", () => {
  const css = globals();
  const expected: [string, string, string][] = [
    ["type-page-title", "32px", "36px"],
    ["type-section", "24px", "30px"],
    ["type-record-identity", "20px", "26px"],
    ["type-body", "15px", "22px"],
    ["type-row-primary", "14px", "20px"],
    ["type-row-secondary", "13px", "19px"],
    ["type-meta", "12px", "17px"],
  ];
  for (const [role, size, leading] of expected) {
    const block = css.slice(css.indexOf(`.${role} {`));
    assert.ok(block.length > 0, `${role} must be declared`);
    const body = block.slice(0, block.indexOf("}"));
    assert.match(body, new RegExp(`font-size:\\s*${size}`));
    assert.match(body, new RegExp(`line-height:\\s*${leading}`));
  }
  // The page title scales up on desktop per the approved scale.
  assert.match(css, /\.type-page-title \{\s*font-size: 38px;\s*line-height: 42px;/);
  // Serif is the identity role; sans carries the operational UI.
  assert.match(css, /\.type-page-title \{[^}]*font-family: var\(--font-title\)/s);
  assert.match(
    css,
    /\.type-record-identity \{[^}]*font-family: var\(--font-title\)/s,
  );
  assert.match(css, /\.type-body \{[^}]*font-family: var\(--font-body\)/s);
});

test("no unsafe font integration ships: no remote imports, no dangling faces", () => {
  const css = globals();

  // IBM Plex is named FIRST in each stack so vendored assets take over
  // automatically once they land.
  assert.match(css, /--font-title:\s*"IBM Plex Serif"/);
  assert.match(css, /--font-heading:\s*"IBM Plex Sans"/);
  assert.match(css, /--font-body:\s*"IBM Plex Sans"/);
  // ...but every stack still terminates in a real system fallback.
  assert.match(css, /--font-title:[^;]*serif;/s);
  assert.match(css, /--font-body:[^;]*sans-serif;/s);

  // No remote CSS import and no remote font URL.
  assert.doesNotMatch(css, /@import\s+url\(/);
  assert.doesNotMatch(css, /https?:\/\/fonts\./);

  // Any @font-face must be commented out until real local assets are
  // vendored, so the build can never reference a missing binary.
  const live = css.replace(/\/\*[^]*?\*\//g, "");
  assert.doesNotMatch(live, /@font-face/);

  // And the app must not have adopted next/font behind our back.
  const layout = read("../../app/layout.tsx");
  assert.doesNotMatch(layout, /next\/font/);
});

/* ------------------------------------------------------------------ */
/* 8. Material geometry roles                                          */
/* ------------------------------------------------------------------ */

test("geometry roles separate controls, work sheets and floating objects", () => {
  const css = globals();
  assert.match(css, /--radius-control:\s*4px/);
  assert.match(css, /--radius-sheet:\s*6px/);
  assert.match(css, /--radius-floating:\s*10px/);

  // Floating surfaces are the only ones with real elevation.
  assert.match(read("../../components/ui/dialog.tsx"), /rounded-floating[^"]*bg-floating[^"]*shadow-2/);
  assert.match(read("../../components/ui/sheet.tsx"), /bg-floating p-6 shadow-2/);
  // Ordinary seller work sheets stay flat.
  assert.match(sellerThemeBlock(), /--shadow-surface:\s*none/);
  // Controls use the crisp control radius.
  assert.match(read("../../components/ui/button.tsx"), /rounded-control/);
  assert.match(read("../../components/ui/input.tsx"), /rounded-control/);
});
