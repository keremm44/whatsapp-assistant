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
  KNOWLEDGE_ACCEPTS_RETURNS_LABEL,
  KNOWLEDGE_DAMAGE_REPLACEMENT_LABEL,
  KNOWLEDGE_GLOBAL_SCOPE_NOTE,
  KNOWLEDGE_INTERNATIONAL_LABEL,
  KNOWLEDGE_PROCESSING_GROUP_LABEL,
  KNOWLEDGE_PROCESSING_MAX_INPUT_LABEL,
  KNOWLEDGE_PROCESSING_MIN_INPUT_LABEL,
  KNOWLEDGE_PRODUCTS_HREF,
  KNOWLEDGE_PRODUCTS_LINK_LABEL,
  KNOWLEDGE_SAME_DAY_LABEL,
  KNOWLEDGE_SAVED_ANSWERS_DESCRIPTION,
  KNOWLEDGE_SAVED_ANSWERS_HREF,
  KNOWLEDGE_SAVED_ANSWERS_TITLE,
  KNOWLEDGE_WRONG_PRINT_REPLACEMENT_LABEL,
  SETTINGS_TRISTATE_UNKNOWN_LABEL,
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
  SETTINGS_CONFLICT_MESSAGE,
  SETTINGS_UNSPECIFIED_LABEL,
  SETTINGS_UNAVAILABLE_DESCRIPTION,
  SETTINGS_UNAVAILABLE_TITLE,
  triStateFromChoice,
} from "./assistant-settings-format.ts";

test("unknown / missing values keep their own neutral label, not Hayır", () => {
  assert.equal(formatUnspecifiedValue(null), SETTINGS_UNSPECIFIED_LABEL);
  assert.equal(formatBinaryChoiceLabel(null), SETTINGS_UNSPECIFIED_LABEL);
  // Tri-state NULL is presented as the natural "Bilgi yok" — still a
  // distinct third state, never collapsed into "Hayır".
  assert.equal(formatTriStateLabel(null), SETTINGS_TRISTATE_UNKNOWN_LABEL);
  assert.equal(SETTINGS_TRISTATE_UNKNOWN_LABEL, "Bilgi yok");
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
  assert.equal(
    KNOWLEDGE_CUSTOM_TEXT_MAX_LABEL,
    "Özel yazı en fazla kaç karakter olabilir?",
  );
  assert.equal(KNOWLEDGE_DISHWASHER_LABEL, "Bulaşık makinesine uygun mu?");
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
  // Renamed label: the helper keys on the seller-facing title, which
  // is now "Sipariş Bilgisi Toplama".
  assert.match(
    assistantHubDescription("Sipariş Bilgisi Toplama"),
    /Mevcut siparişler için/,
  );
  assert.match(assistantHubDescription("Ürünler"), /ürün bazlı/);
  assert.match(
    assistantHubDescription("Mesaja Göre Cevaplar"),
    /belirli ifadeler geçtiğinde/,
  );
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

/* ------------------------------------------------------------------ */
/* Seller-facing label pass (business questions, not form fields)      */
/* ------------------------------------------------------------------ */

test("field labels read as clear business questions", () => {
  assert.equal(KNOWLEDGE_ACCEPTS_RETURNS_LABEL, "İade kabul ediyor musunuz?");
  assert.equal(
    KNOWLEDGE_DAMAGE_REPLACEMENT_LABEL,
    "Hasarlı ürünlerde değişim yapılıyor mu?",
  );
  assert.equal(
    KNOWLEDGE_WRONG_PRINT_REPLACEMENT_LABEL,
    "Yanlış baskıda değişim yapılıyor mu?",
  );
  assert.equal(KNOWLEDGE_SAME_DAY_LABEL, "Aynı gün gönderim yapılıyor mu?");
  assert.equal(
    KNOWLEDGE_INTERNATIONAL_LABEL,
    "Yurt dışına gönderim yapılıyor mu?",
  );
});

test("preparation time stays two backend fields under one seller concept", () => {
  assert.equal(KNOWLEDGE_PROCESSING_GROUP_LABEL, "Hazırlık süresi");
  assert.equal(KNOWLEDGE_PROCESSING_MIN_INPUT_LABEL, "En az");
  assert.equal(KNOWLEDGE_PROCESSING_MAX_INPUT_LABEL, "En çok");
});

test("copy never leaks storage vocabulary", () => {
  const touchedCopy = [
    KNOWLEDGE_GLOBAL_SCOPE_NOTE,
    KNOWLEDGE_SAVED_ANSWERS_DESCRIPTION,
    KNOWLEDGE_ACCEPTS_RETURNS_LABEL,
    KNOWLEDGE_DAMAGE_REPLACEMENT_LABEL,
    KNOWLEDGE_WRONG_PRINT_REPLACEMENT_LABEL,
    SETTINGS_TRISTATE_UNKNOWN_LABEL,
  ].join(" ");
  assert.doesNotMatch(
    touchedCopy,
    /null|kaydedilir|expected.?version|canonical|normalize|veritabanı/i,
  );
});

/* ------------------------------------------------------------------ */
/* Global / all-product scope                                          */
/* ------------------------------------------------------------------ */

test("the global scope note is explicit and links to Ürünler", () => {
  assert.equal(
    KNOWLEDGE_GLOBAL_SCOPE_NOTE,
    "Bu bilgiler tüm ürünlerde ortak kullanılır. Ürüne özel bilgiler için Ürünler bölümünü kullanın.",
  );
  assert.equal(KNOWLEDGE_PRODUCTS_HREF, "/seller/products");
  assert.equal(KNOWLEDGE_PRODUCTS_LINK_LABEL, "Ürünler bölümüne git");
  // Never claims per-product values.
  assert.doesNotMatch(KNOWLEDGE_GLOBAL_SCOPE_NOTE, /her ürün için ayrı/);
});

/* ------------------------------------------------------------------ */
/* Saved customer answers (visibility link only)                       */
/* ------------------------------------------------------------------ */

test("saved customer answers link targets the answered Unanswered view", () => {
  assert.equal(KNOWLEDGE_SAVED_ANSWERS_HREF, "/seller/unanswered?view=answered");
  assert.equal(KNOWLEDGE_SAVED_ANSWERS_TITLE, "Kayıtlı müşteri cevapları");
  assert.match(
    KNOWLEDGE_SAVED_ANSWERS_DESCRIPTION,
    /Cevaplanamayan Sorular/,
  );
  // States plainly that these answers do NOT become Rules, and makes
  // no AI-learning claims.
  assert.match(
    KNOWLEDGE_SAVED_ANSWERS_DESCRIPTION,
    /Mesaja Göre Cevaplar bölümüne eklenmez/,
  );
  assert.doesNotMatch(
    KNOWLEDGE_SAVED_ANSWERS_DESCRIPTION,
    /öğren|eğit|yapay zeka|\bAI\b/i,
  );
});
