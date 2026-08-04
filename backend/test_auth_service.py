from __future__ import annotations

from unittest.mock import patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import auth_service
from auth_service import (
    AuthContext,
    _extract_access_token,
    require_admin,
    require_seller,
    resolve_auth_context,
)


def test_token_extraction() -> None:
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="test-token",
    )

    assert _extract_access_token(credentials) == "test-token"

    try:
        _extract_access_token(None)
        raise AssertionError("Eksik token reddedilmeliydi.")
    except HTTPException as exc:
        assert exc.status_code == 401


def test_admin_context_resolution() -> None:
    with (
        patch.object(
            auth_service,
            "verify_access_token",
            return_value={
                "durum": "başarılı",
                "claims": {
                    "sub": "11111111-1111-1111-1111-111111111111",
                    "email": "admin@example.com",
                },
            },
        ),
        patch.object(
            auth_service,
            "get_user_profile_by_auth_user_id",
            return_value={
                "durum": "başarılı",
                "profile": {
                    "id": 1,
                    "auth_user_id": (
                        "11111111-1111-1111-1111-111111111111"
                    ),
                    "email": "admin@example.com",
                    "full_name": "Test Admin",
                    "role": "admin",
                    "status": "active",
                    "seller_id": None,
                },
            },
        ),
    ):
        context = resolve_auth_context("valid-admin-token")

    assert context.is_admin is True
    assert context.is_seller is False
    assert context.seller_id is None

    assert require_admin(context) is context

    try:
        require_seller(context)
        raise AssertionError("Admin seller endpointine girememeliydi.")
    except HTTPException as exc:
        assert exc.status_code == 403


def test_seller_context_resolution() -> None:
    with (
        patch.object(
            auth_service,
            "verify_access_token",
            return_value={
                "durum": "başarılı",
                "claims": {
                    "sub": "22222222-2222-2222-2222-222222222222",
                    "email": "seller@example.com",
                },
            },
        ),
        patch.object(
            auth_service,
            "get_user_profile_by_auth_user_id",
            return_value={
                "durum": "başarılı",
                "profile": {
                    "id": 2,
                    "auth_user_id": (
                        "22222222-2222-2222-2222-222222222222"
                    ),
                    "email": "seller@example.com",
                    "full_name": "Test Satıcı",
                    "role": "seller",
                    "status": "active",
                    "seller_id": 42,
                },
            },
        ),
    ):
        context = resolve_auth_context("valid-seller-token")

    assert context.is_seller is True
    assert context.is_admin is False
    assert context.seller_id == 42

    assert require_seller(context) is context

    try:
        require_admin(context)
        raise AssertionError("Satıcı admin endpointine girememeliydi.")
    except HTTPException as exc:
        assert exc.status_code == 403


def test_invalid_token_rejected() -> None:
    with patch.object(
        auth_service,
        "verify_access_token",
        return_value={
            "durum": "geçersiz",
            "mesaj": "invalid token",
        },
    ):
        try:
            resolve_auth_context("invalid-token")
            raise AssertionError("Geçersiz token reddedilmeliydi.")
        except HTTPException as exc:
            assert exc.status_code == 401


def test_missing_profile_rejected() -> None:
    with (
        patch.object(
            auth_service,
            "verify_access_token",
            return_value={
                "durum": "başarılı",
                "claims": {
                    "sub": "33333333-3333-3333-3333-333333333333",
                },
            },
        ),
        patch.object(
            auth_service,
            "get_user_profile_by_auth_user_id",
            return_value={
                "durum": "bulunamadı",
                "mesaj": "Profil yok.",
            },
        ),
    ):
        try:
            resolve_auth_context("valid-token-without-profile")
            raise AssertionError("Profilsiz kullanıcı reddedilmeliydi.")
        except HTTPException as exc:
            assert exc.status_code == 403


def test_inactive_profile_rejected() -> None:
    with (
        patch.object(
            auth_service,
            "verify_access_token",
            return_value={
                "durum": "başarılı",
                "claims": {
                    "sub": "44444444-4444-4444-4444-444444444444",
                },
            },
        ),
        patch.object(
            auth_service,
            "get_user_profile_by_auth_user_id",
            return_value={
                "durum": "başarılı",
                "profile": {
                    "id": 4,
                    "role": "seller",
                    "status": "suspended",
                    "seller_id": 42,
                },
            },
        ),
    ):
        try:
            resolve_auth_context("suspended-token")
            raise AssertionError("Askıdaki kullanıcı reddedilmeliydi.")
        except HTTPException as exc:
            assert exc.status_code == 403


def test_seller_id_is_profile_derived() -> None:
    context = AuthContext(
        auth_user_id="55555555-5555-5555-5555-555555555555",
        email="seller@example.com",
        role="seller",
        profile_status="active",
        seller_id=77,
        profile={
            "id": 5,
            "seller_id": 77,
        },
        claims={
            "sub": "55555555-5555-5555-5555-555555555555",
        },
    )

    resolved = require_seller(context)

    assert resolved.seller_id == 77


def run_all_tests() -> None:
    tests = [
        test_token_extraction,
        test_admin_context_resolution,
        test_seller_context_resolution,
        test_invalid_token_rejected,
        test_missing_profile_rejected,
        test_inactive_profile_rejected,
        test_seller_id_is_profile_derived,
    ]

    for test in tests:
        test()
        print(f"BAŞARILI: {test.__name__}")

    print("\nTÜM AUTH SERVICE TESTLERİ BAŞARILI")


if __name__ == "__main__":
    run_all_tests()
