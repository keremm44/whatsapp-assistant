from __future__ import annotations

import re
from typing import Any, TypedDict


SELLER_ID_DEFAULT = 2
DEFAULT_STORE_LINK_TEXT = "Mağaza bağlantısı henüz eklenmemiş."
ESCALATION_RESPONSE = (
    "Bu konuda kayıtlı net bir bilgimiz bulunmuyor. "
    "Sorunuzu satıcımıza iletiyorum."
)
OFF_TOPIC_RESPONSE = (
    "Bu konuda yardımcı olamıyorum. "
    "Sadece ürün, sipariş ve kargo konularında yardımcı oluyorum."
)
DESIGN_RESPONSE = (
    "Tasarım veya görsel düzenleme hizmeti vermiyoruz. "
    "Baskıya hazır görselinizi göndermeniz gerekiyor."
)
IMAGE_RESPONSE = "Baskı için net ve yüksek kaliteli bir görsel göndermenizi öneriyoruz."
DISCOUNT_RESPONSE = "Fiyatlarımız sabittir, indirim uygulanmamaktadır."
GREETING_RESPONSE = "Merhaba, size nasıl yardımcı olabilirim?"


class OutgoingControlContext(TypedDict):
    incoming_message_id: int
    starting_control_version: int


ACTIVE_SELLER_STATUSES = {"active", "beta_active"}
SELLER_LIFECYCLE_REASONS = {
    "emergency_paused": "Asistan satıcı tarafından acil olarak durduruldu.",
    "ai_disabled": "Asistan bu işletme için etkin değil.",
    "onboarding_incomplete": "İşletme kurulumu henüz tamamlanmadı.",
    "inactive_status": "İşletme hesabı şu anda canlı kullanıma açık değil.",
}

YASAK_KELIMELER = {
    "amk": "high", "aq": "high", "sg": "high", "pezevenk": "high",
    "orospu": "high", "piç": "high", "yarrak": "high", "sik": "high",
    "sikik": "high", "siktim": "high", "sikeceğim": "critical",
    "sikerim": "high", "amına": "high", "anan": "high", "ananı": "high",
    "anasını": "high", "siktir": "high", "sikeyim": "high", "amcık": "high",
    "amcığa": "high", "göt": "medium", "ibne": "high", "kahpe": "high",
    "puşt": "high", "şerefsiz": "medium", "namussuz": "medium",
    "orospunun": "high", "orospuçocuğu": "critical", "salak": "low",
    "aptal": "low", "gerizekalı": "medium", "manyak": "low", "hayvan": "low",
    "eşek": "low", "domuz": "medium", "pislik": "low", "öldürürüm": "critical",
    "gebertirim": "critical", "vururum": "critical", "keserim": "critical",
    "fuck": "high", "shit": "medium", "bitch": "high", "asshole": "high",
    "dick": "high", "motherfucker": "critical", "bastard": "medium",
    "fucking": "high", "fucked": "high",
}
COKLU_IFADELER = {
    "amına koyayım": "critical",
    "orospu çocuğu": "critical",
    "geri zekalı": "medium",
}
HAKARET_KOKLERI = {
    "salak": "low", "aptal": "low", "gerizekalı": "medium", "manyak": "low",
    "şerefsiz": "medium", "namussuz": "medium", "pislik": "low",
}
TURKCE_HAKARET_EKLERI = {
    "", "sın", "sin", "sun", "sün", "sınız", "siniz", "sunuz", "sünüz",
    "lar", "ler", "lık", "lik", "luk", "lük", "ça", "çe",
}


def uygunsuz_icerik_bul(mesaj: str) -> dict[str, Any] | None:
    mesaj_lower = mesaj.lower().strip()
    for ifade, severity in COKLU_IFADELER.items():
        if ifade in mesaj_lower:
            return {"matched_term": ifade, "severity": severity}

    kelimeler = re.findall(r"[\wşğıöüç]+", mesaj_lower, flags=re.UNICODE)
    for kelime in kelimeler:
        severity = YASAK_KELIMELER.get(kelime)
        if severity:
            return {"matched_term": kelime, "severity": severity}
        for kok, kok_severity in HAKARET_KOKLERI.items():
            if not kelime.startswith(kok):
                continue
            kalan_ek = kelime[len(kok):]
            if kalan_ek in TURKCE_HAKARET_EKLERI:
                return {
                    "matched_term": kelime,
                    "matched_root": kok,
                    "severity": kok_severity,
                }
    return None


NEGATIVE_ORDER_CONTEXTS = {
    "bulamadım", "bulamıyorum", "yok", "hatırlamıyorum", "unuttum", "kayıp",
    "silinmiş", "sonra gönderirim", "birazdan gönderirim",
}


def check_negative_order_context(message: str) -> bool:
    normalized = message.lower().strip()
    return any(phrase in normalized for phrase in NEGATIVE_ORDER_CONTEXTS)


def extract_order_number(message: str) -> str | None:
    if not message or check_negative_order_context(message):
        return None
    text = message.upper().strip()
    patterns = [
        r"\b([A-Z]{2,10}[-_ ]?\d{3,20})\b",
        r"(#\d{3,20})\b",
        r"\b(\d{7,20})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).replace("#", "").strip()
    return None


def basit_kural_esleme(
    mesaj: str,
    kurallar: list[dict[str, Any]],
) -> dict[str, Any] | None:
    mesaj_lower = mesaj.lower().strip()
    for kural in kurallar:
        trigger = str(kural.get("trigger_text") or "").lower().strip()
        if trigger and trigger in mesaj_lower:
            return kural
    return None


def get_nested_value(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for key in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
        if current is None:
            return None
    return current


def product_info_response(
    intent: str,
    product_info: dict[str, Any],
) -> tuple[str | None, str | None]:
    if intent == "microwave_question":
        field = "usage.microwave_safe"
        value = get_nested_value(product_info, field)
        if value is None:
            return None, field
        if value is True:
            return "Evet, kupalarımız mikrodalgada kullanılabilir.", field
        return "Kupalarımız mikrodalgada kullanıma uygun değildir.", field

    if intent == "dishwasher_question":
        field = "usage.dishwasher_safe"
        value = get_nested_value(product_info, field)
        if value is None:
            return None, field
        if value is True:
            return "Evet, kupalarımız bulaşık makinesinde yıkanabilir.", field
        hand_wash = get_nested_value(product_info, "usage.hand_wash_recommended")
        if hand_wash is True:
            return "Ürünün elde yıkanmasını öneriyoruz.", field
        return "Ürün bulaşık makinesinde yıkamaya uygun değildir.", field

    if intent == "material_question":
        field = "product.material"
        value = get_nested_value(product_info, field)
        if value is None:
            return None, field
        return f"Ürün materyali: {value}.", field

    if intent == "size_question":
        field = "product.size_ml"
        value = get_nested_value(product_info, field)
        if value is None:
            return None, field
        return f"Kupanın hacmi {value} ml'dir.", field

    if intent == "shipping_company":
        field = "shipping.company"
        value = get_nested_value(product_info, field)
        if value is None:
            return None, field
        return f"Siparişler {value} ile gönderilmektedir.", field

    if intent == "international_shipping":
        field = "shipping.international"
        value = get_nested_value(product_info, field)
        if value is None:
            return None, field
        if value is True:
            return "Evet, yurt dışına gönderim yapılmaktadır.", field
        return "Şu anda yurt dışına gönderim yapılmamaktadır.", field

    if intent == "shipping_time":
        min_days = get_nested_value(product_info, "shipping.processing_days_min")
        max_days = get_nested_value(product_info, "shipping.processing_days_max")
        field = "shipping.processing_days_min"
        if min_days is None and max_days is None:
            return None, field
        if min_days is not None and max_days is not None:
            if min_days == max_days:
                return f"Siparişiniz yaklaşık {min_days} iş günü içinde kargoya verilir.", field
            return f"Siparişiniz yaklaşık {min_days}-{max_days} iş günü içinde kargoya verilir.", field
        days = min_days if min_days is not None else max_days
        return f"Siparişiniz yaklaşık {days} iş günü içinde kargoya verilir.", field

    if intent == "custom_text_question":
        required = get_nested_value(product_info, "order.custom_text_required")
        max_length = get_nested_value(product_info, "product.custom_text_max_length")
        field = "order.custom_text_required"
        if required is None and max_length is None:
            return None, field
        if required is True and max_length:
            return (
                f"Kupaya yazılacak metni göndermeniz gerekiyor. Metin en fazla {max_length} karakter olabilir.",
                field,
            )
        if required is True:
            return "Kupaya yazılacak özel metni göndermeniz gerekiyor.", field
        if max_length:
            return f"İsterseniz kupaya en fazla {max_length} karakterlik özel yazı ekletebilirsiniz.", field
        return "Özel yazı eklenmesi zorunlu değildir.", field

    return None, None


def safe_template_response(intent: str, store_link: str) -> str | None:
    if intent == "greeting":
        return GREETING_RESPONSE
    if intent == "price_question":
        link_text = store_link or DEFAULT_STORE_LINK_TEXT
        return f"Ürünlerimizi ve fiyatlarını mağazamızdan görüntüleyebilirsiniz: {link_text}"
    if intent == "discount_request":
        return DISCOUNT_RESPONSE
    if intent == "design_request":
        return DESIGN_RESPONSE
    if intent == "image_question":
        return IMAGE_RESPONSE
    if intent == "off_topic":
        return OFF_TOPIC_RESPONSE
    return None


def seller_lifecycle_block(seller: dict[str, Any]) -> tuple[str, str] | None:
    if bool(seller.get("emergency_paused")):
        return "emergency_paused", SELLER_LIFECYCLE_REASONS["emergency_paused"]
    if seller.get("ai_enabled") is not True:
        return "ai_disabled", SELLER_LIFECYCLE_REASONS["ai_disabled"]
    if seller.get("onboarding_completed") is not True:
        return "onboarding_incomplete", SELLER_LIFECYCLE_REASONS["onboarding_incomplete"]
    system_status = str(seller.get("system_status") or "").strip()
    if system_status not in ACTIVE_SELLER_STATUSES:
        return "inactive_status", SELLER_LIFECYCLE_REASONS["inactive_status"]
    return None
