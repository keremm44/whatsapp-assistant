/**
 * "Instrument" dark seller workspace invariants.
 *
 * These are deliberate regression locks for the pilot's art-direction
 * decisions that have no dependency-free runtime logic to unit-test.
 * They are intentionally written against SEMANTIC signals (token
 * names, role classes, structural attributes) rather than full class
 * snapshots, so ordinary visual refinement stays possible while the
 * product rules below cannot silently regress:
 *
 *   1. the seller theme is a dark blue-graphite workspace whose
 *      material ladder cannot collapse, and it stays seller-only;
 *   2. interaction (cyan) and seller attention (coral) are separate
 *      semantic roles that can coexist on one row;
 *   3. the Dashboard does not regress to a card-stack grammar;
 *   4. the Conversations selected row keeps aria-current plus a
 *      non-colour cue, and can coexist with an attention flag;
 *   5. `Asistan yanıtı` stays evidence-gated and no `Satıcı`
 *      authorship is fabricated;
 *   6. mobile touch-target discipline is intact;
 *   7. the typography role architecture exists, is single-family
 *      (no serif-led editorial voice), and no unsafe font
 *      integration (remote import / unvendored @font-face) shipped.
 *
 * Runs with Node's built-in test runner:
 *   node --test src/lib/seller/instrument-theme.test.ts
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

test("seller workspace is a dark blue-graphite field", () => {
  const block = sellerThemeBlock();

  // The measured material ladder.
  assert.match(block, /--color-chrome:\s*#06090d/i);
  assert.match(block, /--color-sunken:\s*#0d1117/i);
  assert.match(block, /--color-canvas:\s*#12171f/i);
  assert.match(block, /--color-raised:\s*#1c222c/i);
  assert.match(block, /--color-overlay:\s*#242b37/i);
  assert.match(block, /--color-hover:\s*#2d3542/i);
  assert.match(block, /color-scheme:\s*dark/);

  // Ink is LIGHT on dark material (the inverse of the light pilot).
  assert.match(block, /--color-foreground:\s*#e8ecf2/i);

  // The previous light-paper direction must not return.
  for (const dead of ["#ecece7", "#f8f7f3", "#e4e6e4", "#20272d"]) {
    assert.ok(
      !block.toLowerCase().includes(dead),
      `the light-paper value ${dead} must not return to the seller theme`,
    );
  }

  // Every core material must be a genuinely DARK value, so a future
  // edit cannot quietly reintroduce a light surface.
  const channelSum = (hex: string) =>
    [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
  for (const role of ["chrome", "sunken", "canvas", "raised", "overlay"]) {
    const match = block.match(
      new RegExp(`--color-${role}:\\s*(#[0-9a-f]{6})`, "i"),
    );
    assert.ok(match, `--color-${role} must be declared`);
    assert.ok(
      channelSum(match![1]!) < 220,
      `--color-${role} must be a dark material`,
    );
  }
});

test("the material ladder is ordered and cannot collapse", () => {
  const block = sellerThemeBlock();
  const value = (role: string) =>
    block.match(new RegExp(`--color-${role}:\\s*(#[0-9a-f]{6})`, "i"))![1]!;

  // CIE L*: near-black values differ by tiny absolute luminance but
  // are perceptually far apart, so the ladder must be judged in L*.
  const lightness = (hex: string) => {
    const chan = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = chan.map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    const y = 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
    return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y;
  };

  // Strictly increasing luminance up the ladder.
  const ladder = ["chrome", "sunken", "canvas", "raised", "overlay", "hover"];
  const lums = ladder.map((role) => lightness(value(role)));
  for (let i = 0; i < lums.length - 1; i += 1) {
    assert.ok(
      lums[i + 1]! > lums[i]!,
      `${ladder[i + 1]} must sit above ${ladder[i]} in the ladder`,
    );
  }

  // And each step must be perceptible (>= 2 L*), not a rounding
  // difference — this is the guard against a collapsed dark theme.
  for (let i = 0; i < lums.length - 1; i += 1) {
    assert.ok(
      lums[i + 1]! - lums[i]! >= 2,
      `the ${ladder[i]} -> ${ladder[i + 1]} step must be perceptible`,
    );
  }
});

test("the dark workspace is scoped to the seller subtree only", () => {
  const css = globals();
  const block = sellerThemeBlock();

  assert.match(block, /--color-chrome:\s*#06090d/i);
  assert.match(block, /--color-chrome-foreground:\s*#e8ecf2/i);

  // The ROOT theme stays light, so admin / auth / public never
  // inherit the seller workspace.
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
  assert.doesNotMatch(css, /^html\s*\{[^}]*#0b0e13/im);
  assert.doesNotMatch(css, /^body\s*\{[^}]*#12171f/im);
});

/* ------------------------------------------------------------------ */
/* 2. Interaction vs seller attention are separate semantic roles      */
/* ------------------------------------------------------------------ */

test("interaction cyan and attention coral are distinct declared roles", () => {
  const block = sellerThemeBlock();

  assert.match(block, /--color-primary:\s*#4fb3c9/i);
  assert.match(block, /--color-selected:\s*#173039/i);
  assert.match(block, /--color-attention:\s*#ea8266/i);
  assert.match(block, /--color-attention-soft:\s*#331d17/i);

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
  assert.ok(ib! > ir!, "interaction must read as cyan (B > R)");
  assert.ok(ar! > ab!, "attention must read as coral (R > B)");
});

test("selection and attention stay legible on the SAME row", () => {
  // The defining constraint of the two-signal model: a selected row
  // that also needs attention must keep BOTH signals readable, so
  // the coral flag is measured against the cyan selection well.
  const block = sellerThemeBlock();
  const value = (name: string) =>
    block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))![1]!;

  const relLum = (hex: string) => {
    const lin = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  const selection = value("selected");
  for (const role of ["attention", "primary", "foreground", "muted"]) {
    assert.ok(
      contrast(value(role), selection) >= 4.5,
      `${role} must stay AA on the selection fill`,
    );
  }
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
    /divide-y divide-divider overflow-hidden rounded-sheet bg-raised/g,
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
    assert.doesNotMatch(source, /bg-(raised|surface|overlay|paper)\b/);
  }
});

test("dashboard header states the count typographically, not as a badge", () => {
  const header = read("../../components/seller/dashboard/dashboard-header.tsx");
  assert.match(header, /type-page-title/);
  assert.match(header, /type-figure/);
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
  // Honest per-region materials separated by structural rules: the
  // queue sits BELOW the work sheet, the context beside it.
  assert.match(workbench, /bg-sunken/);
  assert.match(workbench, /bg-raised/);
  assert.match(workbench, /bg-canvas/);
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
  assert.match(
    timeline,
    /isIncoming\s*\?\s*"border-l-2 border-boundary bg-sunken"/,
  );
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

test("mobile navigation keeps 44px targets, spine material and a rule", () => {
  const nav = readCode("../../components/seller/shell/seller-mobile-nav.tsx");

  // Spine material with a strong top boundary, so the mobile frame is
  // the same object as the desktop spine.
  assert.match(nav, /border-t border-boundary bg-chrome/);
  // Active state: cyan top rule + weight + aria-current, no fill wash.
  assert.match(nav, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(nav, /inset-x-0 top-0 h-\[2px\] bg-primary/);
  assert.match(nav, /font-semibold text-chrome-foreground/);
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
    ["type-page-title", "34px", "40px"],
    ["type-section", "22px", "28px"],
    ["type-record-identity", "19px", "26px"],
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
  // The page title scales up on desktop.
  assert.match(
    css,
    /\.type-page-title \{\s*font-size: 40px;\s*line-height: 46px;/,
  );
  // Tabular figures are a codified role, so dense rows cannot jitter.
  assert.match(css, /\.type-figure \{[^}]*tabular-nums/s);
});

test("hierarchy is single-family: no serif-led editorial voice", () => {
  const css = globals();

  // Every display/body role resolves to the SAME grotesque family.
  assert.match(css, /--font-display:\s*"Inter"/);
  assert.match(css, /--font-body:\s*"Inter"/);
  assert.match(css, /--font-heading:\s*var\(--font-display\)/);

  // No serif stack anywhere in the theme, and no serif token.
  assert.doesNotMatch(css, /--font-title:/);
  assert.doesNotMatch(css, /ui-serif|Georgia|"Times New Roman"|Plex Serif/);

  // Display roles earn their weight through tracking, not a typeface
  // swap — so the tracked-in treatment must be present.
  for (const role of ["type-page-title", "type-section", "type-record-identity"]) {
    const body = css
      .slice(css.indexOf(`.${role} {`))
      .slice(0, css.slice(css.indexOf(`.${role} {`)).indexOf("}"));
    assert.match(body, /font-family: var\(--font-display\)/);
    assert.match(body, /letter-spacing: -0\./);
  }

  // Tailwind exposes the display + numeric roles, and `title` is now
  // an alias of the grotesque rather than a serif.
  const tailwind = read("../../../tailwind.config.ts");
  assert.match(tailwind, /display: \["var\(--font-display\)"/);
  assert.match(tailwind, /numeric: \["var\(--font-numeric\)"/);
  assert.doesNotMatch(tailwind, /"ui-serif"/);

  // No component may reach for a serif role.
  for (const relative of [
    "../../components/seller/dashboard/dashboard-header.tsx",
    "../../components/seller/conversations/conversation-detail-panel.tsx",
    "../../components/shared/page-header.tsx",
  ]) {
    assert.doesNotMatch(read(relative), /font-title|font-serif/);
  }
});

test("no unsafe font integration ships: no remote imports, no dangling faces", () => {
  const css = globals();

  // The intended family is named first, and every stack still
  // terminates in a real system fallback.
  assert.match(css, /--font-display:\s*"Inter"/);
  assert.match(css, /--font-body:[^;]*sans-serif;/s);
  assert.match(css, /--font-numeric:[^;]*monospace;/s);

  // No remote CSS import and no remote font URL.
  assert.doesNotMatch(css, /@import\s+url\(/);
  assert.doesNotMatch(css, /https?:\/\/fonts\./);

  // Any @font-face must stay commented out until real local assets
  // are vendored, so the build can never reference a missing binary.
  const live = css.replace(/\/\*[^]*?\*\//g, "");
  assert.doesNotMatch(live, /@font-face/);

  // And the app must not have adopted next/font behind our back.
  assert.doesNotMatch(read("../../app/layout.tsx"), /next\/font/);
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
  assert.match(
    read("../../components/ui/dialog.tsx"),
    /rounded-floating[^"]*bg-overlay[^"]*shadow-2/,
  );
  assert.match(read("../../components/ui/sheet.tsx"), /bg-overlay p-6 shadow-2/);
  // Ordinary seller work sheets stay flat.
  assert.match(sellerThemeBlock(), /--shadow-surface:\s*none/);
  // Controls use the crisp control radius.
  assert.match(read("../../components/ui/button.tsx"), /rounded-control/);
  assert.match(read("../../components/ui/input.tsx"), /rounded-control/);
});

/* ------------------------------------------------------------------ */
/* 9. Semantic colour rhythm (supporting roles)                        */
/* ------------------------------------------------------------------ */

test("supporting semantic roles are declared and mutually distinguishable", () => {
  const block = sellerThemeBlock();

  // The three supporting roles that break the monochrome field.
  assert.match(block, /--color-success:\s*#5ec59a/i);
  assert.match(block, /--color-warning:\s*#e8a34d/i);
  assert.match(block, /--color-paused:\s*#949dac/i);

  const value = (name: string) =>
    block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))![1]!;

  // All five signals must remain distinct values: if any two collapse,
  // a state stops being readable as its own meaning.
  const signals = ["primary", "attention", "success", "warning", "paused"].map(
    (name) => value(name).toLowerCase(),
  );
  assert.equal(
    new Set(signals).size,
    signals.length,
    "every semantic signal must be a distinct value",
  );

  // `paused` must stay NEAR-NEUTRAL: it means "deliberately inactive",
  // so it may not become a sixth saturated accent competing for
  // attention. Chroma is approximated by max channel spread.
  const paused = value("paused");
  const channels = [1, 3, 5].map((i) => parseInt(paused.slice(i, i + 2), 16));
  const spread = Math.max(...channels) - Math.min(...channels);
  assert.ok(spread <= 40, `paused must stay near-neutral (spread ${spread})`);
});

test("every semantic role clears AA on the surfaces it is used on", () => {
  const block = sellerThemeBlock();
  const value = (name: string) =>
    block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))![1]!;

  const relLum = (hex: string) => {
    const lin = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  // Status text lands on work surfaces and on hovered/selected rows.
  const surfaces = ["chrome", "sunken", "canvas", "raised", "hover", "selected"];
  for (const role of ["success", "warning", "paused", "attention", "primary"]) {
    for (const surface of surfaces) {
      assert.ok(
        contrast(value(role), value(surface)) >= 4.5,
        `${role} must clear AA on ${surface}`,
      );
    }
  }
  // Soft-fill pairings used by chips/notices.
  assert.ok(contrast(value("paused"), value("paused-muted")) >= 4.5);
  assert.ok(contrast(value("warning"), value("warning-muted")) >= 4.5);
  assert.ok(contrast(value("success"), value("success-muted")) >= 4.5);
});

test("truthful terminal states use success, not neutral gray", () => {
  // Returns: HANDLED is a completion, distinct from COLLECTING.
  const returns = read("./returns-format.ts");
  assert.match(returns, /HANDLED:\s*\{\s*label:\s*"İlgilenildi",\s*tone:\s*"success"/);
  assert.match(returns, /COLLECTING:[^}]*tone:\s*"muted"/);

  // Unanswered: ANSWERED is a completion; DISMISSED is inactive.
  const unanswered = read("./unanswered-format.ts");
  assert.match(unanswered, /ANSWERED:\s*\{\s*label:\s*"Cevaplandı",\s*tone:\s*"success"/);
  assert.match(unanswered, /DISMISSED:[^}]*tone:\s*"paused"/);

  // Orders: COMPLETE is a completion; review wins over everything.
  const orders = read("./orders-format.ts");
  assert.match(orders, /getOrderStatusTone/);
  assert.match(orders, /order\.status === "COMPLETE"\) return "success"/);
});

test("interaction cyan never expresses a status outcome", () => {
  // The regression this pass fixed: `resolved` -> text-primary-text
  // leaked the selection colour into a state meaning.
  for (const relative of [
    "../../components/seller/unanswered/unanswered-question-row.tsx",
    "../../components/seller/unanswered/unanswered-question-detail.tsx",
  ]) {
    const source = readCode(relative);
    assert.doesNotMatch(source, /tone === "resolved"/);
    assert.doesNotMatch(source, /tone === "success" && "text-primary/);
  }
});

test("system-degraded notices use warning, keeping coral for record review", () => {
  const shell = readCode("../../components/seller/shell/seller-shell.tsx");
  assert.match(shell, /border-l-warning/);
  assert.match(shell, /bg-warning-muted/);
  assert.match(shell, /text-warning/);
  // The shell notice must NOT claim per-record seller attention.
  assert.doesNotMatch(shell, /border-l-attention/);
});

test("colour is not used to code content type", () => {
  // Orders/Returns/Conversations must not each get their own hue: the
  // tone maps key on lifecycle STATE only.
  const orders = read("./orders-format.ts");
  const toneFn = orders.slice(
    orders.indexOf("export const getOrderStatusTone"),
    orders.indexOf("/* ---", orders.indexOf("export const getOrderStatusTone")),
  );
  // The function may only branch on status / action flag.
  assert.doesNotMatch(toneFn, /type|kind|Orders|Returns/);
  assert.match(toneFn, /sellerActionRequired/);
  assert.match(toneFn, /order\.status/);
});

/* ------------------------------------------------------------------ */
/* 10. Sidebar authorship                                              */
/* ------------------------------------------------------------------ */

test("the spine has a brand plate, banded sections and a pinned system foot", () => {
  const sidebar = readCode("../../components/seller/shell/seller-sidebar.tsx");

  // Brand: a real monogram tile built from workspace materials.
  assert.match(sidebar, /BrandPlate/);
  assert.match(sidebar, /name="Store"/);
  assert.match(sidebar, /bg-raised text-primary/);

  // Vertical rhythm: work sections scroll, the system group is pinned
  // to the foot with its own boundary.
  assert.match(sidebar, /sellerNavigation\.slice\(0, -1\)/);
  assert.match(sidebar, /systemSection/);
  assert.match(sidebar, /flex-1 overflow-y-auto/);
  assert.match(sidebar, /border-t border-boundary\/40/);

  // Section labels are titled bands (leading rule + eyebrow).
  assert.match(sidebar, /SectionLabel/);
  assert.match(sidebar, /type-eyebrow/);

  // Dividers use the real boundary token, not a near-invisible white.
  assert.doesNotMatch(sidebar, /border-white\/\[0\.07\]/);
  assert.match(sidebar, /border-boundary\/30/);

  // Icons get a fixed slot so labels share one x-axis.
  assert.match(sidebar, /flex w-5 shrink-0 justify-center/);
});

test("the spine keeps its non-hue active cues and stays colour-disciplined", () => {
  const sidebar = readCode("../../components/seller/shell/seller-sidebar.tsx");

  // Four cues: material lift + cyan edge + weight/ink + aria-current.
  assert.match(sidebar, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(sidebar, /bg-raised font-semibold text-foreground/);
  assert.match(sidebar, /w-\[3px\] rounded-l-control bg-primary/);

  // Nav items are NOT colour-coded per destination, and the spine
  // gains no decorative palette.
  assert.doesNotMatch(sidebar, /text-success|text-warning|text-attention/);
  assert.doesNotMatch(sidebar, /gradient|blur|shadow-\[|drop-shadow/);

  // Desktop and tablet render the SAME section list component.
  assert.match(sidebar, /export function SidebarSections/);
  const topbar = readCode("../../components/seller/shell/seller-topbar.tsx");
  assert.match(topbar, /SidebarSections/);
});
