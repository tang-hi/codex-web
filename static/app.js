const THREAD_CONFIG_STORAGE_KEY = "codexThreadConfigs.v1";
const THREAD_METADATA_STORAGE_KEY = "codexThreadMetadata.v1";
const AGENTS_DRAFT_STORAGE_KEY = "codexAgentsDraft.v1";
const THREAD_HISTORY_PAGE_SIZE = 24;
const THREAD_VISIBILITIES = new Set(["active", "archived", "hidden"]);

const state = {
  items: [],
  facets: { sources: [], cwds: [] },
  projectRoot: "",
  codexHome: "",
  models: [],
  modelsLoaded: false,
  threadConfigs: loadThreadConfigs(),
  threadMetadata: loadThreadMetadata(),
  sidebarQuery: "",
  threadManager: {
    open: false,
    scope: "active",
    query: "",
    project: "",
    sort: "recent",
    selectedIds: new Set(),
  },
  detailsTab: "overview",
  renameTargetThreadId: "",
  toastTimer: null,
  personalization: {
    step: 1,
    suggestions: [],
    preview: null,
    target: "project",
    selectedThreadIds: new Set(),
    threadQuery: "",
  },
  applyingThreadConfig: false,
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
    jumpNavAnchor: "prev",
    threadStatus: "",
    threadStatusMessage: "",
    actionInFlight: "",
    history: {
      threadId: null,
      cursor: null,
      hasMore: false,
      loading: false,
      initialized: false,
      loadedTurnIds: new Set(),
    },
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
    changedFiles: [],
    runningCommand: "",
    contextBreakdown: null,
    contextBreakdownThreadId: null,
    contextBreakdownLoading: false,
    contextBreakdownRefreshTimer: null,
    contextBreakdownEstimated: false,
    contextContributors: [],
    contextSuggestions: [],
  },
};

const els = {
  chatTab: document.getElementById("chatTab"),
  appWorkspace: document.getElementById("appWorkspace"),
  codexStatus: document.getElementById("codexStatus"),
  chatWorkbench: document.querySelector(".chat-workbench"),
  detailsToggle: document.getElementById("detailsToggle"),
  chatThreadTitle: document.getElementById("chatThreadTitle"),
  chatHeaderRename: document.getElementById("chatHeaderRename"),
  chatPrimaryStatus: document.getElementById("chatPrimaryStatus"),
  chatPrimaryContext: document.getElementById("chatPrimaryContext"),
  chatPrimaryModel: document.getElementById("chatPrimaryModel"),
  chatPrimaryCwd: document.getElementById("chatPrimaryCwd"),
  chatThread: document.getElementById("chatThread"),
  copyThreadId: document.getElementById("copyThreadId"),
  chatSessionValue: document.getElementById("chatSessionValue"),
  chatSessionMeta: document.getElementById("chatSessionMeta"),
  chatContextValue: document.getElementById("chatContextValue"),
  chatContextMeta: document.getElementById("chatContextMeta"),
  chatContextBar: document.getElementById("chatContextBar"),
  chatLimitValue: document.getElementById("chatLimitValue"),
  chatLimitMeta: document.getElementById("chatLimitMeta"),
  chatLimitBar: document.getElementById("chatLimitBar"),
  messageJumpNav: document.getElementById("messageJumpNav"),
  jumpPrevSpeech: document.getElementById("jumpPrevSpeech"),
  jumpNextSpeech: document.getElementById("jumpNextSpeech"),
  jumpLatest: document.getElementById("jumpLatest"),
  chatCwd: document.getElementById("chatCwd"),
  chatLog: document.getElementById("chatLog"),
  chatComposer: document.getElementById("chatComposer"),
  composerTools: document.getElementById("composerTools"),
  chatInput: document.getElementById("chatInput"),
  sendCodexMessage: document.getElementById("sendCodexMessage"),
  compactThread: document.getElementById("compactThread"),
  reviewThread: document.getElementById("reviewThread"),
  forkThread: document.getElementById("forkThread"),
  moreThreadActions: document.getElementById("moreThreadActions"),
  moreThreadActionsMenu: document.getElementById("moreThreadActionsMenu"),
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
  newThreadModal: document.getElementById("newThreadModal"),
  closeNewThreadModal: document.getElementById("closeNewThreadModal"),
  cancelNewThread: document.getElementById("cancelNewThread"),
  confirmNewThread: document.getElementById("confirmNewThread"),
  newThreadSummary: document.getElementById("newThreadSummary"),
  newThreadCwd: document.getElementById("newThreadCwd"),
  newThreadCwdButton: document.getElementById("newThreadCwdButton"),
  newThreadCwdMenu: document.getElementById("newThreadCwdMenu"),
  newThreadModel: document.getElementById("newThreadModel"),
  newThreadModelButton: document.getElementById("newThreadModelButton"),
  newThreadModelMenu: document.getElementById("newThreadModelMenu"),
  newThreadEffort: document.getElementById("newThreadEffort"),
  newThreadEffortButton: document.getElementById("newThreadEffortButton"),
  newThreadEffortMenu: document.getElementById("newThreadEffortMenu"),
  newThreadFastMode: document.getElementById("newThreadFastMode"),
  newThreadFastLabel: document.getElementById("newThreadFastLabel"),
  resumeCodexThread: document.getElementById("resumeCodexThread"),
  resumeMenuButton: document.getElementById("resumeMenuButton"),
  resumePopover: document.getElementById("resumePopover"),
  resumeThreadId: document.getElementById("resumeThreadId"),
  interruptCodexTurn: document.getElementById("interruptCodexTurn"),
  sidebarThreadCount: document.getElementById("sidebarThreadCount"),
  sidebarNewThread: document.getElementById("sidebarNewThread"),
  sidebarThreadSearch: document.getElementById("sidebarThreadSearch"),
  sidebarThreads: document.getElementById("sidebarThreads"),
  sidebarTaskStatus: document.getElementById("sidebarTaskStatus"),
  sidebarTaskMeta: document.getElementById("sidebarTaskMeta"),
  overviewStatus: document.getElementById("overviewStatus"),
  sidebarChangedCount: document.getElementById("sidebarChangedCount"),
  sidebarChangedFiles: document.getElementById("sidebarChangedFiles"),
  inspectorFilesCount: document.getElementById("inspectorFilesCount"),
  inspectorFilesList: document.getElementById("inspectorFilesList"),
  sidebarRunningCommand: document.getElementById("sidebarRunningCommand"),
  sidebarModel: document.getElementById("sidebarModel"),
  sidebarReasoning: document.getElementById("sidebarReasoning"),
  sidebarContext: document.getElementById("sidebarContext"),
  openThreadManager: document.getElementById("openThreadManager"),
  threadManagerModal: document.getElementById("threadManagerModal"),
  closeThreadManager: document.getElementById("closeThreadManager"),
  threadManagerSearch: document.getElementById("threadManagerSearch"),
  threadManagerProject: document.getElementById("threadManagerProject"),
  threadManagerSort: document.getElementById("threadManagerSort"),
  threadManagerBulkbar: document.getElementById("threadManagerBulkbar"),
  threadManagerSelectAll: document.getElementById("threadManagerSelectAll"),
  threadManagerSelectedCount: document.getElementById("threadManagerSelectedCount"),
  bulkRestoreThreads: document.getElementById("bulkRestoreThreads"),
  bulkArchiveThreads: document.getElementById("bulkArchiveThreads"),
  bulkHideThreads: document.getElementById("bulkHideThreads"),
  threadManagerResults: document.getElementById("threadManagerResults"),
  renameThreadModal: document.getElementById("renameThreadModal"),
  closeRenameThreadModal: document.getElementById("closeRenameThreadModal"),
  cancelRenameThread: document.getElementById("cancelRenameThread"),
  confirmRenameThread: document.getElementById("confirmRenameThread"),
  renameThreadInput: document.getElementById("renameThreadInput"),
  contextUsageValue: document.getElementById("contextUsageValue"),
  contextStackedBar: document.getElementById("contextStackedBar"),
  contextBreakdownEmpty: document.getElementById("contextBreakdownEmpty"),
  contextLargestContributors: document.getElementById("contextLargestContributors"),
  contextSuggestions: document.getElementById("contextSuggestions"),
  toastRegion: document.getElementById("toastRegion"),
  openPersonalization: document.getElementById("openPersonalization"),
  openPersonalizationFromConfig: document.getElementById("openPersonalizationFromConfig"),
  personalizationModal: document.getElementById("personalizationModal"),
  closePersonalization: document.getElementById("closePersonalization"),
  cancelPersonalization: document.getElementById("cancelPersonalization"),
  personalizationBack: document.getElementById("personalizationBack"),
  personalizationNext: document.getElementById("personalizationNext"),
  personalizationApply: document.getElementById("personalizationApply"),
  personalizationSaveDraft: document.getElementById("personalizationSaveDraft"),
  personalizationSteps: document.getElementById("personalizationSteps"),
  personalizationSubtitle: document.getElementById("personalizationSubtitle"),
  personalizationProjectLabel: document.getElementById("personalizationProjectLabel"),
  personalizationIncludeActive: document.getElementById("personalizationIncludeActive"),
  personalizationIncludeArchived: document.getElementById("personalizationIncludeArchived"),
  personalizationIncludeHidden: document.getElementById("personalizationIncludeHidden"),
  personalizationThreadPicker: document.getElementById("personalizationThreadPicker"),
  personalizationThreadSearch: document.getElementById("personalizationThreadSearch"),
  personalizationThreadList: document.getElementById("personalizationThreadList"),
  personalizationSuggestions: document.getElementById("personalizationSuggestions"),
  projectAgentsPath: document.getElementById("projectAgentsPath"),
  agentsPreviewMeta: document.getElementById("agentsPreviewMeta"),
  agentsDiffPreview: document.getElementById("agentsDiffPreview"),
};

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

  renderer.renderer.rules.fence = function (tokens, idx) {
    const token = tokens[idx];
    const lang = String(token.info || "").trim().split(/\s+/)[0];
    return codeBlockHtml(token.content, lang);
  };

  return renderer;
}

function codeBlockHtml(content, lang = "") {
  const language = String(lang || "").trim();
  const label = language || "code";
  const highlighted = highlightCode(content, language);
  return `
    <div class="code-block">
      <div class="code-block-header">
        <span>${escapeHtml(label)}</span>
        <button type="button" class="copy-code-button" data-copy-code="${escapeAttr(encodeURIComponent(content))}">Copy</button>
      </div>
      <pre><code class="${codeClassName(language, highlighted.highlighted)}">${highlighted.html}</code></pre>
    </div>
  `;
}

function highlightCode(content, language) {
  const source = String(content || "");
  const hljs = window.hljs;
  if (!hljs) return { html: escapeHtml(source), highlighted: false };

  try {
    if (language && hljs.getLanguage(language)) {
      return {
        html: hljs.highlight(source, { language, ignoreIllegals: true }).value,
        highlighted: true,
      };
    }
    if (!language && source.length <= 20000) {
      return {
        html: hljs.highlightAuto(source).value,
        highlighted: true,
      };
    }
  } catch {
    // Fall back to escaped plain text if a language grammar rejects the input.
  }

  return { html: escapeHtml(source), highlighted: false };
}

function codeClassName(language, highlighted) {
  return [
    highlighted ? "hljs" : "",
    language ? `language-${escapeAttr(language)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
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

async function loadStats() {
  const stats = await api("/api/stats");
  state.projectRoot = stats.projectRoot || "";
  state.codexHome = stats.codexHome || "";
  if (stats.projectRoot && !els.chatCwd.value) {
    els.chatCwd.value = stats.projectRoot;
    syncCwdButton();
  } else if (!els.chatCwd.value) {
    setWorkspaceLabel(stats.codexHome || "");
  }
  syncPersonalizationProjectLabels();
}

async function loadServerThreadMetadata() {
  try {
    const data = await api("/api/thread-metadata");
    if (data && data.metadata && typeof data.metadata === "object") {
      state.threadMetadata = {};
      for (const [threadId, value] of Object.entries(data.metadata)) {
        state.threadMetadata[threadId] = normalizeThreadMetadata({ ...value, threadId });
      }
      persistThreadMetadata();
    }
  } catch (error) {
    console.debug("[thread metadata]", error.message);
  }
}

async function loadThreads() {
  const query = new URLSearchParams({
    archived: "all",
    sort: "updatedAt",
    dir: "desc",
    limit: "1000",
  });
  const data = await api(`/api/threads?${query.toString()}`);
  state.items = data.items || [];
  state.facets = data.facets;
  seedThreadConfigsFromItems(state.items);
  seedThreadMetadataFromItems(state.items);
  populateFacets();
  renderSidebarThreads();
  renderThreadManager();
  renderPersonalizationThreadPicker();
  renderChatThreadLine();
}

function populateFacets() {
  populateChatCwdSelect(state.facets.cwds);
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

  if (current && !items.some((item) => item.value === current)) {
    els.chatCwd.value = current;
  } else if (!current && items.length > 0) {
    els.chatCwd.value = items[0].value;
  }
  renderChatCwdMenu(items, els.chatCwd.value);
  syncCwdButton();
}

function renderChatCwdMenu(items, selectedValue) {
  const menu = els.chatCwdMenu;
  menu.innerHTML = "";

  const customRow = document.createElement("div");
  customRow.className = "choice-menu-custom";
  customRow.innerHTML = `
    <input type="text" class="custom-cwd-input" placeholder="Type a working directory..." spellcheck="false" autocomplete="off" />
    <button type="button" class="custom-cwd-use">Use</button>
  `;
  const input = customRow.querySelector("input");
  const useButton = customRow.querySelector("button");
  input.value = selectedValue || "";
  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    selectCwd(value);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeChoiceMenus();
    }
  });
  useButton.addEventListener("click", commit);
  menu.appendChild(customRow);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "choice-menu-empty";
    empty.textContent = "No indexed directories yet. Type a path above.";
    menu.appendChild(empty);
    return;
  }

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
    button.addEventListener("click", () => selectCwd(item.value));
    menu.appendChild(button);
  }
  markChoiceMenuSelection(menu, selectedValue);
}

function activeThreadItem() {
  if (!state.codex.threadId) return null;
  return state.items.find((item) => item.id === state.codex.threadId) || null;
}

function threadTitle(itemOrId) {
  const item = typeof itemOrId === "object" ? itemOrId : state.items.find((entry) => entry.id === itemOrId);
  const id = typeof itemOrId === "string" ? itemOrId : item?.id;
  const metadata = threadMetadata(id);
  return metadata.displayName || item?.title || item?.preview || (id ? `Thread ${shortId(id)}` : "New thread");
}

function threadProjectPath(itemOrId) {
  const item = typeof itemOrId === "object" ? itemOrId : state.items.find((entry) => entry.id === itemOrId);
  const id = typeof itemOrId === "string" ? itemOrId : item?.id;
  const metadata = threadMetadata(id);
  return metadata.projectPath || item?.cwd || "";
}

function threadUpdatedAt(item) {
  const metadata = threadMetadata(item?.id);
  return item?.updatedAtIso || item?.fileMtimeIso || metadata.updatedAt || item?.createdAtIso || "";
}

function threadCreatedAt(item) {
  const metadata = threadMetadata(item?.id);
  return item?.createdAtIso || metadata.createdAt || "";
}

function threadVisibility(itemOrId) {
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
  return threadMetadata(id).visibility || "active";
}

function isSidebarVisibleThread(item) {
  return threadVisibility(item) === "active";
}

function threadSearchHaystack(item) {
  const metadata = threadMetadata(item?.id);
  return [
    metadata.displayName,
    item?.title,
    item?.preview,
    metadata.projectPath,
    item?.cwd,
    item?.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function threadMatchesQuery(item, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return threadSearchHaystack(item).includes(needle);
}

function compareThreadsRecent(left, right) {
  const pinnedDelta = Number(Boolean(threadMetadata(right.id).pinned)) - Number(Boolean(threadMetadata(left.id).pinned));
  if (pinnedDelta) return pinnedDelta;
  return new Date(threadUpdatedAt(right) || 0).getTime() - new Date(threadUpdatedAt(left) || 0).getTime();
}

function threadStatusLabel(item) {
  if (item?.id && item.id === state.codex.threadId) return currentSessionStatus();
  const visibility = threadVisibility(item);
  if (visibility === "archived") return "Archived";
  if (visibility === "hidden") return "Hidden";
  return item?.archived ? "Codex archived" : "Ready";
}

function threadSecondaryLine(item) {
  return [shortPath(threadProjectPath(item)) || "No directory", formatDate(threadUpdatedAt(item)), threadStatusLabel(item)]
    .filter(Boolean)
    .join(" · ");
}

function groupRecentThreads(items) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  const groups = [
    { label: "Today", items: [] },
    { label: "This week", items: [] },
    { label: "Older", items: [] },
  ];

  for (const item of items) {
    const updated = new Date(threadUpdatedAt(item) || 0).getTime();
    if (updated >= todayStart) groups[0].items.push(item);
    else if (updated >= weekStart) groups[1].items.push(item);
    else groups[2].items.push(item);
  }
  return groups.filter((group) => group.items.length);
}

function renderSidebarThreads() {
  els.sidebarThreads.innerHTML = "";
  const query = state.sidebarQuery || "";
  const activeItems = state.items
    .filter(isSidebarVisibleThread)
    .filter((item) => threadMatchesQuery(item, query))
    .sort(compareThreadsRecent);
  const pinned = activeItems.filter((item) => threadMetadata(item.id).pinned);
  const recent = activeItems.filter((item) => !threadMetadata(item.id).pinned);
  els.sidebarThreadCount.textContent = formatNumber(activeItems.length);

  if (!activeItems.length) {
    els.sidebarThreads.innerHTML = `<span class="sidebar-empty">${query ? "No active threads match." : "No active threads."}</span>`;
    return;
  }

  if (pinned.length) appendSidebarThreadGroup("Pinned", pinned);
  const groups = groupRecentThreads(recent);
  if (groups.length) appendSidebarThreadGroup("Recent", groups);
}

function appendSidebarThreadGroup(label, groupOrItems) {
  const section = document.createElement("section");
  section.className = "thread-group";
  section.innerHTML = `<h4>${escapeHtml(label)}</h4>`;

  if (Array.isArray(groupOrItems) && groupOrItems[0]?.items) {
    for (const group of groupOrItems) {
      const subgroup = document.createElement("div");
      subgroup.className = "thread-subgroup";
      subgroup.innerHTML = `<h5>${escapeHtml(group.label)}</h5>`;
      for (const item of group.items) subgroup.appendChild(createSidebarThreadItem(item));
      section.appendChild(subgroup);
    }
  } else {
    for (const item of groupOrItems) section.appendChild(createSidebarThreadItem(item));
  }

  els.sidebarThreads.appendChild(section);
}

function createSidebarThreadItem(item) {
  const wrapper = document.createElement("article");
  wrapper.className = `sidebar-thread ${item.id === state.codex.threadId ? "active" : ""}`;
  wrapper.dataset.threadId = item.id;
  wrapper.title = item.id;
  wrapper.innerHTML = `
    <button class="thread-item-main" type="button">
      <strong>${escapeHtml(threadTitle(item))}</strong>
      <span>${escapeHtml(threadSecondaryLine(item))}</span>
    </button>
    <button class="thread-item-menu-button" type="button" aria-haspopup="menu" aria-expanded="false" title="Thread actions">...</button>
    <div class="thread-item-menu" role="menu" hidden>
      ${threadActionMenuHtml(item)}
    </div>
  `;
  wrapper.querySelector(".thread-item-main").addEventListener("click", () => resumeThreadFromNavigator(item.id));
  wrapper.querySelector(".thread-item-menu-button").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleThreadItemMenu(wrapper);
  });
  wrapper.querySelector(".thread-item-menu").addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-local-thread-action]") : null;
    if (!button) return;
    event.stopPropagation();
    closeThreadItemMenus();
    handleLocalThreadAction(button.getAttribute("data-local-thread-action"), item.id);
  });
  return wrapper;
}

function threadActionMenuHtml(item) {
  const metadata = threadMetadata(item.id);
  return `
    <button type="button" data-local-thread-action="rename" role="menuitem">Rename</button>
    <button type="button" data-local-thread-action="pin" role="menuitem">${metadata.pinned ? "Unpin" : "Pin"}</button>
    <button type="button" data-local-thread-action="archive" role="menuitem">Archive</button>
    <button type="button" data-local-thread-action="hide" role="menuitem">Hide from sidebar</button>
  `;
}

function toggleThreadItemMenu(wrapper) {
  const menu = wrapper.querySelector(".thread-item-menu");
  const button = wrapper.querySelector(".thread-item-menu-button");
  const willOpen = menu.hidden;
  closeThreadItemMenus();
  menu.hidden = !willOpen;
  button.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closeThreadItemMenus() {
  for (const menu of document.querySelectorAll(".thread-item-menu")) {
    menu.hidden = true;
  }
  for (const button of document.querySelectorAll(".thread-item-menu-button")) {
    button.setAttribute("aria-expanded", "false");
  }
}

function resumeThreadFromNavigator(threadId) {
  els.resumeThreadId.value = threadId;
  resumeCodexThreadById().catch((error) => appendChatLine("error", error.message));
}

function handleLocalThreadAction(action, threadId) {
  if (!threadId || !action) return;
  if (action === "rename") {
    openRenameThreadModal(threadId);
    return;
  }
  if (action === "pin") {
    const metadata = threadMetadata(threadId);
    updateThreadMetadata(threadId, { pinned: !metadata.pinned });
    return;
  }
  if (action === "archive") {
    updateThreadMetadata(threadId, { visibility: "archived" });
    showToast("Thread archived.", [{ label: "Undo", action: "restore", threadId }]);
    return;
  }
  if (action === "hide") {
    const previous = threadVisibility(threadId);
    updateThreadMetadata(threadId, { visibility: "hidden" });
    showToast("Thread hidden.", [
      { label: "Undo", action: "set-visibility", threadId, visibility: previous },
      { label: "View hidden", action: "view-hidden" },
    ]);
    return;
  }
  if (action === "restore") {
    updateThreadMetadata(threadId, { visibility: "active" });
  }
}

function openRenameThreadModal(threadId) {
  state.renameTargetThreadId = threadId || "";
  const item = state.items.find((entry) => entry.id === threadId);
  const metadata = threadMetadata(threadId);
  els.renameThreadInput.value = metadata.displayName || item?.title || item?.preview || "";
  els.renameThreadModal.hidden = false;
  setTimeout(() => {
    els.renameThreadInput.focus();
    els.renameThreadInput.select();
  }, 0);
}

function closeRenameThreadModal() {
  state.renameTargetThreadId = "";
  els.renameThreadModal.hidden = true;
}

function confirmRenameThread() {
  const threadId = state.renameTargetThreadId;
  const value = els.renameThreadInput.value.trim();
  if (!threadId) return;
  if (!value) {
    appendChatLine("warning", "Thread name cannot be empty.");
    return;
  }
  updateThreadMetadata(threadId, { displayName: value });
  appendCompactInfo("Thread display name updated locally");
  closeRenameThreadModal();
}

function showToast(message, actions = []) {
  if (!els.toastRegion) return;
  if (state.toastTimer) clearTimeout(state.toastTimer);
  els.toastRegion.innerHTML = "";
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <div class="toast-actions">
      ${actions.map((action, index) => `<button type="button" data-toast-action="${index}">${escapeHtml(action.label)}</button>`).join("")}
    </div>
  `;
  toast.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-toast-action]") : null;
    if (!button) return;
    const action = actions[Number(button.getAttribute("data-toast-action"))];
    if (!action) return;
    handleToastAction(action);
    els.toastRegion.innerHTML = "";
  });
  els.toastRegion.appendChild(toast);
  state.toastTimer = setTimeout(() => {
    els.toastRegion.innerHTML = "";
  }, 8000);
}

function handleToastAction(action) {
  if (action.action === "restore") {
    updateThreadMetadata(action.threadId, { visibility: "active" });
    return;
  }
  if (action.action === "set-visibility") {
    updateThreadMetadata(action.threadId, { visibility: action.visibility || "active" });
    return;
  }
  if (action.action === "view-hidden") {
    openThreadManager("hidden");
  }
}

function openThreadManager(scope = state.threadManager.scope || "active") {
  state.threadManager.open = true;
  state.threadManager.scope = scope;
  els.threadManagerModal.hidden = false;
  renderThreadManager();
  setTimeout(() => els.threadManagerSearch.focus(), 0);
}

function closeThreadManager() {
  state.threadManager.open = false;
  els.threadManagerModal.hidden = true;
}

function renderThreadManager() {
  if (!els.threadManagerResults) return;
  renderThreadManagerProjectOptions();
  for (const button of document.querySelectorAll("[data-manager-scope]")) {
    const active = button.getAttribute("data-manager-scope") === state.threadManager.scope;
    button.classList.toggle("active", active);
  }

  const items = filteredManagerThreads();
  const visibleIds = new Set(items.map((item) => item.id));
  for (const id of [...state.threadManager.selectedIds]) {
    if (!visibleIds.has(id)) state.threadManager.selectedIds.delete(id);
  }
  renderThreadManagerBulkbar(items);
  els.threadManagerResults.innerHTML = "";
  if (!items.length) {
    els.threadManagerResults.innerHTML = '<div class="details-empty compact-empty">No threads match this view.</div>';
    return;
  }

  for (const item of items) {
    els.threadManagerResults.appendChild(createThreadManagerRow(item));
  }
}

function renderThreadManagerProjectOptions() {
  const current = state.threadManager.project || "";
  const projects = new Map();
  for (const item of state.items) {
    const path = threadProjectPath(item);
    if (path) projects.set(path, (projects.get(path) || 0) + 1);
  }
  els.threadManagerProject.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All projects";
  els.threadManagerProject.appendChild(all);
  for (const [path, count] of [...projects.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    const option = document.createElement("option");
    option.value = path;
    option.textContent = `${shortPath(path)} (${count})`;
    els.threadManagerProject.appendChild(option);
  }
  els.threadManagerProject.value = [...els.threadManagerProject.options].some((option) => option.value === current) ? current : "";
  state.threadManager.project = els.threadManagerProject.value;
}

function filteredManagerThreads() {
  const scope = state.threadManager.scope;
  const query = state.threadManager.query;
  const project = state.threadManager.project;
  const items = state.items
    .filter((item) => scope === "all" || threadVisibility(item) === scope)
    .filter((item) => !project || threadProjectPath(item) === project)
    .filter((item) => threadMatchesQuery(item, query));

  if (state.threadManager.sort === "title") {
    return items.sort((left, right) => threadTitle(left).localeCompare(threadTitle(right)));
  }
  if (state.threadManager.sort === "project") {
    return items.sort((left, right) => threadProjectPath(left).localeCompare(threadProjectPath(right)) || compareThreadsRecent(left, right));
  }
  return items.sort(compareThreadsRecent);
}

function createThreadManagerRow(item) {
  const row = document.createElement("article");
  row.className = "manager-thread-row";
  row.dataset.threadId = item.id;
  const visibility = threadVisibility(item);
  const restoreButton =
    visibility === "active"
      ? ""
      : '<button type="button" data-manager-action="restore">Restore to sidebar</button>';
  const archiveButton =
    visibility === "archived"
      ? ""
      : '<button type="button" data-manager-action="archive">Archive</button>';
  const hideButton =
    visibility === "hidden"
      ? ""
      : '<button type="button" data-manager-action="hide">Hide from sidebar</button>';
  row.innerHTML = `
    <label class="manager-row-check" title="Select thread">
      <input type="checkbox" data-manager-select="${escapeAttr(item.id)}" ${state.threadManager.selectedIds.has(item.id) ? "checked" : ""} />
    </label>
    <div class="manager-thread-main">
      <strong>${escapeHtml(threadTitle(item))}</strong>
      <span>${escapeHtml(threadProjectPath(item) ? shortPath(threadProjectPath(item)) : item.preview || "No project path")}</span>
      <em>${escapeHtml([titleCase(visibility), formatDate(threadUpdatedAt(item)), item.archived ? "Codex archived" : ""].filter(Boolean).join(" · "))}</em>
    </div>
    <div class="manager-row-actions">
      <button type="button" data-manager-action="open">Open</button>
      <button type="button" data-manager-action="rename">Rename</button>
      <button type="button" data-manager-action="pin">${threadMetadata(item.id).pinned ? "Unpin" : "Pin"}</button>
      ${restoreButton}
      ${archiveButton}
      ${hideButton}
    </div>
  `;
  row.addEventListener("click", (event) => {
    const checkbox = event.target instanceof Element ? event.target.closest("[data-manager-select]") : null;
    if (checkbox) {
      const id = checkbox.getAttribute("data-manager-select");
      if (checkbox.checked) state.threadManager.selectedIds.add(id);
      else state.threadManager.selectedIds.delete(id);
      renderThreadManagerBulkbar(filteredManagerThreads());
      return;
    }
    const button = event.target instanceof Element ? event.target.closest("[data-manager-action]") : null;
    if (!button) return;
    const action = button.getAttribute("data-manager-action");
    handleManagerThreadAction(action, item.id);
  });
  return row;
}

function renderThreadManagerBulkbar(items) {
  const visibleIds = items.map((item) => item.id);
  const selectedVisible = visibleIds.filter((id) => state.threadManager.selectedIds.has(id));
  els.threadManagerSelectedCount.textContent = `${formatNumber(state.threadManager.selectedIds.size)} selected`;
  els.threadManagerSelectAll.checked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  els.threadManagerSelectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleIds.length;
  const disabled = state.threadManager.selectedIds.size === 0;
  for (const button of [els.bulkRestoreThreads, els.bulkArchiveThreads, els.bulkHideThreads]) {
    button.disabled = disabled;
  }
}

function setVisibleManagerSelection(checked) {
  for (const item of filteredManagerThreads()) {
    if (checked) state.threadManager.selectedIds.add(item.id);
    else state.threadManager.selectedIds.delete(item.id);
  }
  renderThreadManager();
}

function bulkUpdateThreads(patch) {
  const ids = [...state.threadManager.selectedIds];
  for (const id of ids) updateThreadMetadata(id, patch);
  showToast(`${formatNumber(ids.length)} threads updated.`);
  state.threadManager.selectedIds.clear();
  renderThreadManager();
}

function handleManagerThreadAction(action, threadId) {
  if (action === "open") {
    closeThreadManager();
    resumeThreadFromNavigator(threadId);
    return;
  }
  if (action === "restore") {
    updateThreadMetadata(threadId, { visibility: "active" });
    showToast("Thread restored to sidebar.");
    return;
  }
  handleLocalThreadAction(action, threadId);
}

function openPersonalizationWizard() {
  state.personalization.step = 1;
  state.personalization.preview = null;
  state.personalization.suggestions = [];
  if (!state.personalization.selectedThreadIds.size && state.codex.threadId) {
    state.personalization.selectedThreadIds.add(state.codex.threadId);
  }
  syncPersonalizationProjectLabels();
  els.personalizationModal.hidden = false;
  renderPersonalizationWizard();
}

function closePersonalizationWizard() {
  els.personalizationModal.hidden = true;
}

function syncPersonalizationProjectLabels() {
  const project = state.projectRoot || els.chatCwd.value || "Current project";
  if (els.personalizationProjectLabel) els.personalizationProjectLabel.textContent = shortPath(project);
  if (els.projectAgentsPath) els.projectAgentsPath.textContent = shortPath(`${project}/AGENTS.md`);
}

function renderPersonalizationWizard() {
  const step = state.personalization.step;
  els.personalizationSubtitle.textContent =
    step === 1 ? "Learn from past threads" : step === 2 ? "Choose suggestions" : step === 3 ? "Choose write target" : "Preview before apply";
  els.personalizationSteps.innerHTML = [1, 2, 3, 4]
    .map((item) => `<span class="${item === step ? "active" : item < step ? "done" : ""}">${item}</span>`)
    .join("");
  for (const panel of document.querySelectorAll("[data-personalization-step]")) {
    const active = Number(panel.getAttribute("data-personalization-step")) === step;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  }
  els.personalizationBack.hidden = step === 1;
  els.personalizationNext.hidden = step === 4;
  els.personalizationApply.hidden = step !== 4;
  els.personalizationSaveDraft.hidden = step !== 4;
  els.personalizationApply.disabled = !state.personalization.preview;
  if (step === 2) renderPersonalizationSuggestions();
  if (step === 1) {
    renderPersonalizationThreadPicker();
    updatePersonalizationThreadPickerVisibility();
  }
  if (step === 4 && !state.personalization.preview) {
    previewAgentsChanges().catch((error) => {
      els.agentsPreviewMeta.textContent = error.message;
      els.agentsDiffPreview.textContent = "";
    });
  }
}

async function nextPersonalizationStep() {
  if (state.personalization.step === 1) {
    try {
      state.personalization.suggestions = await fetchPersonalizationSuggestions();
    } catch (error) {
      showToast(error.message);
      return;
    }
  }
  if (state.personalization.step === 2 && selectedPersonalizationSuggestions().length === 0) {
    showToast("Select at least one suggestion before previewing a diff.");
    return;
  }
  state.personalization.preview = null;
  state.personalization.step = Math.min(4, state.personalization.step + 1);
  renderPersonalizationWizard();
}

function previousPersonalizationStep() {
  state.personalization.preview = null;
  state.personalization.step = Math.max(1, state.personalization.step - 1);
  renderPersonalizationWizard();
}

function personalizationScope() {
  return document.querySelector('input[name="personalizationScope"]:checked')?.value || "current_project";
}

function agentsTarget() {
  return document.querySelector('input[name="agentsTarget"]:checked')?.value || "project";
}

function personalizationPayload() {
  const include = [];
  if (els.personalizationIncludeActive.checked) include.push("active");
  if (els.personalizationIncludeArchived.checked) include.push("archived");
  if (els.personalizationIncludeHidden.checked) include.push("hidden");
  return {
    scope: personalizationScope(),
    include,
    projectPath: state.projectRoot || els.chatCwd.value || "",
    selectedThreadIds: [...state.personalization.selectedThreadIds],
  };
}

async function fetchPersonalizationSuggestions() {
  const data = await postJson("/api/personalization/suggestions", personalizationPayload());
  return (data.suggestions || []).map((item, index) => ({
    id: item.id || `suggestion-${index}`,
    category: item.category || "Detected patterns",
    target: item.target || "global",
    text: item.text || "",
    evidence: item.evidence || "",
    selected: item.selected !== false,
  }));
}

function renderPersonalizationSuggestions() {
  els.personalizationSuggestions.innerHTML = "";
  if (!state.personalization.suggestions.length) {
    els.personalizationSuggestions.innerHTML = '<div class="details-empty compact-empty">No suggestions generated from the selected scope.</div>';
    return;
  }
  for (const suggestion of state.personalization.suggestions) {
    const label = document.createElement("label");
    label.className = "suggestion-card";
    label.innerHTML = `
      <input type="checkbox" data-suggestion-id="${escapeAttr(suggestion.id)}" ${suggestion.selected ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(suggestion.category)}</strong>
        ${escapeHtml(suggestion.text)}
        ${suggestion.evidence ? `<em>${escapeHtml(suggestion.evidence)}</em>` : ""}
      </span>
    `;
    label.querySelector("input").addEventListener("change", (event) => {
      const id = event.target.getAttribute("data-suggestion-id");
      const item = state.personalization.suggestions.find((entry) => entry.id === id);
      if (item) item.selected = event.target.checked;
      state.personalization.preview = null;
    });
    els.personalizationSuggestions.appendChild(label);
  }
}

function updatePersonalizationThreadPickerVisibility() {
  const visible = personalizationScope() === "selected_thread";
  els.personalizationThreadPicker.hidden = !visible;
}

function renderPersonalizationThreadPicker() {
  if (!els.personalizationThreadList) return;
  const query = state.personalization.threadQuery || "";
  const items = state.items.filter((item) => threadMatchesQuery(item, query)).sort(compareThreadsRecent).slice(0, 80);
  els.personalizationThreadList.innerHTML = "";
  if (!items.length) {
    els.personalizationThreadList.innerHTML = '<div class="details-empty compact-empty">No threads match.</div>';
    return;
  }
  for (const item of items) {
    const label = document.createElement("label");
    label.className = "thread-picker-row";
    label.innerHTML = `
      <input type="checkbox" data-personalization-thread="${escapeAttr(item.id)}" ${state.personalization.selectedThreadIds.has(item.id) ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(threadTitle(item))}</strong>
        <em>${escapeHtml(threadSecondaryLine(item))}</em>
      </span>
    `;
    label.querySelector("input").addEventListener("change", (event) => {
      const id = event.target.getAttribute("data-personalization-thread");
      if (event.target.checked) state.personalization.selectedThreadIds.add(id);
      else state.personalization.selectedThreadIds.delete(id);
      state.personalization.preview = null;
    });
    els.personalizationThreadList.appendChild(label);
  }
}

function selectedPersonalizationSuggestions() {
  return state.personalization.suggestions.filter((item) => item.selected);
}

function agentsEntriesForPreview() {
  const target = agentsTarget();
  return selectedPersonalizationSuggestions()
    .filter((item) => target === "project" || item.target !== "project")
    .map((item) => ({
      category: item.category,
      text: item.text,
    }));
}

async function previewAgentsChanges() {
  const target = agentsTarget();
  const entries = agentsEntriesForPreview();
  if (!entries.length) {
    els.agentsPreviewMeta.textContent = "No selected suggestions apply to this target.";
    els.agentsDiffPreview.textContent = "";
    state.personalization.preview = null;
    els.personalizationApply.disabled = true;
    return;
  }
  els.agentsPreviewMeta.textContent = "Generating diff preview...";
  els.agentsDiffPreview.textContent = "";
  const preview = await postJson("/api/agents/preview", { target, entries });
  state.personalization.preview = preview;
  els.agentsPreviewMeta.textContent = `${preview.exists ? "Updating" : "Creating"} ${shortPath(preview.targetPath || "")}`;
  els.agentsDiffPreview.textContent = preview.diff || "(no changes)";
  els.personalizationApply.disabled = !preview.diff;
}

async function applyAgentsChanges() {
  if (!state.personalization.preview) return;
  const entries = agentsEntriesForPreview();
  const result = await postJson("/api/agents/apply", { target: agentsTarget(), entries });
  showToast(`AGENTS.md updated: ${shortPath(result.targetPath || "")}`);
  closePersonalizationWizard();
}

function saveAgentsDraft() {
  const draft = {
    target: agentsTarget(),
    entries: agentsEntriesForPreview(),
    diff: state.personalization.preview?.diff || "",
    savedAt: new Date().toISOString(),
  };
  try {
    window.localStorage?.setItem(AGENTS_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    showToast("Draft saved locally.");
  } catch {
    showToast("Could not save draft locally.");
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
  const activeConfig = state.codex.threadId ? state.threadConfigs[state.codex.threadId] || {} : {};
  const preferredModel = activeConfig.model || els.chatModel.value || (defaultModel ? defaultModel.model || defaultModel.id : "");
  if (preferredModel) {
    els.chatModel.value = preferredModel;
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
  if (hasOwn(activeConfig, "serviceTier")) updateEffortOptions(activeConfig.effort || els.chatEffort.value || null, activeConfig.serviceTier);
  else updateEffortOptions(activeConfig.effort || els.chatEffort.value || null);
}

function selectedModelInfo() {
  return modelInfoForValue(els.chatModel.value);
}

function modelInfoForValue(value) {
  return state.models.find((model) => (model.model || model.id) === value) || null;
}

function loadThreadConfigs() {
  try {
    const raw = window.localStorage?.getItem(THREAD_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const configs = {};
    for (const [threadId, value] of Object.entries(parsed)) {
      if (!threadId || !value || typeof value !== "object" || Array.isArray(value)) continue;
      configs[threadId] = normalizeThreadConfig(value);
    }
    return configs;
  } catch {
    return {};
  }
}

function persistThreadConfigs() {
  try {
    window.localStorage?.setItem(THREAD_CONFIG_STORAGE_KEY, JSON.stringify(state.threadConfigs));
  } catch {
    // localStorage can be unavailable in private or restricted browser contexts.
  }
}

function loadThreadMetadata() {
  try {
    const raw = window.localStorage?.getItem(THREAD_METADATA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const metadata = {};
    for (const [threadId, value] of Object.entries(parsed)) {
      if (!threadId || !value || typeof value !== "object" || Array.isArray(value)) continue;
      metadata[threadId] = normalizeThreadMetadata({ ...value, threadId });
    }
    return metadata;
  } catch {
    return {};
  }
}

function persistThreadMetadata() {
  try {
    window.localStorage?.setItem(THREAD_METADATA_STORAGE_KEY, JSON.stringify(state.threadMetadata));
  } catch {
    // localStorage can be unavailable in private or restricted browser contexts.
  }
}

function normalizeThreadMetadata(value = {}) {
  const metadata = {
    threadId: configValue(value.threadId) || "",
    visibility: THREAD_VISIBILITIES.has(value.visibility) ? value.visibility : "active",
  };
  if (hasOwn(value, "displayName")) metadata.displayName = configValue(value.displayName);
  if (hasOwn(value, "pinned")) metadata.pinned = Boolean(value.pinned);
  if (hasOwn(value, "projectPath")) metadata.projectPath = configValue(value.projectPath);
  if (hasOwn(value, "createdAt")) metadata.createdAt = configValue(value.createdAt);
  if (hasOwn(value, "updatedAt")) metadata.updatedAt = configValue(value.updatedAt);
  if (hasOwn(value, "lastOpenedAt")) metadata.lastOpenedAt = configValue(value.lastOpenedAt);
  return metadata;
}

function threadMetadata(threadId) {
  if (!threadId) return { threadId: "", visibility: "active" };
  return state.threadMetadata[threadId] || { threadId, visibility: "active" };
}

function updateThreadMetadata(threadId, patch, options = {}) {
  if (!threadId) return threadMetadata(threadId);
  const existing = threadMetadata(threadId);
  const next = normalizeThreadMetadata({ ...existing, ...patch, threadId });
  state.threadMetadata[threadId] = next;
  if (options.persist !== false) persistThreadMetadata();
  if (options.persist !== false) persistThreadMetadataToServer(threadId, next);
  renderSidebarThreads();
  renderThreadManager();
  renderPersonalizationThreadPicker();
  renderChatThreadLine();
  return next;
}

function persistThreadMetadataToServer(threadId, metadata) {
  postJson(`/api/thread-metadata/${encodeURIComponent(threadId)}`, metadata).catch((error) => {
    console.debug("[thread metadata persist]", error.message);
  });
}

function seedThreadMetadataFromItems(items) {
  let changed = false;
  for (const item of items || []) {
    if (!item?.id) continue;
    const existing = threadMetadata(item.id);
    const next = {
      ...existing,
      threadId: item.id,
      visibility: existing.visibility || "active",
      projectPath: existing.projectPath || item.cwd || "",
      createdAt: item.createdAtIso || existing.createdAt || "",
      updatedAt: item.updatedAtIso || item.fileMtimeIso || existing.updatedAt || "",
    };
    const normalized = normalizeThreadMetadata(next);
    if (JSON.stringify(state.threadMetadata[item.id]) !== JSON.stringify(normalized)) {
      state.threadMetadata[item.id] = normalized;
      changed = true;
    }
  }
  if (changed) persistThreadMetadata();
}

function normalizeThreadConfig(value = {}) {
  if (!value || typeof value !== "object") return {};
  const config = {};
  if (hasOwn(value, "cwd")) config.cwd = configValue(value.cwd);
  if (hasOwn(value, "model")) config.model = configValue(value.model);
  if (hasOwn(value, "effort")) config.effort = configValue(value.effort);
  else if (hasOwn(value, "reasoningEffort")) config.effort = configValue(value.reasoningEffort);
  else if (hasOwn(value, "reasoning_effort")) config.effort = configValue(value.reasoning_effort);
  if (hasOwn(value, "serviceTier")) config.serviceTier = configValue(value.serviceTier);
  else if (hasOwn(value, "service_tier")) config.serviceTier = configValue(value.service_tier);
  if (hasOwn(value, "updatedAt")) {
    const updatedAt = Number(value.updatedAt);
    if (Number.isFinite(updatedAt)) config.updatedAt = updatedAt;
  }
  return config;
}

function configValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function mergeThreadConfig(threadId, config, options = {}) {
  if (!threadId) return {};
  const incoming = normalizeThreadConfig(config);
  const incomingKeys = ["cwd", "model", "effort", "serviceTier"].filter((key) => hasOwn(incoming, key));
  if (!incomingKeys.length) return state.threadConfigs[threadId] || {};
  const existing = state.threadConfigs[threadId] || {};
  const next = { ...existing };
  const overwrite = options.overwrite !== false;
  let changed = !state.threadConfigs[threadId];

  for (const key of incomingKeys) {
    if (!overwrite && hasOwn(next, key) && next[key] !== null && next[key] !== "") continue;
    if (next[key] !== incoming[key]) {
      next[key] = incoming[key];
      changed = true;
    }
  }

  if (changed) {
    next.updatedAt = Date.now();
    state.threadConfigs[threadId] = next;
    if (options.persist !== false) persistThreadConfigs();
  }
  return state.threadConfigs[threadId] || {};
}

function configFromIndexedThread(item) {
  const config = {};
  if (item?.cwd) config.cwd = item.cwd;
  if (item?.model) config.model = item.model;
  if (item?.reasoning_effort) config.effort = item.reasoning_effort;
  return config;
}

function configFromCodexThreadResult(result) {
  const root = result?.threadStart || result || {};
  const thread = root.thread || {};
  const config = {};
  if (hasOwn(root, "cwd")) config.cwd = root.cwd;
  else if (hasOwn(thread, "cwd")) config.cwd = thread.cwd;
  if (hasOwn(root, "model")) config.model = root.model;
  else if (hasOwn(thread, "model")) config.model = thread.model;
  if (hasOwn(root, "reasoningEffort")) config.effort = root.reasoningEffort;
  else if (hasOwn(root, "reasoning_effort")) config.effort = root.reasoning_effort;
  else if (hasOwn(thread, "reasoningEffort")) config.effort = thread.reasoningEffort;
  else if (hasOwn(thread, "reasoning_effort")) config.effort = thread.reasoning_effort;
  if (hasOwn(root, "serviceTier")) config.serviceTier = root.serviceTier;
  else if (hasOwn(root, "service_tier")) config.serviceTier = root.service_tier;
  return config;
}

function rememberThreadConfigFromCodexResult(threadId, result, fallback = {}) {
  if (!threadId) return {};
  const combined = normalizeThreadConfig(fallback);
  const actual = configFromCodexThreadResult(result);
  for (const key of ["cwd", "model", "effort", "serviceTier"]) {
    if (hasOwn(actual, key)) combined[key] = actual[key];
  }
  return mergeThreadConfig(threadId, combined, { overwrite: true });
}

function seedThreadConfigsFromItems(items) {
  for (const item of items || []) {
    mergeThreadConfig(item.id, configFromIndexedThread(item), { overwrite: false, persist: false });
  }
  persistThreadConfigs();
}

async function ensureThreadConfig(threadId) {
  if (!threadId) return {};
  const indexed = state.items.find((item) => item.id === threadId);
  if (indexed) {
    return mergeThreadConfig(threadId, configFromIndexedThread(indexed), { overwrite: false });
  }

  try {
    const item = await api(`/api/threads/${encodeURIComponent(threadId)}`);
    return mergeThreadConfig(threadId, configFromIndexedThread(item), { overwrite: false });
  } catch {
    return state.threadConfigs[threadId] || {};
  }
}

function optionsFromThreadConfig(config) {
  const normalized = normalizeThreadConfig(config);
  return {
    cwd: normalized.cwd || "",
    model: normalized.model || null,
    effort: normalized.effort || null,
    serviceTier: hasOwn(normalized, "serviceTier") ? normalized.serviceTier : null,
  };
}

function hasThreadConfigValues(config) {
  return ["cwd", "model", "effort", "serviceTier"].some((key) => hasOwn(config, key));
}

function saveActiveThreadConfig() {
  if (state.applyingThreadConfig || !state.codex.threadId) return;
  mergeThreadConfig(state.codex.threadId, chatOptions(), { overwrite: true });
}

function applyThreadConfigToControls(config = {}) {
  const normalized = normalizeThreadConfig(config);
  state.applyingThreadConfig = true;
  try {
    if (hasOwn(normalized, "cwd")) els.chatCwd.value = normalized.cwd || "";
    if (hasOwn(normalized, "model")) els.chatModel.value = normalized.model || "";
    syncCwdButton();
    syncModelButton();
    updateEffortOptions(
      hasOwn(normalized, "effort") ? normalized.effort : null,
      hasOwn(normalized, "serviceTier") ? normalized.serviceTier : null,
    );
  } finally {
    state.applyingThreadConfig = false;
  }
  renderChatStatus();
}

function selectCwd(value) {
  els.chatCwd.value = value || "";
  closeChoiceMenus();
  syncCwdButton();
  saveActiveThreadConfig();
}

function syncCwdButton() {
  const value = els.chatCwd.value;
  const label = value ? shortPath(value) : "No directory";
  els.chatCwdButton.querySelector("strong").textContent = label;
  els.chatCwdButton.title = value || label;
  setWorkspaceLabel(value || label);
  markChoiceMenuSelection(els.chatCwdMenu, value);
  updateChatEmptyState();
  renderActivitySidebar();
}

function updateEffortOptions(preferredEffort = els.chatEffort.value, preferredServiceTier) {
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
    const preferred = preferredEffort || "";
    const hasPreferred = efforts.some((effort) => effort.reasoningEffort === preferred);
    els.chatEffort.value = hasPreferred ? preferred : model.defaultReasoningEffort || efforts[0].reasoningEffort;
  }

  renderChoiceMenu(els.chatEffortMenu, items, els.chatEffort.value, selectEffort);
  syncEffortButton();
  if (arguments.length >= 2) updateFastModeControl(preferredServiceTier);
  else updateFastModeControl();
}

function selectModel(value) {
  els.chatModel.value = value || "";
  closeChoiceMenus();
  syncModelButton();
  updateEffortOptions();
  saveActiveThreadConfig();
}

function selectEffort(value) {
  els.chatEffort.value = value || "";
  closeChoiceMenus();
  syncEffortButton();
  saveActiveThreadConfig();
}

function syncModelButton() {
  const model = selectedModelInfo();
  const label = model ? model.displayName || model.model || model.id : els.chatModel.value || "Model";
  els.chatModelButton.querySelector("strong").textContent = label;
  els.chatModelButton.title = model?.description || label;
  markChoiceMenuSelection(els.chatModelMenu, els.chatModel.value);
  updateChatEmptyState();
  renderActivitySidebar();
}

function syncEffortButton() {
  const label = displayReasoningEffort(els.chatEffort.value);
  els.chatEffortButton.querySelector("strong").textContent = `Reasoning: ${label}`;
  markChoiceMenuSelection(els.chatEffortMenu, els.chatEffort.value);
  updateChatEmptyState();
  renderActivitySidebar();
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
    [els.newThreadCwdButton, els.newThreadCwdMenu],
    [els.newThreadModelButton, els.newThreadModelMenu],
    [els.newThreadEffortButton, els.newThreadEffortMenu],
  ]) {
    if (!button || !menu) continue;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
  closeThreadActionMenu();
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

function updateFastModeControl(preferredServiceTier) {
  const tier = selectedFastTier();
  const hasPreferred = arguments.length > 0;
  els.chatFastMode.disabled = !tier;
  if (!tier) {
    els.chatFastMode.checked = false;
  } else if (hasPreferred) {
    els.chatFastMode.checked = Boolean(preferredServiceTier && tier.id === preferredServiceTier);
  } else if (els.chatFastMode.dataset.initialized !== "true") {
    els.chatFastMode.checked = true;
  }
  els.chatFastMode.dataset.initialized = "true";
  els.chatFastLabel.title = tier ? tier.description || tier.name || tier.id || "Fast" : "";
  syncFastModeLabel();
  updateChatEmptyState();
}

function syncFastModeLabel() {
  const tier = selectedFastTier();
  const available = Boolean(tier) && !els.chatFastMode.disabled;
  els.chatFastLabel.textContent = available ? `Fast mode: ${els.chatFastMode.checked ? "On" : "Off"}` : "Fast mode unavailable";
  els.chatFastMode.closest(".fast-toggle").classList.toggle("on", els.chatFastMode.checked && available);
  els.chatFastMode.closest(".fast-toggle").classList.toggle("disabled", !available);
}

function selectedFastTier() {
  return selectedFastTierForModel(els.chatModel.value);
}

function displayReasoningEffort(value) {
  const normalized = String(value || "").toLowerCase();
  const labels = {
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra high",
  };
  return labels[normalized] || (value ? titleCase(value) : "Default");
}

function selectedModelLabel() {
  return modelLabelForValue(els.chatModel.value) || "Loading...";
}

function modelLabelForValue(value) {
  const model = modelInfoForValue(value);
  return model ? model.displayName || model.model || model.id : value || "";
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

function newThreadOptions() {
  const tier = selectedNewThreadFastTier();
  return {
    cwd: els.newThreadCwd.value.trim(),
    model: els.newThreadModel.value || null,
    effort: els.newThreadEffort.value || null,
    serviceTier: els.newThreadFastMode.checked && tier ? tier.id : null,
  };
}

async function openNewThreadModal() {
  await loadCodexModels();
  closeChoiceMenus();
  const activeConfig = state.codex.threadId ? state.threadConfigs[state.codex.threadId] || {} : {};
  const base = hasThreadConfigValues(activeConfig) ? optionsFromThreadConfig(activeConfig) : chatOptions();
  setNewThreadDraft(base);
  els.newThreadModal.hidden = false;
  els.confirmNewThread.disabled = false;
  els.confirmNewThread.textContent = "Create Thread";
  setTimeout(() => els.newThreadCwdButton.focus(), 0);
}

function closeNewThreadModal() {
  closeChoiceMenus();
  els.newThreadModal.hidden = true;
  els.newCodexThread.focus();
}

function setNewThreadDraft(config = {}) {
  const normalized = normalizeThreadConfig(config);
  const defaultModel = state.models.find((model) => model.isDefault) || state.models[0];
  els.newThreadCwd.value = hasOwn(normalized, "cwd") ? normalized.cwd || "" : els.chatCwd.value.trim();
  els.newThreadModel.value = normalized.model || (defaultModel ? defaultModel.model || defaultModel.id : "") || "";
  renderNewThreadCwdMenu();
  renderNewThreadModelMenu();
  if (hasOwn(normalized, "serviceTier")) updateNewThreadEffortOptions(normalized.effort || null, normalized.serviceTier);
  else updateNewThreadEffortOptions(normalized.effort || null);
  syncNewThreadSummary();
}

function renderNewThreadCwdMenu() {
  const menu = els.newThreadCwdMenu;
  const selectedValue = els.newThreadCwd.value;
  const items = state.facets.cwds
    .filter((item) => item.value && item.value !== "(no cwd)")
    .map((item) => ({
      value: item.value,
      label: shortPath(item.value),
      description: `${item.count} threads`,
    }));

  menu.innerHTML = "";
  const customRow = document.createElement("div");
  customRow.className = "choice-menu-custom";
  customRow.innerHTML = `
    <input type="text" class="custom-cwd-input" placeholder="Type a working directory..." spellcheck="false" autocomplete="off" />
    <button type="button" class="custom-cwd-use">Use</button>
  `;
  const input = customRow.querySelector("input");
  const useButton = customRow.querySelector("button");
  input.value = selectedValue || "";
  const commit = () => {
    const value = input.value.trim();
    if (!value) return;
    selectNewThreadCwd(value);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeChoiceMenus();
    }
  });
  useButton.addEventListener("click", commit);
  menu.appendChild(customRow);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "choice-menu-empty";
    empty.textContent = "No indexed directories yet. Type a path above.";
    menu.appendChild(empty);
    syncNewThreadCwdButton();
    return;
  }

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
    button.addEventListener("click", () => selectNewThreadCwd(item.value));
    menu.appendChild(button);
  }
  markChoiceMenuSelection(menu, selectedValue);
  syncNewThreadCwdButton();
}

function renderNewThreadModelMenu() {
  renderChoiceMenu(
    els.newThreadModelMenu,
    state.models.map((model) => ({
      value: model.model || model.id,
      label: model.displayName || model.model || model.id,
      description: model.description || "",
    })),
    els.newThreadModel.value,
    selectNewThreadModel,
  );
  syncNewThreadModelButton();
}

function updateNewThreadEffortOptions(preferredEffort = els.newThreadEffort.value, preferredServiceTier) {
  const model = modelInfoForValue(els.newThreadModel.value);
  const efforts = model ? model.supportedReasoningEfforts || [] : [];
  const items = [];

  if (!efforts.length) {
    els.newThreadEffort.value = "";
    items.push({ value: "", label: "Default", description: "" });
  } else {
    for (const effort of efforts) {
      items.push({
        value: effort.reasoningEffort,
        label: effort.reasoningEffort,
        description: effort.description || "",
      });
    }
    const preferred = preferredEffort || "";
    const hasPreferred = efforts.some((effort) => effort.reasoningEffort === preferred);
    els.newThreadEffort.value = hasPreferred ? preferred : model.defaultReasoningEffort || efforts[0].reasoningEffort;
  }

  renderChoiceMenu(els.newThreadEffortMenu, items, els.newThreadEffort.value, selectNewThreadEffort);
  syncNewThreadEffortButton();
  if (arguments.length >= 2) updateNewThreadFastModeControl(preferredServiceTier);
  else updateNewThreadFastModeControl();
}

function selectNewThreadCwd(value) {
  els.newThreadCwd.value = value || "";
  closeChoiceMenus();
  syncNewThreadCwdButton();
}

function selectNewThreadModel(value) {
  els.newThreadModel.value = value || "";
  closeChoiceMenus();
  syncNewThreadModelButton();
  updateNewThreadEffortOptions();
}

function selectNewThreadEffort(value) {
  els.newThreadEffort.value = value || "";
  closeChoiceMenus();
  syncNewThreadEffortButton();
}

function syncNewThreadCwdButton() {
  const value = els.newThreadCwd.value;
  const label = value ? shortPath(value) : "No directory";
  els.newThreadCwdButton.querySelector("strong").textContent = label;
  els.newThreadCwdButton.title = value || label;
  const input = els.newThreadCwdMenu.querySelector(".custom-cwd-input");
  if (input) input.value = value || "";
  markChoiceMenuSelection(els.newThreadCwdMenu, value);
  syncNewThreadSummary();
}

function syncNewThreadModelButton() {
  const label = modelLabelForValue(els.newThreadModel.value) || "Model";
  els.newThreadModelButton.querySelector("strong").textContent = label;
  els.newThreadModelButton.title = modelInfoForValue(els.newThreadModel.value)?.description || label;
  markChoiceMenuSelection(els.newThreadModelMenu, els.newThreadModel.value);
  syncNewThreadSummary();
}

function syncNewThreadEffortButton() {
  const label = displayReasoningEffort(els.newThreadEffort.value);
  els.newThreadEffortButton.querySelector("strong").textContent = `Reasoning: ${label}`;
  markChoiceMenuSelection(els.newThreadEffortMenu, els.newThreadEffort.value);
  syncNewThreadSummary();
}

function selectedFastTierForModel(modelValue) {
  const model = modelInfoForValue(modelValue);
  if (!model) return null;
  const serviceTiers = model.serviceTiers || [];
  if (serviceTiers.length > 0) return serviceTiers[0];
  const legacyTier = (model.additionalSpeedTiers || [])[0];
  return legacyTier ? { id: legacyTier, name: "Fast", description: legacyTier } : null;
}

function selectedNewThreadFastTier() {
  return selectedFastTierForModel(els.newThreadModel.value);
}

function updateNewThreadFastModeControl(preferredServiceTier) {
  const tier = selectedNewThreadFastTier();
  const wasDisabled = els.newThreadFastMode.disabled;
  const hasPreferred = arguments.length > 0;
  els.newThreadFastMode.disabled = !tier;
  if (!tier) {
    els.newThreadFastMode.checked = false;
  } else if (hasPreferred) {
    els.newThreadFastMode.checked = Boolean(preferredServiceTier && tier.id === preferredServiceTier);
  } else if (els.newThreadFastMode.dataset.initialized !== "true" || wasDisabled) {
    els.newThreadFastMode.checked = true;
  }
  els.newThreadFastMode.dataset.initialized = "true";
  els.newThreadFastLabel.title = tier ? tier.description || tier.name || tier.id || "Fast" : "";
  syncNewThreadFastModeLabel();
}

function syncNewThreadFastModeLabel() {
  const tier = selectedNewThreadFastTier();
  const available = Boolean(tier) && !els.newThreadFastMode.disabled;
  els.newThreadFastLabel.textContent = available ? `Fast mode: ${els.newThreadFastMode.checked ? "On" : "Off"}` : "Fast mode unavailable";
  els.newThreadFastMode.closest(".fast-toggle").classList.toggle("on", els.newThreadFastMode.checked && available);
  els.newThreadFastMode.closest(".fast-toggle").classList.toggle("disabled", !available);
  syncNewThreadSummary();
}

function syncNewThreadSummary() {
  const cwd = shortPath(els.newThreadCwd.value) || "No directory";
  const model = modelLabelForValue(els.newThreadModel.value) || "Model";
  const effort = displayReasoningEffort(els.newThreadEffort.value);
  const fast = els.newThreadFastMode.checked && selectedNewThreadFastTier() ? "Fast" : "Standard";
  els.newThreadSummary.textContent = [cwd, model, effort, fast].filter(Boolean).join(" · ");
}

async function confirmNewThread() {
  const options = newThreadOptions();
  els.confirmNewThread.disabled = true;
  els.confirmNewThread.textContent = "Creating...";
  try {
    await startNewCodexThread(true, options);
    closeNewThreadModal();
  } catch (error) {
    els.confirmNewThread.disabled = false;
    els.confirmNewThread.textContent = "Create Thread";
    appendChatLine("error", error.message);
  }
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
    if (id) {
      mergeThreadConfig(id, configFromCodexThreadResult(params), { overwrite: false });
      setActiveThread(id, { applyConfig: false });
    }
    setChatActivity("");
    return;
  }
  if (method === "thread/status/changed") {
    updateThreadStatus(params);
    return;
  }
  if (method === "turn/started") {
    state.codex.turnId = params.turn && params.turn.id;
    syncActionAvailability();
    setChatActivity("Working");
    scheduleThreadContextBreakdownRefresh(600);
    return;
  }
  if (method === "turn/completed") {
    const status = params.turn && params.turn.status;
    if (status && !isSuccessStatus(status)) {
      appendChatLine("error", `Turn ${status}`);
    }
    state.codex.turnId = null;
    syncActionAvailability();
    setChatActivity("");
    scheduleThreadContextBreakdownRefresh(1200);
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

async function startNewCodexThread(clearTranscript = true, overrideOptions = null) {
  await loadCodexModels();
  const options = overrideOptions ? optionsFromThreadConfig(overrideOptions) : chatOptions();
  const result = await postJson("/api/codex/start", options);
  const id = result.threadStart && result.threadStart.thread && result.threadStart.thread.id;
  if (id) rememberThreadConfigFromCodexResult(id, result.threadStart || result, options);
  if (clearTranscript) resetChatTranscript();
  if (id) setActiveThread(id);
  setChatActivity("Ready");
}

async function resumeCodexThreadById() {
  await loadCodexModels();
  const threadId = els.resumeThreadId.value.trim();
  if (!threadId) {
    appendChatLine("warning", "Enter a thread id first.");
    return;
  }
  const config = await ensureThreadConfig(threadId);
  const options = optionsFromThreadConfig(config);
  if (hasThreadConfigValues(config)) applyThreadConfigToControls(config);
  const result = await postJson("/api/codex/resume", { threadId, ...options, excludeTurns: true });
  const id = (result.thread && result.thread.id) || threadId;
  if (id) rememberThreadConfigFromCodexResult(id, result, options);
  resetChatTranscript();
  if (id) setActiveThread(id);
  initializeHistoryPaging(id);
  closeResumePopover();
  setChatActivity("Loading history");
  await loadInitialThreadHistory(id);
  setChatActivity("Ready");
}

async function sendCodexMessage(event) {
  event.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = "";
  autoSizeChatInput();
  updateComposerState();
  appendChatLine("user", text);

  try {
    await loadCodexModels();
    if (!state.codex.threadId) {
      await startNewCodexThread(false);
    }
    saveActiveThreadConfig();
    const activeConfig = state.threadConfigs[state.codex.threadId];
    const options = activeConfig ? optionsFromThreadConfig(activeConfig) : chatOptions();
    const body = { threadId: state.codex.threadId, text, ...options };
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

function activeThreadForAction(actionLabel) {
  if (!state.codex.threadId) {
    appendChatLine("warning", `Start or resume a thread before using ${actionLabel}.`);
    return "";
  }
  if (state.codex.turnId) {
    appendChatLine("warning", `Wait for the current turn to finish before using ${actionLabel}.`);
    return "";
  }
  return state.codex.threadId;
}

async function runThreadAction(actionLabel, callback) {
  const threadId = activeThreadForAction(actionLabel);
  if (!threadId) return null;
  closeThreadActionMenu();
  state.codex.actionInFlight = actionLabel;
  setChatActivity(actionLabel);
  try {
    return await callback(threadId);
  } catch (error) {
    appendChatLine("error", error.message);
    return null;
  } finally {
    if (state.codex.actionInFlight === actionLabel) state.codex.actionInFlight = "";
    if (!state.codex.turnId && state.codex.activity === actionLabel) setChatActivity("");
    else renderChatStatus();
  }
}

async function compactActiveThread() {
  await runThreadAction("Compacting context", async (threadId) => {
    appendCompactInfo("Compaction requested");
    await postJson("/api/codex/compact", { threadId });
  });
}

async function reviewActiveThread() {
  await runThreadAction("Starting review", async (threadId) => {
    await postJson("/api/codex/review", {
      threadId,
      target: { type: "uncommittedChanges" },
      delivery: "inline",
    });
    appendCompactInfo("Review started");
  });
}

async function forkActiveThread() {
  await runThreadAction("Forking thread", async (threadId) => {
    await loadCodexModels();
    saveActiveThreadConfig();
    const sourceThreadId = threadId;
    const activeConfig = state.threadConfigs[sourceThreadId] || chatOptions();
    const options = optionsFromThreadConfig(activeConfig);
    const result = await postJson("/api/codex/fork", { threadId: sourceThreadId, ...options });
    const id = result.thread && result.thread.id;
    if (!id) throw new Error("Fork did not return a thread id.");
    if (id) rememberThreadConfigFromCodexResult(id, result, options);
    resetChatTranscript();
    setActiveThread(id);
    initializeHistoryPaging(id);
    appendCompactInfo(`Forked from ${shortId(sourceThreadId)}`);
    await loadInitialThreadHistory(id);
    setChatActivity("Ready");
    loadThreads().catch((error) => console.debug("[threads refresh]", error.message));
  });
}

async function rollbackActiveThread() {
  const threadId = activeThreadForAction("Rollback");
  if (!threadId) return;
  const ok = window.confirm("Rollback the last turn in this thread? File changes on disk will not be reverted.");
  if (!ok) return;
  await runThreadAction("Rolling back", async () => {
    await postJson("/api/codex/rollback", { threadId, numTurns: 1 });
    resetChatTranscript();
    setActiveThread(threadId);
    initializeHistoryPaging(threadId);
    appendCompactInfo("Rolled back last turn");
    await loadInitialThreadHistory(threadId);
    loadThreads().catch((error) => console.debug("[threads refresh]", error.message));
  });
}

function renameActiveThread() {
  const threadId = state.codex.threadId;
  if (!threadId) {
    appendChatLine("warning", "Start or resume a thread before renaming it.");
    return;
  }
  openRenameThreadModal(threadId);
}

function archiveActiveThread() {
  const threadId = state.codex.threadId;
  if (!threadId) {
    appendChatLine("warning", "Start or resume a thread before archiving it.");
    return;
  }
  updateThreadMetadata(threadId, { visibility: "archived" });
  appendCompactInfo("Thread archived locally");
  showToast("Thread archived.", [{ label: "Undo", action: "restore", threadId }]);
}

function hideActiveThread() {
  const threadId = state.codex.threadId;
  if (!threadId) {
    appendChatLine("warning", "Start or resume a thread before hiding it.");
    return;
  }
  const previous = threadVisibility(threadId);
  updateThreadMetadata(threadId, { visibility: "hidden" });
  appendCompactInfo("Thread hidden from sidebar");
  showToast("Thread hidden.", [
    { label: "Undo", action: "set-visibility", threadId, visibility: previous },
    { label: "View hidden", action: "view-hidden" },
  ]);
}

async function runShellCommandInThread() {
  const threadId = activeThreadForAction("Shell command");
  if (!threadId) return;
  const command = window.prompt("Shell command to run in this Codex thread");
  if (command === null) return;
  const trimmed = command.trim();
  if (!trimmed) return;
  const ok = window.confirm("Run this command with full local filesystem access?");
  if (!ok) return;
  await runThreadAction("Running shell command", async () => {
    await postJson("/api/codex/shell-command", { threadId, command: trimmed });
    appendCompactInfo("Shell command sent");
  });
}

function toggleThreadActionMenu() {
  const willOpen = els.moreThreadActionsMenu.hidden;
  closeChoiceMenus();
  els.moreThreadActionsMenu.hidden = !willOpen;
  els.moreThreadActions.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closeThreadActionMenu() {
  if (!els.moreThreadActions || !els.moreThreadActionsMenu) return;
  els.moreThreadActionsMenu.hidden = true;
  els.moreThreadActions.setAttribute("aria-expanded", "false");
}

function handleThreadActionMenuClick(event) {
  const button = event.target instanceof Element ? event.target.closest("[data-thread-action]") : null;
  if (!button) return;
  const action = button.getAttribute("data-thread-action");
  closeThreadActionMenu();
  if (action === "rollback") rollbackActiveThread();
  else if (action === "rename") renameActiveThread();
  else if (action === "archive") archiveActiveThread();
  else if (action === "hide") hideActiveThread();
  else if (action === "shell") runShellCommandInThread();
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
  gutter.textContent = "Codex";
  const body = document.createElement("div");
  body.className = "transcript-body markdown-body";
  entry.append(gutter, body);
  els.chatLog.appendChild(entry);
  return entry;
}

function createUserMessageNode(text) {
  const entry = document.createElement("article");
  entry.className = "transcript-message user";
  const marker = document.createElement("div");
  marker.className = "prompt-marker";
  marker.textContent = "›";
  const body = document.createElement("div");
  body.className = "transcript-body user-text";
  body.textContent = text || "";
  entry.append(marker, body);
  return entry;
}

function createAgentMessageNode(itemId, text) {
  const nodeId = `agent-${safeId(itemId)}`;
  if (document.getElementById(nodeId)) return null;
  const entry = document.createElement("article");
  entry.id = nodeId;
  entry.className = "transcript-message assistant";
  entry.dataset.raw = text || "";
  const gutter = document.createElement("div");
  gutter.className = "transcript-gutter";
  gutter.textContent = "Codex";
  const body = document.createElement("div");
  body.className = "transcript-body markdown-body";
  body.innerHTML = markdownToHtml(entry.dataset.raw || "");
  entry.append(gutter, body);
  return entry;
}

function createReasoningNode(item) {
  const id = item.id || "reasoning";
  const nodeId = `reasoning-${safeId(id)}`;
  if (document.getElementById(nodeId)) return null;
  const text = reasoningText(item) || "";
  const visible = visibleReasoningSummary(text);
  if (!visible) return null;
  const node = document.createElement("article");
  node.id = nodeId;
  node.className = "reasoning-card";
  node.innerHTML = `<div class="reasoning-content">${markdownToHtml(visible)}</div>`;
  state.codex.reasoningNodes[id] = node;
  return node;
}

function createPlanNode(itemId, text, streaming = false) {
  const id = itemId || "plan";
  const nodeId = `tool-${safeId(id)}`;
  if (document.getElementById(nodeId)) return null;
  const card = document.createElement("article");
  card.id = nodeId;
  card.className = "plan-card proposed";
  card.innerHTML = `
    <div class="tool-title"><span>Proposed Plan</span><em>${streaming ? "drafting" : "ready"}</em></div>
    <div class="markdown-body">${markdownToHtml(text || "(empty)")}</div>
  `;
  state.codex.itemNodes[id] = card;
  return card;
}

function createToolItemNode(item, lifecycle, options = {}) {
  const id = item.id || `${item.type}-${Object.keys(state.codex.itemNodes).length}`;
  const nodeId = `tool-${safeId(id)}`;
  if (document.getElementById(nodeId)) return null;
  const card = document.createElement("article");
  card.id = nodeId;
  card.className = `tool-card ${safeId(item.type)} ${statusClass(item.status || lifecycle)}`;
  card.innerHTML = toolItemHtml(item, lifecycle);
  state.codex.itemNodes[id] = card;
  if (item.type === "commandExecution" && item.aggregatedOutput) {
    state.codex.commandOutputs[id] = item.aggregatedOutput;
  }
  if (options.syncSidebar) syncToolSidebarState(item, lifecycle);
  return card;
}

function appendChatLine(kind, text) {
  if (kind === "system" || kind === "log" || kind === "diff") {
    setChatActivity(text || "");
    return;
  }

  let entry = null;
  if (kind === "user") {
    entry = createUserMessageNode(text);
  } else {
    entry = document.createElement("article");
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

  syncToolSidebarState(item, lifecycle);
  card.innerHTML = toolItemHtml(item, lifecycle);
  scrollChatToBottom();
}

function syncToolSidebarState(item, lifecycle) {
  if (item.type === "commandExecution") {
    const command = stripShellWrapper(item.command || "");
    state.codex.runningCommand = isRunningStatus(item.status || lifecycle) ? command : "";
  }
  if (item.type === "fileChange" && (item.changes || []).length) {
    setChangedFiles(
      item.changes.map((change) => ({
        path: change.path || "",
        kind: change.kind || "modify",
      })),
    );
  } else if (item.type === "fileChange" && item.diff) {
    setChangedFiles(parseDiffFiles(item.diff));
  }
  renderActivitySidebar();
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
    const itemId = params.itemId || params.id || item?.id || "file-change";
    upsertCodexItem(
      {
        id: itemId,
        type: "fileChange",
        status: params.status || "inProgress",
        changes,
        diff,
      },
      "started",
    );
    if (diff) {
      state.codex.latestDiff = diff;
    }
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
  setChangedFiles(parseDiffFiles(text));
  const diffHtml = diffSectionsHtml(text);

  let card = document.getElementById("latest-diff-card");
  if (!card) {
    card = document.createElement("article");
    card.id = "latest-diff-card";
    card.className = "tool-card diff-card completed";
    els.chatLog.appendChild(card);
  }
  card.className = "tool-card diff-card completed";
  card.innerHTML = `
    <div class="tool-title">
      <span>${escapeHtml(codeChangeTitle(title, state.codex.changedFiles))}</span>
      <div class="tool-actions">
        <button type="button" data-copy-tool="${escapeAttr(encodeURIComponent(text))}">Copy</button>
        <button type="button" data-collapse-tool>Collapse</button>
      </div>
      <em>${formatNumber(text.split("\n").length)} lines</em>
    </div>
    <div class="diff-inline" aria-label="File changes">${diffHtml}</div>
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
    const running = isRunningStatus(status);
    const showOutputOpen = running || isDiffLikeOutput(output, command);
    const summary = commandSummary(item, status, output);
    return `
      <div class="tool-title">
        <span>${escapeHtml(commandTitle(item, status))}</span>
        <div class="tool-actions">
          <button type="button" data-copy-tool="${escapeAttr(encodeURIComponent(command))}">Copy</button>
          <button type="button" data-collapse-tool>${running ? "Collapse" : "Show details"}</button>
        </div>
        <em>${escapeHtml(commandMeta(item, status))}</em>
      </div>
      <div class="tool-summary">${escapeHtml(summary)}</div>
      <details class="command-details" ${showOutputOpen ? "open" : ""}>
        <summary>${escapeHtml(running ? "Running command" : isDiffLikeOutput(output, command) ? "Command diff" : "Command log")}</summary>
        ${item.cwd ? `<div class="tool-subtitle">${escapeHtml(shortPath(item.cwd))}</div>` : ""}
        <pre class="command-line">$ ${escapeHtml(command)}</pre>
        ${output ? commandOutputHtml(output, command) : noOutput ? '<div class="tool-empty">(no output)</div>' : ""}
      </details>
    `;
  }
  if (item.type === "fileChange") {
    const changeItems = item.changes || [];
    const primaryPath = changeItems[0]?.path || "";
    const itemDiff = item.diff || "";
    const combinedDiff = itemDiff || changeItems.map((change) => change.diff || "").filter(Boolean).join("\n\n");
    const changes = (item.changes || [])
      .map(
        (change) =>
          `<li title="${escapeAttr(change.path || "")}"><strong>${escapeHtml(fileChangeVerb(change.kind))}</strong> ${escapeHtml(relativeProjectPath(change.path || ""))}</li>`,
      )
      .join("");
    const diffs = itemDiff
      ? diffSectionsHtml(itemDiff)
      : (item.changes || [])
          .map((change) =>
            change.diff
              ? `<section class="diff-file"><div class="diff-file-header"><span class="diff-file-path">${escapeHtml(relativeProjectPath(change.path || "diff"))}</span></div>${diffToHtml(change.diff)}</section>`
              : "",
          )
          .join("");
    return `
      <div class="tool-title">
        <span>${escapeHtml(codeChangeTitle("Patch", changeItems))}</span>
        <div class="tool-actions">
          ${combinedDiff ? `<button type="button" data-copy-tool="${escapeAttr(encodeURIComponent(combinedDiff))}">Copy</button>` : ""}
          ${primaryPath ? `<button type="button" data-view-file="${escapeAttr(primaryPath)}" title="${escapeAttr(primaryPath)}">View file</button>` : ""}
          <button type="button" data-collapse-tool>Collapse</button>
        </div>
        <em>${escapeHtml(statusLabel(status))}</em>
      </div>
      ${diffs ? `<div class="diff-inline" aria-label="File changes">${diffs}</div>` : changes ? `<ul class="change-list">${changes}</ul><div class="tool-empty diff-unavailable">Diff unavailable for this file change.</div>` : '<div class="tool-empty">(no file changes)</div>'}
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
    const details = card.querySelector(".command-details");
    if (details && isDiffLikeOutput(output, command)) details.open = true;
    return;
  }
  const commandLine = card.querySelector(".command-line");
  if (commandLine) {
    commandLine.insertAdjacentHTML("afterend", html);
  }
  const details = card.querySelector(".command-details");
  if (details && isDiffLikeOutput(output, command)) details.open = true;
}

function commandFromCard(card) {
  const commandLine = card.querySelector(".command-line");
  return String(commandLine?.textContent || "").replace(/^\$\s*/, "");
}

function commandOutputHtml(output, command) {
  if (isDiffLikeOutput(output, command)) {
    const text = String(output || "").trim();
    return `
      <div class="tool-output-wrap diff-output">
        <div class="tool-output-meta">Unified diff · ${formatNumber(splitOutputLines(text).length)} lines</div>
        ${diffSectionsHtml(text)}
      </div>
    `;
  }
  const preview = commandOutputPreview(output, command);
  const classes = ["tool-output-wrap", preview.truncated ? "truncated" : ""].filter(Boolean).join(" ");
  const label = preview.truncated ? commandOutputMeta(preview) : `${formatNumber(preview.totalLines)} output lines`;
  return `
    <details class="${classes}" open>
      <summary>${escapeHtml(label)}</summary>
      <pre class="tool-output">${escapeHtml(preview.text)}</pre>
    </details>
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

function isDiffLikeOutput(output, command = "") {
  const text = String(output || "");
  if (!text.trim()) return false;
  if (isUnifiedDiffText(text)) return true;
  const normalized = String(command || "").trim();
  return /^git\s+(diff|show)\b/.test(normalized) && /^(diff --git|@@\s|---\s|\+\+\+\s)/m.test(text);
}

function isUnifiedDiffText(text) {
  const value = String(text || "");
  if (/^diff --git\s/m.test(value)) return true;
  return /^---\s/m.test(value) && /^\+\+\+\s/m.test(value) && /^@@\s/m.test(value);
}

function diffSectionsHtml(diff) {
  const sections = splitUnifiedDiffByFile(diff);
  return sections
    .map((section) => {
      const path = diffSectionPath(section);
      const meta = section.lines.length ? `${formatNumber(section.lines.length)} lines` : "";
      return `
        <section class="diff-file">
          <div class="diff-file-header">
            <span class="diff-file-path">${escapeHtml(path)}</span>
            ${meta ? `<span class="diff-file-meta">${escapeHtml(meta)}</span>` : ""}
          </div>
          ${diffToHtml(section.lines.join("\n"))}
        </section>
      `;
    })
    .join("");
}

function splitUnifiedDiffByFile(diff) {
  const lines = splitOutputLines(String(diff || "").trim());
  const sections = [];
  let current = null;
  let preamble = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) {
        sections.push(current);
      } else if (preamble.length) {
        sections.push({ path: "Diff", lines: preamble });
        preamble = [];
      }
      current = { path: pathFromDiffGitLine(line), lines: [line] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (current) sections.push(current);
  if (preamble.length) sections.push({ path: pathFromDiffHeaderLines(preamble) || "Diff", lines: preamble });
  return sections.length ? sections : [{ path: "Diff", lines }];
}

function pathFromDiffGitLine(line) {
  const match = String(line || "").match(/^diff --git a\/(.+?) b\/(.+)$/);
  return match ? match[2] || match[1] : "Diff";
}

function pathFromDiffHeaderLines(lines) {
  const plus = lines.find((line) => line.startsWith("+++ "));
  if (!plus) return "";
  return plus.replace(/^\+\+\+\s+/, "").replace(/^b\//, "");
}

function diffSectionPath(section) {
  const path = section.path || pathFromDiffHeaderLines(section.lines || []) || "Diff";
  if (path === "/dev/null" || path === "Diff") return path;
  return relativeProjectPath(path);
}

function diffToHtml(diff, maxLines = 700) {
  const text = String(diff || "").trim();
  if (!text) return "";
  const lines = truncateLinesMiddle(text.split("\n"), maxLines);
  const body = lines.map((line) => `<span class="diff-line ${diffLineClass(line)}">${escapeHtml(line)}</span>`).join("");
  return `<pre class="codex-diff" aria-label="Unified diff">${body}</pre>`;
}

function shouldRenderToolItem(item, lifecycle) {
  if (item.type === "commandExecution") {
    return Boolean(item.command || state.codex.commandOutputs[item.id] || lifecycle === "completed");
  }
  if (item.type === "fileChange") {
    return lifecycle === "started" || lifecycle === "completed" || (item.changes || []).length > 0 || Boolean(item.diff);
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
  if (isSuccessStatus(status)) return "Command completed";
  return "Command failed";
}

function commandSummary(item, status, output) {
  const command = stripShellWrapper(item.command || "");
  const verb = isRunningStatus(status) ? "Running" : isSuccessStatus(status) ? "Completed" : "Failed";
  const bits = [verb, conciseCommand(command)];
  if (item.exitCode !== null && item.exitCode !== undefined) bits.push(`exit ${item.exitCode}`);
  if (output) bits.push(`${formatNumber(splitOutputLines(output).length)} output lines`);
  return bits.filter(Boolean).join(" · ");
}

function conciseCommand(command) {
  const normalized = String(command || "").trim().replace(/\s+/g, " ");
  return truncateMiddle(normalized, 96);
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

function fileChangeVerb(kind) {
  const value = String(typeof kind === "object" && kind ? kind.type || "change" : kind || "change").toLowerCase();
  if (value.includes("add")) return "Added";
  if (value.includes("delete") || value.includes("remove")) return "Deleted";
  if (value.includes("rename") || value.includes("move")) return "Renamed";
  return "Modified";
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

function createCompactInfoNode(text) {
  const entry = document.createElement("article");
  entry.className = "transcript-info";
  entry.textContent = text;
  return entry;
}

function appendCompactInfo(text) {
  const entry = createCompactInfoNode(text);
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

function setChangedFiles(files) {
  const seen = new Map();
  for (const file of files || []) {
    const path = file.path || "";
    if (!path) continue;
    seen.set(path, { path, kind: file.kind || seen.get(path)?.kind || "modify" });
  }
  state.codex.changedFiles = [...seen.values()];
  renderActivitySidebar();
}

function parseDiffFiles(diff) {
  const files = [];
  for (const line of String(diff || "").split("\n")) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (!match) continue;
    files.push({ path: match[2] || match[1], kind: "modify" });
  }
  return files;
}

function codeChangeTitle(title, files) {
  const changed = files || [];
  if (changed.length === 1) {
    return `${fileChangeVerb(changed[0].kind)} file · ${relativeProjectPath(changed[0].path)}`;
  }
  if (changed.length > 1) {
    return `Code changes · ${formatNumber(changed.length)} files`;
  }
  return title === "Patch" || title === "Diff" ? "Code change" : title;
}

function renderChatThreadLine() {
  if (state.codex.threadId) {
    const item = activeThreadItem();
    els.chatThreadTitle.textContent = threadTitle(item || state.codex.threadId);
    els.chatThreadTitle.title = threadTitle(item || state.codex.threadId);
    els.chatHeaderRename.disabled = false;
    els.chatThread.textContent = shortId(state.codex.threadId);
    els.chatThread.title = state.codex.threadId;
    els.copyThreadId.disabled = false;
  } else {
    els.chatThreadTitle.textContent = "New thread";
    els.chatThreadTitle.title = "";
    els.chatHeaderRename.disabled = true;
    els.chatThread.textContent = "No active thread";
    els.chatThread.title = "";
    els.copyThreadId.disabled = true;
  }
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
        html.push(codeBlockHtml(codeLines.join("\n"), ""));
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
    html.push(codeBlockHtml(codeLines.join("\n"), ""));
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
  const contextBreakdown = normalizeContextBreakdown(params);
  if (contextBreakdown) {
    state.codex.contextBreakdown = contextBreakdown;
    state.codex.contextBreakdownThreadId = state.codex.threadId;
    state.codex.contextBreakdownEstimated = false;
    state.codex.contextContributors = [];
    state.codex.contextSuggestions = [];
  } else {
    scheduleThreadContextBreakdownRefresh(500);
  }
  renderChatStatus();
}

function normalizeContextBreakdown(params) {
  const info = firstObject(params.info, params);
  const usage = firstObject(params.tokenUsage, params.token_usage, params.usage, info.tokenUsage, info.token_usage, info.usage, params);
  const raw = firstArray(
    params.contextBreakdown,
    params.context_breakdown,
    params.breakdown,
    usage.contextBreakdown,
    usage.context_breakdown,
    usage.breakdown,
    info.contextBreakdown,
    info.context_breakdown,
  );
  if (!raw.length) return null;

  const totalTokens = raw.reduce((sum, item) => sum + Math.max(0, Number(item?.tokens || item?.tokenCount || item?.token_count || 0)), 0);
  const items = raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const tokens = Math.max(0, Number(item.tokens || item.tokenCount || item.token_count || 0));
      if (!tokens) return null;
      const percentage = Number.isFinite(Number(item.percentage))
        ? Number(item.percentage)
        : totalTokens
          ? (tokens / totalTokens) * 100
          : 0;
      return {
        id: String(item.id || item.label || `context-${index}`),
        label: String(item.label || item.source || item.category || "Context"),
        category: String(item.category || "other"),
        tokens,
        percentage: clamp(percentage, 0, 100),
        source: optionalText(item.source),
      };
    })
    .filter(Boolean);

  return items.length ? items : null;
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) || [];
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

function resetHistoryPaging(threadId = null) {
  state.codex.history = {
    threadId,
    cursor: null,
    hasMore: false,
    loading: false,
    initialized: false,
    loadedTurnIds: new Set(),
  };
  const loader = document.getElementById("historyLoader");
  if (loader) loader.hidden = true;
}

function initializeHistoryPaging(threadId) {
  resetHistoryPaging(threadId);
}

async function loadInitialThreadHistory(threadId) {
  if (!threadId) return;
  if (state.codex.history.threadId !== threadId) initializeHistoryPaging(threadId);
  try {
    await loadThreadHistoryPage("append");
    await fillHistoryViewportIfNeeded();
  } catch (error) {
    state.codex.history.initialized = true;
    appendChatLine("error", `History load failed: ${error.message}`);
  }
}

async function loadOlderThreadHistory() {
  try {
    await loadThreadHistoryPage("prepend");
  } catch (error) {
    prependHistoryNotice(`Could not load earlier history: ${error.message}`);
  }
}

async function loadThreadHistoryPage(placement) {
  const history = state.codex.history;
  if (!history.threadId || history.loading) return;
  if (placement === "prepend" && (!history.initialized || !history.hasMore || !history.cursor)) return;

  const anchor = placement === "prepend" ? firstTranscriptContentNode() : null;
  const anchorTop = anchor ? anchor.getBoundingClientRect().top : null;
  history.loading = true;
  setHistoryLoading(true, placement === "prepend" ? "Loading earlier history" : "Loading recent history");

  try {
    const request = {
      threadId: history.threadId,
      limit: THREAD_HISTORY_PAGE_SIZE,
      sortDirection: "desc",
      itemsView: "full",
    };
    if (placement === "prepend" && history.cursor) request.cursor = history.cursor;

    const result = await postJson("/api/codex/turns", request);
    if (state.codex.history !== history || state.codex.history.threadId !== request.threadId) return;

    const pageTurns = Array.isArray(result.data) ? result.data : [];
    const newTurns = pageTurns.filter((turn) => {
      const id = turn && turn.id;
      return id && !history.loadedTurnIds.has(id);
    });

    history.cursor = result.nextCursor || null;
    history.hasMore = Boolean(result.nextCursor);
    history.initialized = true;

    if (!pageTurns.length && placement === "append") {
      appendCompactInfo("Resumed thread; no history was returned.");
    } else if (newTurns.length) {
      if (placement === "append") appendCompactInfo(`Loaded latest ${formatNumber(newTurns.length)} turns`);
      renderThreadHistoryTurns(newTurns, placement, { order: "desc" });
      for (const turn of newTurns) history.loadedTurnIds.add(turn.id);
    }
  } finally {
    history.loading = false;
    setHistoryLoading(false);
    if (anchor && anchorTop !== null) {
      const newTop = anchor.getBoundingClientRect().top;
      els.chatLog.scrollTop += newTop - anchorTop;
    }
  }
}

function maybeLoadOlderHistory() {
  const history = state.codex.history;
  if (!history.threadId || !history.initialized || history.loading || !history.hasMore) return;
  if (els.chatLog.scrollTop > 72) return;
  loadOlderThreadHistory();
}

async function fillHistoryViewportIfNeeded() {
  let loadedPages = 0;
  while (
    state.codex.history.threadId &&
    state.codex.history.hasMore &&
    !state.codex.history.loading &&
    els.chatLog.scrollHeight <= els.chatLog.clientHeight + 72 &&
    loadedPages < 3
  ) {
    loadedPages += 1;
    await loadThreadHistoryPage("prepend");
  }
}

function setHistoryLoading(loading, label = "Loading history") {
  const loader = ensureHistoryLoader();
  loader.hidden = !loading;
  const text = loader.querySelector(".history-loader-text");
  if (text) text.textContent = label;
  updateChatEmptyState();
}

function ensureHistoryLoader() {
  let loader = document.getElementById("historyLoader");
  if (loader) return loader;
  loader = document.createElement("article");
  loader.id = "historyLoader";
  loader.className = "history-loader";
  loader.hidden = true;
  loader.innerHTML = '<span class="history-spinner" aria-hidden="true"></span><span class="history-loader-text">Loading history</span>';
  const empty = document.getElementById("chatEmptyState");
  if (empty && empty.parentNode === els.chatLog) empty.after(loader);
  else els.chatLog.prepend(loader);
  return loader;
}

function firstTranscriptContentNode() {
  return Array.from(els.chatLog.children).find((node) => !isChatUtilityNode(node)) || null;
}

function isChatUtilityNode(node) {
  return node.id === "chatEmptyState" || node.id === "historyLoader";
}

function prependHistoryNotice(text) {
  const anchor = firstTranscriptContentNode();
  const anchorTop = anchor ? anchor.getBoundingClientRect().top : null;
  const node = createCompactInfoNode(text);
  const before = firstTranscriptContentNode();
  els.chatLog.insertBefore(node, before);
  updateChatEmptyState();
  if (anchor && anchorTop !== null) {
    const newTop = anchor.getBoundingClientRect().top;
    els.chatLog.scrollTop += newTop - anchorTop;
  }
}

function renderThreadHistoryTurns(turns, placement, options = {}) {
  const chronologicalTurns = options.order === "desc" ? [...turns].reverse() : [...turns];
  const fragment = document.createDocumentFragment();
  chronologicalTurns.forEach((turn, turnIndex) => {
    renderHistoricalTurnInto(fragment, turn, turnIndex, {
      syncSidebar: placement === "append",
    });
  });

  if (placement === "prepend") {
    const before = firstTranscriptContentNode();
    els.chatLog.insertBefore(fragment, before);
    updateChatEmptyState();
    updateMessageJumpNav();
    return;
  }

  els.chatLog.appendChild(fragment);
  scrollChatToBottom();
}

function renderHistoricalTurnInto(parent, turn, turnIndex, options = {}) {
  const items = historicalTurnItems(turn);
  if (!items.length && turn.input) {
    parent.appendChild(createUserMessageNode(textFromContent(turn.input)));
    return;
  }
  items.forEach((item, itemIndex) => {
    const node = createHistoricalItemNode(item, turn, turnIndex, itemIndex, options);
    if (node) parent.appendChild(node);
  });
}

function createHistoricalItemNode(item, turn, turnIndex, itemIndex, options = {}) {
  if (!item || typeof item !== "object") return null;
  const type = item.type || item.kind || "";
  const id = item.id || `history-${turn?.id || turnIndex}-${itemIndex}`;

  if (type === "userMessage" || type === "user_message" || item.role === "user") {
    return createUserMessageNode(itemText(item));
  }
  if (type === "agentMessage" || type === "agent_message" || item.role === "assistant") {
    return createAgentMessageNode(id, itemText(item));
  }
  if (type === "reasoning") {
    return createReasoningNode({ ...item, id });
  }
  if (type === "plan") {
    return createPlanNode(id, item.text || itemText(item), false);
  }
  if (type === "contextCompaction") {
    return createCompactInfoNode("Context compacted");
  }
  if (type === "enteredReviewMode" || type === "exitedReviewMode") {
    return createCompactInfoNode(type === "enteredReviewMode" ? "Review mode" : "Exited review mode");
  }
  if (!shouldRenderToolItem({ ...item, id, type }, "completed")) return null;
  return createToolItemNode({ ...item, id, type }, "completed", options);
}

function renderResumedThread(result) {
  const thread = result.thread || result;
  const turns = Array.isArray(thread.turns) ? thread.turns : Array.isArray(result.turns) ? result.turns : [];
  if (!turns.length) {
    appendCompactInfo("Resumed thread; no history was returned.");
    return;
  }

  appendCompactInfo(`Resumed ${formatNumber(turns.length)} previous turns`);
  renderThreadHistoryTurns(turns, "append");
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
    textFromContent(item.content) ||
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

function setActiveThread(id, options = {}) {
  state.codex.threadId = id;
  if (state.codex.contextBreakdownThreadId !== id) {
    state.codex.contextBreakdown = null;
    state.codex.contextBreakdownThreadId = null;
    state.codex.contextBreakdownEstimated = false;
    state.codex.contextContributors = [];
    state.codex.contextSuggestions = [];
  }
  if (id) {
    const item = state.items.find((entry) => entry.id === id);
    updateThreadMetadata(
      id,
      {
        projectPath: threadProjectPath(item || id) || els.chatCwd.value || "",
        lastOpenedAt: new Date().toISOString(),
      },
      { persist: true },
    );
  }
  const config = state.threadConfigs[id];
  if (options.applyConfig !== false && config && hasThreadConfigValues(config)) {
    applyThreadConfigToControls(config);
  }
  renderChatThreadLine();
  renderSidebarThreads();
  renderActivitySidebar();
  loadThreadContextBreakdown(id);
}

function hasCurrentContextBreakdown(threadId = state.codex.threadId) {
  return Boolean(
    threadId &&
      state.codex.contextBreakdownThreadId === threadId &&
      Array.isArray(state.codex.contextBreakdown) &&
      state.codex.contextBreakdown.length,
  );
}

function scheduleThreadContextBreakdownRefresh(delayMs = 600) {
  const threadId = state.codex.threadId;
  if (!threadId) return;
  if (state.codex.contextBreakdownRefreshTimer) {
    window.clearTimeout(state.codex.contextBreakdownRefreshTimer);
  }
  state.codex.contextBreakdownRefreshTimer = window.setTimeout(() => {
    state.codex.contextBreakdownRefreshTimer = null;
    loadThreadContextBreakdown(threadId, { preserveExisting: true });
  }, delayMs);
}

async function loadThreadContextBreakdown(threadId, options = {}) {
  if (!threadId) return;
  if (state.codex.contextBreakdownLoading === threadId) return;
  state.codex.contextBreakdownLoading = threadId;
  try {
    const data = await api(`/api/threads/${encodeURIComponent(threadId)}/context`);
    if (state.codex.threadId !== threadId) return;
    const items = Array.isArray(data.items) ? data.items : [];
    const preserveExisting = options.preserveExisting !== false && hasCurrentContextBreakdown(threadId);
    if (items.length || !preserveExisting) {
      state.codex.contextBreakdown = items;
      state.codex.contextBreakdownThreadId = threadId;
      state.codex.contextBreakdownEstimated = Boolean(data.estimated);
      state.codex.contextContributors = data.contributors || [];
      state.codex.contextSuggestions = data.suggestions || [];
    }
    if (!state.codex.tokenUsage && data.totalTokens) {
      state.codex.tokenUsage = {
        used: data.totalTokens,
        derived: true,
        windowTokens: data.windowTokens || null,
        totalUsed: data.totalTokens,
        input: null,
        output: null,
      };
    }
    renderChatStatus();
  } catch (error) {
    console.debug("[context breakdown]", error.message);
  } finally {
    if (state.codex.contextBreakdownLoading === threadId) {
      state.codex.contextBreakdownLoading = false;
    }
  }
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
  state.codex.changedFiles = [];
  state.codex.runningCommand = "";
  state.codex.tokenUsage = null;
  state.codex.contextBreakdown = null;
  state.codex.contextBreakdownThreadId = null;
  if (state.codex.contextBreakdownRefreshTimer) {
    window.clearTimeout(state.codex.contextBreakdownRefreshTimer);
    state.codex.contextBreakdownRefreshTimer = null;
  }
  state.codex.contextBreakdownEstimated = false;
  state.codex.contextContributors = [];
  state.codex.contextSuggestions = [];
  resetHistoryPaging();
  syncActionAvailability();
  renderChatThreadLine();
  renderChatEmptyState();
  renderChatStatus();
  updateMessageJumpNav();
}

function chatHasMessages() {
  return Array.from(els.chatLog.children).some((node) => {
    if (node.id === "historyLoader") return !node.hidden;
    return node.id !== "chatEmptyState";
  });
}

function renderChatEmptyState() {
  let empty = document.getElementById("chatEmptyState");
  if (!empty) {
    empty = document.createElement("section");
    empty.id = "chatEmptyState";
    empty.className = "chat-empty-state";
    els.chatLog.prepend(empty);
  }
  updateChatEmptyState();
}

function updateChatEmptyState() {
  const empty = document.getElementById("chatEmptyState");
  if (!empty) return;
  empty.hidden = chatHasMessages();
  if (empty.hidden) return;

  const cwd = shortPath(els.chatCwd.value) || "No working directory selected";
  const modelLabel = selectedModelLabel();
  const effort = displayReasoningEffort(els.chatEffort.value);
  empty.innerHTML = `
    <div class="empty-copy">
      <h3>What should Codex work on?</h3>
      <dl>
        <div><dt>Working directory</dt><dd title="${escapeAttr(els.chatCwd.value || cwd)}">${escapeHtml(cwd)}</dd></div>
        <div><dt>Model</dt><dd>${escapeHtml(modelLabel)}</dd></div>
        <div><dt>Reasoning</dt><dd>${escapeHtml(effort)}</dd></div>
      </dl>
    </div>
    <div class="empty-prompts" aria-label="Example prompts">
      <button type="button" data-prompt="Explain the current architecture">Explain the current architecture</button>
      <button type="button" data-prompt="Implement a new feature">Implement a new feature</button>
      <button type="button" data-prompt="Fix failing tests">Fix failing tests</button>
    </div>
  `;
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
  renderPrimarySummary();
  syncActionAvailability();
  renderActivitySidebar();
}

function currentSessionStatus() {
  const bridge = state.codex.bridge;
  if (bridge.lastError) return "Error";
  return state.codex.turnId || state.codex.actionInFlight ? "Working" : bridge.initialized ? "Ready" : bridge.running ? "Starting" : "Idle";
}

function syncActionAvailability() {
  const running = Boolean(state.codex.turnId);
  const busy = Boolean(state.codex.actionInFlight);
  const hasThread = Boolean(state.codex.threadId);
  const threadActionDisabled = !hasThread || running || busy;
  els.interruptCodexTurn.hidden = !running;
  els.interruptCodexTurn.disabled = !running;
  for (const button of [els.compactThread, els.reviewThread, els.forkThread, els.moreThreadActions]) {
    if (button) button.disabled = threadActionDisabled;
  }
  if (els.moreThreadActionsMenu) {
    for (const button of els.moreThreadActionsMenu.querySelectorAll("button")) {
      button.disabled = threadActionDisabled;
    }
  }
  if (threadActionDisabled) closeThreadActionMenu();
}

function toggleDetailsPanel() {
  const open = !els.chatWorkbench.classList.contains("details-open");
  els.chatWorkbench.classList.toggle("details-open", open);
  els.detailsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  els.detailsToggle.textContent = open ? "Hide details" : "Show details";
}

function selectDetailsTab(tab) {
  state.detailsTab = tab || "overview";
  for (const button of document.querySelectorAll("[data-details-tab]")) {
    const active = button.getAttribute("data-details-tab") === state.detailsTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of document.querySelectorAll("[data-details-panel]")) {
    const active = panel.getAttribute("data-details-panel") === state.detailsTab;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  }
  if (state.detailsTab === "context") renderContextInspector();
}

function renderSessionStatus() {
  const bridge = state.codex.bridge;
  const status = currentSessionStatus();
  const bits = [];
  if (state.codex.activity && state.codex.activity !== status) bits.push(state.codex.activity);
  if (bridge.lastError) bits.push(bridge.lastError);

  els.chatSessionValue.textContent = status;
  els.chatSessionValue.className = "sr-only";
  els.chatSessionMeta.textContent = bits.filter(Boolean).join(" · ");
  els.chatSessionMeta.className = "sr-only";
  els.chatSessionMeta.hidden = false;
  els.codexStatus.className = `status-pill ${sessionStatusClass(status)}`;
}

function renderPrimarySummary() {
  const status = currentSessionStatus();
  els.chatPrimaryStatus.textContent = state.codex.activity && status === "Working" ? state.codex.activity : status;
  els.chatPrimaryStatus.className = sessionStatusClass(status);
  els.chatPrimaryContext.textContent = compactContextLabel();
  els.chatPrimaryModel.textContent = selectedModelLabel();
  els.chatPrimaryCwd.textContent = shortPath(threadProjectPath(state.codex.threadId) || els.chatCwd.value) || "No directory";
  els.chatPrimaryCwd.title = threadProjectPath(state.codex.threadId) || els.chatCwd.value || "";
  els.codexStatus.textContent = `${status} · ${compactContextLabel()}`;
}

function compactContextLabel() {
  const value = els.chatContextValue.textContent || "";
  const available = value.match(/Context\s+(\d+)%\s+available/i);
  if (available) return `${available[1]}% context`;
  if (/Context\s+waiting/i.test(value)) return "Context pending";
  const context = value.match(/Context\s+(.+)/i);
  if (context) return context[1].trim();
  return "Context pending";
}

function renderActivitySidebar() {
  const status = currentSessionStatus();
  const meta = [state.codex.activity, state.codex.threadId ? threadTitle(state.codex.threadId) : "No active thread"]
    .filter(Boolean)
    .join(" · ");

  els.sidebarTaskStatus.textContent = status;
  els.sidebarTaskStatus.className = `session-pill ${sessionStatusClass(status)}`;
  els.overviewStatus.textContent = status;
  els.overviewStatus.className = `status-badge ${sessionStatusClass(status)}`;
  els.sidebarTaskMeta.textContent = meta;
  els.sidebarRunningCommand.textContent = state.codex.runningCommand || "None";
  els.sidebarRunningCommand.title = state.codex.runningCommand || "";
  els.sidebarModel.textContent = selectedModelLabel();
  els.sidebarReasoning.textContent = displayReasoningEffort(els.chatEffort.value);
  els.sidebarContext.textContent = contextSidebarLabel();
  renderChangedFilesSidebar();
  renderContextInspector();
}

function renderChangedFilesSidebar() {
  const files = state.codex.changedFiles || [];
  els.sidebarChangedCount.textContent = formatNumber(files.length);
  els.sidebarChangedFiles.innerHTML = "";
  els.inspectorFilesCount.textContent = formatNumber(files.length);
  els.inspectorFilesList.innerHTML = "";

  if (!files.length) {
    els.sidebarChangedFiles.innerHTML = '<span class="sidebar-empty">No file changes yet.</span>';
    els.inspectorFilesList.innerHTML = '<span class="sidebar-empty">No file changes yet.</span>';
    return;
  }

  for (const file of files.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "sidebar-file";
    row.title = file.path || "";
    row.innerHTML = `
      <strong>${escapeHtml(fileChangeVerb(file.kind))}</strong>
      <span>${escapeHtml(relativeProjectPath(file.path || ""))}</span>
    `;
    els.sidebarChangedFiles.appendChild(row);
  }
  for (const file of files) {
    const row = document.createElement("div");
    row.className = "sidebar-file";
    row.title = file.path || "";
    row.innerHTML = `
      <strong>${escapeHtml(fileChangeVerb(file.kind))}</strong>
      <span>${escapeHtml(relativeProjectPath(file.path || ""))}</span>
    `;
    els.inspectorFilesList.appendChild(row);
  }
}

function contextSidebarLabel() {
  const text = (els.chatContextValue.textContent || "").replace(/^Context\s*/i, "");
  return text || "Waiting";
}

function sessionStatusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "error") return "error";
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
      els.chatContextValue.closest(".inline-meter").title = "Waiting for Codex token usage data after the first turn.";
    }
    setMeter(els.chatContextBar, 0, "empty");
    return;
  }

  const remaining = clamp(100 - percent, 0, 100);
  els.chatContextValue.textContent = `Context ${Math.round(remaining)}% available`;
  els.chatContextMeta.textContent = "";
  els.chatContextValue.closest(".inline-meter").title =
    `${formatCompactNumber(used)} of ${formatCompactNumber(windowTokens)} tokens currently in context`;
  setMeter(els.chatContextBar, percent, "used");
}

function renderContextInspector() {
  if (!els.contextUsageValue) return;
  const usage = state.codex.tokenUsage || {};
  const breakdown = hasCurrentContextBreakdown() ? state.codex.contextBreakdown || [] : [];
  const hasUsage = usage.used !== null && usage.used !== undefined;
  const hasWindow = usage.windowTokens !== null && usage.windowTokens !== undefined;

  if (hasUsage && hasWindow) {
    els.contextUsageValue.textContent = `${formatCompactNumber(usage.used)} / ${formatCompactNumber(usage.windowTokens)} tokens${state.codex.contextBreakdownEstimated ? " estimated" : ""}`;
  } else if (hasUsage) {
    els.contextUsageValue.textContent = `${formatCompactNumber(usage.used)} tokens${state.codex.contextBreakdownEstimated ? " estimated" : ""}`;
  } else if (hasWindow) {
    els.contextUsageValue.textContent = `${formatCompactNumber(usage.windowTokens)} window`;
  } else {
    els.contextUsageValue.textContent = "Unavailable";
  }

  els.contextStackedBar.innerHTML = "";
  els.contextLargestContributors.innerHTML = "";
  els.contextSuggestions.innerHTML = "";

  if (!breakdown.length) {
    els.contextBreakdownEmpty.hidden = false;
    els.contextStackedBar.hidden = true;
    els.contextLargestContributors.innerHTML = '<span class="sidebar-empty">No attribution data available.</span>';
    els.contextSuggestions.innerHTML = '<span class="sidebar-empty">Suggestions will appear when token attribution is available.</span>';
    return;
  }

  els.contextBreakdownEmpty.hidden = true;
  els.contextStackedBar.hidden = false;
  const sorted = [...breakdown].sort((left, right) => right.tokens - left.tokens);
  for (const item of sorted) {
    const segment = document.createElement("span");
    segment.className = `context-segment ${contextCategoryClass(item.category)}`;
    segment.style.width = `${Math.max(3, item.percentage)}%`;
    segment.title = `${item.label}: ${formatCompactNumber(item.tokens)} tokens`;
    segment.textContent = `${item.label} ${Math.round(item.percentage)}%`;
    els.contextStackedBar.appendChild(segment);
  }

  const contributors = state.codex.contextContributors.length ? state.codex.contextContributors : sorted.slice(0, 5);
  contributors.slice(0, 5).forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "context-list-row";
    row.innerHTML = `<span>${index + 1}. ${escapeHtml(item.label)}</span><strong>${escapeHtml(formatCompactNumber(item.tokens))} tokens</strong>`;
    els.contextLargestContributors.appendChild(row);
  });

  const suggestions = state.codex.contextSuggestions.length ? state.codex.contextSuggestions : contextSuggestionsFromBreakdown(sorted);
  if (!suggestions.length) {
    els.contextSuggestions.innerHTML = '<span class="sidebar-empty">No context pressure detected.</span>';
    return;
  }
  for (const suggestion of suggestions) {
    const row = document.createElement("div");
    row.className = "context-suggestion";
    row.textContent = suggestion;
    els.contextSuggestions.appendChild(row);
  }
}

function contextCategoryClass(category) {
  const value = String(category || "other").replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return `category-${value}`;
}

function contextSuggestionsFromBreakdown(items) {
  const suggestions = [];
  const byCategory = new Map();
  for (const item of items) byCategory.set(item.category, (byCategory.get(item.category) || 0) + item.percentage);
  if ((byCategory.get("tool_outputs") || 0) >= 20) suggestions.push("Tool output is large. Consider summarizing command logs.");
  if ((byCategory.get("agents") || 0) >= 20) suggestions.push("Project AGENTS.md is a large context contributor. Consider moving stable preferences to global AGENTS.md.");
  const conversation = (byCategory.get("user_messages") || 0) + (byCategory.get("assistant_messages") || 0);
  if (conversation >= 45) suggestions.push("This thread is long. Consider compacting older turns.");
  if ((byCategory.get("files") || 0) + (byCategory.get("diffs") || 0) >= 20) suggestions.push("Files and diffs are prominent. Keep only the relevant patch or file excerpts in context.");
  return suggestions;
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
  const meter = els.chatLimitValue.closest(".inline-meter");
  if (!limit) {
    els.chatLimitValue.textContent = state.codex.rateLimitError ? "No time estimate" : "5h remaining";
    els.chatLimitMeta.textContent = "";
    meter.title = state.codex.rateLimitError ? readableLimitError(state.codex.rateLimitError) : "Waiting for Codex usage limit data.";
    setMeter(els.chatLimitBar, 0, "empty");
    return;
  }

  const percent = limit.usedPercent !== null && limit.usedPercent !== undefined ? clamp(limit.usedPercent, 0, 100) : null;
  const remaining = percent === null ? null : clamp(100 - percent, 0, 100);
  const windowLabel = limit.windowLabel || "5h";
  els.chatLimitValue.textContent = remaining === null ? `${windowLabel} remaining` : `${windowLabel} remaining · ${Math.round(remaining)}%`;
  els.chatLimitMeta.textContent = "";
  meter.title = [limit.name, limit.resetLabel].filter(Boolean).join(" · ") || windowLabel;
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

function speechMessageNodes() {
  return Array.from(els.chatLog.querySelectorAll(".transcript-message.user, .transcript-message.assistant"));
}

function speechNodeTargetScroll(node) {
  const containerRect = els.chatLog.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  return els.chatLog.scrollTop + nodeRect.top - containerRect.top - 16;
}

function previousSpeechNode() {
  const current = els.chatLog.scrollTop;
  const messages = speechMessageNodes();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const node = messages[index];
    if (speechNodeTargetScroll(node) < current - 8) return node;
  }
  return null;
}

function nextSpeechNode() {
  const current = els.chatLog.scrollTop;
  for (const node of speechMessageNodes()) {
    if (speechNodeTargetScroll(node) > current + 8) return node;
  }
  return null;
}

function chatAtBottom() {
  return els.chatLog.scrollHeight - els.chatLog.scrollTop - els.chatLog.clientHeight <= 36;
}

function chatAtTop() {
  return els.chatLog.scrollTop <= 18;
}

function scrollToSpeechNode(target) {
  if (!target) return;
  els.chatLog.scrollTo({
    top: Math.max(0, speechNodeTargetScroll(target)),
    behavior: "smooth",
  });
}

function setJumpNavAnchorFromCompact(anchor) {
  if (!els.messageJumpNav || !els.messageJumpNav.classList.contains("expanded")) {
    state.codex.jumpNavAnchor = anchor;
  }
}

async function jumpToPreviousSpeech() {
  setJumpNavAnchorFromCompact("prev");
  let target = previousSpeechNode();
  if (!target && state.codex.history.hasMore && !state.codex.history.loading) {
    await loadOlderThreadHistory();
    target = previousSpeechNode();
  }
  if (!target) return;
  scrollToSpeechNode(target);
  updateMessageJumpNav();
}

function jumpToNextSpeech() {
  setJumpNavAnchorFromCompact("next");
  const target = nextSpeechNode();
  if (!target) return;
  scrollToSpeechNode(target);
  updateMessageJumpNav();
}

function jumpToLatestMessage() {
  setJumpNavAnchorFromCompact("latest");
  scrollChatToBottom({ smooth: true });
}

function updateMessageJumpNav() {
  if (!els.messageJumpNav) return;
  const canJumpPrev = Boolean(previousSpeechNode());
  const canJumpNext = Boolean(nextSpeechNode());
  const canJumpLatest = !chatAtBottom();
  const canLoadOlder = Boolean(state.codex.history.threadId && state.codex.history.initialized && state.codex.history.hasMore);
  const canMovePrev = canJumpPrev || canLoadOlder;
  const canShowAny = canMovePrev || canJumpNext || canJumpLatest;
  els.messageJumpNav.hidden = !canShowAny;
  if (!canShowAny) return;

  let mode = "expanded";
  if (chatAtBottom()) mode = "bottom";
  else if (chatAtTop() && !canMovePrev && canJumpNext) mode = "top";
  else if (!canMovePrev && !canJumpNext && canJumpLatest) mode = "latest";
  const anchor =
    mode === "bottom" ? "prev" : mode === "top" ? "next" : mode === "latest" ? "latest" : state.codex.jumpNavAnchor || "prev";

  const showPrev = mode === "bottom" ? canMovePrev : mode === "expanded" && canMovePrev;
  const showNext = mode === "top" ? canJumpNext : mode === "expanded" && canJumpNext;
  const showLatest = mode === "latest" ? canJumpLatest : mode === "expanded" && canJumpLatest;

  els.messageJumpNav.classList.toggle("compact", mode !== "expanded");
  els.messageJumpNav.classList.toggle("expanded", mode === "expanded");
  els.messageJumpNav.classList.toggle("anchor-prev", anchor === "prev");
  els.messageJumpNav.classList.toggle("anchor-next", anchor === "next");
  els.messageJumpNav.classList.toggle("anchor-latest", anchor === "latest");
  els.messageJumpNav.hidden = !(showPrev || showNext || showLatest);

  els.jumpPrevSpeech.hidden = !showPrev;
  els.jumpNextSpeech.hidden = !showNext;
  els.jumpLatest.hidden = !showLatest;

  els.jumpPrevSpeech.disabled = state.codex.history.loading || !canMovePrev;
  els.jumpNextSpeech.disabled = !canJumpNext;
  els.jumpLatest.disabled = !canJumpLatest;
}

function scrollChatToBottom(options = {}) {
  updateChatEmptyState();
  if (options.smooth) {
    els.chatLog.scrollTo({ top: els.chatLog.scrollHeight, behavior: "smooth" });
  } else {
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }
  updateMessageJumpNav();
}

function safeId(value) {
  return String(value || "item").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function showError(error) {
  appendChatLine("error", error.message);
}

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function setWorkspaceLabel(path) {
  const value = path || "No workspace selected";
  els.appWorkspace.textContent = shortPath(value) || value;
  els.appWorkspace.closest(".workspace-chip").title = value;
}

function updateComposerState() {
  els.sendCodexMessage.disabled = !els.chatInput.value.trim();
}

function shortPath(path) {
  if (!path) return "";
  return path.replace(/^\/home\/[^/]+/, "~");
}

function relativeProjectPath(path) {
  const value = String(path || "");
  if (!value) return "";
  const cwd = els.chatCwd.value || "";
  if (cwd && value.startsWith(`${cwd}/`)) return value.slice(cwd.length + 1);
  return value.replace(/^\/home\/[^/]+\/projects\/[^/]+\//, "");
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 12 ? `${text.slice(0, 8)}…${text.slice(-5)}` : text;
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
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
  const maxHeight = Math.min(180, Math.max(96, Math.round(window.innerHeight * 0.28)));
  input.style.maxHeight = `${maxHeight}px`;
  input.style.height = "auto";
  const nextHeight = Math.min(Math.max(input.scrollHeight, 44), maxHeight);
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
}

els.chatComposer.addEventListener("submit", sendCodexMessage);
els.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing && (event.metaKey || event.ctrlKey || !event.shiftKey)) {
    event.preventDefault();
    els.chatComposer.requestSubmit();
  }
});
els.chatInput.addEventListener("input", autoSizeChatInput);
els.chatInput.addEventListener("input", updateComposerState);
window.addEventListener("resize", autoSizeChatInput);
els.compactThread.addEventListener("click", () => compactActiveThread());
els.reviewThread.addEventListener("click", () => reviewActiveThread());
els.forkThread.addEventListener("click", () => forkActiveThread());
els.moreThreadActions.addEventListener("click", toggleThreadActionMenu);
els.moreThreadActionsMenu.addEventListener("click", handleThreadActionMenuClick);
els.sidebarNewThread.addEventListener("click", () => openNewThreadModal().catch((error) => appendChatLine("error", error.message)));
els.sidebarThreadSearch.addEventListener("input", () => {
  state.sidebarQuery = els.sidebarThreadSearch.value;
  renderSidebarThreads();
});
els.openThreadManager.addEventListener("click", () => openThreadManager("active"));
els.closeThreadManager.addEventListener("click", closeThreadManager);
els.threadManagerModal.addEventListener("click", (event) => {
  if (event.target === els.threadManagerModal) closeThreadManager();
});
els.threadManagerModal.addEventListener("click", (event) => {
  const scopeButton = event.target instanceof Element ? event.target.closest("[data-manager-scope]") : null;
  if (!scopeButton) return;
  state.threadManager.scope = scopeButton.getAttribute("data-manager-scope") || "active";
  renderThreadManager();
});
els.threadManagerSearch.addEventListener("input", () => {
  state.threadManager.query = els.threadManagerSearch.value;
  renderThreadManager();
});
els.threadManagerProject.addEventListener("change", () => {
  state.threadManager.project = els.threadManagerProject.value;
  renderThreadManager();
});
els.threadManagerSort.addEventListener("change", () => {
  state.threadManager.sort = els.threadManagerSort.value;
  renderThreadManager();
});
els.threadManagerSelectAll.addEventListener("change", () => setVisibleManagerSelection(els.threadManagerSelectAll.checked));
els.bulkRestoreThreads.addEventListener("click", () => bulkUpdateThreads({ visibility: "active" }));
els.bulkArchiveThreads.addEventListener("click", () => bulkUpdateThreads({ visibility: "archived" }));
els.bulkHideThreads.addEventListener("click", () => bulkUpdateThreads({ visibility: "hidden" }));
els.chatHeaderRename.addEventListener("click", renameActiveThread);
els.closeRenameThreadModal.addEventListener("click", closeRenameThreadModal);
els.cancelRenameThread.addEventListener("click", closeRenameThreadModal);
els.confirmRenameThread.addEventListener("click", confirmRenameThread);
els.renameThreadInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    confirmRenameThread();
  }
});
for (const button of document.querySelectorAll("[data-details-tab]")) {
  button.addEventListener("click", () => selectDetailsTab(button.getAttribute("data-details-tab")));
}
els.openPersonalization.addEventListener("click", openPersonalizationWizard);
els.openPersonalizationFromConfig.addEventListener("click", openPersonalizationWizard);
els.closePersonalization.addEventListener("click", closePersonalizationWizard);
els.cancelPersonalization.addEventListener("click", closePersonalizationWizard);
els.personalizationBack.addEventListener("click", previousPersonalizationStep);
els.personalizationNext.addEventListener("click", () => nextPersonalizationStep().catch((error) => showToast(error.message)));
els.personalizationApply.addEventListener("click", () => applyAgentsChanges().catch((error) => showToast(error.message)));
els.personalizationSaveDraft.addEventListener("click", saveAgentsDraft);
els.personalizationModal.addEventListener("click", (event) => {
  if (event.target === els.personalizationModal) closePersonalizationWizard();
});
for (const input of document.querySelectorAll('input[name="agentsTarget"]')) {
  input.addEventListener("change", () => {
    state.personalization.preview = null;
    if (state.personalization.step === 4) previewAgentsChanges().catch((error) => showToast(error.message));
  });
}
for (const input of document.querySelectorAll('input[name="personalizationScope"]')) {
  input.addEventListener("change", () => {
    state.personalization.preview = null;
    updatePersonalizationThreadPickerVisibility();
  });
}
els.personalizationThreadSearch.addEventListener("input", () => {
  state.personalization.threadQuery = els.personalizationThreadSearch.value;
  renderPersonalizationThreadPicker();
});
els.chatCwdButton.addEventListener("click", () => {
  toggleChoiceMenu(els.chatCwdMenu, els.chatCwdButton);
  if (!els.chatCwdMenu.hidden) {
    const input = els.chatCwdMenu.querySelector(".custom-cwd-input");
    if (input) {
      input.focus();
      input.select();
    }
  }
});
els.chatModelButton.addEventListener("click", () => toggleChoiceMenu(els.chatModelMenu, els.chatModelButton));
els.chatEffortButton.addEventListener("click", () => toggleChoiceMenu(els.chatEffortMenu, els.chatEffortButton));
els.newThreadCwdButton.addEventListener("click", () => {
  toggleChoiceMenu(els.newThreadCwdMenu, els.newThreadCwdButton);
  if (!els.newThreadCwdMenu.hidden) {
    const input = els.newThreadCwdMenu.querySelector(".custom-cwd-input");
    if (input) {
      input.focus();
      input.select();
    }
  }
});
els.newThreadModelButton.addEventListener("click", () => toggleChoiceMenu(els.newThreadModelMenu, els.newThreadModelButton));
els.newThreadEffortButton.addEventListener("click", () => toggleChoiceMenu(els.newThreadEffortMenu, els.newThreadEffortButton));
els.newThreadFastMode.addEventListener("change", syncNewThreadFastModeLabel);
els.closeNewThreadModal.addEventListener("click", closeNewThreadModal);
els.cancelNewThread.addEventListener("click", closeNewThreadModal);
els.confirmNewThread.addEventListener("click", () => confirmNewThread());
els.newThreadModal.addEventListener("click", (event) => {
  if (event.target === els.newThreadModal) closeNewThreadModal();
});
els.resumeMenuButton.addEventListener("click", toggleResumePopover);
els.detailsToggle.addEventListener("click", toggleDetailsPanel);
els.chatFastMode.addEventListener("change", () => {
  syncFastModeLabel();
  updateChatEmptyState();
  saveActiveThreadConfig();
});
els.copyThreadId.addEventListener("click", () => {
  if (state.codex.threadId) copyText(state.codex.threadId);
});
els.jumpPrevSpeech.addEventListener("click", () => {
  jumpToPreviousSpeech().catch((error) => appendChatLine("error", error.message));
});
els.jumpNextSpeech.addEventListener("click", jumpToNextSpeech);
els.jumpLatest.addEventListener("click", jumpToLatestMessage);
els.chatLog.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const promptButton = target?.closest("[data-prompt]");
  if (promptButton) {
    els.chatInput.value = promptButton.getAttribute("data-prompt") || "";
    autoSizeChatInput();
    updateComposerState();
    els.chatInput.focus();
    return;
  }
  const copyButton = target?.closest(".copy-code-button");
  if (copyButton) {
    const encoded = copyButton.getAttribute("data-copy-code") || "";
    copyText(decodeURIComponent(encoded));
    return;
  }
  const toolCopyButton = target?.closest("[data-copy-tool]");
  if (toolCopyButton) {
    const encoded = toolCopyButton.getAttribute("data-copy-tool") || "";
    copyText(decodeURIComponent(encoded));
    return;
  }
  const viewFileButton = target?.closest("[data-view-file]");
  if (viewFileButton) {
    const path = viewFileButton.getAttribute("data-view-file") || "";
    window.open(`/api/file?path=${encodeURIComponent(path)}`, "_blank", "noreferrer");
    return;
  }
  const collapseButton = target?.closest("[data-collapse-tool]");
  if (collapseButton) {
    const card = collapseButton.closest(".tool-card");
    if (!card) return;
    const details = [...card.querySelectorAll("details")];
    if (details.length) {
      const anyOpen = details.some((item) => item.open);
      for (const item of details) item.open = !anyOpen;
      collapseButton.textContent = anyOpen ? "Show details" : "Collapse";
      return;
    }
    const collapsed = card.classList.toggle("collapsed");
    collapseButton.textContent = collapsed ? "Show details" : "Collapse";
  }
});
els.chatLog.addEventListener(
  "scroll",
  () => {
    maybeLoadOlderHistory();
    updateMessageJumpNav();
  },
  { passive: true },
);
els.resumeThreadId.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    resumeCodexThreadById().catch((error) => appendChatLine("error", error.message));
  }
});
document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest(".choice-control")) return;
  if (event.target instanceof Element && event.target.closest(".resume-action")) return;
  if (event.target instanceof Element && event.target.closest(".more-action")) return;
  if (event.target instanceof Element && event.target.closest(".sidebar-thread")) return;
  closeChoiceMenus();
  closeThreadItemMenus();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeChoiceMenus();
  closeThreadItemMenus();
  if (!els.renameThreadModal.hidden) closeRenameThreadModal();
  if (!els.threadManagerModal.hidden) closeThreadManager();
  if (!els.personalizationModal.hidden) closePersonalizationWizard();
  if (!els.newThreadModal.hidden) closeNewThreadModal();
});
els.newCodexThread.addEventListener("click", () => openNewThreadModal().catch((error) => appendChatLine("error", error.message)));
els.resumeCodexThread.addEventListener("click", () =>
  resumeCodexThreadById().catch((error) => appendChatLine("error", error.message)),
);
els.interruptCodexTurn.addEventListener("click", interruptCodexTurn);
renderChatEmptyState();
updateComposerState();
autoSizeChatInput();

loadStats()
  .then(loadServerThreadMetadata)
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
