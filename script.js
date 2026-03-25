const STORAGE_KEY = "flow-focus-state";
const STORAGE_SCHEMA_VERSION = 1;
const IVY_LIMIT = 6;
const WORK_MINUTES = 25;
const BREAK_MINUTES = 5;
const WEATHER_CITIES = [
  { id: "tokyo", label: "Tokyo", latitude: 35.6764, longitude: 139.6500, timezone: "Asia/Tokyo" },
  { id: "london", label: "London", latitude: 51.5072, longitude: -0.1276, timezone: "Europe/London" },
  { id: "new-york", label: "New York", latitude: 40.7128, longitude: -74.0060, timezone: "America/New_York" }
];

function createInitialState() {
  return {
    timer: {
      mode: "work",
      workMinutes: WORK_MINUTES,
      breakMinutes: BREAK_MINUTES,
      remainingMs: WORK_MINUTES * 60 * 1000,
      endAt: null,
      running: false,
      needsAttention: false
    },
    ivy: {
      dayKey: "",
      draftTitle: "",
      tasks: []
    },
    weather: {
      cityId: "tokyo"
    },
    theme: "forest"
  };
}

const state = createInitialState();

const els = {
  clockHoursMinutes: document.querySelector("#clock-hours-minutes"),
  clockSeconds: document.querySelector("#clock-seconds"),
  clockDate: document.querySelector("#clock-date"),
  weatherLine: document.querySelector("#weather-line"),
  weatherIcon: document.querySelector("#weather-icon"),
  weatherText: document.querySelector("#weather-text"),
  timerPanel: document.querySelector(".panel-timer"),
  timerDisplay: document.querySelector("#timer-display"),
  timerSeconds: document.querySelector("#timer-seconds"),
  timerRing: document.querySelector(".timer-ring"),
  toggleTimer: document.querySelector("#toggle-timer"),
  setWorkMode: document.querySelector("#set-work-mode"),
  setBreakMode: document.querySelector("#set-break-mode"),
  themeButtons: [...document.querySelectorAll(".swatch[data-theme]")],
  scrollToCopy: document.querySelector("#scroll-to-copy"),
  siteCopy: document.querySelector(".site-copy"),
  copyLog: document.querySelector("#copy-log"),
  ivyList: document.querySelector("#ivy-list"),
  ivyTemplate: document.querySelector("#ivy-template")
};

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    title: typeof task.title === "string" ? task.title : "",
    done: Boolean(task.done),
    sessions: Array.isArray(task.sessions)
      ? task.sessions
          .map((session) => ({
            startAt: Number(session.startAt) || Date.now(),
            endAt: session.endAt == null ? null : Number(session.endAt) || Number(session.startAt) || Date.now()
          }))
          .filter((session) => Number.isFinite(session.startAt))
      : [],
    createdAt: Number(task.createdAt) || Date.now()
  };
}

function getCurrentDurationMs() {
  return (state.timer.mode === "work" ? state.timer.workMinutes : state.timer.breakMinutes) * 60000;
}

function migrateStoredState(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  const defaults = createInitialState();
  const schemaVersion = Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 0;

  if (schemaVersion > STORAGE_SCHEMA_VERSION) {
    console.warn(`Unexpected storage schema version: ${parsed.schemaVersion}`);
    return null;
  }

  switch (schemaVersion) {
    case 0:
    case 1:
      return {
        timer: parsed.timer ? { ...defaults.timer, ...parsed.timer } : defaults.timer,
        ivy: parsed.ivy ? { ...defaults.ivy, ...parsed.ivy } : defaults.ivy,
        weather: parsed.weather ? { ...defaults.weather, ...parsed.weather } : defaults.weather,
        theme: typeof parsed.theme === "string" ? parsed.theme : defaults.theme
      };
    default:
      return null;
  }
}

function rotateIvyDayIfNeeded() {
  const todayKey = getTodayKey();
  if (state.ivy.dayKey === todayKey) return;
  state.ivy = {
    dayKey: todayKey,
    draftTitle: "",
    tasks: []
  };
  saveState();
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.ivy.dayKey = getTodayKey();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const migrated = migrateStoredState(parsed);
    if (!migrated) {
      throw new Error("Unsupported storage schema");
    }

    state.timer = migrated.timer;
    state.theme = migrated.theme;

    if (WEATHER_CITIES.some((city) => city.id === migrated.weather.cityId)) {
      state.weather.cityId = migrated.weather.cityId;
    }

    state.ivy.dayKey = typeof migrated.ivy.dayKey === "string" ? migrated.ivy.dayKey : getTodayKey();
    state.ivy.draftTitle = typeof migrated.ivy.draftTitle === "string" ? migrated.ivy.draftTitle : "";
    state.ivy.tasks = Array.isArray(migrated.ivy.tasks)
      ? migrated.ivy.tasks.map(normalizeTask).slice(0, IVY_LIMIT)
      : [];
  } catch (error) {
    console.error("Failed to load state", error);
    state.ivy.dayKey = getTodayKey();
  }

  state.timer.workMinutes = WORK_MINUTES;
  state.timer.breakMinutes = BREAK_MINUTES;
  const duration = getCurrentDurationMs();
  if (state.timer.running && state.timer.endAt) {
    state.timer.remainingMs = Math.max(0, state.timer.endAt - Date.now());
  } else {
    state.timer.remainingMs = Math.min(Math.max(0, state.timer.remainingMs || duration), duration);
    if (state.timer.remainingMs === 0) {
      state.timer.remainingMs = duration;
    }
  }

  rotateIvyDayIfNeeded();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schemaVersion: STORAGE_SCHEMA_VERSION,
    ...state
  }));
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  els.themeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.theme === state.theme);
  });
}

const clockWeatherController = createClockWeatherController({
  state,
  els,
  saveState,
  weatherCities: WEATHER_CITIES
});

const timerController = createTimerController({
  state,
  els,
  saveState,
  setClockSecondsHidden: clockWeatherController.setSecondsHidden
});

const tasksController = createTasksController({
  state,
  els,
  saveState,
  ivyLimit: IVY_LIMIT,
  rotateIvyDayIfNeeded
});

function bindGlobalEvents() {
  els.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.theme = button.dataset.theme;
      applyTheme();
      saveState();
    });
  });

  els.scrollToCopy?.addEventListener("click", () => {
    els.siteCopy?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function initialize() {
  loadState();
  applyTheme();
  bindGlobalEvents();
  clockWeatherController.init();
  timerController.init();
  tasksController.init();
}

window.addEventListener("beforeunload", () => {
  saveState();
  clockWeatherController.destroy();
  timerController.destroy();
  tasksController.destroy();
});

initialize();
