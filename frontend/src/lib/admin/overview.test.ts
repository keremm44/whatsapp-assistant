import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseAdminApplicationsTotal,
  parseAdminLatestAnnouncement,
  parseAdminOverviewTotal,
} from "./overview-format.ts";

test("admin overview preserves the applications endpoint's Turkish total field", () => {
  assert.deepEqual(
    parseAdminApplicationsTotal({ toplam: 3, applications: [] }),
    { total: 3 },
  );
});

test("admin overview accepts only a truthful non-negative total", () => {
  assert.deepEqual(parseAdminOverviewTotal({ total: 0 }, "feedback"), {
    total: 0,
  });
  assert.throws(
    () => parseAdminOverviewTotal({ total: "3" }, "feedback"),
    /admin_overview_invalid_total_shape/,
  );
});

test("admin overview exposes only the latest announcement's real delivery counts", () => {
  const parsed = parseAdminLatestAnnouncement({
    total: 2,
    announcements: [
      {
        title: "Kısa bakım duyurusu",
        message: "Planlı bakım yapılacaktır.",
        importance: "IMPORTANT",
        image_url: null,
        target_count: 12,
        read_count: 5,
      },
    ],
  });

  assert.deepEqual(parsed, {
    total: 2,
    latest: {
      title: "Kısa bakım duyurusu",
      message: "Planlı bakım yapılacaktır.",
      importance: "IMPORTANT",
      imageUrl: null,
      targetCount: 12,
      readCount: 5,
    },
  });
});

test("admin overview does not invent an announcement when the backend list is empty", () => {
  assert.deepEqual(
    parseAdminLatestAnnouncement({ total: 0, announcements: [] }),
    { total: 0, latest: null },
  );
});
