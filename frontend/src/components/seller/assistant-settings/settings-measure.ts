/**
 * Shared composition measures for the Assistant Settings workspaces.
 *
 * These live in their own dependency-free module (rather than beside
 * the `"use client"` SettingsSection) so the server-rendered hub can
 * import the same values without pulling a client component into its
 * graph.
 *
 * Why measures exist at all: every settings surface sits inside the
 * 1180px `PageContainer`. Left unconstrained, a settings form inherits
 * that entire width — which previously produced either a huge raised
 * slab with an empty right half, or (after that slab was removed) a
 * narrow form column floating in a very wide empty canvas. Neither
 * reads as a deliberate work area.
 *
 * Two nested measures solve it:
 *
 *   SHEET  — the contained operational work surface. Wide enough to
 *            feel like a real work area, narrow enough that its right
 *            edge stays visible on a large display.
 *
 *   FIELD  — the form column INSIDE the sheet. Ordinary label+input
 *            stacks read best around ~34rem; sections carrying paired
 *            grids or long text get the wider step.
 *
 * All values are `max-w-*`, so every surface stays fluid below the cap
 * and mobile is never forced into horizontal overflow.
 */

/** Contained settings work sheet (~54rem / 864px). */
export const SETTINGS_SHEET_MEASURE = "max-w-[54rem]";

/** Ordinary form column inside the sheet (~34rem / 544px). */
export const SETTINGS_FIELD_MEASURE = "max-w-[34rem]";

/** Wider form column for paired grids / long text (~44rem / 704px). */
export const SETTINGS_FIELD_MEASURE_WIDE = "max-w-[44rem]";
