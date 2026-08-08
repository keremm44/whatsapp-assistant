from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import pytest

from database import get_supabase, reset_supabase_client


WRITE_FLAG = "RUN_SUPABASE_INTEGRATION"
ALLOW_WRITES_FLAG = "INTEGRATION_ALLOW_WRITES"
EXPECTED_REF_ENV = "INTEGRATION_EXPECTED_PROJECT_REF"
_TRUE_VALUES = {"1", "true", "yes", "on", "evet"}


def _enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in _TRUE_VALUES


def _project_ref_from_url(url: str) -> str | None:
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return None
    if not host.endswith(".supabase.co"):
        return None
    return host.split(".", 1)[0] or None


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "integration_v2: controlled write tests against an explicitly selected Supabase project",
    )


@pytest.fixture(scope="session")
def integration_guard() -> str:
    if not (_enabled(WRITE_FLAG) and _enabled(ALLOW_WRITES_FLAG)):
        pytest.skip(
            "Supabase integration-v2 write tests are opt-in. "
            f"Set {WRITE_FLAG}=1 and {ALLOW_WRITES_FLAG}=1 explicitly."
        )

    expected_ref = os.getenv(EXPECTED_REF_ENV, "").strip()
    if not expected_ref:
        pytest.fail(
            f"{EXPECTED_REF_ENV} is required so tests cannot target an unknown project."
        )

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    if not supabase_url or not service_key:
        pytest.fail("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.")

    actual_ref = _project_ref_from_url(supabase_url)
    if actual_ref != expected_ref:
        pytest.fail(
            "Supabase project safety check failed: "
            f"expected={expected_ref!r}, actual={actual_ref!r}."
        )

    if os.getenv("APP_ENV", "development").strip().lower() == "production":
        pytest.fail("Integration-v2 tests refuse to run with APP_ENV=production.")

    reset_supabase_client()
    return expected_ref


def _response_user_id(response: Any) -> str:
    user = getattr(response, "user", None)
    user_id = getattr(user, "id", None)
    if user_id:
        return str(user_id)

    if isinstance(response, dict):
        candidate = response.get("user") or response
        if isinstance(candidate, dict) and candidate.get("id"):
            return str(candidate["id"])

    raise RuntimeError("Temporary Supabase Auth user id could not be resolved.")


@dataclass(slots=True)
class TenantFixture:
    seller_id: int
    profile_id: int
    auth_user_id: str
    customer_id: int
    email: str


@dataclass
class IntegrationContext:
    client: Any
    run_id: str
    provider: str
    tenants: dict[str, TenantFixture] = field(default_factory=dict)
    seller_ids: list[int] = field(default_factory=list)
    auth_user_ids: list[str] = field(default_factory=list)

    def tenant(self, name: str = "primary") -> TenantFixture:
        return self.tenants[name]

    def new_message(
        self,
        tenant_name: str = "primary",
        *,
        content: str,
        message_type: str = "text",
        direction: str = "incoming",
        customer_id: int | None = None,
    ) -> dict[str, Any]:
        tenant = self.tenant(tenant_name)
        target_customer_id = customer_id or tenant.customer_id
        provider_message_id = f"{self.provider}-{uuid4().hex}"
        payload: dict[str, Any] = {
            "seller_id": tenant.seller_id,
            "customer_id": target_customer_id,
            "direction": direction,
            "content": content,
            "message_type": message_type,
            "provider": self.provider,
            "provider_message_id": provider_message_id,
            "was_auto_replied": False,
        }
        if message_type == "image":
            payload["media_url"] = f"https://example.invalid/{provider_message_id}.jpg"

        result = self.client.table("messages").insert(payload).execute()
        assert result.data and len(result.data) == 1
        return result.data[0]

    def count_rows(
        self,
        table: str,
        *,
        seller_id: int | None = None,
        customer_id: int | None = None,
        direction: str | None = None,
    ) -> int:
        query = self.client.table(table).select("id", count="exact")
        if seller_id is not None:
            query = query.eq("seller_id", seller_id)
        if customer_id is not None:
            query = query.eq("customer_id", customer_id)
        if direction is not None:
            query = query.eq("direction", direction)
        response = query.execute()
        count = getattr(response, "count", None)
        if count is not None:
            return int(count)
        return len(response.data or [])


def _create_tenant(ctx: IntegrationContext, name: str) -> TenantFixture:
    suffix = uuid4().hex[:10]
    email = f"integration-v2-{ctx.run_id}-{name}-{suffix}@example.invalid"

    auth_response = ctx.client.auth.admin.create_user(
        {
            "email": email,
            "email_confirm": True,
            "user_metadata": {
                "integration_v2": True,
                "run_id": ctx.run_id,
                "tenant": name,
            },
        }
    )
    auth_user_id = _response_user_id(auth_response)
    ctx.auth_user_ids.append(auth_user_id)

    seller_result = (
        ctx.client.table("sellers")
        .insert(
            {
                "name": f"Integration V2 {name}",
                "email": email,
                "store_name": f"Integration V2 {ctx.run_id} {name}",
                "status": "pending",
                "system_status": "onboarding",
                "onboarding_status": "not_started",
                "onboarding_completed": False,
                "ai_enabled": False,
                "emergency_paused": False,
            }
        )
        .execute()
    )
    seller_id = int(seller_result.data[0]["id"])
    ctx.seller_ids.append(seller_id)

    profile_result = (
        ctx.client.table("user_profiles")
        .insert(
            {
                "auth_user_id": auth_user_id,
                "email": email,
                "full_name": f"Integration V2 {name}",
                "role": "seller",
                "status": "active",
                "seller_id": seller_id,
            }
        )
        .execute()
    )
    profile_id = int(profile_result.data[0]["id"])

    customer_result = (
        ctx.client.table("customers")
        .insert(
            {
                "seller_id": seller_id,
                "whatsapp_number": f"+900{seller_id}{suffix[:6]}",
                "name": f"Integration V2 customer {name}",
                "total_messages": 0,
                "is_blocked": False,
            }
        )
        .execute()
    )
    customer_id = int(customer_result.data[0]["id"])

    ctx.client.table("conversation_states").insert(
        {
            "seller_id": seller_id,
            "customer_id": customer_id,
            "current_state": "NORMAL",
            "state_type": "no_lock",
            "state_data": {},
        }
    ).execute()

    return TenantFixture(
        seller_id=seller_id,
        profile_id=profile_id,
        auth_user_id=auth_user_id,
        customer_id=customer_id,
        email=email,
    )


def _cleanup(ctx: IntegrationContext) -> list[str]:
    failures: list[str] = []

    # Delete RESTRICT-bearing domain rows before messages. All filters are scoped
    # to temporary seller ids recorded by this exact test run.
    for seller_id in list(dict.fromkeys(ctx.seller_ids)):
        for table in (
            "return_issue_requests",
            "orders",
            "unanswered_question_groups",
            "conversation_control_transitions",
            "state_transitions",
            "seller_notifications",
            "customer_violations",
            "conversation_states",
            "messages",
            "customers",
            "order_field_definitions",
            "products",
            "return_issue_type_settings",
            "user_profiles",
        ):
            try:
                ctx.client.table(table).delete().eq("seller_id", seller_id).execute()
            except Exception as exc:
                failures.append(f"{table}[seller_id={seller_id}]: {exc}")

        try:
            ctx.client.table("sellers").delete().eq("id", seller_id).execute()
        except Exception as exc:
            failures.append(f"sellers[id={seller_id}]: {exc}")

    for auth_user_id in reversed(ctx.auth_user_ids):
        try:
            ctx.client.auth.admin.delete_user(auth_user_id)
        except Exception as exc:
            failures.append(f"auth.users[id={auth_user_id}]: {exc}")

    return failures


@pytest.fixture(scope="session")
def integration_context(integration_guard: str) -> IntegrationContext:
    client = get_supabase()
    run_id = uuid4().hex[:12]
    ctx = IntegrationContext(
        client=client,
        run_id=run_id,
        provider=f"integration_v2_{run_id}",
    )

    setup_error: Exception | None = None
    try:
        ctx.tenants["primary"] = _create_tenant(ctx, "primary")
        ctx.tenants["secondary"] = _create_tenant(ctx, "secondary")
    except Exception as exc:
        setup_error = exc

    if setup_error is not None:
        cleanup_failures = _cleanup(ctx)
        detail = f"Fixture setup failed: {setup_error}"
        if cleanup_failures:
            detail += " | cleanup failures: " + " ; ".join(cleanup_failures)
        pytest.fail(detail)

    yield ctx

    cleanup_failures = _cleanup(ctx)
    if cleanup_failures:
        pytest.fail(
            "Integration-v2 cleanup failed. Temporary fixture ids were not "
            "silently ignored: " + " ; ".join(cleanup_failures)
        )
