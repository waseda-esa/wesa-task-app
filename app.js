const API_URL = "https://script.google.com/macros/s/AKfycbziAjrHZklvMsdvWY82V1_FE11OZPMRW2H3WR02-ESqpcio3ANBCp4poMBEvqNY6E4B/exec";
const MEMBERS = ["あっす", "しょうぺい", "よる", "うのりか", "たむたむ"];
const DEFAULT_CATEGORIES = ["ディベート", "ディスカッション", "スピーチ", "レッスン", "新歓", "協賛", "その他"];
const USER_STORAGE_KEY = "wesa_taskmgmt_current_user";
const COMPACT_MODE_STORAGE_KEY = "wesa_taskmgmt_compact_mode";

let currentView = "member";
let allTasks = [];
let categories = [...DEFAULT_CATEGORIES];
let myTasksOnly = false;
let currentUser = MEMBERS[0];
let hasLoadedTasks = false;
let compactMode = false;

function escapeHtml(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStoredUser() {
  try {
    const storedUser = localStorage.getItem(USER_STORAGE_KEY);
    return MEMBERS.includes(storedUser) ? storedUser : "";
  } catch (error) {
    console.error(error);
    return "";
  }
}

function persistCurrentUser(user) {
  try {
    localStorage.setItem(USER_STORAGE_KEY, user);
  } catch (error) {
    console.error(error);
  }
}

function getStoredCompactMode() {
  try {
    return localStorage.getItem(COMPACT_MODE_STORAGE_KEY) === "true";
  } catch (error) {
    console.error(error);
    return false;
  }
}

function persistCompactMode() {
  try {
    localStorage.setItem(COMPACT_MODE_STORAGE_KEY, String(compactMode));
  } catch (error) {
    console.error(error);
  }
}

function updateCompactModeButton() {
  const toggle = document.getElementById("compactModeToggle");
  if (!toggle) return;
  toggle.checked = compactMode;
}

function setCompactMode(nextCompactMode, options = {}) {
  const { persist = true, rerender = true } = options;
  compactMode = Boolean(nextCompactMode);
  updateCompactModeButton();

  if (persist) {
    persistCompactMode();
  }

  if (rerender && hasLoadedTasks) {
    renderTasks();
  }
}

function updateCurrentUserSelects() {
  const currentUserSelect = document.getElementById("currentUserSelect");
  const loginUserSelect = document.getElementById("loginUserSelect");
  const accountButtonName = document.getElementById("accountButtonName");
  const accountCurrentName = document.getElementById("accountCurrentName");

  if (currentUserSelect) currentUserSelect.value = currentUser;
  if (loginUserSelect) loginUserSelect.value = currentUser;
  if (accountButtonName) accountButtonName.textContent = currentUser;
  if (accountCurrentName) accountCurrentName.textContent = currentUser;
}

function setDefaultAssigneeForCreate() {
  if (document.getElementById("editingTaskId").value) return;

  document.querySelectorAll('input[name="assignee"]').forEach(el => {
    el.checked = el.value === currentUser;
  });
}

function setCurrentUser(user, options = {}) {
  const { persist = true, rerender = true } = options;
  currentUser = MEMBERS.includes(user) ? user : MEMBERS[0];
  updateCurrentUserSelects();
  setDefaultAssigneeForCreate();

  if (persist) {
    persistCurrentUser(currentUser);
  }

  if (rerender && hasLoadedTasks) {
    renderTasks();
  }
}

function showLoginOverlay() {
  document.getElementById("loginOverlay").classList.add("is-open");
  document.body.classList.add("login-open");
}

function hideLoginOverlay() {
  document.getElementById("loginOverlay").classList.remove("is-open");
  document.body.classList.remove("login-open");
}

function renderAccountUserList() {
  const list = document.getElementById("accountUserList");
  if (!list) return;

  list.innerHTML = "";

  MEMBERS.forEach(user => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `account-user-item${user === currentUser ? " is-current" : ""}`;
    button.textContent = user;
    button.addEventListener("click", () => {
      setCurrentUser(user);
      closeAccountMenu();
    });
    list.appendChild(button);
  });
}

function openAccountMenu() {
  const menu = document.getElementById("accountMenuPanel");
  const button = document.getElementById("accountMenuBtn");
  if (!menu || !button) return;

  renderAccountUserList();
  menu.classList.add("is-open");
  button.setAttribute("aria-expanded", "true");
}

function closeAccountMenu() {
  const menu = document.getElementById("accountMenuPanel");
  const button = document.getElementById("accountMenuBtn");
  if (!menu || !button) return;

  menu.classList.remove("is-open");
  button.setAttribute("aria-expanded", "false");
}

function toggleAccountMenu() {
  const menu = document.getElementById("accountMenuPanel");
  if (!menu) return;

  if (menu.classList.contains("is-open")) {
    closeAccountMenu();
  } else {
    openAccountMenu();
  }
}
function formatDate(d) {
  if (!d) return "期限なし";
  const dt = new Date(d);
  return isNaN(dt) ? "期限なし" : dt.toLocaleDateString("ja-JP");
}

function formatDateForInput(d) {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function isHelpNeeded(t) {
  return t.need_help === true || t.need_help === "true" || t.need_help === "TRUE";
}

function normalizeAssignees(t) {
  return Array.isArray(t.assignees) ? t.assignees : [];
}

function normalizeCategoryName(value) {
  return String(value || "").trim();
}

function setCategories(nextCategories) {
  categories = [...new Set(
    (Array.isArray(nextCategories) ? nextCategories : [])
      .map(normalizeCategoryName)
      .filter(Boolean)
  )];
}

function populateCategorySelect(selectedCategory = "") {
  const select = document.getElementById("categorySelect");
  const currentValue = normalizeCategoryName(selectedCategory || select.value);

  select.innerHTML = '<option value="">未分類</option>';

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  if (currentValue && categories.includes(currentValue)) {
    select.value = currentValue;
  } else {
    select.value = "";
  }
}

function renderCategoryManagerList() {
  const list = document.getElementById("categoryManagerList");
  if (!list) return;

  list.innerHTML = "";

  if (!categories.length) {
    list.innerHTML = '<p class="empty-text">カテゴリはまだありません</p>';
    return;
  }

  categories.forEach(category => {
    const row = document.createElement("div");
    row.className = "category-manager-item";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "category-manager-edit-input";
    input.value = category;
    input.setAttribute("aria-label", `${category}の名前を編集`);

    const actions = document.createElement("div");
    actions.className = "category-manager-actions";

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "category-action-btn rename";
    renameButton.textContent = "保存";
    renameButton.addEventListener("click", () => renameCategory(category, input.value));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "category-action-btn delete";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => deleteCategory(category));

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameButton.click();
      }
    });

    actions.appendChild(renameButton);
    actions.appendChild(deleteButton);
    row.appendChild(input);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function openCategoryManager() {
  renderCategoryManagerList();
  document.getElementById("categoryManagerOverlay").classList.add("is-open");
  setTimeout(() => document.getElementById("newCategoryName").focus(), 60);
}

function closeCategoryManager() {
  document.getElementById("categoryManagerOverlay").classList.remove("is-open");
  document.getElementById("newCategoryName").value = "";
}

function fetchJson(url, options) {
  return fetch(url, options).then(response => response.json());
}

function postToApi(params) {
  return fetchJson(API_URL, { method: "POST", body: params });
}

function loadCategories() {
  return fetchJson(`${API_URL}?mode=getCategories`)
    .then(data => {
      const nextCategories = Array.isArray(data) && data.length ? data : DEFAULT_CATEGORIES;
      setCategories(nextCategories);
      populateCategorySelect("");
      renderCategoryManagerList();
      return categories;
    })
    .catch(error => {
      console.error(error);
      setCategories(DEFAULT_CATEGORIES);
      populateCategorySelect("");
      renderCategoryManagerList();
      return categories;
    });
}

function createCategoryFromValue(name) {
  const categoryName = normalizeCategoryName(name);
  if (!categoryName) {
    return Promise.resolve("");
  }

  if (categories.includes(categoryName)) {
    return Promise.resolve(categoryName);
  }

  const params = new URLSearchParams();
  params.append("mode", "createCategory");
  params.append("name", categoryName);

  return postToApi(params).then(res => {
    if (!res.success) {
      throw new Error("カテゴリの追加に失敗しました");
    }

    setCategories(Array.isArray(res.categories) && res.categories.length ? res.categories : [...categories, categoryName]);
    populateCategorySelect(categoryName);
    renderCategoryManagerList();
    return categoryName;
  });
}

function createCategory() {
  const input = document.getElementById("newCategoryName");
  const categoryName = normalizeCategoryName(input.value);

  if (!categoryName) {
    alert("カテゴリ名を入力してください");
    input.focus();
    return;
  }

  showLoading("カテゴリを追加中...");

  createCategoryFromValue(categoryName)
    .then(() => {
      input.value = "";
      populateCategorySelect(categoryName);
      renderTasks();
    })
    .catch(error => {
      console.error(error);
      alert("カテゴリの追加に失敗しました");
    })
    .finally(hideLoading);
}

function renameCategory(oldName, newName) {
  const before = normalizeCategoryName(oldName);
  const after = normalizeCategoryName(newName);

  if (!after) {
    alert("カテゴリ名を入力してください");
    renderCategoryManagerList();
    return;
  }

  if (before === after) {
    renderCategoryManagerList();
    return;
  }

  showLoading("カテゴリ名を変更中...");

  const params = new URLSearchParams();
  params.append("mode", "renameCategory");
  params.append("old_name", before);
  params.append("new_name", after);

  postToApi(params)
    .then(res => {
      if (!res.success) {
        alert("カテゴリ名の変更に失敗しました");
        return;
      }

      if (Array.isArray(res.categories)) {
        setCategories(res.categories);
      } else {
        setCategories(categories.map(category => category === before ? after : category));
      }

      allTasks.forEach(task => {
        if (normalizeCategoryName(task.category) === before) {
          task.category = after;
        }
      });

      populateCategorySelect(after);
      renderCategoryManagerList();
      renderTasks();
    })
    .catch(error => {
      console.error(error);
      alert("カテゴリ名の変更に失敗しました");
    })
    .finally(hideLoading);
}

function deleteCategory(name) {
  const categoryName = normalizeCategoryName(name);
  if (!categoryName) return;

  if (!confirm(`「${categoryName}」を削除しますか？\nこのカテゴリのタスクは未分類になります。`)) {
    return;
  }

  showLoading("カテゴリを削除中...");

  const params = new URLSearchParams();
  params.append("mode", "deleteCategory");
  params.append("name", categoryName);

  postToApi(params)
    .then(res => {
      if (!res.success) {
        alert("カテゴリの削除に失敗しました");
        return;
      }

      if (Array.isArray(res.categories)) {
        setCategories(res.categories);
      } else {
        setCategories(categories.filter(category => category !== categoryName));
      }

      allTasks.forEach(task => {
        if (normalizeCategoryName(task.category) === categoryName) {
          task.category = "";
        }
      });

      populateCategorySelect("");
      renderCategoryManagerList();
      renderTasks();
    })
    .catch(error => {
      console.error(error);
      alert("カテゴリの削除に失敗しました");
    })
    .finally(hideLoading);
}

function getCategoryValue() {
  return document.getElementById("categorySelect").value;
}

function updateCustomCategoryVisibility() {
  return;
}

function getStatusClass(s) {
  if (s === "完了") return "status-done";
  if (s === "進行中") return "status-progress";
  return "status-todo";
}

function getDeadlineClass(t) {
  if (t.status === "完了") return "";

  const dl = new Date(t.deadline);
  const td = new Date();

  if (isNaN(dl)) return "";

  dl.setHours(0, 0, 0, 0);
  td.setHours(0, 0, 0, 0);

  const diff = (dl - td) / 864e5;

  if (diff < 0) return "danger";
  if (diff <= 1) return "warning";
  if (diff <= 3) return "caution";
  return "";
}

function getDeadlineTime(t) {
  const date = new Date(t.deadline);
  if (!t.deadline || isNaN(date)) return Number.MAX_SAFE_INTEGER;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function sortTasksForDisplay(tasks) {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === "完了";
    const bDone = b.status === "完了";

    if (aDone !== bDone) return aDone ? 1 : -1;

    const aDeadline = getDeadlineTime(a);
    const bDeadline = getDeadlineTime(b);

    if (aDeadline !== bDeadline) return aDeadline - bDeadline;

    const aUpdated = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
    const bUpdated = new Date(b.updated_at || b.created_at || 0).getTime() || 0;

    return bUpdated - aUpdated;
  });
}

function getBaseFilteredTasks() {
  let tasks = [...allTasks];

  if (currentView === "help") tasks = tasks.filter(t => isHelpNeeded(t));
  if (myTasksOnly) tasks = tasks.filter(t => normalizeAssignees(t).includes(currentUser));

  return tasks;
}

function getFilteredTasks() {
  return sortTasksForDisplay(getBaseFilteredTasks());
}

function getGroupCountClass(tasks) {
  const hasDanger = tasks.some(t => getDeadlineClass(t) === "danger" && t.status !== "完了");
  const hasProgress = tasks.some(t => t.status === "進行中");

  if (hasDanger) return "has-danger";
  if (hasProgress) return "has-progress";
  return "";
}

function getStatusCounts(tasks) {
  return {
    todo: tasks.filter(t => t.status === "未着手").length,
    progress: tasks.filter(t => t.status === "進行中").length,
    done: tasks.filter(t => t.status === "完了").length
  };
}

function getGroupStatusSummaryHtml(tasks) {
  const counts = getStatusCounts(tasks);

  return `
    <span class="summary-chip todo">未着手 ${counts.todo}件</span>
    <span class="summary-chip progress">進行中 ${counts.progress}件</span>
    <span class="summary-chip done">完了 ${counts.done}件</span>
  `;
}

function formatRelativeTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (isNaN(date)) return "";

  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "たった今更新";
  if (diffMinutes < 60) return `${diffMinutes}分前に更新`;
  if (diffHours < 24) return `${diffHours}時間前に更新`;
  return `${diffDays}日前に更新`;
}

function renderTaskGrid(tasks) {
  const grid = document.createElement("div");
  grid.className = "member-task-grid";

  sortTasksForDisplay(tasks).forEach(t => {
    grid.appendChild(createTaskCard(t));
  });

  return grid;
}

function createCompactTaskRow(task) {
  const row = document.createElement("div");
  const dlClass = getDeadlineClass(task);
  const helpNeeded = isHelpNeeded(task);

  row.className = [
    "compact-task-row",
    dlClass ? `deadline-${dlClass}` : "",
    helpNeeded ? "help-needed" : "",
    task.status === "完了" ? "is-done" : ""
  ].filter(Boolean).join(" ");

  const deadlineText = task.deadline ? formatDate(task.deadline) : "期限なし";
  const metaParts = [];

  if (task.category) metaParts.push(task.category);
  if (task.status) metaParts.push(task.status);
  if (deadlineText) metaParts.push(deadlineText);
  if (helpNeeded) metaParts.push("助けが必要");

  row.innerHTML = `
    <div class="compact-task-main">
      <div class="compact-task-title">${escapeHtml(task.title || "無題")}</div>
      <div class="compact-task-meta">${escapeHtml(metaParts.join(" / "))}</div>
    </div>
    <div class="compact-task-actions">
      <button type="button" class="compact-complete-btn" aria-label="${escapeHtml((task.title || "無題") + "を完了にする")}">完了にする</button>
      <button type="button" class="compact-edit-btn" aria-label="${escapeHtml((task.title || "無題") + "を編集")}">✎</button>
    </div>
  `;

  row.querySelector(".compact-complete-btn").addEventListener("click", () => updateTaskStatus(task.id, "完了"));
  row.querySelector(".compact-edit-btn").addEventListener("click", () => openEditTaskForm(task.id));

  return row;
}

function renderCompactTaskList(tasks) {
  const list = document.createElement("div");
  list.className = "compact-task-list";
  const visibleTasks = sortTasksForDisplay(tasks).filter(task => task.status !== "完了");

  if (!visibleTasks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-text compact-empty-text";
    empty.textContent = "タスクなし";
    list.appendChild(empty);
    return list;
  }

  visibleTasks.forEach(task => {
    list.appendChild(createCompactTaskRow(task));
  });

  return list;
}

function createStatusContent(tasks) {
  const content = document.createElement("div");
  content.className = "status-section-content";

  if (tasks.length > 0) {
    content.appendChild(renderTaskGrid(tasks));
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-text done-empty-text";
    empty.textContent = "タスクなし";
    content.appendChild(empty);
  }

  return content;
}

function enableDetailsAnimation(details) {
  const summary = details.querySelector("summary");
  const content = details.querySelector(".status-section-content");

  summary.addEventListener("click", event => {
    event.preventDefault();
    if (details.dataset.animating === "true") return;

    const isOpen = details.open;
    details.dataset.animating = "true";
    content.style.overflow = "hidden";

    if (!isOpen) {
      details.open = true;
      content.style.height = "0px";
      content.style.opacity = "0";
      content.offsetHeight;
      content.style.height = `${content.scrollHeight}px`;
      content.style.opacity = "1";
    } else {
      content.style.height = `${content.scrollHeight}px`;
      content.style.opacity = "1";
      content.offsetHeight;
      content.style.height = "0px";
      content.style.opacity = "0";
    }

    content.addEventListener("transitionend", function handleTransitionEnd(event) {
      if (event.propertyName !== "height") return;
      content.removeEventListener("transitionend", handleTransitionEnd);

      if (isOpen) details.open = false;

      content.style.height = "";
      content.style.opacity = "";
      content.style.overflow = "";
      delete details.dataset.animating;
    });
  });
}

function createStatusDetails(label, tasks, className, isOpen) {
  const details = document.createElement("details");
  details.className = `status-section ${className}`;
  if (isOpen) details.open = true;

  const summary = document.createElement("summary");
  summary.className = `status-summary-row ${className}`;
  summary.innerHTML = `<span>${label}</span><span>${tasks.length}件</span>`;
  details.appendChild(summary);
  details.appendChild(createStatusContent(tasks));
  enableDetailsAnimation(details);

  return details;
}

function renderStatusSections(parent, tasks) {
  const progressTasks = sortTasksForDisplay(tasks.filter(t => t.status === "進行中"));
  const todoTasks = sortTasksForDisplay(tasks.filter(t => t.status === "未着手"));
  const doneTasks = sortTasksForDisplay(tasks.filter(t => t.status === "完了"));

  parent.appendChild(createStatusDetails("進行中", progressTasks, "progress-section", true));
  parent.appendChild(createStatusDetails("未着手", todoTasks, "todo-section", true));
  parent.appendChild(createStatusDetails("完了", doneTasks, "done-section", false));
}

function showLoading(text) {
  document.getElementById("loadingText").textContent = text || "処理中...";
  document.getElementById("loadingOverlay").classList.add("is-open");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.remove("is-open");
}

function resetTaskForm() {
  document.getElementById("taskForm").reset();
  document.getElementById("editingTaskId").value = "";
  document.getElementById("taskFormTitle").textContent = "タスク追加";
  document.getElementById("submitTaskBtn").textContent = "追加";
  document.getElementById("createOnlyFields").style.display = "block";
  document.getElementById("status").value = "未着手";
  document.getElementById("need_help").checked = false;
  document.getElementById("help_comment").value = "";
  populateCategorySelect("");
  setDefaultAssigneeForCreate();
}

function openCreateTaskForm() {
  resetTaskForm();
  document.getElementById("taskFormOverlay").classList.add("is-open");
  setTimeout(() => document.getElementById("title").focus(), 60);
}

function openEditTaskForm(taskId) {
  const task = allTasks.find(i => String(i.id) === String(taskId));
  if (!task) return;

  resetTaskForm();

  document.getElementById("editingTaskId").value = task.id;
  document.getElementById("taskFormTitle").textContent = "タスク編集";
  document.getElementById("submitTaskBtn").textContent = "保存";
  document.getElementById("createOnlyFields").style.display = "block";
  document.getElementById("title").value = task.title || "";
  populateCategorySelect(task.category || "");
  document.getElementById("deadline").value = formatDateForInput(task.deadline);
  document.getElementById("memo").value = task.memo || "";
  document.getElementById("status").value = task.status || "未着手";
  document.getElementById("need_help").checked = isHelpNeeded(task);
  document.getElementById("help_comment").value = task.help_comment || "";

  const assignees = normalizeAssignees(task);
  document.querySelectorAll('input[name="assignee"]').forEach(el => {
    el.checked = assignees.includes(el.value);
  });

  document.getElementById("taskFormOverlay").classList.add("is-open");
  setTimeout(() => document.getElementById("title").focus(), 60);
}

function closeTaskForm() {
  document.getElementById("taskFormOverlay").classList.remove("is-open");
}

function updateTaskStatus(taskId, newStatus) {
  showLoading("ステータスを更新中...");

  const p = new URLSearchParams();
  p.append("mode", "updateStatus");
  p.append("task_id", taskId);
  p.append("status", newStatus);

  fetch(API_URL, { method: "POST", body: p })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        const t = allTasks.find(x => String(x.id) === String(taskId));
        if (t) t.status = newStatus;
        renderTasks();
      } else {
        alert("ステータス更新に失敗しました");
        loadTasks();
      }
    })
    .catch(error => {
      console.error(error);
      alert("ステータス更新に失敗しました");
      loadTasks();
    })
    .finally(hideLoading);
}

function toggleTaskHelp(taskId) {
  const task = allTasks.find(i => String(i.id) === String(taskId));
  if (!task) return;

  const next = !isHelpNeeded(task);
  let helpComment = task.help_comment || "";

  if (next) {
    const input = prompt("助けてほしい内容を書いてください", helpComment);
    if (input === null) return;
    helpComment = input;
  } else {
    helpComment = "";
  }

  showLoading("更新中...");

  const p = new URLSearchParams();
  p.append("mode", "updateHelp");
  p.append("task_id", taskId);
  p.append("need_help", next);
  p.append("help_comment", helpComment);

  fetch(API_URL, { method: "POST", body: p })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        task.need_help = next;
        task.help_comment = helpComment;
        renderTasks();
      } else {
        alert("更新に失敗しました");
        loadTasks();
      }
    })
    .catch(error => {
      console.error(error);
      alert("更新に失敗しました");
      loadTasks();
    })
    .finally(hideLoading);
}

function deleteTask(taskId) {
  if (!confirm("このタスクを削除しますか？")) return;

  showLoading("削除中...");

  const p = new URLSearchParams();
  p.append("mode", "deleteTask");
  p.append("task_id", taskId);

  fetch(API_URL, { method: "POST", body: p })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        allTasks = allTasks.filter(t => String(t.id) !== String(taskId));
        renderTasks();
      } else {
        alert("削除に失敗しました");
        loadTasks();
      }
    })
    .catch(error => {
      console.error(error);
      alert("削除に失敗しました");
      loadTasks();
    })
    .finally(hideLoading);
}

function createTaskCard(task) {
  const div = document.createElement("div");
  const dlClass = getDeadlineClass(task);
  const assignees = normalizeAssignees(task);
  const helpNeeded = isHelpNeeded(task);
  const isDone = task.status === "完了";
  const updatedText = formatRelativeTime(task.updated_at || task.created_at);

  div.className = [
    "task-card",
    helpNeeded ? "help-needed" : "",
    dlClass ? `deadline-${dlClass}` : "",
    isDone ? "is-done" : ""
  ].filter(Boolean).join(" ");

  const deadlineChipHtml = task.deadline
    ? `<span class="deadline-chip ${dlClass}">${escapeHtml(formatDate(task.deadline))}</span>`
    : '<span class="deadline-chip">期限なし</span>';

  div.innerHTML = `
    <div class="task-card-inner">
      <div class="task-top">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="status-pill ${getStatusClass(task.status)}">${escapeHtml(task.status || "未着手")}</div>
      </div>
      <div class="meta-row meta-row-category"><span class="meta-label">カテゴリ</span>${escapeHtml(task.category || "未分類")}</div>
      <div class="meta-row meta-row-deadline"><span class="meta-label">期限</span>${deadlineChipHtml}</div>
      <div class="meta-row meta-row-assignee"><span class="meta-label">担当</span>${escapeHtml(assignees.join("、") || "なし")}</div>
      <div class="meta-row meta-row-memo"><span class="meta-label">メモ</span>${escapeHtml(task.memo || "なし")}</div>
      ${updatedText ? `<div class="meta-row meta-row-updated"><span class="meta-label">更新</span><span class="updated-chip">${escapeHtml(updatedText)}</span></div>` : ""}
      ${helpNeeded ? `<div class="help-badge"><span>助けが必要${task.help_comment ? "：" + escapeHtml(task.help_comment) : ""}</span></div>` : ""}
      <div class="card-divider compact-hide"></div>
      <div class="task-actions compact-hide">
        <select class="status-select">
          <option value="未着手" ${task.status === "未着手" ? "selected" : ""}>未着手</option>
          <option value="進行中" ${task.status === "進行中" ? "selected" : ""}>進行中</option>
          <option value="完了" ${task.status === "完了" ? "selected" : ""}>完了</option>
        </select>
        ${isDone ? "" : '<button type="button" class="action-btn btn-complete">完了にする</button>'}
        <button type="button" class="action-btn btn-help ${helpNeeded ? "is-active" : ""}">${helpNeeded ? "助けを不要にする" : "助けを求める"}</button>
        <button type="button" class="action-btn btn-edit">編集</button>
        <button type="button" class="action-btn btn-delete">削除</button>
      </div>
    </div>
  `;

  div.querySelector(".status-select").addEventListener("change", function () {
    updateTaskStatus(task.id, this.value);
  });

  const completeButton = div.querySelector(".btn-complete");
  if (completeButton) {
    completeButton.addEventListener("click", () => updateTaskStatus(task.id, "完了"));
  }

  div.querySelector(".btn-help").addEventListener("click", () => toggleTaskHelp(task.id));
  div.querySelector(".btn-edit").addEventListener("click", () => openEditTaskForm(task.id));
  div.querySelector(".btn-delete").addEventListener("click", () => deleteTask(task.id));

  return div;
}

function renderMemberView(tasks) {
  const c = document.getElementById("taskList");
  c.innerHTML = "";
  c.className = `member-layout${compactMode ? " compact-mode" : ""}`;

  const displayMembers = myTasksOnly ? [currentUser] : MEMBERS;
  const grouped = {};

  displayMembers.forEach(member => {
    grouped[member] = [];
  });

  tasks.forEach(task => {
    normalizeAssignees(task).forEach(user => {
      if (displayMembers.includes(user)) grouped[user].push(task);
    });
  });

  displayMembers.forEach(user => {
    const gb = document.createElement("div");
    gb.className = "group-block";

    const h = document.createElement("h3");
    h.className = "group-title";
    h.innerHTML = `
      <span class="group-title-text">${escapeHtml(user)}</span>
      <span class="group-title-summary ${getGroupCountClass(grouped[user])}">${getGroupStatusSummaryHtml(grouped[user])}</span>
    `;
    gb.appendChild(h);

    if (compactMode) {
      gb.appendChild(renderCompactTaskList(grouped[user]));
    } else {
      renderStatusSections(gb, grouped[user]);
    }
    c.appendChild(gb);
  });
}

function renderCategoryView(tasks) {
  const c = document.getElementById("taskList");
  c.innerHTML = "";
  c.className = `category-layout${compactMode ? " compact-mode" : ""}`;

  if (!tasks.length) {
    c.innerHTML = '<p class="empty-text">タスクはありません</p>';
    return;
  }

  const grouped = {};

  tasks.forEach(task => {
    const category = task.category && String(task.category).trim() !== "" ? task.category : "未分類";
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(task);
  });

  Object.keys(grouped).sort().forEach(category => {
    const gb = document.createElement("div");
    gb.className = "group-block";

    const h = document.createElement("h3");
    h.className = "group-title";
    h.innerHTML = `
      <span class="group-title-text">${escapeHtml(category)}</span>
      <span class="group-title-summary ${getGroupCountClass(grouped[category])}">${getGroupStatusSummaryHtml(grouped[category])}</span>
    `;
    gb.appendChild(h);

    if (compactMode) {
      gb.appendChild(renderCompactTaskList(grouped[category]));
    } else {
      renderStatusSections(gb, grouped[category]);
    }
    c.appendChild(gb);
  });
}

function renderHelpView(tasks) {
  const c = document.getElementById("taskList");
  c.innerHTML = "";
  c.className = `category-layout${compactMode ? " compact-mode" : ""}`;

  if (!tasks.length) {
    c.innerHTML = '<p class="empty-text">タスクはありません</p>';
    return;
  }

  const gb = document.createElement("div");
  gb.className = "group-block";

  const h = document.createElement("h3");
  h.className = "group-title";
  h.innerHTML = `
    <span class="group-title-text">助けが必要</span>
    <span class="group-title-summary has-danger">${getGroupStatusSummaryHtml(tasks)}</span>
  `;
  gb.appendChild(h);

  if (compactMode) {
    gb.appendChild(renderCompactTaskList(tasks));
  } else {
    renderStatusSections(gb, tasks);
  }
  c.appendChild(gb);
}

function updateViewButtons() {
  document.getElementById("memberViewBtn").classList.toggle("active-view", currentView === "member");
  document.getElementById("categoryViewBtn").classList.toggle("active-view", currentView === "category");
  document.getElementById("helpViewBtn").classList.toggle("active-view", currentView === "help");
}

function updateListHeader(tasks) {
  const title = document.getElementById("listTitle");
  const count = document.getElementById("taskCount");

  if (currentView === "member") {
    title.textContent = myTasksOnly ? `${currentUser}のタスク` : "メンバー別";
  } else if (currentView === "category") {
    title.textContent = myTasksOnly ? `${currentUser}のタスク・カテゴリ別` : "カテゴリ別";
  } else {
    title.textContent = myTasksOnly ? `${currentUser}の助けが必要なタスク` : "助けが必要なタスク";
  }

  const activeTasks = tasks.filter(task => task.status !== "完了");
  count.textContent = `${activeTasks.length}件`;
}

function renderTasks() {
  const tasks = getFilteredTasks();
  updateListHeader(tasks);

  if (currentView === "member") {
    renderMemberView(tasks);
  } else if (currentView === "category") {
    renderCategoryView(tasks);
  } else {
    renderHelpView(tasks);
  }

  updateViewButtons();
}

function loadTasks() {
  showLoading("タスクを読み込み中...");

  Promise.all([
    fetchJson(API_URL),
    loadCategories()
  ])
    .then(([taskData]) => {
      allTasks = Array.isArray(taskData) ? taskData : [];
      hasLoadedTasks = true;
      renderTasks();
    })
    .catch(error => {
      console.error(error);
      document.getElementById("taskList").innerHTML = '<p class="empty-text">タスクの読み込みに失敗しました</p>';
    })
    .finally(hideLoading);
}

function initializeApp() {
  const storedUser = getStoredUser();
  setCompactMode(getStoredCompactMode(), { persist: false, rerender: false });

  if (storedUser) {
    setCurrentUser(storedUser, { persist: false, rerender: false });
    hideLoginOverlay();
    loadTasks();
    return;
  }

  setCurrentUser(MEMBERS[0], { persist: false, rerender: false });
  showLoginOverlay();
}

document.getElementById("openTaskFormBtn").addEventListener("click", openCreateTaskForm);
document.getElementById("closeTaskFormBtn").addEventListener("click", closeTaskForm);
document.getElementById("categorySelect").addEventListener("change", updateCustomCategoryVisibility);
document.getElementById("openCategoryManagerBtn").addEventListener("click", () => {
  closeAccountMenu();
  openCategoryManager();
});
document.getElementById("openCategoryManagerInlineBtn").addEventListener("click", openCategoryManager);
document.getElementById("closeCategoryManagerBtn").addEventListener("click", closeCategoryManager);
document.getElementById("createCategoryBtn").addEventListener("click", createCategory);
document.getElementById("newCategoryName").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    createCategory();
  }
});

document.getElementById("taskFormOverlay").addEventListener("click", event => {
  if (event.target === event.currentTarget) closeTaskForm();
});

document.getElementById("categoryManagerOverlay").addEventListener("click", event => {
  if (event.target === event.currentTarget) closeCategoryManager();
});

document.getElementById("accountMenuBtn").addEventListener("click", event => {
  event.stopPropagation();
  toggleAccountMenu();
});

document.getElementById("accountMenuPanel").addEventListener("click", event => {
  event.stopPropagation();
});

document.addEventListener("click", event => {
  const accountMenuWrap = document.querySelector(".account-menu-wrap");
  if (accountMenuWrap && !accountMenuWrap.contains(event.target)) {
    closeAccountMenu();
  }
});

document.getElementById("memberViewBtn").addEventListener("click", () => {
  currentView = "member";
  renderTasks();
});

document.getElementById("categoryViewBtn").addEventListener("click", () => {
  currentView = "category";
  renderTasks();
});

document.getElementById("helpViewBtn").addEventListener("click", () => {
  currentView = "help";
  renderTasks();
});

document.getElementById("myTasksOnlyFilter").addEventListener("change", function () {
  myTasksOnly = this.checked;
  renderTasks();
});

document.getElementById("compactModeToggle").addEventListener("change", function () {
  setCompactMode(this.checked);
});

document.getElementById("loginConfirmBtn").addEventListener("click", () => {
  setCurrentUser(document.getElementById("loginUserSelect").value, { persist: true, rerender: false });
  hideLoginOverlay();
  loadTasks();
});

document.getElementById("taskForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const editId = document.getElementById("editingTaskId").value;
  const isEditing = editId !== "";
  const selectedAssignees = Array.from(document.querySelectorAll('input[name="assignee"]:checked')).map(el => el.value);
  const assignees = selectedAssignees.length > 0 ? selectedAssignees : [currentUser];
  const categoryValue = normalizeCategoryName(getCategoryValue());
  const statusValue = document.getElementById("status").value;
  const needHelpValue = document.getElementById("need_help").checked;
  const helpCommentValue = document.getElementById("help_comment").value;

  showLoading(isEditing ? "保存中..." : "追加中...");

  createCategoryFromValue(categoryValue)
    .then(savedCategory => {
      const p = new URLSearchParams();
      p.append("mode", isEditing ? "updateTask" : "create");
      p.append("task_id", editId);
      p.append("title", document.getElementById("title").value);
      p.append("category", savedCategory);
      p.append("deadline", document.getElementById("deadline").value);
      p.append("memo", document.getElementById("memo").value);
      p.append("assignees", assignees.join(","));

      if (!isEditing) {
        p.append("status", statusValue);
        p.append("need_help", needHelpValue);
        p.append("help_comment", helpCommentValue);
      }

      return fetch(API_URL, { method: "POST", body: p });
    })
    .then(r => r.json())
    .then(res => {
      if (!res.success) {
        alert(isEditing ? "保存に失敗しました" : "追加に失敗しました");
        return;
      }

      if (isEditing) {
        const task = allTasks.find(item => String(item.id) === String(editId));

        if (task && res.task) {
          task.title = res.task.title;
          task.category = res.task.category;
          task.deadline = res.task.deadline;
          task.memo = res.task.memo;
          task.assignees = res.task.assignees;
          task.updated_at = res.task.updated_at;
          task.status = statusValue;
          task.need_help = needHelpValue;
          task.help_comment = helpCommentValue;
        }

        const statusParams = new URLSearchParams();
        statusParams.append("mode", "updateStatus");
        statusParams.append("task_id", editId);
        statusParams.append("status", statusValue);

        const helpParams = new URLSearchParams();
        helpParams.append("mode", "updateHelp");
        helpParams.append("task_id", editId);
        helpParams.append("need_help", needHelpValue);
        helpParams.append("help_comment", helpCommentValue);

        return Promise.all([
          postToApi(statusParams),
          postToApi(helpParams)
        ]).then(([statusRes, helpRes]) => {
          if (!statusRes.success || !helpRes.success) {
            throw new Error("追加更新に失敗しました");
          }
          populateCategorySelect("");
          renderTasks();
          closeTaskForm();
          resetTaskForm();
          return null;
        });
      }

      if (res.task) {
        allTasks.push(res.task);
      }

      populateCategorySelect("");
      renderTasks();
      closeTaskForm();
      resetTaskForm();
      return null;
    })
    .catch(error => {
      console.error(error);
      alert(isEditing ? "保存に失敗しました" : "追加に失敗しました");
    })
    .finally(hideLoading);
});

initializeApp();
