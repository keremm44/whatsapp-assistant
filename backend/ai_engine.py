from __future__ import annotations

import json
import os
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY ortam değişkeni bulunamadı.")

client = OpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)

MODEL = "llama-3.3-70b-versatile"

CONFIDENCE_THRESHOLD = 0.80


VALID_INTENTS = {
    "greeting",
    "price_question",
    "discount_request",
    "shipping_time",
    "shipping_company",
    "international_shipping",
    "microwave_question",
    "dishwasher_question",
    "material_question",
    "size_question",
    "order_intent",
    "order_confirmation_yes",
    "order_confirmation_no",
    "return_request",
    "complaint",
    "image_question",
    "design_request",
    "custom_text_question",
    "off_topic",
    "unclear",
}


CLASSIFIER_PROMPT = """
Sen bir WhatsApp mesajı niyet sınıflandırıcısısın.

Görevin yalnızca mesajın kategorisini belirlemektir.
Müşteriye cevap yazma.
Bilgi uydurma.
Sadece geçerli JSON döndür.

Geçerli niyetler:

- greeting
- price_question
- discount_request
- shipping_time
- shipping_company
- international_shipping
- microwave_question
- dishwasher_question
- material_question
- size_question
- order_intent
- order_confirmation_yes
- order_confirmation_no
- return_request
- complaint
- image_question
- design_request
- custom_text_question
- off_topic
- unclear

Dönüş formatı:

{
  "intent": "price_question",
  "confidence": 0.95,
  "alternatives": [
    {
      "intent": "unclear",
      "confidence": 0.03
    }
  ],
  "entities": {},
  "reason": "Müşteri ürün fiyatını soruyor."
}

Kurallar:

- confidence 0 ile 1 arasında olmalı.
- Emin değilsen unclear seç.
- Mesaj birden fazla anlam taşıyorsa en baskın niyeti seç.
- "Evet", "aldım", "sipariş verdim" ifadeleri order_confirmation_yes.
- "Hayır", "almadım", "henüz vermedim" ifadeleri order_confirmation_no.
- Sipariş vermek isteyen mesajlar order_intent.
- İade veya değişim talepleri return_request.
- Hasarlı, kırık, yanlış gelen ürünler complaint.
- Görsel gönderme veya görsel kalitesi soruları image_question.
- Tasarım oluşturma/düzenleme istekleri design_request.
"""


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        return max(0.0, min(number, 1.0))
    except (TypeError, ValueError):
        return default


def _normalize_result(data: dict[str, Any]) -> dict[str, Any]:
    intent = data.get("intent", "unclear")

    if intent not in VALID_INTENTS:
        intent = "unclear"

    alternatives = data.get("alternatives")

    if not isinstance(alternatives, list):
        alternatives = []

    normalized_alternatives = []

    for item in alternatives[:3]:
        if not isinstance(item, dict):
            continue

        alternative_intent = item.get("intent", "unclear")

        if alternative_intent not in VALID_INTENTS:
            alternative_intent = "unclear"

        normalized_alternatives.append(
            {
                "intent": alternative_intent,
                "confidence": _safe_float(
                    item.get("confidence"),
                    0.0,
                ),
            }
        )

    entities = data.get("entities")

    if not isinstance(entities, dict):
        entities = {}

    return {
        "durum": "başarılı",
        "intent": intent,
        "confidence": _safe_float(
            data.get("confidence"),
            0.0,
        ),
        "alternatives": normalized_alternatives,
        "entities": entities,
        "reason": str(data.get("reason", "")),
        "fallback_used": False,
    }


def keyword_based_classify(message: str) -> dict[str, Any]:
    """
    AI kullanılamadığında yalnızca çok net kalıpları sınıflandırır.
    Belirsiz mesajlar unclear döner.
    """
    normalized = " ".join(message.lower().strip().split())

    exact_patterns = {
        "greeting": {
            "merhaba",
            "selam",
            "günaydın",
            "iyi günler",
            "iyi akşamlar",
            "selamün aleyküm",
            "selamun aleykum",
        },
        "price_question": {
            "fiyat ne kadar",
            "kaç lira",
            "kaç para",
            "fiyatı nedir",
            "fiyat listesi",
        },
        "shipping_time": {
            "kaç günde gelir",
            "ne zaman gelir",
            "ne zaman kargolanır",
            "kargo ne zaman çıkar",
        },
        "order_intent": {
            "sipariş vermek istiyorum",
            "sipariş oluşturmak istiyorum",
            "satın almak istiyorum",
        },
        "order_confirmation_yes": {
            "evet",
            "aldım",
            "sipariş verdim",
            "satın aldım",
        },
        "order_confirmation_no": {
            "hayır",
            "almadım",
            "henüz almadım",
            "sipariş vermedim",
        },
    }

    for intent, patterns in exact_patterns.items():
        if normalized in patterns:
            return {
                "durum": "başarılı",
                "intent": intent,
                "confidence": 0.90,
                "alternatives": [],
                "entities": {},
                "reason": "Kesin fallback kalıbı eşleşti.",
                "fallback_used": True,
            }

    return {
        "durum": "başarılı",
        "intent": "unclear",
        "confidence": 0.0,
        "alternatives": [],
        "entities": {},
        "reason": "Güvenilir fallback eşleşmesi bulunamadı.",
        "fallback_used": True,
    }


def classify_intent(message: str) -> dict[str, Any]:
    """
    Müşteri mesajının niyetini sınıflandırır.
    AI müşteriye cevap üretmez.
    """
    if not message or not message.strip():
        return {
            "durum": "başarılı",
            "intent": "unclear",
            "confidence": 0.0,
            "alternatives": [],
            "entities": {},
            "reason": "Boş mesaj.",
            "fallback_used": False,
        }

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": CLASSIFIER_PROMPT,
                },
                {
                    "role": "user",
                    "content": message.strip(),
                },
            ],
            temperature=0,
            max_tokens=250,
            response_format={"type": "json_object"},
            timeout=8,
        )

        raw_content = response.choices[0].message.content

        if not raw_content:
            return keyword_based_classify(message)

        parsed = json.loads(raw_content)

        if not isinstance(parsed, dict):
            return keyword_based_classify(message)

        result = _normalize_result(parsed)
        result["kullanılan_token"] = (
            response.usage.total_tokens
            if response.usage
            else 0
        )

        return result

    except Exception as exc:
        fallback = keyword_based_classify(message)
        fallback["ai_error"] = str(exc)
        return fallback


def intent_is_safe(result: dict[str, Any]) -> bool:
    """
    Sınıflandırma sonucunun otomatik işleme uygun olup olmadığını belirler.
    """
    if result.get("durum") != "başarılı":
        return False

    if result.get("intent") == "unclear":
        return False

    confidence = _safe_float(result.get("confidence"), 0.0)

    if confidence < CONFIDENCE_THRESHOLD:
        return False

    alternatives = result.get("alternatives") or []

    if alternatives:
        second_confidence = _safe_float(
            alternatives[0].get("confidence"),
            0.0,
        )

        if confidence - second_confidence < 0.15:
            return False

    return True


def run_classifier_test() -> None:
    test_messages = [
        "Merhaba",
        "Kupanız ne kadar?",
        "İndirim yapar mısınız?",
        "Kaç günde kargoya verirsiniz?",
        "Mikrodalgaya girer mi?",
        "Bulaşık makinesinde yıkanır mı?",
        "Sipariş vermek istiyorum",
        "Evet aldım",
        "Hayır henüz almadım",
        "Kupam kırık geldi",
        "İade etmek istiyorum",
        "Tasarım hazırlar mısınız?",
        "Bugün hava nasıl?",
        "Bir şey soracağım",
    ]

    print("=" * 70)
    print("NİYET SINIFLANDIRICI TESTİ")
    print("=" * 70)

    for message in test_messages:
        result = classify_intent(message)

        print(f"\nMesaj: {message}")
        print(f"Intent: {result.get('intent')}")
        print(f"Confidence: {result.get('confidence')}")
        print(f"Güvenli: {intent_is_safe(result)}")
        print(f"Fallback: {result.get('fallback_used')}")
        print(f"Sebep: {result.get('reason')}")


if __name__ == "__main__":
    run_classifier_test()