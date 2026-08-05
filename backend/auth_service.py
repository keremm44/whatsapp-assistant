from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import (
    create_user_profile,
    get_supabase,
    get_user_profile_by_auth_user_id,
    update_user_profile_status,
    utc_iso,
)


bearer_scheme = HTTPBearer(auto_error=False)

ACTIVE_PROFILE_STATUSES = {"active"}
ALLOWED_PROFILE_ROLES = {"admin", "seller"}


@dataclass(frozen=True)
class AuthContext:
    """Doğrulanmış kullanıcı ve uygulama profilini taşır."""

    auth_user_id: str
    email: str | None
    role: str
    profile_status: str
    seller_id: int | None
    profile: dict[str, Any]
    claims: dict[str, Any]

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_seller(self) -> bool:
        return self.role == "seller"


def _unauthorized(message: str = "Geçerli oturum bulunamadı.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _forbidden(message: str = "Bu işlem için yetkiniz bulunmuyor.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=message,
    )


def _extract_access_token(
    credentials: HTTPAuthorizationCredentials | None,
) -> str:
    """Authorization: Bearer <token> başlığındaki access tokenı alır."""
    if credentials is None:
        raise _unauthorized()

    if credentials.scheme.lower() != "bearer":
        raise _unauthorized("Authorization şeması Bearer olmalıdır.")

    token = credentials.credentials.strip()

    if not token:
        raise _unauthorized("Access token boş olamaz.")

    return token


def _object_to_dict(value: Any) -> dict[str, Any]:
    """SDK modelini güvenli biçimde sözlüğe dönüştürür."""
    if value is None:
        return {}

    if isinstance(value, dict):
        return value

    model_dump = getattr(value, "model_dump", None)

    if callable(model_dump):
        dumped = model_dump()
        return dumped if isinstance(dumped, dict) else {}

    as_dict = getattr(value, "dict", None)

    if callable(as_dict):
        dumped = as_dict()
        return dumped if isinstance(dumped, dict) else {}

    raw = getattr(value, "__dict__", None)

    if isinstance(raw, dict):
        return {
            key: item
            for key, item in raw.items()
            if not key.startswith("_")
        }

    return {}


def _extract_claims(response: Any) -> dict[str, Any]:
    """
    supabase-py sürümleri arasındaki get_claims dönüş farklarını karşılar.
    """
    if response is None:
        return {}

    if isinstance(response, dict):
        nested_claims = response.get("claims")

        if isinstance(nested_claims, dict):
            return nested_claims

        data = response.get("data")

        if isinstance(data, dict):
            if isinstance(data.get("claims"), dict):
                return data["claims"]

            return data

        return response

    direct_claims = getattr(response, "claims", None)

    if direct_claims is not None:
        return _object_to_dict(direct_claims)

    data = getattr(response, "data", None)

    if data is not None:
        data_dict = _object_to_dict(data)

        if isinstance(data_dict.get("claims"), dict):
            return data_dict["claims"]

        if data_dict:
            return data_dict

    return _object_to_dict(response)


def _extract_auth_user(response: Any) -> dict[str, Any]:
    """get_user ve admin invite yanıtından kullanıcı verisini çıkarır."""
    if response is None:
        return {}

    if isinstance(response, dict):
        user = response.get("user")

        if user is not None:
            return _object_to_dict(user)

        data = response.get("data")

        if isinstance(data, dict):
            nested_user = data.get("user")

            if nested_user is not None:
                return _object_to_dict(nested_user)

        return {}

    user = getattr(response, "user", None)

    if user is not None:
        return _object_to_dict(user)

    data = getattr(response, "data", None)

    if data is not None:
        nested_user = getattr(data, "user", None)

        if nested_user is not None:
            return _object_to_dict(nested_user)

        data_dict = _object_to_dict(data)

        if data_dict.get("user") is not None:
            return _object_to_dict(data_dict["user"])

    return {}


def verify_access_token(access_token: str) -> dict[str, Any]:
    """
    Supabase access tokenını doğrular ve JWT claimlerini döndürür.

    Öncelikle get_claims kullanılır. Kurulu SDK sürümünde bu metot yoksa
    Auth sunucusuna istek yapan get_user yöntemiyle güvenli doğrulama yapılır.
    """
    supabase = get_supabase()

    try:
        get_claims = getattr(supabase.auth, "get_claims", None)

        if callable(get_claims):
            response = get_claims(access_token)
            claims = _extract_claims(response)

            if claims.get("sub"):
                return {
                    "durum": "başarılı",
                    "claims": claims,
                }

        response = supabase.auth.get_user(access_token)
        user = _extract_auth_user(response)

        auth_user_id = user.get("id")

        if not auth_user_id:
            return {
                "durum": "geçersiz",
                "mesaj": "Token doğrulandı ancak kullanıcı kimliği alınamadı.",
            }

        claims = {
            "sub": str(auth_user_id),
            "email": user.get("email"),
            "user_metadata": user.get("user_metadata") or {},
            "app_metadata": user.get("app_metadata") or {},
        }

        return {
            "durum": "başarılı",
            "claims": claims,
        }

    except Exception as exc:
        return {
            "durum": "geçersiz",
            "mesaj": str(exc),
        }


def resolve_auth_context(access_token: str) -> AuthContext:
    """
    Tokenı doğrular ve user_profiles kaydıyla uygulama yetkisini çözer.
    """
    verification = verify_access_token(access_token)

    if verification.get("durum") != "başarılı":
        raise _unauthorized("Oturum geçersiz veya süresi dolmuş.")

    claims = verification["claims"]
    auth_user_id = str(claims.get("sub") or "").strip()

    if not auth_user_id:
        raise _unauthorized("Token içinde kullanıcı kimliği bulunamadı.")

    profile_result = get_user_profile_by_auth_user_id(auth_user_id)

    if profile_result.get("durum") == "bulunamadı":
        raise _forbidden(
            "Bu kullanıcı için uygulama profili oluşturulmamış."
        )

    if profile_result.get("durum") != "başarılı":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kullanıcı profili okunamadı.",
        )

    profile = profile_result["profile"]
    profile_role = str(profile.get("role") or "")
    profile_status = str(profile.get("status") or "")

    if profile_role not in ALLOWED_PROFILE_ROLES:
        raise _forbidden("Geçersiz kullanıcı rolü.")

    if profile_status not in ACTIVE_PROFILE_STATUSES:
        raise _forbidden(
            f"Kullanıcı hesabı aktif değil: {profile_status or 'unknown'}"
        )

    seller_id = profile.get("seller_id")

    if profile_role == "seller" and seller_id is None:
        raise _forbidden("Satıcı profili bir işletmeyle bağlı değil.")

    if profile_role == "admin" and seller_id is not None:
        raise _forbidden("Admin profili seller_id içeremez.")

    return AuthContext(
        auth_user_id=auth_user_id,
        email=claims.get("email") or profile.get("email"),
        role=profile_role,
        profile_status=profile_status,
        seller_id=int(seller_id) if seller_id is not None else None,
        profile=profile,
        claims=claims,
    )


def get_current_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> AuthContext:
    """FastAPI endpointlerinde kullanılacak ana auth dependency."""
    token = _extract_access_token(credentials)
    return resolve_auth_context(token)


def require_admin(
    context: AuthContext = Depends(get_current_auth_context),
) -> AuthContext:
    """Yalnızca aktif admin hesabına izin verir."""
    if not context.is_admin:
        raise _forbidden("Bu endpoint yalnızca admin içindir.")

    return context


def require_seller(
    context: AuthContext = Depends(get_current_auth_context),
) -> AuthContext:
    """Yalnızca aktif satıcı hesabına izin verir."""
    if not context.is_seller:
        raise _forbidden("Bu endpoint yalnızca satıcı içindir.")

    if context.seller_id is None:
        raise _forbidden("Satıcı işletme bağlantısı bulunamadı.")

    return context


def require_roles(*roles: str) -> Callable[[AuthContext], AuthContext]:
    """Birden fazla role izin veren dependency üretir."""
    invalid_roles = set(roles) - ALLOWED_PROFILE_ROLES

    if invalid_roles:
        raise ValueError(
            f"Geçersiz roller: {sorted(invalid_roles)}"
        )

    def dependency(
        context: AuthContext = Depends(get_current_auth_context),
    ) -> AuthContext:
        if context.role not in roles:
            raise _forbidden("Bu işlem için rol yetkiniz bulunmuyor.")

        return context

    return dependency


def create_admin_profile(
    auth_user_id: str,
    email: str,
    full_name: str,
) -> dict[str, Any]:
    """
    Supabase Auth üzerinde önceden oluşturulmuş kullanıcıyı admin yapar.
    """
    return create_user_profile(
        auth_user_id=auth_user_id,
        email=email,
        full_name=full_name,
        role="admin",
        seller_id=None,
        status="active",
    )


def invite_seller_account(
    seller_id: int,
    email: str,
    full_name: str,
    redirect_to: str | None = None,
) -> dict[str, Any]:
    """
    Satıcıya Supabase Auth daveti gönderir ve user_profiles kaydı oluşturur.

    Bu fonksiyon yalnızca güvenilir backend/admin akışından çağrılmalıdır.
    """
    supabase = get_supabase()
    normalized_email = email.strip().lower()

    if not normalized_email:
        return {
            "durum": "hata",
            "mesaj": "E-posta zorunludur.",
        }

    if not full_name.strip():
        return {
            "durum": "hata",
            "mesaj": "Ad soyad zorunludur.",
        }

    try:
        options: dict[str, Any] = {
            "data": {
                "full_name": full_name.strip(),
                "seller_id": seller_id,
                "app_role": "seller",
            }
        }

        if redirect_to:
            options["redirect_to"] = redirect_to

        invite_response = supabase.auth.admin.invite_user_by_email(
            normalized_email,
            options,
        )

        auth_user = _extract_auth_user(invite_response)
        auth_user_id = auth_user.get("id")

        if not auth_user_id:
            return {
                "durum": "hata",
                "mesaj": (
                    "Davet gönderildi ancak Auth kullanıcı kimliği "
                    "alınamadı."
                ),
            }

        profile_result = create_user_profile(
            auth_user_id=str(auth_user_id),
            email=normalized_email,
            full_name=full_name.strip(),
            role="seller",
            seller_id=seller_id,
            status="invited",
        )

        if profile_result.get("durum") != "başarılı":
            return {
                "durum": "kısmi_başarılı",
                "mesaj": (
                    "Auth daveti oluşturuldu fakat kullanıcı profili "
                    "oluşturulamadı."
                ),
                "auth_user_id": str(auth_user_id),
                "profil_hatası": profile_result,
            }

        return {
            "durum": "başarılı",
            "auth_user_id": str(auth_user_id),
            "profile": profile_result["profile"],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }


def activate_invited_profile(
    auth_user_id: str,
) -> dict[str, Any]:
    """Davet kabul edildikten sonra kullanıcı profilini aktif eder."""
    profile_result = get_user_profile_by_auth_user_id(auth_user_id)

    if profile_result.get("durum") != "başarılı":
        return profile_result

    profile = profile_result["profile"]

    if profile.get("status") == "active":
        return {
            "durum": "başarılı",
            "profile": profile,
            "zaten_aktif": True,
        }

    result = update_user_profile_status(
        profile_id=profile["id"],
        status="active",
    )

    if result.get("durum") == "başarılı":
        try:
            (
                get_supabase()
                .table("user_profiles")
                .update({"last_login_at": utc_iso()})
                .eq("id", profile["id"])
                .execute()
            )
        except Exception:
            pass

    return result


def complete_invited_profile_from_access_token(
    access_token: str,
) -> dict[str, Any]:
    """
    Davet bağlantısından oluşan geçerli Supabase oturumunu doğrular ve
    yalnızca ilgili ``invited`` satıcı profilini aktif eder.

    Satıcı kimliği veya profil kimliği istemciden alınmaz; token içindeki
    ``sub`` değeri üzerinden çözülür.
    """
    verification = verify_access_token(access_token)

    if verification.get("durum") != "başarılı":
        return {
            "durum": "geçersiz_token",
            "mesaj": "Oturum geçersiz veya süresi dolmuş.",
        }

    claims = verification.get("claims") or {}
    auth_user_id = str(claims.get("sub") or "").strip()

    if not auth_user_id:
        return {
            "durum": "geçersiz_token",
            "mesaj": "Token içinde kullanıcı kimliği bulunamadı.",
        }

    profile_result = get_user_profile_by_auth_user_id(auth_user_id)

    if profile_result.get("durum") != "başarılı":
        return profile_result

    profile = profile_result["profile"]

    if profile.get("role") != "seller":
        return {
            "durum": "reddedildi",
            "mesaj": "Bu işlem yalnızca davetli satıcı hesabı içindir.",
        }

    if profile.get("seller_id") is None:
        return {
            "durum": "reddedildi",
            "mesaj": "Satıcı profili bir işletmeyle bağlı değil.",
        }

    profile_status = str(profile.get("status") or "")

    if profile_status == "active":
        return {
            "durum": "başarılı",
            "profile": profile,
            "zaten_aktif": True,
        }

    if profile_status != "invited":
        return {
            "durum": "reddedildi",
            "mesaj": (
                "Yalnızca davet bekleyen hesaplar tamamlanabilir. "
                f"Mevcut durum: {profile_status or 'unknown'}"
            ),
        }

    return activate_invited_profile(auth_user_id)


def record_profile_login(
    profile_id: int,
) -> dict[str, Any]:
    """Başarılı panel giriş zamanını kaydeder."""
    try:
        result = (
            get_supabase()
            .table("user_profiles")
            .update({"last_login_at": utc_iso()})
            .eq("id", profile_id)
            .execute()
        )

        if not result.data:
            return {
                "durum": "bulunamadı",
                "mesaj": "Kullanıcı profili bulunamadı.",
            }

        return {
            "durum": "başarılı",
            "profile": result.data[0],
        }

    except Exception as exc:
        return {
            "durum": "hata",
            "mesaj": str(exc),
        }
