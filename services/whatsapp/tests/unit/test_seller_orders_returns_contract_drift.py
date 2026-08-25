from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import protected_routes
import return_issue_service


CONTRACT_PATH = (
    Path(__file__).resolve().parents[4]
    / "contracts"
    / "seller-orders-returns-v1.json"
)


def _load_contract() -> dict[str, Any]:
    with CONTRACT_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    assert payload["schema_version"] == 1
    return payload


def _order_record() -> dict[str, Any]:
    return {
        "id": 41,
        "seller_id": 11,
        "customer_id": 22,
        "product_id": 3,
        "product_name_snapshot": "Kişiye Özel Kupa",
        "external_order_number": "TR123456",
        "customer_phone_snapshot": "+905321112233",
        "customer_note": "Hediye paketi olsun lütfen",
        "image_message_id": 104,
        "custom_text": "İyi ki doğdun Deniz",
        "status": "COLLECTING",
        "review_reason_code": None,
        "review_reason_note": None,
        "created_from_message_id": 900,
        "last_source_message_id": 950,
        "version": 4,
        "created_at": "2026-08-10T12:00:00+00:00",
        "updated_at": "2026-08-10T12:30:00+00:00",
        "completed_at": None,
        "closed_at": None,
    }


def _order_field() -> dict[str, Any]:
    return {
        "id": 11,
        "source_definition_id": 5,
        "definition_version": 2,
        "field_key": "kupa_rengi",
        "label": "Kupa rengi",
        "field_type": "single_choice",
        "is_required": True,
        "sort_order": 0,
        "options": [{"value": "white", "label": "Beyaz"}],
        "validation_config": {},
        "value": "white",
        "source_message_id": 940,
        "completed": True,
    }


def _quantity_request() -> dict[str, Any]:
    return {
        "id": 51,
        "seller_id": 11,
        "customer_id": 22,
        "order_id": None,
        "issue_type": "QUANTITY_LIMIT_REQUEST",
        "external_order_number_snapshot": None,
        "product_name_snapshot": "Kişiye Özel Kupa",
        "reason_text": "50 adet istiyorum",
        "requested_quantity": 50,
        "min_quantity_snapshot": 100,
        "max_quantity_snapshot": 500,
        "quantity_limit_direction": "below_min",
        "image_requirement_snapshot": "NOT_REQUESTED",
        "status": "SELLER_REVIEW_REQUIRED",
        "review_reason_code": "quantity_limit_request",
        "review_note": "50 adet, minimum 100 sınırının altında.",
        "created_from_message_id": 1001,
        "last_source_message_id": 1001,
        "version": 2,
        "created_at": "2026-08-10T13:00:00+00:00",
        "updated_at": "2026-08-10T13:01:00+00:00",
        "review_required_at": "2026-08-10T13:01:00+00:00",
        "handled_at": None,
        "handled_by_profile_id": None,
        "seller_note": None,
    }


def test_orders_shared_contract_matches_backend_routes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract = _load_contract()["orders"]
    context = SimpleNamespace(seller_id=11)

    monkeypatch.setattr(
        protected_routes,
        "list_seller_orders",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "orders": [_order_record()],
        },
    )

    list_response = protected_routes.seller_orders(
        view="all",
        status_filter=None,
        product_id=None,
        image_missing=None,
        customer_id=None,
        external_order_number=None,
        limit=20,
        offset=0,
        context=context,
    )
    assert list_response == contract["list_response"]

    monkeypatch.setattr(
        protected_routes,
        "get_order_with_fields",
        lambda seller_id, order_id: {
            "durum": "başarılı",
            "order": _order_record(),
            "fields": [_order_field()],
        },
    )

    detail_response = protected_routes.seller_order_detail(41, context=context)
    assert detail_response == contract["detail_response"]


def test_returns_shared_contract_matches_backend_service_and_routes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract = _load_contract()["returns"]
    context = SimpleNamespace(seller_id=11)

    monkeypatch.setattr(
        return_issue_service,
        "list_return_issue_requests",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "requests": [_quantity_request()],
        },
    )
    monkeypatch.setattr(
        return_issue_service,
        "get_customers_by_ids",
        lambda seller_id, customer_ids: {
            "durum": "başarılı",
            "customers": [
                {
                    "id": 22,
                    "seller_id": 11,
                    "whatsapp_number": "+905321112233",
                    "name": "Elif Yılmaz",
                }
            ],
        },
    )

    list_response = protected_routes.seller_return_issue_requests(
        view="action_required",
        customer_id=None,
        issue_type=None,
        external_order_number=None,
        limit=20,
        offset=0,
        context=context,
    )
    assert list_response == contract["list_response"]

    monkeypatch.setattr(
        return_issue_service,
        "get_return_issue_request_detail",
        lambda seller_id, request_id: {
            "durum": "başarılı",
            "request": _quantity_request(),
            "customer": {
                "id": 22,
                "seller_id": 11,
                "whatsapp_number": "+905321112233",
                "name": "Elif Yılmaz",
            },
            "order": None,
            "evidence": [],
        },
    )

    detail_response = protected_routes.seller_return_issue_request_detail(
        51,
        context=context,
    )
    assert detail_response == contract["detail_response"]
