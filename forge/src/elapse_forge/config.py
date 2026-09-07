import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    data: Path = field(
        default_factory=lambda: Path(
            os.getenv("FORGE_STORAGE_ROOT", "forge/.data")
        ).resolve()
    )
    database_url: str = field(
        default_factory=lambda: os.getenv("FORGE_DATABASE_URL", "")
    )
    token: str = field(default_factory=lambda: os.getenv("FORGE_API_TOKEN", ""))
    provider: str = field(
        default_factory=lambda: os.getenv("FORGE_OCR_PROVIDER", "mineru")
    )
    mineru_mode: str = field(
        default_factory=lambda: os.getenv("FORGE_MINERU_MODE", "native")
    )
    mineru_command: str = field(
        default_factory=lambda: os.getenv("FORGE_MINERU_COMMAND", "mineru")
    )
    mineru_api_url: str = field(
        default_factory=lambda: os.getenv("FORGE_MINERU_API_URL", "")
    )
    mineru_image: str = field(
        default_factory=lambda: os.getenv("FORGE_MINERU_IMAGE", "")
    )
    mineru_backend: str = field(
        default_factory=lambda: os.getenv("FORGE_MINERU_BACKEND", "pipeline")
    )
    ocr_timeout: int = 600
    max_pages: int = 300
    max_upload_bytes: int = 100 * 1024 * 1024
    ai_url: str = field(default_factory=lambda: os.getenv("FORGE_AI_BASE_URL", ""))
    ai_key: str = field(default_factory=lambda: os.getenv("FORGE_AI_API_KEY", ""))
    ai_model: str = field(default_factory=lambda: os.getenv("FORGE_AI_MODEL", ""))
    parser: str = field(default_factory=lambda: os.getenv("FORGE_PARSER", "rules"))
    curriculum_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv("FORGE_CURRICULUM_DIR", "forge/curriculums")
        )
    )

    def __post_init__(self):
        self.data.mkdir(parents=True, exist_ok=True)
        if not self.database_url:
            self.database_url = f"sqlite:///{self.data / 'forge.sqlite3'}"
