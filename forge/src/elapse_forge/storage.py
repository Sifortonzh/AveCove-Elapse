import json
import os
import uuid
from pathlib import Path
from typing import Any, Protocol


class ArtifactStore(Protocol):
    def put(self, key: str, data: bytes) -> str: ...
    def get(self, key: str) -> bytes: ...


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Artifact path escapes storage")
        return path

    def put(self, key: str, data: bytes) -> str:
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        with temporary.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
        return key

    def get(self, key: str) -> bytes:
        return self.path(key).read_bytes()

    def json(self, key: str, value: Any) -> str:
        return self.put(key, json.dumps(value, ensure_ascii=False, indent=2).encode())
