function createTimerController({ state, els, saveState, setClockSecondsHidden }) {
  let timerIntervalId = null;
  let audioContext = null;

  function formatTimerQuiet(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return { value: minutes, seconds };
  }

  function getCurrentDurationMs() {
    return (state.timer.mode === "work" ? state.timer.workMinutes : state.timer.breakMinutes) * 60000;
  }

  function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  async function unlockAudioContext() {
    const context = ensureAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }
    return context;
  }

  function updateTimerUi() {
    const quietTimer = formatTimerQuiet(state.timer.remainingMs);
    els.timerDisplay.textContent = quietTimer.value;
    els.timerSeconds.textContent = quietTimer.seconds;
    els.toggleTimer.setAttribute("aria-label", state.timer.running ? "Pause timer" : "Start timer");
    els.toggleTimer.classList.toggle("is-running", state.timer.running);
    els.setWorkMode.classList.toggle("is-active", state.timer.mode === "work");
    els.setBreakMode.classList.toggle("is-active", state.timer.mode === "break");
    els.timerPanel.classList.toggle("is-attention", state.timer.needsAttention);

    const duration = getCurrentDurationMs();
    const progress = duration === 0 ? 0 : 360 * ((duration - state.timer.remainingMs) / duration);
    els.timerRing.style.setProperty("--progress", `${Math.max(0, progress)}deg`);
    setClockSecondsHidden(state.timer.running);
  }

  async function playEndChime() {
    const context = await unlockAudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.42);
    gainNode.gain.setValueAtTime(0.001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.08);
    gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.7);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.72);
  }

  function stopTimerTick() {
    if (!timerIntervalId) return;
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  function switchTimerMode() {
    state.timer.mode = state.timer.mode === "work" ? "break" : "work";
    state.timer.remainingMs = getCurrentDurationMs();
    state.timer.endAt = null;
    state.timer.running = false;
    state.timer.needsAttention = true;
    stopTimerTick();
    playEndChime().catch((error) => console.error("End chime failed", error));
    updateTimerUi();
    saveState();
  }

  function tickTimer() {
    if (!state.timer.running || !state.timer.endAt) return;
    state.timer.remainingMs = Math.max(0, state.timer.endAt - Date.now());
    if (state.timer.remainingMs === 0) {
      switchTimerMode();
      return;
    }
    updateTimerUi();
  }

  async function startTimer() {
    if (state.timer.running) return;
    await unlockAudioContext();
    state.timer.needsAttention = false;
    state.timer.running = true;
    state.timer.endAt = Date.now() + state.timer.remainingMs;
    stopTimerTick();
    timerIntervalId = window.setInterval(tickTimer, 250);
    updateTimerUi();
    saveState();
  }

  function pauseTimer() {
    if (!state.timer.running) return;
    state.timer.needsAttention = false;
    state.timer.remainingMs = Math.max(0, state.timer.endAt - Date.now());
    state.timer.running = false;
    state.timer.endAt = null;
    stopTimerTick();
    updateTimerUi();
    saveState();
  }

  function toggleTimer() {
    if (state.timer.running) {
      pauseTimer();
    } else {
      startTimer().catch((error) => console.error("Timer start failed", error));
    }
  }

  function setTimerMode(mode) {
    if (mode !== "work" && mode !== "break") return;
    state.timer.needsAttention = false;
    state.timer.mode = mode;
    state.timer.running = false;
    state.timer.endAt = null;
    state.timer.remainingMs = getCurrentDurationMs();
    stopTimerTick();
    updateTimerUi();
    saveState();
  }

  function recoverRunningTimer() {
    if (!state.timer.running || !state.timer.endAt) return;
    state.timer.remainingMs = Math.max(0, state.timer.endAt - Date.now());
    if (state.timer.remainingMs === 0) {
      switchTimerMode();
      return;
    }
    timerIntervalId = window.setInterval(tickTimer, 250);
    updateTimerUi();
  }

  function init() {
    els.toggleTimer.addEventListener("click", toggleTimer);
    els.setWorkMode.addEventListener("click", () => setTimerMode("work"));
    els.setBreakMode.addEventListener("click", () => setTimerMode("break"));
    updateTimerUi();
    recoverRunningTimer();
  }

  function destroy() {
    stopTimerTick();
  }

  return {
    init,
    destroy
  };
}

globalThis.createTimerController = createTimerController;
