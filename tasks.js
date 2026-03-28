const PLAY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7.5v9l7-4.5Z"></path></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 7.5v9"></path><path d="M14.5 7.5v9"></path></svg>';
const IVY_GUIDANCE_COPY =
  "Write down today’s six most important tasks, put them in order, and work from the top.";

function createTasksController({ state, els, saveState, ivyLimit, rotateIvyDayIfNeeded }) {
  let draggedTaskId = null;
  let ivyIntervalId = null;

  function formatElapsed(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  function formatClockTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function getTaskDurationMs(task) {
    return task.sessions.reduce((sum, session) => {
      const endAt = session.endAt ?? Date.now();
      return sum + Math.max(0, endAt - session.startAt);
    }, 0);
  }

  function isTaskActive(task) {
    return task.sessions.some((session) => session.endAt == null);
  }

  function getActiveTask() {
    return state.ivy.tasks.find(isTaskActive) ?? null;
  }

  function getTaskIndex(id) {
    return state.ivy.tasks.findIndex((task) => task.id === id);
  }

  function getNextEditableSlotIndex() {
    return Math.min(state.ivy.tasks.length, ivyLimit - 1);
  }

  function previousTasksDone(index) {
    return state.ivy.tasks.slice(0, index).every((task) => task.done);
  }

  function canStartTask(index) {
    const task = state.ivy.tasks[index];
    if (!task || task.done) return false;
    return previousTasksDone(index);
  }

  function closeTaskSession(task, endAt = Date.now()) {
    const openSession = task.sessions.find((session) => session.endAt == null);
    if (!openSession) return;
    openSession.endAt = Math.max(endAt, openSession.startAt);
  }

  function startTask(id) {
    const index = getTaskIndex(id);
    if (index === -1 || !canStartTask(index)) return;
    const activeTask = getActiveTask();
    if (activeTask && activeTask.id !== id) {
      closeTaskSession(activeTask);
    }
    const task = state.ivy.tasks[index];
    if (isTaskActive(task)) return;
    task.sessions.push({ startAt: Date.now(), endAt: null });
    task.done = false;
    saveState();
    renderIvy();
  }

  function stopTask(id) {
    const index = getTaskIndex(id);
    if (index === -1) return;
    closeTaskSession(state.ivy.tasks[index]);
    saveState();
    renderIvy();
  }

  function toggleTask(id) {
    const task = state.ivy.tasks.find((item) => item.id === id);
    if (!task) return;
    if (isTaskActive(task)) {
      stopTask(id);
    } else {
      startTask(id);
    }
  }

  function toggleDone(id) {
    const index = getTaskIndex(id);
    if (index === -1) return;
    const task = state.ivy.tasks[index];
    if (isTaskActive(task) || !task.sessions.length) return;
    task.done = !task.done;
    saveState();
    renderIvy();
  }

  function addTask(title) {
    const cleanTitle = title.trim();
    if (!cleanTitle || state.ivy.tasks.length >= ivyLimit) return;
    state.ivy.tasks.push({
      id: crypto.randomUUID(),
      title: cleanTitle,
      done: false,
      sessions: [],
      createdAt: Date.now()
    });
    state.ivy.draftTitle = "";
    saveState();
    renderIvy();
  }

  function commitDraftTask() {
    const cleanTitle = state.ivy.draftTitle.trim();
    if (!cleanTitle || state.ivy.tasks.length >= ivyLimit) return false;
    addTask(cleanTitle);
    return true;
  }

  function deleteTask(id) {
    state.ivy.tasks = state.ivy.tasks.filter((task) => task.id !== id);
    saveState();
    renderIvy();
  }

  function updateTaskTitle(id, title) {
    const task = state.ivy.tasks.find((item) => item.id === id);
    if (!task) return;
    task.title = title;
    saveState();
  }

  function reorderTasks(draggedId, targetId) {
    if (!draggedId || draggedId === targetId) return;
    const from = getTaskIndex(draggedId);
    const to = getTaskIndex(targetId);
    if (from === -1 || to === -1) return;
    const [moved] = state.ivy.tasks.splice(from, 1);
    state.ivy.tasks.splice(to, 0, moved);
    saveState();
    renderIvy();
  }

  function moveTaskByOffset(id, offset) {
    const from = getTaskIndex(id);
    const to = from + offset;
    if (from === -1 || to < 0 || to >= state.ivy.tasks.length) return;
    const [moved] = state.ivy.tasks.splice(from, 1);
    state.ivy.tasks.splice(to, 0, moved);
    saveState();
    renderIvy();
  }

  function buildTaskMeta(task) {
    const parts = [];
    if (isTaskActive(task)) {
      parts.push(`Running ${formatElapsed(getTaskDurationMs(task))}`);
    } else if (task.done) {
      parts.push(`Done in ${formatElapsed(getTaskDurationMs(task))}`);
    } else if (task.sessions.length) {
      parts.push(`Tracked ${formatElapsed(getTaskDurationMs(task))}`);
    } else {
      parts.push("Ready");
    }

    return parts.join(" • ");
  }

  function buildLogText() {
    const weekday = new Date(`${state.ivy.dayKey}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "short"
    }).toUpperCase();
    const lines = state.ivy.tasks.map((task, index) => {
      const sessions = task.sessions.length
        ? task.sessions
            .map((session) => {
              const endText = session.endAt == null ? "RUNNING" : formatClockTime(session.endAt);
              return `${formatClockTime(session.startAt)}-${endText}`;
            })
            .join(", ")
        : "-";
      return `${index + 1}. ${task.title}\t${sessions}\t${formatElapsed(getTaskDurationMs(task))}\t${task.done ? "DONE" : "OPEN"}`;
    });
    return [`${state.ivy.dayKey} ${weekday}`, ...lines].join("\n");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  }

  function isEditingIvyFields() {
    const active = document.activeElement;
    return active instanceof HTMLElement && Boolean(active.closest(".panel-tasks") && active.matches("input"));
  }

  function renderIvy() {
    rotateIvyDayIfNeeded();
    els.copyLog.disabled = state.ivy.tasks.length === 0;

    els.ivyList.innerHTML = "";
    for (let index = 0; index < ivyLimit; index += 1) {
      const task = state.ivy.tasks[index] ?? null;
      const fragment = els.ivyTemplate.content.cloneNode(true);
      const item = fragment.querySelector(".ivy-item");
      const done = fragment.querySelector(".ivy-done");
      const handle = fragment.querySelector(".drag-handle");
      const moveGroup = fragment.querySelector(".ivy-move");
      const moveUp = fragment.querySelector(".ivy-move-up");
      const moveDown = fragment.querySelector(".ivy-move-down");
      const titleInput = fragment.querySelector(".ivy-title-input");
      const meta = fragment.querySelector(".ivy-meta");
      const inlineNote = fragment.querySelector(".ivy-inline-note");
      const toggle = fragment.querySelector(".ivy-toggle");
      const del = fragment.querySelector(".ivy-delete");

      if (task) {
        item.dataset.id = task.id;
        titleInput.value = task.title;
        titleInput.placeholder = `Task ${index + 1}`;
        meta.textContent = buildTaskMeta(task);
        inlineNote.hidden = true;
        const active = isTaskActive(task);
        toggle.innerHTML = active ? PAUSE_ICON : PLAY_ICON;
        toggle.setAttribute("aria-label", active ? "Pause" : "Start");
        toggle.classList.toggle("is-running", active);
        done.setAttribute("aria-label", task.done ? "Undo" : "Done");

        if (active) item.classList.add("is-active");
        if (task.done) {
          item.classList.add("is-done");
          done.classList.add("is-done");
        }

        moveUp.disabled = index === 0;
        moveDown.disabled = index === state.ivy.tasks.length - 1;

        const blocked = !active && !task.done && !previousTasksDone(index);
        const isFocusSlot = !task.done && previousTasksDone(index);
        if (isFocusSlot) {
          item.classList.add("is-focus-slot");
        }
        const shouldHideToggle = task.done || (blocked && !active);
        toggle.disabled = blocked || (task.done && !isTaskActive(task));
        toggle.hidden = shouldHideToggle;
        done.disabled = isTaskActive(task) || !task.sessions.length;

        titleInput.addEventListener("input", (event) => {
          updateTaskTitle(task.id, event.target.value);
        });
        titleInput.addEventListener("blur", (event) => {
          const cleanTitle = event.target.value.trim();
          if (!cleanTitle) {
            if (!task.sessions.length && !task.done) {
              deleteTask(task.id);
              return;
            }
            updateTaskTitle(task.id, "Untitled");
          } else {
            updateTaskTitle(task.id, cleanTitle);
          }
          renderIvy();
        });
        toggle.addEventListener("click", () => toggleTask(task.id));
        done.addEventListener("click", () => toggleDone(task.id));
        del.addEventListener("click", () => deleteTask(task.id));
        moveUp.addEventListener("click", () => moveTaskByOffset(task.id, -1));
        moveDown.addEventListener("click", () => moveTaskByOffset(task.id, 1));

        item.addEventListener("dragstart", () => {
          draggedTaskId = task.id;
          item.classList.add("is-dragging");
        });
        item.addEventListener("dragend", () => {
          draggedTaskId = null;
          item.classList.remove("is-dragging");
          document.querySelectorAll(".drop-target").forEach((node) => node.classList.remove("drop-target"));
        });
        item.addEventListener("dragover", (event) => {
          event.preventDefault();
          item.classList.add("drop-target");
        });
        item.addEventListener("dragleave", () => {
          item.classList.remove("drop-target");
        });
        item.addEventListener("drop", (event) => {
          event.preventDefault();
          item.classList.remove("drop-target");
          reorderTasks(draggedTaskId, task.id);
        });

        handle.addEventListener("mousedown", () => {
          item.draggable = true;
        });
      } else {
        const isNextSlot = index === getNextEditableSlotIndex() && state.ivy.tasks.length < ivyLimit;
        item.classList.add("is-empty");
        titleInput.placeholder = `Task ${index + 1}`;
        titleInput.value = isNextSlot ? state.ivy.draftTitle : "";
        titleInput.disabled = !isNextSlot;
        inlineNote.hidden = !isNextSlot;
        inlineNote.textContent = IVY_GUIDANCE_COPY;
        handle.hidden = true;
        moveGroup.hidden = true;
        meta.hidden = true;
        toggle.hidden = true;
        done.hidden = true;
        del.hidden = true;
        item.draggable = false;

        if (isNextSlot) {
          titleInput.addEventListener("input", (event) => {
            state.ivy.draftTitle = event.target.value;
            saveState();
          });
          titleInput.addEventListener("blur", () => {
            commitDraftTask();
          });
          titleInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const committed = commitDraftTask();
            if (!committed) return;
            window.requestAnimationFrame(() => {
              const nextInput = els.ivyList.querySelector(".ivy-item.is-empty .ivy-title-input:not(:disabled)");
              nextInput?.focus();
            });
          });
        }
      }

      els.ivyList.appendChild(fragment);
    }

    if (state.ivy.tasks.length >= ivyLimit) {
      const trailingNote = document.createElement("p");
      trailingNote.className = "ivy-note-tail";
      trailingNote.textContent = IVY_GUIDANCE_COPY;
      els.ivyList.appendChild(trailingNote);
    }
  }

  function onCopyLogClick() {
    copyText(buildLogText()).catch((error) => console.error("Log copy failed", error));
  }

  function init() {
    rotateIvyDayIfNeeded();
    renderIvy();
    els.copyLog.addEventListener("click", onCopyLogClick);
    ivyIntervalId = window.setInterval(() => {
      if (!isEditingIvyFields()) {
        renderIvy();
      }
    }, 1000);
  }

  function destroy() {
    els.copyLog.removeEventListener("click", onCopyLogClick);
    if (ivyIntervalId) window.clearInterval(ivyIntervalId);
  }

  return {
    init,
    destroy
  };
}

globalThis.createTasksController = createTasksController;
