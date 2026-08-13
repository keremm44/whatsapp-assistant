/**
 * Presentation / copy / classification tests for assistant settings.
 *
 *   node --test src/lib/seller/assistant-settings-format.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assistantHubDescription,
  choiceFromTriState,
  classifySettingsMutationFailure,
  formatBinaryChoiceLabel,
  formatTriStateLabel,
  formatUnspecifiedValue,
  integerInputFromValue,
  isSettingsConflict,
  KNOWLEDGE_CUSTOM_TEXT_MAX_LABEL,
  KNOWLEDGE_DISHWASHER_LABEL,
  KNOWLEDGE_ORDER_COLLECTION_HREF,
  KNOWLEDGE_PAGE_DESCRIPTION,
  KNOWLEDGE_PAGE_TITLE,
  KNOWLEDGE_PRODUCT_SHARED_NOTE,
  KNOWLEDGE_RETURNS_DISABLED_NOTE,
  parseIntegerInput,
  SETTINGS_CLEARABLE_UNSPECIFIED_LABEL,
  SETTINGS_CONFLICT_MESSAGE,
  SETTINGS_UNSPECIFIED_LABEL,
  SETTINGS_UNAVAILABLE_DESCRIPTION,
  SETTINGS_UNAVAILABLE_TITLE,
  triStateFromChoice,
} from "./assistant-settings-format.ts";

test("unknown / missing values render as Henüz belirtilmedi, not Hayır", () => {
  assert.equal(formatUnspecifiedValue(null), SETTINGS_UNSPECIFIED_LABEL);
  assert.equal(formatBinaryChoiceLabel(null), SETTINGS_UNSPECIFIED_LABEL);
  assert.equal(formatTriStateLabel(null), SETTINGS_CLEARABLE_UNSPECIFIED_LABEL);
  assert.notEqual(formatBinaryChoiceLabel(null), "Hayır");
  assert.notEqual(formatTriStateLabel(null), "Hayır");
  assert.equal(formatTriStateLabel(false), "Hayır");
  assert.equal(formatTriStateLabel(true), "Evet");
  assert.equal(formatBinaryChoiceLabel(false), "Hayır");
});

test("usage 3-state mapping is yes / no / unspecified", () => {
  assert.equal(triStateFromChoice("yes"), true);
  assert.equal(triStateFromChoice("no"), false);
  assert.equal(triStateFromChoice("unspecified"), null);
  assert.equal(choiceFromTriState(true), "yes");
  assert.equal(choiceFromTriState(false), "no");
  assert.equal(choiceFromTriState(null), "unspecified");
});

test("integer inputs treat blank as empty and reject junk", () => {
  assert.deepEqual(parseIntegerInput(""), { status: "empty" });
  assert.deepEqual(parseIntegerInput("   "), { status: "empty" });
  assert.deepEqual(parseIntegerInput("14"), { status: "value", value: 14 });
  assert.deepEqual(parseIntegerInput("0"), { status: "value", value: 0 });
  assert.equal(parseIntegerInput("14.5").status, "invalid");
  assert.equal(parseIntegerInput("1e2").status, "invalid");
  assert.equal(parseIntegerInput("abc").status, "invalid");
  assert.equal(integerInputFromValue(null), "");
  assert.equal(integerInputFromValue(330), "330");
});

test("knowledge page copy is practical and truthful", () => {
  assert.equal(KNOWLEDGE_PAGE_TITLE, "Asistanın Bildikleri");
  assert.match(KNOWLEDGE_PAGE_DESCRIPTION, /ürün, kullanım, kargo ve iade/);
  assert.doesNotMatch(KNOWLEDGE_PAGE_DESCRIPTION, /knowledge base|eğitim|öğren/i);
  assert.equal(
    KNOWLEDGE_PRODUCT_SHARED_NOTE,
    "Bu bilgiler şu anda tüm ürünler için ortak kullanılır.",
  );
  assert.doesNotMatch(KNOWLEDGE_PRODUCT_SHARED_NOTE, /Kupa|Termos|330|500/);
  assert.equal(KNOWLEDGE_CUSTOM_TEXT_MAX_LABEL, "Özel yazı için maksimum karakter");
  assert.equal(KNOWLEDGE_DISHWASHER_LABEL, "Bulaşık makinesine uygun");
  assert.equal(KNOWLEDGE_ORDER_COLLECTION_HREF, "/seller/order-collection");
  assert.match(KNOWLEDGE_RETURNS_DISABLED_NOTE, /artık uygulanmaz/);
});

test("unavailable is not an empty/default settings state", () => {
  assert.match(SETTINGS_UNAVAILABLE_TITLE, /yüklenemedi/);
  assert.match(SETTINGS_UNAVAILABLE_DESCRIPTION, /kaybolmadı|tekrar deneyin/);
  assert.notEqual(SETTINGS_UNAVAILABLE_TITLE, "Henüz belirtilmedi");
});

test("conflict copy is calm and does not invite silent retry", () => {
  assert.equal(
    SETTINGS_CONFLICT_MESSAGE,
    "Ayarlar başka bir işlemde değişmiş. Güncel bilgileri kontrol edip tekrar deneyin.",
  );
});

test("classifies mutation HTTP statuses and settings conflict code", () => {
  assert.equal(classifySettingsMutationFailure(409), "conflict");
  assert.equal(classifySettingsMutationFailure(422), "validation");
  assert.equal(classifySettingsMutationFailure(401), "auth");
  assert.equal(classifySettingsMutationFailure(404), "not_found");
  assert.equal(classifySettingsMutationFailure(500), "retryable");
  assert.equal(classifySettingsMutationFailure(null), "retryable");
  assert.equal(
    isSettingsConflict({
      detail: {
        code: "seller_settings_conflict",
        message: "stale",
      },
    }),
    true,
  );
  assert.equal(
    isSettingsConflict({ code: "seller_settings_validation_error" }),
    false,
  );
});

test("hub descriptions stay restrained and label-specific", () => {
  assert.match(
    assistantHubDescription("Asistanın Bildikleri"),
    /ürün, kullanım, kargo ve iade/,
  );
  assert.match(assistantHubDescription("Sipariş Toplama"), /temel bilgileri/);
  assert.match(assistantHubDescription("Ürünler"), /ürün bazlı/);
  assert.match(assistantHubDescription("Kurallar"), /satıcı tanımlı/);
});

test("Asistanın Bildikleri UI never offers unsupported clear actions", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const formatSource = readFileSync(
    path.resolve(dir, "./assistant-settings-format.ts"),
    "utf8",
  );
  const uiSources = [
    readFileSync(
      path.resolve(
        dir,
        "../../components/seller/assistant-settings/knowledge-workspace.tsx",
      ),
      "utf8",
    ),
    readFileSync(
      path.resolve(dir, "../../app/seller/assistant-knowledge/page.tsx"),
      "utf8",
    ),
  ].join("\n");
  assert.doesNotMatch(uiSources, /Temizle/);
  assert.doesNotMatch(uiSources, /Belirtilmedi yap/);
  assert.match(formatSource, /tüm ürünler için ortak/);
  assert.match(formatSource, /Mikrodalgaya uygun/);
  assert.match(formatSource, /Aynı gün gönderim/);
  assert.doesNotMatch(uiSources, /knowledge base/i);
  assert.doesNotMatch(uiSources, /güven skoru|hazırlık yüzdesi|eğitim/i);
  assert.doesNotMatch(
    KNOWLEDGE_PAGE_DESCRIPTION,
    /knowledge base|eğitim|öğren|güven skoru/i,
  );
});
