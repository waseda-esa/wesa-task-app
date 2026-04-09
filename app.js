const API_URL = "https://script.google.com/macros/s/AKfycbziAjrHZklvMsdvWY82V1_FE11OZPMRW2H3WR02-ESqpcio3ANBCp4poMBEvqNY6E4B/exec";
const MEMBERS = ["あっす", "しょうぺい", "よる", "うのりか", "たむたむ"];
const DEFAULT_CATEGORIES = ["ディベート", "ディスカッション", "スピーチ", "レッスン", "新歓", "協賛", "その他"];

let currentView = "member";
let allTasks = [];
let myTasksOnly = false;
let currentUser = MEMBERS[0];

function escapeHtml(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function getAllCategories() {
  const taskCategories = allTasks
    .map(t => t.category)
    .filter(category => category && String(category).trim() !== "")
    .map(category => String(category).trim());

  return [...new Set([...DEFAULT_CATEGORIES, ...taskCategories])];
}

function populateCategorySelect(selectedCategory = "") {
  const select = document.getElementById("categorySelect");
  const customGroup = document.getElementById("customCategoryGroup");
  const customInput = document.getElementById("customCategory");
  const currentValue = selectedCategory || select.value;
  const categories = getAllCategories();

  select.innerHTML = '<option value="">未分類</option>';

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  const addOption = document.createElement("option");
  addOption.value = "__custom__";
  addOption.textContent = "＋ 新しいカテゴリを追加";
  select.appendChild(addOption);

  if (currentValue && categories.includes(currentValue)) {
    select.value = currentValue;
    customGroup.style.display = "none";
    customInput.value = "";
  } else if (currentValue) {
    select.value = "__custom__";
    customGroup.style.display = "block";
    customInput.value = currentValue;
  } else {
    select.value = "";
    customGroup.style.display = "none";
    customInput.value = "";
  }
}

function getCategoryValue() {
  const selected = document.getElementById("categorySelect").value;
  if (selected === "__custom__") return document.getElementById("customCategory").value.trim();
  return selected;
}

function updateCustomCategoryVisibility() {
  const selected = document.getElementById("categorySelect").value;
  const customGroup = document.getElementById("customCategoryGroup");
  const customInput = document.getElementById("customCategory");

  if (selected === "__custom__") {
    customGroup.style.display = "block";
    customInput.focus();
  } else {
    customGroup.style.display = "none";
    customInput.value = "";
  }
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

function createGroupStatusSummary(tasks) {
  const counts = getStatusCounts(tasks);

  const summary = document.createElement("div");
  summary.className = "group-status-summary";

  summary.innerHTML = `
    <span class="summary-chip todo">未着手 ${counts.todo}件</span>
    <span class="summary-chip progress">進行中 ${counts.progress}件</span>
    <span class="summary-chip done">完了 ${counts.done}件</span>
  `;

  return summary;
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
  const progressTasks = sortTasksForDisplay(
    tasks.filter(t => t.status === "進行中")
  );

  const todoTasks = sortTasksForDisplay(
    tasks.filter(t => t.status === "未着手")
  );

  const doneTasks = sortTasksForDisplay(
    tasks.filter(t => t.status === "完了")
  );

  parent.appendChild(createStatusDetails("進行中", progressTasks, "progress-section", true));
  parent.appendChild(createStatusDetails("未着手", todoTasks, "todo-section", true));
  parent.appendChild(createStatusDetails("完了", doneTasks, "done-section", false));
}

function showLoading(t) {
  document.getElementById("loadingText").textContent = t || "処理中...";
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
  populateCategorySelect("");
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
  document.getElementById("createOnlyFields").style.display = "none";
  document.getElementById("title").value = task.title || "";
  populateCategorySelect(task.category || "");
  document.getElementById("deadline").value = formatDateForInput(task.deadline);
  document.getElementById("memo").value = task.memo || "";

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
    .catch(e => {
      console.error(e);
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
    const inp = prompt("助けてほしい内容を書いてください", helpComment);
    if (inp === null) return;
    helpComment = inp;
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
    .catch(e => {
      console.error(e);
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
    .catch(e => {
      console.error(e);
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
    : `<span class="deadline-chip">期限なし</span>`;

  div.innerHTML = `
    <div class="task-card-inner">
      <div class="task-top">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="status-pill ${getStatusClass(task.status)}">${escapeHtml(task.status || "未着手")}</div>
      </div>
      <div class="meta-row"><span class="meta-label">カテゴリ</span>${escapeHtml(task.category || "未分類")}</div>
      <div class="meta-row"><span class="meta-label">期限</span>${deadlineChipHtml}</div>
      <div class="meta-row"><span class="meta-label">担当</span>${escapeHtml(assignees.join("、") || "なし")}</div>
      <div class="meta-row"><span class="meta-label">メモ</span>${escapeHtml(task.memo || "なし")}</div>
      ${updatedText ? `<div class="meta-row"><span class="meta-label">更新</span><span class="updated-chip">${escapeHtml(updatedText)}</span></div>` : ""}
      ${helpNeeded ? `<div class="help-badge"><span>助けが必要${task.help_comment ? "：" + escapeHtml(task.help_comment) : ""}</span></div>` : ""}
      <div class="card-divider"></div>
      <div class="task-actions">
        <select class="status-select">
          <option value="未着手" ${task.status === "未着手" ? "selected" : ""}>未着手</option>
          <option value="進行中" ${task.status === "進行中" ? "selected" : ""}>進行中</option>
          <option value="完了" ${task.status === "完了" ? "selected" : ""}>完了</option>
        </select>
        <button type="button" class="action-btn btn-help ${helpNeeded ? "is-active" : ""}">${helpNeeded ? "助け不要にする" : "助けを求める"}</button>
        <button type="button" class="action-btn btn-edit">編集</button>
        <button type="button" class="action-btn btn-delete">削除</button>
      </div>
    </div>
  `;

  div.querySelector(".status-select").addEventListener("change", function() {
    updateTaskStatus(task.id, this.value);
  });

  div.querySelector(".btn-help").addEventListener("click", () => toggleTaskHelp(task.id));
  div.querySelector(".btn-edit").addEventListener("click", () => openEditTaskForm(task.id));
  div.querySelector(".btn-delete").addEventListener("click", () => deleteTask(task.id));

  return div;
}

function renderMemberView(tasks) {
  const c = document.getElementById("taskList");
  c.innerHTML = "";
  c.className = "member-layout";

  const displayMembers = myTasksOnly ? [currentUser] : MEMBERS;
  const grouped = {};

  displayMembers.forEach(m => {
    grouped[m] = [];
  });

  tasks.forEach(t => {
    normalizeAssignees(t).forEach(u => {
      if (displayMembers.includes(u)) grouped[u].push(t);
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

    renderStatusSections(gb, grouped[user]);

    c.appendChild(gb);
  });
}

function renderCategoryView(tasks) {
  const c = document.getElementById("taskList");
  c.innerHTML = "";
  c.className = "category-layout";

  if (!tasks.length) {
    c.innerHTML = '<p class="empty-text">タスクはありません</p>';
    return;
  }

  const grouped = {};

  tasks.forEach(t => {
    const cat = t.category && String(t.category).trim() !== "" ? t.category : "未分類";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });

  const cats = Object.keys(grouped).sort();

  if (!cats.length) {
    c.innerHTML = '<p class="empty-text">タスクはありません</p>';
    return;
  }

  cats.forEach(cat => {
    const gb = document.createElement("div");
    gb.className = "group-block";

    const h = document.createElement("h3");
    h.className = "group-title";
    h.innerHTML = `
      <span class="group-title-text">${escapeHtml(cat)}</span>
      <span class="group-title-summary ${getGroupCountClass(grouped[cat])}">${getGroupStatusSummaryHtml(grouped[cat])}</span>
    `;
    gb.appendChild(h);

    renderStatusSections(gb, grouped[cat]);
    c.appendChild(gb);
  });
}

function renderHelpView(tasks) {
  const c = document.getElementById("taskList");
  c.innerHTML = "";
  c.className = "category-layout";

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

  renderStatusSections(gb, tasks);
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

  const activeTasks = tasks.filter(t => t.status !== "完了");
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

  fetch(API_URL)
    .then(r => r.json())
    .then(data => {
      allTasks = Array.isArray(data) ? data : [];
      populateCategorySelect("");
      renderTasks();
    })
    .catch(e => {
      console.error(e);
      document.getElementById("taskList").innerHTML = '<p class="empty-text">タスクの読み込みに失敗しました</p>';
    })
    .finally(hideLoading);
}

document.getElementById("openTaskFormBtn").addEventListener("click", openCreateTaskForm);
document.getElementById("closeTaskFormBtn").addEventListener("click", closeTaskForm);
document.getElementById("categorySelect").addEventListener("change", updateCustomCategoryVisibility);

document.getElementById("taskFormOverlay").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeTaskForm();
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

document.getElementById("myTasksOnlyFilter").addEventListener("change", function() {
  myTasksOnly = this.checked;
  renderTasks();
});

document.getElementById("currentUserSelect").addEventListener("change", function() {
  currentUser = this.value;
  renderTasks();
});

document.getElementById("taskForm").addEventListener("submit", function(e) {
  e.preventDefault();

  const editId = document.getElementById("editingTaskId").value;
  const isEditing = editId !== "";
  const assignees = Array.from(document.querySelectorAll('input[name="assignee"]:checked')).map(el => el.value);

  const p = new URLSearchParams();
  p.append("mode", isEditing ? "updateTask" : "create");
  p.append("task_id", editId);
  p.append("title", document.getElementById("title").value);
  p.append("category", getCategoryValue());
  p.append("deadline", document.getElementById("deadline").value);
  p.append("memo", document.getElementById("memo").value);
  p.append("assignees", assignees.join(","));

  if (!isEditing) {
    p.append("status", document.getElementById("status").value);
    p.append("need_help", document.getElementById("need_help").checked);
    p.append("help_comment", document.getElementById("help_comment").value);
  }

  showLoading(isEditing ? "保存中..." : "追加中...");

  fetch(API_URL, { method: "POST", body: p })
    .then(r => r.json())
    .then(res => {
      if (!res.success) {
        alert(isEditing ? "保存に失敗しました" : "追加に失敗しました");
        return;
      }

      if (isEditing) {
        const t = allTasks.find(i => String(i.id) === String(editId));

        if (t && res.task) {
          t.title = res.task.title;
          t.category = res.task.category;
          t.deadline = res.task.deadline;
          t.memo = res.task.memo;
          t.assignees = res.task.assignees;
          t.updated_at = res.task.updated_at;
        } else {
          loadTasks();
        }
      } else if (res.task) {
        allTasks.push(res.task);
      } else {
        loadTasks();
      }

      populateCategorySelect("");
      renderTasks();
      closeTaskForm();
      resetTaskForm();
    })
    .catch(e => {
      console.error(e);
      alert(isEditing ? "保存に失敗しました" : "追加に失敗しました");
    })
    .finally(hideLoading);
});

loadTasks();
