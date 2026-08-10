"use client";

import * as React from "react";

import { AdminLogoutButton } from "./admin-logout-button";

/**
 * Sticky topbar for the admin surface.
 *
 * 64px tall, warm chrome surface, 1px bottom border. The left
 * side shows the wordmark + a small "Yönetim" context label.
 * The right side exposes the only real control on this surface:
 * the admin logout button. There is no menu trigger, no avatar,
 * no organization switcher — admin currently has a single
 * destination and one auth action.
 *
 * This topbar is identical in macro structure to the seller
 * topbar so the two surfaces clearly belong to the same product,
 * but the right-hand content is intentionally simpler.
 */
export function AdminTopbar() {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-chrome px-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="block h-[20px] w-[2px] rounded-full bg-primary"
        />
        <p className="font-heading text-[15px] font-semibold text-primary">
          WhatsApp Asistan
        </p>
        <span
          aria-hidden="true"
          className="ml-2 hidden h-4 w-px bg-divider sm:inline-block"
        />
        <p className="hidden text-sm font-medium text-muted-foreground sm:inline">
          Yönetim
        </p>
      </div>

      <div className="flex items-center gap-3">
        <AdminLogoutButton variant="ghost" size="sm" />
      </div>
    </header>
  );
}
