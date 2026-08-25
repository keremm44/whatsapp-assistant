from __future__ import annotations

import json
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from supabase import Client, create_client


_CONFIRM_ENV = "WHATSAPP_CONCURRENCY_STRESS_CONFIRM"
_CONFIRM_VALUE = "synthetic-only"
_SELLER_ENV = "WHATSAPP_STRESS_SELLER_ID"
_WORKERS_ENV = "WHATSAPP_STRESS_MAX_WORKERS"
_DEFAULT_WORKERS = 12
_MAX_WORKERS = 32


def _extract_payload(data: Any) -> dict[str, Any]:
    if isinstance(data, dict):
        return data
    if isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict):
        return data[0]
    raise AssertionError(f"Beklenmeyen RPC yanıtı: {type(data).__name__}")


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} zorunludur.")
    return value


def _positive_env_int(name: str, *, default: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None and default is not None:
        return default
    try:
        value = int((raw or "").strip())
    except ValueError as exc:
        raise RuntimeError(f"{name} pozitif tam sayı olmalıdır.") from exc
    if value <= 0:
        raise RuntimeError(f"{name} pozitif tam sayı olmalıdır.")
    return value


def _assert_safety_gate() -> tuple[int, int]:
    if os.getenv(_CONFIRM_ENV, "").strip() != _CONFIRM_VALUE:
        raise RuntimeError(
            f"Canlı concurrency testi sentetik DB yazıları yapar. "
            f"Çalıştırmak için {_CONFIRM_ENV}={_CONFIRM_VALUE} ayarlanmalıdır."
        )
    seller_id = _positive_env_int(_SELLER_ENV)
    workers = _positive_env_int(_WORKERS_ENV, default=_DEFAULT_WORKERS)
    if workers < 2 or workers > _MAX_WORKERS:
        raise RuntimeError(f"{_WORKERS_ENV} 2-{_MAX_WORKERS} aralığında olmalıdır.")
    return seller_id, workers


def _new_client() -> Client:
    return create_client(
        _required_env("SUPABASE_URL"),
        _required_env("SUPABASE_SERVICE_KEY"),
    )


def _rpc(client: Client, name: str, params: dict[str, Any]) -> dict[str, Any]:
    return _extract_payload(client.rpc(name, params).execute().data)


def _parallel(count: int, fn: Callable[[int, Client], Any]) -> list[Any]:
    barrier = threading.Barrier(count)

    def _one(index: int) -> Any:
        client = _new_client()
        barrier.wait(timeout=20)
        return fn(index, client)

    with ThreadPoolExecutor(max_workers=count) as pool:
        futures = [pool.submit(_one, index) for index in range(count)]
        return [future.result(timeout=60) for future in futures]


def _queue_payload(sender_id: str, message_id: str) -> dict[str, Any]:
    return {
        "message_id": message_id,
        "sender_id": sender_id,
        "message_type": "text",
        "text": "concurrency-stress",
        "timestamp": "1",
        "contact_name": "Concurrency Stress",
        "media_id": None,
    }


def _enqueue(
    client: Client,
    *,
    event_key: str,
    phone_number_id: str,
    sender_id: str,
) -> dict[str, Any]:
    return _rpc(
        client,
        "enqueue_whatsapp_inbound_event",
        {
            "event_type_value": "inbound_message",
            "event_key_value": event_key,
            "phone_number_id_value": phone_number_id,
            "payload_value": _queue_payload(sender_id, event_key),
        },
    )


def _claim(client: Client, worker_id: str) -> dict[str, Any]:
    return _rpc(
        client,
        "claim_next_whatsapp_inbound_event",
        {"worker_id_value": worker_id},
    )


def _complete(client: Client, event: dict[str, Any], worker_id: str) -> dict[str, Any]:
    return _rpc(
        client,
        "complete_whatsapp_inbound_event",
        {
            "event_id_value": event["id"],
            "worker_id_value": worker_id,
            "claim_version_value": event["claim_version"],
            "outcome_value": "PROCESSED",
            "error_code_value": None,
            "retry_at_value": None,
        },
    )


def _test_customer_identity(
    *, seller_id: int, workers: int, phone: str
) -> tuple[int, dict[str, Any]]:
    def _create(index: int, client: Client) -> dict[str, Any]:
        return _rpc(
            client,
            "get_or_create_customer_identity",
            {
                "target_seller_id": seller_id,
                "whatsapp_number_value": phone,
                "name_value": f"Concurrency Stress {index}",
            },
        )

    results = _parallel(workers, _create)
    assert all(result.get("status") == "success" for result in results), results
    ids = {
        result.get("customer", {}).get("id")
        for result in results
        if isinstance(result.get("customer"), dict)
    }
    assert len(ids) == 1, results
    customer_id = next(iter(ids))
    assert isinstance(customer_id, int) and customer_id > 0
    assert sum(result.get("created") is True for result in results) == 1, results

    rows = (
        _new_client()
        .table("customers")
        .select("id,total_messages")
        .eq("seller_id", seller_id)
        .eq("whatsapp_number", phone)
        .execute()
        .data
        or []
    )
    assert len(rows) == 1 and rows[0]["id"] == customer_id, rows
    return customer_id, {"workers": workers, "customer_id": customer_id}


def _test_message_burst(
    *, seller_id: int, customer_id: int, workers: int, token: str
) -> dict[str, Any]:
    count = max(20, workers * 2)

    def _persist(index: int, client: Client) -> dict[str, Any]:
        return _rpc(
            client,
            "persist_message_with_customer_metrics",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "direction_value": "incoming",
                "content_value": f"stress-{index}",
                "message_type_value": "text",
                "media_url_value": None,
                "was_auto_replied_value": False,
                "ai_confidence_value": None,
                "provider_value": "internal",
                "provider_message_id_value": f"{token}-msg-{index}",
            },
        )

    results: list[dict[str, Any]] = []
    for start in range(0, count, workers):
        wave = min(workers, count - start)
        wave_results = _parallel(
            wave,
            lambda index, client, offset=start: _persist(offset + index, client),
        )
        results.extend(wave_results)

    assert len(results) == count
    assert all(result.get("status") == "success" for result in results), results
    message_ids = {
        result.get("message", {}).get("id")
        for result in results
        if isinstance(result.get("message"), dict)
    }
    assert len(message_ids) == count, results

    client = _new_client()
    message_rows = (
        client.table("messages")
        .select("id")
        .eq("seller_id", seller_id)
        .eq("customer_id", customer_id)
        .like("provider_message_id", f"{token}-msg-%")
        .execute()
        .data
        or []
    )
    customer_rows = (
        client.table("customers")
        .select("id,total_messages")
        .eq("id", customer_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    assert len(message_rows) == count, message_rows
    assert customer_rows and customer_rows[0]["total_messages"] == count, customer_rows
    return {"messages": count, "unique_message_ids": len(message_ids)}


def _test_duplicate_message_burst(
    *, seller_id: int, customer_id: int, workers: int, token: str
) -> dict[str, Any]:
    duplicate_id = f"{token}-duplicate"

    def _persist(_: int, client: Client) -> dict[str, Any]:
        return _rpc(
            client,
            "persist_message_with_customer_metrics",
            {
                "target_seller_id": seller_id,
                "target_customer_id": customer_id,
                "direction_value": "incoming",
                "content_value": "duplicate-stress",
                "message_type_value": "text",
                "media_url_value": None,
                "was_auto_replied_value": False,
                "ai_confidence_value": None,
                "provider_value": "internal",
                "provider_message_id_value": duplicate_id,
            },
        )

    results = _parallel(workers, _persist)
    statuses = [result.get("status") for result in results]
    assert statuses.count("success") == 1, results
    assert statuses.count("duplicate") == workers - 1, results

    client = _new_client()
    rows = (
        client.table("messages")
        .select("id")
        .eq("seller_id", seller_id)
        .eq("customer_id", customer_id)
        .eq("provider_message_id", duplicate_id)
        .execute()
        .data
        or []
    )
    customer = (
        client.table("customers")
        .select("total_messages")
        .eq("id", customer_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    expected = max(20, workers * 2) + 1
    assert len(rows) == 1, rows
    assert customer and customer[0]["total_messages"] == expected, customer
    return {"workers": workers, "success": 1, "duplicates": workers - 1}


def _test_same_sender_fifo(*, workers: int, token: str, phone_id: str) -> dict[str, Any]:
    client = _new_client()
    event_ids: list[int] = []
    total = min(8, workers)
    sender = f"sender-{token}"
    for index in range(total):
        payload = _enqueue(
            client,
            event_key=f"{token}-fifo-{index}",
            phone_number_id=phone_id,
            sender_id=sender,
        )
        assert payload.get("status") == "success", payload
        event = payload.get("event")
        assert isinstance(event, dict) and isinstance(event.get("id"), int), payload
        event_ids.append(event["id"])

    claimed_ids: list[int] = []
    for wave in range(total):
        results = _parallel(
            workers,
            lambda index, worker_client, wave_no=wave: _claim(
                worker_client, f"{token}-fifo-worker-{wave_no}-{index}"
            ),
        )
        claims = [
            (index, result["event"])
            for index, result in enumerate(results)
            if isinstance(result.get("event"), dict)
        ]
        assert len(claims) == 1, results
        index, event = claims[0]
        claimed_ids.append(event["id"])
        completion = _complete(
            _new_client(), event, f"{token}-fifo-worker-{wave}-{index}"
        )
        assert completion.get("status") == "success", completion

    assert claimed_ids == event_ids, {"expected": event_ids, "actual": claimed_ids}
    return {"events": total, "fifo": True}


def _test_different_sender_parallelism(
    *, workers: int, token: str, phone_id: str
) -> dict[str, Any]:
    client = _new_client()
    total = workers
    for index in range(total):
        payload = _enqueue(
            client,
            event_key=f"{token}-parallel-{index}",
            phone_number_id=phone_id,
            sender_id=f"sender-{token}-{index}",
        )
        assert payload.get("status") == "success", payload

    results = _parallel(
        workers,
        lambda index, worker_client: _claim(
            worker_client, f"{token}-parallel-worker-{index}"
        ),
    )
    claims = [
        (index, result["event"])
        for index, result in enumerate(results)
        if isinstance(result.get("event"), dict)
    ]
    assert len(claims) == total, results
    ids = {event["id"] for _, event in claims}
    assert len(ids) == total, results
    for index, event in claims:
        completion = _complete(
            _new_client(), event, f"{token}-parallel-worker-{index}"
        )
        assert completion.get("status") == "success", completion
    return {"events": total, "distinct_claims": len(ids)}


def _test_duplicate_webhook_burst(*, workers: int, token: str, phone_id: str) -> dict[str, Any]:
    event_key = f"{token}-webhook-duplicate"
    sender_id = f"sender-{token}-duplicate"

    results = _parallel(
        workers,
        lambda _index, client: _enqueue(
            client,
            event_key=event_key,
            phone_number_id=phone_id,
            sender_id=sender_id,
        ),
    )
    assert all(result.get("status") == "success" for result in results), results
    ids = {
        result.get("event", {}).get("id")
        for result in results
        if isinstance(result.get("event"), dict)
    }
    assert len(ids) == 1, results
    rows = (
        _new_client()
        .table("whatsapp_inbound_events")
        .select("id")
        .eq("event_key", event_key)
        .execute()
        .data
        or []
    )
    assert len(rows) == 1, rows
    return {"workers": workers, "durable_rows": 1}


def _test_worker_reclaim_fencing(*, token: str, phone_id: str) -> dict[str, Any]:
    client = _new_client()
    payload = _enqueue(
        client,
        event_key=f"{token}-reclaim",
        phone_number_id=phone_id,
        sender_id=f"sender-{token}-reclaim",
    )
    assert payload.get("status") == "success", payload

    worker_a = f"{token}-worker-a"
    worker_b = f"{token}-worker-b"
    claim_a = _claim(_new_client(), worker_a)
    event_a = claim_a.get("event")
    assert isinstance(event_a, dict), claim_a

    stale_at = (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()
    (
        _new_client()
        .table("whatsapp_inbound_events")
        .update({"claimed_at": stale_at, "updated_at": stale_at})
        .eq("id", event_a["id"])
        .eq("claimed_by", worker_a)
        .eq("claim_version", event_a["claim_version"])
        .execute()
    )

    claim_b = _claim(_new_client(), worker_b)
    event_b = claim_b.get("event")
    assert isinstance(event_b, dict), claim_b
    assert event_b["id"] == event_a["id"]
    assert event_b["claim_version"] == event_a["claim_version"] + 1

    stale_renew = _rpc(
        _new_client(),
        "renew_whatsapp_inbound_event_claim",
        {
            "event_id_value": event_a["id"],
            "worker_id_value": worker_a,
            "claim_version_value": event_a["claim_version"],
        },
    )
    assert stale_renew == {"status": "conflict", "reason": "claim_lost"}, stale_renew

    stale_complete = _rpc(
        _new_client(),
        "complete_whatsapp_inbound_event",
        {
            "event_id_value": event_a["id"],
            "worker_id_value": worker_a,
            "claim_version_value": event_a["claim_version"],
            "outcome_value": "PROCESSED",
            "error_code_value": None,
            "retry_at_value": None,
        },
    )
    assert stale_complete.get("status") == "conflict", stale_complete
    assert stale_complete.get("reason") == "claim_lost", stale_complete

    current_renew = _rpc(
        _new_client(),
        "renew_whatsapp_inbound_event_claim",
        {
            "event_id_value": event_b["id"],
            "worker_id_value": worker_b,
            "claim_version_value": event_b["claim_version"],
        },
    )
    assert current_renew.get("status") == "success", current_renew
    completed = _complete(_new_client(), event_b, worker_b)
    assert completed.get("status") == "success", completed
    return {
        "event_id": event_b["id"],
        "old_claim_version": event_a["claim_version"],
        "new_claim_version": event_b["claim_version"],
        "stale_worker_blocked": True,
    }


def _cleanup(*, seller_id: int, customer_id: int | None, phone: str, token: str) -> None:
    client = _new_client()
    # Delete only rows carrying this run's globally unique token.
    try:
        client.table("whatsapp_inbound_events").delete().like(
            "event_key", f"{token}-%"
        ).execute()
    finally:
        if customer_id is not None:
            client.table("messages").delete().eq("seller_id", seller_id).eq(
                "customer_id", customer_id
            ).like("provider_message_id", f"{token}-%").execute()
            client.table("customers").delete().eq("id", customer_id).eq(
                "seller_id", seller_id
            ).eq("whatsapp_number", phone).execute()


def run_all_tests() -> dict[str, Any]:
    seller_id, workers = _assert_safety_gate()
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
        customer_id, results["customer_identity"] = _test_customer_identity(
            seller_id=seller_id,
            workers=workers,
            phone=phone,
        )
        results["message_burst"] = _test_message_burst(
            seller_id=seller_id,
            customer_id=customer_id,
            workers=workers,
            token=token,
        )
        results["duplicate_message_burst"] = _test_duplicate_message_burst(
            seller_id=seller_id,
            customer_id=customer_id,
            workers=workers,
            token=token,
        )
        results["same_sender_fifo"] = _test_same_sender_fifo(
            workers=workers,
            token=token,
            phone_id=phone_id,
        )
        results["different_sender_parallelism"] = _test_different_sender_parallelism(
            workers=workers,
            token=token,
            phone_id=phone_id,
        )
        results["duplicate_webhook_burst"] = _test_duplicate_webhook_burst(
            workers=workers,
            token=token,
            phone_id=phone_id,
        )
        results["worker_reclaim_fencing"] = _test_worker_reclaim_fencing(
            token=token,
            phone_id=phone_id,
        )
        results["status"] = "success"
        return results
    finally:
        _cleanup(
            seller_id=seller_id,
            customer_id=customer_id,
            phone=phone,
            token=token,
        )


if __name__ == "__main__":
    summary = run_all_tests()
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
