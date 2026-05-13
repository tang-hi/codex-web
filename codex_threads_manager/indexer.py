from __future__ import annotations

import json
import os
import re
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
MAX_SCAN_LINES = 600
MAX_SCAN_BYTES = 2 * 1024 * 1024


@dataclass
class MessagePreview:
    role: str
    text: str
    timestamp: str | None = None


@dataclass
class ThreadRecord:
    id: str
    title: str | None = None
    preview: str | None = None
    cwd: str | None = None
    source: str | None = None
    thread_source: str | None = None
    model_provider: str | None = None
    model: str | None = None
    reasoning_effort: str | None = None
    rollout_path: str | None = None
    archived: bool = False
    archived_at: float | None = None
    created_at: float | None = None
    updated_at: float | None = None
    file_size_bytes: int | None = None
    file_mtime: float | None = None
    has_db_row: bool = False
    has_file: bool = False
    git_branch: str | None = None
    git_sha: str | None = None
    git_origin_url: str | None = None
    cli_version: str | None = None
    agent_nickname: str | None = None
    agent_role: str | None = None
    memory_mode: str | None = None
    tokens_used: int | None = None
    warnings: list[str] = field(default_factory=list)

    def to_public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["createdAtIso"] = epoch_to_iso(self.created_at)
        data["updatedAtIso"] = epoch_to_iso(self.updated_at)
        data["archivedAtIso"] = epoch_to_iso(self.archived_at)
        data["fileMtimeIso"] = epoch_to_iso(self.file_mtime)
        data["fileSizeLabel"] = format_bytes(self.file_size_bytes)
        return data


class CodexThreadIndex:
    def __init__(self, codex_home: Path):
        self.codex_home = codex_home.expanduser().resolve()
        self.state_path = self.codex_home / "state_5.sqlite"
        self.records: dict[str, ThreadRecord] = {}
        self.warnings: list[str] = []
        self.built_at: str | None = None

    def rebuild(self) -> None:
        records: dict[str, ThreadRecord] = {}
        warnings: list[str] = []

        self._load_sqlite(records, warnings)
        self._scan_rollouts(records, warnings)

        self.records = records
        self.warnings = warnings
        self.built_at = datetime.now(timezone.utc).isoformat()

    def stats(self) -> dict[str, Any]:
        records = list(self.records.values())
        archived = sum(1 for item in records if item.archived)
        active = len(records) - archived
        return {
            "codexHome": str(self.codex_home),
            "statePath": str(self.state_path),
            "builtAt": self.built_at,
            "total": len(records),
            "active": active,
            "archived": archived,
            "sources": count_facet(item.source or "unknown" for item in records),
            "cwds": count_facet(item.cwd or "(no cwd)" for item in records),
            "warnings": self.warnings[:50],
        }

    def list_threads(
        self,
        q: str | None = None,
        archived: str = "active",
        source: str | None = None,
        cwd: str | None = None,
        sort: str = "updatedAt",
        direction: str = "desc",
        limit: int = 100,
        offset: int = 0,
    ) -> dict[str, Any]:
        items = list(self.records.values())

        if archived == "active":
            items = [item for item in items if not item.archived]
        elif archived == "archived":
            items = [item for item in items if item.archived]

        if source:
            items = [item for item in items if (item.source or "unknown") == source]

        if cwd:
            items = [item for item in items if (item.cwd or "(no cwd)") == cwd]

        if q:
            needle = q.casefold()
            items = [item for item in items if self._matches_query(item, needle)]

        reverse = direction != "asc"
        items.sort(key=lambda item: self._sort_key(item, sort), reverse=reverse)

        total = len(items)
        limit = max(1, min(limit, 1000))
        offset = max(0, offset)
        page = items[offset : offset + limit]

        all_records = list(self.records.values())
        return {
            "items": [item.to_public_dict() for item in page],
            "total": total,
            "offset": offset,
            "limit": limit,
            "builtAt": self.built_at,
            "facets": {
                "sources": count_facet(item.source or "unknown" for item in all_records),
                "cwds": count_facet(item.cwd or "(no cwd)" for item in all_records),
            },
            "warnings": self.warnings[:50],
        }

    def get_thread(self, thread_id: str) -> dict[str, Any] | None:
        record = self.records.get(thread_id)
        if not record:
            return None

        data = record.to_public_dict()
        data["messages"] = self._read_message_previews(record)
        return data

    def _load_sqlite(self, records: dict[str, ThreadRecord], warnings: list[str]) -> None:
        if not self.state_path.exists():
            warnings.append(f"state database not found: {self.state_path}")
            return

        uri = f"file:{self.state_path}?mode=ro"
        try:
            conn = sqlite3.connect(uri, uri=True, timeout=1)
            conn.row_factory = sqlite3.Row
        except sqlite3.Error as exc:
            warnings.append(f"failed to open state database: {exc}")
            return

        try:
            rows = conn.execute("SELECT * FROM threads").fetchall()
        except sqlite3.Error as exc:
            warnings.append(f"failed to read threads table: {exc}")
            conn.close()
            return

        for row in rows:
            row_dict = dict(row)
            thread_id = as_str(row_dict.get("id"))
            if not thread_id:
                continue

            record = records.get(thread_id) or ThreadRecord(id=thread_id)
            record.has_db_row = True
            title = clean_user_text(as_str(row_dict.get("title"))) or as_str(row_dict.get("title"))
            record.title = make_title(title) if title else record.title
            record.preview = clean_user_text(as_str(row_dict.get("first_user_message"))) or record.preview
            record.cwd = as_str(row_dict.get("cwd")) or record.cwd
            source_label, source_nickname, source_role = normalize_source(row_dict.get("source"))
            record.source = source_label or record.source
            record.thread_source = as_str(row_dict.get("thread_source")) or record.thread_source
            record.model_provider = as_str(row_dict.get("model_provider")) or record.model_provider
            record.model = as_str(row_dict.get("model")) or record.model
            record.reasoning_effort = as_str(row_dict.get("reasoning_effort")) or record.reasoning_effort
            record.rollout_path = normalize_path(row_dict.get("rollout_path")) or record.rollout_path
            record.archived = bool(row_dict.get("archived") or False)
            record.archived_at = epoch_from_db(row_dict.get("archived_at"))
            record.created_at = epoch_from_db(row_dict.get("created_at_ms"), millis=True) or epoch_from_db(
                row_dict.get("created_at")
            )
            record.updated_at = epoch_from_db(row_dict.get("updated_at_ms"), millis=True) or epoch_from_db(
                row_dict.get("updated_at")
            )
            record.git_branch = as_str(row_dict.get("git_branch")) or record.git_branch
            record.git_sha = as_str(row_dict.get("git_sha")) or record.git_sha
            record.git_origin_url = as_str(row_dict.get("git_origin_url")) or record.git_origin_url
            record.cli_version = as_str(row_dict.get("cli_version")) or record.cli_version
            record.agent_nickname = as_str(row_dict.get("agent_nickname")) or source_nickname or record.agent_nickname
            record.agent_role = as_str(row_dict.get("agent_role")) or source_role or record.agent_role
            record.memory_mode = as_str(row_dict.get("memory_mode")) or record.memory_mode
            record.tokens_used = as_int(row_dict.get("tokens_used"))
            records[thread_id] = record

        conn.close()

    def _scan_rollouts(self, records: dict[str, ThreadRecord], warnings: list[str]) -> None:
        roots = [
            (self.codex_home / "sessions", False),
            (self.codex_home / "archived_sessions", True),
        ]
        for root, archived_by_path in roots:
            if not root.exists():
                continue
            for path in root.rglob("*.jsonl"):
                try:
                    parsed = parse_rollout_file(path)
                except OSError as exc:
                    warnings.append(f"failed to read {path}: {exc}")
                    continue

                thread_id = parsed.get("id") or id_from_path(path)
                if not thread_id:
                    warnings.append(f"could not infer thread id from {path}")
                    continue

                record = records.get(thread_id) or ThreadRecord(id=thread_id)
                previous_archived = record.archived
                record.has_file = True
                record.rollout_path = record.rollout_path or str(path)
                record.file_size_bytes = parsed.get("file_size_bytes")
                record.file_mtime = parsed.get("file_mtime")
                record.created_at = record.created_at or parsed.get("created_at")
                record.updated_at = record.updated_at or parsed.get("updated_at") or parsed.get("file_mtime")
                record.cwd = record.cwd or parsed.get("cwd")
                source_label, source_nickname, source_role = normalize_source(parsed.get("source"))
                record.source = record.source or source_label
                record.model_provider = record.model_provider or parsed.get("model_provider")
                record.cli_version = record.cli_version or parsed.get("cli_version")
                record.git_branch = record.git_branch or parsed.get("git_branch")
                record.git_sha = record.git_sha or parsed.get("git_sha")
                record.git_origin_url = record.git_origin_url or parsed.get("git_origin_url")
                record.agent_nickname = record.agent_nickname or source_nickname
                record.agent_role = record.agent_role or source_role
                record.preview = record.preview or parsed.get("preview")

                if not record.title and record.preview:
                    record.title = make_title(record.preview)

                if not record.has_db_row:
                    record.archived = archived_by_path
                elif previous_archived != archived_by_path:
                    record.warnings.append("database archived flag differs from rollout directory")

                records[thread_id] = record

    def _read_message_previews(self, record: ThreadRecord) -> list[dict[str, Any]]:
        if not record.rollout_path:
            return []

        path = Path(record.rollout_path).expanduser()
        if not path.exists():
            return []

        previews: list[MessagePreview] = []
        bytes_read = 0
        try:
            with path.open("r", encoding="utf-8", errors="replace") as handle:
                for line_no, line in enumerate(handle):
                    bytes_read += len(line.encode("utf-8", errors="ignore"))
                    if line_no >= 1200 or bytes_read > 4 * 1024 * 1024:
                        break
                    event = parse_json_line(line)
                    if not event:
                        continue
                    preview = message_preview_from_event(event)
                    if preview:
                        if previews and previews[-1].role == preview.role and previews[-1].text == preview.text:
                            continue
                        previews.append(preview)
                    if len(previews) >= 80:
                        break
        except OSError:
            return []

        return [asdict(item) for item in previews]

    @staticmethod
    def _matches_query(item: ThreadRecord, needle: str) -> bool:
        haystack = " ".join(
            value or ""
            for value in [
                item.id,
                item.title,
                item.preview,
                item.cwd,
                item.source,
                item.thread_source,
                item.model,
                item.model_provider,
                item.git_branch,
                item.git_origin_url,
                item.agent_nickname,
            ]
        )
        return needle in haystack.casefold()

    @staticmethod
    def _sort_key(item: ThreadRecord, sort: str) -> Any:
        if sort == "createdAt":
            return item.created_at or 0
        if sort == "fileSize":
            return item.file_size_bytes or 0
        if sort == "cwd":
            return item.cwd or ""
        if sort == "source":
            return item.source or ""
        if sort == "title":
            return item.title or item.preview or ""
        return item.updated_at or item.file_mtime or item.created_at or 0


def parse_rollout_file(path: Path) -> dict[str, Any]:
    stat = path.stat()
    result: dict[str, Any] = {
        "file_size_bytes": stat.st_size,
        "file_mtime": stat.st_mtime,
    }
    first_user_text: str | None = None
    first_timestamp: float | None = None
    last_timestamp: float | None = None
    bytes_read = 0

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line_no, line in enumerate(handle):
            bytes_read += len(line.encode("utf-8", errors="ignore"))
            if line_no >= MAX_SCAN_LINES or bytes_read > MAX_SCAN_BYTES:
                break

            event = parse_json_line(line)
            if not event:
                continue

            event_timestamp = parse_timestamp(event.get("timestamp"))
            if event_timestamp:
                first_timestamp = first_timestamp or event_timestamp
                last_timestamp = event_timestamp

            if event.get("type") == "session_meta":
                payload = event.get("payload") or {}
                result["id"] = as_str(payload.get("id")) or result.get("id")
                result["created_at"] = parse_timestamp(payload.get("timestamp")) or result.get("created_at")
                result["cwd"] = as_str(payload.get("cwd")) or result.get("cwd")
                result["source"] = as_str(payload.get("source")) or as_str(payload.get("originator")) or result.get(
                    "source"
                )
                result["model_provider"] = as_str(payload.get("model_provider")) or result.get("model_provider")
                result["cli_version"] = as_str(payload.get("cli_version")) or result.get("cli_version")
                git = payload.get("git") or {}
                if isinstance(git, dict):
                    result["git_sha"] = as_str(git.get("commit_hash")) or result.get("git_sha")
                    result["git_branch"] = as_str(git.get("branch")) or result.get("git_branch")
                    result["git_origin_url"] = as_str(git.get("repository_url")) or result.get("git_origin_url")

            if not first_user_text:
                text = user_text_from_event(event)
                cleaned = clean_user_text(text)
                if cleaned:
                    first_user_text = cleaned

    result["created_at"] = result.get("created_at") or first_timestamp or stat.st_mtime
    result["updated_at"] = last_timestamp or stat.st_mtime
    result["preview"] = first_user_text
    return result


def user_text_from_event(event: dict[str, Any]) -> str | None:
    payload = event.get("payload") or {}

    if event.get("type") == "event_msg" and payload.get("type") == "user_message":
        return as_str(payload.get("message"))

    if event.get("type") != "response_item":
        return None

    if payload.get("type") != "message" or payload.get("role") != "user":
        return None

    return text_from_content(payload.get("content"))


def message_preview_from_event(event: dict[str, Any]) -> MessagePreview | None:
    payload = event.get("payload") or {}
    timestamp = as_str(event.get("timestamp"))

    if event.get("type") == "event_msg" and payload.get("type") == "user_message":
        text = clean_user_text(as_str(payload.get("message")))
        return MessagePreview(role="user", text=text, timestamp=timestamp) if text else None

    if event.get("type") != "response_item" or payload.get("type") != "message":
        return None

    role = as_str(payload.get("role")) or "message"
    if role not in {"user", "assistant"}:
        return None

    text = clean_user_text(text_from_content(payload.get("content"))) if role == "user" else text_from_content(
        payload.get("content")
    )
    text = collapse_ws(text or "")
    if not text:
        return None
    return MessagePreview(role=role, text=truncate(text, 1200), timestamp=timestamp)


def text_from_content(content: Any) -> str | None:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return None

    parts: list[str] = []
    for item in content:
        if isinstance(item, dict):
            text = item.get("text")
            if isinstance(text, str):
                parts.append(text)
        elif isinstance(item, str):
            parts.append(item)
    return "\n".join(parts) if parts else None


def clean_user_text(text: str | None) -> str | None:
    if not text:
        return None
    text = text.strip()
    if text.startswith("# AGENTS.md instructions") or text.startswith("<INSTRUCTIONS>"):
        return None

    markers = [
        "## My request for Codex:",
        "## My request for Codex",
        "# Context from my IDE setup",
    ]
    for marker in markers:
        if marker in text:
            text = text.split(marker, 1)[-1].strip(" :\n\t")
            break

    if text.startswith("<environment_context>") and "</environment_context>" in text:
        text = text.split("</environment_context>", 1)[-1].strip()

    if not text:
        return None
    return truncate(collapse_ws(text), 1200)


def parse_json_line(line: str) -> dict[str, Any] | None:
    try:
        value = json.loads(line)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def id_from_path(path: Path) -> str | None:
    match = UUID_RE.search(path.name)
    return match.group(0) if match else None


def epoch_from_db(value: Any, millis: bool = False) -> float | None:
    number = as_float(value)
    if number is None:
        return None
    return number / 1000 if millis else number


def parse_timestamp(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return None


def epoch_to_iso(value: float | None) -> str | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(value, timezone.utc).isoformat()
    except (OSError, ValueError):
        return None


def count_facet(values: Any) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return [
        {"value": value, "count": count}
        for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def normalize_path(value: Any) -> str | None:
    text = as_str(value)
    if not text:
        return None
    return os.path.expanduser(text)


def normalize_source(value: Any) -> tuple[str | None, str | None, str | None]:
    text = as_str(value)
    if not text:
        return None, None, None

    stripped = text.strip()
    if not stripped.startswith("{"):
        return stripped, None, None

    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        return stripped, None, None

    if not isinstance(data, dict):
        return stripped, None, None

    subagent = data.get("subagent")
    if not isinstance(subagent, dict):
        return stripped, None, None

    for value in subagent.values():
        if isinstance(value, dict):
            nickname = as_str(value.get("agent_nickname"))
            role = as_str(value.get("agent_role"))
            return "subagent", nickname, role
    return "subagent", None, None


def make_title(text: str) -> str:
    return truncate(text, 96)


def collapse_ws(text: str) -> str:
    return " ".join(text.split())


def truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def format_bytes(value: int | None) -> str:
    if value is None:
        return ""
    units = ["B", "KB", "MB", "GB"]
    number = float(value)
    for unit in units:
        if number < 1024 or unit == units[-1]:
            return f"{number:.0f} {unit}" if unit == "B" else f"{number:.1f} {unit}"
        number /= 1024
    return f"{value} B"


def as_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def default_codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME", "~/.codex"))
