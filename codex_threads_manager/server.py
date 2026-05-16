from __future__ import annotations

import argparse
import difflib
import json
import mimetypes
import queue
import re
import shlex
import sys
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .codex_bridge import CodexBridge
from .codex_bridge import CodexBridgeError
from .indexer import CodexThreadIndex, default_codex_home


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = PROJECT_ROOT / "static"


class ThreadManagerHandler(BaseHTTPRequestHandler):
    index: CodexThreadIndex
    bridge: CodexBridge
    metadata: "ThreadMetadataStore"

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
            turn = None
            if message:
                thread_id = result.get("thread", {}).get("id")
                if thread_id:
                    turn = self.bridge.start_turn(
                        thread_id,
                        message,
                        optional_str(body.get("cwd")),
                        optional_str(body.get("model")),
                        optional_str(body.get("effort")),
                        optional_str(body.get("serviceTier")),
                    )
            self.send_json({"threadStart": result, "turnStart": turn})
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
            text = required_str(body, "text")
            result = self.bridge.start_turn(
                thread_id,
                text,
                optional_str(body.get("cwd")),
                optional_str(body.get("model")),
                optional_str(body.get("effort")),
                optional_str(body.get("serviceTier")),
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
                required_str(body, "text"),
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
            suggestions = personalization_suggestions(self.index, self.metadata, body)
            self.send_json({"suggestions": suggestions})
        except ValueError as exc:
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


def personalization_suggestions(index: CodexThreadIndex, metadata: ThreadMetadataStore, body: dict[str, object]) -> list[dict[str, object]]:
    scope = optional_str(body.get("scope")) or "current_project"
    include_values = body.get("include")
    include = set(include_values if isinstance(include_values, list) else ["active", "archived"])
    project_path = optional_str(body.get("projectPath")) or ""
    selected_ids = body.get("selectedThreadIds") if isinstance(body.get("selectedThreadIds"), list) else []
    selected = {optional_str(value) for value in selected_ids if optional_str(value)}
    now = time.time()
    cutoff = now - 30 * 24 * 60 * 60

    if scope == "selected_thread" and not selected:
        raise ValueError("select at least one thread")

    records = []
    for record in index.records.values():
        visibility = metadata.visibility(record.id)
        if visibility not in include:
            continue
        if scope == "current_project" and project_path and record.cwd != project_path:
            continue
        if scope == "selected_thread" and record.id not in selected:
            continue
        if scope == "last_30_days" and (record.updated_at or record.file_mtime or 0) < cutoff:
            continue
        records.append(record)

    records.sort(key=lambda item: item.updated_at or item.file_mtime or 0, reverse=True)
    samples = thread_text_samples(index, records[:80])
    return derive_personalization_suggestions(records, samples, project_path)


def thread_text_samples(index: CodexThreadIndex, records: list[object]) -> list[str]:
    samples: list[str] = []
    for record in records:
        thread = index.get_thread(record.id)
        if not thread:
            continue
        parts = [thread.get("title") or "", thread.get("preview") or ""]
        for message in thread.get("messages") or []:
            if isinstance(message, dict):
                parts.append(optional_str(message.get("text")) or "")
        text = "\n".join(part for part in parts if part)
        if text:
            samples.append(text[:8000])
    return samples


def derive_personalization_suggestions(records: list[object], samples: list[str], project_path: str) -> list[dict[str, object]]:
    corpus = "\n".join(samples)
    lowered = corpus.casefold()
    suggestions: list[dict[str, object]] = []

    def add(id_: str, category: str, target: str, text: str, evidence: str) -> None:
        suggestions.append(
            {
                "id": id_,
                "category": category,
                "target": target,
                "text": text,
                "evidence": evidence,
                "selected": True,
            }
        )

    if re.search(r"小步|小改|minimal|focused|不要.*重构|unrelated|不要大规模", lowered):
        add("minimal-diffs", "Coding preferences", "global", "Prefer focused, minimal diffs and avoid unrelated refactors unless explicitly requested.", "Detected repeated requests for small scoped changes.")
    if re.search(r"检查|验证|验收|node --check|pytest|ctest|run\\.sh|编译|测试", lowered):
        add("verification-summary", "Review preferences", "global", "Include concise verification commands and results when finishing implementation work.", "Detected repeated emphasis on checks, builds, or acceptance.")
    if re.search(r"前因后果|从哪里开始|解释|看代码|阅读", lowered):
        add("explain-causally", "Learning preferences", "global", "When explaining code, start from entry points and describe the causal chain before implementation details.", "Detected code-reading and explanation-oriented threads.")
    if "codex-web" in project_path or any(getattr(record, "cwd", "") == PROJECT_ROOT.as_posix() for record in records):
        add("codex-web-js-check", "Project workflow", "project", "For frontend JavaScript edits, run `node --check static/app.js` before finishing.", "Current project uses a single static JavaScript entrypoint.")
        add("codex-web-local-thread-metadata", "Project conventions", "project", "Thread rename, archive, hide, and restore are local metadata operations; do not call Codex rename, delete, or archive APIs for them.", "Detected codex-web thread-management requirements.")
    if re.search(r"openclash|router|路由|配置|当前配置", lowered):
        add("inspect-live-config", "Operational preferences", "global", "For router or local-machine troubleshooting, inspect live state before giving generic advice.", "Detected operational troubleshooting threads.")

    if not suggestions:
        add("default-focused-work", "Coding preferences", "global", "Keep changes scoped to the requested behavior and report verification clearly.", f"Learned from {len(records)} selected threads.")
    return suggestions


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


def make_handler(index: CodexThreadIndex, bridge: CodexBridge, metadata: "ThreadMetadataStore") -> type[ThreadManagerHandler]:
    class BoundThreadManagerHandler(ThreadManagerHandler):
        pass

    BoundThreadManagerHandler.index = index
    BoundThreadManagerHandler.bridge = bridge
    BoundThreadManagerHandler.metadata = metadata
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

    server = ThreadingHTTPServer((args.host, args.port), make_handler(index, bridge, metadata))
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
