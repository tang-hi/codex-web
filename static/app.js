const state = {
  items: [],
  facets: { sources: [], cwds: [] },
  selectedId: null,
  models: [],
  modelsLoaded: false,
  codex: {
    threadId: null,
    turnId: null,
    activity: "",
    bridge: {
      running: false,
      initialized: false,
      pid: null,
      label: "Codex idle",
      lastError: "",
    },
    threadStatus: "",
    threadStatusMessage: "",
    tokenUsage: null,
    rateLimits: [],
    rateLimitError: "",
    eventSource: null,
    agentMessages: {},
    itemNodes: {},
    reasoningNodes: {},
    reasoningBuffers: {},
    commandOutputs: {},
    planDeltas: {},
    approvalNodes: {},
    latestDiff: "",
  },
};

const els = {
  threadsTabButton: document.getElementById("threadsTabButton"),
  chatTabButton: document.getElementById("chatTabButton"),
  threadsTab: document.getElementById("threadsTab"),
  chatTab: document.getElementById("chatTab"),
  subtitle: document.getElementById("subtitle"),
  stats: document.getElementById("stats"),
  filters: document.getElementById("filters"),
  q: document.getElementById("q"),
  archived: document.getElementById("archived"),
  source: document.getElementById("source"),
  cwd: document.getElementById("cwd"),
  sort: document.getElementById("sort"),
  threadRows: document.getElementById("threadRows"),
  emptyState: document.getElementById("emptyState"),
  details: document.getElementById("details"),
  rebuildButton: document.getElementById("rebuildButton"),
  codexStatus: document.getElementById("codexStatus"),
  chatThread: document.getElementById("chatThread"),
  chatSessionValue: document.getElementById("chatSessionValue"),
  chatSessionMeta: document.getElementById("chatSessionMeta"),
  chatContextValue: document.getElementById("chatContextValue"),
  chatContextMeta: document.getElementById("chatContextMeta"),
  chatContextBar: document.getElementById("chatContextBar"),
  chatLimitValue: document.getElementById("chatLimitValue"),
  chatLimitMeta: document.getElementById("chatLimitMeta"),
  chatLimitBar: document.getElementById("chatLimitBar"),
  chatCwd: document.getElementById("chatCwd"),
  chatLog: document.getElementById("chatLog"),
  chatComposer: document.getElementById("chatComposer"),
  chatInput: document.getElementById("chatInput"),
  chatCwdButton: document.getElementById("chatCwdButton"),
  chatCwdMenu: document.getElementById("chatCwdMenu"),
  chatModel: document.getElementById("chatModel"),
  chatModelButton: document.getElementById("chatModelButton"),
  chatModelMenu: document.getElementById("chatModelMenu"),
  chatEffort: document.getElementById("chatEffort"),
  chatEffortButton: document.getElementById("chatEffortButton"),
  chatEffortMenu: document.getElementById("chatEffortMenu"),
  chatFastMode: document.getElementById("chatFastMode"),
  chatFastLabel: document.getElementById("chatFastLabel"),
  newCodexThread: document.getElementById("newCodexThread"),
  resumeCodexThread: document.getElementById("resumeCodexThread"),
  resumeMenuButton: document.getElementById("resumeMenuButton"),
  resumePopover: document.getElementById("resumePopover"),
  resumeThreadId: document.getElementById("resumeThreadId"),
  interruptCodexTurn: document.getElementById("interruptCodexTurn"),
};

let searchTimer = null;
const markdownRenderer = createMarkdownRenderer();

function createMarkdownRenderer() {
  if (!window.markdownit) return null;

  const renderer = window.markdownit({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
  });
  const defaultLinkOpen =
    renderer.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  renderer.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    setTokenAttr(tokens[idx], "target", "_blank");
    setTokenAttr(tokens[idx], "rel", "noreferrer");
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return renderer;
}

function setTokenAttr(token, name, value) {
  const attrIndex = token.attrIndex(name);
  if (attrIndex < 0) {
    token.attrPush([name, value]);
    return;
  }
  token.attrs[attrIndex][1] = value;
}

async function api(path, options) {
  const res = await fetch(path, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(errorMessageFromResponse(res, text));
  }
  return text ? JSON.parse(text) : {};
}

function errorMessageFromResponse(res, text) {
  if (text) {
    try {
      const payload = JSON.parse(text);
      if (payload.error) return `${res.status} ${res.statusText}: ${payload.error}`;
    } catch (_error) {
      return `${res.status} ${res.statusText}: ${text.slice(0, 300)}`;
    }
  }
  return `${res.status} ${res.statusText}`;
}

function postJson(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
}

function params() {
  const query = new URLSearchParams();
  query.set("archived", els.archived.value);
  query.set("sort", els.sort.value);
  query.set("dir", "desc");
  query.set("limit", "300");
  if (els.q.value.trim()) query.set("q", els.q.value.trim());
  if (els.source.value) query.set("source", els.source.value);
  if (els.cwd.value) query.set("cwd", els.cwd.value);
  return query.toString();
}

async function loadStats() {
  const stats = await api("/api/stats");
  els.subtitle.textContent = `${stats.codexHome} · indexed ${formatNumber(stats.total)} threads`;
  els.stats.innerHTML = `
    <div><b>${formatNumber(stats.total)}</b><span>Total</span></div>
    <div><b>${formatNumber(stats.active)}</b><span>Active</span></div>
    <div><b>${formatNumber(stats.archived)}</b><span>Archived</span></div>
    <div><b>${formatNumber(stats.sources.length)}</b><span>Sources</span></div>
  `;
}

async function loadThreads() {
  const data = await api(`/api/threads?${params()}`);
  state.items = data.items;
  state.facets = data.facets;
  populateFacets();
  renderRows();
}

function populateFacets() {
  populateSelect(els.source, state.facets.sources, "All sources");
  populateSelect(els.cwd, state.facets.cwds, "All directories");
  populateChatCwdSelect(state.facets.cwds);
}

function populateSelect(select, values, emptyLabel) {
  const current = select.value;
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = emptyLabel;
  select.appendChild(empty);

  for (const item of values) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = `${item.value} (${item.count})`;
    select.appendChild(option);
  }
  select.value = [...select.options].some((option) => option.value === current) ? current : "";
}

function populateChatCwdSelect(values) {
  const current = els.chatCwd.value;
  const items = values
    .filter((item) => item.value && item.value !== "(no cwd)")
    .map((item) => ({
      value: item.value,
      label: shortPath(item.value),
      description: `${item.count} threads`,
    }));

  if (items.length === 0) {
    els.chatCwd.value = "";
    renderChoiceMenu(els.chatCwdMenu, [{ value: "", label: "No directories found", description: "" }], "", () => {});
    syncCwdButton();
    return;
  }

  const hasCurrent = items.some((item) => item.value === current);
  els.chatCwd.value = hasCurrent ? current : items[0].value;
  renderChoiceMenu(els.chatCwdMenu, items, els.chatCwd.value, selectCwd);
  syncCwdButton();
}

function renderRows() {
  els.threadRows.innerHTML = "";
  els.emptyState.hidden = state.items.length !== 0;

  for (const item of state.items) {
    const tr = document.createElement("tr");
    tr.className = item.id === state.selectedId ? "selected" : "";
    tr.innerHTML = `
      <td class="thread-cell">
        <div class="thread-title">${escapeHtml(item.title || item.preview || item.id)}</div>
        <div class="thread-preview">${escapeHtml(item.preview || "")}</div>
        <div class="thread-meta">${escapeHtml(item.id)}${item.archived ? " · archived" : ""}</div>
      </td>
      <td>${formatDate(item.updatedAtIso || item.fileMtimeIso)}</td>
      <td class="cwd-cell" title="${escapeAttr(item.cwd || "")}">${escapeHtml(shortPath(item.cwd))}</td>
      <td><span class="pill">${escapeHtml(sourceLabel(item))}</span></td>
      <td>${escapeHtml(item.fileSizeLabel || "")}</td>
      <td><button type="button" data-id="${escapeAttr(item.id)}">View</button></td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target instanceof HTMLButtonElement) {
        event.stopPropagation();
      }
      selectThread(item.id);
    });
    tr.querySelector("button").addEventListener("click", () => selectThread(item.id));
    els.threadRows.appendChild(tr);
  }
}

async function selectThread(id) {
  state.selectedId = id;
  renderRows();
  els.details.innerHTML = `<div class="details-empty">Loading...</div>`;
  const item = await api(`/api/threads/${encodeURIComponent(id)}`);
  renderDetails(item);
}

function renderDetails(item) {
  const resumeCommand = `codex resume ${item.id}`;
  const messages = item.messages || [];
  els.details.innerHTML = `
    <div class="details-header">
      <div>
        <h2>${escapeHtml(item.title || item.preview || item.id)}</h2>
        <p>${escapeHtml(item.id)}</p>
      </div>
      <div class="details-actions">
        <button type="button" data-copy="${escapeAttr(item.id)}">Copy ID</button>
        <button type="button" data-copy="${escapeAttr(resumeCommand)}">Copy Resume</button>
      </div>
    </div>

    <dl class="meta-grid">
      <div><dt>Status</dt><dd>${item.archived ? "Archived" : "Active"}</dd></div>
      <div><dt>Updated</dt><dd>${escapeHtml(formatDateTime(item.updatedAtIso || item.fileMtimeIso))}</dd></div>
      <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(item.createdAtIso))}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(item.source || "unknown")}</dd></div>
      <div><dt>Agent</dt><dd>${escapeHtml([item.agent_nickname, item.agent_role].filter(Boolean).join(" · "))}</dd></div>
      <div><dt>Model</dt><dd>${escapeHtml([item.model_provider, item.model].filter(Boolean).join(" · ") || "")}</dd></div>
      <div><dt>Branch</dt><dd>${escapeHtml(item.git_branch || "")}</dd></div>
      <div class="wide"><dt>CWD</dt><dd>${escapeHtml(item.cwd || "")}</dd></div>
      <div class="wide"><dt>Rollout</dt><dd>${escapeHtml(item.rollout_path || "")}</dd></div>
    </dl>

    <section class="messages">
      <h3>Preview</h3>
      ${messages.length ? messages.map(renderMessage).join("") : '<div class="details-empty">No message preview available.</div>'}
    </section>
  `;

  for (const button of els.details.querySelectorAll("[data-copy]")) {
    button.addEventListener("click", () => copyText(button.getAttribute("data-copy")));
  }
}

function renderMessage(message) {
  return `
    <article class="message ${escapeAttr(message.role)}">
      <div class="message-top">
        <span>${escapeHtml(message.role)}</span>
        <time>${escapeHtml(formatDateTime(message.timestamp))}</time>
      </div>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `;
}

async function rebuild() {
  els.rebuildButton.disabled = true;
  els.rebuildButton.textContent = "Rebuilding...";
  try {
    await api("/api/index/rebuild", { method: "POST" });
    await loadStats();
    await loadThreads();
  } finally {
    els.rebuildButton.disabled = false;
    els.rebuildButton.textContent = "Rebuild";
  }
}

function startCodexEvents() {
  if (state.codex.eventSource) {
    state.codex.eventSource.close();
  }
  const source = new EventSource("/api/codex/events");
  state.codex.eventSource = source;
  source.onopen = () => setCodexStatus("Codex event stream connected");
  source.onerror = () => setCodexStatus("Codex event stream disconnected");
  source.onmessage = (event) => {
    try {
      handleCodexEvent(JSON.parse(event.data));
    } catch (error) {
      appendChatLine("error", `Bad event: ${error.message}`);
    }
  };
}

async function refreshCodexStatus() {
  const status = await api("/api/codex/status");
  applyBridgeStatus(status);
}

async function refreshRateLimits() {
  const data = await api("/api/codex/rate-limits");
  state.codex.rateLimitError = "";
  updateRateLimits(data);
}

async function loadCodexModels() {
  if (state.modelsLoaded) return;
  const data = await api("/api/codex/models");
  state.models = data.data || [];
  state.modelsLoaded = true;
  populateModelSelect();
  refreshRateLimits().catch((error) => {
    state.codex.rateLimitError = error.message;
    state.codex.rateLimits = [];
    renderChatStatus();
    console.debug("[codex rate limits]", error.message);
  });
}

function populateModelSelect() {
  const defaultModel = state.models.find((model) => model.isDefault) || state.models[0];
  if (defaultModel) {
    els.chatModel.value = defaultModel.model || defaultModel.id;
  }
  renderChoiceMenu(
    els.chatModelMenu,
    state.models.map((model) => ({
      value: model.model || model.id,
      label: model.displayName || model.model || model.id,
      description: model.description || "",
    })),
    els.chatModel.value,
    selectModel,
  );
  syncModelButton();
  updateEffortOptions();
}

function selectedModelInfo() {
  return state.models.find((model) => (model.model || model.id) === els.chatModel.value) || null;
}

function selectCwd(value) {
  els.chatCwd.value = value || "";
  closeChoiceMenus();
  syncCwdButton();
}

function syncCwdButton() {
  const value = els.chatCwd.value;
  const label = value ? shortPath(value) : "No directory";
  els.chatCwdButton.querySelector("strong").textContent = `Working Directory: ${label}`;
  els.chatCwdButton.title = value || label;
  markChoiceMenuSelection(els.chatCwdMenu, value);
}

function updateEffortOptions() {
  const model = selectedModelInfo();
  const efforts = model ? model.supportedReasoningEfforts || [] : [];
  const items = [];

  if (efforts.length === 0) {
    els.chatEffort.value = "";
    items.push({ value: "", label: "Default", description: "" });
  } else {
    for (const effort of efforts) {
      items.push({
        value: effort.reasoningEffort,
        label: effort.reasoningEffort,
        description: effort.description || "",
      });
    }
    els.chatEffort.value = model.defaultReasoningEffort || efforts[0].reasoningEffort;
  }

  renderChoiceMenu(els.chatEffortMenu, items, els.chatEffort.value, selectEffort);
  syncEffortButton();
  updateFastModeControl();
}

function selectModel(value) {
  els.chatModel.value = value || "";
  closeChoiceMenus();
  syncModelButton();
  updateEffortOptions();
}

function selectEffort(value) {
  els.chatEffort.value = value || "";
  closeChoiceMenus();
  syncEffortButton();
}

function syncModelButton() {
  const model = selectedModelInfo();
  const label = model ? model.displayName || model.model || model.id : "Model";
  els.chatModelButton.querySelector("strong").textContent = `Model: ${label}`;
  els.chatModelButton.title = model?.description || label;
  markChoiceMenuSelection(els.chatModelMenu, els.chatModel.value);
}

function syncEffortButton() {
  const label = els.chatEffort.value || "Default";
  els.chatEffortButton.querySelector("strong").textContent = `Reasoning: ${label}`;
  markChoiceMenuSelection(els.chatEffortMenu, els.chatEffort.value);
}

function renderChoiceMenu(menu, items, selectedValue, onSelect) {
  menu.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-menu-item";
    button.dataset.value = item.value || "";
    button.setAttribute("role", "menuitemradio");
    button.innerHTML = `
      <strong>${escapeHtml(item.label)}</strong>
      ${item.description ? `<span>${escapeHtml(item.description)}</span>` : ""}
    `;
    button.addEventListener("click", () => onSelect(item.value));
    menu.appendChild(button);
  }
  markChoiceMenuSelection(menu, selectedValue);
}

function markChoiceMenuSelection(menu, value) {
  for (const item of menu.querySelectorAll(".choice-menu-item")) {
    const selected = item.dataset.value === String(value || "");
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-checked", selected ? "true" : "false");
  }
}

function toggleChoiceMenu(menu, button) {
  const willOpen = menu.hidden;
  closeChoiceMenus();
  menu.hidden = !willOpen;
  button.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closeChoiceMenus() {
  for (const [button, menu] of [
    [els.chatCwdButton, els.chatCwdMenu],
    [els.chatModelButton, els.chatModelMenu],
    [els.chatEffortButton, els.chatEffortMenu],
  ]) {
    if (!button || !menu) continue;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
  closeResumePopover();
}

function toggleResumePopover() {
  const willOpen = els.resumePopover.hidden;
  closeChoiceMenus();
  els.resumePopover.hidden = !willOpen;
  els.resumeMenuButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
  if (willOpen) els.resumeThreadId.focus();
}

function closeResumePopover() {
  els.resumePopover.hidden = true;
  els.resumeMenuButton.setAttribute("aria-expanded", "false");
}

function updateFastModeControl() {
  const tier = selectedFastTier();
  els.chatFastMode.disabled = !tier;
  els.chatFastMode.checked = Boolean(tier);
  els.chatFastLabel.textContent = tier ? "Fast" : "Fast unavailable";
  els.chatFastLabel.title = tier ? tier.description || tier.name || tier.id || "Fast" : "";
  els.chatFastMode.closest(".fast-toggle").classList.toggle("on", els.chatFastMode.checked && !els.chatFastMode.disabled);
  els.chatFastMode.closest(".fast-toggle").classList.toggle("disabled", els.chatFastMode.disabled);
}

function selectedFastTier() {
  const model = selectedModelInfo();
  if (!model) return null;
  const serviceTiers = model.serviceTiers || [];
  if (serviceTiers.length > 0) return serviceTiers[0];
  const legacyTier = (model.additionalSpeedTiers || [])[0];
  return legacyTier ? { id: legacyTier, name: "Fast", description: legacyTier } : null;
}

function chatOptions() {
  const tier = selectedFastTier();
  return {
    cwd: els.chatCwd.value.trim(),
    model: els.chatModel.value || null,
    effort: els.chatEffort.value || null,
    serviceTier: els.chatFastMode.checked && tier ? tier.id : null,
  };
}

function handleCodexEvent(event) {
  if (event.kind === "bridgeStatus") {
    applyBridgeStatus(event.status || {});
    return;
  }
  if (event.kind === "bridgeInitialized") {
    state.codex.bridge.initialized = true;
    state.codex.bridge.running = true;
    setCodexStatus("Codex ready");
    return;
  }
  if (event.kind === "stderr") {
    console.debug("[codex]", event.line);
    return;
  }
  if (event.kind === "serverRequest") {
    renderServerRequest(event.request);
    return;
  }
  if (event.kind === "serverRequestResolved") {
    resolveApprovalCard(event.requestId, event.decision);
    return;
  }
  if (event.kind !== "notification") return;

  const message = event.notification || {};
  const method = message.method;
  const params = message.params || {};

  if (method === "configWarning") {
    appendChatLine("warning", params.summary || "Config warning");
    return;
  }
  if (method === "warning" || method === "guardianWarning" || method === "deprecationNotice") {
    appendChatLine("warning", params.message || params.summary || method);
    return;
  }
  if (method === "serverRequest/resolved") {
    resolveApprovalCard(params.requestId, "resolved");
    return;
  }
  if (method === "thread/started") {
    const id = params.thread && params.thread.id;
    if (id) setActiveThread(id);
    setChatActivity("");
    return;
  }
  if (method === "thread/status/changed") {
    updateThreadStatus(params);
    return;
  }
  if (method === "turn/started") {
    state.codex.turnId = params.turn && params.turn.id;
    els.interruptCodexTurn.disabled = !state.codex.turnId;
    setChatActivity("Working");
    return;
  }
  if (method === "turn/completed") {
    const status = params.turn && params.turn.status;
    if (status && !isSuccessStatus(status)) {
      appendChatLine("error", `Turn ${status}`);
    }
    state.codex.turnId = null;
    els.interruptCodexTurn.disabled = true;
    setChatActivity("");
    return;
  }
  if (method === "turn/plan/updated") {
    renderPlan(params.plan || [], params.explanation || "");
    return;
  }
  if (method === "turn/diff/updated") {
    state.codex.latestDiff = params.diff || "";
    renderDiffCard(state.codex.latestDiff, "Turn diff");
    setChatActivity("Diff updated");
    return;
  }
  if (method === "thread/tokenUsage/updated") {
    updateTokenUsage(params);
    return;
  }
  if (method === "account/rateLimits/updated") {
    updateRateLimits(params);
    return;
  }
  if (method === "item/agentMessage/delta") {
    appendAgentDelta(params.itemId || "agent", params.delta || "");
    return;
  }
  if (method === "item/plan/delta") {
    appendPlanDelta(params.itemId || "plan", params.delta || "");
    return;
  }
  if (method === "item/commandExecution/outputDelta") {
    appendCommandOutput(params.itemId || params.id || "command", params.delta || "");
    return;
  }
  if (method === "item/fileChange/outputDelta") {
    appendFileChangeDelta(params.itemId || params.id || "file-change", params.delta || "");
    return;
  }
  if (method === "item/fileChange/patchUpdated") {
    renderFileChangePatch(params);
    return;
  }
  if (method === "item/reasoning/summaryTextDelta") {
    appendReasoningDelta(params.itemId || "reasoning", params.delta || "");
    return;
  }
  if (method === "item/reasoning/textDelta" || method === "item/reasoning/summaryPartAdded") {
    return;
  }
  if (method === "item/started" || method === "item/completed") {
    const item = params.item || {};
    upsertCodexItem(item, method.endsWith("started") ? "started" : "completed");
    return;
  }
  if (method === "thread/compacted") {
    appendCompactInfo("Context compacted");
    return;
  }
  if (method === "model/rerouted") {
    appendCompactInfo(params.message || "Model rerouted");
    return;
  }
  if (method === "error") {
    appendChatLine("error", params.error?.message || JSON.stringify(params, null, 2));
  }
}

async function startNewCodexThread(clearTranscript = true) {
  await loadCodexModels();
  const result = await postJson("/api/codex/start", chatOptions());
  const id = result.threadStart && result.threadStart.thread && result.threadStart.thread.id;
  if (clearTranscript) resetChatTranscript();
  if (id) setActiveThread(id);
  setChatActivity("Ready");
}

function switchTab(tab) {
  const chatActive = tab === "chat";
  els.threadsTab.hidden = chatActive;
  els.chatTab.hidden = !chatActive;
  els.threadsTab.classList.toggle("active", !chatActive);
  els.chatTab.classList.toggle("active", chatActive);
  els.threadsTabButton.classList.toggle("active", !chatActive);
  els.chatTabButton.classList.toggle("active", chatActive);
  if (chatActive) {
    loadCodexModels().catch((error) => appendChatLine("error", error.message));
  }
}

async function resumeCodexThreadById() {
  await loadCodexModels();
  const threadId = els.resumeThreadId.value.trim();
  if (!threadId) {
    appendChatLine("warning", "Enter a thread id first.");
    return;
  }
  const result = await postJson("/api/codex/resume", { threadId, ...chatOptions() });
  const id = result.thread && result.thread.id;
  resetChatTranscript();
  if (id) setActiveThread(id);
  renderResumedThread(result);
  closeResumePopover();
  setChatActivity("Ready");
}

async function sendCodexMessage(event) {
  event.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = "";
  autoSizeChatInput();
  appendChatLine("user", text);

  try {
    await loadCodexModels();
    if (!state.codex.threadId) {
      await startNewCodexThread(false);
    }
    const body = { threadId: state.codex.threadId, text, ...chatOptions() };
    if (state.codex.turnId) {
      await postJson("/api/codex/steer", { ...body, turnId: state.codex.turnId });
    } else {
      await postJson("/api/codex/turn", body);
    }
  } catch (error) {
    appendChatLine("error", error.message);
  }
}

async function interruptCodexTurn() {
  if (!state.codex.threadId || !state.codex.turnId) return;
  try {
    await postJson("/api/codex/interrupt", {
      threadId: state.codex.threadId,
      turnId: state.codex.turnId,
    });
    setChatActivity("Interrupt requested");
  } catch (error) {
    appendChatLine("error", error.message);
  }
}

function renderServerRequest(request) {
  const params = request.params || {};
  const requestId = request.id || params.requestId || `approval-${Object.keys(state.codex.approvalNodes).length}`;
  const box = document.createElement("article");
  box.className = "transcript-event approval";
  box.id = `approval-${safeId(requestId)}`;
  const title = document.createElement("div");
  title.className = "event-title";
  title.innerHTML = `<span>${escapeHtml(approvalTitle(request.method, params))}</span><em>approval</em>`;
  const details = document.createElement("details");
  details.className = "approval-details";
  const summary = document.createElement("summary");
  summary.textContent = approvalSummary(params);
  const body = document.createElement("pre");
  body.textContent = JSON.stringify(params, null, 2);
  details.append(summary, body);
  const actions = document.createElement("div");
  actions.className = "approval-actions";
  const accept = document.createElement("button");
  accept.type = "button";
  accept.textContent = "Accept";
  const decline = document.createElement("button");
  decline.type = "button";
  decline.textContent = "Decline";
  accept.addEventListener("click", () => resolveApproval(requestId, "accept", box));
  decline.addEventListener("click", () => resolveApproval(requestId, "decline", box));
  actions.append(accept, decline);
  box.append(title, details, actions);
  state.codex.approvalNodes[requestId] = box;
  els.chatLog.appendChild(box);
  scrollChatToBottom();
}

async function resolveApproval(requestId, decision, box) {
  try {
    await postJson("/api/codex/approval", { requestId, decision });
    resolveApprovalCard(requestId, decision, box);
  } catch (error) {
    appendChatLine("error", error.message);
  }
}

function resolveApprovalCard(requestId, decision, node) {
  const box = node || state.codex.approvalNodes[requestId];
  if (!box) return;
  box.classList.add("resolved");
  const title = box.querySelector(".event-title em");
  if (title) title.textContent = decision || "resolved";
  for (const button of box.querySelectorAll("button")) {
    button.disabled = true;
  }
}

function appendAgentDelta(itemId, delta) {
  const entry = ensureAgentMessage(itemId);
  entry.dataset.raw = (entry.dataset.raw || "") + delta;
  const body = entry.querySelector(".transcript-body");
  body.innerHTML = markdownToHtml(entry.dataset.raw || "");
  scrollChatToBottom();
}

function setAgentMessage(itemId, text) {
  const entry = ensureAgentMessage(itemId);
  entry.dataset.raw = text || "";
  const body = entry.querySelector(".transcript-body");
  body.innerHTML = markdownToHtml(entry.dataset.raw || "");
  scrollChatToBottom();
}

function ensureAgentMessage(itemId) {
  const id = `agent-${safeId(itemId)}`;
  let entry = document.getElementById(id);
  if (entry) return entry;

  entry = document.createElement("article");
  entry.id = id;
  entry.className = "transcript-message assistant";
  entry.dataset.raw = "";
  const gutter = document.createElement("div");
  gutter.className = "transcript-gutter";
  gutter.textContent = "codex";
  const body = document.createElement("div");
  body.className = "transcript-body markdown-body";
  entry.append(gutter, body);
  els.chatLog.appendChild(entry);
  return entry;
}

function appendChatLine(kind, text) {
  if (kind === "system" || kind === "log" || kind === "diff") {
    setChatActivity(text || "");
    return;
  }

  const entry = document.createElement("article");
  if (kind === "user") {
    entry.className = "transcript-message user";
    const marker = document.createElement("div");
    marker.className = "prompt-marker";
    marker.textContent = "›";
    const body = document.createElement("div");
    body.className = "transcript-body user-text";
    body.textContent = text || "";
    entry.append(marker, body);
  } else {
    entry.className = `transcript-event ${safeId(kind)}`;
    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent = labelForEvent(kind);
    const body = document.createElement(kind === "error" ? "pre" : "div");
    body.className = "event-body";
    body.textContent = text || "";
    entry.append(title, body);
  }
  els.chatLog.appendChild(entry);
  scrollChatToBottom();
}

function upsertCodexItem(item, lifecycle) {
  if (!item || !item.type || item.type === "userMessage") return;
  if (item.type === "agentMessage") {
    if (item.text) {
      const id = item.id || "agent";
      setAgentMessage(id, item.text);
    }
    return;
  }
  if (item.type === "reasoning") {
    upsertReasoningItem(item, lifecycle);
    return;
  }
  if (item.type === "plan") {
    setPlanItem(item.id || "plan", item.text || state.codex.planDeltas[item.id || "plan"] || "");
    return;
  }
  if (item.type === "contextCompaction") {
    appendCompactInfo("Context compacted");
    return;
  }
  if (item.type === "enteredReviewMode" || item.type === "exitedReviewMode") {
    appendCompactInfo(item.type === "enteredReviewMode" ? "Review mode" : "Exited review mode");
    return;
  }
  if (!shouldRenderToolItem(item, lifecycle)) return;

  const id = item.id || `${item.type}-${Object.keys(state.codex.itemNodes).length}`;
  let card = state.codex.itemNodes[id];
  if (!card) {
    card = document.createElement("article");
    card.className = `tool-card ${safeId(item.type)} ${statusClass(item.status || lifecycle)}`;
    card.id = `tool-${safeId(id)}`;
    state.codex.itemNodes[id] = card;
    els.chatLog.appendChild(card);
  }
  card.className = `tool-card ${safeId(item.type)} ${statusClass(item.status || lifecycle)}`;

  card.innerHTML = toolItemHtml(item, lifecycle);
  scrollChatToBottom();
}

function upsertReasoningItem(item, lifecycle) {
  const id = item.id || "reasoning";
  const text = reasoningText(item) || state.codex.reasoningBuffers[id] || "";
  const visible = visibleReasoningSummary(text);
  if (!visible) {
    return;
  }
  let node = state.codex.reasoningNodes[id];
  if (!node) {
    node = document.createElement("article");
    node.className = "reasoning-card";
    state.codex.reasoningNodes[id] = node;
    els.chatLog.appendChild(node);
  }
  node.innerHTML = `<div class="reasoning-content">${markdownToHtml(visible)}</div>`;
  scrollChatToBottom();
}

function appendReasoningDelta(itemId, delta) {
  state.codex.reasoningBuffers[itemId] = (state.codex.reasoningBuffers[itemId] || "") + delta;
  const header = firstBoldText(state.codex.reasoningBuffers[itemId]);
  if (header) {
    setChatActivity(header);
  }
}

function appendCommandOutput(itemId, delta) {
  const id = itemId || "command";
  state.codex.commandOutputs[id] = (state.codex.commandOutputs[id] || "") + delta;
  const card = state.codex.itemNodes[id];
  if (card) {
    const command = commandFromCard(card);
    renderCommandOutput(card, state.codex.commandOutputs[id], command);
    scrollChatToBottom();
  }
}

function appendFileChangeDelta(itemId, delta) {
  const id = itemId || "file-change";
  state.codex.latestDiff = (state.codex.latestDiff || "") + (delta || "");
  renderDiffCard(state.codex.latestDiff, "Patch");
}

function renderFileChangePatch(params) {
  const item = params.item || params.fileChange || params.file_change;
  const changes = params.changes || item?.changes || params.patch?.changes || [];
  const diff = params.diff || params.unifiedDiff || params.unified_diff || params.patch?.diff || params.patch?.unified_diff || "";

  if (changes.length) {
    upsertCodexItem(
      {
        id: params.itemId || params.id || item?.id || "file-change",
        type: "fileChange",
        status: params.status || "inProgress",
        changes,
      },
      "started",
    );
    return;
  }

  if (diff) {
    state.codex.latestDiff = diff;
    renderDiffCard(diff, "Patch");
  }
}

function renderDiffCard(diff, title = "Diff") {
  const text = String(diff || "").trim();
  if (!text) return;
  const diffHtml = diffToHtml(text);

  let card = document.getElementById("latest-diff-card");
  if (!card) {
    card = document.createElement("article");
    card.id = "latest-diff-card";
    card.className = "tool-card completed";
    els.chatLog.appendChild(card);
  }
  card.innerHTML = `
    <div class="tool-title"><span>${escapeHtml(title)}</span><em>${formatNumber(text.split("\n").length)} lines</em></div>
    ${diffHtml}
  `;
  scrollChatToBottom();
}

function renderPlan(plan, explanation) {
  let card = document.getElementById("active-plan-card");
  if (!card) {
    card = document.createElement("article");
    card.id = "active-plan-card";
    card.className = "plan-card";
    els.chatLog.appendChild(card);
  }
  const rows = plan
    .map((item) => `<li class="${safeId(item.status)}"><span>${planMark(item.status)}</span>${escapeHtml(item.step || "")}</li>`)
    .join("");
  card.innerHTML = `
    <div class="tool-title"><span>Updated Plan</span><em>${plan.length} steps</em></div>
    ${explanation ? `<p>${escapeHtml(explanation)}</p>` : ""}
    <ol>${rows}</ol>
  `;
  scrollChatToBottom();
}

function appendPlanDelta(itemId, delta) {
  const id = itemId || "plan";
  state.codex.planDeltas[id] = (state.codex.planDeltas[id] || "") + delta;
  setPlanItem(id, state.codex.planDeltas[id], true);
}

function setPlanItem(itemId, text, streaming = false) {
  const id = itemId || "plan";
  let card = state.codex.itemNodes[id];
  if (!card) {
    card = document.createElement("article");
    card.className = "plan-card proposed";
    card.id = `tool-${safeId(id)}`;
    state.codex.itemNodes[id] = card;
    els.chatLog.appendChild(card);
  }
  card.innerHTML = `
    <div class="tool-title"><span>Proposed Plan</span><em>${streaming ? "drafting" : "ready"}</em></div>
    <div class="markdown-body">${markdownToHtml(text || "(empty)")}</div>
  `;
  scrollChatToBottom();
}

function toolItemHtml(item, lifecycle) {
  const status = item.status || lifecycle;
  if (item.type === "commandExecution") {
    const output = item.aggregatedOutput || state.codex.commandOutputs[item.id] || "";
    const command = stripShellWrapper(item.command || "");
    const noOutput = lifecycle === "completed" && !output && isSuccessStatus(status);
    return `
      <div class="tool-title"><span>${escapeHtml(commandTitle(item, status))}</span><em>${escapeHtml(commandMeta(item, status))}</em></div>
      ${item.cwd ? `<div class="tool-subtitle">${escapeHtml(shortPath(item.cwd))}</div>` : ""}
      <pre class="command-line">$ ${escapeHtml(command)}</pre>
      ${output ? commandOutputHtml(output, command) : noOutput ? '<div class="tool-empty">(no output)</div>' : ""}
    `;
  }
  if (item.type === "fileChange") {
    const changes = (item.changes || [])
      .map((change) => `<li><strong>${escapeHtml(fileChangeKind(change.kind))}</strong> ${escapeHtml(change.path || "")}</li>`)
      .join("");
    const diffs = (item.changes || [])
      .map((change) =>
        change.diff ? `<details class="diff-details" open><summary>${escapeHtml(change.path || "diff")}</summary>${diffToHtml(change.diff)}</details>` : "",
      )
      .join("");
    return `
      <div class="tool-title"><span>Patch</span><em>${escapeHtml(statusLabel(status))}</em></div>
      ${changes ? `<ul class="change-list">${changes}</ul>` : '<div class="tool-empty">(no file changes)</div>'}
      ${diffs}
    `;
  }
  if (item.type === "mcpToolCall") {
    const result = item.error || item.result;
    return `
      <div class="tool-title"><span>${escapeHtml(item.tool || "MCP tool")}</span><em>${escapeHtml(toolMeta(status, item.durationMs))}</em></div>
      <div class="tool-subtitle">${escapeHtml([item.server, item.tool].filter(Boolean).join(" · "))}</div>
      ${jsonDetails("Arguments", item.arguments)}
      ${result ? jsonDetails(item.error ? "Error" : "Result", result, item.error ? true : false) : ""}
    `;
  }
  if (item.type === "dynamicToolCall") {
    const label = [item.namespace, item.tool].filter(Boolean).join(".");
    return `
      <div class="tool-title"><span>${escapeHtml(label || "Tool")}</span><em>${escapeHtml(toolMeta(status, item.durationMs))}</em></div>
      ${jsonDetails("Arguments", item.arguments)}
      ${item.contentItems ? jsonDetails("Output", item.contentItems, item.success === false) : ""}
    `;
  }
  if (item.type === "collabAgentToolCall") {
    const receivers = (item.receiverThreadIds || []).join(", ");
    return `
      <div class="tool-title"><span>${escapeHtml(item.tool || "Agent")}</span><em>${escapeHtml(statusLabel(status))}</em></div>
      ${receivers ? `<div class="tool-subtitle">${escapeHtml(receivers)}</div>` : ""}
      ${item.prompt ? `<div class="tool-note">${escapeHtml(item.prompt)}</div>` : ""}
    `;
  }
  if (item.type === "webSearch") {
    return `
      <div class="tool-title"><span>Search</span><em>${escapeHtml(webSearchAction(item.action))}</em></div>
      <div class="tool-note">${escapeHtml(item.query || webSearchQuery(item.action) || "")}</div>
    `;
  }
  if (item.type === "imageView" || item.type === "imageGeneration") {
    const path = item.path || item.savedPath || "";
    return `
      <div class="tool-title"><span>${escapeHtml(item.type === "imageView" ? "View Image" : "Image Generation")}</span><em>${escapeHtml(statusLabel(status))}</em></div>
      ${path ? `<div class="tool-subtitle">${escapeHtml(path)}</div>` : ""}
      ${item.revisedPrompt ? `<div class="tool-note">${escapeHtml(item.revisedPrompt)}</div>` : ""}
    `;
  }
  return "";
}

function renderCommandOutput(card, output, command) {
  if (!output) return;
  const empty = card.querySelector(".tool-empty");
  if (empty) empty.remove();
  const existing = card.querySelector(".tool-output-wrap");
  const html = commandOutputHtml(output, command);
  if (existing) {
    existing.outerHTML = html;
    return;
  }
  const commandLine = card.querySelector(".command-line");
  if (commandLine) {
    commandLine.insertAdjacentHTML("afterend", html);
  }
}

function commandFromCard(card) {
  const commandLine = card.querySelector(".command-line");
  return String(commandLine?.textContent || "").replace(/^\$\s*/, "");
}

function commandOutputHtml(output, command) {
  const preview = commandOutputPreview(output, command);
  const classes = ["tool-output-wrap", preview.truncated ? "truncated" : ""].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      ${preview.truncated ? `<div class="tool-output-meta">${escapeHtml(commandOutputMeta(preview))}</div>` : ""}
      <pre class="tool-output">${escapeHtml(preview.text)}</pre>
    </div>
  `;
}

function commandOutputMeta(preview) {
  const shown = [];
  if (preview.shownLines < preview.totalLines) {
    shown.push(`${formatNumber(preview.shownLines)} of ${formatNumber(preview.totalLines)} lines`);
  } else {
    shown.push(`${formatNumber(preview.totalLines)} lines`);
  }
  if (preview.omittedChars > 0) {
    shown.push(`${formatNumber(preview.omittedChars)} chars omitted`);
  }
  return `Output truncated · ${shown.join(" · ")}`;
}

function commandOutputPreview(output, command) {
  const value = String(output || "");
  const budget = commandOutputBudget(command);
  const lines = splitOutputLines(value);
  const totalLines = lines.length;
  let visibleLines = lines;
  let omittedLines = 0;

  if (lines.length > budget.maxLines) {
    const head = Math.max(1, Math.ceil(budget.maxLines * 0.58));
    const tail = Math.max(1, budget.maxLines - head - 1);
    omittedLines = lines.length - head - tail;
    visibleLines = [...lines.slice(0, head), `... ${formatNumber(omittedLines)} lines omitted ...`, ...lines.slice(lines.length - tail)];
  }

  let text = visibleLines.join("\n");
  let omittedChars = 0;
  if (text.length > budget.maxChars) {
    const marker = `\n... ${formatNumber(text.length - budget.maxChars)} chars omitted ...\n`;
    const room = Math.max(0, budget.maxChars - marker.length);
    const headChars = Math.max(1, Math.ceil(room * 0.58));
    const tailChars = Math.max(1, room - headChars);
    omittedChars = text.length - headChars - tailChars;
    text = `${text.slice(0, headChars)}${marker}${text.slice(text.length - tailChars)}`;
  }

  const markerLines = omittedLines > 0 ? 1 : 0;
  return {
    text,
    totalLines,
    shownLines: Math.min(totalLines, visibleLines.length - markerLines),
    omittedLines,
    omittedChars,
    truncated: omittedLines > 0 || omittedChars > 0,
  };
}

function commandOutputBudget(command) {
  const normalized = String(command || "").trim();
  const isReader = /^(cat|sed|awk|head|tail|rg|grep|find|ls|tree)\b/.test(normalized);
  const isGitVerbose = /^git\s+(show|diff|log|grep|status)\b/.test(normalized);
  if (isReader || isGitVerbose) {
    return { maxLines: 48, maxChars: 9000 };
  }
  return { maxLines: 90, maxChars: 16000 };
}

function splitOutputLines(output) {
  if (!output) return [];
  const text = output.endsWith("\n") ? output.slice(0, -1) : output;
  return text ? text.split("\n") : [];
}

function diffToHtml(diff) {
  const text = String(diff || "").trim();
  if (!text) return "";
  const lines = truncateLinesMiddle(text.split("\n"), 180);
  const body = lines.map((line) => `<span class="diff-line ${diffLineClass(line)}">${escapeHtml(line)}</span>`).join("");
  return `<pre class="codex-diff" aria-label="Unified diff">${body}</pre>`;
}

function shouldRenderToolItem(item, lifecycle) {
  if (item.type === "commandExecution") {
    return Boolean(item.command || state.codex.commandOutputs[item.id] || lifecycle === "completed");
  }
  if (item.type === "fileChange") {
    return lifecycle === "started" || lifecycle === "completed" || (item.changes || []).length > 0;
  }
  return [
    "mcpToolCall",
    "dynamicToolCall",
    "collabAgentToolCall",
    "webSearch",
    "imageView",
    "imageGeneration",
  ].includes(item.type);
}

function commandTitle(item, status) {
  if (String(item.source || "").toLowerCase() === "usershell") return "You ran";
  if (isRunningStatus(status)) return "Running";
  return "Ran";
}

function commandMeta(item, status) {
  const bits = [statusLabel(status)];
  if (item.exitCode !== null && item.exitCode !== undefined) bits.push(`exit ${item.exitCode}`);
  if (item.durationMs !== null && item.durationMs !== undefined) bits.push(formatDuration(item.durationMs));
  return bits.filter(Boolean).join(" · ");
}

function toolMeta(status, durationMs) {
  return [statusLabel(status), durationMs !== null && durationMs !== undefined ? formatDuration(durationMs) : ""]
    .filter(Boolean)
    .join(" · ");
}

function statusLabel(status) {
  const value = String(status || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return value || "done";
}

function statusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("fail") || normalized.includes("declin") || normalized.includes("error")) return "failed";
  if (normalized.includes("progress") || normalized.includes("started") || normalized.includes("running")) return "running";
  return "completed";
}

function isRunningStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return normalized.includes("progress") || normalized.includes("started") || normalized.includes("running");
}

function isSuccessStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return !normalized || normalized === "completed" || normalized === "complete" || normalized === "success" || normalized === "succeeded" || normalized === "done";
}

function formatDuration(ms) {
  const value = Number(ms || 0);
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function stripShellWrapper(command) {
  const text = String(command || "");
  const match = text.match(/^bash\s+-lc\s+(['"])([\s\S]*)\1$/);
  return match ? match[2] : text;
}

function fileChangeKind(kind) {
  const value = String(typeof kind === "object" && kind ? kind.type || "change" : kind || "change").toLowerCase();
  if (value.includes("add")) return "A";
  if (value.includes("delete") || value.includes("remove")) return "D";
  if (value.includes("rename") || value.includes("move")) return "R";
  return "M";
}

function jsonDetails(label, value, open = false) {
  if (value === null || value === undefined || value === "") return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text || text === "{}" || text === "[]") return "";
  return `<details class="tool-details" ${open ? "open" : ""}><summary>${escapeHtml(label)}</summary><pre>${escapeHtml(truncateOutput(text))}</pre></details>`;
}

function webSearchAction(action) {
  if (!action || !action.type) return "search";
  return statusLabel(action.type);
}

function webSearchQuery(action) {
  if (!action) return "";
  return action.query || (action.queries || []).join(", ") || action.url || action.pattern || "";
}

function approvalTitle(method, params) {
  if (method && method.includes("exec")) return "Run command?";
  if (method && method.includes("patch")) return "Apply patch?";
  return method || params.type || "Approval";
}

function approvalSummary(params) {
  return params.command || params.reason || params.summary || params.path || "Review request";
}

function appendCompactInfo(text) {
  const entry = document.createElement("article");
  entry.className = "transcript-info";
  entry.textContent = text;
  els.chatLog.appendChild(entry);
  scrollChatToBottom();
}

function reasoningText(item) {
  const parts = [];
  for (const value of item.summary || []) {
    if (typeof value === "string") parts.push(value);
    else if (value && value.text) parts.push(value.text);
  }
  for (const value of item.content || []) {
    if (typeof value === "string") parts.push(value);
    else if (value && value.text) parts.push(value.text);
  }
  return parts.join("\n\n");
}

function firstBoldText(text) {
  const match = String(text || "").match(/\*\*([^*]+)\*\*/);
  return match ? match[1].trim() : "";
}

function visibleReasoningSummary(text) {
  const value = String(text || "").trim();
  const open = value.indexOf("**");
  if (open < 0) return "";
  const afterOpen = value.slice(open + 2);
  const close = afterOpen.indexOf("**");
  if (close < 0) return "";
  const rest = afterOpen.slice(close + 2).trim();
  return rest;
}

function truncateMiddle(text, maxChars) {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  const head = Math.floor(maxChars * 0.55);
  const tail = maxChars - head;
  return `${value.slice(0, head)}\n... ${value.length - maxChars} chars omitted ...\n${value.slice(-tail)}`;
}

function truncateOutput(text, maxLines = 90) {
  return truncateLinesMiddle(String(text || "").split("\n"), maxLines).join("\n");
}

function truncateLinesMiddle(lines, maxLines) {
  if (lines.length <= maxLines) return lines;
  const head = Math.max(1, Math.floor((maxLines - 1) / 2));
  const tail = Math.max(1, maxLines - head - 1);
  const omitted = lines.length - head - tail;
  return [...lines.slice(0, head), `… +${formatNumber(omitted)} lines omitted`, ...lines.slice(lines.length - tail)];
}

function diffLineClass(line) {
  if (line.startsWith("… +")) return "omitted";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("diff --git") || line.startsWith("--- ") || line.startsWith("+++ ")) return "file";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  if (/^(index|new file mode|deleted file mode|similarity index|rename from|rename to)\b/.test(line)) return "meta";
  return "context";
}

function renderChatThreadLine() {
  els.chatThread.textContent = state.codex.threadId || "No active thread";
  renderChatStatus();
}

function labelForEvent(kind) {
  const labels = {
    warning: "warning",
    error: "error",
  };
  return labels[kind] || kind;
}

function planMark(status) {
  if (status === "completed") return "✓";
  if (status === "inProgress") return "…";
  return "○";
}

function markdownToHtml(source) {
  const text = String(source || "");
  if (markdownRenderer) {
    return markdownRenderer.render(text);
  }
  return basicMarkdownToHtml(text);
}

function basicMarkdownToHtml(source) {
  const lines = String(source || "").split("\n");
  const html = [];
  let inCode = false;
  let codeLines = [];
  let listType = null;

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  }

  for (const line of lines) {
    const fence = line.match(/^```(\w+)?/);
    if (fence) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${inlineMarkdown(numbered[1])}</li>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
      continue;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  closeList();
  return html.join("");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      const safeHref = String(href || "").startsWith("http") ? href : "#";
      return `<a href="${escapeAttr(safeHref)}" target="_blank" rel="noreferrer">${label}</a>`;
    });
}

function applyBridgeStatus(status) {
  state.codex.bridge.running = Boolean(status.running);
  state.codex.bridge.initialized = Boolean(status.initialized);
  state.codex.bridge.pid = status.pid || null;
  state.codex.bridge.lastError = status.lastError || "";
  setCodexStatus(
    state.codex.bridge.running
      ? `Codex ${state.codex.bridge.initialized ? "ready" : "starting"}${state.codex.bridge.pid ? ` · ${state.codex.bridge.pid}` : ""}`
      : "Codex idle",
  );
}

function updateTokenUsage(params) {
  const info = firstObject(params.info, params);
  const usage = firstObject(params.tokenUsage, params.token_usage, params.usage, info.tokenUsage, info.token_usage, info.usage, params);
  const context = firstObject(usage.context, params.context, info.context);
  const total = firstObject(
    usage.total,
    usage.totalUsage,
    usage.total_usage,
    usage.totalTokenUsage,
    usage.total_token_usage,
    params.total,
    params.totalUsage,
    params.total_usage,
    params.totalTokenUsage,
    params.total_token_usage,
    info.total_token_usage,
    info.totalTokenUsage,
  );
  const last = firstObject(
    usage.last,
    usage.lastUsage,
    usage.last_usage,
    usage.lastTokenUsage,
    usage.last_token_usage,
    params.lastTokenUsage,
    params.last_token_usage,
    info.last_token_usage,
    info.lastTokenUsage,
  );
  const contextUsed = firstNumber(
    usage.tokensInContext,
    usage.tokens_in_context,
    usage.contextTokens,
    usage.context_tokens,
    usage.currentContextTokens,
    usage.current_context_tokens,
    context.tokens,
    context.used,
    context.usedTokens,
    context.used_tokens,
    context.contextTokens,
    context.context_tokens,
    params.tokensInContext,
    params.tokens_in_context,
    params.contextTokens,
    params.context_tokens,
    params.currentContextTokens,
    params.current_context_tokens,
    info.tokensInContext,
    info.tokens_in_context,
    info.contextTokens,
    info.context_tokens,
  );
  const windowTokens = firstNumber(
    params.modelContextWindow,
    params.model_context_window,
    params.contextWindow,
    params.context_window,
    params.contextWindowTokens,
    params.context_window_tokens,
    usage.modelContextWindow,
    usage.model_context_window,
    usage.contextWindow,
    usage.context_window,
    usage.maxContextWindow,
    usage.max_context_window,
    usage.tokenBudget,
    usage.token_budget,
    context.window,
    context.limit,
    context.windowTokens,
    context.window_tokens,
    context.limitTokens,
    context.limit_tokens,
    total.modelContextWindow,
    total.model_context_window,
    total.contextWindow,
    total.context_window,
    info.modelContextWindow,
    info.model_context_window,
    info.contextWindow,
    info.context_window,
  );
  const totalUsed = firstNumber(
    total.totalTokens,
    total.total_tokens,
    total.total,
    total.tokensUsed,
    total.tokens_used,
    usage.totalTokens,
    usage.total_tokens,
    usage.tokensUsed,
    usage.tokens_used,
    params.totalTokens,
    params.total_tokens,
    params.tokensUsed,
    params.tokens_used,
    info.totalTokens,
    info.total_tokens,
  );
  const input = firstNumber(
    last.inputTokens,
    last.input_tokens,
    total.inputTokens,
    total.input_tokens,
    usage.inputTokens,
    usage.input_tokens,
    usage.cachedInputTokens,
    usage.cached_input_tokens,
  );
  const output = firstNumber(
    last.outputTokens,
    last.output_tokens,
    total.outputTokens,
    total.output_tokens,
    usage.outputTokens,
    usage.output_tokens,
    usage.reasoningOutputTokens,
    usage.reasoning_output_tokens,
  );
  const activeContextTokens = firstNumber(last.totalTokens, last.total_tokens, last.total);
  const derivedContextUsed = contextUsed === null && activeContextTokens !== null ? activeContextTokens : null;

  state.codex.tokenUsage = {
    used: contextUsed === null ? derivedContextUsed : contextUsed,
    derived: contextUsed === null && derivedContextUsed !== null,
    windowTokens,
    totalUsed,
    input,
    output,
  };
  renderChatStatus();
}

function updateRateLimits(params) {
  state.codex.rateLimitError = "";
  state.codex.rateLimits = normalizeRateLimits(params);
  renderChatStatus();
}

function updateThreadStatus(params) {
  const status = params.status || params.thread?.status || "";
  const message = params.statusMessage || params.status_message || params.thread?.statusMessage || "";
  state.codex.threadStatus = typeof status === "object" && status ? status.type || status.status || "" : String(status || "");
  state.codex.threadStatusMessage = message || "";
  if (message) {
    setChatActivity(message);
  } else {
    renderChatStatus();
  }
}

function renderResumedThread(result) {
  const thread = result.thread || result;
  const turns = Array.isArray(thread.turns) ? thread.turns : Array.isArray(result.turns) ? result.turns : [];
  if (!turns.length) {
    appendCompactInfo("Resumed thread; no history was returned.");
    return;
  }

  appendCompactInfo(`Resumed ${formatNumber(turns.length)} previous turns`);
  turns.forEach((turn, turnIndex) => {
    const items = historicalTurnItems(turn);
    if (!items.length && turn.input) {
      appendChatLine("user", textFromContent(turn.input));
      return;
    }
    items.forEach((item, itemIndex) => renderHistoricalItem(item, turnIndex, itemIndex));
  });
}

function historicalTurnItems(turn) {
  if (!turn || typeof turn !== "object") return [];
  if (Array.isArray(turn.itemsView)) return turn.itemsView;
  if (Array.isArray(turn.items)) return turn.items;
  if (Array.isArray(turn.outputItems)) return turn.outputItems;
  return [];
}

function renderHistoricalItem(item, turnIndex, itemIndex) {
  if (!item || typeof item !== "object") return;
  const type = item.type || item.kind || "";
  const id = item.id || `history-${turnIndex}-${itemIndex}`;

  if (type === "userMessage" || type === "user_message" || item.role === "user") {
    appendChatLine("user", itemText(item));
    return;
  }
  if (type === "agentMessage" || type === "agent_message" || item.role === "assistant") {
    setAgentMessage(id, itemText(item));
    return;
  }
  if (type === "reasoning") {
    upsertReasoningItem({ ...item, id }, "completed");
    return;
  }
  if (type === "plan") {
    setPlanItem(id, item.text || itemText(item), false);
    return;
  }
  if (type === "contextCompaction") {
    appendCompactInfo("Context compacted");
    return;
  }
  if (shouldRenderToolItem({ ...item, id, type }, "completed")) {
    upsertCodexItem({ ...item, id, type }, "completed");
  }
}

function itemText(item) {
  return (
    optionalText(item.text) ||
    optionalText(item.message) ||
    (typeof item.content === "string" ? item.content : "") ||
    textFromContent(item.fragments) ||
    textFromContent(item.textElements) ||
    textFromContent(item.text_elements) ||
    textFromContent(item.input) ||
    ""
  );
}

function textFromContent(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        return item.text || item.content || item.inputText || item.input_text || "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (typeof value === "object") {
    return value.text || value.content || value.inputText || value.input_text || "";
  }
  return "";
}

function setActiveThread(id) {
  state.codex.threadId = id;
  renderChatThreadLine();
}

function resetChatTranscript() {
  els.chatLog.innerHTML = "";
  state.codex.turnId = null;
  state.codex.activity = "";
  state.codex.agentMessages = {};
  state.codex.itemNodes = {};
  state.codex.reasoningNodes = {};
  state.codex.reasoningBuffers = {};
  state.codex.commandOutputs = {};
  state.codex.planDeltas = {};
  state.codex.approvalNodes = {};
  state.codex.latestDiff = "";
  state.codex.tokenUsage = null;
  els.interruptCodexTurn.disabled = true;
  renderChatThreadLine();
  renderChatStatus();
}

function setCodexStatus(text) {
  state.codex.bridge.label = text || "";
  els.codexStatus.textContent = text;
  renderChatStatus();
}

function setChatActivity(text) {
  state.codex.activity = text || "";
  renderChatThreadLine();
  renderChatStatus();
}

function renderChatStatus() {
  renderSessionStatus();
  renderContextStatus();
  renderLimitStatus();
}

function renderSessionStatus() {
  const bridge = state.codex.bridge;
  const status = state.codex.turnId ? "Working" : bridge.initialized ? "Ready" : bridge.running ? "Starting" : "Idle";
  const bits = [];
  if (state.codex.activity && state.codex.activity !== status) bits.push(state.codex.activity);
  if (bridge.lastError) bits.push(bridge.lastError);

  els.chatSessionValue.innerHTML = escapeHtml(status);
  els.chatSessionValue.className = `session-pill ${sessionStatusClass(status)}`;
  els.chatSessionMeta.textContent = bits.filter(Boolean).join(" · ");
}

function sessionStatusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "working") return "working";
  if (normalized === "ready") return "ready";
  if (normalized === "starting") return "starting";
  return "idle";
}

function renderContextStatus() {
  const usage = state.codex.tokenUsage || {};
  const used = usage.used;
  const windowTokens = usage.windowTokens;
  const totalUsed = usage.totalUsed;
  const percent = used !== null && used !== undefined && windowTokens ? contextPercentUsed(used, windowTokens) : null;

  if (percent === null) {
    if (windowTokens && totalUsed !== null && totalUsed !== undefined) {
      els.chatContextValue.textContent = `Context ${formatCompactNumber(windowTokens)}`;
      els.chatContextMeta.textContent = "";
    } else if (windowTokens) {
      els.chatContextValue.textContent = `Context ${formatCompactNumber(windowTokens)}`;
      els.chatContextMeta.textContent = "";
    } else if (totalUsed !== null && totalUsed !== undefined) {
      els.chatContextValue.textContent = `Context ${formatCompactNumber(totalUsed)} used`;
      els.chatContextMeta.textContent = "";
    } else {
      els.chatContextValue.textContent = "Context waiting";
      els.chatContextMeta.textContent = "";
    }
    setMeter(els.chatContextBar, 0, "empty");
    return;
  }

  els.chatContextValue.textContent = `Context ${Math.round(percent)}% ${formatCompactNumber(used)}/${formatCompactNumber(windowTokens)}`;
  els.chatContextMeta.textContent = "";
  setMeter(els.chatContextBar, percent, "used");
}

function contextPercentUsed(tokens, windowTokens) {
  const baselineTokens = 12000;
  if (!windowTokens || windowTokens <= baselineTokens) {
    return tokens > 0 ? 100 : 0;
  }
  const effectiveWindow = windowTokens - baselineTokens;
  const used = Math.max(0, tokens - baselineTokens);
  const remaining = Math.max(0, effectiveWindow - used);
  return clamp(100 - (remaining / effectiveWindow) * 100, 0, 100);
}

function renderLimitStatus() {
  const limit = preferredRateLimit(state.codex.rateLimits);
  if (!limit) {
    els.chatLimitValue.textContent = state.codex.rateLimitError ? "5h unavailable" : "5h waiting";
    els.chatLimitMeta.textContent = "";
    setMeter(els.chatLimitBar, 0, "empty");
    return;
  }

  const percent = limit.usedPercent !== null && limit.usedPercent !== undefined ? clamp(limit.usedPercent, 0, 100) : null;
  const remaining = percent === null ? null : clamp(100 - percent, 0, 100);
  els.chatLimitValue.textContent = remaining === null ? "5h reported" : `5h ${Math.round(remaining)}% left`;
  els.chatLimitMeta.textContent = "";
  setMeter(els.chatLimitBar, remaining || 0, "remaining");
}

function setMeter(node, percent, mode = "used") {
  const value = clamp(Number(percent) || 0, 0, 100);
  node.style.width = `${value}%`;
  const danger = mode === "used" ? value >= 90 : mode === "remaining" ? value <= 10 : false;
  const warn = mode === "used" ? value >= 70 && value < 90 : mode === "remaining" ? value > 10 && value <= 30 : false;
  const ok = mode !== "empty" && !warn && !danger;
  node.classList.toggle("ok", ok);
  node.classList.toggle("warn", warn);
  node.classList.toggle("danger", danger);
  node.classList.toggle("empty", mode === "empty");
}

function scrollChatToBottom() {
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function safeId(value) {
  return String(value || "item").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function onFilterChange() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadThreads().catch(showError), 180);
}

function showError(error) {
  els.details.innerHTML = `<div class="details-empty error">${escapeHtml(error.message)}</div>`;
}

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function shortPath(path) {
  if (!path) return "";
  return path.replace(/^\/home\/[^/]+/, "~");
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 12 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text;
}

function sourceLabel(item) {
  if (item.agent_nickname) return `${item.source || "subagent"} · ${item.agent_nickname}`;
  return item.source || "unknown";
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatCompactNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

function formatWindowDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value % (60 * 24) === 0) return `${value / (60 * 24)}d`;
  if (value % 60 === 0) return `${value / 60}h`;
  return `${Math.round(value)}m`;
}

function readableLimitError(message) {
  const text = String(message || "");
  if (text.includes("chatgpt authentication required") || text.includes("codex account authentication required")) {
    return "Sign in to Codex to read usage limits";
  }
  if (text.includes("failed to fetch codex rate limits")) {
    return "Usage service unavailable";
  }
  return truncateMiddle(text, 120);
}

function normalizeRateLimits(params) {
  const rawLimits = [];
  const rateLimits = params.rateLimits || params.rate_limits;
  if (Array.isArray(rateLimits)) rawLimits.push(...rateLimits);
  else if (rateLimits && typeof rateLimits === "object") rawLimits.push(rateLimits);
  for (const value of Object.values(params.rateLimitsByLimitId || params.rate_limits_by_limit_id || {})) {
    if (value && typeof value === "object") rawLimits.push(value);
  }

  const primaryUsed = firstNumber(params.primaryUsedPercent, params.primary_used_percent);
  const primaryWindow = firstNumber(params.primaryWindowMinutes, params.primary_window_minutes);
  if (primaryUsed !== null || primaryWindow !== null) {
    rawLimits.push({ name: "5h limit", usedPercent: primaryUsed, windowDurationMins: primaryWindow });
  }

  const secondaryUsed = firstNumber(params.secondaryUsedPercent, params.secondary_used_percent);
  const secondaryWindow = firstNumber(params.secondaryWindowMinutes, params.secondary_window_minutes);
  if (secondaryUsed !== null || secondaryWindow !== null) {
    rawLimits.push({ name: "Secondary limit", usedPercent: secondaryUsed, windowDurationMins: secondaryWindow });
  }

  return rawLimits.flatMap(expandRateLimit).map(normalizeRateLimit).filter(Boolean);
}

function expandRateLimit(limit) {
  if (!limit || typeof limit !== "object") return [];
  const limits = [];
  const baseName = optionalText(limit.limitName) || optionalText(limit.limit_name) || optionalText(limit.name) || optionalText(limit.limitId) || optionalText(limit.limit_id);

  if (limit.primary || limit.secondary) {
    if (limit.primary) {
      limits.push({
        ...limit.primary,
        limitId: limit.limitId || limit.limit_id,
        limitName: baseName ? `${baseName} 5h` : "5h limit",
        limitKind: "primary",
      });
    }
    if (limit.secondary) {
      limits.push({
        ...limit.secondary,
        limitId: limit.limitId || limit.limit_id,
        limitName: baseName ? `${baseName} weekly` : "Weekly limit",
        limitKind: "secondary",
      });
    }
    return limits;
  }

  return [limit];
}

function normalizeRateLimit(limit) {
  if (!limit || typeof limit !== "object") return null;
  const windowMins = firstNumber(
    limit.windowDurationMins,
    limit.window_duration_mins,
    limit.windowMinutes,
    limit.window_minutes,
    limit.primaryWindowMinutes,
    limit.primary_window_minutes,
    limit.window?.minutes,
  );
  const name =
    optionalText(limit.name) ||
    optionalText(limit.limitName) ||
    optionalText(limit.limit_name) ||
    optionalText(limit.limitId) ||
    optionalText(limit.limit_id) ||
    (windowMins ? `${formatWindowDuration(windowMins)} window` : "");
  const usedPercent = firstNumber(
    limit.usedPercent,
    limit.used_percent,
    limit.percentUsed,
    limit.percent_used,
    limit.primaryUsedPercent,
    limit.primary_used_percent,
    limit.window?.usedPercent,
    limit.window?.used_percent,
  );
  const resetAt = firstNumber(limit.resetAt, limit.reset_at, limit.resetsAt, limit.resets_at, limit.window?.resetsAt, limit.window?.resets_at);
  const resetLabel = resetAt ? `resets ${formatDateTime(resetAt > 9999999999 ? resetAt : resetAt * 1000)}` : "";
  return {
    name,
    usedPercent,
    windowMins,
    kind: optionalText(limit.limitKind) || optionalText(limit.limit_kind),
    windowLabel: windowMins ? `${formatWindowDuration(windowMins)} window` : "",
    resetLabel,
  };
}

function preferredRateLimit(limits) {
  if (!limits || limits.length === 0) return null;
  return (
    limits.find((limit) => limit.kind === "primary") ||
    limits.find((limit) => String(limit.name || "").toLowerCase().includes("5h")) ||
    limits.find((limit) => limit.windowMins >= 295 && limit.windowMins <= 305) ||
    limits[0]
  );
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function optionalText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function autoSizeChatInput() {
  const input = els.chatInput;
  const maxHeight = Math.min(220, Math.max(120, Math.round(window.innerHeight * 0.32)));
  input.style.maxHeight = `${maxHeight}px`;
  input.style.height = "auto";
  const nextHeight = Math.min(input.scrollHeight, maxHeight);
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
}

els.filters.addEventListener("input", onFilterChange);
els.filters.addEventListener("change", onFilterChange);
els.threadsTabButton.addEventListener("click", () => switchTab("threads"));
els.chatTabButton.addEventListener("click", () => switchTab("chat"));
els.rebuildButton.addEventListener("click", () => rebuild().catch(showError));
els.chatComposer.addEventListener("submit", sendCodexMessage);
els.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    els.chatComposer.requestSubmit();
  }
});
els.chatInput.addEventListener("input", autoSizeChatInput);
window.addEventListener("resize", autoSizeChatInput);
els.chatCwdButton.addEventListener("click", () => toggleChoiceMenu(els.chatCwdMenu, els.chatCwdButton));
els.chatModelButton.addEventListener("click", () => toggleChoiceMenu(els.chatModelMenu, els.chatModelButton));
els.chatEffortButton.addEventListener("click", () => toggleChoiceMenu(els.chatEffortMenu, els.chatEffortButton));
els.resumeMenuButton.addEventListener("click", toggleResumePopover);
els.chatFastMode.addEventListener("change", () => {
  els.chatFastMode.closest(".fast-toggle").classList.toggle("on", els.chatFastMode.checked && !els.chatFastMode.disabled);
});
els.resumeThreadId.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    resumeCodexThreadById().catch((error) => appendChatLine("error", error.message));
  }
});
document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest(".choice-control")) return;
  if (event.target instanceof Element && event.target.closest(".resume-action")) return;
  closeChoiceMenus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeChoiceMenus();
});
els.newCodexThread.addEventListener("click", () => startNewCodexThread().catch((error) => appendChatLine("error", error.message)));
els.resumeCodexThread.addEventListener("click", () =>
  resumeCodexThreadById().catch((error) => appendChatLine("error", error.message)),
);
els.interruptCodexTurn.addEventListener("click", interruptCodexTurn);
autoSizeChatInput();

loadStats()
  .then(loadThreads)
  .then(refreshCodexStatus)
  .then(startCodexEvents)
  .then(() => {
    autoSizeChatInput();
    if (!els.chatTab.hidden) {
      return loadCodexModels().catch((error) => appendChatLine("error", error.message));
    }
    return null;
  })
  .catch(showError);
