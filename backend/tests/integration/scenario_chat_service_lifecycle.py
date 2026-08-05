from __future__ import annotations

import time
from typing import Any

from chat_service import sohbet_isle
from database import get_supabase


SELLER_ID = 2
RUN_ID = str(int(time.time()))


def seller_snapshot() -> dict[str, Any]:
    result = (
        get_supabase()
        .table("sellers")
        .select(
            "system_status,ai_enabled,onboarding_completed,"
            "emergency_paused,emergency_paused_at,"
            "emergency_pause_reason"
        )
        .eq("id", SELLER_ID)
        .limit(1)
        .execute()
    )

    assert result.data
    return result.data[0]


def set_lifecycle(**values: Any) -> None:
    result = (
        get_supabase()
        .table("sellers")
        .update(values)
        .eq("id", SELLER_ID)
        .execute()
    )

    assert result.data


def send(case: str) -> dict[str, Any]:
    return sohbet_isle(
        seller_id=SELLER_ID,
        whatsapp_number=f"+9055900{RUN_ID[-6:]}{case[-1]}",
        kullanici_mesaji="Merhaba",
        customer_name="Lifecycle Test",
        provider="lifecycle_test",
        provider_message_id=f"{RUN_ID}-{case}",
        message_type="text",
    )


def assert_no_outgoing(result: dict[str, Any]) -> None:
    assert result["durum"] == "asistan_pasif"
    assert result["cevap"] is None

    incoming_message_id = result["incoming_message_id"]

    outgoing = (
        get_supabase()
        .table("messages")
        .select("id")
        .eq("seller_id", SELLER_ID)
        .eq("direction", "outgoing")
        .gt("id", incoming_message_id)
        .limit(1)
        .execute()
    )

    assert not outgoing.data


def run_all_tests() -> None:
    original = seller_snapshot()

    try:
        set_lifecycle(
            system_status="active",
            ai_enabled=True,
            onboarding_completed=True,
            emergency_paused=True,
        )
        paused = send("CASE-1")
        assert paused["reason_code"] == "emergency_paused"
        assert_no_outgoing(paused)
        print("BAŞARILI: emergency_paused")

        set_lifecycle(
            system_status="active",
            ai_enabled=False,
            onboarding_completed=True,
            emergency_paused=False,
        )
        disabled = send("CASE-2")
        assert disabled["reason_code"] == "ai_disabled"
        assert_no_outgoing(disabled)
        print("BAŞARILI: ai_disabled")

        set_lifecycle(
            system_status="active",
            ai_enabled=True,
            onboarding_completed=False,
            emergency_paused=False,
        )
        incomplete = send("CASE-3")
        assert incomplete["reason_code"] == "onboarding_incomplete"
        assert_no_outgoing(incomplete)
        print("BAŞARILI: onboarding_incomplete")

        set_lifecycle(
            system_status="suspended",
            ai_enabled=True,
            onboarding_completed=True,
            emergency_paused=False,
        )
        inactive = send("CASE-4")
        assert inactive["reason_code"] == "inactive_status"
        assert_no_outgoing(inactive)
        print("BAŞARILI: inactive_status")

        set_lifecycle(
            system_status="active",
            ai_enabled=True,
            onboarding_completed=True,
            emergency_paused=False,
        )
        active = send("CASE-5")
        assert active["durum"] == "başarılı"
        assert active["cevap"]
        print("BAŞARILI: active seller response")

        print("\\nTÜM AI LIFECYCLE TESTLERİ BAŞARILI")

    finally:
        set_lifecycle(**original)


if __name__ == "__main__":
    run_all_tests()