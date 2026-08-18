"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchSellerAnnouncementList,
  markSellerAnnouncementRead,
} from "@/lib/seller/announcements-api";
import {
  formatAnnouncementDate,
  type SellerAnnouncement,
} from "@/lib/seller/announcements";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

const PAGE_SIZE = 20;

/**
 * Seller announcement center.
 *
 * The backend owns targeting and read state. Opening the drawer itself does
 * not mutate anything; a specific unread announcement is marked read only
 * when the seller expands that record. No unread total, severity or dismiss
 * state is inferred on the client because the backend contract exposes none.
 */
export function SellerAnnouncementsSheet({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [portalContainer, setPortalContainer] = React.useState<Element | null>(
    null,
  );
  const [announcements, setAnnouncements] = React.useState<
    SellerAnnouncement[]
  >([]);
  const [total, setTotal] = React.useState(0);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [markingReadIds, setMarkingReadIds] = React.useState<Set<number>>(
    () => new Set(),
  );
  const [readErrors, setReadErrors] = React.useState<Record<number, string>>(
    {},
  );

  const listControllerRef = React.useRef<AbortController | null>(null);
  const readControllersRef = React.useRef(new Map<number, AbortController>());
  const hasLoadedRef = React.useRef(false);
  const rowsRef = React.useRef<SellerAnnouncement[]>([]);
  rowsRef.current = announcements;

  React.useEffect(() => {
    setPortalContainer(document.querySelector(".seller-theme"));
    return () => {
      listControllerRef.current?.abort();
      for (const controller of readControllersRef.current.values()) {
        controller.abort();
      }
      readControllersRef.current.clear();
    };
  }, []);

  const loadFirstPage = React.useCallback(async () => {
    listControllerRef.current?.abort();
    setIsLoadingMore(false);
    const controller = new AbortController();
    listControllerRef.current = controller;

    if (!hasLoadedRef.current) setIsInitialLoading(true);
    setListError(null);

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) {
        throw new Error("announcement_session_unavailable");
      }

      const page = await fetchSellerAnnouncementList(accessToken, {
        limit: PAGE_SIZE,
        offset: 0,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setAnnouncements(page.announcements);
      setTotal(page.total);
      setHasLoaded(true);
      hasLoadedRef.current = true;
    } catch {
      if (controller.signal.aborted) return;
      setListError("Duyurular şu anda yüklenemedi. Tekrar deneyebilirsiniz.");
    } finally {
      if (listControllerRef.current === controller) {
        listControllerRef.current = null;
        setIsInitialLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (nextOpen && hasLoadedRef.current) {
      void loadFirstPage();
    }
  };

  const markRead = async (item: SellerAnnouncement) => {
    if (item.isRead || readControllersRef.current.has(item.id)) return;

    const controller = new AbortController();
    readControllersRef.current.set(item.id, controller);
    setMarkingReadIds((current) => new Set(current).add(item.id));
    setReadErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) throw new Error("announcement_session_unavailable");

      const result = await markSellerAnnouncementRead(accessToken, item.id, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setAnnouncements((current) =>
        current.map((announcement) =>
          announcement.id === item.id
            ? {
                ...announcement,
                isRead: true,
                readAt: result.readAt,
              }
            : announcement,
        ),
      );
    } catch {
      if (controller.signal.aborted) return;
      setReadErrors((current) => ({
        ...current,
        [item.id]: "Okundu bilgisi kaydedilemedi.",
      }));
    } finally {
      if (readControllersRef.current.get(item.id) === controller) {
        readControllersRef.current.delete(item.id);
        setMarkingReadIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    }
  };

  const toggleAnnouncement = (item: SellerAnnouncement) => {
    const willOpen = expandedId !== item.id;
    setExpandedId(willOpen ? item.id : null);
    if (willOpen && !item.isRead) {
      void markRead(item);
    }
  };

  const loadMore = async () => {
    if (isLoadingMore || rowsRef.current.length >= total) return;
    setIsLoadingMore(true);
    setListError(null);

    const controller = new AbortController();
    listControllerRef.current?.abort();
    listControllerRef.current = controller;

    try {
      const accessToken = await getBrowserAccessToken();
      if (controller.signal.aborted) return;
      if (!accessToken) throw new Error("announcement_session_unavailable");

      const page = await fetchSellerAnnouncementList(accessToken, {
        limit: PAGE_SIZE,
        offset: rowsRef.current.length,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setAnnouncements((current) => {
        const seen = new Set(current.map((item) => item.id));
        const fresh = page.announcements.filter((item) => !seen.has(item.id));
        return [...current, ...fresh];
      });
      setTotal(page.total);
    } catch {
      if (controller.signal.aborted) return;
      setListError("Daha fazla duyuru yüklenemedi. Tekrar deneyebilirsiniz.");
    } finally {
      if (listControllerRef.current === controller) {
        listControllerRef.current = null;
        setIsLoadingMore(false);
      }
    }
  };

  const hasLoadedUnread = announcements.some((item) => !item.isRead);
  const moreAvailable = announcements.length < total;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={
            hasLoadedUnread
              ? "Duyuruları aç — okunmamış duyuru var"
              : "Duyuruları aç"
          }
          className={cn(
            "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors",
            "hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          )}
        >
          <SellerIcon name="Bell" size={18} />
          {hasLoadedUnread ? (
            <span
              aria-hidden="true"
              className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-primary"
            />
          ) : null}
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        portalContainer={portalContainer}
        className="flex w-full flex-col gap-0 bg-overlay p-0 sm:max-w-[420px]"
      >
        <SheetHeader className="mb-0 border-b border-divider px-5 pb-4 pt-6">
          <SheetTitle>Duyurular</SheetTitle>
          <SheetDescription>
            Size ile paylaşılan en yeni uygulama duyuruları.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isInitialLoading && !hasLoaded ? (
            <div
              role="status"
              className="flex min-h-40 items-center justify-center gap-2 px-5 text-sm text-muted-foreground"
            >
              <Spinner size={16} label="Duyurular yükleniyor" />
              <span>Duyurular yükleniyor…</span>
            </div>
          ) : null}

          {!isInitialLoading && !hasLoaded && listError ? (
            <div className="space-y-3 px-5 py-8" role="status">
              <p className="text-sm font-medium text-foreground">
                Duyurular yüklenemedi.
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Bağlantı kurulamadı. Tekrar deneyebilirsiniz.
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={loadFirstPage}>
                Tekrar dene
              </Button>
            </div>
          ) : null}

          {hasLoaded && announcements.length === 0 ? (
            <div className="px-5 py-8" role="status">
              <p className="text-sm font-medium text-foreground">
                Henüz duyuru yok
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Sizinle paylaşılan yeni bir duyuru olduğunda burada görünecek.
              </p>
            </div>
          ) : null}

          {announcements.length > 0 ? (
            <ul role="list" aria-label="Duyurular">
              {announcements.map((item) => {
                const expanded = expandedId === item.id;
                const isMarkingRead = markingReadIds.has(item.id);
                const readError = readErrors[item.id];

                return (
                  <li key={item.id} className="border-b border-divider last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleAnnouncement(item)}
                      className={cn(
                        "group w-full px-5 py-4 text-left transition-colors hover:bg-raised/60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                        !item.isRead && "bg-selected/45",
                      )}
                    >
                      <span className="flex items-start gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            {!item.isRead ? (
                              <span
                                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                                aria-hidden="true"
                              />
                            ) : null}
                            <span
                              className={cn(
                                "min-w-0 flex-1 text-[13.5px] leading-snug text-foreground",
                                item.isRead ? "font-medium" : "font-semibold",
                              )}
                            >
                              {item.title}
                              {!item.isRead ? (
                                <span className="sr-only"> — Okunmamış</span>
                              ) : null}
                            </span>
                          </span>
                          <span className="mt-1 block text-[11px] type-figure text-muted-foreground">
                            {formatAnnouncementDate(item.publishedAt)}
                          </span>
                        </span>
                        <SellerIcon
                          name="ChevronDown"
                          size={16}
                          className={cn(
                            "mt-0.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                            expanded && "rotate-180 motion-reduce:transform-none",
                          )}
                        />
                      </span>
                    </button>

                    {expanded ? (
                      <div className="px-5 pb-5 pl-9">
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                          {item.message}
                        </p>
                        {isMarkingRead ? (
                          <p className="mt-2 text-[11px] text-muted-foreground" role="status">
                            Okundu bilgisi kaydediliyor…
                          </p>
                        ) : null}
                        {readError ? (
                          <p className="mt-2 text-[11px] text-muted-foreground" role="status">
                            {readError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {hasLoaded && (moreAvailable || listError) ? (
          <div className="border-t border-divider px-5 py-3">
            {listError ? (
              <p className="mb-2 text-[12px] text-muted-foreground" role="status">
                {listError}
              </p>
            ) : null}
            {moreAvailable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={loadMore}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
              >
                {isLoadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={14} label="Duyurular yükleniyor" />
                    <span>Yükleniyor…</span>
                  </span>
                ) : (
                  "Daha fazla göster"
                )}
              </Button>
            ) : listError ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={loadFirstPage}
              >
                Yenile
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
