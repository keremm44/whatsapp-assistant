/**
 * Assistant Settings hub summary tests.
 *
 *   node --test src/lib/seller/assistant-settings-hub.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type {
  OrderSettings,
  ProductSettings,
  ReturnPolicySettings,
  SellerSettings,
  ShippingSettings,
  UsageSettings,
} from "./assistant-settings.ts";
import {
  HUB_CARDS,
  HUB_FORBIDDEN_COPY,
  HUB_KNOWLEDGE_HREF,
  HUB_ORDER_COLLECTION_HREF,
  HUB_PRODUCTS_HREF,
  HUB_RULES_HREF,
  HUB_UNAVAILABLE_SUMMARY,
  summarizeActiveProducts,
  summarizeActiveRules,
  summarizeAssistantKnowledge,
  summarizeOrderCollection,
} from "./assistant-settings-hub.ts";

const settings = (overrides: {
  product?: Partial<ProductSettings>;
  order?: Partial<OrderSettings>;
  usage?: Partial<UsageSettings>;
  shipping?: Partial<ShippingSettings>;
  returnPolicy?: Partial<ReturnPolicySettings>;
} = {}): SellerSettings => ({
  version: 3,
  updatedAt: null,
  business: {
    name: "Alya",
    phone: null,
    storeName: "Alya Atölye",
    storeLink: null,
  },
  product: {
    material: null,
    sizeMl: null,
    printMethod: null,
    customTextMaxLength: null,
    ...overrides.product,
  },
  order: {
    minQuantity: null,
    maxQuantity: null,
    imageRequired: null,
    customTextRequired: null,
    ...overrides.order,
  },
  usage: {
    microwaveSafe: null,
    dishwasherSafe: null,
    handWashRecommended: null,
    foodSafe: null,
    ...overrides.usage,
  },
  shipping: {
    processingDaysMin: null,
    processingDaysMax: null,
    sameDayAvailable: null,
    company: null,
    international: null,
    ...overrides.shipping,
  },
  returnPolicy: {
    acceptsReturns: null,
    returnPeriodDays: null,
    damageReplacement: null,
    wrongPrintReplacement: null,
    ...overrides.returnPolicy,
  },
});

const completeShipping = (): Partial<ShippingSettings> => ({
  processingDaysMin: 1,
  processingDaysMax: 3,
  sameDayAvailable: false,
  company: "Yurtiçi",
  international: false,
});

const completeProduct = (): Partial<ProductSettings> => ({
  material: "Seramik",
  sizeMl: 330,
  printMethod: "Süblimasyon",
});

const completeUsage = (): Partial<UsageSettings> => ({
  microwaveSafe: true,
  dishwasherSafe: false,
  handWashRecommended: true,
  foodSafe: true,
});

const completeReturns = (): Partial<ReturnPolicySettings> => ({
  acceptsReturns: true,
  returnPeriodDays: 14,
  damageReplacement: true,
  wrongPrintReplacement: false,
});

test("0 / 1 / n active products summaries are factual counts", () => {
  assert.equal(summarizeActiveProducts(0), "Henüz aktif ürün yok");
  assert.equal(summarizeActiveProducts(1), "1 aktif ürün");
  assert.equal(summarizeActiveProducts(4), "4 aktif ürün");
  assert.doesNotMatch(summarizeActiveProducts(0), /tamamlandı|hazır|bozuk/);
});

test("0 / 1 / n active rules summaries do not use hit_count or AI wording", () => {
  assert.equal(summarizeActiveRules(0), "Henüz etkin cevap yok");
  assert.equal(summarizeActiveRules(1), "1 etkin cevap");
  assert.equal(summarizeActiveRules(7), "7 etkin cevap");
  assert.doesNotMatch(summarizeActiveRules(3), /öğren|AI|hit/i);
});

test("false booleans are defined answers, not missing values", () => {
  const definedFalse = settings({
    product: completeProduct(),
    shipping: completeShipping(),
    usage: completeUsage(),
    returnPolicy: completeReturns(),
  });
  assert.equal(summarizeAssistantKnowledge(definedFalse), "Temel bilgiler tanımlı");
  assert.notEqual(
    summarizeAssistantKnowledge(
      settings({
        product: completeProduct(),
        shipping: completeShipping(),
        usage: { dishwasherSafe: false },
      }),
    ),
    "Henüz bilgi eklenmemiş",
  );
});

test("missing/null remains unknown and is not coerced to false", () => {
  assert.equal(summarizeAssistantKnowledge(settings()), "Henüz bilgi eklenmemiş");
  assert.equal(
    summarizeOrderCollection(settings()),
    "Sipariş toplama ayarları henüz belirtilmedi",
  );
  assert.notEqual(summarizeOrderCollection(settings()), "Sipariş görseli isteğe bağlı");
});

test("knowledge summary follows the documented priority", () => {
  assert.equal(summarizeAssistantKnowledge(settings()), "Henüz bilgi eklenmemiş");
  assert.equal(
    summarizeAssistantKnowledge(settings({ product: completeProduct() })),
    "Kargo bilgileri eksik",
  );
  assert.equal(
    summarizeAssistantKnowledge(
      settings({
        shipping: completeShipping(),
        product: { material: "Seramik" },
      }),
    ),
    "Ürün bilgileri eksik",
  );
  assert.equal(
    summarizeAssistantKnowledge(
      settings({
        shipping: completeShipping(),
        product: completeProduct(),
        order: { customTextRequired: true },
      }),
    ),
    "Ürün bilgileri eksik",
  );
  assert.equal(
    summarizeAssistantKnowledge(
      settings({
        shipping: completeShipping(),
        product: completeProduct(),
        usage: { dishwasherSafe: false },
      }),
    ),
    "Bazı bilgiler henüz belirtilmedi",
  );
  assert.equal(
    summarizeAssistantKnowledge(
      settings({
        shipping: completeShipping(),
        product: completeProduct(),
        usage: completeUsage(),
        returnPolicy: completeReturns(),
      }),
    ),
    "Temel bilgiler tanımlı",
  );
});

test("order collection summary prefers image, then quantity, then custom text", () => {
  assert.equal(
    summarizeOrderCollection(settings()),
    "Sipariş toplama ayarları henüz belirtilmedi",
  );
  assert.equal(
    summarizeOrderCollection(settings({ order: { imageRequired: true, minQuantity: 2 } })),
    "Sipariş görseli zorunlu",
  );
  assert.equal(
    summarizeOrderCollection(settings({ order: { imageRequired: false } })),
    "Sipariş görseli isteğe bağlı",
  );
  assert.equal(
    summarizeOrderCollection(settings({ order: { minQuantity: 3 } })),
    "Minimum sipariş: 3",
  );
  assert.equal(
    summarizeOrderCollection(
      settings({
        order: { customTextRequired: true },
        product: { customTextMaxLength: 40 },
      }),
    ),
    "Özel yazı zorunlu",
  );
});

test("unavailable copy is not a zero count", () => {
  assert.notEqual(HUB_UNAVAILABLE_SUMMARY, summarizeActiveProducts(0));
  assert.notEqual(HUB_UNAVAILABLE_SUMMARY, summarizeActiveRules(0));
  assert.match(HUB_UNAVAILABLE_SUMMARY, /alınamıyor/);
});

test("hub cards keep the four real destinations in seller mental order", () => {
  assert.deepEqual(
    HUB_CARDS.map((card) => card.href),
    [
      HUB_PRODUCTS_HREF,
      HUB_RULES_HREF,
      HUB_KNOWLEDGE_HREF,
      HUB_ORDER_COLLECTION_HREF,
    ],
  );
  assert.deepEqual(
    HUB_CARDS.map((card) => card.title),
    [
      "Ürünler",
      "Mesaja Göre Cevaplar",
      "Asistanın Bildikleri",
      "Sipariş Bilgisi Toplama",
    ],
  );
});

test("hub copy never invents readiness, percentage, or AI health", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = [
    readFileSync(
      path.resolve(
        dir,
        "../../components/seller/assistant-settings/assistant-settings-hub.tsx",
      ),
      "utf8",
    ),
    readFileSync(
      path.resolve(dir, "../../app/seller/assistant-settings/page.tsx"),
      "utf8",
    ),
  ].join("\n");
  assert.doesNotMatch(sources, /%\s*100|tamamlandı|AI sağlığı|öğrenilen|güven skoru/i);
  assert.equal(HUB_FORBIDDEN_COPY.includes("hazır"), true);
  assert.doesNotMatch(summarizeAssistantKnowledge(settings()), /hazır|%|tamamlandı/i);
  assert.doesNotMatch(
    summarizeOrderCollection(settings({ order: { imageRequired: true } })),
    /hazır|%|tamamlandı/i,
  );
});
