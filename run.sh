#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="$SCRIPT_DIR/.codex-web.pid"
LOG_FILE="$SCRIPT_DIR/codex-web.log"
PYTHON_BIN="${PYTHON_BIN:-python3}"
HOST="${CODEX_WEB_HOST:-0.0.0.0}"
PORT="${CODEX_WEB_PORT:-3217}"

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

start() {
  if is_running; then
    echo "Codex Web 已在运行 (PID $(cat "$PID_FILE"))，端口 $PORT。"
    return 0
  fi
  rm -f "$PID_FILE"
  echo "启动 Codex Web ($HOST:$PORT)..."
  nohup "$PYTHON_BIN" -m codex_threads_manager.server \
    --host "$HOST" --port "$PORT" "$@" \
    >> "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  sleep 0.5
  if kill -0 "$pid" 2>/dev/null; then
    echo "已启动 PID $pid，日志: $LOG_FILE"
    echo "本机访问: http://127.0.0.1:$PORT"
  else
    echo "启动失败，请查看日志: $LOG_FILE" >&2
    rm -f "$PID_FILE"
    return 1
  fi
}

stop() {
  if ! is_running; then
    echo "Codex Web 未在运行。"
    rm -f "$PID_FILE"
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  echo "停止 Codex Web (PID $pid)..."
  kill "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "进程未在 4 秒内退出，发送 SIGKILL..."
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "已停止。"
}

status() {
  if is_running; then
    echo "运行中 (PID $(cat "$PID_FILE"))，端口 $PORT。"
  else
    echo "未运行。"
    return 1
  fi
}

usage() {
  cat <<EOF
用法: $(basename "$0") {start|stop|restart|status} [-- 额外参数透传给 server]

环境变量:
  CODEX_WEB_HOST   绑定地址，默认 0.0.0.0
  CODEX_WEB_PORT   监听端口，默认 3217
  PYTHON_BIN       Python 解释器，默认 python3

日志: $LOG_FILE
PID:  $PID_FILE
EOF
}

cmd="${1:-}"
shift || true
case "$cmd" in
  start)   start "$@" ;;
  stop)    stop ;;
  restart) stop; start "$@" ;;
  status)  status ;;
  ""|-h|--help|help) usage ;;
  *) echo "未知命令: $cmd" >&2; usage; exit 2 ;;
esac
