from __future__ import annotations

import time
from typing import Any

from chat_service import sohbet_isle
from database import (
    get_or_create_customer,
    get_customer_by_id,
    get_state,
    get_supabase,
    unmute_customer,
    unblock_customer,
)


SELLER_ID = 2

# Her çalıştırmada yeni telefonlar ve mesaj kimlikleri üretir.
RUN_ID = str(int(time.time()))


def print_result(
    title: str,
    result: Any,
) -> None:
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)
    print(result)


def send_message(
    phone: str,
    message: str,
    message_id: str,
    customer_name: str,
    message_type: str = "text",
    media_url: str | None = None,
) -> dict[str, Any]:
    result = sohbet_isle(
        seller_id=SELLER_ID,
        whatsapp_number=phone,
        kullanici_mesaji=message,
        customer_name=customer_name,
        provider="integration_test",
        provider_message_id=f"{RUN_ID}-{message_id}",
        message_type=message_type,
        media_url=media_url,
    )

    print_result(
        f"MESAJ: {message or '[boş metin / medya]'}",
        result,
    )

    return result


def get_customer(phone: str) -> dict[str, Any]:
    result = get_or_create_customer(
        seller_id=SELLER_ID,
        whatsapp_number=phone,
        name="Entegrasyon Test Müşterisi",
    )

    assert result["durum"] in {
        "mevcut",
        "yeni_oluşturuldu",
    }

    return result["customer"]


# =====================================================
# TEST 1 — BASİT ŞABLON CEVAPLAR
# =====================================================

def test_template_responses() -> None:
    phone = f"+9055100{RUN_ID[-6:]}"

    greeting = send_message(
        phone=phone,
        message="Merhaba",
        message_id="TEMPLATE-001",
        customer_name="Şablon Test",
    )

    assert greeting["durum"] == "başarılı"
    assert greeting["kaynak"] == "template"
    assert greeting["cevap"] == (
        "Merhaba, size nasıl yardımcı olabilirim?"
    )

    price = send_message(
        phone=phone,
        message="Kupanız ne kadar?",
        message_id="TEMPLATE-002",
        customer_name="Şablon Test",
    )

    assert price["durum"] == "başarılı"
    assert price["kaynak"] == "template"
    assert "etsy.com" in price["cevap"].lower()

    discount = send_message(
        phone=phone,
        message="İndirim yapar mısınız?",
        message_id="TEMPLATE-003",
        customer_name="Şablon Test",
    )

    assert discount["durum"] == "başarılı"
    assert discount["kaynak"] == "template"
    assert "indirim uygulanmamaktadır" in discount["cevap"].lower()

    print_result(
        "TEST 1 — ŞABLON CEVAPLAR",
        "BAŞARILI",
    )


# =====================================================
# TEST 2 — DUPLICATE WEBHOOK
# =====================================================

def test_duplicate_webhook() -> None:
    phone = f"+9055200{RUN_ID[-6:]}"
    provider_id = f"{RUN_ID}-DUPLICATE-001"

    first = sohbet_isle(
        seller_id=SELLER_ID,
        whatsapp_number=phone,
        kullanici_mesaji="Merhaba",
        customer_name="Duplicate Test",
        provider="integration_test",
        provider_message_id=provider_id,
        message_type="text",
    )

    second = sohbet_isle(
        seller_id=SELLER_ID,
        whatsapp_number=phone,
        kullanici_mesaji="Merhaba",
        customer_name="Duplicate Test",
        provider="integration_test",
        provider_message_id=provider_id,
        message_type="text",
    )

    print_result(
        "DUPLICATE — İLK İSTEK",
        first,
    )

    print_result(
        "DUPLICATE — İKİNCİ İSTEK",
        second,
    )

    assert first["durum"] == "başarılı"
    assert second["durum"] == "duplicate"
    assert second["cevap"] is None

    print_result(
        "TEST 2 — DUPLICATE WEBHOOK",
        "BAŞARILI",
    )


# =====================================================
# TEST 3 — TAM SİPARİŞ AKIŞI
# =====================================================

def test_full_order_flow() -> None:
    phone = f"+9055300{RUN_ID[-6:]}"

    start = send_message(
        phone=phone,
        message="Sipariş vermek istiyorum",
        message_id="ORDER-001",
        customer_name="Sipariş Test",
    )

    assert start["durum"] == "başarılı"
    assert start["kaynak"] == "state"
    assert "sipariş verdiniz mi" in start["cevap"].lower()

    customer = get_customer(phone)
    customer_id = customer["id"]

    state = get_state(
        SELLER_ID,
        customer_id,
    )

    assert state["durum"] == "başarılı"
    assert (
        state["state"]["current_state"]
        == "AWAITING_ORDER_CONFIRMATION"
    )

    confirmation = send_message(
        phone=phone,
        message="Evet aldım",
        message_id="ORDER-002",
        customer_name="Sipariş Test",
    )

    assert confirmation["durum"] == "başarılı"
    assert "sipariş numaranızı" in confirmation["cevap"].lower()

    state = get_state(
        SELLER_ID,
        customer_id,
    )

    assert (
        state["state"]["current_state"]
        == "AWAITING_ORDER_NUMBER"
    )

    order_number = send_message(
        phone=phone,
        message="ETSY-987654",
        message_id="ORDER-003",
        customer_name="Sipariş Test",
    )

    assert order_number["durum"] == "başarılı"
    assert "etsy-987654" in order_number["cevap"].lower()
    assert "görselinizi" in order_number["cevap"].lower()

    state = get_state(
        SELLER_ID,
        customer_id,
    )

    assert state["state"]["current_state"] == "AWAITING_IMAGE"

    image = send_message(
        phone=phone,
        message="",
        message_id="ORDER-004",
        customer_name="Sipariş Test",
        message_type="image",
        media_url=(
            "https://example.com/"
            f"integration-test-{RUN_ID}.jpg"
        ),
    )

    assert image["durum"] == "başarılı"
    assert "görselinizi aldım" in image["cevap"].lower()
    assert "özel bir yazı" in image["cevap"].lower()

    state = get_state(
        SELLER_ID,
        customer_id,
    )

    assert (
        state["state"]["current_state"]
        == "AWAITING_CUSTOM_TEXT"
    )

    custom_text = send_message(
        phone=phone,
        message="İyi ki doğdun Ayşe",
        message_id="ORDER-005",
        customer_name="Sipariş Test",
    )

    assert custom_text["durum"] == "başarılı"
    assert "bilgilerinizi aldım" in custom_text["cevap"].lower()

    final_state = get_state(
        SELLER_ID,
        customer_id,
    )

    assert final_state["durum"] == "başarılı"
    assert final_state["state"]["current_state"] == "NORMAL"

    supabase = get_supabase()

    notification_result = (
        supabase.table("seller_notifications")
        .select("*")
        .eq("seller_id", SELLER_ID)
        .eq("customer_id", customer_id)
        .eq("type", "new_order")
        .execute()
    )

    assert notification_result.data

    print_result(
        "TEST 3 — TAM SİPARİŞ AKIŞI",
        {
            "customer_id": customer_id,
            "son_state": "NORMAL",
            "sipariş_bildirimi": True,
        },
    )


# =====================================================
# TEST 4 — CEVAPLANAMAYAN SORU VE BİLDİRİM
# =====================================================

def test_unanswered_question() -> None:
    phone = f"+9055400{RUN_ID[-6:]}"
    question = (
        f"Kupanın özel kaplama yoğunluğu nedir test {RUN_ID}?"
    )

    result = send_message(
        phone=phone,
        message=question,
        message_id="UNANSWERED-001",
        customer_name="Cevapsız Soru Test",
    )

    assert result["durum"] == "başarılı"
    assert result["kaynak"] == "escalation"
    assert "satıcımıza iletiyorum" in result["cevap"].lower()

    customer = get_customer(phone)
    customer_id = customer["id"]

    supabase = get_supabase()

    question_result = (
        supabase.table("unanswered_questions")
        .select("*")
        .eq("seller_id", SELLER_ID)
        .eq("customer_id", customer_id)
        .eq("is_resolved", False)
        .execute()
    )

    assert question_result.data

    notification_result = (
        supabase.table("seller_notifications")
        .select("*")
        .eq("seller_id", SELLER_ID)
        .eq("customer_id", customer_id)
        .eq("type", "unanswered_question")
        .execute()
    )

    assert notification_result.data

    state = get_state(
        SELLER_ID,
        customer_id,
    )

    assert state["durum"] == "başarılı"
    assert state["state"]["current_state"] == "AWAITING_SELLER"

    print_result(
        "TEST 4 — CEVAPLANAMAYAN SORU",
        {
            "unanswered_question": True,
            "seller_notification": True,
            "state": "AWAITING_SELLER",
        },
    )


# =====================================================
# TEST 5 — İHLAL KADEMELERİ
# =====================================================

def test_violation_levels() -> None:
    phone = f"+9055500{RUN_ID[-6:]}"

    first = send_message(
        phone=phone,
        message="Salak mısınız?",
        message_id="VIOLATION-001",
        customer_name="İhlal Test",
    )

    assert first["durum"] == "engellendi"
    assert first["aksiyon"] == "seller_notified"
    assert first["ihlal_sayisi"] == 1

    customer = get_customer(phone)
    customer_id = customer["id"]

    customer_result = get_customer_by_id(customer_id)

    assert customer_result["durum"] == "başarılı"
    assert customer_result["customer"]["is_blocked"] is False
    assert customer_result["customer"].get("muted_until") is None

    second = send_message(
        phone=phone,
        message="Aptal mısınız?",
        message_id="VIOLATION-002",
        customer_name="İhlal Test",
    )

    assert second["durum"] == "engellendi"
    assert second["aksiyon"] == "muted_24h"
    assert second["ihlal_sayisi"] == 2

    customer_result = get_customer_by_id(customer_id)
    customer = customer_result["customer"]

    assert customer.get("muted_until") is not None
    assert customer["is_blocked"] is False

    # Üçüncü ihlali test edebilmek için test amaçlı mute kaldırılır.
    unmute_result = unmute_customer(customer_id)

    assert unmute_result["durum"] == "başarılı"

    third = send_message(
        phone=phone,
        message="Yine salaksınız",
        message_id="VIOLATION-003",
        customer_name="İhlal Test",
    )

    assert third["durum"] == "engellendi"
    assert third["aksiyon"] == "blocked"
    assert third["ihlal_sayisi"] == 3

    customer_result = get_customer_by_id(customer_id)
    customer = customer_result["customer"]

    assert customer["is_blocked"] is True
    assert customer["blocked_reason"] is not None

    blocked_message = send_message(
        phone=phone,
        message="Merhaba",
        message_id="VIOLATION-004",
        customer_name="İhlal Test",
    )

    assert blocked_message["durum"] == "engellendi"
    assert blocked_message["sebep"] == "Müşteri bloklu"

    # Test müşterisini daha sonraki çalışmalarda sorun
    # çıkarmaması için yeniden aç.
    cleanup = unblock_customer(customer_id)

    assert cleanup["durum"] == "başarılı"

    print_result(
        "TEST 5 — İHLAL KADEMELERİ",
        {
            "birinci": "seller_notified",
            "ikinci": "muted_24h",
            "üçüncü": "blocked",
            "temizlik": "unblocked",
        },
    )


# =====================================================
# TÜM TESTLER
# =====================================================

def run_all_tests() -> None:
    print("=" * 70)
    print("CHAT SERVICE ENTEGRASYON TESTLERİ")
    print(f"RUN ID: {RUN_ID}")
    print("=" * 70)

    test_template_responses()
    test_duplicate_webhook()
    test_full_order_flow()
    test_unanswered_question()
    test_violation_levels()

    print("\n" + "=" * 70)
    print("TÜM CHAT SERVICE ENTEGRASYON TESTLERİ BAŞARILI")
    print("=" * 70)


if __name__ == "__main__":
    run_all_tests()