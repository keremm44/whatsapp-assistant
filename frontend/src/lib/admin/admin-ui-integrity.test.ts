import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("admin overview uses seller-style workload hierarchy instead of feature metric cards", () => {
  const overview = source("src/components/admin/dashboard/admin-overview.tsx");
  assert.match(overview, /Bugün yönetmeniz gerekenler/);
  assert.match(overview, /grid-cols-4 divide-x divide-divider/);
  assert.match(overview, /Önce bunlar/);
  assert.doesNotMatch(overview, /SİSTEM NOTU/);
});

test("applications exposes application context and prevents duplicate invites", () => {
  const page = source("src/app/admin/applications/page.tsx");
  const invite = source("src/components/admin/application-invite.tsx");
  assert.match(page, /productCategory/);
  assert.match(page, /application\.notes/);
  assert.match(page, /application\.adminNote/);
  assert.match(invite, /adminNote/);
  assert.match(invite, /Seller daveti/);
  assert.match(invite, /setSubmitting\(true\)/);
  assert.match(invite, /if \(submitting \|\| !inviteEmail\.trim\(\)\) return/);
  assert.doesNotMatch(page, /Backend/);
});

test("feedback preserves combined filters and uses seller-style open tabs", () => {
  const api = source("src/lib/admin/feedback-api.ts");
  const page = source("src/app/admin/feedback/page.tsx");
  assert.match(api, /seller_id/);
  assert.match(page, /sellerId/);
  assert.match(page, /Bu mağazanın geri bildirimleri/);
  assert.match(page, /resolvedAt/);
  assert.match(page, /border-b-2 px-1 py-2/);
  assert.doesNotMatch(page, /rounded-pill/);
});

test("announcements exposes full seller directory selection and guards publication", () => {
  const api = source("src/lib/admin/announcements-api.ts");
  const form = source("src/components/admin/announcement-form.tsx");
  const page = source("src/app/admin/announcements/page.tsx");
  assert.match(api, /fetchAdminAnnouncementDetail/);
  assert.match(api, /targets/);
  assert.match(form, /Belirli mağazalar/);
  assert.match(form, /Duyuruyu yayınla/);
  assert.match(form, /fetchAdminSellers/);
  assert.match(form, /DIRECTORY_PAGE_SIZE/);
  assert.match(form, /setSubmitting\(true\)/);
  assert.match(form, /if \(submitting \|\| !canPublish\) return/);
  assert.doesNotMatch(form, /Backend/);
  assert.match(page, /target\.readAt/);
  assert.match(page, /Okunmadı/);
});

test("seller and feedback directories consume offset pagination with shared tab grammar", () => {
  const sellers = source("src/app/admin/sellers/page.tsx");
  const feedback = source("src/app/admin/feedback/page.tsx");
  assert.match(sellers, /offset/);
  assert.match(sellers, /Sonraki/);
  assert.match(sellers, /border-b-2 px-1 py-2/);
  assert.doesNotMatch(sellers, /rounded-pill/);
  assert.match(feedback, /offset/);
  assert.match(feedback, /Sonraki/);
});
