"use client";

import * as React from "react";

import {
  clearWorkbenchNavigationNamespace,
  readWorkbenchNavigationMemory,
  workbenchNavigationStorageKey,
  writeWorkbenchNavigationMemory,
} from "@/lib/seller/workbench-navigation";

/**
 * Preserves a workbench queue's internal scroll position across route
 * transitions without moving ownership of filters/selection out of the URL.
 * On mobile index routes it also restores the page scroll position.
 */
export function WorkbenchScrollMemory({
  namespace,
  context,
  trackViewport,
  resetPathname,
  children,
}: {
  namespace: string;
  context: string;
  trackViewport: boolean;
  /** Clicking a link to this exact pathname means a filter/list reset. */
  resetPathname?: string;
  children: React.ReactNode;
}) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const previousKeyRef = React.useRef<string | null>(null);
  const key = workbenchNavigationStorageKey(namespace, context);

  const save = React.useCallback(() => {
    if (typeof window === "undefined") return;

    const previous = readWorkbenchNavigationMemory(window.sessionStorage, key);
    const scrollRegion = rootRef.current?.querySelector<HTMLElement>(
      ".scrollbar-quiet",
    );

    writeWorkbenchNavigationMemory(window.sessionStorage, key, {
      scrollTop: scrollRegion?.scrollTop ?? previous?.scrollTop ?? 0,
      viewportY: trackViewport
        ? Math.max(0, window.scrollY)
        : previous?.viewportY ?? null,
    });
  }, [key, trackViewport]);

  React.useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const keyChanged =
      previousKeyRef.current !== null && previousKeyRef.current !== key;
    previousKeyRef.current = key;

    const frame = window.requestAnimationFrame(() => {
      const scrollRegion = rootRef.current?.querySelector<HTMLElement>(
        ".scrollbar-quiet",
      );

      if (keyChanged) {
        if (scrollRegion) scrollRegion.scrollTop = 0;
        if (trackViewport) window.scrollTo(0, 0);
        return;
      }

      const memory = readWorkbenchNavigationMemory(window.sessionStorage, key);
      if (memory === null) return;

      if (scrollRegion) scrollRegion.scrollTop = memory.scrollTop;
      if (trackViewport && memory.viewportY !== null) {
        window.scrollTo(0, memory.viewportY);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [key, trackViewport]);

  React.useEffect(() => save, [save]);

  const onClickCapture = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (typeof window === "undefined") return;

      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;

      if (anchor && resetPathname) {
        const destination = new URL(anchor.href, window.location.href);
        if (destination.pathname === resetPathname) {
          clearWorkbenchNavigationNamespace(window.sessionStorage, namespace);
          return;
        }
      }

      save();
    },
    [namespace, resetPathname, save],
  );

  return (
    <div ref={rootRef} className="contents" onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
