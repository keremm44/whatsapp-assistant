from __future__ import annotations

import logging
import os
import secrets
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from chat_service import sohbet_isle
from database import (
    create_seller,
    get_all_sellers,
    get_seller_by_id,
    test_connection,
)
from protected_routes import router as protected_router
from public_routes import router as public_router
from settings import AppSettings, get_settings


settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class ChatMesaj(BaseModel):
    seller_id: int = Field(gt=0)
    whatsapp_number: str = Field(min_length=5, max_length=32)
    mesaj: str = Field(default="", max_length=4000)
    customer_name: str | None = Field(default=None, max_length=160)
    provider: str = Field(default="internal", max_length=40)
    provider_message_id: str | None = Field(default=None, max_length=255)
    message_type: str = Field(default="text", max_length=40)
    media_url: str | None = Field(default=None, max_length=2048)


class DevSellerCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=5, max_length=255)
    store_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=32)
    store_link: str | None = Field(default=None, max_length=2048)


app = FastAPI(
    title="WhatsApp Asistan API",
    version=settings.app_version,
)

if settings.cors_origins:
    allow_all = "*" in settings.cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else list(settings.cors_origins),
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(public_router)
app.include_router(protected_router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "whatsapp-asistan-api",
        "status": "running",
        "version": settings.app_version,
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def readiness() -> dict[str, Any]:
    result = test_connection()

    if result.get("durum") != "başarılı":
        logger.error("Veritabanı readiness kontrolü başarısız: %r", result)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Veritabanı bağlantısı hazır değil.",
        )

    return {
        "status": "ready",
        "database": "connected",
    }


def _require_internal_token(
    x_internal_token: str | None = Header(
        default=None,
        alias="X-Internal-Token",
    ),
    current_settings: AppSettings = Depends(get_settings),
) -> None:
    expected = current_settings.internal_api_token

    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Geliştirme endpointleri için iç erişim anahtarı ayarlanmamış.",
        )

    if not x_internal_token or not secrets.compare_digest(
        x_internal_token,
        expected,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz iç erişim anahtarı.",
        )


if settings.enable_dev_endpoints:
    dev_router = APIRouter(
        prefix="/dev",
        tags=["Development"],
        dependencies=[Depends(_require_internal_token)],
    )

    @dev_router.get("/environment")
    def dev_environment() -> dict[str, Any]:
        return {
            "app_env": settings.app_env,
            "database_configured": bool(
                os.getenv("SUPABASE_URL")
                and os.getenv("SUPABASE_SERVICE_KEY")
            ),
            "classifier_configured": bool(os.getenv("GROQ_API_KEY")),
        }

    @dev_router.get("/db-test")
    def dev_database_test() -> dict[str, Any]:
        result = test_connection()

        if result.get("durum") != "başarılı":
            logger.error("Geliştirme DB testi başarısız: %r", result)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Veritabanı testi başarısız.",
            )

        return result

    @dev_router.post("/sellers")
    def dev_create_seller(body: DevSellerCreateRequest) -> dict[str, Any]:
        return create_seller(
            name=body.name,
            email=body.email,
            store_name=body.store_name,
            phone=body.phone,
            store_link=body.store_link,
        )

    @dev_router.get("/sellers")
    def dev_list_sellers() -> dict[str, Any]:
        return get_all_sellers()

    @dev_router.get("/sellers/{seller_id}")
    def dev_seller_detail(seller_id: int) -> dict[str, Any]:
        return get_seller_by_id(seller_id)

    @dev_router.post("/chat")
    def dev_chat(data: ChatMesaj) -> dict[str, Any]:
        return sohbet_isle(
            seller_id=data.seller_id,
            whatsapp_number=data.whatsapp_number,
            kullanici_mesaji=data.mesaj,
            customer_name=data.customer_name,
            provider=data.provider,
            provider_message_id=data.provider_message_id,
            message_type=data.message_type,
            media_url=data.media_url,
        )

    app.include_router(dev_router)
