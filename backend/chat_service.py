from __future__ import annotations

import re
from typing import Any, TypedDict

from ai_engine import classify_intent, intent_is_safe
from database import (
    CONTROL_STATE_ASSISTANT_ACTIVE,
    CONTROL_STATE_ASSISTANT_PAUSED,
    CONTROL_STATE_RETURN_REVIEW,
    CONTROL_STATE_SELLER_TAKEN_OVER,
    block_customer,
    count_recent_violations,
    create_seller_notification,
    get_active_return_issue_request,
    get_active_rules,
    get_conversation_control,
    get_or_create_customer,
    get_seller_by_id,
    get_state,
    increment_rule_hit_count,
    is_customer_muted,
    mute_customer,
    record_violation,
    save_message,
    transition_conversation_control,
    transition_state,
)
from order_service import (
    build_product_selection_question as order_build_product_selection_question,
    get_next_collection_step as order_get_next_collection_step,
    get_or_create_order,
    initialize_collection as order_initialize_collection,
    list_active_order_products as order_list_active_products,
    match_order_product_selection as order_match_product_selection,
    parse_collection_field_answer as order_parse_collection_field_answer,
    record_field_value as order_record_field_value,
    resolve_new_order_product_decision as order_resolve_new_order_product,
    set_order_product as order_set_order_product,
    update_core as order_update_core,
    update_core_from_message as order_update_core_from_message,
)
from return_issue_service import (
    process_customer_issue_message as return_issue_process_message,
)
from unanswered_question_service import (
    find_saved_answer as unanswered_find_saved_answer,
    record_question as unanswered_record_question,
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


class OutgoingControlContext(TypedDict):
    """Bir incoming mesaj için yakalanan optimistic control sınırı."""

    incoming_message_id: int
    starting_control_version: int


ACTIVE_SELLER_STATUSES = {
    "active",
    "beta_active",
}

SELLER_LIFECYCLE_REASONS = {
    "emergency_paused": "Asistan satıcı tarafından acil olarak durduruldu.",
    "ai_disabled": "Asistan bu işletme için etkin değil.",
    "onboarding_incomplete": "İşletme kurulumu henüz tamamlanmadı.",
    "inactive_status": "İşletme hesabı şu anda canlı kullanıma açık değil.",
}


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

def stored_no_auto_reply(
    customer_id: int,
    incoming_message_id: int,
    reason_code: str,
    reason_text: str,
    **extra: Any,
) -> dict[str, Any]:
    """Incoming kaydın korunduğu fakat otomasyonun sustuğu sonucu üretir."""
    result: dict[str, Any] = {
        "durum": "otomatik_yanıt_yok",
        "cevap": None,
        "sebep": reason_text,
        "reason_code": reason_code,
        "customer_id": customer_id,
        "incoming_message_id": incoming_message_id,
    }
    result.update(extra)
    return result


def pause_for_customer_security(
    seller_id: int,
    customer_id: int,
    incoming_message_id: int,
    control: dict[str, Any],
    reason_code: str,
    reason_text: str,
    **extra: Any,
) -> dict[str, Any]:
    """Block/mute durumunu gerekirse idempotent control pause'a bağlar."""
    if control.get("state") == CONTROL_STATE_ASSISTANT_ACTIVE:
        pause_result = transition_conversation_control(
            seller_id=seller_id,
            customer_id=customer_id,
            to_control_state=CONTROL_STATE_ASSISTANT_PAUSED,
            reason_code="security",
            trigger_message_id=incoming_message_id,
            expected_version=control.get("version"),
        )

        if pause_result.get("durum") != "başarılı":
            return stored_no_auto_reply(
                customer_id=customer_id,
                incoming_message_id=incoming_message_id,
                reason_code="assistant_pause_transition_failed",
                reason_text=(
                    "Müşteri güvenlik durumu kaydedildi fakat konuşma "
                    "kontrolü durdurulamadı."
                ),
                security_reason_code=reason_code,
                **extra,
            )

    return stored_no_auto_reply(
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
        reason_code=reason_code,
        reason_text=reason_text,
        **extra,
    )


def validate_outgoing_control(
    seller_id: int,
    customer_id: int,
    context: OutgoingControlContext,
) -> tuple[bool, str, str]:
    """Outgoing yazımından hemen önce state/version/cursor sınırını doğrular."""
    control_result = get_conversation_control(
        seller_id=seller_id,
        customer_id=customer_id,
    )

    if control_result.get("durum") != "başarılı":
        return (
            False,
            "outgoing_suppressed_control_unavailable",
            "Konuşma kontrolü yeniden doğrulanamadı.",
        )

    control = control_result["control"]

    if control.get("state") != CONTROL_STATE_ASSISTANT_ACTIVE:
        return (
            False,
            "outgoing_suppressed_control_changed",
            "Konuşma kontrolü otomatik yanıta kapatıldı.",
        )

    if control.get("version") != context["starting_control_version"]:
        return (
            False,
            "outgoing_suppressed_control_changed",
            "Konuşma kontrol sürümü işleme sırasında değişti.",
        )

    resume_after_message_id = control.get("resume_after_message_id")
    incoming_message_id = context["incoming_message_id"]

    if (
        resume_after_message_id is not None
        and incoming_message_id <= resume_after_message_id
    ):
        return (
            False,
            "outgoing_suppressed_before_resume_cursor",
            "Mesaj asistana geri bırakma sınırından eski.",
        )

    return True, "", ""

def outgoing_response(
    seller_id: int,
    customer_id: int,
    response_text: str,
    source: str,
    control_context: OutgoingControlContext,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    is_allowed, reason_code, reason_text = validate_outgoing_control(
        seller_id=seller_id,
        customer_id=customer_id,
        context=control_context,
    )

    if not is_allowed:
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=control_context["incoming_message_id"],
            reason_code=reason_code,
            reason_text=reason_text,
        )

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
            "mesaj": "Cevap üretildi fakat giden mesaj kaydedilemedi.",
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
    control_context: OutgoingControlContext | None = None,
) -> dict[str, Any]:
    if source_message_id is None:
        return {
            "durum": "hata",
            "mesaj": "Cevaplanamayan soru için kaynak mesaj kimliği bulunamadı.",
        }

    question_result = unanswered_record_question(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=source_message_id,
        question_text=question_text,
        category=category,
        suggested_field=suggested_field,
        reason=reason,
    )

    if question_result.get("durum") != "başarılı":
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="unanswered_question_persist_failed",
            reason_text="Cevaplanamayan soru güvenli biçimde kaydedilemedi.",
        )

    if control_context is None:
        return {
            "durum": "hata",
            "mesaj": "Otomatik yanıt kontrol bağlamı bulunamadı.",
        }

    # Seller cevabı kaydetme ile customer occurrence kaydı yarışırsa RPC
    # answered bilgiyi döndürebilir. Eski mesaja background cevap yoktur;
    # yalnız halen işlenmekte olan bu yeni incoming mesaj cevaplanır.
    if question_result.get("answer_available") is True:
        answer = question_result.get("answer")
        if isinstance(answer, str) and answer.strip():
            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=answer.strip(),
                source="seller_answer",
                control_context=control_context,
            )

    return outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=ESCALATION_RESPONSE,
        source="escalation",
        control_context=control_context,
    )


def _saved_unanswered_answer_response(
    seller_id: int,
    customer_id: int,
    question_text: str,
    message_type: str,
    current_flow_state: str,
    classification: dict[str, Any],
    control_context: OutgoingControlContext,
) -> dict[str, Any] | None:
    """Yalnız normal güvenli bağlamda exact seller cevabını gelecekte kullanır."""
    if message_type != "text" or current_flow_state != "NORMAL":
        return None

    if classification.get("intent") in {
        "return_request",
        "complaint",
        "order_intent",
        "order_confirmation_yes",
        "order_confirmation_no",
    }:
        return None

    lookup = unanswered_find_saved_answer(seller_id, question_text)
    if lookup.get("durum") != "başarılı" or lookup.get("matched") is not True:
        return None

    answer = lookup.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return None

    return outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=answer.strip(),
        source="seller_answer",
        control_context=control_context,
        ai_confidence=1.0,
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
    starting_control_version: int,
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

    if action_taken in {"muted_24h", "blocked"}:
        reason_code = "security" if severity == "critical" else "violation"
        pause_result = transition_conversation_control(
            seller_id=seller_id,
            customer_id=customer_id,
            to_control_state=CONTROL_STATE_ASSISTANT_PAUSED,
            reason_code=reason_code,
            trigger_message_id=source_message_id,
            expected_version=starting_control_version,
        )

        if pause_result.get("durum") != "başarılı":
            return {
                "durum": "hata",
                "cevap": None,
                "reason_code": "assistant_pause_transition_failed",
                "mesaj": "İhlal kaydedildi fakat otomasyon durdurulamadı.",
                "customer_id": customer_id,
                "incoming_message_id": source_message_id,
                "aksiyon": action_taken,
            }

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

ORDER_COLLECTION_MUTATION_STATES = {
    "AWAITING_ORDER_PRODUCT",
    "AWAITING_ORDER_NUMBER",
    "AWAITING_IMAGE",
    "AWAITING_CUSTOM_TEXT",
    "AWAITING_ORDER_FIELD",
}


def _return_issue_chat_response(
    *,
    seller_id: int,
    customer_id: int,
    incoming_message_id: int,
    service_result: dict[str, Any],
    control_context: OutgoingControlContext,
) -> dict[str, Any]:
    """Persistent return/issue sonucunu güvenli chat sonucuna çevirir."""
    request = service_result.get("request")
    request_id = request.get("id") if isinstance(request, dict) else None
    common_extra: dict[str, Any] = {
        "return_issue_request_id": request_id,
        "review_required": service_result.get("review_required") is True,
        "notification_created": service_result.get("notification_created") is True,
    }

    if service_result.get("durum") != "başarılı":
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code=str(
                service_result.get("error_code")
                or service_result.get("code")
                or service_result.get("reason_code")
                or "return_issue_processing_failed"
            ),
            reason_text=str(
                service_result.get("mesaj")
                or "İade/sorun talebi güvenli biçimde işlenemedi; normal otomasyon durduruldu."
            ),
            fail_closed=True,
            **common_extra,
        )

    if service_result.get("outgoing_allowed") is False:
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code=(
                "stored_return_issue_review"
                if service_result.get("review_required") is True
                else "stored_return_issue_silent"
            ),
            reason_text=(
                "Talep satıcı incelemesine bırakıldı."
                if service_result.get("review_required") is True
                else "İade/sorun talebi kaydedildi; otomatik yanıt gönderilmedi."
            ),
            control_changed=service_result.get("control_changed") is True,
            **common_extra,
        )

    question = service_result.get("question")
    if not isinstance(question, str) or not question.strip():
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code="return_issue_question_unavailable",
            reason_text=(
                "İade/sorun talebi kaydedildi fakat güvenli takip sorusu oluşturulamadı."
            ),
            fail_closed=True,
            **common_extra,
        )

    return outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=question.strip(),
        source="return_issue",
        control_context=control_context,
    )


def handle_return_review_intent(
    *,
    seller_id: int,
    customer_id: int,
    user_message: str,
    message_type: str,
    incoming_message_id: int,
    intent: str,
    control_context: OutgoingControlContext,
) -> dict[str, Any]:
    """İade/şikayet intent'ini persistent return/issue domainine aktarır."""
    service_result = return_issue_process_message(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=incoming_message_id,
        message_text=user_message,
        message_type=message_type,
        intent=intent,
        starting_control_version=control_context["starting_control_version"],
    )

    return _return_issue_chat_response(
        seller_id=seller_id,
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
        service_result=service_result,
        control_context=control_context,
    )


def continue_active_return_issue_request(
    *,
    seller_id: int,
    customer_id: int,
    user_message: str,
    message_type: str,
    incoming_message_id: int,
    control_context: OutgoingControlContext,
) -> dict[str, Any] | None:
    """Açık return/issue request varsa normal flow'dan önce devam ettirir."""
    active_result = get_active_return_issue_request(
        seller_id=seller_id,
        customer_id=customer_id,
    )

    if active_result.get("durum") != "başarılı":
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code="return_issue_active_lookup_unavailable",
            reason_text=(
                "Açık iade/sorun talebi güvenli biçimde kontrol edilemedi; normal otomasyon durduruldu."
            ),
            fail_closed=True,
        )

    if active_result.get("request") is None:
        return None

    service_result = return_issue_process_message(
        seller_id=seller_id,
        customer_id=customer_id,
        source_message_id=incoming_message_id,
        message_text=user_message,
        message_type=message_type,
        intent="continue",
        starting_control_version=control_context["starting_control_version"],
    )

    return _return_issue_chat_response(
        seller_id=seller_id,
        customer_id=customer_id,
        incoming_message_id=incoming_message_id,
        service_result=service_result,
        control_context=control_context,
    )


def _order_flow_error(
    *,
    customer_id: int,
    incoming_message_id: int | None,
    message: str,
    reason_code: str = "order_persist_failed",
) -> dict[str, Any]:
    return {
        "durum": "hata",
        "cevap": None,
        "reason_code": reason_code,
        "mesaj": message,
        "customer_id": customer_id,
        "incoming_message_id": incoming_message_id,
    }


def _transition_order_collection_step(
    *,
    seller_id: int,
    customer_id: int,
    order_id: int,
    step_result: dict[str, Any],
    source_message_id: int,
    control_context: OutgoingControlContext,
    completion_just_happened: bool = False,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    """Order service adımını flow state + tek deterministic soruya çevirir."""
    if step_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_collection_unavailable",
            message=step_result.get("mesaj") or "Sipariş toplama adımı belirlenemedi.",
        )

    if step_result.get("blocked") is True:
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_seller_review_required",
            reason_text="Sipariş satıcı incelemesi gerektiriyor; otomatik toplama ilerletilmedi.",
        )

    step = step_result.get("step")

    if step == "complete" or step_result.get("complete") is True:
        transition_result = transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="NORMAL",
            reason_code="user_action",
            trigger_message_id=source_message_id,
            state_data={},
        )

        if transition_result.get("durum") != "başarılı":
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_transition_failed",
                message="Sipariş tamamlandı fakat sohbet akışı güvenli biçimde güncellenemedi.",
            )

        if completion_just_happened:
            create_seller_notification(
                seller_id=seller_id,
                customer_id=customer_id,
                notification_type="new_order",
                severity="info",
                title="Yeni sipariş bilgileri alındı",
                message="Sipariş bilgileri tamamlandı.",
                related_entity_type="customer",
                related_entity_id=customer_id,
                action_url=f"/panel/customers/{customer_id}",
            )

        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text="Bilgilerinizi aldım. Satıcımız siparişinizi kontrol edecek.",
            source="state",
            control_context=control_context,
            ai_confidence=ai_confidence,
        )

    state_by_step = {
        "order_number": "AWAITING_ORDER_NUMBER",
        "image": "AWAITING_IMAGE",
        "custom_text": "AWAITING_CUSTOM_TEXT",
        "dynamic_field": "AWAITING_ORDER_FIELD",
    }
    target_state = state_by_step.get(step)

    if target_state is None:
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_collection_invalid_step",
            message="Sipariş toplama servisi geçersiz bir adım döndürdü.",
        )

    state_data: dict[str, Any] = {"order_id": order_id}

    if step == "dynamic_field":
        field = step_result.get("field")
        field_snapshot_id = field.get("id") if isinstance(field, dict) else None

        if (
            not isinstance(field_snapshot_id, int)
            or isinstance(field_snapshot_id, bool)
            or field_snapshot_id <= 0
        ):
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_collection_invalid_field",
                message="Zorunlu sipariş alanı güvenli biçimde belirlenemedi.",
            )

        state_data["field_snapshot_id"] = field_snapshot_id

    question = step_result.get("question")
    if not isinstance(question, str) or not question.strip():
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_collection_invalid_question",
            message="Sipariş toplama sorusu güvenli biçimde oluşturulamadı.",
        )

    transition_result = transition_state(
        seller_id=seller_id,
        customer_id=customer_id,
        to_state=target_state,
        reason_code="user_action",
        trigger_message_id=source_message_id,
        state_data=state_data,
        expires_in_hours=24,
    )

    if transition_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_flow_transition_failed",
            message="Sipariş toplama akışı güvenli biçimde ilerletilemedi.",
        )

    return outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=question.strip(),
        source="state",
        control_context=control_context,
        ai_confidence=ai_confidence,
    )


def _continue_order_after_product_assignment(
    *,
    seller_id: int,
    customer_id: int,
    order_id: int,
    product_id: int,
    source_message_id: int,
    control_context: OutgoingControlContext,
    expected_version: int | None = None,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    """Canonical set_order_product yolunu kullanır; başarısızsa ilerletmez."""
    assign_result = order_set_order_product(
        seller_id,
        customer_id,
        order_id,
        product_id,
        expected_version=expected_version,
    )
    if assign_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code=str(
                assign_result.get("error_code") or "order_product_assignment_failed"
            ),
            message=assign_result.get("mesaj")
            or "Sipariş ürünü güvenli biçimde atanamadı.",
        )

    step_result = order_get_next_collection_step(seller_id, order_id)
    return _transition_order_collection_step(
        seller_id=seller_id,
        customer_id=customer_id,
        order_id=order_id,
        step_result=step_result,
        source_message_id=source_message_id,
        control_context=control_context,
        ai_confidence=ai_confidence,
    )


def _prompt_order_product_selection(
    *,
    seller_id: int,
    customer_id: int,
    order_id: int,
    products: list[dict[str, Any]],
    source_message_id: int,
    control_context: OutgoingControlContext,
    ai_confidence: float | None = None,
) -> dict[str, Any]:
    question = order_build_product_selection_question(products)
    if not question.strip():
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_product_question_unavailable",
            message="Ürün seçim sorusu güvenli biçimde oluşturulamadı.",
        )

    transition_result = transition_state(
        seller_id=seller_id,
        customer_id=customer_id,
        to_state="AWAITING_ORDER_PRODUCT",
        reason_code="user_action",
        trigger_message_id=source_message_id,
        state_data={"order_id": order_id},
        expires_in_hours=24,
    )
    if transition_result.get("durum") != "başarılı":
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="order_flow_transition_failed",
            message="Ürün seçim akışı güvenli biçimde ilerletilemedi.",
        )

    return outgoing_response(
        seller_id=seller_id,
        customer_id=customer_id,
        response_text=question,
        source="state",
        control_context=control_context,
        ai_confidence=ai_confidence,
    )


def _invalid_dynamic_field_response(
    field: dict[str, Any],
    fallback_question: str,
) -> str:
    field_type = field.get("field_type")

    if field_type == "number":
        return "Bu alan için sayısal bir değer paylaşır mısınız?"

    if field_type == "boolean":
        return "Bu alan için evet veya hayır olarak yanıtlayabilir misiniz?"

    if field_type == "image":
        return "Bu alan için bir görsel gönderebilir misiniz?"

    if field_type in {"single_choice", "multi_choice"}:
        labels = [
            str(option.get("label")).strip()
            for option in field.get("options", [])
            if isinstance(option, dict)
            and isinstance(option.get("label"), str)
            and option.get("label").strip()
        ]
        if labels:
            return (
                "Bu alan için şu seçeneklerden birini paylaşır mısınız? "
                + ", ".join(labels)
            )

    return fallback_question


def process_active_state(
    seller_id: int,
    customer_id: int,
    state: dict[str, Any],
    user_message: str,
    message_type: str,
    media_url: str | None,
    source_message_id: int | None,
    store_link: str,
    control_context: OutgoingControlContext,
) -> dict[str, Any] | None:
    current_state = state.get("current_state", "NORMAL")

    if current_state == "NORMAL":
        return None

    if source_message_id is None:
        return _order_flow_error(
            customer_id=customer_id,
            incoming_message_id=source_message_id,
            reason_code="incoming_message_id_unavailable",
            message="Sipariş akışı için kaynak mesaj kimliği bulunamadı.",
        )

    if current_state == "AWAITING_ORDER_CONFIRMATION":
        classification = classify_intent(user_message)

        if (
            classification.get("intent") == "order_confirmation_yes"
            and intent_is_safe(classification)
        ):
            order_result = order_initialize_collection(
                seller_id=seller_id,
                customer_id=customer_id,
                source_message_id=source_message_id,
            )

            if order_result.get("durum") != "başarılı":
                return _order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    message="Sipariş kaydı oluşturulamadı; yeniden denenebilir.",
                )

            order = order_result.get("order")
            order_id = order.get("id") if isinstance(order, dict) else None

            if (
                not isinstance(order_id, int)
                or isinstance(order_id, bool)
                or order_id <= 0
            ):
                return _order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_id_unavailable",
                    message="Sipariş kimliği doğrulanamadı.",
                )

            # Yalnız yeni oluşturulan siparişlerde ürün seçimi uygulanır.
            # Mevcut açık / legacy product_id=NULL siparişler geriye dönük
            # ürün atanmaz.
            if order_result.get("created") is True:
                decision = order_resolve_new_order_product(seller_id)
                if decision.get("durum") != "başarılı":
                    return _order_flow_error(
                        customer_id=customer_id,
                        incoming_message_id=source_message_id,
                        reason_code=str(
                            decision.get("error_code")
                            or "order_product_list_unavailable"
                        ),
                        message=decision.get("mesaj")
                        or "Aktif ürün listesi okunamadı.",
                    )

                if decision.get("decision") == "single":
                    product = decision.get("product") or {}
                    product_id = product.get("id")
                    if (
                        not isinstance(product_id, int)
                        or isinstance(product_id, bool)
                        or product_id <= 0
                    ):
                        return _order_flow_error(
                            customer_id=customer_id,
                            incoming_message_id=source_message_id,
                            reason_code="order_product_assignment_failed",
                            message="Aktif ürün kimliği doğrulanamadı.",
                        )
                    expected_version = order.get("version")
                    return _continue_order_after_product_assignment(
                        seller_id=seller_id,
                        customer_id=customer_id,
                        order_id=order_id,
                        product_id=product_id,
                        source_message_id=source_message_id,
                        control_context=control_context,
                        expected_version=(
                            expected_version
                            if isinstance(expected_version, int)
                            and not isinstance(expected_version, bool)
                            and expected_version > 0
                            else None
                        ),
                        ai_confidence=classification.get("confidence"),
                    )

                if decision.get("decision") == "multiple":
                    return _prompt_order_product_selection(
                        seller_id=seller_id,
                        customer_id=customer_id,
                        order_id=order_id,
                        products=list(decision.get("products") or []),
                        source_message_id=source_message_id,
                        control_context=control_context,
                        ai_confidence=classification.get("confidence"),
                    )

            step_result = order_get_next_collection_step(seller_id, order_id)
            return _transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=step_result,
                source_message_id=source_message_id,
                control_context=control_context,
                ai_confidence=classification.get("confidence"),
            )

        if (
            classification.get("intent") == "order_confirmation_no"
            and intent_is_safe(classification)
        ):
            transition_result = transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="NORMAL",
                reason_code="user_action",
                trigger_message_id=source_message_id,
            )

            if transition_result.get("durum") != "başarılı":
                return _order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_flow_transition_failed",
                    message="Sipariş onayı akışı güvenli biçimde kapatılamadı.",
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
                control_context=control_context,
                ai_confidence=classification.get("confidence"),
            )

        return None

    if current_state == "AWAITING_ORDER_PRODUCT":
        state_data = state.get("state_data") or {}
        order_id = state_data.get("order_id")
        if (
            not isinstance(order_id, int)
            or isinstance(order_id, bool)
            or order_id <= 0
        ):
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_state_invalid",
                message="Ürün seçim state pointer'ı geçersiz.",
            )

        listed = order_list_active_products(seller_id)
        if listed.get("durum") != "başarılı":
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code=str(
                    listed.get("error_code") or "order_product_list_unavailable"
                ),
                message=listed.get("mesaj") or "Aktif ürün listesi okunamadı.",
            )

        products = list(listed.get("products") or [])
        if len(products) == 0:
            step_result = order_get_next_collection_step(seller_id, order_id)
            return _transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=step_result,
                source_message_id=source_message_id,
                control_context=control_context,
            )

        if len(products) == 1:
            product_id = products[0].get("id")
            if (
                not isinstance(product_id, int)
                or isinstance(product_id, bool)
                or product_id <= 0
            ):
                return _order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_product_assignment_failed",
                    message="Aktif ürün kimliği doğrulanamadı.",
                )
            return _continue_order_after_product_assignment(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                product_id=product_id,
                source_message_id=source_message_id,
                control_context=control_context,
            )

        match = order_match_product_selection(user_message, products)
        if match.get("durum") != "başarılı":
            question = order_build_product_selection_question(products)
            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=question,
                source="state",
                control_context=control_context,
            )

        product = match.get("product") or {}
        product_id = product.get("id")
        if (
            not isinstance(product_id, int)
            or isinstance(product_id, bool)
            or product_id <= 0
        ):
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_product_assignment_failed",
                message="Seçilen ürün kimliği doğrulanamadı.",
            )

        return _continue_order_after_product_assignment(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            product_id=product_id,
            source_message_id=source_message_id,
            control_context=control_context,
        )

    if current_state == "AWAITING_ORDER_NUMBER":
        order_number = extract_order_number(user_message)

        if order_number:
            state_data = state.get("state_data") or {}
            order_id = state_data.get("order_id")

            if order_id is not None:
                core_result = order_update_core_from_message(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order_id=order_id,
                    source_message_id=source_message_id,
                    external_order_number=order_number,
                )

                if core_result.get("durum") != "başarılı":
                    return _order_flow_error(
                        customer_id=customer_id,
                        incoming_message_id=source_message_id,
                        message="Sipariş numarası kaydedilemedi; yeniden denenebilir.",
                    )

                step_result = order_get_next_collection_step(seller_id, order_id)
                return _transition_order_collection_step(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order_id=order_id,
                    step_result=step_result,
                    source_message_id=source_message_id,
                    control_context=control_context,
                    completion_just_happened=core_result.get("completed") is True,
                )

            # Legacy state_data uyumluluğu: yeni siparişlerde kullanılmaz.
            transition_result = transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="AWAITING_IMAGE",
                reason_code="user_action",
                trigger_message_id=source_message_id,
                state_data={"order_number": order_number},
                expires_in_hours=24,
            )

            if transition_result.get("durum") != "başarılı":
                return _order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_flow_transition_failed",
                    message="Eski sipariş akışı görsel adımına güvenli biçimde ilerletilemedi.",
                )

            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    f"Sipariş numaranızı {order_number} olarak aldım. "
                    "Şimdi kupaya basılacak görselinizi gönderebilirsiniz."
                ),
                source="state",
                control_context=control_context,
            )

        if check_negative_order_context(user_message):
            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text="Sipariş numaranızı bulduğunuzda buradan paylaşabilirsiniz.",
                source="state",
                control_context=control_context,
            )

        return None

    if current_state == "AWAITING_IMAGE":
        state_data = state.get("state_data") or {}
        order_id = state_data.get("order_id")

        if order_id is not None:
            # Config-authority dayanıklılığı: görsel adımı yalnızca
            # image_required=true (veya legacy NULL) iken sorulur. Konuşma
            # AWAITING_IMAGE'de açılmışsa ama config artık görsel istemiyorsa
            # (veya koleksiyon zaten ilerlemişse), görsel dışı bir mesaj
            # sessizce düşürülmez; akış gerçek adıma hizalanır. Aksi halde
            # konuşma hiç sorulmayacak bir görseli bekleyerek kilitli
            # kalırdı. AWAITING_CUSTOM_TEXT / AWAITING_ORDER_FIELD
            # kollarındaki re-align pattern'inin aynısıdır. Görsel mesajı
            # gerçekten geldiyse eskisi gibi saklanır; persist sonrası
            # yapılan adım hesabı (config kapısından geçer) akışı
            # kendiliğinden hizalar.
            if message_type != "image":
                current_step = order_get_next_collection_step(seller_id, order_id)
                if (
                    current_step.get("durum") != "başarılı"
                    or current_step.get("step") != "image"
                ):
                    return _transition_order_collection_step(
                        seller_id=seller_id,
                        customer_id=customer_id,
                        order_id=order_id,
                        step_result=current_step,
                        source_message_id=source_message_id,
                        control_context=control_context,
                    )

                return None

            core_result = order_update_core_from_message(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                source_message_id=source_message_id,
                image_message_id=source_message_id,
            )

            if core_result.get("durum") != "başarılı":
                return _order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    message="Görsel kaydedilemedi; yeniden denenebilir.",
                )

            step_result = order_get_next_collection_step(seller_id, order_id)
            return _transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=step_result,
                source_message_id=source_message_id,
                control_context=control_context,
                completion_just_happened=core_result.get("completed") is True,
            )

        # Legacy state_data uyumluluğu: eski açık konuşmalar için korunur.
        is_image = message_type == "image" or bool(media_url)
        if is_image:
            next_state_data = {
                "order_number": state_data.get("order_number"),
                "image_url": media_url,
            }

            transition_result = transition_state(
                seller_id=seller_id,
                customer_id=customer_id,
                to_state="AWAITING_CUSTOM_TEXT",
                reason_code="user_action",
                trigger_message_id=source_message_id,
                state_data=next_state_data,
                expires_in_hours=24,
            )

            if transition_result.get("durum") != "başarılı":
                return _order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    reason_code="order_flow_transition_failed",
                    message="Eski sipariş akışı özel metin adımına güvenli biçimde ilerletilemedi.",
                )

            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=(
                    "Görselinizi aldım. Kupaya eklenmesini istediğiniz özel "
                    "bir yazı varsa paylaşabilirsiniz. Yoksa “yok” yazabilirsiniz."
                ),
                source="state",
                control_context=control_context,
            )

        return None

    if current_state == "AWAITING_CUSTOM_TEXT":
        state_data = state.get("state_data") or {}
        order_id = state_data.get("order_id")
        custom_text = user_message.strip()

        if order_id is not None:
            current_step = order_get_next_collection_step(seller_id, order_id)
            if current_step.get("durum") != "başarılı":
                return _transition_order_collection_step(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order_id=order_id,
                    step_result=current_step,
                    source_message_id=source_message_id,
                    control_context=control_context,
                )

            if current_step.get("step") != "custom_text":
                return _transition_order_collection_step(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    order_id=order_id,
                    step_result=current_step,
                    source_message_id=source_message_id,
                    control_context=control_context,
                )

            if not custom_text:
                return None

            if custom_text.lower() in {"yok", "istemiyorum", "olmasın", "hayır"}:
                return outgoing_response(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    response_text=(
                        "Bu sipariş için özel yazı zorunlu. "
                        "Üründe kullanılacak özel yazıyı paylaşır mısınız?"
                    ),
                    source="state",
                    control_context=control_context,
                )

            core_result = order_update_core_from_message(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                source_message_id=source_message_id,
                custom_text=custom_text,
            )

            if core_result.get("durum") != "başarılı":
                return _order_flow_error(
                    customer_id=customer_id,
                    incoming_message_id=source_message_id,
                    message="Özel metin kaydedilemedi; yeniden denenebilir.",
                )

            step_result = order_get_next_collection_step(seller_id, order_id)
            return _transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=step_result,
                source_message_id=source_message_id,
                control_context=control_context,
                completion_just_happened=core_result.get("completed") is True,
            )

        # Legacy state_data uyumluluğu.
        if not custom_text:
            return None

        custom_text_value = None
        if custom_text.lower() not in {"yok", "istemiyorum", "olmasın", "hayır"}:
            custom_text_value = custom_text

        transition_result = transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="NORMAL",
            reason_code="user_action",
            trigger_message_id=source_message_id,
            state_data={},
            metadata={
                "order_number": state_data.get("order_number"),
                "image_url": state_data.get("image_url"),
                "custom_text": custom_text_value,
            },
        )

        if transition_result.get("durum") != "başarılı":
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_transition_failed",
                message="Eski sipariş akışı güvenli biçimde tamamlanamadı.",
            )

        create_seller_notification(
            seller_id=seller_id,
            customer_id=customer_id,
            notification_type="new_order",
            severity="info",
            title="Yeni sipariş bilgileri alındı",
            message="Sipariş bilgileri tamamlandı.",
            related_entity_type="customer",
            related_entity_id=customer_id,
            action_url=f"/panel/customers/{customer_id}",
        )

        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text="Bilgilerinizi aldım. Satıcımız siparişinizi kontrol edecek.",
            source="state",
            control_context=control_context,
        )

    if current_state == "AWAITING_ORDER_FIELD":
        state_data = state.get("state_data") or {}
        order_id = state_data.get("order_id")
        expected_field_snapshot_id = state_data.get("field_snapshot_id")

        if (
            not isinstance(order_id, int)
            or isinstance(order_id, bool)
            or order_id <= 0
            or not isinstance(expected_field_snapshot_id, int)
            or isinstance(expected_field_snapshot_id, bool)
            or expected_field_snapshot_id <= 0
        ):
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                reason_code="order_flow_state_invalid",
                message="Dinamik sipariş alanı state pointer'ları geçersiz.",
            )

        current_step = order_get_next_collection_step(seller_id, order_id)
        if current_step.get("durum") != "başarılı":
            return _transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=current_step,
                source_message_id=source_message_id,
                control_context=control_context,
            )

        field = current_step.get("field")
        current_field_snapshot_id = field.get("id") if isinstance(field, dict) else None

        if (
            current_step.get("step") != "dynamic_field"
            or current_field_snapshot_id != expected_field_snapshot_id
        ):
            return _transition_order_collection_step(
                seller_id=seller_id,
                customer_id=customer_id,
                order_id=order_id,
                step_result=current_step,
                source_message_id=source_message_id,
                control_context=control_context,
            )

        assert isinstance(field, dict)
        field_type = field.get("field_type")

        raw_value: Any = user_message
        if field_type == "image":
            if message_type != "image":
                return outgoing_response(
                    seller_id=seller_id,
                    customer_id=customer_id,
                    response_text=_invalid_dynamic_field_response(
                        field,
                        current_step.get("question") or "Bir görsel gönderebilir misiniz?",
                    ),
                    source="state",
                    control_context=control_context,
                )
            raw_value = {"message_id": source_message_id}

        parse_result = order_parse_collection_field_answer(field, raw_value)
        if parse_result.get("durum") != "başarılı":
            return outgoing_response(
                seller_id=seller_id,
                customer_id=customer_id,
                response_text=_invalid_dynamic_field_response(
                    field,
                    current_step.get("question") or "Bu bilgiyi yeniden paylaşır mısınız?",
                ),
                source="state",
                control_context=control_context,
            )

        record_result = order_record_field_value(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            field_snapshot_id=expected_field_snapshot_id,
            field_type=str(field_type),
            value=parse_result["value"],
            source_message_id=source_message_id,
            options=field.get("options") if isinstance(field.get("options"), list) else [],
            validation_config=(
                field.get("validation_config")
                if isinstance(field.get("validation_config"), dict)
                else {}
            ),
        )

        if record_result.get("durum") != "başarılı":
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=source_message_id,
                message="Sipariş alanı kaydedilemedi; yeniden denenebilir.",
            )

        step_result = order_get_next_collection_step(seller_id, order_id)
        return _transition_order_collection_step(
            seller_id=seller_id,
            customer_id=customer_id,
            order_id=order_id,
            step_result=step_result,
            source_message_id=source_message_id,
            control_context=control_context,
            completion_just_happened=record_result.get("completed") is True,
        )

    if current_state == "AWAITING_SELLER":
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
# SATICI YAŞAM DÖNGÜSÜ KONTROLÜ
# =====================================================

def seller_lifecycle_block(
    seller: dict[str, Any],
) -> tuple[str, str] | None:
    """
    Satıcının otomatik cevap vermeye uygun olup olmadığını kontrol eder.

    Dönüş:
    - None: otomatik cevap verilebilir.
    - (reason_code, reason_text): mesaj kaydedilir ancak cevap üretilmez.
    """
    if bool(seller.get("emergency_paused")):
        return (
            "emergency_paused",
            SELLER_LIFECYCLE_REASONS["emergency_paused"],
        )

    if seller.get("ai_enabled") is not True:
        return (
            "ai_disabled",
            SELLER_LIFECYCLE_REASONS["ai_disabled"],
        )

    if seller.get("onboarding_completed") is not True:
        return (
            "onboarding_incomplete",
            SELLER_LIFECYCLE_REASONS["onboarding_incomplete"],
        )

    system_status = str(seller.get("system_status") or "").strip()

    if system_status not in ACTIVE_SELLER_STATUSES:
        return (
            "inactive_status",
            SELLER_LIFECYCLE_REASONS["inactive_status"],
        )

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
    1. Payload, satıcı ve müşteri doğrulama
    2. Incoming mesajı kalıcılaştırma ve duplicate kontrolü
    3. Seller lifecycle, customer security ve conversation control gate
    4. Uygunsuz içerik
    5. Aktif flow state
    6. Niyet, kural, product info ve güvenli şablon
    7. Her outgoing öncesi control state/version/cursor doğrulaması
    """

    if not kullanici_mesaji and not media_url and message_type != "image":
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

    # 3. Gelen mesajı otomasyon kararlarından önce kaydet
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
        return {
            "durum": "hata",
            "cevap": None,
            "reason_code": "incoming_persist_failed",
            "mesaj": "Gelen mesaj kaydedilemedi; yeniden denenebilir.",
            "customer_id": customer_id,
        }

    incoming_message = incoming_result["message"]
    incoming_message_id = incoming_message.get("id")

    if (
        not isinstance(incoming_message_id, int)
        or isinstance(incoming_message_id, bool)
        or incoming_message_id <= 0
    ):
        return {
            "durum": "hata",
            "cevap": None,
            "reason_code": "incoming_message_id_unavailable",
            "mesaj": "Kaydedilen mesaj kimliği doğrulanamadı.",
            "customer_id": customer_id,
        }

    # 4. Satıcı yaşam döngüsü kontrolü
    lifecycle_block = seller_lifecycle_block(seller)

    if lifecycle_block:
        reason_code, reason_text = lifecycle_block

        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code=f"stored_seller_{reason_code}",
            reason_text=reason_text,
        )

    # 5. Conversation control fail-closed okunur
    control_result = get_conversation_control(
        seller_id=seller_id,
        customer_id=customer_id,
    )

    if control_result.get("durum") != "başarılı":
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code="stored_control_unavailable",
            reason_text="Konuşma kontrol kaydı güvenli biçimde okunamadı.",
        )

    control = control_result["control"]

    # 6. Müşteri security alanları incoming kaydından sonra değerlendirilir
    if customer.get("is_blocked"):
        return pause_for_customer_security(
            seller_id=seller_id,
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            control=control,
            reason_code="stored_customer_blocked",
            reason_text="Müşteri için otomatik yanıt durdurulmuş.",
        )

    if is_customer_muted(customer):
        return pause_for_customer_security(
            seller_id=seller_id,
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            control=control,
            reason_code="stored_customer_muted",
            reason_text="Müşteri için otomatik yanıt geçici olarak durdurulmuş.",
            muted_until=customer.get("muted_until"),
        )

    control_state = control.get("state")
    control_reason_codes = {
        CONTROL_STATE_SELLER_TAKEN_OVER: "stored_seller_taken_over",
        CONTROL_STATE_RETURN_REVIEW: "stored_return_review",
        CONTROL_STATE_ASSISTANT_PAUSED: "stored_assistant_paused",
    }

    if control_state != CONTROL_STATE_ASSISTANT_ACTIVE:
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code=control_reason_codes.get(
                control_state,
                "stored_control_unavailable",
            ),
            reason_text="Konuşma otomatik yanıta açık değil.",
            control_state=control_state,
        )

    resume_after_message_id = control.get("resume_after_message_id")

    if (
        resume_after_message_id is not None
        and incoming_message_id <= resume_after_message_id
    ):
        return stored_no_auto_reply(
            customer_id=customer_id,
            incoming_message_id=incoming_message_id,
            reason_code="stored_before_resume_cursor",
            reason_text="Mesaj asistana geri bırakma sınırından eski.",
        )

    control_context: OutgoingControlContext = {
        "incoming_message_id": incoming_message_id,
        "starting_control_version": control["version"],
    }

    # 7. Uygunsuz içerik kontrolü
    violation = uygunsuz_icerik_bul(kullanici_mesaji or "")

    if violation:
        return handle_violation(
            seller_id=seller_id,
            customer_id=customer_id,
            source_message_id=incoming_message_id,
            matched_term=violation["matched_term"],
            severity=violation["severity"],
            starting_control_version=control["version"],
        )

    # 8. Aktif flow state
    state_result = get_state(
        seller_id=seller_id,
        customer_id=customer_id,
    )

    if state_result.get("durum") != "başarılı":
        return state_result

    state = state_result["state"]

    # Sipariş toplama state'leri field mutation yapmadan önce yalnız yüksek
    # öncelikli iade/şikayet kesintisini kontrol eder. Bu sayede örneğin
    # "ürün kırık geldi" metni custom_text veya dinamik alan değeri olmaz.
    preclassified: dict[str, Any] | None = None
    current_flow_state = state.get("current_state", "NORMAL")
    if (
        current_flow_state in ORDER_COLLECTION_MUTATION_STATES
        and isinstance(kullanici_mesaji, str)
        and kullanici_mesaji.strip()
    ):
        preclassified = classify_intent(kullanici_mesaji)
        if (
            intent_is_safe(preclassified)
            and preclassified.get("intent") in {"return_request", "complaint"}
        ):
            return handle_return_review_intent(
                seller_id=seller_id,
                customer_id=customer_id,
                user_message=kullanici_mesaji,
                message_type=message_type,
                incoming_message_id=incoming_message_id,
                intent=str(preclassified["intent"]),
                control_context=control_context,
            )

    # Açık persistent iade/sorun talebi normal flow'dan önceliklidir.
    # Böylece "TR123" gibi devam cevaplarının yeniden return intent olarak
    # sınıflandırılması gerekmez ve order state'leri yanlışlıkla ilerlemez.
    return_issue_response = continue_active_return_issue_request(
        seller_id=seller_id,
        customer_id=customer_id,
        user_message=kullanici_mesaji or "",
        message_type=message_type,
        incoming_message_id=incoming_message_id,
        control_context=control_context,
    )

    if return_issue_response is not None:
        return return_issue_response

    state_response = process_active_state(
        seller_id=seller_id,
        customer_id=customer_id,
        state=state,
        user_message=kullanici_mesaji or "",
        message_type=message_type,
        media_url=media_url,
        source_message_id=incoming_message_id,
        store_link=store_link,
        control_context=control_context,
    )

    if state_response:
        return state_response

    # 9. Niyet sınıflandırma
    classification = preclassified or classify_intent(kullanici_mesaji or "")

    if not intent_is_safe(classification):
        saved_answer_response = _saved_unanswered_answer_response(
            seller_id=seller_id,
            customer_id=customer_id,
            question_text=kullanici_mesaji or "",
            message_type=message_type,
            current_flow_state=current_flow_state,
            classification=classification,
            control_context=control_context,
        )
        if saved_answer_response is not None:
            return saved_answer_response

        return escalate_question(
            seller_id=seller_id,
            customer_id=customer_id,
            question_text=kullanici_mesaji or "[medya mesajı]",
            source_message_id=incoming_message_id,
            category=classification.get("intent", "unclear"),
            reason="düşük_güven_veya_belirsiz_niyet",
            control_context=control_context,
        )

    intent = classification["intent"]
    confidence = classification.get("confidence")

    # 10. İade ve önemli sorun incelemesi
    if intent in {"return_request", "complaint"}:
        return handle_return_review_intent(
            seller_id=seller_id,
            customer_id=customer_id,
            user_message=kullanici_mesaji or "",
            message_type=message_type,
            incoming_message_id=incoming_message_id,
            intent=intent,
            control_context=control_context,
        )

    # 11. Sipariş başlangıcı
    if intent == "order_intent":
        transition_result = transition_state(
            seller_id=seller_id,
            customer_id=customer_id,
            to_state="AWAITING_ORDER_CONFIRMATION",
            reason_code="user_action",
            trigger_message_id=incoming_message_id,
            expires_in_hours=24,
        )

        if transition_result.get("durum") != "başarılı":
            return _order_flow_error(
                customer_id=customer_id,
                incoming_message_id=incoming_message_id,
                reason_code="order_flow_transition_failed",
                message="Sipariş akışı güvenli biçimde başlatılamadı.",
            )

        return outgoing_response(
            seller_id=seller_id,
            customer_id=customer_id,
            response_text="Mağazamızdan sipariş verdiniz mi?",
            source="state",
            control_context=control_context,
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
            control_context=control_context,
        )

    # 12. Satıcı kuralları
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
            control_context=control_context,
            ai_confidence=1.0,
        )

    # 13. Ürün bilgileri
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
            control_context=control_context,
            ai_confidence=confidence,
        )

    # 14. Güvenli hazır şablon
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
            control_context=control_context,
            ai_confidence=confidence,
        )

    # 15. Daha önce seller tarafından cevaplanmış exact-normalized soru
    saved_answer_response = _saved_unanswered_answer_response(
        seller_id=seller_id,
        customer_id=customer_id,
        question_text=kullanici_mesaji or "",
        message_type=message_type,
        current_flow_state=current_flow_state,
        classification=classification,
        control_context=control_context,
    )
    if saved_answer_response is not None:
        return saved_answer_response

    # 16. Bilgi yoksa satıcıya aktar
    return escalate_question(
        seller_id=seller_id,
        customer_id=customer_id,
        question_text=kullanici_mesaji or "[medya mesajı]",
        source_message_id=incoming_message_id,
        category=intent,
        suggested_field=suggested_field,
        reason="kayıtlı_cevap_bulunamadı",
        control_context=control_context,
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
