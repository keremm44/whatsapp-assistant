from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse

from settings import AppSettings, get_settings

from .parser import WebhookPayloadError, parse_whatsapp_webhook
from .security import WebhookBodyTooLarge, read_bounded_body, verify_meta_signature


MAX_WEBHOOK_BODY_BYTES = 1024 * 1024

router = APIRouter(prefix="/webhooks/whatsapp", tags=["WhatsApp Webhook"])


def _service_unavailable(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"code": code, "message": message},
    )


@router.get("")
def verify_whatsapp_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
    current_settings: AppSettings = Depends(get_settings),
) -> PlainTextResponse:
    """Handle Meta webhook subscription verification without exposing secrets."""
    expected_token = current_settings.whatsapp_verify_token
    if expected_token is None:
        raise _service_unavailable(
            "whatsapp_verify_token_unconfigured",
            "WhatsApp webhook doğrulama ayarı henüz yapılandırılmadı.",
        )

    if (
        hub_mode != "subscribe"
        or hub_verify_token is None
        or hub_challenge is None
        or not secrets.compare_digest(expected_token, hub_verify_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Webhook doğrulaması reddedildi.",
        )

    return PlainTextResponse(content=hub_challenge, status_code=status.HTTP_200_OK)


@router.post("")
async def receive_whatsapp_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(
        default=None,
        alias="X-Hub-Signature-256",
    ),
    current_settings: AppSettings = Depends(get_settings),
) -> dict[str, Any]:
    """Authenticate and normalize Meta events; business handling remains fail-closed."""
    app_secret = current_settings.whatsapp_app_secret
    if app_secret is None:
        raise _service_unavailable(
            "whatsapp_app_secret_unconfigured",
            "WhatsApp webhook imza doğrulaması henüz yapılandırılmadı.",
        )

    try:
        body = await read_bounded_body(
            request,
            max_bytes=MAX_WEBHOOK_BODY_BYTES,
        )
    except WebhookBodyTooLarge as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Webhook gövdesi izin verilen sınırı aşıyor.",
        ) from exc

    if not verify_meta_signature(app_secret, body, x_hub_signature_256):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook imzası doğrulanamadı.",
        )

    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook gövdesi geçerli JSON değil.",
        ) from exc

    try:
        events = parse_whatsapp_webhook(payload)
    except WebhookPayloadError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook payload yapısı işlenemedi.",
        ) from exc

    if events:
        # Do not acknowledge actionable events until tenant routing + outbound
        # retry/delivery semantics are implemented. A premature 2xx would cause
        # Meta to consider the event handled and could silently lose messages.
        raise _service_unavailable(
            "whatsapp_runtime_not_ready",
            "WhatsApp event işleme katmanı henüz etkinleştirilmedi.",
        )

    return {"received": True, "events": 0}
