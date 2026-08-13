/**
 * General Settings / business form tests.
 *
 *   node --test src/lib/seller/business-settings.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildBusinessSectionPatch,
  isHttpUrl,
  isNullClearAllowed,
  parseSellerSettingsResponse,
  type BusinessSettings,
} from "./assistant-settings.ts";
import {
  BUSINESS_NAME_LABEL,
  BUSINESS_SECTION_TITLE,
  BUSINESS_STORE_LINK_LABEL,
  BUSINESS_STORE_NAME_LABEL,
  GENERAL_SETTINGS_CAPTION,
  GENERAL_SETTINGS_DESCRIPTION,
  GENERAL_SETTINGS_TITLE,
  SESSION_SECTION_TITLE,
  SETTINGS_SAVE_CHANGES_LABEL,
  SETTINGS_UNSPECIFIED_LABEL,
} from "./assistant-settings-format.ts";

const current = (
  overrides: Partial<BusinessSettings> = {},
): BusinessSettings => ({
  name: "Alya",
  phone: "+905551234567",
  storeName: "Alya Atölye",
  storeLink: "https://example.com",
  ...overrides,
});

test("settings page remains Sistem / Ayarlar, not Assistant Settings", () => {
  assert.equal(GENERAL_SETTINGS_CAPTION, "Sistem");
  assert.equal(GENERAL_SETTINGS_TITLE, "Ayarlar");
  assert.match(GENERAL_SETTINGS_DESCRIPTION, /İşletme bilgilerinizi/);
  assert.equal(BUSINESS_SECTION_TITLE, "İşletme Bilgileri");
  assert.equal(SESSION_SECTION_TITLE, "Oturum");
  assert.equal(SETTINGS_SAVE_CHANGES_LABEL, "Değişiklikleri kaydet");
});

test("business field labels match the supported contract", () => {
  assert.equal(BUSINESS_NAME_LABEL, "Yetkili / işletme adı");
  assert.equal(BUSINESS_STORE_NAME_LABEL, "Mağaza adı");
  assert.equal(BUSINESS_STORE_LINK_LABEL, "Mağaza bağlantısı");
});

test("name / store_name / phone / store_link each produce a single-field patch", () => {
  assert.deepEqual(
    buildBusinessSectionPatch({
      expectedVersion: 5,
      current: current(),
      draft: current({ name: "Yeni İsim" }),
    }),
    { expected_version: 5, business: { name: "Yeni İsim" } },
  );
  assert.deepEqual(
    buildBusinessSectionPatch({
      expectedVersion: 5,
      current: current(),
      draft: current({ storeName: "Yeni Mağaza" }),
    }),
    { expected_version: 5, business: { store_name: "Yeni Mağaza" } },
  );
  assert.deepEqual(
    buildBusinessSectionPatch({
      expectedVersion: 5,
      current: current(),
      draft: current({ phone: "0555 123 45 67" }),
    }),
    { expected_version: 5, business: { phone: "0555 123 45 67" } },
  );
  assert.deepEqual(
    buildBusinessSectionPatch({
      expectedVersion: 5,
      current: current(),
      draft: current({ storeLink: "https://shop.example.com" }),
    }),
    { expected_version: 5, business: { store_link: "https://shop.example.com" } },
  );
});

test("returned settings adopt the new version after a business save", () => {
  const returned = parseSellerSettingsResponse({
    settings: {
      version: 12,
      business: {
        name: "Yeni İsim",
        phone: "+905551234567",
        store_name: "Alya Atölye",
        store_link: "https://example.com",
      },
    },
  });
  assert.equal(returned.version, 12);
  assert.equal(returned.business.name, "Yeni İsim");
});

test("business null-clear allowlist matches the Pydantic write contract", () => {
  assert.equal(isNullClearAllowed("business", "phone"), true);
  assert.equal(isNullClearAllowed("business", "store_link"), true);
  assert.equal(isNullClearAllowed("business", "name"), false);
  assert.equal(isNullClearAllowed("business", "store_name"), false);
});

test("invalid store links are rejected locally", () => {
  assert.equal(isHttpUrl("https://example.com/shop"), true);
  assert.equal(isHttpUrl("http://example.com"), true);
  assert.equal(isHttpUrl("example.com"), false);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
});

test("null GET business phone/link stay unspecified, not empty defaults", () => {
  const parsed = parseSellerSettingsResponse({
    settings: { version: 1, business: { name: "Alya" } },
  });
  assert.equal(parsed.business.phone, null);
  assert.equal(parsed.business.storeLink, null);
  assert.equal(parsed.business.storeName, null);
  assert.equal(SETTINGS_UNSPECIFIED_LABEL, "Henüz belirtilmedi");
});

test("General Settings UI keeps logout and does not invent extra account features", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = [
    readFileSync(path.resolve(dir, "../../app/seller/settings/page.tsx"), "utf8"),
    readFileSync(
      path.resolve(dir, "../../app/seller/settings/_logout-button.tsx"),
      "utf8",
    ),
    readFileSync(
      path.resolve(
        dir,
        "../../components/seller/assistant-settings/business-settings-workspace.tsx",
      ),
      "utf8",
    ),
  ].join("\n");
  assert.match(sources, /LogoutButton/);
  assert.match(sources, /Çıkış yap/);
  assert.match(sources, /navigateAfterLogout/);
  assert.doesNotMatch(sources, /şifre|password|ekip|fatura|abonelik|vergi dairesi|profil foto/i);
  assert.doesNotMatch(sources, /product:\s*|order:\s*\{|usage:\s*\{|return_policy:/);
  assert.match(sources, /buildBusinessSectionPatch/);
  assert.match(sources, /expectedVersion/);
});
