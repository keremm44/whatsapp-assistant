"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  fetchSellerAnnouncementUnreadCount,
  markSellerAnnouncementRead,
} from "@/lib/seller/announcements-api";
import { formatAnnouncementDate, type SellerAnnouncement } from "@/lib/seller/announcements";
import { getBrowserAccessToken } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

import { SellerIcon } from "./icon-map";

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 45_000;

/** Seller announcement center. Backend owns targeting, read state and counts. */
export function SellerAnnouncementsSheet({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = React.useState(false);
  const [portalContainer, setPortalContainer] = React.useState<Element | null>(null);
  const [announcements, setAnnouncements] = React.useState<SellerAnnouncement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = React.useState<SellerAnnouncement | null>(null);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = React.useState<number | null>(null);
  const [readError, setReadError] = React.useState<string | null>(null);

  const listControllerRef = React.useRef<AbortController | null>(null);
  const countControllerRef = React.useRef<AbortController | null>(null);
  const readControllerRef = React.useRef<AbortController | null>(null);
  const hasLoadedRef = React.useRef(false);
  const rowsRef = React.useRef<SellerAnnouncement[]>([]);
  rowsRef.current = announcements;

  React.useEffect(() => {
    setPortalContainer(document.querySelector(".seller-theme"));
    return () => {
      listControllerRef.current?.abort();
      countControllerRef.current?.abort();
      readControllerRef.current?.abort();
    };
  }, []);

  const refreshUnreadCount = React.useCallback(async () => {
    countControllerRef.current?.abort();
    const controller = new AbortController();
    countControllerRef.current = controller;
    try {
      const accessToken = await getBrowserAccessToken();
      if (!accessToken || controller.signal.aborted) return;
      const count = await fetchSellerAnnouncementUnreadCount(accessToken, { signal: controller.signal });
      if (!controller.signal.aborted) setUnreadCount(count);
    } catch {
      // Keep the last authoritative count visible; the next focus/interval retries.
    } finally {
      if (countControllerRef.current === controller) countControllerRef.current = null;
    }
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
      if (!accessToken || controller.signal.aborted) throw new Error("announcement_session_unavailable");
      const page = await fetchSellerAnnouncementList(accessToken, { limit: PAGE_SIZE, offset: 0, signal: controller.signal });
      if (controller.signal.aborted) return;
      setAnnouncements(page.announcements);
      setTotal(page.total);
      setUnreadCount(page.unreadCount);
      setHasLoaded(true);
      hasLoadedRef.current = true;
    } catch {
      if (!controller.signal.aborted) setListError("Duyurular şu anda yüklenemedi. Tekrar deneyebilirsiniz.");
    } finally {
      if (listControllerRef.current === controller) {
        listControllerRef.current = null;
        setIsInitialLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void refreshUnreadCount();
    const interval = window.setInterval(() => void refreshUnreadCount(), REFRESH_INTERVAL_MS);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") void refreshUnreadCount();
    };
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [refreshUnreadCount]);

  React.useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (nextOpen) {
      void refreshUnreadCount();
      if (hasLoadedRef.current) void loadFirstPage();
    }
  };

  const openAnnouncement = async (item: SellerAnnouncement) => {
    setSelectedAnnouncement(item);
    setReadError(null);
    if (item.isRead || markingReadId === item.id) return;
    readControllerRef.current?.abort();
    const controller = new AbortController();
    readControllerRef.current = controller;
    setMarkingReadId(item.id);
    try {
      const accessToken = await getBrowserAccessToken();
      if (!accessToken || controller.signal.aborted) throw new Error("announcement_session_unavailable");
      const result = await markSellerAnnouncementRead(accessToken, item.id, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setUnreadCount(result.unreadCount);
      setAnnouncements((current) => current.map((announcement) => announcement.id === item.id
        ? { ...announcement, isRead: true, readAt: result.readAt }
        : announcement));
      setSelectedAnnouncement((current) => current && current.id === item.id
        ? { ...current, isRead: true, readAt: result.readAt }
        : current);
    } catch {
      if (!controller.signal.aborted) setReadError("Okundu bilgisi kaydedilemedi.");
    } finally {
      if (readControllerRef.current === controller) {
        readControllerRef.current = null;
        setMarkingReadId(null);
      }
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
      if (!accessToken || controller.signal.aborted) throw new Error("announcement_session_unavailable");
      const page = await fetchSellerAnnouncementList(accessToken, { limit: PAGE_SIZE, offset: rowsRef.current.length, signal: controller.signal });
      if (controller.signal.aborted) return;
      setAnnouncements((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.announcements.filter((item) => !seen.has(item.id))];
      });
      setTotal(page.total);
      setUnreadCount(page.unreadCount);
    } catch {
      if (!controller.signal.aborted) setListError("Daha fazla duyuru yüklenemedi. Tekrar deneyebilirsiniz.");
    } finally {
      if (listControllerRef.current === controller) {
        listControllerRef.current = null;
        setIsLoadingMore(false);
      }
    }
  };

  const badgeCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={unreadCount > 0 ? `Duyuruları aç — ${unreadCount} okunmamış duyuru` : "Duyuruları aç"}
            className={cn("relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors", "hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas")}
          >
            <SellerIcon name="Bell" size={18} />
            {unreadCount > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full border border-primary/40 bg-sunken px-1 text-center text-[10px] font-semibold leading-4 text-primary" aria-hidden="true">{badgeCount}</span> : null}
          </button>
        </SheetTrigger>
        <SheetContent side="right" portalContainer={portalContainer} className="flex w-full flex-col gap-0 bg-overlay p-0 sm:max-w-[420px]">
          <SheetHeader className="mb-0 border-b border-divider px-5 pb-4 pt-6">
            <SheetTitle>Duyurular</SheetTitle>
            <SheetDescription>Size ile paylaşılan en yeni uygulama duyuruları.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isInitialLoading && !hasLoaded ? <div role="status" className="flex min-h-40 items-center justify-center gap-2 px-5 text-sm text-muted-foreground"><Spinner size={16} label="Duyurular yükleniyor" /><span>Duyurular yükleniyor…</span></div> : null}
            {!isInitialLoading && !hasLoaded && listError ? <div className="space-y-3 px-5 py-8" role="status"><p className="text-sm font-medium text-foreground">Duyurular yüklenemedi.</p><Button type="button" variant="secondary" size="sm" onClick={loadFirstPage}>Tekrar dene</Button></div> : null}
            {hasLoaded && announcements.length === 0 ? <div className="px-5 py-8" role="status"><p className="text-sm font-medium text-foreground">Henüz duyuru yok</p><p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">Sizinle paylaşılan yeni bir duyuru olduğunda burada görünecek.</p></div> : null}
            {announcements.length > 0 ? <ul role="list" aria-label="Duyurular">{announcements.map((item) => (
              <li key={item.id} className="border-b border-divider last:border-b-0">
                <button type="button" onClick={() => void openAnnouncement(item)} className={cn("group w-full px-5 py-4 text-left transition-colors hover:bg-raised/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset", !item.isRead && "bg-selected/45")}>
                  <span className="flex items-start gap-3"><span className="min-w-0 flex-1"><span className="flex items-center gap-2">{!item.isRead ? <span className="h-2 w-2 shrink-0 rounded-full border border-primary" aria-hidden="true" /> : null}<span className={cn("min-w-0 flex-1 text-[13.5px] leading-snug text-foreground", item.isRead ? "font-medium" : "font-semibold")}>{item.title}</span></span><span className="mt-1 block text-[11px] type-figure text-muted-foreground">{formatAnnouncementDate(item.publishedAt)}</span>{item.importance === "IMPORTANT" ? <span className="mt-2 inline-flex rounded-pill bg-attention/15 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-attention">ÖNEMLİ</span> : null}</span><SellerIcon name="ChevronDown" size={16} className="mt-0.5 shrink-0 -rotate-90 text-muted-foreground" /></span>
                </button>
              </li>
            ))}</ul> : null}
          </div>
          {hasLoaded && (announcements.length < total || listError) ? <div className="border-t border-divider px-5 py-3">{listError ? <p className="mb-2 text-[12px] text-muted-foreground" role="status">{listError}</p> : null}{announcements.length < total ? <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={loadMore} disabled={isLoadingMore}>{isLoadingMore ? "Yükleniyor…" : "Daha fazla göster"}</Button> : <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={loadFirstPage}>Yenile</Button>}</div> : null}
        </SheetContent>
      </Sheet>

      <Dialog open={selectedAnnouncement !== null} onOpenChange={(next) => { if (!next) setSelectedAnnouncement(null); }}>
        <DialogContent portalContainer={portalContainer} className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
          {selectedAnnouncement ? <div><DialogHeader className="border-b border-divider px-6 pb-5 pt-6 sm:px-8"><div className="flex items-start gap-3 pr-8"><div className="min-w-0 flex-1"><DialogTitle className="text-xl leading-tight sm:text-2xl">{selectedAnnouncement.title}</DialogTitle><DialogDescription className="mt-2">{formatAnnouncementDate(selectedAnnouncement.publishedAt)}{selectedAnnouncement.importance === "IMPORTANT" ? " · Önemli duyuru" : ""}</DialogDescription></div>{selectedAnnouncement.importance === "IMPORTANT" ? <span className="shrink-0 rounded-pill bg-attention/15 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-attention">ÖNEMLİ</span> : null}</div></DialogHeader>{selectedAnnouncement.imageUrl ? <div className="aspect-video w-full overflow-hidden bg-sunken"><img src={selectedAnnouncement.imageUrl} alt="" className="h-full w-full object-cover" /></div> : null}<div className="px-6 py-6 sm:px-8"><p className="whitespace-pre-wrap text-[14px] leading-7 text-foreground">{selectedAnnouncement.message}</p>{markingReadId === selectedAnnouncement.id ? <p className="mt-4 text-[12px] text-muted-foreground" role="status">Okundu bilgisi kaydediliyor…</p> : null}{readError ? <p className="mt-4 text-[12px] text-destructive" role="status">{readError}</p> : null}</div></div> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
