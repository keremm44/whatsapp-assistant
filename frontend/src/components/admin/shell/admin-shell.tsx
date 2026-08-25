import * as React from "react";

import { Toaster } from "@/components/ui/toaster";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";

/**
 * Macro shell for the admin surface.
 *
 * Visual / responsive model (intentionally simple):
 *
 *   - Desktop (>= 1024px): 240px sidebar on the left, sticky
 *     64px topbar, content scrolls below the topbar.
 *   - Tablet / mobile (< 1024px): the desktop sidebar is hidden
 *     and the topbar stays sticky. There is NO bottom navigation
 *     and NO hamburger / sheet because admin currently has only
 *     one navigation destination. Adding a hamburger to expose
 *     one link would be visual clutter.
 *
 * The seller shell has a richer information architecture
 * (multiple sidebar groups, mobile bottom nav, tablet sheet)
 * that the admin shell does NOT copy. Admin currently has one
 * job, and the shell reflects that.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-theme min-h-screen bg-canvas text-foreground">
      <div className="flex">
        <AdminSidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <AdminTopbar />
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
