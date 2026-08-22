from __future__ import annotations

import json
import os
import uuid
from typing import Any

from tests.integration import scenario_whatsapp_concurrency as stress


def _assert_isolated_target() -> None:
    if os.getenv("APP_ENV", "").strip().lower() == "production":
        raise RuntimeError("Concurrency stress production APP_ENV üzerinde çalıştırılamaz.")
    if os.getenv("WHATSAPP_STRESS_TARGET", "").strip() != "isolated-test-db":
        raise RuntimeError(
            "Concurrency stress için WHATSAPP_STRESS_TARGET=isolated-test-db zorunludur."
        )


def run_all_tests() -> dict[str, Any]:
    _assert_isolated_target()
    seller_id, workers = stress._assert_safety_gate()
    token = "wa-stress-" + uuid.uuid4().hex[:16]
    phone = "+90500" + str(int(uuid.uuid4().hex[:8], 16))[-7:].zfill(7)
    phone_id = f"stress-phone-{uuid.uuid4().hex[:12]}"
    customer_id: int | None = None
    results: dict[str, Any] = {
        "token": token,
        "workers": workers,
        "seller_id": seller_id,
    }

    try:
        customer_id, results["customer_identity"] = stress._test_customer_identity(
            seller_id=seller_id,
            workers=workers,
            phone=phone,
        )
        results["message_burst"] = stress._test_message_burst(
            seller_id=seller_id,
            customer_id=customer_id,
            workers=workers,
            token=token,
        )
        results["duplicate_message_burst"] = stress._test_duplicate_message_burst(
            seller_id=seller_id,
            customer_id=customer_id,
            workers=workers,
            token=token,
        )
        results["same_sender_fifo"] = stress._test_same_sender_fifo(
            workers=workers,
            token=token,
            phone_id=phone_id,
        )
        results["different_sender_parallelism"] = stress._test_different_sender_parallelism(
            workers=workers,
            token=token,
            phone_id=phone_id,
        )
        # Reclaim must run before the duplicate-webhook scenario because the latter
        # intentionally leaves one PENDING event until final cleanup.
        results["worker_reclaim_fencing"] = stress._test_worker_reclaim_fencing(
            token=token,
            phone_id=phone_id,
        )
        results["duplicate_webhook_burst"] = stress._test_duplicate_webhook_burst(
            workers=workers,
            token=token,
            phone_id=phone_id,
        )
        results["status"] = "success"
        return results
    finally:
        stress._cleanup(
            seller_id=seller_id,
            customer_id=customer_id,
            phone=phone,
            token=token,
        )


if __name__ == "__main__":
    print(json.dumps(run_all_tests(), ensure_ascii=False, indent=2, sort_keys=True))
