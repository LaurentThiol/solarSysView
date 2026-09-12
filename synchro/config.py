from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = Path(__file__).resolve().parent / "web"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str | None = None
    host: str = "127.0.0.1"
    port: int = 8000
    openai_api_key: str | None = None
    google_api_key: str | None = None
    brave_api_key: str | None = None
    admin_password: str | None = None
    # Rejoue le cycle chartisme dès qu'un tirage entre en base. Coûteux — un
    # balayage complet de l'archive — donc désactivé par défaut.
    chartisme_auto_export: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
