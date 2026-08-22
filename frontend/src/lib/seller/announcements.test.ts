import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatAnnouncementDate,
  parseSellerAnnouncementListResponse,
  parseSellerAnnouncementReadResponse,
  parseSellerAnnouncementUnreadCount,
} from "./announcements.ts";

const announcement = (overrides: Record<string, unknown> = {}) => ({
  id: 12,
  title: "Yeni özellik",
  message: "Panelde yeni bir özellik kullanıma açıldı.",
  audience_type: "ALL_SELLERS",
  importance: "NORMAL",
  image_url: null,
  is_read: false,
  read_at: null,
  published_at: "2026-08-18T12:00:00+00:00",
  created_at: "2026-08-18T12:00:00+00:00",
  ...overrides,
});

test("seller announcement list parses the backend-owned read state", () => {
  const page = parseSellerAnnouncementListResponse({
    total: 2,
    limit: 20,
    offset: 0,
    unread_count: 1,
    announcements: [
      announcement(),
      announcement({
        id: 11,
        audience_type: "SELECTED_SELLERS",
        is_read: true,
        read_at: "2026-08-18T12:05:00+00:00",
      }),
    ],
  });

  assert.equal(page.total, 2);
  assert.equal(page.announcements[0]?.id, 12);
  assert.equal(page.announcements[0]?.isRead, false);
  assert.equal(page.announcements[1]?.audienceType, "SELECTED_SELLERS");
  assert.equal(page.announcements[1]?.isRead, true);
});

test("read state mismatch is a contract error rather than client repair", () => {
  assert.throws(
    () =>
      parseSellerAnnouncementListResponse({
        total: 1,
        limit: 20,
        offset: 0,
        unread_count: 1,
        announcements: [announcement({ is_read: true, read_at: null })],
      }),
    /announcements_invalid_read_state_mismatch/,
  );
});

test("unknown audience values never leak into presentation", () => {
  assert.throws(
    () =>
      parseSellerAnnouncementListResponse({
        total: 1,
        limit: 20,
        offset: 0,
        unread_count: 1,
        announcements: [announcement({ audience_type: "VIP" })],
      }),
    /announcements_invalid_audience_type/,
  );
});

test("list page cannot contain more rows than the echoed limit", () => {
  assert.throws(
    () =>
      parseSellerAnnouncementListResponse({
        total: 2,
        limit: 1,
        offset: 0,
        unread_count: 1,
        announcements: [announcement(), announcement({ id: 11 })],
      }),
    /announcements_invalid_announcements_limit/,
  );
});

test("mark-read response is strict and keeps backend changed semantics", () => {
  assert.deepEqual(
    parseSellerAnnouncementReadResponse({
      announcement_id: 12,
      is_read: true,
      read_at: "2026-08-18T12:05:00+00:00",
      changed: false,
      unread_count: 1,
    }),
    {
      announcementId: 12,
      isRead: true,
      readAt: "2026-08-18T12:05:00+00:00",
      changed: false,
      unreadCount: 1,
    },
  );

  assert.throws(
    () =>
      parseSellerAnnouncementReadResponse({
        announcement_id: 12,
        is_read: false,
        read_at: "2026-08-18T12:05:00+00:00",
        changed: false,
      }),
    /announcements_invalid_read_response_state/,
  );
});

test("announcement date formatter is seller-facing and fails closed to source text", () => {
  const formatted = formatAnnouncementDate("2026-08-18T12:00:00+00:00");
  assert.match(formatted, /2026/);
  assert.equal(formatAnnouncementDate("not-a-date"), "not-a-date");
});


test("seller announcement parser exposes important state and image URL", () => {
  const page = parseSellerAnnouncementListResponse({ total: 1, limit: 20, offset: 0, unread_count: 1, announcements: [announcement({ importance: "IMPORTANT", image_url: "https://cdn.example.com/banner.jpg" })] });
  assert.equal(page.unreadCount, 1);
  assert.equal(page.announcements[0]?.importance, "IMPORTANT");
  assert.equal(page.announcements[0]?.imageUrl, "https://cdn.example.com/banner.jpg");
});

test("seller unread count parser is strict", () => {
  assert.equal(parseSellerAnnouncementUnreadCount({ unread_count: 4 }), 4);
  assert.throws(() => parseSellerAnnouncementUnreadCount({ unread_count: "4" }), /announcements_invalid_unread_count_shape/);
});
