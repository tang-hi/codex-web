from __future__ import annotations

import argparse
import base64
import binascii
import difflib
import json
import mimetypes
import queue
import re
import shlex
import subprocess
import sys
import tempfile
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .codex_bridge import CodexBridge
from .codex_bridge import CodexBridgeError
from .indexer import CodexThreadIndex, default_codex_home, epoch_to_iso, truncate


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = PROJECT_ROOT / "static"


class ThreadManagerHandler(BaseHTTPRequestHandler):
    index: CodexThreadIndex
    bridge: CodexBridge
    metadata: "ThreadMetadataStore"
    attachments: "AttachmentStore"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/stats":
            self.send_json(self.index.stats())
            return

        if parsed.path == "/api/codex/status":
            self.send_json(self.bridge.status())
            return

        if parsed.path == "/api/codex/models":
            self.handle_codex_models()
            return

        if parsed.path == "/api/codex/rate-limits":
            self.handle_codex_rate_limits()
            return

        if parsed.path == "/api/thread-metadata":
            self.send_json({"metadata": self.metadata.all()})
            return

        if parsed.path == "/api/codex/events":
            self.serve_codex_events()
            return

        if parsed.path == "/api/file":
            self.serve_project_file(first(parse_qs(parsed.query), "path"))
            return

        if parsed.path.startswith("/api/attachments/"):
            self.serve_attachment(unquote(parsed.path.removeprefix("/api/attachments/")))
            return

        if parsed.path == "/api/threads":
            query = parse_qs(parsed.query)
            self.send_json(
                self.index.list_threads(
                    q=first(query, "q"),
                    archived=first(query, "archived") or "active",
                    source=first(query, "source"),
                    cwd=first(query, "cwd"),
                    sort=first(query, "sort") or "updatedAt",
                    direction=first(query, "dir") or "desc",
                    limit=parse_int(first(query, "limit"), 100),
                    offset=parse_int(first(query, "offset"), 0),
                )
            )
            return

        if parsed.path.startswith("/api/threads/") and parsed.path.endswith("/context"):
            thread_id = unquote(parsed.path.removeprefix("/api/threads/").removesuffix("/context").rstrip("/"))
            self.send_json(context_breakdown_for_thread(self.index, thread_id))
            return

        if parsed.path.startswith("/api/threads/"):
            thread_id = unquote(parsed.path.removeprefix("/api/threads/"))
            thread = self.index.get_thread(thread_id)
            if thread is None:
                self.send_error_json(HTTPStatus.NOT_FOUND, "thread not found")
                return
            self.send_json(thread)
            return

        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/index/rebuild":
            self.index.rebuild()
            self.send_json(self.index.stats())
            return

        if parsed.path == "/api/agents/preview":
            self.handle_agents_preview()
            return

        if parsed.path == "/api/agents/apply":
            self.handle_agents_apply()
            return

        if parsed.path == "/api/personalization/suggestions":
            self.handle_personalization_suggestions()
            return

        if parsed.path == "/api/attachments":
            self.handle_attachment_upload()
            return

        if parsed.path.startswith("/api/thread-metadata/"):
            self.handle_thread_metadata_update(unquote(parsed.path.removeprefix("/api/thread-metadata/")))
            return

        if parsed.path == "/api/codex/start":
            self.handle_codex_start()
            return

        if parsed.path == "/api/codex/resume":
            self.handle_codex_resume()
            return

        if parsed.path == "/api/codex/turns":
            self.handle_codex_turns()
            return

        if parsed.path == "/api/codex/turn":
            self.handle_codex_turn()
            return

        if parsed.path == "/api/codex/steer":
            self.handle_codex_steer()
            return

        if parsed.path == "/api/codex/interrupt":
            self.handle_codex_interrupt()
            return

        if parsed.path == "/api/codex/compact":
            self.handle_codex_compact()
            return

        if parsed.path == "/api/codex/review":
            self.handle_codex_review()
            return

        if parsed.path == "/api/codex/fork":
            self.handle_codex_fork()
            return

        if parsed.path == "/api/codex/rollback":
            self.handle_codex_rollback()
            return

        if parsed.path == "/api/codex/shell-command":
            self.handle_codex_shell_command()
            return

        if parsed.path == "/api/codex/approval":
            self.handle_codex_approval()
            return

        if parsed.path == "/api/codex/restart":
            self.bridge.restart()
            self.send_json(self.bridge.status())
            return

        self.send_error_json(HTTPStatus.NOT_FOUND, "not found")

    def serve_codex_events(self) -> None:
        subscriber = self.bridge.subscribe()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        try:
            self.write_sse({"kind": "hello", "ts": time.time()})
            while True:
                try:
                    event = subscriber.get(timeout=15)
                    self.write_sse(event)
                except queue.Empty:
                    self.write_sse({"kind": "ping", "ts": time.time()})
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            self.bridge.unsubscribe(subscriber)

    def write_sse(self, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False)
        self.wfile.write(f"data: {body}\n\n".encode("utf-8"))
        self.wfile.flush()

    def handle_codex_start(self) -> None:
        try:
            body = self.read_json_body()
            result = self.bridge.start_thread(
                cwd=optional_str(body.get("cwd")),
                model=optional_str(body.get("model")),
                effort=optional_str(body.get("effort")),
                service_tier=optional_str(body.get("serviceTier")),
                ephemeral=bool(body.get("ephemeral", False)),
            )
            message = optional_str(body.get("message"))
            image_paths = parse_uploaded_image_paths(body.get("attachments"), self.attachments)
            turn = None
            if message or image_paths:
                thread_id = result.get("thread", {}).get("id")
                if thread_id:
                    turn = self.bridge.start_turn(
                        thread_id,
                        message or "",
                        optional_str(body.get("cwd")),
                        optional_str(body.get("model")),
                        optional_str(body.get("effort")),
                        optional_str(body.get("serviceTier")),
                        image_paths,
                    )
            self.send_json({"threadStart": result, "turnStart": turn})
        except ValueError as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))
        except CodexBridgeError as exc:
            self.send_error_json(HTTPStatus.BAD_GATEWAY, str(exc))

    def handle_codex_models(self) -> None:
        try:
            self.send_json(self.bridge.list_models())
        except CodexBridgeError as exc:
            self.send_error_json(HTTPStatus.BAD_GATEWAY, str(exc))

    def handle_codex_rate_limits(self) -> None:
        try:
            self.send_json(self.bridge.read_rate_limits())
        except CodexBridgeError as exc:
            self.send_error_json(HTTPStatus.BAD_GATEWAY, str(exc))

    def handle_codex_resume(self) -> None:
        try:
            body = self.read_json_body()
            thread_id = required_str(body, "threadId")
            result = self.bridge.resume_thread(
                thread_id,
                optional_str(body.get("cwd")),
                optional_str(body.get("model")),
                optional_str(body.get("effort")),
                optional_str(body.get("serviceTier")),
                bool(body.get("excludeTurns", False)),
            )
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_turns(self) -> None:
        try:
            body = self.read_json_body()
            sort_direction = optional_str(body.get("sortDirection")) or "desc"
            if sort_direction not in {"asc", "desc"}:
                raise ValueError("sortDirection must be asc or desc")
            items_view = optional_str(body.get("itemsView")) or "full"
            if items_view not in {"notLoaded", "summary", "full"}:
                raise ValueError("itemsView must be notLoaded, summary, or full")
            result = self.bridge.list_thread_turns(
                required_str(body, "threadId"),
                cursor=optional_str(body.get("cursor")),
                limit=min(parse_positive_int(body.get("limit"), 24), 100),
                sort_direction=sort_direction,
                items_view=items_view,
            )
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_turn(self) -> None:
        try:
            body = self.read_json_body()
            thread_id = required_str(body, "threadId")
            text = optional_str(body.get("text")) or ""
            image_paths = parse_uploaded_image_paths(body.get("attachments"), self.attachments)
            if not text and not image_paths:
                raise ValueError("text or attachments are required")
            result = self.bridge.start_turn(
                thread_id,
                text,
                optional_str(body.get("cwd")),
                optional_str(body.get("model")),
                optional_str(body.get("effort")),
                optional_str(body.get("serviceTier")),
                image_paths,
            )
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_steer(self) -> None:
        try:
            body = self.read_json_body()
            result = self.bridge.steer_turn(
                required_str(body, "threadId"),
                required_str(body, "turnId"),
                optional_str(body.get("text")) or "",
                parse_uploaded_image_paths(body.get("attachments"), self.attachments),
            )
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_interrupt(self) -> None:
        try:
            body = self.read_json_body()
            result = self.bridge.interrupt_turn(required_str(body, "threadId"), required_str(body, "turnId"))
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_compact(self) -> None:
        try:
            body = self.read_json_body()
            result = self.bridge.compact_thread(required_str(body, "threadId"))
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_review(self) -> None:
        try:
            body = self.read_json_body()
            target = body.get("target")
            if target is not None and not isinstance(target, dict):
                raise ValueError("target must be an object")
            delivery = optional_str(body.get("delivery")) or "inline"
            if delivery not in {"inline", "detached"}:
                raise ValueError("delivery must be inline or detached")
            result = self.bridge.start_review(required_str(body, "threadId"), target, delivery)
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_fork(self) -> None:
        try:
            body = self.read_json_body()
            result = self.bridge.fork_thread(
                required_str(body, "threadId"),
                optional_str(body.get("cwd")),
                optional_str(body.get("model")),
                optional_str(body.get("effort")),
                optional_str(body.get("serviceTier")),
            )
            self.index.rebuild()
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_rollback(self) -> None:
        try:
            body = self.read_json_body()
            num_turns = parse_positive_int(body.get("numTurns"), 1)
            result = self.bridge.rollback_thread(required_str(body, "threadId"), num_turns)
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_shell_command(self) -> None:
        try:
            body = self.read_json_body()
            result = self.bridge.shell_command(required_str(body, "threadId"), required_str(body, "command"))
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_approval(self) -> None:
        try:
            body = self.read_json_body()
            request_id = body.get("requestId")
            if request_id is None:
                raise ValueError("requestId is required")
            decision = optional_str(body.get("decision")) or "accept"
            self.bridge.respond_to_server_request(request_id, decision)
            self.send_json({"ok": True})
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_agents_preview(self) -> None:
        try:
            body = self.read_json_body()
            target_path = self.resolve_agents_target(required_str(body, "target"))
            entries = parse_agents_entries(body.get("entries"))
            current = target_path.read_text(encoding="utf-8") if target_path.exists() else ""
            proposed = build_agents_document(current, entries)
            self.send_json(
                {
                    "targetPath": str(target_path),
                    "exists": target_path.exists(),
                    "diff": unified_text_diff(current, proposed, target_path),
                    "proposed": proposed,
                }
            )
        except (OSError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_agents_apply(self) -> None:
        try:
            body = self.read_json_body()
            target_path = self.resolve_agents_target(required_str(body, "target"))
            entries = parse_agents_entries(body.get("entries"))
            current = target_path.read_text(encoding="utf-8") if target_path.exists() else ""
            proposed = build_agents_document(current, entries)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(proposed, encoding="utf-8")
            self.send_json({"ok": True, "targetPath": str(target_path)})
        except (OSError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def resolve_agents_target(self, target: str) -> Path:
        if target == "project":
            return PROJECT_ROOT / "AGENTS.md"
        if target == "global":
            return self.index.codex_home / "AGENTS.md"
        raise ValueError("target must be project or global")

    def handle_thread_metadata_update(self, thread_id: str) -> None:
        try:
            body = self.read_json_body()
            self.send_json({"metadata": self.metadata.update(thread_id, body)})
        except ValueError as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_personalization_suggestions(self) -> None:
        try:
            body = self.read_json_body()
            self.send_json(personalization_suggestions(self.index, self.metadata, body))
        except (OSError, subprocess.SubprocessError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:
            self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"personalization analysis failed: {exc}")

    def handle_attachment_upload(self) -> None:
        try:
            body = self.read_json_body()
            thread_id = required_str(body, "threadId")
            files = body.get("files")
            self.send_json({"attachments": self.attachments.save_images(thread_id, files)})
        except (OSError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def read_json_body(self) -> dict[str, object]:
        length = parse_int(self.headers.get("Content-Length"), 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid JSON body: {exc}") from exc
        if not isinstance(body, dict):
            raise ValueError("JSON body must be an object")
        return body

    def serve_static(self, request_path: str) -> None:
        relative = "index.html" if request_path in {"", "/"} else request_path.lstrip("/")
        path = (STATIC_ROOT / relative).resolve()

        try:
            path.relative_to(STATIC_ROOT.resolve())
        except ValueError:
            self.send_error_json(HTTPStatus.FORBIDDEN, "forbidden")
            return

        if not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        body = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def serve_project_file(self, requested_path: str | None) -> None:
        if not requested_path:
            self.send_error_json(HTTPStatus.BAD_REQUEST, "path is required")
            return

        raw_path = Path(requested_path).expanduser()
        path = raw_path.resolve() if raw_path.is_absolute() else (PROJECT_ROOT / raw_path).resolve()
        try:
            path.relative_to(PROJECT_ROOT.resolve())
        except ValueError:
            self.send_error_json(HTTPStatus.FORBIDDEN, "file must be inside project root")
            return

        if not path.exists() or not path.is_file():
            self.send_error_json(HTTPStatus.NOT_FOUND, "file not found")
            return

        body = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or "text/plain"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def serve_attachment(self, requested_path: str | None) -> None:
        try:
            attachment = self.attachments.resolve_url_path(requested_path or "")
        except ValueError as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))
            return

        if not attachment.exists() or not attachment.is_file():
            self.send_error_json(HTTPStatus.NOT_FOUND, "attachment not found")
            return

        body = attachment.read_bytes()
        content_type = mimetypes.guess_type(attachment.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status: HTTPStatus, message: str) -> None:
        self.send_json({"error": message}, status=status)

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def first(query: dict[str, list[str]], key: str) -> str | None:
    values = query.get(key)
    if not values:
        return None
    value = values[0].strip()
    return value or None


AGENTS_MANAGED_START = "<!-- codex-web-managed:start -->"
AGENTS_MANAGED_END = "<!-- codex-web-managed:end -->"
THREAD_VISIBILITIES = {"active", "archived", "hidden"}
MAX_IMAGES_PER_TURN = 5
MAX_IMAGE_BYTES = 10 * 1024 * 1024
PERSONALIZATION_MAX_THREADS = 80
PERSONALIZATION_TIMEOUT_SECONDS = 600
PERSONALIZATION_WORK_ROOT = PROJECT_ROOT / ".codex-web-personalize"
IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


class AttachmentStore:
    def __init__(self, root: Path):
        self.root = root.expanduser()

    def save_images(self, thread_id: str, files: object) -> list[dict[str, object]]:
        if not isinstance(files, list):
            raise ValueError("files must be a list")
        if not files:
            raise ValueError("files must include at least one image")
        if len(files) > MAX_IMAGES_PER_TURN:
            raise ValueError(f"at most {MAX_IMAGES_PER_TURN} images can be attached")

        thread_key = safe_attachment_segment(thread_id)
        target_dir = self.root / thread_key
        target_dir.mkdir(parents=True, exist_ok=True)

        attachments: list[dict[str, object]] = []
        for item in files:
            if not isinstance(item, dict):
                raise ValueError("each file must be an object")
            name = optional_str(item.get("name")) or "image"
            data_url = required_str(item, "dataUrl")
            content = decode_image_data_url(data_url)
            if len(content) > MAX_IMAGE_BYTES:
                raise ValueError(f"{name} exceeds the {MAX_IMAGE_BYTES // (1024 * 1024)} MB image limit")
            mime_type = sniff_image_type(content)
            if mime_type not in IMAGE_TYPES:
                raise ValueError(f"{name} is not a supported image")

            filename = f"{uuid.uuid4().hex}{IMAGE_TYPES[mime_type]}"
            path = (target_dir / filename).resolve()
            self._ensure_inside_root(path)
            path.write_bytes(content)
            attachments.append(
                {
                    "id": f"{thread_key}/{filename}",
                    "name": name,
                    "mimeType": mime_type,
                    "size": len(content),
                    "path": str(path),
                    "url": f"/api/attachments/{thread_key}/{filename}",
                }
            )
        return attachments

    def resolve_uploaded_path(self, value: str) -> Path:
        path = Path(value).expanduser()
        if not path.is_absolute():
            raise ValueError("attachment path must be absolute")
        resolved = path.resolve()
        self._ensure_inside_root(resolved)
        if not resolved.exists() or not resolved.is_file():
            raise ValueError("attachment file does not exist")
        return resolved

    def resolve_url_path(self, value: str) -> Path:
        parts = [part for part in value.split("/") if part]
        if len(parts) != 2:
            raise ValueError("invalid attachment path")
        thread_key, filename = parts
        if safe_attachment_segment(thread_key) != thread_key or safe_attachment_segment(filename) != filename:
            raise ValueError("invalid attachment path")
        path = (self.root / thread_key / filename).resolve()
        self._ensure_inside_root(path)
        return path

    def _ensure_inside_root(self, path: Path) -> None:
        try:
            path.relative_to(self.root.resolve())
        except ValueError as exc:
            raise ValueError("attachment must be inside upload storage") from exc


def safe_attachment_segment(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "").strip())
    text = text.strip("._-")
    return text[:120] or "thread"


def decode_image_data_url(data_url: str) -> bytes:
    header, separator, encoded = data_url.partition(",")
    if separator != "," or not header.startswith("data:"):
        raise ValueError("image data must be a data URL")
    metadata = [part.lower() for part in header[5:].split(";")]
    if "base64" not in metadata:
        raise ValueError("image data URL must be base64 encoded")
    try:
        return base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise ValueError("invalid image data") from exc


def sniff_image_type(content: bytes) -> str:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return ""


def parse_uploaded_image_paths(value: object, attachments: AttachmentStore) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("attachments must be a list")
    if len(value) > MAX_IMAGES_PER_TURN:
        raise ValueError(f"at most {MAX_IMAGES_PER_TURN} images can be attached")
    paths: list[str] = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("each attachment must be an object")
        path = required_str(item, "path")
        paths.append(str(attachments.resolve_uploaded_path(path)))
    return paths


class ThreadMetadataStore:
    def __init__(self, path: Path):
        self.path = path.expanduser()

    def all(self) -> dict[str, dict[str, object]]:
        return self._read()

    def update(self, thread_id: str, patch: dict[str, object]) -> dict[str, object]:
        thread_id = optional_str(thread_id)
        if not thread_id:
            raise ValueError("thread id is required")
        if not isinstance(patch, dict):
            raise ValueError("metadata patch must be an object")

        data = self._read()
        existing = data.get(thread_id, {"threadId": thread_id, "visibility": "active"})
        next_value = normalize_thread_metadata({**existing, **patch, "threadId": thread_id})
        data[thread_id] = next_value
        self._write(data)
        return next_value

    def visibility(self, thread_id: str) -> str:
        value = self._read().get(thread_id, {})
        visibility = value.get("visibility")
        return visibility if visibility in THREAD_VISIBILITIES else "active"

    def _read(self) -> dict[str, dict[str, object]]:
        try:
            raw = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return {}
        except OSError:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if not isinstance(parsed, dict):
            return {}
        result: dict[str, dict[str, object]] = {}
        for thread_id, value in parsed.items():
            if isinstance(thread_id, str) and isinstance(value, dict):
                result[thread_id] = normalize_thread_metadata({**value, "threadId": thread_id})
        return result

    def _write(self, data: dict[str, dict[str, object]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def normalize_thread_metadata(value: dict[str, object]) -> dict[str, object]:
    thread_id = optional_str(value.get("threadId")) or ""
    visibility = optional_str(value.get("visibility")) or "active"
    if visibility not in THREAD_VISIBILITIES:
        visibility = "active"

    result: dict[str, object] = {
        "threadId": thread_id,
        "visibility": visibility,
    }
    for key in ["displayName", "projectPath", "createdAt", "updatedAt", "lastOpenedAt"]:
        text = optional_str(value.get(key))
        if text:
            result[key] = text
    if "pinned" in value:
        result["pinned"] = bool(value.get("pinned"))
    return result


def parse_agents_entries(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        raise ValueError("entries must be a list")

    entries: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        text = optional_str(item.get("text"))
        if not text:
            continue
        category = optional_str(item.get("category")) or "Preferences"
        entries.append({"category": category, "text": text})

    if not entries:
        raise ValueError("entries must include at least one selected suggestion")
    return entries


def build_agents_document(current: str, entries: list[dict[str, str]]) -> str:
    block = build_agents_managed_block(entries)
    if AGENTS_MANAGED_START in current and AGENTS_MANAGED_END in current:
        before, rest = current.split(AGENTS_MANAGED_START, 1)
        _old, after = rest.split(AGENTS_MANAGED_END, 1)
        return f"{before}{block}{after.lstrip(chr(10))}"

    prefix = current.rstrip()
    if prefix:
        return f"{prefix}\n\n{block}\n"
    return f"{block}\n"


def build_agents_managed_block(entries: list[dict[str, str]]) -> str:
    grouped: dict[str, list[str]] = {}
    for item in entries:
        grouped.setdefault(item["category"], []).append(item["text"])

    lines = [
        AGENTS_MANAGED_START,
        "## Codex Web Suggestions",
        "",
    ]
    for category, values in grouped.items():
        lines.append(f"### {category}")
        for value in values:
            lines.append(f"- {value}")
        lines.append("")
    lines.append(AGENTS_MANAGED_END)
    return "\n".join(lines)


def unified_text_diff(current: str, proposed: str, target_path: Path) -> str:
    current_lines = current.splitlines(keepends=True)
    proposed_lines = proposed.splitlines(keepends=True)
    return "".join(
        difflib.unified_diff(
            current_lines,
            proposed_lines,
            fromfile=f"a/{target_path.name}",
            tofile=f"b/{target_path.name}",
        )
    )


def context_breakdown_for_thread(index: CodexThreadIndex, thread_id: str) -> dict[str, object]:
    record = index.records.get(thread_id)
    if not record or not record.rollout_path:
        return {"items": [], "contributors": [], "suggestions": [], "totalTokens": 0, "estimated": True}

    path = Path(record.rollout_path).expanduser()
    buckets: dict[str, dict[str, object]] = {}
    contributors: list[dict[str, object]] = []
    tool_calls: dict[str, dict[str, object]] = {}
    bytes_read = 0

    def add(category: str, label: str, text: str, source: str = "", **metadata: object) -> None:
        clean = text.strip()
        if not clean:
            return
        tokens = estimate_tokens(clean)
        bucket = buckets.setdefault(
            category,
            {
                "id": category,
                "category": category,
                "label": context_category_label(category),
                "tokens": 0,
                "source": "",
            },
        )
        bucket["tokens"] = int(bucket["tokens"]) + tokens
        contributors.append(
            {
                "id": f"{category}-{len(contributors)}",
                "category": category,
                "label": label,
                "rawLabel": optional_str(metadata.get("rawLabel")) or label,
                "tokens": tokens,
                "source": source,
                **{key: value for key, value in metadata.items() if value not in ("", None, [], {})},
            }
        )

    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for line_no, line in enumerate(handle):
                bytes_read += len(line.encode("utf-8", errors="ignore"))
                if line_no >= 5000 or bytes_read > 8 * 1024 * 1024:
                    break
                event = parse_json_line(line)
                if not event:
                    continue
                add_context_event(event, add, tool_calls)
    except OSError:
        return {"items": [], "contributors": [], "suggestions": [], "totalTokens": 0, "estimated": True}

    total = sum(int(item["tokens"]) for item in buckets.values())
    items = []
    for item in buckets.values():
        tokens = int(item["tokens"])
        items.append({**item, "percentage": (tokens / total * 100) if total else 0})
    items.sort(key=lambda item: int(item["tokens"]), reverse=True)
    contributors.sort(key=lambda item: int(item["tokens"]), reverse=True)
    return {
        "items": items,
        "contributors": contributors[:12],
        "suggestions": context_suggestions(items),
        "totalTokens": total,
        "estimated": True,
    }


def add_context_event(event: dict[str, object], add: object, tool_calls: dict[str, dict[str, object]]) -> None:
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    event_type = optional_str(event.get("type"))
    payload_type = optional_str(payload.get("type"))

    if event_type == "session_meta":
        base = payload.get("base_instructions")
        if isinstance(base, dict):
            add("system", "System prompt", optional_str(base.get("text")) or "", "session_meta.base_instructions")
        for key, label in [
            ("developer_instructions", "Developer instructions"),
            ("instructions", "Developer instructions"),
        ]:
            value = payload.get(key)
            if isinstance(value, dict):
                add("developer", label, optional_str(value.get("text")) or "", f"session_meta.{key}")
            else:
                add("developer", label, optional_str(value) or "", f"session_meta.{key}")
        return

    if event_type == "event_msg" and payload.get("type") == "user_message":
        add("user_messages", "User message", optional_str(payload.get("message")) or "", "event_msg")
        return

    if event_type != "response_item":
        return

    if payload_type == "function_call":
        call_id = optional_str(payload.get("call_id"))
        if call_id:
            tool_calls[call_id] = tool_call_metadata(payload)
        return

    if payload_type == "message":
        role = optional_str(payload.get("role")) or "message"
        text = text_from_any_content(payload.get("content"))
        if role == "user" and is_agents_context(text):
            add("agents", "Project AGENTS.md", text, "response_item.message")
        elif role == "user":
            add("user_messages", "User message", text, "response_item.message")
        elif role == "assistant":
            add("assistant_messages", "Assistant reply", text, "response_item.message")
        return

    if payload_type in {"function_call_output", "commandExecution", "mcpToolCall", "dynamicToolCall"}:
        call_id = optional_str(payload.get("call_id"))
        metadata = tool_calls.get(call_id, {})
        label = tool_output_label(payload, metadata)
        add(
            "tool_outputs",
            label,
            text_from_payload(payload),
            f"response_item.{payload_type}",
            rawLabel=payload_type,
            canSummarize=True,
            canExclude=True,
            canInspect=True,
            **metadata,
        )
        return

    if payload_type in {"fileChange", "patch", "diff"}:
        add(
            "diffs",
            file_diff_label(payload),
            text_from_payload(payload),
            f"response_item.{payload_type}",
            rawLabel=payload_type,
            filePath=context_file_path(payload),
            canInspect=True,
        )


def context_category_label(category: str) -> str:
    labels = {
        "system": "System / Developer",
        "developer": "System / Developer",
        "agents": "AGENTS.md",
        "user_messages": "User messages",
        "assistant_messages": "Assistant replies",
        "tool_outputs": "Tool outputs",
        "files": "Files / diffs",
        "diffs": "Files / diffs",
        "other": "Other",
    }
    return labels.get(category, category)


def context_suggestions(items: list[dict[str, object]]) -> list[str]:
    by_category = {str(item["category"]): float(item.get("percentage") or 0) for item in items}
    suggestions: list[str] = []
    if by_category.get("tool_outputs", 0) >= 20:
        suggestions.append("Tool output is large. Consider summarizing command logs.")
    if by_category.get("agents", 0) >= 20:
        suggestions.append("Project AGENTS.md is long. Consider moving stable preferences to global AGENTS.md.")
    if by_category.get("user_messages", 0) + by_category.get("assistant_messages", 0) >= 45:
        suggestions.append("This thread is long. Consider compacting older turns.")
    if by_category.get("files", 0) + by_category.get("diffs", 0) >= 20:
        suggestions.append("Files and diffs are prominent. Keep only relevant excerpts in context.")
    return suggestions


def personalization_suggestions(index: CodexThreadIndex, metadata: ThreadMetadataStore, body: dict[str, object]) -> dict[str, object]:
    scope = optional_str(body.get("scope")) or "current_project"
    include_values = body.get("include")
    include = set(include_values if isinstance(include_values, list) else ["active", "archived"])
    project_path = optional_str(body.get("projectPath")) or ""
    selected_ids = body.get("selectedThreadIds") if isinstance(body.get("selectedThreadIds"), list) else []
    selected = {optional_str(value) for value in selected_ids if optional_str(value)}
    now = time.time()
    cutoff = now - 30 * 24 * 60 * 60

    if scope in {"selected_thread", "selected_threads"} and not selected:
        raise ValueError("select at least one thread")

    records = []
    for record in index.records.values():
        visibility = metadata.visibility(record.id)
        if visibility not in include:
            continue
        if scope == "current_project" and project_path and record.cwd != project_path:
            continue
        if scope in {"selected_thread", "selected_threads"} and record.id not in selected:
            continue
        if scope == "last_30_days" and (record.updated_at or record.file_mtime or 0) < cutoff:
            continue
        records.append(record)

    records.sort(key=lambda item: item.updated_at or item.file_mtime or 0, reverse=True)
    analyzed_records = records[:PERSONALIZATION_MAX_THREADS]
    if not analyzed_records:
        return {
            "suggestions": [],
            "analysis": {
                "source": "codex_exec_ephemeral",
                "status": "empty",
                "summary": "No matching threads were available for analysis.",
                "matchedThreadCount": len(records),
                "analyzedThreadCount": 0,
                "maxThreads": PERSONALIZATION_MAX_THREADS,
            },
        }

    raw_result = run_codex_personalization_analysis(index, metadata, analyzed_records, body, len(records), project_path)
    suggestions = normalize_personalization_suggestions(raw_result.get("suggestions"))
    return {
        "suggestions": suggestions,
        "analysis": {
            "source": "codex_exec_ephemeral",
            "status": "complete",
            "summary": optional_str(raw_result.get("summary")) or "Codex analyzed the selected thread rollouts.",
            "matchedThreadCount": len(records),
            "analyzedThreadCount": len(analyzed_records),
            "maxThreads": PERSONALIZATION_MAX_THREADS,
        },
    }


def run_codex_personalization_analysis(
    index: CodexThreadIndex,
    metadata: ThreadMetadataStore,
    records: list[object],
    body: dict[str, object],
    matched_count: int,
    project_path: str,
) -> dict[str, object]:
    PERSONALIZATION_WORK_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="run-", dir=PERSONALIZATION_WORK_ROOT) as tmp:
        tmp_path = Path(tmp)
        manifest_path = tmp_path / "thread-manifest.json"
        schema_path = tmp_path / "personalization.schema.json"
        output_path = tmp_path / "personalization-result.json"
        manifest = personalization_manifest(index, metadata, records, body, matched_count, project_path)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        schema_path.write_text(json.dumps(personalization_output_schema(), ensure_ascii=False, indent=2), encoding="utf-8")

        command = codex_personalization_command(body, schema_path, output_path, index.codex_home)
        process = subprocess.run(
            command,
            input=personalization_prompt(manifest_path),
            cwd=str(PROJECT_ROOT),
            text=True,
            capture_output=True,
            timeout=PERSONALIZATION_TIMEOUT_SECONDS,
        )
        if process.returncode != 0:
            detail = (process.stderr or process.stdout or "").strip()
            raise ValueError(f"Codex personalization analysis failed: {truncate(detail, 2000) or process.returncode}")
        raw = output_path.read_text(encoding="utf-8") if output_path.exists() else process.stdout
        parsed = parse_personalization_json(raw)
        if not isinstance(parsed, dict):
            raise ValueError("Codex personalization analysis did not return a JSON object")
        return parsed


def codex_personalization_command(
    body: dict[str, object],
    schema_path: Path,
    output_path: Path,
    codex_home: Path,
) -> list[str]:
    command = [
        "codex",
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "--output-schema",
        str(schema_path),
        "--output-last-message",
        str(output_path),
        "-C",
        str(PROJECT_ROOT),
        "--add-dir",
        str(codex_home),
        "-c",
        'approval_policy="never"',
    ]
    model = optional_str(body.get("model"))
    effort = optional_str(body.get("effort"))
    service_tier = optional_str(body.get("serviceTier"))
    if model:
        command.extend(["--model", model])
    if effort:
        command.extend(["-c", f'model_reasoning_effort="{effort}"'])
    if service_tier in {"fast", "flex"}:
        command.extend(["-c", f'service_tier="{service_tier}"'])
    command.append("-")
    return command


def personalization_manifest(
    index: CodexThreadIndex,
    metadata: ThreadMetadataStore,
    records: list[object],
    body: dict[str, object],
    matched_count: int,
    project_path: str,
) -> dict[str, object]:
    return {
        "scope": optional_str(body.get("scope")) or "current_project",
        "include": body.get("include") if isinstance(body.get("include"), list) else ["active", "archived"],
        "projectPath": project_path,
        "matchedThreadCount": matched_count,
        "providedThreadCount": len(records),
        "threads": [personalization_thread_entry(index, metadata, record) for record in records],
    }


def personalization_thread_entry(index: CodexThreadIndex, metadata: ThreadMetadataStore, record: object) -> dict[str, object]:
    thread = index.get_thread(record.id) or {}
    messages = thread.get("messages") if isinstance(thread.get("messages"), list) else []
    return {
        "threadId": record.id,
        "title": record.title or thread.get("title") or "",
        "preview": record.preview or thread.get("preview") or "",
        "projectPath": record.cwd or "",
        "visibility": metadata.visibility(record.id),
        "createdAt": epoch_to_iso(record.created_at),
        "updatedAt": epoch_to_iso(record.updated_at or record.file_mtime),
        "rolloutPath": record.rollout_path or "",
        "messagePreviewCount": len(messages),
    }


def personalization_prompt(manifest_path: Path) -> str:
    return f"""You are analyzing Codex Web thread history to propose durable AGENTS.md rules.

Read the JSON manifest at:
{manifest_path}

The manifest contains metadata and absolute rollout JSONL paths for the selected threads. Inspect the rollout files directly when evidence is needed; do not ask the user for more input.

Return structured JSON only. Follow these rules:
- Propose only reusable, durable workflow patterns.
- Separate long-term personal preferences from project-specific conventions.
- Do not include one-off task instructions, temporary requests, or low-confidence guesses.
- Do not write files. This is analysis only.
- Hidden threads are included only when the manifest says they were selected.
- Every suggestion must include concise evidence from real threads: thread id, title, short excerpt, and date when available.
- Prefer 3 to 8 high-signal suggestions over a long noisy list.

Targets:
- global_agents: stable personal preferences, response style, general coding or review habits.
- project_agents: project paths, commands, architecture, and project-specific workflow.
- ignore: only when a detected pattern is useful to show but should not be written.

Use these category labels when appropriate: Coding workflow, Verification, Review style, Project convention, Operational preference, Other.
"""


def personalization_output_schema() -> dict[str, object]:
    evidence_item = {
        "type": "object",
        "properties": {
            "threadId": {"type": "string"},
            "threadTitle": {"type": "string"},
            "date": {"type": "string"},
            "excerpt": {"type": "string"},
        },
        "required": ["threadId", "threadTitle", "date", "excerpt"],
        "additionalProperties": False,
    }
    suggestion = {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "category": {"type": "string"},
            "target": {"type": "string", "enum": ["global_agents", "project_agents", "ignore"]},
            "text": {"type": "string"},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "evidenceCount": {"type": "integer"},
            "evidence": {"type": "array", "items": evidence_item},
            "selected": {"type": "boolean"},
        },
        "required": ["id", "category", "target", "text", "confidence", "evidenceCount", "evidence", "selected"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "suggestions": {"type": "array", "items": suggestion},
        },
        "required": ["summary", "suggestions"],
        "additionalProperties": False,
    }


def parse_personalization_json(raw: str) -> object:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def normalize_personalization_suggestions(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    suggestions: list[dict[str, object]] = []
    seen: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        text = optional_str(item.get("text"))
        if not text:
            continue
        target = optional_str(item.get("target")) or "global_agents"
        if target not in {"global_agents", "project_agents", "ignore"}:
            target = "global_agents"
        confidence = optional_str(item.get("confidence")) or "medium"
        if confidence not in {"low", "medium", "high"}:
            confidence = "medium"
        evidence_items = normalize_suggestion_evidence(item.get("evidence"))
        evidence_count = parse_nonnegative_int(item.get("evidenceCount"), len(evidence_items))
        suggestion_id = safe_attachment_segment(optional_str(item.get("id")) or f"suggestion-{index}")
        if suggestion_id in seen:
            suggestion_id = f"{suggestion_id}-{index}"
        seen.add(suggestion_id)
        suggestions.append(
            {
                "id": suggestion_id,
                "category": optional_str(item.get("category")) or "Other",
                "target": target,
                "text": text,
                "confidence": confidence,
                "evidenceCount": evidence_count,
                "evidence": evidence_items,
                "selected": item.get("selected") is not False and target != "ignore",
            }
        )
    return suggestions


def normalize_suggestion_evidence(value: object) -> list[dict[str, str]]:
    if isinstance(value, str):
        text = optional_str(value)
        return [{"threadId": "", "threadTitle": "", "date": "", "excerpt": text}] if text else []
    if not isinstance(value, list):
        return []
    result: list[dict[str, str]] = []
    for item in value[:6]:
        if isinstance(item, str):
            text = optional_str(item)
            if text:
                result.append({"threadId": "", "threadTitle": "", "date": "", "excerpt": text})
            continue
        if not isinstance(item, dict):
            continue
        excerpt = optional_str(item.get("excerpt")) or optional_str(item.get("text"))
        if not excerpt:
            continue
        result.append(
            {
                "threadId": optional_str(item.get("threadId")) or optional_str(item.get("thread_id")) or "",
                "threadTitle": optional_str(item.get("threadTitle")) or optional_str(item.get("title")) or "",
                "date": optional_str(item.get("date")) or optional_str(item.get("updatedAt")) or "",
                "excerpt": truncate(excerpt, 500),
            }
        )
    return result


def text_from_any_content(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(optional_str(item.get("text")) or optional_str(item.get("content")) or "")
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        return optional_str(value.get("text")) or optional_str(value.get("content")) or ""
    return ""


def text_from_payload(payload: dict[str, object]) -> str:
    values: list[str] = []
    for key in ["output", "aggregatedOutput", "result", "error", "text", "command", "diff", "unifiedDiff"]:
        value = payload.get(key)
        if isinstance(value, (dict, list)):
            values.append(json.dumps(value, ensure_ascii=False))
        else:
            values.append(optional_str(value) or "")
    if payload.get("content"):
        values.append(text_from_any_content(payload.get("content")))
    return "\n".join(value for value in values if value)


def tool_call_metadata(payload: dict[str, object]) -> dict[str, object]:
    tool = optional_str(payload.get("name")) or optional_str(payload.get("tool"))
    arguments = parse_tool_arguments(payload.get("arguments"))
    command = optional_str(payload.get("command")) or optional_str(arguments.get("cmd")) or optional_str(arguments.get("command"))
    file_path = (
        context_file_path(arguments)
        or context_file_path(payload)
        or command_file_path(command)
    )
    metadata: dict[str, object] = {}
    if tool:
        metadata["tool"] = tool
    if command:
        metadata["command"] = command
    if file_path:
        metadata["filePath"] = file_path
    return metadata


def parse_tool_arguments(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def tool_output_label(payload: dict[str, object], metadata: dict[str, object] | None = None) -> str:
    info = metadata or {}
    command = optional_str(info.get("command")) or optional_str(payload.get("command"))
    if command:
        return command_output_label(command, optional_str(info.get("filePath")))
    tool = optional_str(info.get("tool")) or optional_str(payload.get("tool")) or optional_str(payload.get("name"))
    if tool == "apply_patch":
        return "Patch application output"
    if tool:
        return f"{tool} output"
    return "Tool output"


def command_output_label(command: str, file_path: str = "") -> str:
    normalized = " ".join(command.strip().split())
    if not normalized:
        return "Command output"
    if re.search(r"(^|\s)(pytest|py\.test)\b", normalized):
        return "pytest output"
    if re.search(r"(^|\s)(npm|pnpm|yarn)\s+install\b", normalized):
        return "package install log"
    if normalized.startswith("git diff"):
        return f"git diff: {file_path}" if file_path else "git diff output"
    if normalized.startswith("git show"):
        return f"git show: {file_path}" if file_path else "git show output"
    if re.match(r"^(rg|grep)\b", normalized):
        return "search output"
    if normalized.startswith("node --check"):
        return "node syntax check output"
    if "py_compile" in normalized:
        return "python compile check output"
    return f"{normalized[:80]} output"


def file_diff_label(payload: dict[str, object]) -> str:
    path = context_file_path(payload)
    return f"File diff: {path}" if path else "File diff"


def context_file_path(payload: dict[str, object]) -> str:
    for key in ["filePath", "file_path", "path", "filename", "target", "targetPath", "target_path"]:
        value = optional_str(payload.get(key))
        if value:
            return value
    changes = payload.get("changes")
    if isinstance(changes, list):
        for item in changes:
            if isinstance(item, dict):
                value = context_file_path(item)
                if value:
                    return value
    diff = optional_str(payload.get("diff")) or optional_str(payload.get("unifiedDiff")) or optional_str(payload.get("unified_diff"))
    if diff:
        match = re.search(r"^diff --git a/(.+?) b/(.+)$", diff, re.MULTILINE)
        if match:
            return match.group(2) or match.group(1)
    return ""


def command_file_path(command: str) -> str:
    if not command:
        return ""
    try:
        parts = shlex.split(command)
    except ValueError:
        parts = command.split()
    if "--" in parts:
        candidates = parts[parts.index("--") + 1:]
    else:
        candidates = parts[1:]
    for item in reversed(candidates):
        if not item or item.startswith("-"):
            continue
        if item in {".", "./", "..", "../"}:
            continue
        if "|" in item or ">" in item or "<" in item:
            continue
        if re.search(r"[/\\.]|(?:^|/)README\.md$|(?:^|/)AGENTS\.md$|(?:^|/)Makefile$|(?:^|/)Dockerfile$", item):
            return item
    return ""


def is_agents_context(text: str) -> bool:
    value = text.strip()
    return value.startswith("# AGENTS.md instructions") or value.startswith("<INSTRUCTIONS>")


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / 4))


def parse_json_line(line: str) -> dict[str, object] | None:
    try:
        value = json.loads(line)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def parse_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def parse_positive_int(value: object, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(1, parsed)


def parse_nonnegative_int(value: object, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(0, parsed)


def make_handler(
    index: CodexThreadIndex,
    bridge: CodexBridge,
    metadata: "ThreadMetadataStore",
    attachments: AttachmentStore,
) -> type[ThreadManagerHandler]:
    class BoundThreadManagerHandler(ThreadManagerHandler):
        pass

    BoundThreadManagerHandler.index = index
    BoundThreadManagerHandler.bridge = bridge
    BoundThreadManagerHandler.metadata = metadata
    BoundThreadManagerHandler.attachments = attachments
    return BoundThreadManagerHandler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local Web UI for Codex threads")
    parser.add_argument("--host", default="0.0.0.0", help="bind host, defaults to 0.0.0.0")
    parser.add_argument("--port", type=int, default=3217, help="bind port, defaults to 3217")
    parser.add_argument("--codex-home", type=Path, default=default_codex_home(), help="Codex home directory")
    args = parser.parse_args(argv)

    index = CodexThreadIndex(args.codex_home)
    index.rebuild()
    bridge = CodexBridge(PROJECT_ROOT)
    index.project_root = PROJECT_ROOT
    metadata = ThreadMetadataStore(args.codex_home / "codex-web-thread-metadata.json")
    attachments = AttachmentStore(PROJECT_ROOT / ".codex-web-uploads")

    server = ThreadingHTTPServer((args.host, args.port), make_handler(index, bridge, metadata, attachments))
    print(f"codex-web listening on http://{args.host}:{args.port}", flush=True)
    print(f"reading Codex data from {index.codex_home}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down", flush=True)
    finally:
        server.server_close()
        bridge.stop()
    return 0


def optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def required_str(body: dict[str, object], key: str) -> str:
    value = optional_str(body.get(key))
    if value is None:
        raise ValueError(f"{key} is required")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
