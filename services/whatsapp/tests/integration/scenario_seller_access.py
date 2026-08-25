from __future__ import annotations

import time
from typing import Any

from database import (
    activate_seller,
    complete_onboarding_step,
    configure_founder_beta,
    create_seller,
    create_seller_application,
    get_active_rules,
    get_onboarding_status,
    get_onboarding_steps,
    get_seller_application_by_id,
    get_seller_applications,
    get_seller_by_id,
    get_supabase,
    initialize_onboarding,
    pause_seller_ai,
    resume_seller_ai,
    start_onboarding_step,
    update_seller_application_status,
)


RUN_ID = str(int(time.time()))
TEST_EMAIL = f"seller-access-{RUN_ID}@example.com"
TEST_PHONE = f"+90556{RUN_ID[-7:]}"
TEST_STORE = f"Seller Access Test {RUN_ID}"


def print_result(title: str, result: Any) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)
    print(result)


def test_application_flow() -> int:
    application = create_seller_application(
        full_name="Başvuru Test Kullanıcısı",
        email=TEST_EMAIL,
        phone=TEST_PHONE,
        store_name=TEST_STORE,
        store_link="https://example.com/test-store",
        notes="Otomatik seller access testi",
    )

    assert application["durum"] == "başarılı"
    application_id = application["application"]["id"]

    print_result("BAŞVURU OLUŞTURMA", application)

    duplicate = create_seller_application(
        full_name="Başvuru Test Kullanıcısı",
        email=TEST_EMAIL,
        phone=TEST_PHONE,
        store_name=TEST_STORE,
    )

    assert duplicate["durum"] == "duplicate"

    print_result("DUPLICATE BAŞVURU", duplicate)

    contacted = update_seller_application_status(
        application_id=application_id,
        status="contacted",
        admin_note="Test amacıyla iletişime geçildi.",
    )

    assert contacted["durum"] == "başarılı"
    assert contacted["application"]["status"] == "contacted"
    assert contacted["application"]["contacted_at"] is not None

    fetched = get_seller_application_by_id(application_id)

    assert fetched["durum"] == "başarılı"
    assert fetched["application"]["id"] == application_id

    listed = get_seller_applications(
        status="contacted",
        limit=100,
    )

    assert listed["durum"] == "başarılı"
    assert any(
        item["id"] == application_id
        for item in listed["applications"]
    )

    print_result(
        "BAŞVURU DURUMU VE LİSTELEME",
        {
            "application_id": application_id,
            "status": contacted["application"]["status"],
            "listede_bulundu": True,
        },
    )

    return application_id


def create_test_seller() -> int:
    result = create_seller(
        name="Founder Beta Test",
        email=f"founder-beta-{RUN_ID}@example.com",
        store_name=f"Founder Beta Store {RUN_ID}",
        phone=f"+90557{RUN_ID[-7:]}",
        store_link="https://example.com/founder-beta",
    )

    assert result["durum"] == "başarılı"
    assert result["eklenen"]

    seller_id = result["eklenen"][0]["id"]

    print_result(
        "TEST SATICISI OLUŞTURULDU",
        {
            "seller_id": seller_id,
            "store_name": result["eklenen"][0]["store_name"],
        },
    )

    return seller_id


def test_founder_beta_configuration(seller_id: int) -> None:
    result = configure_founder_beta(
        seller_id=seller_id,
        beta_days=30,
    )

    assert result["durum"] == "başarılı"

    seller = result["seller"]

    assert seller["account_type"] == "founder_beta"
    assert seller["payment_required"] is False
    assert seller["special_pricing"] is True
    assert seller["activation_requires_admin"] is True
    assert seller["ai_enabled"] is False
    assert seller["beta_duration_days"] == 30
    assert seller["beta_started_at"] is None
    assert seller["beta_ends_at"] is None

    print_result("FOUNDER BETA AYARLARI", seller)


def test_onboarding_initialization(seller_id: int) -> None:
    result = initialize_onboarding(seller_id)

    assert result["durum"] == "başarılı"
    assert result["onboarding_status"] == "in_progress"
    assert result["current_onboarding_step"] == 1
    assert result["onboarding_completed"] is False
    assert len(result["steps"]) == 10

    assert result["steps"][0]["status"] == "available"

    for step in result["steps"][1:]:
        assert step["status"] == "locked"

    print_result(
        "ONBOARDING BAŞLATMA",
        {
            "adım_sayısı": len(result["steps"]),
            "aktif_adım": result["current_onboarding_step"],
            "ilk_adım": result["steps"][0]["status"],
            "diğer_adımlar": "locked",
        },
    )


def test_locked_step_protection(seller_id: int) -> None:
    start_locked = start_onboarding_step(
        seller_id=seller_id,
        step_order=2,
    )

    assert start_locked["durum"] == "kilitli"

    skip_attempt = complete_onboarding_step(
        seller_id=seller_id,
        step_order=2,
        step_data={"test": "skip_attempt"},
    )

    assert skip_attempt["durum"] == "sıra_hatası"
    assert skip_attempt["current_onboarding_step"] == 1

    print_result(
        "ADIM ATLAMA KORUMASI",
        {
            "kilitli_adım_başlatma": start_locked["durum"],
            "adım_atlama": skip_attempt["durum"],
        },
    )


def test_activation_before_onboarding(seller_id: int) -> None:
    result = activate_seller(
        seller_id=seller_id,
        activated_by_admin=True,
    )

    assert result["durum"] == "reddedildi"

    print_result(
        "ONBOARDING ÖNCESİ AKTİVASYON",
        result,
    )


def build_onboarding_step_data(step_order: int) -> dict[str, Any]:
    payloads: dict[int, dict[str, Any]] = {
        1: {
            "name": "Founder Beta Onboarding",
            "email": f"onboarding-founder-{RUN_ID}@example.com",
            "phone": f"+90558{RUN_ID[-7:]}",
        },
        2: {
            "store_name": f"Onboarding Store {RUN_ID}",
            "store_link": "https://example.com/onboarding-store",
        },
        3: {
            "material": "Seramik",
            "size_ml": 330,
            "print_method": "Süblimasyon",
            "custom_text_max_length": 80,
            "min_quantity": 1,
            "max_quantity": 100,
            "image_required": True,
            "custom_text_required": True,
            "microwave_safe": None,
            "dishwasher_safe": True,
            "hand_wash_recommended": False,
            "food_safe": True,
        },
        4: {
            "processing_days_min": 1,
            "processing_days_max": 3,
            "same_day_available": False,
            "company": "Yurtiçi Kargo",
            "international": False,
        },
        5: {
            "accepts_returns": True,
            "return_period_days": 14,
            "damage_replacement": True,
            "wrong_print_replacement": True,
        },
        6: {
            "templates_confirmed": True,
            "rules": [
                {
                    "trigger_text": f"toplu sipariş {RUN_ID}",
                    "response_text": "Toplu sipariş talebinizi satıcımıza iletiyorum.",
                    "category": "bulk_order",
                    "is_active": True,
                }
            ],
        },
        7: {
            "test_passed": True,
            "seller_confirmed": True,
            "sample_message": "Merhaba",
        },
        8: {
            "connection_status": "connected",
            "display_phone_number": f"+90559{RUN_ID[-7:]}",
            "phone_number_id": f"phone-{RUN_ID}",
            "business_account_id": f"waba-{RUN_ID}",
        },
        9: {
            "inbound_message_received": True,
            "outbound_message_delivered": True,
            "test_passed": True,
        },
        10: {
            "information_confirmed": True,
            "terms_accepted": True,
            "ready_for_activation": True,
            "terms_version": "v1",
        },
    }
    return payloads[step_order]


def verify_onboarding_mapping(seller_id: int) -> None:
    seller_result = get_seller_by_id(seller_id)
    assert seller_result["durum"] == "başarılı"
    seller = seller_result["satıcı"]

    assert seller["name"] == "Founder Beta Onboarding"
    assert seller["email"] == f"onboarding-founder-{RUN_ID}@example.com"
    assert seller["store_name"] == f"Onboarding Store {RUN_ID}"
    assert seller["store_link"] == "https://example.com/onboarding-store"

    product_info = seller["product_info"]
    assert product_info["product"]["material"] == "Seramik"
    assert product_info["product"]["size_ml"] == 330
    assert product_info["shipping"]["company"] == "Yurtiçi Kargo"
    assert product_info["return"]["return_period_days"] == 14

    rules_result = get_active_rules(seller_id)
    assert rules_result["durum"] == "başarılı"
    assert any(
        rule["trigger_text"] == f"toplu sipariş {RUN_ID}"
        for rule in rules_result["kurallar"]
    )

    print_result(
        "ONBOARDING VERİ EŞLEŞTİRME",
        {
            "seller_fields": True,
            "product_info": True,
            "shipping_info": True,
            "return_policy": True,
            "rules": True,
        },
    )


def test_complete_all_onboarding_steps(seller_id: int) -> None:
    for step_order in range(1, 11):
        started = start_onboarding_step(
            seller_id=seller_id,
            step_order=step_order,
        )

        assert started["durum"] in {
            "başarılı",
            "tamamlanmış",
        }

        completed = complete_onboarding_step(
            seller_id=seller_id,
            step_order=step_order,
            step_data=build_onboarding_step_data(step_order),
        )

        assert completed["durum"] == "başarılı"

        if step_order == 1:
            reinitialized = initialize_onboarding(seller_id)
            assert reinitialized["durum"] == "başarılı"
            assert reinitialized["current_onboarding_step"] == 2
            assert reinitialized["steps"][0]["status"] == "completed"
            assert reinitialized["steps"][1]["status"] == "available"

        if step_order < 10:
            assert (
                completed["current_onboarding_step"]
                == step_order + 1
            )
            assert completed["onboarding_completed"] is False
        else:
            assert completed["current_onboarding_step"] == 10
            assert completed["onboarding_completed"] is True
            assert completed["onboarding_status"] == "completed"
            assert (
                completed["system_status"]
                == "admin_review_pending"
            )
            assert completed["ai_enabled"] is False

        print_result(
            f"ONBOARDING ADIM {step_order}",
            {
                "tamamlandı": True,
                "sonraki_aktif_adım": (
                    completed["current_onboarding_step"]
                ),
                "genel_durum": completed["onboarding_status"],
            },
        )

    steps = get_onboarding_steps(seller_id)

    assert steps["durum"] == "başarılı"
    assert len(steps["steps"]) == 10
    assert all(
        step["status"] == "completed"
        for step in steps["steps"]
    )

    verify_onboarding_mapping(seller_id)


def test_admin_activation_gate(seller_id: int) -> None:
    without_admin = activate_seller(
        seller_id=seller_id,
        activated_by_admin=False,
    )

    assert without_admin["durum"] == "admin_onayı_gerekli"

    with_admin = activate_seller(
        seller_id=seller_id,
        activated_by_admin=True,
    )

    assert with_admin["durum"] == "başarılı"

    seller = with_admin["seller"]

    assert seller["system_status"] == "beta_active"
    assert seller["status"] == "active"
    assert seller["ai_enabled"] is True
    assert seller["activated_at"] is not None
    assert seller["beta_started_at"] is not None
    assert seller["beta_ends_at"] is not None

    print_result(
        "ADMIN AKTİVASYON KONTROLÜ",
        {
            "admin_olmadan": without_admin["durum"],
            "admin_onayıyla": with_admin["durum"],
            "system_status": seller["system_status"],
            "ai_enabled": seller["ai_enabled"],
        },
    )


def test_emergency_pause_and_resume(seller_id: int) -> None:
    paused = pause_seller_ai(
        seller_id=seller_id,
        reason="Otomatik test acil durdurma",
    )

    assert paused["durum"] == "başarılı"
    assert paused["seller"]["ai_enabled"] is False
    assert paused["seller"]["emergency_paused"] is True
    assert paused["seller"]["emergency_paused_at"] is not None

    resumed = resume_seller_ai(seller_id)

    assert resumed["durum"] == "başarılı"
    assert resumed["seller"]["ai_enabled"] is True
    assert resumed["seller"]["emergency_paused"] is False
    assert resumed["seller"]["emergency_paused_at"] is None
    assert resumed["seller"]["emergency_pause_reason"] is None

    print_result(
        "AI ACİL DURDURMA / YENİDEN AÇMA",
        {
            "durduruldu": True,
            "yeniden_açıldı": True,
            "ai_enabled": resumed["seller"]["ai_enabled"],
        },
    )


def verify_final_seller_state(seller_id: int) -> None:
    result = get_seller_by_id(seller_id)

    assert result["durum"] == "başarılı"

    seller = result["satıcı"]

    assert seller["account_type"] == "founder_beta"
    assert seller["onboarding_completed"] is True
    assert seller["system_status"] == "beta_active"
    assert seller["ai_enabled"] is True
    assert seller["payment_required"] is False

    print_result(
        "SON SATICI DURUMU",
        {
            "seller_id": seller_id,
            "account_type": seller["account_type"],
            "system_status": seller["system_status"],
            "onboarding_completed": seller[
                "onboarding_completed"
            ],
            "ai_enabled": seller["ai_enabled"],
            "payment_required": seller["payment_required"],
        },
    )


def cleanup_test_data(
    application_id: int | None,
    seller_id: int | None,
) -> None:
    """
    Test sonunda oluşturulan başvuru ve satıcı kayıtlarını siler.

    seller_onboarding_steps kaydı ON DELETE CASCADE ile temizlenir.
    """
    supabase = get_supabase()
    cleanup_errors: list[str] = []

    if application_id is not None:
        try:
            (
                supabase.table("seller_applications")
                .delete()
                .eq("id", application_id)
                .execute()
            )
        except Exception as exc:
            cleanup_errors.append(
                f"Başvuru temizlenemedi: {exc}"
            )

    if seller_id is not None:
        try:
            (
                supabase.table("sellers")
                .delete()
                .eq("id", seller_id)
                .execute()
            )
        except Exception as exc:
            cleanup_errors.append(
                f"Satıcı temizlenemedi: {exc}"
            )

    print_result(
        "TEST TEMİZLİĞİ",
        {
            "application_id": application_id,
            "seller_id": seller_id,
            "hatalar": cleanup_errors,
        },
    )


def run_all_tests() -> None:
    application_id: int | None = None
    seller_id: int | None = None

    print("=" * 72)
    print("SELLER ACCESS VE ONBOARDING TESTLERİ")
    print(f"RUN ID: {RUN_ID}")
    print("=" * 72)

    try:
        application_id = test_application_flow()

        seller_id = create_test_seller()

        test_founder_beta_configuration(seller_id)
        test_onboarding_initialization(seller_id)
        test_locked_step_protection(seller_id)
        test_activation_before_onboarding(seller_id)
        test_complete_all_onboarding_steps(seller_id)
        test_admin_activation_gate(seller_id)
        test_emergency_pause_and_resume(seller_id)
        verify_final_seller_state(seller_id)

        print("\n" + "=" * 72)
        print("TÜM SELLER ACCESS TESTLERİ BAŞARILI")
        print("=" * 72)

    finally:
        cleanup_test_data(
            application_id=application_id,
            seller_id=seller_id,
        )


if __name__ == "__main__":
    run_all_tests()