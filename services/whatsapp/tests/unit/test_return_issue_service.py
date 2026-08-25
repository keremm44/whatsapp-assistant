from __future__ import annotations

from typing import Any

import pytest

import return_issue_service as service


def request_record(
    *,
    request_id: int = 41,
    status: str = "COLLECTING",
    issue_type: str = "DAMAGED_ITEM",
    order_id: int | None = None,
    external_order_number: str | None = None,
    reason_text: str | None = None,
    image_requirement: str = "OPTIONAL",
    version: int = 1,
) -> dict[str, Any]:
    return {
        "id": request_id,
        "seller_id": 11,
        "customer_id": 22,
        "order_id": order_id,
        "issue_type": issue_type,
        "external_order_number_snapshot": external_order_number,
        "product_name_snapshot": "Kupa" if order_id else None,
        "reason_text": reason_text,
        "image_requirement_snapshot": image_requirement,
        "status": status,
        "review_reason_code": None,
        "review_note": None,
        "created_from_message_id": 101,
        "last_source_message_id": 101,
        "version": version,
        "created_at": "2026-08-07T10:00:00+00:00",
        "updated_at": "2026-08-07T10:00:00+00:00",
        "review_required_at": None,
        "handled_at": None,
        "handled_by_profile_id": None,
        "seller_note": None,
    }


def detail(
    request: dict[str, Any],
    *,
    evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "durum": "başarılı",
        "request": request,
        "customer": {"id": 22, "seller_id": 11, "whatsapp_number": "+90555"},
        "order": None,
        "evidence": evidence or [],
    }


@pytest.mark.parametrize(
    ("intent", "message", "expected"),
    [
        ("complaint", "Ürün kırık geldi", "DAMAGED_ITEM"),
        ("complaint", "Yanlış ürün geldi", "WRONG_ITEM"),
        ("complaint", "Baskı hatalı olmuş", "PRINT_OR_PERSONALIZATION_ISSUE"),
        ("complaint", "Kargom gelmedi", "DELIVERY_ISSUE"),
        ("return_request", "İade etmek istiyorum", "RETURN_REQUEST"),
        ("complaint", "Ürünle ilgili başka bir sorun var", "OTHER_ORDER_ISSUE"),
    ],
)
def test_classify_issue_type(intent: str, message: str, expected: str) -> None:
    assert service.classify_issue_type(intent, message) == expected


def test_initial_reason_candidate_does_not_treat_generic_return_as_reason() -> None:
    assert service.initial_reason_candidate("RETURN_REQUEST", "İade etmek istiyorum") is None
    assert service.initial_reason_candidate("RETURN_REQUEST", "İade istiyorum çünkü baskı soluk") == (
        "İade istiyorum çünkü baskı soluk"
    )
    assert service.initial_reason_candidate("DAMAGED_ITEM", "Ürün kırık geldi") == "Ürün kırık geldi"


def test_extract_explicit_order_number() -> None:
    assert service.extract_explicit_order_number("Sipariş no: TR-123") == "TR-123"
    assert service.extract_explicit_order_number("#ABC_99 ürün kırık") == "ABC_99"
    assert service.extract_explicit_order_number("ürün kırık geldi") is None


def test_parse_order_number_answer_accepts_explicit_or_safe_standalone_token() -> None:
    assert service.parse_order_number_answer("Sipariş no: TR-123") == "TR-123"
    assert service.parse_order_number_answer("TR999") == "TR999"
    assert service.parse_order_number_answer("1234567") == "1234567"
    assert service.parse_order_number_answer("ETSY/123-45") == "ETSY/123-45"


def test_parse_order_number_answer_rejects_free_text_and_non_numeric_token() -> None:
    assert service.parse_order_number_answer("Ürün hâlâ kırık geldi") is None
    assert service.parse_order_number_answer("iade istiyorum") is None
    assert service.parse_order_number_answer("MERHABA") is None


def test_urgent_issue_detection_is_narrow() -> None:
    assert service.is_urgent_issue_message("Kırık parça yüzünden yaralandım") is True
    assert service.is_urgent_issue_message("Kupa kırık geldi") is False


def test_missing_fields_order_reason_required_image() -> None:
    request = request_record(image_requirement="REQUIRED")
    state = service._missing_fields(detail(request))
    assert state == ["order_number", "reason", "image"]


def test_missing_fields_optional_image_does_not_block() -> None:
    request = request_record(
        order_id=7,
        external_order_number="TR123",
        reason_text="Kırık geldi",
        image_requirement="OPTIONAL",
    )
    assert service._missing_fields(detail(request)) == []


def test_missing_fields_required_image_is_satisfied_by_safe_evidence() -> None:
    request = request_record(
        order_id=7,
        external_order_number="TR123",
        reason_text="Kırık geldi",
        image_requirement="REQUIRED",
    )
    assert service._missing_fields(detail(request, evidence=[{"message_id": 103}])) == []


def test_build_collection_question_is_deterministic() -> None:
    assert service.build_collection_question("order_number") == "Sipariş numaranızı paylaşır mısınız?"
    assert service.build_collection_question("reason") == "Sorunu kısaca anlatır mısınız?"
    assert service.build_collection_question("image") == "İnceleme için ürünün fotoğrafını gönderebilir misiniz?"


def test_resolve_order_candidate_only_links_single_result(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "list_orders",
        lambda *args, **kwargs: {"durum": "başarılı", "orders": [{"id": 7}]},
    )
    assert service._resolve_order_candidate(11, 22)["order"] == {"id": 7}

    monkeypatch.setattr(
        service,
        "list_orders",
        lambda *args, **kwargs: {"durum": "başarılı", "orders": [{"id": 7}, {"id": 8}]},
    )
    assert service._resolve_order_candidate(11, 22)["order"] is None


def test_new_request_does_not_reinterpret_initial_complaint_as_order_number(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = request_record(reason_text="Ürün kırık geldi")
    calls: list[tuple[str, Any]] = []

    monkeypatch.setattr(
        service,
        "get_active_return_issue_request",
        lambda seller_id, customer_id: {"durum": "başarılı", "request": None},
    )
    monkeypatch.setattr(
        service,
        "list_orders",
        lambda *args, **kwargs: {"durum": "başarılı", "orders": [{"id": 7}, {"id": 8}]},
    )
    monkeypatch.setattr(
        service,
        "create_or_get_return_issue_request",
        lambda *args, **kwargs: {"durum": "başarılı", "request": request, "created": True},
    )
    monkeypatch.setattr(
        service,
        "get_return_issue_request_detail",
        lambda seller_id, request_id: detail(request),
    )
    monkeypatch.setattr(
        service,
        "update_return_issue_request_from_message",
        lambda *args, **kwargs: calls.append(("update", kwargs)) or {"durum": "başarılı"},
    )

    result = service.process_customer_issue_message(
        seller_id=11,
        customer_id=22,
        source_message_id=101,
        message_text="Ürün kırık geldi",
        message_type="text",
        intent="complaint",
        starting_control_version=3,
    )

    assert result["durum"] == "başarılı"
    assert result["state"] == "collecting"
    assert result["awaiting"] == "order_number"
    assert calls == []


def test_new_request_with_single_order_and_reason_goes_to_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = request_record(
        order_id=7,
        external_order_number="TR123",
        reason_text="Ürün kırık geldi",
        image_requirement="OPTIONAL",
    )
    review_request = {**request, "status": "SELLER_REVIEW_REQUIRED", "version": 2}

    monkeypatch.setattr(
        service,
        "get_active_return_issue_request",
        lambda *_: {"durum": "başarılı", "request": None},
    )
    monkeypatch.setattr(
        service,
        "list_orders",
        lambda *args, **kwargs: {"durum": "başarılı", "orders": [{"id": 7}]},
    )
    monkeypatch.setattr(
        service,
        "create_or_get_return_issue_request",
        lambda *args, **kwargs: {"durum": "başarılı", "request": request, "created": True},
    )
    monkeypatch.setattr(
        service,
        "get_return_issue_request_detail",
        lambda *_: detail(request),
    )
    monkeypatch.setattr(
        service,
        "mark_return_issue_review_required",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "request": review_request,
            "notification_created": True,
        },
    )
    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **kwargs: {
            "durum": "başarılı",
            "changed": True,
            "control": {"control_state": "RETURN_REVIEW", "control_version": 4},
        },
    )

    result = service.process_customer_issue_message(
        seller_id=11,
        customer_id=22,
        source_message_id=101,
        message_text="Ürün kırık geldi",
        message_type="text",
        intent="complaint",
        starting_control_version=3,
    )

    assert result["state"] == "seller_review_required"
    assert result["outgoing_allowed"] is False
    assert result["notification_created"] is True


def test_required_image_keeps_request_collecting(monkeypatch: pytest.MonkeyPatch) -> None:
    request = request_record(
        order_id=7,
        external_order_number="TR123",
        reason_text="Kırık geldi",
        image_requirement="REQUIRED",
    )
    monkeypatch.setattr(service, "get_return_issue_request_detail", lambda *_: detail(request))

    state = service.get_request_collection_state(11, 41)

    assert state["ready_for_review"] is False
    assert state["awaiting"] == "image"
    assert state["question"].startswith("İnceleme için")


def test_existing_order_number_answer_persists_and_asks_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    initial = request_record()
    updated = request_record(external_order_number="TR999")
    details = iter([detail(initial), detail(updated)])
    update_calls: list[dict[str, Any]] = []

    monkeypatch.setattr(service, "get_return_issue_request_detail", lambda *_: next(details))
    monkeypatch.setattr(
        service,
        "list_orders",
        lambda *args, **kwargs: {"durum": "başarılı", "orders": []},
    )
    monkeypatch.setattr(
        service,
        "update_return_issue_request_from_message",
        lambda *args, **kwargs: update_calls.append(kwargs) or {
            "durum": "başarılı",
            "request": updated,
        },
    )

    result = service._collect_into_request(
        seller_id=11,
        customer_id=22,
        request=initial,
        source_message_id=102,
        message_text="TR999",
        message_type="text",
        starting_control_version=3,
        urgent=False,
    )

    assert update_calls[0]["external_order_number"] == "TR999"
    assert result["awaiting"] == "reason"


def test_existing_reason_answer_persists(monkeypatch: pytest.MonkeyPatch) -> None:
    initial = request_record(external_order_number="TR999")
    updated = request_record(external_order_number="TR999", reason_text="Baskı silik")
    details = iter([detail(initial), detail(updated)])

    monkeypatch.setattr(service, "get_return_issue_request_detail", lambda *_: next(details))
    monkeypatch.setattr(
        service,
        "update_return_issue_request_from_message",
        lambda *args, **kwargs: {"durum": "başarılı", "request": updated},
    )
    monkeypatch.setattr(
        service,
        "mark_return_issue_review_required",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "request": {**updated, "status": "SELLER_REVIEW_REQUIRED"},
            "notification_created": True,
        },
    )
    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **kwargs: {"durum": "başarılı", "changed": True, "control": {}},
    )

    result = service._collect_into_request(
        seller_id=11,
        customer_id=22,
        request=initial,
        source_message_id=102,
        message_text="Baskı silik",
        message_type="text",
        starting_control_version=3,
        urgent=False,
    )

    assert result["state"] == "seller_review_required"


def test_required_image_text_answer_does_not_advance(monkeypatch: pytest.MonkeyPatch) -> None:
    request = request_record(
        external_order_number="TR123",
        reason_text="Kırık",
        image_requirement="REQUIRED",
    )
    monkeypatch.setattr(service, "get_return_issue_request_detail", lambda *_: detail(request))

    result = service._collect_into_request(
        seller_id=11,
        customer_id=22,
        request=request,
        source_message_id=103,
        message_text="fotoğraf linki https://example.com/x.jpg",
        message_type="text",
        starting_control_version=3,
        urgent=False,
    )

    assert result["state"] == "collecting"
    assert result["awaiting"] == "image"
    assert result["validation_error"] == "Bu adım için görsel gereklidir."


def test_required_image_message_is_saved_as_evidence_and_completes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = request_record(
        external_order_number="TR123",
        reason_text="Kırık",
        image_requirement="REQUIRED",
    )
    initial_detail = detail(request)
    final_detail = detail(request, evidence=[{"message_id": 103}])
    details = iter([initial_detail, final_detail])
    evidence_calls: list[int] = []

    monkeypatch.setattr(service, "get_return_issue_request_detail", lambda *_: next(details))
    monkeypatch.setattr(
        service,
        "add_return_issue_request_evidence",
        lambda seller_id, customer_id, request_id, source_message_id: (
            evidence_calls.append(source_message_id)
            or {"durum": "başarılı", "changed": True, "request": request}
        ),
    )
    monkeypatch.setattr(
        service,
        "mark_return_issue_review_required",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "request": {**request, "status": "SELLER_REVIEW_REQUIRED"},
            "notification_created": True,
        },
    )
    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **kwargs: {"durum": "başarılı", "changed": True, "control": {}},
    )

    result = service._collect_into_request(
        seller_id=11,
        customer_id=22,
        request=request,
        source_message_id=103,
        message_text="",
        message_type="image",
        starting_control_version=3,
        urgent=False,
    )

    assert evidence_calls == [103]
    assert result["state"] == "seller_review_required"


def test_urgent_issue_forces_review_without_collection(monkeypatch: pytest.MonkeyPatch) -> None:
    request = request_record()
    monkeypatch.setattr(service, "get_return_issue_request_detail", lambda *_: detail(request))
    review_calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        service,
        "mark_return_issue_review_required",
        lambda *args, **kwargs: review_calls.append(kwargs) or {
            "durum": "başarılı",
            "request": {**request, "status": "SELLER_REVIEW_REQUIRED"},
            "notification_created": True,
        },
    )
    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **kwargs: {"durum": "başarılı", "changed": True, "control": {}},
    )

    result = service._collect_into_request(
        seller_id=11,
        customer_id=22,
        request=request,
        source_message_id=102,
        message_text="Kırık parça yüzünden yaralandım",
        message_type="text",
        starting_control_version=3,
        urgent=True,
    )

    assert review_calls[0]["force_review"] is True
    assert review_calls[0]["review_reason_code"] == "urgent_customer_issue"
    assert result["outgoing_allowed"] is False


def test_review_transition_failure_is_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    request = request_record(
        external_order_number="TR123",
        reason_text="Kırık",
    )
    review = {**request, "status": "SELLER_REVIEW_REQUIRED", "version": 2}
    monkeypatch.setattr(
        service,
        "mark_return_issue_review_required",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "request": review,
            "notification_created": True,
        },
    )
    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **kwargs: {"durum": "çakışma"},
    )

    result = service._finalize_review(
        seller_id=11,
        customer_id=22,
        request_id=41,
        source_message_id=103,
        starting_control_version=3,
        force_review=False,
    )

    assert result["durum"] == "hata"
    assert result["fail_closed"] is True
    assert result["outgoing_allowed"] is False
    assert result["request"]["status"] == "SELLER_REVIEW_REQUIRED"


def test_existing_review_request_retries_control_transition(monkeypatch: pytest.MonkeyPatch) -> None:
    request = request_record(status="SELLER_REVIEW_REQUIRED", version=4)
    review_calls: list[int] = []
    monkeypatch.setattr(
        service,
        "mark_return_issue_review_required",
        lambda *args, **kwargs: review_calls.append(1) or {
            "durum": "başarılı",
            "request": request,
            "notification_created": False,
        },
    )
    monkeypatch.setattr(
        service,
        "transition_conversation_control",
        lambda **kwargs: {"durum": "başarılı", "changed": True, "control": {}},
    )

    result = service._collect_into_request(
        seller_id=11,
        customer_id=22,
        request=request,
        source_message_id=104,
        message_text="yeniden",
        message_type="text",
        starting_control_version=3,
        urgent=False,
    )

    assert review_calls == [1]
    assert result["state"] == "seller_review_required"


def test_process_continue_requires_existing_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "get_active_return_issue_request",
        lambda *_: {"durum": "başarılı", "request": None},
    )

    result = service.process_customer_issue_message(
        seller_id=11,
        customer_id=22,
        source_message_id=101,
        message_text="TR123",
        message_type="text",
        intent="continue",
        starting_control_version=3,
    )

    assert result["kind"] == "not_found"
    assert result["fail_closed"] is True


def test_seller_settings_merge_missing_rows_with_optional_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "get_return_issue_type_settings",
        lambda seller_id: {
            "durum": "başarılı",
            "settings": [
                {
                    "issue_type": "DAMAGED_ITEM",
                    "image_requirement": "REQUIRED",
                    "version": 4,
                    "updated_at": "now",
                }
            ],
        },
    )

    result = service.get_seller_return_issue_settings(11)

    assert len(result["settings"]) == 6
    damaged = next(x for x in result["settings"] if x["issue_type"] == "DAMAGED_ITEM")
    delivery = next(x for x in result["settings"] if x["issue_type"] == "DELIVERY_ISSUE")
    assert damaged["image_requirement"] == "REQUIRED"
    assert damaged["version"] == 4
    assert delivery["image_requirement"] == "OPTIONAL"
    assert delivery["version"] == 1


def test_update_seller_setting_maps_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "update_return_issue_type_setting",
        lambda *args, **kwargs: {
            "durum": "çakışma",
            "mesaj": "stale",
            "setting": {"version": 4},
        },
    )

    result = service.update_seller_return_issue_setting(
        11, "DAMAGED_ITEM", "REQUIRED", 3
    )

    assert result["kind"] == "conflict"
    assert result["setting"]["version"] == 4


def test_mark_seller_handled_does_not_call_control(monkeypatch: pytest.MonkeyPatch) -> None:
    request = request_record(status="HANDLED", version=5)
    monkeypatch.setattr(
        service,
        "mark_return_issue_handled",
        lambda *args, **kwargs: {"durum": "başarılı", "changed": True, "request": request},
    )
    control_called = False

    def forbidden_control(**kwargs: Any) -> dict[str, Any]:
        nonlocal control_called
        control_called = True
        return {"durum": "başarılı"}

    monkeypatch.setattr(service, "transition_conversation_control", forbidden_control)

    result = service.mark_seller_return_issue_handled(11, 41, 77, 4, note="Görüşüldü")

    assert result["durum"] == "başarılı"
    assert control_called is False


def test_list_seller_requests_adds_display_and_action_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        service,
        "list_return_issue_requests",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "requests": [request_record(status="SELLER_REVIEW_REQUIRED")],
        },
    )
    monkeypatch.setattr(
        service,
        "get_customers_by_ids",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "customers": [{"id": 22, "whatsapp_number": "+90555"}],
        },
    )

    result = service.list_seller_return_issue_requests(11, view="action_required")

    row = result["requests"][0]
    assert row["display_issue_type"] == "Hasarlı ürün"
    assert row["seller_action_required"] is True
    assert row["customer_phone"] == "+90555"


def test_list_seller_requests_enriches_phones_with_one_bulk_scoped_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rows = [
        request_record(request_id=41, status="COLLECTING"),
        {**request_record(request_id=42, status="HANDLED"), "customer_id": 23},
        request_record(request_id=43, status="SELLER_REVIEW_REQUIRED"),
        {**request_record(request_id=44, status="COLLECTING"), "customer_id": 24},
    ]
    monkeypatch.setattr(
        service,
        "list_return_issue_requests",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 4,
            "requests": rows,
        },
    )

    bulk_calls: list[tuple[int, list[int]]] = []

    def fake_bulk(seller_id: int, customer_ids: list[int]) -> dict[str, Any]:
        bulk_calls.append((seller_id, list(customer_ids)))
        return {
            "durum": "başarılı",
            "customers": [
                {"id": 23, "whatsapp_number": "+905552222222"},
                {"id": 22, "whatsapp_number": "+905551111111"},
            ],
        }

    monkeypatch.setattr(service, "get_customers_by_ids", fake_bulk)

    result = service.list_seller_return_issue_requests(11, view="all", limit=20)

    assert result["durum"] == "başarılı"
    # N+1 yok: 4 satır / 3 benzersiz müşteri için tek toplu sorgu.
    assert bulk_calls == [(11, [22, 23, 24])]
    phones = [row["customer_phone"] for row in result["requests"]]
    assert phones == [
        "+905551111111",
        "+905552222222",
        "+905551111111",
        # Müşteri toplu sonuçta yoksa telefon None kalır; başka bir
        # tenant'ın numarası asla doldurulmaz.
        None,
    ]


def test_list_seller_requests_empty_page_skips_customer_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "list_return_issue_requests",
        lambda *args, **kwargs: {"durum": "başarılı", "toplam": 0, "requests": []},
    )

    bulk_called = False

    def forbidden_bulk(*args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal bulk_called
        bulk_called = True
        return {"durum": "başarılı", "customers": []}

    monkeypatch.setattr(service, "get_customers_by_ids", forbidden_bulk)

    result = service.list_seller_return_issue_requests(11, view="handled")

    assert result["durum"] == "başarılı"
    assert result["requests"] == []
    assert bulk_called is False


def test_list_seller_requests_customer_lookup_failure_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        service,
        "list_return_issue_requests",
        lambda *args, **kwargs: {
            "durum": "başarılı",
            "toplam": 1,
            "requests": [request_record()],
        },
    )
    monkeypatch.setattr(
        service,
        "get_customers_by_ids",
        lambda *args, **kwargs: {"durum": "hata", "mesaj": "db down"},
    )

    result = service.list_seller_return_issue_requests(11)

    assert result["durum"] == "hata"
    assert result["error_code"] == "return_issue_list_unavailable"
    assert result["kind"] == "unavailable"


def test_list_seller_requests_passes_external_order_number_exact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_list(seller_id: int, **kwargs: Any) -> dict[str, Any]:
        captured["seller_id"] = seller_id
        captured.update(kwargs)
        return {"durum": "başarılı", "toplam": 0, "requests": []}

    monkeypatch.setattr(service, "list_return_issue_requests", fake_list)

    result = service.list_seller_return_issue_requests(
        11,
        view="all",
        external_order_number="TR-1001",
    )

    assert result["durum"] == "başarılı"
    assert captured["seller_id"] == 11
    assert captured["external_order_number"] == "TR-1001"


def test_service_contains_no_commercial_decision_actions() -> None:
    forbidden = {"approve", "reject", "refund", "replace", "compensate"}
    public_action_names = {
        name.lower()
        for name in dir(service)
        if callable(getattr(service, name)) and not name.startswith("_")
    }
    assert forbidden.isdisjoint(public_action_names)
