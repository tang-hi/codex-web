from __future__ import annotations

import argparse
import json
import mimetypes
import queue
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

        if parsed.path == "/api/codex/archive":
            self.handle_codex_archive()
            return

        if parsed.path == "/api/codex/rename":
            self.handle_codex_rename()
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

    def handle_codex_archive(self) -> None:
        try:
            body = self.read_json_body()
            result = self.bridge.archive_thread(required_str(body, "threadId"))
            self.send_json(result)
        except (CodexBridgeError, ValueError) as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def handle_codex_rename(self) -> None:
        try:
            body = self.read_json_body()
            result = self.bridge.rename_thread(required_str(body, "threadId"), required_str(body, "name"))
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


def make_handler(index: CodexThreadIndex, bridge: CodexBridge) -> type[ThreadManagerHandler]:
    class BoundThreadManagerHandler(ThreadManagerHandler):
        pass

    BoundThreadManagerHandler.index = index
    BoundThreadManagerHandler.bridge = bridge
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

    server = ThreadingHTTPServer((args.host, args.port), make_handler(index, bridge))
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
