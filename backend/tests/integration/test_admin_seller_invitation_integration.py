from __future__ import annotations

from uuid import uuid4

import pytest

from database import finalize_seller_invitation_from_application, get_supabase


pytestmark = pytest.mark.integration_v2


def _auth_user_id(response) -> str:
    user = getattr(response, "user", None)
    user_id = getattr(user, "id", None)
    if user_id:
        return str(user_id)
    if isinstance(response, dict):
        candidate = response.get("user") or response
        if isinstance(candidate, dict) and candidate.get("id"):
            return str(candidate["id"])
    raise AssertionError("Temporary Auth user id could not be resolved.")


def test_admin_seller_invitation_rpc_is_atomic_and_idempotent(
    integration_guard: str,
) -> None:
    client = get_supabase()
    suffix = uuid4().hex[:12]
    phone_suffix = f"{uuid4().int % 100000000:08d}"
    email = f"integration-invite-{suffix}@example.invalid"
    application_id: int | None = None
    seller_id: int | None = None
    auth_user_id: str | None = None

    try:
        application_response = (
            client.table("seller_applications")
            .insert(
                {
                    "full_name": "Integration Invite Seller",
                    "email": email,
                    "phone": f"+9099{phone_suffix}",
                    "store_name": f"Integration Invite {suffix}",
                    "status": "pending",
                }
            )
            .execute()
        )
        application_id = int(application_response.data[0]["id"])

        # create_user does not send the real seller invitation email. This live
        # integration test validates only the DB finalization contract.
        auth_response = client.auth.admin.create_user(
            {
                "email": email,
                "email_confirm": False,
                "user_metadata": {
                    "integration_v2": True,
                    "purpose": "admin_seller_invitation_rpc",
                },
            }
        )
        auth_user_id = _auth_user_id(auth_response)

        result = finalize_seller_invitation_from_application(
            application_id=application_id,
            auth_user_id=auth_user_id,
            invite_email=email,
            admin_note="integration-v2",
        )
        assert result["durum"] == "başarılı"
        seller_id = int(result["seller"]["id"])
        assert result["application"]["status"] == "approved"
        assert int(result["application"]["approved_seller_id"]) == seller_id
        assert result["profile"]["status"] == "invited"
        assert int(result["profile"]["seller_id"]) == seller_id
        assert result["seller"]["system_status"] == "onboarding"
        assert result["seller"]["onboarding_status"] == "in_progress"
        assert result["seller"]["onboarding_completed"] is False
        assert result["seller"]["ai_enabled"] is False

        steps = (
            client.table("seller_onboarding_steps")
            .select("id,step_order,status")
            .eq("seller_id", seller_id)
            .order("step_order")
            .execute()
        )
        assert len(steps.data or []) == 10
        assert steps.data[0]["status"] == "available"
        assert all(row["status"] == "locked" for row in steps.data[1:])

        repeat = finalize_seller_invitation_from_application(
            application_id=application_id,
            auth_user_id=auth_user_id,
            invite_email=email,
            admin_note="integration-v2-repeat",
        )
        assert repeat["durum"] == "zaten_davet_edildi"
        assert int(repeat["seller"]["id"]) == seller_id

        seller_count = (
            client.table("sellers")
            .select("id", count="exact")
            .eq("email", email)
            .execute()
        )
        count = getattr(seller_count, "count", None)
        assert int(count if count is not None else len(seller_count.data or [])) == 1

    finally:
        cleanup_failures: list[str] = []

        if application_id is not None:
            try:
                current = (
                    client.table("seller_applications")
                    .select("approved_seller_id")
                    .eq("id", application_id)
                    .limit(1)
                    .execute()
                )
                if current.data and current.data[0].get("approved_seller_id"):
                    seller_id = int(current.data[0]["approved_seller_id"])
            except Exception as exc:
                cleanup_failures.append(f"application lookup: {exc}")

            try:
                client.table("seller_applications").delete().eq(
                    "id", application_id
                ).execute()
            except Exception as exc:
                cleanup_failures.append(f"seller_applications[{application_id}]: {exc}")

        if seller_id is not None:
            try:
                client.table("sellers").delete().eq("id", seller_id).execute()
            except Exception as exc:
                cleanup_failures.append(f"sellers[{seller_id}]: {exc}")

        if auth_user_id is not None:
            try:
                client.auth.admin.delete_user(auth_user_id)
            except Exception as exc:
                cleanup_failures.append(f"auth.users[{auth_user_id}]: {exc}")

        if cleanup_failures:
            pytest.fail(
                "Admin invitation integration cleanup failed: "
                + " ; ".join(cleanup_failures)
            )
