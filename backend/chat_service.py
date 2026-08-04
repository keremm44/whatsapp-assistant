from __future__ import annotations

import re
from typing import Any

from ai_engine import classify_intent, intent_is_safe
from database import (
    block_customer,
    count_recent_violations,
    create_seller_notification,
    get_active_rules,
    get_or_create_customer,
    get_seller_by_id,
    get_state,
    increment_rule_hit_count,
    is_customer_muted,
    mute_customer,
    record_violation,
    save_message,
    save_unanswered_question,
    transition_state,
)


# =====================================================
# SABİTLER
# =====================================================

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

IMAGE_RESPONSE = (
    "Baskı için net ve yüksek kaliteli bir görsel göndermenizi öneriyoruz."
)

DISCOUNT_RESPONSE = "Fiyatlarımız sabittir, indirim uygulanmamaktadır."

GREETING_RESPONSE = "Merhaba, size nasıl yardımcı olabilirim?"


# =====================================================
# KÜFÜR / SALDIRI FİLTRESİ
# =====================================================

YASAK_KELIMELER = {
    # Ağır küfür
    "amk": "high",
    "aq": "high",
    "sg": "high",
    "pezevenk": "high",
    "orospu": "high",
    "piç": "high",
    "yarrak": "high",
    "sik": "high",
    "sikik": "high",
    "siktim": "high",
    "sikeceğim": "critical",
    "sikerim": "high",
    "amına": "high",
    "anan": "high",
    "ananı": "high",
    "anasını": "high",
    "siktir": "high",
    "sikeyim": "high",
    "amcık": "high",
    "amcığa": "high",
    "göt": "medium",
    "ibne": "high",
    "kahpe": "high",
    "puşt": "high",
    "şerefsiz": "medium",
    "namussuz": "medium",
    "orospunun": "high",
    "orospuçocuğu": "critical",

    # Hakaret
    "salak": "low",
    "aptal": "low",
    "gerizekalı": "medium",
    "manyak": "low",
    "hayvan": "low",
    "eşek": "low",
    "domuz": "medium",
    "pislik": "low",

    # Tehdit
    "öldürürüm": "critical",
    "gebertirim": "critical",
    "vururum": "critical",
    "keserim": "critical",

    # İngilizce
    "fuck": "high",
    "shit": "medium",
    "bitch": "high",
    "asshole": "high",
    "dick": "high",
    "motherfucker": "critical",
    "bastard": "medium",
    "fucking": "high",
    "fucked": "high",
}

COKLU_IFADELER = {
    "amına koyayım": "critical",
    "orospu çocuğu": "critical",
    "geri zekalı": "medium",
}

HAKARET_KOKLERI = {
    "salak": "low",
    "aptal": "low",
    "gerizekalı": "medium",
    "manyak": "low",
    "şerefsiz": "medium",
    "namussuz": "medium",
    "pislik": "low",
}

TURKCE_HAKARET_EKLERI = {
    "",
    "sın",
    "sin",
    "sun",
    "sün",
    "sınız",
    "siniz",
    "sunuz",
    "sünüz",
    "lar",
    "ler",
    "lık",
    "lik",
    "luk",
    "lük",
    "ça",
    "çe",
}


def uygunsuz_icerik_bul(mesaj: str) -> dict[str, Any] | None:
    """
    Mesajdaki uygunsuz içeriği bulur.

    Tam kelimeleri ve güvenli Türkçe ek almış hakaretleri kontrol eder.
    """
    mesaj_lower = mesaj.lower().strip()

    # Önce çok kelimeli ifadeler
    for ifade, severity in COKLU_IFADELER.items():
        if ifade in mesaj_lower:
            return {
                "matched_term": ifade,
                "severity": severity,
            }

    kelimeler = re.findall(
        r"[\wşğıöüç]+",
        mesaj_lower,
        flags=re.UNICODE,
    )

    for kelime in kelimeler:
        # Tam kelime eşleşmesi
        severity = YASAK_KELIMELER.get(kelime)

        if severity:
            return {
                "matched_term": kelime,
                "severity": severity,
            }

        # Türkçe ek almış hakaretler:
        # salaksınız, aptalsın, şerefsizler vb.
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


# =====================================================
# SİPARİŞ NUMARASI ÇIKARMA
# =====================================================

NEGATIVE_ORDER_CONTEXTS = {
    "bulamadım",
    "bulamıyorum",
    "yok",
    "hatırlamıyorum",
    "unuttum",
    "kayıp",
    "silinmiş",
    "sonra gönderirim",
    "birazdan gönderirim",
}


def check_negative_order_context(message: str) -> bool:
    normalized = message.lower().strip()

    return any(
        phrase in normalized
        for phrase in NEGATIVE_ORDER_CONTEXTS
    )


def extract_order_number(message: str) -> str | None:
    """
    Metnin içinden sipariş numarası adayı çıkarır.
    Platform formatına sıkı şekilde bağlı değildir.
    """
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
            candidate = match.group(1)
            candidate = candidate.replace("#", "").strip()

            return candidate

    return None


# =====================================================
# KURAL EŞLEŞTİRME
# =====================================================

def basit_kural_esleme(
    mesaj: str,
    kurallar: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """
    Satıcının aktif kurallarını mesajla eşleştirir.
    """
    mesaj_lower = mesaj.lower().strip()

    for kural in kurallar:
        trigger = str(kural.get("trigger_text") or "").lower().strip()

        if trigger and trigger in mesaj_lower:
            return kural

    return None


# =====================================================
# PRODUCT INFO OKUMA
# =====================================================

def get_nested_value(
    data: dict[str, Any],
    path: str,
) -> Any:
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
    """
    Intent'e göre güvenilir product_info alanından cevap üretir.

    Dönüş:
    (cevap, suggested_field)
    """
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

        hand_wash = get_nested_value(
            product_info,
            "usage.hand_wash_recommended",
        )

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
        min_days = get_nested_value(
            product_info,
            "shipping.processing_days_min",
        )
        max_days = get_nested_value(
            product_info,
            "shipping.processing_days_max",
        )

        field = "shipping.processing_days_min"

        if min_days is None and max_days is None:
            return None, field

        if min_days is not None and max_days is not None:
            if min_days == max_days:
                return (
                    f"Siparişiniz yaklaşık {min_days} iş günü içinde kargoya verilir.",
                    field,
                )

            return (
                f"Siparişiniz yaklaşık {min_days}-{max_days} iş günü içinde kargoya verilir.",
                field,
            )

        days = min_days if min_days is not None else max_days

        return (
            f"Siparişiniz yaklaşık {days} iş günü içinde kargoya verilir.",
            field,
        )

    if intent == "custom_text_question":
        required = get_nested_value(
            product_info,
            "order.custom_text_required",
        )
        max_length = get_nested_value(
            product_info,
            "product.custom_text_max_length",
        )

        field = "order.custom_text_required"

        if required is None and max_length is None:
            return None, field

        if required is True and max_length:
            return (
                f"Kupaya yazılacak metni göndermeniz gerekiyor. "
                f"Metin en fazla {max_length} karakter olabilir.",
                field,
            )

        if required is True:
            return "Kupaya yazılacak özel metni göndermeniz gerekiyor.", field

        if max_length:
            return (
                f"İsterseniz kupaya en fazla {max_length} karakterlik özel yazı ekletebilirsiniz.",
                field,
            )

        return "Özel yazı eklenmesi zorunlu değildir.", field

    return None, None


# =====================================================
# MESAJ CEVABI KAYDETME
# =====================================================

def outgoing_response(
    seller_id: int,
    customer_id: int,
    response_text: str,
    source: str,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    save_result = save_message(
        seller_id=seller_id,
        customer_id=customer_id,
        direction="outgoing",
        content=response_text,
        was_auto_replied=True,
        ai_confidence=ai_confidence,
        provider="internal",
        provider_message_id=None,
    )

    if save_result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "mesaj": (
                "Cevap üretildi fakat giden mesaj kaydedilemedi: "
                f"{save_result.get('mesaj', '')}"
            ),
        }

    return {
        "durum": "başarılı",
        "cevap": response_text,
        "kaynak": source,
        "customer_id": customer_id,
    }


# =====================================================
# SATICIYA AKTARMA
# =====================================================

def escalate_question(
    seller_id: int,
    customer_id: int,
    question_text: str,
    source_message_id: int | None,
    category: str = "unclear",
    suggested_field: str | None = None,
    reason: str = "bilgi_yok",
) -> dict[str, Any]:
    question_result = save_unanswered_question(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=source_message_id,
        question_text=question_text,
        category=category,
        suggested_field=suggested_field,
        metadata={
            "reason": reason,
        },
    )

    related_id = None

    if question_result.get("question"):
        related_id = question_result["question"].get("id")

    create_seller_notification(
        seller_id=seller_id,
        customer_id=customer_id,
        notification_type="unanswered_question",
        severity="warning",
        title="Cevaplanamayan müşteri sorusu",
        message=question_text,
        related_entity_type="unanswered_question",
        related_entity_id=related_id,
        action_url="/panel/unanswered-questions",
    )

    transition_state(
        seller_id=seller_id,
        customer_id=customer_id,
        to_state="AWAITING_SELLER",
        reason_code="escalation",
        trigger_message_id=source_message_id,
        state_data={
            "reason": reason,
            "category": category,
            "question_id": related_id,
        },
        metadata={
            "suggested_field": suggested_field,
        },
    )

    return outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=ESCALATION_RESPONSE,
        source="escalation",
    )


# =====================================================
# İHLAL YÖNETİMİ
# =====================================================

def handle_violation(
    seller_id: int,
    customer_id: int,
    source_message_id: int | None,
    matched_term: str,
    severity: str,
) -> dict[str, Any]:
    previous_result = count_recent_violations(
        seller_id=seller_id,
        customer_id=customer_id,
        days=30,
    )

    if previous_result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "mesaj": "İhlal geçmişi kontrol edilemedi.",
        }

    new_count = int(previous_result.get("count") or 0) + 1

    action_taken = "seller_notified"

    if severity == "critical":
        action_taken = "blocked"
    elif new_count == 2:
        action_taken = "muted_24h"
    elif new_count >= 3:
        action_taken = "blocked"

    record_result = record_violation(
        seller_id=seller_id,
        customer_id=customer_id,
        severity=severity,
        matched_term=matched_term,
        message_id=source_message_id,
        action_taken=action_taken,
        metadata={
            "violation_number_in_30_days": new_count,
        },
    )

    if record_result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "mesaj": "İhlal kaydı oluşturulamadı.",
        }

    violation_id = record_result["violation"]["id"]

    if action_taken == "blocked":
        block_customer(
            customer_id=customer_id,
            reason="Tekrarlanan veya ağır uygunsuz mesaj",
        )

        notification_message = (
            f"Müşteri bloklandı. Tespit edilen ifade: {matched_term}"
        )

        notification_severity = "urgent"

    elif action_taken == "muted_24h":
        mute_customer(
            customer_id=customer_id,
            hours=24,
        )

        notification_message = (
            f"Müşteri ikinci ihlal nedeniyle 24 saat susturuldu. "
            f"Tespit edilen ifade: {matched_term}"
        )

        notification_severity = "warning"

    else:
        notification_message = (
            f"Müşteri uygunsuz mesaj gönderdi. "
            f"Tespit edilen ifade: {matched_term}"
        )

        notification_severity = "warning"

    create_seller_notification(
        seller_id=seller_id,
        customer_id=customer_id,
        notification_type="violation",
        severity=notification_severity,
        title="Uygunsuz müşteri mesajı",
        message=notification_message,
        related_entity_type="customer_violation",
        related_entity_id=violation_id,
        action_url=f"/panel/customers/{customer_id}",
    )

    return {
        "durum": "engellendi",
        "cevap": None,
        "sebep": "Uygunsuz içerik tespit edildi",
        "customer_id": customer_id,
        "aksiyon": action_taken,
        "ihlal_sayisi": new_count,
    }


# =====================================================
# STATE MACHINE İŞLEME
# =====================================================

def process_active_state(
    seller_id: int,
    customer_id: int,
    state: dict[str, Any],
    user_message: str,
    message_type: str,
    media_url: str | None,
    source_message_id: int | None,
    store_link: str,
) -> dict[str, Any] | None:
    current_state = state.get("current_state", "NORMAL")

    if current_state == "NORMAL":
        return None

    if current_state == "AWAITING_ORDER_CONFIRMATION":
        classification = classify_intent(user_message)

        if (
            classification.get("intent") == "order_confirmation_yes"
            and intent_is_safe(classification)
        ):
            transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="AWAITING_ORDER_NUMBER",
                reason_code="user_action",
                trigger_message_id=source_message_id,
                expires_in_hours=24,
            )

            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text="Sipariş numaranızı paylaşır mısınız?",
                source="state",
                ai_confidence=classification.get("confidence"),
            )

        if (
            classification.get("intent") == "order_confirmation_no"
            and intent_is_safe(classification)
        ):
            transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="NORMAL",
                reason_code="user_action",
                trigger_message_id=source_message_id,
            )

            link_text = store_link or DEFAULT_STORE_LINK_TEXT

            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    "Mağazamızdan sipariş verdikten sonra sipariş numaranızı "
                    f"buradan paylaşabilirsiniz: {link_text}"
                ),
                source="state",
                ai_confidence=classification.get("confidence"),
            )

        return None

    if current_state == "AWAITING_ORDER_NUMBER":
        order_number = extract_order_number(user_message)

        if order_number:
            transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="AWAITING_IMAGE",
                reason_code="user_action",
                trigger_message_id=source_message_id,
                state_data={
                    "order_number": order_number,
                },
                expires_in_hours=24,
            )

            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    f"Sipariş numaranızı {order_number} olarak aldım. "
                    "Şimdi kupaya basılacak görselinizi gönderebilirsiniz."
                ),
                source="state",
            )

        if check_negative_order_context(user_message):
            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    "Sipariş numaranızı bulduğunuzda buradan paylaşabilirsiniz."
                ),
                source="state",
            )

        return None

    if current_state == "AWAITING_IMAGE":
        is_image = (
            message_type == "image"
            or bool(media_url)
        )

        if is_image:
            state_data = state.get("state_data") or {}
            order_number = state_data.get("order_number")

            transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="AWAITING_CUSTOM_TEXT",
                reason_code="user_action",
                trigger_message_id=source_message_id,
                state_data={
                    "order_number": order_number,
                    "image_url": media_url,
                },
                expires_in_hours=24,
            )

            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    "Görselinizi aldım. Kupaya eklenmesini istediğiniz özel "
                    "bir yazı varsa paylaşabilirsiniz. Yoksa “yok” yazabilirsiniz."
                ),
                source="state",
            )

        return None

    if current_state == "AWAITING_CUSTOM_TEXT":
        custom_text = user_message.strip()

        if not custom_text:
            return None

        state_data = state.get("state_data") or {}
        custom_text_value = None

        normalized = custom_text.lower()

        if normalized not in {
            "yok",
            "istemiyorum",
            "olmasın",
            "hayır",
        }:
            custom_text_value = custom_text

        transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="NORMAL",
            reason_code="user_action",
            trigger_message_id=source_message_id,
            metadata={
                "order_number": state_data.get("order_number"),
                "image_url": state_data.get("image_url"),
                "custom_text": custom_text_value,
            },
        )

        create_seller_notification(
            seller_id=seller_id,
            customer_id=customer_id,
            notification_type="new_order",
            severity="info",
            title="Yeni sipariş bilgileri alındı",
            message=(
                f"Sipariş no: {state_data.get('order_number') or 'belirtilmedi'}"
            ),
            related_entity_type="customer",
            related_entity_id=customer_id,
            action_url=f"/panel/customers/{customer_id}",
        )

        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=(
                "Bilgilerinizi aldım. Satıcımız siparişinizi kontrol edecek."
            ),
            source="state",
        )

    if current_state == "AWAITING_SELLER":
        # Informational state olduğu için yeni mesaj normal akışta işlenebilir.
        return None

    return None


# =====================================================
# GÜVENLİ ŞABLONLAR
# =====================================================

def safe_template_response(
    intent: str,
    store_link: str,
) -> str | None:
    if intent == "greeting":
        return GREETING_RESPONSE

    if intent == "price_question":
        link_text = store_link or DEFAULT_STORE_LINK_TEXT

        return (
            "Ürünlerimizi ve fiyatlarını mağazamızdan görüntüleyebilirsiniz: "
            f"{link_text}"
        )

    if intent == "discount_request":
        return DISCOUNT_RESPONSE

    if intent == "design_request":
        return DESIGN_RESPONSE

    if intent == "image_question":
        return IMAGE_RESPONSE

    if intent == "off_topic":
        return OFF_TOPIC_RESPONSE

    return None


# =====================================================
# ANA SOHBET FONKSİYONU
# =====================================================

def sohbet_isle(
    seller_id: int,
    whatsapp_number: str,
    kullanici_mesaji: str,
    customer_name: str | None = None,
    provider: str = "internal",
    provider_message_id: str | None = None,
    message_type: str = "text",
    media_url: str | None = None,
) -> dict[str, Any]:
    """
    Ana güvenli sohbet akışı.

    Öncelik:
    1. Satıcı ve müşteri doğrulama
    2. Block / mute kontrolü
    3. Mesaj idempotency ve kayıt
    4. Uygunsuz içerik
    5. Aktif state
    6. Niyet sınıflandırma
    7. Satıcı kuralı
    8. Product info
    9. Güvenli şablon
    10. Satıcıya aktarım
    """

    if not kullanici_mesaji and not media_url:
        return {
            "durum": "hata",
            "mesaj": "Boş mesaj işlenemez.",
        }

    # 1. Satıcı doğrulama
    seller_result = get_seller_by_id(seller_id)

    if seller_result.get("durum") != "başarılı":
        return {
            "durum": "hata",
            "mesaj": "Satıcı bulunamadı.",
        }

    seller = seller_result["satıcı"]
    store_link = str(seller.get("store_link") or "").strip()
    product_info = seller.get("product_info") or {}

    # 2. Müşteri bul / oluştur
    customer_result = get_or_create_customer(
        seller_id=seller_id,
        whatsapp_number=whatsapp_number,
        name=customer_name,
    )

    if customer_result.get("durum") == "hata":
        return customer_result

    customer = customer_result["customer"]
    customer_id = customer["id"]

    # 3. Blok / mute kontrolü
    if customer.get("is_blocked"):
        return {
            "durum": "engellendi",
            "cevap": None,
            "sebep": "Müşteri bloklu",
            "customer_id": customer_id,
        }

    if is_customer_muted(customer):
        return {
            "durum": "engellendi",
            "cevap": None,
            "sebep": "Müşteri geçici olarak susturulmuş",
            "customer_id": customer_id,
            "muted_until": customer.get("muted_until"),
        }

    # 4. Gelen mesajı kaydet
    incoming_result = save_message(
        seller_id=seller_id,
        customer_id=customer_id,
        direction="incoming",
        content=kullanici_mesaji,
        message_type=message_type,
        media_url=media_url,
        provider=provider,
        provider_message_id=provider_message_id,
    )

    if incoming_result.get("durum") == "duplicate":
        return {
            "durum": "duplicate",
            "cevap": None,
            "customer_id": customer_id,
            "mesaj": "Mesaj daha önce işlendi.",
        }

    if incoming_result.get("durum") != "başarılı":
        return incoming_result

    incoming_message = incoming_result["message"]
    incoming_message_id = incoming_message["id"]

    # 5. Uygunsuz içerik kontrolü
    violation = uygunsuz_icerik_bul(kullanici_mesaji or "")

    if violation:
        return handle_violation(
            seller_id=seller_id,
            customer_id=customer_id,
            source_message_id=incoming_message_id,
            matched_term=violation["matched_term"],
            severity=violation["severity"],
        )

    # 6. Aktif state
    state_result = get_state(
        seller_id=seller_id,
        customer_id=customer_id,
    )

    if state_result.get("durum") != "başarılı":
        return state_result

    state = state_result["state"]

    state_response = process_active_state(
        seller_id=seller_id,
        customer_id=customer_id,
        state=state,
        user_message=kullanici_mesaji or "",
        message_type=message_type,
        media_url=media_url,
        source_message_id=incoming_message_id,
        store_link=store_link,
    )

    if state_response:
        return state_response

    # 7. Niyet sınıflandırma
    classification = classify_intent(kullanici_mesaji or "")

    if not intent_is_safe(classification):
        return escalate_question(
            seller_id=seller_id,
            customer_id=customer_id,
            question_text=kullanici_mesaji or "[medya mesajı]",
            source_message_id=incoming_message_id,
            category=classification.get("intent", "unclear"),
            reason="düşük_güven_veya_belirsiz_niyet",
        )

    intent = classification["intent"]
    confidence = classification.get("confidence")

    # 8. Sipariş başlangıcı
    if intent == "order_intent":
        transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="AWAITING_ORDER_CONFIRMATION",
            reason_code="user_action",
            trigger_message_id=incoming_message_id,
            expires_in_hours=24,
        )

        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text="Mağazamızdan sipariş verdiniz mi?",
            source="state",
            ai_confidence=confidence,
        )

    # Normal state dışında gelen çıplak evet/hayır güvenli değil
    if intent in {
        "order_confirmation_yes",
        "order_confirmation_no",
    }:
        return escalate_question(
            seller_id=seller_id,
            customer_id=customer_id,
            question_text=kullanici_mesaji,
            source_message_id=incoming_message_id,
            category=intent,
            reason="bağlam_dışı_sipariş_onayı",
        )

    # 9. Satıcı kuralları
    rules_result = get_active_rules(seller_id)
    rules = rules_result.get("kurallar", [])

    matched_rule = basit_kural_esleme(
        kullanici_mesaji,
        rules,
    )

    if matched_rule:
        increment_rule_hit_count(matched_rule["id"])

        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=matched_rule["response_text"],
            source="rule",
            ai_confidence=1.0,
        )

    # 10. Ürün bilgileri
    product_response, suggested_field = product_info_response(
        intent=intent,
        product_info=product_info,
    )

    if product_response:
        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=product_response,
            source="product_info",
            ai_confidence=confidence,
        )

    # 11. Güvenli hazır şablon
    template_response = safe_template_response(
        intent=intent,
        store_link=store_link,
    )

    if template_response:
        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=template_response,
            source="template",
            ai_confidence=confidence,
        )

    # 12. İade ve şikâyet satıcıya
    if intent in {
        "return_request",
        "complaint",
    }:
        notification_type = (
            "return_request"
            if intent == "return_request"
            else "complex_question"
        )

        create_seller_notification(
            seller_id=seller_id,
            customer_id=customer_id,
            notification_type=notification_type,
            severity="urgent",
            title="Müşteri desteği gerekiyor",
            message=kullanici_mesaji,
            related_entity_type="message",
            related_entity_id=incoming_message_id,
            action_url=f"/panel/customers/{customer_id}",
        )

        transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="AWAITING_SELLER",
            reason_code="escalation",
            trigger_message_id=incoming_message_id,
            state_data={
                "category": intent,
            },
        )

        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text=(
                "Yaşadığınız sorun için satıcımıza bilgi verdim. "
                "En kısa sürede sizinle ilgilenecek."
            ),
            source="escalation",
            ai_confidence=confidence,
        )

    # 13. Bilgi yoksa satıcıya aktar
    return escalate_question(
        seller_id=seller_id,
        customer_id=customer_id,
        question_text=kullanici_mesaji or "[medya mesajı]",
        source_message_id=incoming_message_id,
        category=intent,
        suggested_field=suggested_field,
        reason="kayıtlı_cevap_bulunamadı",
    )


# =====================================================
# BASİT TEST
# =====================================================

if __name__ == "__main__":
    print("=" * 70)
    print("YENİ GÜVENLİ SOHBET TESTİ")
    print("=" * 70)

    test_messages = [
        "Merhaba",
        "Kupanız ne kadar?",
        "İndirim yapar mısınız?",
        "Mikrodalgaya girer mi?",
        "Sipariş vermek istiyorum",
        "Evet aldım",
        "ETSY-12345",
    ]

    test_phone = "+905551112244"

    for index, message in enumerate(test_messages, start=1):
        print(f"\nMüşteri: {message}")

        result = sohbet_isle(
            seller_id=SELLER_ID_DEFAULT,
            whatsapp_number=test_phone,
            kullanici_mesaji=message,
            customer_name="Yeni Sistem Test",
            provider="internal",
            provider_message_id=f"CHAT-TEST-{index}",
        )

        print(result)