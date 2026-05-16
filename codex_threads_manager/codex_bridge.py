from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class PendingRequest:
    event: threading.Event
    response: dict[str, Any] | None = None


class CodexBridgeError(RuntimeError):
    pass


class CodexBridge:
    def __init__(self, cwd: Path):
        self.cwd = cwd
        self.process: subprocess.Popen[str] | None = None
        self.lock = threading.RLock()
        self.next_id = 1
        self.pending: dict[Any, PendingRequest] = {}
        self.server_requests: dict[Any, dict[str, Any]] = {}
        self.subscribers: list[queue.Queue[dict[str, Any]]] = []
        self.started_at: float | None = None
        self.initialized = False
        self.last_error: str | None = None

    def ensure_started(self) -> None:
        with self.lock:
            if self.process and self.process.poll() is None and self.initialized:
                return
        self._start_locked()

    def status(self) -> dict[str, Any]:
        with self.lock:
            running = self.process is not None and self.process.poll() is None
            return {
                "running": running,
                "pid": self.process.pid if running and self.process else None,
                "initialized": self.initialized,
                "startedAt": self.started_at,
                "lastError": self.last_error,
                "pendingServerRequests": list(self.server_requests.values()),
            }

    def stop(self) -> None:
        with self.lock:
            process = self.process
            self.process = None
            self.initialized = False

        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()

    def restart(self) -> None:
        self.stop()
        self.ensure_started()

    def start_thread(
        self,
        cwd: str | None,
        model: str | None = None,
        effort: str | None = None,
        service_tier: str | None = None,
        ephemeral: bool = False,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "approvalPolicy": "never",
            "sandbox": "danger-full-access",
            "ephemeral": ephemeral,
            "serviceName": "codex_web",
            "serviceTier": service_tier,
        }
        if cwd:
            params["cwd"] = cwd
        if model:
            params["model"] = model
        if effort:
            params["config"] = {"model_reasoning_effort": effort}
        return self.request("thread/start", params)

    def resume_thread(
        self,
        thread_id: str,
        cwd: str | None = None,
        model: str | None = None,
        effort: str | None = None,
        service_tier: str | None = None,
        exclude_turns: bool = False,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "threadId": thread_id,
            "excludeTurns": exclude_turns,
            "approvalPolicy": "never",
            "sandbox": "danger-full-access",
            "serviceName": "codex_web",
            "serviceTier": service_tier,
        }
        if cwd:
            params["cwd"] = cwd
        if model:
            params["model"] = model
        if effort:
            params["config"] = {"model_reasoning_effort": effort}
        return self.request("thread/resume", params)

    def list_thread_turns(
        self,
        thread_id: str,
        cursor: str | None = None,
        limit: int | None = None,
        sort_direction: str | None = None,
        items_view: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"threadId": thread_id}
        if cursor:
            params["cursor"] = cursor
        if limit is not None:
            params["limit"] = limit
        if sort_direction:
            params["sortDirection"] = sort_direction
        if items_view:
            params["itemsView"] = items_view
        return self.request("thread/turns/list", params, timeout=120)

    def start_turn(
        self,
        thread_id: str,
        text: str,
        cwd: str | None = None,
        model: str | None = None,
        effort: str | None = None,
        service_tier: str | None = None,
        image_paths: list[str] | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "threadId": thread_id,
            "input": self._turn_input(text, image_paths),
            "approvalPolicy": "never",
            "sandboxPolicy": {"type": "dangerFullAccess"},
            "serviceTier": service_tier,
        }
        if cwd:
            params["cwd"] = cwd
        if model:
            params["model"] = model
        if effort:
            params["effort"] = effort
        return self.request("turn/start", params)

    def steer_turn(self, thread_id: str, turn_id: str, text: str, image_paths: list[str] | None = None) -> dict[str, Any]:
        return self.request(
            "turn/steer",
            {
                "threadId": thread_id,
                "expectedTurnId": turn_id,
                "input": self._turn_input(text, image_paths),
            },
        )

    @staticmethod
    def _turn_input(text: str, image_paths: list[str] | None = None) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        if text.strip():
            items.append({"type": "text", "text": text, "text_elements": []})
        for path in image_paths or []:
            items.append({"type": "localImage", "path": path})
        if not items:
            raise CodexBridgeError("turn input must include text or an image")
        return items

    def interrupt_turn(self, thread_id: str, turn_id: str) -> dict[str, Any]:
        return self.request("turn/interrupt", {"threadId": thread_id, "turnId": turn_id})

    def compact_thread(self, thread_id: str) -> dict[str, Any]:
        return self.request("thread/compact/start", {"threadId": thread_id}, timeout=120)

    def fork_thread(
        self,
        thread_id: str,
        cwd: str | None = None,
        model: str | None = None,
        effort: str | None = None,
        service_tier: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "threadId": thread_id,
            "approvalPolicy": "never",
            "sandbox": "danger-full-access",
            "serviceTier": service_tier,
        }
        if cwd:
            params["cwd"] = cwd
        if model:
            params["model"] = model
        if effort:
            params["config"] = {"model_reasoning_effort": effort}
        return self.request("thread/fork", params)

    def rollback_thread(self, thread_id: str, num_turns: int = 1) -> dict[str, Any]:
        return self.request("thread/rollback", {"threadId": thread_id, "numTurns": num_turns})

    def archive_thread(self, thread_id: str) -> dict[str, Any]:
        return self.request("thread/archive", {"threadId": thread_id})

    def rename_thread(self, thread_id: str, name: str) -> dict[str, Any]:
        return self.request("thread/name/set", {"threadId": thread_id, "name": name})

    def start_review(
        self,
        thread_id: str,
        target: dict[str, Any] | None = None,
        delivery: str | None = "inline",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "threadId": thread_id,
            "target": target or {"type": "uncommittedChanges"},
        }
        if delivery:
            params["delivery"] = delivery
        return self.request("review/start", params)

    def shell_command(self, thread_id: str, command: str) -> dict[str, Any]:
        return self.request("thread/shellCommand", {"threadId": thread_id, "command": command})

    def list_models(self) -> dict[str, Any]:
        return self.request("model/list", {"includeHidden": False, "limit": 100})

    def read_rate_limits(self) -> dict[str, Any]:
        return self.request("account/rateLimits/read")

    def respond_to_server_request(self, request_id: Any, decision: str) -> None:
        with self.lock:
            if request_id not in self.server_requests:
                raise CodexBridgeError(f"unknown server request id: {request_id}")
            self.server_requests.pop(request_id, None)
            self._send_locked({"id": request_id, "result": {"decision": decision}})

        self._broadcast(
            {
                "kind": "serverRequestResolved",
                "requestId": request_id,
                "decision": decision,
            }
        )

    def request(self, method: str, params: dict[str, Any] | None = None, timeout: float = 60) -> dict[str, Any]:
        self.ensure_started()
        request_id = self._next_request_id()
        pending = PendingRequest(event=threading.Event())

        with self.lock:
            self.pending[request_id] = pending
            self._send_locked({"id": request_id, "method": method, "params": params or {}})

        if not pending.event.wait(timeout):
            with self.lock:
                self.pending.pop(request_id, None)
            raise CodexBridgeError(f"timeout waiting for {method}")

        response = pending.response or {}
        if "error" in response:
            raise CodexBridgeError(json.dumps(response["error"], ensure_ascii=False))
        return response.get("result") or {}

    def subscribe(self) -> queue.Queue[dict[str, Any]]:
        subscriber: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=500)
        with self.lock:
            self.subscribers.append(subscriber)
        subscriber.put({"kind": "bridgeStatus", "status": self.status(), "ts": time.time()})
        return subscriber

    def unsubscribe(self, subscriber: queue.Queue[dict[str, Any]]) -> None:
        with self.lock:
            if subscriber in self.subscribers:
                self.subscribers.remove(subscriber)

    def _start_locked(self) -> None:
        self.stop()
        args = ["codex", "app-server", "--listen", "stdio://"]
        if os.environ.get("CODEX_THREADS_MANAGER_DISABLE_PLUGINS") == "1":
            args.extend(["--disable", "plugins"])

        try:
            self.process = subprocess.Popen(
                args,
                cwd=str(self.cwd),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            self.last_error = str(exc)
            raise CodexBridgeError(f"failed to start codex app-server: {exc}") from exc

        self.started_at = time.time()
        self.initialized = False
        self.last_error = None
        threading.Thread(target=self._read_stdout, name="codex-app-server-stdout", daemon=True).start()
        threading.Thread(target=self._read_stderr, name="codex-app-server-stderr", daemon=True).start()

        request_id = self._next_request_id()
        pending = PendingRequest(event=threading.Event())
        self.pending[request_id] = pending
        self._send_locked(
            {
                "id": request_id,
                "method": "initialize",
                "params": {
                    "clientInfo": {
                        "name": "codex_web",
                        "title": "Codex Web",
                        "version": "0.1.0",
                    },
                    "capabilities": {"experimentalApi": True},
                },
            }
        )
        if not pending.event.wait(20):
            self.pending.pop(request_id, None)
            raise CodexBridgeError("timeout waiting for initialize")

        response = pending.response or {}
        if "error" in response:
            raise CodexBridgeError(json.dumps(response["error"], ensure_ascii=False))
        result = response.get("result") or {}
        self._send_locked({"method": "initialized", "params": {}})
        self.initialized = True
        self._broadcast({"kind": "bridgeInitialized", "result": result})

    def _next_request_id(self) -> int:
        with self.lock:
            request_id = self.next_id
            self.next_id += 1
            return request_id

    def _send_locked(self, payload: dict[str, Any]) -> None:
        if not self.process or not self.process.stdin or self.process.poll() is not None:
            raise CodexBridgeError("codex app-server is not running")
        line = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        self.process.stdin.write(f"{line}\n")
        self.process.stdin.flush()

    def _read_stdout(self) -> None:
        process = self.process
        if not process or not process.stdout:
            return
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                self._broadcast({"kind": "stdout", "line": line})
                continue
            self._handle_message(message)

    def _read_stderr(self) -> None:
        process = self.process
        if not process or not process.stderr:
            return
        for line in process.stderr:
            line = line.rstrip("\n")
            if line:
                self._broadcast({"kind": "stderr", "line": line})

    def _handle_message(self, message: dict[str, Any]) -> None:
        if "id" in message and ("result" in message or "error" in message):
            request_id = message.get("id")
            with self.lock:
                pending = self.pending.pop(request_id, None)
            if pending:
                pending.response = message
                pending.event.set()
                self._broadcast({"kind": "response", "response": redact_large_payload(message)})
            else:
                self._broadcast({"kind": "response", "response": redact_large_payload(message)})
            return

        if "id" in message and "method" in message:
            request_id = message.get("id")
            with self.lock:
                self.server_requests[request_id] = message
            self._broadcast({"kind": "serverRequest", "request": message})
            return

        self._broadcast({"kind": "notification", "notification": message})

    def _broadcast(self, event: dict[str, Any]) -> None:
        event = {"ts": time.time(), **event}
        with self.lock:
            subscribers = list(self.subscribers)

        for subscriber in subscribers:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                try:
                    subscriber.get_nowait()
                    subscriber.put_nowait(event)
                except queue.Empty:
                    pass


def redact_large_payload(message: dict[str, Any]) -> dict[str, Any]:
    text = json.dumps(message, ensure_ascii=False)
    if len(text) <= 20000:
        return message
    return {
        "id": message.get("id"),
        "result": {"_truncated": True},
    }
