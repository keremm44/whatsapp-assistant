from datetime import timedelta

from database import (
    get_or_create_customer,
    save_message,
    check_message_duplicate,
    mute_customer,
    unmute_customer,
    is_customer_muted,
    block_customer,
    unblock_customer,
    get_customer_by_id,
    get_state,
    set_state,
    transition_state,
    utc_now,
)

SELLER_ID = 2
TEST_PHONE = "+905559990001"


def print_result(title: str, result):
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)
    print(result)


def get_test_customer():
    result = get_or_create_customer(
        seller_id=SELLER_ID,
        whatsapp_number=TEST_PHONE,
        name="Database Test Müşteri",
    )

    assert result["durum"] in {"mevcut", "yeni_oluşturuldu"}
    return result["customer"]


def test_duplicate_message(customer_id: int):
    provider_id = "TEST-DUPLICATE-001"

    first = save_message(
        seller_id=SELLER_ID,
        customer_id=customer_id,
        direction="incoming",
        content="Duplicate test mesajı",
        provider="internal",
        provider_message_id=provider_id,
    )

    second = save_message(
        seller_id=SELLER_ID,
        customer_id=customer_id,
        direction="incoming",
        content="Duplicate test mesajı",
        provider="internal",
        provider_message_id=provider_id,
    )

    assert first["durum"] in {"başarılı", "duplicate"}
    assert second["durum"] == "duplicate"

    print_result(
        "DUPLICATE MESAJ TESTİ",
        {
            "ilk_kayıt": first["durum"],
            "ikinci_kayıt": second["durum"],
        },
    )


def test_mute(customer_id: int):
    mute_result = mute_customer(customer_id, hours=1)
    assert mute_result["durum"] == "başarılı"

    customer_result = get_customer_by_id(customer_id)
    customer = customer_result["customer"]

    assert is_customer_muted(customer) is True

    unmute_result = unmute_customer(customer_id)
    assert unmute_result["durum"] == "başarılı"

    customer_result = get_customer_by_id(customer_id)
    customer = customer_result["customer"]

    assert is_customer_muted(customer) is False

    print_result("MUTE TESTİ", "Başarılı")


def test_block(customer_id: int):
    block_result = block_customer(
        customer_id,
        reason="Otomatik test",
    )

    assert block_result["durum"] == "başarılı"

    customer_result = get_customer_by_id(customer_id)
    customer = customer_result["customer"]

    assert customer["is_blocked"] is True
    assert customer["blocked_reason"] == "Otomatik test"

    unblock_result = unblock_customer(customer_id)
    assert unblock_result["durum"] == "başarılı"

    customer_result = get_customer_by_id(customer_id)
    customer = customer_result["customer"]

    assert customer["is_blocked"] is False
    assert customer["blocked_reason"] is None

    print_result("BLOCK TESTİ", "Başarılı")


def test_state_machine(customer_id: int):
    initial = get_state(
        SELLER_ID,
        customer_id,
    )

    assert initial["durum"] == "başarılı"

    transition = transition_state(
        seller_id=SELLER_ID,
        customer_id=customer_id,
        to_state="AWAITING_ORDER_NUMBER",
        reason_code="user_action",
        state_data={
            "test": True,
        },
        expires_in_hours=24,
    )

    assert transition["durum"] in {
        "başarılı",
        "kısmi_başarılı",
    }

    current = get_state(
        SELLER_ID,
        customer_id,
    )

    assert current["durum"] == "başarılı"
    assert current["state"]["current_state"] == "AWAITING_ORDER_NUMBER"
    assert current["state"]["state_type"] == "soft_lock"

    reset = transition_state(
        seller_id=SELLER_ID,
        customer_id=customer_id,
        to_state="NORMAL",
        reason_code="system",
    )

    assert reset["durum"] in {
        "başarılı",
        "kısmi_başarılı",
    }

    final_state = get_state(
        SELLER_ID,
        customer_id,
    )

    assert final_state["durum"] == "başarılı"
    assert final_state["state"]["current_state"] == "NORMAL"

    print_result(
        "STATE MACHINE TESTİ",
        {
            "önceki": initial["state"]["current_state"],
            "geçiş": "AWAITING_ORDER_NUMBER",
            "son": final_state["state"]["current_state"],
        },
    )


def test_expired_state(customer_id: int):
    expired_at = (
        utc_now() - timedelta(minutes=5)
    ).isoformat()

    set_result = set_state(
        seller_id=SELLER_ID,
        customer_id=customer_id,
        current_state="AWAITING_ORDER_NUMBER",
        state_data={
            "test": "expired",
        },
        expires_at=expired_at,
    )

    assert set_result["durum"] == "başarılı"
    assert set_result["state"]["current_state"] == "AWAITING_ORDER_NUMBER"

    state_result = get_state(
        seller_id=SELLER_ID,
        customer_id=customer_id,
    )

    assert state_result["durum"] == "başarılı"
    assert state_result["state"]["current_state"] == "NORMAL"
    assert state_result["state"]["state_type"] == "no_lock"
    assert state_result["state"]["expires_at"] is None
    assert state_result.get("expired") is True

    print_result(
        "EXPIRED STATE TESTİ",
        {
            "önceki": "AWAITING_ORDER_NUMBER",
            "sonraki": state_result["state"]["current_state"],
            "expired": state_result.get("expired"),
            "uyarı": state_result.get("uyarı"),
        },
    )


def run_all_tests():
    customer = get_test_customer()
    customer_id = customer["id"]

    print_result("TEST MÜŞTERİSİ", customer)

    test_duplicate_message(customer_id)
    test_mute(customer_id)
    test_block(customer_id)
    test_state_machine(customer_id)
    test_expired_state(customer_id)

    print("\n" + "=" * 60)
    print("TÜM DATABASE TESTLERİ BAŞARILI")
    print("=" * 60)


if __name__ == "__main__":
    run_all_tests()