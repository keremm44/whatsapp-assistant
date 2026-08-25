from __future__ import annotations

from pathlib import Path

import pytest

from tests.integration import scenario_whatsapp_concurrency as stress


SCRIPT = Path("tests/integration/scenario_whatsapp_concurrency.py")


def test_concurrency_stress_requires_explicit_safety_confirmation(monkeypatch) -> None:
    monkeypatch.delenv("WHATSAPP_CONCURRENCY_STRESS_CONFIRM", raising=False)
    monkeypatch.setenv("WHATSAPP_STRESS_SELLER_ID", "2")

    with pytest.raises(RuntimeError, match="sentetik DB yazıları"):
        stress._assert_safety_gate()


def test_concurrency_stress_rejects_missing_test_seller(monkeypatch) -> None:
    monkeypatch.setenv("WHATSAPP_CONCURRENCY_STRESS_CONFIRM", "synthetic-only")
    monkeypatch.delenv("WHATSAPP_STRESS_SELLER_ID", raising=False)

    with pytest.raises(RuntimeError, match="WHATSAPP_STRESS_SELLER_ID"):
        stress._assert_safety_gate()


def test_concurrency_stress_bounds_parallelism(monkeypatch) -> None:
    monkeypatch.setenv("WHATSAPP_CONCURRENCY_STRESS_CONFIRM", "synthetic-only")
    monkeypatch.setenv("WHATSAPP_STRESS_SELLER_ID", "2")
    monkeypatch.setenv("WHATSAPP_STRESS_MAX_WORKERS", "33")

    with pytest.raises(RuntimeError, match="2-32"):
        stress._assert_safety_gate()


def test_concurrency_stress_contract_covers_required_failure_modes() -> None:
    sql = SCRIPT.read_text(encoding="utf-8")

    assert "ThreadPoolExecutor" in sql
    assert "threading.Barrier" in sql
    assert "_test_customer_identity" in sql
    assert "_test_message_burst" in sql
    assert "_test_duplicate_message_burst" in sql
    assert "_test_same_sender_fifo" in sql
    assert "_test_different_sender_parallelism" in sql
    assert "_test_duplicate_webhook_burst" in sql
    assert "_test_worker_reclaim_fencing" in sql
    assert "renew_whatsapp_inbound_event_claim" in sql
    assert "claim_lost" in sql
    assert "finally:" in sql
    assert "_cleanup(" in sql


def test_concurrency_stress_does_not_hardcode_production_seller() -> None:
    text = SCRIPT.read_text(encoding="utf-8")

    assert "WHATSAPP_STRESS_SELLER_ID" in text
    assert "seller_id = 2" not in text
    assert "SELLER_ID = 2" not in text
