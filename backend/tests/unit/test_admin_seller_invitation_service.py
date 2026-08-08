from __future__ import annotations

from unittest.mock import patch

from seller_invitation_service import (
    AdminSellerInvitationRequest,
    invite_seller_from_application,
)


AUTH_USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_AUTH_USER_ID = "22222222-2222-2222-2222-222222222222"


def _application(**overrides):
    data = {
        "id": 7,
        "full_name": "Ayşe Kaya",
        "email": "seller@example.com",
        "phone": "+905551234567",
        "store_name": "Alya Atölye",
        "store_link": "https://example.com",
        "status": "pending",
        "approved_seller_id": None,
    }
    data.update(overrides)
    return data


def _finalized(profile_auth_user_id: str = AUTH_USER_ID):
    return {
        "durum": "başarılı",
        "application": {
            "id": 7,
            "status": "approved",
            "email": "seller@example.com",
            "approved_seller_id": 51,
        },
        "seller": {
            "id": 51,
            "email": "seller@example.com",
            "system_status": "onboarding",
            "onboarding_status": "in_progress",
        },
        "profile": {
            "id": 8,
            "auth_user_id": profile_auth_user_id,
            "email": "seller@example.com",
            "full_name": "Ayşe Kaya",
            "role": "seller",
            "status": "invited",
            "seller_id": 51,
        },
    }


def test_invite_application_success_uses_application_email_and_hides_auth_id() -> None:
    request = AdminSellerInvitationRequest(admin_note="Uygun bulundu")

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            return_value={"durum": "başarılı", "application": _application()},
        ),
        patch(
            "seller_invitation_service.create_seller_invite_auth_user",
            return_value={"durum": "başarılı", "auth_user_id": AUTH_USER_ID},
        ) as invite_mock,
        patch(
            "seller_invitation_service.finalize_seller_invitation_from_application",
            return_value=_finalized(),
        ) as finalize_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is True
    assert result["status"] == "invited"
    assert result["already_processed"] is False
    assert result["invitation_sent"] is True
    assert "auth_user_id" not in result["profile"]
    invite_mock.assert_called_once_with(
        "seller@example.com",
        "Ayşe Kaya",
        application_id=7,
        redirect_to=None,
    )
    finalize_mock.assert_called_once_with(
        application_id=7,
        auth_user_id=AUTH_USER_ID,
        invite_email="seller@example.com",
        admin_note="Uygun bulundu",
    )


def test_invite_application_admin_email_overrides_missing_application_email() -> None:
    request = AdminSellerInvitationRequest(email=" NEW@EXAMPLE.COM ")

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            return_value={
                "durum": "başarılı",
                "application": _application(email=None),
            },
        ),
        patch(
            "seller_invitation_service.create_seller_invite_auth_user",
            return_value={"durum": "başarılı", "auth_user_id": AUTH_USER_ID},
        ) as invite_mock,
        patch(
            "seller_invitation_service.finalize_seller_invitation_from_application",
            return_value=_finalized(),
        ) as finalize_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is True
    invite_mock.assert_called_once_with(
        "new@example.com",
        "Ayşe Kaya",
        application_id=7,
        redirect_to=None,
    )
    assert finalize_mock.call_args.kwargs["invite_email"] == "new@example.com"


def test_invite_application_requires_email_before_auth_call() -> None:
    request = AdminSellerInvitationRequest()

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            return_value={
                "durum": "başarılı",
                "application": _application(email=None),
            },
        ),
        patch("seller_invitation_service.create_seller_invite_auth_user") as invite_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is False
    assert result["kind"] == "validation"
    assert result["error"]["code"] == "seller_invitation_email_required"
    invite_mock.assert_not_called()


def test_invite_application_rejects_closed_application_before_auth_call() -> None:
    request = AdminSellerInvitationRequest()

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            return_value={
                "durum": "başarılı",
                "application": _application(status="rejected"),
            },
        ),
        patch("seller_invitation_service.create_seller_invite_auth_user") as invite_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is False
    assert result["kind"] == "conflict"
    invite_mock.assert_not_called()


def test_invite_application_is_idempotent_when_already_approved() -> None:
    request = AdminSellerInvitationRequest()
    approved = _application(status="approved", approved_seller_id=51)

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            return_value={"durum": "başarılı", "application": approved},
        ),
        patch(
            "seller_invitation_service.get_seller_by_id",
            return_value={"durum": "başarılı", "satıcı": {"id": 51}},
        ),
        patch(
            "seller_invitation_service.get_user_profile_by_seller_id",
            return_value={
                "durum": "başarılı",
                "profile": {
                    "id": 8,
                    "auth_user_id": AUTH_USER_ID,
                    "seller_id": 51,
                    "status": "invited",
                },
            },
        ),
        patch("seller_invitation_service.create_seller_invite_auth_user") as invite_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is True
    assert result["status"] == "already_invited"
    assert result["already_processed"] is True
    assert result["invitation_sent"] is False
    assert "auth_user_id" not in result["profile"]
    invite_mock.assert_not_called()


def test_auth_conflict_does_not_touch_database_finalize() -> None:
    request = AdminSellerInvitationRequest()

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            return_value={"durum": "başarılı", "application": _application()},
        ),
        patch(
            "seller_invitation_service.create_seller_invite_auth_user",
            return_value={"durum": "çakışma", "mesaj": "exists"},
        ),
        patch("seller_invitation_service.finalize_seller_invitation_from_application") as finalize_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is False
    assert result["kind"] == "conflict"
    finalize_mock.assert_not_called()


def test_finalize_conflict_cleans_new_auth_user() -> None:
    request = AdminSellerInvitationRequest()

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            return_value={"durum": "başarılı", "application": _application()},
        ),
        patch(
            "seller_invitation_service.create_seller_invite_auth_user",
            return_value={"durum": "başarılı", "auth_user_id": AUTH_USER_ID},
        ),
        patch(
            "seller_invitation_service.finalize_seller_invitation_from_application",
            return_value={"durum": "çakışma", "mesaj": "race"},
        ),
        patch(
            "seller_invitation_service.delete_invited_auth_user",
            return_value={"durum": "başarılı"},
        ) as cleanup_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is False
    assert result["kind"] == "conflict"
    cleanup_mock.assert_called_once_with(AUTH_USER_ID)


def test_finalize_failure_with_cleanup_failure_surfaces_partial_failure() -> None:
    request = AdminSellerInvitationRequest()

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            side_effect=[
                {"durum": "başarılı", "application": _application()},
                {"durum": "başarılı", "application": _application()},
            ],
        ),
        patch(
            "seller_invitation_service.create_seller_invite_auth_user",
            return_value={"durum": "başarılı", "auth_user_id": AUTH_USER_ID},
        ),
        patch(
            "seller_invitation_service.finalize_seller_invitation_from_application",
            return_value={"durum": "hata", "mesaj": "timeout"},
        ),
        patch(
            "seller_invitation_service.delete_invited_auth_user",
            return_value={"durum": "hata"},
        ),
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is False
    assert result["kind"] == "partial_failure"
    assert result["error"]["code"] == "seller_invitation_partial_failure"


def test_finalize_network_ambiguity_reconciles_same_auth_user_as_success() -> None:
    request = AdminSellerInvitationRequest()
    approved = _application(status="approved", approved_seller_id=51)

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            side_effect=[
                {"durum": "başarılı", "application": _application()},
                {"durum": "başarılı", "application": approved},
            ],
        ),
        patch(
            "seller_invitation_service.create_seller_invite_auth_user",
            return_value={"durum": "başarılı", "auth_user_id": AUTH_USER_ID},
        ),
        patch(
            "seller_invitation_service.finalize_seller_invitation_from_application",
            return_value={"durum": "hata", "mesaj": "timeout"},
        ),
        patch(
            "seller_invitation_service.get_seller_by_id",
            return_value={"durum": "başarılı", "satıcı": {"id": 51}},
        ),
        patch(
            "seller_invitation_service.get_user_profile_by_seller_id",
            return_value={
                "durum": "başarılı",
                "profile": {
                    "id": 8,
                    "auth_user_id": AUTH_USER_ID,
                    "seller_id": 51,
                    "status": "invited",
                },
            },
        ),
        patch("seller_invitation_service.delete_invited_auth_user") as cleanup_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is True
    assert result["status"] == "invited"
    assert result["already_processed"] is False
    assert result["invitation_sent"] is True
    cleanup_mock.assert_not_called()


def test_rpc_already_invited_with_different_auth_user_cleans_extra_user() -> None:
    request = AdminSellerInvitationRequest()
    finalized = _finalized(profile_auth_user_id=OTHER_AUTH_USER_ID)
    finalized["durum"] = "zaten_davet_edildi"

    with (
        patch(
            "seller_invitation_service.get_seller_application_by_id",
            return_value={"durum": "başarılı", "application": _application()},
        ),
        patch(
            "seller_invitation_service.create_seller_invite_auth_user",
            return_value={"durum": "başarılı", "auth_user_id": AUTH_USER_ID},
        ),
        patch(
            "seller_invitation_service.finalize_seller_invitation_from_application",
            return_value=finalized,
        ),
        patch(
            "seller_invitation_service.delete_invited_auth_user",
            return_value={"durum": "başarılı"},
        ) as cleanup_mock,
    ):
        result = invite_seller_from_application(7, request)

    assert result["ok"] is True
    assert result["already_processed"] is True
    assert result["invitation_sent"] is False
    cleanup_mock.assert_called_once_with(AUTH_USER_ID)
