# Codex Web

一个本地 Codex Web 控制台。第一版目标很简单：

- 扫描 `~/.codex/state_5.sqlite`
- 补充扫描 `~/.codex/sessions` 和 `~/.codex/archived_sessions`
- `Threads` tab 展示 thread 列表、搜索、过滤、排序和详情预览
- `Web Chat` tab 通过本机 `codex app-server` 跟 Codex 交互，支持选择 CWD、模型、reasoning effort、Fast mode

默认监听所有网卡，允许同一局域网内的设备访问；Web Chat 中的 thread 操作会通过本机 `codex app-server` 执行。

## 启动

```bash
cd codex-web
python3 -m codex_threads_manager.server
```

可选参数：

```bash
python3 -m codex_threads_manager.server --port 3217 --codex-home ~/.codex
```

本机打开：

```text
http://127.0.0.1:3217
```

同一局域网的另一台机器打开：

```text
http://<这台机器的内网 IP>:3217
```

如果只想允许本机访问，可以显式绑定到 `127.0.0.1`：

```bash
python3 -m codex_threads_manager.server --host 127.0.0.1 --port 3217
```

## API

- `GET /api/stats`
- `GET /api/threads?q=&archived=active|archived|all&source=&cwd=&sort=updatedAt&dir=desc`
- `GET /api/threads/<id>`
- `POST /api/index/rebuild`
- `GET /api/codex/events`，Codex 事件 SSE 流
- `POST /api/codex/start`，启动新 Codex thread
- `POST /api/codex/resume`，恢复已有 Codex thread
- `POST /api/codex/turns`，按 cursor 分页读取 thread turns
- `POST /api/codex/turn`，向当前 thread 发送一轮输入
- `POST /api/codex/interrupt`，中断当前 turn
- `POST /api/codex/compact|review|fork|rollback|archive|rename|shell-command`，触发 Codex thread 操作

Codex 交互功能会由本服务按需启动：

```bash
codex app-server --listen stdio://
```
